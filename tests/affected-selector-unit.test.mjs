import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('algs page changes select alg specs without selecting timer specs', () => {
  const output = execFileSync('node', ['scripts/test-affected.mjs', '--files', 'src/algs/page.js', '--dry-run'], { encoding: 'utf8' });
  assert.match(output, /tests\/algs-page\.spec\.js/u);
  assert.doesNotMatch(output, /tests\/timer(?:-route)?\.spec\.js/u);
});

test('shared CSS changes activate the full-suite safety valve', () => {
  const output = execFileSync('node', ['scripts/test-affected.mjs', '--files', 'src/brain/css/orbit.css', '--dry-run'], { encoding: 'utf8' });
  assert.match(output, /full suites/u);
});
