import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryStore, SCHEMA_VERSION, MIGRATIONS } from '../src/store/history.js';
import { createMemoryBackend } from '../src/store/memory-backend.js';
import { deriveSessionIds, nextSessionId, sessionRecords, listSessions, currentSessionId } from '../src/store/sessions.js';
import { flowSolve, flowStats, learningStats } from '../src/solve-metrics.js';
import { inFocus } from '../src/store/focus.js';
import { SOLVE_STORE_KEY, ao5, ao12, ao50, ao100, mo3, bestAverage, scopeStats, trimCount, resultMs } from '../src/solve-metrics.js';
import { loadSolves, saveSolves } from '../src/solve-store.js';
import { exportAll, serializeExport, parseImport, importAll, historyFromImport } from '../src/data-port.js';

const MIN = 60_000;
const memoryStorage = (seed = {}) => {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    key: i => [...map.keys()][i] ?? null,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  };
};
const rec = (at, solveMs, extra = {}) => ({ at, solveMs, moveCount: 50, tps: 50 / (solveMs / 1000), solved: true, ...extra });
const open = async (options = {}) => {
  const backend = options.backend ?? createMemoryBackend();
  const store = createHistoryStore({ backend, ...options });
  await store.load();
  return { store, backend };
};

// --- migration -------------------------------------------------------------------------

test('first load copies the old localStorage history, derives sessions and keeps the old key', async () => {
  const storage = memoryStorage();
  const old = [rec(1000, 12000), rec(1000 + 5 * MIN, 13000), rec(1000 + 120 * MIN, 11000, { penalty: '+2' })];
  saveSolves(storage, old);
  const before = storage.getItem(SOLVE_STORE_KEY);
  const { store, backend } = await open({ legacyStorage: storage });
  assert.equal(store.records.length, 3);
  assert.equal(store.migratedFromLocal, 3);
  assert.deepEqual(store.records.map(r => r.sessionId), ['s1000', 's1000', `s${1000 + 120 * MIN}`]);
  assert.equal(store.records[2].penalty, '+2');
  assert.equal((await backend.getAll()).length, 3, 'written to the database');
  assert.equal(await backend.getMeta('schema'), SCHEMA_VERSION);
  assert.equal(storage.getItem(SOLVE_STORE_KEY), before, 'the old key stays untouched as a backup');
  assert.equal(store.readOnly, false);
  // A second load (new store over the same database) does not migrate again or duplicate.
  storage.setItem(SOLVE_STORE_KEY, JSON.stringify({ version: 1, records: [rec(9, 9)] }));
  const again = await open({ backend, legacyStorage: storage });
  assert.equal(again.store.records.length, 3);
  assert.equal(again.store.migratedFromLocal, 0);
});

test('migration reads an old-version localStorage blob instead of dropping it', async () => {
  const storage = memoryStorage({ [SOLVE_STORE_KEY]: JSON.stringify({ version: 7, records: [rec(1, 10000), rec(2, 11000)] }) });
  assert.equal(loadSolves(storage).length, 2, 'the legacy loader no longer returns [] for another version');
  const { store } = await open({ legacyStorage: storage });
  assert.equal(store.records.length, 2);
});

test('the legacy saver never overwrites a blob written by a newer version', () => {
  const blob = JSON.stringify({ version: 9, records: [rec(1, 10000)] });
  const storage = memoryStorage({ [SOLVE_STORE_KEY]: blob });
  saveSolves(storage, [rec(1, 10000), rec(2, 1)]);
  assert.equal(storage.getItem(SOLVE_STORE_KEY), blob);
});

test('an empty database with no old history starts at the current schema', async () => {
  const { store, backend } = await open({ legacyStorage: memoryStorage() });
  assert.deepEqual(store.records, []);
  assert.equal(await backend.getMeta('schema'), SCHEMA_VERSION);
});

test('a copy that does not verify is rolled back and shown read-only, never as an empty history', async () => {
  const storage = memoryStorage();
  saveSolves(storage, [rec(1, 10000), rec(2, 11000)]);
  const backend = createMemoryBackend();
  const real = backend.getAll;
  backend.getAll = async () => (await real()).slice(0, 1);   // the database loses a record
  const { store } = await open({ backend, legacyStorage: storage });
  assert.equal(store.readOnly, true);
  assert.match(store.warning, /read-only/);
  assert.equal(store.records.length, 2, 'the user still sees their solves');
  assert.equal(store.append(rec(3, 1)), null, 'no writes while read-only');
  assert.equal(await backend.getMeta('schema'), null, 'the schema is not recorded, so the next load retries');
});

