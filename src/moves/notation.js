// Move notation core: parse, normalize, invert, describe and orient any move a
// cuber writes (faces, wide Rw / r, slices M E S, rotations x y z, with 2 and
// prime). Pure functions, no DOM. The geometry follows
// docs/design/brain-v2/moves/_src/geom.mjs (verified by its self-test): a face
// turn is a right-handed rotation about the face's outward axis by -90 degrees
// (clockwise seen from outside); L D B are +90; slices follow a face (M like L,
// E like D, S like F); x y z follow R U F.
import { FACE_COLORS, OPPOSITE_FACE, inspectionOrientation } from '../cross-cube.js';

const PRIMES = /[′’‘`]/g;

export const AXIS_INDEX = Object.freeze({ x: 0, y: 1, z: 2 });
/** Unit vector of each face in the user's frame (x right, y up, z toward the user). */
export const FACE_VECTOR = Object.freeze({
  R: [1, 0, 0], L: [-1, 0, 0], U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1],
});
const PHYSICAL_NORMAL = FACE_VECTOR;   // the colour frame uses the same axes
export const letterOfVector = v => ({ '1,0,0': 'R', '-1,0,0': 'L', '0,1,0': 'U', '0,-1,0': 'D', '0,0,1': 'F', '0,0,-1': 'B' })[v.map(Math.round).map(n => n || 0).join(',')];

// Per move letter: [axis, layer coordinates along it, sign of the plain move as a
// right-handed rotation about +axis].
const BASE = {
  R: ['x', [1], -1], L: ['x', [-1], +1], U: ['y', [1], -1], D: ['y', [-1], +1], F: ['z', [1], -1], B: ['z', [-1], +1],
  M: ['x', [0], +1], E: ['y', [0], +1], S: ['z', [0], -1],
  x: ['x', [-1, 0, 1], -1], y: ['y', [-1, 0, 1], -1], z: ['z', [-1, 0, 1], -1],
};
const WIDE = {
  R: ['x', [0, 1], -1], L: ['x', [-1, 0], +1], U: ['y', [0, 1], -1], D: ['y', [-1, 0], +1], F: ['z', [0, 1], -1], B: ['z', [-1, 0], +1],
};

const MOVE_PATTERN = /^([URFDLB]w|[urfdlb]|[URFDLBMESxyz])(2'?|'2?|')?$/;

/** Rewrite prime look-alikes (′ ’ ‘ `) as ASCII ' and "R2'" as "R2". */
export function normalizeMove(input) {
  const token = String(input ?? '').trim().replace(PRIMES, "'");
  const m = MOVE_PATTERN.exec(token);
  if (!m) throw new Error(`Unsupported move “${token.slice(0, 30)}”.`);
  const [, name, suffix = ''] = m;
  return `${name}${suffix.includes('2') ? '2' : suffix}`;
}

export function isMove(input) {
  try { normalizeMove(input); return true; } catch { return false; }
}

/**
 * @typedef {object} ParsedMove
 * @property {string} str       normalized ASCII notation
 * @property {'face'|'wide'|'slice'|'rot'} kind
 * @property {string} letter    U R F D L B for face and wide, M E S or x y z otherwise
 * @property {'x'|'y'|'z'} axis
 * @property {number} ax        0 | 1 | 2
 * @property {number[]} layers  layer coordinates along the axis (-1, 0, 1)
 * @property {number} sign      direction of the plain move about +axis
 * @property {boolean} double
 * @property {boolean} prime
 * @property {number} angle     degrees, right-handed about +axis (R = -90)
 * @property {number} dir       sign of angle
 */

/** @returns {ParsedMove} */
export function parseMove(input) {
  const str = normalizeMove(input);
  const name = str.replace(/['2]$/, '');
  const double = str.endsWith('2');
  const prime = str.endsWith("'");
  let kind, letter, base;
  if (/^[URFDLB]w$/.test(name) || /^[urfdlb]$/.test(name)) { kind = 'wide'; letter = name[0].toUpperCase(); base = WIDE[letter]; }
  else if ('MES'.includes(name)) { kind = 'slice'; letter = name; base = BASE[name]; }
  else if ('xyz'.includes(name)) { kind = 'rot'; letter = name; base = BASE[name]; }
  else { kind = 'face'; letter = name; base = BASE[name]; }
  const [axis, layers, sign] = base;
  const angle = sign * 90 * (prime ? -1 : 1) * (double ? 2 : 1);
  return { str, kind, letter, axis, ax: AXIS_INDEX[axis], layers: [...layers], sign, double, prime, angle, dir: Math.sign(angle) };
}

/** Split text into normalized moves. Throws on the first unsupported token. */
export function parseSequence(input) {
  const tokens = Array.isArray(input) ? input : String(input ?? '').trim().split(/\s+/).filter(Boolean);
  return tokens.map(normalizeMove);
}

export function invertMove(input) {
  const move = normalizeMove(input);
  return move.endsWith('2') ? move : move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
}

export const invertSequence = moves => parseSequence(moves).reverse().map(invertMove);

/** Display form: one prime character, U+2032 (docs/design/VOICE.md). */
export const displayMove = input => normalizeMove(input).replace("'", '′');

// --- Orientation -----------------------------------------------------------------------

const DEFAULT_HELD = Object.freeze({ bottom: 'D', front: 'F' });

/** Physical face at each user-frame position: {U, D, F, B, R, L} -> physical face. */
export function heldFaces(held = DEFAULT_HELD) {
  const o = inspectionOrientation(held.bottom ?? 'D', held.front ?? 'F');
  return { U: o.top, D: o.bottom, F: o.front, B: OPPOSITE_FACE[o.front], R: o.right, L: OPPOSITE_FACE[o.right] };
}

function rotateVector(v, ax, deg) {
  const r = deg * Math.PI / 180;
  const c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r));   // multiples of 90 degrees only
  const [x, y, z] = v;
  const out = ax === 0 ? [x, y * c - z * s, y * s + z * c] : ax === 1 ? [x * c + z * s, y, -x * s + z * c] : [x * c - y * s, x * s + y * c, z];
  return out.map(n => n || 0);
}

