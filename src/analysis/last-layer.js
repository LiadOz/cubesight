// Recognition and verified continuation data for the OLL and PLL positions.
// The seed table is bundled with the analysis worker and works offline.
import { applyMoves, canonicalizeForRecognition, createSolvedState, sameCubeState } from '../cross-cube.js';
import { getCases, getCase } from '../algs/seed/cases.js';
import { algorithmMetrics, invertAlg, stripAuf } from '../algs/notation.js';
import { effectSignature } from '../algs/verify.js';
import { identifyPllCase } from '../pll-logic.js';
import { crossSolved, solvedPairs, eoSolved, coSolved } from '../solve-tracker.js';
import { physicalModelTokens, tokenizeReconstruction } from '../review/import-parser.js';
import { analysisStateFromScramble, applyAnalysisMoves, parseAnalysisMoves } from './long-replay.js';

const AUFS = Object.freeze(['', 'U', 'U2', "U'"]);
const string = moves => (moves ?? []).join(' ');
const validIndex = (index, length) => Number.isInteger(index) && index >= 0 && index < length;
const reached = (index, length) => Number.isInteger(index) && index >= -1 && index < length;
const metric = alg => algorithmMetrics(alg);
const candidateOrder = (a, b) => a.stm - b.stm || a.etm - b.etm || (a.rank ?? 999) - (b.rank ?? 999) || a.moves.localeCompare(b.moves);

let kpuzzlePromise;
const getPuzzle = () => kpuzzlePromise ??= import('cubing/puzzles').then(({ cube3x3x3 }) => cube3x3x3.kpuzzle());

function stages(segmentation) {
  const marks = segmentation.marks;
  const pairs = marks.pairIdx ?? [];
  if (pairs.length !== 4 || !pairs.every(Number.isInteger)) return null;
  const f2lEnd = Math.max(-1, ...pairs) + 1;
  const eoEnd = marks.eoIdx, coEnd = marks.coIdx;
  if (!Number.isInteger(eoEnd) || !Number.isInteger(coEnd)) return {
    f2lEnd, ollStart: f2lEnd, ollEnd: segmentation.moves.length - 1, pllStart: null, pllEnd: null,
  };
  const ollEnd = Math.max(eoEnd, coEnd);
  const pllStart = ollEnd + 1;
  const pllEnd = Number.isInteger(marks.solvedIdx) ? marks.solvedIdx : segmentation.moves.length - 1;
  return { f2lEnd, ollStart: f2lEnd, ollEnd, pllStart, pllEnd };
}

function timing(segmentation, from, to, completed = true) {
  const rows = segmentation.frames ?? [];
  const hasStart = validIndex(from, rows.length) && Number.isFinite(rows[from]?.t);
  const recognitionMs = hasStart && Number.isFinite(rows[from].gapMs) ? Math.max(0, rows[from].gapMs) : null;
  const hasEnd = completed && hasStart && validIndex(to, rows.length) && to >= from && Number.isFinite(rows[to]?.t);
  const executionMs = hasEnd ? Math.max(0, Math.round(rows[to].t - rows[from].t)) : null;
  return { recognitionMs, executionMs };
}

function verifiedAlgs(caseRow) {
  return (caseRow?.algs ?? []).filter(alg => alg.verified === true && typeof alg.moves === 'string');
}

function rankedAlg(alg) {
  const result = metric(alg.moves);
  return { id: alg.id, caseId: alg.caseId, moves: result.normalized, notation: result.normalized, sourceNotation: alg.moves, stm: result.stm, etm: result.etm, rank: alg.rank ?? null,
    credit: alg.credit ?? '', source: alg.source?.name ?? '', sourceUrl: alg.source?.url ?? '' };
}

function physicalMoves(input) {
  return physicalModelTokens(tokenizeReconstruction(input).tokens);
}

function bestOll(caseRow, pattern) {
  const candidates = [];
  const rotations = ['', 'y', 'y2', "y'"];
  const inverse = { '': '', y: "y'", y2: 'y2', "y'": 'y' };
  for (const alg of verifiedAlgs(caseRow)) for (const rotation of rotations) for (const pre of AUFS) for (const post of AUFS) {
    const moves = [pre, rotation, alg.moves, inverse[rotation], post].filter(Boolean).join(' ');
    try {
      const after = pattern.applyAlg(moves).patternData;
      if (![...after.CORNERS.orientation.slice(0, 4), ...after.EDGES.orientation.slice(0, 4)].every(value => value === 0)) continue;
    } catch { continue; }
    const details = rankedAlg(alg);
    const measured = metric(moves);
    candidates.push({ ...details, moves: measured.normalized, notation: moves, sourceNotation: alg.moves, stm: measured.stm, etm: measured.etm });
  }
  return candidates.sort(candidateOrder)[0] ?? null;
}

