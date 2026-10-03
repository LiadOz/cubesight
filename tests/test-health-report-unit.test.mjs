import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { expectedCoverageRuns, findPlaywrightFailureCandidates, loadPlaywrightShards } from '../scripts/test-health-report.mjs';

const now = Date.parse('2026-10-03T12:00:00.000Z');

async function makeShardDirectory(t, reports) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cubesight-health-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const report of reports) {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${report.shard}-of-${report.totalShards}.json`), `${JSON.stringify(report)}\n`);
  }
  return directory;
}

function shard({ shard, wallTimeMs, exitCode = 0, commit = process.env.GITHUB_SHA ?? 'abc123', generatedAt = new Date(now).toISOString(), title = `test-${shard}` }) {
  return {
    shard, totalShards: 2, commit, wallTimeMs, exitCode, generatedAt,
    playwright: { suites: [{ title: `tests/${title}.spec.js`, specs: [{ title, tests: [{ expectedStatus: 'passed', results: [{ status: 'passed', duration: wallTimeMs / 2 }] }] }] }] },
  };
}

test('sharded health wall time uses the slowest shard and retains individual test timing', async (t) => {
  const directory = await makeShardDirectory(t, [shard({ shard: 1, wallTimeMs: 110 }), shard({ shard: 2, wallTimeMs: 240 })]);
  const report = await loadPlaywrightShards(directory, 2, now);
  assert.equal(report.wallTimeMs, 240);
  assert.deepEqual(report.tests.map(({ name, durationMs }) => ({ name, durationMs })), [
    { name: 'tests/test-1.spec.js › test-1', durationMs: 55 },
    { name: 'tests/test-2.spec.js › test-2', durationMs: 120 },
  ]);
  assert.deepEqual(report.errors, []);
});

test('incomplete, stale, or failed shard sets cannot yield a green health report', async (t) => {
  const incomplete = await makeShardDirectory(t, [shard({ shard: 1, wallTimeMs: 100 })]);
  const missingReport = await loadPlaywrightShards(incomplete, 2, now);
  assert.match(missingReport.errors.join('\n'), /Expected 2 distinct shard reports/u);

  const stale = await makeShardDirectory(t, [
    shard({ shard: 1, wallTimeMs: 100, generatedAt: '2026-10-01T12:00:00.000Z' }),
    shard({ shard: 2, wallTimeMs: 100 }),
  ]);
  const staleReport = await loadPlaywrightShards(stale, 2, now);
  assert.match(staleReport.errors.join('\n'), /missing a fresh generation timestamp/u);

  const failed = await makeShardDirectory(t, [
    shard({ shard: 1, wallTimeMs: 100, exitCode: 1 }), shard({ shard: 2, wallTimeMs: 100 }),
  ]);
  const failedReport = await loadPlaywrightShards(failed, 2, now);
  assert.match(failedReport.errors.join('\n'), /Shard 1 exited 1/u);

  const wrongCommit = await makeShardDirectory(t, [
    shard({ shard: 1, wallTimeMs: 100, commit: 'old-sha' }), shard({ shard: 2, wallTimeMs: 100, commit: 'old-sha' }),
  ]);
  const commitReport = await loadPlaywrightShards(wrongCommit, 2, now, 'expected-sha');
  assert.match(commitReport.errors.join('\n'), /belongs to old-sha, expected expected-sha/u);
});

test('repeat-run report names each test with any failed or timed-out repetition', () => {
  const report = { suites: [{ title: 'tests/sample.spec.js', specs: [{ title: 'expected failure', tests: [
    { expectedStatus: 'failed', results: [{ status: 'failed', duration: 80 }] },
  ] }, { title: 'stable test', tests: [
    { expectedStatus: 'passed', results: [{ status: 'passed', duration: 80 }] },
  ] }, { title: 'flaky test', tests: [
    { expectedStatus: 'passed', results: [{ status: 'passed', duration: 90 }, { status: 'failed', duration: 400 }, { status: 'passed', duration: 85 }] },
  ] }] }] };
  assert.deepEqual(findPlaywrightFailureCandidates(report), [
    { title: 'tests/sample.spec.js › flaky test', status: 'failed', durationMs: 400 },
  ]);
});

test('coverage completeness counts executed attempts and ignores skipped tests', () => {
  const shard = { playwright: { suites: [{ specs: [
    { id: 'case-a', tests: [{ results: [{ status: 'passed', retry: 0 }, { status: 'passed', retry: 1 }] }] },
    { id: 'case-b', tests: [{ results: [{ status: 'skipped', retry: 0 }] }] },
  ] }] } };
  assert.deepEqual(expectedCoverageRuns([shard]), [
    { testId: 'case-a', retry: 0 },
    { testId: 'case-a', retry: 1 },
  ]);
});
