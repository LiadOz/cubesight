#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const index = Number(process.env.PLAYWRIGHT_SHARD_INDEX ?? 1);
const total = Number(process.env.PLAYWRIGHT_SHARD_COUNT ?? 1);
const workers = process.env.PLAYWRIGHT_WORKERS;
const config = process.env.PLAYWRIGHT_CONFIG;
const commit = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 1 || index > total) {
  throw new Error('Set PLAYWRIGHT_SHARD_INDEX and PLAYWRIGHT_SHARD_COUNT to a valid 1-based shard.');
}
const started = performance.now();
const run = spawnSync('npx', ['playwright', 'test', `--shard=${index}/${total}`, `--output=test-results/playwright-shard-${index}`, '--reporter=json', ...(workers ? [`--workers=${workers}`] : []), ...(config ? [`--config=${config}`] : [])], {
  cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});
const wallTimeMs = Math.round(performance.now() - started);
const report = { shard: index, totalShards: total, commit, generatedAt: new Date().toISOString(), wallTimeMs, exitCode: run.status };
try { report.playwright = JSON.parse(run.stdout); } catch { report.reportParseError = true; }
const output = path.resolve(`test-results/shards/${index}-of-${total}.json`);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Playwright shard ${index}/${total}: ${(wallTimeMs / 1000).toFixed(1)}s wall time; report ${output}`);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status ?? 1);
