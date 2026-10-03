import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoundSegments } from '../src/drills/round-segments.js';
import { ringLayout } from '../src/ui/orbit/geometry.js';

test('active round arcs stay equal while case count and answer state carry progress', () => {
  const segments = buildRoundSegments({ status: 'active', answers: [
    { correct: true, ms: 2800 },
    { correct: false, ms: 900 },
  ] }, 4);
  assert.deepEqual(segments.map(segment => segment.weight), [1, 1, 1, 1]);
  assert.deepEqual(segments.map(segment => segment.state), ['good', 'wrong', 'current', 'future']);
});

test('completed round arc widths are proportional to recorded time spent', () => {
  const segments = buildRoundSegments({ status: 'complete', answers: [
    { correct: true, ms: 2800 },
    { correct: false, ms: 900 },
    { correct: true, ms: 1300 },
  ] }, 3);
  assert.deepEqual(segments.map(segment => segment.weight), [2800, 900, 1300]);
  assert.deepEqual(segments.map(segment => segment.state), ['good', 'wrong', 'good']);
  assert.deepEqual(segments.map(segment => segment.value), ['2.8 s', '0.9 s', '1.3 s']);
  const arcs = ringLayout(segments, { gapDeg: 0 });
  assert.ok(Math.abs((arcs[0].to - arcs[0].from) / (arcs[1].to - arcs[1].from) - 2800 / 900) < 0.001);
});

test('completed round leaves unknown durations unweighted instead of inventing time', () => {
  const segments = buildRoundSegments({ status: 'complete', answers: [
    { correct: true, ms: 1200 },
    { correct: false, ms: null },
  ] }, 2);
  assert.deepEqual(segments.map(segment => segment.weight), [1200, 0]);
  assert.deepEqual(segments.map(segment => segment.value), ['1.2 s', null]);
});
