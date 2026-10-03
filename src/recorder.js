// Always-on input recorder for deterministic replay.
//
// Everything the app receives from outside — raw smart-cube events, the
// connection handshake (status lines, device metadata, errors), every command
// the app sends to the cube, user actions that feed the session / live
// tracker, and the non-deterministic reads the tracker depends on (the held
// orientation) — is appended here with a monotonic time offset `t` (ms since
// the recorder started). src/recording-replay.js feeds a recording back
// through the REAL session and live tracker.
//
// Clock: while an input is being dispatched (a cube event, a user action) the
// recorder clock (`now()`) is frozen at that input's `t`. Consumers that take
// an injectable clock (createSolveLive({ now })) therefore see exactly the
// same times live and on replay, where the replay driver serves the recorded
// `t` instead.
//
// The buffer is a ring (default 100k entries, ~15 min of gyro-heavy GAN
// traffic); the header of the active connection is pinned so a trimmed
// recording can still be replayed.

export const RECORDING_FORMAT = 'cubesight-recording';
// v2: recordings may contain link-loss / reconnect / desync-check behaviour, so a
// replay runs the session with the app's robustness options (APP_SESSION_OPTIONS).
export const RECORDING_VERSION = 2;
const DEFAULT_CAP = 100_000;
const MAX_CAP = DEFAULT_CAP;
const EMERGENCY_TAIL_KEY = 'cubesight-recording-pending-tail';

const perf = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

let origin = perf();
let startedAt = Date.now();
let events = [];
let seq = 0;
let dropped = 0;
let cap = DEFAULT_CAP;
let paused = 0;
let frozen = null;          // t of the input currently being dispatched
let replayHooks = null;     // { now(), read(kind, fallback) } while a replay drives the app
let connectionCounter = 0;
let commandCounter = 0;
let header = [];            // pinned events of the active connection
let checkpointProvider = null;
let persistence = null;
let persistTimer = 0;
let persistenceReady = null;
let discardStoredOnHydrate = false;
let persistenceHydrated = false;

function schedulePersist() {
  if (!persistence || persistTimer || !isRecording()) return;
  persistTimer = setTimeout(() => { persistTimer = 0; void persistBuffer(); }, 900);
}

function persistOnPageHide() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = 0;
  try {
    const tail = anonymizeRecording({ events: events.slice(-128) }).events;
    const pinnedHeader = anonymizeRecording({ events: header }).events;
    globalThis.localStorage?.setItem(EMERGENCY_TAIL_KEY, JSON.stringify({ events: tail, header: pinnedHeader, dropped, startedAt, clearStored: discardStoredOnHydrate }));
  } catch { /* The IndexedDB flush remains the primary persistence path. */ }
  void persistBuffer();
}

function readEmergencyTail() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(EMERGENCY_TAIL_KEY) || 'null');
    return Array.isArray(value?.events) ? value : null;
  } catch { return null; }
}

function clearEmergencyTail() {
  try { globalThis.localStorage?.removeItem(EMERGENCY_TAIL_KEY); } catch { /* Storage may be unavailable. */ }
}

function prependPinnedHeader(pinned) {
  if (!Array.isArray(pinned) || !pinned.length) return;
  const present = new Set(events.map(event => Number(event.seq)));
  events = [...pinned.filter(event => !present.has(Number(event.seq))), ...events]
    .sort((a, b) => Number(a.seq) - Number(b.seq));
  seq = events.reduce((max, entry) => Math.max(max, Number(entry.seq) || 0), seq);
}

function restoreEmergencyTail() {
  const emergency = readEmergencyTail();
  if (!emergency) return false;
  cap = Math.max(100, Math.min(MAX_CAP, Number(cap) || DEFAULT_CAP));
  events = emergency.events.slice(-cap);
  seq = events.reduce((max, entry) => Math.max(max, Number(entry.seq) || 0), seq);
  dropped = Number(emergency.dropped) || 0;
  startedAt = Number(emergency.startedAt) || Date.now();
  header = Array.isArray(emergency.header) ? emergency.header : header;
  prependPinnedHeader(header);
  origin = perf() - (Number(events.at(-1)?.t) || 0);
  if (!discardStoredOnHydrate && !emergency.clearStored) clearEmergencyTail();
  return events.length > 0;
}

