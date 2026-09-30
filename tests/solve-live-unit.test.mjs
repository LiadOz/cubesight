import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSolveLive } from '../src/solve-live.js';
import { createSmartCubeSession } from '../src/smart-cube-session.js';
import { recoveryMoves, inverseMove } from '../src/smart-cube-guidance.js';

// Drive the REAL smart-cube session with a fake GAN connection, so solve-live
// sees exactly what it sees in the app: the move history empties whenever the
// cube is solved, every turn bumps moveEvent.seq, and a physical double
// (two quarter events a few cube ticks apart) arrives as a coalesced
// "X2" that replaces the previous quarter (moveEvent.replaces).
const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

// Silence the session/live debug logging during tests.
const quiet = () => { const log = console.log; console.log = () => {}; return () => { console.log = log; }; };

async function rig({ orientation = { bottom: 'D', front: 'F' } } = {}) {
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
  assert.equal(session.getSnapshot().phase, 'tracking');
  let t = 1000, ts = 0;
  let orient = orientation;
  const live = createSolveLive(session, { now: () => t, getOrientation: () => orient });
  const h = {
    session, live,
    get t() { return t; },
    tick(ms) { t += ms; },
    setOrientation(o) { orient = o; },
    // One quarter (or explicit double) MOVE event; gap is in cube ticks.
    move(m, { gap = 1000, dt = 300 } = {}) { t += dt; ts += gap; onNext({ type: 'MOVE', move: m, cubeTimestamp: ts }); },
    // A physical double: two quarter events within the coalescing window.
    dbl(face) { h.move(face); h.move(face, { gap: 20 }); },
    // Perform a sequence; doubles are turned as fast physical doubles (coalesced).
    physical(seq) { for (const m of seq.split(/\s+/).filter(Boolean)) { if (m.endsWith('2')) h.dbl(m.slice(0, -1)); else h.move(m); } },
    // Perform a sequence; doubles are two slow quarters (not coalesced).
    slow(seq) { for (const m of seq.split(/\s+/).filter(Boolean)) { if (m.endsWith('2')) { h.move(m.slice(0, -1)); h.move(m.slice(0, -1)); } else h.move(m); } },
    gyro() { onNext({ type: 'GYRO', quaternion: { x: 0, y: 0, z: 0, w: 1 } }); },
    battery() { onNext({ type: 'BATTERY', batteryLevel: 50 }); },
    s: () => live.getSnapshot(),
  };
  return h;
}

const inv = seq => seq.split(/\s+/).filter(Boolean).reverse().map(inverseMove).join(' ');
const SCR = "R U2 F' L2 D B'";

test('guided solve records the real move count, moves and TPS (history clears on solved)', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.startGuided(SCR);
    assert.equal(h.s().phase, 'applying');
    h.physical(SCR);
    assert.equal(h.s().phase, 'inspecting');
    h.tick(5000);
    h.physical(inv(SCR));   // B D' L2 F U2 R' — L2 and U2 as coalesced physical doubles
    const snap = h.s();
    assert.equal(snap.phase, 'done');
    assert.equal(h.session.getSnapshot().moves.length, 0, 'the session history is empty once solved');
    const r = snap.record;
    assert.equal(r.moveCount, 6, 'coalesced doubles count once');
    assert.deepEqual(r.solveMoves, ['B', "D'", 'L2', 'F', 'U2', "R'"]);
    assert.ok(r.tps > 0);
    assert.ok(r.solveMs > 0);
    assert.equal(r.crossFace, 'D');
    assert.equal(r.scramble, SCR);
    assert.deepEqual(r.scrambleTurns, SCR.split(' '));
    assert.equal(snap.solveMoveCount, 6);
  } finally { restore(); }
});

test('live move count and cross move count follow the solve (doubles counted once)', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    const scramble = "U R U R' F2 D";
    h.live.startGuided(scramble);
    h.physical(scramble);
    assert.equal(h.s().phase, 'inspecting');
    h.move("D'");
    assert.equal(h.s().solveMoveCount, 1);
    h.dbl('F');                        // F2 restores the cross
    assert.equal(h.s().solveMoveCount, 2);
    assert.deepEqual(h.s().solveMoves, ["D'", 'F2']);
    assert.equal(h.s().crossMoveCount, 2);
    h.physical("R U' R' U'");
    assert.equal(h.s().phase, 'done');
    assert.equal(h.s().record.moveCount, 6);
    assert.equal(h.s().record.crossMoveCount, 2);
  } finally { restore(); }
});

