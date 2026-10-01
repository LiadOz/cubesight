import test from 'node:test';
import assert from 'node:assert/strict';
import { getCases } from '../src/algs/seed/cases.js';
import { identifyOllCase } from '../src/drills/oll-model.js';

test('all canonical OLL setups resolve to their standard case number', async () => {
  const cases = getCases('oll');
  assert.equal(cases.length, 57);
  for (const row of cases) {
    const found = await identifyOllCase(row.setup);
    assert.equal(found?.id, row.id, `${row.id} setup should identify as its canonical case`);
  }
});

test('OLL matching rejects positions with an unsolved F2L', async () => {
  assert.equal(await identifyOllCase("R U R'"), null);
});
