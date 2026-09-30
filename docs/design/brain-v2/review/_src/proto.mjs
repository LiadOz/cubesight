// Prototype of the review engine's solver-backed parts, using the REAL repo modules
// (cross-cube.js, f2l-planner.js, pll-logic.js) and the REAL xcross WASM run directly in Node.
// Run: node docs/design/brain-v2/review/_src/proto.mjs   -> prints the numbers quoted in SPEC.md
// and writes golden-mock.json, which the mockup generator (gen.mjs) reads so the pictures show real data.
import fs from 'fs';
import createXCross from '../../../../../src/xcross-wasm/xcross.js';
import { stateFromScramble, applyMoves, validateSolution, createSolvedState, sameCubeState } from '../../../../../src/cross-cube.js';
import { currentDShift, solvedPairsPseudo, solvedPairs, crossSolved, analyze, eoSolved } from '../../../../../src/solve-tracker.js';
import { plannerChoices } from '../../../../../src/f2l-planner.js';
import { generatePllCase, PLL_CASES, applyPllMoves, identifyPllCase } from '../../../../../src/pll-logic.js';

const bench = {};
let t0 = performance.now();
const module = await createXCross({});
bench.wasmInstantiateMs = +(performance.now() - t0).toFixed(0);
const FACE = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
function search(scramble, face, mask, maxDepth, maxResults, timeoutMs) {
  const bytes = module.lengthBytesUTF8(scramble) + 1, ptr = module._malloc(bytes);
  module.stringToUTF8(scramble, ptr, bytes);
  const r = JSON.parse(module.UTF8ToString(module._xcross_wasm_analyze_json(ptr, FACE[face], mask, maxDepth, maxResults, timeoutMs)));
  module._free(ptr); return r;
}
const crossSearch = (seq, face = 'D', n = 1) => search(seq, face, 0, 8, n, 1000);
const dist = (seq, face = 'D') => crossSearch(seq, face).results[0]?.moves.length ?? 99;
const MOVES = []; for (const f of 'UDFBRL') for (const s of ['', "'", '2']) MOVES.push(f + s);

const scramble = "D2 F2 U' B2 R2 U2 F2 U' L2 D' B' L' U F' R' D2 R U' F2 L'";
const userCross = ["F'", "D'", 'F', 'D', 'B', "D'", 'R', "D'"];

// cold start: first cross query builds the tables
t0 = performance.now(); dist(scramble, 'U'); bench.firstCrossQueryColdMs = +(performance.now() - t0).toFixed(0);
t0 = performance.now(); for (let i = 0; i < 200; i++) dist(scramble, 'D'); bench.warmCrossQueryMs = +((performance.now() - t0) / 200).toFixed(3);

// 1. per-position evaluation: distance, loss, all optimal first moves, best continuation
const positions = [];
let prefix = scramble, prevD = dist(scramble);
const d0 = prevD;
t0 = performance.now();
for (let i = 0; i <= userCross.length; i++) {
  const d = dist(prefix);
  const firstMoves = MOVES.filter(m => dist(prefix + ' ' + m) === d - 1);   // exact set of moves on a shortest path
  const best = d ? crossSearch(prefix).results[0].moves : [];
  const row = { i, d, best, firstMoves };
  if (i > 0) { row.move = userCross[i - 1]; row.loss = 1 + d - positions[i - 1].d; }
  positions.push(row);
  if (i < userCross.length) prefix += ' ' + userCross[i];
}
bench.crossReviewAllPositionsMs = +(performance.now() - t0).toFixed(1);
const lossSum = positions.slice(1).reduce((a, p) => a + p.loss, 0);
console.log('cross d curve', positions.map(p => p.d).join(' '), '| loss per move', positions.slice(1).map(p => p.loss).join(' '), '| sum', lossSum, '== n-d0', userCross.length - d0);

// best face for the cross at move 0 ("Better cross") and X-cross availability
const perFace = {};
for (const f of 'UDFBRL') perFace[f] = dist(scramble, f);
console.log('cross length per face at move 0', perFace);
t0 = performance.now();
const xc = {};
for (const f of 'UDFBRL') { let best = 99; for (const m of [1, 2, 4, 8]) { const r = search(scramble, f, m, 10, 1, 500).results[0]; if (r) best = Math.min(best, r.moves.length); } xc[f] = best; }
bench.xcrossAllFacesMs = +(performance.now() - t0).toFixed(0);
console.log('x-cross length per face', xc);

