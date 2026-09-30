import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSmartCubeSession } from '../src/smart-cube-session.js';
import { createSolveLive } from '../src/solve-live.js';
import { applyMoves, createSolvedState, sameCubeState, stateFromScramble } from '../src/cross-cube.js';
import { faceletsFromState, sameCornersAndEdges, stateFromFacelets } from '../src/facelets-state.js';
import { cubeClockModulus, cubeElapsedMs, truncateToHundredths } from '../src/cube-clock.js';
import { fmtTime } from '../src/brain/format.js';
import { deviceFor, screenFor } from '../src/brain/view-model.js';
import {
  recordingConnectDevice, recordSessionCalls, recordLiveCalls, setCheckpointProvider, resetRecording, serializeRecording,
  now as recorderNow,
} from '../src/recorder.js';
import { createManualDevice } from '../src/recording-replay.js';
import { replayHeadless } from '../src/recording-harness.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const quiet = () => { const log = console.log, error = console.error; console.log = () => {}; console.error = () => {}; return () => { console.log = log; console.error = error; }; };
const FACE_INDEX = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
const OPTIONS = { periodicCheckMs: 0, autoReconnect: { delaysMs: [1000, 2000, 4000] } };

// Virtual time shared by the session and the live tracker.
function virtualClock() {
  let t = 1000;
  const timers = [];
  return {
    now: () => t,
    schedule(fn, ms) { const timer = { at: t + ms, fn, cancelled: false }; timers.push(timer); return () => { timer.cancelled = true; }; },
    tick(ms) {
      const end = t + ms;
      for (;;) {
        const next = timers.filter(x => !x.cancelled && x.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        timers.splice(timers.indexOf(next), 1);
        t = next.at;
        next.fn();
      }
      t = end;
    },
  };
}

// A GAN cube with a physical state of its own: the facelets it reports are its
// real position, whatever the app managed to track. `drop(move)` turns the
// cube but loses the packet; `disconnect()` emits the library's DISCONNECT.
function physicalCube({ protocol = 'GAN Gen4', options = OPTIONS } = {}) {
  const clock = virtualClock();
  let physical = createSolvedState();
  let onNext = null;
  let serial = 0;
  let cubeTs = 50000;
  let failures = 0;
  const attempts = [];
  const commands = [];
  const makeConnection = () => ({
    deviceName: 'GAN test cube', protocol: { name: protocol }, capabilities: { facelets: true },
    events$: { subscribe(observer) { onNext = observer.next; return { unsubscribe() { onNext = null; } }; } },
    async sendCommand(command) {
      commands.push(command.type);
      if (command.type === 'REQUEST_FACELETS') queueMicrotask(() => onNext?.({ type: 'FACELETS', facelets: faceletsFromState(physical) }));
    },
    async disconnect() {},
  });
  const session = createSmartCubeSession(async connectOptions => {
    attempts.push(connectOptions);
    if (failures > 0) { failures--; throw new Error('cube not found'); }
    return makeConnection();
  }, { ...options, now: clock.now, schedule: clock.schedule });
  const cube = {
    clock, session, attempts, commands,
    get physical() { return physical; },
    failNext(n) { failures = n; },
    // One quarter/half turn as the library reports it.
    turn(move, { gap = 1000, dt = gap, stamps = true, recovered = false } = {}) {
      clock.tick(dt);
      cubeTs += gap;
      serial = (serial + 1) & 0xff;
      physical = applyMoves(physical, [move]);
      onNext({
        type: 'MOVE', move, face: FACE_INDEX[move[0]], direction: move.endsWith("'") ? 1 : 0,
        serial, cubeTimestamp: stamps ? cubeTs : null, localTimestamp: recovered ? null : clock.now(),
      });
    },
    // The cube turns but the packet never arrives.
    lose(move, { gap = 1000, dt = gap } = {}) { clock.tick(dt); cubeTs += gap; serial = (serial + 1) & 0xff; physical = applyMoves(physical, [move]); },
    setCubeClock(value) { cubeTs = value; },
    skipSerial(n = 1) { serial = (serial + n) & 0xff; },
    emit(event) { onNext(event); },
    disconnect() { onNext({ type: 'DISCONNECT' }); },
    async connect() { await session.connect(); await flush(); assert.equal(session.getSnapshot().phase, 'tracking'); },
    async settle(ms = 0) { clock.tick(ms); await flush(); },
  };
  return cube;
}

// Scramble with a free-solve tracker, then solve with `solution` (hardware stamps `gap` ms apart).
function startSolve(cube, scramble = 'R U') {
  const live = createSolveLive(cube.session, { now: cube.clock.now });
  live.setInspection({ enabled: false });
  for (const move of scramble.split(' ')) cube.turn(move, { gap: 300 });
  live.startFree();
  return live;
}

// --- Facelets <-> state ---------------------------------------------------------------------

test('facelets round-trip through the cubie state model', () => {
  for (const scramble of ['', 'R', "R U R' U'", "F2 D' L B2 U R' D2 F L2 B' U2", "R U R' U' R' F R2 U' R' U' R U R' F'"]) {
    const state = stateFromScramble(scramble);
    const facelets = faceletsFromState(state);
    assert.equal(facelets.length, 54);
    assert.ok(sameCubeState(stateFromFacelets(facelets), state), scramble);
  }
  assert.equal(faceletsFromState(createSolvedState()), 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  assert.equal(stateFromFacelets('UUUUUUUUU'), null);
  assert.equal(stateFromFacelets('U'.repeat(54)), null, 'an impossible cube is rejected');
});

test('corner/edge comparison ignores centres', () => {
  const tracked = stateFromScramble('R U');
  const centresTurned = { cubies: tracked.cubies.map(cubie => cubie.id === 'U' ? { ...cubie, stickers: { U: 'red' } } : cubie) };
  assert.ok(!sameCubeState(centresTurned, tracked));
  assert.ok(sameCornersAndEdges(centresTurned, tracked), 'a slice-turned centre is not a disagreement');
  assert.ok(sameCornersAndEdges(stateFromScramble('R U'), applyMoves(createSolvedState(), ['R', 'U'])));
  assert.ok(!sameCornersAndEdges(stateFromScramble('R U'), stateFromScramble('R')));
});

// --- Hardware timing ------------------------------------------------------------------------

test('cube clock: wraparound is unwrapped against the host clock', () => {
  assert.equal(cubeClockModulus('GAN Gen4'), 2 ** 32);
  assert.equal(cubeClockModulus('GAN Gen2'), null);
  assert.equal(cubeClockModulus('GAN Gen1'), 65536);
  assert.equal(cubeElapsedMs(2 ** 32 - 500, 2000, 2500, 2 ** 32), 2500);
  assert.equal(cubeElapsedMs(65000, 2000, 2400, 65536), 2536);           // 16-bit wrap inside tolerance of host
  assert.equal(cubeElapsedMs(10, 90000, 90100, 65536), 89990, 'a solve longer than one 16-bit wrap counts the wrap');
  assert.equal(cubeElapsedMs(5000, 1000, 1000, null), null, 'a non-wrapping clock never runs backwards');
  assert.equal(cubeElapsedMs(0, 9000, 2000, 2 ** 32), null, 'implausible against the host clock');
  assert.equal(cubeElapsedMs(null, 10, 10), null);
});

test('official time comes from the cube clock, across a 32-bit wrap', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    cube.setCubeClock(2 ** 32 - 1800);          // wraps during the solve
    const live = startSolve(cube);
    cube.turn("U'", { gap: 1000, dt: 1040 });   // first solving move: hardware start
    cube.turn("R'", { gap: 1500, dt: 1530 });   // solved: 1500 cube ms after the start, 1530 host ms
    const r = live.getSnapshot().record;
    assert.equal(live.getSnapshot().phase, 'done');
    assert.equal(r.timing, 'cube');
    assert.equal(r.solveMs, 1500);
    assert.equal(r.hostSolveMs, 1530);
    assert.equal(r.moveCount, 2);
    assert.ok(Math.abs(r.tps - 2 / 1.5) < 1e-9, 'TPS uses the official time');
  } finally { restore(); }
});

