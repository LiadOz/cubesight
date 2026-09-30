import { FACE_COLORS, OPPOSITE_FACE, inspectionOrientation, parseScramble, sameCubeState } from './cross-cube.js';

const FACE_POSITION = { U: 'top', D: 'bottom', R: 'right', L: 'left', F: 'front', B: 'back' };
const OPPOSITE = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' };

// Inverse of one move in any supported notation: face (R), wide (Rw), slice
// (M, E, S). A double is its own inverse (R2 -> R2, Rw2 -> Rw2).
export function inverseMove(move) {
  return move.endsWith('2') ? move : move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
}

// Slice moves turn in the direction of a reference face (WCA): M follows L,
// E follows D, S follows F.
const SLICE_REFERENCE = { M: 'L', E: 'D', S: 'F' };
const SLICE_FOR_FACE = { L: ['M', false], R: ['M', true], D: ['E', false], U: ['E', true], F: ['S', false], B: ['S', true] };

// Express canonical moves (face, wide or slice) in the notation of the cube as
// it is held (bottom/front). Like movesForInspection in cross-cube.js, but it
// also accepts wide and slice moves, which a detour can contain.
function displayMoves(moves, bottom = 'D', front = 'F') {
  const held = inspectionOrientation(bottom, front);
  const letter = {
    [held.top]: 'U', [held.bottom]: 'D', [held.front]: 'F',
    [OPPOSITE_FACE[held.front]]: 'B', [held.right]: 'R', [OPPOSITE_FACE[held.right]]: 'L',
  };
  return moves.map(move => {
    const suffix = move.endsWith('2') ? '2' : move.endsWith("'") ? "'" : '';
    if (move[0] in SLICE_REFERENCE) {
      const [slice, flipped] = SLICE_FOR_FACE[letter[SLICE_REFERENCE[move[0]]]];
      return flipped && suffix !== '2' ? inverseMove(`${slice}${suffix}`) : `${slice}${suffix}`;
    }
    return `${letter[move[0]]}${move.slice(1)}`;
  });
}

export function recoveryMoves(detour, bottom='D', front='F') {
  const moves = parseScramble(detour.join(' '), { allowWide: true });
  return displayMoves(moves.slice().reverse().map(inverseMove), bottom, front);
}

// Quarter-turn amount of a move (1, 2 or 3) and its layer spec (R, Rw, M...).
const layerOf = move => move.replace(/['2]$/, '');
const amountOf = move => (move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1);

// Append a move to a detour, merging it with the last entry when both turn the
// same layer: F2 then F becomes F', F then F' cancels out. Keeps the recovery
// cue minimal when the user half-follows it (e.g. the first quarter of an F2).
export function appendDetour(detour, move) {
  const last = detour[detour.length - 1];
  if (!last || layerOf(last) !== layerOf(move)) return [...detour, move];
  const total = (amountOf(last) + amountOf(move)) % 4;
  const rest = detour.slice(0, -1);
  if (total === 0) return rest;
  return [...rest, `${layerOf(move)}${total === 2 ? '2' : total === 3 ? "'" : ''}`];
}

export function describeTurn(move, bottom='D', front='F') {
  const position = FACE_POSITION[move?.[0]];
  if (!position) return null;
  const held = inspectionOrientation(bottom, front);
  const physicalFace = { U: held.top, D: held.bottom, F: held.front, B: OPPOSITE[held.front], R: held.right, L: OPPOSITE[held.right] }[move[0]];
  const color = FACE_COLORS[physicalFace];
  const double = move.includes('2');
  const prime = move.includes("'");
  const wide = move[1] === 'w';
  return {
    symbol: double ? '½' : prime ? '↺' : '↻',
    text: `Turn the ${position} ${wide ? 'two layers' : 'face'} (${color} center) ${double ? '180°' : prime ? 'counterclockwise' : 'clockwise'} (looking directly at that face).`,
  };
}

// A wrong move must not discard a selected plan. The exact reverse of the
// detour is always a valid route back to its last matched state; a direct match
// to any plan state resumes immediately, even if the user took another route.
//
// Coalesced doubles: when the session merges a second quarter into the first
// (moveEvent.replaces), the caller must pass the step/detour from BEFORE the
// first quarter, together with the double. Consecutive same-layer turns are
// merged in the detour (see appendDetour), so a slow F F behaves like an F2.
export function followPlanTurn(states, step, detour, state, move) {
  const matches = states.map((candidate, index) => sameCubeState(candidate, state) ? index : -1).filter(index => index >= 0);
  const matched = matches.includes(step + 1) ? step + 1 : matches.includes(step - 1) ? step - 1 : matches[0];
  return matched !== undefined
    ? { step: matched, detour: [], onPlan: true }
    : { step, detour: move ? appendDetour(detour, move) : detour, onPlan: false };
}
