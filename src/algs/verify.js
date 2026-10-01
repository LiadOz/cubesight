import { invertAlg, normalizeAlg } from './notation.js';
import { applyMoves, canonicalizeForRecognition, createSolvedState } from '../cross-cube.js';
import { caseSetupState, f2lSetupSignature, f2lStateIntact } from './drill/cube.js';
import { coSolved, cpSolved, crossSolved, eoSolved, solvedPairs } from '../solve-tracker.js';
import { canonicalizeReconstruction, physicalModelTokens, tokenizeReconstruction } from '../review/import-parser.js';

const ROTATIONS = ['', 'y', 'y2', "y'"];
const AUFS = ['', 'U', 'U2', "U'"];
const inverseY = { '': '', y: "y'", y2: 'y2', "y'": 'y' };
const TOP_EDGE_IDS = ['UF', 'UR', 'UB', 'UL'];
function epSolved(state) {
  const home = new Map(createSolvedState().cubies.map(cubie => [cubie.id, cubie.position.join(',')]));
  return ['', 'U', 'U2', "U'"].some(auf => {
    const framed = auf ? applyMoves(state, [auf]) : state;
    return TOP_EDGE_IDS.every(id => framed.cubies.find(cubie => cubie.id === id)?.position.join(',') === home.get(id));
  });
}
const rotate = values => [values[3], values[0], values[1], values[2]];
const canonicalOrientation = values => {
  let current = values;
  let best = values.join('');
  for (let i = 1; i < 4; i++) {
    current = [...rotate(current.slice(0, 4)), ...rotate(current.slice(4))];
    best = best < current.join('') ? best : current.join('');
  }
  return best;
};

export function effectSignature(kpuzzle, alg, set) {
  const setup = invertAlg(normalizeAlg(alg)).join(' ');
  if (set === 'oll') {
    const d = kpuzzle.algToTransformation(setup).transformationData;
    return canonicalOrientation([...d.CORNERS.orientationDelta.slice(0, 4), ...d.EDGES.orientationDelta.slice(0, 4)]);
  }
  const rows = [];
  for (const y of ROTATIONS) for (const before of AUFS) for (const after of AUFS) {
    const text = [y, before, setup, after, inverseY[y]].filter(Boolean).join(' ');
    const d = kpuzzle.algToTransformation(text).transformationData;
    rows.push([
      ...d.CORNERS.permutation.slice(0, 4), ...d.EDGES.permutation.slice(0, 4),
      ...d.CORNERS.orientationDelta.slice(0, 4), ...d.EDGES.orientationDelta.slice(0, 4),
    ].join(','));
  }
  return rows.sort()[0];
}

export function preservesF2L(kpuzzle, alg) {
  const setup = invertAlg(normalizeAlg(alg)).join(' ');
  const d = kpuzzle.algToTransformation(setup).transformationData;
  return ROTATIONS.some(rotation => {
    const frame = kpuzzle.algToTransformation(rotation).transformationData;
    return [4, 5, 6, 7].every(i => d.CORNERS.permutation[i] === frame.CORNERS.permutation[i]
      && d.CORNERS.orientationDelta[i] === frame.CORNERS.orientationDelta[i])
      && [4, 5, 6, 7, 8, 9, 10, 11].every(i => d.EDGES.permutation[i] === frame.EDGES.permutation[i]
        && d.EDGES.orientationDelta[i] === frame.EDGES.orientationDelta[i]);
  });
}

/** Expensive verification is deferred until a user adds an alg or drills offline. */
export async function verifyAlgorithm(alg, caseData, { kpuzzle = null } = {}) {
  try {
    const cube = kpuzzle ?? await (await import('cubing/puzzles')).cube3x3x3.kpuzzle();
    const moves = normalizeAlg(alg);
    if (caseData.set === 'f2l') {
      const setup = caseSetupState(caseData);
      const signature = f2lSetupSignature(setup, caseData.targetPair);
      const before = solvedPairs(setup, 'D').map(pair => pair.slot).sort();
      const expectedBefore = [...(caseData.preservedPairs ?? [])].sort();
      const fixed = canonicalizeReconstruction(tokenizeReconstruction(moves).tokens).moves.map(row => row.move);
      const after = applyMoves(setup, fixed);
      const solved = solvedPairs(after, 'D').map(pair => pair.slot);
      const f2lIntact = Boolean(signature && before.length === 3 && before.join('|') === expectedBefore.join('|')
        && crossSolved(after, 'D') && solved.length === 4 && solved.includes(caseData.targetPair));
      return { verified: f2lIntact, moves, signature, f2lIntact, reason: f2lIntact ? null : 'This algorithm does not complete the selected pair while preserving the cross and other solved pairs.' };
    }
    if (caseData.set === 'oll2') {
      const setup = caseSetupState(caseData);
      const fixed = physicalModelTokens(tokenizeReconstruction(moves).tokens);
      const after = applyMoves(setup, fixed);
      const f2lIntact = f2lStateIntact(caseSetupState(caseData)) && f2lStateIntact(after);
      const frame = canonicalizeForRecognition(after, 'D');
      const stageGoal = caseData.stage === 'Edge orientation' ? eoSolved(frame, 'D')
        : caseData.stage === 'Corner orientation' ? eoSolved(frame, 'D') && coSolved(frame, 'D')
          : caseData.stage === 'Corner permutation' ? eoSolved(frame, 'D') && coSolved(frame, 'D') && cpSolved(frame, 'D')
            : caseData.stage === 'Edge permutation' ? eoSolved(frame, 'D') && coSolved(frame, 'D') && cpSolved(frame, 'D') && epSolved(frame)
              : false;
      return { verified: stageGoal && f2lIntact, moves, signature: caseData.signature, f2lIntact, reason: stageGoal && f2lIntact ? null : `This algorithm does not meet the ${caseData.stage} goal while preserving F2L.` };
    }
    const signature = effectSignature(cube, moves, caseData.set);
    const f2lIntact = preservesF2L(cube, moves);
    return {
      verified: f2lIntact && signature === caseData.signature,
      moves, signature, f2lIntact,
      reason: !f2lIntact ? 'This algorithm changes the solved F2L.'
        : signature !== caseData.signature ? 'This algorithm does not solve the selected case.' : null,
    };
  } catch (error) {
    return { verified: false, moves: null, signature: null, f2lIntact: false, reason: error.message };
  }
}
