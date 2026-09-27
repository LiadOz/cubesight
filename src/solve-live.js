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
import { analyze, crossSolved, extendedCross, f2lPairSlots, pairSolved, solvedPairsPseudo, f2lDonePseudo } from './solve-tracker.js';
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
  let pseudo = false;            // pseudo-F2L (D-shift) detection, opt-in
  let lastBottom = null;
  let crossMoveCount = null;
  let crossAchieved = false;   // milestones — once reached, never regress
  let f2lAchieved = false;
  let ollAchieved = false;
  let maxPairs = 0;
  let liveMoveCount = 0;
  let prev = null;           // previous phase analysis during solving
  let progress = null;       // monotonic phase snapshot the UI renders
  let mark = {};             // { solveStartAt, crossAt, f2lAt, ollAt }
  let solveMoves = [];        // canonical solve moves
  let record = null;
  const listeners = new Set();

  const snapshot = () => ({
    mode, phase, scrambleStr, applyStep, applyTotal: scrambleMoves.length, applyDetour: [...applyDetour],
    solveMoves: [...solveMoves], solveMoveCount: liveMoveCount, elapsedMs: phase === 'solving' && solveStartAt ? Math.max(0, now() - solveStartAt) : null,
    crossFace, crossColor, rotations, crossMoveCount,
    progress, prev, record, done: phase === 'done',
  });

  function emit() { for (const l of listeners) l(snapshot()); }

  function resetSolve() {
    crossFace = null; crossColor = null; rotations = 0; lastBottom = null;
    crossMoveCount = null;
    crossAchieved = false; f2lAchieved = false; ollAchieved = false; maxPairs = 0; liveMoveCount = 0;
    prev = null; progress = null; mark = {}; solveMoves = []; record = null;
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
      crossMoveCount,
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
    liveMoveCount = Math.max(0, allMoves.length - solveStartIndex);
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
    // Milestones are monotonic: once the cross / F2L / OLL is reached it stays
    // reached, even if a later F2L insertion temporarily breaks a cross edge.
    // The displayed phase never regresses (the user expects “once the cross is
    // done, it’s done”); breakages surface as coach hindsight, not as a phase
    // step backwards.
    if (!crossAchieved && next.crossDone) {
      crossAchieved = true;
      mark.crossAt = now();
      mark.xcross = extendedCross(state, crossFace).kind;
      crossMoveCount = liveMoveCount;
    }
    // F2L pair progress. In pseudo mode, count pairs solved up to a
    // whole-D-layer rotation (the frame a pseudo-F2L user solves in).
    const pairCount = pseudo ? solvedPairsPseudo(state, crossFace).length : next.pairsSolved;
    if (crossAchieved && pairCount > maxPairs) maxPairs = pairCount;
    const f2lComplete = pseudo ? f2lDonePseudo(state, crossFace) : next.f2lDone;
    if (crossAchieved && !f2lAchieved && f2lComplete) { f2lAchieved = true; mark.f2lAt = now(); }
    if (f2lAchieved && !ollAchieved && next.ollDone) { ollAchieved = true; mark.ollAt = now(); }
    let label;
    if (next.solved) label = 'solved';
    else if (ollAchieved) label = 'pll';
    else if (f2lAchieved) label = 'oll';
    else if (crossAchieved) label = maxPairs > 0 ? `f2l-${maxPairs}` : 'cross';
    else label = 'pre-cross';
    progress = { phase: label, crossDone: crossAchieved, pairsSolved: maxPairs, f2lDone: f2lAchieved, ollDone: ollAchieved, solved: next.solved };
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
    setPseudo(value) { pseudo = Boolean(value); },
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    getSnapshot: snapshot,
    detach() { unsub?.(); },
  };
}
