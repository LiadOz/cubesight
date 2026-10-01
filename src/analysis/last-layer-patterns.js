// OLL identities are generated from the complete legal orientation pattern set.
// The IDs are stable generic IDs (OLL pattern 01..57); this intentionally avoids
// inventing the conventional 1..57 names where no source-to-pattern mapping is
// present in the repository.
import { analysisStateFromScramble } from './long-replay.js';
import { stateOf } from './cube-model.js';
import { canonicalizeForRecognition, FACE_COLORS } from '../cross-cube.js';
import { identifyPllCaseDetails } from '../pll-logic.js';

const rotate = pattern => [pattern[3], pattern[0], pattern[1], pattern[2], pattern[7], pattern[4], pattern[5], pattern[6]];
const canonical = pattern => {
  let current = pattern;
  let best = pattern.join('');
  for (let i = 1; i < 4; i += 1) { current = rotate(current); best = best < current.join('') ? best : current.join(''); }
  return best;
};

function orientationClasses() {
  const keys = new Set();
  for (let c0 = 0; c0 < 3; c0 += 1) for (let c1 = 0; c1 < 3; c1 += 1) for (let c2 = 0; c2 < 3; c2 += 1) {
    const c3 = (3 - c0 - c1 - c2 + 6) % 3;
    for (let e0 = 0; e0 < 2; e0 += 1) for (let e1 = 0; e1 < 2; e1 += 1) for (let e2 = 0; e2 < 2; e2 += 1) {
      const pattern = [c0, c1, c2, c3, e0, e1, e2, (e0 + e1 + e2) % 2];
      keys.add(canonical(pattern));
    }
  }
  const solved = canonical([0, 0, 0, 0, 0, 0, 0, 0]);
  return [...keys].filter(key => key !== solved).sort();
}

const OLL_KEYS = orientationClasses();
if (OLL_KEYS.length !== 57) throw new Error(`OLL classifier expected 57 AUF classes, got ${OLL_KEYS.length}.`);
export const OLL_PATTERN_COUNT = OLL_KEYS.length;
// These aliases are the subset independently matched to the in-repo OLL
// reference cases by applying inverse(ref), canonicalizing under AUF, and
// checking the resulting legal signature. Unmapped patterns stay generic.
const VERIFIED_OLL_NAMES = Object.freeze({
  '02220000': 'OLL 27 Sune', '01110000': 'OLL 26 Anti-Sune',
  '12120000': 'OLL 21 Cross (H)', '11220000': 'OLL 22 Cross (Pi)',
  '00121010': 'OLL 45 T-shape', '00120011': 'OLL 44 P-shape',
  '00211010': 'OLL 33 T-shape', '01020011': 'OLL 37 Fish',
  '01021100': 'OLL 35 Fish', '00000011': 'OLL 28 Awkward',
  '00000101': 'OLL 57 Zamboni', '11220101': 'OLL 51 I-shape',
  '12121111': 'OLL 1 Dot', '11221111': 'OLL 2 Dot',
  '00121001': 'OLL 43 P-shape', '00210101': 'OLL 34 Fish-ish',
});
export const OLL_VERIFIED_NAMES = VERIFIED_OLL_NAMES;
export const OLL_PATTERNS = Object.freeze(OLL_KEYS.map((signature, index) => Object.freeze({
  id: `OLL pattern ${String(index + 1).padStart(2, '0')}`,
  signature,
  standardName: VERIFIED_OLL_NAMES[signature] ?? null,
  setup: null,
})));
const OLL_BY_SIGNATURE = new Map(OLL_PATTERNS.map(pattern => [pattern.signature, pattern]));
export function ollPatternForSignature(signature) { return OLL_BY_SIGNATURE.get(signature) ?? null; }

function solvedF2L(state) {
  return [4, 5, 6, 7].every(i => state[i] === i && state[26 + i] === 0)
    && Array.from({ length: 8 }, (_, i) => i + 12).every(i => state[i] === i && state[26 + i] === 0);
}

export function identifyOllPattern(alg) {
  const state = stateOf(alg);
  if (!solvedF2L(state)) return null;
  const key = canonical([...state.subarray(26, 30), ...state.subarray(34, 38)]);
  const solved = canonical([0, 0, 0, 0, 0, 0, 0, 0]);
  const pattern = OLL_BY_SIGNATURE.get(key);
  return key === solved ? 'skip' : pattern?.standardName ?? pattern?.id ?? null;
}

const OFFSET_TURN = ['', 'D', 'D2', "D'"];
const join = (...parts) => parts.flat().filter(Boolean).join(' ');
const COLOR_FACE = new Map(Object.entries(FACE_COLORS).map(([face, color]) => [color, face]));
const FACE_ORDER = { U: 0, D: 0, F: 1, B: 1, R: 2, L: 2 };
function standardRecognitionIds(state) {
  return { cubies: state.cubies.map(cubie => ({
    ...cubie,
    id: Object.values(cubie.stickers).map(color => COLOR_FACE.get(color)).filter(Boolean).sort((a, b) => FACE_ORDER[a] - FACE_ORDER[b]).join(''),
  })) };
}

/** Capture the first complete OLL and PLL states with per-case timing estimates. */
export function captureLastLayer(segmentation) {
  const moves = segmentation.normalized.moves;
  const scramble = segmentation.normalized.scramble;
  const times = segmentation.moveTimes;
  const f2lIdx = segmentation.marks.pairIdx[3];
  const ollIdx = segmentation.marks.ollIdx;
  const solveCapture = (kind, startIdx, endIdx, id, auf = null) => {
    if (!id || startIdx == null) return null;
    const previous = startIdx > 0 ? times?.[startIdx - 1] : 0;
    const first = startIdx < moves.length ? times?.[startIdx] : previous;
    const last = endIdx == null || endIdx < startIdx ? first : times?.[endIdx];
    const recognitionMs = Number.isFinite(previous) && Number.isFinite(first) ? Math.max(0, first - previous) : null;
    const executionMs = Number.isFinite(first) && Number.isFinite(last) ? Math.max(0, last - first) : null;
    return { id, ...(auf ? { auf } : {}), start: startIdx, end: endIdx, recognitionMs, executionMs, kind };
  };
  let oll = null;
  if (f2lIdx != null) {
    const frame = segmentation.frames[f2lIdx]?.k ?? segmentation.initial?.k ?? 0;
    const prefix = moves.slice(0, f2lIdx + 1);
    const sequence = join(scramble, prefix, OFFSET_TURN[frame]);
    const id = identifyOllPattern(sequence);
    oll = solveCapture('oll', f2lIdx + 1, ollIdx, id);
  }
  let pll = null;
  if (ollIdx != null) {
    const original = analysisStateFromScramble(join(segmentation.scramble, segmentation.moves.slice(0, ollIdx + 1)));
    const state = standardRecognitionIds(canonicalizeForRecognition(original, segmentation.crossFace));
    const detail = identifyPllCaseDetails(state);
    const id = segmentation.marks.solvedIdx === ollIdx ? 'skip' : detail?.case.name ?? null;
    pll = solveCapture('pll', ollIdx + 1, segmentation.marks.solvedIdx, id, detail?.auf ?? null);
  }
  return { oll, pll };
}
