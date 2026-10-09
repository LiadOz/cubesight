import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// The change-aware gate selects browser specs from the coverage the shared helper records. A spec that imports
// `test` straight from playwright/test records nothing, so the selector can only find it by file name.
test('every main-suite browser spec takes test from the coverage helper', () => {
  const specs = readdirSync(new URL('./', import.meta.url)).filter(name => name.endsWith('.spec.js'));
  assert.ok(specs.length > 40, 'found the main-suite specs');
  const direct = specs.filter(name => /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*['"]playwright\/test['"]/.test(readFileSync(new URL(name, import.meta.url), 'utf8')));
  assert.deepEqual(direct, [], `import { test } from './helpers/coverage-test.js' instead of playwright/test in: ${direct.join(', ')}`);
});
