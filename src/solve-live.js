// Live solve orchestration over the shared smart-cube session.
//
// Two flows share one solved-baseline-tracked session:
//   • guided: the user performs a generated scramble (cued move by move, with
//     off-plan recovery), then solves freely.
//   • free:   the user scrambles the cube themselves, taps “Start solving”,
//     then solves freely.
//
// During the solve we timestamp each canonical move, auto-detect the cross
// from the face on the bottom at the first solving move (colour-neutral), and
// emit phase transitions (cross → F2L pairs → OLL → PLL → solved) with split
// times. The cross-detection heuristic matches how a solver actually orients:
// the cross colour is whatever they choose to put on the bottom when they
// begin. When the cube reaches solved we hand back a record for the metrics
// layer (solve-metrics.js) and the persistent store (solve-store.js).
//
// This module owns no cube-state math of its own — it reuses cross-cube.js for
// state and solve-tracker.js for phase analysis — so it can be driven by a fake
// session in tests.

import { applyMoves, sameCubeState, stateFromScramble, createSolvedState } from './cross-cube.js';
import { analyze, crossSolved, extendedCross, f2lPairSlots, pairSolved } from './solve-tracker.js';
import { followPlanTurn, inverseMove } from './smart-cube-guidance.js';

const SOLVED = createSolvedState();

