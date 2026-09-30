// Replay a recording made by src/recorder.js.
//
// createReplayDriver(recording) provides a `connectDevice` implementation for
// the REAL createSmartCubeSession: a fake connection whose events$ emits the
// recorded raw cube events, whose handshake reproduces the recorded status
// lines / metadata / errors, and whose sendCommand answers exactly as the cube
// did (recorded results in order; an unmatched REQUEST_FACELETS is answered
// with the latest recorded facelets). driver.run() walks the timeline —
// optionally with the original timing scaled by `speed` — and hands recorded
// user actions (session.call / live.call / ui) to `onAction`, so the host can
// re-apply them through the same code paths the user drove.
//
// While running, driver.now() is the recorded time of the input being
// dispatched and driver.read(kind) serves the recorded non-deterministic reads
// (e.g. the held orientation), so a live tracker built with those sees
// exactly what it saw live.

import { fromJSONSafe, parseRecording, pauseRecording, resumeRecording, setReplayHooks } from './recorder.js';

const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
// Events that are inputs (drive the app). Everything else in a recording is
// an observation made while an input was handled (reads, commands, results).
const INPUT_KINDS = new Set(['session.call', 'live.call', 'ui', 'connect-start', 'status', 'connected', 'connect-error', 'cube-event', 'cube-error', 'cube-complete', 'checkpoint']);
const QUIET_CUBE_EVENTS = new Set(['GYRO', 'BATTERY', 'HARDWARE']);

