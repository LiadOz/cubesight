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
let t = performance.now(); buildTables(); if (!process.env.NOCE) for (let i = 0; i < 4; i++) crossEdgeTable(i);
console.log('table build ms (cross + 4 cross+edge tables)', performance.now() - t);
let slotOfBit; const WASM_BIT = [0, 1, 2, 3]; // overwritten below after learning the mapping
const wasm = NWASM ? await loadNodeSolver() : null; const wasmCmp = [];
if (wasm) { // learn which WASM mask bit is which slot, using a fixed cross-solved position
  const sc0 = "R2 D' B U2 F' L2 D2 F2 R2 U B2 D' L2 U' B D' R' F' L D2 R B' U2 U2 R' L' F U R' L2";
  for (let b = 0; b < 4; b++) { const w = wasm.search({ scramble: sc0, face: 'D', mask: 1 << b, maxDepth: 10, maxResults: 1, timeoutMs: 5000 });
    const solvedNow = SLOTS.map((_, i) => i).filter(i => verify(`${sc0} ${w.results[0].moves.join(' ')}`, [i])); WASM_BIT[solvedNow[0]] = b; }
  console.log('WASM mask bit for slots FR,BR,BL,FL =', WASM_BIT.join(','));
}
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
    if (wasm && p < NWASM && stage <= 3) { // per-slot comparison with the WASM engine (mask = solved slots + this slot)
      if (!slotOfBit) { slotOfBit = []; const base = sc.split(' ').slice(0, 22).join(' ');
        // learn the WASM bit -> slot mapping on a position with the cross solved and nothing else (stage-1 position of this solve)
      }
      for (const c of bc.candidates) {
        const s = SLOTS.findIndex(x => x.name === c.slots[0]);
        const mask = [...solved, s].reduce((m, i) => m | (1 << WASM_BIT[i]), 0);
        const tw = performance.now(); const w = wasm.search({ scramble: sc, face: 'D', mask, maxDepth: 12, maxResults: 1, timeoutMs: 6000 });
        wasmCmp.push({ stage, slot: c.slots[0], mine: c.shortest, wasm: w.results[0]?.moves.length ?? null, wasmStatus: w.status, wasmMs: Math.round(performance.now() - tw), mineMs: c.ms });
      }
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
if (wasmCmp.length) {
  const ok = wasmCmp.filter(c => c.wasmStatus === 0 && c.wasm !== null);
  console.log(`WASM comparison (mask = solved slots + candidate slot): ${wasmCmp.length} slot queries, ${ok.length} proven by WASM`);
  for (const st of [1, 2, 3]) { const g = ok.filter(c => c.stage === st); if (!g.length) continue;
    console.log(`  pair ${st}: equal ${g.filter(c => c.mine === c.wasm).length}/${g.length}; mine shorter ${g.filter(c => c.mine < c.wasm).length}, wasm shorter ${g.filter(c => c.mine > c.wasm).length}; WASM ms median ${q(g.map(c => c.wasmMs), .5)} max ${Math.max(...g.map(c => c.wasmMs))}; mine ms median ${q(g.map(c => c.mineMs), .5)} max ${Math.max(...g.map(c => c.mineMs))}`); }
  console.log('  WASM not proven (timeout / depth) by stage:', [1, 2, 3].map(st => wasmCmp.filter(c => c.stage === st && c.wasmStatus !== 0).length).join(','));
  console.log(wasmCmp.filter(c => c.wasmStatus === 0 && c.wasm !== null && c.mine !== c.wasm));
}
