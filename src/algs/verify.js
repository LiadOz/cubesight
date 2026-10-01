import { invertAlg, normalizeAlg } from './notation.js';

const ROTATIONS = ['', 'y', 'y2', "y'"];
const AUFS = ['', 'U', 'U2', "U'"];
const inverseY = { '': '', y: "y'", y2: 'y2', "y'": 'y' };
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
