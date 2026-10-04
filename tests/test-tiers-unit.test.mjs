import test from 'node:test';
import assert from 'node:assert/strict';
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
