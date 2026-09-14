import {
  FACE_COLORS,
  applyMoves,
  createSolvedState,
  toRenderData,
} from './cross-cube.js';

/**
 * Full PLL recognition data.
 *
 * The algorithms use standard CFOP notation. They are
 * intentionally stored as solve algorithms: a practice case is made by
 * applying their inverse to a solved cube.  The variants below were
 * cross-checked against the standard PLL references from CubeSkills and
 * CubingApp. H and Z retain their standard M-slice notation; that notation is
 * implemented locally below without changing Cross Scout's public parser.
 */
const CASE_DATA = [
  { name: 'Aa', family: 'A', category: 'adjacent corners', cue: 'One adjacent pair of headlights; the corners swap around the other side.', algorithm: "R' D' R U2 R' D R U' R' D' R U' R' D R" },
  { name: 'Ab', family: 'A', category: 'adjacent corners', cue: 'One adjacent pair of headlights; the opposite A-perm direction.', algorithm: "R' D' R U R' D R U R' D' R U2 R' D R" },
  { name: 'E', family: 'E', category: 'diagonal corners', cue: 'No solved corner pair: the two diagonal corner pairs are exchanged.', algorithm: "R' U' R' D' R U' R' D R U R' D' R U R' D R2" },
  { name: 'F', family: 'F', category: 'corner and edge swap', cue: 'A corner swap with a single adjacent edge swap; look for the F-perm headlights.', algorithm: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R" },
  { name: 'Ga', family: 'G', category: 'double cycle', cue: 'A diagonal corner cycle with an adjacent edge cycle; use the Ga anchor.', algorithm: "R2 U R' U R' U' R U' R2 D U' R' U R D'" },
  { name: 'Gb', family: 'G', category: 'double cycle', cue: 'A diagonal corner cycle with an adjacent edge cycle; mirror direction of Ga.', algorithm: "R' U' R U D' R2 U R' U R U' R U' R2 D" },
  { name: 'Gc', family: 'G', category: 'double cycle', cue: 'A diagonal corner cycle with an adjacent edge cycle; use the Gc bar pattern.', algorithm: "R2 U' R U' R U R' U R2 D' U R U' R' D" },
  { name: 'Gd', family: 'G', category: 'double cycle', cue: 'A diagonal corner cycle with an adjacent edge cycle; mirror direction of Gc.', algorithm: "R U R' U' D R2 U' R U' R' U R' U R2 D'" },
  { name: 'H', family: 'H', category: 'opposite edges', cue: 'Four headlights and no solved side: opposite edge pairs swap.', algorithm: "M2 U' M2 U2 M2 U' M2" },
  { name: 'Ja', family: 'J', category: 'adjacent corners', cue: 'One adjacent pair of headlights and one adjacent corner swap; Ja direction.', algorithm: "L' U' L F L' U' L U L F' L2 U L" },
  { name: 'Jb', family: 'J', category: 'adjacent corners', cue: 'One adjacent pair of headlights and one adjacent corner swap; Jb direction.', algorithm: "R U R' F' R U R' U' R' F R2 U' R' U'" },
  { name: 'Na', family: 'N', category: 'diagonal corners', cue: 'No headlights: diagonal corner swap with the Na edge cycle.', algorithm: "F' R U R' U' R' F R2 F U' R' U' R U F' R'" },
  { name: 'Nb', family: 'N', category: 'diagonal corners', cue: 'No headlights: diagonal corner swap with the Nb edge cycle.', algorithm: "R' U R U' R' F' U' F R U R' F R' F' R U' R" },
  { name: 'Ra', family: 'R', category: 'adjacent corners', cue: 'One adjacent corner swap with the Ra edge cycle.', algorithm: "R U' R' U' R U R D R' U' R D' R' U2 R' U'" },
  { name: 'Rb', family: 'R', category: 'adjacent corners', cue: 'One adjacent corner swap with the Rb edge cycle.', algorithm: "R' U2 R U2 R' F R U R' U' R' F' R2" },
  { name: 'T', family: 'T', category: 'adjacent corners', cue: 'One adjacent corner swap and one adjacent edge swap; the T-perm headlights are prominent.', algorithm: "R U R' U' R' F R2 U' R' U' R U R' F'" },
  { name: 'Ua', family: 'U', category: 'three-edge cycle', cue: 'All corners are solved; three edges cycle clockwise.', algorithm: "R U' R U R U R U' R' U' R2" },
  { name: 'Ub', family: 'U', category: 'three-edge cycle', cue: 'All corners are solved; three edges cycle counter-clockwise.', algorithm: "R' U R' U' R' U' R' U R U R2" },
  { name: 'V', family: 'V', category: 'diagonal corners', cue: 'No headlights: diagonal corner swap with an adjacent edge cycle.', algorithm: "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2" },
  { name: 'Y', family: 'Y', category: 'diagonal corners', cue: 'No headlights: diagonal corner swap with the Y edge cycle.', algorithm: "F R' F R2 U' R' U' R U R' F' R U R' U' F'" },
  { name: 'Z', family: 'Z', category: 'adjacent edges', cue: 'Four headlights with two adjacent edge pairs exchanged.', algorithm: "M2 U' M2 U' M' U2 M2 U2 M' U2" },
];

const TOP_SLOTS = Object.freeze(['UFR', 'UBR', 'UBL', 'UFL', 'UF', 'UR', 'UB', 'UL']);
const TOP_COLORS = new Set([FACE_COLORS.U]);
const NORMAL = Object.freeze({ U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0] });

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const quarter = (vector, normal) => {
  const projection = dot(vector, normal);
  const cross = [
    normal[1] * vector[2] - normal[2] * vector[1],
    normal[2] * vector[0] - normal[0] * vector[2],
    normal[0] * vector[1] - normal[1] * vector[0],
  ];
  return vector.map((_, index) => {
    const value = normal[index] * projection - cross[index];
    return Object.is(value, -0) ? 0 : value;
  });
};
const faceForNormal = new Map(Object.entries(NORMAL).map(([face, normal]) => [normal.join(','), face]));