test('slow doubles (two separate quarters) are two moves', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.startGuided(SCR);
    h.slow(SCR);                       // plan doubles done as slow F F — must still advance
    assert.equal(h.s().phase, 'inspecting');
    assert.equal(h.s().applyStep, 6);
    h.slow(inv(SCR));
    assert.equal(h.s().phase, 'done');
    assert.equal(h.s().record.moveCount, 8);
  } finally { restore(); }
});

test('audit s1: wrong turns and a wrong physical double are recovered, then a full solve', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.startGuided(SCR);
    h.physical("R U2 F'");
    assert.equal(h.s().applyStep, 3);
    h.move('U');
    assert.deepEqual(h.s().applyDetour, ['U']);
    assert.deepEqual(recoveryMoves(h.s().applyDetour), ["U'"]);
    h.move("U'");
    assert.deepEqual(h.s().applyDetour, []);
    assert.equal(h.s().applyStep, 3);
    h.dbl('B');
    assert.deepEqual(h.s().applyDetour, ['B2'], 'a coalesced double replaces its first quarter in the detour');
    assert.deepEqual(recoveryMoves(h.s().applyDetour), ['B2']);
    h.physical('B2');
    assert.deepEqual(h.s().applyDetour, []);
    h.physical("L2 D B'");
    assert.equal(h.s().phase, 'inspecting');
    h.gyro();
    assert.equal(h.s().phase, 'inspecting', 'gyro does not start the solve');
    h.physical(inv(SCR));
    assert.equal(h.s().phase, 'done');
    assert.equal(h.s().record.moveCount, 6);
  } finally { restore(); }
});

test('audit s2: following the recovery cue for a wrong physical double recovers (no loop)', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.startGuided(SCR);
    h.physical("R U2 F'");
    h.move('L'); h.dbl('F');
    assert.deepEqual(h.s().applyDetour, ['L', 'F2']);
    for (let i = 0; i < 4 && h.s().applyDetour.length; i++) h.physical(recoveryMoves(h.s().applyDetour)[0]);
    assert.deepEqual(h.s().applyDetour, []);
    assert.equal(h.s().applyStep, 3);
  } finally { restore(); }
});

test('recovering a double detour with two slow quarters also works', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.startGuided(SCR);
    h.physical('R');
    h.dbl('F');
    assert.deepEqual(h.s().applyDetour, ['F2']);
    h.move('F');
    assert.deepEqual(h.s().applyDetour, ["F'"], 'half of the recovery merges into the detour');
    h.move('F');
    assert.deepEqual(h.s().applyDetour, []);
    assert.equal(h.s().applyStep, 1);
  } finally { restore(); }
});

test('a plan double completed by a coalesced F F advances the plan', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.startGuided('U2 R');
    h.move('U');
    assert.equal(h.s().applyStep, 0);
    h.move('U', { gap: 20 });           // coalesces into U2 which completes the plan move
    assert.deepEqual(h.s().applyDetour, []);
    assert.equal(h.s().applyStep, 1);
    h.move('R');
    assert.equal(h.s().phase, 'inspecting');
  } finally { restore(); }
});

test('a quarter that overshoots into a coalesced double is recovered from the plan position before it', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.startGuided("R U");
    h.move('R');
    assert.equal(h.s().applyStep, 1);
    h.move('R', { gap: 20 });           // R R quick -> R2: overshot the plan's R
    const { applyStep, applyDetour } = h.s();
    assert.ok(applyDetour.length === 1, `one detour entry, got ${applyDetour}`);
    h.physical(recoveryMoves(applyDetour)[0]);
    assert.deepEqual(h.s().applyDetour, []);
    h.physical(applyStep === 0 ? 'R U' : 'U');
    assert.equal(h.s().phase, 'inspecting');
  } finally { restore(); }
});

