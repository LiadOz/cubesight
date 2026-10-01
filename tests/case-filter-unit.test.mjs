import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCaseFilter } from '../src/drills/case-filter.js';

test('case filters canonicalize identifiers and deduplicate selected cases', () => {
  assert.deepEqual(parseCaseFilter(['fr', 'FR', 'bl'], ['FR', 'BR', 'BL', 'FL']), {
    requested: true, valid: true, values: ['FR', 'BL'], invalid: [],
  });
});

test('an empty filter means the drill default while unknown values remain visible to callers', () => {
  assert.deepEqual(parseCaseFilter([], ['U', 'D']), {
    requested: false, valid: true, values: [], invalid: [],
  });
  assert.deepEqual(parseCaseFilter(['X', 'south'], ['U', 'D']), {
    requested: true, valid: false, values: [], invalid: ['X', 'south'],
  });
});