async function persistBuffer() {
  if (!persistence) return;
  try {
    const safeHeader = anonymizeRecording({ events: header }).events;
    const row = { key: 'active', recording: getRecording(), header: safeHeader, cap };
    const tx = persistence.transaction('buffer', 'readwrite');
    tx.objectStore('buffer').put(row);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  } catch { /* Recording remains available in memory when IndexedDB is unavailable. */ }
}

/** Restore and persist the bounded always-on ring buffer across reloads. */
export function enableRecordingPersistence({ factory = globalThis.indexedDB, name = 'cubesight-recording-buffer' } = {}) {
  if (persistenceReady) return persistenceReady;
  if (typeof window !== 'undefined') window.addEventListener('pagehide', persistOnPageHide);
  if (!factory) {
    const restored = restoreEmergencyTail();
    if (restored) record('reload', { href: typeof location === 'undefined' ? '' : location.href, restoredEvents: events.length });
    return Promise.resolve({ restored, available: false });
  }
  persistenceReady = new Promise(resolve => {
    let request;
    try { request = factory.open(name, 1); } catch {
      const restored = restoreEmergencyTail();
      resolve({ restored, available: false });
      if (restored) record('reload', { href: typeof location === 'undefined' ? '' : location.href, restoredEvents: events.length });
      return;
    }
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('buffer')) request.result.createObjectStore('buffer', { keyPath: 'key' }); };
    request.onerror = () => { const restored = restoreEmergencyTail(); resolve({ restored, available: false }); if (restored) record('reload', { href: typeof location === 'undefined' ? '' : location.href, restoredEvents: events.length }); };
    request.onblocked = () => { const restored = restoreEmergencyTail(); resolve({ restored, available: false }); if (restored) record('reload', { href: typeof location === 'undefined' ? '' : location.href, restoredEvents: events.length }); };
    request.onsuccess = () => {
      persistence = request.result;
      persistence.onversionchange = () => { persistence.close(); persistence = null; };
      const read = persistence.transaction('buffer').objectStore('buffer').get('active');
      read.onerror = () => {
        const restored = restoreEmergencyTail();
        persistenceHydrated = true;
        resolve({ restored, available: true });
        if (restored) record('reload', { href: typeof location === 'undefined' ? '' : location.href, restoredEvents: events.length });
        void persistBuffer();
      };
      read.onsuccess = () => {
        try {
          const saved = read.result;
          const pending = events;
          const emergency = readEmergencyTail();
          let restored = false;
          const version = Number(saved?.recording?.version);
          const ignoreSaved = discardStoredOnHydrate || emergency?.clearStored === true;
          const validSaved = !ignoreSaved && saved?.recording?.format === RECORDING_FORMAT
            && Number.isInteger(version) && version > 0 && version <= RECORDING_VERSION
            && Array.isArray(saved.recording.events);
          const corrupted = Boolean(saved) && !validSaved && !ignoreSaved;
          if (validSaved || (!discardStoredOnHydrate && emergency?.events?.length)) {
            const rec = validSaved ? parseRecording(saved.recording) : null;
            cap = Math.max(100, Math.min(MAX_CAP, Number(saved?.cap) || DEFAULT_CAP));
            events = rec?.events.slice(-cap) || [];
            seq = events.reduce((max, entry) => Math.max(max, Number(entry.seq) || 0), 0);
            for (const event of emergency?.events || []) {
              const eventSeq = Number(event.seq) || 0;
              if (eventSeq > seq) { events.push(event); seq = eventSeq; }
            }
            if (ignoreSaved) prependPinnedHeader(emergency?.header || header);
            dropped = Number(rec?.dropped ?? emergency?.dropped) || 0;
            if (events.length > cap) trim();
            startedAt = Number(rec?.startedAt ?? emergency?.startedAt) || Date.now();
            const lastAt = Number(events.at(-1)?.t) || 0;
            origin = perf() - lastAt;
            header = ignoreSaved
              ? (Array.isArray(emergency?.header) ? emergency.header : header)
              : (Array.isArray(saved?.header) ? saved.header : []);
            restored = events.length > 0;
            if (pending.length) {
              // Keep pre-hydration startup events after the persisted tail. They
              // are rare, but assigning them a fresh monotonic time avoids both
              // reordering and zero-time duplicates after a reload.
              let mergeAt = Math.max(lastAt, perf() - origin);
              for (const event of pending) events.push({ ...event, seq: ++seq, t: Math.max(mergeAt, event.t) });
              if (events.length > cap) trim();
            }
          }
          persistenceHydrated = true;
          discardStoredOnHydrate = false;
          clearEmergencyTail();
          resolve({ restored, available: true, corrupted });
          if (restored) { record('reload', { href: typeof location === 'undefined' ? '' : location.href, restoredEvents: events.length }); schedulePersist(); }
          else schedulePersist();
        } catch {
          persistenceHydrated = true;
          resolve({ restored: false, available: true, corrupted: true });
          schedulePersist();
        }
      };
    };
  });
  return persistenceReady;
}

