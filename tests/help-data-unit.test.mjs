import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, restoreBackup } from '../src/help/data.js';

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    get length() { return data.size; },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    entries: () => [...data.entries()],
  };
}
function historyStore({ readOnly = false } = {}) {
  const calls = [];
  return {
    calls,
    store: {
      readOnly,
      warning: readOnly ? 'History is read-only.' : '',
      records: [{ at: 1000, solveMs: 12000, moveCount: 50, tps: 50 / 12, solved: true }],
      pins: { list: [{ at: 1000, moveIdx: 0, stage: 'cross', trainer: 'cross', scramble: '', movesUpTo: [] }], flush: async () => calls.push('pins.flush'), importPins: pins => calls.push(['pins.import', pins.length]) },
      flush: async () => calls.push('history.flush'),
      importRecords: records => { calls.push(['records.import', records.length]); return records.length; },
    },
  };
}

test('help backup exports local app data, solve history, pins and personal algorithms', async () => {
  const storage = memoryStorage({ 'cubesight-progress-v2': '{"wins":2}', unrelated: 'private' });
  const history = historyStore();
  const algorithms = { exportPersonalData: async () => ({ picks: [{ id: 'pll/aa' }] }) };
  const backup = JSON.parse(await createBackup({ storage, openHistoryStore: async () => history.store, algorithmDatabase: algorithms }));
  assert.equal(backup.version, 3);
  assert.equal(backup.data['cubesight-progress-v2'], '{"wins":2}');
  assert.equal(backup.data.unrelated, undefined);
  assert.equal(backup.history.records.length, 1);
  assert.equal(backup.pins.length, 1);
  assert.deepEqual(backup.algorithms, { picks: [{ id: 'pll/aa' }] });
});

test('valid backup import merges owned preferences, history, pins and personal algorithms', async () => {
  const target = memoryStorage({ 'cubesight-existing': 'keep', foreign: 'keep' });
  const history = historyStore();
  const imported = [];
  const algorithmDatabase = { importPersonalData: async value => imported.push(value) };
  const source = JSON.stringify({ version: 3, data: { 'cubesight-theme': 'light', 'foreign-key': 'ignore' }, history: { schema: 1, records: [] }, pins: [], algorithms: { picks: [] } });
  const result = await restoreBackup(source, { storage: target, openHistoryStore: async () => history.store, algorithmDatabase });
  assert.deepEqual(result, { count: 0 });
  assert.equal(target.getItem('cubesight-theme'), 'light');
  assert.equal(target.getItem('cubesight-existing'), 'keep');
  assert.equal(target.getItem('foreign-key'), null);
  assert.deepEqual(imported, [{ picks: [] }]);
  assert.deepEqual(history.calls, [['records.import', 0], ['pins.import', 0], 'history.flush', 'pins.flush']);
});

test('invalid backup is rejected before opening or mutating local stores', async () => {
  const storage = memoryStorage({ 'cubesight-theme': 'dark' });
  let opened = false;
  await assert.rejects(restoreBackup('{broken', { storage, openHistoryStore: async () => { opened = true; } }), SyntaxError);
  assert.equal(opened, false);
  assert.deepEqual(storage.entries(), [['cubesight-theme', 'dark']]);
});

test('read-only history rejects an otherwise valid import before any changes', async () => {
  const storage = memoryStorage({ 'cubesight-theme': 'dark' });
  const history = historyStore({ readOnly: true });
  let imported = false;
  const source = JSON.stringify({ version: 3, data: { 'cubesight-theme': 'light' }, history: { schema: 1, records: [] }, pins: [], algorithms: { picks: [] } });
  await assert.rejects(restoreBackup(source, { storage, openHistoryStore: async () => history.store, algorithmDatabase: { importPersonalData: async () => { imported = true; } } }), /read-only/);
  assert.equal(storage.getItem('cubesight-theme'), 'dark');
  assert.equal(imported, false);
  assert.deepEqual(history.calls, []);
});
