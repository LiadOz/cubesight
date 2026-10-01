import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeMove, displayMove, expandToHeld, heldAfter, invertMove, invertSequence, isMove, normalizeMove, parseMove, parseSequence, toPhysicalTurn,
} from '../src/moves/notation.js';
import { groupMoves } from '../src/moves/triggers.js';

/** Right-handed rotation of v about the +axis (0 x, 1 y, 2 z) by deg. */
function rot(v, ax, deg) {
  const r = deg * Math.PI / 180;
  let c = Math.cos(r), s = Math.sin(r);
  if (deg % 90 === 0) { c = Math.round(c); s = Math.round(s); }
  const [x, y, z] = v;
  if (ax === 0) return [x, y * c - z * s, y * s + z * c];
  if (ax === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}
import { parseScramble } from '../src/cross-cube.js';
import { describeTurn } from '../src/smart-cube-guidance.js';

// A tiny cube model built on the notation core: cubies with a position and sticker normals.
function solved() {
  const out = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const st = [];
    if (x) st.push({ n: [x, 0, 0], c: `x${x}` });
    if (y) st.push({ n: [0, y, 0], c: `y${y}` });
    if (z) st.push({ n: [0, 0, z], c: `z${z}` });
    out.push({ p: [x, y, z], st });
  }
  return out;
}
const round = v => v.map(n => Math.round(n) || 0);
function apply(cubies, moves) {
  return parseSequence(moves).reduce((state, raw) => {
    const m = parseMove(raw);
    return state.map(q => !m.layers.includes(q.p[m.ax]) ? q : { p: round(rot(q.p, m.ax, m.angle)), st: q.st.map(s => ({ n: round(rot(s.n, m.ax, m.angle)), c: s.c })) });
  }, cubies);
}
const key = cubies => cubies.map(q => `${q.p}:${q.st.map(s => `${s.n}${s.c}`).sort()}`).sort().join(';');
const same = (a, b) => key(a) === key(b);
const isSolved = c => same(c, solved());
const at = (c, p) => c.find(q => q.p.join() === p.join());

test('parse accepts every move kind and normalizes primes', () => {
  for (const move of ['R', "R'", 'R2', 'Rw', "Rw'", 'Rw2', 'r', "r'", 'M', "E'", 'S2', 'x', "y'", 'z2']) assert.ok(isMove(move), move);
  for (const move of ['', 'Q', 'R3', 'rw', 'Mw', 'xw', "R''", 'R22']) assert.equal(isMove(move), false, move);
  assert.equal(normalizeMove('R′'), "R'");
  assert.equal(normalizeMove('R’'), "R'");
  assert.equal(normalizeMove("R2'"), 'R2');
  assert.equal(normalizeMove('R2′'), 'R2');
  assert.deepEqual(parseSequence("R U′ r’ M2 y"), ['R', "U'", "r'", 'M2', 'y']);
  assert.equal(displayMove("R'"), 'R′');
  const wide = parseMove('Rw');
  assert.deepEqual([wide.kind, wide.letter, wide.layers], ['wide', 'R', [0, 1]]);
  assert.equal(parseMove('r').kind, 'wide');
  assert.equal(parseMove('M').kind, 'slice');
  assert.equal(parseMove("y'").kind, 'rot');
  assert.equal(parseMove('R').angle, -90);
  assert.equal(parseMove("R'").angle, 90);
  assert.equal(parseMove('L').angle, 90);
  assert.equal(parseMove('R2').angle, -180);
});

test('invert: primes, doubles and whole sequences', () => {
  assert.equal(invertMove('R'), "R'");
  assert.equal(invertMove("r'"), 'r');
  assert.equal(invertMove('M2'), 'M2');
  assert.equal(invertMove('R′'), 'R');
  assert.deepEqual(invertSequence("R U2 F'"), ['F', 'U2', "R'"]);
});

test('every move followed by its inverse, four quarters and two halves return a solved cube', () => {
  for (const m of ['R', 'L', 'U', 'D', 'F', 'B', 'M', 'E', 'S', 'x', 'y', 'z', 'Rw', 'r', 'Uw', 'f']) {
    assert.ok(isSolved(apply(apply(solved(), [m]), [invertMove(m)])), `${m} then inverse`);
    assert.ok(isSolved(apply(solved(), [m, m, m, m])), `${m} x4`);
    assert.ok(isSolved(apply(solved(), [`${m}2`, `${m}2`])), `${m}2 x2`);
  }
});

