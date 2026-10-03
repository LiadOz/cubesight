import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPlaywrightSelection, changedTestInputs, fingerprintTestInputs, grepPatternForCases } from '../scripts/test-selection.mjs';

test('source coverage selects test IDs and preserves whole-spec selectors', () => {
  const testCases = {
    algOne: { spec: 'tests/algs-page.spec.js', grepTitle: 'tests/algs-page.spec.js Algorithms loads' },
    algTwo: { spec: 'tests/algs-page.spec.js', grepTitle: 'tests/algs-page.spec.js Algorithms filters' },
  };
  const selection = buildPlaywrightSelection({
    wholeSpecs: ['tests/shared.spec.js'],
    coverageEntries: ['algOne'],
    testCases,
  });
  assert.deepEqual(selection.wholeSpecs, ['tests/shared.spec.js']);
  assert.deepEqual([...selection.casesBySpec.get('tests/algs-page.spec.js').keys()], ['algOne']);
  assert.equal(selection.unresolvedCoverage, false);
  const grep = new RegExp(grepPatternForCases([...selection.casesBySpec.get('tests/algs-page.spec.js').values()]));
  assert.equal(grep.test('chromium tests/algs-page.spec.js Algorithms loads'), true);
  assert.equal(grep.test('chromium tests/algs-page.spec.js Algorithms filters'), false);
});

test('missing coverage metadata signals a whole-spec safety fallback', () => {
  const selection = buildPlaywrightSelection({ coverageEntries: ['missing-id'] });
  assert.equal(selection.unresolvedCoverage, true);
});

test('fingerprints detect edits to current test inputs without comparing branch history', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cubesight-input-fingerprint-'));
  try {
    await mkdir(path.join(root, 'tests'), { recursive: true });
    await mkdir(path.join(root, 'tests/helpers'), { recursive: true });
    await writeFile(path.join(root, 'tests/example.spec.js'), 'test(1);');
    await writeFile(path.join(root, 'tests/helpers/coverage-test.js'), 'helper(1);');
    const first = await fingerprintTestInputs(root);
    assert.deepEqual(changedTestInputs(first, await fingerprintTestInputs(root)), []);
    await writeFile(path.join(root, 'tests/example.spec.js'), 'test(2);');
    assert.deepEqual(changedTestInputs(first, await fingerprintTestInputs(root)), ['tests/example.spec.js']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