test('an unusable cube clock falls back to host time', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    let live = startSolve(cube);
    cube.turn("U'", { gap: 1000, dt: 1000 });
    cube.turn("R'", { gap: 9000, dt: 1200 });     // cube says 9 s, host says 1.2 s
    let r = live.getSnapshot().record;
    assert.equal(r.timing, 'host');
    assert.equal(r.solveMs, 1200);
    assert.equal(r.hostSolveMs, 1200);

    live = startSolve(cube);
    cube.turn("U'", { stamps: false, dt: 1000 }); // recovered move without a stamp
    cube.turn("R'", { gap: 1000, dt: 1000 });
    r = live.getSnapshot().record;
    assert.equal(r.timing, 'host');
    assert.equal(r.solveMs, 1000);
  } finally { restore(); }
});

test('displayed times are truncated to hundredths, never rounded', async () => {
  assert.equal(fmtTime(12349), '12.34');
  assert.equal(fmtTime(12999.9), '12.99');
  assert.equal(fmtTime(9995), '9.99');
  assert.equal(fmtTime(60009), '1:00.00');
  assert.equal(truncateToHundredths(12349), 12340);
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    const live = startSolve(cube);
    cube.turn("U'", { gap: 1000, dt: 1000 });
    cube.turn("R'", { gap: 3999, dt: 4000 });
    assert.equal(live.getSnapshot().record.solveMs, 3999);
    assert.equal(fmtTime(live.getSnapshot().record.solveMs), '3.99');
  } finally { restore(); }
});

