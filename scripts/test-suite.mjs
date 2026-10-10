#!/usr/bin/env node
// `npm test`: the one test suite. It runs EVERYTHING, every time — lint, all unit
// tests, the build, every browser test and the offline (PWA) tests — so the same
// commit runs the same tests on any machine. There is no time limit and nothing is
// ever skipped or failed for being slow: the suite is meant to be fast because the
// tests are cheap, not because a clock cuts it off. Wall time and the slowest
// browser tests are printed so a slow test is visible and can be made cheaper.
//
// Stages run side by side. Offline tests need only their own cube-stub build;
// they do not wait for the independent production build and its checks.
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'test-results', 'suite');
const browserReport = path.join(out, 'browser.json');
const offlineReport = path.join(out, 'offline.json');

function run(name, command, args, env = {}) {
  const started = performance.now();
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', chunk => { log += chunk; });
    child.stderr.on('data', chunk => { log += chunk; });
    child.on('close', code => {
      const seconds = (performance.now() - started) / 1000;
      console.log(`${code === 0 ? 'ok  ' : 'FAIL'} ${name.padEnd(9)} ${seconds.toFixed(1).padStart(6)} s`);
      if (code !== 0) console.log(log.split('\n').slice(-60).join('\n'));
      resolve({ name, code, seconds });
    });
  });
}

async function slowestBrowserTests(reportPath, limit = 5) {
  try {
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    const tests = [];
    const walk = (suite, file) => {
      file = suite.file ?? file;
      for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) for (const r of (t.results ?? []).slice(-1)) tests.push({ ms: r.duration ?? 0, title: `${path.basename(file ?? '')} › ${spec.title}` });
      for (const child of suite.suites ?? []) walk(child, file);
    };
    for (const suite of report.suites ?? []) walk(suite);
    return { count: tests.length, skipped: report.stats?.skipped ?? 0, slowest: tests.sort((a, b) => b.ms - a.ms).slice(0, limit) };
  } catch { return null; }
}

const started = performance.now();
await mkdir(out, { recursive: true });
const pw = path.join(root, 'node_modules', '.bin', 'playwright');
const results = await Promise.all([
  run('lint', 'npm', ['run', '--silent', 'lint']),
  run('unit', 'npm', ['run', '--silent', 'test:unit']),
  run('browser', pw, ['test', '--reporter=line,json'], { PLAYWRIGHT_JSON_OUTPUT_NAME: browserReport }),
  run('build', 'sh', ['-c', 'npm run --silent build && node scripts/check-no-dev-gallery.mjs && npm run --silent gallery:coverage']),
  (async () => {
    const build = await run('pwa-build', path.join(root, 'node_modules', '.bin', 'vite'), ['build', '--logLevel', 'warn', '--outDir', 'test-results/dist-test', '--emptyOutDir'], { VITE_CUBESIGHT_TEST_STUB: '1' });
    if (build.code !== 0) return [build];
    return [build, await run('offline', pw, ['test', '--config=scripts/test-pwa.config.mjs', '--reporter=line,json'], { PLAYWRIGHT_JSON_OUTPUT_NAME: offlineReport })];
  })(),
]).then(list => list.flat());

const wall = (performance.now() - started) / 1000;
const failed = results.filter(result => result.code !== 0);
for (const [name, reportPath] of [['browser', browserReport], ['offline', offlineReport]]) {
  const browser = await slowestBrowserTests(reportPath);
  if (!browser) continue;
  console.log(`\n${browser.count} ${name} tests${browser.skipped ? ` (${browser.skipped} skipped)` : ''}. Slowest:`);
  for (const t of browser.slowest) console.log(`  ${(t.ms / 1000).toFixed(1).padStart(5)} s  ${t.title}`);
}
console.log(`\nnpm test: ${failed.length ? 'FAILED' : 'passed'} in ${wall.toFixed(1)} s${wall > 60 ? ' (target is 60 s: make the slowest tests cheaper)' : ''}`);
process.exitCode = failed.length ? 1 : 0;
