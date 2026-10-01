// Best verified F2L completion from each recorded pair boundary. The search is
// pure and local; worker.js calls it on the analysis worker, never the UI thread.
import { bestCompletions, crossSolved, ergoScore, plannerWeight, SLOTS, solvedSlots, trackedFrom } from './pair-completion.js';
import { FACE_TO_D, unrelabelMoves } from './normalize.js';

const generatorSet = moves => [...new Set(moves.map(move => move[0]))].sort().join('');
const originalSlot = (slot, crossFace) => {
  const normalizedToOriginal = Object.fromEntries(Object.entries(FACE_TO_D[crossFace]).map(([from, to]) => [to, from]));
  return [...slot].map(face => normalizedToOriginal[face]).sort().join('');
};

// Stage positions are in the normalized cross-on-D frame. A nonzero k means
// the pair boundary has a D-layer offset; search from that actual frame and
// compare all four possible ending frames without adding a forced D turn.
export function pairTargets(segmentation, { maxPairs = 4 } = {}) {
  const out = [];
  for (const stage of segmentation.stages) {
    const match = /^pair([1-4])$/.exec(stage.name);
    if (!match) continue;
    const n = Number(match[1]);
    if (n > maxPairs || stage.skipped || stage.fromIdx === null || stage.moves === 0) continue;
    const startFrame = stage.fromIdx === 0 ? segmentation.initial?.k : segmentation.frames[stage.fromIdx - 1]?.k;
    const recordedPair = segmentation.pairs.find(pair => pair.n === n);
    out.push({
      n, stage: stage.name, from: stage.fromIdx, to: stage.toIdx, frame: startFrame ?? 0,
      // Which physical slot this solve actually completed at the milestone.
      // Keep normalized and original-frame forms so review scoring can compare
      // the right target while the UI shows the user's face labels.
      chosenSlot: recordedPair?.slot ?? null,
      chosenSlotOriginal: recordedPair?.slotOriginal ?? null,
    });
  }
  return out;
}

