// Case definitions. The PLL reference algs come from the app (src/pll-logic.js)
// and are used ONLY to define which permutation each case is (their effect on
// a cube); they are never shipped as "the" algorithm. OLL cases are defined
// by a well-known short alg, checked to be F2L-preserving at load time.
import { PLL_CASES } from '../../../src/pll-logic.js';
import { stateOf, compose, invert, hash, IDENTITY, mirrorAlg, invertAlg } from './cube.mjs';

export const pllCases = PLL_CASES.map(c => ({ id: c.name, kind: 'pll', ref: c.algorithm }));
// [name, ref alg] -- numbering follows the common OLL 1-57 convention; the
// ref algs are only used to define the orientation pattern (verified below).
export const ollCases = [
  ['OLL 27 Sune', "R U R' U R U2 R'"],
  ['OLL 26 Anti-Sune', "R U2 R' U' R U' R'"],
  ['OLL 21 Cross (H)', "R U2 R' U' R U R' U' R U' R'"],
  ['OLL 22 Cross (Pi)', "R U2 R2 U' R2 U' R2 U2 R"],
  ['OLL 45 T-shape', "F R U R' U' F'"],
  ['OLL 44 P-shape', "f R U R' U' f'"],
  ['OLL 33 T-shape', "R U R' U' R' F R F'"],
  ['OLL 37 Fish', "F R' F' R U R U' R'"],
  ['OLL 35 Fish', "R U2 R2 F R F' R U2 R'"],
  ['OLL 28 Awkward', "r U R' U' r' R U R U' R'"],
  ['OLL 57 Zamboni', "R U R' U' M' U R U' r'"],
  ['OLL 51 I-shape', "F U R U' R' U R U' R' F'"],
  ['OLL 1 Dot', "R U2 R2 F R F' U2 R' F R F'"],
  ['OLL 2 Dot', "F R U R' U' F' f R U R' U' f'"],
  ['OLL 43 P-shape', "R' U' F' U F R"],
  ['OLL 34 Fish-ish', "R U R2 U' R' F R U R U' F'"],
].map(([id, ref]) => ({ id, kind: 'oll', ref }));

export function effectOf(c) {
  // wide f is not in the move set model: rewrite f = F S and S is not modelled,
  // so express f via rotation-free equivalents when needed.
  const ref = c.ref.replace(/\bf\b/g, 'f').replace(/\bf'/g, "f'");
  return stateOf(ref);
}
// Canonical signature of a PLL case up to pre/post AUF
export function pllSignature(E) {
  const U = [IDENTITY, stateOf('U'), stateOf('U2'), stateOf("U'")];
  let best = Infinity;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) best = Math.min(best, hash(compose(compose(U[i], E), U[j])));
  return best;
}
export { mirrorAlg, invertAlg };
