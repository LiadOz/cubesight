#!/usr/bin/env node
// Which tests does this change reach? (and, without --dry-run, run just those)
//
//   node scripts/test-affected.mjs --dry-run                 diff against trunk + uncommitted work
//   node scripts/test-affected.mjs --dry-run --files src/x.js   what if this whole file changed?
//   node scripts/test-affected.mjs --base <ref> [--head <ref>]  an explicit range (replay a commit)
//   --verbose lists every selected test; --json prints the plan; --unit-only runs every unit test (pre-commit hook)
import { spawnSync } from 'node:child_process';
import { DEFAULT_TRUNK, formatPlan, gateEnv, gateStages, planGate, prepareGateDirectory, updateMapFromRun } from './test-gate.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const filesIndex = args.indexOf('--files');
const files = filesIndex >= 0 ? args.slice(filesIndex + 1).filter((entry) => !entry.startsWith('--')) : null;
const root = process.cwd();

// The pre-commit hook asks for --unit-only: unit tests are cheap (about 7 s) so they all run, never a subset.
if (flag('--unit-only')) {
  const result = spawnSync('npm', ['run', '--silent', 'test:unit'], { cwd: root, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const plan = await planGate({
  root, trunk: value('--trunk') ?? DEFAULT_TRUNK, base: value('--base'), head: value('--head'), files,
  budgetMs: Number(value('--budget') ?? 60_000), workers: Number(value('--workers') ?? 2),
});
console.log(formatPlan(plan, { verbose: flag('--verbose') }));
if (flag('--json')) console.log(JSON.stringify({ run: plan.packed.run.map((item) => item.key), deferred: plan.packed.deferred.map((item) => item.key) }, null, 2));
if (flag('--dry-run')) process.exit(0);

await prepareGateDirectory(root);
const env = gateEnv(root, plan);
let status = 0;
for (const [name, command, commandArgs] of gateStages(plan, { checks: false })) {
  console.log(`\n> ${name}`);
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit', env });
  if (result.status !== 0) { status = result.status ?? 1; break; }
}
console.log(await updateMapFromRun(root, plan));
process.exit(status);