// --- Interrupted solve ---------------------------------------------------------------------

test('a disconnect mid-solve interrupts the attempt: no running clock, connection lost, resume offered', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube({ options: { periodicCheckMs: 0, autoReconnect: null } });
    await cube.connect();
    const live = startSolve(cube, "R U R'");
    cube.turn("R", { gap: 500, dt: 500 });
    assert.equal(live.getSnapshot().phase, 'solving');
    cube.clock.tick(700);
    cube.disconnect();
    let snap = live.getSnapshot();
    assert.equal(snap.phase, 'interrupted');
    assert.equal(snap.interrupted.from, 'solving');
    assert.equal(snap.interrupted.canResume, false);
    const frozen = snap.elapsedMs;
    assert.equal(frozen, 700);
    cube.clock.tick(30000);
    assert.equal(live.getSnapshot().elapsedMs, frozen, 'the clock does not run while the connection is lost');
    assert.equal(live.getSnapshot().phase, 'interrupted');
    assert.equal(cube.session.getSnapshot().link.status, 'lost');
    assert.equal(live.resume(), false, 'cannot resume before the cube is back');
  } finally { restore(); }
});

test('a disconnect during inspection interrupts it too, and a user disconnect does the same', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    const live = createSolveLive(cube.session, { now: cube.clock.now });
    for (const move of ['R', 'U']) cube.turn(move, { gap: 300 });
    live.startFree();
    assert.equal(live.getSnapshot().phase, 'inspecting');
    cube.disconnect();
    assert.equal(live.getSnapshot().phase, 'interrupted');
    assert.equal(live.getSnapshot().inspection, null);
    live.cancel();
    assert.equal(live.getSnapshot().phase, 'idle');
    await cube.session.disconnect();

    // A deliberate disconnect during a solve is an interruption as well.
    const cube2 = physicalCube();
    await cube2.connect();
    const live2 = startSolve(cube2);
    cube2.turn("U'", { gap: 500 });
    await cube2.session.disconnect();
    assert.equal(live2.getSnapshot().phase, 'interrupted');
    assert.equal(cube2.session.getSnapshot().link.status, 'none', 'no auto-reconnect after a deliberate disconnect');
  } finally { restore(); }
});

test('reconnect with matching facelets resumes the solve and flags it', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    const live = startSolve(cube);
    cube.turn("U'", { gap: 500 });
    cube.disconnect();
    assert.equal(live.getSnapshot().phase, 'interrupted');
    assert.equal(cube.session.getSnapshot().link.status, 'lost');
    await cube.settle(1000);                      // the first retry fires
    await flush();
    const after = cube.session.getSnapshot();
    assert.equal(after.phase, 'tracking', 'no solved cube needed to come back');
    assert.equal(after.reconnectEvent.match, true);
    assert.equal(cube.attempts.at(-1).reconnect, true);
    assert.equal(live.getSnapshot().phase, 'solving', 'auto-resumed');
    cube.setCubeClock(1000);                      // a fresh connection: a new cube clock
    cube.turn("R'", { gap: 500, dt: 600 });
    const r = live.getSnapshot().record;
    assert.equal(live.getSnapshot().phase, 'done');
    assert.equal(r.timing, 'host', 'a solve that spans a reconnect cannot use the cube clock');
    assert.deepEqual(r.flags, ['interrupted']);
    assert.equal(r.interruptions.count, 1);
    assert.ok(r.interruptions.ms >= 1000);
  } finally { restore(); }
});

