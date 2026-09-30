import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSmartCubeSession } from '../src/smart-cube-session.js';
import { createSolveLive } from '../src/solve-live.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

function fakeCube() {
  let onNext = null;
  const connection = {
    deviceName: 'GAN test', protocol: { name: 'GAN Gen4' }, capabilities: { facelets: true },
    events$: { subscribe(o) { onNext = o.next; return { unsubscribe() { onNext = null; } }; } },
    async sendCommand(c) { if (c.type === 'REQUEST_FACELETS') queueMicrotask(() => onNext({ type: 'FACELETS', facelets: SOLVED })); },
    async disconnect() {},
  };
  return { connection, emit: (move, cubeTimestamp) => onNext({ type: 'MOVE', move, cubeTimestamp }) };
}

// A free solve on the real live tracker (the cube must be scrambled first: a
// free solve refuses a solved cube). The tracker's own solveMoves list shows
// which turns it handled.
async function freeSolve() {
  const device = fakeCube();
  const session = createSmartCubeSession(() => Promise.resolve(device.connection));
  const live = createSolveLive(session, { getOrientation: () => ({ bottom: 'D', front: 'F' }), now: () => 0 });
  await session.connect();
  await session.syncSolved();
  device.emit('F', 0);   // scramble
  live.startFree();
  return { device, session, live };
}

test('a coalesced U2 is processed by the live tracker (not skipped)', async () => {
  const { device, session, live } = await freeSolve();
  device.emit('U', 100); // first quarter: starts the solve
  assert.deepEqual(live.getSnapshot().solveMoves, ['U']);
  assert.equal(live.getSnapshot().phase, 'solving');
  device.emit('U', 110); // second quarter coalesces: history length stays the same, entry becomes U2
  assert.deepEqual(session.getSnapshot().moves, ['F', 'U2']);
  assert.deepEqual(live.getSnapshot().solveMoves, ['U2'], 'coalesced U2 MUST be processed (not skipped)');
  assert.equal(live.getSnapshot().solveMoveCount, 1, 'the U2 counts as one move');
  // Another coalesced U2 then F' returns the cube to solved; the tracker must see it and finish.
  device.emit('U', 1000);
  device.emit('U', 1010);
  device.emit("F'", 2000);
  assert.equal(live.getSnapshot().phase, 'done', 'the solve completes');
  assert.equal(live.getSnapshot().record.moveCount, 3);
});

test('repeated distinct moves are both processed', async () => {
  const { device, session, live } = await freeSolve();
  device.emit('R', 100);
  device.emit('R', 400); // 300 ticks later — outside the double window, no coalesce
  assert.deepEqual(session.getSnapshot().moves, ['F', 'R', 'R']);
  assert.deepEqual(live.getSnapshot().solveMoves, ['R', 'R'], 'second R processed');
});
