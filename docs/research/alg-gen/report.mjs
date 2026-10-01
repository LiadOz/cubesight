// Prints markdown tables from out/pll*.json and out/oll.json (used to write the research doc).
import fs from 'node:fs';
import { pllCases, effectOf, pllSignature, mirrorAlg, invertAlg } from './cases.mjs';
import { stateOf } from './cube.mjs';
const load = f => JSON.parse(fs.readFileSync(new URL('./out/' + f, import.meta.url)));
const merge = (...files) => { const m = new Map(); for (const f of files) for (const r of load(f).results) { const e = m.get(r.id) || { id: r.id, ref: r.ref, algs: new Map(), known: r.known, ms: 0 }; for (const a of r.algs) e.algs.set(a.alg, a); e.ms += Object.values(r.perSet).reduce((n, s) => n + s.ms, 0); if (r.known.found) e.known = r.known; m.set(r.id, e); } return m; };
const fmt = a => a ? `\`${a.preAUF ? 'U' + ['', '', '2', "'"][a.preAUF] + ' ' : ''}${a.alg}${a.postAUF ? ' U' + ['', '', '2', "'"][a.postAUF] : ''}\`` : '-';
const rows = (m) => [...m.values()].map(e => {
  const all = [...e.algs.values()];
  const best = all.slice().sort((a, b) => a.score - b.score || a.stm - b.stm)[0];
  const short = all.slice().sort((a, b) => a.stmWithAuf - b.stmWithAuf || a.score - b.score)[0];
  const ru = all.filter(a => a.gens === 'RU').sort((a, b) => a.stmWithAuf - b.stmWithAuf)[0];
  return { e, best, short, ru, n: all.length };
});
const which = process.argv[2];
if (which === 'pll') {
  const m = merge('pll.json', 'pll-deep.json', 'pll-ru20.json');
  // relations
  const sig = new Map(pllCases.map(c => [c.id, pllSignature(effectOf(c))]));
  const byS = new Map([...sig].map(([k, v]) => [v, k]));
  const rel = c => ({ inv: byS.get(pllSignature(stateOf(invertAlg(c.ref)))) , mir: byS.get(pllSignature(stateOf(mirrorAlg(c.ref)))) });
  console.log('| case | algs found | best by ergo score (STM, score) | shortest incl. AUF | best RU-only | classic alg found? | inverse / mirror case |\n|---|---|---|---|---|---|---|');
  for (const { e, best, short, ru, n } of rows(m)) {
    const c = pllCases.find(x => x.id === e.id); const r = rel(c);
    console.log(`| ${e.id} | ${n} | ${fmt(best)} (${best.stmWithAuf}, ${best.score}) | ${short.stmWithAuf} STM: ${fmt(short)} | ${ru ? ru.stmWithAuf + ' STM: ' + fmt(ru) : 'none <= 20 STM'} | ${e.known.found ? 'yes' : e.known.inDepthOf.length ? 'no' : 'out of depth (' + e.known.stm + ' STM, ' + e.known.gens + ')'} | ${r.inv}${r.inv === e.id ? ' (self)' : ''} / ${r.mir}${r.mir === e.id ? ' (self)' : ''} |`);
  }
} else {
  const m = merge('oll.json');
  console.log('| case (reference alg) | algs found | best by ergo score | shortest | classic found? |\n|---|---|---|---|---|');
  for (const { e, best, short, n } of rows(m)) console.log(`| ${e.id} | ${n} | ${fmt(best)} (${best.stm} STM, ${best.score}) | ${short.stm} STM: ${fmt(short)} | ${e.known.found ? 'yes' : e.known.inDepthOf.length ? 'no (uses f/S slice, outside the generator sets)' : 'out of depth (' + e.known.stm + ' STM)'} |`);
}
