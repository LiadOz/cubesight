import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReplaySession, createReplayScript } from '../src/replay.js';
import { sameCubeState, createSolvedState } from '../src/cross-cube.js';

function trackMirror(session) {
  let lastMirroredMove = null, lastMirroredLen = 0;
  const mirrors = [];
  function onSession(s) {
    if (s.phase !== 'tracking') { lastMirroredMove = null; lastMirroredLen = 0; return; }
    const lastEntry = s.moves[s.moves.length - 1];
    const fired = s.moves.length !== lastMirroredLen || lastEntry !== lastMirroredMove;
    if (fired) { lastMirroredLen = s.moves.length; lastMirroredMove = lastEntry; mirrors.push({ move: lastEntry, len: s.moves.length, lastMove: s.lastMove }); }
  }
  session.subscribe(onSession);
  return mirrors;
}

test('replay: a full guided solve mirrors every move', async () => {
  const script = createReplayScript({ scramble: "R U R' F2 L" });
  const session = createReplaySession(script);
  const mirror = trackMirror(session);
  await session.connect();
  await session.syncSolved();
  let lastSnap = null;
  for (let i = 0; i < script.scrambleMoves.length + script.solveMoves.length; i++) lastSnap = session.step(i * 100);
  assert.ok(lastSnap, 'a snapshot emitted');
  assert.ok(sameCubeState(lastSnap.state, createSolvedState()), 'final state is solved');
  assert.ok(mirror.length > 0, 'the mirror fired during the solve');
});

test('replay: two U quarter events coalesce into U2 and the mirror fires U2', async () => {
  // scramble "R U", then a solve that includes a U2 done as TWO U quarter events close in cubeTimestamp.
  const script = createReplayScript({ scramble: "R U", solve: "U U" });
  const session = createReplaySession(script);
  const mirror = trackMirror(session);
  await session.connect();
  await session.syncSolved();
  for (const m of script.scrambleMoves) session.step();
  session.step(1000); // first U quarter
  const firstUSnap = session.getSnapshot();
  session.step(1010); // second U quarter, 10 ticks later → coalesces to "U2"
  const after = session.getSnapshot();
  assert.equal(after.moves[after.moves.length - 1], 'U2', 'two U quarters coalesced into U2');
  assert.equal(after.lastMove, 'U2', 'lastMove is U2');
  const last = mirror.at(-1);
  assert.ok(last, 'a mirror fired for the coalesced U2');
  assert.equal(last.move, 'U2', 'the mirrored move is U2 (not skipped)');
  assert.notEqual(sameCubeState(firstUSnap.state, after.state), true, 'the U2 advanced the cube state');
});

test('replay: repeated distinct moves both mirror (no coalesce)', async () => {
  // scramble, then two distinct R turns far apart in cubeTimestamp (no coalesce), both must mirror.
  const script = createReplayScript({ scramble: "R U F", solve: "R R" });
  const session = createReplaySession(script);
  const mirror = trackMirror(session);
  await session.connect();
  await session.syncSolved();
  for (const m of script.scrambleMoves) session.step();
  session.step(1000); // first R after the scramble
  const afterFirstR = mirror.at(-1);
  assert.equal(afterFirstR.move, 'R', 'first R mirrored');
  session.step(1200); // second R, 200 ticks later — distinct, should mirror (no coalesce)
  const afterSecondR = mirror.at(-1);
  assert.equal(afterSecondR.move, 'R', 'second R mirrored (not skipped as a repeat)');
  assert.notEqual(sameCubeState(afterFirstR.state, afterSecondR.state), true, 'the two R turns advanced the cube state');
});
