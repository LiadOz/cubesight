import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolvedState, stateFromScramble } from '../src/cross-cube.js';
import { crossPieces, f2lPairIds, lastLayerPieces, stagePieces } from '../src/ui/cube/pieces.js';

// The one definition of "the cross", "an F2L pair" and "the last layer" as sets of pieces; every screen that
// emphasises pieces (algs, drills, review, replay, pins) goes through it.

test('the cross is the four edges of its face, on any face', () => {
  const state = createSolvedState();
  assert.deepEqual([...crossPieces(state)].sort(), ['DB', 'DF', 'DL', 'DR']);
  assert.deepEqual([...crossPieces(state, 'u')].sort(), ['UB', 'UF', 'UL', 'UR']);
  assert.deepEqual([...crossPieces(state, 'F')].sort(), ['DF', 'FL', 'FR', 'UF']);
});

test('an F2L pair is one corner and one edge, whichever way the slot is written', () => {
  assert.deepEqual(f2lPairIds('FR'), { corner: 'DFR', edge: 'FR' });
  assert.deepEqual(f2lPairIds('pair:BL'), { corner: 'DBL', edge: 'BL' });
  assert.deepEqual(f2lPairIds('RF'), { corner: 'DFR', edge: 'FR' });
  assert.deepEqual(f2lPairIds('FR', 'U'), { corner: 'UFR', edge: 'FR' });
  assert.deepEqual(f2lPairIds('nonsense'), { corner: null, edge: null });
});

test('the last layer is the four edges and four corners opposite the cross', () => {
  const state = stateFromScramble("R U R' U' F2 D L");
  const ll = lastLayerPieces(state);
  assert.equal(ll.length, 8);
  assert.ok(ll.every(id => id.includes('U')));
  assert.equal(ll.filter(id => id.length === 2).length, 4);
  assert.equal(ll.filter(id => id.length === 3).length, 4);
  assert.ok(lastLayerPieces(state, 'U').every(id => id.includes('D')));
});

test('stage emphasis: cross, x-cross, pair and last layer, each dimming the rest', () => {
  const state = createSolvedState();
  const cross = stagePieces(state, 'cross');
  assert.deepEqual([...cross.pieces].sort(), ['DB', 'DF', 'DL', 'DR']);
  assert.equal(cross.dimOthers, true);
  const xcross = stagePieces(state, 'xcross', { slots: ['FR'] });
  assert.deepEqual([...xcross.pieces].sort(), ['DB', 'DF', 'DFR', 'DL', 'DR', 'FR']);
  const pair = stagePieces(state, 'pair2', { slot: 'BL' });
  assert.deepEqual([...pair.pieces].sort(), ['BL', 'DBL']);
  // the slot's own cubicles are emphasised too, so an out-of-slot pair still shows where it belongs
  assert.deepEqual([...pair.positions].sort(), ['BL', 'DBL']);
  for (const stage of ['oll', 'eo', 'co', 'cp', 'ep', 'pll', 'll']) assert.equal(stagePieces(state, stage).pieces.length, 8, stage);
  assert.equal(stagePieces(state, 'pair'), null, 'a pair stage without a slot names nothing, so nothing is dimmed');
  assert.equal(stagePieces(state, 'warm-up'), null);
});
