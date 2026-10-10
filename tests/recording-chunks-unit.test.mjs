import test from 'node:test';
import assert from 'node:assert/strict';
import { planRecordingChunks, restoreRecordingChunks } from '../src/recording-chunks.js';

const events = (count, start = 1) => Array.from({ length: count }, (_, i) => ({ seq: start + i, t: i, kind: 'cube-event', data: { event: { type: 'GYRO' } } }));

test('a near-full recording only rewrites the growing chunk on periodic saves', () => {
  const initial = events(96996), plan = planRecordingChunks(initial);
  const next = planRecordingChunks([...initial, ...events(60, 96997)], plan.signatures);
  assert.ok(next.writes.length <= 2);
  assert.ok(next.writes.reduce((sum, row) => sum + row.events.length, 0) <= 1024);
  assert.deepEqual(next.deletes, []);
  assert.equal(planRecordingChunks(initial, plan.signatures).writes.length, 0);
});

test('trimming removes expired chunks and rewrites the partial oldest chunk', () => {
  const initial = events(2048), before = planRecordingChunks(initial);
  const trimmed = [initial[0], ...initial.slice(1000)]; // pinned handshake
  const next = planRecordingChunks(trimmed, before.signatures);
  assert.equal(next.writes.length, 2);
  assert.equal(next.writes[0].events.length, 1);
  const rows = new Map(before.writes.map(row => [row.key, row]));
  next.deletes.forEach(key => rows.delete(key)); next.writes.forEach(row => rows.set(row.key, row));
  const saved = { key: 'active', chunked: true, recording: { events: [], dropped: 999 } };
  assert.deepEqual(restoreRecordingChunks(saved, [...rows.values()]).recording.events, trimmed);
});

test('old full-history rows remain readable and reset deletes all chunks', () => {
  const saved = { key: 'active', recording: { events: events(12) } };
  assert.equal(restoreRecordingChunks(saved, []), saved);
  const plan = planRecordingChunks(events(1200));
  assert.deepEqual(planRecordingChunks([], plan.signatures).deletes, [...plan.signatures.keys()]);
});
