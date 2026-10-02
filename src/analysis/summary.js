// The compact analysis summary stored on a solve record (record.analysis): only what the review
// needs to draw markers and compare "yours vs better", bounded below 6 KB of JSON per solve.
// Everything else is cheap to derive again from the record itself
// (scramble, solveMoves, moveTimes, splits, rotationMarks).
//
// Moves are stored in the solve's own frame (the frame of record.solveMoves), as strings, so the
// review can replay them on the real cube. Indices are 0-based move indices; "at" on a position
// means that many solve moves have been applied.

import { ENGINE_VERSION } from './segment.js';
import { canonicalizeReconstruction, tokenizeReconstruction } from '../review/import-parser.js';
import { unrelabelMoves } from './normalize.js';
import { applyMoves, stateFromScramble } from '../cross-cube.js';
import { f2lSetupSignature } from '../algs/drill/cube.js';
import { getCases } from '../algs/seed/cases.js';

export const SUMMARY_VERSION = 4;
const MAX_LOSSES = 8;
const MAX_PAUSES = 8;
const MAX_CANCELS = 8;

const text = moves => (moves ?? []).join(' ');

function identifyF2lCases(segmentation, pairs) {
  const normalized = segmentation.normalized;
  if (!normalized?.scramble || !Array.isArray(normalized.moves)) return {};
  let initial;
  try { initial = stateFromScramble(normalized.scramble); }
  catch { return {}; }
  const identified = {};
  for (const pair of pairs ?? []) {
    // Pair evaluation records labels in the solve's original frame; the replay
    // below uses cross-on-D moves. Resolve the canonical frame's actual slot
    // from segmentation so colour-neutral cross rotations cannot mislabel it.
    const observed = segmentation.pairs?.find(item => item.n === pair.n);
    const slot = observed?.slot;
    if (!Number.isInteger(pair.from) || !['FR', 'FL', 'BR', 'BL'].includes(slot)) continue;
    try {
      const atStart = applyMoves(initial, normalized.moves.slice(0, pair.from));
      const signature = f2lSetupSignature(atStart, slot);
      const row = signature && getCases('f2l').find(candidate => candidate.targetPair === slot && candidate.signature === signature);
      if (row) identified[`pair${pair.n}`] = { caseId: row.id, targetPair: row.targetPair };
    } catch { /* Unsupported recording formats simply have no F2L case link. */ }
  }
  return identified;
}

/**
 * @param {{segmentation:Object, cross?:Object|null, pairs?:Object[]|null}} analysis  analyzeSolve* result
 * @returns {import('./summary.js').AnalysisSummary}
 */
