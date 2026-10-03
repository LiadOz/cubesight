import { caseDisplayState, normalizeCaseColorSetting } from '../ui/cube/orientation.js';
import { FACE_COLORS, createSolvedState } from '../cross-cube.js';

const FACE_KEYS = Object.freeze({ white: 'white', yellow: 'yellow', green: 'green', blue: 'blue', red: 'red', orange: 'orange' });
const KEY_NAMES = FACE_KEYS;
const HEX = Object.freeze({ white: '#ffffff', yellow: '#ffd500', green: '#009b48', blue: '#0051ba', red: '#e7332a', orange: '#ff6b00' });

/** Map legacy face-letter answers through the same whole-cube display palette
 * used by Cube, while keeping the trainer's stored answers logical. */
export function createCaseDisplayMap(orientation, setting = 'yellow top', seed = '') {
  const display = caseDisplayState(createSolvedState(), normalizeCaseColorSetting(setting), seed).state;
  const result = {};
  for (const face of Object.keys(FACE_COLORS)) {
    const logicalKey = orientation?.[face];
    const shownName = display.cubies.find(cubie => cubie.id === face)?.stickers?.[face];
    const shownKey = FACE_KEYS[String(shownName).toLowerCase()];
    if (logicalKey && shownKey) result[logicalKey] = shownKey;
  }
  return result;
}

export function displayColorKey(key, map = {}) { return map[key] || key; }
export function logicalColorKey(key, map = {}) { return Object.keys(map).find(logical => map[logical] === key) || key; }
export function colorHex(key) { return HEX[key] || HEX.white; }
export function colorName(key) { return KEY_NAMES[key] || key; }
export function recolorStickers(stickers, map = {}) {
  const byHex = Object.fromEntries(Object.entries(HEX).map(([key, value]) => [value.toLowerCase(), colorHex(displayColorKey(key, map))]));
  return Object.fromEntries(Object.entries(stickers || {}).map(([slot, value]) => [slot, byHex[String(value).toLowerCase()] || value]));
}

export function displayFaceColor(face, setting = 'yellow top', seed = '') {
  const map = createCaseDisplayMap(FACE_COLORS, setting, seed);
  return displayColorKey(FACE_COLORS[face] || face, map);
}
