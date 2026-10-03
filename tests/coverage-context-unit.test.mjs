import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCoverageObservations } from './helpers/coverage-test.js';

test('multiple browser contexts union runtime files into the same test coverage record', () => {
  const previous = { testId: 'test-1', retry: 0, files: ['src/algs/page.js'], coverageContexts: 1 };
  const next = { testId: 'test-1', retry: 0, files: ['src/shared/state.js', 'src/algs/page.js'] };
  assert.deepEqual(mergeCoverageObservations(previous, next), {
    testId: 'test-1',
    retry: 0,
    files: ['src/algs/page.js', 'src/shared/state.js'],
    coverageContexts: 2,
  });
});

test('coverage observations from a new retry replace the prior retry record', () => {
  const previous = { testId: 'test-1', retry: 0, files: ['src/old.js'], coverageContexts: 1 };
  const next = { testId: 'test-1', retry: 1, files: ['src/new.js'] };
  assert.deepEqual(mergeCoverageObservations(previous, next), {
    testId: 'test-1', retry: 1, files: ['src/new.js'], coverageContexts: 1,
  });
});