/** Apply the standard M slice locally, without broadening Cross Scout's parser. */
function applyMiddleSlice(state, move) {
  const normal = NORMAL.L; // M turns in the same direction as L.
  const turns = move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1;
  let cubies = state.cubies.map((cubie) => ({ id: cubie.id, position: [...cubie.position], stickers: { ...cubie.stickers } }));
  for (let turn = 0; turn < turns; turn += 1) {
    cubies = cubies.map((cubie) => cubie.position[0] !== 0 ? cubie : {
      id: cubie.id,
      position: quarter(cubie.position, normal),
      stickers: Object.fromEntries(Object.entries(cubie.stickers).map(([face, color]) => [faceForNormal.get(quarter(NORMAL[face], normal).join(',')), color])),
    });
  }
  return { cubies };
}

/** Apply ordinary face turns plus M/M'/M2 notation used by PLL algorithms. */
export function applyPllMoves(state, input = []) {
  const moves = typeof input === 'string' ? input.trim().split(/\s+/).filter(Boolean) : [...input];
  for (const move of moves) {
    if (!/^[URFDLBM](?:2|')?$/.test(move)) throw new Error(`Unsupported PLL move “${move}”.`);
  }
  return moves.reduce((current, move) => move[0] === 'M' ? applyMiddleSlice(current, move) : applyMoves(current, [move]), state);
}

const freezeCase = (entry) => Object.freeze({
  ...entry,
  moves: Object.freeze(entry.algorithm.split(' ')),
});

export const PLL_CASES = Object.freeze(CASE_DATA.map(freezeCase));
export const PLL_CASE_NAMES = Object.freeze(PLL_CASES.map(({ name }) => name));
export const PLL_ANSWER_CHOICES = Object.freeze(PLL_CASES.map(({ name, family, category }) => Object.freeze({ name, family, category })));

const CASE_BY_NAME = new Map(PLL_CASES.map((entry) => [entry.name, entry]));

function invertMove(move) {
  if (move.endsWith('2')) return move;
  return move.endsWith("'") ? move[0] : `${move}'`;
}

export function invertMoves(moves) {
  const values = typeof moves === 'string' ? moves.trim().split(/\s+/).filter(Boolean) : [...moves];
  return values.reverse().map(invertMove);
}

function positionName(position) {
  const [x, y, z] = position;
  return `${y === 1 ? 'U' : y === -1 ? 'D' : ''}${z === 1 ? 'F' : z === -1 ? 'B' : ''}${x === 1 ? 'R' : x === -1 ? 'L' : ''}`;
}

function cubieAt(state, slot) {
  return state.cubies.find((cubie) => positionName(cubie.position) === slot);
}

function topSignature(state) {
  return TOP_SLOTS.map((slot) => {
    const cubie = cubieAt(state, slot);
    if (!cubie) return `${slot}:missing`;
    const stickers = Object.entries(cubie.stickers).sort(([a], [b]) => a.localeCompare(b));
    return `${slot}:${cubie.id}:${stickers.map(([face, color]) => `${face}=${color}`).join(',')}`;
  }).join('|');
}

/**
 * The AUF is only a change in where the already-oriented top layer is held.
 * Canonicalizing the four possible U positions lets recognition answer the
 * same case regardless of the random AUF shown to the learner.
 */
export function canonicalPllSignature(state) {
  let current = state;
  const signatures = [];
  for (let turns = 0; turns < 4; turns += 1) {
    signatures.push(topSignature(current));
    current = applyMoves(current, ['U']);
  }
  return signatures.sort()[0];
}

function isSolvedCubie(cubie, solvedById) {
  const solved = solvedById.get(cubie.id);
  return Boolean(solved)
    && JSON.stringify(cubie.position) === JSON.stringify(solved.position)
    && JSON.stringify(cubie.stickers) === JSON.stringify(solved.stickers);
}

/** Return true only for a physically valid, OLL-complete PLL-shaped state. */
export function isPllState(state) {
  if (!state || !Array.isArray(state.cubies)) return false;
  const solvedById = new Map(createSolvedState().cubies.map((cubie) => [cubie.id, cubie]));
  const lowerLayerSolved = state.cubies
    .filter((cubie) => cubie.id.length > 1 && !cubie.id.includes('U'))
    .every((cubie) => isSolvedCubie(cubie, solvedById));
  if (!lowerLayerSolved) return false;

  const topCubies = state.cubies.filter((cubie) => cubie.position[1] === 1 && cubie.id.length > 1);
  return topCubies.length === 8 && topCubies.every((cubie) => TOP_COLORS.has(cubie.stickers.U));
}

let signatureIndex;
function getSignatureIndex() {
  if (!signatureIndex) {
    signatureIndex = new Map();
    for (const entry of PLL_CASES) {
      const state = applyPllMoves(createSolvedState(), invertMoves(entry.moves));
      const key = canonicalPllSignature(state);
      if (signatureIndex.has(key)) throw new Error(`Duplicate PLL signature for ${entry.name}.`);
      signatureIndex.set(key, entry);
    }
  }
  return signatureIndex;
}

/** Identify a case, ignoring the U-face adjustment; returns null if invalid. */
export function identifyPllCase(state) {
  if (!isPllState(state)) return null;
  return getSignatureIndex().get(canonicalPllSignature(state)) ?? null;
}

function randomAuf() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return ['', 'U', 'U2', "U'"][values[0] % 4];
}

function normalizeAuf(auf) {
  if (auf === undefined || auf === 'random') return randomAuf();
  if (auf === null || auf === '') return '';
  if (auf === 0) return '';
  if (auf === 1 || auf === 'U') return 'U';
  if (auf === 2 || auf === 'U2') return 'U2';
  if (auf === 3 || auf === "U'") return "U'";
  throw new Error('AUF must be one of \'\', U, U2, U\', or random.');
}

function resolveCase(caseOrName) {
  if (typeof caseOrName === 'string') {
    const entry = CASE_BY_NAME.get(caseOrName);
    if (!entry) throw new Error(`Unknown PLL case “${caseOrName}”.`);
    return entry;
  }
  if (caseOrName && CASE_BY_NAME.has(caseOrName.name)) return CASE_BY_NAME.get(caseOrName.name);
  throw new TypeError('Choose a PLL case name or metadata object.');
}

/**
 * Create one recognition prompt.  `auf` is randomized by default; pass an
 * explicit U/U2/U' (or an empty string) for deterministic tests and sessions.
 */
export function generatePllCase(caseOrName, { auf = undefined } = {}) {
  const entry = resolveCase(caseOrName);
  const setup = invertMoves(entry.moves);
  const baseState = applyPllMoves(createSolvedState(), setup);
  const appliedAuf = normalizeAuf(auf);
  const state = appliedAuf ? applyMoves(baseState, [appliedAuf]) : baseState;
  return {
    case: entry,
    caseId: entry.name,
    name: entry.name,
    family: entry.family,
    category: entry.category,
    cue: entry.cue,
    algorithm: entry.algorithm,
    setup,
    auf: appliedAuf,
    state,
    renderData: toRenderData(state),
    answerChoices: PLL_ANSWER_CHOICES,
  };
}

/** UI-facing name for a deterministic or random recognition prompt. */
export function createPLLTrial({ caseId = 'random', auf = undefined } = {}) {
  return caseId === 'random'
    ? generateRandomPllCase({ auf })
    : generatePllCase(caseId, { auf });
}

export function generateRandomPllCase(options = {}) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return generatePllCase(PLL_CASES[values[0] % PLL_CASES.length], options);
}
