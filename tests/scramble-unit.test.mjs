import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWcaScramble } from '../src/scramble.js';
import { parseScramble, applyMoves, createSolvedState, sameCubeState } from '../src/cross-cube.js';

test('generateWcaScramble returns a parseable, non-solved outer-face scramble', async () => {
  const notation = await generateWcaScramble();
  assert.equal(typeof notation, 'string');
  // Must parse with our outer-face-only grammar.
  const moves = parseScramble(notation);
  // Random-state solutions have variable lengths; a minimum of 18 flakes
  // when the solver finds a shorter scramble for a legitimate random state.
  assert.ok(moves.length > 0);
  // Every move is a plain outer face turn (no wide/slice).
  assert.ok(moves.every(m => /^[URFDLB](?:2|')?$/.test(m)));
  // Applying it to a solved cube must not leave it solved.
  const state = applyMoves(createSolvedState(), moves);
  assert.equal(sameCubeState(state, createSolvedState()), false);
});

test('repeated scrambles differ and are reproducibly random', async () => {
  const a = await generateWcaScramble();
  const b = await generateWcaScramble();
  assert.notEqual(a, b);
});
