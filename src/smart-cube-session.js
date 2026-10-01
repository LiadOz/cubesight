import { applyMoves, createSolvedState, FACE_COLORS, parseScramble } from './cross-cube.js';
import { logConnection } from './smart-cube-diag.js';
import { sameCornersAndEdges, stateFromFacelets } from './facelets-state.js';
import { MSG } from './copy/terms.js';

const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const solvedState = () => createSolvedState();
const DOUBLE_TURN_WINDOW = 50; // cube-tick gap below which two same-face same-direction quarters are one physical double turn
const QUIET_MS = 400;          // no cube turn for this long before a facelet report is trusted to match the tracked state
const IDLE_CHECK_QUIET_MS = 2000;
const isSolvedState = state => state.cubies.every(cubie =>
  Object.entries(cubie.stickers).every(([face, color]) => FACE_COLORS[face] === color));
const defaultSchedule = (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); };

/** What the app runs with (smart-cube-bluetooth.js and the headless replay both use this). */
export const APP_SESSION_OPTIONS = Object.freeze({
  periodicCheckMs: 20000,
  autoReconnect: Object.freeze({ delaysMs: Object.freeze([1000, 2000, 4000, 8000, 15000]) }),
});

const LINK_NONE = Object.freeze({ status: 'none' });

/**
 * Device-neutral cube stream for trainers. A connection adapter supplies
 * connect({ onStatus, reconnect, gesture }) and emits MOVE/FACELETS/GYRO/DISCONNECT.
 * Only a verified solved baseline starts the move history used by solvers.
 *
 * Robustness (see docs/ideas/FEATURES.md A1/A6):
 *   - an unexpected drop keeps the tracked position and (with `autoReconnect`)
 *     retries with backoff; on reconnect the cube's facelets are compared with
 *     the tracked state instead of demanding a solved cube;
 *   - dropped packets (serial gaps, library-recovered moves) and a periodic
 *     idle check trigger a facelet comparison; a disagreement that survives a
 *     second, quiet report re-baselines the tracked state (snapshot.resync).
 * Options: `now` (ms clock, the recorder's in the app), `schedule(fn, ms)` ->
 * cancel (virtual time in headless replays), `periodicCheckMs` (0 = off),
 * `autoReconnect: { delaysMs }` (null = off).
 */
