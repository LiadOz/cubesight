// The compact analysis summary stored on a solve record (record.analysis): only what the review
// needs to draw markers and compare "yours vs better", bounded below 6 KB of JSON per solve.
// Everything else is cheap to derive again from the record itself
// (scramble, solveMoves, moveTimes, splits, rotationMarks).
//
// Moves are stored in the solve's own frame (the frame of record.solveMoves), as strings, so the
// review can replay them on the real cube. Indices are 0-based move indices; "at" on a position
// means that many solve moves have been applied.

import { ENGINE_VERSION } from './segment.js';

export const SUMMARY_VERSION = 2;
const MAX_LOSSES = 8;
const MAX_PAUSES = 8;
const MAX_CANCELS = 8;

const text = moves => (moves ?? []).join(' ');

/**
 * @param {{segmentation:Object, cross?:Object|null, pairs?:Object[]|null}} analysis  analyzeSolve* result
 * @returns {import('./summary.js').AnalysisSummary}
 */
export function summarizeAnalysis({ segmentation: seg, cross = null, pairs = null }) {
  const marks = seg.marks;
  const out = {
    v: SUMMARY_VERSION,
    engine: ENGINE_VERSION,
    face: seg.crossFace,
    solved: seg.solved,
    timed: seg.timing.hasTimes,
    // Milestone move indices in the solve's own frame (null = not reached).
    marks: { cross: marks.crossIdx, pairs: [...marks.pairIdx], eo: marks.eoIdx, co: marks.coIdx, cp: marks.cpIdx, solved: marks.solvedIdx },
    xcross: seg.xcross && seg.xcross.kind !== 'cross' ? seg.xcross.kind : null,
    // Free pairs, x-cross and skips exactly as segmentSolve reports them (idx -1 = true before the first move, not a skip).
    skips: seg.skips.filter(skip => skip.idx >= 0).map(skip => ({ kind: skip.kind, idx: skip.idx, ...(skip.count ? { count: skip.count } : {}), ...(skip.pseudo ? { pseudo: true } : {}) })),
    pseudo: seg.pairs.filter(pair => pair.pseudo).map(pair => pair.n),
    pauses: seg.pauses.slice().sort((a, b) => b.excessMs - a.excessMs).slice(0, MAX_PAUSES)
      .map(pause => ({ i: pause.i, ms: Math.round(pause.gapMs), allow: pause.allowMs, stage: pause.stage, boundary: pause.boundary })).sort((a, b) => a.i - b.i),
    medianGapMs: seg.timing.medianGapMs == null ? null : Math.round(seg.timing.medianGapMs),
    cancels: seg.cancellations.slice().sort((a, b) => b.waste - a.waste).slice(0, MAX_CANCELS)
      .map(run => ({ from: run.from, to: run.to, waste: run.waste })).sort((a, b) => a.from - b.from),
    cross: null,
    pairs: [],
    ollCase: seg.cases?.oll ? { id: seg.cases.oll.id, recognitionMs: seg.cases.oll.recognitionMs, executionMs: seg.cases.oll.executionMs } : null,
    pllCase: seg.cases?.pll ? { id: seg.cases.pll.id, auf: seg.cases.pll.auf ?? null, recognitionMs: seg.cases.pll.recognitionMs, executionMs: seg.cases.pll.executionMs } : null,
  };
  if (cross) {
    const lossy = cross.positions.filter(row => row.loss > 0);
    out.cross = {
      moves: cross.userMoves, d0: cross.d0, extra: cross.extraMoves, total: cross.totalLoss, done: cross.finished, proven: cross.complete,
      best: text(cross.bestContinuation),
      // Every face's optimal length at move 0 (colour-neutral comparison).
      faces: cross.faceLengths ?? null,
      // The moves that cost something: i = the move index, loss 1 (extra) or 2 (detour), d = moves left before it, best = shortest finish from before it.
      losses: lossy.slice(0, MAX_LOSSES).map(row => ({ i: row.i - 1, move: row.move, loss: row.loss, d: cross.positions[row.i - 1].d, best: text(cross.positions[row.i - 1].best), after: row.d })),
    };
  }
  for (const pair of pairs ?? []) {
    if (pair.unsupported) { out.pairs.push({ n: pair.n, unsupported: pair.unsupported }); continue; }
    out.pairs.push({
      n: pair.n, from: pair.from, to: pair.to, yours: text(pair.yours), w: pair.yoursWeight, yoursErgonomicScore: pair.yoursErgonomicScore,
      frame: pair.frame, proofScope: pair.proofScope,
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
    });
  }
  return out;
}

/** @typedef {ReturnType<typeof summarizeAnalysis>} AnalysisSummary */
