import { bestCompletions, buildTables } from './pairbest.mjs';
let t=Date.now(); buildTables(); console.log('tables ms', Date.now()-t);
const sc = "R2 D' B U2 F' L2 D2 F2 R2 U B2 D' L2 U' B D' R' F' L D2 R B' U2 U2 R' L' F U R' L2";
console.log(JSON.stringify(bestCompletions(sc), null, 1).slice(0,3000));
