import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSolveLive } from '../src/solve-live.js';
import { createSmartCubeSession, APP_SESSION_OPTIONS } from '../src/smart-cube-session.js';
import { createReplayDriver } from '../src/recording-replay.js';
import { parseRecording } from '../src/recorder.js';
import { inferCrossFace } from '../src/analysis/normalize.js';
import { createRotationTracker } from '../src/rotation-tracker.js';
import { inverseMove } from '../src/smart-cube-guidance.js';

// The cross face comes from the cube (first face whose cross completes), never
// from the held orientation; whole-cube rotations need a persistent new hold.

const quiet = () => { const log = console.log; console.log = () => {}; return () => { console.log = log; }; };
const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const FACES = ['D', 'U', 'F', 'B', 'R', 'L'];
const inv = seq => seq.split(/\s+/).filter(Boolean).reverse().map(inverseMove).join(' ');

async function rig({ orientation = { bottom: 'D', front: 'F' }, pseudo = false } = {}) {
  let onNext;
  const connection = {
    deviceName: 'GAN', protocol: { name: 'GAN Gen4' }, capabilities: { facelets: true },
    events$: { subscribe: o => { onNext = o.next; return { unsubscribe() {} }; } },
    async sendCommand(c) { if (c.type === 'REQUEST_FACELETS') queueMicrotask(() => onNext({ type: 'FACELETS', facelets: SOLVED_FACELETS })); },
    async disconnect() {},
  };
  const session = createSmartCubeSession(() => Promise.resolve(connection));
  await session.connect();
  await new Promise(r => setImmediate(r));
  let t = 1000, ts = 0, orient = orientation;
  const live = createSolveLive(session, { now: () => t, getOrientation: () => orient });
  live.setPseudo(pseudo);
  return {
    live,
    setOrientation(o) { orient = o; },
    move(m, dt = 300) { t += dt; ts += 1000; onNext({ type: 'MOVE', move: m, cubeTimestamp: ts }); },
    play(seq) { for (const m of seq.split(/\s+/).filter(Boolean)) this.move(m); },
    tick(ms) { t += ms; },
    s: () => live.getSnapshot(),
  };
}

// Collect every skip hurrah shown during the solve.
function watchSkips(live) {
  const skips = [];
  live.subscribe(s => { if (s.skip && !skips.includes(s.skip.kind)) skips.push(s.skip.kind); });
  return skips;
}

test('the cross locks to the face actually solved, whatever the held bottom says (all six faces)', async () => {
  const restore = quiet();
  try {
    for (const face of FACES) {
      for (const held of FACES.filter(f => f !== face)) {
        const h = await rig({ orientation: { bottom: held, front: held === 'F' ? 'U' : 'F' } });
        // Twisting a face and its opposite breaks every cross; undoing the face
        // first completes that face's cross before anything else does.
        const opp = { D: 'U', U: 'D', F: 'B', B: 'F', R: 'L', L: 'R' }[face];
        h.live.startGuided(`${opp}' ${face}'`);
        h.play(`${opp}' ${face}'`);
        assert.equal(h.s().phase, 'inspecting');
        h.tick(2000);
        h.move(face);
        assert.equal(h.s().crossFace, face, `locks on ${face} first`);
        h.move(opp);
        assert.equal(h.s().phase, 'done', face);
        assert.equal(h.s().record.crossFace, face, `cross on ${face} with ${held} held`);
        assert.ok(h.s().record.crossColor, 'crossColor follows the locked face');
      }
    }
  } finally { restore(); }
});

test('before the cross exists the label stays pre-cross and crossFace is unset (held bottom ignored)', async () => {
  const restore = quiet();
  try {
    const h = await rig({ orientation: { bottom: 'B', front: 'U' } });
    const scr = "R U F D L B";
    h.live.startGuided(scr);
    h.play(scr);
    h.tick(2000);
    h.move('B');
    assert.equal(h.s().crossFace, null);
    assert.equal(h.s().progress.phase, 'pre-cross');
    assert.equal(h.s().progress.crossDone, false);
    assert.equal(h.s().crossColor, null);
  } finally { restore(); }
});

test('a cross completing together with the whole solve (late lock) creates no skip hurrahs', async () => {
  const restore = quiet();
  try {
    const h = await rig({ orientation: { bottom: 'B', front: 'U' } });
    const scr = "R U F D L B";
    h.live.startGuided(scr);
    h.play(scr);
    const skips = watchSkips(h.live);
    h.tick(2000);
    h.play(inv(scr));
    assert.equal(h.s().phase, 'done');
    const r = h.s().record;
    assert.ok(r.crossMoveCount > 1);
    assert.ok(!skips.includes('pll') && !skips.includes('oll') && !skips.includes('eo') && !skips.includes('co'), `no skip from a late lock, saw ${skips}`);
  } finally { restore(); }
});

