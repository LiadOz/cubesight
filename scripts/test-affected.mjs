#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, parse } from 'es-module-lexer';
import { buildPlaywrightSelection, changedTestInputs, fingerprintTestInputs, grepPatternForCases } from './test-selection.mjs';

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
const impactMapPath = path.join(root, 'tests/impact-map.json');
let impactMap;
try { impactMap = JSON.parse(await readFile(impactMapPath, 'utf8')); } catch { impactMap = null; }
const mapAgeMs = impactMap?.generatedAt ? Date.now() - Date.parse(impactMap.generatedAt) : Infinity;
const inputChanges = changedTestInputs(impactMap?.inputFingerprints, await fingerprintTestInputs(root));
const refreshImpactMap = !unitOnly && (mapAgeMs > 7 * 24 * 60 * 60 * 1000 || inputChanges.length > 0) && dryRunIndex < 0;
const full = changed.some(safetyValve);
let fullBrowserAlreadyRan = false;
if (refreshImpactMap) {
  console.log(`The Playwright impact map is missing, older than 7 days, or test inputs changed (${inputChanges.join(', ')}); refreshing it with one full coverage run.`);
  const result = run('node', ['scripts/test-impact-map.mjs']);
  if (result.status !== 0) process.exit(result.status ?? 1);
  fullBrowserAlreadyRan = true;
  try { impactMap = JSON.parse(await readFile(impactMapPath, 'utf8')); } catch { impactMap = null; }
}
const mappedEntries = [];
for (const file of changed) mappedEntries.push(...(impactMap?.sourceToTests?.[file] ?? []));
const impacted = new Set();
const changedTestSpecs = new Set(changed.filter((file) => /^tests\/.*\.spec\.js$/u.test(file)));
for (const spec of changedTestSpecs) impacted.add(spec);
for (const file of changed.filter((candidate) => candidate.startsWith('src/'))) {
  const entries = impactMap?.sourceToTests?.[file] ?? [];
  if (entries.length) continue;
  // Preserve static import-graph safety whenever runtime coverage has no
  // observation for this source module.
  for (const candidate of reverseClosure(edges, edges.has(file) ? [file] : [])) {
    if (/^tests\/.*\.spec\.js$/u.test(candidate)) impacted.add(candidate);
  }
  if (impactMap?.version < 3) {
    const parts = file.split('/');
    const area = parts[0] === 'src' ? parts[1] : '';
    const family = area === 'drills' ? 'drill' : area === 'brain' ? 'brain' : area;
    if (family) for (const spec of allFiles.filter((candidate) => /^tests\/.*\.spec\.js$/u.test(candidate))) {
      const basename = path.posix.basename(spec).toLowerCase();
      if (basename.includes(family) || (family === 'algs' && basename.includes('alg'))) impacted.add(spec);
    }
  }
}
for (const file of changed) {
  const entries = impactMap?.sourceToTests?.[file] ?? [];
  for (const entry of entries) {
    if (typeof entry === 'string' && impactMap.version < 3) impacted.add(entry);
  }
}
const selection = buildPlaywrightSelection({ wholeSpecs: [...impacted], coverageEntries: mappedEntries, testCases: impactMap?.testCases ?? {} });
if (selection.unresolvedCoverage && impactMap?.version >= 3) {
  console.warn('Some impact-map test IDs are missing metadata; falling back to complete imported specs.');
  for (const changedFile of changed.filter((file) => file.startsWith('src/'))) {
    for (const file of reverseClosure(edges, edges.has(changedFile) ? [changedFile] : [])) {
      if (/^tests\/.*\.spec\.js$/u.test(file)) selection.wholeSpecs.push(file);
    }
  }
  selection.wholeSpecs = [...new Set(selection.wholeSpecs)].sort();
  selection.casesBySpec.clear();
}
const unit = [...impacted].filter((file) => /^tests\/.*-unit\.test\.mjs$/u.test(file)).sort();
const playwright = selection.wholeSpecs;

console.log(`Affected-test selection against ${base}`);
console.log(`Changed: ${changed.join(', ')}`);
if (full) {
  console.log(`Shared foundation/configuration change: running the full${unitOnly ? ' unit' : ''} suite${unitOnly ? '' : 's'}.`);
  if (dryRunIndex >= 0) process.exit(0);
  const commands = unitOnly ? [['npm', ['run', 'test:unit']]] : [
    ['npm', ['run', 'test:unit']], ...(fullBrowserAlreadyRan ? [] : [['npx', ['playwright', 'test', '--output=test-results/affected']]]), ['npm', ['run', 'test:pwa']],
  ];
  for (const [command, args] of commands) {
    const result = run(command, args);
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} else {
console.log(`Unit tests (${unit.length}): ${unit.join(', ') || 'none'}`);
console.log(`Playwright full specs (${playwright.length}): ${playwright.join(', ') || 'none'}`);
console.log(`Playwright selected cases (${[...selection.casesBySpec.values()].reduce((sum, cases) => sum + cases.size, 0)}): ${[...selection.casesBySpec.keys()].join(', ') || 'none'}`);
console.log(`V8 impact map: ${impactMap?.sourceCount ?? 0} modules, generated ${impactMap?.generatedAt ?? 'not yet'}`);
if (dryRunIndex >= 0) process.exit(0);
  if (unit.length) {
    const result = run('node', ['--test', ...unit]);
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  if (playwright.length && !unitOnly) {
    const result = run('npx', ['playwright', 'test', '--output=test-results/affected', ...playwright]);
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  if (!unitOnly) for (const [spec, cases] of selection.casesBySpec) {
    const grep = grepPatternForCases([...cases.values()]);
    const result = run('npx', ['playwright', 'test', '--output=test-results/affected', spec, `--grep=${grep}`]);
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
