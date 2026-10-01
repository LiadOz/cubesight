import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePLLStart } from '../src/drills/pll-start.js';
import { generatePllCase } from '../src/pll-logic.js';
import { unrelabelMoves } from '../src/analysis/normalize.js';
import { sameCubeState } from '../src/cross-cube.js';

const trial = generatePllCase('T', {auf:'U2'});
test('PLL links preserve their exact AUF and normalize every cross face', async () => {
  const moves = [...trial.setup, 'U2'];
  for (const face of ['U','D','F','B','R','L']) {
    const result = await resolvePLLStart(`#/drills/pll?scramble=${encodeURIComponent(unrelabelMoves(moves,face).join(' '))}&face=${face}`);
    assert.equal(result.recognized.name,'T');
    assert.equal(sameCubeState(result.state,trial.state),true);
  }
});
test('PLL cases and invalid starts never silently choose a substitute', async () => {
  assert.deepEqual(new Set((await resolvePLLStart('#/drills/pll?cases=pll/T,Ua')).allowed),new Set(['Ua','T']));
  assert.ok((await resolvePLLStart('#/drills/pll?cases=unknown')).error);
  assert.ok((await resolvePLLStart('#/drills/pll?setup=invalid')).error);
  assert.ok((await resolvePLLStart('#/drills/pll?scramble=R')).error);
  assert.ok((await resolvePLLStart(`#/drills/pll?scramble=${encodeURIComponent(trial.setup.join(' '))}&cases=Ua`)).error);
  const missing=await resolvePLLStart('#/drills/pll?setup=review:1:0',{historyStore:{pins:{list:[]},records:[]}});
  assert.match(missing.error,/no longer available/);
});
test('a saved PLL position replays a complete long prefix and survives deleting its solve', async () => {
  const prefix = Array.from({length:120},()=>['R',"R'"]).flat();
  const pin={at:12,moveIdx:prefix.length,trainer:'pll',stage:'cp',scramble:trial.setup.join(' '),movesUpTo:prefix,crossFace:'D',yours:[]};
  const result=await resolvePLLStart('#/drills/pll?setup=review:12:240',{historyStore:{pins:{list:[pin]},records:[]}});
  assert.equal(result.recognized.name,'T');
  assert.equal(sameCubeState(result.state,generatePllCase('T',{auf:''}).state),true);
});
