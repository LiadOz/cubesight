import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildFunctionTable, diffTables, executedFunctionKeys } from '../scripts/test-functions.mjs';
import { changedSpecTests, cssImpact, packBrowser, playwrightArgs, selectTests } from '../scripts/test-select.mjs';
import { deserialize, emptyModel, serialize } from '../scripts/test-impact-store.mjs';

const KEYS = (table) => [...table.functions.keys()];

test('function keys are stable across edits elsewhere and ignore comments and formatting', () => {
  const a = buildFunctionTable('export function one() { return 1; }\nexport function two() { return 2; }\n');
  const b = buildFunctionTable('// header\n\n\nexport function one() { return 1; /* same */ }\nfunction inserted() {}\nexport function two() {\n  return 2;\n}\n');
  assert.deepEqual(KEYS(a), ['one', 'two']);
  const diff = diffTables(a, b);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.added, ['inserted']);
  assert.deepEqual(diffTables(b, a).removed, ['inserted']);
});

test('an edit inside a nested function changes only that function', () => {
  const before = buildFunctionTable('function outer() { const x = 1; return function inner() { return x; }; }');
  const after = buildFunctionTable('function outer() { const x = 1; return function inner() { return x + 1; }; }');
  assert.deepEqual(diffTables(before, after).changed, ['outer>inner']);
});

test('module-scope statements are tracked apart from functions', () => {
  const before = buildFunctionTable('const LIMIT = 3;\nexport function use() { return LIMIT; }\n');
  const after = buildFunctionTable('const LIMIT = 4;\nexport function use() { return LIMIT; }\n');
  const diff = diffTables(before, after);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.scopeChanged, ['$module:LIMIT']);
  assert.ok(after.functions.get('use').refs.has('LIMIT'));
});

test('V8 ranges map to executed function keys', () => {
  const source = 'function hot() { return 1; }\nfunction cold() { return 2; }\nhot();\n';
  const table = buildFunctionTable(source);
  const ranges = [
    { ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }] },
    { ranges: [{ startOffset: source.indexOf('function cold'), endOffset: source.indexOf('\nhot'), count: 0 }] },
  ];
  assert.deepEqual(executedFunctionKeys(table, ranges), ['hot']);
});

test('a spec edit selects only the tests that changed, or the whole spec for shared setup', () => {
  const base = "import { test } from '@playwright/test';\nconst x = 1;\ntest('alpha', async () => { check(1); });\ntest('beta', async () => { check(2); });\n";
  assert.deepEqual(changedSpecTests(base, base.replace('check(2)', 'check(3)')), { whole: false, titles: ['beta'] });
  assert.deepEqual(changedSpecTests(base, `${base}test('gamma', async () => {});\n`), { whole: false, titles: ['gamma'] });
  assert.equal(changedSpecTests(base, base.replace('x = 1', 'x = 2')).whole, true);
  assert.equal(changedSpecTests(null, base).whole, true);
});

test('CSS edits resolve to class tokens and follow custom properties; element rules are global', () => {
  const sheet = '.card { color: var(--ink); }\n.other { color: red; }\n:root { --ink: black; }\n';
  const edited = sheet.replace('--ink: black', '--ink: white');
  const impact = cssImpact(sheet, edited, [sheet]);
  assert.ok(impact.tokens.has('card'));
  assert.ok(!impact.tokens.has('other'));
  assert.equal(cssImpact('body { margin: 0 }', 'body { margin: 1px }').global, true);
  assert.deepEqual([...cssImpact('.a { color: red }', '.a { color: blue }').tokens], ['a']);
  assert.equal(cssImpact('.a { color: red }', '.a { color: red } /* note */').touched, 0);
});

async function project(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cubesight-select-'));
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  }
  return root;
}

function model(tests, functions = {}, modules = {}) {
  const m = emptyModel();
  for (const [id, spec] of Object.entries(tests)) m.tests.set(id, { spec, grepTitle: `${path.basename(spec)} ${id}`, titlePath: ['', '', path.basename(spec), id], durationMs: 1000 });
  for (const [file, byKey] of Object.entries(functions)) m.functions.set(file, new Map(Object.entries(byKey).map(([key, ids]) => [key, new Set(ids)])));
  for (const [file, ids] of Object.entries(modules)) m.modules.set(file, new Set(ids));
  return m;
}

const SRC = 'export function alpha() { return 1; }\nexport function beta() { return 2; }\nconst LIMIT = 3;\nexport function gamma() { return LIMIT; }\n';
const files = { 'src/feature.js': SRC, 'tests/feature.spec.js': "test('one', () => {});", 'tests/merge-smoke.spec.js': "test('smoke', () => {});", 'tests/other.spec.js': "test('two', () => {});" };
const impact = () => model(
  { one: 'tests/feature.spec.js', two: 'tests/other.spec.js', smoke: 'tests/merge-smoke.spec.js' },
  { 'src/feature.js': { alpha: ['one'], beta: ['two'], gamma: ['one', 'two'] } },
  { 'src/feature.js': ['one', 'two', 'smoke'] },
);
const change = (file, oldText, newText) => ({ file, status: 'M', whole: false, oldText, newText });
const ids = (selection) => [...selection.items.values()].filter((item) => !item.floor).map((item) => item.id ?? item.key).sort();

