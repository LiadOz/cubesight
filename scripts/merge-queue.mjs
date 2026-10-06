#!/usr/bin/env node
// F18 merge queue. Operator doc: docs/MERGE-QUEUE.md
//
//   npm run queue -- <branch> [<branch> ...]      land branches, in order
//
// For each candidate: merge it into the CURRENT trunk tip in a scratch worktree
// under .agents/, run the Tier 1 gate on that MERGED RESULT, and only then
// advance trunk. A rejection leaves trunk untouched and writes a diagnosis.
// Plain Node and git; no dependencies.
import { spawn } from 'node:child_process';
import { mkdir, readFile, realpath, rm, symlink, writeFile, open } from 'node:fs/promises';
import { existsSync, statfsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TRUNK = 'feature/smart-cube-guidance';
const GATE_TIMEOUT_MS = Number(process.env.CUBESIGHT_QUEUE_GATE_TIMEOUT_MS) || 300_000;

/**
 * THE ONE PLACE that names the gate. Prefers the `tier1` npm script once the
 * test-health work lands it; until then it falls back to the equivalent
 * `test:merge` (lint+unit+build+gallery checks in parallel with the browser
 * smoke set). Read from the merged result, so the gate matches what trunk will be.
 */
export async function chooseGate(worktree) {
  const scripts = JSON.parse(await readFile(path.join(worktree, 'package.json'), 'utf8')).scripts ?? {};
  const script = scripts.tier1 ? 'tier1' : 'test:merge';
  return { name: 'tier1', command: 'npm', args: ['run', script] };
}

// ---------------------------------------------------------------- safety rules

/** Git subcommands/flags the queue refuses to run, enforced at the single spawn point. */
export function assertAllowedGit(args) {
  if (args.includes('--no-verify')) throw new Error('Safety rule: --no-verify is forbidden.');
  let sub;
  for (let i = 0; i < args.length && !sub; i++) {
    if (args[i] === '-C' || args[i] === '-c') i++; // skip the option's value
    else if (!args[i].startsWith('-')) sub = args[i];
  }
  if (sub === 'stash') throw new Error('Safety rule: the shared git stash must never be touched.');
}

/** Never run git/npm in the live checkout (its .agents/ subtree is the only allowed part). */
export function assertNotLiveCheckout(cwd, liveCheckout) {
  if (!liveCheckout) return;
  const rel = path.relative(path.resolve(liveCheckout), path.resolve(cwd));
  const inside = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  if (inside && !(rel === '.agents' || rel.startsWith(`.agents${path.sep}`))) {
    throw new Error(`Safety rule: refusing to run in the live checkout (${cwd}). Run the queue from your own worktree under .agents/worktrees/.`);
  }
}

export function cleanGitEnvironment(source = process.env) {
  const env = { ...source };
  for (const name of Object.keys(env)) {
    if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|PREFIX|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CEILING_DIRECTORIES|SHALLOW_FILE|NAMESPACE|REPLACE_REF_BASE|GRAFT_FILE|CONFIG|CONFIG_PARAMETERS|IMPLICIT_WORK_TREE|NO_REPLACE_OBJECTS)$/.test(name)
      || /^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(name)) delete env[name];
  }
  return env;
}

function run(command, args, { cwd, env = process.env, liveCheckout, timeoutMs, logFile } = {}) {
  if (command === 'git') assertAllowedGit(args);
  assertNotLiveCheckout(cwd, liveCheckout);
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, env: cleanGitEnvironment(env), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let stdout = '', stderr = '', timedOut = false;
    const sink = chunk => { if (logFile) logFile.write(chunk).catch(() => {}); };
    child.stdout.on('data', c => { stdout += c; sink(c); });
    child.stderr.on('data', c => { stderr += c; sink(c); });
    const timer = timeoutMs && setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); resolve({ code: 127, stdout, stderr: String(error), timedOut }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code: timedOut ? 124 : code, stdout: stdout.trim(), stderr: stderr.trim(), timedOut }); });
  });
}

const sanitize = value => value.replaceAll(/[^a-zA-Z0-9._-]/g, '-');

