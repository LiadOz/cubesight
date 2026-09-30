import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_PATHS, chooseHome, keyScope, parseHash, resolveRoute } from '../src/routes.js';
import { NAV_ITEMS, NAV_FOR_TOOL } from '../src/copy/nav.js';

test('chooseHome: desktop solves, a phone without a cube drills, a cube always solves', () => {
  assert.equal(chooseHome({ isPhone: false, cubeConnected: false }), '/solve');
  assert.equal(chooseHome({ isPhone: false, cubeConnected: true }), '/solve');
  assert.equal(chooseHome({ isPhone: true, cubeConnected: false }), '/drills');
  assert.equal(chooseHome({ isPhone: true, cubeConnected: true }), '/solve');
  assert.equal(chooseHome(), '/solve');
});

test('parseHash splits path and query and drops a trailing slash', () => {
  assert.deepEqual(parseHash('#/drills/pll?cases=Aa,Ab&mode=mix'), { path: '/drills/pll', query: '?cases=Aa,Ab&mode=mix' });
  assert.deepEqual(parseHash('#/drills/'), { path: '/drills', query: '' });
  assert.deepEqual(parseHash('#/algs?'), { path: '/algs', query: '' });
  assert.deepEqual(parseHash(''), { path: '', query: '' });
  assert.deepEqual(parseHash('#/'), { path: '/', query: '' });
});

test('resolveRoute: canonical hashes stay, old hashes redirect and keep their query', () => {
  const cases = [
    ['#/solve', 'brain', '#/solve'],
    ['#/drills', 'drills', '#/drills'],
    ['#/drills/corners?mode=three', 'corner', '#/drills/corners?mode=three'],
    ['#/algs', 'algs', '#/algs'],
    ['#/progress', 'progress', '#/progress'],
    ['#/dev/studio', 'smart', '#/dev/studio'],
    ['#/brain', 'brain', '#/solve'],
    ['#/corners?round=10', 'corner', '#/drills/corners?round=10'],
    ['#/f2l?drill=scan', 'f2l', '#/drills/f2l?drill=scan'],
    ['#/pll-recognition?cases=Ga,Gb', 'pll', '#/drills/pll?cases=Ga,Gb'],
    ['#/pll', 'pll', '#/drills/pll'],
    ['#/cross-scout?scramble=R+U', 'scout', '#/drills/scout?scramble=R+U'],
    ['#/scout', 'scout', '#/drills/scout'],
    ['#/debug', 'smart', '#/dev/studio'],
    ['#/smart-cube', 'smart', '#/dev/studio'],
  ];
  for (const [hash, tool, expected] of cases) assert.deepEqual(resolveRoute(hash), { tool, hash: expected }, hash);
});

test('resolveRoute: empty and unknown hashes resolve to home for the context', () => {
  for (const hash of ['', '#', '#/', '#/nope', '#/drills/nope']) {
    assert.equal(resolveRoute(hash, { isPhone: false, cubeConnected: false }).hash, '#/solve', hash);
    assert.equal(resolveRoute(hash, { isPhone: true, cubeConnected: false }).hash, '#/drills', hash);
    assert.equal(resolveRoute(hash, { isPhone: true, cubeConnected: true }).hash, '#/solve', hash);
  }
  assert.equal(resolveRoute('#/nope?x=1', { isPhone: true }).hash, '#/drills?x=1');
});

test('keyScope: only the corner and F2L drills own the global drill keys', () => {
  assert.equal(keyScope('corner'), 'corner');
  assert.equal(keyScope('f2l'), 'f2l');
  for (const tool of Object.keys(TOOL_PATHS).filter(tool => tool !== 'corner' && tool !== 'f2l')) assert.equal(keyScope(tool), null, tool);
});

test('the nav is solve, drills, algs, progress and every nav item is a route', () => {
  assert.deepEqual(NAV_ITEMS.map(item => item.label), ['solve', 'drills', 'algs', 'progress']);
  for (const item of NAV_ITEMS) assert.equal(resolveRoute(item.href).hash, item.href);
  for (const tool of Object.keys(TOOL_PATHS)) assert.ok(tool in NAV_FOR_TOOL, tool);
});
