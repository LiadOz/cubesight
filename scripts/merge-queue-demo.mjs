#!/usr/bin/env node
// Acceptance demo for F18: two branches that are each green alone but break in
// combination (modelled on the algs ring/cube 15 px drift). Builds a throwaway
// repository under .agents/artifacts/, so it never touches the real repo.
//   node scripts/merge-queue-demo.mjs
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQueue } from './merge-queue.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> worktree -> worktrees -> .agents ; artifacts live beside worktrees under .agents/
const artifacts = process.env.CUBESIGHT_DEMO_ROOT || path.resolve(here, '..', '..', '..', 'artifacts');
const dir = path.join(artifacts, 'merge-queue-demo', 'repo');
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'demo', GIT_AUTHOR_EMAIL: 'demo@example.invalid', GIT_COMMITTER_NAME: 'demo', GIT_COMMITTER_EMAIL: 'demo@example.invalid' } }).trim();

// The "tier1" gate: the ring (start-aligned in a 340 px row) and the cube (centred, shifted by the camera)
// must have centres within 12 px of each other.
const GATE = `import { readFileSync } from 'node:fs';
const ring = JSON.parse(readFileSync('layout/orbit.json')).ringHeight;
const shift = JSON.parse(readFileSync('layout/camera.json')).shiftY;
const drift = Math.abs(ring / 2 - (170 + shift));
console.log('ring/cube centres are ' + drift + 'px apart (tolerance 12px)');
process.exit(drift <= 12 ? 0 : 1);
`;

await rm(path.dirname(dir), { recursive: true, force: true });
await mkdir(path.join(dir, 'layout'), { recursive: true });
git('init', '-q', '-b', 'main');
await writeFile(path.join(dir, 'package.json'), JSON.stringify({ scripts: { tier1: 'node gate.mjs' } }));
await writeFile(path.join(dir, 'gate.mjs'), GATE);
await writeFile(path.join(dir, 'layout/orbit.json'), '{"ringHeight":340}\n');
await writeFile(path.join(dir, 'layout/camera.json'), '{"shiftY":0}\n');
await writeFile(path.join(dir, 'NOTES.md'), 'notes\n');
git('add', '-A'); git('commit', '-qm', 'base');
git('branch', 'main');
const branch = async (name, file, text) => {
  git('switch', '-qc', name, 'main');
  await writeFile(path.join(dir, file), text);
  git('commit', '-qam', name);
};
await branch('orbit-sizing', 'layout/orbit.json', '{"ringHeight":322}\n');
await branch('cube-camera', 'layout/camera.json', '{"shiftY":8}\n');
await branch('docs-only', 'NOTES.md', 'more notes\n');
git('switch', '-q', 'main');

const gateAlone = branch => {
  git('checkout', '-q', '--detach', branch);
  try { return execFileSync('node', ['gate.mjs'], { cwd: dir, encoding: 'utf8' }).trim() + '  -> PASS'; }
  catch (e) { return e.stdout.trim() + '  -> FAIL'; }
  finally { git('checkout', '-q', 'main'); }
};
console.log('Each branch on its own:');
for (const b of ['docs-only', 'orbit-sizing', 'cube-camera']) console.log(`  ${b.padEnd(13)} ${gateAlone(b)}`);

const before = git('rev-parse', 'main');
console.log(`\nTrunk before: ${before.slice(0, 9)}\nQueueing: docs-only, orbit-sizing, cube-camera\n`);
const summary = await runQueue({ repoRoot: dir, branches: ['docs-only', 'orbit-sizing', 'cube-camera'], liveCheckout: '/nonexistent', installDependencies: false, explainAlone: true });
for (const r of summary.results) console.log(`  ${r.status.toUpperCase().padEnd(9)} ${r.branch}${r.failure ? `\n            ${r.failure}` : ''}`);
console.log(`\nTrunk after:  ${git('rev-parse', 'main').slice(0, 9)} (landed: docs-only, orbit-sizing; cube-camera NOT landed)`);
console.log(`trunk:layout/camera.json = ${git('show', 'main:layout/camera.json')}\n`);
console.log('--- diagnosis.md for the rejected branch ---');
console.log(execFileSync('cat', [summary.results.find(r => r.diagnosis).diagnosis], { encoding: 'utf8' }));
