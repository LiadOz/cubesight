// Live solve orchestration over the shared smart-cube session.
//
// Two flows share one solved-baseline-tracked session:
//   • guided: the user performs a generated scramble (cued move by move, with
//     off-plan recovery), then solves freely.
//   • free:   the user scrambles the cube themselves, taps “Start solving”,
//     then solves freely.
//
// During the solve we timestamp each canonical move, detect the cross
// (colour-neutral: the first face whose cross completes, the same inference the
// analysis module uses; never the held orientation), and emit phase transitions
// (cross → F2L pairs → OLL → PLL → solved) with split times. When the cube reaches solved we hand back a record for the metrics
// layer (solve-metrics.js) and the persistent store (solve-store.js).
//
// This module owns no cube-state math of its own — it reuses cross-cube.js for
// state and solve-tracker.js for phase analysis — so it can be driven by a fake
// session in tests.

import { applyMoves, sameCubeState, createSolvedState, OPPOSITE_FACE, parseScramble } from './cross-cube.js';
import { analyze, extendedCross, solvedPairsPseudo, f2lDonePseudo, crossFrame, currentDShift } from './solve-tracker.js';
import { createRotationTracker } from './rotation-tracker.js';
import { followPlanTurn } from './smart-cube-guidance.js';
import { logConnection } from './smart-cube-diag.js';
import { cubeClockModulus, cubeElapsedMs } from './cube-clock.js';
import { sameCornersAndEdges } from './facelets-state.js';

const SOLVED = createSolvedState();
const OFFSET_SUFFIX = ['', '', '2', "'"];   // the cross-layer turn that undoes a D-offset of k (as in solve-tracker.js)
const CROSS_FACES = ['D', 'U', 'F', 'B', 'R', 'L'];   // same order as analysis/normalize.js FACES
const EMPTY_ANALYSIS = Object.freeze({ crossDone: false, pairsSolved: 0, f2lDone: false, eoDone: false, coDone: false, solved: false });
// Phases in which a lost connection interrupts the attempt.
const ACTIVE_PHASES = new Set(['applying', 'inspecting', 'ready', 'solving']);
const isSolved = state => sameCubeState(state, SOLVED);

// Append a move event to a move list: a coalesced double (replaces: true)
// replaces the previous quarter instead of adding a second entry.
function pushMove(list, move, replaces) {
  return replaces && list.length ? [...list.slice(0, -1), move] : [...list, move];
}

// Inspection model (WCA 9f / A3a):
//   mode      'wca' (15 s) | 'custom' (`seconds`) | 'unlimited' (no limit, never
//             penalised) | 'off' (no inspection: phase 'ready', clock on first move)
//   overtime  what happens past the limit:
//             'wca'       first move after the limit +2, after limit + 2 s DNF
//             'count'     no penalty, overtimeMs is exposed
//             'grace'     after limit + graceSeconds apply gracePenalty
//             'autostart' the solve clock starts by itself at the limit
//   gracePenalty 'plus2' | 'dnf' | 'none';  callouts: WCA 8 s / 12 s calls.
export const DEFAULT_INSPECTION = Object.freeze({ mode: 'wca', seconds: 15, overtime: 'wca', graceSeconds: 2, gracePenalty: 'plus2', callouts: true });
const INSPECTION_MODES = ['wca', 'custom', 'unlimited', 'off'];
const OVERTIME_MODES = ['wca', 'count', 'grace', 'autostart'];
const GRACE_PENALTIES = { plus2: '+2', dnf: 'DNF', none: null };
const WCA_LIMIT_MS = 15000;
const WCA_DNF_AFTER_MS = 2000;
const clampSeconds = value => Math.max(0, Math.min(60, value));

