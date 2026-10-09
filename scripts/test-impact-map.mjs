#!/usr/bin/env node
// Full refresh of the committed impact map seed (tests/impact-map.json).
//
// This belongs to Tier 2 or a schedule, never to the gate: it runs every browser
// test with coverage on. The gate keeps its own overlay fresh from each run.
//
//   node scripts/test-impact-map.mjs                 full capture, then write the seed
//   node scripts/test-impact-map.mjs --from-raw DIR [--report FILE] [--merge]   rebuild from a capture already on disk (--merge adds to the seed)
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { hashSpecs, emptyModel, ingestRun, loadModel, reportResults, reportSpecs, saveModel, SEED_PATH, LIVE_PATH } from './test-impact-store.mjs';

const root = process.cwd();
const argument = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const rawDir = path.resolve(argument('--from-raw') ?? 'test-results/impact-map/raw');
const reportFile = path.resolve(argument('--report') ?? 'test-results/impact-map/playwright-report.json');

if (!argument('--from-raw')) {
  await rm(rawDir, { recursive: true, force: true });
  const config = process.env.PLAYWRIGHT_CONFIG ? [`--config=${process.env.PLAYWRIGHT_CONFIG}`] : [];
  const result = spawnSync('npx', ['playwright', 'test', '--output=test-results/impact-map/playwright', '--reporter=line,json', ...config], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, CUBESIGHT_IMPACT_COVERAGE: '1', CUBESIGHT_IMPACT_COVERAGE_DIR: rawDir, PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile },
  });
  if (result.status !== 0) console.warn('Some tests failed; their coverage is left out of the map (a failing test records partial coverage).');
}
const report = await readFile(reportFile, 'utf8').then(JSON.parse, () => null);
if (!report) console.warn(`No Playwright report at ${reportFile}: every raw record is accepted and durations stay unknown.`);
const merge = process.argv.includes('--merge'); // add this capture to the existing seed instead of rebuilding it
const model = merge ? (await loadModel(root, { live: false })).model : emptyModel();
const outcome = await ingestRun(model, { rawDir, report, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() });
model.specHashes = await hashSpecs(root, [...new Set([...reportSpecs(report, root), ...[...model.tests.values()].map((info) => info.spec)])]);
// Extra Playwright reports (e.g. a quiet-machine run) contribute their timings; the fastest wins.
for (const file of process.argv.flatMap((value, i, all) => (all[i - 1] === '--durations' ? [value] : []))) {
  const extra = reportResults(JSON.parse(await readFile(path.resolve(file), 'utf8')), root);
  for (const [id, result] of extra) {
    const info = model.tests.get(id);
    if (info && result.status === 'passed' && result.durationMs && result.durationMs < info.durationMs) info.durationMs = result.durationMs;
  }
}
model.generatedAt = merge ? model.generatedAt : new Date().toISOString();
await saveModel(root, model, SEED_PATH);
await rm(path.join(root, LIVE_PATH), { force: true });
console.log(`Wrote ${SEED_PATH}: ${model.tests.size} tests, ${model.modules.size} modules, ${model.functions.size} modules with function history (${outcome.updated} refreshed, ${outcome.skippedFailing} failing skipped).`);
