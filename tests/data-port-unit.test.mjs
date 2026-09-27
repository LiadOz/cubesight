import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportAll, serializeExport, parseImport, importAll } from '../src/data-port.js';

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    get length() { return data.size; },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
  };
}

test('exportAll collects only owned prefixes', () => {
  const storage = memoryStorage({
    'cubesight-progress-v2': '{"a":1}',
    'smartcube-ble-mac:abc': 'AA:BB:CC:DD:EE:FF',
    'foreign-key': 'no',
    'cubesight-learning-v1': '{}',
  });
  const out = exportAll(storage);
  assert.deepEqual(Object.keys(out.data).sort(), ['cubesight-learning-v1', 'cubesight-progress-v2', 'smartcube-ble-mac:abc']);
  assert.equal(out.version, 1);
});

test('round-trip export -> serialize -> parse -> import restores data', () => {
  const storage = memoryStorage({ 'cubesight-solves-v1': '[1,2]', 'foreign': 'x' });
  const blob = serializeExport(exportAll(storage));
  const target = memoryStorage({});
  importAll(target, parseImport(blob));
  assert.equal(target.getItem('cubesight-solves-v1'), '[1,2]');
  assert.equal(target.getItem('foreign'), null);
});

test('parseImport rejects non-CubeSight blobs', () => {
  assert.throws(() => parseImport('{"foo":1}'), /valid CubeSight backup/);
  assert.throws(() => parseImport('not json'), SyntaxError);
});

test('importAll with clearOwned removes owned keys first', () => {
  const target = memoryStorage({ 'cubesight-old': 'gone', 'cubesight-solves-v1': 'old', 'foreign': 'keep' });
  const parsed = { version: 1, data: { 'cubesight-solves-v1': 'new' } };
  importAll(target, parsed, { clearOwned: true });
  assert.equal(target.getItem('cubesight-solves-v1'), 'new');
  assert.equal(target.getItem('cubesight-old'), null);
  assert.equal(target.getItem('foreign'), 'keep');
});

test('importAll ignores foreign keys inside a backup', () => {
  const target = memoryStorage({});
  const parsed = { version: 1, data: { 'cubesight-x': 'ok', 'evil-key': 'no' } };
  importAll(target, parsed);
  assert.equal(target.getItem('cubesight-x'), 'ok');
  assert.equal(target.getItem('evil-key'), null);
});