// Merge a setInspection() argument into a config. Accepts the legacy
// { enabled, seconds } shape: enabled:false -> 'unlimited' (inspecting phase,
// no countdown, clock on the first move — the old behaviour), enabled:true ->
// keep a limited mode (default wca), seconds alone -> 'custom'.
export function normalizeInspection(input = {}, current = DEFAULT_INSPECTION) {
  const next = { ...current };
  const legacy = input.mode === undefined;
  if (legacy && typeof input.enabled === 'boolean') {
    if (!input.enabled) next.mode = 'unlimited';
    else if (next.mode === 'off' || next.mode === 'unlimited') next.mode = 'wca';
  }
  if (INSPECTION_MODES.includes(input.mode)) next.mode = input.mode;
  if (Number.isFinite(input.seconds)) {
    next.seconds = clampSeconds(input.seconds);
    if (legacy && input.enabled !== false && next.mode === 'wca' && next.seconds !== 15) next.mode = 'custom';
  }
  if (OVERTIME_MODES.includes(input.overtime)) next.overtime = input.overtime;
  if (Number.isFinite(input.graceSeconds)) next.graceSeconds = clampSeconds(input.graceSeconds);
  if (input.gracePenalty in GRACE_PENALTIES) next.gracePenalty = input.gracePenalty;
  if (typeof input.callouts === 'boolean') next.callouts = input.callouts;
  return next;
}

export function inspectionLimitMs(config) {
  if (config.mode === 'wca') return WCA_LIMIT_MS;
  if (config.mode === 'custom') return config.seconds * 1000;
  return null;
}

// Penalty for starting the solve `elapsedMs` into inspection.
export function inspectionPenalty(config, elapsedMs) {
  const limit = inspectionLimitMs(config);
  if (limit == null || elapsedMs <= limit) return null;
  const over = elapsedMs - limit;
  if (config.overtime === 'wca') return over <= WCA_DNF_AFTER_MS ? '+2' : 'DNF';
  if (config.overtime === 'grace') return over <= config.graceSeconds * 1000 ? null : GRACE_PENALTIES[config.gracePenalty] ?? null;
  return null;   // count, autostart
}

