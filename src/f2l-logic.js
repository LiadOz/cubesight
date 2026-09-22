const COLOR_HEX = {
  white: '#ffffff', yellow: '#ffd500', green: '#009b48',
  blue: '#0051ba', red: '#e7332a', orange: '#ff6b00',
};
const VECTORS = {
  white: [0, 1, 0], yellow: [0, -1, 0], green: [0, 0, 1],
  blue: [0, 0, -1], red: [1, 0, 0], orange: [-1, 0, 0],
};
const VECTOR_COLOR = Object.fromEntries(Object.entries(VECTORS).map(([color, value]) => [value.join(','), color]));
const FACES = ['U', 'D', 'F', 'B', 'R', 'L'];
const VISIBLE_FACES = new Set(['U', 'F', 'L', 'R']);
const FACE_COLOR = { U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' };
const COLOR_FACE = Object.fromEntries(Object.entries(FACE_COLOR).map(([face, color]) => [color, face]));

const CORNER_SLOTS = [
  { piece: 'UFR', faces: ['U', 'R', 'F'] }, { piece: 'UBR', faces: ['U', 'B', 'R'] },
  { piece: 'UBL', faces: ['U', 'L', 'B'] }, { piece: 'UFL', faces: ['U', 'F', 'L'] },
  { piece: 'DFR', faces: ['D', 'F', 'R'] }, { piece: 'DFL', faces: ['D', 'L', 'F'] },
  { piece: 'DBL', faces: ['D', 'B', 'L'] }, { piece: 'DBR', faces: ['D', 'R', 'B'] },
];
const EDGE_SLOTS = [
  { piece: 'UF', faces: ['U', 'F'] }, { piece: 'UR', faces: ['U', 'R'] },
  { piece: 'UB', faces: ['U', 'B'] }, { piece: 'UL', faces: ['U', 'L'] },
  { piece: 'FR', faces: ['F', 'R'] }, { piece: 'BR', faces: ['B', 'R'] },
  { piece: 'BL', faces: ['B', 'L'] }, { piece: 'FL', faces: ['F', 'L'] },
  { piece: 'DF', faces: ['D', 'F'] }, { piece: 'DR', faces: ['D', 'R'] },
  { piece: 'DB', faces: ['D', 'B'] }, { piece: 'DL', faces: ['D', 'L'] },
];

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function orientations() {
  const result = [];
  for (const down of Object.keys(COLOR_HEX)) {
    const up = VECTOR_COLOR[VECTORS[down].map((n) => -n).join(',')];
    for (const front of Object.keys(COLOR_HEX)) {
      const dot = VECTORS[up].reduce((sum, n, i) => sum + n * VECTORS[front][i], 0);
      if (dot !== 0) continue;
      const right = VECTOR_COLOR[cross(VECTORS[up], VECTORS[front]).join(',')];
      const back = VECTOR_COLOR[VECTORS[front].map((n) => -n).join(',')];
      const left = VECTOR_COLOR[VECTORS[right].map((n) => -n).join(',')];
      result.push({ U: up, D: down, F: front, B: back, R: right, L: left });
    }
  }
  return result;
}
const ORIENTATIONS = orientations();

export function colorNeutralOrientation(seed) {
  return ORIENTATIONS[(seed >>> 0) % ORIENTATIONS.length];
}

function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function seeded(seed) {
  let value = seed >>> 0 || 0x9e3779b9;
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}
function key(colors) { return [...colors].sort().join('-'); }
function parity(permutation) {
  let inversions = 0;
  for (let i = 0; i < permutation.length; i++) for (let j = i + 1; j < permutation.length; j++) if (permutation[i] > permutation[j]) inversions++;
  return inversions % 2;
}

function classify(identity, bottom, top) {
  if (identity.kind === 'corner' && identity.colors.includes(bottom)) return { type: 'corner', pairId: key(identity.colors.filter((color) => color !== bottom)) };
  if (identity.kind === 'edge' && !identity.colors.includes(bottom) && !identity.colors.includes(top)) return { type: 'edge', pairId: key(identity.colors) };
  return null;
}

/* Return the identities which can legally occupy a position.  A corner is
 * not identified by an unordered colour set: its three stickers must be a
 * cyclic (twist) permutation of the cubie's home ordering. */
function orientedCandidates(record, identities, slots) {
  const slot = slots.find((item) => item.piece === record.piece);
  if (!slot) return [];
  const observed = record.faceColors || {};
  return identities.filter((identity) => {
    if (identity.kind !== record.kind) return false;
    const homeColors = identity.colors;
    if (!homeColors || homeColors.length !== slot.faces.length) return false;
    const shiftCount = record.kind === 'corner' ? slot.faces.length : 2;
    for (let shift = 0; shift < shiftCount; shift++) {
      let valid = true;
      for (let i = 0; i < slot.faces.length; i++) {
        const face = slot.faces[i];
        if (observed[face] != null && observed[face] !== homeColors[(i + shift) % homeColors.length]) {
          valid = false; break;
        }
      }
      if (valid) return true;
    }
    return false;
  });
}

function hasMatching(candidates, pinnedIndex, pinnedKey) {
  const used = new Set();
  if (pinnedIndex >= 0) {
    if (!candidates[pinnedIndex].some((identity) => identity.key === pinnedKey)) return false;
    used.add(pinnedKey);
  }
  const assigned = new Set(pinnedIndex >= 0 ? [pinnedIndex] : []);
  const walk = () => {
    if (assigned.size === candidates.length) return true;
    let best = -1;
    let bestOptions = null;
    for (let i = 0; i < candidates.length; i++) {
      if (assigned.has(i)) continue;
      const options = candidates[i].filter((identity) => !used.has(identity.key));
      if (!options.length) return false;
      if (!bestOptions || options.length < bestOptions.length) { best = i; bestOptions = options; }
    }
    assigned.add(best);
    for (const identity of bestOptions) {
      used.add(identity.key);
      if (walk()) return true;
      used.delete(identity.key);
    }
    assigned.delete(best);
    return false;
  };
  return walk();
}

// An identity is known only when pinning every other candidate fails. This
// checks the exact matching support rather than relying on a truncated list
// of solutions.
export function deduce(records, identities) {
  const known = new Map();
  for (const kind of ['corner', 'edge']) {
    const group = records.filter((record) => record.kind === kind);
    const pool = identities.filter((identity) => identity.kind === kind);
    const candidates = group.map((record) => orientedCandidates(record, pool, kind === 'corner' ? CORNER_SLOTS : EDGE_SLOTS));
    group.forEach((record, index) => {
      const supported = candidates[index].filter((identity) => hasMatching(candidates, index, identity.key));
      if (supported.length === 1) known.set(record.piece, supported[0].key);
    });
  }
  return known;
}

function sameLetters(a, b) {
  return [...a].sort().join('') === [...b].sort().join('');
}

function solvedPair(pairId, pairByPiece, palette, cornerStickers, edgeStickers) {
  const members = Object.entries(pairByPiece).filter(([, item]) => item.pairId === pairId);
  return members.length === 2 && members.every(([piece, item]) => {
    const stickers = item.type === 'corner' ? cornerStickers : edgeStickers;
    return [...piece].every((face) => stickers[`${face}:${piece}`] === palette[face]);
  });
}

function localPosition(position, canonicalToLocal, slots) {
  const translated = [...position].map((face) => canonicalToLocal[face]).join('');
  return slots.find((slot) => sameLetters(slot.piece, translated))?.piece;
}

/** Adapt the legal cubie state emitted by the Rust/WASM core to the local
 * U/D/F/B/R/L view used by the renderer. The selected color is always local
 * D and the adjacent front is randomized from the case seed. */
export function createF2LCaseFromWasm(raw, seed, preference = 'neutral') {
  const random = seeded(seed ^ 0xa341316c);
  const bottomColor = FACE_COLOR[raw.bottom_face];
  const candidates = ORIENTATIONS.filter((orientation) => orientation.D === bottomColor);
  const orientation = candidates[Math.floor(random() * candidates.length)];
  const canonicalToLocal = {};
  FACES.forEach((localFace) => { canonicalToLocal[COLOR_FACE[orientation[localFace]]] = localFace; });
  const palette = Object.fromEntries(FACES.map((face) => [face, COLOR_HEX[orientation[face]]]));
  const cornerStickers = {};
  const edgeStickers = {};
  const records = [];
  const identities = [];

  raw.corners.forEach((cubie) => {
    const piece = localPosition(cubie.position, canonicalToLocal, CORNER_SLOTS);
    const colors = [...cubie.id].map((face) => FACE_COLOR[face]);
    const identity = { kind: 'corner', colors, key: key(colors) };
    identities.push(identity);
    const visibleColors = [];
    const faceColors = {};
    cubie.stickers.forEach((sticker) => {
      const face = canonicalToLocal[sticker.face];
      const color = FACE_COLOR[sticker.color];
      cornerStickers[`${face}:${piece}`] = COLOR_HEX[color];
      if (VISIBLE_FACES.has(face)) faceColors[face] = color;
      if (VISIBLE_FACES.has(face)) visibleColors.push(color);
    });
    records.push({ piece, kind: 'corner', identityKey: identity.key, identity, visibleColors, faceColors });
  });

  raw.edges.forEach((cubie) => {
    const piece = localPosition(cubie.position, canonicalToLocal, EDGE_SLOTS);
    const colors = [...cubie.id].map((face) => FACE_COLOR[face]);
    const identity = { kind: 'edge', colors, key: key(colors) };
    const visibleColors = [];
    const faceColors = {};
    cubie.stickers.forEach((sticker) => {
      const face = canonicalToLocal[sticker.face];
      const color = FACE_COLOR[sticker.color];
      edgeStickers[`${face}:${piece}`] = COLOR_HEX[color];
      if (VISIBLE_FACES.has(face)) faceColors[face] = color;
      if (VISIBLE_FACES.has(face)) visibleColors.push(color);
    });
    // The four local D edges are the solved cross. Only the remaining eight
    // participate in F2L candidate elimination.
    if (!piece.includes('D')) records.push({ piece, kind: 'edge', identityKey: identity.key, identity, visibleColors, faceColors });
    if (!colors.includes(bottomColor)) identities.push(identity);
  });

  const known = deduce(records, identities);
  const pairByPiece = {};
  records.forEach((record) => {
    const metadata = classify(record.identity, bottomColor, orientation.U);
    if (metadata) pairByPiece[record.piece] = metadata;
  });
  const pairIds = [...new Set(Object.values(pairByPiece).map((item) => item.pairId))];
  const targetPairIds = pairIds.filter((pairId) => {
    if (solvedPair(pairId, pairByPiece, palette, cornerStickers, edgeStickers)) return false;
    const members = records.filter((record) => pairByPiece[record.piece]?.pairId === pairId && known.get(record.piece) === record.identityKey);
    return members.some((item) => item.kind === 'corner') && members.some((item) => item.kind === 'edge');
  });
  const pieceByPiece = {};
  records.filter((record) => record.visibleColors.length > 0).forEach((record) => {
    pieceByPiece[record.piece] = { type: record.kind, pairId: pairByPiece[record.piece]?.pairId || null };
  });
  const selectablePieces = records.filter((record) => record.visibleColors.length > 0).map((record) => record.piece);

  return {
    id: raw.id,
    preference,
    bottomColor,
    frontColor: orientation.F,
    orientation,
    palette,
    cornerStickers,
    edgeStickers,
    pairByPiece,
    pieceByPiece,
    targetPairIds,
    selectablePieces,
    source: 'wasm',
  };
}

export function createF2LCase(seed, preference = 'neutral') {
  const random = seeded(seed);
  const wanted = preference === 'neutral'
    ? Object.keys(COLOR_HEX)[Math.floor(random() * 6)]
    : preference;
  const candidates = ORIENTATIONS.filter((orientation) => orientation.D === wanted);
  const orientation = candidates[Math.floor(random() * candidates.length)];
  const palette = Object.fromEntries(FACES.map((face) => [face, COLOR_HEX[orientation[face]]]));

  const cornerIdentities = CORNER_SLOTS.map((slot, index) => ({ index, kind: 'corner', colors: slot.faces.map((face) => orientation[face]) }));
  const cornerPermutation = shuffle([...cornerIdentities.keys()], random);
  const cornerTwists = Array.from({ length: 7 }, () => Math.floor(random() * 3));
  cornerTwists.push((3 - cornerTwists.reduce((sum, twist) => sum + twist, 0) % 3) % 3);

  const freeEdgeSlots = EDGE_SLOTS.slice(0, 8);
  const freeEdgeIdentities = freeEdgeSlots.map((slot, index) => ({ index, kind: 'edge', colors: slot.faces.map((face) => orientation[face]) }));
  let edgePermutation;
  do edgePermutation = shuffle([...freeEdgeIdentities.keys()], random); while (parity(edgePermutation) !== parity(cornerPermutation));
  const edgeFlips = Array.from({ length: 7 }, () => Math.floor(random() * 2));
  edgeFlips.push(edgeFlips.reduce((sum, flip) => sum + flip, 0) % 2);

  const cornerStickers = {};
  const edgeStickers = {};
  const records = [];
  const identities = [];
  cornerIdentities.forEach((identity) => { identity.key = key(identity.colors); identities.push(identity); });
  freeEdgeIdentities.forEach((identity) => { identity.key = key(identity.colors); identities.push(identity); });

  CORNER_SLOTS.forEach((slot, slotIndex) => {
    const identity = cornerIdentities[cornerPermutation[slotIndex]];
    const twist = cornerTwists[slotIndex];
    const byFace = {};
    slot.faces.forEach((face, index) => {
      const color = identity.colors[(index + twist) % 3];
      byFace[face] = color;
      cornerStickers[`${face}:${slot.piece}`] = COLOR_HEX[color];
    });
    records.push({ piece: slot.piece, kind: 'corner', identityKey: identity.key, identity, visibleColors: slot.faces.filter((face) => VISIBLE_FACES.has(face)).map((face) => byFace[face]), faceColors: Object.fromEntries(slot.faces.filter((face) => VISIBLE_FACES.has(face)).map((face) => [face, byFace[face]])) });
  });

  freeEdgeSlots.forEach((slot, slotIndex) => {
    const identity = freeEdgeIdentities[edgePermutation[slotIndex]];
    const colors = edgeFlips[slotIndex] ? [...identity.colors].reverse() : identity.colors;
    const byFace = {};
    slot.faces.forEach((face, index) => {
      byFace[face] = colors[index];
      edgeStickers[`${face}:${slot.piece}`] = COLOR_HEX[colors[index]];
    });
    records.push({ piece: slot.piece, kind: 'edge', identityKey: identity.key, identity, visibleColors: slot.faces.filter((face) => VISIBLE_FACES.has(face)).map((face) => byFace[face]), faceColors: Object.fromEntries(slot.faces.filter((face) => VISIBLE_FACES.has(face)).map((face) => [face, byFace[face]])) });
  });
  EDGE_SLOTS.slice(8).forEach((slot) => slot.faces.forEach((face) => { edgeStickers[`${face}:${slot.piece}`] = palette[face]; }));

  const known = deduce(records, identities);
  const pairByPiece = {};
  records.forEach((record) => {
    const metadata = classify(record.identity, orientation.D, orientation.U);
    if (metadata) pairByPiece[record.piece] = metadata;
  });
  const pairIds = [...new Set(Object.values(pairByPiece).map((item) => item.pairId))];
  const targetPairIds = pairIds.filter((pairId) => {
    if (solvedPair(pairId, pairByPiece, palette, cornerStickers, edgeStickers)) return false;
    const members = records.filter((record) => pairByPiece[record.piece]?.pairId === pairId && known.get(record.piece) === record.identityKey);
    return members.some((item) => item.kind === 'corner') && members.some((item) => item.kind === 'edge');
  });
  const pieceByPiece = {};
  records.filter((record) => record.visibleColors.length > 0).forEach((record) => {
    pieceByPiece[record.piece] = { type: record.kind, pairId: pairByPiece[record.piece]?.pairId || null };
  });
  const selectablePieces = records.filter((record) => record.visibleColors.length > 0).map((record) => record.piece);

  return {
    id: `f2l-${seed}-${orientation.D}-${orientation.F}`,
    preference,
    bottomColor: orientation.D,
    frontColor: orientation.F,
    orientation,
    palette,
    cornerStickers,
    edgeStickers,
    pairByPiece,
    pieceByPiece,
    targetPairIds,
    selectablePieces,
    source: 'js',
  };
}

export { COLOR_HEX };
