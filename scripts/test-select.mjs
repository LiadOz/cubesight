// Change-aware selection of browser tests.
//
// Input: the diff (base -> head or working tree) and the impact map (which tests
// executed which functions). Output: browser tests, ranked by how directly the
// change reaches them, plus every warning needed to trust (or distrust) the result.
//
// Nothing here knows the shape of any source file: it works from coverage data,
// so it keeps working when functions move between modules.
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import { buildFunctionTable, diffTables, parseModule } from './test-functions.mjs';

export const SMOKE_SPEC = 'tests/merge-smoke.spec.js';
export const DEFAULT_CASE_MS = 3000;
const TIER_LABEL = ['direct hit', 'related', 'broad', 'static', 'unmapped'];

// ------------------------------------------------------------------------- git
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const showAt = (root, ref, file) => { try { return git(root, ['show', `${ref}:${file}`]); } catch { return null; } };
const TEXT = /\.(?:m?js|css|html|json|md|svg|toml|ya?ml)$/u;
const ignored = (file) => /^(?:\.agents|test-results|node_modules|dist)\//u.test(file);

/**
 * The changed files with old and new text. `head` null means the working tree,
 * so committed-since-base, staged, unstaged and untracked work are all included.
 * `files` forces a list and treats each as wholly changed (dry-run what-if).
 */
export async function gitChanges({ root, base, head = null, files = null }) {
  const readNew = async (file) => {
    if (head) return showAt(root, head, file);
    try { return await readFile(path.join(root, file), 'utf8'); } catch { return null; }
  };
  const rows = [];
  if (files) for (const file of files) rows.push(['M', file, true]);
  else {
    const out = git(root, ['diff', '--name-status', '--no-renames', ...(head ? [base, head] : [base])]);
    for (const line of out.split('\n').filter(Boolean)) {
      const [status, file] = line.split('\t');
      rows.push([status[0], file, false]);
    }
    if (!head) for (const file of git(root, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) rows.push(['A', file, false]);
  }
  const changes = [];
  for (const [status, file, whole] of rows) {
    if (ignored(file)) continue;
    const text = TEXT.test(file);
    changes.push({
      file, status, whole,
      oldText: text && status !== 'A' ? showAt(root, files ? 'HEAD' : base, file) : null,
      newText: text && status !== 'D' ? await readNew(file) : null,
    });
  }
  return changes;
}

export function mergeBase(root, trunk) {
  try { return git(root, ['merge-base', 'HEAD', trunk]).trim(); } catch { return git(root, ['rev-parse', 'HEAD']).trim(); }
}

// ------------------------------------------------------------- project reading
function projectReader(root, head) {
  const cache = new Map();
  const read = async (file) => {
    if (!cache.has(file)) {
      let text = null;
      if (head) text = showAt(root, head, file);
      else { try { text = await readFile(path.join(root, file), 'utf8'); } catch { text = null; } }
      cache.set(file, text);
    }
    return cache.get(file);
  };
  const walk = async (directory) => {
    const files = [];
    let entries;
    try { entries = await readdir(path.join(root, directory), { withFileTypes: true }); } catch { return files; }
    for (const entry of entries) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') files.push(...await walk(relative)); } else files.push(relative);
    }
    return files;
  };
  let listing;
  const list = async () => {
    if (!listing) {
      listing = head ? git(root, ['ls-tree', '-r', '--name-only', head, 'src', 'tests']).split('\n').filter(Boolean)
        : [...await walk('src'), ...await walk('tests')];
    }
    return listing;
  };
  return { read, list };
}

const stem = (file) => {
  const base = path.posix.basename(file).replace(/\.[^.]+$/u, '');
  return base === 'index' ? path.posix.basename(path.posix.dirname(file)) : base;
};

function resolveSpecifier(from, specifier, fileSet) {
  if (!specifier.startsWith('.')) return null;
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  return [joined, `${joined}.js`, `${joined}.mjs`, `${joined}/index.js`].find((candidate) => fileSet.has(candidate)) ?? null;
}

function importsOf(text, from, fileSet) {
  const out = [];
  let parsed;
  try { parsed = parseModule(text).ast; } catch { return out; }
  for (const node of parsed.body) {
    if (node.type === 'ImportDeclaration' || ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source)) {
      const target = resolveSpecifier(from, node.source.value, fileSet);
      if (!target) continue;
      const names = [];
      let namespace = false;
      if (node.type === 'ImportDeclaration') {
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportNamespaceSpecifier') { namespace = true; names.push({ imported: '*', local: spec.local.name }); }
          else names.push({ imported: spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.imported.name, local: spec.local.name });
        }
      } else namespace = true; // a re-export: treat as using everything
      out.push({ target, names, namespace, reexport: node.type !== 'ImportDeclaration' });
    }
  }
  return out;
}

// ----------------------------------------------------------- spec test parsing
const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail', 'slow']);
function describeKind(callee) {
  const chain = [];
  let node = callee;
  while (node.type === 'MemberExpression') { chain.unshift(node.property.name ?? node.property.value); node = node.object; }
  if (node.type !== 'Identifier' || (node.name !== 'test' && node.name !== 'it')) return null;
  if (!chain.length) return 'test';
  if (chain[0] === 'describe') return 'describe';
  return chain.every((part) => TEST_MODIFIERS.has(part)) ? 'test' : null;
}

