// The change-aware gate behind `npm test`, `npm run tier1` and the merge queue.
//
//   changed files = diff against trunk (merge-base) + uncommitted work
//   run           = lint, ALL unit tests, build, then the browser tests the diff reaches
//   budget        = 60 s wall clock; whatever does not fit is deferred and listed, never dropped
import { mkdir, readdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gitChanges, mergeBase, packBrowser, playwrightArgs, selectTests, tierLabel } from './test-select.mjs';
import { hashSpecs, ingestRun, loadModel, saveModel } from './test-impact-store.mjs';

export const DEFAULT_TRUNK = 'main';
export const GATE_BUDGET_MS = 60_000;
// Dev-server start + Playwright start + result ingestion, none of which is test time.
export const BROWSER_OVERHEAD_MS = 9_000;
export const GATE_DIR = 'test-results/gate';

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
  const packed = packBrowser([...selection.items.values()], { budgetMs: browserBudget, workers });
  const args = playwrightArgs(packed.run);
  return { root, baseRef, head, changes, model, mapSource: source, selection, packed, browserBudget, workers, ...args, wholeSpecs: wholeSpecHashes(packed.run, specHashes) };
}

// Specs that run in full this time: their map entry can be replaced wholesale afterwards.
function wholeSpecHashes(run, specHashes) {
  const whole = {};
  for (const item of run) if (item.kind === 'spec' && specHashes[item.spec] !== undefined) whole[item.spec] = specHashes[item.spec];
  return whole;
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
    + `${packed.run.length} will run, est. ${seconds(packed.estimatedMs)} on ${plan.workers} workers within ${seconds(plan.browserBudget)}; ${packed.deferred.length} deferred.`);
  const describe = (item) => item.kind === 'case' ? `${path.posix.basename(item.spec)} › ${item.grepTitle.replace(/^\S+\.spec\.js\s/u, '')}` : item.kind === 'title' ? `${path.posix.basename(item.spec)} › ${item.title}` : `${path.posix.basename(item.spec)} (whole spec)`;
  const listing = verbose ? packed.run : packed.run.slice(0, 12);
  for (const item of listing) lines.push(`  run  [${tierLabel(item.tier)}] ${describe(item)} (~${seconds(item.durationMs)})${item.reasons[0] ? `  <- ${item.reasons[0]}` : ''}`);
  if (packed.run.length > listing.length) lines.push(`  ... and ${packed.run.length - listing.length} more`);
  if (packed.deferred.length) {
    const specific = packed.deferred.filter((item) => item.tier !== 2);
    const broad = packed.deferred.filter((item) => item.tier === 2);
    lines.push(`DEFERRED ${packed.deferred.length} selected test(s) that did not fit the budget. They are NOT dropped: Tier 2 (npm run tier2) and the merge queue's full stage must cover them.`);
    for (const item of specific.slice(0, verbose ? Infinity : 30)) lines.push(`  deferred [${tierLabel(item.tier)}] ${describe(item)} (~${seconds(item.durationMs)})`);
    if (!verbose && specific.length > 30) lines.push(`  ... and ${specific.length - 30} more (use --verbose)`);
    if (broad.length) {
      const hot = new Map();
      for (const item of broad) { const why = item.reasons[0]?.replace(/^ran /u, '').replace(/ \(broad.*$/u, '') ?? 'a changed function'; hot.set(why, (hot.get(why) ?? 0) + 1); }
      lines.push(`  ${broad.length} broad: tests that merely execute changed code which most of the suite runs (${[...hot].slice(0, 4).map(([why, n]) => `${why} x${n}`).join('; ')}); a sample ran, the rest is Tier 2's job (--verbose lists them).`);
      if (verbose) for (const item of broad) lines.push(`  deferred [broad] ${describe(item)}`);
    }
  }
  return lines.join('\n');
}

/** Stages for runTier: lint, unit, build checks and the selected browser tests, in parallel. */
export function gateStages(plan, { browser = true, checks = true } = {}) {
  const stages = [];
  if (checks) {
    stages.push(['lint', 'npm', ['run', 'lint']]);
    stages.push(['unit', 'npm', ['run', 'test:unit']]);
    stages.push(['build', 'sh', ['-c', 'npm run build && node scripts/check-no-dev-gallery.mjs && npm run gallery:coverage']]);
  } else stages.push(['unit', 'npm', ['run', 'test:unit']]);
  if (browser && plan.specs.length) {
    stages.push(['browser', 'npx', ['playwright', 'test', '--config=playwright.merge.config.js', '--update-snapshots=none', '--max-failures=1',
      `--workers=${plan.workers}`, '--reporter=line,json', ...plan.specs, ...(plan.grep ? [`--grep=${plan.grep}`] : [])]]);
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
