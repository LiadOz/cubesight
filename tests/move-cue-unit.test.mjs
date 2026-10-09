import test from 'node:test';
import assert from 'node:assert/strict';
import { CUE_STILL_POSE, cueFraction, cueLoopMs, cuePeak, cueShape } from '../src/moves/cue.js';

const sample = (double, steps = 400) => Array.from({ length: steps }, (_, i) => cueShape(i / steps, double));
const excursions = values => {
  let count = 0, above = false;
  for (const v of values) { if (v >= .9 && !above) { count++; above = true; } else if (v < .3) above = false; }
  return count;
};

test('a quarter-turn cue eases out from rest, holds at its peak, returns to rest and pauses', () => {
  const values = sample(false);
  assert.equal(values[0], 0);
  assert.equal(Math.max(...values), 1);
  assert.ok(values.every(v => v >= 0 && v <= 1));
  assert.equal(excursions(values), 1);
  assert.ok(values.slice(0, 112).every((v, i, all) => i === 0 || v >= all[i - 1]), 'eases out monotonically');
  assert.equal(cueShape(.3, false), 1, 'holds');
  assert.equal(cueShape(.8, false), 0, 'pauses at rest before the next loop');
});

test('a double pulses twice per loop, and loops are longer', () => {
  assert.equal(excursions(sample(true)), 2);
  assert.ok(cueLoopMs(true) > cueLoopMs(false));
});

test('peaks: 36 degrees for a quarter, 60 for a double, smaller for rotations', () => {
  assert.equal(cuePeak('face', false), 36);
  assert.equal(cuePeak('face', true), 60);
  assert.equal(cuePeak('rot', false), 30);
  assert.equal(cuePeak('rot', true), 50);
});

test('the cue waits for its start, loops by time, and freezes for a pose, no loop or reduced motion', () => {
  assert.equal(cueFraction({ now: 100, startedAt: 350, double: false }), 0);
  const period = cueLoopMs(false);
  assert.equal(cueFraction({ now: 350 + period * .3, startedAt: 350, double: false }), 1);
  assert.equal(cueFraction({ now: 350 + period * 3.3, startedAt: 350, double: false }), 1, 'repeats');
  assert.equal(cueFraction({ now: 9999, startedAt: 0, double: false, pose: .5 }), .5);
  for (const still of [{ loop: false }, { reducedMotion: true }]) {
    const a = cueFraction({ now: 400, startedAt: 0, double: false, ...still });
    const b = cueFraction({ now: 1000, startedAt: 0, double: false, ...still });
    assert.equal(a, b);
    assert.equal(a, CUE_STILL_POSE);
  }
  // a still quarter cue is a small visible offset: between 5 and 25 degrees
  assert.ok(CUE_STILL_POSE * cuePeak('face', false) > 5 && CUE_STILL_POSE * cuePeak('face', false) < 25);
});
