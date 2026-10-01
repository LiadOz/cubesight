// Solve segmentation: turn (scramble, moves[, moveTimes, orient]) into a
// normalised analysis with per-move frames, stage boundaries, skips,
// cancellations, pauses and automatic pseudo-slotting detection.
//
// Pure and node-testable: no DOM, no storage, no solver. Indices are 0-based
// move indices; an index of -1 means "already true before the first move".
// Every solve is relabelled so the cross sits on D before it is analysed, so
// the same code serves every cross face (and colour-neutral solvers).
//
// Stages, in order: cross, pair1..pair4, eo, co, cp, ep. A move belongs to the
// stage being worked on when it was made; a milestone completes on its last
// move. eo and co may complete in either order. "cp" is corners permuted up to
// a U turn after OLL, "ep" is the solved cube.

import { applyMoves, createSolvedState, sameCubeState } from '../cross-cube.js';
import { crossFrame, solvedPairs, eoSolved, coSolved, cpSolved } from '../solve-tracker.js';
import { FACE_TO_D, inferCrossFace, relabelMoves, toMoveList } from './normalize.js';
import { captureLastLayer } from './last-layer-patterns.js';
import { applyAnalysisMoves, parseAnalysisMoves } from './long-replay.js';

export const STAGES = Object.freeze(['cross', 'pair1', 'pair2', 'pair3', 'pair4', 'eo', 'co', 'cp', 'ep']);
export const STAGE_GROUP = Object.freeze({
  cross: 'cross', pair1: 'f2l', pair2: 'f2l', pair3: 'f2l', pair4: 'f2l', eo: 'oll', co: 'oll', cp: 'pll', ep: 'pll',
});
export const ENGINE_VERSION = 4;

// Pause allowances (ms) by the boundary a gap sits on (SPEC 5.3).
export const PAUSE_ALLOW_MS = Object.freeze({
  inside: 350, insideAlg: 300, 'cross-f2l': 600, 'f2l-f2l': 450, 'f2l-oll': 650, 'oll-oll': 550, 'oll-pll': 700,
});
const PAUSE_MIN_EXTRA_MS = 250;
const PAUSE_MEDIAN_FACTOR = 2.5;

const AXIS = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };
const quarterTurns = move => (move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1);
const SOLVED = createSolvedState();
const CLOCK_TURNS = ['', '2', "'"];

// Adjacent same-axis moves that reduce (R L R' = L, D D' = nothing).
export function findCancellations(moves) {
  const runs = [];
  let start = 0;
  while (start < moves.length) {
    let end = start;
    while (end + 1 < moves.length && AXIS[moves[end + 1][0]] === AXIS[moves[start][0]]) end++;
    const net = {};
    for (let i = start; i <= end; i++) net[moves[i][0]] = ((net[moves[i][0]] || 0) + quarterTurns(moves[i])) % 4;
    const cost = Object.values(net).filter(Boolean).length;
    const length = end - start + 1;
    if (length > cost) runs.push({ from: start, to: end, moves: moves.slice(start, end + 1), waste: length - cost, cost });
    start = end + 1;
  }
  return runs;
}

// Solved once U and D turns are allowed before/after ("an AUF and a D fix away").
function solvedUpToUD(state) {
  if (sameCubeState(state, SOLVED)) return true;
  for (const u of ['', ...CLOCK_TURNS.slice(0, 3).map(t => `U${t}`)]) {
    for (const d of ['', ...CLOCK_TURNS.slice(0, 3).map(t => `D${t}`)]) {
      if (!u && !d) continue;
      if (sameCubeState(applyMoves(state, [u, d].filter(Boolean)), SOLVED)) return true;
    }
  }
  return false;
}

const originalSlot = (slot, crossFace) => {
  const back = Object.fromEntries(Object.entries(FACE_TO_D[crossFace]).map(([from, to]) => [to, from]));
  return [...slot].map(face => back[face]).sort().join('');
};

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pauseBoundary(previousStage, stage) {
  const a = STAGE_GROUP[previousStage], b = STAGE_GROUP[stage];
  if (previousStage === stage) return b === 'oll' || b === 'pll' ? 'insideAlg' : 'inside';
  if (a === 'cross') return 'cross-f2l';
  if (a === 'f2l') return b === 'f2l' ? 'f2l-f2l' : 'f2l-oll';
  if (a === 'oll') return b === 'oll' ? 'oll-oll' : 'oll-pll';
  return 'insideAlg';
}

