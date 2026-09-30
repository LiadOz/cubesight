import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSmartCubeSession } from '../src/smart-cube-session.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

function makeDevice() {
  let observer;
  let facelets = SOLVED;
  const events$ = {
    subscribe(o) { observer = o.next; return { unsubscribe() { observer = null; } };
    },
  };
  const connection = {
    deviceName: 'GAN16ui_test',
    protocol: { name: 'GAN Gen4' },
    deviceMAC: 'AA:BB:CC:DD:EE:FF',
    capabilities: { facelets: true },
    events$,
    async sendCommand(cmd) {
      if (cmd.type === 'REQUEST_FACELETS') queueMicrotask(() => observer?.({ type: 'FACELETS', facelets }));
    },
    async disconnect() { observer = null; },
  };
  return {
    connection,
    connect: () => Promise.resolve(connection),
    emit: (move, cubeTimestamp) => observer?.({
      type: 'MOVE', move, cubeTimestamp,
      face: move[0],
      direction: move.includes(String.fromCharCode(39)) ? 1 : 0,
      serial: 1, localTimestamp: 1,
    }),
    setFacelets: f => { facelets = f; },
  };
}

test('real session: a known solve (scramble + inverse) tracks every move and reaches solved', async () => {
  const scramble = "R U F R' B L D2";
  const solve = scramble.split(' ').reverse().map(m => m.endsWith('2') ? m : m.endsWith("'") ? m[0] : m + "'").join(' ');
  const moves = [...scramble.split(' '), ...solve.split(' ')];
  const device = makeDevice();
  const session = createSmartCubeSession(() => Promise.resolve(device.connection));
  const snaps = [];
  session.subscribe(s => snaps.push({ phase: s.phase, moves: s.moves?.length, lastMove: s.lastMove, solved: !!s.facelets && s.facelets === SOLVED }));
  await session.connect();
  await session.syncSolved();
  for (const m of moves) device.emit(m, 100);
  const last = snaps.at(-1);
  console.log('final:', last?.phase, 'moves:', last?.moves, 'solved:', last?.solved);
  assert.equal(last.phase, 'tracking');
  assert.equal(last.solved, true, 'the cube returns to solved');
  assert.ok(snaps.length > 5, 'the session tracked moves');
});

test('real session: R-prime does NOT desync (valid move)', async () => {
  const device = makeDevice();
  const session = createSmartCubeSession(() => Promise.resolve(device.connection));
  const snaps = [];
  session.subscribe(s => snaps.push({ phase: s.phase, moves: s.moves?.length, lastMove: s.lastMove }));
  await session.connect();
  await session.syncSolved();
  for (let i = 0; i < 28; i++) device.emit('R', i * 100);
  device.emit('R\'', 2900);
  const last = snaps.at(-1);
  console.log('R-prime test:', last?.phase, 'moves:', last?.moves, 'lastMove:', last?.lastMove);
  assert.notEqual(last.phase, 'desynced', 'R-prime is a valid move');
});

test('real session: two R quarters within the window coalesce to R2', async () => {
  const device = makeDevice();
  const session = createSmartCubeSession(() => Promise.resolve(device.connection));
  await session.connect();
  await session.syncSolved();
  device.emit('R', 100);
  device.emit('R', 110);
  const snap = session.getSnapshot();
  console.log('coalesce:', snap.moves, 'lastMove:', snap.lastMove);
  assert.equal(snap.phase, 'tracking', 'coalesced R2 does not desync');
  assert.equal(snap.lastMove, 'R2', 'lastMove is R2');
});
