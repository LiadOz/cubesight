import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stateFromScramble } from '../src/cross-cube.js';
import { solvedPairs, solvedPairsPseudo, currentDShift, f2lDonePseudo } from '../src/solve-tracker.js';

test('a D-rotated solved cube counts as 4 pseudo pairs but 0 standard', () => {
  // Start solved, then rotate the whole D layer. The cross edges are no longer
  // home (standard cross/pairs read as 0), but a pseudo-F2L user solving in the
  // D-shifted frame has all 4 pairs solved up to that D shift.
  const shifted = stateFromScramble('D');
  assert.equal(solvedPairs(shifted, 'D').length, 0);
  const k = currentDShift(shifted, 'D');
  assert.equal(k, 3, 'a D turn is undone by D\' (k=3)');
  assert.equal(solvedPairsPseudo(shifted, 'D').length, 4);
  assert.equal(f2lDonePseudo(shifted, 'D'), true);
});

test('a truly solved cube reads identically in standard and pseudo mode', () => {
  const s = stateFromScramble('');
  assert.equal(currentDShift(s, 'D'), 0);
  assert.equal(solvedPairs(s, 'D').length, 4);
  assert.equal(solvedPairsPseudo(s, 'D').length, 4);
});

test('mid-cross-building returns no pairs in either mode', () => {
  const s = stateFromScramble("F R"); // disturbs cross edges
  assert.equal(currentDShift(s, 'D'), null);
  assert.equal(solvedPairsPseudo(s, 'D').length, 0);
});
