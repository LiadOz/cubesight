import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { BANNED } from '../src/copy/terms.js';
import { KEYS, T, fmt } from '../src/copy/terms.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'tests/copy-baseline.json');

async function sourceFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

function literals(source) {
  const found = [];
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const walk = (node, parent = null) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Literal' && typeof node.value === 'string') {
      found.push({ value: node.value, start: node.start, line: node.loc.start.line, importPath: ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(parent?.type) && parent.source === node });
    } else if (node.type === 'TemplateElement') {
      found.push({ value: node.value.cooked ?? node.value.raw, start: node.start, line: node.loc.start.line, importPath: false });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      if (Array.isArray(value)) for (const child of value) walk(child, node);
      else if (value && typeof value === 'object') walk(value, node);
    }
  };
  walk(tree);
  return found;
}

const userFacing = (value, context) => /[A-Za-z].*\s|\s.*[A-Za-z]/s.test(value)
  || /^[A-Z][a-z][A-Za-z]*/.test(value)
  || /(?:textContent|innerHTML|aria-label|title|placeholder|setMessage)\s*(?:=|\()\s*`?\s*$/.test(context);

async function violations() {
  const found = [];
  for (const file of await sourceFiles(path.join(root, 'src'))) {
    // The legacy shell is not imported by the app; protocol adapters and the
    // debug harness contain wire-format words that are not user-facing copy.
    if (file.endsWith('/brain-legacy.js') || /recording-(harness|replay)\.js$/.test(file)) continue;
    const source = await readFile(file, 'utf8');
    for (const token of literals(source)) {
      const context = source.slice(Math.max(0, token.start - 100), token.start);
      const priorLine = source.slice(Math.max(0, source.lastIndexOf('\n', token.start - 1) - 140), token.start);
      const visibleText = token.value
        .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/\b(?:aria-label|title|placeholder|alt)\s*=\s*["']([^"']*)["']/gi, '$1 ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\\n/g, ' ')
        .replace(/\$\{[^{}]*\}/g, ' ');
      const cssOrSelector = /^\s*(?:[.#][\w.#\s-]+|[\w-]+)\s*\{/.test(token.value)
        || /^\s*[-.#][\w.#\s-]+$/.test(visibleText.trim());
      const isVisible = userFacing(visibleText, `${context}${token.start > 0 && source[token.start - 1] === '`' ? '`' : ''}`);
      if (token.importPath || !isVisible || cssOrSelector || /copy-ok:\s*\S/.test(priorLine)) continue;
      const line = token.line;
      for (const [pattern, replacement] of BANNED) {
        const match = visibleText.match(pattern);
        if (!match || token.value.includes('copy-ok:')) continue;
        found.push(`${path.relative(root, file)}:${line}\t${JSON.stringify(token.value.trim().slice(0, 160))}\t→ ${replacement}`);
        break;
      }
    }
  }
  return [...new Set(found)].sort();
}

test('user-facing copy matches the reviewed vocabulary baseline', async () => {
  const actual = await violations();
  if (process.env.UPDATE_COPY_BASELINE === '1') {
    await writeFile(baselinePath, `${JSON.stringify(actual, null, 2)}\n`);
  }
  const expected = JSON.parse(await readFile(baselinePath, 'utf8'));
  assert.deepEqual(actual, expected, 'Update the copy, then remove fixed entries from tests/copy-baseline.json. New entries must be resolved or explained with copy-ok comments.');
});

test('shared terms and formats use the agreed strings', () => {
  assert.deepEqual(Object.values(T.nav), ['solve', 'drills', 'algs', 'progress']);
  assert.deepEqual([T.stat.pb, T.stat.tps, T.stat.ao5, T.stat.ao12], ['PB', 'TPS', 'ao5', 'ao12']);
  assert.equal(fmt.time(12340), '12.34');
  assert.equal(fmt.time(12340, { unit: true }), '12.34 s');
  assert.equal(fmt.time(0), '0.00');
  assert.equal(fmt.time(62_340), '1:02.34');
  assert.equal(fmt.time(NaN), '—');
  assert.equal(fmt.delta(-330), '−0.33');
  assert.equal(fmt.delta(40), '+0.04');
  assert.equal(fmt.penalty({ solveMs: 12970, penalty: '+2' }), '14.97+');
  assert.equal(fmt.penalty({ solveMs: 13200, penalty: 'DNF' }), 'DNF(13.20)');
  assert.equal(fmt.move("R'"), 'R′');
  assert.deepEqual(fmt.parseMoves('R’ r’ R2\nU2\''), ["R'", "Rw'", 'R2', 'U2']);
  assert.equal(fmt.count(1, 'move'), '1 move');
  assert.equal(fmt.count(0, 'move'), '0 moves');
});

test('the shared key map never binds one key to two actions in a state', () => {
  for (const [state, bindings] of Object.entries(KEYS)) {
    assert.equal(new Set(Object.keys(bindings)).size, Object.keys(bindings).length, `${state} duplicates a key`);
  }
  assert.equal(KEYS.global.space, 'next');
  assert.equal(KEYS.global.esc, 'stop');
  assert.equal(KEYS.global.tab, 'settings');
  assert.equal(KEYS.results.r, 'retry');
  assert.equal(KEYS.case.s, 'skip');
  assert.equal(KEYS.idle.enter, 'start');
  assert.equal(KEYS.answered.space, 'next');
  const actionKeys = new Set([...Object.keys(KEYS.global), ...Object.keys(KEYS.case)]);
  const answerKeys = new Set(Object.keys(KEYS.answers));
  for (const key of actionKeys) assert.equal(answerKeys.has(key), false, `${key} cannot be both an answer and a live action`);
  const answeredKeys = new Set([...Object.keys(KEYS.answered), ...Object.keys(KEYS.case)]);
  for (const key of Object.keys(KEYS.answers)) assert.equal(answeredKeys.has(key), false, `${key} answer keys are only live in the open-case state`);
  assert.ok('r' in KEYS.results && 'r' in KEYS.answers, 'r collision is safe because answers/results are separate states');
  assert.ok('b' in KEYS.results && 'b' in KEYS.answers, 'b collision is safe because answers/results are separate states');
  assert.equal('s' in KEYS.results, false);
});
