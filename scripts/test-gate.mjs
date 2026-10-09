// The change-aware gate behind `npm test` and the merge queue.
//
//   changed files = diff against trunk (merge-base) + uncommitted work
//   run           = lint, ALL unit tests, build, then the browser tests the diff reaches
//   rotation      = the budget the change's tests leave over goes to the tests longest without a pass
//                   (scripts/test-rotation.mjs), PWA offline specs included, so the whole suite is
//                   exercised over a day of ordinary runs
//   budget        = 60 s wall clock, the only suite there is; a selected test that does not fit is
//                   recorded as owed and runs first in the next run's rotation, never dropped
import { cpus, loadavg } from 'node:os';
import { mkdir, readdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CASE_MS, gitChanges, mergeBase, packBrowser, playwrightArgs, selectTests, tierLabel } from './test-select.mjs';
import { hashSpecs, ingestRun, loadModel, reportResults, saveModel } from './test-impact-store.mjs';
import {
  PWA_DIR, PWA_PREFIX, PWA_TRIGGER, describeFailures, fillRotation, freshnessLine, loadRotation, outcomesFromResults, pwaItems, pwaCost,
  recordRun, rotationOrder, saveRotation,
} from './test-rotation.mjs';

export const DEFAULT_TRUNK = 'main';
export const GATE_BUDGET_MS = 60_000;
// Dev-server start + Playwright start + result ingestion, none of which is test time.
export const BROWSER_OVERHEAD_MS = 9_000;
// Pack the browser stage to this share of its budget. Estimates come from recorded
// durations and the load average sampled *before* the gate's own lint, unit and
// build stages start competing for the CPU alongside it, so a plan that fills the
// budget exactly runs into the hard deadline whenever anything is slower than
// recorded -- the deadline then kills the stage and fails a change whose tests
// were passing. Headroom keeps the deadline a safety net, not the stopping point.
export const PACK_FILL = 0.75;
// The build (which the PWA stage waits for) takes roughly this long; the PWA stage gets what the browser budget has beyond it.
export const PWA_BUILD_MS = 15_000;
// The rotation only spends this share of the browser budget (the change's own tests may use PACK_FILL): it is the part
// that can be cut, so it leaves the larger margin. Playwright's own time limit (below) is the safety net.
export const ROTATION_FILL = 0.6;
// Playwright stops itself this long before the suite deadline and writes the report of what finished,
// so a slow machine truncates the rotation instead of killing the run with nothing recorded.
export const STOP_MARGIN_MS = 7_000;
// Not worth starting the PWA specs (preview server + browser) with less than this left once the build is done.
export const PWA_MIN_START_MS = 9_000;
export const PWA_MAX_MS = 25_000;
export const PWA_CONFIG = 'scripts/test-pwa.config.mjs';
export const GATE_DIR = 'test-results/gate';
const LINT_CACHE_DIR = 'test-results/lint-cache'; // survives between runs, unlike GATE_DIR

async function currentSpecs(root) {
  const specs = [];
  const walk = async (directory) => {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true }).catch(() => [])) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) { if (!['layout', 'snapshots'].includes(entry.name) && !entry.name.endsWith('-snapshots')) await walk(relative); }
      else if (entry.name.endsWith('.spec.js')) specs.push(relative);
    }
  };
  await walk('tests');
  return specs;
}

/**
 * Decide what the gate runs. `remainingMs` is what is left of the gate budget
 * once selection is done; the browser gets that minus fixed overhead.
 */
export async function planGate({ root = process.cwd(), trunk = DEFAULT_TRUNK, base = null, head = null, files = null, filter = null, budgetMs = GATE_BUDGET_MS, workers = Number(process.env.CUBESIGHT_GATE_WORKERS) || 2, started = performance.now() } = {}) {
  const baseRef = base ?? (files ? 'HEAD' : mergeBase(root, trunk));
  const changes = (await gitChanges({ root, base: baseRef, head, files })).filter((change) => !filter || filter(change));
  const { model, source } = await loadModel(root);
  const specHashes = head ? {} : await hashSpecs(root, await currentSpecs(root));
  const selection = await selectTests({ root, changes, model, head, specHashes });
  const browserBudget = Math.max(0, budgetMs - (performance.now() - started) - BROWSER_OVERHEAD_MS);
  const slowdown = loadSlowdown();
  const fillBudget = browserBudget * PACK_FILL;
  const packed = packBrowser([...selection.items.values()], { budgetMs: fillBudget, workers, slowdown });
  const rotation = head ? emptyRotation() : await planRotation({ root, changes, model, selection, packed, specHashes, fillBudget, workers, slowdown });
  const browserItems = [...packed.run, ...rotation.run.filter((item) => !item.key.startsWith(PWA_PREFIX))];
  const args = playwrightArgs(browserItems);
  return { root, baseRef, head, changes, model, mapSource: source, selection, packed, rotation, browserBudget, workers, currentSpecs: new Set(Object.keys(specHashes)), ...args, wholeSpecs: wholeSpecHashes(packed.run, specHashes) };
}