/** The held orientation after a move: only rotations (x y z) change it. */
export function heldAfter(held = DEFAULT_HELD, input) {
  const move = parseMove(input);
  const before = { bottom: held.bottom ?? 'D', front: held.front ?? 'F' };
  if (move.kind !== 'rot') return before;
  const phys = heldFaces(before);
  const next = {};
  for (const [letter, vector] of Object.entries(FACE_VECTOR)) next[letterOfVector(rotateVector(vector, move.ax, move.angle))] = phys[letter];
  return { bottom: next.D, front: next.F };
}

/** For a sequence written from one starting hold: the hold each move is written in. */
export function expandToHeld(moves, startHeld = DEFAULT_HELD) {
  let held = { bottom: startHeld.bottom ?? 'D', front: startHeld.front ?? 'F' };
  return parseSequence(moves).map(move => {
    const out = { move, held };
    held = heldAfter(held, move);
    return out;
  });
}

/**
 * The turn in the physical (colour) frame of the cube: which axis, which layers,
 * and how far (degrees, right-handed about the axis). The 3D cube turns its
 * layers in this frame, whatever way up it is held.
 */
export function toPhysicalTurn(input, held = DEFAULT_HELD) {
  const move = parseMove(input);
  const phys = heldFaces(held);
  const axisFace = ['R', 'U', 'F'][move.ax];
  const axis = [...PHYSICAL_NORMAL[phys[axisFace]]];
  const face = move.kind === 'face' || move.kind === 'wide' ? phys[move.letter] : null;
  return { move: move.str, kind: move.kind, axis, layers: [...move.layers], angle: move.angle, face };
}

// --- Descriptions ----------------------------------------------------------------------

const FACE_WORD = { U: 'top', D: 'bottom', R: 'right', L: 'left', F: 'front', B: 'back' };
const SLICE_REFERENCE = { M: 'L', E: 'D', S: 'F' };
const SLICE_AXIS_WORD = { M: 'left-to-right', E: 'top-to-bottom', S: 'front-to-back' };
const ROT_REFERENCE = { x: 'R', y: 'U', z: 'F' };

/**
 * An accessible sentence plus the pieces a glyph needs, relative to how the cube is held.
 * Face and wide text matches the long-standing describeTurn wording.
 */
export function describeMove(input, held = DEFAULT_HELD) {
  const move = parseMove(input);
  const phys = heldFaces(held);
  const colorOf = letter => FACE_COLORS[phys[letter]];
  const amount = move.double ? '180°' : move.prime ? 'counterclockwise' : 'clockwise';
  const symbol = move.double ? '½' : move.prime ? '↺' : '↻';
  const caption = move.kind === 'rot' ? 'rotate cube' : move.kind === 'wide' ? 'two layers' : move.kind === 'slice' ? 'middle layer'
    : move.double ? 'half turn' : move.prime ? 'counter-cw' : 'clockwise';
  let text, reference, physicalFace = null;
  if (move.kind === 'face' || move.kind === 'wide') {
    reference = move.letter; physicalFace = phys[move.letter];
    text = `Turn the ${FACE_WORD[move.letter]} ${move.kind === 'wide' ? 'two layers' : 'face'} (${colorOf(move.letter)} center) ${amount} (looking directly at that face).`;
  } else if (move.kind === 'slice') {
    reference = SLICE_REFERENCE[move.letter];
    const way = move.double ? '180°' : `${move.prime ? 'the opposite way to' : 'the same way as'} the ${FACE_WORD[reference]} face (${colorOf(reference)} center)`;
    text = `Turn only the middle layer (${SLICE_AXIS_WORD[move.letter]}) ${way}.`;
  } else {
    reference = ROT_REFERENCE[move.letter];
    const way = move.double ? '180°' : `${move.prime ? 'the opposite way to' : 'the same way as'} the ${FACE_WORD[reference]} face`;
    text = `Rotate the whole cube ${way}. No layer moves against another.`;
  }
  return {
    notation: move.str, display: displayMove(move.str), kind: move.kind, symbol, caption, text,
    reference, physicalFace, color: colorOf(reference), layers: [...move.layers], angle: move.angle,
  };
}
