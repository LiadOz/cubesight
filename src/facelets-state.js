// Facelet strings (Kociemba order URFDLB, 9 stickers per face, each letter the
// face whose colour the sticker has) -> the app's cubie state model from
// cross-cube.js. This is how a cube's own report of its state is compared with
// the state tracked from its move stream.

import { CORNERS, EDGES, FACE_COLORS } from './cross-cube.js';

const FACE_ORDER = 'URFDLB';
const POSITION_OF = {
  U: (row, col) => [col - 1, 1, row - 1],
  R: (row, col) => [1, 1 - row, 1 - col],
  F: (row, col) => [col - 1, 1 - row, 1],
  D: (row, col) => [col - 1, -1, 1 - row],
  L: (row, col) => [-1, 1 - row, col - 1],
  B: (row, col) => [1 - col, 1 - row, -1],
};
const FACE_OF_COLOUR = Object.fromEntries(Object.entries(FACE_COLORS).map(([face, colour]) => [colour, face]));
const pieceKey = letters => [...letters].sort().join('');
const ID_BY_PIECE = new Map([...CORNERS, ...EDGES, ...FACE_ORDER].map(id => [pieceKey(id), id]));

/** Cubie state from a 54-character facelet string; null when it is not a real cube. */
export function stateFromFacelets(facelets) {
  if (typeof facelets !== 'string' || facelets.length !== 54 || /[^URFDLB]/.test(facelets)) return null;
  const at = new Map();   // position -> { position, stickers: { face: colour } }
  for (let f = 0; f < 6; f++) {
    const face = FACE_ORDER[f];
    for (let i = 0; i < 9; i++) {
      const position = POSITION_OF[face](Math.floor(i / 3), i % 3);
      const key = position.join(',');
      if (!at.has(key)) at.set(key, { position, stickers: {} });
      at.get(key).stickers[face] = FACE_COLORS[facelets[f * 9 + i]];
    }
  }
  const cubies = [];
  const seen = new Set();
  for (const { position, stickers } of at.values()) {
    const id = ID_BY_PIECE.get(pieceKey(Object.values(stickers).map(colour => FACE_OF_COLOUR[colour])));
    if (!id || seen.has(id)) return null;
    seen.add(id);
    cubies.push({ id, position, stickers });
  }
  return cubies.length === 26 ? { cubies } : null;
}

/** The facelet string a cube in `state` would report (centres as tracked). */
export function faceletsFromState(state) {
  const at = new Map(state.cubies.map(cubie => [cubie.position.join(','), cubie]));
  let out = '';
  for (let f = 0; f < 6; f++) {
    const face = FACE_ORDER[f];
    for (let i = 0; i < 9; i++) {
      const colour = at.get(POSITION_OF[face](Math.floor(i / 3), i % 3).join(','))?.stickers[face];
      out += FACE_OF_COLOUR[colour] ?? '?';
    }
  }
  return out;
}

/**
 * Do two states agree on every corner and edge? Centres are ignored: a smart
 * cube reports them as fixed, while the tracked model moves them on slice and
 * wide turns.
 */
export function sameCornersAndEdges(a, b) {
  if (!a?.cubies || !b?.cubies) return false;
  const pieces = state => state.cubies.filter(cubie => cubie.id.length > 1);
  const byId = new Map(pieces(b).map(cubie => [cubie.id, cubie]));
  const left = pieces(a);
  return left.length === byId.size && left.every(cubie => {
    const other = byId.get(cubie.id);
    return other && cubie.position.every((value, index) => value === other.position[index])
      && Object.entries(cubie.stickers).every(([face, colour]) => other.stickers[face] === colour);
  });
}
