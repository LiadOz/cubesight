import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDrillStart, drillStartHref } from '../src/drills/start-position.js';
import { resolveRoute } from '../src/routes.js';

test('drill start links preserve scrambles, selected cases, and face context', () => {
  const href = drillStartHref('/drills/lookahead', { scramble: "R U R'", cases: ['14', '21'], face: 'D', pseudo: true, from: 'pin' });
  const start = parseDrillStart(href);
  assert.deepEqual(start.moves, ['R', 'U', "R'"]);
  assert.deepEqual(start.cases, ['14', '21']);
  assert.equal(start.face, 'D');
  assert.equal(start.pseudo, true);
  assert.equal(start.from, 'pin');
  assert.equal(resolveRoute(href).hash, href);
});

test('a pin setup is treated as a local review position, not cube notation', () => {
  const start = parseDrillStart('#/drills/lookahead?setup=review%3A1750000000000%3A14');
  assert.deepEqual(start.review, { at: 1750000000000, moveIdx: 14 });
  assert.deepEqual(start.moves, []);
});

test('invalid face/case inputs are bounded and ignored', () => {
  const start = parseDrillStart(`#/drills/oll?face=Q&cases=${'1,'.repeat(120)}2`);
  assert.equal(start.face, null);
  assert.equal(start.cases.length, 100);
});
