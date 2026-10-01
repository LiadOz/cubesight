import test from 'node:test';
import assert from 'node:assert/strict';
import { readProgress } from '../src/progress/adapter.js';
const now = Date.UTC(2026, 9, 1, 12);
const store = values => ({ getItem: key => JSON.stringify(values[key] ?? null), setItem() { throw Error('Progress must not write'); } });
test('progress preserves legacy keys and defaults to smart speed with penalties', () => {
  const records = [
    {at:now-100,solveMs:10000,penalty:'+2'},
    {at:now-90,solveMs:5000,source:'manual'},
    {at:now-80,solveMs:4000,focus:'flow'},
    {at:now-70,solveMs:7000,penalty:'DNF'},
  ];
  const data = readProgress(store({}),{records,now});
  assert.equal(data.stats.timedCount,2); assert.equal(data.stats.best,12000); assert.equal(data.stats.dnfCount,1);
  assert.equal(readProgress(store({}),{records,source:'all',focus:'all',now}).stats.timedCount,4);
});
test('undated drill aggregates stay all-time and never invent daily activity', () => {
  const data = readProgress(store({'cubesight-progress-v2':{attempts:20,correct:15},'cubesight-learning-v1':{version:1,trial:2,items:{'f2l|test':{attempts:2,correct:1,due:now-1,dueTrial:3,times:[900,1100]}}}}),{records:[],now});
  assert.equal(data.drills.find(d=>d.id==='corners').lifetime.accuracy,.75);
  assert.equal(data.drills.find(d=>d.id==='f2l').due,1);
  assert.deepEqual(data.activity,[]);
});
test('rounds use period and aliases, dated legacy cases are not double counted', () => {
  const data = readProgress(store({
    'cubesight-progress-v2':{history:[{at:now-100,correct:true,ms:700}]},
    'cubesight-scout-practice-v1':[{at:new Date(now-200).toISOString(),durationMs:2000}],
    'cubesight-rounds-v1':[{at:now-100,drill:'corner',n:1,correct:1,medianMs:700},{at:now-200,drill:'scout',n:1,correct:1,medianMs:2000},{at:now-300,drill:'oll-recognition',n:20,correct:18,medianMs:1000},{at:now-40*86400000,drill:'oll',n:20,correct:20,medianMs:500}],
  }),{records:[],now});
  const oll=data.drills.find(d=>d.id==='oll');
  assert.equal(oll.rounds,1);assert.equal(oll.accuracy,.9);assert.equal(data.activity[0].cases,22);
  assert.equal(readProgress(store({}),{records:[],now}).stats.best,null);
});
test('ao12 trend needs actual timed solves and accounts for +2', () => {
  const records=Array.from({length:13},(_,i)=>({at:now-100+i,solveMs:10000,penalty:i===5?'+2':null}));
  const data=readProgress(store({}),{records,now});
  assert.equal(data.trend[10].ms,null);assert.equal(data.trend[11].ms,10000);assert.equal(data.trend[12].ms,10000);
});

test('phase drill links use only actual solved cube stages', () => {
  const phases={crossMs:1000,f2lMs:6000,ollMs:2000,pllMs:1500};
  const records=[{at:now-1,solveMs:10500,solved:true,phases},{at:now-2,solveMs:99999,solved:true,source:'manual',phases}];
  const data=readProgress(store({}),{records,source:'all',now});
  assert.equal(data.splits[1].ms,6000);assert.equal(data.splits[1].largest,true);assert.equal(data.splits[1].samples,1);assert.equal(data.splits[1].href,'#/drills/f2l');
});

test('algorithm case summaries contribute real activity and ready case counts', () => {
 const algorithms=[{caseId:'pll/T',attempts:3,correct:2,times:[1000,1200],due:2,activity:[now-5,now-4,now-3]}];
 const data=readProgress(store({}),{records:[],algorithms,now});
 const alg=data.drills.find(d=>d.id==='algs');assert.equal(alg.due,1);assert.equal(alg.lifetime.attempts,3);assert.equal(alg.lifetime.medianMs,1100);assert.equal(data.activity[0].cases,3);
});
