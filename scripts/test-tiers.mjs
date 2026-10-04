#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TIER_BUDGETS = Object.freeze({ merge: 60_000, regression: 600_000 });
export const REGRESSION_STAGES = Object.freeze([
  ['check', 'npm', ['run', 'check']],
  ['browser', 'npx', ['playwright', 'test', '--update-snapshots=none', '--max-failures=1']],
  ['pwa', 'npm', ['run', 'test:pwa', '--', '--update-snapshots=none', '--max-failures=1']],
  ['layout', 'npm', ['run', 'test:layout', '--', '--update-snapshots=none', '--max-failures=1']],
  ['snapshots', 'npm', ['run', 'test:snapshots', '--', '--update-snapshots=none', '--max-failures=1']],
  ['performance-capture', 'npm', ['run', 'perf']],
  ['performance-budgets', 'npm', ['run', 'perf:check']],
]);

// Kill the process group on timeout: npm, Vite and browser children must not
// survive a failed budget and continue consuming resources in the next run.
export async function runStage([name, command, args], { remainingMs, cwd = process.cwd(), env = process.env } = {}) {
  if (!Number.isFinite(remainingMs)) throw new Error('A finite remaining deadline is required.');
  if (remainingMs <= 0) return { name, exitCode: 1, durationMs: 0, timedOut: true };
  const start = performance.now();
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', detached: process.platform !== 'win32' });
  let timedOut = false;
  const kill = () => {
    timedOut = true;
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  const deadline = setTimeout(kill, remainingMs);
  const exitCode = await new Promise(resolve => {
    child.once('error', error => { console.error(error.message); resolve(127); });
    child.once('close', code => resolve(code ?? 1));
  });
  clearTimeout(deadline);
  return { name, exitCode: timedOut ? 1 : exitCode, durationMs: Math.round(performance.now() - start), timedOut };
}

export async function runTier({ tier, stages, budgetMs = TIER_BUDGETS[tier], parallel = false, ...options }) {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new Error('A positive tier budget is required.');
  const start = performance.now();
  const results = [];
  const execute = stage => runStage(stage, { ...options, remainingMs: budgetMs - (performance.now() - start) });
  const report = result => console.log(`${result.name}: ${(result.durationMs / 1000).toFixed(1)}s${result.timedOut ? ' (tier deadline exceeded)' : ''}; exit ${result.exitCode}`);
  if (parallel) {
    results.push(...await Promise.all(stages.map(async stage => {
      const result = await execute(stage);
      report(result);
      return result;
    })));
  } else for (const stage of stages) {
    const result = await execute(stage);
    results.push(result);
    report(result);
    if (result.exitCode) break;
  }
  const durationMs = Math.round(performance.now() - start);
  return { tier, budgetMs, durationMs, passed: results.length === stages.length && results.every(result => !result.exitCode) && durationMs <= budgetMs, stages: results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tier = process.argv[2];
  if (!['merge', 'regression'].includes(tier)) throw new Error('Usage: test-tiers.mjs merge|regression');
  const stages = tier === 'regression' ? REGRESSION_STAGES : [
    ['check', 'npm', ['run', 'check']],
    ['smoke-and-affected', 'npx', ['playwright', 'test', '--config=playwright.merge.config.js', '--update-snapshots=none', '--max-failures=1', 'tests/merge-smoke.spec.js', ...process.argv.slice(3)]],
  ];
  const result = await runTier({ tier, stages, parallel: tier === 'merge' });
  result.commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  result.workingTreeDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim());
  result.generatedAt = new Date().toISOString();
  const output = path.resolve('test-results/health');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, `${tier}-latest.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${tier}: ${(result.durationMs / 1000).toFixed(1)}s / ${result.budgetMs / 1000}s; ${result.passed ? 'passed' : 'failed'}`);
  if (!result.passed) process.exitCode = 1;
}