test('audit s3 / bug 4: startFree after cancel does not start the clock without a turn', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.startGuided(SCR); h.physical(SCR); h.physical(inv(SCR));
    assert.equal(h.s().phase, 'done');
    assert.equal(h.s().record.moveCount, 6);
    h.physical('F R U');               // scramble while the review is shown
    h.live.cancel();
    h.live.startFree();
    assert.equal(h.s().phase, 'inspecting');
    h.battery(); h.gyro();
    assert.equal(h.s().phase, 'inspecting', 'status snapshots do not start the solve');
    assert.equal(h.s().solveMoveCount, 0);
    assert.equal(h.s().elapsedMs, null);
    assert.deepEqual(h.s().scrambleTurns, ['F', 'R', 'U']);
    h.physical(inv('F R U'));
    assert.equal(h.s().phase, 'done');
    assert.equal(h.s().record.free, true);
    assert.equal(h.s().record.moveCount, 3);
    assert.deepEqual(h.s().record.scrambleTurns, ['F', 'R', 'U']);
    // A second guided run after cancel starts cleanly.
    h.live.cancel();
    h.gyro();
    h.live.startGuided(SCR);
    h.battery();
    assert.equal(h.s().phase, 'applying');
    assert.equal(h.s().applyStep, 0);
    h.physical(SCR); h.physical(inv(SCR));
    assert.equal(h.s().record.moveCount, 6);
  } finally { restore(); }
});

test('bug 5: guided needs a solved cube, free needs a scrambled cube', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    assert.throws(() => h.live.startFree(), /Scramble the cube first\./);
    assert.equal(h.s().phase, 'idle');
    h.physical('R U');
    assert.throws(() => h.live.startGuided(SCR), /Solve the cube \(or sync\) before starting a guided scramble\./);
    assert.equal(h.s().phase, 'idle');
    h.live.startFree();
    assert.equal(h.s().phase, 'inspecting');
  } finally { restore(); }
});

test('bug 11: an invalid scramble throws without changing state', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.startGuided('R U');
    h.move('R');
    const before = h.s();
    assert.throws(() => h.live.startGuided('R X'));
    const after = h.s();
    assert.equal(after.phase, 'applying');
    assert.equal(after.scrambleStr, 'R U');
    assert.equal(after.applyStep, before.applyStep);
    h.move('U');
    assert.equal(h.s().phase, 'inspecting');
  } finally { restore(); }
});

test('bug 7: first solving quarter coalesced with the last scramble quarter counts as one quarter', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.startGuided(SCR);          // ends in B'
    h.physical(SCR);
    assert.equal(h.s().phase, 'inspecting');
    h.move("B'", { gap: 20 });        // coalesces with the scramble's B' into B2
    assert.equal(h.s().phase, 'solving');
    assert.deepEqual(h.s().solveMoves, ["B'"]);
    h.move('B');
    h.physical(inv(SCR));
    assert.equal(h.s().phase, 'done');
    assert.equal(h.s().record.moveCount, 8);
    assert.deepEqual(h.s().record.solveMoves.slice(0, 3), ["B'", 'B', 'B']);
  } finally { restore(); }
});

test('bug 7 (free): a quick same-face quarter right after startFree is the first solving quarter', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.physical('F U R');
    h.live.startFree();
    h.move('R', { gap: 20 });
    assert.equal(h.s().phase, 'solving');
    assert.deepEqual(h.s().solveMoves, ['R']);
    h.physical("R2 U' F'");
    assert.equal(h.s().phase, 'done');
    assert.equal(h.s().record.moveCount, 4);
  } finally { restore(); }
});

// Collect every skip hurrah shown during the solve.
function watchSkips(live) {
  const skips = [];
  live.subscribe(s => { if (s.skip && !skips.includes(s.skip.kind)) skips.push(s.skip.kind); });
  return skips;
}

const TPERM = "R U R' U' R' F R2 U' R' U' R U R' F'";