test('sticker flow: clockwise seen from outside, slices follow a face, rotations follow R U F', () => {
  const flow = (move, p) => { const m = parseMove(move); return round(rot(p, m.ax, m.angle)); };
  assert.deepEqual(flow('R', [1, 0, 1]), [1, 1, 0]);      // R sends FR to UR
  assert.deepEqual(flow('U', [0, 1, 1]), [-1, 1, 0]);     // U sends UF to UL
  assert.deepEqual(flow('F', [0, 1, 1]), [1, 0, 1]);      // F sends UF to FR
  assert.deepEqual(flow('L', [-1, 0, 1]), [-1, -1, 0]);   // L sends FL to DL
  assert.deepEqual(flow('D', [0, -1, 1]), [1, -1, 0]);    // D sends DF to DR
  assert.deepEqual(flow('B', [0, 1, -1]), [-1, 0, -1]);   // B sends UB to BL
  assert.deepEqual(flow('M', [0, 0, 1]), [0, -1, 0]);     // M follows L: front centre goes down
  assert.deepEqual(flow('E', [0, 0, 1]), [1, 0, 0]);      // E follows D: front centre goes right
  assert.deepEqual(flow('S', [0, 1, 0]), [1, 0, 0]);      // S follows F: top centre goes right
  assert.deepEqual(flow('x', [0, 0, 1]), [0, 1, 0]);
  assert.deepEqual(flow('y', [0, 0, 1]), [-1, 0, 0]);
  assert.deepEqual(flow('z', [0, 1, 0]), [1, 0, 0]);
  assert.deepEqual(flow("R'", [1, 0, 1]), [1, -1, 0]);
});

test('wide and rotation identities: r = R M\', x = R M\' L\', Uw = U E\'', () => {
  assert.ok(same(apply(solved(), ['r']), apply(solved(), ['R', "M'"])));
  assert.ok(same(apply(solved(), ['Rw']), apply(solved(), ['R', "M'"])));
  assert.ok(same(apply(solved(), ['x']), apply(solved(), ['R', "M'", "L'"])));
  assert.ok(same(apply(solved(), ['y']), apply(solved(), ['U', "E'", "D'"])));
  assert.ok(same(apply(solved(), ['z']), apply(solved(), ['F', 'S', "B'"])));
  assert.ok(same(apply(solved(), ['Uw']), apply(solved(), ['U', "E'"])));
});

test('T-perm: bottom two layers intact, an involution, swaps UFR/UBR corners and UL/UR edges', () => {
  const T = "R U R' U' R' F R2 U' R' U' R U R' F'";
  const after = apply(solved(), T);
  assert.equal(isSolved(after), false);
  for (const q of solved().filter(c => c.p[1] <= 0)) assert.deepEqual(at(after, q.p), q, `piece at ${q.p}`);
  assert.ok(isSolved(apply(after, T)));
  const name = q => q.st.map(s => s.c).sort().join('');
  assert.equal(name(at(after, [1, 1, 1])), ['x1', 'y1', 'z-1'].sort().join(''));   // UBR piece sits at UFR
  assert.equal(name(at(after, [-1, 1, 0])), ['x1', 'y1'].sort().join(''));          // UR edge sits at UL
  assert.equal(name(at(after, [1, 1, 0])), ['x-1', 'y1'].sort().join(''));
});

test("r U R' U' r' F R F' leaves the D layer intact", () => {
  const after = apply(solved(), "r U R' U' r' F R F'");
  for (const q of solved().filter(c => c.p[1] === -1)) assert.deepEqual(at(after, q.p), q);
});

