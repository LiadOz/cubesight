import test from 'node:test';
import assert from 'node:assert/strict';
import { inspection } from '../src/brain/styles/orbit/_dev-fixtures.js';
import { inspectionSegments, inspectionMarkers } from '../src/brain/styles/orbit/inspection-orbit.js';

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
