import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polar, arcPath, fillAngle, ringLayout, placeLabels, inspectionAngles, inspectionAngleAt } from '../src/brain/charts/arc.js';

test('polar uses clock angles: 0 is 12 o\'clock, 90 is 3 o\'clock', () => {
  assert.deepEqual(polar(100, 100, 50, 0), { x: 100, y: 50 });
  assert.deepEqual(polar(100, 100, 50, 90), { x: 150, y: 100 });
  assert.deepEqual(polar(100, 100, 50, 180), { x: 100, y: 150 });
  assert.deepEqual(polar(100, 100, 50, 270), { x: 50, y: 100 });
});

test('arcPath: empty, small, large-arc flag and full circle', () => {
  assert.equal(arcPath(0, 0, 10, 30, 30), '');
  assert.equal(arcPath(0, 0, 10, 40, 30), '');
  assert.match(arcPath(0, 0, 10, 0, 90), /^M 0 -10 A 10 10 0 0 1 10 0$/);
  assert.match(arcPath(0, 0, 10, 0, 270), / 0 1 1 /);
  const full = arcPath(0, 0, 10, 0, 360);
  assert.equal((full.match(/A /g) || []).length, 2, 'a full ring is two half arcs');
});

test('fillAngle clamps the fraction', () => {
  assert.equal(fillAngle(10, 110, 0.5), 60);
  assert.equal(fillAngle(10, 110, -1), 10);
  assert.equal(fillAngle(10, 110, 2), 110);
  assert.equal(fillAngle(10, 110, NaN), 10);
});

test('ringLayout is proportional, gapped, ordered and covers the ring', () => {
  const layout = ringLayout([{ key: 'a', weight: 1 }, { key: 'b', weight: 3 }], { gapDeg: 4 });
  assert.equal(layout.length, 2);
  const [a, b] = layout;
  assert.ok(Math.abs((b.a1 - b.a0) / (a.a1 - a.a0) - 3) < 0.01, 'b is three times a');
  assert.ok(Math.abs(b.a0 - a.a1 - 4) < 0.01, 'gap between neighbours');
  const used = layout.reduce((s, x) => s + x.a1 - x.a0, 0);
  assert.ok(Math.abs(used + 2 * 4 - 360) < 0.02, 'arcs plus gaps fill the ring');
  assert.ok(a.mid > a.a0 && a.mid < a.a1);
});

test('ringLayout splits evenly when weights are missing and handles one segment', () => {
  const even = ringLayout([{ key: 'a' }, { key: 'b', weight: 0 }, { key: 'c', weight: -1 }]);
  const spans = even.map(s => s.a1 - s.a0);
  assert.ok(spans.every(s => Math.abs(s - spans[0]) < 0.01));
  const one = ringLayout([{ key: 'only', weight: 1 }]);
  assert.equal(one[0].a0, 0);
  assert.equal(one[0].a1, 360);
  assert.deepEqual(ringLayout([]), []);
});

test('placeLabels aligns by side and separates crowded labels', () => {
  const labels = placeLabels([
    { key: 'r1', angle: 80 }, { key: 'r2', angle: 84 }, { key: 'r3', angle: 88 },
    { key: 'l1', angle: 270 }, { key: 'top', angle: 2 },
  ], { cx: 300, cy: 300, r: 200, offset: 20, minGap: 30 });
  const by = Object.fromEntries(labels.map(l => [l.key, l]));
  assert.equal(by.r1.anchor, 'start');
  assert.equal(by.l1.anchor, 'end');
  assert.equal(by.top.anchor, 'middle');
  const right = ['r1', 'r2', 'r3'].map(k => by[k].y).sort((a, b) => a - b);
  assert.ok(right[1] - right[0] >= 30 - 0.01 && right[2] - right[1] >= 30 - 0.01, 'at least minGap apart');
});

test('placeLabels pulls a crowded side back inside the bottom bound', () => {
  const anchors = [170, 172, 174, 176].map((angle, i) => ({ key: `k${i}`, angle }));
  const labels = placeLabels(anchors, { cx: 0, cy: 0, r: 100, offset: 10, minGap: 20, bottom: 115 });
  const ys = labels.map(l => l.y).sort((a, b) => a - b);
  assert.ok(ys[ys.length - 1] <= 115);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 20 - 0.01);
});

test('inspection ring drains anticlockwise and overtime grows past 12 o\'clock', () => {
  assert.deepEqual(inspectionAngles({ limitMs: 15000, elapsedMs: 0 }), { degPerMs: 0.024, remainingDeg: 360, overDeg: 0 });
  assert.equal(inspectionAngles({ limitMs: 15000, elapsedMs: 9000 }).remainingDeg, 144);
  assert.equal(inspectionAngles({ limitMs: 15000, elapsedMs: 16000 }).overDeg, 24);
  // 12 s called: 3 s left -> 72 deg (3 o'clock side); +2 zone ends 48 deg before 12.
  assert.equal(inspectionAngleAt(12000, 15000), 72);
  assert.equal(inspectionAngleAt(17000, 15000), 312);
  // The limit itself is the end of the overtime zones' arcs, not 0.
  assert.equal(inspectionAngleAt(15000, 15000), 360);
});
