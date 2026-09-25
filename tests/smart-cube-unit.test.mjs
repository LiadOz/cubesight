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