// --- schema versions --------------------------------------------------------------------

test('explicit migrations run in order, atomically, and keep every record', async () => {
  const backend = createMemoryBackend({ records: [rec(1, 10000, { sessionId: 's1' }), rec(2, 11000, { sessionId: 's1' })], meta: { schema: 1 } });
  const migrations = [
    { from: 1, to: 2, migrate: list => list.map(r => ({ ...r, moveCount: r.moveCount + 1 })) },
    { from: 2, to: 3, migrate: list => list.map(r => ({ ...r, moveCount: r.moveCount * 2 })) },
  ];
  const { store } = await open({ backend, schemaVersion: 3, migrations });
  assert.deepEqual(store.records.map(r => r.moveCount), [102, 102]);
  assert.equal(await backend.getMeta('schema'), 3);
  assert.equal((await backend.getAll()).length, 2);
});

test('a failing migration leaves the database alone and opens read-only with a warning', async () => {
  const backend = createMemoryBackend({ records: [rec(1, 10000, { sessionId: 's1' })], meta: { schema: 1 } });
  const migrations = [{ from: 1, to: 2, migrate() { throw new Error('boom'); } }];
  const { store } = await open({ backend, schemaVersion: 2, migrations });
  assert.equal(store.readOnly, true);
  assert.match(store.warning, /boom/);
  assert.equal(store.records.length, 1);
  assert.equal(await backend.getMeta('schema'), 1);
});

test('a missing migration step is a failure, not an empty history', async () => {
  const backend = createMemoryBackend({ records: [rec(1, 10000, { sessionId: 's1' })], meta: { schema: 1 } });
  const { store } = await open({ backend, schemaVersion: 2, migrations: [] });
  assert.equal(store.readOnly, true);
  assert.equal(store.records.length, 1);
});

test('a newer schema is read-only with a warning and is never written', async () => {
  const backend = createMemoryBackend({ records: [rec(1, 10000, { sessionId: 's1', futureField: 1 })], meta: { schema: SCHEMA_VERSION + 1 } });
  const { store } = await open({ backend });
  assert.equal(store.readOnly, true);
  assert.match(store.warning, /newer version/);
  assert.equal(store.records.length, 1);
  assert.equal(store.append(rec(2, 1)), null);
  assert.equal(store.remove(1), null);
  assert.equal(store.setPenalty(1, 'DNF'), null);
  await store.flush();
  assert.equal((await backend.getAll()).length, 1);
  assert.equal((await backend.getAll())[0].futureField, 1, 'stored data is untouched');
  assert.equal(await backend.getMeta('schema'), SCHEMA_VERSION + 1);
});

test('a backend that throws opens read-only instead of pretending the history is empty', async () => {
  const backend = createMemoryBackend();
  backend.getMeta = async () => { throw new Error('disk gone'); };
  const { store } = await open({ backend });
  assert.equal(store.readOnly, true);
  assert.match(store.warning, /disk gone/);
});

test('a failed write is reported as a warning and the in-memory history stays correct', async () => {
  const { store, backend } = await open();
  backend.failWrites = true;
  store.append(rec(1, 10000));
  await store.flush();
  assert.equal(store.records.length, 1);
  assert.match(store.warning, /Could not save/);
});

// --- sessions ---------------------------------------------------------------------------

test('a solve starts a new session only after the idle gap', async () => {
  const { store } = await open({ sessionGapMin: 30 });
  const t = 1_000_000;
  store.append(rec(t, 10000));
  store.append(rec(t + 30 * MIN, 10000));   // exactly the gap: still the same session
  store.append(rec(t + 61 * MIN, 10000));   // 31 minutes later
  assert.deepEqual(store.records.map(r => r.sessionId), [`s${t}`, `s${t}`, `s${t + 61 * MIN}`]);
  assert.equal(listSessions(store.records).length, 2);
  assert.equal(currentSessionId(store.records), `s${t + 61 * MIN}`);
  assert.equal(sessionRecords(store.records, `s${t}`).length, 2);
  assert.equal(sessionRecords(store.records, null).length, 3, 'no id means no scoping');
});

