import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METHODS, getMethod, DEFAULT_METHOD } from '../src/solve-methods.js';

test('METHODS lists CFOP and Roux with stages, and getMethod falls back to the first', () => {
  const ids = METHODS.map(m => m.id);
  assert.ok(ids.includes('cfop'));
  assert.ok(ids.includes('roux'));
  const cfop = getMethod('cfop');
  assert.equal(cfop.stages.length, 7);
  assert.equal(getMethod('nope').id, DEFAULT_METHOD, 'unknown method falls back to default');
});

test('CFOP mapProgress maps cross/F2L/OLL/PLL milestones to stage indices', () => {
  const cfop = getMethod('cfop');
  assert.equal(cfop.mapProgress({}, 'solving'), 0);
  assert.equal(cfop.mapProgress({ crossDone: true }, 'solving'), 1);
  assert.equal(cfop.mapProgress({ crossDone: true, pairsSolved: 2 }, 'solving'), 1);  // still Cross (F2L one stage)
  assert.equal(cfop.mapProgress({ crossDone: true, f2lDone: true }, 'solving'), 2);  // F2L
  assert.equal(cfop.mapProgress({ crossDone: true, f2lDone: true, eoDone: true, coDone: true }, 'solving'), 4);  // CO (OLL done)
  assert.equal(cfop.mapProgress({ crossDone: true, f2lDone: true, eoDone: true, coDone: true, solved: true }, 'solving'), 5);  // PLL
});

test('applying/inspecting map to the Scramble stage for every method', () => {
  for (const m of METHODS) assert.equal(m.mapProgress({}, 'applying'), 0);
  for (const m of METHODS) assert.equal(m.mapProgress({}, 'inspecting'), 0);
});
