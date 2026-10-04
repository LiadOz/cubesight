import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stateFromScramble, applyMoves } from '../src/cross-cube.js';
import { crossSolved, f2lPairSlots, pairSolved } from '../src/solve-tracker.js';
const readFixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const rotationRecording = readFixture('rotation-cross-recording-with-analysis.json');
const rotationInputs = Object.fromEntries(rotationRecording.events.filter(event => event.kind === 'read'
  && /^(brain\.analysis|brain\.crossSuggestion):/.test(event.data.kind)).map(event => [event.data.kind, event.data.value]));
const inputs = { ...readFixture('cross-suggestion-replay-inputs.json'),
  ...Object.fromEntries(Object.entries(rotationInputs).filter(([key]) => key.startsWith('brain.crossSuggestion:'))) };

test('visual rotation recording preserves every original event and adds only solver replies', () => {
  const original = readFixture('rotation-cross-recording.json');
  assert.deepEqual(rotationRecording.events.slice(0, original.events.length), original.events);
  assert.deepEqual({ ...rotationRecording, events: [] }, { ...original, events: [] });
  assert.equal(rotationRecording.events.length, original.events.length + 2);
  assert.equal(Object.keys(rotationInputs).length, 2);
  assert.ok(Object.keys(rotationInputs).some(key => key.startsWith('brain.analysis:')));
  assert.ok(Object.keys(rotationInputs).some(key => key.startsWith('brain.crossSuggestion:')));
});

test('recorded solver inputs contain valid cross and X-cross continuations on every face', () => {
  for (const [key, reply] of Object.entries(inputs)) {
    const scramble = key.slice('brain.crossSuggestion:'.length, -':neutral'.length);
    const state = stateFromScramble(scramble);
    assert.equal(reply.perFace.length, 6);
    for (const row of [...reply.perFace, ...reply.xcrossPerFace]) {
      assert.equal(row.length, row.moves.length);
      const end = applyMoves(state, row.moves);
      assert.ok(crossSolved(end, row.face), `${key}: ${row.face} cross is solved`);
      if ('slot' in row) assert.ok(f2lPairSlots(row.face).some(pair => pairSolved(end, pair)), `${key}: ${row.face} has a solved pair`);
    }
    assert.equal(reply.best.length, Math.min(...reply.perFace.map(row => row.length)));
    assert.equal(reply.bestXcross.length, Math.min(...reply.xcrossPerFace.map(row => row.length)));
  }
});

test('recorded analysis inputs retain the real segmentation and timing semantics', async () => {
  const { segmentSolve } = await import('../src/analysis/segment.js');
  const { analysisReplayKey } = await import('../src/analysis/record.js');
  const analyses = { ...readFixture('solve-analysis-replay-inputs.json'),
    ...Object.fromEntries(Object.entries(rotationInputs).filter(([key]) => key.startsWith('brain.analysis:'))) };
  for (const [key, summary] of Object.entries(analyses)) {
    const { input, config } = JSON.parse(key.slice('brain.analysis:'.length));
    const segment = segmentSolve(input);
    assert.equal(summary.face, segment.crossFace);
    assert.equal(summary.solved, segment.solved);
    assert.deepEqual(summary.marks, { cross: segment.marks.crossIdx, pairs: segment.marks.pairIdx,
      eo: segment.marks.eoIdx, co: segment.marks.coIdx, cp: segment.marks.cpIdx, solved: segment.marks.solvedIdx });
    const record = { ...input, solveMoves: input.moves, moveCount: input.moves.length, config };
    assert.equal(analysisReplayKey(record), key);
    assert.equal(analysisReplayKey({ ...record, at: 123 }), key);
    assert.notEqual(analysisReplayKey({ ...record, moveTimes: input.moveTimes.map(ms => ms + 1) }), key);
    assert.notEqual(analysisReplayKey({ ...record, config: { ...config, pll: 'corners' } }), key);
  }
});
