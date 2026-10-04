import test from 'node:test';
import assert from 'node:assert/strict';
import { inspection } from '../src/brain/styles/orbit/_dev-fixtures.js';
import { inspectionSegments, inspectionMarkers, inspectionCaret } from '../src/brain/styles/orbit/inspection-orbit.js';
import { ringLayout } from '../src/ui/orbit/geometry.js';

test('inspection shows remaining time and keeps the caret at its draining edge', () => {
  for (const elapsedMs of [0, 8000, 12000, 15000]) {
    const vm = inspection({ elapsedMs });
    const segments = inspectionSegments(vm), normal = segments[0];
    assert.equal(normal.fill, 1 - elapsedMs / 15000);
    assert.equal(normal.fillOffset, elapsedMs / 15000);
    assert.equal(normal.caretPosition, elapsedMs / 15000);
    if (elapsedMs < 15000) {
      const arc = ringLayout(segments, { gapDeg: 2.5, startDeg: 145, sweepDeg: 290, direction: 'counterclockwise' })[0];
      assert.equal(inspectionCaret(vm), arc.from + (arc.to - arc.from) * elapsedMs / 15000);
    }
  }
});

test('custom grace stays on the dial before its penalty becomes active', () => {
  const vm = inspection({ overtime: 'grace', graceMs: 3000, elapsedMs: 16600 });
  const segments = inspectionSegments(vm);
  assert.deepEqual(segments.map(segment => segment.key), ['inspection', 'grace', 'plus2']);
  assert.equal(segments[0].state, 'done');
  assert.equal(segments[1].state, 'current');
  assert.equal(segments[1].fill, 1600 / 3000);
  assert.equal(segments[2].state, 'future');
  assert.equal(segments[2].toMs, 20000);
  const later = inspectionSegments({ ...vm, elapsedMs: 19000 });
  assert.equal(later[1].state, 'done');
  assert.equal(later[2].state, 'wrong');
  assert.equal(later[2].fill, .5);
});

test('count overtime exposes three distinct ticks on its own growing sector', () => {
  const vm = inspection({ overtime: 'count', elapsedMs: 18200 });
  const segments = inspectionSegments(vm);
  assert.equal(segments[1].key, 'count');
  assert.equal(segments[1].state, 'current');
  assert.ok(segments[1].fill > 0 && segments[1].fill < 1);
  const ticks = inspectionMarkers(vm).filter(marker => marker.key.includes('-count-'));
  assert.equal(ticks.length, 3);
  assert.ok(ticks.every(marker => marker.segment === 'count' && marker.position > 0 && marker.position <= 1));
  assert.equal(new Set(ticks.map(marker => marker.position)).size, 3);
});

test('WCA transitions fill the penalty sector and then activate DNF', () => {
  const vm = inspection({ elapsedMs: 16000 });
  assert.equal(inspectionSegments(vm).find(segment => segment.key === 'plus2').fill, .5);
  const expired = inspectionSegments({ ...vm, elapsedMs: 18000 });
  assert.equal(expired.find(segment => segment.key === 'plus2').fill, 1);
  assert.equal(expired.find(segment => segment.key === 'dnf').state, 'bad');
});
