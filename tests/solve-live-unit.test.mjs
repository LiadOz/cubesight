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
  assert.equal(live.getSnapshot().phase, 'inspecting');
  // Solve: inverse of the scramble reversed. The first solving move starts the clock.
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
  assert.equal(live.getSnapshot().phase, 'inspecting');
  // solve with inverse — the first move starts the clock
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
  // With the grace, a quick wrong-then-recover folds into a step instead of flashing off-plan.
  session.emit("F'");         // recover
  assert.equal(live.getSnapshot().applyDetour.length, 0, 'quick wrong-then-recover folds into a step (grace)');
  assert.equal(live.getSnapshot().applyStep, 1, 'step unchanged');
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
  assert.equal(live.getSnapshot().phase, 'inspecting');
});

// Fake session that can also fire a non-move (gyro) snapshot, to reproduce the
// recovery-detour ballooning bug: a single wrong turn must not append to
// the detour on every gyro/status snapshot.
function fakeSessionWithGyro() {
  const listeners = new Set();
  let state = createSolvedState();
  let moves = [];
  let lastMove = null;
  const snap = () => ({ phase: 'tracking', state, moves, lastMove });
  return {
    getSnapshot: snap,
    subscribe(l) { listeners.add(l); l(snap()); return () => listeners.delete(l); },
    emit(move) { state = applyMoves(state, [move]); moves = [...moves, move]; lastMove = move; for (const l of listeners) l(snap()); },
    emitGyro() { for (const l of listeners) l(snap()); }, // moves/lastMove unchanged
  };
}

test('a wrong turn during application does not balloon the recovery detour on gyro updates', () => {
  const session = fakeSessionWithGyro();
  const live = createSolveLive(session, { getOrientation: () => ({ bottom: 'D', front: 'F' }), now: () => 0 });
  live.startGuided("R U");
  session.emit('R');           // matches step 1
  session.emit('F');           // wrong: grace holds (no detour committed yet)
  assert.equal(live.getSnapshot().applyDetour.length, 0, 'wrong turn starts a grace, no off-plan yet');
  session.emitGyro(); session.emitGyro(); session.emitGyro();  // gyro/status snapshots, no new move
  assert.equal(live.getSnapshot().applyDetour.length, 0, 'gyro updates during grace must not grow the detour');
  session.emit("F'");        // recover: back on plan
  assert.equal(live.getSnapshot().applyDetour.length, 0);
});

test('inspection phase holds until the first solving move, then the clock starts', () => {
  const session = fakeSession();
  let t = 1000;
  const live = createSolveLive(session, { getOrientation: () => ({ bottom: 'D', front: 'F' }), now: () => t });
  live.startGuided("R U");
  for (const m of "R U".split(' ')) { t += 500; session.emit(m); }
  assert.equal(live.getSnapshot().phase, 'inspecting');
  assert.equal(live.getSnapshot().elapsedMs, null, 'no solve clock before the first move');
  assert.ok(live.getSnapshot().inspection, 'inspection countdown is exposed');
  // first solving move starts the clock
  session.emit("U'");
  assert.equal(live.getSnapshot().phase, 'solving');
  assert.ok(live.getSnapshot().elapsedMs >= 0, 'clock started on first move');
  assert.equal(live.getSnapshot().inspection, null);
});

test('a guided U2 double turn coalesces and does not flash off-plan', () => {
  const session = fakeSession();
  const live = createSolveLive(session, { getOrientation: () => ({ bottom: 'D', front: 'F' }), now: () => 0 });
  live.startGuided("U2");
  // a physical U2 flick arrives as two U quarter-turn MOVE events (the session coalesces them)
  session.emit('U');
  session.emit('U');
  const snap = live.getSnapshot();
  assert.equal(snap.applyDetour.length, 0, 'no off-plan flicker for a coalesced U2');
  assert.equal(snap.applyStep, 1, 'U2 advanced one plan step');
});
