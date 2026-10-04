import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordAsyncRead, resetRecording, getRecording, setReplayHooks } from '../src/recorder.js';

test('asynchronous reads record resolved values and replay without rerunning the search', async () => {
  resetRecording();
  const reply = { best: { face: 'D', moves: ['R'], proven: false } };
  assert.deepEqual(await recordAsyncRead('cross', async () => reply), reply);
  const input = getRecording().events.find(event => event.kind === 'read');
  assert.deepEqual(input.data, { kind: 'cross', value: reply });
  let computed = false;
  setReplayHooks({ now: () => 100, read: kind => {
    assert.equal(kind, 'cross');
    return input.data.value;
  } });
  try {
    assert.deepEqual(await recordAsyncRead('cross', async () => { computed = true; }), reply);
    assert.equal(computed, false);
    assert.equal(getRecording().events.filter(event => event.kind === 'read').length, 1);
  } finally { setReplayHooks(null); resetRecording(); }
});

test('failed asynchronous reads propagate the failure without recording a value', async () => {
  resetRecording();
  await assert.rejects(recordAsyncRead('cross', async () => { throw new Error('cancelled'); }), /cancelled/);
  assert.equal(getRecording().events.filter(event => event.kind === 'read').length, 0);
});
