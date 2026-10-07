// Geometry of the shared Orbit (src/ui/orbit/geometry.js). Replaces the tests of the deleted legacy brain/charts/arc.js duplicate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polar, arcPath, ringLayout, placeLabels } from '../src/ui/orbit/geometry.js';

test('polar uses clock angles: 0 is 12 o\'clock, 90 is 3 o\'clock', () => {
  assert.deepEqual(polar(100, 100, 50, 0), { x: 100, y: 50 });
  assert.deepEqual(polar(100, 100, 50, 90), { x: 150, y: 100 });
  assert.deepEqual(polar(100, 100, 50, 180), { x: 100, y: 150 });
  assert.deepEqual(polar(100, 100, 50, 270), { x: 50, y: 100 });
});

test('arcPath: empty, small, large-arc flag and full circle', () => {
  assert.equal(arcPath(0, 0, 10, 30, 30), '');
  assert.match(arcPath(0, 0, 10, 0, 90), /^M 0 -10 A 10 10 0 0 1 10 0$/);
  assert.match(arcPath(0, 0, 10, 0, 270), / 0 1 1 /);
  assert.equal((arcPath(0, 0, 10, 0, 360).match(/A /g) || []).length, 2, 'a full ring is two half arcs');
});

test('ringLayout is proportional, gapped, ordered and covers the sweep', () => {
  const [a, b] = ringLayout([{ key: 'a', weight: 1 }, { key: 'b', weight: 3 }], { gapDeg: 4, sweepDeg: 290, startDeg: 215 });
  assert.ok(Math.abs((b.to - b.from) / (a.to - a.from) - 3) < 0.01, 'b is three times a');
  assert.ok(Math.abs(b.from - a.to - 4) < 0.01, 'gap between neighbours');
  assert.ok(Math.abs(b.to - a.from - 290) < 0.01, 'the segments plus the gap fill the sweep');
  assert.equal(a.from, 215);
  assert.ok(a.mid > a.from && a.mid < a.to);
});

test('ringLayout splits evenly when weights are missing and handles no segments', () => {
  const spans = ringLayout([{ key: 'a' }, { key: 'b', weight: 0 }, { key: 'c', weight: -1 }]).map(s => s.to - s.from);
  assert.ok(spans.every(span => Math.abs(span - spans[0]) < 0.01));
  assert.deepEqual(ringLayout([]), []);
});

test('placeLabels aligns by side and separates crowded labels', () => {
  const labels = placeLabels([
    { key: 'r1', angle: 80 }, { key: 'r2', angle: 84 }, { key: 'r3', angle: 88 }, { key: 'l1', angle: 270 }, { key: 'top', angle: 2 },
  ], { cx: 300, cy: 300, radius: 200, offset: 20, minGap: 30 });
  const by = Object.fromEntries(labels.map(label => [label.key, label]));
  assert.equal(by.r1.anchor, 'start');
  assert.equal(by.l1.anchor, 'end');
  assert.equal(by.top.anchor, 'middle');
  const right = ['r1', 'r2', 'r3'].map(key => by[key].y).sort((x, y) => x - y);
  assert.ok(right[1] - right[0] >= 29.99 && right[2] - right[1] >= 29.99, 'at least minGap apart');
});
