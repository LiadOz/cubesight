// Minimal cubie model for the algorithm generator. Move tables come from
// cubing.js's 3x3x3 KPuzzle definition (MPL-2.0 OR GPL-3.0-or-later; used at
// build time only), so nothing here is hand-typed cube geometry.
//
// State layout (Uint8Array, 46 bytes): [0..25] piece permutation
// (8 corners, 12 edges, 6 centres), [26..45] orientations (8 corners mod 3,
// 12 edges mod 2). Centre orientation is ignored so U-turns commute with
// "same case up to AUF".
import { cube3x3x3 } from '../../../node_modules/cubing/dist/lib/cubing/puzzles/index.js';

export const N = 46;
const kp = await cube3x3x3.kpuzzle();

export function fromTransformation(t) {
  const s = new Uint8Array(N);
  const d = t.transformationData;
  for (let i = 0; i < 8; i++) { s[i] = d.CORNERS.permutation[i]; s[26 + i] = d.CORNERS.orientationDelta[i]; }
  for (let i = 0; i < 12; i++) { s[8 + i] = 8 + d.EDGES.permutation[i]; s[34 + i] = d.EDGES.orientationDelta[i]; }
  for (let i = 0; i < 6; i++) s[20 + i] = 20 + d.CENTERS.permutation[i];
  return s;
}
export const IDENTITY = fromTransformation(kp.identityTransformation());
export function stateOf(alg) { return fromTransformation(kp.algToTransformation(alg)); }

// c = a then b
export function compose(a, b, c = new Uint8Array(N)) {
  for (let i = 0; i < 26; i++) c[i] = a[b[i]];
  for (let i = 0; i < 8; i++) c[26 + i] = (a[26 + b[i]] + b[26 + i]) % 3;
  for (let i = 8; i < 20; i++) c[26 + i] = (a[26 + b[i]] + b[26 + i]) & 1;
  return c;
}
export function invert(a) {
  const r = new Uint8Array(N);
  for (let i = 0; i < 26; i++) r[a[i]] = i;
  for (let i = 0; i < 20; i++) { const j = a[i]; // piece at slot i came from j
    r[26 + j] = (i < 8 ? 3 - a[26 + i] : a[26 + i]) % (i < 8 ? 3 : 2); }
  return r;
}
export function equal(a, b) { for (let i = 0; i < N; i++) if (a[i] !== b[i]) return false; return true; }
// 52-bit-ish hash (verified by exact replay on every hit)
export function hash(s) {
  let h1 = 0x811c9dc5 | 0, h2 = 0x1b873593 | 0;
  for (let i = 0; i < N; i++) { h1 = Math.imul(h1 ^ s[i], 0x01000193); h2 = Math.imul(h2 + s[i] + 1, 0x85ebca6b) ^ (h2 >>> 13); }
  return (h1 >>> 0) * 0x200000 + (h2 >>> 11);
}

// ---- move sets ----------------------------------------------------------
const SUFFIX = ['', "'", '2'];
const AXIS = { U: 0, D: 0, R: 1, L: 1, r: 1, M: 1, F: 2, B: 2 };
const RANK = { U: 1, D: 0, L: 0, M: 1, R: 2, r: 3, F: 0, B: 1 };
export const GENERATORS = {
  'RU': 'RU', 'RUF': 'RUF', 'RUD': 'RUD', 'RUL': 'RUL', 'RUFD': 'RUFD', 'RUr': 'RUr', 'RUM': 'RUM',
};
export function makeMoveSet(faces) {
  const moves = [];
  for (const f of faces) for (const s of SUFFIX) {
    const name = f + s;
    moves.push({ name, face: f, axis: AXIS[f], rank: RANK[f], state: stateOf(name) });
  }
  return moves;
}
// legal successor m after prev (canonical ordering inside an axis run)
export function allowed(prev, m) {
  if (!prev) return true;
  if (prev.axis !== m.axis) return true;
  return m.rank > prev.rank; // one move per face per axis run, fixed order
}

// ---- notation utilities -------------------------------------------------
export function tokens(alg) { return alg.trim().split(/\s+/).filter(Boolean); }
export function invertAlg(alg) {
  return tokens(alg).reverse().map(m => m.endsWith('2') ? m : m.endsWith("'") ? m.slice(0, -1) : m + "'").join(' ');
}
const MIRROR_LR = { R: 'L', L: 'R', r: 'l', M: 'M', U: 'U', D: 'D', F: 'F', B: 'B' };
export function mirrorAlg(alg) { // mirror across the M plane (swap R/L, flip direction)
  return tokens(alg).map(m => { const f = MIRROR_LR[m[0]]; let s = m.slice(1);
    if (m[0] !== 'M') s = s === '' ? "'" : s === "'" ? '' : s; else s = s === '' ? "'" : s === "'" ? '' : s;
    return (f === 'l' ? 'l' : f) + s; }).join(' ');
}
// STM: every face turn, wide, or slice counts 1. ETM would count M as 2 (QTM-ish
// "ETM" = face + slice + rotation); we report STM and ETM(M=2,r=2-equivalent none).
export function stm(alg) { return tokens(alg).length; }
export function etm(alg) { return tokens(alg).reduce((n, m) => n + (m[0] === 'M' ? 2 : 1), 0); }
export const OFF_HAND = new Set(['F', 'B', 'D', 'L']);
// Ergonomic score (lower is better): STM, plus penalties per off-hand move
// (F/D 1, L 1.5, B 2), wide/slice 0.5, and 1 per regrip (run of off-hand moves).
export function ergo(alg) {
  const t = tokens(alg); let score = t.length, regrips = 0, run = false;
  const pen = { F: 1, D: 1, L: 1.5, B: 2, r: 0.5, M: 0.5 };
  for (const m of t) {
    const f = m[0]; score += pen[f] || 0;
    const off = OFF_HAND.has(f);
    if (off && !run) { regrips++; score += 1; }
    run = off;
  }
  return { score, stm: t.length, etm: etm(alg), regrips };
}
export function genSet(alg) {
  const f = new Set(tokens(alg).map(m => m[0]));
  return ['R', 'U', 'F', 'D', 'L', 'B', 'r', 'M'].filter(x => f.has(x)).join('');
}
