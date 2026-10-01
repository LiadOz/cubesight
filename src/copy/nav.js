// Site-level words in one place: a rename is a one-line change here.
// Keep site labels in one place so the app and its callers stay consistent.
import { T } from './terms.js';

/** The product name (manifest name/short_name, page titles, the header brand). */
export const APP_NAME = 'CubeSight';

/** Top-level nav: id is the route area, label is what the bar says. */
export const NAV_ITEMS = Object.freeze([
  { id: 'solve', label: T.nav.solve, href: '#/solve' },
  { id: 'drills', label: T.nav.drills, href: '#/drills' },
  { id: 'algs', label: T.nav.algs, href: '#/algs' },
  { id: 'progress', label: T.nav.progress, href: '#/progress' },
]);

/** Nav item that lights up for each tool (drills keep "drills" lit while a drill is open). */
export const NAV_FOR_TOOL = Object.freeze({
  brain: T.nav.solve,
  drills: T.nav.drills, corner: T.nav.drills, f2l: T.nav.drills, pll: T.nav.drills, scout: T.nav.drills, oll: T.nav.drills, lookahead: T.nav.drills,
  algs: T.nav.algs,
  progress: T.nav.progress,
  history: null,
  timer: null,
  review: 'solve',
  notfound: null,
  smart: null,
});

/** Document titles ("<title> · <app name>"). */
export const PAGE_TITLES = Object.freeze({
  brain: 'solve', drills: 'drills', algs: 'algs', progress: 'progress', history: 'history', timer: 'timer',
  corner: 'corner recognition', f2l: 'F2L deduction', pll: 'PLL recognition', scout: 'cross planning', oll: 'OLL recognition', lookahead: 'lookahead',
  smart: 'studio', review: 'solve review', notfound: 'not found',
});