/** Record address navigation and resolved page/view lifecycle without page-specific status copy. */
export function recordNavigation({ hash = '', resolvedHash = hash, tool = '', initial = false } = {}) {
  record('navigation.route', { hash, resolvedHash, tool, initial: Boolean(initial) });
}
export function recordView(type, { tool = '', hash = typeof location === 'undefined' ? '' : location.hash } = {}) {
  if (!['mount', 'unmount'].includes(type)) throw new Error('View lifecycle must be mount or unmount.');
  record(`view.${type}`, { tool, hash });
}

// ---------------------------------------------------------------------------
// JSON-safe encoding that keeps every field: non-finite numbers, undefined
// array slots, Errors, byte buffers and Dates survive the round-trip.

export function toJSONSafe(value, depth = 0, seen = new WeakSet()) {
  if (value === null) return null;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return value;
  if (type === 'number') return Number.isFinite(value) ? value : { $num: String(value) };
  if (type === 'undefined') return { $undef: true };
  if (type === 'bigint') return { $bigint: String(value) };
  if (type === 'function' || type === 'symbol') return undefined;
  if (depth > 8) return { $truncated: true };
  if (seen.has(value)) return { $cycle: true };
  seen.add(value);
  try {
    if (value instanceof Error || (value && typeof value.message === 'string' && typeof value.name === 'string' && 'stack' in value)) {
      const out = { $error: { name: value.name, message: value.message, stack: String(value.stack || '') } };
      for (const key of Object.keys(value)) {
        const v = toJSONSafe(value[key], depth + 1, seen);
        if (v !== undefined) out.$error[key] = v;
      }
      return out;
    }
    if (value instanceof Date) return { $date: value.toISOString() };
    if (typeof ArrayBuffer !== 'undefined') {
      if (value instanceof ArrayBuffer) return { $bytes: Array.from(new Uint8Array(value)), $kind: 'ArrayBuffer' };
      if (ArrayBuffer.isView(value)) return { $bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)), $kind: value.constructor?.name || 'Uint8Array' };
    }
    if (Array.isArray(value)) return value.map(v => { const e = toJSONSafe(v, depth + 1, seen); return e === undefined ? null : e; });
    const out = {};
    for (const key of Object.keys(value)) {
      const v = toJSONSafe(value[key], depth + 1, seen);
      if (v !== undefined) out[key] = v;
    }
    return out;
  } finally { seen.delete(value); }
}

