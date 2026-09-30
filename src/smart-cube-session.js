import { applyMoves, createSolvedState, FACE_COLORS, parseScramble } from './cross-cube.js';
import { logConnection } from './smart-cube-diag.js';

const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const solvedState = () => createSolvedState();
const DOUBLE_TURN_WINDOW = 50; // cube-tick gap below which two same-face same-direction quarters are one physical double turn
const isSolvedState = state => state.cubies.every(cubie =>
  Object.entries(cubie.stickers).every(([face, color]) => FACE_COLORS[face] === color));

/**
 * Device-neutral cube stream for trainers. A connection adapter supplies
 * connect({ onStatus }) and emits MOVE/FACELETS/GYRO/DISCONNECT.
 * Only a verified solved baseline starts the move history used by solvers.
 */
export function createSmartCubeSession(connectDevice) {
  const listeners = new Set();
  const eventListeners = new Set();
  let connection = null;
  let subscription = null;
  let generation = 0;
  let faceletsRequest = null;
  let lastCoalesce = null;
  let snapshot = {
    phase: 'disconnected', detail: 'Connect a smart cube to mirror its turns.',
    deviceName: '', protocol: '', battery: null, facelets: null, gyro: null,
    state: solvedState(), moves: [], lastMove: null,
    // Every applied cube turn bumps moveEvent.seq. Consumers must key on seq,
    // not on moves.length: the history empties whenever the cube is solved, and
    // a coalesced double replaces the previous quarter (replaces: true) instead
    // of appending. `turn` is the physical turn just applied (the second quarter
    // of a double), for animating the mirror.
    moveEvent: null,
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
    publish({ phase: 'tracking', detail: 'Solved baseline synced. Turn the cube, then Analyze.', state: solvedState(), moves: [], lastMove: null });
  }

  function endFaceletsRequest(error, facelets) {
    if (!faceletsRequest) return;
    const request = faceletsRequest;
    faceletsRequest = null;
    clearTimeout(request.timer);
    if (error) request.reject(error);
    else request.resolve(facelets);
  }

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
    if (event.type === 'FACELETS') {
      publish({ facelets: event.facelets });
      endFaceletsRequest(null, event.facelets);
      if (snapshot.phase === 'awaiting-solved') {
        if (event.facelets === SOLVED_FACELETS) establishSolvedBaseline();
        else publish({ detail: 'Cube connected. Solve it, then tap Sync solved cube.' });
      }
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
        logConnection({ kind: 'error', label: `[session] MOVE DESYNC move=${JSON.stringify(event.move)} phase=${snapshot.phase} error=${error.message}` });
        publish({ phase: 'desynced', detail: `Unsupported move from cube: ${String(event.move).slice(0, 20)}. Solve it and sync again.` });
        return;
      }
      const face = move.replace(/'|2$/g, '');
      const prime = move.endsWith("'");
      const quarterTurn = !move.endsWith('2');
      const cubeTs = Number.isFinite(event.cubeTimestamp) ? event.cubeTimestamp : null;
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
        lastCoalesce = null;
        publish({ state, moves: isSolvedState(state) ? [] : [...snapshot.moves.slice(0, -1), double], lastMove: double, moveEvent: { seq: ++moveSeq, move: double, turn: move, replaces: true }, detail: 'Live cube updated.' });
      } else {
        lastCoalesce = quarterTurn ? { face, prime, cubeTs } : null;
        publish({ state, moves: isSolvedState(state) ? [] : [...snapshot.moves, move], lastMove: move, moveEvent: { seq: ++moveSeq, move, turn: move, replaces: false }, detail: 'Live cube updated. Analyze when ready.' });
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
      endFaceletsRequest(new Error('Cube disconnected.'));
      subscription?.unsubscribe();
      subscription = null;
      connection = null;
      publish({ phase: 'disconnected', detail: 'Cube disconnected. The last mirrored position is kept.', deviceName: '', protocol: '', gyro: null });
    }
  }

  async function connect() {
    if (snapshot.phase !== 'disconnected') return;
    const token = ++generation;
    publish({ phase: 'connecting', detail: 'Select your cube…' });
    try {
      // Call the adapter immediately: requestDevice requires the click's user activation.
      const pending = connectDevice({
        onStatus: detail => { if (token === generation) publish({ detail }); },
      });
      const connected = await pending;
      if (token !== generation) { await connected.disconnect(); return; }
      connection = connected;
      subscription = connected.events$.subscribe({
        next: onEvent,
        error: error => onEvent({ type: 'DISCONNECT', error }),
      });
      publish({
        phase: 'awaiting-solved', detail: 'Connected. Checking whether the cube is solved…',
        deviceName: connected.deviceName || 'Smart cube',
        protocol: connected.protocol?.name || '', battery: null, facelets: null, gyro: null,
      });
      if (connected.capabilities?.facelets) {
        connected.sendCommand({ type: 'REQUEST_FACELETS' }).catch(() => {
          if (token === generation && snapshot.phase === 'awaiting-solved') publish({ detail: 'Could not read cube state. Solve it, then tap Sync solved cube.' });
        });
      } else publish({ detail: 'This cube cannot report its state. Start only when it is physically solved.' });
    } catch (error) {
      if (token === generation) publish({ phase: 'disconnected', detail: error?.name === 'NotFoundError' ? 'No cube selected.' : `Connection failed: ${error.message}` });
    }
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
      if (await facelets !== SOLVED_FACELETS) throw new Error('Cube is not solved yet. Solve it, then try again.');
      establishSolvedBaseline();
    } catch (error) {
      endFaceletsRequest(error);
      publish({ detail: error.message });
      throw error;
    }
  }

  async function disconnect() {
    ++generation;
    endFaceletsRequest(new Error('Cube disconnected.'));
    const old = connection;
    connection = null;
    subscription?.unsubscribe();
    subscription = null;
    publish({ phase: 'disconnected', detail: 'Cube disconnected. The last mirrored position is kept.', deviceName: '', protocol: '', gyro: null });
    await old?.disconnect();
  }

  return {
    connect, disconnect, syncSolved,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); listener(snapshot); return () => listeners.delete(listener); },
    subscribeEvents(listener) { eventListeners.add(listener); return () => eventListeners.delete(listener); },
  };
}