const yieldMacrotask = () => new Promise(resolve => {
  if (typeof setImmediate === 'function') setImmediate(resolve);
  else if (typeof MessageChannel === 'function') { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); resolve(); }; ch.port2.postMessage(0); }
  else setTimeout(resolve, 0);
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Let promise chains started by the event just dispatched (sendCommand results,
// syncSolved, listener callbacks) run without handing the thread to the
// browser: a macrotask yield lets it render a frame (several ms each).
const MICROTASK_FLUSH = 16;
const flushMicrotasks = async () => { for (let i = 0; i < MICROTASK_FLUSH; i++) await undefined; };
// At instant speed, raw cube events settle on microtasks; the thread is still
// handed back this often so the page stays responsive (and Stop works).
const INSTANT_YIELD_MS = 50;
const wallNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export function createReplayDriver(input, { speed = 0, maxGapMs = 5000, onAction = null, onTrace = () => {}, signal = null, answerUnmatchedFacelets = true } = {}) {
  const recording = parseRecording(input);
  const events = recording.events;
  let index = -1;
  let clock = events[0]?.t ?? 0;
  let pendingConnect = null;
  const connections = new Map();   // conn -> { observer, meta, results: [], closed }
  let latestFacelets = null;
  const consumedReads = new Set();
  const lastRead = new Map();
  const divergences = [];
  const actionErrors = [];

  const trace = (type, detail = {}) => onTrace({ t: clock, type, ...detail });
  const diverge = (message, detail = {}) => { divergences.push({ t: clock, message, ...detail }); trace('divergence', { message, ...detail }); };

  // Recorded command results per connection, consumed in order by sendCommand.
  for (const e of events) {
    if (e.kind === 'command-result' || e.kind === 'command') {
      const conn = e.data?.conn;
      if (!connections.has(conn)) connections.set(conn, { observer: null, meta: null, results: [], commands: [], closed: false });
      if (e.kind === 'command') connections.get(conn).commands.push(e.data);
      else connections.get(conn).results.push(e.data);
    }
  }
  const stateFor = conn => {
    if (!connections.has(conn)) connections.set(conn, { observer: null, meta: null, results: [], commands: [], closed: false });
    return connections.get(conn);
  };
  let activeConn = null;

  function fakeConnection(conn, meta) {
    const state = stateFor(conn);
    state.meta = meta;
    return {
      deviceName: meta.deviceName,
      deviceMAC: meta.deviceMAC,
      protocol: meta.protocol,
      capabilities: meta.capabilities,
      replay: true,
      events$: {
        subscribe(observer) {
          state.observer = typeof observer === 'function' ? { next: observer } : observer;
          return { unsubscribe() { state.observer = null; } };
        },
      },
      sendCommand(command) {
        trace('command', { conn, command });
        const recordedCommand = state.commands.shift();
        const result = state.results.shift();
        if (recordedCommand && recordedCommand.command?.type !== command?.type) {
          diverge(`app sent ${command?.type} where the recording sent ${recordedCommand.command?.type}`);
        }
        if (!recordedCommand && command?.type === 'REQUEST_FACELETS' && answerUnmatchedFacelets && latestFacelets) {
          // Not in the recording: answer from the most recent recorded cube state.
          diverge('unrecorded REQUEST_FACELETS answered from the recording');
          queueMicrotask(() => state.observer?.next?.({ type: 'FACELETS', facelets: latestFacelets, replaySynthetic: true }));
        }
        if (result && !result.ok) return Promise.reject(fromJSONSafe(result.error));
        return Promise.resolve(result ? fromJSONSafe(result.value) : undefined);
      },
      async disconnect() { state.closed = true; trace('device-disconnect', { conn }); },
    };
  }

  function connectDevice(options = {}) {
    trace('connectDevice');
    return new Promise((resolve, reject) => { pendingConnect = { options, resolve, reject }; });
  }

  // Serve a recorded read: the first unconsumed read of this kind recorded
  // while the current input was being handled; else the last known value.
  function read(kind, fallback) {
    for (let i = Math.max(0, index + 1); i < events.length; i++) {
      const e = events[i];
      if (INPUT_KINDS.has(e.kind)) break;
      if (e.kind === 'read' && e.data?.kind === kind && !consumedReads.has(i)) {
        consumedReads.add(i);
        const value = fromJSONSafe(e.data.value);
        lastRead.set(kind, value);
        return value;
      }
    }
    if (lastRead.has(kind)) return lastRead.get(kind);
    for (const e of events) if (e.kind === 'read' && e.data?.kind === kind) return fromJSONSafe(e.data.value);
    return typeof fallback === 'function' ? fallback() : fallback;
  }

  function emitTo(conn, method, value) {
    const state = stateFor(conn);
    if (!state.observer) { diverge(`recorded ${value?.type || method} arrived but the session is not subscribed to connection ${conn}`); return false; }
    state.observer[method]?.(value);
    return true;
  }

  function runAction(action) {
    trace('action', { action });
    if (!onAction) return;
    try {
      const result = onAction(action);
      if (result && typeof result.then === 'function') {
        result.catch(error => { actionErrors.push({ t: clock, action, error: String(error?.message || error) }); trace('action-rejected', { action, error: String(error?.message || error) }); });
      }
    } catch (error) {
      actionErrors.push({ t: clock, action, error: String(error?.message || error) });
      trace('action-threw', { action, error: String(error?.message || error) });
    }
  }

  async function dispatch(e) {
    const d = e.data || {};
    switch (e.kind) {
      case 'session.call':
      case 'live.call':
        runAction({ kind: e.kind, method: d.method, args: fromJSONSafe(d.args) || [] });
        return true;
      case 'ui':
        runAction({ kind: 'ui', ...fromJSONSafe(d) });
        return true;
      case 'connect-start':
        activeConn = d.conn;
        if (!pendingConnect) {
          // Trimmed / cleared recording: the Connect click is gone, the handshake is pinned.
          trace('synthetic-connect', { conn: d.conn });
          runAction({ kind: 'session.call', method: 'connect', args: [], synthetic: true });
          await yieldMacrotask();
          if (!pendingConnect) diverge('recording connected, but the app did not call connectDevice');
        }
        return true;
      case 'status':
        if (d.channel === 'device') { trace('device-status', { detail: d.detail }); return false; }
        pendingConnect?.options?.onStatus?.(d.detail);
        return false;
      case 'connected': {
        const meta = fromJSONSafe(d);
        trace('connected', { conn: d.conn, deviceName: meta.deviceName, protocol: meta.protocol?.name });
        const pending = pendingConnect; pendingConnect = null;
        if (!pending) { diverge('recorded connection resolved with no pending connect'); return true; }
        pending.resolve(fakeConnection(d.conn, meta));
        return true;
      }
      case 'connect-error': {
        const pending = pendingConnect; pendingConnect = null;
        trace('connect-error', { error: d.error?.$error?.message });
        pending?.reject(fromJSONSafe(d.error));
        return true;
      }
      case 'cube-event': {
        const event = fromJSONSafe(d.event);
        if (event?.type === 'FACELETS') latestFacelets = event.facelets;
        if (!QUIET_CUBE_EVENTS.has(event?.type)) trace('cube-event', { conn: d.conn, event });
        emitTo(d.conn, 'next', event);
        return QUIET_CUBE_EVENTS.has(event?.type) ? false : 'microtask';
      }
      case 'cube-error':
        trace('cube-error', { error: d.error?.$error?.message });
        emitTo(d.conn, 'error', fromJSONSafe(d.error));
        return true;
      case 'cube-complete':
        emitTo(d.conn, 'complete');
        return true;
      case 'checkpoint': {
        // A fresh recording started mid-session: rebuild the tracked state
        // through the real session (solved baseline + the tracked moves).
        const cp = fromJSONSafe(d);
        trace('checkpoint', { phase: cp.phase, moves: cp.moves?.length ?? 0 });
        await yieldMacrotask();
        const conn = activeConn;
        if (cp.phase === 'tracking') {
          emitTo(conn, 'next', { type: 'FACELETS', facelets: SOLVED_FACELETS, replaySynthetic: true });
          await yieldMacrotask();
          cp.moves.forEach((move, i) => emitTo(conn, 'next', { type: 'MOVE', move, cubeTimestamp: -1e9 + i * 1000, replaySynthetic: true }));
        } else if (cp.facelets) emitTo(conn, 'next', { type: 'FACELETS', facelets: cp.facelets, replaySynthetic: true });
        return true;
      }
      case 'trimmed':
        diverge(`recording was trimmed (${d.dropped} older events dropped); state before the trim is unknown`);
        return false;
      case 'read': case 'command': case 'command-result': case 'observe.session': case 'observe.live':
        return false;
      default:
        trace(e.kind, { data: d });
        return false;
    }
  }

  async function run() {
    let previousT = events[0]?.t ?? 0;
    const timed = speed > 0 && Number.isFinite(speed);
    let lastYield = wallNow();
    // Timed replays follow a schedule (recorded time since the start, long
    // gaps capped) rather than sleeping each gap, so timer and rendering
    // overhead does not accumulate over thousands of events.
    const startWall = wallNow();
    let scheduled = 0;
    for (index = 0; index < events.length; index++) {
      if (signal?.aborted) { trace('aborted'); break; }
      const e = events[index];
      if (timed) {
        scheduled += Math.min(maxGapMs, Math.max(0, e.t - previousT));
        const wait = startWall + scheduled / speed - wallNow();
        if (wait >= 1) await sleep(wait);
      }
      previousT = e.t;
      clock = e.t;
      // settle: true = macrotask (connect handshake, user actions), 'microtask'
      // = raw cube event, false = nothing to settle.
      const settle = await dispatch(e);
      if (settle === true || (settle && timed)) { await yieldMacrotask(); lastYield = wallNow(); }
      else if (settle) await flushMicrotasks();
      if (!timed && wallNow() - lastYield >= INSTANT_YIELD_MS) { await yieldMacrotask(); lastYield = wallNow(); }
    }
    // Let trailing promise chains (sync, connect) settle.
    for (let i = 0; i < 3; i++) await yieldMacrotask();
    return { divergences, actionErrors, recording };
  }

  return {
    connectDevice, run, read,
    setOnAction(fn) { onAction = fn; },
    now: () => clock,
    get recording() { return recording; },
    get divergences() { return divergences; },
    get actionErrors() { return actionErrors; },
  };
}

/**
 * Browser/host replay into an existing (real) session. The connected cube is
 * disconnected first (recorded: it is a real change of the live session), then
 * the session's device adapter is routed to the replay and the recorder paused
 * so the replay itself is not recorded. `onAction` handles live.call and ui
 * actions (the host re-applies them through its own handlers); session.call
 * actions are applied to `session` directly.
 *
 * However the replay ends (finished, stopped via `signal`, or failed), the
 * session is left disconnected with the real adapter restored, so Connect
 * pairs the real cube again. `onEnd({ aborted })` runs before the recorder
 * resumes, so the host's own cleanup (cancelling the live tracker) is not
 * recorded either.
 */
export async function replayIntoSession(recording, { session, setConnectDevice, onAction, onEnd, speed = 1, maxGapMs, onTrace, signal } = {}) {
  const driver = createReplayDriver(recording, {
    speed, maxGapMs, onTrace, signal,
    onAction: action => {
      if (action.kind === 'session.call') return session[action.method]?.(...(action.args || []));
      return onAction?.(action);
    },
  });
  await session.disconnect();
  pauseRecording();
  setReplayHooks({ now: driver.now, read: driver.read, speed: Number.isFinite(speed) && speed > 0 ? speed : 0 });
  try {
    setConnectDevice(driver.connectDevice);
    return await driver.run();
  } finally {
    // Drop the replayed connection (and any connect still waiting on the
    // recording) before the real adapter comes back.
    try { await session.disconnect(); } catch { /* the fake connection cannot fail to close */ }
    setConnectDevice(null);
    try { await onEnd?.({ aborted: Boolean(signal?.aborted) }); } catch (error) { console.error('[replay] cleanup failed', error); }
    setReplayHooks(null);
    resumeRecording();
  }
}

const GAN_FACE_INDEX = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

/**
 * A hand-driven device for the real session (scripted tests, src/replay.js):
 * emit(event) pushes a raw cube event synchronously; REQUEST_FACELETS is
 * answered with the current facelets on a microtask, like a real GAN cube.
 */
export function createManualDevice({ deviceName = 'Replay cube', protocol = { id: 'replay', name: 'GAN Gen4' }, capabilities = { gyroscope: false, battery: false, facelets: true, hardware: false, reset: false }, facelets = SOLVED_FACELETS } = {}) {
  let observer = null;
  let serial = 0;
  const commands = [];
  const connection = {
    deviceName, deviceMAC: '', protocol, capabilities,
    events$: {
      subscribe(o) {
        observer = typeof o === 'function' ? { next: o } : o;
        return { unsubscribe() { observer = null; } };
      },
    },
    async sendCommand(command) {
      commands.push(command);
      if (command?.type === 'REQUEST_FACELETS') queueMicrotask(() => observer?.next?.({ type: 'FACELETS', facelets, timestamp: Date.now() }));
    },
    async disconnect() { observer = null; },
  };
  return {
    connection,
    commands,
    connectDevice: () => Promise.resolve(connection),
    emit(event) { observer?.next?.(event); },
    /** A GAN-shaped MOVE event (face index, direction, serial, timestamps). */
    move(move, cubeTimestamp = null) {
      serial = (serial + 1) & 0xff;
      observer?.next?.({
        type: 'MOVE', move,
        face: GAN_FACE_INDEX[move[0]] ?? null,
        direction: move.includes("'") ? 1 : 0,
        serial, cubeTimestamp, localTimestamp: cubeTimestamp, timestamp: Date.now(),
      });
    },
    setFacelets(value) { facelets = value; },
    get subscribed() { return Boolean(observer); },
  };
}
