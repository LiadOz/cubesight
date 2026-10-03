import { planPieceIds } from '../../cross-cube.js';

/** Resolve user-facing cross/pair/slot references to stable cubie ids. */
export function resolveSlotPieces(state, slot) {
  if (!slot) return [];
  if (typeof slot === 'object') {
    if (slot.type === 'cross') return planPieceIds(state, String(slot.face || 'D').toUpperCase());
    if (slot.type === 'pair') return [slot.cornerId, slot.edgeId].filter(id => id && state.cubies.some(cubie => cubie.id === id));
    if (slot.id) return resolveSlotPieces(state, slot.id);
  }
  const label = String(slot).toUpperCase().replace(/^PAIR[:/\s-]*/, '').replace(/[^A-Z]/g, '');
  if (label === 'CROSS' || label === 'CROSSD') return planPieceIds(state, 'D');
  if (label === 'CROSSU') return planPieceIds(state, 'U');
  if (/^[UDFBRL]{2}$/.test(label)) {
    const faces = new Set(label);
    return state.cubies.filter(cubie => cubie.id.length > 1 && [...faces].every(face => cubie.id.includes(face))).map(cubie => cubie.id);
  }
  if (/^[UDFBRL]{3}$/.test(label)) return state.cubies.filter(cubie => cubie.id.length === 3 && [...label].every(face => cubie.id.includes(face))).map(cubie => cubie.id);
  return state.cubies.filter(cubie => cubie.id.length > 1 && [...cubie.id].sort().join('') === [...label].sort().join('')).map(cubie => cubie.id);
}
