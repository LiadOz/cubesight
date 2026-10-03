import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaseDisplayMap, displayColorKey, displayFaceColor, logicalColorKey } from '../src/trainers/case-display.js';

const orientation = Object.freeze({ U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' });

test('corner answer mapping follows every fixed case top and reverses to the logical answer', () => {
  for (const color of ['white', 'yellow', 'green', 'blue', 'red', 'orange']) {
    const caseId = `corner/${color}/stable-id`;
    const before = structuredClone(orientation);
    const map = createCaseDisplayMap(orientation, `fixed: ${color}`, `corner-case-${color}`);
    const shown = displayColorKey(orientation.U, map);
    assert.equal(shown, color, `${color} must be the visible top color`);
    assert.equal(displayFaceColor('U', `fixed: ${color}`, `corner-case-${color}`), color);
    assert.equal(caseId, `corner/${color}/stable-id`, 'display mapping must leave case identity intact');
    assert.deepEqual(orientation, before, 'display mapping must not mutate logical case orientation');
    assert.equal(logicalColorKey(shown, map), orientation.U, `${color} answer must verify against its original logical sticker`);
    for (const logical of Object.values(orientation)) {
      assert.equal(logicalColorKey(displayColorKey(logical, map), map), logical, `round trip for ${logical} with ${color} top`);
    }
  }
});

test('any-colour case display is stable for one case seed', () => {
  const first = createCaseDisplayMap(orientation, 'any colour', 'case:42');
  const second = createCaseDisplayMap(orientation, 'any colour', 'case:42');
  assert.deepEqual(first, second);
});
