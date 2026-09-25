import { applyMoves, createSolvedState, FACE_COLORS, parseScramble } from './cross-cube.js';

const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const solvedState = () => createSolvedState();
const isSolvedState = state => state.cubies.every(cubie =>
  Object.entries(cubie.stickers).every(([face, color]) => FACE_COLORS[face] === color));

/**
 * Device-neutral cube stream for trainers. A connection adapter supplies
 * connect({ onStatus }) and emits MOVE/FACELETS/GYRO/DISCONNECT.
 * Only a verified solved baseline starts the move history used by solvers.
 */
export function createSmartCubeSession(connectDevice) {
  const listeners = new Set();
  let connection = null;
  let subscription = null;
  let generation = 0;
  let faceletsRequest = null;
  let snapshot = {
    phase: 'disconnected', detail: 'Connect a smart cube to mirror its turns.',
    deviceName: '', protocol: '', battery: null, facelets: null, gyro: null,
    state: solvedState(), moves: [],
  };

  function publish(changes) {
    snapshot = { ...snapshot, ...changes };
    for (const listener of listeners) listener(snapshot);
  }

  function establishSolvedBaseline() {
    publish({ phase: 'tracking', detail: 'Solved baseline synced. Turn the cube, then Analyze.', state: solvedState(), moves: [] });
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
    if (event.type === 'FACELETS') {
      publish({ facelets: event.facelets });
      endFaceletsRequest(null, event.facelets);
      if (snapshot.phase === 'awaiting-solved') {
        if (event.facelets === SOLVED_FACELETS) establishSolvedBaseline();
        else publish({ detail: 'Cube connected. Solve it, then tap Sync solved cube.' });
      }
    } else if (event.type === 'MOVE' && snapshot.phase === 'tracking') {
      try {
        const moves = parseScramble(event.move);
        if (moves.length !== 1) throw new Error('Invalid move');
        const [move] = moves;
        const state = applyMoves(snapshot.state, [move]);
        publish({ state, moves: isSolvedState(state) ? [] : [...snapshot.moves, move], detail: 'Live cube updated. Analyze when ready.' });
      } catch {
        publish({ phase: 'desynced', detail: `Unsupported move from cube: ${String(event.move).slice(0, 20)}. Solve it and sync again.` });
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
  };
}
