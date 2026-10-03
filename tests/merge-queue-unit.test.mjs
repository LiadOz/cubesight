import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQueueAttempt } from '../scripts/merge-queue.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const localGitVariables = new Set([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_IMPLICIT_WORK_TREE', 'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE', 'GIT_NO_REPLACE_OBJECTS', 'GIT_REPLACE_REF_BASE', 'GIT_PREFIX',
  'GIT_SHALLOW_FILE', 'GIT_COMMON_DIR',
]);

function git(cwd, args, env = gitEnv) {
  const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

test('queue rejects a failing merge without touching real refs or identity', async () => {
  const scratch = await mkdtemp(path.join(process.env.TMPDIR || os.tmpdir(), 'cubesight-queue-proof-'));
  const fixture = path.join(scratch, 'repo');
  await mkdir(fixture);
  const realRefsBefore = git(repoRoot, ['rev-parse', 'fleet/combined', 'feature/smart-cube-guidance']);
  const identityBefore = spawnSync('git', ['config', '--global', '--get-regexp', '^user\\.(name|email)$'], {
    env: gitEnv, encoding: 'utf8',
  }).stdout.trim();
  const originalGitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('GIT_')));

  try {
    git(fixture, ['init', '-b', 'trunk']);
    git(fixture, ['config', 'user.name', 'Queue Proof']);
    git(fixture, ['config', 'user.email', 'queue-proof@example.invalid']);
    await writeFile(path.join(fixture, 'base.marker'), 'base\n');
    git(fixture, ['add', '.']);
    git(fixture, ['commit', '-m', 'base']);
    const baseCommit = git(fixture, ['rev-parse', 'HEAD']);
    git(fixture, ['branch', 'feature/smart-cube-guidance']);
    git(fixture, ['switch', '-c', 'candidate']);
    await writeFile(path.join(fixture, 'candidate.marker'), 'candidate\n');
    git(fixture, ['add', '.']);
    git(fixture, ['commit', '-m', 'candidate']);
    const candidateCommit = git(fixture, ['rev-parse', 'HEAD']);

    assert.equal(git(fixture, ['rev-list', '--parents', '-n', '1', 'refs/heads/candidate']).split(/\s+/).length - 1, 1,
      'candidate-alone fixture should pass the standalone invariant');

    Object.assign(process.env, {
      GIT_DIR: path.join(repoRoot, '.git'),
      GIT_WORK_TREE: repoRoot,
      GIT_INDEX_FILE: path.join(scratch, 'hostile-index'),
      GIT_COMMON_DIR: path.join(repoRoot, '.git'),
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'user.email',
      GIT_CONFIG_VALUE_0: 'queue-test@example.invalid',
      GIT_CONFIG_PARAMETERS: 'user.name=Hostile',
      GIT_CONFIG: path.join(scratch, 'hostile-config'),
      GIT_IMPLICIT_WORK_TREE: '0',
      GIT_NO_REPLACE_OBJECTS: '1',
    });

    const gate = { name: 'deliberate-merge-regression', command: 'proof-gate', args: ['standalone-pass-merged-fail'] };
    const result = await runQueueAttempt({
      repoRoot: fixture,
      branch: 'candidate',
      base: 'feature/smart-cube-guidance',
      gates: [gate],
      verifyStorage: false,
      installDependencies: false,
      attemptId: `synthetic-${process.pid}`,
      gateRunner: async (_gate, { cwd, env }) => {
        const leaked = Object.keys(env).filter(key => localGitVariables.has(key) || /^GIT_CONFIG_(?:KEY_\d+|VALUE_\d+)$/.test(key));
        if (leaked.length) return { name: gate.name, exitCode: 97, durationMs: 0, error: `Git env leaked: ${leaked.join(', ')}` };
        const topLevel = git(cwd, ['rev-parse', '--show-toplevel'], env);
        if (path.resolve(topLevel) !== path.resolve(cwd)) return { name: gate.name, exitCode: 98, durationMs: 0, error: 'gate cwd is not its isolated worktree' };
        const parents = git(cwd, ['rev-list', '--parents', '-n', '1', 'HEAD'], env).split(/\s+/).length - 1;
        if (parents !== 2) return { name: gate.name, exitCode: 98, durationMs: 0, error: `expected merged result; found ${parents} parents` };
        return { name: gate.name, exitCode: 1, durationMs: 1, error: 'deliberate merged-result regression' };
      },
    });

    for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];
    Object.assign(process.env, originalGitEnv);

    assert.equal(result.status, 'rejected');
    assert.equal(result.gateResults[0].exitCode, 1);
    const record = JSON.parse(await readFile(path.join(result.artifactRoot, 'attempt.json'), 'utf8'));
    assert.equal(record.candidateCommit, candidateCommit);
    assert.equal(record.baseCommit, baseCommit);
    assert.ok(record.resultCommit);
    assert.equal(git(repoRoot, ['rev-parse', 'fleet/combined', 'feature/smart-cube-guidance']), realRefsBefore);
    assert.equal(spawnSync('git', ['config', '--global', '--get-regexp', '^user\\.(name|email)$'], {
      env: gitEnv, encoding: 'utf8',
    }).stdout.trim(), identityBefore);
  } finally {
    for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];
    Object.assign(process.env, originalGitEnv);
    await rm(scratch, { recursive: true, force: true });
  }
});
