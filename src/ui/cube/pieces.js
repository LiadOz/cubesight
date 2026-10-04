// Which pieces matter at each moment: the one place that knows what "the cross", "an F2L pair" and
// "the last layer" are as sets of pieces. Cube.highlightStage() and every screen that emphasises
// pieces (algs, drills, review moments, replay, pins) go through here instead of deriving their own.
// Piece ids are the solved-position names (corner 'DFR', edge 'FR'); the cube maps them to wherever
// the piece currently sits, and `positions` adds the cubicles (slots) themselves.
import { CORNERS, EDGES, OPPOSITE_FACE, planPieceIds } from '../../cross-cube.js';

const FACE_RE = /^[UDFBRL]$/;
export const normalizeFace = face => (FACE_RE.test(String(face).toUpperCase()) ? String(face).toUpperCase() : 'D');

/** The four edges that make the cross on `face`. */
export const crossPieces = (state, face = 'D') => planPieceIds(state, normalizeFace(face)).filter(id => id.length === 2);

/** Corner + edge of the F2L pair that belongs in `slot` ('FR', 'pair:FR', 'RF'), cross on `crossFace`. */
export function f2lPairIds(slot, crossFace = 'D') {
  const face = normalizeFace(crossFace);
  const sides = [...String(slot || '').toUpperCase().replace(/^PAIR[:/\s-]*/, '').replace(/[^UDFBRL]/g, '')].filter(side => side !== face);
  if (sides.length !== 2 || sides[0] === sides[1]) return { corner: null, edge: null };
  const has = (id, faces) => faces.every(f => id.includes(f)) && id.length === faces.length;
  return {
    corner: CORNERS.find(id => has(id, [face, ...sides])) ?? null,
    edge: EDGES.find(id => has(id, sides)) ?? null,
  };
}

/** The eight last-layer pieces (opposite the cross face): four edges and four corners. */
export const lastLayerPieces = (state, crossFace = 'D') => {
  const face = OPPOSITE_FACE[normalizeFace(crossFace)];
  return state.cubies.filter(cubie => cubie.id.length > 1 && cubie.id.includes(face)).map(cubie => cubie.id);
};

const LAST_LAYER_STAGES = new Set(['oll', 'eo', 'co', 'cp', 'ep', 'pll', 'll', 'last layer', 'lastlayer']);

/**
 * What to emphasise for a stage of a solve or a drill. Returns { pieces, positions, dimOthers: true }
 * or null when the stage names nothing (so callers never dim a cube for no reason).
 * @param {object} state  a cross-cube state
 * @param {string} stage  'cross' | 'xcross' | 'pair' | 'pair1'..'pair4' | 'f2l' | 'oll'/'eo'/'co'/'cp'/'ep'/'pll'/'ll'
 * @param {{crossFace?:string, slot?:string|null, slots?:string[]}} [options]  slot(s) for pair / xcross stages
 */
export function stagePieces(state, stage, { crossFace = 'D', slot = null, slots = [] } = {}) {
  const key = String(stage || '').toLowerCase().replace(/\s+/g, ' ');
  const face = normalizeFace(crossFace);
  const pairSlots = [...(slot ? [slot] : []), ...slots].filter(Boolean);
  const pairs = pairSlots.map(item => f2lPairIds(item, face)).filter(pair => pair.corner && pair.edge);
  const pairIds = pairs.flatMap(pair => [pair.corner, pair.edge]);
  let pieces = [];
  if (key === 'cross') pieces = crossPieces(state, face);
  else if (key === 'xcross' || key === 'xxcross') pieces = [...crossPieces(state, face), ...pairIds];
  else if (/^pair\d?$/.test(key) || key === 'f2l') pieces = pairIds;
  else if (LAST_LAYER_STAGES.has(key)) pieces = lastLayerPieces(state, face);
  if (!pieces.length) return null;
  return { pieces: [...new Set(pieces)], positions: pairs.flatMap(pair => [pair.corner, pair.edge]), dimOthers: true };
}
