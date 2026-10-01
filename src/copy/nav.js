// Site-level words in one place: a rename is a one-line change here.
// Plain ESM with no imports so vite.config.js can read APP_NAME too.

/** The product name (manifest name/short_name, page titles, the header brand). */
export const APP_NAME = 'CubeSight';

/** Top-level nav: id is the route area, label is what the bar says. */
export const NAV_ITEMS = Object.freeze([
  { id: 'solve', label: 'solve', href: '#/solve' },
  { id: 'drills', label: 'drills', href: '#/drills' },
  { id: 'algs', label: 'algs', href: '#/algs' },
  { id: 'progress', label: 'progress', href: '#/progress' },
]);

/** Nav item that lights up for each tool (drills keep "drills" lit while a drill is open). */
export const NAV_FOR_TOOL = Object.freeze({
  brain: 'solve',
  drills: 'drills', corner: 'drills', f2l: 'drills', pll: 'drills', scout: 'drills',
  algs: 'algs',
  progress: 'progress',
  history: null,
  timer: null,
  review: 'solve',
  smart: null,
});

/** Document titles ("<title> · <app name>"). */
export const PAGE_TITLES = Object.freeze({
  brain: 'solve', drills: 'drills', algs: 'algs', progress: 'progress', history: 'history', timer: 'timer',
  corner: 'corner recognition', f2l: 'F2L deduction', pll: 'PLL recognition', scout: 'Cross Scout',
  smart: 'studio', review: 'solve review',
});
