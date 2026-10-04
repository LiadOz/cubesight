// The Orbit's approved geometry, label anchoring and marker fan-out, asserted against design-spec.js
// (extracted from the A-frames) rather than hand-typed numbers. Pure node: no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fanMarkers, labelWindow, looksLikeMoves, polar, ringLabels, ringLayout, ORBIT_GEOMETRY as G } from '../src/ui/orbit/geometry.js';
import { groupEndLabels } from '../src/ui/orbit/end-labels.js';
import { ORBIT } from '../src/ui/design-spec.js';

const CX = G.view / 2, CY = G.view / 2;
const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const ringFor = (count, gapDeg = G.gapDeg) => ringLayout(Array.from({ length: count }, (_, index) => ({ key: `s${index}`, weight: 1 })), { gapDeg, startDeg: G.startDeg, sweepDeg: G.sweepDeg });

test('the ring is the approved one: r 300, 215 to 145 clockwise (290 deg), bottom gap 70 centred on 180', () => {
  assert.equal(G.radius, 300);
  assert.equal(G.startDeg, 215);
  assert.equal(G.sweepDeg, 290);
  assert.equal(ORBIT.bottomGap.spanDeg, 70);
  assert.equal(360 - G.sweepDeg, 70);
  const layout = ringFor(9);
  assert.ok(Math.abs(layout[0].from - G.startDeg) < 1e-9, 'the first segment starts on the ring start');
  const end = layout.at(-1).to;
  assert.ok(Math.abs(end - (G.startDeg + G.sweepDeg)) < 1e-9, 'the last ends on 145');
  // The ring is centred on 180 at the bottom: the gap runs 145 to 215.
  assert.equal(((G.startDeg + G.sweepDeg) % 360), 145);
});

test('segment gaps are 2.5 deg (2 on the scramble ring, as in A-02) and every one is open', () => {
  assert.equal(G.gapDeg, 2.5);
  assert.equal(G.moveGapDeg, 2);
  for (const [count, gap] of [[9, 2.5], [20, 2]]) {
    const layout = ringFor(count, gap);
    for (let at = 1; at < layout.length; at++) assert.ok(Math.abs((layout[at].from - layout[at - 1].to) - gap) < 1e-9, `gap ${at}`);
  }
  assert.equal(ORBIT.gaps.filter(gap => gap.spanDeg === 2.5).length, 8, 'A-01 has eight 2.5 deg gaps between nine dashes');
});

test('stroke ladder: track 3, done 6, lit 8', () => {
  assert.equal(G.stroke.idle, 3);
  assert.equal(G.stroke.done, 6);
  assert.equal(G.stroke.active, 8);
  assert.equal(G.stroke.doneGood, 6);
  assert.equal(G.stroke.doneWarn, 6);
});

test('every label sits within 6 deg of its own segment mid-angle, and none is hidden on a 45-move scramble', () => {
  const moves = ['R', "U'", 'F2', 'D', 'L2', "B'"];
  const segments = Array.from({ length: 45 }, (_, at) => ({ key: `m${at}`, label: moves[at % moves.length], weight: 1, state: at < 20 ? 'done' : at === 20 ? 'current' : 'future' }));
  assert.ok(looksLikeMoves(segments));
  const layout = ringLayout(segments, { gapDeg: G.moveGapDeg, startDeg: G.startDeg, sweepDeg: G.sweepDeg });
  const items = layout.map((part, at) => ({ key: part.key, angle: part.mid, kind: 'move', current: at === 20 }));
  const { labels, window } = ringLabels(items, { cx: CX, cy: CY, stageRadius: G.stageLabelRadius, moveRadius: G.moveLabelRadius });
  assert.equal(window.windowed, false);
  assert.equal(labels.filter(label => label.hidden).length, 0);
  labels.forEach((label, at) => {
    const seen = (Math.atan2(label.x - CX, -(label.y - CY)) * 180 / Math.PI + 360) % 360;
    assert.ok(angleDiff(seen, layout[at].mid) < 6, `label ${at} is ${angleDiff(seen, layout[at].mid).toFixed(2)} deg off its segment`);
    assert.ok(label.radius >= G.moveLabelRadius - 1e-9);
  });
  const first = labels[0];
  assert.ok(Math.abs(Math.hypot(first.x - CX, first.y - CY) - G.moveLabelRadius) < 0.01, 'move labels at radius 330');
});

