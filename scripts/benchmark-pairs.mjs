// Reproducible bounded runtime benchmark; all completions are checked against cubing.js.
// Usage: node scripts/benchmark-pairs.mjs [randomPositions=16]
import { loadNodeSolver } from '../src/analysis/node-solver.js';
import { bestCompletions, buildTables, SLOTS, trackedFrom, solvedSlots, crossSolved } from '../src/analysis/pair-completion.js';
import { cube3x3x3 } from 'cubing/puzzles';
const kp=await cube3x3x3.kpuzzle(),solver=await loadNodeSolver();
solver.search({scramble:'R U F',face:'D',timeoutMs:15000});
const t0=performance.now();buildTables();const cold=performance.now()-t0;
let seed=48271;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
const positions=Number(process.argv[2] ?? 16);
if(!Number.isInteger(positions)||positions<1||positions>200)throw Error('Choose 1–200 random positions.');
const rows=[];let failures=0;
for(let k=0;k<positions;k++){
 const seq=[];while(seq.length<22){const f='URFDLB'[Math.floor(rnd()*6)];if(seq.at(-1)?.[0]===f)continue;seq.push(f+['',"'",'2'][Math.floor(rnd()*3)]);}
 let setup=seq.join(' '),shift=0;
 const cross=solver.search({scramble:setup,face:'D',maxDepth:8,timeoutMs:1500});
 if(!cross.results?.length)continue;setup+=' '+cross.results[0].moves.join(' ');
 for(let stage=1;stage<=4;stage++){
 const start=solvedSlots(trackedFrom(setup),shift);if(start.length===4)break;
 const before=performance.now();const r=bestCompletions(setup,{startShift:shift,timeBudgetMs:160,slack:1,maxDepth:12,maxSolutions:32});
 const ms=performance.now()-before;const options=r.candidates.flatMap(c=>c.options).sort((a,b)=>a.tokens.length-b.tokens.length||a.e-b.e);
 rows.push({stage,ms,options:options.length,partial:r.candidates.some(c=>c.timedOut)});
 for(const o of options){
  const raw=kp.algToTransformation(setup+' '+o.moves).transformationData;
  const goal=kp.algToTransformation(['',"D'",'D2','D'][o.goalShift]).transformationData;
  const pieceCorrect=(kind,home)=>{const p=raw[kind].permutation.indexOf(home),g=goal[kind].permutation.indexOf(home);return p===g&&raw[kind].orientationDelta[p]===goal[kind].orientationDelta[g];};
  const independentlyCompleted=SLOTS.filter(slot=>pieceCorrect('EDGES',slot.e)&&pieceCorrect('CORNERS',slot.c)).length;
  if(independentlyCompleted<=start.length)failures++;
  if(![4,5,6,7].every(i=>pieceCorrect('EDGES',i))||!start.every(i=>pieceCorrect('EDGES',SLOTS[i].e)&&pieceCorrect('CORNERS',SLOTS[i].c)))failures++;
  const codes=trackedFrom(setup+' '+o.moves);if(!crossSolved(codes,o.goalShift)||solvedSlots(codes,o.goalShift).length<=start.length)failures++;
 }
 if(!options.length)break;setup+=' '+options[0].moves;shift=options[0].goalShift;
 }
}
const quant=(v,p)=>v.sort((a,b)=>a-b)[Math.min(v.length-1,Math.ceil(v.length*p)-1)]??null;
console.log(JSON.stringify({sample:`${positions} seeded random 22-turn positions, real WASM cross, successive searched pair completions`,compactTableColdMs:cold,positions:rows.length,verificationFailures:failures,medianMs:quant(rows.map(r=>r.ms),.5),p95Ms:quant(rows.map(r=>r.ms),.95),maxMs:Math.max(...rows.map(r=>r.ms)),withOptions:rows.filter(r=>r.options).length,partial:rows.filter(r=>r.partial).length,stages:[1,2,3,4].map(stage=>({stage,n:rows.filter(r=>r.stage===stage).length,withOptions:rows.filter(r=>r.stage===stage&&r.options).length}))},null,2));

if(failures)throw Error(`${failures} independently verified completion failures.`);
