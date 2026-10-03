#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { findPlaywrightFailureCandidates } from './test-health-report.mjs';

const root = process.cwd();
const dir = path.join(root, 'test-results/health/repeat');
const files = (await readdir(path.join(root, 'tests'))).filter((name) => name.endsWith('-unit.test.mjs')).map((name) => `tests/${name}`);
await mkdir(dir, { recursive: true });
const runs = [
  ['playwright', 'npx', ['playwright', 'test', '--output=test-results/health/repeat/playwright-output', '--repeat-each=5', '--reporter=json']],
  ['pwa', 'npx', ['playwright', 'test', '--config=playwright.pwa.config.js', '--output=test-results/health/repeat/pwa-output', '--repeat-each=5', '--reporter=json']],
];
const results = [];
for (let repeat = 1; repeat <= 5; repeat += 1) {
  const started = performance.now();
  const run = spawnSync('node', ['--test', '--test-reporter=tap', ...files], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const durationMs = Math.round(performance.now() - started);
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  await writeFile(path.join(dir, `unit-${repeat}.log`), output);
  const failures = [...output.matchAll(/^not ok \d+ - (.+)$/gmu)].map((match) => match[1]);
  results.push({ name: `unit repeat ${repeat}`, durationMs, exitCode: run.status, failures });
}
for (const [name, command, args] of runs) {
  const started = performance.now();
  const run = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const durationMs = Math.round(performance.now() - started);
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  await writeFile(path.join(dir, `${name}.log`), output);
  let failures;
  if (name === 'unit') failures = [...output.matchAll(/^not ok \d+ - (.+)$/gmu)].map((match) => match[1]);
  else {
    try {
      failures = findPlaywrightFailureCandidates(JSON.parse(run.stdout ?? '')).map((candidate) => `${candidate.title}: ${candidate.status} (${candidate.durationMs} ms)`);
      if (run.status !== 0 && failures.length === 0) failures.push(`Playwright exited ${run.status} without a test-level failure in its JSON report.`);
    }
    catch { failures = ['Could not parse the Playwright JSON report; flakiness could not be classified.']; }
  }
  results.push({ name, durationMs, exitCode: run.status, failures });
  console.log(`${name}: ${durationMs} ms, exit ${run.status}, ${failures.length} failure lines`);
}
const report = { generatedAt: new Date().toISOString(), unitRepeats: 5, playwrightRepeats: 5, pwaRepeats: 5, retries: 0, runs: results };
await writeFile(path.join(dir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
const notes = [
  '# Repeated test run', '',
  `Generated ${report.generatedAt}. Playwright uses five repeats with retries disabled.`, '',
  ...results.map((result) => `## ${result.name}\n\nExit ${result.exitCode}; ${(result.durationMs / 1000).toFixed(1)}s.`
    + (result.failures.length ? `\n\nFailure candidates:\n${result.failures.map((line) => `- ${line}`).join('\n')}` : '\n\nNo failure candidates reported.')),
  '',
];
await writeFile(path.join(dir, 'summary.md'), notes.join('\n'));
if (results.some((result) => result.exitCode !== 0)) process.exitCode = 1;
