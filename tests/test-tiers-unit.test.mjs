import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { runTier, TIER_BUDGETS } from '../scripts/test-tiers.mjs';

test('test tiers enforce the user budgets', () => {
  assert.deepEqual(TIER_BUDGETS, { merge: 60_000, regression: 600_000 });
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