const emptyRotation = () => ({ run: [], own: [], deferred: [], pwaRun: [], store: null, candidates: 0, estimatedMs: 0 });

async function pwaSpecs(root) {
  return (await readdir(path.join(root, PWA_DIR)).catch(() => [])).filter((name) => name.endsWith('.spec.js')).sort().map((name) => `${PWA_DIR}/${name}`);
}

/**
 * Everything after the change's own browser tests are packed: PWA selection, then the stalest tests
 * (owed ones first) into the budget that is left over.
 */
export async function planRotation({ root, changes, model, selection, packed, specHashes, fillBudget, workers, slowdown, store = null, pwaList = null }) {
  store ??= await loadRotation(root);
  const specs = pwaList ?? await pwaSpecs(root);
  const pwaBudget = Math.min(PWA_MAX_MS, Math.max(0, fillBudget - PWA_BUILD_MS));
  // PWA specs the change reaches: all of them for a service worker / build / offline-route change, else the changed spec.
  const touched = changes.filter((change) => PWA_TRIGGER.test(change.file) && !change.file.startsWith(`${PWA_DIR}/`)).map((change) => change.file);
  const reason = (spec) => (changes.some((change) => change.file === spec) ? `changed ${path.posix.basename(spec)}` : touched.length ? `${touched[0]} can change offline behaviour` : null);
  const own = pwaItems(specs.filter((spec) => reason(spec)), store, reason);
  const ownRun = [];
  const ownDeferred = [];
  for (const item of rotationOrder(own, store)) (pwaCost([...ownRun, item]) * slowdown <= pwaBudget ? ownRun : ownDeferred).push(item);
  // Candidates: every known test the change did not select, plus owed items from earlier runs.
  const selectedKeys = new Set([...selection.items.keys(), ...own.map((item) => item.key)]);
  const candidates = [];
  const live = new Set(Object.keys(specHashes));
  for (const [id, info] of model.tests) if (!selectedKeys.has(id) && live.has(info.spec)) candidates.push({ key: id, id, kind: 'case', spec: info.spec, grepTitle: info.grepTitle, durationMs: info.durationMs || DEFAULT_CASE_MS, tier: 9, reasons: [] });
  for (const item of pwaItems(specs, store)) if (!selectedKeys.has(item.key)) candidates.push(item);
  const known = new Set([...candidates.map((item) => item.key), ...selectedKeys]);
  for (const [key, owed] of Object.entries(store.owed)) {
    const stillThere = owed.item.config === 'pwa' ? specs.includes(owed.item.spec) : live.has(owed.item.spec);
    if (!known.has(key) && stillThere) candidates.push({ ...owed.item, tier: 9, reasons: [] });
    else if (!stillThere) delete store.owed[key]; // its spec is gone
  }
  // Items the change selected that did not fit are owed: they head the next run's rotation.
  const deferred = [...packed.deferred.filter((item) => item.tier !== 2), ...ownDeferred];
  const result = fillRotation({ candidates, store, run: [...packed.run, ...ownRun], budgetMs: Math.min(fillBudget, fillBudget * (ROTATION_FILL / PACK_FILL)), pwaBudgetMs: pwaBudget, workers, slowdown });
  for (const item of result.added) item.reasons = [store.owed[item.key] ? 'owed: a change selected it earlier and it did not fit' : store.tests[item.key] ? `rotation: last passed ${store.tests[item.key].at.slice(0, 16)}Z` : 'rotation: no passing run recorded yet'];
  const rotationBudget = Math.min(fillBudget, fillBudget * (ROTATION_FILL / PACK_FILL));
  const unreachable = candidates.filter((item) => (item.key.startsWith(PWA_PREFIX) ? pwaCost([item]) : item.durationMs) * slowdown > (item.key.startsWith(PWA_PREFIX) ? pwaBudget : rotationBudget));
  return { run: [...ownRun, ...result.added], own: ownRun, unreachable, rotationAdded: result.added, deferred, store, candidates: candidates.length, estimatedMs: result.estimatedMs };
}

