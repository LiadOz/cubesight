import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAlgViewModel } from '../src/algs/view-model.js';
import { buildDrillViewModel } from '../src/drills/view-model.js';
import { buildTimerViewModel } from '../src/timer/view-model.js';

test('algorithm view model records the rendered live cube state and finite route context', () => {
  const state = { cubies: [{ id: 'U', position: [0, 1, 0], stickers: { U: 'yellow' } }] };
  const vm = buildAlgViewModel({ caseId: 'pll/H', displayMode: 'your cube', caseColor: 'fixed: red', cubeState: state,
    gyro: { x: 0, y: 0, z: 0, w: 1 }, context: { from: '#/history/123', recognitionMs: 800, executionMs: Infinity } });
  state.cubies[0].stickers.U = 'changed';
  assert.equal(vm.page, 'case');
  assert.equal(vm.display.mode, 'your cube');
  assert.equal(vm.display.caseColor, 'fixed: red');
  assert.equal(vm.display.cubeState.cubies[0].stickers.U, 'yellow');
  assert.deepEqual(vm.display.gyro, { x: 0, y: 0, z: 0, w: 1 });
  assert.equal(vm.context.from, '#/history/123');
  assert.equal(vm.context.recognitionMs, 800);
  assert.equal(vm.context.executionMs, null);
  assert.doesNotThrow(() => JSON.stringify(vm));
});

test('drill round view model carries the shared colour seed and ordered result segments', () => {
  const vm = buildDrillViewModel({ page: 'round', drill: 'pll', phase: 'active', caseColor: 'yellow or white',
    topColor: 'white', caseSeed: 'pll:round-1:3', currentCase: 'H',
    round: { status: 'active', kind: 'cases', total: 20, answers: [{ caseId: 'Jb', correct: true, ms: 800 }, { caseId: 'H', correct: false, ms: NaN }],
      combo: 0, bestCombo: 1, averageMs: 800, segments: [{ key: 'case-1', state: 'good', weight: 1, fill: 1 }] } });
  assert.equal(vm.display.caseColor, 'yellow or white');
  assert.equal(vm.display.topColor, 'white');
  assert.equal(vm.display.caseSeed, 'pll:round-1:3');
  assert.equal(vm.round.answered, 2);
  assert.equal(vm.round.answers[1].ms, null);
  assert.deepEqual(vm.round.segments, [{ key: 'case-1', state: 'good', weight: 1, fill: 1 }]);
  assert.doesNotThrow(() => JSON.stringify(vm));
});

test('manual timer view model keeps one Orbit segment and finite timing values', () => {
  const vm = buildTimerViewModel({ snapshot: { phase: 'inspecting', elapsedMs: 0, inspectionElapsedMs: 2400 },
    scramble: 'R U R\'', scrambleState: 'ready', caseColor: 'white top', orbitSegments: [{ key: 'inspection', state: 'current', label: 'inspection', fill: .2, value: '12' }] });
  assert.equal(vm.phase, 'inspecting');
  assert.equal(vm.scramble, "R U R'");
  assert.equal(vm.display.caseColor, 'white top');
  assert.deepEqual(vm.display.orbitSegments, [{ key: 'inspection', state: 'current', label: 'inspection', value: '12', fill: .2 }]);
  assert.equal(vm.inspectionElapsedMs, 2400);
  assert.doesNotThrow(() => JSON.stringify(vm));
});