test('with autoResume off the solve waits for an explicit resume', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    const live = startSolve(cube);
    live.setInterruptPolicy({ autoResume: false });
    cube.turn("U'", { gap: 500 });
    cube.disconnect();
    await cube.settle(1000);
    assert.equal(live.getSnapshot().phase, 'interrupted');
    assert.equal(live.getSnapshot().interrupted.canResume, true);
    assert.equal(live.resume(), true);
    assert.equal(live.getSnapshot().phase, 'solving');
  } finally { restore(); }
});

test('reconnect with different facelets discards the attempt by default, never continuing silently', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    const live = startSolve(cube);
    cube.turn("U'", { gap: 500 });
    cube.disconnect();
    cube.lose('F');                               // turned while disconnected
    await cube.settle(1000);
    const after = cube.session.getSnapshot();
    assert.equal(after.phase, 'tracking');
    assert.equal(after.reconnectEvent.match, false);
    assert.ok(sameCubeState(after.state, cube.physical), 're-baselined from the cube\'s facelets');
    assert.equal(live.getSnapshot().phase, 'idle');
    assert.match(live.getSnapshot().notice, /discarded/i);
    assert.equal(live.getSnapshot().record, null);
  } finally { restore(); }
});

test('reconnect with different facelets can mark the solve DNF-by-disconnect instead', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    const live = startSolve(cube);
    live.setInterruptPolicy({ onMismatch: 'dnf' });
    cube.turn("U'", { gap: 500 });
    cube.clock.tick(300);
    cube.disconnect();
    cube.lose('F');
    await cube.settle(1000);
    const snap = live.getSnapshot();
    assert.equal(snap.phase, 'done');
    assert.equal(snap.record.penalty, 'DNF');
    assert.equal(snap.record.solved, false);
    assert.ok(snap.record.flags.includes('disconnect'));
  } finally { restore(); }
});

test('the same facelets but a different position is also a mismatch when the cube was solved meanwhile', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    const live = startSolve(cube);
    cube.turn("U'", { gap: 500 });
    cube.disconnect();
    cube.lose("R'");                              // finished the solve while the link was down
    await cube.settle(1000);
    assert.equal(live.getSnapshot().phase, 'idle', 'an unobserved finish is not a result');
  } finally { restore(); }
});

test('the Brain shows connection lost, a one-tap reconnect and a resume', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube({ options: { periodicCheckMs: 0, autoReconnect: null } });
    await cube.connect();
    const live = startSolve(cube);
    live.setInterruptPolicy({ autoResume: false });
    cube.turn("U'", { gap: 500 });
    cube.disconnect();
    assert.equal(screenFor(cube.session.getSnapshot(), live.getSnapshot()), 'disconnected');
    const lost = deviceFor(cube.session.getSnapshot(), true, live.getSnapshot());
    assert.equal(lost.actions.reconnect, true);
    assert.equal(lost.actions.resume, false);
    assert.match(lost.detail, /Connection lost/);
    assert.equal(await cube.session.reconnect(), true);
    await flush();
    const back = deviceFor(cube.session.getSnapshot(), true, live.getSnapshot());
    assert.equal(back.actions.resume, true);
    assert.equal(screenFor(cube.session.getSnapshot(), live.getSnapshot()), 'disconnected', 'paused until resumed');
    live.resume();
    assert.equal(screenFor(cube.session.getSnapshot(), live.getSnapshot()), 'solving');
  } finally { restore(); }
});

// --- Auto-reconnect ---------------------------------------------------------------------------

test('auto-reconnect retries with backoff, then offers a one-tap reconnect', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    cube.disconnect();
    let link = cube.session.getSnapshot().link;
    assert.deepEqual([link.status, link.attempt, link.maxAttempts, link.retryAt], ['lost', 0, 3, cube.clock.now() + 1000]);
    cube.failNext(10);
    await cube.settle(1000); await flush();
    assert.equal(cube.attempts.length, 2, 'first automatic attempt (the initial connect is attempt 0)');
    assert.equal(cube.attempts.at(-1).gesture, false, 'automatic attempts need no user gesture');
    assert.equal(cube.session.getSnapshot().link.retryAt, cube.clock.now() + 2000, 'backoff doubles');
    await cube.settle(2000); await flush();
    await cube.settle(4000); await flush();
    assert.equal(cube.attempts.length, 4);
    link = cube.session.getSnapshot().link;
    assert.equal(link.status, 'lost');
    assert.equal(link.needsGesture, true, 'gave up: show Reconnect');
    assert.equal(cube.session.getSnapshot().phase, 'disconnected');
    await cube.settle(60000); await flush();
    assert.equal(cube.attempts.length, 4, 'bounded retries');

    // The one-tap reconnect is a gesture and verifies the cube against the kept position.
    cube.failNext(0);
    assert.equal(await cube.session.reconnect(), true);
    await flush();
    assert.equal(cube.attempts.at(-1).gesture, true);
    assert.equal(cube.session.getSnapshot().phase, 'tracking');
    assert.equal(cube.session.getSnapshot().link.status, 'up');
  } finally { restore(); }
});