function bestPllFromState(state, caseRow) {
  const solved = createSolvedState();
  const candidates = [];
  for (const alg of verifiedAlgs(caseRow)) {
    const core = stripAuf(alg.moves);
    const coreText = string(core);
    for (const pre of AUFS) for (const post of AUFS) {
      const moves = [...(pre ? [pre] : []), ...core, ...(post ? [post] : [])];
      let result;
      try { result = applyMoves(state, physicalMoves(moves.join(' '))); }
      catch { continue; }
      if (!sameCubeState(canonicalizeForRecognition(result, 'D'), solved)) continue;
      const full = metric(moves.join(' '));
      const coreMetrics = metric(coreText);
      candidates.push({ id: alg.id, caseId: alg.caseId, core: coreText, moves: full.normalized, notation: moves.join(' '), sourceNotation: alg.moves, stm: full.stm, etm: full.etm,
        coreStm: coreMetrics.stm, pre, post, aufStm: metric([pre, post].filter(Boolean).join(' ')).stm,
        rank: alg.rank ?? null, credit: alg.credit ?? '', source: alg.source?.name ?? '', sourceUrl: alg.source?.url ?? '' });
    }
  }
  return candidates.sort(candidateOrder)[0] ?? null;
}

function actualPllParts(moves) {
  let first = 0, last = moves.length;
  while (first < last && /^U(?:2|')?$/.test(moves[first])) first++;
  while (last > first && /^U(?:2|')?$/.test(moves[last - 1])) last--;
  return { core: moves.slice(first, last), pre: moves.slice(0, first), post: moves.slice(last), aufIndices: [...Array(first).keys(), ...Array.from({ length: moves.length - last }, (_, index) => last + index)] };
}

function f2lSetup(segmentation, from) {
  return [...parseAnalysisMoves(segmentation.normalized.scramble), ...segmentation.normalized.moves.slice(0, from)];
}

const rotateFour = values => [values[3], values[0], values[1], values[2]];
function orientationSignature(pattern) {
  let values = [...pattern.CORNERS.orientation.slice(0, 4), ...pattern.EDGES.orientation.slice(0, 4)];
  let best = values.join('');
  for (let i = 1; i < 4; i++) {
    values = [...rotateFour(values.slice(0, 4)), ...rotateFour(values.slice(4))];
    best = best < values.join('') ? best : values.join('');
  }
  return best;
}

function prefixAlg(originalCase, moves) {
  const prefix = moves.join(' ');
  if (!prefix) return null;
  const normalized = prefix.replace(/[′’]/g, "'");
  return verifiedAlgs(originalCase).find(alg => {
    const tokens = physicalMoves(alg.moves);
    return tokens.length >= moves.length && tokens.slice(0, moves.length).join(' ') === normalized;
  }) ?? null;
}

function pauseBefore(segmentation, nextIndex) {
  return (segmentation.pauses ?? []).find(pause => pause.i === nextIndex && pause.excessMs > 0) ?? null;
}

function lookReport({ segmentation, kind, start, end, originalCase, stateAt, caseAt, settings, expectedBoundary, completeAlg }) {
  const configured = settings?.[kind] === '1look' ? 1 : 2;
  const moves = segmentation.normalized.moves;
  const observations = [];
  let previous = originalCase?.id ?? null;
  for (let index = start; index < end; index++) {
    const state = stateAt(index);
    const caseRow = caseAt(state, index);
    const caseId = caseRow?.id ?? null;
    if (caseId && caseId !== previous) {
      const pause = pauseBefore(segmentation, index + 1);
      const prefix = prefixAlg(originalCase, moves.slice(start, index + 1));
      const knownBoundary = expectedBoundary?.has(index);
      // A pause inside a complete, catalog-verified solution is not evidence
      // of a second recognition. Algorithms often pass through other catalog
      // cases on their way to solving the original case.
      const evidence = knownBoundary ? 'configured-look' : completeAlg ? null : pause ? 'pause' : prefix ? 'known-alg-prefix' : null;
      observations.push({ caseId, name: caseRow.name ?? caseId, at: index, ...(pause ? { pauseMs: Math.round(pause.gapMs) } : {}),
        ...(prefix ? { recognizedAlg: prefix.id, recognizedAlgMoves: prefix.moves } : {}), evidence });
    }
    previous = caseId;
  }
  const configuredBoundaries = observations.filter(row => row.evidence === 'configured-look').length;
  const extraCandidates = observations.filter(row => row.evidence && row.evidence !== 'configured-look');
  const looksTaken = 1 + configuredBoundaries + extraCandidates.length;
  const extraLook = looksTaken > configured;
  const likelyExtraLook = !completeAlg && observations.some(row => !row.evidence);
  return { configured, looksTaken, extraLook, likelyExtraLook, looks: observations };
}

function matchingAlg(caseRow, moves) {
  const core = stripAuf(Array.isArray(moves) ? moves.join(' ') : moves).join(' ');
  if (!core) return null;
  return verifiedAlgs(caseRow).find(alg => stripAuf(physicalMoves(alg.moves).join(' ')).join(' ') === core) ?? null;
}

/**
 * Analyse the first conventional OLL and PLL cases after F2L. Case rows and
 * algorithms are evidence from the curated, verified seed catalog only.
 */
export async function evaluateLastLayer(segmentation, { kpuzzle = null, caseRows = getCases(), signature = effectSignature, config = null } = {}) {
  if (!segmentation?.normalized || !Array.isArray(segmentation.moves)) return null;
  const limits = stages(segmentation);
  if (!limits) return null;
  const puzzle = kpuzzle ?? await getPuzzle();
  const ollCompleted = reached(segmentation.marks.eoIdx, segmentation.moves.length)
    && reached(segmentation.marks.coIdx, segmentation.moves.length);
  const pllCompleted = reached(segmentation.marks.solvedIdx, segmentation.moves.length);
  const out = { oll: null, pll: null, lastLayerReference: null };
  const ollSetup = f2lSetup(segmentation, limits.f2lEnd);
  const ollCaseSignature = signature(puzzle, invertAlg(ollSetup.join(' ')).join(' '), 'oll');
  const ollCase = caseRows.find(row => row.set === 'oll' && row.signature === ollCaseSignature) ?? null;

  if (ollCase && Number.isInteger(limits.ollEnd) && limits.ollStart <= segmentation.moves.length) {
    const usedMoves = segmentation.normalized.moves.slice(limits.ollStart, limits.ollEnd + 1);
    const recognizedAlg = matchingAlg(ollCase, usedMoves);
    const used = metric(usedMoves.join(' '));
    const pattern = puzzle.defaultPattern().applyAlg(ollSetup.join(' '));
    const best = bestOll(ollCase, pattern);
    const measured = timing(segmentation, limits.ollStart, limits.ollEnd, ollCompleted);
    const better = ollCompleted && best && usedMoves.length && used.stm > best.stm ? { stm: used.stm - best.stm, loss: used.stm - best.stm, best: best.moves } : null;
    const ollCatalog = new Map(caseRows.filter(row => row.set === 'oll').map(row => [row.signature, row]));
    const ollStates = [];
    let walkState = applyAnalysisMoves(analysisStateFromScramble(segmentation.normalized.scramble), segmentation.normalized.moves.slice(0, limits.ollStart));
    let walkPattern = pattern;
    for (let index = limits.ollStart; index < limits.ollEnd; index++) {
      const move = segmentation.normalized.moves[index];
      walkState = applyMoves(walkState, [move]);
      walkPattern = walkPattern.applyAlg(move);
      ollStates[index] = { state: walkState, pattern: walkPattern };
    }
    const ollLook = lookReport({ segmentation, kind: 'oll', start: limits.ollStart, end: limits.ollEnd,
      originalCase: ollCase, settings: config, completeAlg: recognizedAlg, expectedBoundary: (config?.oll ?? '2look') === '2look' ? new Set([segmentation.marks.eoIdx]) : new Set(),
      stateAt: index => ollStates[index]?.state,
      caseAt: (state, index) => {
        if (!crossSolved(state, 'D') || solvedPairs(state, 'D').length !== 4) return null;
        const key = orientationSignature(ollStates[index]?.pattern?.patternData ?? {});
        return key === '00000000' ? null : ollCatalog.get(key) ?? null;
      } });
    out.oll = { caseId: ollCase.id, name: ollCase.name, number: ollCase.number ?? null, from: limits.ollStart, to: Math.max(limits.ollStart - 1, limits.ollEnd),
      used: { moves: string(usedMoves), stm: used.stm, etm: used.etm }, best, better,
      recognizedAlg: recognizedAlg ? { id: recognizedAlg.id, moves: recognizedAlg.moves } : null, ...ollLook, ...measured };
  }

  if (Number.isInteger(limits.pllStart) && limits.pllStart <= segmentation.moves.length) {
    const before = analysisStateFromScramble(segmentation.normalized.scramble);
    const canonical = applyAnalysisMoves(before, segmentation.normalized.moves.slice(0, limits.ollEnd + 1));
    const recognized = identifyPllCase(canonical);
    const caseRow = recognized ? getCase(`pll/${recognized.name}`) : null;
    if (caseRow) {
      const usedMoves = segmentation.normalized.moves.slice(limits.pllStart, limits.pllEnd + 1);
      const parts = actualPllParts(usedMoves);
      const recognizedAlg = matchingAlg(caseRow, parts.core);
      const usedCore = metric(parts.core.join(' '));
      const usedTotal = metric(usedMoves.join(' '));
      const best = bestPllFromState(canonical, caseRow);
      const measured = timing(segmentation, limits.pllStart, limits.pllEnd, pllCompleted);
      const better = pllCompleted && best && usedMoves.length && usedCore.stm > best.coreStm ? { stm: usedCore.stm - best.coreStm, loss: usedCore.stm - best.coreStm, best: best.moves } : null;
      const actualAufStm = metric([...parts.pre, ...parts.post].join(' ')).stm;
      const extraAuf = pllCompleted && best && actualAufStm > best.aufStm
        ? { loss: actualAufStm - best.aufStm, indices: parts.aufIndices.slice(0, actualAufStm - best.aufStm), used: string([...parts.pre, ...parts.post]), best: string([best.pre, best.post].filter(Boolean)) }
        : null;
      const pllStates = [];
      let pllWalkState = canonical;
      for (let index = limits.pllStart; index < limits.pllEnd; index++) {
        pllWalkState = applyMoves(pllWalkState, [segmentation.normalized.moves[index]]);
        pllStates[index] = pllWalkState;
      }
      const pllCatalog = new Map(caseRows.filter(row => row.set === 'pll').map(row => [row.id, row]));
      const pllLook = lookReport({ segmentation, kind: 'pll', start: limits.pllStart, end: limits.pllEnd,
        originalCase: caseRow, settings: config, completeAlg: recognizedAlg, expectedBoundary: (config?.pll ?? '2look') === '2look' ? new Set([segmentation.marks.cpIdx]) : new Set(),
        stateAt: index => pllStates[index],
        caseAt: (state, index) => crossSolved(state, 'D') && solvedPairs(state, 'D').length === 4 && eoSolved(state, 'D') && coSolved(state, 'D')
          ? pllCatalog.get(`pll/${identifyPllCase(state)?.name ?? ''}`) ?? null : null });
      out.pll = { caseId: caseRow.id, name: caseRow.name, from: limits.pllStart, to: Math.max(limits.pllStart - 1, limits.pllEnd),
        used: { moves: string(usedMoves), core: string(parts.core), stm: usedTotal.stm, coreStm: usedCore.stm, auf: string([...parts.pre, ...parts.post]), aufStm: actualAufStm },
        best, better, extraAuf,
        recognizedAlg: recognizedAlg ? { id: recognizedAlg.id, moves: recognizedAlg.moves } : null,
        ...pllLook, ...measured };
    }
  }

  if (ollCompleted && pllCompleted && (out.oll || out.pll)) {
    const ollRef = out.oll?.best?.stm ?? 0;
    const pllRef = out.pll?.best?.stm ?? 0;
    const pllAuf = out.pll?.best?.aufStm ?? 0;
    out.lastLayerReference = ollRef + pllRef;
    if (out.pll?.best) out.lastLayerReference = ollRef + out.pll.best.coreStm + pllAuf;
  }
  return out.oll || out.pll ? out : null;
}
