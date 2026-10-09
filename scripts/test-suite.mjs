#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { DEFAULT_TRUNK, STOP_MARGIN_MS, finishRotation, formatPlan, gateEnv, gateStages, planGate, prepareGateDirectory, updateMapFromRun } from './test-gate.mjs';

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

// There is exactly one suite, `npm test`, and it has exactly one budget.
export const SUITE_BUDGET_MS = 60_000;
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
 * Whether the suite passed, and by how much it overran.
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

export async function runTier({ tier = 'test', stages, budgetMs = SUITE_BUDGET_MS, parallel = false, ...options }) {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new Error('A positive tier budget is required.');
  const start = performance.now();
  const results = [];
  const execute = stage => runStage(stage, { ...options, remainingMs: budgetMs - (performance.now() - start) });
  const report = result => console.log(`${result.name}: ${(result.durationMs / 1000).toFixed(1)}s${result.timedOut ? ' (deadline exceeded)' : ''}; exit ${result.exitCode}`);
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
  const option = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
  const root = process.cwd();
  const plan = await planGate({ root, trunk: option('--trunk') ?? DEFAULT_TRUNK, base: option('--base'), started });
  console.log(formatPlan(plan, { verbose: process.argv.includes('--verbose') }));
  await prepareGateDirectory(root);
  const stages = gateStages(plan, { stopAfterMs: SUITE_BUDGET_MS - (performance.now() - started) - STOP_MARGIN_MS });
  const runtimeTmp = path.resolve('test-results/runtime-tmp');
  await mkdir(runtimeTmp, { recursive: true });
  const env = { ...gateEnv(root, plan), TMPDIR: runtimeTmp };
  if (!env.PW_PORT) env.PW_PORT = String(await freePort());
  env.CUBESIGHT_DEADLINE_MS = String(Date.now() + SUITE_BUDGET_MS - (performance.now() - started) - STOP_MARGIN_MS);
  if (!env.PW_PWA_PORT) env.PW_PWA_PORT = String(await freePort());
  const budgetMs = SUITE_BUDGET_MS - (performance.now() - started);
  const result = await runTier({ stages, budgetMs, parallel: true, env });
  result.durationMs = Math.round(performance.now() - started);
  result.budgetMs = SUITE_BUDGET_MS;
  result.overBudgetMs = Math.max(0, Math.round(result.durationMs - result.budgetMs));
  result.commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  result.workingTreeDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim());
  result.generatedAt = new Date().toISOString();
  result.owed = plan.rotation.deferred.map((item) => item.key);
  console.log(await updateMapFromRun(root, plan));
  const rotation = await finishRotation(root, plan, { commit: result.commit });
  for (const line of rotation.lines) console.log(line);
  // A Playwright run that stopped at its own time limit with nothing of the change's unfinished is not a failure.
  for (const stage of result.stages) {
    if (stage.exitCode && !stage.timedOut && rotation.stageOk[stage.name]) { stage.exitCode = 0; stage.note = 'stopped at its time limit; only rotation tests were cut'; }
  }
  Object.assign(result, tierVerdict({ stages, results: result.stages, durationMs: result.durationMs, budgetMs: result.budgetMs }));
  if (rotation.failed) result.passed = false;
  const output = path.resolve('test-results/health');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'test-latest.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`test: ${(result.durationMs / 1000).toFixed(1)}s / ${result.budgetMs / 1000}s; ${result.passed ? 'passed' : 'failed'}`);
  const killed = (result.stages ?? []).filter((stage) => stage.timedOut).map((stage) => stage.name);
  if (killed.length) console.log(`FAILED: the deadline stopped ${killed.join(', ')} before it finished — the plan did not fit. Check machine load, or why the estimate was low.`);
  else if (result.overBudgetMs > 0) console.log(`WARNING: the suite ran ${(result.overBudgetMs / 1000).toFixed(1)}s over its ${result.budgetMs / 1000}s budget. Not a failure: every stage finished cleanly.`);
  if (!result.passed) process.exitCode = 1;
}