export function createSolveLive(session, { getOrientation = () => ({ bottom: 'D', front: 'F' }), now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
  let mode = null;            // 'guided' | 'free' | null
  let phase = 'idle';         // idle | applying | inspecting | ready (inspection off) | solving | interrupted | done | desynced
  let scrambleStr = null;
  let scrambleMoves = [];
  let planStates = [];
  let scrambledState = null;
  let applyStep = 0;
  let applyDetour = [];
  let applyBefore = null;      // { step, detour } before the last processed turn (for coalesced doubles)
  let scrambleTurns = [];      // turns the user made while scrambling (doubles coalesced)
  let solveStartAt = 0;
  let crossFace = null;
  let crossColor = null;
  let rotations = 0;
  let pseudo = false;            // pseudo-F2L (D-shift) detection, opt-in
  let inspection = { ...DEFAULT_INSPECTION };
  let inspectionStartAt = null;  // when the scramble was done (inspection began)
  let inspectionMs = null;       // inspection used before the solve clock started
  let penalty = null;            // null | '+2' | 'DNF' — fixed when the clock starts
  let inspectionTimer = null;
  const rotationTracker = createRotationTracker();
  let crossSeen = new Set();     // faces whose cross was complete after the previous move
  let crossMoveCount = null;
  let crossAchieved = false;   // milestones — once reached, never regress
  let f2lAchieved = false;
  let ollAchieved = false;
  let pllFrameAchieved = false; // LL solved in the offset frame while the cross layer is still turned
  let eoAchieved = false;      // OLL edges oriented (two-look: EO)
  let coAchieved = false;      // OLL corners oriented (two-look: CO)
  let maxPairs = 0;
  let pairsBeforeMove = 0;     // maxPairs before the current (possibly coalesced) turn
  // Dedup on the session's moveEvent.seq: every applied cube turn bumps it, so
  // gyro/battery/status snapshots (same seq) are ignored, and a new start
  // ignores whatever turn happened before it. moves.length is NOT usable: the
  // session history empties whenever the cube is solved.
  let lastSeq = 0;
  let lastEventMove = null;    // move of the last seen turn (the quarter a coalesced double extends)
  let prev = null;           // previous phase analysis during solving
  let progress = null;       // monotonic phase snapshot the UI renders
  let mark = {};             // { crossAt, f2lAt, eoAt, coAt, ollAt, *Idx: solve-move count when reached }
  let solveMoves = [];        // canonical solve moves (doubles coalesced)
  let record = null;
  // Connection loss (A1): the attempt is frozen in 'interrupted' (no running
  // clock) until the cube is back; then it resumes only if the cube's reported
  // state equals the tracked one. `onMismatch`: 'discard' (default) | 'dnf'.
  let interrupted = null;        // { from, at, elapsedMs, state, verified }
  let interruptions = 0;
  let interruptedMs = 0;
  let onMismatch = 'discard';
  let autoResume = true;
  let notice = null;             // why the last attempt ended without a result
  let flags = [];                // 'desync' | 'interrupted': the result is not clean
  let lastResyncSeq = 0;
  let lastMoveHostAt = null;
  // Hardware timing: the cube's own stamps of the first and last solving move.
  let hw = null;                 // { startTs, startEpoch, endTs, endEpoch, modulus }
  const listeners = new Set();

  function inspectionView() {
    const limitMs = inspectionLimitMs(inspection);
    const elapsedMs = Math.max(0, now() - inspectionStartAt);
    const limited = limitMs != null;
    return {
      mode: inspection.mode, overtime: inspection.overtime, enabled: true,
      limitMs, elapsedMs,
      remainingMs: limited ? Math.max(0, limitMs - elapsedMs) : null,
      overtimeMs: limited ? Math.max(0, elapsedMs - limitMs) : 0,
      penalty: inspectionPenalty(inspection, elapsedMs),
      callout: inspection.callouts && limited ? (elapsedMs >= 12000 ? 12 : elapsedMs >= 8000 ? 8 : null) : null,
    };
  }

  // Autostart: once the limit passes, the solve clock is running from the
  // limit instant (the first move does not restart it). Evaluated lazily so a
  // fake clock drives it in tests; the browser interval polls it.
  function maybeAutostart() {
    if (phase !== 'inspecting' || inspection.overtime !== 'autostart') return;
    const limitMs = inspectionLimitMs(inspection);
    if (limitMs == null || now() < inspectionStartAt + limitMs) return;
    phase = 'solving';
    solveStartAt = inspectionStartAt + limitMs;
    inspectionMs = limitMs;
    penalty = null;
    hw = null;                 // the clock started without a move: no cube stamp to time from
    stopInspectionTimer();
  }

  const snapshot = () => {
    maybeAutostart();
    return {
      mode, phase, scrambleStr, applyStep, applyTotal: scrambleMoves.length, applyDetour: [...applyDetour],
      scrambleTurns: [...scrambleTurns],
      solveMoves: [...solveMoves], solveMoveCount: solveMoves.length,
      elapsedMs: phase === 'solving' && solveStartAt != null ? Math.max(0, now() - solveStartAt) : phase === 'interrupted' ? interrupted?.elapsedMs ?? null : null,
      interrupted: interrupted ? { from: interrupted.from, at: interrupted.at, elapsedMs: interrupted.elapsedMs, canResume: interrupted.verified, policy: onMismatch, autoResume } : null,
      notice, flags: [...flags], interruptions,
      inspection: phase === 'inspecting' ? inspectionView() : null,
      inspectionConfig: { ...inspection },
      penalty, inspectionMs,
      crossFace, crossColor, rotations, rotationMarks: rotationTracker.marks, crossMoveCount,
      progress, prev, skip: progress?.skip ?? null, record, done: phase === 'done',
    };
  };

  function emit() { for (const l of listeners) l(snapshot()); }

  function resetSolve() {
    crossFace = null; crossColor = null; rotations = 0; rotationTracker.reset(); crossSeen = new Set();
    crossMoveCount = null;
    crossAchieved = false; f2lAchieved = false; ollAchieved = false; pllFrameAchieved = false; eoAchieved = false; coAchieved = false; maxPairs = 0; pairsBeforeMove = 0;
    prev = null; progress = null; mark = {}; solveMoves = []; record = null;
    solveStartAt = null; inspectionStartAt = null; inspectionMs = null; penalty = null;
    interrupted = null; interruptions = 0; interruptedMs = 0; flags = []; lastMoveHostAt = null; hw = null;
  }

  function stopInspectionTimer() {
    if (inspectionTimer) { clearInterval(inspectionTimer); inspectionTimer = null; }
  }

  // Start listening from the session's current turn: anything before now is
  // not part of this attempt.
  function syncSeq(snap) {
    lastSeq = snap.moveEvent?.seq ?? 0;
    lastEventMove = snap.moveEvent?.move ?? null;
    lastResyncSeq = snap.resync?.seq ?? 0;
  }

  // Guided scramble: cue the user through the scramble moves, recovering on a
  // wrong turn without discarding the attempt (same contract as Cross Scout).
  function startGuided(scramble) {
    if (!session || session.getSnapshot().phase !== 'tracking') {
      throw new Error('Sync a solved cube before starting a guided scramble.');
    }
    // Validate everything before touching any state.
    const text = String(scramble ?? '').trim();
    const rawMoves = text.replace(/[′’]/g, "'").split(/\s+/).filter(Boolean);
    if (rawMoves.length > 10_000) throw new Error('A guided setup can contain at most 10,000 moves.');
    const planMoves = [];
    for (let at = 0; at < rawMoves.length; at += 200) planMoves.push(...parseScramble(rawMoves.slice(at, at + 200).join(' ')));
    let target = SOLVED;
    const states = [SOLVED];
    for (const move of planMoves) { target = applyMoves(target, [move]); states.push(target); }
    const snap = session.getSnapshot();
    // The plan starts from solved; on a scrambled cube the cues would be wrong.
    if (!isSolved(snap.state)) throw new Error('Solve the cube (or sync) before starting a guided scramble.');
    stopInspectionTimer();
    notice = null;
    mode = 'guided';
    scrambleStr = text;
    scrambleMoves = planMoves;
    planStates = states;
    scrambledState = target;
    applyStep = 0; applyDetour = []; applyBefore = null; scrambleTurns = [];
    syncSeq(snap);
    resetSolve();
    phase = 'applying';
    emit();
  }

  // Free scramble: the user has already scrambled; solving starts now.
  function startFree() {
    if (!session || session.getSnapshot().phase !== 'tracking') {
      throw new Error('Sync a solved cube before starting a free solve.');
    }
    const snap = session.getSnapshot();
    if (isSolved(snap.state)) throw new Error('Scramble the cube first.');
    stopInspectionTimer();
    notice = null;
    mode = 'free';
    scrambleStr = null; scrambleMoves = []; planStates = []; scrambledState = snap.state;
    applyStep = 0; applyDetour = []; applyBefore = null;
    // The session history restarts at every solved state, so it is exactly the
    // user's scramble.
    scrambleTurns = [...snap.moves];
    syncSeq(snap);
    resetSolve();
    enterInspection();
    emit();
  }

  function cancel(reason = null) {
    notice = typeof reason === 'string' ? reason : null;
    mode = null; phase = 'idle'; scrambleStr = null; scrambleMoves = []; planStates = [];
    scrambledState = null; applyStep = 0; applyDetour = []; applyBefore = null; scrambleTurns = [];
    stopInspectionTimer();
    resetSolve();
    emit();
  }

  function onApplyMove(move, replaces, state) {
    // Plan states include the solved start at index 0, so `step` counts how many
    // scramble moves have been completed (matching Cross Scout's contract).
    // A coalesced double replaces the previous quarter: re-evaluate it from the
    // plan position before that quarter.
    const from = replaces && applyBefore ? applyBefore : { step: applyStep, detour: applyDetour };
    applyBefore = from;
    const result = followPlanTurn(planStates, from.step, from.detour, state, move);
    applyStep = result.step;
    applyDetour = result.detour;
    scrambleTurns = pushMove(scrambleTurns, move, replaces);
    if (sameCubeState(state, scrambledState)) {
      // Scramble fully applied — enter inspection (the solve clock starts on
      // the first solving move, not now).
      resetSolve();
      enterInspection();
    }
    emit();
  }

  // Scramble done: wait for the first solving move, inspecting unless off.
  function enterInspection() {
    phase = inspection.mode === 'off' ? 'ready' : 'inspecting';
    inspectionStartAt = now();
    startInspectionTimer();
  }

  function startInspectionTimer() {
    stopInspectionTimer();
    // Only tick in a browser; the Node unit tests use a fake clock and a
    // live interval would keep the test process alive.
    if (phase === 'inspecting' && typeof window !== 'undefined') {
      inspectionTimer = setInterval(() => { if (phase === 'inspecting') emit(); else stopInspectionTimer(); }, 250);
    }
  }

  // Official time: the cube's hardware stamps of the first and last solving
  // move when they are usable (same connection, plausible against the host
  // clock, attempt never interrupted or desynced), else the host clock.
  // `endAt` overrides the host end (a result found after the fact).
  function finishSolve(state, { endAt = null, dnf = null } = {}) {
    const endHost = endAt ?? now();
    const hostMs = solveStartAt != null ? Math.max(0, endHost - solveStartAt) : null;
    const clean = !flags.length && !interruptions;
    const hardwareMs = hw && clean && !dnf && hostMs != null && hw.startEpoch === hw.endEpoch
      ? cubeElapsedMs(hw.startTs, hw.endTs, hostMs, hw.modulus) : null;
    const solveMs = hardwareMs ?? hostMs;
    const moves = [...solveMoves];
    // Milestone offsets from the solve start, on the same clock as solveMs.
    const offset = name => {
      const at = mark[`${name}At`];
      if (at == null) return null;
      const host = Math.max(0, at - solveStartAt);
      if (hardwareMs == null) return host;
      return cubeElapsedMs(hw.startTs, mark[`${name}Ts`], host, hw.modulus) ?? host;
    };
    const cross = offset('cross'), f2l = offset('f2l'), oll = offset('oll'), pllDone = offset('pll');
    const phases = cross != null ? {
      crossMs: Math.max(0, cross),
      f2lMs: f2l != null ? Math.max(0, f2l - cross) : null,
      ollMs: oll != null ? Math.max(0, oll - (f2l ?? cross)) : null,
      pllMs: oll != null ? Math.max(0, (pllDone ?? solveMs) - oll) : null,
    } : null;
    record = {
      at: Date.now(),
      scramble: scrambleStr || '',
      scrambleTurns: [...scrambleTurns],
      free: mode === 'free',
      crossFace, crossColor,
      solveMs,                 // official: cube hardware time when available, else host time
      hostSolveMs: hostMs,     // always the host clock (what the running clock showed)
      timing: hardwareMs != null ? 'cube' : 'host',
      penalty: dnf ? 'DNF' : penalty,   // null | '+2' | 'DNF' (solveMs stays the raw clock time)
      inspectionMs,
      inspectionMode: inspection.mode,
      moveCount: moves.length,
      solveMoves: moves,
      tps: solveMs != null && solveMs > 0 ? moves.length / (solveMs / 1000) : null,
      phases,
      xcross: phases ? (mark.xcross || (crossFace ? extendedCross(state, crossFace).kind : null)) : null,
      crossMoveCount,
      dFixMs: pllDone != null ? Math.max(0, solveMs - pllDone) : null,   // pseudo: time from PLL (in the offset frame) to the cube being solved
      rotations,
      rotationMarks: rotationTracker.marks,
      detours: 0,
      mistakes: 0,
      pllCase: null,
      ollCase: null,
      solved: !dnf,
      flags: dnf ? [...flags, dnf] : [...flags],
      interruptions: { count: interruptions, ms: interruptedMs },
    };
    phase = 'done';
    interrupted = null;
    emit();
  }

  // Solved up to one turn of the last-layer face (an AUF away).
  function solvedUpToAuf(state, face) {
    const ll = OPPOSITE_FACE[face];
    return [ll, `${ll}2`, `${ll}'`].some(turn => isSolved(applyMoves(state, [turn])));
  }

  // Solved in the solver's own frame: up to an AUF and (pseudo) up to the
  // cross-layer offset the solver has not undone yet. The final cross-layer
  // turn that resolves the offset (the "D fix") is not part of any stage.
  function solvedInFrame(state, face) {
    const k = currentDShift(state, face);
    if (k === null) return false;
    const base = k ? applyMoves(state, [`${face}${OFFSET_SUFFIX[k]}`]) : state;
    return isSolved(base) || solvedUpToAuf(base, face);
  }

  // The cross face is the first face whose cross completes (any D-offset), with
  // ties broken by more solved pairs, then the held bottom, then face order:
  // the same inference as analysis/normalize.js inferCrossFace. Returns null
  // until a cross exists.
  function pickCrossFace(state, heldBottom) {
    const done = [];
    for (const face of CROSS_FACES) {
      const frame = crossFrame(state, face);
      if (frame.shift !== null && (pseudo || frame.shift === 0)) done.push({ face, pairs: frame.pairs.length });
    }
    const fresh = done.filter(e => !crossSeen.has(e.face));
    crossSeen = new Set(done.map(e => e.face));
    if (!fresh.length) return null;
    fresh.sort((a, b) => b.pairs - a.pairs || (b.face === heldBottom) - (a.face === heldBottom) || CROSS_FACES.indexOf(a.face) - CROSS_FACES.indexOf(b.face));
    return fresh[0].face;
  }

  function onSolveMove(move, replaces, state, event = null) {
    lastMoveHostAt = now();
    if (hw && event) { hw.endTs = event.cubeTimestamp ?? null; hw.endEpoch = event.epoch ?? null; }
    const ts = event?.cubeTimestamp ?? null;
    // A coalesced double replaces the previous quarter: same move count, and
    // the regrip/rotation check already ran for that quarter.
    if (!replaces || !solveMoves.length) pairsBeforeMove = maxPairs;
    const coalesced = replaces && solveMoves.length > 0;
    solveMoves = pushMove(solveMoves, move, coalesced);
    const count = solveMoves.length;
    logConnection({ kind: 'debug', label: `[live] onSolveMove move=${move} replaces=${replaces} count=${count} crossFace=${crossFace ?? '-'}` });
    const orient = (!coalesced || crossFace === null) ? (getOrientation() || {}) : null;
    let lockedNow = false;
    if (crossFace === null) {
      const face = pickCrossFace(state, orient?.bottom);
      if (face) {
        crossFace = face;
        crossColor = state.cubies.find(c => c.id.length === 1 && c.stickers[crossFace] !== undefined)?.stickers[crossFace] || null;
        lockedNow = true;
      }
    }
    // Whole-cube rotations: only a stable, persistent change of the held
    // orientation counts (see rotation-tracker.js); a read on the intermediate
    // quarter of a coalesced double is mid-turn and ignored.
    if (orient && !coalesced) {
      const tMs = Math.max(0, now() - solveStartAt);
      if (rotationTracker.observe(orient, { at: tMs, idx: count })) rotations = rotationTracker.count;
    }
    const next = crossFace ? analyze(state, crossFace, { pseudo }) : EMPTY_ANALYSIS;
    // Milestones are monotonic: once the cross / F2L / OLL is reached it stays
    // reached, even if a later F2L insertion temporarily breaks a cross edge.
    // The displayed phase never regresses (the user expects “once the cross is
    // done, it’s done”); breakages surface as coach hindsight, not as a phase
    // step backwards. Each milestone remembers the solve-move count at which it
    // was reached (a coalesced double keeps the count of its first quarter).
    if (!crossAchieved && crossFace && (next.crossDone || lockedNow)) {
      crossAchieved = true;
      mark.crossAt = now(); mark.crossTs = ts; mark.crossIdx = count;
      mark.xcross = extendedCross(state, crossFace).kind;
      crossMoveCount = count;
    }
    // F2L pair progress. In pseudo mode, count pairs solved up to a
    // whole-D-layer rotation (the frame a pseudo-F2L user solves in).
    const pairCount = !crossFace ? 0 : pseudo ? solvedPairsPseudo(state, crossFace).length : next.pairsSolved;
    if (crossAchieved && pairCount > maxPairs) maxPairs = pairCount;
    const f2lComplete = !crossFace ? false : pseudo ? f2lDonePseudo(state, crossFace) : next.f2lDone;
    if (crossAchieved && !f2lAchieved && f2lComplete) { f2lAchieved = true; mark.f2lAt = now(); mark.f2lTs = ts; mark.f2lIdx = count; }
    if (f2lAchieved && !eoAchieved && next.eoDone) { eoAchieved = true; mark.eoAt = now(); mark.eoIdx = count; }
    if (f2lAchieved && !coAchieved && next.coDone) { coAchieved = true; mark.coAt = now(); mark.coIdx = count; }
    if (eoAchieved && coAchieved && !ollAchieved) { ollAchieved = true; mark.ollAt = now(); mark.ollTs = ts; mark.ollIdx = count; }
    // A SKIPPED phase is a milestone reached on the very move that completed
    // the previous milestone (no dedicated step for it): a celebratory hurrah.
    //   • PLL skipped: solved (or an AUF away) on the move OLL completed.
    //   • OLL skipped: EO + CO done on the move F2L completed.
    //   • EO skipped: edges oriented on the move F2L completed (corners not).
    //   • CO skipped: corners oriented on the move EO completed (after F2L).
    //   • F2L pairs: two or more pairs solved in one move after the cross (an
    //     X-cross is reported through record.xcross instead).
    const on = idx => idx === count;
    let skip = null;
    // Skips only count for milestones reached after the cross lock: a lock that
    // arrives mid-solve with everything done at once is not a skip. (A cross
    // that was already built before the first move locks on move 1 and keeps
    // the same-move rules: that is where a genuine skip shows.)
    const llSolved = !crossFace ? false : pseudo ? solvedInFrame(state, crossFace) : (next.solved || solvedUpToAuf(state, crossFace));
    // Pseudo: the last layer solved while the cross layer is still offset. PLL is
    // credited here; the D fix (and AUF) that finish the cube are its own tail.
    if (pseudo && ollAchieved && !pllFrameAchieved && llSolved && !next.solved && currentDShift(state, crossFace) !== 0) {
      pllFrameAchieved = true; mark.pllAt = now(); mark.pllTs = ts; mark.pllIdx = count;
    }
    if (lockedNow && count > 1) skip = null;
    else if (on(mark.ollIdx) && llSolved) {
      skip = on(mark.f2lIdx)
        ? { kind: 'pll', label: 'LL skip!' }
        : { kind: 'pll', label: 'PLL skip!' };
    } else if (on(mark.ollIdx) && on(mark.f2lIdx)) skip = { kind: 'oll', label: 'OLL skip!' };
    else if (on(mark.eoIdx) && on(mark.f2lIdx)) skip = { kind: 'eo', label: 'EO skip!' };
    else if (on(mark.coIdx) && on(mark.eoIdx) && !on(mark.f2lIdx)) skip = { kind: 'co', label: 'CO skip!' };
    else if (crossAchieved && mark.crossIdx < count && maxPairs >= pairsBeforeMove + 2) skip = { kind: 'f2l', label: `${maxPairs - pairsBeforeMove} pairs at once!` };
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
    if (next.solved) { finishSolve(state); return; }
    emit();
  }

  function startSolving(event = null) {
    // The first solving move starts the solve clock and ends inspection; the
    // inspection penalty is fixed now.
    const t = now();
    if (phase === 'inspecting') {
      inspectionMs = Math.max(0, t - inspectionStartAt);
      penalty = inspectionPenalty(inspection, inspectionMs);
    }
    phase = 'solving';
    solveStartAt = t;
    const cubeTs = event?.cubeTimestamp ?? null;
    hw = cubeTs == null ? null : { startTs: cubeTs, startEpoch: event.epoch ?? null, endTs: cubeTs, endEpoch: event.epoch ?? null, modulus: cubeClockModulus(session?.getSnapshot().protocol) };
    stopInspectionTimer();
  }

  // --- Connection loss ------------------------------------------------------------------

  function interrupt(snap) {
    maybeAutostart();
    const t = now();
    interrupted = {
      from: phase, at: t, state: snap.state, verified: false,
      elapsedMs: phase === 'solving' && solveStartAt != null ? Math.max(0, t - solveStartAt) : null,
    };
    phase = 'interrupted';
    stopInspectionTimer();
    logConnection({ kind: 'warn', label: /* copy-ok: protocol diagnostic shown in developer log */ `[live] INTERRUPTED from ${interrupted.from}: connection lost` });
    emit();
  }

  // The cube is tracked again after an interruption: continue only if it is in
  // exactly the position it was left in. Anything else is never continued.
  function onCubeBack(snap) {
    if (!interrupted) return;
    if (sameCornersAndEdges(snap.state, interrupted.state)) {
      interrupted.verified = true;
      if (autoResume) resume(); else emit();
      return;
    }
    if (onMismatch === 'dnf' && interrupted.from === 'solving') {
      finishSolve(snap.state, { endAt: interrupted.at, dnf: 'disconnect' });
      return;
    }
    cancel('Solve stopped. The cube changed while disconnected.');
  }

  function resume() {
    if (phase !== 'interrupted' || !interrupted?.verified) return false;
    const gone = Math.max(0, now() - interrupted.at);
    interruptions++; interruptedMs += gone;
    phase = interrupted.from;
    interrupted = null;
    if (!flags.includes('interrupted')) flags.push('interrupted');
    if (session) syncSeq(session.getSnapshot());
    if (phase === 'inspecting') startInspectionTimer();
    logConnection({ kind: 'debug', label: `[live] resumed ${phase} after ${gone}ms` });
    emit();
    return true;
  }

  // The session replaced its tracked state with the cube's own report (packets
  // were missed). Inside a solve that makes the result untrustworthy.
  function onResync(snap) {
    if (phase === 'solving') {
      if (!flags.includes('desync')) flags.push('desync');
      if (isSolved(snap.state)) finishSolve(snap.state, { endAt: lastMoveHostAt });
      else emit();
    } else if (phase === 'inspecting' || phase === 'ready') {
      scrambledState = snap.state;
      if (isSolved(snap.state)) cancel('Solve stopped because the cube is solved.'); else emit();
    } else if (phase === 'applying') {
      cancel('Scramble stopped because the cube state changed.');
    }
  }

  function onSnapshot(snap) {
    if (snap.phase === 'desynced') {
      if (phase !== 'idle' && phase !== 'done' && phase !== 'desynced') {
        phase = 'desynced'; stopInspectionTimer(); interrupted = null;
        logConnection({ kind: 'error', label: /* copy-ok: protocol diagnostic shown in developer log */ '[live] onSnapshot DESYNC phase=desynced' });
        emit();
      }
      return;
    }
    if (snap.phase === 'disconnected') {
      // A dropped (or closed) connection must never leave a clock running.
      if (ACTIVE_PHASES.has(phase)) interrupt(snap);
      return;
    }
    if (snap.phase !== 'tracking') return;
    if (phase === 'interrupted') { onCubeBack(snap); return; }
    const resyncSeq = snap.resync?.seq ?? 0;
    if (resyncSeq > lastResyncSeq) {
      lastResyncSeq = resyncSeq;
      if (ACTIVE_PHASES.has(phase)) onResync(snap);
    }
    const event = snap.moveEvent;
    if (!event || event.seq <= lastSeq) return;   // no new turn (gyro, battery, status, re-sync)
    lastSeq = event.seq;
    const quarter = lastEventMove;                 // the quarter a coalesced double extends
    lastEventMove = event.move;
    if (phase === 'idle' || phase === 'done' || phase === 'desynced') return;
    maybeAutostart();
    const { move, replaces } = event;
    logConnection({ kind: 'debug', label: `[live] onSnapshot phase=${phase} seq=${event.seq} move=${move} replaces=${replaces}` });
    if (phase === 'applying') { onApplyMove(move, replaces, snap.state); return; }
    if (phase === 'inspecting' || phase === 'ready') {
      // The snapshot state is authoritative: a double that leaves the cube
      // scrambled is not a solving move.
      if (replaces && scrambledState && sameCubeState(snap.state, scrambledState)) return;
      startSolving(event);
    }
    if (phase !== 'solving') return;
    if (replaces && !solveMoves.length) {
      // The first solving quarter was coalesced with the last scramble quarter
      // (e.g. scramble ends in B', the user turns B' again quickly: "B2"). The
      // scramble part is already accounted for, so the solve starts with the
      // extra quarter alone. event.turn is the physical quarter just applied;
      // fall back to the previous event's quarter (a double is two identical
      // quarters).
      const extra = event.turn || (quarter && !quarter.endsWith('2') ? quarter : move);
      onSolveMove(extra, false, snap.state, event);
      return;
    }
    onSolveMove(move, replaces, snap.state, event);
  }

  const unsub = session?.subscribe(onSnapshot);

  return {
    startGuided, startFree, cancel,
    // resume() continues an interrupted attempt once the cube is back in the
    // same position; setInterruptPolicy({ onMismatch: 'discard' | 'dnf', autoResume }).
    resume,
    setInterruptPolicy(config = {}) {
      if (config.onMismatch === 'discard' || config.onMismatch === 'dnf') onMismatch = config.onMismatch;
      if (typeof config.autoResume === 'boolean') autoResume = config.autoResume;
      emit();
    },
    setPseudo(value) { pseudo = Boolean(value); },
    // setInspection(config) — see DEFAULT_INSPECTION. The legacy
    // { enabled, seconds } shape is still accepted (normalizeInspection).
    // Changing it while waiting keeps the inspection start time.
    setInspection(config = {}) {
      inspection = normalizeInspection(config, inspection);
      if (phase === 'inspecting' || phase === 'ready') {
        phase = inspection.mode === 'off' ? 'ready' : 'inspecting';
        startInspectionTimer();
      }
      emit();
    },
    getInspection: () => ({ ...inspection }),
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    getSnapshot: snapshot,
    detach() { unsub?.(); },
  };
}
