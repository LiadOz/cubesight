// Benchmark of the "best pair completion" engine over random solves.
// usage: node bench-pairs.mjs [positions=30] [wasmPositions=8] [slack=1] [multi=1]
import { findCompletions, bestCompletions, trackedFrom, solvedSlots, crossSolved, SLOTS, buildTables, crossEdgeTable, plannerWeight, ergoScore } from './pairbest.mjs';
import { tokens } from './cube.mjs';
import { cube3x3x3 } from '../../../node_modules/cubing/dist/lib/cubing/puzzles/index.js';
import { loadNodeSolver } from '../../../src/analysis/node-solver.js';
const kp = await cube3x3x3.kpuzzle();
const NPOS = Number(process.argv[2] || 30), NWASM = Number(process.argv[3] || 8), SLACK = Number(process.argv[4] ?? 1), MULTI = process.argv[5] !== '0';
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function scramble() { const F = 'URFDLB'; let out = [], last = ''; while (out.length < 22) { const f = F[Math.floor(rnd() * 6)]; if (f === last) continue; last = f; out.push(f + ['', "'", '2'][Math.floor(rnd() * 3)]); } return out.join(' '); }
// independent verification of "cross + slots solved" with cubing.js KPuzzle directly
function verify(seq, slots) {
  const d = kp.algToTransformation(seq).transformationData;
  const eOK = i => d.EDGES.permutation[i] === i && d.EDGES.orientationDelta[i] === 0; // piece at slot i is home (only valid if identity perm at slot)
  const cross = [4, 5, 6, 7].every(eOK);
  const sl = slots.every(s => { const { c, e } = SLOTS[s]; return eOK(e) && d.CORNERS.permutation[c] === c && d.CORNERS.orientationDelta[c] === 0; });
  return cross && sl;
}
const stats = { cross: [], 1: [], 2: [], 3: [], 4: [], multi2: [], multi3: [], multi4: [] };
const lens = { 1: [], 2: [], 3: [], 4: [] };
let t = performance.now(); buildTables(); for (let i = 0; i < 4; i++) crossEdgeTable(i);
console.log('table build ms (cross + 4 cross+edge tables)', performance.now() - t);
const wasm = NWASM ? await loadNodeSolver() : null; const wasmCmp = [];
let bad = 0, timeouts = 0;
for (let p = 0; p < NPOS; p++) {
  let sc = scramble();
  const c0 = trackedFrom(sc);
  let r = findCompletions(c0, { newSlots: [], preserve: [], maxDepth: 9, maxSolutions: 1, slack: 0 });
  stats.cross.push(r.ms);
  sc += ' ' + r.solutions[0];
  for (let stage = 1; stage <= 4; stage++) {
    const bc = bestCompletions(sc, { maxDepth: 12, slack: SLACK, timeBudgetMs: 10000 });
    stats[stage].push(bc.totalMs);
    for (const c of bc.candidates) if (c.timedOut) timeouts++;
    const best = bc.candidates.filter(c => c.options.length).sort((a, b) => a.shortest - b.shortest || a.options[0].e - b.options[0].e)[0];
    if (!best) { console.log("NO SOLUTION", stage, JSON.stringify(bc.candidates.map(c=>[c.slots,c.shortest,c.timedOut,c.ms|0]))); break; }
    lens[stage].push(best.shortest);
    const solved = bc.solved.map(n => SLOTS.findIndex(s => s.name === n));
    const slotIdx = SLOTS.findIndex(s => s.name === best.slots[0]);
    if (!verify(`${sc} ${best.options[0].moves}`, [...solved, slotIdx])) { bad++; console.log('VERIFY FAIL', sc, best.options[0].moves); }
    if (MULTI && stage <= 3) {
      const open = SLOTS.map((_, i) => i).filter(i => !solved.includes(i)); const codes = trackedFrom(sc);
      const pairs = []; for (let a = 0; a < open.length; a++) for (let b = a + 1; b < open.length; b++) pairs.push([open[a], open[b]]);
      const tm = performance.now(); let any = 0;
      for (const pr of pairs) { const m = findCompletions(codes, { newSlots: pr, preserve: solved, maxDepth: 12, maxSolutions: 5, slack: 0, timeBudgetMs: 10000 }); if (m.solutions.length) any++; if (m.timedOut) timeouts++;
        if (m.solutions.length && !verify(`${sc} ${m.solutions[0]}`, [...solved, ...pr])) { bad++; console.log('VERIFY FAIL multi'); } }
      stats['multi' + (stage + 1)]?.push(performance.now() - tm);
    }
    if (wasm && p < NWASM && stage <= 2) { // compare the shortest length with the WASM engine (cross + slot masks)
      const masks = solved.length ? [3, 5, 9, 6, 10, 12].filter(m => solved.every(s => m & (1 << s))) : [1, 2, 4, 8];
      let bestW = 99, tw = performance.now();
      for (const m of masks) { const w = wasm.search({ scramble: sc, face: 'D', mask: m, maxDepth: 10, maxResults: 1, timeoutMs: 8000 }); if (w.results[0]) bestW = Math.min(bestW, w.results[0].moves.length); }
      wasmCmp.push({ stage, mine: best.shortest, wasm: bestW, wasmMs: performance.now() - tw, mineMs: bc.totalMs });
    }
    sc += ' ' + best.options[0].moves;
  }
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const row = (k, a) => console.log(String(k).padEnd(8), 'n=' + a.length, 'median', q(a, .5), 'p95', q(a, .95), 'max', Math.max(...a), 'ms');
console.log(`positions ${NPOS}, slack ${SLACK}, verify failures ${bad}, timeouts ${timeouts}`);
row('cross', stats.cross); for (const s of [1, 2, 3, 4]) row('pair' + s + '(all open slots)', stats[s]);
for (const k of ['multi2', 'multi3', 'multi4']) if (stats[k].length) row(k, stats[k]);
for (const s of [1, 2, 3, 4]) console.log('shortest pair' + s + ' length: mean', (lens[s].reduce((a, b) => a + b, 0) / lens[s].length).toFixed(2), 'max', Math.max(...lens[s]));
if (wasmCmp.length) { console.log('WASM vs mine (shortest completion of any slot):'); let same = 0; for (const c of wasmCmp) if (c.mine === c.wasm) same++; console.log(`  equal lengths ${same}/${wasmCmp.length}; wasm ms median ${q(wasmCmp.map(c => c.wasmMs), .5)} max ${Math.max(...wasmCmp.map(c => c.wasmMs))}; mine median ${q(wasmCmp.map(c => c.mineMs), .5)}`); console.log(wasmCmp.filter(c => c.mine !== c.wasm)); }
