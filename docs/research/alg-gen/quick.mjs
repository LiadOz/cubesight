import { stateOf } from './cube.mjs';
import { search, goals } from './search.mjs';
const T = "R U R' U' R' F R2 U' R' U' R U R' F'";
const t=Date.now();
const r = search({ effect: stateOf(T), goal: goals.pll, faces: 'RUF', dA: 7, dW: 7 });
console.log(r.ms, r.tableSize, r.probes, r.candidates, r.results.length); console.log(r.results.slice(0,10));
