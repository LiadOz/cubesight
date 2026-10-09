#!/usr/bin/env node
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { DEFAULT_TRUNK, formatPlan, gateEnv, gateStages, planGate, prepareGateDirectory, updateMapFromRun } from './test-gate.mjs';

/**
 * Claim a free port for this run's dev server.
 *
 * The Playwright configs default to a fixed port with `reuseExistingServer:
 * false`, so the gate failed outright whenever any other test run held it --
 * exactly the concurrent-agent case the merge queue exists to serve. Binding to
 * port 0 lets the OS pick one that is actually free.
 */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}

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

// Playwright web servers can create their own process groups. Include every
// descendant before terminating the runner, so an expired tier leaves no server.
export function terminateProcessTree(pid) {
  if (process.platform !== 'win32') {
    const rows = execFileSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' })
      .trim().split('\n').map(row => row.trim().split(/\s+/).map(Number));
    const owned = new Set([pid]);
    let added = true;
    while (added) {
      added = false;
      for (const [child, parent] of rows) if (owned.has(parent) && !owned.has(child)) { owned.add(child); added = true; }
    }
    for (const child of [...owned].reverse()) {
      try { process.kill(child, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    try { process.kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  } else {
    execFileSync('taskkill', ['/pid', String(pid), '/T', '/F']);
  }
}

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
    terminateProcessTree(child.pid);
  };
  const interrupted = () => terminateProcessTree(child.pid);
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  const deadline = setTimeout(kill, remainingMs);
  const exitCode = await new Promise(resolve => {
    child.once('error', error => { console.error(error.message); resolve(127); });
    child.once('close', code => resolve(code ?? 1));
  });
  clearTimeout(deadline);
  process.removeListener('SIGINT', interrupted);
  process.removeListener('SIGTERM', interrupted);
  return { name, exitCode: timedOut ? 1 : exitCode, durationMs: Math.round(performance.now() - start), timedOut };
}

/**
 * Whether a tier passed, and by how much it overran.
 *
 * The budget is enforced by planning (the gate selects what fits and defers the
 * rest) and by a hard deadline that kills any stage still running when time is
 * up -- a killed stage fails. So a run in which every stage finished cleanly is a
 * pass even if the total crept past the budget by process overhead: the merge
 * queue rejected a correct change for taking 60.2s of 60s on a busy machine,
 * which made the gate depend on machine load rather than on the code. A small
 * overrun is reported loudly instead.
 */
export function tierVerdict({ stages, results, durationMs, budgetMs }) {
  const completed = results.length === stages.length;
  const clean = results.every(result => !result.exitCode && !result.timedOut);
  return { passed: completed && clean, overBudgetMs: Math.max(0, Math.round(durationMs - budgetMs)) };
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
  return { tier, budgetMs, durationMs, ...tierVerdict({ stages, results, durationMs, budgetMs }), stages: results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = performance.now();
  const tier = process.argv[2];
  if (!['merge', 'regression'].includes(tier)) throw new Error('Usage: test-tiers.mjs merge|regression [--base <ref>] [--trunk <branch>]');
  const option = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
  const root = process.cwd();
  let plan = null;
  let stages = REGRESSION_STAGES;
  const refreshMap = tier === 'regression' && process.argv.includes('--refresh-map');
  const refreshDir = path.resolve('test-results/impact-map');
  if (tier === 'merge') {
    plan = await planGate({ root, trunk: option('--trunk') ?? DEFAULT_TRUNK, base: option('--base'), started });
    console.log(formatPlan(plan));
    await prepareGateDirectory(root);
    stages = gateStages(plan);
  }
  const runtimeTmp = path.resolve('test-results/runtime-tmp');
  await mkdir(runtimeTmp, { recursive: true });
  // `tier2 --refresh-map`: the browser stage doubles as the full coverage capture that refreshes the committed seed.
  if (refreshMap) {
    stages = stages.map(([name, command, args]) => (name === 'browser' ? [name, command, [...args, '--reporter=line,json']] : [name, command, args]));
  }
  const refreshEnv = refreshMap ? { CUBESIGHT_IMPACT_COVERAGE: '1', CUBESIGHT_IMPACT_COVERAGE_DIR: path.join(refreshDir, 'raw'), PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(refreshDir, 'playwright-report.json') } : {};
  if (refreshMap) await rm(path.join(refreshDir, 'raw'), { recursive: true, force: true });
  const env = { ...(plan ? gateEnv(root, plan) : process.env), ...refreshEnv, TMPDIR: runtimeTmp };
  if (!env.PW_PORT) env.PW_PORT = String(await freePort());
  const budgetMs = tier === 'merge' ? TIER_BUDGETS.merge - (performance.now() - started) : TIER_BUDGETS[tier];
  const result = await runTier({ tier, stages, budgetMs, parallel: tier === 'merge', env });
  result.durationMs = Math.round(performance.now() - started);
  result.budgetMs = TIER_BUDGETS[tier];
  result.overBudgetMs = Math.max(0, Math.round(result.durationMs - result.budgetMs));
  result.commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  result.workingTreeDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim());
  result.generatedAt = new Date().toISOString();
  if (plan) {
    result.deferred = plan.packed.deferred.map((item) => item.key);
    console.log(await updateMapFromRun(root, plan));
  }
  if (refreshMap && result.stages.find((stage) => stage.name === 'browser')?.exitCode === 0) {
    spawnSync('node', ['scripts/test-impact-map.mjs', '--from-raw', path.join(refreshDir, 'raw'), '--report', path.join(refreshDir, 'playwright-report.json')], { cwd: root, stdio: 'inherit' });
    console.log('tests/impact-map.json was refreshed from this full run; commit it.');
  }
  const output = path.resolve('test-results/health');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, `${tier}-latest.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${tier}: ${(result.durationMs / 1000).toFixed(1)}s / ${result.budgetMs / 1000}s; ${result.passed ? 'passed' : 'failed'}`);
  const killed = (result.stages ?? []).filter(stage => stage.timedOut).map(stage => stage.name);
  if (killed.length) console.log(`FAILED: the deadline stopped ${killed.join(', ')} before it finished — the plan did not fit. Check machine load, or why the estimate was low.`);
  else if (result.overBudgetMs > 0) console.log(`WARNING: ${tier} ran ${(result.overBudgetMs / 1000).toFixed(1)}s over its ${result.budgetMs / 1000}s budget. Not a failure: every stage finished cleanly.`);
  if (plan?.packed.deferred.length) console.log(`${plan.packed.deferred.length} selected test(s) were deferred past the budget; Tier 2 / the merge queue's full stage must cover them.`);
  if (!result.passed) process.exitCode = 1;
}
