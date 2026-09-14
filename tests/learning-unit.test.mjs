import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLearning, review, chooseDue, loadLearning, saveLearning, medianTime } from '../src/learning.js';
import { createGlancePacing } from '../src/glance-pacing.js';

test('adaptive glance speeds up by 50 ms after ten accurate eligible outcomes', () => {
  const pacing = createGlancePacing({ exposureMs: 600 });
  for (let i = 0; i < 9; i++) assert.equal(pacing.record(true).changed, false);
  const result = pacing.record(false);
  assert.equal(result.accuracy, 0.9);
  assert.equal(pacing.exposureMs, 550);
  assert.equal(pacing.progress, 0);
});

test('adaptive glance slows by 100 ms at or below 70 percent', () => {
  const pacing = createGlancePacing({ exposureMs: 600 });
  for (let i = 0; i < 7; i++) pacing.record(false);
  for (let i = 0; i < 3; i++) pacing.record(true);
  assert.equal(pacing.exposureMs, 700);
});

test('adaptive glance clamps at 25 and 1500 ms', () => {
  const fast = createGlancePacing({ exposureMs: 25 });
  for (let i = 0; i < 10; i++) fast.record(true);
  assert.equal(fast.exposureMs, 25);
  const slow = createGlancePacing({ exposureMs: 1500 });
  for (let i = 0; i < 10; i++) slow.record(false);
  assert.equal(slow.exposureMs, 1500);
});

test('adaptive glance uses finer speed-up steps below 150 ms and reaches 25 ms', () => {
  const pacing = createGlancePacing({ exposureMs: 200 });
  const exposures = [];
  for (let batch = 0; batch < 10; batch++) {
    for (let i = 0; i < 10; i++) pacing.record(true);
    exposures.push(pacing.exposureMs);
  }
  assert.deepEqual(exposures, [150, 125, 100, 90, 80, 70, 60, 50, 45, 40]);

  for (let batch = 0; batch < 3; batch++) {
    for (let i = 0; i < 10; i++) pacing.record(true);
  }
  assert.equal(pacing.exposureMs, 25);
  for (let i = 0; i < 10; i++) pacing.record(true);
  assert.equal(pacing.exposureMs, 25);
});

test('adaptive glance holds at 80 percent and eases at exactly 70 percent', () => {
  for (const [correctCount, expected] of [[8, 600], [7, 700]]) {
    const pacing = createGlancePacing({ exposureMs: 600 });
    for (let i = 0; i < 10; i++) pacing.record(i < correctCount);
    assert.equal(pacing.exposureMs, expected);
    assert.equal(pacing.progress, 0);
  }
});

test('manual exposure changes and explicit resets discard incomplete batches', () => {
  const pacing = createGlancePacing();
  for (let i = 0; i < 9; i++) pacing.record(true);
  pacing.setExposure(450);
  pacing.record(true);
  assert.equal(pacing.exposureMs, 450);
  assert.equal(pacing.progress, 1);
  pacing.reset();
  assert.equal(pacing.progress, 0);
  assert.equal(pacing.exposureMs, 450);
});

test('fixed glance never changes and mode changes clear evidence', () => {
  const pacing = createGlancePacing({ mode: 'fixed', exposureMs: 600 });
  for (let i = 0; i < 10; i++) pacing.record(false);
  assert.equal(pacing.exposureMs, 600);
  pacing.setMode('adaptive');
  pacing.record(true);
  pacing.setMode('fixed');
  assert.equal(pacing.progress, 0);
});

test('ineligible triple corners do not count toward adaptive evidence', () => {
  const pacing = createGlancePacing();
  for (let i = 0; i < 9; i++) pacing.record(true, false);
  assert.equal(pacing.progress, 0);
  for (let i = 0; i < 9; i++) pacing.record(true);
  assert.equal(pacing.progress, 9);
  pacing.record(true);
  assert.equal(pacing.exposureMs, 550);
});

