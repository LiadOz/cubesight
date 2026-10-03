#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { open, mkdir, rm, symlink, writeFile, lstat, realpath } from 'node:fs/promises';
import { existsSync, statfsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_GATES = [
  { name: 'check', command: 'npm', args: ['run', 'check'] },
  { name: 'playwright', command: 'npx', args: ['playwright', 'test', '--update-snapshots=none', '--output=test-results/queue-playwright'] },
  { name: 'pwa', command: 'npm', args: ['run', 'test:pwa', '--', '--update-snapshots=none', '--output=test-results/queue-pwa'] },
  { name: 'layout', command: 'npm', args: ['run', 'test:layout', '--', '--update-snapshots=none', '--output=test-results/queue-layout'] },
  { name: 'snapshots', command: 'npm', args: ['run', 'test:snapshots', '--', '--update-snapshots=none', '--output=test-results/queue-snapshots'] },
  { name: 'performance-capture', command: 'npm', args: ['run', 'perf'] },
  { name: 'performance-budgets', command: 'npm', args: ['run', 'perf:check'] },
];

export function cleanGitEnvironment(source = process.env) {
  const env = { ...source };
  const localGitVariables = new Set([
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CEILING_DIRECTORIES',
    'GIT_SHALLOW_FILE', 'GIT_NAMESPACE', 'GIT_REPLACE_REF_BASE', 'GIT_GRAFT_FILE',
    'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_IMPLICIT_WORK_TREE', 'GIT_NO_REPLACE_OBJECTS',
  ]);
  for (const name of Object.keys(env)) {
    if (localGitVariables.has(name) || /^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(name)) delete env[name];
  }
  return env;
}

function git(cwd, args, options = {}) {
  const { env: requestedEnv, ...spawnOptions } = options;
  const child = spawn('git', args, {
    cwd, stdio: ['ignore', 'pipe', 'pipe'], ...spawnOptions,
    env: cleanGitEnvironment(requestedEnv ?? process.env),
  });
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

async function gitOk(cwd, args, options) {
  const result = await git(cwd, args, options);
  if (result.code !== 0) throw new Error(`git ${args.join(' ')} failed (${result.code}): ${result.stderr || result.stdout}`);
  return result.stdout;
}

function sanitize(value) { return value.replaceAll(/[^a-zA-Z0-9._-]/g, '-'); }
function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function ensureHostArtifacts(artifactRoot) {
  const stats = statfsSync(path.dirname(artifactRoot));
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  const df = spawn('df', ['-Pk', path.dirname(artifactRoot)], { stdio: ['ignore', 'pipe', 'ignore'] });
  return new Promise((resolve, reject) => {
    let stdout = '';
    df.stdout.on('data', chunk => { stdout += chunk; });
    df.on('error', reject);
    df.on('close', code => {
      const row = stdout.trim().split('\n').at(-1)?.trim().split(/\s+/) ?? [];
      const hostFilesystem = row[0] === 'host';
      const ciStorage = process.env.CI === 'true' && freeBytes >= 10 * 1024 ** 3;
      if (code !== 0 || (!hostFilesystem && !ciStorage)) {
        reject(new Error(`Queue artifacts must use the host-backed .agents filesystem (or CI storage with 10 GiB free).\n${stdout}`));
      } else resolve();
    });
  });
}

async function runGate(gate, { cwd, env, logPath }) {
  const log = await open(logPath, 'a');
  const startedAt = Date.now();
  await log.write(`\n$ ${gate.command} ${gate.args.join(' ')}\n`);
  const child = spawn(gate.command, gate.args, { cwd, env: cleanGitEnvironment(env), stdio: ['ignore', 'pipe', 'pipe'] });
  let writes = Promise.resolve();
  const append = chunk => { writes = writes.then(() => log.write(chunk)); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  }).catch(async error => { await log.write(`\nFailed to start gate: ${error.message}\n`); return 127; });
  await writes;
  await log.write(`\n[${gate.name}] exit=${exitCode} durationMs=${Date.now() - startedAt}\n`);
  await log.close();
  return { name: gate.name, exitCode, durationMs: Date.now() - startedAt };
}

/**
 * Build and validate an isolated trunk + candidate merge. This command never
 * advances trunk; it leaves a durable queue result ref for the lead to review.
 */
export async function runQueueAttempt({
  repoRoot,
  branch,
  base = 'feature/smart-cube-guidance',
  gates = REQUIRED_GATES,
  gateRunner = runGate,
  verifyStorage = false,
  installDependencies = true,
  attemptId = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${process.pid}`,
} = {}) {
  if (!repoRoot || !branch) throw new Error('Queue attempt requires repoRoot and candidate branch.');
  const commonDir = await gitOk(repoRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const repositoryRoot = path.dirname(commonDir);
  const actualRoot = path.resolve(await gitOk(repoRoot, ['rev-parse', '--show-toplevel']));
  if (actualRoot !== path.resolve(repoRoot)) throw new Error(`Queue repoRoot mismatch: requested ${path.resolve(repoRoot)}, Git resolved ${actualRoot}.`);
  const artifactRoot = path.join(repositoryRoot, '.agents', 'artifacts', 'merge-queue', sanitize(attemptId));
  const worktreePath = path.join(repositoryRoot, '.agents', 'worktrees', 'merge-queue', sanitize(attemptId));
  const lockPath = path.join(commonDir, 'merge-queue.lock');
  await mkdir(path.dirname(artifactRoot), { recursive: true });
  if (verifyStorage) await ensureHostArtifacts(artifactRoot);
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another queue attempt holds ${lockPath}; queue runs are serialized.`);
    throw error;
  }

  const record = {
    schemaVersion: 1, attemptId, branch, candidateCommit: null, base, baseCommit: null, baseCommitAtFinish: null, resultCommit: null,
    status: 'running', startedAt: new Date().toISOString(), finishedAt: null,
    durationMs: null, artifactRoot, worktreePath, gateResults: [], failure: null,
    trunkPromotion: 'lead-owned; not performed by this command',
  };
  const recordPath = path.join(artifactRoot, 'attempt.json');
  const logPath = path.join(artifactRoot, 'gate.log');
  const saveRecord = () => writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  const started = Date.now();
  await mkdir(artifactRoot, { recursive: true });
  await lock.writeFile(`${JSON.stringify({ pid: process.pid, branch, startedAt: record.startedAt })}\n`);

  let worktreeAdded = false;
  try {
    const dirty = await gitOk(repoRoot, ['status', '--porcelain', '--untracked-files=all']);
    const allowedGeneratedLinks = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', 'coverage']);
    const unexpectedChanges = [];
    for (const row of dirty ? dirty.split('\n') : []) {
      const status = row.slice(0, 2), relativePath = row.slice(3);
      if (!['??', 'A '].includes(status) || !allowedGeneratedLinks.has(relativePath)) {
        unexpectedChanges.push(row);
        continue;
      }
      try {
        const info = await lstat(path.join(repoRoot, relativePath));
        const target = await realpath(path.join(repoRoot, relativePath));
        const artifactsRoot = path.join(repositoryRoot, '.agents', 'artifacts');
        const approvedTarget = relativePath === 'node_modules'
          ? target === path.join(repositoryRoot, 'node_modules') || isWithin(target, artifactsRoot)
          : isWithin(target, artifactsRoot);
        if (!info.isSymbolicLink() || !approvedTarget) unexpectedChanges.push(row);
      } catch { unexpectedChanges.push(row); }
    }
    if (unexpectedChanges.length) throw new Error(`Candidate worktree has uncommitted changes; preserve them and queue a clean commit:\n${unexpectedChanges.join('\n')}`);
    record.baseCommit = await gitOk(repoRoot, ['rev-parse', '--verify', `refs/heads/${base}^{commit}`]);
    const candidateCommit = await gitOk(repoRoot, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]);
    record.candidateCommit = candidateCommit;
    if (branch === base) throw new Error('Candidate branch must differ from trunk.');
    await gitOk(repoRoot, ['worktree', 'add', '--detach', worktreePath, record.baseCommit]);
    worktreeAdded = true;
    for (const [name, target] of [
      ['test-results', path.join(artifactRoot, 'test-results')],
      ['playwright-report', path.join(artifactRoot, 'playwright-report')], ['coverage', path.join(artifactRoot, 'coverage')],
      ['dist', path.join(artifactRoot, 'dist')],
    ]) {
      await mkdir(target, { recursive: true });
      await symlink(target, path.join(worktreePath, name), 'dir');
    }
    await mkdir(path.join(artifactRoot, 'tmp'), { recursive: true });
    await mkdir(path.join(artifactRoot, 'npm-cache'), { recursive: true });
    const env = cleanGitEnvironment({
      ...process.env,
      TMPDIR: path.join(artifactRoot, 'tmp'),
      npm_config_cache: path.join(artifactRoot, 'npm-cache'),
      CUBESIGHT_ARTIFACTS_ROOT: artifactRoot,
      CUBESIGHT_VITE_CACHE_DIR: path.join(artifactRoot, 'vite-cache'),
    });
    delete env.CUBESIGHT_REF;
    delete env.CUBESIGHT_SHARED_NODE_MODULES;
    const bootstrapModules = process.env.CUBESIGHT_QUEUE_BOOTSTRAP_NODE_MODULES || path.join(repositoryRoot, 'node_modules');
    if (bootstrapModules && existsSync(bootstrapModules)) await symlink(await realpath(bootstrapModules), path.join(worktreePath, 'node_modules'), 'dir');
    const hookPath = path.join(repositoryRoot, '.githooks');
    const merge = await git(repoRoot, ['-c', `core.hooksPath=${hookPath}`, 'merge', '--no-ff', '--no-edit', candidateCommit], { cwd: worktreePath, env });
    await writeFile(path.join(artifactRoot, 'merge.log'), `${merge.stdout}\n${merge.stderr}\n`);
    if (merge.code !== 0) throw new Error(`Trunk + candidate merge failed (${merge.code}); see merge.log.`);
    const bootstrapLink = path.join(worktreePath, 'node_modules');
    try {
      const bootstrapStat = await lstat(bootstrapLink);
      if (bootstrapStat.isSymbolicLink()) await rm(bootstrapLink);
    } catch {}
    record.resultCommit = await gitOk(worktreePath, ['rev-parse', 'HEAD']);
    await gitOk(worktreePath, ['update-ref', `refs/merge-queue/${sanitize(attemptId)}`, record.resultCommit, '0000000000000000000000000000000000000000']);
    await saveRecord();

    if (installDependencies) {
      const installGate = { name: 'dependency-install', command: 'npm', args: ['ci', '--ignore-scripts'] };
      const installResult = await runGate(installGate, { cwd: worktreePath, env, logPath });
      record.dependencyInstall = { ...installResult, command: installGate.command, args: installGate.args, cwd: worktreePath, logPath };
      await saveRecord();
      if (installResult.exitCode !== 0) throw new Error(`Dependency install failed (${installResult.exitCode}); see gate.log.`);
    }

    for (const gate of gates) {
      let result;
      try { result = await gateRunner(gate, { cwd: worktreePath, env, logPath }); }
      catch (error) { result = { name: gate.name, exitCode: 127, durationMs: 0, error: error?.message || String(error) }; }
      result = {
        ...result, command: gate.command, args: [...gate.args], cwd: worktreePath,
        env: { TMPDIR: env.TMPDIR, npm_config_cache: env.npm_config_cache, CUBESIGHT_ARTIFACTS_ROOT: env.CUBESIGHT_ARTIFACTS_ROOT, CUBESIGHT_VITE_CACHE_DIR: env.CUBESIGHT_VITE_CACHE_DIR, CI: env.CI ?? null, TZ: env.TZ ?? null },
        logPath,
      };
      record.gateResults.push(result);
      await saveRecord();
      if (result.exitCode !== 0) {
        record.status = 'rejected';
        record.failure = `Gate ${gate.name} exited ${result.exitCode}${result.error ? `: ${result.error}` : '.'}`;
        for (const skipped of gates.slice(record.gateResults.length)) {
          record.gateResults.push({ name: skipped.name, status: 'skipped', command: skipped.command, args: [...skipped.args], cwd: worktreePath, logPath, exitCode: null, reason: `Earlier gate ${gate.name} failed.` });
        }
        break;
      }
    }
    record.baseCommitAtFinish = await gitOk(repoRoot, ['rev-parse', '--verify', `refs/heads/${base}^{commit}`]);
    if (record.status === 'running' && record.baseCommitAtFinish !== record.baseCommit) {
      record.status = 'rejected';
      record.failure = `Base advanced during validation (${record.baseCommit} -> ${record.baseCommitAtFinish}); rerun against the current base.`;
    } else if (record.status === 'running') record.status = 'ready-for-lead-promotion';
  } catch (error) {
    record.status = 'rejected';
    record.failure = error?.message || String(error);
    for (const skipped of gates.slice(record.gateResults.length)) {
      record.gateResults.push({ name: skipped.name, status: 'skipped', command: skipped.command, args: [...skipped.args], cwd: worktreePath, logPath, exitCode: null, reason: record.failure });
    }
    await writeFile(logPath, `${record.failure}\n`, { flag: 'a' });
  } finally {
    record.finishedAt = new Date().toISOString();
    record.durationMs = Date.now() - started;
    await saveRecord();
    if (worktreeAdded) {
      if (!record.resultCommit) await git(worktreePath, ['merge', '--abort']).catch(() => {});
      await git(repoRoot, ['worktree', 'remove', '--force', worktreePath]).catch(() => {});
      await git(repoRoot, ['worktree', 'prune']).catch(() => {});
    }
    await lock.close();
    await rm(lockPath, { force: true });
  }
  return record;
}

function parseArgs(args) {
  const result = { branch: null, base: 'feature/smart-cube-guidance' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--branch') result.branch = args[++i];
    else if (args[i] === '--base') result.base = args[++i];
    else throw new Error(`Unknown queue option: ${args[i]}`);
  }
  return result;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  try {
    const { branch: requested, base } = parseArgs(process.argv.slice(2));
    const repoRoot = path.resolve(path.dirname(thisFile), '..');
    const current = (await gitOk(repoRoot, ['branch', '--show-current']));
    const branch = requested || current;
    const result = await runQueueAttempt({ repoRoot, branch, base, verifyStorage: true });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'ready-for-lead-promotion') process.exitCode = 1;
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}
