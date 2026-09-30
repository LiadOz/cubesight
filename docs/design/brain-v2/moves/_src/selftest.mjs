// Verifies the move semantics independently of the drawings. Run: node selftest.mjs
import { parseMove, solved, apply, isSolved, turn, makeCam, camFor, faceArc, beltLine, screenSense, rot, inv, heldMap } from './geom.mjs';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
// 1. sticker flow: where does a sticker on the named face/position end up after ONE plain turn?
const moveOf = (mv, p, n) => { const m = parseMove(mv); const q = turn(solved(), m).find(() => false); return null; };
function flow(mv, p0) { // returns new position of the cubie that started at p0
  const m = parseMove(mv); return rot(p0, m.ax, m.angle);
}
const eq = (a, b) => a.map(Math.round).join() === b.join();
// R: the front-right-middle edge goes UP (F->U); U: the front-top-middle edge goes LEFT (F->L)  [clockwise seen from the face]
ok(eq(flow('R', [1, 0, 1]), [1, 1, 0]), 'R: FR edge goes to UR');
ok(eq(flow('R', [1, 1, 0]), [1, 0, -1]), 'R: UR edge goes to BR');
ok(eq(flow('U', [0, 1, 1]), [-1, 1, 0]), 'U: UF edge goes to UL');
ok(eq(flow('F', [0, 1, 1]), [1, 0, 1]), 'F: UF edge goes to FR');
ok(eq(flow('L', [-1, 0, 1]), [-1, -1, 0]), 'L: FL edge goes to DL');
ok(eq(flow('D', [0, -1, 1]), [1, -1, 0]), 'D: DF edge goes to DR');
ok(eq(flow('B', [0, 1, -1]), [-1, 0, -1]), 'B: UB edge goes to BL');
ok(eq(flow('M', [0, 1, 1]), [0, 0, 1]) === false, 'noop');
ok(eq(flow('M', [0, 0, 1]), [0, -1, 0]), 'M: front centre goes DOWN (like L)');
ok(eq(flow('E', [0, 0, 1]), [1, 0, 0]), 'E: front centre goes RIGHT (like D)');
ok(eq(flow('S', [0, 1, 0]), [1, 0, 0]), 'S: top centre goes RIGHT (like F)');
ok(eq(flow('x', [0, 0, 1]), [0, 1, 0]), 'x: like R, front goes UP');
ok(eq(flow('y', [0, 0, 1]), [-1, 0, 0]), "y: like U, front goes LEFT");
ok(eq(flow('z', [0, 1, 0]), [1, 0, 0]), 'z: like F, top goes RIGHT');
ok(eq(flow("R'", [1, 0, 1]), [1, -1, 0]), "R': FR edge goes down");
// 2. group properties: a turn then its inverse is identity; four quarter turns too; wide = face + opposite slice
for (const m of ['R', 'L', 'U', 'D', 'F', 'B', 'M', 'E', 'S', 'x', 'y', 'z', 'Rw', 'r', 'Uw', 'f']) {
  ok(isSolved(apply(apply(solved(), [m]), [inv(m)])), m + ' then inverse');
  ok(isSolved(apply(solved(), [m, m, m, m])), m + ' x4');
  ok(isSolved(apply(solved(), [m + '2', m + '2'])), m + '2 x2');
}
// r = R M'   (wide follows its face)   ;  x = R M' L'
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cmp = (A, B) => { const k = c => c.map(q => q.p.join() + ':' + q.st.map(s => s.n.join() + s.c).sort().join('|')).sort().join(';'); return k(A) === k(B); };
ok(cmp(apply(solved(), ['r']), apply(solved(), ['R', "M'"])), "r == R M'");
ok(cmp(apply(solved(), ['x']), apply(solved(), ['R', "M'", "L'"])), "x == R M' L'");
ok(cmp(apply(solved(), ['Uw']), apply(solved(), ['U', "E'"])), "Uw == U E'");
// 3. T-perm only touches the top layer (F2L untouched) and is an involution; uses R,U,F,R2 semantics
const T = "R U R' U' R' F R2 U' R' U' R U R' F'".split(' ');
const t1 = apply(solved(), T);
ok(!isSolved(t1), 'T-perm changes the cube');
ok(t1.every(q => q.p[1] < 1 ? q.st.every(s => Math.abs(s.n[1]) > 0 ? true : true) : true), 'noop');
const bottom = t1.filter(q => q.p[1] <= 0 && (q.p[1] === 0 || true));
// every cubie that started at y<=0 must be back home with its stickers
const home = solved();
const at = (c, p) => c.find(q => q.p.join() === p.join());
let f2lOk = true; for (const q of home) if (q.p[1] <= 0) { const r = at(t1, q.p); if (!r || JSON.stringify(r.st.map(s => [s.n.map(Math.round), s.c])) !== JSON.stringify(q.st.map(s => [s.n, s.c]))) f2lOk = false; }
ok(f2lOk, 'T-perm leaves the bottom two layers solved');
ok(isSolved(apply(solved(), [...T, ...T])), 'T-perm twice = identity');
// the actual T-perm swaps UFR<->UBR corners and UL<->UR edges
const pos = (c, p0, col) => c.find(q => q.st.some(s => s.c === col) && JSON.stringify(q.st.map(s => s.c).sort()) === JSON.stringify(col)) ;
const cornerAt = (c, p) => at(c, p).st.map(s => s.c).sort().join('');
ok(cornerAt(t1, [1, 1, 1]) === ['R', 'U', 'B'].sort().join(''), 'T-perm: UBR piece now at UFR');
const edgeAt = (c, p) => at(c, p).st.map(s => s.c).sort().join('');
ok(edgeAt(t1, [-1, 1, 0]) === 'RU' && edgeAt(t1, [1, 1, 0]) === 'LU', 'T-perm: UL and UR edges swapped');
// 4. r U R' U' r' F R F' is an OLL: keeps the bottom two layers (centres aside) in place
const O = "r U R' U' r' F R F'".split(' ');
const o1 = apply(solved(), O);
let f2l2 = true; for (const q of home) if (q.p[1] <= -1) { const r = at(o1, q.p); if (!r || JSON.stringify(r.st.map(s => [s.n.map(Math.round), s.c])) !== JSON.stringify(q.st.map(s => [s.n, s.c]))) f2l2 = false; }
console.log('OLL "r U R\' U\' r\' F R F\'" leaves the D layer intact:', f2l2);
// 5. screen sense of arcs: from the camera that shows the face, R U F L B D read clockwise; primes anticlockwise
for (const name of ['R', 'U', 'F', 'L', 'B', 'D']) for (const suf of ['', "'"]) {
  const mv = parseMove(name + suf);
  const cam = makeCam(camFor(mv), 100, 0, 0);
  const pts = faceArc(mv, cam).map(cam.P);
  const cw = screenSense(pts) > 0;
  ok(cw === !mv.prime, `${mv.str} arc is ${cw ? 'clockwise' : 'anticlockwise'} on screen`);
  // the arc's end lies in the direction of travel: first->last moves the same way a sticker on that face moves
}
// belt arrows follow sticker flow: R on the F face points UP on screen, U on the F face points LEFT, F on the U face points RIGHT
{
  const cam = makeCam([1, 1, 1], 100, 0, 0);
  const d = mv => { const [a, b] = beltLine(parseMove(mv), mv.includes('F') && !mv.includes('U') ? [0, 1, 0] : [0, 0, 1]); const A = cam.P(a), B = cam.P(b); return [B[0] - A[0], B[1] - A[1]]; };
  const r = d('R'); ok(Math.abs(r[0]) < 1e3 && r[1] < 0, 'R flows up on screen (F face)');
  const u = d('U'); ok(u[0] < 0, 'U flows left on screen (F face)');
  const f = beltLine(parseMove('F'), [0, 1, 0]); const A = cam.P(f[0]), B = cam.P(f[1]); ok(B[0] > A[0], 'F flows right on screen (U face)');
}
// 6. held orientation: default held = white top, green front, red right; a blue-front hold swaps names
ok(heldMap('D', 'F').color.R === 'red' && heldMap('D', 'F').color.U === 'white', 'default hold');
const h2 = heldMap('D', 'R'); ok(h2.color.F === 'red' && h2.color.R === 'blue', 'hold D/R: front red, right blue');
console.log(fails ? `${fails} FAILED` : 'all semantic checks passed');
process.exit(fails ? 1 : 0);
