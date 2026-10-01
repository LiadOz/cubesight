import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryStore } from '../src/store/history.js';
import { createMemoryBackend } from '../src/store/memory-backend.js';
import { resolveDrillPosition } from '../src/drills/position.js';

test('a drill pin link restores the exact local scramble plus moves before the pin', async () => {
  const store = await createHistoryStore({ backend: createMemoryBackend(), legacyStorage: null }).load();
  store.pins.add({
    at: 1750000000000, moveIdx: 1, stage: 'pair1', kind: 'better-pair', trainer: 'lookahead',
    scramble: 'R U', movesUpTo: ['F'], yours: [], better: ['R U'], note: 'saved pair',
  });
  const position = await resolveDrillPosition({ review: { at: 1750000000000, moveIdx: 1 } }, 'lookahead', { historyStore: store });
  assert.deepEqual(position.moves, ['R', 'U', 'F']);
  assert.equal(position.source, 'review:1750000000000:1');
  assert.equal(position.pin.trainer, 'lookahead');
});

test('a pin link cannot resolve a pin owned by a different trainer', async () => {
  const store = await createHistoryStore({ backend: createMemoryBackend(), legacyStorage: null }).load();
  store.pins.add({
    at: 1750000000000, moveIdx: 1, stage: 'pair1', kind: 'better-pair', trainer: 'f2l',
    scramble: 'R U', movesUpTo: ['F'], yours: [], better: ['R U'], note: 'saved pair',
  });
  const position = await resolveDrillPosition({ review: { at: 1750000000000, moveIdx: 1 } }, 'lookahead', { historyStore: store });
  assert.equal(position.missing, true);
});