export function fromJSONSafe(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(fromJSONSafe);
  if ('$num' in value) return Number(value.$num);
  if ('$undef' in value) return undefined;
  if ('$bigint' in value) return BigInt(value.$bigint);
  if ('$date' in value) return new Date(value.$date);
  if ('$bytes' in value) {
    const bytes = Uint8Array.from(value.$bytes);
    if (value.$kind === 'ArrayBuffer') return bytes.buffer;
    if (value.$kind === 'DataView') return new DataView(bytes.buffer);
    return bytes;
  }
  if ('$error' in value) {
    const { name, message, stack, ...rest } = value.$error;
    const error = new Error(message);
    error.name = name;
    if (stack) error.stack = stack;
    for (const [k, v] of Object.entries(rest)) error[k] = fromJSONSafe(v);
    return error;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = fromJSONSafe(v);
  return out;
}

// ---------------------------------------------------------------------------
// Core buffer.

/** Monotonic ms since the recorder started (virtual during replay, frozen during a dispatch). */
export function now() {
  if (frozen != null) return frozen;
  if (replayHooks) return replayHooks.now();
  return perf() - origin;
}

export function isRecording() { return paused === 0 && !replayHooks; }
export function isReplaying() { return Boolean(replayHooks); }
/** The running replay's speed (0 = instant), or null when not replaying. Views skip animations at instant speed. */
export function replaySpeed() { return replayHooks ? (replayHooks.speed ?? 1) : null; }

/** Append one entry. Returns its `t` (so the caller can freeze the clock on it). */
export function record(kind, payload = {}, { pin = false } = {}) {
  // During a replay the seams still wrap the replayed device; their clock must
  // be the replay's virtual time, not the wall clock.
  const t = frozen ?? (replayHooks ? replayHooks.now() : perf() - origin);
  if (!isRecording()) return t;
  const entry = { seq: ++seq, t, kind, data: toJSONSafe(payload) };
  events.push(entry);
  if (pin) header.push(entry);
  if (events.length > cap) trim();
  schedulePersist();
  return t;
}

function trim() {
  const removeCount = Math.max(1, Math.floor(cap * 0.1));
  const removed = events.splice(0, removeCount);
  dropped += removed.length;
  // Keep the active connection's handshake so the tail still replays.
  const keep = header.filter(h => removed.includes(h));
  if (keep.length) events.unshift(...keep, { seq: keep[keep.length - 1].seq, t: keep[keep.length - 1].t, kind: 'trimmed', data: { dropped } });
}

/** Run fn with the recorder clock frozen at t (nested-safe). */
export function withClock(t, fn) {
  const previous = frozen;
  frozen = t;
  try { return fn(); } finally { frozen = previous; }
}

export function pauseRecording() { paused++; }
export function resumeRecording() { paused = Math.max(0, paused - 1); }
export function setRecordingCap(value) { cap = Math.max(100, Math.min(MAX_CAP, Number(value) | 0)); if (events.length > cap) trim(); schedulePersist(); }

/** Installed by a replay driver: serves the virtual clock and recorded reads. */
export function setReplayHooks(hooks) { replayHooks = hooks || null; }

/** Provides a {phase, moves, facelets} snapshot used to checkpoint on clear. */
export function setCheckpointProvider(fn) { checkpointProvider = fn; }

function checkpoint() {
  try {
    const s = checkpointProvider?.();
    if (!s) return null;
    return { phase: s.phase, moves: [...(s.moves || [])], facelets: s.facelets ?? null, deviceName: s.deviceName || '', protocol: s.protocol || '' };
  } catch { return null; }
}

/**
 * Start a fresh recording. The active connection's handshake is kept and a
 * checkpoint of the session (phase + tracked moves) is written, so the replay
 * can rebuild the tracked state without the discarded history.
 */
export function clearRecording() {
  // The clock is NOT reset: consumers (the live tracker) hold times from it.
  const keep = header.slice();
  events = [];
  dropped = 0;
  discardStoredOnHydrate = true;
  clearEmergencyTail();
  if (persistence) {
    try {
      const transaction = persistence.transaction('buffer', 'readwrite');
      transaction.objectStore('buffer').delete('active');
      transaction.oncomplete = () => { if (persistenceHydrated) discardStoredOnHydrate = false; };
    }
    catch { /* A fresh in-memory recording remains available. */ }
  }
  events.push(...keep);
  const cp = checkpoint();
  if (cp && keep.length) events.push({ seq: ++seq, t: perf() - origin, kind: 'checkpoint', data: toJSONSafe(cp) });
  schedulePersist();
}

/** Drop everything, including the pinned connection header (tests). */
export function resetRecording() { header = []; clearRecording(); }

/** A JSON-serializable copy of the recording (plus a final snapshot for divergence checks). */
export function getRecording(extra = {}) {
  return anonymizeRecording({
    format: RECORDING_FORMAT,
    version: RECORDING_VERSION,
    createdAt: new Date().toISOString(),
    startedAt,               // wall clock at t=0
    durationMs: perf() - origin - (events[0]?.t ?? 0),
    dropped,
    env: typeof navigator !== 'undefined' ? { userAgent: navigator.userAgent, href: typeof location !== 'undefined' ? location.href : '' } : { node: typeof process !== 'undefined' ? process.version : '' },
    final: checkpoint(),
    ...extra,
    events: events.map(e => ({ ...e })),
  });
}

export function serializeRecording(extra) { return JSON.stringify(getRecording(extra)); }

// --- Privacy -------------------------------------------------------------
// Recordings get shared to reproduce bugs, so they must not identify the
// user or their device. Every saved recording passes through this: the cube's
// Bluetooth name becomes a stable generic alias (so replays still line up),
// MAC addresses and Web Bluetooth device ids are masked, and the browser is
// reduced to its family/major version.
const MAC_RE = /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi;
const DEVICE_ID_RE = /\b(id\s*[:=]?\s*)[A-Za-z0-9+/_-]{8,}={0,2}/g;

function coarseUserAgent(ua) {
  if (typeof ua !== 'string') return ua;
  const browser = ua.match(/\b(Edg|Chrome|Firefox|Version)\/(\d+)/);
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'other';
  return `${browser ? `${browser[1] === 'Version' ? 'Safari' : browser[1]}/${browser[2]}` : 'browser'} · ${os}`;
}

function deviceNames(rec) {
  const names = new Set();
  const visit = v => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(visit); return; }
    for (const [k, x] of Object.entries(v)) {
      if (k === 'deviceName' && typeof x === 'string' && x) names.add(x);
      else visit(x);
    }
  };
  visit(rec);
  return [...names].filter(n => !/^GAN cube|^smart cube|^cube( \d+)?$/i.test(n));
}

