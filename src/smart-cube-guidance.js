import { FACE_COLORS, inspectionOrientation, movesForInspection, sameCubeState } from './cross-cube.js';

const FACE_POSITION = { U: 'top', D: 'bottom', R: 'right', L: 'left', F: 'front', B: 'back' };
const OPPOSITE = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' };

export function inverseMove(move) {
  return move.endsWith('2') ? move : move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
}

export function recoveryMoves(detour, bottom='D', front='F') {
  return movesForInspection(detour.slice().reverse().map(inverseMove), bottom, front);
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
export function followPlanTurn(states, step, detour, state, move) {
  const matches = states.map((candidate, index) => sameCubeState(candidate, state) ? index : -1).filter(index => index >= 0);
  const matched = matches.includes(step + 1) ? step + 1 : matches.includes(step - 1) ? step - 1 : matches[0];
  return matched !== undefined
    ? { step: matched, detour: [], onPlan: true }
    : { step, detour: move ? [...detour, move] : detour, onPlan: false };
}