export function summarizeAnalysis({ segmentation: seg, cross = null, pairs = null, lastLayer = null }) {
  const marks = seg.marks;
  const out = {
    v: SUMMARY_VERSION,
    engine: ENGINE_VERSION,
    face: seg.crossFace,
    crossSource: seg.crossSource,
    solved: seg.solved,
    timed: seg.timing.hasTimes,
    // Milestone move indices in the solve's own frame (null = not reached).
    marks: { cross: marks.crossIdx, pairs: [...marks.pairIdx], eo: marks.eoIdx, co: marks.coIdx, cp: marks.cpIdx, solved: marks.solvedIdx },
    xcross: seg.xcross && seg.xcross.kind !== 'cross' ? seg.xcross.kind : null,
    // Free pairs, x-cross and skips exactly as segmentSolve reports them (idx -1 = true before the first move, not a skip).
    skips: seg.skips.filter(skip => skip.idx >= 0).map(skip => ({ kind: skip.kind, idx: skip.idx, ...(skip.count ? { count: skip.count } : {}), ...(skip.pseudo ? { pseudo: true } : {}) })),
    pseudo: seg.pairs.filter(pair => pair.pseudo).map(pair => pair.n),
    offsets: seg.offsets.map(offset => ({ at: offset.createdAt, resolvedAt: offset.resolvedAt, used: offset.used, stray: offset.stray })),
    pauses: seg.pauses.slice().sort((a, b) => b.excessMs - a.excessMs).slice(0, MAX_PAUSES)
      .map(pause => ({ i: pause.i, ms: Math.round(pause.gapMs), allow: pause.allowMs, stage: pause.stage, boundary: pause.boundary })).sort((a, b) => a.i - b.i),
    medianGapMs: seg.timing.medianGapMs == null ? null : Math.round(seg.timing.medianGapMs),
    cancels: seg.cancellations.slice().sort((a, b) => b.waste - a.waste).slice(0, MAX_CANCELS)
      .map(run => ({ from: run.from, to: run.to, waste: run.waste })).sort((a, b) => a.from - b.from),
    cross: null,
    pairs: [],
    ollCase: lastLayer?.oll ? { id: lastLayer.oll.caseId, recognitionMs: lastLayer.oll.recognitionMs, executionMs: lastLayer.oll.executionMs } : seg.cases?.oll ? { id: seg.cases.oll.id, recognitionMs: seg.cases.oll.recognitionMs, executionMs: seg.cases.oll.executionMs } : null,
    pllCase: lastLayer?.pll ? { id: lastLayer.pll.caseId, auf: lastLayer.pll.used?.auf ?? null, recognitionMs: lastLayer.pll.recognitionMs, executionMs: lastLayer.pll.executionMs } : seg.cases?.pll ? { id: seg.cases.pll.id, auf: seg.cases.pll.auf ?? null, recognitionMs: seg.cases.pll.recognitionMs, executionMs: seg.cases.pll.executionMs } : null,
    lastLayer: lastLayer ? {
      oll: compactLastLayerStage(lastLayer.oll, seg.crossFace),
      pll: compactLastLayerStage(lastLayer.pll, seg.crossFace),
      reference: Number.isFinite(lastLayer.lastLayerReference) ? lastLayer.lastLayerReference : null,
    } : null,
    lastLayerReference: Number.isFinite(lastLayer?.lastLayerReference) ? lastLayer.lastLayerReference : null,
  };
  const f2lCases = identifyF2lCases(seg, pairs);
  if (Object.keys(f2lCases).length) out.f2lCases = f2lCases;
  if (cross) {
    const lossy = cross.positions.filter(row => row.loss > 0);
    out.cross = {
      moves: cross.userMoves, d0: cross.d0, extra: cross.extraMoves, total: cross.totalLoss, done: cross.finished, proven: cross.startProven === true && cross.complete === true,
      target: cross.targetSlots?.length ? { kind: cross.targetSlots.length > 1 ? 'xxcross' : 'xcross', slots: cross.targetSlots, mask: cross.targetMask } : { kind: 'cross', slots: [], mask: 0 },
      best: text(cross.bestContinuation),
      // Every face's optimal length at move 0 (colour-neutral comparison).
      faces: cross.faceLengths ?? null,
      faceProven: cross.faceProven ?? null,
      faceComplete: cross.faceComplete !== false,
      xcrossFaces: cross.xcrossFaces ?? null,
      startProven: cross.startProven === true,
      // The moves that cost something: i = the move index, loss 1 (extra) or 2 (detour), d = moves left before it, best = shortest finish from before it.
      losses: lossy.slice(0, MAX_LOSSES).map(row => ({ i: row.i - 1, move: row.move, loss: row.loss, d: cross.positions[row.i - 1].d, best: text(cross.positions[row.i - 1].best), after: row.d })),
    };
  }
  for (const pair of pairs ?? []) {
    if (pair.unsupported) { out.pairs.push({ n: pair.n, unsupported: pair.unsupported }); continue; }
    out.pairs.push({
      n: pair.n, from: pair.from, to: pair.to, yours: text(pair.yours), w: pair.yoursWeight, yoursErgonomicScore: pair.yoursErgonomicScore,
      frame: pair.frame, proofScope: pair.proofScope,
      chosenSlot: pair.chosenSlot ?? null, chosenSlots: pair.chosenSlots ?? [],
      chosenShortest: pair.chosenShortest ?? null, chosenProven: pair.chosenProven === true,
      bestSlot: pair.bestSlot ?? null,
      better: pair.better ? {
        slot: pair.better.slot, slots: pair.better.slots, moves: text(pair.better.moves), w: pair.better.weight,
        stm: pair.better.stm, etm: pair.better.etm, generators: pair.better.generators, ergonomicScore: pair.better.ergonomicScore,
        goalShift: pair.better.goalShift,
      } : null,
      options: (pair.options ?? []).slice(0, 8).map(option => ({
        slots: option.slots, moves: text(option.moves), stm: option.stm, etm: option.etm,
        generators: option.generators, ergonomicScore: option.ergonomicScore, plannerWeight: option.plannerWeight,
        ...(option.source ? { source: option.source } : {}), proven: option.proven !== false, goalShift: option.goalShift ?? 0,
      })),
      shortest: pair.shortest, proven: pair.proven === true, complete: pair.complete === true, ms: pair.ms,
      ...(pair.pendingUpgrade ? { pendingUpgrade: true } : {}),
    });
  }
  return out;
}

function playableMoves(text, face) {
  if (!text) return '';
  const tokens = tokenizeReconstruction(text).tokens;
  const canonical = canonicalizeReconstruction(tokens).moves.map(entry => entry.move);
  return unrelabelMoves(canonical, face).join(' ');
}

function compactLastLayerStage(stage, face) {
  if (!stage) return null;
  const compactAlg = alg => alg ? { id: alg.id ?? null, moves: playableMoves(alg.moves ?? '', face), notation: alg.notation ?? alg.moves ?? '', sourceNotation: alg.sourceNotation ?? alg.notation ?? alg.moves ?? '', stm: alg.stm ?? 0, etm: alg.etm ?? 0, rank: alg.rank ?? null, credit: alg.credit ?? '', source: alg.source ?? '', sourceUrl: alg.sourceUrl ?? '' } : null;
  return {
    caseId: stage.caseId, name: stage.name, number: stage.number ?? null, from: stage.from, to: stage.to,
    used: stage.used ? { moves: playableMoves(stage.used.moves ?? '', face), core: playableMoves(stage.used.core ?? '', face), stm: stage.used.stm ?? 0, coreStm: stage.used.coreStm ?? 0, auf: playableMoves(stage.used.auf ?? '', face), aufStm: stage.used.aufStm ?? 0 } : null,
    best: compactAlg(stage.best), better: stage.better ? { stm: stage.better.stm, loss: stage.better.loss, best: playableMoves(stage.better.best, face) } : null,
    extraAuf: stage.extraAuf ? { loss: stage.extraAuf.loss, indices: stage.extraAuf.indices, used: playableMoves(stage.extraAuf.used, face), best: playableMoves(stage.extraAuf.best, face) } : null,
    recognitionMs: stage.recognitionMs, executionMs: stage.executionMs,
  };
}

/** @typedef {ReturnType<typeof summarizeAnalysis>} AnalysisSummary */
