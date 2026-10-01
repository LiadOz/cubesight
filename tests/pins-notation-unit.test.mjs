import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryStore } from '../src/store/history.js';
import { createMemoryBackend } from '../src/store/memory-backend.js';
import { cleanPin } from '../src/store/pins.js';
import { exportAll, parseImport, pinsFromImport, serializeExport } from '../src/data-port.js';
import { resolveDrillPosition } from '../src/drills/position.js';
import { sameCubeState, stateFromScramble } from '../src/cross-cube.js';

test('a pin backup preserves wide and slice moves and restores the exact replay position', async () => {
  const raw = {
    at: 1_790_000_000_000, moveIdx: 3, stage: 'oll', kind: 'stage', trainer: 'oll',
    scramble: 'R U F', crossFace: 'D', movesUpTo: ['Rw', 'M2', "r'"],
    yours: ['E', 'S2'], better: ["R'", 'M2'], note: 'wide and slice setup', createdAt: 10,
  };
  const source = await createHistoryStore({ backend: createMemoryBackend(), legacyStorage: null }).load();
  const saved = source.pins.add(raw);
  assert.ok(saved, 'valid physical turns are accepted by pin validation');
  assert.deepEqual(saved.movesUpTo, raw.movesUpTo);
  assert.deepEqual(saved.yours, raw.yours);
  assert.deepEqual(saved.better, raw.better);
  await source.pins.flush();

  const backup = serializeExport(exportAll({ length: 0 }, [], source.pins.list));
  const imported = await createHistoryStore({ backend: createMemoryBackend(), legacyStorage: null }).load();
  assert.equal(imported.pins.importPins(pinsFromImport(parseImport(backup))), 1);
  await imported.pins.flush();

  const position = await resolveDrillPosition({ review: { at: raw.at, moveIdx: raw.moveIdx } }, 'oll', { historyStore: imported });
  assert.equal(position.missing, undefined);
  assert.deepEqual(position.moves, [...raw.scramble.split(' '), ...raw.movesUpTo]);
  assert.deepEqual(position.pin.yours, raw.yours);
  assert.deepEqual(position.pin.better, raw.better);
  assert.equal(sameCubeState(
    stateFromScramble(position.moves.join(' ')),
    stateFromScramble([...raw.scramble.split(' '), ...raw.movesUpTo].join(' ')),
  ), true, 'the restored pin resolves to the exact saved cube position');
});

test('pin validation still rejects unsupported move notation instead of dropping it', () => {
  const raw = {
    at: 1, moveIdx: 1, stage: 'oll', trainer: 'oll', scramble: 'R U',
    movesUpTo: ['X'], yours: [], better: null,
  };
  assert.equal(cleanPin(raw), null);
});
