// The reviewed-moment view model of frame A-06: outer ring (the stage's moves, the moment current), inner ring (the shared start then the better line).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMoment } from '../src/brain/review/moment-model.js';

const detail = (extra = {}) => ({
  title: 'detour · cross', from: 0,
  moves: ['F\'', 'L', 'B\'', 'D', 'R', 'D\'', 'L', 'F'].map((text, i) => ({ i, at: i + 1, text: text.replace("'", '′'), flags: [] })),
  pin: { available: true }, ...extra,
});
const detour = { id: 'cross-detour-3', kind: 'detour', tone: 'warn', stage: 'cross', idx: 3, at: 3, label: 'detour', trainer: 'cross', note: 'Move 4, D: that turned you away.',
  better: { from: 3, yours: ['D', 'R', "D'", 'L', 'F'], moves: ['R', "D'", 'F'] } };
const record = { at: 1700000000000 };

test('a detour: eight moves on the outer ring, the fourth current, and a better line on the inner ring after the three shared moves', () => {
  const moment = buildMoment({ marker: detour, detail: detail(), record, backHref: '#/history/1700000000000' });
  assert.deepEqual(moment.outer.map(move => move.state), ['done', 'done', 'done', 'current', 'later', 'later', 'later', 'later']);
  assert.deepEqual(moment.inner.map(move => move.state), ['before', 'before', 'before', 'better', 'better', 'better']);
  assert.deepEqual(moment.inner.slice(3).map(move => move.text), ['R', 'D′', 'F']);
  assert.equal(moment.count, 'move 4 of 8');
  assert.equal(moment.why, 'D turned you away from the cross');
  assert.equal(moment.badge, 'detour · cross');
  assert.equal(moment.outerLegend, 'outer · yours, 8 moves');
  assert.equal(moment.innerLegend, 'inner · better, 6 moves');
  assert.equal(moment.prose, 'From here R D′ F gets the cross in 3 moves; your D R D′ L F took 5.');
  assert.equal(moment.canPlayBetter, true);
  assert.equal(moment.retryHref, '#/drills/scout?setup=review:1700000000000:3');
  assert.equal(moment.tone, 'warn');
});

test('a moment without a better line has no inner ring and no better-line button', () => {
  const pause = { id: 'pause-2', kind: 'pause', tone: 'warn', stage: 'cross', idx: 2, at: 2, label: 'pause 0.8 s', trainer: 'cross', note: 'You paused 0.8 s.', better: null };
  const moment = buildMoment({ marker: pause, detail: detail({ title: 'pause 0.8 s · cross' }), record, backHref: '#/history' });
  assert.deepEqual(moment.inner, []);
  assert.equal(moment.innerLegend, null);
  assert.equal(moment.canPlayBetter, false);
  assert.equal(moment.prose, 'You paused 0.8 s.');
  assert.equal(moment.why, 'pause 0.8 s');
  assert.equal(moment.count, 'move 3 of 8');
});

test('a good moment is teal and a moment that cannot be retried has no retry link', () => {
  const good = { id: 'xcross', kind: 'xcross', tone: 'good', stage: 'cross', idx: 7, at: 8, label: 'x-cross', trainer: 'cross', note: 'An x-cross.', better: null };
  const moment = buildMoment({ marker: good, detail: detail({ pin: { available: false } }), record, backHref: '#/history' });
  assert.equal(moment.tone, 'good');
  assert.equal(moment.retryHref, null);
  assert.equal(moment.count, 'move 8 of 8');
});

test('nothing to draw without a marker or its detail', () => {
  assert.equal(buildMoment({ marker: null, detail: detail(), record, backHref: '#/h' }), null);
  assert.equal(buildMoment({ marker: detour, detail: null, record, backHref: '#/h' }), null);
});
