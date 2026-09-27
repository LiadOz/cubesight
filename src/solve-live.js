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
import { analyze, crossSolved, extendedCross, f2lPairSlots, pairSolved, solvedPairsPseudo, f2lDonePseudo, eoSolved, coSolved } from './solve-tracker.js';
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
  let inspectSeconds = 15;
  let inspectionEnabled = true;
  let inspectionEndsAt = null;
  let inspectionTimer = null;
  let lastBottom = null;
  let crossMoveCount = null;
  let crossAchieved = false;   // milestones — once reached, never regress
  let f2lAchieved = false;
  let ollAchieved = false;
  let eoAchieved = false;      // OLL edges oriented (two-look: EO)
  let coAchieved = false;      // OLL corners oriented (two-look: CO)
  let maxPairs = 0;
  let liveMoveCount = 0;
  let lastProcessedLen = -1;   // dedup: only process a move when the history grows
  let prev = null;           // previous phase analysis during solving
  let progress = null;       // monotonic phase snapshot the UI renders
  let mark = {};             // { solveStartAt, crossAt, f2lAt, ollAt }
  let solveMoves = [];        // canonical solve moves
  let record = null;
  const listeners = new Set();

  const snapshot = () => ({
    mode, phase, scrambleStr, applyStep, applyTotal: scrambleMoves.length, applyDetour: [...applyDetour],
    solveMoves: [...solveMoves], solveMoveCount: liveMoveCount, elapsedMs: phase === 'solving' && solveStartAt ? Math.max(0, now() - solveStartAt) : null,
    inspection: phase === 'inspecting' ? { enabled: inspectionEnabled, remainingMs: inspectionEndsAt ? Math.max(0, inspectionEndsAt - now()) : null } : null,
    crossFace, crossColor, rotations, crossMoveCount,
    progress, prev, skip: progress?.skip ?? null, record, done: phase === 'done',
  });

  function emit() { for (const l of listeners) l(snapshot()); }

  function resetSolve() {
    crossFace = null; crossColor = null; rotations = 0; lastBottom = null;
    crossMoveCount = null;
    crossAchieved = false; f2lAchieved = false; ollAchieved = false; eoAchieved = false; coAchieved = false; maxPairs = 0; liveMoveCount = 0;
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
    lastProcessedLen = session.getSnapshot().moves.length;
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
    phase = 'inspecting';
    const snap = session.getSnapshot();
    solveStartIndex = snap.moves.length;
    lastProcessedLen = snap.moves.length;
    solveStartAt = null;              // the solve clock starts on the first move, not now
    if (detourGrace) { clearTimeout(detourGrace); detourGrace = null; }
    resetSolve();
    enterInspection();
    emit();
  }

  function cancel() {
    mode = null; phase = 'idle'; scrambleStr = null; scrambleMoves = [];
    scrambledState = null; applyStep = 0; applyDetour = [];
    lastProcessedLen = -1;
    if (inspectionTimer) { clearInterval(inspectionTimer); inspectionTimer = null; }
    if (detourGrace) { clearTimeout(detourGrace); detourGrace = null; }
    resetSolve();
    emit();
  }

  let detourGrace = null;        // brief delay before declaring a wrong turn off-plan (so a U2's two quarters coalesce)
  function onApplyMove(move, state) {
    // Plan states include the solved start at index 0, so `step` counts how many
    // scramble moves have been completed (matching Cross Scout's contract).
    const planStates = [SOLVED, ...scrambleMoves.map((_, i) => applyMoves(SOLVED, scrambleMoves.slice(0, i + 1)))];
    const result = followPlanTurn(planStates, applyStep, applyDetour, state, move);
    // Grace period before committing a wrong turn (CubeStation-style: a double turn's two
    // quarter events arrive back-to-back; declaring off-plan on the first would flash a false 'you're wrong'.
    // Instead, wait briefly for a potential coalescing second quarter that lands on a plan state.
    if (result.onPlan) {
      if (detourGrace) { clearTimeout(detourGrace); detourGrace = null; }
      applyStep = result.step;
      applyDetour = result.detour;
    } else if (!detourGrace) {
      // Start the grace only on the FIRST off-plan move; remember the step we were at so we can resume if a plan state is reached.
      const pendingStep = applyStep;
      detourGrace = setTimeout(() => {
        detourGrace = null;
        applyStep = result.step;
        applyDetour = result.detour;
        emit();
      }, 90);
    }
    if (sameCubeState(state, scrambledState)) {
      // Scramble fully applied — enter inspection (the solve clock starts on
      // the first solving move, not now).
      phase = 'inspecting';
      solveStartIndex = session.getSnapshot().moves.length;
      solveStartAt = null;
      resetSolve();
      enterInspection();
    }
    emit();
  }

  function enterInspection() {
    inspectionEndsAt = inspectionEnabled ? now() + inspectSeconds * 1000 : null;
    if (inspectionTimer) { clearInterval(inspectionTimer); inspectionTimer = null; }
    // Only tick in a browser; the Node unit tests use a frozen clock and a
    // live interval would keep the test process alive.
    if (inspectionEnabled && inspectionEndsAt != null && typeof window !== 'undefined') {
      inspectionTimer = setInterval(() => { if (phase === 'inspecting') emit(); else { clearInterval(inspectionTimer); inspectionTimer = null; } }, 250);
    }
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
    const prevOll = ollAchieved, prevEo = eoAchieved, prevCo = coAchieved, prevSolved = Boolean(prev && prev.solved), prevPairs = maxPairs;
    const next = analyze(state, crossFace);
    // Milestones are monotonic: once the cross / F2L / OLL is reached it stays
    // reached, even if a later F2L insertion temporarily breaks a cross edge.
    // The displayed phase never regresses (the user expects “once the cross is
    // done, it’s done”); breakages surface as coach hindsight, not as a phase
    // step backwards.
    // detect a SKIPPED phase (a milestone reached "for free"): a celebratory hurrah.
    //   • OLL skipped: OLL done as part of F2L (ollDone became true at the same move F2L finished, or was already true when F2L finished) — no dedicated OLL step.
    //   • PLL skipped: solved became true right after OLL (no dedicated PLL step).
    //   • F2L pair skipped: two pairs solved in one move (a pair fell in "for free").
    let skip = null;
    if (!prevEo && next.eoDone && f2lAchieved) skip = { kind: 'eo', label: 'EO skipped — edges oriented while solving F2L!' };
    else if (!prevCo && next.coDone && eoAchieved) skip = { kind: 'co', label: 'CO skipped — corners oriented right after EO!' };
    else if (!prevSolved && next.solved && eoAchieved && coAchieved) skip = { kind: 'pll', label: 'PLL skipped — solved straight after OLL (EO + CO)!' };
    else if (crossAchieved && (next.pairsSolved ?? 0) >= (prevPairs ?? 0) + 2) skip = { kind: 'f2l', label: `${(next.pairsSolved ?? 0) - (prevPairs ?? 0)} F2L pairs solved at once!` };
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
    if (f2lAchieved && !eoAchieved && next.eoDone) { eoAchieved = true; mark.eoAt = now(); }
    if (f2lAchieved && !coAchieved && next.coDone) { coAchieved = true; mark.coAt = now(); }
    if (eoAchieved && coAchieved && !ollAchieved) { ollAchieved = true; mark.ollAt = now(); }
    let label;
    if (next.solved) label = 'solved';
    else if (eoAchieved && coAchieved) label = 'pll';
    else if (coAchieved) label = 'co';
    else if (eoAchieved) label = 'co-pending';
    else if (f2lAchieved) label = 'eo';
    else if (crossAchieved) label = maxPairs > 0 ? `f2l-${maxPairs}` : 'cross';
    else label = 'pre-cross';
    progress = { phase: label, crossDone: crossAchieved, pairsSolved: maxPairs, f2lDone: f2lAchieved, eoDone: eoAchieved, coDone: coAchieved, ollDone: eoAchieved && coAchieved, solved: next.solved, skip };
    prev = next;
    if (next.solved) { finishSolve(state, allMoves); return; }
    emit();
  }

  function onSnapshot(snap) {
    if (snap.phase === 'desynced') { phase = 'desynced'; emit(); return; }
    if (phase === 'desynced' || phase === 'done') return;
    if (snap.phase !== 'tracking') return;
    // The session publishes a snapshot on every event (gyro/status too), so only
    // act on a genuinely new move (history grew) — otherwise a single wrong
    // turn during the scramble would balloon the recovery detour.
    if (snap.moves.length <= lastProcessedLen) return;
    lastProcessedLen = snap.moves.length;
    const move = snap.lastMove;
    if (!move) return;
    if (phase === 'applying') { onApplyMove(move, snap.state); return; }
    if (phase === 'inspecting') {
      // The first solving move starts the solve clock and ends inspection.
      phase = 'solving';
      solveStartAt = now();
      enterInspection(); // no-op to clear countdown state
      if (inspectionTimer) { clearInterval(inspectionTimer); inspectionTimer = null; }
      onSolveMove(move, snap.state, snap.moves);
      return;
    }
    if (phase === 'solving') { onSolveMove(move, snap.state, snap.moves); }
  }

  const unsub = session?.subscribe(onSnapshot);

  return {
    startGuided, startFree, cancel,
    setPseudo(value) { pseudo = Boolean(value); },
    setInspection({ enabled, seconds } = {}) {
      if (typeof enabled === 'boolean') inspectionEnabled = enabled;
      if (Number.isFinite(seconds)) inspectSeconds = Math.max(0, Math.min(60, seconds));
      if (phase === 'inspecting') enterInspection();
      emit();
    },
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    getSnapshot: snapshot,
    detach() { unsub?.(); },
  };
}
