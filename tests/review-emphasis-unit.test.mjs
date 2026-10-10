import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewEmphasis } from '../src/brain/review/emphasis.js';
import { stagePieces } from '../src/ui/cube/pieces.js';
import { createSolvedState, stateFromScramble, toRenderData } from '../src/cross-cube.js';

const record = { analysis: { face: 'U', pairs: [{ n: 2, chosenSlot: 'BR', better: { slot: 'FL', slots: ['FL'] } }] } };

test('review highlights the recorded pair for yours and the suggested pair for better, on the actual cross face', () => {
  const state = createSolvedState();
  const yours = reviewEmphasis(record, 'pair2');
  const better = reviewEmphasis(record, 'pair2', 'better');
  assert.deepEqual(stagePieces(state, yours.stage, yours.options).pieces, ['UBR', 'BR']);
  assert.deepEqual(stagePieces(state, better.stage, better.options).pieces, ['UFL', 'FL']);
  assert.deepEqual(stagePieces(state, better.stage, better.options).positions, ['UFL', 'FL']);
});

test('highlight identities follow a scrambled pair, independently of its target slot', () => {
  const state = stateFromScramble('R U');
  const wanted = reviewEmphasis({ analysis: { face: 'D', pairs: [{ n: 1, chosenSlot: 'FR' }] } }, 'pair1');
  const found = stagePieces(state, wanted.stage, wanted.options);
  assert.deepEqual(found.pieces, ['DFR', 'FR']);
  assert.deepEqual(found.positions, ['DFR', 'FR']);
  const data = toRenderData(state, found.pieces);
  assert.equal(data.highlightedPieces.length, 2);
  assert.notDeepEqual(data.highlightedPieces.sort(), found.positions.slice().sort());
});

test('cross review includes X-cross pairs and unknown pair targets never guess another slot', () => {
  const state = createSolvedState();
  const wanted = reviewEmphasis({ analysis: { face: 'D', cross: { target: { slots: ['FR'] } } } }, 'cross');
  assert.equal(stagePieces(state, wanted.stage, wanted.options).pieces.length, 6);
  const unknown = reviewEmphasis(record, 'pair1');
  assert.equal(stagePieces(state, unknown.stage, unknown.options), null);
  assert.equal(reviewEmphasis(record, null), null);
});


test('case metadata uses the normalized cross-on-D frame, while alternative options use physical slots', () => {
  const state = createSolvedState();
  const legacy = { analysis: { face: 'U', f2lCases: { pair1: { targetPair: 'FR' } } } };
  const wanted = reviewEmphasis(legacy, 'pair1');
  assert.deepEqual(stagePieces(state, wanted.stage, wanted.options).pieces, ['UBR', 'BR']);
  const option = reviewEmphasis(record, 'pair2', 'better', ['FR']);
  assert.deepEqual(stagePieces(state, option.stage, option.options).pieces, ['UFR', 'FR']);
});
