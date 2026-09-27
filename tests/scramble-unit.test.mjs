import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWcaScramble } from '../src/scramble.js';
import { parseScramble, applyMoves, createSolvedState, sameCubeState } from '../src/cross-cube.js';

test('generateWcaScramble returns a parseable, non-solved outer-face scramble', async () => {
  const notation = await generateWcaScramble();
  assert.equal(typeof notation, 'string');
  assert.ok(notation.split(/\s+/).length >= 18, 'a WCA 3x3 scramble is ~18-21 moves');
  // Must parse with our outer-face-only grammar.
  const moves = parseScramble(notation);
  assert.ok(moves.length >= 18);
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
