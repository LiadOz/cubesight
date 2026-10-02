#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, parse } from 'es-module-lexer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args) => spawnSync(command, args, { cwd: root, stdio: 'inherit' });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const normalize = (value) => value.replaceAll('\\', '/').replace(/^\.\//u, '');

async function filesUnder(directory) {
  let entries;
  try { entries = await readdir(path.join(root, directory), { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesUnder(relative));
    else if (/\.(?:m?js)$/u.test(entry.name)) files.push(relative);
  }
  return files;
}

async function importGraph(files) {
  await init;
  const edges = new Map();
  for (const file of files) {
    const source = await readFile(path.join(root, file), 'utf8');
    const [imports] = parse(source, file);
    const dependencies = [];
    for (const item of imports) {
      const specifier = source.slice(item.s, item.e);
      if (!specifier.startsWith('.')) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      const candidates = [resolved, `${resolved}.js`, `${resolved}.mjs`, `${resolved}/index.js`, `${resolved}/index.mjs`];
      const match = candidates.find((candidate) => files.includes(candidate));
      if (match) dependencies.push(match);
    }
    edges.set(file, dependencies);
  }
  return edges;
}

function reverseClosure(edges, changed) {
  const selected = new Set(changed);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [file, dependencies] of edges) {
      if (!selected.has(file) && dependencies.some((dependency) => selected.has(dependency))) {
        selected.add(file);
        grew = true;
      }
    }
  }
  return selected;
}

const safetyValve = (file) => /^(?:package\.json|package-lock\.json|playwright(?:\.[^/]+)?\.config\.[cm]?js|vite\.config\.[cm]?js|src\/(?:main\.js|routes\.js|ui\/(?:orbit|cube|shared)\/)|src\/.*(?:tokens|\.css$)|tests\/helpers\/)/u.test(file)
  || /^(?:eslint|stylelint)\.config\./u.test(file);

const dryRunIndex = process.argv.indexOf('--dry-run');
const filesIndex = process.argv.indexOf('--files');
const unitOnly = process.argv.includes('--unit-only');
const requestedBase = process.argv.find((argument, index) => index > 1 && !argument.startsWith('--') && index !== filesIndex + 1);
const defaultBase = git('merge-base', 'HEAD', 'feature/smart-cube-guidance');
const base = requestedBase ?? defaultBase;
const committed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
const working = git('diff', '--name-only', 'HEAD').split('\n').filter(Boolean);
const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
const explicit = filesIndex >= 0 ? process.argv.slice(filesIndex + 1).filter((argument) => !argument.startsWith('--')) : [];
const changed = [...new Set([...(explicit.length ? explicit : [...committed, ...working, ...untracked])].map(normalize))];
if (changed.length === 0) {
  console.log(`No changed files from ${base}; running no tests.`);
  process.exit(0);
}

const allFiles = [...await filesUnder('src'), ...await filesUnder('tests')];
const edges = await importGraph(allFiles);
const impacted = reverseClosure(edges, changed.filter((file) => edges.has(file)));
const impactMapPath = path.join(root, 'tests/impact-map.json');
let impactMap;
try { impactMap = JSON.parse(await readFile(impactMapPath, 'utf8')); } catch { impactMap = null; }
const mapInvalidated = changed.some((file) => /^tests\/(?:.*\.spec\.js|helpers\/)/u.test(file)
  || /^playwright(?:\.[^/]+)?\.config\.[cm]?js$/u.test(file));
const mapAgeMs = impactMap?.generatedAt ? Date.now() - Date.parse(impactMap.generatedAt) : Infinity;
const refreshImpactMap = !unitOnly && (mapAgeMs > 7 * 24 * 60 * 60 * 1000 || mapInvalidated) && dryRunIndex < 0;
if (refreshImpactMap) {
  console.log('The Playwright impact map is missing, older than 7 days, or affected specs changed; refreshing it.');
  const result = run('node', ['scripts/test-impact-map.mjs']);
  if (result.status !== 0) process.exit(result.status ?? 1);
  try { impactMap = JSON.parse(await readFile(impactMapPath, 'utf8')); } catch { impactMap = null; }
}
for (const file of changed) {
  for (const entry of impactMap?.sourceToTests?.[file] ?? []) {
    impacted.add(entry.spec);
  }
  // If no recent browser map exists, select a conservative route-family seed.
  // Runtime coverage remains the source of truth for cross-family dependencies.
  const parts = file.split('/');
  const area = parts[0] === 'src' ? parts[1] : '';
  const family = area === 'drills' ? 'drill' : area === 'brain' ? 'brain' : area;
  if (family) {
    for (const spec of allFiles.filter((candidate) => /^tests\/.*\.spec\.js$/u.test(candidate))) {
      const basename = path.posix.basename(spec).toLowerCase();
      if (basename.includes(family) || (family === 'algs' && basename.includes('alg'))) impacted.add(spec);
    }
  }
}
const unit = [...impacted].filter((file) => /^tests\/.*-unit\.test\.mjs$/u.test(file)).sort();
const playwright = [...impacted].filter((file) => /^tests\/.*\.spec\.js$/u.test(file)).sort();
const full = changed.some(safetyValve);

console.log(`Affected-test selection against ${base}`);
console.log(`Changed: ${changed.join(', ')}`);
if (full) {
  console.log(`Shared foundation/configuration change: running the full${unitOnly ? ' unit' : ''} suite${unitOnly ? '' : 's'}.`);
  if (dryRunIndex >= 0) process.exit(0);
  const commands = unitOnly ? [['npm', ['run', 'test:unit']]] : [
    ['npm', ['run', 'test:unit']], ['npx', ['playwright', 'test']], ['npm', ['run', 'test:pwa']],
  ];
  for (const [command, args] of commands) {
    const result = run(command, args);
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} else {
console.log(`Unit tests (${unit.length}): ${unit.join(', ') || 'none'}`);
console.log(`Playwright specs (${playwright.length}): ${playwright.join(', ') || 'none'}`);
console.log(`V8 impact map: ${impactMap?.sourceCount ?? 0} modules, generated ${impactMap?.generatedAt ?? 'not yet'}`);
if (dryRunIndex >= 0) process.exit(0);
  if (unit.length) {
    const result = run('node', ['--test', ...unit]);
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  if (playwright.length && !unitOnly) {
    const result = run('npx', ['playwright', 'test', ...playwright]);
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
