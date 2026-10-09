import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

// These run the real CLI against the committed impact-map seed.
const dryRun = (...files) => execFileSync('node', ['scripts/test-affected.mjs', '--dry-run', '--files', ...files], { encoding: 'utf8' });
const browserSelected = (output) => Number(/Browser: (\d+) selected/u.exec(output)?.[1] ?? NaN);

test('a pure-function module selects its unit test and only a few browser cases, not every spec that loads it', () => {
  const output = dryRun('src/smart-cube-mac.js');
  assert.match(output, /tests\/smart-cube-mac-unit\.test\.mjs/u);
  assert.ok(browserSelected(output) < 40, output);
});

test('a module with a spec named after it selects that spec', () => {
  assert.match(dryRun('src/wake-lock.js'), /wake-lock\.spec\.js/u);
});

test('CSS edits never escape to the full suite', () => {
  const output = dryRun('src/brain/css/orbit.css');
  assert.doesNotMatch(output, /full suites?/u);
  assert.match(output, /Browser: \d+ selected/u);
});

test('the main entry no longer means "run everything"', () => {
  const output = dryRun('src/main.js');
  assert.doesNotMatch(output, /full suites?/u);
  assert.match(output, /Browser: \d+ selected/u);
});