test('the gap is a setting: a longer gap keeps solves together, regroup re-derives the old ones', async () => {
  const { store, backend } = await open();
  const t = 5_000_000;
  store.append(rec(t, 10000));
  store.append(rec(t + 45 * MIN, 10000));
  assert.equal(new Set(store.records.map(r => r.sessionId)).size, 2);
  store.setSessionGapMin(60);
  store.regroupSessions();
  assert.equal(new Set(store.records.map(r => r.sessionId)).size, 1);
  await store.flush();
  assert.equal(new Set((await backend.getAll()).map(r => r.sessionId)).size, 1, 'persisted');
  assert.equal(nextSessionId(store.records, t + 106 * MIN, 60), `s${t + 106 * MIN}`);
});

test('deriveSessionIds keeps existing ids and fills the rest by the gap rule', () => {
  const out = deriveSessionIds([rec(3 * 60 * MIN, 1), rec(0, 1, { sessionId: 'mine' }), rec(10 * MIN, 1), rec(3 * 60 * MIN + MIN, 1)], 30);
  assert.deepEqual(out.map(r => r.sessionId), ['mine', 'mine', `s${3 * 60 * MIN}`, `s${3 * 60 * MIN}`]);
});

// --- delete, undo, penalty ---------------------------------------------------------------

test('delete any solve and undo it; averages recompute', async () => {
  const { store, backend } = await open();
  for (let i = 0; i < 5; i++) store.append(rec(1000 + i, 10000 + i * 1000));
  assert.equal(ao5(store.records), 12000);
  const removed = store.remove(1000);   // the oldest, not the latest
  assert.equal(removed.solveMs, 10000);
  assert.equal(store.records.length, 4);
  assert.equal(ao5(store.records), null);
  assert.equal(store.remove(424242), null);
  await store.flush();
  assert.deepEqual((await backend.getAll()).map(r => r.at), [1001, 1002, 1003, 1004]);
  store.restore(removed);
  assert.deepEqual(store.records.map(r => r.at), [1000, 1001, 1002, 1003, 1004], 'restored in place');
  assert.equal(store.records[0].sessionId, removed.sessionId);
  assert.equal(ao5(store.records), 12000);
  await store.flush();
  assert.equal((await backend.getAll()).length, 5);
});

test('the penalty of any solve can be set to none, +2 or DNF, and persists', async () => {
  const { store, backend } = await open();
  for (let i = 0; i < 5; i++) store.append(rec(1000 + i, 10000 + i * 1000));
  store.setPenalty(1000, '+2');   // 12.00 replaces 10.00 (oldest)
  store.setPenalty(1004, 'DNF');
  assert.equal(resultMs(store.records[0]), 12000);
  assert.equal(ao5(store.records), (12000 + 12000 + 13000) / 3, 'results 12, 11, 12, 13, DNF: drop 11 and the DNF');
  assert.equal(store.setPenalty(1001, 'bogus'), null);
  assert.equal(store.setPenalty(999, 'DNF'), null, 'unknown solve');
  store.setPenalty(1004, 'none');
  assert.equal(store.records[4].penalty, null);
  await store.flush();
  const stored = await backend.getAll();
  assert.equal(stored[0].penalty, '+2');
  assert.equal(stored[4].penalty, null);
});

test('ephemeral mode keeps replayed solves out of the stored history', async () => {
  const { store, backend } = await open();
  store.append(rec(1, 10000));
  store.beginEphemeral();
  store.append(rec(2, 11000));
  store.setPenalty(1, 'DNF');
  assert.equal(store.records.length, 2);
  store.endEphemeral();
  assert.equal(store.records.length, 1);
  assert.equal(store.records[0].penalty, null);
  await store.flush();
  assert.deepEqual((await backend.getAll()).map(r => [r.at, r.penalty]), [[1, null]]);
});

test('there is no 1000 solve cap', async () => {
  const { store, backend } = await open();
  for (let i = 0; i < 1200; i++) store.append(rec(i + 1, 10000));
  await store.flush();
  assert.equal(store.records.length, 1200);
  assert.equal((await backend.getAll()).length, 1200);
});

// --- averages ---------------------------------------------------------------------------

const times = (...ms) => ms.map((m, i) => rec(i + 1, m));
const dnf = at => rec(at, 9000, { penalty: 'DNF' });

