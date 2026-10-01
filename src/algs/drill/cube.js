import { applyMoves, canonicalizeForRecognition, createSolvedState, sameCubeState } from '../../cross-cube.js';
import { crossSolved, solvedPairs } from '../../solve-tracker.js';
import { physicalModelTokens, tokenizeReconstruction } from '../../review/import-parser.js';

/** Apply a canonical case setup using the app's independent physical cube model. */
export function caseSetupState(caseData) {
  if (!caseData?.setup) throw new Error('This case has no verified setup.');
  const tokens = tokenizeReconstruction(caseData.setup).tokens;
  return applyMoves(createSolvedState(), physicalModelTokens(tokens));
}

/** Require the live cube to match the selected case before starting the clock. */
export function matchesCaseSetup(state, caseData) {
  try { return sameCubeState(state, caseSetupState(caseData)); }
  catch { return false; }
}

/** OLL/PLL drills allow the user to reorient the whole cube during an alg. */
export function f2lStateIntact(state) {
  try {
    const frame = canonicalizeForRecognition(state, 'D');
    return crossSolved(frame, 'D') && solvedPairs(frame, 'D').length === 4;
  }
  catch { return false; }
}

export function f2lSetupSignature(state, targetPair = 'FR') {
  const frame = canonicalizeForRecognition(state, 'D');
  const slots = ['FR', 'FL', 'BR', 'BL'];
  if (!slots.includes(targetPair) || !crossSolved(frame, 'D')) return null;
  const ids = frame.cubies.map(cubie => cubie.id);
  const cornerId = ids.find(id => id.length === 3 && id.includes('D') && [...id].filter(face => face !== 'D').every(face => targetPair.includes(face)));
  const edgeId = ids.find(id => id.length === 2 && [...id].every(face => targetPair.includes(face)));
  if (!cornerId || !edgeId) return null;
  const describe = id => {
    const cubie = frame.cubies.find(item => item.id === id);
    return `${id}:${cubie.position.join(',')}:${Object.entries(cubie.stickers).sort().map(([face, color]) => `${face}=${color}`).join(',')}`;
  };
  return `${targetPair}|${describe(cornerId)}|${describe(edgeId)}`;
}