// Specs that run in full this time: their map entry can be replaced wholesale afterwards.
function wholeSpecHashes(run, specHashes) {
  const whole = {};
  for (const item of run) if (item.kind === 'spec' && specHashes[item.spec] !== undefined) whole[item.spec] = specHashes[item.spec];
  return whole;
}

// Recorded durations come from a quiet machine; when the machine is oversubscribed every test takes
// proportionally longer, so estimate with that slowdown (and defer more) rather than overrun the budget.
export function loadSlowdown() {
  if (process.env.CUBESIGHT_GATE_NO_LOAD_SCALE) return 1;
  return Math.min(3, Math.max(1, loadavg()[0] / Math.max(1, cpus().length)));
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

export function formatPlan(plan, { verbose = false } = {}) {
  const { selection, packed, model } = plan;
  const lines = [];
  lines.push(`Change-aware gate: base ${plan.baseRef.slice(0, 9)} -> ${plan.head ?? 'working tree'}; ${plan.changes.length} changed file(s); impact map: ${plan.mapSource} (${model.tests.size} tests, ${model.functions.size} modules with function history${model.updatedAt ? `, updated ${model.updatedAt.slice(0, 16)}Z` : ''}).`);
  for (const file of selection.files) lines.push(`  ${file.file}  [${file.kind}] ${file.summary}${file.hits ? ` -> ${file.hits} test(s)` : ''}`);
  for (const text of selection.notes) lines.push(`  note: ${text}`);
  for (const text of selection.warnings) lines.push(`  WARNING: ${text}`);
  const counts = {};
  for (const item of selection.items.values()) if (!item.floor) counts[tierLabel(item.tier)] = (counts[tierLabel(item.tier)] ?? 0) + 1;
  lines.push(`Unit tests: all, ~7 s. Those that import a changed module: ${[...selection.unit].join(', ') || 'none'}.`);
  lines.push(`Browser: ${selection.items.size} selected (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(', ') || 'smoke floor only'}); `
    + `${packed.run.length} will run, est. ${seconds(packed.estimatedMs)} on ${plan.workers} workers within ${seconds(plan.browserBudget)}${packed.slowdown > 1.05 ? ` (machine load: timings scaled x${packed.slowdown.toFixed(1)})` : ''}; ${packed.deferred.length} deferred.`);
  const describe = (item) => item.kind === 'case' ? `${path.posix.basename(item.spec)} › ${item.grepTitle.replace(/^\S+\.spec\.js\s/u, '')}` : item.kind === 'title' ? `${path.posix.basename(item.spec)} › ${item.title}` : `${path.posix.basename(item.spec)} (whole spec)`;
  const listing = verbose ? packed.run : packed.run.slice(0, 12);
  for (const item of listing) lines.push(`  run  [${tierLabel(item.tier)}] ${describe(item)} (~${seconds(item.durationMs)})${item.reasons[0] ? `  <- ${item.reasons[0]}` : ''}`);
  if (packed.run.length > listing.length) lines.push(`  ... and ${packed.run.length - listing.length} more`);
  if (packed.deferred.length) {
    const specific = packed.deferred.filter((item) => item.tier !== 2);
    const broad = packed.deferred.filter((item) => item.tier === 2);
    if (specific.length) {
      lines.push(`OWED ${specific.length} selected test(s) did not fit this run's budget. They are recorded and run FIRST in the next run's rotation, ahead of every other test.`);
      for (const item of specific.slice(0, verbose ? Infinity : 30)) lines.push(`  owed [${tierLabel(item.tier)}] ${describe(item)} (~${seconds(item.durationMs)})`);
      if (!verbose && specific.length > 30) lines.push(`  ... and ${specific.length - 30} more (use --verbose)`);
    }
    if (broad.length) {
      const hot = new Map();
      for (const item of broad) { const why = item.reasons[0]?.replace(/^ran /u, '').replace(/ \(broad.*$/u, '') ?? 'a changed function'; hot.set(why, (hot.get(why) ?? 0) + 1); }
      lines.push(`  ${broad.length} broad: tests that merely execute changed code which most of the suite runs (${[...hot].slice(0, 4).map(([why, n]) => `${why} x${n}`).join('; ')}); a sample ran, and they take their turn in the rotation like every other test (--verbose lists them).`);
      if (verbose) for (const item of broad) lines.push(`  broad ${describe(item)}`);
    }
  }
  const rotation = plan.rotation;
  if (rotation?.store) {
    const added = rotation.rotationAdded ?? [];
    const pwa = rotation.run.filter((item) => item.key.startsWith(PWA_PREFIX));
    const browserAdded = added.filter((item) => !item.key.startsWith(PWA_PREFIX));
    lines.push(`Rotation: ${browserAdded.length} browser test(s) added from the ${rotation.candidates} not selected, stalest first${rotation.own.length || added.some((item) => item.key.startsWith(PWA_PREFIX)) ? `; PWA offline: ${pwa.length} spec(s) (${pwa.map((item) => path.posix.basename(item.spec, '.spec.js')).join(', ')})` : '; PWA offline: none this run'}.`);
    if (rotation.unreachable?.length) lines.push(`  WARNING: ${rotation.unreachable.length} test(s) are longer than the whole rotation budget and can never be reached (${rotation.unreachable.slice(0, 2).map((item) => `${path.posix.basename(item.spec)} ~${seconds(item.durationMs)}`).join(', ')}${rotation.unreachable.length > 2 ? ', ...' : ''}). Make them cheaper; they are never skipped on purpose.`);
    for (const item of added.slice(0, verbose ? Infinity : 4)) lines.push(`  rotation ${describe(item)} (~${seconds(item.durationMs)})  <- ${item.reasons[0]}`);
    if (!verbose && added.length > 4) lines.push(`  ... and ${added.length - 4} more`);
  }
  return lines.join('\n');
}

/** Stages for runTier: lint, unit, build checks and the selected browser tests, in parallel. */
export function gateStages(plan, { browser = true, checks = true, stopAfterMs = null } = {}) {
  const stop = Number.isFinite(stopAfterMs) ? [`--global-timeout=${Math.max(1000, Math.round(stopAfterMs))}`] : [];
  const stages = [];
  const pwa = plan.rotation?.run.filter((item) => item.key.startsWith(PWA_PREFIX)) ?? [];
  const build = 'npm run build && node scripts/check-no-dev-gallery.mjs && npm run gallery:coverage';
  // The PWA specs run against the gate's own build (the preview server serves dist/), so they wait for it in the same stage.
  const pwaRun = `[ $(( CUBESIGHT_DEADLINE_MS - $(date +%s%3N) )) -gt ${PWA_MIN_START_MS} ] || { echo 'PWA specs skipped: no time left after the build'; exit 0; }; PLAYWRIGHT_JSON_OUTPUT_NAME=${path.join(GATE_DIR, 'report-pwa.json')} npx playwright test --config=${PWA_CONFIG} --update-snapshots=none --reporter=line,json ${pwa.map((item) => `'${item.spec}'`).join(' ')}`;
  if (checks) {
    // Same checks as `npm run lint`, but cached (only changed files are re-linted) and split so they overlap.
    stages.push(['lint-js', 'npx', ['eslint', '--cache', '--cache-location', `${LINT_CACHE_DIR}/eslintcache`, '.']]);
    stages.push(['lint-css', 'npx', ['stylelint', '--cache', '--cache-location', `${LINT_CACHE_DIR}/stylelintcache`, 'src/**/*.css']]);
    stages.push(['unit', 'npm', ['run', 'test:unit']]);
    stages.push(pwa.length && browser ? ['build+pwa', 'sh', ['-c', `${build} && ${pwaRun}`]] : ['build', 'sh', ['-c', build]]);
  } else stages.push(['unit', 'npm', ['run', 'test:unit']]);
  if (browser && plan.specs.length) {
    stages.push(['browser', 'npx', ['playwright', 'test', '--config=playwright.merge.config.js', '--update-snapshots=none', '--max-failures=5',
      `--workers=${plan.workers}`, '--reporter=line,json', ...stop, ...plan.specs, ...(plan.grep ? [`--grep=${plan.grep}`] : [])]]);
  }
  return stages;
}

export function gateEnv(root, plan, base = process.env) {
  const directory = path.join(root, GATE_DIR);
  return {
    ...base,
    CUBESIGHT_IMPACT_COVERAGE: '1',
    CUBESIGHT_IMPACT_COVERAGE_DIR: path.join(directory, 'raw'),
    PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(directory, 'report.json'),
  };
}

export async function prepareGateDirectory(root) {
  const directory = path.join(root, GATE_DIR);
  await rm(directory, { recursive: true, force: true });
  await mkdir(path.join(directory, 'raw'), { recursive: true });
}

/** Fold the coverage the browser stage just produced into the live map. Returns a one-line summary. */
export async function updateMapFromRun(root, plan) {
  const directory = path.join(root, GATE_DIR);
  let report = null;
  try { report = JSON.parse(await readFile(path.join(directory, 'report.json'), 'utf8')); } catch { return 'impact map not updated (no Playwright report).'; }
  const { model } = await loadModel(root);
  const outcome = await ingestRun(model, { rawDir: path.join(directory, 'raw'), report, wholeSpecs: plan.wholeSpecs });
  await saveModel(root, model);
  return `impact map updated from this run: ${outcome.updated} test(s) refreshed${outcome.skippedFailing ? `, ${outcome.skippedFailing} failing left untouched` : ''}.`;
}

const readReport = async (file) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; } };