test('WCA trimming is 5% each side rounded up', () => {
  assert.deepEqual([5, 12, 50, 100, 25, 200].map(trimCount), [1, 1, 3, 5, 2, 10]);
});

test('ao5 and ao12 keep their WCA meaning, DNF handling included', () => {
  assert.equal(ao5(times(9000, 10000, 11000, 12000, 13000)), 11000);
  assert.equal(ao5(times(9000, 10000, 11000, 12000)), null);
  const oneDnf = [rec(1, 9000), rec(2, 10000), rec(3, 11000), rec(4, 12000), dnf(5)];
  assert.equal(ao5(oneDnf), 11000, 'one DNF is the dropped worst');
  assert.equal(ao5([dnf(0), ...oneDnf.slice(0, 3), dnf(9)]), Infinity, 'two DNFs make a DNF');
  const twelve = [...Array(11)].map((_, i) => rec(i + 1, 10000)).concat(dnf(12));
  assert.equal(ao12(twelve), 10000);
});

test('ao50 drops 3 from each side, ao100 drops 5', () => {
  const fifty = [...Array(50)].map((_, i) => rec(i + 1, (i + 1) * 100));   // 100..5000
  // Drop the 3 fastest (100,200,300) and 3 slowest (4800,4900,5000); mean of 400..4700.
  assert.equal(ao50(fifty), (400 + 4700) / 2);
  assert.equal(ao50(fifty.slice(1)), null);
  const threeDnf = fifty.map((r, i) => (i >= 47 ? { ...r, penalty: 'DNF' } : r));
  assert.equal(Number.isFinite(ao50(threeDnf)), true, '3 DNFs are all trimmed');
  assert.equal(ao50(fifty.map((r, i) => (i >= 46 ? { ...r, penalty: 'DNF' } : r))), Infinity, '4 DNFs are a DNF');
  const hundred = [...Array(100)].map((_, i) => rec(i + 1, (i + 1) * 100));
  assert.equal(ao100(hundred), (600 + 9500) / 2);
  assert.equal(Number.isFinite(ao100(hundred.map((r, i) => (i >= 95 ? { ...r, penalty: 'DNF' } : r)))), true, '5 DNFs are trimmed');
  assert.equal(ao100(hundred.map((r, i) => (i >= 94 ? { ...r, penalty: 'DNF' } : r))), Infinity, 'the 6th DNF is not');
});

test('mo3 is an untrimmed mean, and any DNF makes it a DNF', () => {
  assert.equal(mo3(times(1000, 10000, 11000, 12000)), 11000);
  assert.equal(mo3(times(10000, 11000)), null);
  assert.equal(mo3([rec(1, 10000), rec(2, 11000), dnf(3)]), Infinity);
  assert.equal(mo3([rec(1, 10000), rec(2, 11000), rec(3, 12000, { penalty: '+2' })]), (10000 + 11000 + 14000) / 3);
});

test('best/worst/PB averages use the result semantics (+2 counts, DNF excluded and counted)', () => {
  const list = [rec(1, 9000), rec(2, 10000, { penalty: '+2' }), dnf(3), rec(4, 15000), rec(5, 11000), rec(6, 10000), rec(7, 10000), rec(8, 10000)];
  const s = scopeStats(list);
  assert.equal(s.best, 9000);
  assert.equal(s.worst, 15000);
  assert.equal(s.dnfCount, 1);
  assert.equal(s.count, 8);
  assert.equal(s.ao5, (11000 + 10000 + 10000) / 3);
  assert.equal(s.bestAo5, bestAverage(list, 5));
  assert.ok(s.bestAo5 <= s.ao5);
  assert.equal(s.ao12, null);
  assert.equal(scopeStats([]).best, null);
  assert.equal(bestAverage(times(1, 2), 5), null);
  // A PB average skips DNF windows.
  const windows = [dnf(1), dnf(2), dnf(3), rec(4, 10000), rec(5, 10000), rec(6, 10000)];
  assert.equal(bestAverage(windows, 3), 10000);
});

// --- data port --------------------------------------------------------------------------

