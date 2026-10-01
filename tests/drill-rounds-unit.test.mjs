import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoundStore, dayStreak, loadRounds, loadShell, QUICK_ROUNDS } from '../src/drills/rounds.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('quick round presets match the short drill formats', () => {
  assert.deepEqual(QUICK_ROUNDS.corners, { kind: 'timed', durationMs: 120_000 });
  assert.deepEqual(QUICK_ROUNDS.pll, { kind: 'cases', cases: 20 });
  assert.deepEqual(QUICK_ROUNDS.f2l, { kind: 'timed', durationMs: 30_000 });
});

test('a round resumes, tracks combo, finishes at its case target and stores a small result', () => {
  const storage = memoryStorage();
  let at = 1_800_000_000_000;
  const first = createRoundStore(storage, { now: () => at });
  const round = first.startRound({ drill: 'pll', preset: { kind: 'cases', cases: 5 }, settings: { family: 'G' }, from: 'brain:42' });
  first.recordAnswer({ correct: true, ms: 900, caseId: 'Ga' });
  first.recordAnswer({ correct: true, ms: 700, caseId: 'Gb' });

  const resumed = createRoundStore(storage, { now: () => at });
  assert.equal(resumed.startRound({ drill: 'pll', settings: { family: 'A' } }).startedAt, round.startedAt);
  assert.equal(resumed.current.answers.length, 2);
  assert.equal(resumed.current.combo, 2);
  resumed.recordAnswer({ correct: false, ms: 500, caseId: 'Gc' });
  assert.equal(resumed.current.combo, 0);
  const final = resumed.recordAnswer({ correct: true, ms: 1_100, caseId: 'Gd' });
  assert.equal(final.complete, false);
  const completed = resumed.recordAnswer({ correct: true, ms: 800, caseId: 'Ge' });
  assert.equal(completed.complete, true);
  assert.equal(completed.summary.correct, 4);
  assert.equal(completed.summary.total, 5);
  assert.equal(completed.summary.bestCombo, 2);
  assert.equal(completed.summary.newBestCombo, true);
  assert.equal(completed.summary.from, 'brain:42');
  assert.equal(loadRounds(storage).rounds.length, 1);
  assert.equal(loadShell(storage).round.status, 'complete');
});

test('a timed round can expire without another answer and records the active day once', () => {
  const storage = memoryStorage();
  const start = new Date(2026, 8, 30, 23, 59, 0).getTime();
  let at = start;
  const store = createRoundStore(storage, { now: () => at });
  store.startRound({ drill: 'corners' });
  store.recordAnswer({ correct: true, ms: 600, caseId: 'blue-orange' });
  at = start + QUICK_ROUNDS.corners.durationMs;
  const result = store.finish('time', at);
  assert.equal(result.reason, 'time');
  assert.equal(store.streak, 1);
  at += 24 * 60 * 60 * 1000;
  store.markActiveDay(at);
  assert.equal(store.streak, 2);
});

test('day streak tolerates today or yesterday and resets after a missed day', () => {
  const today = new Date(2026, 8, 30, 12).getTime();
  assert.equal(dayStreak(['2026-09-27', '2026-09-28', '2026-09-29'], today), 3);
  assert.equal(dayStreak(['2026-09-27', '2026-09-28'], today), 0);
  assert.equal(dayStreak(['2026-09-30'], today), 1);
});

test('invalid stored records are ignored and storage failures do not break a drill', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.equal(loadShell(broken).round, null);
  assert.deepEqual(loadRounds(broken).rounds, []);
  const store = createRoundStore(broken, { now: () => 100 });
  assert.equal(store.startRound({ drill: 'f2l' }).status, 'active');
  assert.equal(store.recordAnswer({ correct: true }).accepted, true);
});

test('round history preserves array backups and unknown timing stays unknown', () => {
  const prior = {drill:'oll',at:100,total:20,correct:10};
  const storage=memoryStorage({'cubesight-rounds-v1':JSON.stringify([prior])});
  const store=createRoundStore(storage,{now:()=>200});
  store.startRound({drill:'pll',preset:{kind:'cases',cases:1}});
  const result=store.recordAnswer({correct:true,ms:null});
  assert.equal(result.summary.medianMs,null);
  assert.equal(loadRounds(storage).rounds.length,2);
  assert.deepEqual(loadRounds(storage).rounds[0],prior);
});