/** Map of describe-chain+title -> { title, dynamic, hash, range } and the spec text with test calls elided. */
export function parseSpecTests(text) {
  const { ast } = parseModule(text);
  const tests = new Map();
  const ranges = [];
  const visit = (node, chain) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'CallExpression') {
      const kind = describeKind(node.callee);
      const first = node.arguments[0];
      const literal = first && (first.type === 'Literal' && typeof first.value === 'string' ? first.value
        : first.type === 'TemplateLiteral' && first.expressions.length === 0 ? first.quasis[0].value.cooked : null);
      if (kind === 'test') {
        const key = `${chain.join(' > ')} :: ${first ? text.slice(first.start, first.end) : '?'}`;
        let k = key; let n = 1;
        while (tests.has(k)) { n += 1; k = `${key}#${n}`; }
        tests.set(k, { title: literal, dynamic: literal === null, text: text.slice(node.start, node.end).replace(/\s+/gu, ' ') });
        const statementEnd = text[node.end] === ';' ? node.end + 1 : node.end; // elide the statement, not just the call
        ranges.push([node.start, statementEnd]);
        return;
      }
      if (kind === 'describe') {
        for (const argument of node.arguments) visit(argument, [...chain, literal ?? '?']);
        return;
      }
    }
    for (const field of Object.keys(node)) {
      if (field === 'type' || field === 'start' || field === 'end') continue;
      const value = node[field];
      if (Array.isArray(value)) for (const child of value) visit(child, chain);
      else if (value && typeof value.type === 'string') visit(value, chain);
    }
  };
  visit(ast, []);
  let outside = '';
  let cursor = 0;
  for (const [from, to] of ranges.sort((a, b) => a[0] - b[0])) { outside += text.slice(cursor, from); cursor = to; }
  outside += text.slice(cursor);
  return { tests, outsideRaw: outside, outside: outside.replace(/\/\*[\s\S]*?\*\/|(?<![:'"`\\])\/\/[^\n]*/gu, ' ').replace(/\s+/gu, ' ').trim() };
}

/** Which tests of a changed spec need to run: titles, or 'whole' when that cannot be told. */
export function changedSpecTests(oldText, newText) {
  if (oldText == null) return { whole: true, why: 'new spec' };
  let before; let after;
  try { before = parseSpecTests(oldText); after = parseSpecTests(newText); } catch { return { whole: true, why: 'unparsable spec' }; }
  const titles = new Set();
  for (const [key, test] of after.tests) {
    const prior = before.tests.get(key);
    if (prior && prior.text === test.text) continue;
    if (test.dynamic) return { whole: true, why: 'a generated test changed' };
    titles.add(test.title);
  }
  if (before.outside !== after.outside) {
    // Shared setup changed. Follow it: the helpers and constants that changed, and the tests that use them.
    let diff; let table;
    try {
      const older = buildFunctionTable(before.outsideRaw);
      table = buildFunctionTable(after.outsideRaw);
      diff = diffTables(older, table);
    } catch { return { whole: true, why: 'shared setup in the spec changed' }; }
    const names = new Set();
    for (const key of [...diff.changed, ...diff.added, ...diff.removed]) {
      const last = key.slice(key.lastIndexOf('>') + 1).replace(/#\d+$/u, '');
      if (/^(?:cb:|anon|returned)/u.test(last) || last.includes('.')) return { whole: true, why: 'shared setup in the spec changed (not attributable to a helper)' };
      names.add(last);
    }
    for (const key of [...diff.scopeChanged, ...diff.scopeRemoved]) {
      const item = table.scope.get(key);
      if (!item || item.kind === 'effect') return { whole: true, why: 'shared setup in the spec changed (setup statement)' };
      for (const name of item.declares) names.add(name);
    }
    // Helpers that call a changed helper are changed too.
    for (let grew = true; grew;) {
      grew = false;
      for (const fn of table.functions.values()) {
        if (fn.parent || names.has(fn.key)) continue;
        if ([...names].some((name) => fn.refs.has(name))) { names.add(fn.key); grew = true; }
      }
    }
    if (!names.size) return { whole: false, titles: [...titles] };
    const pattern = new RegExp(`(?<![\\w$])(?:${[...names].map((name) => name.replace(/[$]/gu, '\\$')).join('|')})(?![\\w$])`, 'u');
    for (const test of after.tests.values()) {
      if (!pattern.test(test.text)) continue;
      if (test.dynamic) return { whole: true, why: 'a generated test uses changed setup' };
      titles.add(test.title);
    }
    if (!titles.size) return { whole: true, why: 'shared setup in the spec changed (no test uses it by name)' };
  }
  return { whole: false, titles: [...titles] };
}

// ------------------------------------------------------------------------- CSS
function cssSignatures(text) {
  const rules = new Map();
  if (text == null) return rules;
  let root;
  try { root = postcss.parse(text); } catch { return null; }
  root.walkRules((rule) => {
    let context = '';
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) context = `${parent.type === 'atrule' ? `@${parent.name} ${parent.params}` : parent.selector} {${context}`;
    const key = `${context}|${rule.selector}`;
    const body = rule.nodes.filter((node) => node.type === 'decl').map((node) => `${node.prop}:${node.value}`).join(';');
    rules.set(key, `${rules.get(key) ?? ''}${body}`);
  });
  return rules;
}

const selectorTokens = (selector) => [...selector.matchAll(/[.#]([A-Za-z_][\w-]*)/gu)].map((match) => match[1]);

/** Class and id names a CSS edit can affect, custom properties it changes, and whether it is global (no token). */
export function cssImpact(oldText, newText, otherCss = []) {
  const before = cssSignatures(oldText);
  const after = cssSignatures(newText);
  if (before === null || after === null) return { tokens: new Set(), global: true, reason: 'unparsable CSS' };
  const tokens = new Set();
  const properties = new Set();
  let global = false;
  const touched = [];
  for (const [key, body] of after) if (before.get(key) !== body) touched.push([key, body, before.get(key) ?? '']);
  for (const [key, body] of before) if (!after.has(key)) touched.push([key, '', body]);
  for (const [key, ...bodies] of touched) {
    const selector = key.slice(key.lastIndexOf('|') + 1);
    const found = selectorTokens(selector);
    for (const token of found) tokens.add(token);
    if (!found.length) global = true;
    for (const body of bodies) for (const match of body.matchAll(/(--[\w-]+):/gu)) properties.add(match[1]);
  }
  // A changed custom property reaches every rule that reads it.
  for (const property of properties) {
    for (const text of otherCss) {
      const root = (() => { try { return postcss.parse(text); } catch { return null; } })();
      root?.walkRules((rule) => {
        if (rule.nodes.some((node) => node.type === 'decl' && node.value.includes(`var(${property}`))) {
          const found = selectorTokens(rule.selector);
          for (const token of found) tokens.add(token);
        }
      });
    }
  }
  return { tokens, global: global && tokens.size === 0, hadGlobalRules: global, properties, touched: touched.length };
}

// ------------------------------------------------------------------- selection
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * @param {object} args
 * @param {string} args.root
 * @param {Array} args.changes   from gitChanges
 * @param {object} args.model    impact model (test-impact-store)
 * @param {string|null} args.head ref the new text comes from, null = working tree
 * @param {Record<string,string>} args.specHashes current content hash per spec
 */
export async function selectTests({ root, changes, model, head = null, specHashes = {} }) {
  const reader = projectReader(root, head);
  const files = await reader.list();
  const fileSet = new Set(files);
  const specs = files.filter((file) => /^tests\/(?!layout\/|snapshots\/).*\.spec\.js$/u.test(file));
  const result = { items: new Map(), warnings: [], notes: [], files: [], smokeOnly: false, unit: new Set() };
  const note = (text) => result.notes.push(text);
  const warn = (text) => result.warnings.push(text);

  // ---- items
  const itemFor = (id) => {
    const info = model.tests.get(id);
    if (!info) return null;
    if (!result.items.has(id)) result.items.set(id, { key: id, kind: 'case', id, spec: info.spec, grepTitle: info.grepTitle, durationMs: info.durationMs || DEFAULT_CASE_MS, tier: 9, reasons: [] });
    return result.items.get(id);
  };
  const bump = (item, tier, reason) => {
    item.tier = Math.min(item.tier, tier);
    item.score = (item.seen ??= new Set()).add(reason).size; // distinct changed things this test reaches
    if (item.reasons.length < 3 && !item.reasons.includes(reason)) item.reasons.push(reason);
  };
  // A function that a large share of the suite executes (route switching, shared renderers) says little about
  // which tests matter: those hits are 'broad', sampled with leftover budget instead of ranked as direct hits.
  const broadAbove = Math.max(25, Math.round(model.tests.size * 0.1));
  const addIds = (ids, tier, reason) => {
    let count = 0;
    const broad = ids && ids.size > broadAbove && tier >= 0 && tier < 2;
    const effective = broad ? 2 : tier;
    const why = broad ? `${reason} (broad: ${ids.size} tests run it)` : reason;
    for (const id of ids ?? []) { const item = itemFor(id); if (item) { bump(item, effective, why); count += 1; } }
    return count;
  };
  const specText = new Map();
  const readSpec = async (spec) => { if (!specText.has(spec)) specText.set(spec, await reader.read(spec)); return specText.get(spec); };
  const countTests = async (spec) => ((await readSpec(spec)) ?? '').match(/^\s*(?:test|it)(?:\.\w+)*\(/gmu)?.length ?? 5;
  const addSpec = async (spec, tier, reason) => {
    const known = [...model.tests].filter(([, info]) => info.spec === spec).map(([id]) => id);
    const stale = specHashes[spec] !== undefined && model.specHashes[spec] !== specHashes[spec];
    if (known.length && !stale) return addIds(known, tier, reason);
    const key = `spec:${spec}`;
    if (!result.items.has(key)) {
      const knownMs = known.reduce((sum, id) => sum + (model.tests.get(id).durationMs || DEFAULT_CASE_MS), 0);
      result.items.set(key, { key, kind: 'spec', spec, durationMs: knownMs || (await countTests(spec)) * DEFAULT_CASE_MS, tier: 9, reasons: [] });
    }
    bump(result.items.get(key), tier, reason);
    return 1;
  };
  const addTitle = async (spec, title, tier, reason) => {
    const known = [...model.tests].filter(([, info]) => info.spec === spec && info.titlePath?.[info.titlePath.length - 1] === title).map(([id]) => id);
    if (known.length) return addIds(known, tier, reason);
    const key = `title:${spec}:${title}`;
    if (!result.items.has(key)) result.items.set(key, { key, kind: 'title', spec, title, durationMs: DEFAULT_CASE_MS, tier: 9, reasons: [] });
    bump(result.items.get(key), tier, reason);
    return 1;
  };

  // ---- source tables and importers
  const tables = new Map();
  const tableOf = async (file) => {
    if (!tables.has(file)) {
      const text = await reader.read(file);
      let table = null;
      try { table = text == null ? null : buildFunctionTable(text); } catch { table = null; }
      tables.set(file, table);
    }
    return tables.get(file);
  };
  let importerIndex = null;
  const importersOf = async (target) => {
    if (!importerIndex) {
      importerIndex = new Map();
      const srcJs = files.filter((file) => /^src\/.*\.m?js$/u.test(file));
      const texts = await Promise.all(srcJs.map((file) => reader.read(file)));
      srcJs.forEach((file, i) => {
        const text = texts[i];
        if (!text) return;
        // Cheap pre-filter: only parse files that mention any relative import.
        if (!/from\s*['"]\.|import\s*['"]\./u.test(text) && !/export\s*\*\s*from/u.test(text)) return;
        for (const edge of importsOf(text, file, fileSet)) {
          if (!importerIndex.has(edge.target)) importerIndex.set(edge.target, []);
          importerIndex.get(edge.target).push({ importer: file, ...edge });
        }
      });
    }
    return importerIndex.get(target) ?? [];
  };

  const baseName = (key) => {
    const last = key.slice(key.lastIndexOf('>') + 1).replace(/#\d+$/u, '');
    if (/^(?:cb:|anon|returned)/u.test(last)) return [];
    return last.includes('.') ? [last.split('.').pop(), last.split('.')[0]] : [last];
  };

  // Tests that executed functions which reference `names`, in this file and in its importers.
  const dependents = async (file, names, { exclude = new Set(), cross = true } = {}) => {
    const found = [];
    const wanted = new Set(names);
    const table = await tableOf(file);
    for (const [key, fn] of table?.functions ?? []) {
      if (exclude.has(key)) continue;
      if ([...wanted].some((name) => fn.refs.has(name))) found.push({ file, key });
    }
    if (cross) {
      for (const edge of await importersOf(file)) {
        const locals = new Set(edge.names.filter((entry) => edge.namespace || entry.imported === '*' || wanted.has(entry.imported) || (entry.imported === 'default' && wanted.has('default'))).map((entry) => entry.local));
        if (!locals.size) continue;
        const importerTable = await tableOf(edge.importer);
        for (const [key, fn] of importerTable?.functions ?? []) if ([...locals].some((name) => fn.refs.has(name))) found.push({ file: edge.importer, key });
      }
    }
    return found;
  };
  const testsOf = ({ file, key }) => model.functions.get(file)?.get(key);

  const staticFallback = async (file, why) => {
    // New or unmeasured module: specs named after it, and tests that import it.
    const wanted = new Set([stem(file), `${path.posix.basename(path.posix.dirname(file))}-${stem(file)}`].map((value) => value.toLowerCase()));
    let count = 0;
    for (const spec of specs) {
      const name = path.posix.basename(spec).replace(/\.spec\.js$/u, '').toLowerCase();
      if ([...wanted].some((value) => value === name || (value.length >= 5 && (name.includes(value) || (name.length >= 5 && value.includes(name)))))) {
        count += await addSpec(spec, 3, `spec named like ${path.posix.basename(file)}`);
      }
    }
    for (const spec of specs) {
      const text = await readSpec(spec);
      if (text && importsOf(text, spec, fileSet).some((edge) => edge.target === file)) count += await addSpec(spec, 1, `imports ${file}`);
    }
    if (!count) warn(`${file}: ${why}; no spec is named after it or imports it.`);
    return count;
  };

  // ---- per-file selection
  const mentions = new Set();
  let functionsByName = null;
  const specChangeSelected = new Set();
  let sourceTouched = false;
  for (const change of changes) {
    const { file } = change;
    const entry = { file, kind: 'other', summary: '', hits: 0 };
    result.files.push(entry);
    const before = result.items.size;
    const tally = () => { entry.hits = result.items.size - before; };

    if (/^tests\/(?!layout\/|snapshots\/).*\.spec\.js$/u.test(file) && change.newText != null) {
      entry.kind = 'spec';
      const plan = changedSpecTests(change.whole ? change.newText : change.oldText, change.newText);
      const forced = change.whole;
      if (forced || plan.whole) { entry.summary = `whole spec (${forced ? 'forced' : plan.why})`; await addSpec(file, -1, 'changed spec'); }
      else {
        entry.summary = `${plan.titles.length} changed test(s)`;
        for (const title of plan.titles) await addTitle(file, title, -1, 'changed test');
      }
      specChangeSelected.add(file);
      tally(); continue;
    }
    if (/^tests\/(?:layout|snapshots)\//u.test(file) && /\.spec\.js$/u.test(file)) {
      entry.kind = 'layout-spec'; entry.summary = 'belongs to the layout/snapshot suites';
      note(`${file} runs under its own config (npm run test:layout / test:snapshots); not part of the gate.`);
      continue;
    }
    if (/^tests\/.*\.(?:m?js)$/u.test(file) && !/-unit\.test\.mjs$/u.test(file)) {
      // A shared test helper: every spec that imports it, transitively.
      entry.kind = 'test-helper';
      const dependentsOfHelper = new Set([file]);
      let grew = true;
      const texts = new Map();
      for (const candidate of files.filter((f) => /^tests\/.*\.m?js$/u.test(f))) texts.set(candidate, await reader.read(candidate));
      while (grew) {
        grew = false;
        for (const [candidate, text] of texts) {
          if (dependentsOfHelper.has(candidate) || !text) continue;
          if (importsOf(text, candidate, fileSet).some((edge) => dependentsOfHelper.has(edge.target))) { dependentsOfHelper.add(candidate); grew = true; }
        }
      }
      let count = 0;
      for (const candidate of dependentsOfHelper) if (specs.includes(candidate)) count += await addSpec(candidate, 1, `uses changed helper ${path.posix.basename(file)}`);
      entry.summary = `${count} spec(s) import it`;
      tally(); continue;
    }
    if (/-unit\.test\.mjs$/u.test(file) || /^(?:docs|gallery|recordings)\//u.test(file) || /\.md$/u.test(file)) {
      entry.kind = 'no-browser-impact'; entry.summary = 'covered by the unit suite / no browser impact';
      continue;
    }
    if (/^scripts\//u.test(file)) { entry.kind = 'script'; entry.summary = 'tooling; lint and unit tests cover it'; continue; }
    if (/^src\/.*\.m?js$/u.test(file)) {
      sourceTouched = true;
      for (const unit of files.filter((f) => /-unit\.test\.mjs$/u.test(f))) {
        const text = await reader.read(unit);
        if (text && importsOf(text, unit, fileSet).some((edge) => edge.target === file)) result.unit.add(unit);
      }
      await selectSource(change, entry);
      tally(); continue;
    }
    if (/^src\/.*\.css$/u.test(file)) {
      sourceTouched = true;
      await selectCss(change, entry);
      tally(); continue;
    }
    if (file === 'index.html' || /^src\/.*\.html$/u.test(file)) {
      sourceTouched = true;
      await selectHtml(change, entry);
      tally(); continue;
    }
    if (file === 'package.json') {
      entry.kind = 'config';
      let a; let b;
      try { a = JSON.parse(change.oldText ?? '{}'); b = JSON.parse(change.newText ?? '{}'); } catch { a = {}; b = { x: 1 }; }
      const dependenciesChanged = JSON.stringify([a.dependencies, a.devDependencies, a.overrides]) !== JSON.stringify([b.dependencies, b.devDependencies, b.overrides]);
      if (dependenciesChanged) { entry.summary = 'dependencies changed'; result.smokeOnly = true; warn('package.json dependencies changed: only the smoke floor runs in the gate; Tier 2 must cover the rest.'); }
      else entry.summary = 'scripts/metadata only; no browser impact';
      continue;
    }
    if (/^(?:vite\.config|playwright(?:\.[^/]+)?\.config|pwa-assets\.config)\.[cm]?js$|^public\/|^src\/.*\.(?:json|svg|png|wasm)$|^wasm-core\//u.test(file)) {
      entry.kind = 'config';
      sourceTouched = true;
      entry.summary = 'build/runtime configuration or static asset';
      result.smokeOnly = true;
      // Assets imported by modules reach the functions that use them.
      if (/^src\//u.test(file)) {
        const hits = await dependents(file, ['default'], { cross: true });
        const importerHits = (await importersOf(file)).length;
        for (const hit of hits) addIds(testsOf(hit), 1, `uses ${path.posix.basename(file)}`);
        if (importerHits) entry.summary += `; ${importerHits} importing module(s)`;
      }
      warn(`${file}: configuration/asset change cannot be narrowed to functions; the smoke floor plus anything that imports it runs, and Tier 2 must cover the rest.`);
      tally(); continue;
    }
    if (/^(?:eslint|stylelint)\.config\./u.test(file)) { entry.kind = 'lint-config'; entry.summary = 'lint runs on every gate'; continue; }
    entry.summary = 'not a recognised test input';
    warn(`${file}: unrecognised file type; no tests selected for it.`);
  }

  // A changed function that most tests run says little by itself. What the edit ADDED to it is more telling:
  // the tests that run the functions it newly calls are the ones that reach the new behaviour.
  function narrowByNewCalls(ids, before, after) {
    if (!before || !after) return null;
    const added = [...after.calls].filter((name) => !before.calls.has(name));
    if (!added.length) return null;
    if (!functionsByName) {
      functionsByName = new Map();
      for (const byKey of model.functions.values()) for (const [key, set] of byKey) {
        const name = key.slice(key.lastIndexOf('>') + 1).replace(/#\d+$/u, '').split('.').pop();
        if (!functionsByName.has(name)) functionsByName.set(name, []);
        functionsByName.get(name).push(set);
      }
    }
    const reached = new Set();
    for (const name of added) for (const set of functionsByName.get(name) ?? []) for (const id of set) if (ids.has(id)) reached.add(id);
    return reached.size && reached.size < ids.size * 0.8 ? reached : null;
  }

  async function selectSource(change, entry) {
    const { file } = change;
    entry.kind = 'source';
    const modules = model.modules.get(file);
    if (change.newText == null) {
      entry.summary = 'file deleted';
      const count = addIds(modules, 0, `${file} deleted`);
      if (!count) warn(`${file} was deleted and no test ever loaded it.`);
      return;
    }
    const newTable = await tableOf(file);
    if (!newTable) {
      entry.summary = 'unparsable';
      const count = addIds(modules, 2, `${file} (could not be parsed)`);
      warn(`${file}: could not be parsed for function-level selection; using every test that loaded the module (${count}).`);
      return;
    }
    if (change.oldText == null) {
      entry.summary = `new module, ${newTable.functions.size} function(s)`;
      warn(`${file} is new: no coverage history. Falling back to tests that import it, specs named after it, and callers of its exports.`);
      let count = await staticFallback(file, 'new module');
      for (const hit of await dependents(file, [...newTable.functions.keys()].filter((key) => !key.includes('>')).concat(['default']), { cross: true })) {
        if (hit.file !== file) count += addIds(testsOf(hit), 1, `${hit.key} uses ${path.posix.basename(file)}`);
      }
      entry.hits += count;
      return;
    }
    let oldTable;
    try { oldTable = buildFunctionTable(change.oldText); } catch { oldTable = null; }
    let diff;
    if (change.whole || !oldTable) {
      diff = { changed: [...newTable.functions.keys()], added: [], removed: [], scopeChanged: [...newTable.scope.keys()], scopeRemoved: [] };
    } else diff = diffTables(oldTable, newTable);
    const touchedFunctions = [...diff.changed, ...diff.removed, ...diff.added];
    const touchedScope = [...diff.scopeChanged, ...diff.scopeRemoved];
    entry.summary = `${diff.changed.length} changed, ${diff.added.length} added, ${diff.removed.length} removed function(s); ${touchedScope.length} module-scope statement(s)`;
    if (!touchedFunctions.length && !touchedScope.length) {
      entry.summary = 'comments/formatting only';
      return;
    }
    for (const key of touchedFunctions) for (const name of baseName(key)) mentions.add(name);
    for (const key of touchedScope) for (const name of (newTable.scope.get(key) ?? oldTable?.scope.get(key))?.declares ?? []) mentions.add(name);
    if (stem(file).length >= 5) mentions.add(stem(file));
    const functionHistory = model.functions.get(file);
    const noHistory = [];
    let direct = 0;
    const unmeasured = [];
    for (const key of [...diff.changed, ...diff.removed]) {
      let ids = functionHistory?.get(key);
      if (ids?.size > broadAbove && oldTable) ids = narrowByNewCalls(ids, oldTable.functions.get(key), newTable.functions.get(key)) ?? ids;
      if (ids?.size) direct += addIds(ids, 0, `ran ${path.posix.basename(file)}:${key}`);
      else unmeasured.push(key);
    }
    // Changed or new functions that no test has been seen to run: tests that run
    // the functions calling them, then the nearest measured ancestor.
    for (const key of [...unmeasured, ...diff.added]) {
      const names = baseName(key);
      let found = 0;
      if (names.length) {
        for (const hit of await dependents(file, names, { exclude: new Set([key]) })) {
          found += addIds(testsOf(hit), 1, `${hit.key} calls ${key}`);
        }
      }
      if (!found) {
        for (let ancestor = newTable.functions.get(key)?.parent; ancestor; ancestor = newTable.functions.get(ancestor)?.parent) {
          const ids = functionHistory?.get(ancestor);
          if (ids?.size) { found += addIds(ids, 2, `ran ${ancestor}, which contains ${key}`); break; }
        }
      }
      direct += found;
      if (!found) noHistory.push(key);
    }
    if (noHistory.length) note(`${file}: ${noHistory.length} changed function(s) have no coverage history (new, or never executed by any test): ${noHistory.slice(0, 4).join(', ')}${noHistory.length > 4 ? ', ...' : ''}.`);
    // Module scope: follow the names the statement declares or calls.
    let scopeHits = 0;
    for (const key of touchedScope) {
      const item = newTable.scope.get(key) ?? oldTable?.scope.get(key);
      if (!item) continue;
      const names = new Set(item.declares);
      if (item.kind === 'effect') for (const ref of item.refs) if (newTable.functions.has(ref)) names.add(ref);
      names.delete(undefined);
      if (!names.size) continue;
      const exclude = new Set(touchedFunctions);
      for (const hit of await dependents(file, [...names], { exclude })) scopeHits += addIds(testsOf(hit), 1, `${hit.key} uses ${[...names][0]} from ${path.posix.basename(file)}`);
    }
    direct += scopeHits;
    if (!direct && (touchedScope.length || diff.added.length)) {
      // Only declarations or new code nothing was seen to run: be explicit, then widen.
      const count = await staticFallback(file, 'only new or module-scope code changed and no test was seen to run it');
      if (!count && touchedScope.some((key) => (newTable.scope.get(key) ?? oldTable?.scope.get(key))?.kind === 'effect')) {
        const widened = addIds(modules, 2, `module-scope code in ${file}`);
        warn(`${file}: module-scope code changed and cannot be narrowed to a function; using every test that loaded the module (${widened}).`);
      } else if (!count && !direct) warn(`${file}: no test was seen to run the changed code. Only the smoke floor covers it; consider a test for it.`);
    } else if (!direct && !touchedScope.length) warn(`${file}: the changed functions were never executed by any measured test.`);
  }

  async function wordSearch(tokens, tier, label) {
    // Per token: the tests that execute a function mentioning it, plus the specs that mention it.
    // A token that reaches a large share of the suite (a generic class) is weak evidence: addIds marks it broad.
    let hits = 0;
    const srcFiles = files.filter((f) => /^src\/.*\.m?js$/u.test(f));
    const texts = new Map();
    for (const file of srcFiles) texts.set(file, await reader.read(file));
    for (const token of tokens) {
      const pattern = new RegExp(`(?<![\\w-])${escapeRegex(token)}(?![\\w-])`, 'u');
      const ids = new Set();
      for (const file of srcFiles) {
        const text = texts.get(file);
        if (!text || !pattern.test(text)) continue;
        const table = await tableOf(file);
        if (!table) continue;
        const owners = new Set();
        for (const match of text.matchAll(new RegExp(pattern.source, 'gu'))) {
          let best = null;
          for (const fn of table.functions.values()) if (fn.start <= match.index && fn.end > match.index && (!best || fn.end - fn.start < best.end - best.start)) best = fn;
          if (best) owners.add(`${file}::${best.key}`);
          else {
            const item = [...table.scope.values()].find((candidate) => candidate.start <= match.index && candidate.end > match.index);
            if (item) for (const hit of await dependents(file, [...item.declares], {})) owners.add(`${hit.file}::${hit.key}`);
          }
        }
        for (const owner of owners) {
          const [ownerFile, key] = owner.split('::');
          for (const id of model.functions.get(ownerFile)?.get(key) ?? []) ids.add(id);
        }
      }
      for (const spec of specs) {
        const text = await readSpec(spec);
        if (!text || !pattern.test(text)) continue;
        const known = [...model.tests].filter(([, info]) => info.spec === spec).map(([id]) => id);
        if (known.length) for (const id of known) ids.add(id); else hits += await addSpec(spec, tier, `${label} "${token}" mentioned in ${path.posix.basename(spec)}`);
      }
      if (ids.size) hits += addIds(ids, tier, `${label} "${token}"`);
    }
    return hits;
  }

  async function selectCss(change, entry) {
    entry.kind = 'css';
    const others = [];
    for (const file of files.filter((f) => /^src\/.*\.css$/u.test(f) && f !== change.file)) { const text = await reader.read(file); if (text) others.push(text); }
    const impact = cssImpact(change.oldText, change.newText, others);
    if (!impact.touched && !impact.global) { entry.summary = 'comments/formatting only'; return; }
    entry.summary = `${impact.touched} rule(s); classes/ids: ${[...impact.tokens].slice(0, 6).join(', ') || 'none'}${impact.tokens.size > 6 ? ', ...' : ''}`;
    for (const token of impact.tokens) mentions.add(token);
    const hits = await wordSearch(impact.tokens, 1, 'class/id');
    note(`${change.file}: CSS has no JS coverage. Rule: the classes and ids it styles are searched for in the code, so tests that execute the functions mentioning them run; layout and visual coverage is Tier 2 (npm run test:layout, test:snapshots).`);
    if (impact.global || impact.hadGlobalRules) {
      result.smokeOnly = !hits;
      warn(`${change.file}: global/element selectors or custom properties changed (cannot be tied to one class); the smoke floor${hits ? ' plus the class-level hits' : ''} runs. Layout/visual suites in Tier 2 cover the rest.`);
    } else if (!hits) warn(`${change.file}: no code or spec mentions the changed classes (${[...impact.tokens].join(', ')}); only the smoke floor runs.`);
  }

  async function selectHtml(change, entry) {
    entry.kind = 'html';
    const lines = (text) => new Set((text ?? '').split('\n').map((line) => line.trim()).filter(Boolean));
    const before = lines(change.oldText);
    const changedLines = [...lines(change.newText)].filter((line) => !before.has(line));
    const tokens = new Set();
    for (const line of changedLines) {
      for (const match of line.matchAll(/\b(?:id|class)\s*=\s*["']([^"']+)["']/gu)) for (const token of match[1].split(/\s+/u)) tokens.add(token);
    }
    entry.summary = `${changedLines.length} changed line(s)`;
    const hits = await wordSearch(tokens, 1, 'id/class');
    if (changedLines.some((line) => /<(?:script|link|meta|title|head|html)\b/u.test(line)) || !tokens.size) {
      warn(`${change.file}: document-level markup changed; the smoke floor${hits ? ' plus id/class hits' : ''} runs, and Tier 2 covers the rest.`);
      result.smokeOnly = result.smokeOnly || !hits;
    }
  }

  // Tests the map knows but has no coverage for (they never touch the coverage fixture) cannot be selected
  // by function. Fall back to what their spec says: a changed name, class or module mentioned in it.
  const uncovered = new Map();
  for (const [id, info] of model.tests) if (info.uncovered && info.spec !== SMOKE_SPEC && !specChangeSelected.has(info.spec)) {
    if (!uncovered.has(info.spec)) uncovered.set(info.spec, []);
    uncovered.get(info.spec).push(id);
  }
  result.unmeasuredSpecs = [...uncovered.keys()];
  const wanted = [...mentions].filter((name) => name.length >= 5);
  if (uncovered.size && wanted.length) {
    const pattern = new RegExp(`(?<![\\w-])(?:${wanted.map(escapeRegex).join('|')})(?![\\w-])`, 'u');
    for (const [spec, ids] of uncovered) {
      const text = await readSpec(spec);
      const found = text && pattern.exec(text)?.[0];
      if (found) addIds(new Set(ids), 1, `no coverage data for this test; its spec mentions ${found}`);
    }
  }
  if (uncovered.size) note(`${[...uncovered.values()].flat().length} test(s) in ${uncovered.size} spec(s) have no coverage data and can only be selected by name or mention: ${[...uncovered.keys()].map((spec) => path.posix.basename(spec)).join(', ')}.`);

  // ---- the floor, and the never-silently-zero rule
  const floorKeys = new Set();
  const smoke = [...model.tests].filter(([, info]) => info.spec === SMOKE_SPEC).map(([id]) => id);
  if (smoke.length) for (const id of smoke) { const item = itemFor(id); if (item) { floorKeys.add(id); bump(item, -2, 'smoke floor'); } }
  else { await addSpec(SMOKE_SPEC, -2, 'smoke floor'); floorKeys.add(`spec:${SMOKE_SPEC}`); }
  for (const key of floorKeys) result.items.get(key).floor = true;

  // Tests the map has never seen (a new spec pulled in with trunk, or a stale seed).
  const stale = specs.filter((spec) => specHashes[spec] !== undefined && model.specHashes[spec] !== specHashes[spec] && !specChangeSelected.has(spec));
  result.staleSpecs = stale;
  const relevant = [...result.items.values()].filter((item) => !item.floor);
  // Trunk moved since the map was captured: a pulled spec keeps its old coverage entries (still a good guide),
  // but tests it ADDED have no history, so those run once (they then join the map).
  let newlyAdded = 0;
  for (const spec of stale) {
    const text = await readSpec(spec);
    if (!text) continue;
    let tests;
    try { tests = parseSpecTests(text).tests; } catch { await addSpec(spec, 4, 'spec changed since the impact map was captured'); continue; }
    const known = new Set([...model.tests.values()].filter((info) => info.spec === spec).map((info) => info.titlePath?.at(-1)));
    if (!known.size) { await addSpec(spec, 4, 'spec is new to the impact map'); continue; }
    for (const test of tests.values()) {
      if (test.dynamic || known.has(test.title)) continue;
      await addTitle(spec, test.title, 1, 'test added since the impact map was captured');
      newlyAdded += 1;
    }
  }
  if (stale.length) note(`${stale.length} spec(s) changed since the impact map was captured (trunk moved): old coverage is still used, ${newlyAdded} added test(s) run once. npm run test:impact-map refreshes the seed.`);
  result.relevantCount = relevant.length;
  if (sourceTouched && !relevant.length) {
    result.smokeOnly = true;
    warn('NO RELEVANT BROWSER TESTS were found for the changed source. Only the smoke floor will run. Treat this as unverified.');
  }
  return result;
}

// ------------------------------------------------------------------------ pack
function makespan(items, workers) {
  const bySpec = new Map();
  for (const item of items) bySpec.set(item.spec, (bySpec.get(item.spec) ?? 0) + item.durationMs);
  const loads = Array.from({ length: workers }, () => 0);
  for (const total of [...bySpec.values()].sort((a, b) => b - a)) loads[loads.indexOf(Math.min(...loads))] += total;
  return Math.max(...loads);
}

/** Order by relevance, then fit what we can into the budget; the rest is deferred, never dropped. */
export function packBrowser(items, { budgetMs, workers = 2, broadSample = 8 }) {
  const all = [...items];
  const floor = all.filter((item) => item.floor);
  const rest = all.filter((item) => !item.floor);
  // Within a tier, interleave specs (cheapest first) so a hot function spreads across features.
  const ordered = [];
  const tiers = [...new Set(rest.map((item) => item.tier))].sort((a, b) => a - b);
  for (const tier of tiers) {
    // Reaching more of the changed code ranks higher; ties interleave specs (cheapest first).
    const scores = [...new Set(rest.filter((item) => item.tier === tier).map((item) => item.score ?? 0))].sort((a, b) => b - a);
    for (const score of scores) {
      const bySpec = new Map();
      for (const item of rest.filter((entry) => entry.tier === tier && (entry.score ?? 0) === score).sort((a, b) => a.durationMs - b.durationMs)) {
        if (!bySpec.has(item.spec)) bySpec.set(item.spec, []);
        bySpec.get(item.spec).push(item);
      }
      const queues = [...bySpec.values()].sort((a, b) => a[0].durationMs - b[0].durationMs);
      for (let round = 0; queues.some((queue) => queue[round]); round += 1) for (const queue of queues) if (queue[round]) ordered.push(queue[round]);
    }
  }
  const run = [...floor];
  const deferred = [];
  let broadRun = 0;
  for (const item of ordered) {
    // Broad hits only sample: they say little about which tests matter, so they never fill the budget.
    if (item.tier === 2 && broadRun >= broadSample) { deferred.push(item); continue; }
    if (makespan([...run, item], workers) <= budgetMs) { run.push(item); if (item.tier === 2) broadRun += 1; } else deferred.push(item);
  }
  return { run, deferred, estimatedMs: makespan(run, workers), floor };
}

/** The Playwright arguments that run exactly these items. */
export function playwrightArgs(items) {
  const specsToRun = [...new Set(items.map((item) => item.spec))].sort();
  const patterns = [];
  for (const item of items) {
    if (item.kind === 'case') patterns.push(escapeRegex(item.grepTitle));
    else if (item.kind === 'title') patterns.push(`[^\\n]*${escapeRegex(item.title)}`);
    else patterns.push(`${escapeRegex(path.posix.basename(item.spec))}\\s[^\\n]*`);
  }
  return { specs: specsToRun, grep: patterns.length ? `(?:^|\\s)(?:${[...new Set(patterns)].join('|')})(?:$|\\s|@)` : '' };
}

export const tierLabel = (tier) => (tier < 0 ? (tier === -2 ? 'smoke floor' : 'changed test') : TIER_LABEL[tier] ?? 'other');