test('audit s5 / bug 3: a normal OLL + PLL solve has no false CO/PLL skip hurrahs', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    const sol = "U R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F'";
    const scr = inv(sol);
    h.live.startGuided(scr); h.physical(scr);
    assert.equal(h.s().phase, 'inspecting');
    const skips = watchSkips(h.live);
    h.physical(sol);
    assert.equal(h.s().phase, 'done');
    // Edges were oriented when F2L completed (a genuine EO skip); nothing else.
    assert.deepEqual(skips, ['eo']);
  } finally { restore(); }
});

test('2-look OLL (EO then CO) then PLL: no skips', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    const sol = "U F R U R' U' F' U R U R' U R U2 R' " + TPERM;
    const scr = inv(sol);
    h.live.startGuided(scr); h.physical(scr);
    const skips = watchSkips(h.live);
    h.physical(sol);
    assert.equal(h.s().phase, 'done');
    assert.deepEqual(skips, []);
  } finally { restore(); }
});

test('PLL skip: solved on the move that completes OLL', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    const sol = "U R U R' U R U2 R'";   // U (F2L done, edges oriented), then Sune solves the cube
    const scr = inv(sol);
    h.live.startGuided(scr); h.physical(scr);
    const skips = watchSkips(h.live);
    h.physical(sol);
    assert.equal(h.s().phase, 'done');
    assert.deepEqual(skips, ['eo', 'pll']);
  } finally { restore(); }
});

test('CO skip: corners oriented on the move the edges are', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    const sol = "U R U2 R2 F R F' U2 R' F R F' " + TPERM;
    const scr = inv(sol);
    h.live.startGuided(scr); h.physical(scr);
    const skips = watchSkips(h.live);
    h.physical(sol);
    assert.equal(h.s().phase, 'done');
    assert.deepEqual(skips, ['co']);
  } finally { restore(); }
});

test('the multi-pair F2L skip is still detected (cross first, then two pairs in one move)', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    // D' keeps the cross solved but moves all four pairs out of their slots;
    // after U (cross done, first solving move) the D turn brings them all back.
    h.live.startGuided("D' U'");
    h.physical("D' U'");
    const skips = watchSkips(h.live);
    h.move('U');
    assert.equal(h.s().progress.crossDone, false, 'D-shifted cross is not a solved cross');
    h.move('D');
    assert.equal(h.s().phase, 'done');
    assert.deepEqual(skips, ['pll'], 'cross completing with its pairs is an X-cross, not an F2L skip');
  } finally { restore(); }
});

test('F2L multi-pair skip: pairs solved by one move once the cross is done', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    // E moves all four middle edges (cross intact); U hides it until U'.
    h.physical("F U R U' R' F' E U");
    h.live.startFree();
    const skips = watchSkips(h.live);
    h.move("U'");                      // cross done, no pairs
    assert.equal(h.s().progress.pairsSolved, 0);
    h.move("E'");                      // all four pairs at once
    assert.equal(h.s().progress.f2lDone, true);
    h.physical("F R U R' U' F'");
    assert.equal(h.s().phase, 'done');
    assert.deepEqual(skips, ['f2l', 'pll']);
  } finally { restore(); }
});

test('rotations are not double-counted for a coalesced double', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.startGuided("R F2");
    h.physical("R F2");
    h.move('F');                      // first solving quarter, bottom D
    h.setOrientation({ bottom: 'B', front: 'D' });
    h.move('F', { gap: 20 });         // coalesced F2 (a regrip mid-double is ignored)
    assert.equal(h.s().rotations, 0);
    h.move("R'");
    assert.equal(h.s().rotations, 1);
  } finally { restore(); }
});

test('desync ends the attempt; gyro in idle is ignored', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.gyro();
    assert.equal(h.s().phase, 'idle');
    h.physical('R');
    h.live.startFree();
    h.move('X');                      // unsupported -> session desync
    assert.equal(h.s().phase, 'desynced');
  } finally { restore(); }
});

test('cross is detected from the face on the bottom at the first solving move (colour neutral)', async () => {
  const restore = quiet();
  try {
    const h = await rig({ orientation: { bottom: 'F', front: 'U' } });
    h.physical('R U');
    h.live.startFree();
    h.move("U'");
    assert.equal(h.s().crossFace, 'F');
  } finally { restore(); }
});

