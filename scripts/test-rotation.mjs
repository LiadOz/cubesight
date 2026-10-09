// Rotation: how the one-minute suite still exercises every test.
//
// `npm test` has a hard minute, so it cannot run all ~400 browser tests. It runs the
// tests the change reaches first, then spends whatever budget is left on the tests that
// have gone LONGEST WITHOUT A PASSING RUN ("stalest first"). Over a day of ordinary runs
// every test is exercised, inside the same minute, with no separate long suite.
//
// The record is one small JSON file shared by every worktree of the repository (it lives
// in the git common dir, so agents' worktrees and the merge queue's scratch worktrees all
// feed and read the same history; a per-worktree copy would start cold every time):
//   tests[key] = { at, commit, durationMs }   last PASSING run of that test
//   owed[key]  = { item, at, commit }         selected by a change but not fitted that run:
//                                             runs before any rotation test, so nothing is dropped
// Keys: a browser test's Playwright id, or `pwa:<spec file>` for a PWA offline spec
// (the PWA suite is scheduled per spec file; its tests share one preview server).
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makespan } from './test-select.mjs';

export const ROTATION_VERSION = 1;
// "Fresh" = passed within the last day. The promise of the rotation is a full cycle in about a
// day of ordinary use, so a test older than that means the rotation is not keeping up. (Commits
// are the alternative unit, but runs happen at very different rates per worktree; time is the
// same for everyone. The oldest test's commit distance is reported next to its age.)
export const FRESH_MS = 24 * 60 * 60 * 1000;
export const PWA_PREFIX = 'pwa:';
export const PWA_DIR = 'pwa-tests';
export const PWA_DEFAULT_MS = 6_000;
export const PWA_FIXED_MS = 3_000; // preview server start + browser launch; the build is the gate's own
// Files whose change can break the installed/offline behaviour.
export const PWA_TRIGGER = /^(?:vite\.config\.js|pwa-assets\.config\.js|index\.html|package(?:-lock)?\.json|public\/|src\/(?:main|routes)\.js|src\/wasm\/)|(?:^|[/_.-])(?:sw|service-worker|offline|precache|manifest)(?:[/_.-]|$)/iu;

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const tryGit = (root, args) => { try { return git(root, args).trim(); } catch { return null; } };

export const emptyStore = () => ({ version: ROTATION_VERSION, tests: {}, owed: {} });

