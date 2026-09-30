import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSmartCubeSession } from '../src/smart-cube-session.js';
import { createSolveLive } from '../src/solve-live.js';
import { sameCubeState, createSolvedState } from '../src/cross-cube.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

let onNext;
function doSubscribe(o) { onNext = o.next; function u() { onNext = null; } return { unsubscribe: u }; }
function fakeCube() {
  let facelets = SOLVED;
  const events$ = { subscribe: doSubscribe };
  const connection = { deviceName: 'GAN test', protocol: { name: 'GAN Gen4' }, capabilities: { facelets: true }, events$,
    async sendCommand(c) { if (c.type === 'REQUEST_FACELETS') queueMicrotask(() => onNext({ type: 'FACELETS', facelets })); },
    async disconnect() {} };
  return { connection, connect: () => Promise.resolve(connection), emit: e => onNext(e), setFacelets: () => {} };
}

function trackLive(session) {
  let lastProcessedMove = null, lastProcessedLen = 0;
  const processed = [];
  function onLive(snap) {
    if (snap.phase !== 'tracking') return;
    const lastEntry = snap.moves[snap.moves.length - 1];
    if (snap.moves.length !== lastProcessedLen || lastEntry !== lastProcessedMove) {
      lastProcessedLen = snap.moves.length;
      lastProcessedMove = lastEntry;
      processed.push({ move: snap.lastMove, len: snap.moves.length });
    }
  }
  session.subscribe(onLive);
  return processed;
}

test('a coalesced U2 is processed by the live tracker (not skipped)', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(() => Promise.resolve(device.connection));
  const live = createSolveLive(session, { getOrientation: () => ({ bottom: 'D', front: 'F' }), now: () => 0 });
  const processed = trackLive(session);
  await session.connect();
  await session.syncSolved();
  live.startFree();
  // first U (during inspection — starts the solve)
  device.emit('U', 100);
  // second U (coalesces to U2 in the session — length stays the same)
  device.emit('U', 110);
  const afterSecond = processed.at(-1);
  assert.ok(afterSecond, 'coalesced U2 MUST be processed (not skipped)');
  assert.equal(afterSecond.move, 'U2', 'the coalesced U2 is tracked as U2');
});

test('repeated distinct moves are both processed', async () => {
  const device = fakeCube();
  const session = createSmartCubeSession(() => Promise.resolve(device.connection));
  const live = createSolveLive(session, { getOrientation: () => ({ bottom: 'D', front: 'F' }), now: () => 0 });
  const processed = trackLive(session);
  await session.connect();
  await session.syncSolved();
  live.startFree();
  device.emit('R', 100);
  device.emit('R', 120); // 200 ticks later — distinct, no coalesce
  const afterR = processed.at(-1);
  assert.ok(afterR, 'second R processed');
  assert.equal(afterR.move, 'R', 'tracked as R');
});