test('export v2 carries the history; import merges it back, deriving sessions', async () => {
  const { store } = await open();
  store.append(rec(1000, 12000, { penalty: '+2' }));
  store.append(rec(2000, 13000));
  const storage = memoryStorage({ 'cubesight-progress-v2': '{"a":1}', [SOLVE_STORE_KEY]: '{"version":1,"records":[]}' });
  const out = exportAll(storage, store.records);
  assert.equal(out.version, 2);
  assert.ok(!(SOLVE_STORE_KEY in out.data), 'the stale legacy solves key is left out');
  assert.equal(out.data['cubesight-progress-v2'], '{"a":1}');
  const parsed = parseImport(serializeExport(out));
  const fresh = await open();
  const target = memoryStorage();
  importAll(target, parsed, { skipKeys: [SOLVE_STORE_KEY] });
  assert.equal(fresh.store.importRecords(historyFromImport(parsed)), 2);
  assert.deepEqual(fresh.store.records.map(r => [r.at, r.penalty, r.sessionId]), [[1000, '+2', 's1000'], [2000, null, 's1000']]);
  await fresh.store.flush();
  assert.equal((await fresh.backend.getAll()).length, 2);
  assert.equal(target.getItem('cubesight-progress-v2'), '{"a":1}');
});

test('a version 1 backup still imports, its legacy solves blob going into the history', async () => {
  const blob = JSON.stringify({ version: 1, records: [rec(1, 10000), rec(2, 11000)] });
  const parsed = parseImport(JSON.stringify({ version: 1, exportedAt: 'x', data: { [SOLVE_STORE_KEY]: blob, 'cubesight-x': 'y' } }));
  assert.equal(historyFromImport(parsed).length, 2);
  const { store } = await open();
  store.append(rec(2, 99999));   // the backup wins for the same solve
  store.importRecords(historyFromImport(parsed));
  assert.deepEqual(store.records.map(r => r.solveMs), [10000, 11000]);
  assert.equal(exportAll(memoryStorage({ 'cubesight-x': 'y' })).version, 1, 'without history the export keeps the v1 shape');
  assert.throws(() => parseImport(JSON.stringify({ version: 2, data: {}, history: { records: 'no' } })), /valid CubeSight/);
  assert.throws(() => parseImport(JSON.stringify({ version: 3, data: {} })), /valid CubeSight/);
});

// --- view-model, keys, settings ------------------------------------------------------------

test('the stats view-model has all-time and per-session blocks; results use the solve\'s session', async () => {
  const { buildViewModel } = await import('../src/brain/view-model.js');
  const { normalizeSettings, parseCommand, setSetting } = await import('../src/brain/settings.js');
  const { resolveKey } = await import('../src/brain/keys.js');
  const { store } = await open();
  const day = 24 * 60 * MIN;
  for (let i = 0; i < 6; i++) store.append(rec(day + i * MIN, 20000));      // an older session
  for (let i = 0; i < 5; i++) store.append(rec(3 * day + i * MIN, 10000 + i * 100));
  const tracking = { phase: 'tracking', detail: '', deviceName: 'GAN', protocol: 'GAN Gen4', gyro: null };
  const last = store.records[store.records.length - 1];
  const vm = buildViewModel({ session: tracking, live: { phase: 'done', progress: { f2lDone: true }, record: last }, records: store.records, settings: normalizeSettings(), now: 0 });
  assert.equal(vm.stats.allTime.solves, '11');
  assert.equal(vm.stats.session.solves, '5');
  assert.equal(vm.stats.session.best, '10.00s');
  assert.equal(vm.stats.session.worst, '10.40s');
  assert.equal(vm.stats.session.ao5, '10.20s');
  assert.equal(vm.stats.ao50, '—');
  assert.equal(vm.stats.pb.ao5, '10.20s');
  assert.equal(vm.results.session.count, 5);
  assert.equal(vm.results.session.ao5, '10.20');
  assert.equal(vm.results.session.worst, '10.40');
  assert.deepEqual(resolveKey({ key: 'Delete', focusOnPage: true }, 'results'), { type: 'deleteSolve' });
  assert.deepEqual(resolveKey({ key: 'u', focusOnPage: true }, 'results'), { type: 'undoDelete' });
  assert.equal(resolveKey({ key: 'Delete' }, 'solving'), null);
  assert.deepEqual(parseCommand('session 45'), { path: 'session.gapMin', value: 45 });
  assert.equal(setSetting(normalizeSettings(), 'session.gapMin', 45).session.gapMin, 45);
  assert.equal(normalizeSettings({ session: { gapMin: -3 } }).session.gapMin, 1);
  assert.deepEqual(normalizeSettings().session, { focus: 'speed', gapMin: 30 });
});

