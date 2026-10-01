// Verify the conventional aliases exposed by the app's OLL catalog. Each
// in-repo reference is treated as a solving algorithm: invert it to form a
// case setup, compare the canonical AUF orientation signature, then replay the
// reference and check it returns F2L + all LL orientations to identity.
import { cube3x3x3 } from 'cubing/puzzles';
import { ollCases } from './cases.mjs';
import { OLL_PATTERNS } from '../../../src/analysis/last-layer.js';
const kp = await cube3x3x3.kpuzzle();
const rotate = p => [p[3], p[0], p[1], p[2], p[7], p[4], p[5], p[6]];
function signature(pattern) {
  let best = pattern.join(''), current = pattern;
  for (let i = 1; i < 4; i++) { current = rotate(current); const key = current.join(''); if (key < best) best = key; }
  return best;
}
function lowerSolved(d) {
  return [4, 5, 6, 7].every(i => d.CORNERS.permutation[i] === i && d.CORNERS.orientationDelta[i] === 0)
    && [4, 5, 6, 7, 8, 9, 10, 11].every(i => d.EDGES.permutation[i] === i && d.EDGES.orientationDelta[i] === 0);
}
for (const c of ollCases) {
  const solution = kp.algToTransformation(c.ref), setup = solution.invert();
  const pattern = setup.transformationData;
  if (!lowerSolved(pattern)) throw new Error(`${c.id}: inverse reference does not preserve F2L`);
  const key = signature([...pattern.CORNERS.orientationDelta.slice(0, 4), ...pattern.EDGES.orientationDelta.slice(0, 4)]);
  const catalog = OLL_PATTERNS.find(item => item.signature === key);
  if (catalog?.standardName !== c.id) throw new Error(`${c.id}: no matching catalog name for ${key}`);
  if (!lowerSolved(setup.applyTransformation(solution).transformationData)) throw new Error(`${c.id}: reference fails independent replay`);
}
console.log(`verified ${ollCases.length} OLL aliases against cubing.js`);
