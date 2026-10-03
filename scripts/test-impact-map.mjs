#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywrightShards } from './test-health-report.mjs';

const root = process.cwd();
const rawDirectory = path.join(root, 'test-results/impact-map/raw');
const shardDirectory = path.join(root, 'test-results/shards');
const reportPath = path.join(root, 'tests/impact-map.json');
const fromRaw = process.argv.includes('--from-raw');
const started = performance.now();
if (!fromRaw) {
  await rm(rawDirectory, { recursive: true, force: true });
  const result = spawnSync('npx', ['playwright', 'test', '--output=test-results/impact-map/playwright', '--reporter=line'], {
    cwd: root,
    env: { ...process.env, CUBESIGHT_IMPACT_COVERAGE: '1' },
    stdio: 'inherit',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const sourceToTests = {};
const rawFiles = (await readdir(rawDirectory)).filter((name) => name.endsWith('.json')).sort();
if (!rawFiles.length) throw new Error(`No per-test coverage files found under ${path.relative(root, rawDirectory)}.`);
const shardedReport = fromRaw ? await loadPlaywrightShards(shardDirectory, Number(process.env.PLAYWRIGHT_SHARD_COUNT ?? 4)) : null;
if (shardedReport?.errors.length) throw new Error(`Cannot build a complete impact map: ${shardedReport.errors.join('; ')}`);
const observedCoverageRuns = [];
for (const file of rawFiles) {
  const coverage = JSON.parse(await readFile(path.join(rawDirectory, file), 'utf8'));
  if (typeof coverage.testId !== 'string' || !Number.isInteger(coverage.retry) || !Array.isArray(coverage.files)) {
    throw new Error(`Coverage report ${file} is missing its test ID, retry index, or source file list.`);
  }
  observedCoverageRuns.push(`${coverage.testId}:${coverage.retry}`);
  for (const source of new Set(coverage.files)) {
    sourceToTests[source] ??= [];
    sourceToTests[source].push(coverage.spec);
  }
}
if (shardedReport) {
  const expected = shardedReport.coverageRuns.map(({ testId, retry }) => `${testId}:${retry}`).sort();
  const observed = observedCoverageRuns.sort();
  if (expected.length !== observed.length || expected.some((run, index) => run !== observed[index])) {
    throw new Error(`Coverage is incomplete: reports contain ${observed.length} test executions; Playwright reported ${expected.length}.`);
  }
}
for (const [source, specs] of Object.entries(sourceToTests)) sourceToTests[source] = [...new Set(specs)].sort();
const report = {
  version: 2,
  generatedAt: new Date().toISOString(),
  runner: 'Playwright Chromium page.coverage',
  durationMs: fromRaw ? shardedReport.wallTimeMs : Math.round(performance.now() - started),
  ...(fromRaw ? { criticalPathWallTimeMs: shardedReport.wallTimeMs } : {}),
  sourceCount: Object.keys(sourceToTests).length,
  testCount: rawFiles.length,
  sourceToTests,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${reportPath}: ${report.sourceCount} executed modules across ${report.testCount} test cases.`);
