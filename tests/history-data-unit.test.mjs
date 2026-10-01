import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsTimer, exportCsTimer, filterHistory } from '../src/history/cstimer.js';
import { exportAll, serializeExport, parseImport, pinsFromImport } from '../src/data-port.js';
import { createHistoryStore } from '../src/store/history.js';
import { createMemoryBackend } from '../src/store/memory-backend.js';

const pin = { at: 1000, moveIdx: 1, stage: 'cross', trainer: 'cross', scramble: 'R U', movesUpTo: ['R'], yours: ["R'"], better: ["U'"], createdAt: 1200 };
test('csTimer round-trip retains raw time, penalties, scrambles and separate sessions', () => {
  const records = [{ at: 1000, solveMs: 12340, penalty: '+2', scramble: 'R U', sessionId: 'one' }, { at: 2000, solveMs: 13020, penalty: 'DNF', scramble: "L'", sessionId: 'two' }, { at: 3000, solveMs: 14000, penalty: null, scramble: 'F2', sessionId: 'two' }];
  const result = parseCsTimer(exportCsTimer(records));
  assert.deepEqual(result.map(r => [r.at, r.solveMs, r.penalty, r.scramble]), records.map(r => [r.at, r.solveMs, r.penalty, r.scramble]));
  assert.notEqual(result[0].sessionId, result[1].sessionId);
  assert.equal(result[1].sessionId, result[2].sessionId);
});
test('csTimer rejects corrupt rows before any import and disambiguates identical seconds', () => {
  assert.throws(() => parseCsTimer(JSON.stringify({ session1: [[[17, 1], '', '', 1]] })), /Invalid solve/);
  const records = parseCsTimer(JSON.stringify({ session1: [[[0, 100], '', '', 1], [[0, 200], '', '', 1]] }));
  assert.deepEqual(records.map(r => r.at), [1000, 1001]);
});
test('history filters intersect source, focus, session and search without mutating order', () => {
  const records = [{ at: 1, scramble: 'R U', focus: 'speed', sessionId: 'a' }, { at: 2, scramble: 'R U', focus: 'flow', sessionId: 'b', source: 'manual' }];
  assert.deepEqual(filterHistory(records, { source: 'smart', query: 'r u', focus: 'speed', session: 'a' }), [records[0]]);
  assert.deepEqual(filterHistory(records, { source: 'manual', focus: 'speed' }), []);
  assert.deepEqual(records.map(r => r.at), [1, 2]);
});
test('backup preserves self-contained pins without their deleted original solves', async () => {
  const history = createHistoryStore({ backend: createMemoryBackend() }); await history.load();
  history.pins.add(pin); await history.pins.flush();
  const blob = serializeExport(exportAll({ length: 0 }, [], history.pins.list));
  const incoming = pinsFromImport(parseImport(blob));
  const restored = createHistoryStore({ backend: createMemoryBackend() }); await restored.load();
  assert.equal(restored.pins.importPins(incoming), 1); await restored.pins.flush();
  assert.equal(restored.pins.importPins(incoming), 0);
  assert.deepEqual(restored.pins.list, history.pins.list);
  assert.throws(() => parseImport(JSON.stringify({ version: 2, data: {}, pins: {} })), /valid CubeSight backup/);
});