test('pseudo cross (D-offset) counts toward the lock when pseudo is on, not when it is off', async () => {
  const restore = quiet();
  try {
    // D' twists only the D layer: a cross solved up to a D turn, nothing else.
    for (const pseudo of [true, false]) {
      const h = await rig({ pseudo });
      h.live.startGuided("D' R U");
      h.play("D' R U");
      h.tick(2000);
      h.move("U'");
      h.move("R'");
      const crossOnD = h.s().crossFace === 'D';
      // R U undone: the D layer is 1 turn off. With pseudo the D cross is seen
      // immediately; without, only a face whose cross is truly solved counts.
      assert.equal(crossOnD, pseudo, `pseudo=${pseudo} crossFace=${h.s().crossFace}`);
    }
  } finally { restore(); }
});

// --- rotation persistence ------------------------------------------------------------

test('rotation tracker: single-read wobble is ignored, a persistent new hold counts once', () => {
  const tr = createRotationTracker();
  const U = { bottom: 'D', front: 'F' };
  tr.observe(U, { at: 0, idx: 1 });
  // wobble: flips that never persist for 3 reads / 300 ms
  tr.observe({ bottom: 'B', front: 'D' }, { at: 400, idx: 2 });
  tr.observe(U, { at: 800, idx: 3 });
  tr.observe({ bottom: 'L', front: 'F' }, { at: 1200, idx: 4 });
  tr.observe({ bottom: 'B', front: 'D' }, { at: 1600, idx: 5 });
  assert.equal(tr.count, 0);
  // a real y rotation: new front, held for several reads
  const y = { bottom: 'D', front: 'R' };
  assert.equal(tr.observe(y, { at: 2000, idx: 6 }), null);
  assert.equal(tr.observe(y, { at: 2400, idx: 7 }), null);
  const mark = tr.observe(y, { at: 2800, idx: 8 });
  assert.deepEqual(mark, { idx: 6, tMs: 2000, from: { bottom: 'D', front: 'F' }, to: { bottom: 'D', front: 'R' } });
  tr.observe(y, { at: 3200, idx: 9 });
  assert.equal(tr.count, 1);
  assert.deepEqual(tr.marks, [mark]);
});

test('rotation tracker: persistence needs time as well as reads; reads mid face turn are ignored', () => {
  const tr = createRotationTracker();
  const base = { bottom: 'D', front: 'F' }, y = { bottom: 'D', front: 'R' };
  tr.observe(base, { at: 0, idx: 1 });
  // three reads in 100 ms: too quick to be a stable hold
  for (const [i, at] of [[2, 10], [3, 60], [4, 110]]) tr.observe(y, { at, idx: i });
  assert.equal(tr.count, 0);
  tr.observe(base, { at: 500, idx: 4.5 });   // back to the old hold: the streak is broken
  // a rotation seen only during face turns never counts, and breaks the streak
  tr.observe(y, { at: 1000, idx: 5 });
  tr.observe(y, { at: 1400, idx: 6, duringTurn: true });
  tr.observe(y, { at: 1800, idx: 7, duringTurn: true });
  tr.observe(y, { at: 2200, idx: 8, duringTurn: true });
  assert.equal(tr.count, 0);
  tr.observe(y, { at: 2300, idx: 9 }); tr.observe(y, { at: 2700, idx: 10 }); tr.observe(y, { at: 3100, idx: 11 });
  assert.equal(tr.count, 1);
  assert.equal(tr.marks[0].idx, 9);
});

test('rotation tracker: without a front face it falls back to bottom-only with the same rule', () => {
  const tr = createRotationTracker();
  tr.observe({ bottom: 'D' }, { at: 0 });
  tr.observe({ bottom: 'B' }, { at: 300 });
  tr.observe({ bottom: 'D' }, { at: 600 });
  assert.equal(tr.count, 0);
  tr.observe({ bottom: 'B' }, { at: 900 }); tr.observe({ bottom: 'B' }, { at: 1300 }); tr.observe({ bottom: 'B' }, { at: 1700 });
  assert.equal(tr.count, 1);
});

test('rotation tracker on the real noisy reads of solve 2: 25 raw bottom flips collapse to a few', () => {
  const { reads } = JSON.parse(fs.readFileSync(new URL('./fixtures/noisy-orientation-reads.json', import.meta.url), 'utf8'));
  let raw = 0;
  for (let i = 1; i < reads.length; i++) if (reads[i][1] !== reads[i - 1][1]) raw++;
  assert.ok(raw >= 20, `the fixture is genuinely noisy (${raw} raw flips)`);
  const tr = createRotationTracker();
  reads.forEach(([at, bottom, front], i) => tr.observe({ bottom, front }, { at, idx: i + 1 }));
  assert.ok(tr.count <= 6, `counted ${tr.count}`);
  assert.ok(tr.count < raw / 3);
});

