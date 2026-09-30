import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMoves, sameCubeState, stateFromScramble } from '../src/cross-cube.js';
import { appendDetour, describeTurn, followPlanTurn, inverseMove, recoveryMoves } from '../src/smart-cube-guidance.js';

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

test('recovery handles wide and slice moves (no throw) and doubles are self-inverse', () => {
  assert.deepEqual(recoveryMoves(['M']), ["M'"]);
  assert.deepEqual(recoveryMoves(['Rw']), ["Rw'"]);
  assert.deepEqual(recoveryMoves(['U', 'Rw2']), ['Rw2', "U'"]);
  assert.deepEqual(recoveryMoves(["E'", 'S2']), ['S2', 'E']);
  assert.equal(inverseMove('M'), "M'");
  assert.equal(inverseMove("S'"), 'S');
  assert.equal(inverseMove('R2'), 'R2');
  assert.equal(inverseMove('E2'), 'E2');
});

test('slice recovery is expressed in the held orientation', () => {
  // Held upside down (bottom U, front F): canonical L is on the right, so a
  // canonical M' (which turns like R) reads as M in the held notation.
  assert.deepEqual(recoveryMoves(['M'], 'U', 'F'), ['M']);
  assert.deepEqual(recoveryMoves(['Rw'], 'U', 'F'), ["Lw'"]);
  // The recovery (in canonical notation) undoes the detour on the real cube.
  for (const detour of [['M', 'U'], ['Rw', "E'"], ['S2', 'Fw']]) {
    const off = applyMoves(stateFromScramble('R U'), detour);
    const back = applyMoves(off, recoveryMoves(detour));
    assert.ok(sameCubeState(back, stateFromScramble('R U')), `recovery of ${detour}`);
  }
});

test('the detour merges consecutive turns of the same layer', () => {
  assert.deepEqual(appendDetour(['L', 'F2'], 'F'), ['L', "F'"]);
  assert.deepEqual(appendDetour(['L', "F'"], 'F'), ['L']);
  assert.deepEqual(appendDetour(['F'], 'F'), ['F2']);
  assert.deepEqual(appendDetour(['R'], 'Rw'), ['R', 'Rw']);
  const start = stateFromScramble('R U F');
  const states = [start, applyMoves(start, ['R'])];
  const off = followPlanTurn(states, 0, ['F2'], applyMoves(start, ["F'"]), 'F');
  assert.deepEqual(off, { step: 0, detour: ["F'"], onPlan: false });
});

test('a coalesced double re-evaluated from the step before its first quarter matches the plan', () => {
  const start = stateFromScramble('R U');
  const states = [start, applyMoves(start, ['F2'])];
  const first = followPlanTurn(states, 0, [], applyMoves(start, ['F']), 'F');
  assert.deepEqual(first, { step: 0, detour: ['F'], onPlan: false });
  // replaces: pass the step/detour from before the first quarter plus the double
  assert.deepEqual(followPlanTurn(states, 0, [], states[1], 'F2'), { step: 1, detour: [], onPlan: true });
});
