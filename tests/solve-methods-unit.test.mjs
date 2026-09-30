import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METHODS, getMethod, DEFAULT_METHOD, FINISH_STAGE } from '../src/solve-methods.js';

test('METHODS lists CFOP and Roux with stages, and getMethod falls back to the first', () => {
  const ids = METHODS.map(m => m.id);
  assert.ok(ids.includes('cfop'));
  assert.ok(ids.includes('roux'));
  const cfop = getMethod('cfop');
  assert.deepEqual(cfop.stages, ['Cross', 'F2L', 'EO', 'CO', 'PLL', 'Solved']);
  assert.deepEqual(getMethod('roux').stages, ['First Block', 'SB', 'CMLL', 'L6E', 'Solved']);
  assert.equal(getMethod('nope').id, DEFAULT_METHOD, 'unknown method falls back to default');
});

test('no method has a Scramble stage; every method ends at the finish point', () => {
  for (const m of METHODS) {
    assert.ok(!m.stages.includes('Scramble'), `${m.id} has no Scramble stage`);
    assert.equal(m.stages[m.stages.length - 1], FINISH_STAGE);
  }
});

test('CFOP mapProgress returns the stage currently being worked on', () => {
  const cfop = getMethod('cfop');
  assert.equal(cfop.mapProgress({}, 'solving'), 0);                                   // building the cross → Cross
  assert.equal(cfop.mapProgress({ crossDone: true }, 'solving'), 1);                  // cross done → F2L
  assert.equal(cfop.mapProgress({ crossDone: true, pairsSolved: 2 }, 'solving'), 1);  // still F2L
  assert.equal(cfop.mapProgress({ crossDone: true, f2lDone: true }, 'solving'), 2);   // F2L done → EO
  assert.equal(cfop.mapProgress({ crossDone: true, f2lDone: true, coDone: true }, 'solving'), 2);  // corners first: still EO
  assert.equal(cfop.mapProgress({ crossDone: true, f2lDone: true, eoDone: true }, 'solving'), 3);  // EO done → CO
  assert.equal(cfop.mapProgress({ crossDone: true, f2lDone: true, eoDone: true, coDone: true, ollDone: true }, 'solving'), 4);  // OLL done → PLL
  assert.equal(cfop.mapProgress({ crossDone: true, f2lDone: true, eoDone: true, coDone: true, ollDone: true, solved: true }, 'solving'), 5);  // finish
});

test('Roux mapProgress (CFOP-mapped for now) stays in range and advances', () => {
  const roux = getMethod('roux');
  assert.equal(roux.mapProgress({}, 'solving'), 0);
  assert.equal(roux.mapProgress({ crossDone: true }, 'solving'), 1);
  assert.equal(roux.mapProgress({ crossDone: true, f2lDone: true }, 'solving'), 2);
  assert.equal(roux.mapProgress({ crossDone: true, f2lDone: true, eoDone: true, coDone: true, ollDone: true }, 'solving'), 3);
});

test('scrambling/inspection sit on the first stage; a solved cube reaches the finish, never beyond', () => {
  for (const m of METHODS) assert.equal(m.mapProgress({}, 'applying'), 0);
  for (const m of METHODS) assert.equal(m.mapProgress({}, 'inspecting'), 0);
  for (const m of METHODS) assert.equal(m.mapProgress(null, 'inspecting'), 0);
  for (const m of METHODS) assert.equal(m.mapProgress({ crossDone: true, pairsSolved: 4, f2lDone: true, eoDone: true, coDone: true, ollDone: true, solved: true }, 'solving'), m.stages.length - 1);
  // A solve that goes straight from scrambled to solved (e.g. undoing the scramble) still finishes.
  for (const m of METHODS) assert.equal(m.mapProgress({ solved: true }, 'solving'), m.stages.length - 1);
});
