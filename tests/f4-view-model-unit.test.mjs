import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAlgOrbitSegments, buildAlgViewModel, parseAlgRouteContext } from '../src/algs/view-model.js';
import { buildDrillViewModel } from '../src/drills/view-model.js';
import { buildTimerViewModel } from '../src/timer/view-model.js';
import { CASE_COLOR_STORAGE_KEY, CASE_COLORS, readCaseColorSetting, writeCaseColorSetting } from '../src/ui/cube/case-color.js';

test('alg route context decodes local return routes once and drops invalid timing', () => {
  const query = new URLSearchParams({ from: '#/history/123/review/PLL?tab=case', usedAlg: 's.pll.Jb.1', recognitionMs: '735', executionMs: '-1' });
  const context = parseAlgRouteContext(`#/algs/pll/Jb?${query}`);
  assert.equal(context.from, '#/history/123/review/PLL?tab=case');
  assert.equal(context.usedAlg, 's.pll.Jb.1');
  assert.equal(context.recognitionMs, 735);
  assert.equal(context.executionMs, null);
  assert.equal(parseAlgRouteContext('#/algs/pll/Jb?from=https%3A%2F%2Fexample.com').from, null);
  assert.equal(parseAlgRouteContext('#/algs/pll/Jb').recognitionMs, null);
});

test('case colour settings persist through one shared adapter and include fixed face colours', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(writeCaseColorSetting('fixed: red', storage), 'fixed: red');
  assert.equal(readCaseColorSetting(storage), 'fixed: red');
  assert.equal(values.get(CASE_COLOR_STORAGE_KEY), 'fixed: red');
  for (const color of ['white', 'yellow', 'green', 'blue', 'red', 'orange']) assert.ok(CASE_COLORS.includes(`fixed: ${color}`));
});

test('algorithm Orbit groups recognized triggers once and tracks full-turn progress', () => {
  const moves = ["R", "U", "R'", "U'", 'F', 'D', 'R', 'U', "R'"];
  const initial = buildAlgOrbitSegments(moves, 0);
  assert.deepEqual(initial.map(segment => segment.label), ['sexy move', 'moves', 'trigger']);
  assert.equal(initial[0].weight, 4);
  assert.equal(initial[0].state, 'current');
  const finished = buildAlgOrbitSegments(moves, moves.length);
  assert.ok(finished.every(segment => segment.state === 'done' && segment.fill === 1));
});

test('alg and drill view models snapshot playback, colour, and live attempt state as plain data', () => {
  const alg = buildAlgViewModel({ caseId: 'pll/Jb', displayMode: 'your cube', caseColor: 'fixed: red', topColor: 'red', playback: { index: 3, moveCount: 11, playing: true, groups: [{ label: 'sexy move', start: 0, end: 3 }] }, context: { recognitionMs: 712 }, drill: { mode: 'smart', phase: 'running', attempt: 2, match: { status: 'prefix' } } });
  assert.equal(alg.display.mode, 'your cube');
  assert.equal(alg.playback.groups[0].label, 'sexy move');
  assert.equal(alg.drill.match, 'prefix');
  assert.equal(alg.context.executionMs, null);
  assert.doesNotThrow(() => JSON.stringify(alg));
  const drill = buildDrillViewModel({ drill: 'pll', phase: 'case', caseColor: 'any colour', round: { status: 'active', total: 20, combo: 4, answers: [{ caseId: 'Jb', correct: true, ms: 820 }] } });
  assert.equal(drill.round.answered, 1);
  assert.equal(drill.round.answers[0].caseId, 'Jb');
  assert.equal(drill.display.caseColor, 'any colour');
});

test('timer view model describes a single open Orbit and current manual attempt', () => {
  const model = buildTimerViewModel({ snapshot: { phase: 'inspecting', hold: 'ready', elapsedMs: 0, inspectionElapsedMs: 2500 }, scramble: 'R U', scrambleState: 'ready', orbitSegments: [{ key: 'inspection', state: 'current', label: 'inspection', fill: .2 }] });
  assert.equal(model.phase, 'inspecting');
  assert.equal(model.display.orbitShape, 'open');
  assert.equal(model.display.orbitSegments[0].fill, .2);
  assert.doesNotThrow(() => JSON.stringify(model));
});