export function segmentSolve({ scramble, moves, moveTimes, orient, crossFace: forcedFace } = {}) {
  const scrambleMoves = parseAnalysisMoves(scramble);
  const original = toMoveList(moves);
  const warnings = [];
  let times = null;
  if (Array.isArray(moveTimes)) {
    if (moveTimes.length === original.length && moveTimes.every(Number.isFinite)) times = moveTimes;
    else warnings.push('moveTimes-ignored: length mismatch or non-numeric values');
  }

  // 1. Cross face and normalisation to cross-on-D.
  const inferred = forcedFace
    ? { face: forcedFace, source: 'given', index: null, shift: null }
    : inferCrossFace({ scramble: scrambleMoves.join(' '), moves: original, orient });
  const crossFace = inferred.face;
  const normScramble = relabelMoves(scrambleMoves, crossFace);
  const norm = relabelMoves(original, crossFace);
  const n = norm.length;

  // 2. Replay, frame by frame.
  const marks = { crossIdx: null, pairIdx: [null, null, null, null], eoIdx: null, coIdx: null, cpIdx: null, solvedIdx: null };
  const milestoneIdx = name => (name === 'cross' ? marks.crossIdx : name.startsWith('pair') ? marks.pairIdx[Number(name[4]) - 1]
    : name === 'eo' ? marks.eoIdx : name === 'co' ? marks.coIdx : name === 'cp' ? marks.cpIdx : marks.solvedIdx);
  const workingStage = () => STAGES.find(name => milestoneIdx(name) === null) || 'ep';

  const pairs = [];
  const credited = new Set();
  const offsets = [];
  let openOffset = null;
  let held = null;
  let maxPairs = 0;
  let ollState = null;
  const frames = [];
  let initial = null;
  // Probe every position first: the cross rule below looks one move ahead.
  const probes = [];
  let probeState = applyAnalysisMoves(SOLVED, normScramble);
  const states = [probeState];
  for (let s = 0; s <= n; s++) {
    if (s > 0) { probeState = applyMoves(probeState, [norm[s - 1]]); states.push(probeState); }
    const read = crossFrame(probeState, 'D');
    probes.push({ shift: read.shift, valid: read.pairs.map(pair => pair.edgeId) });
  }

  for (let s = 0; s <= n; s++) {
    const state = states[s];
    const idx = s - 1;
    const stage = workingStage();
    const raw = probes[s].shift;
    // A cross that is only offset by a layer turn the very next move undoes is
    // the ordinary "align the cross" turn, part of the cross: it does not open
    // a pseudo offset. (Only before the cross is first reached; in F2L the same
    // pattern is a real pseudo pair.)
    const aligning = marks.crossIdx === null && raw !== null && raw !== 0 && s < n && probes[s + 1].shift === 0;
    const shift = aligning ? null : raw;
    const valid = aligning ? [] : probes[s].valid;
    const events = [];
    let offsetEvent = null;
    let dFix = false;

    // Frame k: last known non-null shift. null = mid-insertion, previous k holds.
    if (shift !== null) {
      const before = held ?? 0;
      held = shift;
      if (before === 0 && shift !== 0) {
        openOffset = { k: shift, ks: [shift], createdAt: idx, resolvedAt: null, pairs: [], used: false, stray: false };
        offsets.push(openOffset);
        offsetEvent = 'created';
      } else if (before !== 0 && shift === 0) {
        openOffset.resolvedAt = idx;
        dFix = openOffset.used;
        offsetEvent = 'resolved';
        openOffset = null;
      } else if (before !== 0 && shift !== before) {
        openOffset.ks.push(shift);
        offsetEvent = 'changed';
      }
    }

    // Milestones. Cross: solved in any frame.
    if (marks.crossIdx === null && shift !== null) { marks.crossIdx = idx; events.push('cross'); }
    // Pairs: count pairs valid in the current frame; a milestone per new count.
    if (marks.crossIdx !== null && valid.length > maxPairs) {
      const fresh = valid.filter(slot => !credited.has(slot));
      for (const slot of fresh.slice(0, valid.length - maxPairs)) {
        credited.add(slot);
        maxPairs++;
        marks.pairIdx[maxPairs - 1] = idx;
        events.push(`pair${maxPairs}`);
        const record = { n: maxPairs, slot, slotOriginal: originalSlot(slot, crossFace), idx, k: shift, pseudo: shift !== 0, plainIdx: shift === 0 ? idx : null };
        pairs.push(record);
        if (shift !== 0 && openOffset) { openOffset.pairs.push(slot); openOffset.used = true; }
      }
    }
    if (shift === 0) for (const record of pairs) if (record.plainIdx === null && valid.includes(record.slot)) record.plainIdx = idx;

    const f2lNow = shift !== null && valid.length === 4;
    const eoNow = f2lNow && eoSolved(state, 'D');
    const coNow = f2lNow && coSolved(state, 'D');
    if (eoNow && marks.eoIdx === null) { marks.eoIdx = idx; events.push('eo'); }
    if (coNow && marks.coIdx === null) { marks.coIdx = idx; events.push('co'); }
    if (eoNow && coNow && marks.cpIdx === null && cpSolved(state, 'D')) { marks.cpIdx = idx; events.push('cp'); }
    if (marks.solvedIdx === null && marks.cpIdx !== null && eoNow && coNow && sameCubeState(state, SOLVED)) { marks.solvedIdx = idx; events.push('ep'); }
    if (eoNow && coNow && ollState === null && marks.eoIdx !== null && marks.coIdx !== null) ollState = { idx, solvedUp: solvedUpToUD(state) };

    const view = {
      k: held, kNow: raw, pairs: valid, plainPairs: solvedPairs(state, 'D').map(pair => pair.edgeId),
      offset: offsetEvent, dFix, events,
    };
    if (s === 0) { initial = { ...view, stage }; continue; }
    frames.push({
      i: idx, move: norm[idx], original: original[idx], stage, group: STAGE_GROUP[stage],
      ...view, pseudo: held !== null && held !== 0 && valid.length > 0,
      t: times ? times[idx] : null, gapMs: times && idx > 0 ? times[idx] - times[idx - 1] : null,
      cancel: null, pause: null,
    });
  }
  const solved = marks.solvedIdx !== null;
  if (!solved) warnings.push('not-solved');
  if (marks.crossIdx === null) warnings.push('cross-not-completed');

  // Unused or unresolved offsets.
  for (const offset of offsets) offset.stray = !offset.used && (offset.resolvedAt !== null || marks.pairIdx[3] !== null);

  // 3. Milestones, stage intervals and skips.
  const timeAt = idx => (times && idx !== null && idx >= 0 ? times[idx] : null);
  const ollIdx = marks.eoIdx !== null && marks.coIdx !== null ? Math.max(marks.eoIdx, marks.coIdx) : null;
  marks.ollIdx = ollIdx;
  const milestones = STAGES.filter(name => milestoneIdx(name) !== null).map(name => ({ stage: name, idx: milestoneIdx(name), t: timeAt(milestoneIdx(name)) }));

  const stages = [];
  let previousEnd = -1;
  for (const name of STAGES) {
    const own = milestoneIdx(name);
    if (own === null) { stages.push({ name, group: STAGE_GROUP[name], fromIdx: null, toIdx: null, moves: null, ms: null, skipped: false, reached: false }); continue; }
    const end = Math.max(previousEnd, own);
    const skipped = end === previousEnd && name !== 'cross';
    const from = previousEnd + 1;
    const startT = timeAt(Math.max(previousEnd, 0)) ?? null;
    stages.push({
      name, group: STAGE_GROUP[name], fromIdx: skipped ? null : from, toIdx: skipped ? null : end,
      moves: skipped ? 0 : end - from + 1, ms: times && !skipped ? timeAt(end) - startT : (times ? 0 : null), skipped, reached: true,
    });
    previousEnd = end;
  }

  const skips = [];
  const pairsByIdx = new Map();
  for (const record of pairs) pairsByIdx.set(record.idx, [...(pairsByIdx.get(record.idx) || []), record]);
  for (const [idx, group] of pairsByIdx) {
    if (idx === marks.crossIdx) skips.push({ kind: 'xcross', idx, count: group.length, pseudo: group.some(r => r.pseudo), slots: group.map(r => r.slot) });
    else if (group.length >= 2) skips.push({ kind: 'pair', idx, count: group.length, pseudo: group.some(r => r.pseudo), slots: group.map(r => r.slot) });
  }
  const f2lIdx = marks.pairIdx[3];
  if (f2lIdx !== null) {
    const eoSkip = marks.eoIdx === f2lIdx, coSkip = marks.coIdx === f2lIdx || (marks.coIdx !== null && marks.coIdx === marks.eoIdx);
    if (eoSkip && marks.coIdx === f2lIdx) skips.push({ kind: 'oll', idx: f2lIdx });
    else {
      if (eoSkip) skips.push({ kind: 'eo', idx: f2lIdx });
      if (coSkip) skips.push({ kind: 'co', idx: marks.coIdx });
    }
  }
  if (ollIdx !== null && ollState?.solvedUp) skips.push({ kind: 'pll', idx: ollIdx, withOll: ollIdx === f2lIdx });
  else if (ollIdx !== null && marks.cpIdx === ollIdx) skips.push({ kind: 'cp', idx: ollIdx });

  // 4. Cancellations (same-axis neighbours that reduce) and pauses.
  const cancellations = findCancellations(norm).map((run, index) => ({
    ...run, id: index, movesOriginal: original.slice(run.from, run.to + 1),
    stages: [...new Set(frames.slice(run.from, run.to + 1).map(f => f.stage))],
  }));
  for (const run of cancellations) for (let i = run.from; i <= run.to; i++) frames[i].cancel = { run: run.id, first: i === run.from, waste: run.waste };

  const pauses = [];
  let medianGapMs = null;
  if (times && n >= 4) {
    const gaps = frames.slice(1).map(f => f.gapMs);
    medianGapMs = median(gaps);
    for (let i = 1; i < n; i++) {
      const boundary = pauseBoundary(frames[i - 1].stage, frames[i].stage);
      const allowMs = PAUSE_ALLOW_MS[boundary];
      const gap = frames[i].gapMs;
      if (gap >= Math.max(allowMs + PAUSE_MIN_EXTRA_MS, PAUSE_MEDIAN_FACTOR * medianGapMs)) {
        const pause = { i, gapMs: gap, medianMs: medianGapMs, allowMs, excessMs: gap - allowMs, boundary, stage: frames[i].stage, before: original[i] };
        pauses.push(pause);
        frames[i].pause = pause;
      }
    }
  }

  const crossPairs = pairs.filter(record => record.idx === marks.crossIdx);
  const xcross = marks.crossIdx === null ? null : {
    kind: crossPairs.length >= 2 ? 'xxcross' : crossPairs.length === 1 ? 'xcross' : 'cross',
    pairs: crossPairs.length, pseudo: crossPairs.some(record => record.pseudo), slots: crossPairs.map(record => record.slot),
  };
  const outMarks = { ...marks, pairFrame: pairs.slice().sort((a, b) => a.n - b.n).map(record => record.k) };

  const result = {
    version: ENGINE_VERSION,
    scramble: scrambleMoves.join(' '),
    moves: original,
    moveTimes: times,
    crossFace,
    crossSource: inferred.source,
    normalized: { scramble: normScramble.join(' '), moves: norm, faceMap: FACE_TO_D[crossFace] },
    initial, frames, marks: outMarks, milestones, stages, pairs, offsets, xcross, skips, cancellations, pauses,
    timing: { hasTimes: Boolean(times), medianGapMs },
    solved, warnings,
  };
  result.cases = captureLastLayer(result);
  return result;
}
