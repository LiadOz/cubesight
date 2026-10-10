import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weakPracticeCases, weakPracticeHref } from '../src/drills/weak-case-practice.js';

const record = (kind, caseId, recog, exec, extraLook = false) => ({
  at: 1, solved: true, solveMs: 9000,
  [`${kind}Case`]: caseId,
  analysis: { lastLayer: { [kind]: { recognitionMs: recog, executionMs: exec, extraLook } } },
});

test('weak-case list returns three canonical PLL cases and one joined recognition link', () => {
  const rows = [
    record('pll', 'Jb', 800, 1200), record('pll', 'Jb', 900, 1300),
    record('pll', 'Ua', 1600, 2000), record('pll', 'pll/ua', 1800, 2200),
    record('pll', 'pll/H', null, 2700), record('pll', 'H', null, 2800),
    record('pll', 'pll/Nope', 7000, 1000), record('pll', 'Nope', 7000, 1000),
  ];
  rows[0].analysis.lastLayer.pll.extraLook = true;
  const result = weakPracticeCases(rows, 'pll');
  assert.deepEqual(result.map(item => item.row.name), ['Jb', 'Ua', 'H']);
  assert.equal(result[0].recognitionHref, '#/drills/pll?cases=Jb');
  assert.equal(weakPracticeHref(result), '#/drills/pll?cases=Jb%2CUa');
  assert.equal(result[0].executionHref, '#/algs/pll/Jb/drill');
  assert.equal(result[2].recognitionHref, null, 'execution-only evidence links only to execution practice');
  assert.equal(result[2].executionHref, '#/algs/pll/H/drill');
});

test('weak-case list requires two matching timing samples or proven extra-look evidence, and ignores unknown labels', () => {
  assert.deepEqual(weakPracticeCases([record('oll', 'oll/34', 100, 200)], 'oll'), []);
  assert.deepEqual(weakPracticeCases([record('oll', 'OLL Mystery', 9000, 9000), record('oll', 'OLL Mystery', 8000, 8000)], 'oll'), []);
  assert.deepEqual(weakPracticeCases([record('oll', 'oll/34', null, null), record('oll', 'oll/34', null, null)], 'oll'), []);
  assert.deepEqual(weakPracticeCases([record('oll', 'oll/34', 9000, 200), record('oll', 'oll/34', null, null)], 'oll'), [], 'one timed observation is insufficient');
});
