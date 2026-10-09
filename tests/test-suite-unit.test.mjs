import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { readFile as read } from 'node:fs/promises';
import { tierVerdict, runTier, SUITE_BUDGET_MS } from '../scripts/test-suite.mjs';

test('there is one suite with one budget of a minute, and no long suite behind it', async () => {
  assert.equal(SUITE_BUDGET_MS, 60_000);
  const { scripts } = JSON.parse(await read(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(scripts.test, 'node scripts/test-suite.mjs');
  for (const name of ['tier1', 'tier2', 'test:merge', 'test:regression']) assert.equal(scripts[name], undefined, `${name} must not exist`);
  assert.doesNotMatch(await read(new URL('../scripts/test-suite.mjs', import.meta.url), 'utf8'), /regression/iu);
});
test('a failing stage stops the tier', async () => {
  const result = await runTier({ tier: 'proof', budgetMs: 2000, stages: [
    ['fail', process.execPath, ['-e', 'process.exit(3)']],
    ['must-not-run', process.execPath, ['-e', 'process.exit(0)']],
  ] });
  assert.equal(result.passed, false);
  assert.equal(result.stages.length, 1);
  assert.equal(result.stages[0].exitCode, 3);
});
test('the shared deadline terminates a hung runner', async () => {
  const result = await runTier({ tier: 'proof', budgetMs: 200, stages: [
    ['hang', process.execPath, ['-e', 'setInterval(() => {}, 1000)']],
  ] });
  assert.equal(result.passed, false);
  assert.equal(result.stages[0].timedOut, true);
  assert.ok(result.durationMs < 2000);
});
test('independent merge checks can share the deadline in parallel', async () => {
  const result = await runTier({ tier: 'proof', budgetMs: 2000, parallel: true, stages: [
    ['one', process.execPath, ['-e', 'process.exit(0)']],
    ['two', process.execPath, ['-e', 'process.exit(0)']],
  ] });
  assert.equal(result.passed, true);
  assert.equal(result.stages.length, 2);
});


test('a tier deadline also terminates a server in a separate process group', async () => {
  await mkdir('test-results/health', { recursive: true });
  const pidFile = path.resolve(`test-results/health/escaped-server-${process.pid}.pid`);
  const script = `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const server=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'inherit'}); fs.writeFileSync(process.argv[1],String(server.pid)); setInterval(()=>{},1000);`;
  const result = await runTier({ tier: 'proof', budgetMs: 1000, stages: [
    ['escaped-server', process.execPath, ['-e', script, pidFile]],
  ] });
  assert.equal(result.passed, false);
  assert.equal(result.stages[0].timedOut, true);
  assert.ok(result.durationMs < 5000);
  const serverPid = Number(await readFile(pidFile, 'utf8'));
  // A killed child may briefly remain a zombie until its parent is reaped.
  // On a loaded machine the kill can take a moment to land, so poll briefly instead of racing it.
  let status;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    status = await readFile(`/proc/${serverPid}/status`, 'utf8').catch(() => null);
    if (status === null || /State:\s+Z/.test(status)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(status === null || /State:\s+Z/.test(status), 'escaped server cannot remain running');
  await unlink(pidFile);
});

// The merge queue once rejected a correct change for taking 60.2s of 60s on a busy
// machine. Budget is enforced by planning and by the hard deadline (a killed stage
// fails); overhead alone must not reject clean work.
test('a run whose stages all finished cleanly passes even if overhead pushed it past the budget', () => {
  const stages = [['a'], ['b']];
  const ok = tierVerdict({ stages, results: [{ exitCode: 0 }, { exitCode: 0 }], durationMs: 60_200, budgetMs: 60_000 });
  assert.deepEqual(ok, { passed: true, overBudgetMs: 200 });
});
test('a failed, killed or missing stage still fails the tier whatever the time', () => {
  const stages = [['a'], ['b']];
  assert.equal(tierVerdict({ stages, results: [{ exitCode: 0 }, { exitCode: 1 }], durationMs: 10, budgetMs: 60_000 }).passed, false);
  assert.equal(tierVerdict({ stages, results: [{ exitCode: 0 }, { exitCode: 0, timedOut: true }], durationMs: 10, budgetMs: 60_000 }).passed, false);
  assert.equal(tierVerdict({ stages, results: [{ exitCode: 0 }], durationMs: 10, budgetMs: 60_000 }).passed, false);
});