// 2. F2L pair options at the moment the cross is done (planner from f2l-planner.js)
const afterCross = scramble + ' ' + userCross.join(' ');
const state = stateFromScramble(afterCross);
console.log('cross solved after user cross:', validateSolution(state, [], 'D').crossSolved);
t0 = performance.now();
const raw = []; const perMask = {};
for (const mask of [1, 2, 4, 8]) { const r = search(afterCross, 'D', mask, 12, 8, 3000); perMask[mask] = { status: r.status, n: r.results.length }; raw.push(...r.results.map(x => ({ moves: x.moves }))); }
bench.pairOptionsMs = +(performance.now() - t0).toFixed(0);
const pairs = plannerChoices({ state, solvedPairs: [] }, raw);
console.log('pair options (slot, moves, weight, pseudo)', pairs.map(p => [p.slot, p.moves.join(' '), p.weight, p.pseudo]));
// second pair given the first solved: masks containing the solved slot are fast, others time out
const first = pairs.find(p => p.slot === 'FR');
const st1 = afterCross + ' ' + first.moves.join(' ');
const xx = {}; t0 = performance.now();
for (const mask of [3, 5, 9, 6, 10, 12]) { const t1 = performance.now(); const r = search(st1, 'D', mask, 12, 4, 800); xx[mask] = { status: r.status, n: r.results.length, ms: +(performance.now() - t1).toFixed(0) }; }
console.log('xxcross per mask after FR solved (status 0=proven, 7=timeout)', JSON.stringify(xx));


// 2b. pseudo-slotting: offset k (0..3 = D^k fixes it) per move, pairs counted in that frame (solve-tracker.js)
const bl = pairs.find(p => p.slot === 'BL').moves;           // D L' U' L D'  (pseudo: final D' is the fix)
const pseudoTrace = []; let cur = afterCross;
pseudoTrace.push({ move: '(cross done)', k: currentDShift(stateFromScramble(cur), 'D'), pairs: solvedPairsPseudo(stateFromScramble(cur), 'D').map(p => p.slot), plainPairs: solvedPairs(stateFromScramble(cur), 'D').length });
for (const m of bl) { cur += ' ' + m; const st = stateFromScramble(cur); pseudoTrace.push({ move: m, k: currentDShift(st, 'D'), pairs: solvedPairsPseudo(st, 'D').map(p => p.slot), plainPairs: solvedPairs(st, 'D').length }); }
console.log('pseudo trace for BL pair (k=null: cross not solved in any frame; k=0 aligned; 1=D,2=D2,3=D fixes it)');
for (const r of pseudoTrace) console.log('  ', r.move.padEnd(12), 'k', r.k, 'pairs(any frame)', r.pairs.join(',') || '-', 'pairs(plain)', r.plainPairs);
// tracker findings verified here: pseudo is hard-wired to the literal D layer, and eoDone waits for the D fix
import { createSolvedState as _solved } from '../../../../../src/cross-cube.js';
const off = applyMoves(_solved(), ['D']), offU = applyMoves(_solved(), ['U']);
console.log('tracker facts: D-offset solved cube -> k', currentDShift(off, 'D'), 'f2lDonePseudo pairs', solvedPairsPseudo(off, 'D').length, '| analyze.eoDone', analyze(off, 'D').eoDone, 'vs eoSolved()', eoSolved(off, 'D'), '| cross on U, U-offset -> k', currentDShift(offU, 'U'));

// 3. cancellations / same-axis waste
const AX = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };
const q = m => m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1;
export function cancelWaste(moves) {
  const out = []; let i = 0;
  while (i < moves.length) {
    let j = i; while (j < moves.length && AX[moves[j][0]] === AX[moves[i][0]]) j++;
    const run = moves.slice(i, j), net = {};
    for (const m of run) net[m[0]] = ((net[m[0]] || 0) + q(m)) % 4;
    const cost = Object.values(net).filter(Boolean).length;
    if (run.length > cost) out.push({ at: i, run: run.join(' '), waste: run.length - cost });
    i = j;
  }
  return out;
}
console.log('cancel demo', JSON.stringify(cancelWaste("R U R' R' U' F F D L R L'".split(' '))));

// 4. PLL AUF economy (identifyPllCase ignores AUF; best pre/post AUF found by trying the 4x4 combos)
const isSolved = s => sameCubeState(s, createSolvedState());
function aufBest(st, name) {
  const alg = PLL_CASES.find(c => c.name === name).moves; let best = null;
  for (const pre of ['', 'U', 'U2', "U'"]) for (const post of ['', 'U', 'U2', "U'"]) {
    let s = pre ? applyPllMoves(st, [pre]) : st; s = applyPllMoves(s, alg); if (post) s = applyMoves(s, [post]);
    if (isSolved(s)) { const c = (pre ? 1 : 0) + (post ? 1 : 0); if (!best || c < best.c) best = { pre, post, c }; }
  }
  return best;
}
const auf = [];
for (const [name, a] of [['T', 'U'], ['Aa', "U'"], ['Ua', 'U2'], ['Jb', '']]) {
  const g = generatePllCase(name, { auf: a }); auf.push({ name, auf: a, id: identifyPllCase(g.state)?.name, best: aufBest(g.state, name) });
}
console.log('pll id + best AUF', JSON.stringify(auf));

console.log('bench', JSON.stringify(bench));
fs.writeFileSync(new URL('./golden-mock.json', import.meta.url), JSON.stringify({ scramble, userCross, d0, positions, perFace, xc, pairs: pairs.map(p => ({ slot: p.slot, moves: p.moves, weight: p.weight, pseudo: p.pseudo })), pseudoTrace, bench }, null, 1));