// --- focus ----------------------------------------------------------------------------------

test('old records and schema 1 databases migrate to the speed focus, keeping every solve', async () => {
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(MIGRATIONS.length, 1);
  const storage = memoryStorage();
  saveSolves(storage, [rec(1, 10000), rec(2, 11000)]);
  assert.deepEqual((await open({ legacyStorage: storage })).store.records.map(r => r.focus), ['speed', 'speed'], 'from localStorage');
  const backend = createMemoryBackend({ records: [{ ...rec(1, 10000), sessionId: 's1' }, { ...rec(2, 11000), sessionId: 's1' }].map(r => { delete r.focus; return r; }), meta: { schema: 1 } });
  const { store } = await open({ backend });
  assert.deepEqual(store.records.map(r => r.focus), ['speed', 'speed'], 'from a schema 1 database');
  assert.equal(await backend.getMeta('schema'), 2);
  assert.deepEqual((await backend.getAll()).map(r => r.focus), ['speed', 'speed']);
});

test('a focus change starts a new session even within the idle gap', async () => {
  const { store } = await open();
  const t = 9_000_000;
  store.append(rec(t, 10000, { focus: 'speed' }));
  store.append(rec(t + MIN, 10000, { focus: 'speed' }));
  store.append(rec(t + 2 * MIN, 10000, { focus: 'flow' }));
  store.append(rec(t + 3 * MIN, 10000, { focus: 'flow' }));
  store.append(rec(t + 4 * MIN, 10000, { focus: 'speed' }));
  const ids = store.records.map(r => r.sessionId);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(listSessions(store.records).map(x => [x.focus, x.count]), [['speed', 2], ['flow', 2], ['speed', 1]]);
  store.append(rec(t + 5 * MIN, 1, { focus: 'bogus' }));
  assert.equal(store.records.at(-1).focus, 'speed', 'an unknown focus is speed');
  // Re-deriving (gap setting change) keeps foci apart too.
  store.setSessionGapMin(600);
  store.regroupSessions();
  assert.equal(new Set(store.records.map(r => r.sessionId)).size, 3);
});

test('stats never mix foci: averages, PB, best and worst are per focus; "all" is flagged mixed', async () => {
  const { buildViewModel } = await import('../src/brain/view-model.js');
  const { normalizeSettings } = await import('../src/brain/settings.js');
  const { store } = await open();
  const t = 20_000_000;
  for (let i = 0; i < 5; i++) store.append(rec(t + i * MIN, 10000 + i * 100, { focus: 'speed' }));
  for (let i = 0; i < 5; i++) store.append(rec(t + (10 + i) * MIN, 30000, { focus: 'learning', moveCount: 70 + i }));
  assert.equal(inFocus(store.records, 'learning').length, 5);
  const tracking = { phase: 'tracking', detail: '', deviceName: 'GAN', protocol: 'GAN Gen4', gyro: null };
  const build = focus => buildViewModel({ session: tracking, live: { phase: 'idle', progress: null }, records: store.records, settings: normalizeSettings({ session: { focus } }), now: 0 });
  const speed = build('speed').stats;
  assert.equal(speed.focus, 'speed');
  assert.equal(speed.allTime.solves, '5');
  assert.equal(speed.ao5, '10.20s');
  assert.equal(speed.allTime.best, '10.00s');
  assert.equal(speed.allTime.worst, '10.40s', 'the 30 s learning solves are not in speed stats');
  assert.equal(speed.pb.ao5, '10.20s');
  const learning = build('learning').stats;
  assert.equal(learning.ao5, '30.00s');
  assert.equal(learning.allTime.best, '30.00s');
  assert.equal(learning.session.solves, '5');
  assert.equal(learning.learning === undefined, true);
  assert.equal(learning.allTime.learning.medianMoves, '72');
  assert.equal(learning.allTime.learning.reviewAccuracy, '—', 'the hook waits for the review');
  assert.equal(learning.byFocus.speed.allTime.best, '10.00s');
  assert.equal(learning.byFocus.flow.allTime.solves, '0');
  assert.equal(learning.mixed.mixed, true);
  assert.equal(learning.mixed.solves, '10');
  assert.equal(learning.mixed.worst, '30.00s');
  assert.equal(speed.mixed.best, '10.00s');
});