// ---------------------------------------------------------------- one attempt

/**
 * Merge `branch` into the trunk tip in a scratch worktree and gate the result.
 * Never advances trunk; the caller (runQueue) decides about promotion.
 * Returns an attempt record (also written to <artifacts>/attempt.json).
 */
export async function runQueueAttempt({
  repoRoot, branch, base = DEFAULT_TRUNK, baseCommit = null,
  gates = null, gateRunner = null,
  explainAlone = false, installDependencies = true, verifyStorage = false,
  liveCheckout, attemptId = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${process.pid}`,
} = {}) {
  if (!repoRoot || !branch) throw new Error('Queue attempt requires repoRoot and candidate branch.');
  const g = (args, o = {}) => run('git', args, { cwd: repoRoot, liveCheckout, ...o });
  const gOk = async (args, o) => {
    const r = await g(args, o);
    if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed (${r.code}): ${r.stderr || r.stdout}`);
    return r.stdout;
  };
  const commonDir = await gOk(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const root = path.dirname(commonDir);
  const artifactRoot = path.join(root, '.agents', 'artifacts', 'merge-queue', sanitize(attemptId));
  const worktreePath = path.join(root, '.agents', 'worktrees', 'merge-queue', sanitize(attemptId));
  await mkdir(artifactRoot, { recursive: true });
  if (verifyStorage) await ensureHostArtifacts(artifactRoot);

  const record = {
    schemaVersion: 2, attemptId, branch, base, candidateCommit: null, baseCommit: null, resultCommit: null,
    status: 'running', startedAt: new Date().toISOString(), finishedAt: null, durationMs: null,
    artifactRoot, worktreePath, gateResults: [], failure: null, diagnosis: null,
  };
  const saveRecord = () => writeFile(path.join(artifactRoot, 'attempt.json'), `${JSON.stringify(record, null, 2)}\n`);
  const logPath = path.join(artifactRoot, 'gate.log');
  const started = Date.now();
  const scratch = [];

  async function addScratch(commit, name) {
    const dir = name === 'merged' ? worktreePath : `${worktreePath}-${name}`;
    await gOk(['worktree', 'add', '--detach', dir, commit]);
    scratch.push(dir);
    const outputs = path.join(artifactRoot, name);
    for (const link of ['test-results', 'playwright-report', 'dist']) {
      await mkdir(path.join(outputs, link), { recursive: true });
      await symlink(path.join(outputs, link), path.join(dir, link), 'dir');
    }
    await mkdir(path.join(outputs, 'tmp'), { recursive: true });
    return { dir, env: {
      ...cleanGitEnvironment(process.env), TMPDIR: path.join(outputs, 'tmp'), CUBESIGHT_ARTIFACTS_ROOT: outputs,
      CUBESIGHT_VITE_CACHE_DIR: path.join(outputs, 'vite-cache'),
    } };
  }

  try {
    record.baseCommit = baseCommit ?? await gOk(['rev-parse', '--verify', `refs/heads/${base}^{commit}`]);
    record.candidateCommit = await gOk(['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]);
    if (branch === base) throw new Error('Candidate branch must differ from trunk.');

    const merged = await addScratch(record.baseCommit, 'merged');
    const merge = await run('git', ['merge', '--no-ff', '--no-edit', '-m', `Queue: merge ${branch}`, record.candidateCommit], { cwd: merged.dir, env: merged.env, liveCheckout });
    await writeFile(path.join(artifactRoot, 'merge.log'), `${merge.stdout}\n${merge.stderr}\n`);
    if (merge.code !== 0) {
      const conflicts = (await g(['diff', '--name-only', '--diff-filter=U'], { cwd: merged.dir })).stdout.split('\n').filter(Boolean);
      record.conflicts = conflicts;
      throw new Error(`Textual merge conflict with trunk in: ${conflicts.join(', ') || '(see merge.log)'}`);
    }
    record.resultCommit = await gOk(['rev-parse', 'HEAD'], { cwd: merged.dir });
    // Keep the merged result reachable after the scratch worktree is removed.
    await gOk(['update-ref', `refs/merge-queue/${sanitize(attemptId)}`, record.resultCommit]);
    await saveRecord();

    const outcome = await gateWorktree(merged, 'merged');
    record.gateResults = outcome.results;
    if (!outcome.ok) throw new Error(outcome.why);
    record.status = 'green';
  } catch (error) {
    record.status = 'rejected';
    record.failure = error?.message || String(error);
    await writeFile(logPath, `${record.failure}\n`, { flag: 'a' });
    if (explainAlone && record.resultCommit) record.passesAlone = await passesAlone();
    record.diagnosis = await diagnose();
  } finally {
    record.finishedAt = new Date().toISOString();
    record.durationMs = Date.now() - started;
    await saveRecord();
    for (const dir of scratch) await g(['worktree', 'remove', '--force', dir]).catch(() => {});
    await g(['worktree', 'prune']).catch(() => {});
  }
  return record;

  // Install dependencies for and run the gate in a prepared worktree.
  async function gateWorktree(wt, name) {
    const gateList = gates ?? [await chooseGate(wt.dir)];
    if (installDependencies) {
      const dep = await ensureDependencies(wt.dir, root, wt.env, logPath, liveCheckout);
      record.dependencies = { ...record.dependencies, [name]: dep };
      if (!dep.ok) return { ok: false, results: [], why: `Dependencies are not installed for the merged result: ${dep.reason}` };
    }
    const results = [];
    for (const gate of gateList) {
      const log = await open(logPath, 'a');
      await log.write(`\n[${name}] $ ${gate.command} ${gate.args.join(' ')}\n`);
      const t0 = Date.now();
      let result;
      try {
        result = gateRunner
          ? await gateRunner(gate, { cwd: wt.dir, env: wt.env, logPath })
          : await run(gate.command, gate.args, { cwd: wt.dir, env: wt.env, liveCheckout, timeoutMs: GATE_TIMEOUT_MS, logFile: log })
            .then(r => ({ name: gate.name, exitCode: r.code, durationMs: Date.now() - t0, error: r.timedOut ? `timed out after ${GATE_TIMEOUT_MS} ms` : undefined }));
      } catch (error) { result = { name: gate.name, exitCode: 127, durationMs: 0, error: error?.message || String(error) }; }
      await log.write(`\n[${name}/${gate.name}] exit=${result.exitCode} durationMs=${Date.now() - t0}\n`);
      await log.close();
      results.push({ ...result, command: gate.command, args: gate.args });
      if (result.exitCode !== 0) return { ok: false, results, why: `Gate ${gate.name} exited ${result.exitCode}${result.error ? `: ${result.error}` : ''}` };
    }
    return { ok: true, results };
  }

  // Run the same gate on the candidate alone: tells "broken branch" from "broken only in combination".
  async function passesAlone() {
    try { return (await gateWorktree(await addScratch(record.candidateCommit, 'alone'), 'alone')).ok; } catch { return null; }
  }

  async function diagnose() {
    const lines = [`# Queue rejection: ${branch}`, '', `- Trunk (${base}) at ${record.baseCommit}`, `- Candidate at ${record.candidateCommit}`, `- Reason: ${record.failure}`];
    if (record.passesAlone === true) lines.push('- The candidate PASSES the same gate on its own: this is a combination failure (trunk and the branch each work, together they do not).');
    if (record.passesAlone === false) lines.push('- The candidate also FAILS the gate on its own: fix the branch itself.');
    try {
      const mb = (await g(['merge-base', record.baseCommit, record.candidateCommit])).stdout;
      const names = async to => (await g(['diff', '--name-only', mb, to])).stdout.split('\n').filter(Boolean);
      const trunkSide = new Set(await names(record.baseCommit));
      const both = (await names(record.candidateCommit)).filter(f => trunkSide.has(f));
      lines.push(`- Merge base ${mb}; trunk advanced by ${(await g(['rev-list', '--count', `${mb}..${record.baseCommit}`])).stdout} commits since the branch left it.`);
      lines.push(both.length ? `- Files changed on BOTH sides (look here first): ${both.join(', ')}` : '- No file was changed on both sides: the interaction is semantic (shared sizing, tokens, registries). Compare what each side changed.');
      const trunkLog = (await g(['log', '--oneline', '--no-merges', '-n', '15', `${mb}..${record.baseCommit}`])).stdout;
      if (trunkLog) lines.push('', 'Trunk commits the branch has not seen:', '```', trunkLog, '```');
    } catch { /* best effort */ }
    try {
      const tail = (await readFile(logPath, 'utf8')).split('\n').slice(-60).join('\n');
      lines.push('', 'Last of gate.log:', '```', tail, '```');
    } catch { /* no log */ }
    lines.push('', `Full log: ${logPath}`, 'Trunk was NOT changed. Update your branch from trunk, fix, and queue again.');
    const file = path.join(artifactRoot, 'diagnosis.md');
    await writeFile(file, `${lines.join('\n')}\n`);
    return file;
  }
}

// Reuse the shared node_modules when the merged lockfile matches what is installed;
// otherwise `npm ci` in the scratch worktree so a new dependency is genuinely tested.
export async function ensureDependencies(worktree, root, env, logPath, liveCheckout) {
  const shared = process.env.CUBESIGHT_QUEUE_NODE_MODULES || path.join(root, 'node_modules');
  const mismatch = await lockMismatch(worktree, shared);
  if (!mismatch && existsSync(shared)) {
    await symlink(await realpath(shared), path.join(worktree, 'node_modules'), 'dir');
    return { ok: true, mode: 'shared node_modules' };
  }
  const log = await open(logPath, 'a');
  const r = await run('npm', ['ci', '--ignore-scripts'], { cwd: worktree, env, liveCheckout, timeoutMs: 600_000, logFile: log });
  await log.close();
  return r.code === 0 ? { ok: true, mode: 'npm ci', why: mismatch } : { ok: false, reason: `npm ci failed (${mismatch ?? 'no shared node_modules'}): ${r.stderr.split('\n').slice(-3).join(' ')}` };
}

async function lockMismatch(worktree, shared) {
  try {
    const lock = JSON.parse(await readFile(path.join(worktree, 'package-lock.json'), 'utf8')).packages ?? {};
    const hidden = JSON.parse(await readFile(path.join(shared, '.package-lock.json'), 'utf8')).packages ?? {};
    for (const [name, info] of Object.entries(lock)) {
      if (!name || info.optional || info.link) continue;
      if (hidden[name]?.version !== info.version) return `${name} ${info.version} is not what is installed (${hidden[name]?.version ?? 'missing'})`;
    }
    return null;
  } catch (error) { return `cannot compare lockfile (${error.code ?? error.message})`; }
}

function ensureHostArtifacts(artifactRoot) {
  const dir = path.dirname(artifactRoot);
  const stats = statfsSync(dir);
  const free = Number(stats.bavail) * Number(stats.bsize);
  return run('df', ['-Pk', dir], { cwd: dir }).then(r => {
    const fs = r.stdout.split('\n').at(-1)?.trim().split(/\s+/)[0];
    if (fs !== 'host' && !(process.env.CI === 'true' && free >= 10 * 1024 ** 3)) {
      throw new Error(`Queue artifacts must be on the host-backed .agents filesystem, not a sandbox overlay.\n${r.stdout}`);
    }
  });
}

// ---------------------------------------------------------------- the queue

async function worktreesHoldingBranch(repoRoot, branch, liveCheckout) {
  const out = (await run('git', ['worktree', 'list', '--porcelain'], { cwd: repoRoot, liveCheckout })).stdout;
  const holders = [];
  let current = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) current = line.slice(9);
    if (line === `branch refs/heads/${branch}`) holders.push(current);
  }
  return holders;
}