test('a function edit selects the tests that executed that function and not those that merely loaded the module', async () => {
  const root = await project(files);
  try {
    const edited = SRC.replace('return 1', 'return 10');
    await writeFile(path.join(root, 'src/feature.js'), edited);
    const selection = await selectTests({ root, model: impact(), changes: [change('src/feature.js', SRC, edited)] });
    assert.deepEqual(ids(selection), ['one']);
    assert.equal(selection.warnings.length, 0);
    assert.ok([...selection.items.values()].some((item) => item.floor && item.spec === 'tests/merge-smoke.spec.js'), 'smoke floor stays');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a module-scope constant selects the functions that read it', async () => {
  const root = await project(files);
  try {
    const edited = SRC.replace('LIMIT = 3', 'LIMIT = 4');
    await writeFile(path.join(root, 'src/feature.js'), edited);
    const selection = await selectTests({ root, model: impact(), changes: [change('src/feature.js', SRC, edited)] });
    assert.deepEqual(ids(selection), ['one', 'two']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a comment-only edit selects nothing beyond the smoke floor, and says why', async () => {
  const root = await project(files);
  try {
    const edited = `// note\n${SRC}`;
    await writeFile(path.join(root, 'src/feature.js'), edited);
    const selection = await selectTests({ root, model: impact(), changes: [change('src/feature.js', SRC, edited)] });
    assert.deepEqual(ids(selection), []);
    assert.match(selection.files[0].summary, /comments/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a new module with no history never selects silently: static rule, then a loud warning', async () => {
  const root = await project({ ...files, 'src/other-thing.js': 'export function z() {}', 'tests/other-thing.spec.js': "test('named', () => {});" });
  try {
    const selection = await selectTests({ root, model: impact(), changes: [{ file: 'src/other-thing.js', status: 'A', whole: false, oldText: null, newText: 'export function z() {}' }] });
    assert.ok([...selection.items.keys()].some((key) => key.includes('other-thing.spec.js')), 'the spec named after the module is selected');
    assert.ok(selection.warnings.some((text) => /new/u.test(text)));
    const lonely = await project({ ...files, 'src/untested.js': 'export function z() {}' });
    try {
      const none = await selectTests({ root: lonely, model: impact(), changes: [{ file: 'src/untested.js', status: 'A', whole: false, oldText: null, newText: 'export function z() {}' }] });
      assert.equal(none.smokeOnly, true);
      assert.ok(none.warnings.some((text) => /NO RELEVANT BROWSER TESTS/u.test(text)));
    } finally { await rm(lonely, { recursive: true, force: true }); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a new function is selected through the changed function that calls it', async () => {
  const root = await project(files);
  try {
    const edited = SRC.replace('return 2', 'return helper()') + 'function helper() { return 5; }\n';
    await writeFile(path.join(root, 'src/feature.js'), edited);
    const selection = await selectTests({ root, model: impact(), changes: [change('src/feature.js', SRC, edited)] });
    assert.deepEqual(ids(selection), ['two']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a deleted function selects the tests that used to run it', async () => {
  const root = await project(files);
  try {
    const edited = SRC.replace('export function beta() { return 2; }\n', '');
    await writeFile(path.join(root, 'src/feature.js'), edited);
    const selection = await selectTests({ root, model: impact(), changes: [change('src/feature.js', SRC, edited)] });
    assert.deepEqual(ids(selection), ['two']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a CSS edit reaches the functions that mention the class', async () => {
  const css = '.panel { color: red; }\n';
  const root = await project({ ...files, 'src/feature.js': `${SRC}export function draw() { return '<div class="panel">'; }\n`, 'src/x.css': css });
  try {
    const m = impact();
    m.functions.get('src/feature.js').set('draw', new Set(['one']));
    const selection = await selectTests({ root, model: m, changes: [change('src/x.css', css, '.panel { color: blue; }\n')] });
    assert.deepEqual(ids(selection), ['one']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('packing orders by relevance, defers instead of dropping, and always keeps the floor', () => {
  const item = (key, spec, durationMs, tier, extra = {}) => ({ key, id: key, kind: 'case', spec, grepTitle: `${spec} ${key}`, durationMs, tier, reasons: [], ...extra });
  const items = [item('floor', 'tests/merge-smoke.spec.js', 9000, -2, { floor: true }), item('direct', 'tests/a.spec.js', 8000, 0), item('related', 'tests/b.spec.js', 8000, 1), item('weak', 'tests/c.spec.js', 8000, 2)];
  const packed = packBrowser(items, { budgetMs: 17_000, workers: 1 });
  assert.deepEqual(packed.run.map((entry) => entry.key), ['floor', 'direct']);
  assert.deepEqual(packed.deferred.map((entry) => entry.key), ['related', 'weak']);
  assert.equal(packBrowser(items, { budgetMs: 1, workers: 1 }).run.length, 1);
  const { specs, grep } = playwrightArgs(packed.run);
  assert.deepEqual(specs, ['tests/a.spec.js', 'tests/merge-smoke.spec.js']);
  assert.ok(new RegExp(grep).test('tests/a.spec.js direct'));
});

test('the impact map round-trips, including complement encoding of hot functions', () => {
  const m = model({ a: 'tests/x.spec.js', b: 'tests/x.spec.js', c: 'tests/y.spec.js' }, { 'src/m.js': { hot: ['a', 'b', 'c'], cold: ['b'] } }, { 'src/m.js': ['a', 'b', 'c'] });
  const back = deserialize(JSON.parse(JSON.stringify(serialize(m))));
  assert.deepEqual([...back.functions.get('src/m.js').get('hot')].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...back.functions.get('src/m.js').get('cold')], ['b']);
  assert.equal(back.tests.size, 3);
});
