#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLayoutMatrix } from '../tests/layout/matrix.js';
import { FIXTURE_NAMES } from '../src/brain/fixtures.js';
import { SNAPSHOT_ROUTES, SNAPSHOT_THEMES, SNAPSHOT_VIEWPORTS } from '../tests/snapshots/capture-matrix.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [baseArg, headArg = 'HEAD'] = process.argv.slice(2);
if (!baseArg) {
  console.error('Usage: npm run snapshots:compare -- <base-ref> [<head-ref>]');
  process.exit(2);
}

function git(args, cwd = repo) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function resolveRef(ref) {
  try { return git(['rev-parse', '--verify', `${ref}^{commit}`]); }
  catch { throw new Error(`Cannot resolve git ref: ${ref}`); }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} ${args.join(' ')} failed in ${cwd} (exit ${result.status ?? result.signal})`);
}

function refName(ref, sha) {
  return `${ref.replaceAll(/[^a-zA-Z0-9._-]+/g, '-').replaceAll(/^-|-$/g, '') || 'ref'}-${sha.slice(0, 8)}`;
}

const HARNESS_PATHS = [
  'playwright.snapshots.config.js',
  'tests/snapshots',
  'tests/layout',
  'tests/helpers/fake-brain.js',
  'tests/helpers/goal-progress-state.js',
  'tests/analysis-golden.mjs',
  'tests/fixtures/rotation-cross-recording.json',
];

async function overlayHarness(worktree, ref) {
  for (const rel of HARNESS_PATHS) {
    const source = path.join(repo, rel);
    const destination = path.join(worktree, rel);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: true, force: true });
  }

  // Always capture a clean reference run. A baseline committed on either ref
  // must not mask an incomplete or stale capture from this comparison.
  await rm(path.join(worktree, 'tests/snapshots/__baselines__'), { recursive: true, force: true });

  const dependencyDirectory = path.join(worktree, 'node_modules');
  let dependencyInfo;
  try { dependencyInfo = await lstat(dependencyDirectory); }
  catch { dependencyInfo = null; }
  // Vite's filesystem allowlist includes the resolved node_modules root. Reuse
  // the current worktree's read-only dependency link when lockfiles match;
  // install only when a compared ref requires a different dependency set.
  if (!dependencyInfo || dependencyInfo.isSymbolicLink()) {
    if (dependencyInfo?.isSymbolicLink()) await rm(dependencyDirectory, { force: true });
    const [localLock, refLock] = await Promise.all([
      readFile(path.join(repo, 'package-lock.json')),
      Promise.resolve(execFileSync('git', ['show', `${ref}:package-lock.json`], { cwd: repo })),
    ]);
    const lockMatches = createHash('sha256').update(localLock).digest('hex') === createHash('sha256').update(refLock).digest('hex');
    if (lockMatches) {
      await symlink(await realpath(path.join(repo, 'node_modules')), dependencyDirectory, 'dir');
    } else {
      run('npm', ['ci'], worktree);
    }
  }
}

async function filesUnder(root, current = root, out = []) {
  let entries;
  try { entries = await readdir(current, { withFileTypes: true }); }
  catch { return out; }
  for (const entry of entries) {
    const filename = path.join(current, entry.name);
    if (entry.isDirectory()) await filesUnder(root, filename, out);
    else if (/\.(png|yml|json)$/.test(entry.name)) out.push(path.relative(root, filename).split(path.sep).join('/'));
  }
  return out;
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function encodePath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

function cellFor(filename) {
  return filename
    .replace(/\.aria\.yml$/, '')
    .replace(/\.vm\.json$/, '')
    .replace(/\.png$/, '');
}

async function sha(filename) {
  return createHash('sha256').update(await readFile(filename)).digest('hex');
}

async function sameArtifact(filename, left, right) {
  const a = path.join(left, filename), b = path.join(right, filename);
  if (!filename.endsWith('.png')) return await sha(a) === await sha(b);
  const sharp = (await import('sharp')).default;
  const [leftImage, rightImage] = await Promise.all([
    sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (leftImage.info.width !== rightImage.info.width || leftImage.info.height !== rightImage.info.height) return false;
  return leftImage.data.equals(rightImage.data);
}

async function assertCompleteCapture(directory, label) {
  const files = await filesUnder(directory);
  // Every registered F8 state, selected default F9 routes, and one real replay
  // are captured for all configured viewport/theme pairs with three artifacts.
  const expectedCells = (getLayoutMatrix().states.length + SNAPSHOT_ROUTES.length + 1) * SNAPSHOT_VIEWPORTS.length * SNAPSHOT_THEMES.length;
  const expected = expectedCells * 3 + FIXTURE_NAMES.length;
  if (files.length !== expected) {
    throw new Error(`${label} snapshot run produced ${files.length}/${expected} artifacts; refusing an incomplete comparison.`);
  }
}

async function writeGallery(outDir, baseDir, headDir, baseLabel, headLabel) {
  const [baseFiles, headFiles] = await Promise.all([filesUnder(baseDir), filesUnder(headDir)]);
  const all = [...new Set([...baseFiles, ...headFiles])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const changed = [];
  for (const filename of all) {
    const [hasBase, hasHead] = await Promise.all([
      readFile(path.join(baseDir, filename)).then(() => true).catch(() => false),
      readFile(path.join(headDir, filename)).then(() => true).catch(() => false),
    ]);
    if (hasBase && hasHead && await sameArtifact(filename, baseDir, headDir)) continue;
    changed.push(filename);
  }

  const byCell = new Map();
  for (const filename of changed) {
    const key = cellFor(path.basename(filename));
    const row = byCell.get(key) || [];
    row.push(filename);
    byCell.set(key, row);
  }

  const cards = [];
  let frame = 0;
  for (const [cell, artifacts] of [...byCell].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))) {
    frame += 1;
    const image = artifacts.find(item => item.endsWith('.png'));
    const textRows = artifacts.filter(item => !item.endsWith('.png')).map(item => {
      const beforePath = path.join(baseDir, item), afterPath = path.join(headDir, item);
      return Promise.all([
        readFile(beforePath, 'utf8').catch(() => '(missing in base)'),
        readFile(afterPath, 'utf8').catch(() => '(missing in head)'),
      ]).then(([before, after]) => `<details><summary>${escapeHtml(path.basename(item))}</summary><div class="text-pair"><pre><b>${escapeHtml(baseLabel)}</b>\n${escapeHtml(before)}</pre><pre><b>${escapeHtml(headLabel)}</b>\n${escapeHtml(after)}</pre></div></details>`);
    });
    const textBlocks = await Promise.all(textRows);
    let visual = '<p class="missing">No pixel artifact changed for this cell.</p>';
    if (image) {
      const imagePath = encodePath(image);
      const hasBase = baseFiles.includes(image), hasHead = headFiles.includes(image);
      visual = `<div class="visuals">
        <figure><figcaption>${escapeHtml(baseLabel)}</figcaption>${hasBase ? `<img src="base/${imagePath}" alt="F9-${String(frame).padStart(3, '0')} · ${escapeHtml(cell)} · ${escapeHtml(baseLabel)}">` : '<p class="missing">Missing in base</p>'}</figure>
        <figure><figcaption>${escapeHtml(headLabel)}</figcaption>${hasHead ? `<img src="head/${imagePath}" alt="F9-${String(frame).padStart(3, '0')} · ${escapeHtml(cell)} · ${escapeHtml(headLabel)}">` : '<p class="missing">Missing in head</p>'}</figure>
        ${hasBase && hasHead ? `<figure class="overlay-figure"><figcaption>difference overlay · F9-${String(frame).padStart(3, '0')}</figcaption><div class="overlay"><img src="base/${imagePath}" alt=""><img src="head/${imagePath}" alt=""></div></figure>` : ''}
      </div>`;
    }
    cards.push(`<article id="f9-${String(frame).padStart(3, '0')}"><h2>F9-${String(frame).padStart(3, '0')} · ${escapeHtml(cell)}</h2>${visual}${textBlocks.join('')}</article>`);
  }

  const generatedAt = new Date().toISOString();
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>F9 snapshot comparison</title>
<link rel="stylesheet" href="../../docs/design/_gallery/lightbox.css"><style>
*{box-sizing:border-box}body{margin:0;background:#111c22;color:#edf1f2;font:15px/1.5 Manrope,system-ui,sans-serif}header{padding:24px max(20px,calc((100vw - 1400px)/2));background:#15272d;border-bottom:1px solid #476069}h1{font-size:26px;margin:0 0 8px}header p{margin:4px 0;color:#bdc9ca}.summary{color:#71dcc9;font-weight:700}main{max-width:1440px;padding:20px;margin:auto}article{padding:20px;margin:20px 0;border:1px solid #3d555d;border-radius:12px;background:#17262b}h2{font-size:18px;margin:0 0 16px;color:#fff}.visuals{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}figure{margin:0;min-width:0}figcaption{font:12px/1.4 'DM Mono',monospace;color:#aababe;margin-bottom:6px}.visuals img{display:block;width:100%;height:auto;border:1px solid #52656a;border-radius:4px;cursor:zoom-in}.overlay{position:relative;aspect-ratio:16/9;background:#fff;overflow:hidden}.overlay img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;border:0;mix-blend-mode:difference}.missing{color:#e5b979}.text-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}details{margin-top:12px}summary{cursor:pointer;color:#86d9ca}pre{max-height:440px;overflow:auto;padding:12px;background:#0e171b;border-radius:6px;white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:700px){.text-pair{grid-template-columns:1fr}}
</style></head><body><header><h1>F9 snapshot comparison</h1><p><b>base:</b> ${escapeHtml(baseLabel)}</p><p><b>head:</b> ${escapeHtml(headLabel)}</p><p class="summary">${changed.length ? `${byCell.size} changed cells · ${changed.length} changed artifacts` : 'No changes across captured cells'}</p><p>Generated ${escapeHtml(generatedAt)} · click an image to zoom; use ←/→ in the shared viewer.</p></header><main>${cards.join('\n') || '<p>No changed cells.</p>'}</main><script src="../../docs/design/_gallery/lightbox.js"></script></body></html>`;
  await writeFile(path.join(outDir, 'index.html'), html);
  return { changedCells: byCell.size, changedArtifacts: changed.length };
}

