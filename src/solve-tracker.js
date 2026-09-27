// Pure solve-phase analysis over the geometric cube model in cross-cube.js.
// These functions take a canonical cube state (and, where relevant, the
// canonical face the solver chose as the cross) and report which solve phase
// the cube is in. They hold no device or live-session state, so trainers and
// tests can reuse them without a connected cube.
//
// Assumption: the state comes from outer-face turns only (the only moves the
// GAN decoder emits during a live solve). Centers therefore stay in place, so
// FACE_COLORS is a valid reference for "the color a slot should show". Wide
// moves only appear in simulation and are out of scope for live phase tracking.

import { FACE_COLORS, OPPOSITE_FACE, CORNERS, EDGES, createSolvedState, sameCubeState, canonicalizeForRecognition } from './cross-cube.js';

export { canonicalizeForRecognition };

const cubieAt = (state, id) => state.cubies.find(cubie => cubie.id === id);

// A cubie is solved (in its home slot and oriented) iff every sticker it shows
// matches the center color of the face it is on. Because each slot has a unique
// color triple, this also implies the cubie is in the right slot.
const cubieSolved = cubie => Object.entries(cubie.stickers).every(([face, color]) => FACE_COLORS[face] === color);

// The four cross edges for a cross face (e.g. D -> DF, DR, DB, DL).
export function crossEdgeIds(crossFace) {
  return EDGES.filter(id => id.includes(crossFace));
}

export function crossSolved(state, crossFace) {
  return crossEdgeIds(crossFace).every(id => cubieSolved(cubieAt(state, id)));
}

// Every face whose four cross edges are solved — color-neutral detection.
export function crossSolvedFaces(state) {
  return Object.keys(FACE_COLORS).filter(face => crossSolved(state, face));
}

// The four F2L pairs for a cross face: each corner containing the cross face,
// paired with the middle edge of its two side faces.
export function f2lPairSlots(crossFace) {
  return CORNERS
    .filter(id => id.includes(crossFace))
    .map(cornerId => {
      const sides = [...cornerId].filter(face => face !== crossFace);
      const edgeId = EDGES.find(id => sides.every(face => id.includes(face)));
      return { cornerId, edgeId, slot: edgeId };
    });
}

export function pairSolved(state, pair) {
  return cubieSolved(cubieAt(state, pair.cornerId)) && cubieSolved(cubieAt(state, pair.edgeId));
}

export function solvedPairs(state, crossFace) {
  return f2lPairSlots(crossFace).filter(pair => pairSolved(state, pair));
}

// Last-layer face opposite the chosen cross.
export const llFace = crossFace => OPPOSITE_FACE[crossFace];

// Bring a colour-neutral solve into the canonical white-cross / yellow-LL view
// that the PLL and OLL recognisers (defined relative to a white U layer) expect.
// reorientState puts the chosen cross face on D; then we recolour every sticker
// according to where the centres now sit, so the cube reads as a standard
// solved-frame scramble with the same piece permutation. This makes PLL/OLL
// recognition colour-neutral instead of white-cross-only.
// (Implementation lives in cross-cube.js, where the geometry lives; here we
// just re-export it.)

// OLL is done when every sticker on the last-layer face matches that face's
// center color (the LL is oriented, though not yet permuted).
export function ollSolved(state, crossFace) {
  const ll = llFace(crossFace);
  const llColor = FACE_COLORS[ll];
  return state.cubies.every(cubie => cubie.stickers[ll] === undefined || cubie.stickers[ll] === llColor);
}

// A connected (but not necessarily solved) F2L pair: the corner and edge are
// adjacent and their touching stickers agree. Reused by the keyhole lens and
// the "a pair was already together" hindsight.
export function pairConnected(state, pair) {
  const corner = cubieAt(state, pair.cornerId);
  const edge = cubieAt(state, pair.edgeId);
  if (!corner || !edge) return false;
  // Adjacent iff they differ in exactly one axis and that difference is 1.
  const diff = corner.position.map((v, i) => Math.abs(v - edge.position[i]));
  const ones = diff.filter(v => v === 1).length;
  const zeros = diff.filter(v => v === 0).length;
  if (ones !== 1 || zeros !== 2) return false;
  // The shared axes' stickers must agree where both pieces show the same face.
  for (const [face, color] of Object.entries(edge.stickers)) {
    if (corner.stickers[face] !== undefined && corner.stickers[face] !== color) return false;
  }
  return true;
}

// How ready an unsolved F2L pair is to insert, without a search. The cheapest
// signal the F2L lens surfaces before (and alongside) a solver-based ranking:
// a connected pair is one insertion away; a pair with a piece already solved
// in its slot is a keyhole candidate. Used by the coach lenses and by tests.
export function pairReadiness(state, pair) {
  const corner = cubieAt(state, pair.cornerId);
  const edge = cubieAt(state, pair.edgeId);
  const cornerSolved = corner && cubieSolved(corner);
  const edgeSolved = edge && cubieSolved(edge);
  const connected = pairConnected(state, pair);
  return { cornerSolved, edgeSolved, connected, ready: connected };
}

// Full phase snapshot for a state and chosen cross face. `phase` is a label the
// UI can render; the booleans are for lens logic.
export function analyze(state, crossFace) {
  const solved = sameCubeState(state, createSolvedState());
  const slots = f2lPairSlots(crossFace);
  const solvedPairSlots = slots.filter(pair => pairSolved(state, pair));
  const pairsSolved = solvedPairSlots.length;
  const crossDone = crossSolved(state, crossFace);
  const f2lDone = crossDone && pairsSolved === 4;
  const ll = llFace(crossFace);
  const ollDone = f2lDone && ollSolved(state, crossFace);
  let phase;
  if (solved) phase = 'solved';
  else if (ollDone) phase = 'pll';
  else if (f2lDone) phase = 'oll';
  else if (crossDone) phase = pairsSolved > 0 ? `f2l-${pairsSolved}` : 'cross';
  else phase = 'pre-cross';
  return {
    phase,
    crossFace,
    crossDone,
    pairsSolved,
    solvedPairSlots,
    f2lDone,
    ollDone,
    pllDone: solved,
    solved,
    llFace: ll,
  };
}

// Detect an extended cross at the moment the cross first completes: an X-cross
// is a cross completed with one F2L pair already solved; a double X-cross has
// two. Call this with the state at the instant the cross finished.
export function extendedCross(state, crossFace) {
  if (!crossSolved(state, crossFace)) return { kind: 'none', pairs: 0 };
  const pairs = solvedPairs(state, crossFace).length;
  return { kind: pairs >= 2 ? 'xxcross' : pairs === 1 ? 'xcross' : 'cross', pairs };
}
