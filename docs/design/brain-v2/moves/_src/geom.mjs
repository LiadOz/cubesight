// Geometry + cube simulation for the move-guide mockups.
// Frame: x = user's right (R), y = up (U), z = toward the user (F). Right-handed.
// Everything is drawn in the USER'S frame (U up, F front, R right) as the cube is held; the
// colour on each centre comes from the held orientation (bottom/front from the gyro).
import { inspectionOrientation, FACE_COLORS, OPPOSITE_FACE } from '../../../../../src/cross-cube.js';

export const AX = { x: 0, y: 1, z: 2 };
export const UNIT = { R: [1, 0, 0], L: [-1, 0, 0], U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1] };
export const LETTER_OF = k => ({ '1,0,0': 'R', '-1,0,0': 'L', '0,1,0': 'U', '0,-1,0': 'D', '0,0,1': 'F', '0,0,-1': 'B' })[k.join(',')];
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const mul = (a, k) => a.map(v => v * k);
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(...a);
export const norm = a => mul(a, 1 / len(a));

// right-handed rotation of v about the +axis by deg degrees
export function rot(v, ax, deg) {
  const r = deg * Math.PI / 180;
  let c = Math.cos(r), s = Math.sin(r);
  if (deg % 90 === 0) { c = Math.round(c); s = Math.round(s); }
  const [x, y, z] = v;
  if (ax === 0) return [x, y * c - z * s, y * s + z * c];
  if (ax === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

// ---------- move model ----------
// base: axis, layers (coordinate along the axis), sign = direction of the plain move as a right-handed
// rotation about +axis. A face turn is CLOCKWISE seen from outside that face; slices follow a face
// (M like L, E like D, S like F); x/y/z follow R/U/F.
const BASE = {
  R: ['x', [1], -1], L: ['x', [-1], +1], U: ['y', [1], -1], D: ['y', [-1], +1], F: ['z', [1], -1], B: ['z', [-1], +1],
  M: ['x', [0], +1], E: ['y', [0], +1], S: ['z', [0], -1],
  x: ['x', [-1, 0, 1], -1], y: ['y', [-1, 0, 1], -1], z: ['z', [-1, 0, 1], -1],
};
const WIDE = { R: ['x', [0, 1], -1], L: ['x', [-1, 0], +1], U: ['y', [0, 1], -1], D: ['y', [-1, 0], +1], F: ['z', [0, 1], -1], B: ['z', [-1, 0], +1] };
export function parseMove(str) {
  const m = /^([URFDLB]w|[urfdlb]|[URFDLBMESxyz])(2|')?$/.exec(str);
  if (!m) throw new Error('bad move ' + str);
  let [, name, suf] = m;
  let kind, letter = name, base;
  if (/^[URFDLB]w$/.test(name) || /^[urfdlb]$/.test(name)) { letter = name[0].toUpperCase(); kind = 'wide'; base = WIDE[letter]; }
  else if ('MES'.includes(name)) { kind = 'slice'; base = BASE[name]; }
  else if ('xyz'.includes(name)) { kind = 'rot'; base = BASE[name]; }
  else { kind = 'face'; base = BASE[name]; }
  const [axn, layers, sign] = base;
  const double = suf === '2', prime = suf === "'";
  const angle = sign * 90 * (prime ? -1 : 1) * (double ? 2 : 1);
  const wideName = str.includes('w') ? str : (kind === 'wide' ? str : null);
  return { str, kind, letter, ax: AX[axn], layers, sign, double, prime, angle, dir: Math.sign(angle) };
}
export const inv = str => str.endsWith('2') ? str : str.endsWith("'") ? str.slice(0, -1) : str + "'";

// ---------- cubies ----------
export function solved() {
  const out = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const st = [];
    if (x) st.push({ n: [x, 0, 0], c: x > 0 ? 'R' : 'L' });
    if (y) st.push({ n: [0, y, 0], c: y > 0 ? 'U' : 'D' });
    if (z) st.push({ n: [0, 0, z], c: z > 0 ? 'F' : 'B' });
    out.push({ p: [x, y, z], st });
  }
  return out;
}
export function turn(cubies, mv, frac = 1) {
  const a = mv.angle * frac;
  return cubies.map(q => mv.layers.includes(q.p[mv.ax])
    ? { p: rot(q.p, mv.ax, a), st: q.st.map(s => ({ n: rot(s.n, mv.ax, a), c: s.c })) } : q);
}
export function apply(cubies, moves) {
  return moves.reduce((c, m) => turn(c, typeof m === 'string' ? parseMove(m) : m), cubies);
}
export const isSolved = cubies => cubies.every(q => q.st.every(s => s.c === LETTER_OF(s.n.map(Math.round))));

// ---------- held orientation (same maths as describeTurn) ----------
export function heldMap(bottom = 'D', front = 'F') {
  const h = inspectionOrientation(bottom, front);
  const phys = { U: h.top, D: h.bottom, F: h.front, B: OPPOSITE_FACE[h.front], R: h.right, L: OPPOSITE_FACE[h.right] };
  return { held: h, phys, color: Object.fromEntries(Object.entries(phys).map(([k, v]) => [k, FACE_COLORS[v]])) };
}

// ---------- camera ----------
export function makeCam(v, S, cx, cy) {
  const right = norm(cross([0, 1, 0], v));
  const up = norm(cross(v, right));
  const nv = norm(v);
  return {
    v: nv, right, up, S, cx, cy,
    P: p => [cx + dot(p, right) * S, cy - dot(p, up) * S],
    depth: p => dot(p, nv),
    upScreen: d => dot(d, up), // >0 = drawn upward
  };
}
export const CAM_URF = [1, 1, 1];
export const CAM_DLB = [-1, -1, -1];
// Which camera shows the face a move turns? U/R/F (and slices, rotations) -> URF; L/B/D -> DLB.
export function camFor(mv) {
  if ((mv.kind === 'face' || mv.kind === 'wide') && 'LBD'.includes(mv.letter)) return CAM_DLB;
  return CAM_URF;
}

// ---------- arrows (paths in 3D) ----------
// Curved arrow on the outer face of the turning layer(s): sweep centred at the on-screen-top of the face,
// travelling in the actual sense of rotation, so on screen it reads clockwise for R/U/F/L/B/D (seen from
// outside the face) and anticlockwise for primes.
export function faceArc(mv, cam, { r = 1.0, sweep, n = 28, lift = 0.06 } = {}) {
  const side = Math.max(...mv.layers);
  const sideMin = Math.min(...mv.layers);
  const outward = Math.abs(side) >= Math.abs(sideMin) ? Math.sign(side || 1) : Math.sign(sideMin);
  const s = outward || 1;
  const c = [0, 0, 0]; c[mv.ax] = s * (1.5 + lift);
  const planeAx = [0, 1, 2].filter(i => i !== mv.ax);
  const cands = []; for (const i of planeAx) for (const sg of [1, -1]) { const d = [0, 0, 0]; d[i] = sg; cands.push(d); }
  const m = cands.sort((a, b) => cam.upScreen(b) - cam.upScreen(a))[0];
  const total = sweep ?? (mv.double ? 200 : 105);
  const dir = mv.dir || 1;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const phi = dir * (-total / 2 + total * i / n);
    pts.push(add(c, rot(mul(m, r), mv.ax, phi)));
  }
  return pts;
}
// Straight flow arrow on a belt face (face whose normal is perpendicular to the turn axis): along the
// direction the stickers of this layer travel (a x n scaled by the rotation sign).
export function beltLine(mv, n3, { half = 1.05, lift = 0.06 } = {}) {
  const a = [0, 0, 0]; a[mv.ax] = 1;
  const d = norm(mul(cross(a, n3), mv.dir || 1));
  const lane = mv.layers.reduce((s, v) => s + v, 0) / mv.layers.length;
  const q = add(mul(n3, 1.5 + lift), mul(a, lane));
  return [sub(q, mul(d, half)), add(q, mul(d, half))];
}
// Big arc around the cube for whole-cube rotations (drawn in front, nearest the viewer).
export function rotArc(mv, cam, { r = 2.55, sweep = 120, n = 32 } = {}) {
  const a = [0, 0, 0]; a[mv.ax] = 1;
  const v = cam.v;
  const m = norm(sub(v, mul(a, dot(v, a))));
  const dir = mv.dir || 1;
  const total = mv.double ? 200 : sweep;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(rot(mul(m, r), mv.ax, dir * (-total / 2 + total * i / n)));
  return pts;
}

// screen-space orientation of a projected closed-ish arc around its centroid (y down): >0 = clockwise
export function screenSense(pts2) {
  const c = pts2.reduce((s, p) => [s[0] + p[0] / pts2.length, s[1] + p[1] / pts2.length], [0, 0]);
  let a = 0;
  for (let i = 1; i < pts2.length; i++) {
    const p = sub(pts2[i - 1], c), q = sub(pts2[i], c);
    a += p[0] * q[1] - p[1] * q[0];
  }
  return a;
}
