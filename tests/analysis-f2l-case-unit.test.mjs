import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentSolve } from '../src/analysis/segment.js';
import { pairTargets } from '../src/analysis/pairs.js';
import { summarizeAnalysis } from '../src/analysis/summary.js';
import { cleanAnalysis } from '../src/store/analysis-field.js';
import { unrelabelMoves } from '../src/analysis/normalize.js';
import { GOLD } from './analysis-golden.mjs';

test('analysis identifies the canonical F2L case from actual pair-start states on all six cross faces', () => {
  for (const face of ['D', 'F', 'U', 'B', 'R', 'L']) {
    const scramble = unrelabelMoves(GOLD.normal.scramble.split(' '), face).join(' ');
    const moves = unrelabelMoves(GOLD.normal.moves.split(' '), face);
    const segmentation = segmentSolve({ scramble, moves, crossFace: face });
    const pairs = pairTargets(segmentation);
    const summary = summarizeAnalysis({ segmentation, pairs });
    assert.deepEqual(summary.f2lCases, { pair1: { caseId: 'f2l/4', targetPair: 'FR' } }, face);
    assert.deepEqual(cleanAnalysis(summary).f2lCases, summary.f2lCases, face);
  }
});
