import { FACE_COLORS, createSolvedState, reorientState } from '../../cross-cube.js';

const FACES = Object.keys(FACE_COLORS);
const hashSeed = value => [...String(value)].reduce((sum, char) => (sum * 33 + char.charCodeAt(0)) >>> 0, 5381);
const faceForVector = vector => vector[1] === 1 ? 'U' : vector[1] === -1 ? 'D' : vector[2] === 1 ? 'F' : vector[2] === -1 ? 'B' : vector[0] === 1 ? 'R' : 'L';
const oppositeFace = face => ({ U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' })[face];

const SIDE_FACES = ['F', 'R', 'B', 'L'];
const centerColors = state => Object.fromEntries(Object.keys(FACE_COLORS).map(face => {
  const center = state.cubies.find(cubie => cubie.id.length === 1 && faceForVector(cubie.position) === face);
  return [face, center ? Object.values(center.stickers)[0] : undefined];
}));

function colorSchemesForTop(targetColor) {
  const targetFace = Object.keys(FACE_COLORS).find(face => FACE_COLORS[face] === targetColor);
  const base = reorientState(createSolvedState(), oppositeFace(targetFace));
  const baseScheme = centerColors(base);
  return SIDE_FACES.map((_, turn) => {
    const scheme = { U: baseScheme.U, D: baseScheme.D };
    SIDE_FACES.forEach((face, index) => { scheme[SIDE_FACES[(index + turn) % SIDE_FACES.length]] = baseScheme[face]; });
    return scheme;
  }).filter(scheme => scheme.U === targetColor);
}

/** Recolor only the display palette, keeping the case's U-layer positions and orientation intact. */
export function orientCaseState(state, targetColor = 'yellow') {
  const color = Object.keys(FACE_COLORS).find(face => face.toLowerCase() === String(targetColor).toLowerCase())
    || Object.entries(FACE_COLORS).find(([, name]) => name.toLowerCase() === String(targetColor).toLowerCase())?.[0];
  if (!color) throw new Error(`Unknown case color: ${targetColor}`);
  const targetColorName = FACE_COLORS[color];
  const centers = centerColors(state);
  const candidates = colorSchemesForTop(targetColorName);
  if (!candidates.length) throw new Error(`Could not orient ${targetColorName} to the top.`);
  const scheme = candidates.find(candidate => candidate.F === centers.F) || candidates[0];
  const remap = new Map(Object.keys(FACE_COLORS).map(face => [centers[face], scheme[face]]));
  return { cubies: state.cubies.map(cubie => ({
    ...cubie,
    position: [...cubie.position],
    stickers: Object.fromEntries(Object.entries(cubie.stickers).map(([face, stickerColor]) => [face, remap.get(stickerColor) || stickerColor])),
  })) };
}

/** Resolve the F0 case-colour setting into a deterministic top-colour view. */
export function caseDisplayState(state, setting = 'yellow top', seed = '') {
  let colors;
  if (setting === 'white top') colors = ['white'];
  else if (setting === 'yellow or white') colors = ['yellow', 'white'];
  else if (setting === /* copy-ok: exact user-selected option from SPEC-FLEET */ 'any colour') colors = Object.values(FACE_COLORS);
  else if (String(setting).startsWith('fixed:')) colors = [String(setting).slice(6).trim().toLowerCase()];
  else colors = ['yellow'];
  const index = hashSeed(String(seed)) % colors.length;
  return { state: orientCaseState(state, colors[index]), topColor: colors[index], allowedColors: [...colors] };
}

export function normalizeCaseColorSetting(setting) {
  const fixed = /^fixed:\s*(white|yellow|green|blue|red|orange)$/i.exec(String(setting || ''));
  if (fixed) return `fixed: ${fixed[1].toLowerCase()}`;
  return ['yellow top', 'white top', 'yellow or white', /* copy-ok: exact user-selected option from SPEC-FLEET */ 'any colour'].includes(setting) ? setting : 'yellow top';
}

export const CASE_COLORS = Object.freeze(['yellow top', 'white top', 'yellow or white', /* copy-ok: exact user-selected option from SPEC-FLEET */ 'any colour', ...FACES.map(face => `fixed: ${FACE_COLORS[face]}`)]);