test('live: wobble does not count, a persistent regrip does, marks carry idx and time', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    const scr = "R U F D L B R2 U2 F2 D2";
    h.live.startGuided(scr);
    h.play(scr);
    h.tick(2000);
    // wobble through solving moves (each new orientation read once)
    const wob = [{ bottom: 'B', front: 'D' }, { bottom: 'D', front: 'F' }, { bottom: 'L', front: 'F' }, { bottom: 'D', front: 'F' }];
    h.move("D2");
    for (const o of wob) { h.setOrientation(o); h.move('U2'); }
    assert.equal(h.s().rotations, 0);
    // a real rotation: the new hold persists over the next moves
    h.setOrientation({ bottom: 'D', front: 'R' });
    h.play("F2 R' U' R");
    assert.equal(h.s().rotations, 1);
    const [mark] = h.s().rotationMarks;
    assert.equal(mark.idx, 6);
    assert.ok(mark.tMs > 0);
    assert.deepEqual(mark.to, { bottom: 'D', front: 'R' });
    assert.deepEqual(mark.from, { bottom: 'D', front: 'F' });
  } finally { restore(); }
});

// --- replay of the real recording (solve 3 of the 2026-09-30 session) -----------------

async function replaySolves(file) {
  const restore = quiet();
  try {
    const rec = parseRecording(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
    const driver = createReplayDriver(rec, { speed: 0 });
    const session = createSmartCubeSession(driver.connectDevice, { ...APP_SESSION_OPTIONS, now: driver.now, schedule: driver.schedule });
    const live = createSolveLive(session, { now: driver.now, getOrientation: () => driver.read('orientation', { bottom: 'D', front: 'F' }) });
    const trace = [];
    let record = null;
    live.subscribe(s => {
      if (s.phase === 'solving') trace.push({ n: s.solveMoveCount, phase: s.progress?.phase ?? null, crossFace: s.crossFace, skip: s.progress?.skip?.kind ?? null });
      if (s.phase === 'done' && s.record) record = s.record;
    });
    driver.setOnAction(a => (a.kind === 'session.call' ? session[a.method]?.(...(a.args || [])) : a.kind === 'live.call' ? live[a.method]?.(...(a.args || [])) : undefined));
    await driver.run();
    live.detach();
    return { record, trace };
  } finally { restore(); }
}

test('real recording (solve 3): the cross is found mid-solve on the face actually solved, stages in order', async () => {
  const { record, trace } = await replaySolves('./fixtures/rotation-cross-recording.json');
  assert.ok(record, 'the solve finishes');
  assert.equal(record.moveCount, 95);
  // The user did not build the cross on the (gyro) held bottom B.
  assert.notEqual(record.crossFace, 'B');
  const inferred = inferCrossFace({ scramble: record.scramble, moves: record.solveMoves });
  assert.equal(record.crossFace, inferred.face, 'same face the analysis module infers');
  assert.ok(record.crossMoveCount > 1 && record.crossMoveCount < 30, `cross at move ${record.crossMoveCount}, not at the end`);
  assert.ok(record.phases.crossMs < record.solveMs / 2, 'cross split is a small part of the solve');
  assert.ok(record.phases.f2lMs > 0 && record.phases.ollMs > 0 && record.phases.pllMs > 0, 'every stage has a real split');
  // Stage progress is ordered and never regresses.
  const rank = p => (p === 'pre-cross' ? 0 : p === 'cross' ? 1 : p?.startsWith('f2l-') ? 1 + Number(p.slice(4)) : p === 'eo' ? 6 : p === 'co-pending' ? 7 : p === 'co' ? 8 : p === 'pll' ? 9 : 10);
  let top = 0;
  for (const step of trace) { const r = rank(step.phase); assert.ok(r >= top, `phase regressed at move ${step.n}: ${step.phase}`); top = r; }
  assert.equal(trace.find(t => t.crossFace !== null).phase === 'pre-cross', false, 'the label is pre-cross until the lock');
  assert.ok(trace.slice(0, 3).every(t => t.crossFace === null && t.phase === 'pre-cross'), 'nothing locks on the first moves');
  // No false PLL skip from an all-at-once completion.
  assert.ok(!trace.some(t => t.skip === 'pll'), 'no false PLL skip');
  // The raw held bottom flips constantly; the stable rotation count stays sane.
  assert.ok(record.rotations >= 1 && record.rotations <= 8, `rotations=${record.rotations}`);
  assert.equal(record.rotationMarks.length, record.rotations);
  for (const m of record.rotationMarks) { assert.ok(m.idx >= 1 && m.idx <= record.moveCount); assert.ok(m.tMs >= 0 && m.tMs <= record.solveMs); }
});

// --- pseudo-slotting: the D fix is not part of OLL / PLL ------------------------------

const PAIR = "U F U' F'";                    // inserts the last F2L pair (in the D-offset frame)
const EDGES = "F R U R' U' F'";              // EO
const SUNE = "R U R' U R U2 R'";             // CO
const TPERM = "R U R' U' R' F R2 U' R' U' R U R' F'";

// Play `sol` from a scramble that is its inverse (so the D-offset the solver
// leaves at the end is really in the scramble), with pseudo on.
async function pseudoSolve(sol) {
  const h = await rig({ pseudo: true });
  const scr = inv(sol);
  h.live.startGuided(scr);
  h.play(scr);
  assert.equal(h.s().phase, 'inspecting');
  h.tick(2000);
  const all = watchSkips(h.live);   // the test pair insertion fills two slots at once: an 'f2l' hurrah is expected and irrelevant here
  const seen = [];
  h.live.subscribe(s => { if (s.phase === 'solving') seen.push({ n: s.solveMoveCount, phase: s.progress?.phase, solved: s.progress?.solved }); });
  h.play(sol);
  assert.equal(h.s().phase, 'done');
  return { record: h.s().record, get skips() { return all.filter(k => k !== 'f2l'); }, seen, total: sol.split(' ').length };
}

test('pseudo: F2L, OLL and PLL done in a D-offset frame, final D fix: no OLL/PLL skip, stages credited before the fix', async () => {
  const restore = quiet();
  try {
    for (const tail of ['D', 'U D', 'D U', "U' D", "D U'"]) {
      const { record, skips, seen, total } = await pseudoSolve(`${PAIR} ${EDGES} ${SUNE} ${TPERM} ${tail}`);
      assert.deepEqual(skips, [], `tail "${tail}": no skip hurrah (saw ${skips})`);
      assert.equal(record.crossFace, 'D');
      assert.equal(record.moveCount, total);
      // The cube is not solved until the last move, but the PLL stage is over
      // when the last layer is solved in the offset frame.
      assert.ok(seen.slice(0, -1).every(s => !s.solved));
      assert.ok(record.phases.f2lMs >= 0 && record.phases.ollMs > 0 && record.phases.pllMs > 0, JSON.stringify(record.phases));
      const tailMoves = tail.split(' ').length;
      assert.equal(record.dFixMs, 300 * tailMoves, `tail "${tail}": the D fix (+ AUF) is its own tail, not PLL time`);
      assert.equal(record.phases.pllMs, 300 * TPERM.split(' ').length, 'PLL covers exactly the T-perm');
      assert.equal(record.phases.ollMs, 300 * (EDGES.split(' ').length + SUNE.split(' ').length));
    }
  } finally { restore(); }
});

test('pseudo: the D fix done early (before OLL) behaves as a plain solve', async () => {
  const restore = quiet();
  try {
    const { record, skips } = await pseudoSolve(`${PAIR} D ${EDGES} ${SUNE} ${TPERM}`);
    assert.deepEqual(skips, []);
    assert.equal(record.dFixMs, null, 'no offset at PLL: PLL runs to the end as today');
    assert.equal(record.phases.pllMs, 300 * TPERM.split(' ').length);
    assert.equal(record.phases.ollMs, 300 * (1 + EDGES.split(' ').length + SUNE.split(' ').length), 'the early D turn is part of the OLL stage, as before');
  } finally { restore(); }
});

test('pseudo: a genuine PLL skip in the offset frame is still reported, the trailing D fix is not', async () => {
  const restore = quiet();
  try {
    // Sune completes OLL and the last layer at once (in the offset frame).
    const { skips, record } = await pseudoSolve(`${PAIR} ${EDGES} U ${SUNE} D`);
    assert.deepEqual(skips, ['pll']);
    assert.ok(record.dFixMs > 0);
  } finally { restore(); }
});

test('not pseudo: a plain solve is unchanged (no pll mark)', async () => {
  const restore = quiet();
  try {
    const h = await rig({ pseudo: false });
    const sol = `${PAIR} ${EDGES} ${SUNE} ${TPERM}`;
    const scr = inv(sol);
    h.live.startGuided(scr); h.play(scr); h.tick(2000);
    h.play(sol);
    assert.equal(h.s().phase, 'done');
    assert.equal(h.s().record.dFixMs, null);
  } finally { restore(); }
});
