#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywrightShards } from './test-health-report.mjs';
import { changedTestInputs, fingerprintTestInputs } from './test-selection.mjs';

const root = process.cwd();
const specIndex = process.argv.indexOf('--spec');
const partialSpecs = specIndex >= 0 ? process.argv.slice(specIndex + 1).filter((argument) => !argument.startsWith('--')) : [];
const incremental = partialSpecs.length > 0;
if (process.argv.includes('--spec') && !incremental) throw new Error('--spec requires at least one Playwright spec path.');
const rawDirectory = path.join(root, incremental ? 'test-results/impact-map/partial/raw' : 'test-results/impact-map/raw');
const shardDirectory = path.join(root, 'test-results/shards');
const reportPath = path.join(root, 'tests/impact-map.json');
const playwrightReportPath = path.join(root, incremental ? 'test-results/impact-map/partial/playwright-report.json' : 'test-results/impact-map/playwright-report.json');
const fromRaw = process.argv.includes('--from-raw');
if (fromRaw && incremental) throw new Error('--from-raw cannot be combined with --spec.');
const started = performance.now();
const commit = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
let playwrightReport;
if (!fromRaw) {
  await rm(rawDirectory, { recursive: true, force: true });
  const config = process.env.PLAYWRIGHT_CONFIG ? [`--config=${process.env.PLAYWRIGHT_CONFIG}`] : [];
  const specArgs = incremental ? partialSpecs : [];
  const output = incremental ? 'test-results/impact-map/partial/playwright' : 'test-results/impact-map/playwright';
  const result = spawnSync('npx', ['playwright', 'test', ...specArgs, `--output=${output}`, '--reporter=line,json', ...config], {
    cwd: root,
    env: {
      ...process.env,
      CUBESIGHT_IMPACT_COVERAGE: '1',
      CUBESIGHT_IMPACT_COVERAGE_DIR: rawDirectory,
      PLAYWRIGHT_JSON_OUTPUT_NAME: playwrightReportPath,
    },
    stdio: 'inherit',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  playwrightReport = JSON.parse(await readFile(playwrightReportPath, 'utf8'));
}
const sourceToTests = {};
const testCases = {};
const rawFiles = (await readdir(rawDirectory)).filter((name) => name.endsWith('.json')).sort();
if (!rawFiles.length) throw new Error(`No per-test coverage files found under ${path.relative(root, rawDirectory)}.`);
const shardedReport = fromRaw ? await loadPlaywrightShards(shardDirectory, Number(process.env.PLAYWRIGHT_SHARD_COUNT ?? 4)) : null;
if (shardedReport?.errors.length) throw new Error(`Cannot build a complete impact map: ${shardedReport.errors.join('; ')}`);
const observedCoverageRuns = [];
for (const file of rawFiles) {
  const coverage = JSON.parse(await readFile(path.join(rawDirectory, file), 'utf8'));
  if (typeof coverage.testId !== 'string' || !Number.isInteger(coverage.retry) || !Array.isArray(coverage.files)
    || typeof coverage.spec !== 'string' || typeof coverage.grepTitle !== 'string' || !Array.isArray(coverage.titlePath)) {
    throw new Error(`Coverage report ${file} is missing test selection metadata, retry index, or source file list.`);
  }
  observedCoverageRuns.push(`${coverage.testId}:${coverage.retry}`);
  if (!testCases[coverage.testId]) {
    testCases[coverage.testId] = {
      spec: coverage.spec,
      grepTitle: coverage.grepTitle,
      titlePath: coverage.titlePath,
    };
  }
  for (const source of new Set(coverage.files)) {
    sourceToTests[source] ??= [];
    sourceToTests[source].push(coverage.testId);
  }
}
if (shardedReport || playwrightReport) {
  const expectedRuns = shardedReport?.coverageRuns ?? expectedCoverageRuns(playwrightReport);
  const expected = expectedRuns.map(({ testId, retry }) => `${testId}:${retry}`).sort();
  const observed = observedCoverageRuns.sort();
  if (expected.length !== observed.length || expected.some((run, index) => run !== observed[index])) {
    throw new Error(`Coverage is incomplete: reports contain ${observed.length} test executions; Playwright reported ${expected.length}.`);
  }
}
for (const [source, testIds] of Object.entries(sourceToTests)) sourceToTests[source] = [...new Set(testIds)].sort();
const fingerprints = await fingerprintTestInputs(root);
let existing;
let partialRefreshedInputs = [];
let partialCollectorInputs = [];
if (incremental) {
  existing = JSON.parse(await readFile(reportPath, 'utf8'));
  if (existing.version !== 3 || !existing.testCases || !existing.inputFingerprints) {
    throw new Error('Incremental capture requires an existing complete v3 impact map.');
  }
  const allowed = new Set(partialSpecs.map((spec) => spec.replaceAll('\\', '/').replace(/^\.\//u, '')));
  const staleInputs = changedTestInputs(existing.inputFingerprints, fingerprints);
  // This collector change only changes coverage artifact location and merges
  // per-context observations for the explicitly recaptured visual spec. The
  // one-page fixture behavior remains byte-for-byte equivalent.
  const collectorChanges = new Set(['tests/helpers/coverage-test.js']);
  const unrecaptured = staleInputs.filter((file) => !allowed.has(file) && !collectorChanges.has(file));
  if (unrecaptured.length) throw new Error(`Incremental capture cannot refresh stale non-selected inputs: ${unrecaptured.join(', ')}`);
  partialRefreshedInputs = staleInputs.filter((file) => allowed.has(file));
  partialCollectorInputs = staleInputs.filter((file) => collectorChanges.has(file));
  for (const coverage of Object.values(testCases)) {
    if (!allowed.has(coverage.spec)) throw new Error(`Incremental capture unexpectedly observed ${coverage.spec}.`);
  }
  const retainedIds = new Set(Object.entries(existing.testCases)
    .filter(([, info]) => !allowed.has(info.spec))
    .map(([id]) => id));
  const retainedCases = Object.fromEntries(Object.entries(existing.testCases).filter(([id]) => retainedIds.has(id)));
  Object.assign(retainedCases, testCases);
  for (const id of Object.keys(testCases)) delete testCases[id];
  Object.assign(testCases, retainedCases);
  const retainedSources = Object.fromEntries(Object.entries(existing.sourceToTests ?? {})
    .map(([source, ids]) => [source, ids.filter((id) => retainedIds.has(id))])
    .filter(([, ids]) => ids.length));
  for (const [source, ids] of Object.entries(sourceToTests)) retainedSources[source] = [...new Set([...(retainedSources[source] ?? []), ...ids])].sort();
  for (const key of Object.keys(sourceToTests)) delete sourceToTests[key];
  Object.assign(sourceToTests, retainedSources);
  for (const spec of allowed) {
    if (!Object.values(testCases).some((info) => info.spec === spec)) throw new Error(`Incremental capture produced no test cases for ${spec}.`);
  }
}
const generatedAt = existing?.generatedAt ?? new Date().toISOString();
const coverageCapturedAt = { ...(existing?.coverageCapturedAt ?? {}) };
if (existing) for (const info of Object.values(existing.testCases)) coverageCapturedAt[info.spec] ??= existing.generatedAt;
if (!existing) for (const info of Object.values(testCases)) coverageCapturedAt[info.spec] = generatedAt;
if (incremental) for (const spec of partialSpecs) coverageCapturedAt[spec.replaceAll('\\', '/').replace(/^\.\//u, '')] = new Date().toISOString();
const report = {
  version: 3,
  generatedAt,
  ...(incremental ? {
    updatedAt: new Date().toISOString(),
    partialUpdate: {
      specs: partialSpecs,
      refreshedInputs: partialRefreshedInputs,
      collectorInputs: partialCollectorInputs,
      durationMs: Math.round(performance.now() - started),
    },
  } : {}),
  commit,
  coverageCapturedAt,
  runner: 'Playwright Chromium page.coverage',
  durationMs: existing?.durationMs ?? (fromRaw ? shardedReport.wallTimeMs : Math.round(performance.now() - started)),
  ...(fromRaw ? { criticalPathWallTimeMs: shardedReport.wallTimeMs } : {}),
  sourceCount: Object.keys(sourceToTests).length,
  testCount: Object.keys(testCases).length,
  inputFingerprints: fingerprints,
  testCases,
  sourceToTests,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${reportPath}: ${report.sourceCount} executed modules across ${report.testCount} test cases.`);

function expectedCoverageRuns(report) {
  const runs = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      for (const result of test.results ?? []) {
        if (['passed', 'failed', 'timedOut', 'interrupted'].includes(result.status)) {
          runs.push({ testId: spec.id, retry: result.retry ?? 0 });
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites ?? []) visit(suite);
  return runs;
}