const baseCommit = resolveRef(baseArg);
const headCommit = resolveRef(headArg);
const baseLabel = `${baseArg} (${baseCommit.slice(0, 8)})`;
const headLabel = `${headArg} (${headCommit.slice(0, 8)})`;
const agentsRoot = path.resolve(repo, '../..');
const tempRoot = await mkdtemp(path.join(agentsRoot, 'worktrees', 'cubesight-f9-compare-'));
const refs = [
  { side: 'base', ref: baseCommit, dir: path.join(tempRoot, refName(baseArg, baseCommit)) },
  { side: 'head', ref: headCommit, dir: path.join(tempRoot, refName(headArg, headCommit)) },
];
const registered = [];

try {
  for (const entry of refs) {
    run('git', ['worktree', 'add', '--detach', entry.dir, entry.ref]);
    registered.push(entry.dir);
    await overlayHarness(entry.dir, entry.ref);
    const playwright = path.join(entry.dir, 'node_modules', 'playwright', 'cli.js');
    run(process.execPath, [playwright, 'test', '--config=playwright.snapshots.config.js', '--update-snapshots'], entry.dir);
    await assertCompleteCapture(path.join(entry.dir, 'tests/snapshots/__baselines__/snapshots.spec'), entry.side);
  }

  const output = path.join(repo, 'test-results', 'snapshot-compare');
  await rm(output, { recursive: true, force: true });
  const baseArtifacts = path.join(refs[0].dir, 'tests/snapshots/__baselines__/snapshots.spec.js');
  const headArtifacts = path.join(refs[1].dir, 'tests/snapshots/__baselines__/snapshots.spec.js');
  const baseOut = path.join(output, 'base'), headOut = path.join(output, 'head');
  await mkdir(baseOut, { recursive: true });
  await mkdir(headOut, { recursive: true });
  await cp(baseArtifacts, baseOut, { recursive: true, force: true });
  await cp(headArtifacts, headOut, { recursive: true, force: true });
  const result = await writeGallery(output, baseOut, headOut, baseLabel, headLabel);
  console.log(`F9 comparison complete: ${result.changedCells} changed cells, ${result.changedArtifacts} changed artifacts.`);
  console.log(`Open file://${path.join(output, 'index.html')}`);
} finally {
  for (const dir of registered.reverse()) {
    spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: repo, stdio: 'ignore' });
  }
  await rm(tempRoot, { recursive: true, force: true });
}