test('comparisons on the results screen stay within the solve\'s focus', async () => {
  const { buildViewModel } = await import('../src/brain/view-model.js');
  const { normalizeSettings } = await import('../src/brain/settings.js');
  const { store } = await open();
  const t = 30_000_000;
  for (let i = 0; i < 12; i++) store.append(rec(t + i * MIN, 50000, { focus: 'learning' }));
  for (let i = 0; i < 13; i++) store.append(rec(t + (20 + i) * MIN, 10000, { focus: 'speed' }));
  const last = store.records.at(-1);
  const tracking = { phase: 'tracking', detail: '', deviceName: 'GAN', protocol: 'GAN Gen4', gyro: null };
  const vm = buildViewModel({ session: tracking, live: { phase: 'done', progress: { f2lDone: true }, record: last }, records: store.records, settings: normalizeSettings(), now: 0 });
  assert.equal(vm.results.session.ao12, '10.00');
  assert.equal(vm.results.session.count, 13);
  assert.equal(vm.results.vsAo12.text, '±0.00', 'vs avg compares with speed solves only');
  assert.equal(vm.results.recent.length, 7);
  assert.ok(vm.results.recent.every(r => r.text === '10.00'));
});

test('flow metrics: TPS spread, gap consistency and pauses from move times', () => {
  const steady = { solved: true, tps: 5, moveTimes: [200, 400, 600, 800, 1000, 1200] };
  const paused = { solved: true, tps: 3, moveTimes: [200, 400, 600, 2000, 2200, 2400] };
  assert.deepEqual(flowSolve(steady), { cv: 0, pauses: 0, medianGapMs: 200 });
  const p = flowSolve(paused);
  assert.equal(p.pauses, 1, 'one gap over 2x the median');
  assert.ok(p.cv > 1);
  assert.equal(flowSolve({ moveTimes: [1, 2] }), null);
  assert.equal(flowSolve({}), null);
  const stats = flowStats([steady, paused, { solved: true, tps: 4 }]);
  assert.equal(stats.meanTps, 4);
  assert.equal(stats.tpsStd, 1, 'sample standard deviation of 5, 3, 4');
  assert.equal(stats.rhythmSolves, 2);
  assert.equal(stats.pauses, 1);
  assert.equal(stats.pausesPerSolve, 0.5);
  assert.equal(flowStats([]).meanTps, null);
  const learning = learningStats([{ solved: true, moveCount: 60, reviewAccuracy: 90 }, { solved: true, moveCount: 80 }, { solved: false, moveCount: 1 }]);
  assert.deepEqual([learning.meanMoves, learning.bestMoves, learning.reviewedSolves, learning.reviewAccuracy], [70, 60, 1, 90]);
});

test('focus commands and the config bar item', async () => {
  const { parseCommand, setSetting, normalizeSettings, buildConfigBar } = await import('../src/brain/settings.js');
  assert.deepEqual(parseCommand('focus flow'), { path: 'session.focus', value: 'flow' });
  assert.deepEqual(parseCommand('learning'), { path: 'session.focus', value: 'learning' });
  assert.equal(parseCommand('focus fast'), null);
  assert.equal(setSetting(normalizeSettings(), 'session.focus', 'flow').session.focus, 'flow');
  assert.equal(setSetting(normalizeSettings(), 'session.focus', 'bogus').session.focus, 'speed');
  const item = buildConfigBar(normalizeSettings({ session: { focus: 'learning' } })).items.find(i => i.id === 'session.focus');
  assert.equal(item.label, 'focus');
  assert.deepEqual(item.options.map(o => [o.value, o.active]), [['speed', false], ['flow', false], ['learning', true]]);
});

test('a backup made by a newer schema is refused; older ones import with the speed focus', () => {
  assert.throws(() => parseImport(JSON.stringify({ version: 2, data: {}, history: { schema: SCHEMA_VERSION + 1, records: [] } })), /newer version/);
  const parsed = parseImport(JSON.stringify({ version: 2, data: {}, history: { schema: 1, records: [rec(1, 10000)] } }));
  assert.equal(historyFromImport(parsed)[0].focus, 'speed');
});
