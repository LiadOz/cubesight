import { weakCases } from '../solve-metrics.js';
import { canonicalCasePath, getCase } from '../algs/seed/cases.js';

/** Return up to three evidence-backed canonical cases for one recognition drill. */
export function weakPracticeCases(records, kind, limit = 3) {
  if (!['oll', 'pll'].includes(kind)) return [];
  const field = `${kind}Case`;
  const rows = weakCases(records, field, kind === 'oll' ? 57 : 21, 2).map(stats => {
    const row = getCase(stats.case);
    return row ? {
      kind, stats, row,
      caseValue: row.set === 'oll' ? String(row.number) : row.name,
      recognitionHref: stats.extraLooks > 0 || stats.recognitionSamples >= 2
        ? `#/drills/${kind}?cases=${encodeURIComponent(row.set === 'oll' ? row.number : row.name)}` : null,
      executionHref: stats.executionSamples >= 2 ? `${canonicalCasePath(row)}/drill` : null,
    } : null;
  }).filter(Boolean);
  return rows.slice(0, limit);
}

export const weakPracticeHref = rows => {
  const cases = rows.filter(row => row.recognitionHref).map(row => row.caseValue);
  return cases.length ? `#/drills/${rows[0].kind}?cases=${encodeURIComponent(cases.join(','))}` : null;
};
