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
  const result = spawnSync('npx', ['playwright', 'test', '--reporter=line'], {
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
for (const file of rawFiles) {
  const coverage = JSON.parse(await readFile(path.join(rawDirectory, file), 'utf8'));
  for (const source of new Set(coverage.files)) {
    sourceToTests[source] ??= [];
    sourceToTests[source].push({ id: coverage.testId, title: coverage.title, spec: coverage.spec });
  }
}
for (const tests of Object.values(sourceToTests)) tests.sort((a, b) => a.id.localeCompare(b.id));
const report = {
  version: 1,
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