function pairSteps(segmentation, target, { maxDepth = 12, timeBudgetMs = 300, slack = 1 } = {}) {
  const { normalized, crossFace } = segmentation;
  const prefixMoves = normalized.moves.slice(0, target.from);
  const setup = [normalized.scramble, ...prefixMoves].filter(Boolean).join(' ');
  const yours = normalized.moves.slice(target.from, target.to + 1);
  const found = bestCompletions(setup, { maxDepth, maxSolutions: 32, slack, timeBudgetMs, startShift: target.frame });
  const byAlg = new Map();
  for (const candidate of found.candidates) for (const option of candidate.options) {
    const moves = [...option.tokens];
    const key = moves.join(' ');
    const slotNames = (option.slots.length ? option.slots : candidate.slots).map(slot => originalSlot(slot, crossFace));
    const current = byAlg.get(key);
    const row = {
      slots: slotNames,
      moves,
      goalShift: option.goalShift ?? 0,
      stm: moves.length,
      etm: moves.length,
      generators: generatorSet(unrelabelMoves(moves, crossFace)),
      ergonomicScore: ergoScore(moves),
      plannerWeight: plannerWeight(moves),
      // A verified replay is not necessarily a proven shortest completion.
      // Only the candidate's exact minimum can carry proof status, and only
      // when every end-frame search completed.
      proven: option.source === 'recorded-fallback' ? false : Boolean(candidate.shortest === moves.length
        && !candidate.timedOut && candidate.searchedGoalShifts.length === 4),
    };
    if (!current || row.ergonomicScore < current.ergonomicScore) byAlg.set(key, row);
  }
  // If the bounded search found nothing for a slot, the recorded segment is a
  // safe upper bound only when replay confirms the cross in an end frame, that slot, and
  // every already-completed pair. It is never described as an optimal result.
  const startCodes = trackedFrom(setup);
  const startSlots = solvedSlots(startCodes, target.frame);
  const recorded = normalized.moves.slice(target.from, target.to + 1);
  const recordedCodes = trackedFrom(`${setup} ${recorded.join(' ')}`);
  for (const candidate of found.candidates) {
    const slotIndex = SLOTS.findIndex(slot => slot.name === candidate.slots[0]);
    const endingShift = [0, 1, 2, 3].find(shift => crossSolved(recordedCodes, shift)
      && startSlots.every(slot => solvedSlots(recordedCodes, shift).includes(slot))
      && solvedSlots(recordedCodes, shift).includes(slotIndex));
    if (candidate.options.length || slotIndex < 0 || endingShift == null) continue;
    const moves = [...recorded];
    const row = {
      slots: [candidate.slots[0]], moves, goalShift: endingShift, stm: moves.length, etm: moves.length,
      generators: generatorSet(unrelabelMoves(moves, crossFace)), ergonomicScore: ergoScore(moves),
      plannerWeight: plannerWeight(moves), source: 'recorded-fallback', proven: false,
    };
    byAlg.set(moves.join(' '), row);
  }
  const options = [...byAlg.values()].sort((a, b) => a.stm - b.stm || a.ergonomicScore - b.ergonomicScore || a.plannerWeight - b.plannerWeight || a.generators.localeCompare(b.generators));
  const best = options[0] ?? null;
  const chosenCandidate = target.chosenSlot
    ? found.candidates.find(candidate => candidate.slots.includes(target.chosenSlot)) ?? null
    : null;
  const shortestWithFrame = Math.min(...found.candidates.map(candidate => candidate.shortest < 0 ? Infinity : candidate.shortest));
  const globallyShortest = found.candidates
    .filter(candidate => candidate.shortest >= 0)
    .sort((a, b) => a.shortest - b.shortest)[0] ?? null;
  const chosenShortest = chosenCandidate?.shortest >= 0 ? chosenCandidate.shortest : null;
  const chosenProven = Boolean(chosenCandidate && chosenShortest !== null && !chosenCandidate.timedOut
    && chosenCandidate.searchedGoalShifts.length === 4);
  const betterCandidate = best && (best.stm < yours.length || (best.stm === yours.length && best.ergonomicScore < ergoScore(yours))) ? best : null;
  const yoursWeight = plannerWeight(yours);
  return {
    n: target.n, stage: target.stage, from: target.from, to: target.to, at: target.from,
    frame: target.frame, frameTurn: null,
    yours: unrelabelMoves(yours, crossFace), yoursWeight, yoursErgonomicScore: ergoScore(yours),
    better: betterCandidate ? {
      slot: betterCandidate.slots[0] ?? 'multiple', slots: betterCandidate.slots,
      moves: unrelabelMoves(betterCandidate.moves, crossFace), weight: betterCandidate.plannerWeight,
      stm: betterCandidate.stm, etm: betterCandidate.etm, generators: betterCandidate.generators, ergonomicScore: betterCandidate.ergonomicScore,
      goalShift: betterCandidate.goalShift,
    } : null,
    chosenSlot: target.chosenSlotOriginal ?? (target.chosenSlot ? originalSlot(target.chosenSlot, crossFace) : null),
    chosenSlots: target.chosenSlotOriginal ? [target.chosenSlotOriginal]
      : target.chosenSlot ? [originalSlot(target.chosenSlot, crossFace)] : [],
    chosenShortest,
    chosenProven,
    bestSlot: globallyShortest ? originalSlot(globallyShortest.slots[0], crossFace) : null,
    shortest: globallyShortest?.shortest ?? null,
    proofScope: target.frame === 0 ? 'cross-and-pair-up-to-D-offset' : 'D-offset-start-and-cross-up-to-D-offset-end',
    options: options.slice(0, 20).map(option => ({
      ...option,
      moves: unrelabelMoves(option.moves, crossFace),
    })),
    complete: found.candidates.every(candidate => !candidate.timedOut && candidate.searchedGoalShifts.length === 4),
    proven: Boolean(globallyShortest && globallyShortest.shortest === shortestWithFrame
      && found.candidates.every(candidate => !candidate.timedOut && candidate.searchedGoalShifts.length === 4)),
    searchDepth: maxDepth,
    ms: Math.round(found.searchMs * 100) / 100,
    coldMs: Math.round(found.coldMs * 100) / 100,
  };
}

export function evaluatePairs(segmentation, _solver, options = {}) {
  return pairTargets(segmentation, options).map(target => pairSteps(segmentation, target, options));
}

export async function evaluatePairsAsync(segmentation, _solver, { signal, ...options } = {}) {
  const out = [];
  for (const target of pairTargets(segmentation, options)) {
    if (signal?.aborted) { const error = new Error(/* copy-ok: AbortError is an internal worker contract */ 'Analysis cancelled'); error.name = 'AbortError'; throw error; }
    out.push(pairSteps(segmentation, target, options));
    // Give the worker event loop a chance to process cancellation between stages.
    await Promise.resolve();

  }
  return out;
}