test('cancel returns to idle; detach stops receiving updates', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.physical('R');
    h.live.startFree();
    h.move('U');
    h.live.cancel();
    assert.equal(h.s().phase, 'idle');
    assert.equal(h.s().record, null);
    h.live.startFree();
    h.live.detach();
    h.move("U'");
    assert.equal(h.s().phase, 'inspecting');
  } finally { restore(); }
});

test('inspection holds until the first solving move, then the clock starts', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.startGuided('R U');
    h.physical('R U');
    assert.equal(h.s().phase, 'inspecting');
    assert.equal(h.s().elapsedMs, null);
    assert.ok(h.s().inspection);
    h.move("U'");
    assert.equal(h.s().phase, 'solving');
    assert.ok(h.s().elapsedMs >= 0);
    assert.equal(h.s().inspection, null);
  } finally { restore(); }
});

// --- Inspection model -------------------------------------------------------

// Scramble (free), then wait `waitMs` of inspection and make the first move.
async function inspectThenMove(config, waitMs) {
  const h = await rig();
  if (config) h.live.setInspection(config);
  h.physical('R U');
  h.live.startFree();
  h.tick(waitMs);
  const during = h.s();
  h.move("U'", { dt: 0 });
  return { h, during };
}

function finish(h) { h.move("R'"); assert.equal(h.s().phase, 'done'); return h.s().record; }

test('inspection default is WCA: 15 s limit, callouts at 8 and 12 s, no penalty in time', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    assert.deepEqual(h.live.getInspection(), { mode: 'wca', seconds: 15, overtime: 'wca', graceSeconds: 2, gracePenalty: 'plus2', callouts: true });
    h.physical('R U');
    h.live.startFree();
    let i = h.s().inspection;
    assert.equal(i.mode, 'wca');
    assert.equal(i.limitMs, 15000);
    assert.equal(i.remainingMs, 15000);
    assert.equal(i.callout, null);
    h.tick(8000);
    assert.equal(h.s().inspection.callout, 8);
    h.tick(4000);
    i = h.s().inspection;
    assert.equal(i.callout, 12);
    assert.equal(i.remainingMs, 3000);
    assert.equal(i.penalty, null);
    h.move("U'", { dt: 0 });
    assert.equal(h.s().penalty, null);
    const r = finish(h);
    assert.equal(r.penalty, null);
    assert.equal(r.inspectionMs, 12000);
    assert.equal(r.inspectionMode, 'wca');
  } finally { restore(); }
});

test('WCA overtime: +2 after 15 s, DNF after 17 s', async () => {
  const restore = quiet();
  try {
    let { h, during } = await inspectThenMove(null, 16000);
    assert.equal(during.inspection.penalty, '+2');
    assert.equal(during.inspection.overtimeMs, 1000);
    assert.equal(finish(h).penalty, '+2');
    ({ h } = await inspectThenMove(null, 15000));
    assert.equal(finish(h).penalty, null, 'exactly 15 s is in time');
    ({ h, during } = await inspectThenMove(null, 17500));
    assert.equal(during.inspection.penalty, 'DNF');
    const r = finish(h);
    assert.equal(r.penalty, 'DNF');
    assert.ok(r.solveMs >= 0, 'the raw time is kept');
  } finally { restore(); }
});

test('custom limit with count overtime: no penalty, overtime exposed', async () => {
  const restore = quiet();
  try {
    const { h, during } = await inspectThenMove({ mode: 'custom', seconds: 10, overtime: 'count' }, 13000);
    assert.equal(during.inspection.limitMs, 10000);
    assert.equal(during.inspection.overtimeMs, 3000);
    assert.equal(during.inspection.remainingMs, 0);
    assert.equal(during.inspection.penalty, null);
    assert.equal(finish(h).penalty, null);
  } finally { restore(); }
});

