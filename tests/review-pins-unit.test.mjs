import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPin, createPinStore, pinId, TRAINERS, PIN_CAP } from '../src/store/pins.js';
import { createHistoryStore } from '../src/store/history.js';
import { createMemoryBackend } from '../src/store/memory-backend.js';
import { stateFromScramble } from '../src/cross-cube.js';

const pin = (patch = {}) => ({
  at: 1_790_000_000_000, moveIdx: 3, stage: 'cross', kind: 'detour', trainer: 'cross', scramble: "D2 F2 U' B2", crossFace: 'D',
  movesUpTo: ['F', "D'", 'F'], yours: ['D', 'B', "D'"], better: ['R', "D'", 'F'], note: 'Move 4, D: a detour', createdAt: 5, ...patch,
});

test('a pin is validated and keyed by record, stage and position', () => {
  const clean = cleanPin(pin());
  assert.equal(clean.id, pinId(1_790_000_000_000, 'cross', 3));
  assert.deepEqual(clean.movesUpTo, ['F', "D'", 'F']);
  assert.deepEqual(clean.better, ['R', "D'", 'F']);
  assert.equal(cleanPin(pin({ better: [] })).better, null, 'no better solution yet');
  assert.equal(cleanPin(pin({ better: null })).better, null);
  for (const bad of [null, {}, pin({ trainer: 'nope' }), pin({ moveIdx: 2 }), pin({ at: 'x' }), pin({ stage: '' }), pin({ scramble: 'Q Q' }), pin({ movesUpTo: ['F', 'D', 'X'] })]) {
    assert.equal(cleanPin(bad), null, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(cleanPin(pin({ crossFace: 'Z' })).crossFace, null);
  assert.deepEqual(TRAINERS, ['cross', 'f2l', 'oll', 'pll', 'lookahead']);
});

test('the position of a pin replays from its scramble and moves', () => {
  const clean = cleanPin(pin());
  const state = stateFromScramble([clean.scramble, ...clean.movesUpTo].join(' '));
  assert.ok(state, 'trainers can rebuild the position');
});

test('pinning toggles, counts, filters by record and trainer, and survives a reload', async () => {
  const backend = createMemoryBackend();
  let store = createPinStore({ backend, now: () => 100 });
  await store.load();
  assert.equal(store.count, 0);
  const first = store.toggle(pin());
  assert.equal(first.createdAt, 5);
  assert.equal(store.toggle(pin({ stage: 'pair1', moveIdx: 8, movesUpTo: ['F', "D'", 'F', 'D', 'B', "D'", 'R', 'U'], trainer: 'f2l', kind: 'better-pair' })).trainer, 'f2l');
  assert.equal(store.count, 2);
  assert.equal(store.add(pin()).id, first.id, 'the same moment is one pin');
  assert.equal(store.count, 2);
  assert.equal(store.has(first.id), true);
  assert.equal(store.forRecord(1_790_000_000_000).length, 2);
  assert.deepEqual(store.byTrainer('f2l').map(p => p.stage), ['pair1']);
  await store.flush();
  store = createPinStore({ backend });
  await store.load();
  assert.equal(store.count, 2, 'pins persist');
  assert.equal(store.toggle(pin()), null, 'toggling again unpins');
  assert.equal(store.count, 1);
  await store.flush();
  store = createPinStore({ backend });
  await store.load();
  assert.deepEqual(store.list.map(p => p.stage), ['pair1']);
  assert.equal(store.remove('nope'), false);
});

test('a read-only store never writes, and a failing write is reported, not thrown', async () => {
  const backend = createMemoryBackend();
  let readOnly = true;
  const errors = [];
  const store = createPinStore({ backend, readOnly: () => readOnly, onError: e => errors.push(e) });
  await store.load();
  assert.equal(store.add(pin()), null);
  assert.equal(store.count, 0);
  readOnly = false;
  backend.failWrites = true;
  assert.ok(store.add(pin()));
  await store.flush();
  assert.match(errors[0], /Could not save your pins/);
});

test('the pin count is capped', async () => {
  const store = createPinStore({ backend: createMemoryBackend() });
  await store.load();
  for (let i = 0; i < PIN_CAP; i++) assert.ok(store.add(pin({ at: 1000 + i })));
  assert.equal(store.add(pin({ at: 99999 })), null);
});

test('the history store carries the pins in the same backend and opens without them on an old backend', async () => {
  const backend = createMemoryBackend();
  let history = createHistoryStore({ backend });
  await history.load();
  assert.equal(history.pins.count, 0);
  history.pins.add(pin());
  await history.pins.flush();
  history = createHistoryStore({ backend });
  await history.load();
  assert.equal(history.pins.count, 1);
  assert.equal(history.pins.list[0].stage, 'cross');
  // A backend written before pins existed (no getPins) still opens.
  const { getPins: _g, applyPins: _a, ...old } = createMemoryBackend();
  const legacy = createHistoryStore({ backend: old });
  await legacy.load();
  assert.equal(legacy.pins.count, 0);
});