test('mistakes return after three intervening answers, not immediately', () => {
  const data = emptyLearning();
  const now = 1000;
  review(data, 'weak', { correct: false, ms: 1500, now });
  const candidates = ['weak', 'a', 'b', 'c', 'new'].map((key) => ({ key }));
  for (const key of ['a', 'b', 'c']) {
    assert.notEqual(chooseDue(data, candidates, now, () => 0).key, 'weak');
    review(data, key, { correct: true, ms: 400, now });
  }
  assert.equal(chooseDue(data, candidates, now, () => 0).key, 'weak');
});

test('fluent answers receive longer spacing than slow correct ones', () => {
  const fast = emptyLearning();
  const slow = emptyLearning();
  for (let i = 0; i < 3; i++) {
    review(fast, 'case', { correct: true, ms: 400, now: 1000 });
    review(slow, 'case', { correct: true, ms: 2400, now: 1000 });
  }
  assert.ok(fast.items.case.due > slow.items.case.due);
  assert.ok(fast.items.case.dueTrial > slow.items.case.dueTrial);
});

test('due patterns select fresh exemplars and survive storage round trips', () => {
  const data = emptyLearning();
  review(data, 'pattern', { correct: false, ms: 3000, now: 0 });
  const persisted = JSON.stringify(data);
  const restored = loadLearning({ getItem: () => persisted });
  const chosen = chooseDue(restored, [{ key: 'new' }, { key: 'pattern', exemplar: 'different cube' }], 1_000_000, () => 0);
  assert.equal(chosen.exemplar, 'different cube');
});

test('error response times never enter the correct-response median', () => {
  const data = emptyLearning();
  review(data, 'case', { correct: true, ms: 600 });
  review(data, 'case', { correct: false, ms: 10 });
  review(data, 'case', { correct: true, ms: 800 });
  assert.equal(medianTime(data.items.case), 700);
});

test('malformed or unavailable storage does not stop practice', () => {
  assert.deepEqual(loadLearning({ getItem: () => '{broken' }), emptyLearning());
  assert.doesNotThrow(() => saveLearning({ setItem: () => { throw Error('quota'); } }, emptyLearning()));
  const data = loadLearning({ getItem: () => JSON.stringify({ version: 1, items: { x: { attempts: -1, correct: 99, times: ['bad', -5, 300] } } }) });
  assert.equal(data.items.x.attempts, 0);
  assert.equal(data.items.x.correct, 0);
  assert.deepEqual(data.items.x.times, [300]);
});

test('legacy adaptive-exposure records merge into one stable case', () => {
  const stored = JSON.stringify({
    version: 1,
    items: {
      'corner|a|single:UFR:U=white,F=green:glance600': { attempts: 2, correct: 1, times: [700], lastSeen: 100 },
      'corner|a|single:UFR:U=white,F=green:glance550': { attempts: 3, correct: 3, times: [500, 520, 510], lastSeen: 200 },
    },
  });
  const data = loadLearning({ getItem: () => stored });
  const keys = Object.keys(data.items);
  assert.deepEqual(keys, ['corner|a|single:UFR:U=white,F=green:glance']);
  assert.equal(data.items[keys[0]].attempts, 5);
  assert.equal(data.items[keys[0]].correct, 4);
  assert.equal(data.items[keys[0]].lastSeen, 200);
});

test('delayed reviews are counted separately from immediate repetition', () => {
  const data = emptyLearning();
  review(data, 'case', { correct: true, ms: 700, now: 1000 });
  review(data, 'case', { correct: true, ms: 600, now: 2000 });
  assert.equal(data.items.case.delayedAttempts, 0);
  review(data, 'case', { correct: false, ms: 1800, now: 2000 + 86400000 });
  assert.equal(data.items.case.delayedAttempts, 1);
  assert.equal(data.items.case.delayedCorrect, 0);
});