/**
 * After the run: record what passed, owe what was deferred, say honestly which failures are the change's and which
 * the rotation's, and print the freshness line. Returns the lines to print and whether anything failed.
 */
export async function finishRotation(root, plan, { commit, now = new Date() } = {}) {
  const rotation = plan.rotation;
  if (!rotation?.store) return { lines: [], failed: false, stageOk: {} };
  const directory = path.join(root, GATE_DIR);
  const browserReport = await readReport(path.join(directory, 'report.json'));
  const pwaReport = await readReport(path.join(directory, 'report-pwa.json'));
  const browserResults = browserReport ? reportResults(browserReport, root) : new Map();
  const pwaResults = pwaReport ? reportResults(pwaReport, root) : new Map();
  const outcomes = [
    ...outcomesFromResults(browserResults),
    ...(pwaReport ? outcomesFromResults(pwaResults, { pwa: true }) : []),
  ];
  const store = rotation.store;
  const failures = outcomes.filter((outcome) => outcome.status === 'failed' || outcome.status === 'timedOut');
  const ownItems = [...plan.packed.run, ...rotation.own];
  const ownKeys = new Set(ownItems.map((item) => item.key));
  const ownSpecs = new Set(ownItems.filter((item) => item.kind !== 'case').map((item) => item.spec));
  // Attribution reads the store as it was BEFORE this run's passes overwrite last-passed.
  const lines = describeFailures({ failures, ownKeys, ownSpecs, store, root, now });
  // Did every test the change selected finish? Anything the time limit cut that was only rotation is not a failure.
  const finished = new Set(outcomes.filter((outcome) => outcome.status === 'passed').map((outcome) => outcome.key));
  const finishedSpecs = new Set(outcomes.filter((outcome) => outcome.status === 'passed').map((outcome) => outcome.spec));
  const unfinishedOwn = ownItems.filter((item) => !(item.kind === 'case' || item.key.startsWith(PWA_PREFIX) ? finished.has(item.key) : finishedSpecs.has(item.spec)));
  const ownCut = (pwa) => unfinishedOwn.filter((item) => item.key.startsWith(PWA_PREFIX) === pwa).length;
  const cutRotation = rotation.rotationAdded.filter((item) => !finished.has(item.key) && !failures.some((f) => f.key === item.key));
  const stageOk = {
    browser: Boolean(browserReport) && !failures.some((f) => !f.key.startsWith(PWA_PREFIX)) && !ownCut(false),
    'build+pwa': Boolean(pwaReport) && !failures.some((f) => f.key.startsWith(PWA_PREFIX)) && !ownCut(true),
  };
  const ownUnfinished = unfinishedOwn.map((item) => (item.kind === 'case' ? `${path.posix.basename(item.spec)} › ${item.grepTitle.replace(/^\S+\.spec\.js\s/u, '')}` : path.posix.basename(item.spec)));
  if (ownUnfinished.length) lines.push(`FAILED: ${ownUnfinished.length} test(s) selected by your change did not finish before the time limit (the machine is busy or the plan was too big): ${ownUnfinished.slice(0, 5).join('; ')}${ownUnfinished.length > 5 ? '; ...' : ''}`);
  if (cutRotation.length) lines.push(`${cutRotation.length} rotation test(s) did not get to run before the time limit (the machine is busy); they stay the stalest and go first next time.`);
  recordRun(store, { outcomes, deferred: rotation.deferred, commit, now });
  await saveRotation(root, store);
  const suite = [
    ...[...(await loadModel(root)).model.tests].filter(([, info]) => plan.currentSpecs?.has(info.spec) ?? true).map(([key, info]) => ({ key, label: `${path.posix.basename(info.spec)} › ${info.grepTitle.replace(/^\S+\.spec\.js\s/u, '')}` })),
    ...(await pwaSpecs(root)).map((spec) => ({ key: `${PWA_PREFIX}${spec}`, label: `${path.posix.basename(spec)} (PWA)` })),
  ];
  lines.push(freshnessLine({ tests: suite, store, root, now }));
  return { lines, failed: failures.length > 0 || ownUnfinished.length > 0, stageOk };
}