/** Return a copy of a recording with identifying details removed. */
export function anonymizeRecording(rec) {
  const names = deviceNames(rec).sort((a, b) => b.length - a.length);
  const alias = new Map(names.map((n, i) => [n, `${/^GAN/i.test(n) ? 'GAN' : 'smart'} cube${names.length > 1 ? ` ${i + 1}` : ''}`]));
  const scrub = str => {
    let out = str;
    for (const [real, fake] of alias) out = out.split(real).join(fake);
    return out.replace(MAC_RE, 'XX:XX:XX:XX:XX:XX').replace(DEVICE_ID_RE, '$1[redacted]');
  };
  const walk = v => {
    if (typeof v === 'string') return scrub(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const copy = walk(rec);
  if (copy.env?.userAgent) copy.env = { ...copy.env, userAgent: coarseUserAgent(rec.env.userAgent) };
  copy.privacy = { anonymized: true, devices: alias.size };
  return copy;
}

export function parseRecording(text) {
  const data = typeof text === 'string' ? JSON.parse(text) : text;
  if (!data || data.format !== RECORDING_FORMAT || !Array.isArray(data.events)) throw new Error('Not a CubeSight recording.');
  return data;
}

/**
 * A recorded read of a non-deterministic input (e.g. the held orientation).
 * Live: compute, record, return. Replay: return the next recorded value.
 */
export function recordRead(kind, compute) {
  if (replayHooks?.read) return replayHooks.read(kind, compute);
  const value = compute();
  record('read', { kind, value });
  return value;
}

// ---------------------------------------------------------------------------
// Device-adapter seam.

/**
 * Wrap a `connectDevice(options)` adapter so the handshake, every raw event
 * from `events$`, every command and disconnect are recorded verbatim.
 * The inner adapter is called synchronously (Web Bluetooth needs the click's
 * user activation).
 */
export function recordingConnectDevice(connectDevice) {
  return function connectRecorded(options = {}) {
    const conn = ++connectionCounter;
    header = [];
    record('connect-start', { conn, reconnect: Boolean(options.reconnect), gesture: Boolean(options.gesture) }, { pin: true });
    const wrappedOptions = {
      ...options,
      onStatus: detail => {
        record('status', { conn, detail });
        return options.onStatus?.(detail);
      },
      // Library progress lines the adapter only logs (not shown by the session).
      onDeviceStatus: detail => { record('status', { conn, detail, channel: 'device' }); },
    };
    let pending;
    try { pending = connectDevice(wrappedOptions); }
    catch (error) { record('connect-error', { conn, error }); throw error; }
    return Promise.resolve(pending).then(connection => {
      record('connected', {
        conn,
        deviceName: connection?.deviceName,
        deviceMAC: connection?.deviceMAC ? String(connection.deviceMAC).replace(/[\da-f]{2}(?=:)/gi, 'XX') : connection?.deviceMAC,
        protocol: connection?.protocol,
        capabilities: connection?.capabilities,
      }, { pin: true });
      return wrapConnection(connection, conn);
    }, error => {
      record('connect-error', { conn, error });
      header = [];
      throw error;
    });
  };
}

function wrapConnection(connection, conn) {
  if (!connection) return connection;
  const events$ = {
    subscribe(observer) {
      const target = typeof observer === 'function' ? { next: observer } : (observer || {});
      return connection.events$.subscribe({
        next: event => {
          const t = record('cube-event', { conn, event });
          return withClock(t, () => target.next?.(event));
        },
        error: error => {
          const t = record('cube-error', { conn, error });
          return withClock(t, () => target.error?.(error));
        },
        complete: () => {
          const t = record('cube-complete', { conn });
          return withClock(t, () => target.complete?.());
        },
      });
    },
  };
  const sendCommand = command => {
    const id = ++commandCounter;
    record('command', { conn, id, command });
    let result;
    try { result = connection.sendCommand(command); }
    catch (error) { record('command-result', { conn, id, ok: false, error }); throw error; }
    return Promise.resolve(result).then(value => { record('command-result', { conn, id, ok: true, value }); return value; },
      error => { record('command-result', { conn, id, ok: false, error }); throw error; });
  };
  const disconnect = () => {
    record('device-disconnect', { conn });
    if (header.some(h => h.data?.conn === conn)) header = [];
    return connection.disconnect();
  };
  const overrides = { events$, sendCommand, disconnect };
  return new Proxy(connection, {
    get(obj, prop) {
      if (Object.hasOwn(overrides, prop)) return overrides[prop];
      const value = Reflect.get(obj, prop, obj);
      return typeof value === 'function' ? value.bind(obj) : value;
    },
  });
}

// ---------------------------------------------------------------------------
// User-action seams.

function wrapCalls(target, kind, methods) {
  const out = Object.create(null);
  for (const key of Object.keys(target)) out[key] = target[key];
  for (const method of methods) {
    const original = target[method];
    if (typeof original !== 'function') continue;
    out[method] = (...args) => {
      const t = record(kind, { method, args });
      try {
        const result = withClock(t, () => original(...args));
        if (result && typeof result.then === 'function') {
          return result.then(v => v, error => { record(`${kind}-error`, { method, error }); throw error; });
        }
        return result;
      } catch (error) {
        record(`${kind}-error`, { method, error });
        throw error;
      }
    };
  }
  return out;
}

/** Record connect/syncSolved/disconnect calls on a session (and its phase changes, for divergence checks). */
export function recordSessionCalls(session) {
  const wrapped = wrapCalls(session, 'session.call', ['connect', 'syncSolved', 'disconnect', 'reconnect']);
  let lastKey = null;
  session.subscribe(snap => {
    // Every state transition a replay must reproduce: phase, link health
    // (lost / reconnecting / up), re-baselines, finished reconnect checks and
    // the facelet-check verdict.
    const link = snap.link?.status ?? 'none';
    const key = [snap.phase, link, snap.resync?.seq ?? 0, snap.reconnectEvent?.seq ?? 0, snap.sync?.status ?? ''].join('|');
    if (key !== lastKey) {
      lastKey = key;
      record('observe.session', {
        phase: snap.phase, moves: snap.moves?.length ?? 0, lastMove: snap.lastMove ?? null, detail: snap.detail,
        link, resync: snap.resync?.seq ?? 0, reconnect: snap.reconnectEvent ? { seq: snap.reconnectEvent.seq, match: snap.reconnectEvent.match } : null,
        sync: snap.sync?.status ?? null,
      });
    }
  });
  return wrapped;
}

/** Record calls into the live tracker (start guided with its exact scramble, free, cancel, settings). */
export function recordLiveCalls(live) {
  const wrapped = wrapCalls(live, 'live.call', ['startGuided', 'startFree', 'cancel', 'setPseudo', 'setInspection', 'resume', 'setInterruptPolicy']);
  let lastPhase = null;
  live.subscribe(snap => {
    if (snap.phase !== lastPhase) {
      lastPhase = snap.phase;
      record('observe.live', {
        phase: snap.phase, mode: snap.mode, solveMoveCount: snap.solveMoveCount,
        ...(snap.interrupted ? { interrupted: { from: snap.interrupted.from, canResume: snap.interrupted.canResume } } : {}),
        ...(snap.notice ? { notice: snap.notice } : {}),
        ...(snap.record ? { result: { solveMs: snap.record.solveMs, hostSolveMs: snap.record.hostSolveMs, timing: snap.record.timing, penalty: snap.record.penalty, flags: snap.record.flags } } : {}),
      });
    }
  });
  return wrapped;
}

// Browser-side runtime errors are external inputs to debugging too.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('error', e => record('runtime-error', { message: e.message, error: e.error }));
  window.addEventListener('unhandledrejection', e => record('runtime-error', { message: 'unhandledrejection', error: e.reason }));
}
