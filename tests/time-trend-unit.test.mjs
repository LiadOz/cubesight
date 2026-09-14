import test from 'node:test';
import assert from 'node:assert/strict';
import { rollingTrend, timingCeiling, timingTimestamp, trendGroups, trendPeriod } from '../src/recognition-profile.js';

test('normalizes millisecond and ISO timestamps and rejects invalid dates', () => {
  assert.equal(timingTimestamp({ at: 1000 }), 1000);
  assert.equal(timingTimestamp({ at: 1000000 }), 1000000);
  assert.equal(timingTimestamp({ at: '1970-01-01T00:00:01Z' }), 1000);
  assert.equal(timingTimestamp({ at: 'not a date' }), null);
  assert.equal(timingTimestamp({ at: 1e30 }), null);
  assert.equal(timingTimestamp({ at: -1 }), null);
  assert.equal(timingTimestamp({ at: NaN }), null);
});

test('groups sessions after a 30 minute gap and computes accuracy/timing stats', () => {
  const items = [
    { at: 1700000000000, correct: true, ms: 100 },
    { at: 1700000000000 + 10 * 60 * 1000, correct: false, ms: 200 },
    { at: 1700000000000 + 41 * 60 * 1000, correct: true, ms: 300 },
  ];
  const groups = trendGroups(items, 'session');
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { key: 'session-1700000000000', firstTime: 1700000000000, lastTime: 1700000600000, items: items.slice(0, 2), correct: 1, total: 2, accuracy: .5, median: 100, p90: 100, values: [100] });
  assert.equal(groups[1].median, 300);
});

test('period filtering excludes undated records and uses an inclusive window', () => {
  const now = 1700000000000;
  const items = [{ at: now - 2 * 86400000 }, { at: now - 8 * 86400000 }, { at: 'unknown' }];
  assert.equal(trendPeriod(items, '7days', now).length, 1);
});

test('rolling recognition trend follows local progress without changing samples', () => {
  const points = [{ x: 0, value: 500 }, { x: 1, value: 400 }, { x: 2, value: 200 }];
  const trend = rollingTrend(points, 2);
  assert.deepEqual(trend, [{ x: 0, value: 500 }, { x: 1, value: 450 }, { x: 2, value: 300 }]);
  assert.deepEqual(points, [{ x: 0, value: 500 }, { x: 1, value: 400 }, { x: 2, value: 200 }]);
});

test('chart scale keeps one slow outlier from flattening normal recognition times', () => {
  assert.equal(timingCeiling([300, 350, 400]), 500);
  assert.equal(timingCeiling([300, 350, 400, 9000]), 500);
  assert.equal(timingCeiling([]), 1000);
});
