import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPLETION_DURATION, completionPlan, completionSegments } from '../src/ui/orbit/completion.js';
const current = { key: 'a', state: 'current', fill: .2 };
const future = { key: 'b', state: 'future' };
test('default completion duration is the chosen quick sweep; hydration does not animate', () => {
  assert.equal(COMPLETION_DURATION, 180);
  assert.deepEqual(completionPlan([], [], [{ ...current, state: 'done' }]), []);
});
test('rapid completion continues from displayed fill and advances one segment at a time', () => {
  const first = [{ ...current, state: 'done', fill: 1 }, { ...future, state: 'current' }];
  const plan = completionPlan([current, future], [current, future], first);
  const shown = completionSegments(first, plan, .5);
  assert.ok(Math.abs(shown[0].fill - .6) < 1e-9);
  const latest = first.map(segment => ({ ...segment, state: 'done', fill: 1 }));
  const retarget = completionPlan(first, shown, latest, plan);
  const next = completionSegments(latest, retarget, .1);
  assert.ok(next[0].fill >= shown[0].fill);
  assert.equal(next[1].fill, 0);
  assert.equal(next.filter(segment => segment.completionLeading).length, 1);
  assert.ok(completionSegments(latest, retarget, 1).every(segment => segment.fill === 1 && !segment.completing));
});
test('reset or undo drops pending fills; terminal feedback changes do not restart', () => {
  const pending = [{ key: 'a', start: .3 }];
  assert.deepEqual(completionPlan([{ ...current, state: 'done' }], [current], [current], pending), []);
  assert.deepEqual(completionPlan([{ ...current, state: 'done' }], [current], [{ ...current, state: 'good' }]), []);
});
test('a partial reset removes that segment while preserving the other pending fill', () => {
  const old = [{ ...current, state: 'done', fill: 1 }, { ...future, state: 'done', fill: 1 }];
  const shown = [{ ...old[0], fill: .4 }, { ...old[1], fill: 0 }];
  const next = [{ ...old[0], state: 'future', fill: 0 }, old[1]];
  const plan = completionPlan(old, shown, next, [{ key: 'a', start: 0 }, { key: 'b', start: 0 }]);
  const frame = completionSegments(next, plan, .5);
  assert.equal(frame[0].fill, 0);
  assert.equal(frame[1].fill, .5);
});