export function createSolveLive(session, { getOrientation = () => ({ bottom: 'D', front: 'F' }), now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
  let mode = null;            // 'guided' | 'free' | null
  let phase = 'idle';         // idle | applying | solving | done | desynced
  let scrambleStr = null;
  let scrambleMoves = [];
  let scrambledState = null;
  let applyStep = 0;
  let applyDetour = [];
  let solveStartIndex = 0;
  let solveStartAt = 0;
  let crossFace = null;
  let crossColor = null;
  let rotations = 0;
  let lastBottom = null;
  let prev = null;           // previous phase analysis during solving
  let mark = {};             // { solveStartAt, crossAt, f2lAt, ollAt }
  let solveMoves = [];        // canonical solve moves
  let record = null;
  const listeners = new Set();

  const snapshot = () => ({
    mode, phase, scrambleStr, applyStep, applyTotal: scrambleMoves.length, applyDetour: [...applyDetour],
    solveMoves: [...solveMoves], crossFace, crossColor, rotations,
    prev, record, done: phase === 'done',
  });

  function emit() { for (const l of listeners) l(snapshot()); }

  function resetSolve() {
    crossFace = null; crossColor = null; rotations = 0; lastBottom = null;
    prev = null; mark = {}; solveMoves = []; record = null;
  }

  // Guided scramble: cue the user through the scramble moves, recovering on a
  // wrong turn without discarding the attempt (same contract as Cross Scout).
  function startGuided(scramble) {
    if (!session || session.getSnapshot().phase !== 'tracking') {
      throw new Error('Sync a solved cube before starting a guided scramble.');
    }
    mode = 'guided';
    scrambleStr = scramble;
    scrambleMoves = scramble.split(/\s+/).filter(Boolean);
    scrambledState = stateFromScramble(scramble);
    applyStep = 0; applyDetour = [];
    phase = 'applying';
    resetSolve();
    emit();
  }

  // Free scramble: the user has already scrambled; solving starts now.
  function startFree() {
    if (!session || session.getSnapshot().phase !== 'tracking') {
      throw new Error('Sync a solved cube before starting a free solve.');
    }
    mode = 'free';
    scrambleStr = null; scrambleMoves = []; scrambledState = null;
    applyStep = 0; applyDetour = [];
    phase = 'solving';
    const snap = session.getSnapshot();
    solveStartIndex = snap.moves.length;
    solveStartAt = now();
    resetSolve();
    emit();
  }

  function cancel() {
    mode = null; phase = 'idle'; scrambleStr = null; scrambleMoves = [];
    scrambledState = null; applyStep = 0; applyDetour = [];
    resetSolve();
    emit();
  }

  function onApplyMove(move, state) {
    // Plan states include the solved start at index 0, so `step` counts how many
    // scramble moves have been completed (matching Cross Scout's contract).
    const planStates = [SOLVED, ...scrambleMoves.map((_, i) => applyMoves(SOLVED, scrambleMoves.slice(0, i + 1)))];
    const result = followPlanTurn(planStates, applyStep, applyDetour, state, move);
    applyStep = result.step;
    applyDetour = result.detour;
    if (sameCubeState(state, scrambledState)) {
      // Scramble fully applied — begin the solve.
      phase = 'solving';
      solveStartIndex = session.getSnapshot().moves.length;
      solveStartAt = now();
      resetSolve();
    }
    emit();
  }

  function finishSolve(state, allMoves) {
    const solveMs = solveStartAt ? Math.max(0, now() - solveStartAt) : null;
    const moves = allMoves.slice(solveStartIndex);
    solveMoves = moves;
    const phases = mark.crossAt != null ? {
      crossMs: Math.max(0, (mark.crossAt || solveStartAt) - solveStartAt),
      f2lMs: mark.f2lAt != null ? Math.max(0, (mark.f2lAt || mark.crossAt || solveStartAt) - (mark.crossAt || solveStartAt)) : null,
      ollMs: mark.ollAt != null ? Math.max(0, (mark.ollAt || mark.f2lAt || mark.crossAt || solveStartAt) - (mark.f2lAt || mark.crossAt || solveStartAt)) : null,
      pllMs: mark.ollAt != null ? Math.max(0, (now()) - (mark.ollAt || mark.f2lAt || mark.crossAt || solveStartAt)) : null,
    } : null;
    record = {
      at: Date.now(),
      scramble: scrambleStr || '',
      free: mode === 'free',
      crossFace, crossColor,
      solveMs,
      moveCount: moves.length,
      solveMoves: moves.slice(-200),
      tps: solveMs != null && solveMs > 0 ? moves.length / (solveMs / 1000) : null,
      phases,
      xcross: phases ? (mark.xcross || (crossFace ? extendedCross(state, crossFace).kind : null)) : null,
      rotations,
      detours: 0,
      mistakes: 0,
      pllCase: null,
      ollCase: null,
      solved: true,
    };
    phase = 'done';
    emit();
  }

  function onSolveMove(move, state, allMoves) {
    if (crossFace === null) {
      const o = getOrientation() || {};
      crossFace = o.bottom || 'D';
      crossColor = state.cubies.find(c => c.id.length === 1 && c.stickers[crossFace] !== undefined)?.stickers[crossFace] || null;
      lastBottom = crossFace;
    } else {
      // Count whole-cube rotations: a change in which canonical face is on the
      // bottom between solving moves is a regrip/rotation. This is the proxy
      // the PLL lens uses to flag excessive looking-around.
      const o = getOrientation() || {};
      if (o.bottom && o.bottom !== lastBottom) { rotations++; lastBottom = o.bottom; }
    }
    const next = analyze(state, crossFace);
    // Cross completion: false -> true. Stamp the extended-cross kind at the
    // instant the cross finishes (an X-cross is a cross built with a pair).
    if (!prev?.crossDone && next.crossDone && mark.crossAt == null) {
      mark.crossAt = now();
      mark.xcross = extendedCross(state, crossFace).kind;
    }
    // F2L completion (4 pairs).
    if (next.f2lDone && mark.f2lAt == null) mark.f2lAt = now();
    // OLL completion (LL oriented).
    if (next.ollDone && mark.ollAt == null) mark.ollAt = now();
    prev = next;
    if (next.solved) { finishSolve(state, allMoves); return; }
    emit();
  }

  function onSnapshot(snap) {
    if (snap.phase === 'desynced') { phase = 'desynced'; emit(); return; }
    if (phase === 'desynced' || phase === 'done') return;
    if (snap.phase !== 'tracking') return;
    const move = snap.lastMove;
    if (!move) return;
    if (phase === 'applying') { onApplyMove(move, snap.state); return; }
    if (phase === 'solving') { onSolveMove(move, snap.state, snap.moves); }
  }

  const unsub = session?.subscribe(onSnapshot);

  return {
    startGuided, startFree, cancel,
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    getSnapshot: snapshot,
    detach() { unsub?.(); },
  };
}
