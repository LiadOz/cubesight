import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSolveLive } from '../src/solve-live.js';
import { applyMoves, createSolvedState, stateFromScramble, sameCubeState } from '../src/cross-cube.js';

// A minimal fake of the shared smart-cube session: it owns a canonical state
// and move history, applies canonical moves, and notifies subscribers the way
// the real session does (phase 'tracking', state, moves, lastMove).
function fakeSession() {
  const listeners = new Set();
  let state = createSolvedState();
  let moves = [];
  let lastMove = null;
  return {
    getSnapshot: () => ({ phase: 'tracking', state, moves, lastMove }),
    subscribe(l) { listeners.add(l); l({ phase: 'tracking', state, moves, lastMove }); return () => listeners.delete(l); },
    emit(move) {
      state = applyMoves(state, [move]);
      moves = [...moves, move];
      lastMove = move;
      for (const l of listeners) l({ phase: 'tracking', state, moves, lastMove });
    },
  };
}

test('guided scramble is applied then solved; record carries phases, tps and cross', async () => {
  const calls = [];
  let t = 1000;
  const session = fakeSession();
  const live = createSolveLive(session, { getOrientation: () => ({ bottom: 'D', front: 'F' }), now: () => t });
  live.subscribe(s => calls.push(s.phase));
  const scramble = "R U R' F2";
  live.startGuided(scramble);
  assert.equal(live.getSnapshot().phase, 'applying');
  // Apply the scramble in order.
  for (const m of scramble.split(' ')) { t += 500; session.emit(m); }
  assert.equal(live.getSnapshot().phase, 'solving');
  // Solve: inverse of the scramble reversed.
  const solution = scramble.split(' ').reverse().map(m => m.endsWith('2') ? m : m.endsWith("'") ? m[0] : m + "'").join(' ');
  for (const m of solution.split(' ')) { t += 500; session.emit(m); }
  const snap = live.getSnapshot();
  assert.equal(snap.phase, 'done');
  assert.ok(snap.record, 'a solve record is produced');
  assert.equal(snap.record.solved, true);
  assert.equal(snap.record.moveCount, solution.split(' ').length);
  assert.ok(snap.record.tps > 0);
  assert.equal(snap.record.crossFace, 'D');
  assert.ok(snap.record.phases, 'phase split times are recorded');
  assert.ok(snap.record.phases.crossMs >= 0);
});

test('free scramble solve starts from the current tracked state', () => {
  const session = fakeSession();
  const live = createSolveLive(session, { getOrientation: () => ({ bottom: 'D', front: 'F' }), now: () => 0 });
  // user scrambles freely
  for (const m of "R U F".split(' ')) session.emit(m);
  live.startFree();
  assert.equal(live.getSnapshot().phase, 'solving');
  // solve with inverse
  const inv = ['F', "U'", "R'"].reverse(); // inverse of R U F is F' U' R'
  for (const m of ["F'", "U'", "R'"]) session.emit(m);
  assert.equal(live.getSnapshot().phase, 'done');
  assert.equal(live.getSnapshot().record.free, true);
  assert.equal(live.getSnapshot().record.moveCount, 3);
});

test('cross is detected from the face on the bottom at the first solving move (colour neutral)', () => {
  const session = fakeSession();
  // bottom face reported as F -> cross is on F
  const live = createSolveLive(session, { getOrientation: () => ({ bottom: 'F', front: 'U' }), now: () => 0 });
  live.startFree();
  session.emit('R');
  assert.equal(live.getSnapshot().crossFace, 'F');
});

test('a wrong turn during guided scramble application keeps the attempt and shows recovery detour', () => {
  const session = fakeSession();
  const live = createSolveLive(session, { getOrientation: () => ({ bottom: 'D', front: 'F' }), now: () => 0 });
  const states = [];
  live.subscribe(s => states.push({ phase: s.phase, applyStep: s.applyStep, detour: [...s.applyDetour] }));
  live.startGuided("R U");
  session.emit('R');          // matches step 1
  assert.equal(live.getSnapshot().applyStep, 1);
  assert.equal(live.getSnapshot().applyDetour.length, 0);
  session.emit('F');          // wrong: not the next planned move
  // The detour should be non-empty (a recovery move is queued) and step unchanged.
  assert.ok(live.getSnapshot().applyDetour.length >= 1);
  assert.equal(live.getSnapshot().applyStep, 1);
});

test('cancel returns to idle and clears the in-progress record', () => {
  const session = fakeSession();
  const live = createSolveLive(session, { now: () => 0 });
  live.startFree();
  session.emit('R');
  live.cancel();
  assert.equal(live.getSnapshot().phase, 'idle');
  assert.equal(live.getSnapshot().record, null);
});

test('detaching stops receiving session updates', () => {
  const session = fakeSession();
  const live = createSolveLive(session, { now: () => 0 });
  live.startFree();
  live.detach();
  // emits after detach should not transition the live tracker
  session.emit('R');
  assert.equal(live.getSnapshot().phase, 'solving');
});
