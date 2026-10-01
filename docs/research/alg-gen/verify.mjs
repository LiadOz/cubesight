// Independent check of generated algs using cubing.js KPuzzle directly
// (separate code path from cube.mjs's typed-array model).
// usage: node verify.mjs out/pll.json
import fs from 'node:fs';
import { cube3x3x3 } from '../../../node_modules/cubing/dist/lib/cubing/puzzles/index.js';
import { pllCases, ollCases } from './cases.mjs';
const kp = await cube3x3x3.kpuzzle();
const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
const defs = Object.fromEntries([...pllCases, ...ollCases].map(c => [c.id, c]));
const AUF = ['', 'U', 'U2', "U'"];
function solvedIgnoringCenterOri(t, kind) {
  const d = t.transformationData;
  const idOri = o => o.every(x => x === 0);
  const idPerm = p => p.every((v, i) => v === i);
  if (kind === 'oll') { // LL pieces are slots 0..3 of CORNERS/EDGES; F2L must be exact, LL oriented
    const cp = d.CORNERS.permutation, ep = d.EDGES.permutation;
    return [4,5,6,7].every(i => cp[i] === i) && [4,5,6,7,8,9,10,11].every(i => ep[i] === i) && idOri(d.CORNERS.orientationDelta) && idOri(d.EDGES.orientationDelta) && idPerm(d.CENTERS.permutation);
  }
  return idPerm(d.CORNERS.permutation) && idPerm(d.EDGES.permutation) && idOri(d.CORNERS.orientationDelta) && idOri(d.EDGES.orientationDelta) && idPerm(d.CENTERS.permutation);
}
let n = 0, bad = 0;
for (const r of data.results) {
  const kind = defs[r.id].kind;
  for (const a of r.algs) {
    n++;
    const full = `${AUF[a.preAUF]} ${a.alg} ${kind === 'pll' ? AUF[a.postAUF] : ''}`;
    const scr = kp.algToTransformation(defs[r.id].ref).invert();
    // scramble, pre-AUF, then alg (+ post-AUF for PLL)
    const t = scr.applyTransformation(kp.algToTransformation(full));
    if (!solvedIgnoringCenterOri(t, kind)) { bad++; console.log('FAIL', r.id, full); }
  }
}
console.log(`verified ${n} algs, ${bad} failures`);