/**
 * Process branches in order. Each is merged onto the tip left by the previous
 * one, so queued changes are validated in combination, not in isolation.
 * Trunk is advanced (compare-and-swap) only after a green gate, and only when no
 * worktree has trunk checked out; otherwise the green tip is handed to the lead.
 */
export async function runQueue({ repoRoot, branches, base = DEFAULT_TRUNK, liveCheckout, promote = true, ...attemptOptions }) {
  const commonDir = (await run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repoRoot, liveCheckout })).stdout;
  const lockPath = path.join(commonDir, 'merge-queue.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another queue run holds ${lockPath}; runs are serialized. If it is stale (no queue process alive), delete that file.`);
    throw error;
  }
  await lock.writeFile(`${JSON.stringify({ pid: process.pid, branches, startedAt: new Date().toISOString() })}\n`);
  const results = [];
  const resolve = async ref => (await run('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: repoRoot, liveCheckout })).stdout;
  try {
    const holders = await worktreesHoldingBranch(repoRoot, base, liveCheckout);
    const held = holders.length > 0;
    let tip = await resolve(`refs/heads/${base}`);
    const startTip = tip;
    for (const branch of branches) {
      let attempt;
      for (let tries = 0; tries < 3; tries++) {
        attempt = await runQueueAttempt({ repoRoot, branch, base, baseCommit: tip, liveCheckout, ...attemptOptions });
        if (attempt.status !== 'green' || held || !promote) break;
        const moved = await run('git', ['update-ref', `refs/heads/${base}`, attempt.resultCommit, tip], { cwd: repoRoot, liveCheckout });
        if (moved.code === 0) { attempt.status = 'landed'; break; }
        tip = await resolve(`refs/heads/${base}`); // trunk moved while we were testing: re-test on the new tip
        attempt.status = 'stale-retrying';
      }
      if (attempt.status === 'landed' || attempt.status === 'green') tip = attempt.resultCommit;
      results.push(attempt);
    }
    const summary = { base, startTip, endTip: tip, trunkHeldBy: holders, results: results.map(r => ({ branch: r.branch, status: r.status, resultCommit: r.resultCommit, failure: r.failure, diagnosis: r.diagnosis })) };
    if (held && tip !== startTip) summary.handover = `Trunk is checked out in ${holders.join(', ')}; the queue will not move it under a working tree. Green tip ${tip}. In that checkout run: git merge --ff-only ${tip}`;
    return summary;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

function formatSummary(summary) {
  const out = [`Queue on ${summary.base}: ${summary.startTip.slice(0, 9)} -> ${summary.endTip.slice(0, 9)}`];
  for (const r of summary.results) {
    out.push(`  ${r.status.toUpperCase().padEnd(9)} ${r.branch}${r.failure ? `\n            ${r.failure}\n            diagnosis: ${r.diagnosis}` : ''}`);
  }
  if (summary.handover) out.push('', summary.handover);
  return out.join('\n');
}

// ---------------------------------------------------------------- CLI

async function mainWorktree(repoRoot) {
  const out = (await run('git', ['worktree', 'list', '--porcelain'], { cwd: repoRoot })).stdout;
  return out.split('\n')[0].replace(/^worktree /, '');
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  try {
    const args = process.argv.slice(2);
    const opts = { base: DEFAULT_TRUNK, explainAlone: true, promote: true };
    const branches = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--base') opts.base = args[++i];
      else if (args[i] === '--no-explain') opts.explainAlone = false;
      else if (args[i] === '--validate-only') opts.promote = false;
      else if (args[i].startsWith('--')) throw new Error(`Unknown option ${args[i]}\nUsage: npm run queue -- [--base trunk] [--validate-only] [--no-explain] <branch>...`);
      else branches.push(args[i]);
    }
    const repoRoot = path.resolve(path.dirname(thisFile), '..');
    const liveCheckout = process.env.CUBESIGHT_LIVE_CHECKOUT || await mainWorktree(repoRoot);
    assertNotLiveCheckout(repoRoot, liveCheckout);
    if (!branches.length) branches.push((await run('git', ['branch', '--show-current'], { cwd: repoRoot, liveCheckout })).stdout);
    const summary = await runQueue({ repoRoot, branches, liveCheckout, verifyStorage: true, ...opts });
    console.log(formatSummary(summary));
    if (summary.results.some(r => !['landed', 'green'].includes(r.status))) process.exitCode = 1;
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}
