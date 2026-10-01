// Enumerates the last-layer group (F2L solved) and counts case classes, to show
// that OLL/PLL case identification needs no external data: cases are derived
// from cube state, and only the *numbering* is a naming convention.
import { stateOf, compose, hash, N, IDENTITY } from './cube.mjs';
const gens = ['U', "R U R' U R U2 R'", "F R U R' U' F'", "R U R' U' R' F R2 U' R' U' R U R' F'", "R U' R U R U R U' R' U' R2"].map(stateOf);
const key = s => hash(s);
const seen = new Map([[key(IDENTITY), IDENTITY]]); let frontier = [IDENTITY];
while (frontier.length) { const nf = []; for (const s of frontier) for (const g of gens) { const n = compose(s, g); const k = key(n); if (!seen.has(k)) { seen.set(k, n); nf.push(n); } } frontier = nf; }
console.log('last-layer states reachable (expect 62208):', seen.size);
// OLL pattern = orientation of LL pieces by slot after the case is applied to a solved cube... use orientation vector of the state
const U = stateOf('U'), U3 = stateOf("U'");
const pat = s => [...s.subarray(26, 30), ...s.subarray(34, 38)].join('');
const rot = p => { const a = p.split('').map(Number); // conjugate by U: rotate corner and edge slots
  const c = a.slice(0, 4), e = a.slice(4, 8); return [c[3], c[0], c[1], c[2], e[3], e[0], e[1], e[2]].join(''); };
const pats = new Set([...seen.values()].map(pat)); console.log('orientation patterns:', pats.size);
const classes = new Set(); for (const p of pats) { let q = p, best = p; for (let i = 0; i < 4; i++) { q = rot(q); if (q < best) best = q; } classes.add(best); }
console.log('OLL classes up to AUF (incl. solved):', classes.size, '-> OLL cases excluding solved:', classes.size - 1);
// PLL: states with all LL pieces oriented -> permutation classes up to pre/post AUF
const oriented = [...seen.values()].filter(s => pat(s) === '00000000'); console.log('oriented LL states:', oriented.length);
const Ups = [IDENTITY, U, stateOf('U2'), U3]; const cls = new Set();
for (const s of oriented) { let best = Infinity; for (const a of Ups) for (const b of Ups) best = Math.min(best, hash(compose(compose(a, s), b))); cls.add(best); }
console.log('PLL classes up to pre/post AUF (incl. solved):', cls.size, '-> PLL cases excluding solved:', cls.size - 1);