export function createSmartCubeSession(connectDevice, { now = () => Date.now(), schedule = defaultSchedule, periodicCheckMs = 0, autoReconnect = null } = {}) {
  const listeners = new Set();
  const eventListeners = new Set();
  let connection = null;
  let subscription = null;
  let generation = 0;
  let epoch = 0;              // physical connection counter: cube clocks only compare within one
  let faceletsRequest = null;
  let lastCoalesce = null;
  let lastSerial = null;
  let lastMoveAt = -Infinity;
  let lastCheckAt = -Infinity;
  let needCheck = false;      // a gap was seen: verify once the cube is quiet
  let suspect = null;         // first disagreeing facelet report: { moveAt }
  let cancelRecheck = null;
  let resumeCtx = null;       // tracked position kept across an unexpected drop
  let cancelRetry = null;
  let retryAttempt = 0;
  let reconnectSeq = 0;
  let resyncSeq = 0;
  let gaps = 0;
  let snapshot = {
    phase: 'disconnected', detail: 'Connect a smart cube to mirror its turns.',
    deviceName: '', protocol: '', battery: null, facelets: null, gyro: null,
    state: solvedState(), moves: [], lastMove: null,
    // Every applied cube turn bumps moveEvent.seq. Consumers must key on seq,
    // not on moves.length: the history empties whenever the cube is solved, and
    // a coalesced double replaces the previous quarter (replaces: true) instead
    // of appending. `turn` is the physical turn just applied (the second quarter
    // of a double), for animating the mirror. The cube's own stamps ride along
    // (cubeTimestamp / localTimestamp / serial / epoch; startCubeTimestamp is the
    // first quarter of a coalesced double) so official times can come from the
    // cube's hardware clock.
    moveEvent: null,
    // Connection health: { status: 'none'|'up'|'lost'|'reconnecting', attempt,
    // maxAttempts, retryAt, needsGesture, reason }.
    link: LINK_NONE,
    // Bumped when the tracked state was replaced by the cube's own report
    // (missed packets), and when a reconnect finished verifying: { seq, match, at }.
    resync: null, reconnectEvent: null,
    // Facelet-check health: { status: 'unchecked'|'ok'|'suspect'|'rebaselined', gaps, checkedAt }.
    sync: { status: 'unchecked', gaps: 0, checkedAt: null },
  };
  let moveSeq = 0;

  function publish(changes) {
    snapshot = { ...snapshot, ...changes };
    if (typeof document !== 'undefined') document.documentElement.dataset.cubePhase = snapshot.phase;
    for (const listener of listeners) {
      // A failing consumer (UI mirror, live tracker) must not be mistaken for a
      // bad cube move: the cube state above is already correct. Report it loudly.
      try { listener(snapshot); } catch (error) {
        logConnection({ kind: 'error', label: `[session] listener threw during phase=${snapshot.phase} lastMove=${snapshot.lastMove}: ${error?.stack || error}` });
        if (typeof console !== 'undefined') console.error('[session] listener threw', error);
      }
    }
  }

  function establishSolvedBaseline() {
    lastCoalesce = null;
    suspect = null; needCheck = false;
    publish({ phase: 'tracking', detail: 'Cube synced. Turn it, then find plans.', state: solvedState(), moves: [], lastMove: null });
  }

  function endFaceletsRequest(error, facelets) {
    if (!faceletsRequest) return;
    const request = faceletsRequest;
    faceletsRequest = null;
    clearTimeout(request.timer);
    if (error) request.reject(error);
    else request.resolve(facelets);
  }

  // --- Desync detection ---------------------------------------------------------------------

  function requestCheck(reason) {
    if (!connection || !connection.capabilities?.facelets || snapshot.phase !== 'tracking' || faceletsRequest) return;
    lastCheckAt = now();
    logConnection({ kind: 'debug', label: `[session] facelet check (${reason})` });
    Promise.resolve(connection.sendCommand({ type: 'REQUEST_FACELETS' })).catch(() => {});
  }

  function scheduleRecheck() {
    cancelRecheck?.();
    cancelRecheck = schedule(() => { cancelRecheck = null; requestCheck('recheck'); }, QUIET_MS + 100);
  }

  function setSync(status) {
    if (snapshot.sync.status === status && snapshot.sync.gaps === gaps) return;
    publish({ sync: { status, gaps, checkedAt: now() } });
  }

  // A facelet report while tracking. Reports are only conclusive when the cube
  // has been still for QUIET_MS (a move still in flight would look like a
  // mismatch); a disagreement must repeat, with no turn in between, before the
  // tracked state is replaced (a single odd report never moves it).
  function verifyFacelets(facelets) {
    if (now() - lastMoveAt < QUIET_MS) { if (suspect || needCheck) scheduleRecheck(); return; }
    const reported = stateFromFacelets(facelets);
    if (!reported) { logConnection({ kind: 'error', label: `[session] facelet report is not a valid cube: ${String(facelets).slice(0, 60)}` }); return; }
    needCheck = false;
    if (sameCornersAndEdges(reported, snapshot.state)) { suspect = null; setSync('ok'); return; }
    if (!suspect || suspect.moveAt !== lastMoveAt) {
      suspect = { moveAt: lastMoveAt };
      setSync('suspect');
      scheduleRecheck();
      return;
    }
    suspect = null; lastCoalesce = null;
    logConnection({ kind: 'warn', label: '[session] tracked state disagrees with the cube; re-baselined from its facelets' });
    publish({
      state: reported, moves: [], lastMove: null, detail: 'The cube state was re-read after a missed move.',
      resync: { seq: ++resyncSeq, reason: 'facelet-mismatch', at: now() },
      sync: { status: 'rebaselined', gaps, checkedAt: now() },
    });
  }

  // --- Events -------------------------------------------------------------------------------

  function onEvent(event) {
    // Keep protocol observations separate from the trusted solved-baseline
    // state. The Studio can inspect turns even before tracking is established.
    const observation = {
      type: event.type,
      receivedAt: Date.now(),
      ...(event.type === 'MOVE' ? {
        move: String(event.move || ''),
        face: Number.isInteger(event.face) ? event.face : null,
        direction: Number.isInteger(event.direction) ? event.direction : null,
        serial: Number.isInteger(event.serial) ? event.serial : null,
        cubeTimestamp: Number.isFinite(event.cubeTimestamp) ? event.cubeTimestamp : null,
        localTimestamp: Number.isFinite(event.localTimestamp) ? event.localTimestamp : null,
      } : {}),
      ...(event.type === 'GYRO' ? { quaternion: event.quaternion } : {}),
      ...(event.type === 'FACELETS' ? { facelets: event.facelets } : {}),
      ...(event.type === 'BATTERY' ? { batteryLevel: event.batteryLevel } : {}),
    };
    for (const listener of eventListeners) {
      try { listener(observation); } catch { /* A diagnostic consumer must not stop tracking. */ }
    }
    if (event.type !== 'DISCONNECT' && event.type !== 'MOVE' && snapshot.phase === 'tracking'
        && periodicCheckMs > 0 && now() - lastCheckAt >= periodicCheckMs && now() - lastMoveAt >= IDLE_CHECK_QUIET_MS) {
      requestCheck('idle');
    }
    if (event.type === 'FACELETS') {
      publish({ facelets: event.facelets });
      endFaceletsRequest(null, event.facelets);
      if (snapshot.phase === 'awaiting-solved') {
        if (resumeCtx) finishResume(event.facelets);
        else if (event.facelets === SOLVED_FACELETS) establishSolvedBaseline();
        else publish({ detail: MSG.syncFirst });
      } else if (snapshot.phase === 'tracking') verifyFacelets(event.facelets);
    } else if (event.type === 'MOVE' && snapshot.phase === 'tracking') {
      logConnection({ kind: 'debug', label: `[session] MOVE event.move=${JSON.stringify(event.move)} phase=${snapshot.phase} moves.len=${snapshot.moves.length}` });
      // Only parsing and applying the move can desync; listener failures are
      // handled (and reported) by publish().
      let move, state;
      try {
        // Accept wide/slice moves (Uw, M, ...) as single moves instead of desyncing.
        const parsed = parseScramble(event.move, { allowWide: true });
        if (parsed.length !== 1) throw new Error('Invalid move');
        [move] = parsed;
        state = applyMoves(snapshot.state, [move]);
      } catch (error) {
        logConnection({ kind: 'error', label: /* copy-ok: protocol diagnostic shown in developer log */ `[session] MOVE DESYNC move=${JSON.stringify(event.move)} phase=${snapshot.phase} error=${error.message}` });
        publish({ phase: 'desynced', detail: `Unsupported move from cube: ${String(event.move).slice(0, 20)}. ${MSG.syncFirst}` });
        return;
      }
      const face = move.replace(/'|2$/g, '');
      const prime = move.endsWith("'");
      const quarterTurn = !move.endsWith('2');
      const cubeTs = Number.isFinite(event.cubeTimestamp) ? event.cubeTimestamp : null;
      const serial = Number.isInteger(event.serial) ? event.serial : null;
      const localTs = Number.isFinite(event.localTimestamp) ? event.localTimestamp : null;
      // Dropped packets: GAN serials are sequential mod 256, and the library
      // marks moves it had to recover from the cube's history with a null local
      // timestamp. Either way the cube's own report settles whether we agree.
      let gap = event.localTimestamp === null;
      if (serial !== null) {
        if (lastSerial !== null && serial !== ((lastSerial + 1) & 0xFF)) gap = true;
        lastSerial = serial;
      }
      lastMoveAt = now();
      if (gap) {
        gaps++; needCheck = true;
        snapshot = { ...snapshot, sync: { ...snapshot.sync, gaps } };
        logConnection({ kind: 'warn', label: `[session] dropped packet suspected at serial ${serial ?? '?'}; checking the cube state` });
        scheduleRecheck();
      }
      const stamps = { cubeTimestamp: cubeTs, localTimestamp: localTs, serial, epoch };
      // Double-turn coalescing: the GAN protocol emits a double (U2) as two
      // quarter-turn MOVE events with a tiny cube-tick gap. Merge the second
      // quarter into the first as one "U2" so it counts as one move, TPS isn't
      // inflated, and a guided scramble doesn't briefly go off-plan.
      // U' U' is also a U2 (there is no "U2'" in the notation).
      const last = snapshot.moves[snapshot.moves.length - 1];
      if (quarterTurn && lastCoalesce && lastCoalesce.face === face && lastCoalesce.prime === prime
          && last === move && cubeTs !== null && lastCoalesce.cubeTs !== null
          && cubeTs >= lastCoalesce.cubeTs && cubeTs - lastCoalesce.cubeTs <= DOUBLE_TURN_WINDOW) {
        const double = `${face}2`;
        const startCubeTimestamp = lastCoalesce.cubeTs;
        lastCoalesce = null;
        publish({ state, moves: isSolvedState(state) ? [] : [...snapshot.moves.slice(0, -1), double], lastMove: double, moveEvent: { seq: ++moveSeq, move: double, turn: move, replaces: true, ...stamps, startCubeTimestamp }, detail: 'Live cube updated.' });
      } else {
        lastCoalesce = quarterTurn ? { face, prime, cubeTs } : null;
        publish({ state, moves: isSolvedState(state) ? [] : [...snapshot.moves, move], lastMove: move, moveEvent: { seq: ++moveSeq, move, turn: move, replaces: false, ...stamps, startCubeTimestamp: cubeTs }, detail: 'Live cube updated. Find plans when ready.' });
      }
    } else if (event.type === 'BATTERY') {
      publish({ battery: event.batteryLevel });
    } else if (event.type === 'GYRO') {
      const q = event.quaternion;
      if (q && [q.x, q.y, q.z, q.w].every(Number.isFinite)
        && q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w > 0.0001) {
        publish({ gyro: { x: q.x, y: q.y, z: q.z, w: q.w } });
      }
    } else if (event.type === 'DISCONNECT') {
      handleDrop();
    }
  }

  // --- Connection lifecycle -----------------------------------------------------------------

  function detach() {
    endFaceletsRequest(new Error('Cube disconnected.'));
    cancelRecheck?.(); cancelRecheck = null;
    subscription?.unsubscribe();
    subscription = null;
    connection = null;
    suspect = null; needCheck = false;
  }

  function cancelRetries() {
    cancelRetry?.(); cancelRetry = null;
    retryAttempt = 0;
  }

  // The cube went away without the user asking. Keep the tracked position so a
  // reconnect can be verified against it, and retry (bounded, with backoff).
  function handleDrop() {
    const wasTracking = snapshot.phase === 'tracking';
    detach();
    if (wasTracking) resumeCtx = { state: snapshot.state, moves: snapshot.moves, lostAt: now() };
    if (!resumeCtx) {
      publish({ phase: 'disconnected', detail: 'Cube disconnected. The last mirrored position is kept.', deviceName: '', protocol: '', gyro: null, link: LINK_NONE });
      return;
    }
    logConnection({ kind: 'warn', label: `[session] connection lost (phase was ${wasTracking ? 'tracking' : 'reconnecting'})` });
    publish({ phase: 'disconnected', detail: 'Connection lost. Reconnecting…', gyro: null, link: { status: 'lost', attempt: retryAttempt, maxAttempts: autoReconnect?.delaysMs?.length ?? 0, reason: 'dropped' } });
    scheduleRetry();
  }

  function scheduleRetry() {
    cancelRetry?.(); cancelRetry = null;
    const delays = autoReconnect?.delaysMs;
    if (!resumeCtx || !delays || retryAttempt >= delays.length) {
      publish({ phase: 'disconnected', detail: 'Connection lost. Tap Reconnect.', link: { status: 'lost', attempt: retryAttempt, maxAttempts: delays?.length ?? 0, needsGesture: true, reason: 'gave-up' } });
      return;
    }
    const delay = delays[retryAttempt];
    publish({ link: { status: 'lost', attempt: retryAttempt, maxAttempts: delays.length, retryAt: now() + delay, reason: 'waiting' } });
    cancelRetry = schedule(() => { cancelRetry = null; retryAttempt++; void attemptReconnect({ gesture: false }); }, delay);
  }

  function attach(connected, { resume }) {
    connection = connected;
    epoch++;
    lastSerial = null; lastMoveAt = -Infinity; lastCheckAt = now(); gaps = 0;
    subscription = connected.events$.subscribe({
      next: onEvent,
      error: error => onEvent({ type: 'DISCONNECT', error }),
      complete: () => onEvent({ type: 'DISCONNECT' }),
    });
    publish({
      phase: 'awaiting-solved', detail: resume ? 'Reconnected. Checking the cube…' : 'Connected. Checking whether the cube is solved…',
      deviceName: connected.deviceName || 'Smart cube',
      protocol: connected.protocol?.name || '', battery: null, facelets: null, gyro: null,
      link: { status: 'up' }, sync: { status: 'unchecked', gaps: 0, checkedAt: null },
    });
  }

  async function connect() {
    if (snapshot.phase !== 'disconnected') return;
    cancelRetries();
    resumeCtx = null;
    const token = ++generation;
    publish({ phase: 'connecting', detail: 'Select your cube…', link: LINK_NONE });
    try {
      // Call the adapter immediately: requestDevice requires the click's user activation.
      const pending = connectDevice({
        onStatus: detail => { if (token === generation) publish({ detail }); },
      });
      const connected = await pending;
      if (token !== generation) { await connected.disconnect(); return; }
      attach(connected, { resume: false });
      if (connected.capabilities?.facelets) {
        connected.sendCommand({ type: 'REQUEST_FACELETS' }).catch(() => {
          if (token === generation && snapshot.phase === 'awaiting-solved') publish({ detail: `Couldn’t read the cube. ${MSG.syncFirst}` });
        });
      } else publish({ detail: 'This cube cannot report its state. Start only when it is physically solved.' });
    } catch (error) {
      if (token === generation) publish({ phase: 'disconnected', detail: error?.name === 'NotFoundError' ? 'No cube selected.' : `Connection failed: ${error.message}` });
    }
  }

  // Reconnect after an unexpected drop. `gesture: true` is a user tap (the
  // adapter may then show the device picker); automatic retries run without one.
  async function attemptReconnect({ gesture }) {
    if (snapshot.phase !== 'disconnected' || !resumeCtx) return false;
    cancelRetry?.(); cancelRetry = null;
    const token = ++generation;
    publish({ phase: 'connecting', detail: 'Reconnecting…', link: { status: 'reconnecting', attempt: retryAttempt, maxAttempts: autoReconnect?.delaysMs?.length ?? 0 } });
    try {
      const pending = connectDevice({
        reconnect: true, gesture,
        onStatus: detail => { if (token === generation) publish({ detail }); },
      });
      const connected = await pending;
      if (token !== generation) { await connected.disconnect(); return false; }
      retryAttempt = 0;
      attach(connected, { resume: true });
      if (connected.capabilities?.facelets) {
        connected.sendCommand({ type: 'REQUEST_FACELETS' }).catch(() => {
          if (token === generation && snapshot.phase === 'awaiting-solved') {
            resumeCtx = null;
            publish({ detail: `Couldn’t read the cube. ${MSG.syncFirst}` });
          }
        });
      } else {
        resumeCtx = null;
        publish({ detail: 'This cube cannot report its state. Start only when it is physically solved.' });
      }
      return true;
    } catch (error) {
      if (token !== generation) return false;
      const needsGesture = Boolean(error?.needsGesture) || (gesture && error?.name === 'NotFoundError');
      logConnection({ kind: 'warn', label: `[session] reconnect try ${retryAttempt} failed: ${error?.message || error}` });
      publish({ phase: 'disconnected', detail: 'Couldn’t reconnect. Connect to try again.', link: { status: 'lost', attempt: retryAttempt, maxAttempts: autoReconnect?.delaysMs?.length ?? 0, needsGesture, reason: 'failed' } });
      if (!needsGesture && !gesture) scheduleRetry();
      return false;
    }
  }

  // The first facelet report after a reconnect: compare it with the position
  // that was tracked when the link dropped. No solved cube is needed.
  function finishResume(facelets) {
    const ctx = resumeCtx;
    resumeCtx = null;
    const reported = stateFromFacelets(facelets);
    if (!reported) {
    publish({ detail: `Reconnected, but the cube state could not be read. ${MSG.syncFirst}` });
      return;
    }
    const match = sameCornersAndEdges(reported, ctx.state);
    lastCoalesce = null; suspect = null; needCheck = false;
    publish({
      phase: 'tracking',
      detail: match ? 'Reconnected. The cube is where it was.' : 'Reconnected. The cube changed while it was disconnected; its state was re-read.',
      state: match ? ctx.state : reported, moves: match ? ctx.moves : [], lastMove: null,
      reconnectEvent: { seq: ++reconnectSeq, match, at: now() },
      sync: { status: match ? 'ok' : 'rebaselined', gaps, checkedAt: now() },
    });
  }

  async function syncSolved() {
    if (!connection) throw new Error('Connect a cube first.');
    if (!connection.capabilities?.facelets) { establishSolvedBaseline(); return; }
    if (faceletsRequest) throw new Error('Already checking the cube.');
    const facelets = new Promise((resolve, reject) => {
      faceletsRequest = { resolve, reject, timer: setTimeout(() => endFaceletsRequest(new Error('Cube did not report its state. Try again.')), 6000) };
    });
    // A failed command can reject the waiter before execution reaches await.
    void facelets.catch(() => {});
    try {
      await connection.sendCommand({ type: 'REQUEST_FACELETS' });
      if (await facelets !== SOLVED_FACELETS) throw new Error(MSG.syncFirst);
      establishSolvedBaseline();
    } catch (error) {
      endFaceletsRequest(error);
      publish({ detail: error.message });
      throw error;
    }
  }

  async function disconnect() {
    ++generation;
    cancelRetries();
    resumeCtx = null;
    const old = connection;
    detach();
    publish({ phase: 'disconnected', detail: 'Cube disconnected. The last mirrored position is kept.', deviceName: '', protocol: '', gyro: null, link: LINK_NONE });
    await old?.disconnect();
  }

  // One-tap / automatic reconnect to the cube that dropped.
  async function reconnect({ gesture = true } = {}) {
    if (snapshot.phase !== 'disconnected' || !resumeCtx) return false;
    return attemptReconnect({ gesture });
  }

  return {
    connect, disconnect, syncSolved, reconnect,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); listener(snapshot); return () => listeners.delete(listener); },
    subscribeEvents(listener) { eventListeners.add(listener); return () => eventListeners.delete(listener); },
  };
}
