import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSmartCubeSession } from '../src/smart-cube-session.js';
import { applyMoves, createSolvedState, sameCubeState, stateFromScramble } from '../src/cross-cube.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

function fakeCube() {
  let onNext = null;
  let facelets = SOLVED;
  let disconnected = false;
  const connection = {
    deviceName: 'GAN test cube',
    protocol: { name: 'GAN Gen4' },
    capabilities: { facelets: true },
    events$: { subscribe(observer) { onNext = observer.next; return { unsubscribe() { onNext = null; } }; } },
    async sendCommand(command) {
      if (command.type === 'REQUEST_FACELETS') queueMicrotask(() => onNext({ type: 'FACELETS', facelets }));
    },
    async disconnect() { disconnected = true; },
  };
  return {
    connection,
    connect: () => Promise.resolve(connection),
    emit: (event) => onNext(event),
    setFacelets: (value) => { facelets = value; },
    wasDisconnected: () => disconnected,
  };
}

const UP = String.fromCharCode(39);

test('smart cube tracks canonical moves only after a solved baseline', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  device.setFacelets(`R${SOLVED.slice(1)}`);
  await session.connect();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.getSnapshot().phase, 'awaiting-solved');
  device.emit({ type: 'MOVE', move: 'R' });
  assert.deepEqual(session.getSnapshot().moves, []);
  device.setFacelets(SOLVED);
  await session.syncSolved();
  assert.equal(session.getSnapshot().phase, 'tracking');
  device.emit({ type: 'MOVE', move: 'R', face: 1, direction: 0, serial: 1, cubeTimestamp: 1, localTimestamp: 1 });
  assert.deepEqual(session.getSnapshot().moves, ['R']);
  assert.ok(sameCubeState(session.getSnapshot().state, stateFromScramble('R')));
  device.emit({ type: 'MOVE', move: `R${UP}`, cubeTimestamp: 500 });
  assert.deepEqual(session.getSnapshot().moves, []);
  assert.ok(sameCubeState(session.getSnapshot().state, stateFromScramble('')));
  await session.disconnect();
  assert.equal(session.getSnapshot().phase, 'disconnected');
  assert.ok(device.wasDisconnected());
});

test('a still-scrambled cube cannot be used as a solved baseline', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  device.setFacelets(`R${SOLVED.slice(1)}`);
  await session.connect();
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(session.syncSolved(), /not solved/i);
  assert.equal(session.getSnapshot().phase, 'awaiting-solved');
  await session.disconnect();
});

test('wide/slice moves are tracked (not desynced)', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  const seen = [];
  session.subscribeEvents((event) => seen.push(event));
  await session.connect();
  await new Promise((resolve) => setImmediate(resolve));
  await session.syncSolved();
  const sent = [];
  for (const move of ['Uw', 'M', `Rw${UP}`, 'E2', `S${UP}`]) {
    device.emit({ type: 'MOVE', move, cubeTimestamp: sent.length * 1000 });
    sent.push(move);
    assert.equal(seen.at(-1).move, move);
    assert.equal(session.getSnapshot().phase, 'tracking', 'wide/slice moves are tracked, not desynced');
    assert.deepEqual(session.getSnapshot().moves, sent);
    assert.ok(sameCubeState(session.getSnapshot().state, applyMoves(createSolvedState(), sent)));
  }
  await session.disconnect();
});

test('an unknown move stops trusted tracking instead of corrupting state', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  await session.connect();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.getSnapshot().phase, 'tracking');
  for (const bogus of ['x', `R2${UP}`, 'R U']) {
    device.emit({ type: 'MOVE', move: bogus });
    assert.equal(session.getSnapshot().phase, 'desynced', `${bogus} desyncs`);
    assert.deepEqual(session.getSnapshot().moves, []);
    await session.syncSolved();
  }
  await session.disconnect();
});

test('gyro readings publish a validated orientation and clear on disconnect', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  await session.connect();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.getSnapshot().phase, 'tracking');
  const valid = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
  device.emit({ type: 'GYRO', quaternion: valid });
  assert.deepEqual(session.getSnapshot().gyro, valid);
  // Non-finite components, a zero-length quaternion, or a missing one are bogus.
  for (const quaternion of [{ x: NaN, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0, w: 0 }, { x: 0, y: Infinity, z: 0, w: 1 }, undefined]) {
    device.emit({ type: 'GYRO', quaternion });
    assert.deepEqual(session.getSnapshot().gyro, valid, 'a bogus gyro is ignored');
  }
  // A 180-degree turn about z (w = 0) is a legitimate unit quaternion.
  const halfTurn = { x: 0, y: 0, z: 1, w: 0 };
  device.emit({ type: 'GYRO', quaternion: halfTurn });
  assert.deepEqual(session.getSnapshot().gyro, halfTurn);
  await session.disconnect();
  assert.equal(session.getSnapshot().gyro, null);
});

test('diagnostic subscribers see decoded moves before sync without altering trusted state', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  const observations = [];
  session.subscribeEvents((event) => observations.push(event));
  await session.connect();
  await new Promise((resolve) => setImmediate(resolve));
  device.emit({ type: 'MOVE', move: 'R', face: 1, direction: 0, serial: 1, cubeTimestamp: 1, localTimestamp: 1 });
  assert.equal(observations.at(-1).move, 'R');
  await session.disconnect();
});

