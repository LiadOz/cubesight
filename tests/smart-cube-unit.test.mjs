import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSmartCubeSession } from '../src/smart-cube-session.js';
import { sameCubeState, stateFromScramble } from '../src/cross-cube.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

let onNext;
function doSubscribe(observer) {
  onNext = observer.next;
  function unsub() { onNext = null; }
  return { unsubscribe: unsub };
}

function fakeCube() {
  let facelets = SOLVED;
  let disconnected = false;
  const connection = {
    deviceName: 'GAN test cube',
    protocol: { name: 'GAN Gen4' },
    capabilities: { facelets: true },
    events$: { subscribe: doSubscribe },
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
  device.emit({ type: 'MOVE', move: 'R', face: 1, direction: 0, serial: 1, cubeTimestamp: 1, localTimestamp: 1 });
  assert.deepEqual(session.getSnapshot().moves, ['R']);
  await session.disconnect();
});

test('a still-scrambled cube cannot be used as a solved baseline', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  device.setFacelets(`R${SOLVED.slice(1)}`);
  await session.connect();
  await new Promise((resolve) => setImmediate(resolve));
  await session.syncSolved().catch((error) => { assert.match(error.message, /not solved/i); });
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
  for (const move of ['Uw', 'M']) {
    device.emit({ type: 'MOVE', move });
    assert.equal(seen.at(-1).move, move);
    assert.equal(session.getSnapshot().phase, 'tracking', 'wide/slice moves are tracked, not desynced');
  }
  await session.disconnect();
});

test('gyro readings publish a validated orientation and clear on disconnect', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(device.connect);
  const seen = [];
  session.subscribe((s) => seen.push(s));
  await session.connect();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.getSnapshot().phase, 'tracking');
  const valid = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
  device.emit({ type: 'GYRO', quaternion: valid });
  assert.deepEqual(session.getSnapshot().gyro, valid);
  device.emit({ type: 'GYRO', quaternion: { x: 0, y: 0, z: 1, w: 0 } });
  assert.deepEqual(session.getSnapshot().gyro, valid, 'a bogus gyro is ignored');
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
