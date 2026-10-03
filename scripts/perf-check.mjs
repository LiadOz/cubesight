import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { comparePerformanceReport } from './perf-budget.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.resolve(root, process.argv[2] ?? 'test-results/perf/report.json');
const budgetsPath = path.resolve(root, process.argv[3] ?? 'perf/budgets.json');
const measuredCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
let report;
let budgets;
try { report = JSON.parse(await readFile(reportPath, 'utf8')); }
catch { throw new Error(`Performance report missing or invalid: ${path.relative(root, reportPath)}`); }
if (report.commit !== measuredCommit) throw new Error(`Performance report is for ${report.commit}, not current tested commit ${measuredCommit}; capture this exact merged result before checking budgets.`);
try { budgets = JSON.parse(await readFile(budgetsPath, 'utf8')); }
catch { throw new Error(`Measured performance budgets missing or invalid: ${path.relative(root, budgetsPath)}`); }
const failures = comparePerformanceReport(report, budgets);
if (failures.length) {
  console.error('Performance budget check failed:');
  for (const failure of failures) console.error(`- ${failure.metric}: ${failure.reason}${failure.measured === undefined ? '' : ` (${failure.measured}; limit ${failure.limit})`}`);
  process.exitCode = 1;
} else {
  console.log(`Performance budgets passed for ${Object.keys(budgets.metrics).length} measured metrics.`);
}
