import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSmartCubeSession } from '../src/smart-cube-session.js';
import { sameCubeState, stateFromScramble } from '../src/cross-cube.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

function fakeCube() {
  let onNext;
  let facelets = SOLVED;
  let disconnected = false;
  const connection = {
    deviceName: 'GAN test cube', protocol: { name: 'GAN Gen4' },
    capabilities: { facelets: true },
    events$: { subscribe(observer) { onNext = observer.next; return { unsubscribe() { onNext = null; } }; } },
    async sendCommand(command) {
      if (command.type === 'REQUEST_FACELETS') queueMicrotask(() => onNext?.({ type: 'FACELETS', facelets }));
    },
    async disconnect() { disconnected = true; },
  };
  return {
    connection,
    connect: () => Promise.resolve(connection),
    emit: event => onNext?.(event),
    setFacelets: value => { facelets = value; },
    wasDisconnected: () => disconnected,
  };
}

test('smart cube tracks canonical moves only after a solved baseline', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  device.setFacelets(`R${SOLVED.slice(1)}`);
  await session.connect();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.getSnapshot().phase, 'awaiting-solved');
  device.emit({ type: 'MOVE', move: 'R' });
  assert.deepEqual(session.getSnapshot().moves, []);
  device.setFacelets(SOLVED);
  await session.syncSolved();
  assert.equal(session.getSnapshot().phase, 'tracking');
  device.emit({ type: 'MOVE', move: 'R' });
  assert.deepEqual(session.getSnapshot().moves, ['R']);
  assert.ok(sameCubeState(session.getSnapshot().state, stateFromScramble('R')));
  device.emit({ type: 'MOVE', move: "R'" });
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
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(session.syncSolved(), /not solved/);
  assert.equal(session.getSnapshot().phase, 'awaiting-solved');
  await session.disconnect();
});

test('unknown move stops trusted tracking instead of corrupting state', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  await session.connect();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.getSnapshot().phase, 'tracking');
  device.emit({ type: 'MOVE', move: 'x' });
  assert.equal(session.getSnapshot().phase, 'desynced');
  assert.deepEqual(session.getSnapshot().moves, []);
  await session.disconnect();
});

test('gyro readings publish a validated orientation and clear on disconnect', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  await session.connect();
  device.emit({ type: 'GYRO', quaternion: { x: 0, y: 0, z: 0, w: 1 } });
  assert.deepEqual(session.getSnapshot().gyro, { x: 0, y: 0, z: 0, w: 1 });
  device.emit({ type: 'GYRO', quaternion: { x: NaN, y: 0, z: 0, w: 1 } });
  assert.deepEqual(session.getSnapshot().gyro, { x: 0, y: 0, z: 0, w: 1 });
  device.emit({ type: 'GYRO', quaternion: { x: 0, y: 0, z: 0, w: 0 } });
  assert.deepEqual(session.getSnapshot().gyro, { x: 0, y: 0, z: 0, w: 1 });
  await session.disconnect();
  assert.equal(session.getSnapshot().gyro, null);
});

test('diagnostic subscribers see decoded moves before sync without altering trusted state', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  const observations = [];
  session.subscribeEvents(event => observations.push(event));
  session.subscribeEvents(() => { throw new Error('debug panel failed'); });
  device.setFacelets(`R${SOLVED.slice(1)}`);
  await session.connect();
  await new Promise(resolve => setImmediate(resolve));
  device.emit({ type: 'MOVE', move: 'R', face: 1, direction: 0, serial: 7, cubeTimestamp: 123, localTimestamp: 456 });
  assert.deepEqual(session.getSnapshot().moves, []);
  assert.deepEqual(observations.at(-1), {
    type: 'MOVE', receivedAt: observations.at(-1).receivedAt, move: 'R', face: 1, direction: 0, serial: 7,
    cubeTimestamp: 123, localTimestamp: 456,
  });
  await session.disconnect();
});

test('a raw wide or slice label stays visible even when trusted tracking rejects it', async () => {
  for (const move of ['Uw', 'M']) {
    const device = fakeCube();
    const session = createSmartCubeSession(device.connect);
    const seen = [];
    session.subscribeEvents(event => seen.push(event));
    await session.connect();
    await new Promise(resolve => setImmediate(resolve));
    device.emit({ type: 'MOVE', move });
    assert.equal(seen.at(-1).move, move);
    assert.equal(session.getSnapshot().phase, 'desynced');
    await session.disconnect();
  }
});

test('two same-face same-direction quarter turns within the double window coalesce into one U2', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  await session.connect();
  await new Promise(r => setImmediate(r));
  device.setFacelets(SOLVED);
  await session.syncSolved();
  assert.equal(session.getSnapshot().phase, 'tracking');
  // a physical U2 flick arrives as two U quarter-turns with a tiny cube-tick gap
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
  await new Promise(r => setImmediate(r));
  device.setFacelets(SOLVED);
  await session.syncSolved();
  // distinct U turns (large gap) -> two moves, not a double
  device.emit({ type: 'MOVE', move: 'U', face: 0, direction: 0, cubeTimestamp: 100 });
  device.emit({ type: 'MOVE', move: 'U', face: 0, direction: 0, cubeTimestamp: 1000 });
  const snap = session.getSnapshot();
  assert.equal(snap.moves.length, 2);
  assert.deepEqual(snap.moves, ['U', 'U']);
});

test('a U then U\' (opposite) does not coalesce as a double', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  await session.connect();
  await new Promise(r => setImmediate(r));
  device.setFacelets(SOLVED);
  await session.syncSolved();
  device.emit({ type: 'MOVE', move: 'U', face: 0, direction: 0, cubeTimestamp: 100 });
  device.emit({ type: 'MOVE', move: "U'", face: 0, direction: 1, cubeTimestamp: 108 });
  const snap = session.getSnapshot();
  // U then U' cancels back to solved (moves reset); they did NOT merge into a single "U2".
  assert.equal(snap.moves.length, 0);
  assert.equal(snap.lastMove, "U'");
});