test('grace overtime applies the configured penalty only after the grace period', async () => {
  const restore = quiet();
  try {
    const cfg = { mode: 'custom', seconds: 10, overtime: 'grace', graceSeconds: 3, gracePenalty: 'dnf' };
    let { h } = await inspectThenMove(cfg, 12500);
    assert.equal(finish(h).penalty, null, 'within grace');
    ({ h } = await inspectThenMove(cfg, 13500));
    assert.equal(finish(h).penalty, 'DNF');
    ({ h } = await inspectThenMove({ ...cfg, gracePenalty: 'plus2' }, 13500));
    assert.equal(finish(h).penalty, '+2');
    ({ h } = await inspectThenMove({ ...cfg, gracePenalty: 'none' }, 30000));
    assert.equal(finish(h).penalty, null);
  } finally { restore(); }
});

test('autostart overtime: the clock starts at the limit and the first move does not restart it', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.setInspection({ mode: 'custom', seconds: 5, overtime: 'autostart' });
    h.physical('R U');
    h.live.startFree();
    h.tick(4000);
    assert.equal(h.s().phase, 'inspecting');
    h.tick(3000);                      // 2 s past the limit
    assert.equal(h.s().phase, 'solving');
    assert.equal(h.s().elapsedMs, 2000);
    assert.equal(h.s().inspection, null);
    h.tick(1000);
    h.move("U'", { dt: 0 });
    assert.equal(h.s().elapsedMs, 3000, 'first move does not restart the clock');
    h.tick(1000);
    const r = finish(h);
    assert.equal(r.solveMs, 4300);
    assert.equal(r.penalty, null);
    assert.equal(r.inspectionMs, 5000);
    assert.equal(r.moveCount, 2);
  } finally { restore(); }
});

test('autostart applies when the first move itself comes after the limit', async () => {
  const restore = quiet();
  try {
    const { h } = await inspectThenMove({ mode: 'wca', overtime: 'autostart' }, 20000);
    assert.equal(h.s().phase, 'solving');
    assert.equal(h.s().elapsedMs, 5000);
    assert.equal(finish(h).penalty, null);
  } finally { restore(); }
});

test('unlimited inspection never penalises', async () => {
  const restore = quiet();
  try {
    const { h, during } = await inspectThenMove({ mode: 'unlimited' }, 120000);
    assert.equal(during.inspection.limitMs, null);
    assert.equal(during.inspection.remainingMs, null);
    assert.equal(during.inspection.penalty, null);
    assert.equal(during.inspection.callout, null);
    assert.equal(finish(h).penalty, null);
  } finally { restore(); }
});

test('inspection off: no inspecting phase, the clock starts on the first move', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.setInspection({ mode: 'off' });
    h.live.startGuided('R U');
    h.physical('R U');
    assert.equal(h.s().phase, 'ready');
    assert.equal(h.s().inspection, null);
    h.tick(60000);
    assert.equal(h.s().elapsedMs, null);
    h.move("U'", { dt: 0 });
    assert.equal(h.s().phase, 'solving');
    h.tick(1000);
    const r = finish(h);
    assert.equal(r.penalty, null);
    assert.equal(r.solveMs, 1300);
    assert.equal(r.inspectionMs, null);
  } finally { restore(); }
});

test('callouts can be disabled', async () => {
  const restore = quiet();
  try {
    const { during } = await inspectThenMove({ callouts: false }, 13000);
    assert.equal(during.inspection.callout, null);
  } finally { restore(); }
});

test('legacy setInspection({ enabled, seconds }) still works', async () => {
  const restore = quiet();
  try {
    const h = await rig();
    h.live.setInspection({ enabled: false });
    assert.equal(h.live.getInspection().mode, 'unlimited');
    h.physical('R U');
    h.live.startFree();
    assert.equal(h.s().phase, 'inspecting', 'legacy "off" keeps the inspecting phase without a countdown');
    assert.equal(h.s().inspection.remainingMs, null);
    h.live.setInspection({ enabled: true });
    assert.equal(h.live.getInspection().mode, 'wca');
    assert.equal(h.s().inspection.remainingMs, 15000);
    h.live.setInspection({ enabled: true, seconds: 10 });
    assert.deepEqual([h.live.getInspection().mode, h.live.getInspection().seconds], ['custom', 10]);
    assert.equal(h.s().inspection.limitMs, 10000);
  } finally { restore(); }
});
