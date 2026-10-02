#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'test-results/health');
const slowLimitMs = 20_000;
const unitFiles = (await readdir(path.join(root, 'tests')))
  .filter((name) => name.endsWith('-unit.test.mjs'))
  .map((name) => `tests/${name}`);

function execute(command, args) {
  const started = performance.now();
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { ...result, elapsedMs: Math.round(performance.now() - started) };
}

function flattenTests(node, suite = '') {
  if (!node || typeof node !== 'object') return [];
  const ownName = typeof node.title === 'string' ? node.title : typeof node.name === 'string' ? node.name : '';
  const fullName = [suite, ownName].filter(Boolean).join(' › ');
  const duration = Number(node.duration ?? node.duration_ms ?? node.durationMs);
  const isCase = node.type === 'test' || node.expectedStatus || node.status === 'passed' || node.status === 'failed';
  const children = [node.tests, node.suites, node.specs, node.results].flatMap((value) => Array.isArray(value) ? value : []);
  const childCases = children.flatMap((child) => flattenTests(child, fullName));
  return [...(isCase && Number.isFinite(duration) ? [{ name: fullName, durationMs: Math.round(duration), status: node.status ?? 'unknown' }] : []), ...childCases];
}

const suites = [];
const unit = execute('node', ['--test', '--test-reporter=json', ...unitFiles]);
suites.push({ name: 'unit', elapsedMs: unit.elapsedMs, exitCode: unit.status, output: unit.stdout });
const playwright = execute('npx', ['playwright', 'test', '--reporter=json']);
suites.push({ name: 'playwright', elapsedMs: playwright.elapsedMs, exitCode: playwright.status, output: playwright.stdout });
const reports = suites.map((suite) => {
  let parsed;
  try { parsed = JSON.parse(suite.output); } catch { parsed = null; }
  return { name: suite.name, wallTimeMs: suite.elapsedMs, exitCode: suite.exitCode, tests: parsed ? flattenTests(parsed) : [] };
});
const tests = reports.flatMap((suite) => suite.tests.map((test) => ({ ...test, suite: suite.name })));
const slowest = [...tests].sort((a, b) => b.durationMs - a.durationMs).slice(0, 20);
const overBudget = tests.filter((test) => test.durationMs > slowLimitMs);
const result = {
  generatedAt: new Date().toISOString(),
  softLimitMs: slowLimitMs,
  suites: reports.map(({ name, wallTimeMs, exitCode }) => ({ name, wallTimeMs, exitCode })),
  testsObserved: tests.length,
  slowestTests: slowest,
  testsOverSoftLimit: overBudget,
  reportsParsed: reports.map(({ name, tests: found }) => ({ name, testCount: found.length })),
};
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`);
const lines = [
  '# Test health',
  '',
  `Generated ${result.generatedAt}. Soft per-test limit: ${slowLimitMs / 1000}s.`,
  '',
  ...reports.map((suite) => `- ${suite.name}: ${(suite.wallTimeMs / 1000).toFixed(1)}s wall time; exit ${suite.exitCode}; ${suite.tests.length} test timings parsed.`),
  '',
  '## Slowest tests',
  '',
  ...(slowest.length ? slowest.map((test) => `- ${test.durationMs} ms — ${test.suite}: ${test.name}`) : ['No per-test timings were parsed from the runner reports.']),
  '',
  `Tests above the soft limit: ${overBudget.length}.`,
  '',
];
await writeFile(path.join(outDir, 'summary.md'), lines.join('\n'));
console.log(lines.join('\n'));
for (const suite of suites) {
  if (suite.status !== 0) process.exitCode = suite.status ?? 1;
}
if (overBudget.length) process.exitCode = 1;
