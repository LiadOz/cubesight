#!/usr/bin/env node
// Replay the selector against real history: for each commit, select with base = <commit>^ and
// head = <commit>, then check whether the tests that commit added or changed were selected.
//   node scripts/test-replay.mjs <commit> [<commit> ...]
import { execFileSync } from 'node:child_process';
import { changedSpecTests, gitChanges } from './test-select.mjs';
import { planGate } from './test-gate.mjs';

const root = process.cwd();
const commits = process.argv.slice(2).filter((entry) => !entry.startsWith('--'));
const rows = [];
for (const commit of commits) {
  const full = execFileSync('git', ['rev-parse', `${commit}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  const base = `${full}^`;
  const started = performance.now();
  const plan = await planGate({ root, base, head: full });
  const selectMs = Math.round(performance.now() - started);
  const subject = execFileSync('git', ['log', '-1', '--format=%s', full], { cwd: root, encoding: 'utf8' }).trim();
  // Tests this commit added or changed.
  const expected = [];
  for (const change of await gitChanges({ root, base, head: full })) {
    if (/^tests\/(?!layout\/|snapshots\/).*\.spec\.js$/u.test(change.file) && change.newText != null) {
      const plan2 = changedSpecTests(change.oldText, change.newText);
      if (plan2.whole) expected.push({ spec: change.file, whole: true });
      else for (const title of plan2.titles) expected.push({ spec: change.file, title });
    }
    if (/-unit\.test\.mjs$/u.test(change.file)) expected.push({ spec: change.file, unit: true });
  }
  // Expand each expectation into concrete tests (a whole new spec means every test the map knows in it).
  const concrete = [];
  for (const entry of expected) {
    if (entry.unit) continue;
    if (entry.whole) {
      const known = [...plan.model.tests].filter(([, info]) => info.spec === entry.spec);
      if (known.length) for (const [id, info] of known) concrete.push({ spec: entry.spec, id, label: info.titlePath.at(-1) });
      else concrete.push({ spec: entry.spec, label: entry.spec });
    } else concrete.push({ spec: entry.spec, title: entry.title, label: entry.title });
  }
  const reached = (entry, plan_) => {
    const run = new Set(plan_.packed.run.map((item) => item.key));
    return [...plan_.selection.items.values()].some((item) => run.has(item.key) && item.spec === entry.spec
      && ((entry.id && item.id === entry.id) || (item.kind === 'title' && item.title === entry.label) || (item.kind === 'case' && item.grepTitle.endsWith(entry.label)) || (item.kind === 'spec')));
  };
  // The honest test: hide the tests the commit touched and see whether the SOURCE change alone finds them.
  const sourcePlan = await planGate({ root, base, head: full, filter: (change) => !/^tests\//u.test(change.file) });
  const missed = concrete.filter((entry) => !reached(entry, plan));
  const sourceMissed = concrete.filter((entry) => !reached(entry, sourcePlan));
  const items = [...plan.selection.items.values()].filter((item) => !item.floor);
  const broad = items.filter((item) => item.tier === 2).length;
  const deferredSpecific = plan.packed.deferred.filter((item) => item.tier !== 2).length;
  rows.push({
    commit: full.slice(0, 7), subject: subject.slice(0, 48), files: plan.changes.length,
    specific: items.length - broad, broad, run: plan.packed.run.length, 'deferred specific': deferredSpecific, 'deferred broad': plan.packed.deferred.length - deferredSpecific,
    'est s': (plan.packed.estimatedMs / 1000 + 9).toFixed(1), 'select ms': selectMs,
    'unit tests changed': expected.filter((entry) => entry.unit).length,
    recall: concrete.length ? (missed.length ? `NO (${missed.length}/${concrete.length} missed)` : `yes (${concrete.length}/${concrete.length})`) : 'unit only',
    'source-only recall': concrete.length ? `${concrete.length - sourceMissed.length}/${concrete.length}` : 'n/a',
    warnings: plan.selection.warnings.length,
  });
}
console.table(rows);