export function rotationPath(root) {
  if (process.env.CUBESIGHT_ROTATION_FILE) return path.resolve(process.env.CUBESIGHT_ROTATION_FILE);
  const common = tryGit(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return common ? path.join(common, 'cubesight-test-rotation.json') : path.join(root, 'test-results/impact-map/rotation.json');
}

export async function loadRotation(root) {
  try {
    const store = JSON.parse(await readFile(rotationPath(root), 'utf8'));
    if (store?.version === ROTATION_VERSION) return { tests: {}, owed: {}, ...store };
  } catch { /* first run, or unreadable: start empty */ }
  return emptyStore();
}

// Several gates can finish at once (agents, the queue). Re-read just before writing and keep the newer
// pass per test, then rename into place so a reader never sees half a file.
export async function saveRotation(root, store) {
  const file = rotationPath(root);
  const disk = await loadRotation(root);
  for (const [key, entry] of Object.entries(disk.tests)) if (!store.tests[key] || store.tests[key].at < entry.at) store.tests[key] = entry;
  for (const [key, entry] of Object.entries(disk.owed)) if (!(key in store.owed) && !(store.tests[key]?.at > entry.at)) store.owed[key] = entry;
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(store)}\n`);
  await rename(temp, file);
  return file;
}

/** Stalest first: tests owed by an earlier change, then tests never recorded passing, then oldest pass. */
export function rotationOrder(candidates, store) {
  const rank = (item) => {
    const owed = store.owed[item.key];
    if (owed) return [0, owed.at, item.key];
    const passed = store.tests[item.key];
    return passed ? [2, passed.at, item.key] : [1, '', item.key];
  };
  return [...candidates].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    return ra[0] - rb[0] || (ra[1] < rb[1] ? -1 : ra[1] > rb[1] ? 1 : 0) || (ra[2] < rb[2] ? -1 : 1);
  });
}

const isPwa = (item) => item.key.startsWith(PWA_PREFIX);
export const pwaCost = (items) => (items.length ? PWA_FIXED_MS + items.reduce((sum, item) => sum + item.durationMs, 0) : 0);

/**
 * Spend the budget the change's own tests left over. `run` is what is already going to run; `candidates` is
 * every test not in it. Browser tests are costed with the same per-spec makespan the packer uses; PWA specs
 * run serially in their own stage with its own budget (`pwaBudgetMs`).
 */
export function fillRotation({ candidates, store, run, budgetMs, pwaBudgetMs = 0, workers = 2, slowdown = 1 }) {
  const browserRun = run.filter((item) => !isPwa(item));
  const pwaRun = run.filter(isPwa);
  const added = [];
  for (const item of rotationOrder(candidates, store)) {
    if (isPwa(item)) {
      if (pwaCost([...pwaRun, item]) * slowdown <= pwaBudgetMs) { pwaRun.push(item); added.push(item); }
    } else if (makespan([...browserRun, item], workers, slowdown) <= budgetMs) { browserRun.push(item); added.push(item); }
  }
  return { added, estimatedMs: makespan(browserRun, workers, slowdown) };
}

export const pwaItems = (specs, store, reasonFor = () => null) => specs.map((spec) => {
  const key = `${PWA_PREFIX}${spec}`;
  return { key, id: key, kind: 'spec', config: 'pwa', spec, grepTitle: path.posix.basename(spec), durationMs: store.tests[key]?.durationMs || PWA_DEFAULT_MS, tier: 9, reasons: reasonFor(spec) ? [reasonFor(spec)] : [] };
});

export function ageLabel(ms) {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

// ------------------------------------------------------------------- recording
/**
 * Fold a finished run into the store. `outcomes` is [{ key, status, durationMs }] (one per test or PWA spec
 * that actually ran); `deferred` are change-selected items that did not fit and are now owed.
 */
export function recordRun(store, { outcomes, deferred = [], commit, now = new Date() }) {
  const at = now.toISOString();
  for (const outcome of outcomes) {
    if (outcome.status !== 'passed') continue;
    store.tests[outcome.key] = { at, commit, durationMs: outcome.durationMs };
    delete store.owed[outcome.key];
  }
  const ran = new Set(outcomes.map((outcome) => outcome.key));
  for (const item of deferred) {
    if (ran.has(item.key) || store.owed[item.key]) continue;
    const { key, kind, id, spec, grepTitle, title, durationMs, config } = item;
    store.owed[key] = { at, commit, item: { key, kind, id, spec, grepTitle, title, durationMs, config } };
  }
  return store;
}

/** Playwright report(s) -> outcomes. Browser tests by id; a PWA spec passes when all its tests do. */
export function outcomesFromResults(results, { pwa = false } = {}) {
  if (!pwa) return [...results].filter(([, r]) => r.status !== 'skipped' && r.status !== 'interrupted').map(([key, r]) => ({ key, status: r.status, durationMs: r.durationMs, spec: r.spec, grepTitle: r.grepTitle }));
  const bySpec = new Map();
  for (const result of results.values()) {
    if (result.status === 'skipped' || result.status === 'interrupted') continue;
    const entry = bySpec.get(result.spec) ?? { key: `${PWA_PREFIX}${result.spec}`, status: 'passed', durationMs: 0, spec: result.spec, grepTitle: path.posix.basename(result.spec), titles: [] };
    if (result.status !== 'passed') { entry.status = 'failed'; entry.titles.push(result.titlePath.slice(1).join(' ')); }
    entry.durationMs += result.durationMs;
    bySpec.set(result.spec, entry);
  }
  return [...bySpec.values()];
}

// ----------------------------------------------------------------- attribution
/**
 * Failures, told honestly. A failure in a test the change selected is the change's. A failure in a test that
 * was only there because the rotation reached it is not necessarily this change's fault, so it says so and
 * names the commits since that test last passed -- the likely culprits.
 * `ownKeys`/`ownSpecs` describe what the change selected; everything else that ran was rotation.
 */
export function describeFailures({ failures, ownKeys, ownSpecs, store, root, now = new Date() }) {
  const own = [];
  const rotation = [];
  for (const failure of failures) (ownKeys.has(failure.key) || ownSpecs.has(failure.spec) ? own : rotation).push(failure);
  const lines = [];
  const name = (f) => `${path.posix.basename(f.spec)} › ${(f.titles?.length ? f.titles.join('; ') : f.grepTitle).replace(/^\S+\.spec\.js\s/u, '')}`;
  if (own.length) {
    lines.push(`FAILED: ${own.length} test(s) selected by your change:`);
    for (const f of own) lines.push(`  ${name(f)}`);
  }
  for (const f of rotation) {
    const last = store.tests[f.key] ?? null;
    const owed = store.owed[f.key] ?? null;
    lines.push(`FAILED ROTATION TEST (not selected by your change; it ran because it was next-stalest): ${name(f)}`);
    if (!last) lines.push('  No passing run of this test is on record, so there is no earlier commit to compare with.');
    else {
      const commits = commitsSince(root, last);
      lines.push(`  Last passed ${last.at.slice(0, 16)}Z (${ageLabel(now - new Date(last.at))} ago) at ${last.commit?.slice(0, 9) ?? 'an unknown commit'}.`);
      lines.push(commits.known ? `  ${commits.list.length} commit(s) since, one of them likely broke it (git log ${last.commit?.slice(0, 9)}..HEAD):` : `  That commit is not in this history; commits since that time (git log --since=${last.at}):`);
      for (const line of commits.list.slice(0, 15)) lines.push(`    ${line}`);
      if (commits.list.length > 15) lines.push(`    ... and ${commits.list.length - 15} more`);
      if (!commits.list.length) lines.push('    (none: it passed at this very commit, so the failure is flaky or environmental)');
    }
    if (owed) lines.push(`  It was also owed since ${owed.at.slice(0, 16)}Z: an earlier change selected it and the budget did not fit it.`);
  }
  return lines;
}

export function commitsSince(root, last) {
  const byCommit = last.commit ? tryGit(root, ['log', '--oneline', `${last.commit}..HEAD`]) : null;
  if (byCommit !== null) return { known: true, list: byCommit.split('\n').filter(Boolean) };
  const bySince = tryGit(root, ['log', '--oneline', `--since=${last.at}`]);
  return { known: false, list: (bySince ?? '').split('\n').filter(Boolean) };
}

// -------------------------------------------------------------------- coverage
/** The one-line state of the rotation: how much of the suite is fresh and how old the oldest test is. */
export function freshnessLine({ tests, store, root = null, now = new Date(), freshMs = FRESH_MS }) {
  // tests: [{ key, label }] -- every test the suite has
  let fresh = 0;
  let never = 0;
  let oldest = null;
  for (const test of tests) {
    const passed = store.tests[test.key];
    if (!passed) { never += 1; continue; }
    const age = now - new Date(passed.at);
    if (age <= freshMs) fresh += 1;
    if (!oldest || age > oldest.age) oldest = { age, test, passed };
  }
  const total = tests.length;
  const percent = total ? Math.round((fresh / total) * 100) : 100;
  let tail;
  if (never) tail = `${never} never recorded passing yet (rotation still warming up)`;
  else tail = '';
  let oldestText = '';
  if (oldest) {
    const behind = root && oldest.passed.commit ? tryGit(root, ['rev-list', '--count', `${oldest.passed.commit}..HEAD`]) : null;
    oldestText = `oldest pass: ${ageLabel(oldest.age)} ago${behind && behind !== '0' ? `, ${behind} commit(s) back` : ''} (${oldest.test.label})`;
  }
  return `Suite freshness: ${fresh}/${total} tests (${percent}%) passed in the last ${ageLabel(freshMs)}${[tail, oldestText].filter(Boolean).map((text) => `; ${text}`).join('')}.`;
}
