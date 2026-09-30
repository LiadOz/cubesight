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

import { FACE_COLORS, OPPOSITE_FACE, CORNERS, EDGES, createSolvedState, sameCubeState, canonicalizeForRecognition, applyMoves } from './cross-cube.js';

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

// How ready an unsolved F2L pair is to insert, without a search. The cheapest
export function solvedPairs(state, crossFace) {
  return f2lPairSlots(crossFace).filter(pair => pairSolved(state, pair));
}

// --- Pseudo-F2L (D-shift) support ------------------------------------------
// A pseudo-F2L user solves pairs into slots that are only correct after a
// whole-D-layer rotation, then restores D at the end. To count those pairs we
// first find the D-offset (0..3) that brings the cross edges home — that is
// the frame the user is currently solving in — then count pairs solved under
// that same offset. Returns the empty list while the cross is not solved
// under any offset (still building). Standard users (k = 0) get the plain
// count; the toggle just widens the window to k = 1..3.
//
// The offset turn for shift k is a turn of the cross face itself (D for a D
// cross, U for a U cross, ...), so pseudo detection works for every cross face.
const OFFSET_SUFFIX = ['', '', '2', "'"];
const FACE_NORMAL_AXIS = { U: [1, 1], D: [1, -1], F: [2, 1], B: [2, -1], R: [0, 1], L: [0, -1] };
const dShift = (state, k, crossFace = 'D') => (k ? applyMoves(state, [`${crossFace}${OFFSET_SUFFIX[k]}`]) : state);
// Turning the cross layer keeps its pieces in that layer, so a cross that is
// solved in any frame has all four cross edges in the cross layer. A cheap
// necessary test that avoids three cube turns for most mid-solve positions.
const crossEdgesInLayer = (state, crossFace) => {
  const [axis, sign] = FACE_NORMAL_AXIS[crossFace];
  return crossEdgeIds(crossFace).every(id => cubieAt(state, id).position[axis] === sign);
};
export function currentDShift(state, crossFace = 'D') {
  if (!crossEdgesInLayer(state, crossFace)) return null;
  for (let k = 0; k < 4; k++) if (crossSolved(dShift(state, k, crossFace), crossFace)) return k;
  return null;
}
export function solvedPairsPseudo(state, crossFace = 'D') {
  const k = currentDShift(state, crossFace);
  if (k == null) return [];
  return f2lPairSlots(crossFace).filter(pair => pairSolved(dShift(state, k, crossFace), pair));
}
// One-pass frame read: the cross-face offset k (or null) and the pairs solved in
// that frame, without recomputing the shift.
export function crossFrame(state, crossFace = 'D') {
  const shift = currentDShift(state, crossFace);
  if (shift === null) return { shift: null, pairs: [] };
  return { shift, pairs: f2lPairSlots(crossFace).filter(pair => pairSolved(dShift(state, shift, crossFace), pair)) };
}
export function f2lDonePseudo(state, crossFace) {
  return solvedPairsPseudo(state, crossFace).length === 4;
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

// OLL is two looks: orient the edges (EO), then orient the corners (CO). A beginner
// 2-look does edges-then-corners; the other 2-look does corners-then-edges.
export function ollSolved(state, crossFace) {
  return eoSolved(state, crossFace) && coSolved(state, crossFace);
}
// Edges oriented: the four last-layer EDGES all show the LL colour on the LL face.
export function eoSolved(state, crossFace) {
  const ll = llFace(crossFace);
  const llColor = FACE_COLORS[ll];
  const edges = state.cubies.filter(c => c.id.length === 2 && c.stickers[ll] !== undefined);
  return edges.length === 4 && edges.every(e => e.stickers[ll] === llColor);
}
// Corners oriented: the four last-layer CORNERS all show the LL colour on the LL face.
export function coSolved(state, crossFace) {
  const ll = llFace(crossFace);
  const llColor = FACE_COLORS[ll];
  const corners = state.cubies.filter(c => c.id.length === 3 && c.stickers[ll] !== undefined);
  return corners.length === 4 && corners.every(c => c.stickers[ll] === llColor);
}

// Corners permuted (2-look PLL, first look done): after some AUF of the last
// layer every last-layer corner sits in its home slot, whatever its
// orientation. After OLL this means only the edges are left to permute.
const HOME = new Map(createSolvedState().cubies.map(c => [c.id, c.position.join(',')]));
export function cpSolved(state, crossFace) {
  const ll = llFace(crossFace);
  const cornersHome = s => s.cubies.every(c => c.id.length !== 3 || !c.id.includes(ll) || c.position.join(',') === HOME.get(c.id));
  return ['', ll, `${ll}2`, `${ll}'`].some(auf => cornersHome(auf ? applyMoves(state, [auf]) : state));
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
//
// `{ pseudo: true }` reads the cross and pairs in the frame the cross face is
// currently offset by (see currentDShift) and reports it as `shift`. The
// last-layer tests never depended on the cross layer, so with pseudo on an
// offset cross layer no longer hides "edges oriented".
export function analyze(state, crossFace, { pseudo = false } = {}) {
  const solved = sameCubeState(state, createSolvedState());
  const shift = pseudo ? currentDShift(state, crossFace) : crossSolved(state, crossFace) ? 0 : null;
  const slots = f2lPairSlots(crossFace);
  const solvedPairSlots = pseudo ? solvedPairsPseudo(state, crossFace) : slots.filter(pair => pairSolved(state, pair));
  const pairsSolved = solvedPairSlots.length;
  const crossDone = pseudo ? shift !== null : crossSolved(state, crossFace);
  const f2lDone = crossDone && pairsSolved === 4;
  const ll = llFace(crossFace);
  const eoSolvedNow = f2lDone && eoSolved(state, crossFace);
  const coSolvedNow = f2lDone && coSolved(state, crossFace);
  const eoDone = eoSolvedNow;
  const coDone = coSolvedNow;
  const ollDone = eoDone && coDone;
  const cpDone = ollDone && cpSolved(state, crossFace);
  let phase;
  if (solved) phase = 'solved';
  else if (eoDone && coDone) phase = 'pll';
  else if (coDone) phase = 'co';
  else if (eoDone) phase = 'co-pending';
  else if (f2lDone && !eoDone) phase = 'eo';
  else if (crossDone) phase = pairsSolved > 0 ? `f2l-${pairsSolved}` : 'cross';
  else phase = 'pre-cross';
  return {
    phase,
    crossFace,
    shift,
    crossDone,
    pairsSolved,
    solvedPairSlots,
    f2lDone,
    eoDone: eoDone,
    coDone: coDone,
    ollDone,
    cpDone,
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

// Extended cross in any frame: a cross completed with the cross face offset
// counts pairs solved in that same frame (a pseudo X-cross). `pseudo` is true
// when that frame is not the plain one.
export function extendedCrossPseudo(state, crossFace) {
  const shift = currentDShift(state, crossFace);
  if (shift === null) return { kind: 'none', pairs: 0, shift: null, pseudo: false };
  const pairs = solvedPairsPseudo(state, crossFace).length;
  return { kind: pairs >= 2 ? 'xxcross' : pairs === 1 ? 'xcross' : 'cross', pairs, shift, pseudo: shift !== 0 };
}
