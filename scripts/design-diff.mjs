#!/usr/bin/env node
// npm run design:diff — measures how far the live app is from the approved Orbit-v3 direction-A frames.
// Boots vite on a free port (DESIGN_DIFF_PORT, default 5191, strict), captures every frame in
// scripts/design-diff/frames.mjs, compares against docs/design/orbit-v3/*.png and writes, per frame,
// app.png ref.png diff.png overlay.png, plus summary.json and index.html, to
// .agents/artifacts/design-diff/ (override: DESIGN_DIFF_OUT). Developer tool; not part of the merge gate.
//   node scripts/design-diff.mjs [--only A-01-idle,A-02-scramble] [--no-capture]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAMES, PHONE_RADIUS } from './design-diff/frames.mjs';
import { compareFrame } from './design-diff/compare.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const refDir = join(root, 'docs/design/orbit-v3');
const mainCheckout = '/home/loz/projects/cubesight';
const outDir = resolve(process.env.DESIGN_DIFF_OUT || join(mainCheckout, '.agents/artifacts/design-diff'));
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const frames = FRAMES.filter(f => !only || only.some(name => f.frame.startsWith(name)));
const started = Date.now();

const unreachable = frames.filter(f => f.driver.UNREACHABLE);
const live = frames.filter(f => !f.driver.UNREACHABLE);
mkdirSync(outDir, { recursive: true });

if (!args.includes('--no-capture')) {
  for (const f of live) rmSync(join(outDir, f.frame, 'app.png'), { force: true });
  const grep = live.map(f => `capture ${f.frame}$`).join('|');
  const run = spawnSync('npx', ['playwright', 'test', '--config=playwright.design-diff.config.js', '--grep', grep], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, DESIGN_DIFF_OUT: outDir, DESIGN_DIFF_RESULTS: join(outDir, '.results'), CUBESIGHT_NO_WATCH: '1' },
  });
  if (run.status !== 0) console.error('capture reported failures; frames without app.png are listed as CAPTURE-FAILED');
}

const results = [];
for (const f of frames) {
  if (f.driver.UNREACHABLE) { results.push({ frame: f.frame, status: 'UNREACHABLE', reason: f.driver.UNREACHABLE }); continue; }
  if (!existsSync(join(outDir, f.frame, 'app.png'))) { results.push({ frame: f.frame, status: 'CAPTURE-FAILED' }); continue; }
  results.push({ status: 'ok', ...await compareFrame(f, { refDir, outDir, bezel: f.crop ? PHONE_RADIUS : 0 }) });
}
const scored = results.filter(r => r.status === 'ok');
const totalCompared = scored.reduce((n, r) => n + r.comparedPixels, 0);
const total = {
  frames: scored.length, unreachable: unreachable.length, failed: results.filter(r => r.status === 'CAPTURE-FAILED').length,
  meanDiffPercent: Math.round(scored.reduce((n, r) => n + r.diffPercent, 0) / Math.max(1, scored.length) * 100) / 100,
  weightedDiffPercent: Math.round(scored.reduce((n, r) => n + r.diffPixels, 0) / Math.max(1, totalCompared) * 10000) / 100,
};
const summary = { threshold: 'a pixel differs when any RGB channel differs by more than 24/255', total, frames: results };
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

const rows = results.map(r => r.status === 'ok'
  ? `<section><h2>${r.frame} <b>${r.diffPercent}%</b> <small>${r.viewport}</small></h2><div class="g">${['ref', 'app', 'overlay', 'diff'].map(k => `<figure><figcaption>${k}</figcaption><a href="${r.frame}/${k}.png"><img loading="lazy" src="${r.frame}/${k}.png"></a></figure>`).join('')}</div><pre>${r.regions.slice(0, 5).map(g => `${g.w}x${g.h} @ ${g.x},${g.y}  ${g.pixels}px`).join('\n')}</pre></section>`
  : `<section><h2>${r.frame} <b>${r.status}</b></h2><pre>${r.reason ?? ''}</pre></section>`).join('\n');
writeFileSync(join(outDir, 'index.html'), `<!doctype html><meta charset=utf-8><title>design diff</title><style>body{background:#111;color:#ddd;font:14px system-ui;margin:16px}h2 b{color:#e6a642}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}img{width:100%;border:1px solid #333}figcaption{color:#888}pre{color:#9a9486}</style><h1>design diff: weighted ${total.weightedDiffPercent}%, mean ${total.meanDiffPercent}%</h1>${rows}`);

for (const r of results) {
  if (r.status !== 'ok') { console.log(`${r.frame.padEnd(24)} ${r.status} ${r.reason ?? ''}`); continue; }
  console.log(`${r.frame.padEnd(24)} ${String(r.diffPercent).padStart(6)}%  ${r.regions.slice(0, 3).map(g => `${g.w}x${g.h}@${g.x},${g.y}`).join('  ')}`);
}
console.log(`TOTAL weighted ${total.weightedDiffPercent}%  mean ${total.meanDiffPercent}%  (${scored.length} frames, ${unreachable.length} unreachable, ${total.failed} failed)  ${((Date.now() - started) / 1000).toFixed(0)}s`);
console.log(`artifacts: ${outDir}/index.html`);
