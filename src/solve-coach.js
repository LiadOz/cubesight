// Coach lenses for a live solve — the analysis layer behind “Coach mode”.
//
// Each lens is a small, mostly-pure function over the canonical cube state
// (and, where noted, the user's recorded solve) that produces a short,
// human-readable insight. They mirror what a chess.com “Game Review” does for
// chess: classify what happened, point at the key moment, and suggest a better
// option — without generating a full alternative solution (the user asked for
// “a faster pair was available”, never a full alt-solve).
//
// Sync lenses are unit-tested. The cross-suggestion lens is async because it
// drives the cross/X-cross solver in a worker; it is exercised by the browser
// suite (the solver needs the WASM worker) and degrades to a heuristic note
// when unavailable.

import { solveCross } from './cross-solver.js';
import { analyze, canonicalizeForRecognition, f2lPairSlots, pairSolved, pairReadiness, crossSolved, llFace } from './solve-tracker.js';
import { identifyPllCase, isPllState } from './pll-logic.js';
import { FACE_COLORS, OPPOSITE_FACE } from './cross-cube.js';

// --- Cross lens ---------------------------------------------------------------

// Optimal cross (and optional X-cross / double X-cross) for every face, given a
// scramble string. Returns one entry per face with its move count, plus a `best`
// recommendation. This is colour-neutral: we search all six faces and let the
// cheapest win, the way a solver chooses a cross during inspection. The
// solver runs in a worker, so this is async; a per-face failure never blocks
// the others, and the lens degrades to "no suggestion" if the budget runs out.
export async function crossSuggestion(scramble, { extended = false, timeLimitMs = 1500 } = {}) {
  const faces = Object.keys(FACE_COLORS);
  const results = [];
  for (const face of faces) {
    try {
      const reply = await solveCross({
        scramble, face,
        kind: extended ? 'xcross' : 'cross',
        maxResults: 4, maxDepth: 10, timeLimitMs,
      });
      const moves = reply.results?.[0]?.moves ?? null;
      results.push({ face, moves, length: moves ? moves.length : null });
    } catch { /* a single face timing out must not abort the rest */ }
  }
  const finite = results.filter(r => r.length != null);
  const best = finite.length ? finite.reduce((a, b) => (a.length <= b.length ? a : b)) : null;
  return { perFace: results, best, extended };
}

// Non-optimal-cross hindsight: compare the moves the user actually spent on the
// cross with the optimal count for their chosen face. Pure and sync.
export function crossHindsight(userCrossMoveCount, optimalMoveCount, crossFace) {
  if (optimalMoveCount == null || userCrossMoveCount == null) return null;
  if (userCrossMoveCount <= optimalMoveCount) {
    return { kind: 'optimal', text: `Your ${crossFace}-face cross took ${userCrossMoveCount} move${userCrossMoveCount === 1 ? '' : 's'} — optimal for this scramble.` };
  }
  const extra = userCrossMoveCount - optimalMoveCount;
  return {
    kind: 'suboptimal',
    text: `Your ${crossFace}-face cross took ${userCrossMoveCount} move${userCrossMoveCount === 1 ? '' : 's'}. An optimal ${crossFace} cross here is ${optimalMoveCount}. ${extra} extra move${extra === 1 ? '' : 's'}.`,
  };
}

// --- F2L lens ----------------------------------------------------------------

// A cheap readiness hint for the next pair, without a search: surface pairs
// that are already connected (one insertion away) first. The solver-based
// ranking is a follow-up behind the same lens; this keeps the coach useful
// even offline and on slow devices.
export function f2lNextPairHint(state, crossFace) {
  const slots = f2lPairSlots(crossFace);
  const unsolved = slots.filter(s => !pairSolved(state, s));
  if (!unsolved.length) return null;
  const ranked = unsolved.map(pair => ({ pair, readiness: pairReadiness(state, pair) }));
  ranked.sort((a, b) => Number(b.readiness.connected) - Number(a.readiness.connected));
  const top = ranked[0];
  return {
    pair: top.pair,
    ready: top.readiness.connected,
    text: top.readiness.connected
      ? `The ${top.pair.slot} pair is already connected — insert it.`
      : `Several pairs are scattered. Track the ${top.pair.slot} corner and edge before inserting.`,
  };
}

// Better-insertion hindsight: after a pair was inserted, report whether a
// different pair was already connected (and so one insertion away) in the
// state BEFORE the insertion. No full alt-solve, by design.
export function betterInsertionHindsight(stateBeforeInsertion, insertedPair, crossFace) {
  const slots = f2lPairSlots(crossFace);
  const others = slots.filter(s => s.slot !== insertedPair.slot && !pairSolved(stateBeforeInsertion, s));
  const alreadyConnected = others.find(s => pairReadiness(stateBeforeInsertion, s).connected);
  if (!alreadyConnected) return null;
  return {
    kind: 'better-pair-available',
    pair: alreadyConnected,
    text: `You inserted the ${insertedPair.slot} pair, but the ${alreadyConnected.slot} pair was already connected here (see the state before) — inserting it first would have saved a step.`,
  };
}

// --- OLL lens ----------------------------------------------------------------

// Two-look OLL stage: edge orientation done? corner orientation done? Full OLL
// done is already in the tracker; this adds the intermediate 2-look labels the
// coach surfaces to flag “your hard OLL stage”.
export function ollStage(state, crossFace) {
  const view = canonicalizeForRecognition(state, crossFace);
  const ll = 'U';
  const llColor = FACE_COLORS[ll];
  const edges = view.cubies.filter(c => c.id.length === 2 && c.stickers[ll] !== undefined);
  const corners = view.cubies.filter(c => c.id.length === 3 && c.stickers[ll] !== undefined);
  const eoDone = edges.length === 4 && edges.every(e => e.stickers[ll] === llColor);
  const coDone = corners.length === 4 && corners.every(c => c.stickers[ll] === llColor);
  const ollDone = eoDone && coDone;
  return { eoDone, coDone, ollDone };
}

// --- PLL lens ----------------------------------------------------------------

// Identify the PLL case for a colour-neutral solve (returns null until the cube
// reaches a PLL state). Reuses the existing PLL recogniser via the canonical
// colour-neutral view, so it works on any cross, not just white.
export function pllLens(state, crossFace) {
  const view = canonicalizeForRecognition(state, crossFace);
  if (!isPllState(view)) return null;
  const entry = identifyPllCase(view);
  if (!entry) return { name: null, family: null, cue: null, aufNeeded: true };
  return { name: entry.name, family: entry.family, cue: entry.cue, aufNeeded: false };
}

// A one-line solve-accuracy score analogue (chess.com accuracy %): a coarse
// efficiency rating from 0–100 combining cross efficiency, rotation economy
// and phase completion. Pure; the view composes it from a record + hints.
export function efficiencyScore({ userCrossMoves = 0, optimalCrossMoves = null, rotations = 0, solved = false, f2lPairs = 0, ollDone = false } = {}) {
  let score = 50;
  if (solved) score += 25;
  if (f2lPairs) score += Math.min(15, f2lPairs * 4);
  if (ollDone) score += 5;
  if (optimalCrossMoves != null && userCrossMoves <= optimalCrossMoves) score += 10;
  else if (optimalCrossMoves != null) score -= Math.min(15, (userCrossMoves - optimalCrossMoves) * 3);
  score -= Math.min(15, rotations * 2);
  return Math.max(0, Math.min(100, Math.round(score)));
}