test('an adapter that needs a gesture stops the automatic retries', async () => {
  const restore = quiet();
  try {
    const clock = virtualClock();
    let onNext;
    let calls = 0;
    const session = createSmartCubeSession(async () => {
      calls++;
      if (calls > 1) throw Object.assign(new Error('needs a tap'), { needsGesture: true });
      return { deviceName: 'GAN', protocol: { name: 'GAN Gen4' }, capabilities: { facelets: true },
        events$: { subscribe(o) { onNext = o.next; return { unsubscribe() {} }; } },
        async sendCommand() { queueMicrotask(() => onNext({ type: 'FACELETS', facelets: faceletsFromState(createSolvedState()) })); }, async disconnect() {} };
    }, { ...OPTIONS, now: clock.now, schedule: clock.schedule });
    await session.connect(); await flush();
    onNext({ type: 'DISCONNECT' });
    clock.tick(1000); await flush();
    assert.equal(calls, 2);
    assert.equal(session.getSnapshot().link.needsGesture, true);
    clock.tick(60000); await flush();
    assert.equal(calls, 2);
  } finally { restore(); }
});

// --- Desync detection ------------------------------------------------------------------------

test('a serial gap triggers a facelet check; matching facelets change nothing', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    cube.turn('R', { gap: 300 });
    cube.turn('U', { gap: 300 });
    const before = cube.commands.length;
    cube.skipSerial();                             // a packet was dropped (it carried no turn)
    cube.turn('F', { gap: 300 });
    assert.ok(cube.session.getSnapshot().sync.gaps >= 1);
    await cube.settle(700); await flush();
    assert.ok(cube.commands.length > before, 'facelets were requested');
    const snap = cube.session.getSnapshot();
    assert.equal(snap.sync.status, 'ok');
    assert.equal(snap.resync, null);
    assert.ok(sameCubeState(snap.state, cube.physical));
  } finally { restore(); }
});

test('a serial gap with a real difference re-baselines once the cube is quiet (two agreeing reports)', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    cube.turn('R', { gap: 300 });
    cube.lose('U');                                // never seen
    cube.turn('F', { gap: 300 });                  // serial gap
    assert.ok(!sameCubeState(cube.session.getSnapshot().state, cube.physical));
    await cube.settle(600); await flush();         // first report: suspect
    assert.equal(cube.session.getSnapshot().sync.status, 'suspect');
    assert.equal(cube.session.getSnapshot().resync, null, 'one report never replaces the tracked state');
    await cube.settle(600); await flush();         // second report: confirmed
    const snap = cube.session.getSnapshot();
    assert.equal(snap.sync.status, 'rebaselined');
    assert.equal(snap.resync.seq, 1);
    assert.ok(sameCubeState(snap.state, cube.physical));
    assert.deepEqual(snap.moves, []);
    // Tracking continues correctly from the new baseline.
    cube.turn("F'", { gap: 300 });
    assert.ok(sameCubeState(cube.session.getSnapshot().state, cube.physical));
  } finally { restore(); }
});

test('the serial wraps modulo 256 without a false gap, and a library-recovered move is checked', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    for (let i = 0; i < 300; i++) cube.turn(i % 2 ? "R'" : 'R', { gap: 200 });
    assert.equal(cube.session.getSnapshot().sync.gaps, 0, 'wrapping 255 -> 0 is not a gap');
    cube.turn('U', { gap: 200, recovered: true });  // localTimestamp null: the library filled a hole
    assert.equal(cube.session.getSnapshot().sync.gaps, 1);
    await cube.settle(700); await flush();
    assert.equal(cube.session.getSnapshot().sync.status, 'ok');
  } finally { restore(); }
});

