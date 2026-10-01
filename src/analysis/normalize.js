// Input normalisation for solve analysis: parse move lists, relabel a solve so
// its cross sits on D, and infer the cross face. Pure; no DOM, no storage.
//
// Relabelling is a whole-cube rotation: every move on face f becomes a move on
// the face that f lands on once the cross face is turned to the bottom. With
// fixed centres the relabelled scramble + moves replayed from a solved cube is
// the same cube, seen from a different side, so "D" helpers work for any cross.

import { applyMoves } from '../cross-cube.js';
import { currentDShift, solvedPairsPseudo } from '../solve-tracker.js';
import { analysisStateFromScramble } from './long-replay.js';

export const FACES = ['D', 'U', 'F', 'B', 'R', 'L'];

// Where each physical face ends up when `crossFace` is rotated onto D.
// D: none. U: x2. F: x'. B: x. R: z. L: z'.
export const FACE_TO_D = Object.freeze({
  D: { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' },
  U: { U: 'D', D: 'U', F: 'B', B: 'F', R: 'R', L: 'L' },
  F: { F: 'D', D: 'B', B: 'U', U: 'F', R: 'R', L: 'L' },
  B: { B: 'D', D: 'F', F: 'U', U: 'B', R: 'R', L: 'L' },
  R: { R: 'D', D: 'L', L: 'U', U: 'R', F: 'F', B: 'B' },
  L: { L: 'D', D: 'R', R: 'U', U: 'L', F: 'F', B: 'B' },
});

const invert = map => Object.fromEntries(Object.entries(map).map(([from, to]) => [to, from]));

const OUTER_MOVE = /^[URFDLB](?:2|')?$/;

// Accepts 'R U R\'' or ['R','U',"R'"]; outer-face turns only.
export function toMoveList(input = []) {
  const list = typeof input === 'string' ? input.trim().replace(/[′’]/g, "'").split(/\s+/).filter(Boolean) : [...input];
  for (const move of list) {
    if (typeof move !== 'string' || !OUTER_MOVE.test(move)) {
      throw new Error(/* copy-ok: validation detail is caught by UI and not rendered as copy */ `Solve analysis needs outer-face turns (U D R L F B), got “${String(move).slice(0, 20)}”.`);
    }
  }
  return list;
}

export function relabelMoves(moves, crossFace) {
  const map = FACE_TO_D[crossFace];
  if (!map) throw new Error(`Unknown cross face “${crossFace}”.`);
  return moves.map(move => `${map[move[0]]}${move.slice(1)}`);
}

// Undo relabelMoves (normalised frame back to the solve's own frame).
export function unrelabelMoves(moves, crossFace) {
  const map = invert(FACE_TO_D[crossFace]);
  return moves.map(move => `${map[move[0]]}${move.slice(1)}`);
}

// Orientation input: a face letter, `{ bottom }`, or a sparse list of
// `[i, bottom, front]` samples ("from move i on"). Returns bottom-at(position).
function orientationReader(orient) {
  if (!orient) return null;
  if (typeof orient === 'string') return () => orient;
  if (!Array.isArray(orient)) return orient.bottom ? () => orient.bottom : null;
  const samples = orient.filter(s => Array.isArray(s) && FACES.includes(s[1])).sort((a, b) => a[0] - b[0]);
  if (!samples.length) return null;
  // Position p (p moves played) was reached by move p-1, held as sample <= p-1.
  return position => {
    const at = Math.max(0, position - 1);
    let bottom = samples[0][1];
    for (const sample of samples) if (sample[0] <= at) bottom = sample[1]; else break;
    return bottom;
  };
}

// Decide the cross face of a solve. Returns
// { face, source: 'orient'|'inferred'|'default', index, shift }.
// index = position (0 = before any move) where that cross first completed in
// any frame, or null when it never did. With a gyro orientation the held bottom
// at each position decides the face; otherwise the first face whose cross
// completes (ties: more pairs in place, then D U F B R L) wins.
export function inferCrossFace({ scramble, moves, orient }) {
  const reader = orientationReader(orient);
  let state = analysisStateFromScramble(scramble);
  let previous = new Set();
  for (let position = 0; position <= moves.length; position++) {
    if (position > 0) state = applyMoves(state, [moves[position - 1]]);
    const solvedNow = [];
    for (const face of reader ? [reader(position)] : FACES) {
      const shift = currentDShift(state, face);
      if (shift !== null) solvedNow.push({ face, shift, pairs: solvedPairsPseudo(state, face).length });
    }
    const fresh = solvedNow.filter(entry => !previous.has(entry.face));
    previous = new Set(solvedNow.map(entry => entry.face));
    if (fresh.length) {
      fresh.sort((a, b) => b.pairs - a.pairs || FACES.indexOf(a.face) - FACES.indexOf(b.face));
      return { face: fresh[0].face, source: reader ? 'orient' : 'inferred', index: position, shift: fresh[0].shift };
    }
  }
  return { face: reader ? reader(0) : 'D', source: reader ? 'orient' : 'default', index: null, shift: null };
}