test('a U then U-prime does not coalesce as a double', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  await session.connect();
  await new Promise((r) => setImmediate(r));
  device.setFacelets(SOLVED);
  await session.syncSolved();
  device.emit({ type: 'MOVE', move: 'U', face: 0, direction: 0, cubeTimestamp: 100 });
  device.emit({ type: 'MOVE', move: 'U' + UP, face: 0, direction: 1, cubeTimestamp: 108 });
  const snap = session.getSnapshot();
  assert.equal(snap.moves.length, 0);
  assert.equal(snap.lastMove, 'U' + UP);
});

test('two same-face same-direction quarter turns within the double window coalesce into one U2', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  await session.connect();
  await new Promise((r) => setImmediate(r));
  device.setFacelets(SOLVED);
  await session.syncSolved();
  assert.equal(session.getSnapshot().phase, 'tracking');
  device.emit({ type: 'MOVE', move: 'U', face: 0, direction: 0, cubeTimestamp: 100 });
  device.emit({ type: 'MOVE', move: 'U', face: 0, direction: 0, cubeTimestamp: 110 });
  const snap = session.getSnapshot();
  assert.equal(snap.moves.length, 1, 'a U2 counts as one move');
  assert.equal(snap.moves[0], 'U2');
  assert.equal(snap.lastMove, 'U2');
});

test('two same-face quarter turns outside the window stay separate', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  await session.connect();
  await new Promise((r) => setImmediate(r));
  device.setFacelets(SOLVED);
  await session.syncSolved();
  device.emit({ type: 'MOVE', move: 'U', face: 0, direction: 0, cubeTimestamp: 100 });
  device.emit({ type: 'MOVE', move: 'U', face: 0, direction: 0, cubeTimestamp: 1000 });
  const snap = session.getSnapshot();
  assert.equal(snap.moves.length, 2);
  assert.deepEqual(snap.moves, ['U', 'U']);
});

async function trackingSession() {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  await session.connect();
  await new Promise((r) => setImmediate(r));
  assert.equal(session.getSnapshot().phase, 'tracking');
  return { device, session };
}

test('two prime quarters within the double window coalesce into R2 (never R2-prime)', async () => {
  const { device, session } = await trackingSession();
  device.emit({ type: 'MOVE', move: 'U', cubeTimestamp: 0 });
  device.emit({ type: 'MOVE', move: `R${UP}`, cubeTimestamp: 100 });
  device.emit({ type: 'MOVE', move: `R${UP}`, cubeTimestamp: 130 });
  const snap = session.getSnapshot();
  assert.equal(snap.phase, 'tracking');
  assert.deepEqual(snap.moves, ['U', 'R2']);
  assert.equal(snap.lastMove, 'R2');
  assert.ok(sameCubeState(snap.state, stateFromScramble('U R2')));
  // A third quick R' is a new quarter, not folded into the double.
  device.emit({ type: 'MOVE', move: `R${UP}`, cubeTimestamp: 140 });
  assert.deepEqual(session.getSnapshot().moves, ['U', 'R2', `R${UP}`]);
  assert.ok(sameCubeState(session.getSnapshot().state, stateFromScramble(`U R2 R${UP}`)));
});

test('a throwing subscriber does not desync the session', async () => {
  const { device, session } = await trackingSession();
  const originalError = console.error;
  console.error = () => {};
  try {
    let calls = 0;
    session.subscribe((snap) => { if (snap.lastMove) { calls++; throw new Error('consumer bug'); } });
    const later = [];
    session.subscribe((snap) => later.push(snap.lastMove));
    device.emit({ type: 'MOVE', move: 'R', cubeTimestamp: 0 });
    device.emit({ type: 'MOVE', move: 'U', cubeTimestamp: 1000 });
    device.emit({ type: 'MOVE', move: `F${UP}`, cubeTimestamp: 2000 });
    const snap = session.getSnapshot();
    assert.equal(snap.phase, 'tracking');
    assert.deepEqual(snap.moves, ['R', 'U', `F${UP}`]);
    assert.ok(sameCubeState(snap.state, stateFromScramble(`R U F${UP}`)));
    assert.equal(calls, 3, 'the throwing subscriber still sees every move');
    assert.deepEqual(later.slice(-3), ['R', 'U', `F${UP}`], 'later subscribers still run');
  } finally {
    console.error = originalError;
  }
});

test('the move history always replays to the session state', async () => {
  let seed = 12345;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const bases = ['U', 'D', 'R', 'L', 'F', 'B', 'Rw', 'Uw', 'M', 'E', 'S'];
  for (let run = 0; run < 20; run++) {
    const { device, session } = await trackingSession();
    let ts = 0;
    let raw = createSolvedState();
    let previous = null;
    for (let i = 0; i < 120; i++) {
      // Bias towards repeats with short gaps so coalescing is exercised often.
      const move = previous && rand(3) === 0 ? previous : `${bases[rand(bases.length)]}${['', UP, '2'][rand(3)]}`;
      ts += [5, 30, 50, 51, 400][rand(5)];
      device.emit({ type: 'MOVE', move, cubeTimestamp: rand(20) === 0 ? undefined : ts });
      raw = applyMoves(raw, [move]);
      previous = move;
      const snap = session.getSnapshot();
      assert.equal(snap.phase, 'tracking', `run ${run} move ${i} (${move})`);
      assert.ok(snap.moves.every((m) => !m.endsWith(`2${UP}`)), 'no R2-prime in history');
      assert.ok(sameCubeState(snap.state, raw), 'session state equals every raw move applied');
      assert.ok(sameCubeState(applyMoves(createSolvedState(), snap.moves), snap.state),
        `run ${run} move ${i}: history ${snap.moves.join(' ')} replays to the state`);
    }
  }
});
