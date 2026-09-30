// Isometric cube geometry for the static move glyphs and arrows. Pure maths:
// the drawing layer (glyph.js) turns the output into SVG. A port of
// docs/design/brain-v2/moves/_src/geom.mjs, whose self-test checks the arrow
// directions; the unit tests re-check them against notation.js.
import { FACE_VECTOR, parseMove } from './notation.js';

export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const mul = (a, k) => a.map(v => v * k);
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = a => mul(a, 1 / Math.hypot(...a));

/** Right-handed rotation of v about the +axis (0 x, 1 y, 2 z) by deg. */
export function rot(v, ax, deg) {
  const r = deg * Math.PI / 180;
  let c = Math.cos(r), s = Math.sin(r);
  if (deg % 90 === 0) { c = Math.round(c); s = Math.round(s); }
  const [x, y, z] = v;
  if (ax === 0) return [x, y * c - z * s, y * s + z * c];
  if (ax === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

export const CAM_URF = [1, 1, 1];
export const CAM_DLB = [-1, -1, -1];

/** Orthographic camera looking from direction v; P maps 3D to screen (y down). */
export function makeCam(v, S = 1, cx = 0, cy = 0) {
  const right = norm(cross([0, 1, 0], v));
  const up = norm(cross(v, right));
  const nv = norm(v);
  return { v: nv, right, up, S, P: p => [cx + dot(p, right) * S, cy - dot(p, up) * S], depth: p => dot(p, nv), upScreen: d => dot(d, up) };
}

/** U R F (and slices, rotations) are drawn from the URF corner, L B D from the opposite one. */
export function camFor(move) {
  const mv = typeof move === 'string' ? parseMove(move) : move;
  return (mv.kind === 'face' || mv.kind === 'wide') && 'LBD'.includes(mv.letter) ? CAM_DLB : CAM_URF;
}

const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const letterOf = n => ({ '1,0,0': 'R', '-1,0,0': 'L', '0,1,0': 'U', '0,-1,0': 'D', '0,0,1': 'F', '0,0,-1': 'B' })[n.join(',')];

/**
 * The visible sticker quads of a solved cube in the user's frame, back faces
 * culled, as screen polygons. Each: {face: user-frame letter, poly, inLayer, shade (0 | 1 | 2)}.
 */
export function cubeQuads(mv, cam, { gap = 0.14 } = {}) {
  const quads = [];
  const L = norm(add(add(mul(cam.up, 0.8), mul(cam.right, -0.25)), mul(cam.v, 0.5)));
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const p = [x, y, z];
    const inLayer = Boolean(mv) && mv.layers.includes(p[mv.ax]);
    for (const n of AXES) {
      if (dot(n, cam.v) < 0.02) continue;
      if (!n.every((c, i) => !c || p[i] === c)) continue;   // interior face: never visible
      const fc = add(p, mul(n, 0.5));
      const others = AXES.filter(a => Math.abs(dot(a, n)) < 0.5 && (a[0] + a[1] + a[2]) > 0);
      const corner = (h, s1, s2) => add(fc, add(mul(others[0], s1 * h), mul(others[1], s2 * h)));
      const quad = h => [corner(h, -1, -1), corner(h, 1, -1), corner(h, 1, 1), corner(h, -1, 1)].map(cam.P);
      const light = dot(n, L);
      quads.push({ face: letterOf(n), body: quad(0.5), poly: quad(0.5 - gap), inLayer, shade: light > 0.55 ? 0 : light > 0.05 ? 1 : 2 });
    }
  }
  return quads;
}

/** Curved arrow on the outer face of the turning layer; reads clockwise from outside for plain moves. */
export function faceArc(mv, cam, { r = 1.0, sweep, n = 28, lift = 0.06 } = {}) {
  const side = Math.max(...mv.layers);
  const sideMin = Math.min(...mv.layers);
  const outward = Math.abs(side) >= Math.abs(sideMin) ? Math.sign(side || 1) : Math.sign(sideMin);
  const c = [0, 0, 0]; c[mv.ax] = (outward || 1) * (1.5 + lift);
  const planeAx = [0, 1, 2].filter(i => i !== mv.ax);
  const cands = [];
  for (const i of planeAx) for (const sg of [1, -1]) { const d = [0, 0, 0]; d[i] = sg; cands.push(d); }
  const m = cands.sort((a, b) => cam.upScreen(b) - cam.upScreen(a))[0];
  const total = sweep ?? (mv.double ? 200 : 105);
  const dir = mv.dir || 1;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(add(c, rot(mul(m, r), mv.ax, dir * (-total / 2 + total * i / n))));
  return pts;
}

/** Straight flow arrow on a side face: the direction the stickers of this layer travel. */
export function beltLine(mv, n3, { half = 1.05, lift = 0.06 } = {}) {
  const a = [0, 0, 0]; a[mv.ax] = 1;
  const d = norm(mul(cross(a, n3), mv.dir || 1));
  const lane = mv.layers.reduce((s, v) => s + v, 0) / mv.layers.length;
  const q = add(mul(n3, 1.5 + lift), mul(a, lane));
  return [sub(q, mul(d, half)), add(q, mul(d, half))];
}

/** Big arc around the cube for whole-cube rotations, nearest the viewer. */
export function rotArc(mv, cam, { r = 2.55, sweep = 120, n = 32 } = {}) {
  const a = [0, 0, 0]; a[mv.ax] = 1;
  const m = norm(sub(cam.v, mul(a, dot(cam.v, a))));
  const dir = mv.dir || 1;
  const total = mv.double ? 200 : sweep;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(rot(mul(m, r), mv.ax, dir * (-total / 2 + total * i / n)));
  return pts;
}

/** Orientation of a projected arc around its centroid (y down): > 0 is clockwise on screen. */
export function screenSense(pts2) {
  const c = pts2.reduce((s, p) => [s[0] + p[0] / pts2.length, s[1] + p[1] / pts2.length], [0, 0]);
  let a = 0;
  for (let i = 1; i < pts2.length; i++) {
    const p = sub(pts2[i - 1], c), q = sub(pts2[i], c);
    a += p[0] * q[1] - p[1] * q[0];
  }
  return a;
}

/** Side faces (normal perpendicular to the turn axis) the camera can see. */
export function beltFaces(mv, cam) {
  return Object.values(FACE_VECTOR).filter(n => Math.abs(n[mv.ax]) < 0.5 && dot(n, cam.v) > 0.1);
}

/**
 * Screen-space arrow paths for one move: {kind, pts (projected), width scale, dashed, double}.
 * Slices get flow arrows only, rotations a dashed ring, face/wide a curved arrow
 * (plus thin flow arrows on the side faces when `belt`).
 */
export function arrowPaths(mv, cam, { belt = true } = {}) {
  const P = pts => pts.map(cam.P);
  if (mv.kind === 'rot') return [{ pts: P(rotArc(mv, cam)), weight: 0.9, dashed: true, double: mv.double }];
  const belts = beltFaces(mv, cam);
  if (mv.kind === 'slice') return belts.map(n => ({ pts: P(beltLine(mv, n)), weight: 1, double: mv.double }));
  const out = [{ pts: P(faceArc(mv, cam)), weight: 1, double: mv.double }];
  if (belt) for (const n of belts) out.push({ pts: P(beltLine(mv, n, { half: 0.75 })), weight: 0.55, double: false });
  return out;
}
