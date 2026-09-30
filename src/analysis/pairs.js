// F2L pair alternatives for pairs 1 and 2 (SPEC 4.2, v2 subset): at the position where a pair
// stage starts, search every slot's cross + pair completion with the existing xcross solver,
// verify and rank them with the f2l-planner (plannerChoices), and compare the cheapest with the
// moves the user actually played. Pairs 3 and 4 have no engine yet: the result says so.
//
// Everything runs in the cross-on-D frame (segmentation.normalized) and the suggestion is mapped
// back to the solve's own frame. Written like cross-eval: one generator of solver questions,
// answered synchronously (node tests) or awaited (Web Worker).

import { stateFromScramble, validateSolution } from '../cross-cube.js';
import { plannerChoices, weightedMoveCount } from '../f2l-planner.js';
import { unrelabelMoves } from './normalize.js';

const SINGLE_MASKS = [1, 2, 4, 8];
const PAIR_MASKS = [3, 5, 9, 6, 10, 12];   // existing slot + one more (xx-cross style goals)
export const PAIR_ENGINE_PAIRS = 2;        // pairs with a suggestion engine; 3 and 4 say "no suggestion yet"

function* pairSteps({ scramble, moves, crossFace, stage, n, from, to, timeoutMs }) {
  // Position where this pair stage starts: the scramble plus the moves before `from` (cross on D).
  const prefix = moves.slice(0, from);
  const start = [scramble, ...prefix].filter(Boolean).join(' ');
  const state = stateFromScramble(start);
  const setup = { state, solvedPairs: validateSolution(state, [], 'D').pairs };
  const masks = setup.solvedPairs.length ? PAIR_MASKS : SINGLE_MASKS;
  const results = [];
  let complete = true;
  for (const mask of masks) {
    const reply = yield { scramble: start, face: 'D', mask, maxDepth: 10, maxResults: 8, timeoutMs };
    if (reply?.status !== 0) complete = false;
    for (const found of reply?.results || []) results.push(found);
  }
  const choices = plannerChoices(setup, results);
  const yours = moves.slice(from, to + 1);
  const yoursWeight = weightedMoveCount(yours);
  const best = choices.slice().sort((a, b) => a.moves.length - b.moves.length || a.weight - b.weight)[0] ?? null;
  const better = best && best.moves.length < yours.length ? best : null;
  return {
    n, stage, from, to, at: from, complete,
    yours: unrelabelMoves(yours, crossFace), yoursWeight,
    // The cheapest verified completion of any slot, in the solve's own frame; null when yours was already the shortest.
    better: better ? { slot: better.slot, moves: unrelabelMoves(better.moves, crossFace), weight: better.weight } : null,
    // Shortest found even when it is not better (shows "yours is the shortest").
    shortest: best ? best.moves.length : null,
    options: choices.length,
  };
}

// Which pair stages can be compared, and where they start (segmentation stage intervals, cross-on-D).
export function pairTargets(segmentation, { maxPairs = PAIR_ENGINE_PAIRS } = {}) {
  const out = [];
  for (const stage of segmentation.stages) {
    const match = /^pair(\d)$/.exec(stage.name);
    if (!match) continue;
    const n = Number(match[1]);
    if (n > maxPairs) continue;
    if (stage.skipped || stage.fromIdx === null || stage.moves === 0) continue;
    const record = segmentation.pairs.find(pair => pair.n === n);
    // Pseudo frames (a D offset at the start of the stage or on the pair) need the pseudo planner.
    const startFrame = stage.fromIdx === 0 ? segmentation.initial?.k : segmentation.frames[stage.fromIdx - 1]?.k;
    if (record?.pseudo || startFrame) { out.push({ n, stage: stage.name, unsupported: 'pseudo' }); continue; }
    out.push({ n, stage: stage.name, from: stage.fromIdx, to: stage.toIdx });
  }
  return out;
}

function prepare(segmentation, options) {
  return {
    scramble: segmentation.normalized.scramble, moves: segmentation.normalized.moves, crossFace: segmentation.crossFace,
    timeoutMs: options.timeoutMs ?? 500,
  };
}

function unsupported(target) {
  return { n: target.n, stage: target.stage, unsupported: target.unsupported };
}

export function evaluatePairs(segmentation, solver, options = {}) {
  const base = prepare(segmentation, options);
  return pairTargets(segmentation, options).map(target => {
    if (target.unsupported) return unsupported(target);
    const steps = pairSteps({ ...base, ...target });
    let step = steps.next();
    while (!step.done) step = steps.next(solver.search(step.value));
    return step.value;
  });
}

export async function evaluatePairsAsync(segmentation, solver, { signal, ...options } = {}) {
  const base = prepare(segmentation, options);
  const out = [];
  for (const target of pairTargets(segmentation, options)) {
    if (target.unsupported) { out.push(unsupported(target)); continue; }
    const steps = pairSteps({ ...base, ...target });
    let step = steps.next();
    while (!step.done) {
      if (signal?.aborted) { const error = new Error('Analysis cancelled'); error.name = 'AbortError'; throw error; }
      step = steps.next(await solver.search(step.value));
    }
    out.push(step.value);
  }
  return out;
}
