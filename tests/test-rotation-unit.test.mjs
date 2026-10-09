import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  emptyStore, fillRotation, freshnessLine, describeFailures, outcomesFromResults, recordRun, rotationOrder, ageLabel, PWA_TRIGGER,
} from '../scripts/test-rotation.mjs';
import { planRotation } from '../scripts/test-gate.mjs';

const item = (key, durationMs = 1000, spec = `tests/${key}.spec.js`) => ({ key, id: key, kind: 'case', spec, grepTitle: `${key}.spec.js ${key}`, durationMs, tier: 9, reasons: [] });
const hours = (n) => new Date(Date.UTC(2026, 9, 9, 12) - n * 3_600_000).toISOString();
const NOW = new Date(Date.UTC(2026, 9, 9, 12));

test('rotation order: owed first, then never passed, then oldest pass', () => {
  const store = emptyStore();
  store.tests.a = { at: hours(5) }; store.tests.b = { at: hours(50) }; store.tests.c = { at: hours(1) };
  store.owed.c = { at: hours(2), item: item('c') };
  const order = rotationOrder(['a', 'b', 'c', 'd', 'e'].map((key) => item(key)), store).map((entry) => entry.key);
  assert.deepEqual(order, ['c', 'd', 'e', 'b', 'a']);
});

test('a tiny change fills its spare budget with the stalest tests that fit', () => {
  const store = emptyStore();
  const candidates = ['t1', 't2', 't3', 't4', 't5', 't6'].map((key, i) => { store.tests[key] = { at: hours(10 - i) }; return item(key, 2000); });
  // The change's own test already runs; 3 spare tests of 2 s fit on 1 worker in 6 s.
  const result = fillRotation({ candidates, store, run: [item('own', 2000)], budgetMs: 8000, workers: 1 });
  assert.deepEqual(result.added.map((entry) => entry.key), ['t1', 't2', 't3']);
  // A stale test too big for the leftover is skipped, not allowed to block cheaper stale ones.
  const big = fillRotation({ candidates: [item('huge', 60_000), item('small', 500)], store: emptyStore(), run: [], budgetMs: 5000, workers: 1 });
  assert.deepEqual(big.added.map((entry) => entry.key), ['small']);
});

test('over consecutive runs the rotation reaches every test, none starved', () => {
  const store = emptyStore();
  const all = Array.from({ length: 40 }, (_, i) => item(`t${String(i).padStart(2, '0')}`, 1000));
  const seen = new Map();
  let runs = 0;
  let clock = Date.UTC(2026, 9, 1);
  while (seen.size < all.length && runs < 50) {
    runs += 1;
    clock += 3_600_000;
    const { added } = fillRotation({ candidates: all, store, run: [], budgetMs: 7000, workers: 1 }); // 7 tests a run
    recordRun(store, { outcomes: added.map((entry) => ({ key: entry.key, status: 'passed', durationMs: 1000 })), commit: 'c', now: new Date(clock) });
    for (const entry of added) seen.set(entry.key, (seen.get(entry.key) ?? 0) + 1);
  }
  assert.equal(seen.size, 40);
  assert.equal(runs, 6); // ceil(40 / 7)
  // 6 runs x 7 slots = 42 for 40 tests: the last run's spare slots wrap round to the two stalest, nothing is picked twice before all are picked once.
  assert.equal([...seen.values()].filter((count) => count === 2).length, 2);
});

test('a deferred selected test is owed and runs ahead of rotation until it passes', () => {
  const store = emptyStore();
  store.tests.old = { at: hours(900) };
  recordRun(store, { outcomes: [], deferred: [{ ...item('picked'), tier: 0 }], commit: 'abc', now: NOW });
  assert.ok(store.owed.picked);
  assert.equal(rotationOrder([item('old'), item('picked')], store)[0].key, 'picked');
  recordRun(store, { outcomes: [{ key: 'picked', status: 'passed', durationMs: 5 }], commit: 'def', now: NOW });
  assert.equal(store.owed.picked, undefined);
  assert.equal(store.tests.picked.commit, 'def');
});

test('a failing test never refreshes its last-passed record', () => {
  const store = emptyStore();
  store.tests.x = { at: hours(30), commit: 'old' };
  recordRun(store, { outcomes: [{ key: 'x', status: 'failed', durationMs: 5 }], commit: 'new', now: NOW });
  assert.equal(store.tests.x.commit, 'old');
});

// Run inside a git hook (the pre-commit unit tests), GIT_DIR / GIT_INDEX_FILE point at the repository being
// committed to; a fixture repository must never inherit them or its commits land in the real one.
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));

function repoWithHistory() {
  const dir = execFileSync('mktemp', ['-d', path.join(tmpdir(), 'rot-XXXXXX')], { encoding: 'utf8' }).trim();
  const env = { ...cleanEnv(), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env }).trim();
  git('init', '-q');
  const commits = [];
  for (const name of ['first', 'broke-it', 'third']) { git('commit', '-q', '--allow-empty', '-m', name, '--no-gpg-sign'); commits.push(git('rev-parse', 'HEAD')); }
  return { dir, commits };
}

