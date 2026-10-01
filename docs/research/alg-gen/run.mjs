// usage: node run.mjs pll|oll [--sets RU,RUF,...] [--cases T,Aa] [--budget ms]
import fs from 'node:fs';
import { stateOf, ergo, genSet, invertAlg, stm, compose } from './cube.mjs';
import { search, goals } from './search.mjs';
const AX = { U: 0, D: 0, R: 1, L: 1, r: 1, M: 1, F: 2, B: 2 }, RK = { U: 1, D: 0, L: 0, M: 1, R: 2, r: 3, F: 0, B: 1 };
// strip leading/trailing U (AUFs) and put commuting same-axis moves in canonical order
function core(alg) {
  let t = alg.trim().split(/\s+/);
  while (t.length && t[0][0] === 'U') t.shift();
  while (t.length && t[t.length - 1][0] === 'U') t.pop();
  for (let ch = true; ch;) { ch = false; for (let i = 0; i + 1 < t.length; i++) if (AX[t[i][0]] === AX[t[i + 1][0]] && RK[t[i][0]] > RK[t[i + 1][0]]) { [t[i], t[i + 1]] = [t[i + 1], t[i]]; ch = true; } }
  return t.join(' ');
}
import { pllCases, ollCases, effectOf } from './cases.mjs';

const args = process.argv.slice(2);
const kind = args[0] || 'pll';
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const DEPTHS = { RU: [8, 8], RUF: [7, 7], RUD: [7, 7], RUL: [7, 7], RUr: [6, 7], RUM: [6, 7], RUFD: [6, 6] };
const sets = opt('sets', 'RU,RUF,RUD,RUL,RUr,RUM,RUFD').split(',');
const onlyCases = opt('cases', '') ? opt('cases', '').split(',') : null;
const budget = Number(opt('budget', 60000));
const scale = Number(opt('scale', 0)); // depth reduction for quick runs
const cases = (kind === 'pll' ? pllCases : ollCases).filter(c => !onlyCases || onlyCases.includes(c.id));
const out = [];
const T0 = Date.now();
for (const c of cases) {
  const E = effectOf(c);
  const entry = { id: c.id, ref: c.ref, perSet: {}, algs: [] };
  const all = new Map();
  for (const faces of sets) {
    const [dA, dW] = DEPTHS[faces].map(d => Math.max(2, d - scale));
    const r = search({ effect: E, goal: goals[kind], faces, dA, dW, timeBudgetMs: budget });
    entry.perSet[faces] = { dA, dW, ms: r.ms, found: r.results.length, tableSize: r.tableSize, truncated: r.truncated };
    for (const x of r.results) {
      const e = ergo(x.alg);
      const auf = (x.preAUF ? 1 : 0) + (kind === 'pll' && x.postAUF ? 1 : 0);
      const key = x.alg;
      if (!all.has(key)) all.set(key, { alg: x.alg, preAUF: x.preAUF, postAUF: kind === 'pll' ? x.postAUF : null, gens: genSet(x.alg), ...e, score: e.score + auf, stmWithAuf: e.stm + auf });
    }
  }
  // dedupe: for PLL, an alg and its inverse solve inverse cases; if the case is
  // self-inverse they are interchangeable -> keep the better one (marked).
  const kc = core(c.ref), kg = genSet(kc);
  entry.known = { core: kc, gens: kg, stm: kc.split(' ').length, found: [...all.keys()].some(a => core(a) === kc),
    inDepthOf: sets.filter(f => [...kg].every(g => f.includes(g)) && kc.split(' ').length <= DEPTHS[f][0] + DEPTHS[f][1] - 2 * scale) };
  entry.totalFound = all.size;
  entry.algs = [...all.values()].sort((a, b) => a.score - b.score || a.stm - b.stm).slice(0, 40);
  out.push(entry);
  const b = entry.algs[0];
  console.log(`${c.id.padEnd(18)} ${String(Object.values(entry.perSet).reduce((n, s) => n + s.ms, 0)).padStart(7)}ms  n=${all.size} known:${entry.known.found ? 'FOUND' : entry.known.inDepthOf.length ? 'MISSED' : 'out-of-depth'}  best: ${b ? `[${b.gens}] ${b.stm}stm score ${b.score}  ${b.preAUF ? 'pre-AUF ' + b.preAUF + ' ' : ''}${b.alg}` : 'none'}`);
}
console.log('total ms', Date.now() - T0);
fs.writeFileSync(new URL(`./out/${kind}${opt('tag', '')}.json`, import.meta.url), JSON.stringify({ generated: new Date().toISOString(), sets, results: out }, null, 1));
