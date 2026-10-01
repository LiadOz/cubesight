import oll from '../../../data/algs/oll.json' with { type: 'json' };
import pll from '../../../data/algs/pll.json' with { type: 'json' };
import f2l from '../../../data/algs/f2l.json' with { type: 'json' };
import oll2 from '../../../data/algs/oll2.json' with { type: 'json' };

export const ALG_SETS = Object.freeze([
  { id: 'pll', name: 'PLL', count: pll.cases.length, status: 'ready' },
  { id: 'oll', name: 'OLL', count: oll.cases.length, status: 'ready' },
  { id: 'oll2', name: '2-look', count: oll2.cases.length, status: 'ready' },
  { id: 'f2l', name: 'F2L', count: f2l.cases.filter(row => !row.variantOf).length, variants: f2l.cases.filter(row => row.variantOf).length, status: 'ready' },
]);

export const CASES = Object.freeze([...pll.cases, ...oll.cases, ...f2l.cases, ...oll2.cases].map(row => Object.freeze({
  ...row,
  algs: Object.freeze(row.algs.map(alg => Object.freeze({ ...alg, source: Object.freeze({ ...alg.source }) }))),
})));

export const SEED_ALGS = Object.freeze(CASES.flatMap(row => row.algs));
const CASE_BY_ID = new Map(CASES.map(row => [row.id, row]));
const routeSegment = row => row.slug ?? (['oll', 'f2l'].includes(row.set) ? String(row.number) : row.name);
const CASE_BY_ROUTE = new Map(CASES.flatMap(row => [
  [`${row.set}/${routeSegment(row)}`.toLowerCase(), row],
  [`${row.set}/${row.name}`.toLowerCase(), row],
]));

export function getCase(idOrRoute) {
  return CASE_BY_ID.get(idOrRoute) ?? CASE_BY_ROUTE.get(String(idOrRoute ?? '').replace(/^\//, '').toLowerCase()) ?? null;
}

export function getCases(set = null) {
  return CASES.filter(row => !set || row.set === set);
}

export function getSeedAlg(id) { return SEED_ALGS.find(row => row.id === id) ?? null; }

export function canonicalCasePath(caseRow) {
  return caseRow ? `#/algs/${encodeURIComponent(caseRow.set)}/${encodeURIComponent(routeSegment(caseRow))}` : '#/algs';
}

export function algorithmLink(alg) {
  return alg?.source?.url ?? null;
}

export const ALGORITHM_DATA_VERSION = 2;