test('heldAfter: rotations change the held orientation, other moves do not', () => {
  const home = { bottom: 'D', front: 'F' };
  assert.deepEqual(heldAfter(home, 'R'), home);
  assert.deepEqual(heldAfter(home, 'M'), home);
  assert.deepEqual(heldAfter(home, 'x'), { bottom: 'B', front: 'D' });   // front goes up, so the back is now underneath
  assert.deepEqual(heldAfter(home, 'y'), { bottom: 'D', front: 'R' });   // the right face is now in front
  assert.deepEqual(heldAfter(home, "y'"), { bottom: 'D', front: 'L' });
  assert.deepEqual(heldAfter(home, 'z'), { bottom: 'R', front: 'F' });   // top goes right, so the right face ends underneath
  assert.deepEqual(heldAfter(home, 'y2'), { bottom: 'D', front: 'B' });
  let held = home;
  for (const m of ['x', 'x', 'x', 'x']) held = heldAfter(held, m);
  assert.deepEqual(held, home);
  assert.deepEqual(expandToHeld("y' R U R'", home).map(e => e.held.front), ['F', 'L', 'L', 'L']);
});

test('describe: faces keep the describeTurn wording; slices, rotations and lowercase wide are described', () => {
  assert.match(describeMove('R').text, /right face \(red center\) clockwise/);
  assert.match(describeMove("U'", { bottom: 'U', front: 'F' }).text, /top face \(yellow center\) counterclockwise/);
  assert.match(describeMove("Rw'").text, /right two layers \(red center\) counterclockwise/);
  assert.match(describeMove('r').text, /right two layers/);
  assert.match(describeMove("M'").text, /middle layer \(left-to-right\) the opposite way to the left face \(orange center\)/);
  assert.match(describeMove('E2').text, /middle layer \(top-to-bottom\) 180°/);
  assert.match(describeMove("y'").text, /whole cube the opposite way to the top face/);
  assert.match(describeMove('x', { bottom: 'U', front: 'F' }).text, /same way as the right face/);
  assert.equal(describeMove('R2').caption, 'half turn');
  assert.equal(describeMove('y').caption, 'rotate cube');
  // describeTurn keeps its answers and gains the new kinds.
  assert.match(describeTurn('R', 'D', 'F').text, /right face \(red center\) clockwise/);
  assert.match(describeTurn("M'", 'D', 'F').text, /middle layer/);
  assert.match(describeTurn('y', 'D', 'F').text, /Rotate the whole cube/);
  assert.match(describeTurn('r', 'D', 'F').text, /right two layers/);
  assert.match(describeTurn('R′', 'D', 'F').text, /counterclockwise/);
  assert.equal(describeTurn('Q'), null);
});

test('toPhysicalTurn maps a held move onto the physical frame', () => {
  assert.deepEqual(toPhysicalTurn('R'), { move: 'R', kind: 'face', axis: [1, 0, 0], layers: [1], angle: -90, face: 'R' });
  // Hold the cube upside down (yellow up, green front): the right face is orange.
  const t = toPhysicalTurn('R', { bottom: 'U', front: 'F' });
  assert.equal(t.face, 'L');
  assert.deepEqual(t.axis, [-1, 0, 0]);
  assert.equal(t.angle, -90);
  // the slice M is the middle layer about the physical x axis whichever way it is held
  const m = toPhysicalTurn('M', { bottom: 'D', front: 'R' });
  assert.deepEqual(m.layers, [0]);
  assert.equal(Math.abs(m.axis[2]), 1);
});

test('parseScramble: rotations and lowercase wide are opt-in', () => {
  assert.throws(() => parseScramble('R y U'));
  assert.throws(() => parseScramble('R y U', { allowWide: true }));
  assert.deepEqual(parseScramble('r U', { allowWide: true }), ['r', 'U']);
  assert.deepEqual(parseScramble("r U R' y2 x' z", { allowRotations: true }), ['r', 'U', "R'", 'y2', "x'", 'z']);
  assert.deepEqual(parseScramble('R′ U’', { allowRotations: true }), ["R'", "U'"]);
  assert.throws(() => parseScramble('R Q', { allowRotations: true }));
});

test('triggers group known chunks', () => {
  assert.deepEqual(groupMoves("R U R' U' R' F R2 U' R' U' R U R' F'"), [[0, 3, 'sexy move'], [10, 12, 'trigger']]);
  assert.deepEqual(groupMoves("R U R' U R U2 R'"), [[0, 6, 'sune']]);
  assert.deepEqual(groupMoves("R' F R F'"), [[0, 3, 'sledgehammer']]);
  assert.deepEqual(groupMoves('R U F', 'none'), []);
  assert.deepEqual(groupMoves('R U F', [[0, 1, 'x']]), [[0, 1, 'x']]);
});