test('a mismatch inside a solve flags the solve and lets it finish from the cube\'s own state', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube();
    await cube.connect();
    const live = startSolve(cube);
    cube.lose("U'");                               // the first solving move is lost
    cube.turn("R'", { gap: 400 });                 // tracked state is now wrong
    assert.equal(live.getSnapshot().phase, 'solving');
    await cube.settle(600); await flush();
    await cube.settle(600); await flush();
    const snap = live.getSnapshot();
    assert.equal(snap.phase, 'done', 'the cube is physically solved');
    assert.ok(snap.record.flags.includes('desync'));
    assert.equal(snap.record.timing, 'host', 'a flagged solve is never hardware-timed');
  } finally { restore(); }
});

test('an idle facelet check runs periodically, and only when the cube is at rest', async () => {
  const restore = quiet();
  try {
    const cube = physicalCube({ options: { periodicCheckMs: 10000, autoReconnect: null } });
    await cube.connect();
    const requests = () => cube.commands.filter(c => c === 'REQUEST_FACELETS').length;
    const gyro = () => cube.emit({ type: 'GYRO', quaternion: { x: 0, y: 0, z: 0, w: 1 } });   // any cube event drives the check
    const base = requests();
    cube.clock.tick(9000); gyro();
    assert.equal(requests(), base, 'not before the interval');
    cube.clock.tick(2000); gyro(); await flush();
    assert.equal(requests(), base + 1, 'one idle check');
    assert.equal(cube.session.getSnapshot().sync.status, 'ok');
    cube.clock.tick(10000);
    cube.turn('R', { gap: 100, dt: 10 });
    gyro();
    assert.equal(requests(), base + 1, 'never while the cube is being turned');
    cube.clock.tick(2500); gyro(); await flush();
    assert.equal(requests(), base + 2);
  } finally { restore(); }
});

// --- Replay ----------------------------------------------------------------------------------

test('a recorded disconnect scenario replays to the same phases, link states and result', async () => {
  const restore = quiet();
  resetRecording();
  const device = createManualDevice({ deviceName: 'GAN test cube', protocol: { id: 'gan-gen4', name: 'GAN Gen4' }, capabilities: { gyroscope: true, battery: true, facelets: true, hardware: false, reset: false } });
  const session = recordSessionCalls(createSmartCubeSession(recordingConnectDevice(device.connectDevice), { ...OPTIONS, autoReconnect: { delaysMs: [30, 60] }, now: recorderNow }));
  setCheckpointProvider(() => session.getSnapshot());
  const live = recordLiveCalls(createSolveLive(session, { now: recorderNow }));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let physical = createSolvedState();
  const turn = (move, ts) => { physical = applyMoves(physical, [move]); device.setFacelets(faceletsFromState(physical)); device.move(move, ts); };

  await session.connect();
  await flush();
  live.setInspection({ enabled: false });
  turn('R', 100); turn('U', 400);
  live.startFree();
  turn("U'", 900);
  await sleep(5);
  device.emit({ type: 'DISCONNECT' });              // the link drops mid-solve
  assert.equal(live.getSnapshot().phase, 'interrupted');
  await sleep(120);                                 // automatic reconnect (first retry at 30 ms)
  assert.equal(session.getSnapshot().phase, 'tracking');
  assert.equal(live.getSnapshot().phase, 'solving');
  turn("R'", 400);                                  // the solve finishes on a fresh cube clock
  assert.equal(live.getSnapshot().phase, 'done');
  const liveSnap = live.getSnapshot();
  const json = serializeRecording();
  await session.disconnect();
  live.detach();

  const recording = JSON.parse(json);
  assert.ok(recording.events.some(e => e.kind === 'observe.live' && e.data.phase === 'interrupted'));
  assert.ok(recording.events.some(e => e.kind === 'observe.session' && e.data.link === 'lost'));
  assert.ok(recording.events.filter(e => e.kind === 'connect-start').some(e => e.data.reconnect === true), 'the automatic reconnect is recorded');

  const result = await replayHeadless(recording, { sessionOptions: { ...OPTIONS, autoReconnect: { delaysMs: [30, 60] } } });
  restore();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.mismatches, []);
  assert.deepEqual(result.divergences, []);
  assert.deepEqual(result.recordedLivePhases, ['idle', 'inspecting', 'solving', 'interrupted', 'solving', 'done']);
  assert.ok(result.livePhases.includes('interrupted'));
  assert.equal(result.live.phase, 'done');
  assert.deepEqual(result.live.record.flags, liveSnap.record.flags);
  assert.equal(result.live.record.solveMs, liveSnap.record.solveMs);
  assert.ok(result.ok);
});