test('stage labels anchor at radius 320 on their own angle and never slide', () => {
  const layout = ringFor(9);
  const items = layout.map(part => ({ key: part.key, angle: part.mid, kind: 'stage', height: 64 }));
  const { labels } = ringLabels(items, { cx: CX, cy: CY, stageRadius: G.stageLabelRadius, moveRadius: G.moveLabelRadius });
  assert.equal(G.stageLabelRadius, 320);
  labels.forEach((label, at) => {
    assert.equal(label.hidden, false);
    const mid = ((layout[at].mid % 360) + 360) % 360;
    const point = polar(CX, CY, 320, mid);
    assert.ok(Math.abs(label.x - point.x) < 0.01, 'x on the 320 circle');
    assert.equal(label.anchor, label.side.startsWith('center') ? 'middle' : mid < 180 ? 'start' : 'end');
  });
});

test('a scramble too long for one radius is windowed to 22 around the current move, counted either side, and fanned over three radii', () => {
  assert.deepEqual(labelWindow(10, 3), { from: 0, to: 9, before: 0, after: 0, windowed: false });
  const win = labelWindow(45, 23);
  assert.equal(win.to - win.from + 1, 22);
  assert.equal(win.before + 22 + win.after, 45);
  assert.deepEqual(labelWindow(45, 0).before, 0);
  assert.equal(labelWindow(45, 44).after, 0);
  const layout = ringFor(120, 0.4);
  const items = layout.map((part, at) => ({ key: part.key, angle: part.mid, kind: 'move', current: at === 60 }));
  const result = ringLabels(items, { cx: CX, cy: CY, stageRadius: 320, moveRadius: 330 });
  assert.equal(result.window.windowed, true);
  assert.equal(result.labels.filter(label => !label.hidden).length, 22);
  assert.equal(new Set(result.labels.filter(label => !label.hidden).map(label => label.lane)).size > 1, true, 'fanned over several radii');
  assert.ok(Math.max(...result.labels.map(label => label.lane)) <= 2, 'three radii');
});

test('skipped or merged stages share one label instead of one each', () => {
  const groups = groupEndLabels([{ key: 'eo', state: 'skipped' }, { key: 'co', state: 'skipped' }, { key: 'cp', state: 'done' }], segment => segment.key);
  assert.deepEqual(groups.map(group => group.keys), [['eo', 'co'], ['cp']]);
  assert.equal(groups[0].name, 'eo·co');
  assert.equal(groups[0].value, 'skip');
});

test('20 markers in one arc fan out: all individually placed, none overlapping, each still pointing at its own angle', () => {
  const markers = Array.from({ length: 20 }, (_, at) => ({ key: `k${at}`, angle: 100 + at * 0.2 }));
  const pitch = 26;
  const fanned = fanMarkers(markers, { radius: G.radius, pitch, maxLanes: 4 });
  assert.equal(fanned.length, 20);
  assert.equal(new Set(fanned.map(marker => marker.key)).size, 20);
  assert.ok(new Set(fanned.map(marker => marker.lane)).size >= 2, 'a second radius is used');
  assert.ok(fanned.every(marker => marker.lane === 0 || marker.radius < G.radius));
  const points = fanned.map(marker => polar(CX, CY, marker.radius, marker.angle));
  let closest = Infinity;
  for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) closest = Math.min(closest, Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y));
  assert.ok(closest >= pitch - 0.5, `closest pair ${closest.toFixed(1)} px, needs >= ${pitch}`);
  fanned.forEach(marker => assert.ok(angleDiff(marker.trueAngle, Number(marker.key.slice(1)) * 0.2 + 100) < 1e-9));
  const spread = Math.max(...fanned.map(marker => marker.angle)) - Math.min(...fanned.map(marker => marker.angle));
  assert.ok(spread < 40, 'they fan out around the spot rather than flying off');
});

test('well separated markers stay on the ring untouched', () => {
  const fanned = fanMarkers([{ key: 'a', angle: 10 }, { key: 'b', angle: 80 }], { radius: G.radius });
  assert.deepEqual(fanned.map(marker => [marker.lane, marker.angle, marker.radius]), [[0, 10, 300], [0, 80, 300]]);
});