test('a rotation failure is named as such, with the commits since it last passed; a change failure is not', () => {
  const { dir, commits } = repoWithHistory();
  const saved = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith('GIT_')));
  for (const name of Object.keys(saved)) delete process.env[name];
  after(() => Object.assign(process.env, saved));
  const store = emptyStore();
  store.tests.rot = { at: hours(30), commit: commits[0] };
  const failures = [
    { key: 'rot', status: 'failed', spec: 'tests/rot.spec.js', grepTitle: 'rot.spec.js drags the cube' },
    { key: 'mine', status: 'failed', spec: 'tests/mine.spec.js', grepTitle: 'mine.spec.js my feature' },
  ];
  const lines = describeFailures({ failures, ownKeys: new Set(['mine']), ownSpecs: new Set(), store, root: dir, now: NOW });
  const text = lines.join('\n');
  assert.match(text, /FAILED: 1 test\(s\) selected by your change:\n {2}mine.spec.js › my feature/u);
  assert.match(text, /FAILED ROTATION TEST \(not selected by your change[^)]*\): rot.spec.js › drags the cube/u);
  assert.match(text, /2 commit\(s\) since/u);
  assert.match(text, /broke-it/u);
  assert.doesNotMatch(text, /first\n/u); // the commit it passed at is not a suspect
  assert.doesNotMatch(text.split('FAILED ROTATION')[0], /ROTATION/u);
});

test('a rotation failure with no passing record says it cannot name suspects', () => {
  const lines = describeFailures({ failures: [{ key: 'z', spec: 'tests/z.spec.js', grepTitle: 'z.spec.js zed' }], ownKeys: new Set(), ownSpecs: new Set(), store: emptyStore(), root: process.cwd(), now: NOW });
  assert.match(lines.join('\n'), /No passing run of this test is on record/u);
});

test('the freshness line counts what passed in the last day and names the oldest pass', () => {
  const store = emptyStore();
  store.tests.a = { at: hours(2) }; store.tests.b = { at: hours(30) }; store.tests.c = { at: hours(72) };
  const tests = ['a', 'b', 'c', 'd'].map((key) => ({ key, label: `${key}.spec.js › ${key}` }));
  const line = freshnessLine({ tests, store, now: NOW });
  assert.equal(line, 'Suite freshness: 1/4 tests (25%) passed in the last 24.0 h; 1 never recorded passing yet (rotation still warming up); oldest pass: 3.0 days ago (c.spec.js › c).');
  assert.equal(ageLabel(90 * 60_000), '1.5 h');
});

test('PWA specs: a service-worker, build or offline-route change selects them; an ordinary source change does not', async () => {
  for (const file of ['vite.config.js', 'public/manifest.webmanifest', 'src/sw.js', 'src/offline-cache.js', 'src/routes.js', 'index.html']) assert.match(file, PWA_TRIGGER, file);
  for (const file of ['src/brain/review.js', 'src/ui/orbit.css', 'tests/history.spec.js']) assert.doesNotMatch(file, PWA_TRIGGER, file);
  const dir = await mkdtemp(path.join(tmpdir(), 'rot-pwa-'));
  const store = emptyStore();
  const common = { root: dir, model: { tests: new Map() }, selection: { items: new Map() }, packed: { run: [], deferred: [] }, specHashes: {}, fillBudget: 40_000, workers: 2, slowdown: 1, store, pwaList: ['pwa-tests/a.spec.js', 'pwa-tests/b.spec.js'] };
  const touched = await planRotation({ ...common, changes: [{ file: 'vite.config.js' }] });
  assert.equal(touched.own.length, 2); // both selected by the change, in the PWA stage
  assert.match(touched.own[0].reasons[0], /vite\.config\.js/u);
  const quiet = await planRotation({ ...common, changes: [{ file: 'src/brain/review.js' }] });
  assert.equal(quiet.own.length, 0);
  assert.ok(quiet.run.length >= 1, 'with the budget spare they take their turn in the rotation');
  await writeFile(path.join(dir, 'x'), '');
});

test('outcomes: a PWA spec passes only when all its tests pass', () => {
  const results = new Map([
    ['1', { status: 'passed', durationMs: 100, spec: 'pwa-tests/a.spec.js', titlePath: ['a.spec.js', 'one'] }],
    ['2', { status: 'failed', durationMs: 100, spec: 'pwa-tests/a.spec.js', titlePath: ['a.spec.js', 'two'] }],
    ['3', { status: 'passed', durationMs: 50, spec: 'pwa-tests/b.spec.js', titlePath: ['b.spec.js', 'x'] }],
  ]);
  const out = outcomesFromResults(results, { pwa: true });
  assert.deepEqual(out.map((o) => [o.key, o.status, o.durationMs]), [['pwa:pwa-tests/a.spec.js', 'failed', 200], ['pwa:pwa-tests/b.spec.js', 'passed', 50]]);
});
