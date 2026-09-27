import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMoves, stateFromScramble } from '../src/cross-cube.js';
import { describeTurn, followPlanTurn, inverseMove, recoveryMoves } from '../src/smart-cube-guidance.js';

test('turn cue names the physical center in the selected held orientation', () => {
  assert.match(describeTurn('R', 'D', 'F').text, /right face \(red center\) clockwise/);
  assert.match(describeTurn("U'", 'U', 'F').text, /top face \(yellow center\) counterclockwise/);
  assert.match(describeTurn('R2', 'U', 'F').text, /right face \(orange center\) 180°/);
});

test('wide turn cue describes both layers and keeps notation when inverted', () => {
  assert.match(describeTurn("Dw'", 'D', 'F').text, /bottom two layers \(yellow center\) counterclockwise/);
  assert.equal(inverseMove("Rw'"), 'Rw');
  assert.equal(inverseMove('Fw'), "Fw'");
  assert.equal(inverseMove('Bw2'), 'Bw2');
});

test('plan guidance keeps a wrong-turn detour and resumes after reversing it', () => {
  const start = stateFromScramble('R U F');
  const states = [start, applyMoves(start, ['R'])];
  const wrong = applyMoves(start, ['L']);
  const offPlan = followPlanTurn(states, 0, [], wrong, 'L');
  assert.deepEqual(offPlan, { step: 0, detour: ['L'], onPlan: false });
  assert.deepEqual(recoveryMoves(offPlan.detour), ["L'"]);
  const restored = followPlanTurn(states, offPlan.step, offPlan.detour, applyMoves(wrong, ["L'"]), "L'");
  assert.deepEqual(restored, { step: 0, detour: [], onPlan: true });
  const advanced = followPlanTurn(states, restored.step, restored.detour, states[1], 'R');
  assert.deepEqual(advanced, { step: 1, detour: [], onPlan: true });
});

test('recovery reverses a multi-turn detour in the displayed orientation', () => {
  assert.deepEqual(recoveryMoves(['R', 'U'], 'D', 'F'), ["U'", "R'"]);
  assert.deepEqual(recoveryMoves(['R', 'U'], 'U', 'F'), ["D'", "L'"]);
});
