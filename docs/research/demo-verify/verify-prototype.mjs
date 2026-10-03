import { cube3x3x3 } from '/home/loz/projects/cubesight/node_modules/cubing/dist/lib/cubing/puzzles/index.js';
import { Alg } from '/home/loz/projects/cubesight/node_modules/cubing/dist/lib/cubing/alg/index.js';
const kp = await cube3x3x3.kpuzzle();
// EDGES: UF UR UB UL DF DR DB DL FR FL BR BL | CORNERS: UFR URB UBL ULF DRF DFL DLB DBR
const SLOTS = { FR: { e: 8, c: 4 }, FL: { e: 9, c: 5 }, BL: { e: 10, c: 6 }, BR: { e: 11, c: 7 } };
const CROSS = [4, 5, 6, 7];                       // DF DR DB DL
const ok = (p, orbit, idx) => idx.every(i => p.patternData[orbit].pieces[i] === i && p.patternData[orbit].orientation[i] === 0);

/** What is unsolved in this state? That IS the claim, when none is declared. */
function describe(p) {
  const cross = ok(p, 'EDGES', CROSS);
  const slots = Object.entries(SLOTS).filter(([, s]) => ok(p, 'EDGES', [s.e]) && ok(p, 'CORNERS', [s.c])).map(([n]) => n);
  const open = Object.keys(SLOTS).filter(n => !slots.includes(n));
  return { cross, solvedSlots: slots, openSlots: open };
}

function verify(setup, alg) {
  const before = kp.defaultPattern().applyAlg(new Alg(setup));
  const after = before.applyAlg(new Alg(alg));
  const b = describe(before), a = describe(after);
  const claim = b.cross && b.openSlots.length === 1 ? `solve the ${b.openSlots[0]} slot` : 'unclear (cross broken or several slots open)';
  const fixed = b.openSlots.filter(s => !a.openSlots.includes(s));
  const broke = a.openSlots.filter(s => !b.openSlots.includes(s)).concat(b.cross && !a.cross ? ['cross'] : []);
  const pass = claim.startsWith('solve the') && fixed.length === 1 && broke.length === 0;
  return { claim, before: b, after: a, fixed, broke, pass };
}

for (const [label, setup, alg] of [
  ['AI case 1', "R U2 R' U R U' R'", "R U2 R'"],
  ['AI case 2', "R U' R' U2 R U' R'", "R U' R' U' F U2 F' U R U' R'"],
  ['known-good', "R U R'", "R U' R'"],
]) {
  const v = verify(setup, alg);
  console.log(`${label}\n  inferred claim : ${v.claim}`);
  console.log(`  after the alg  : cross ${v.after.cross ? 'ok' : 'BROKEN'}, open slots [${v.after.openSlots}]`);
  console.log(`  verdict        : ${v.pass ? 'PASS' : 'FAIL'}${v.broke.length ? ` (also broke: ${v.broke})` : ''}${!v.fixed.length ? ' (fixed nothing)' : ''}\n`);
}
