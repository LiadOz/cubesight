// Route families are taken from src/routes.js and tests/routing.spec.js. Legacy
// URLs are represented by their canonical targets because redirects replace
// the URL before the page is painted.
export const ROUTES = [
  { id: 'solve', path: '/solve', page: 'solve' },
  { id: 'drills', path: '/drills', page: 'drills' },
  { id: 'corners', path: '/drills/corners', page: 'drills' },
  { id: 'pll-drill', path: '/drills/pll', page: 'drills' },
  { id: 'f2l', path: '/drills/f2l', page: 'drills' },
  { id: 'cross-planning', path: '/drills/scout', page: 'drills' },
  { id: 'cross-scout-explore', path: '/drills/scout?mode=explore', page: 'drills' },
  { id: 'oll-drill', path: '/drills/oll', page: 'drills' },
  { id: 'lookahead', path: '/drills/lookahead', page: 'drills' },
  { id: 'algs', path: '/algs', page: 'algs' },
  { id: 'demo', path: '/demo?title=Snapshot%20pair&setup=R%20U&alg=R%27%20U%27&highlight=pair%3AFR&case=f2l/1&color=white%20top', page: 'demo' },
  { id: 'demo-format', path: '/demo/format', page: 'demo' },
  { id: 'help', path: '/help', page: 'scroll' },
  { id: 'alg-case-pll', path: '/algs/pll/T', page: 'algs' },
  { id: 'alg-case-oll', path: '/algs/oll/1', page: 'algs' },
  { id: 'alg-case-oll2', path: '/algs/oll2/eo-line', page: 'algs' },
  { id: 'alg-case-f2l', path: '/algs/f2l/FR', page: 'algs' },
  { id: 'alg-drill', path: '/algs/pll/Jb/drill', page: 'algs' },
  { id: 'review-import', path: '/review/import', page: 'review' },
  { id: 'review-record', path: '/review/1000000', page: 'review' },
  { id: 'review', path: '/review', page: 'review' },
  { id: 'recording', path: '/recording', page: 'scroll' },
  { id: 'not-found', path: '/not-found', page: 'scroll' },
  { id: 'progress', path: '/progress', page: 'progress' },
  { id: 'history', path: '/history', page: 'history' },
  { id: 'past-solve', path: '/history/1000000', page: 'history' },
  { id: 'replay', path: '/history/1000000/replay', page: 'history' },
  { id: 'review-detail', path: '/history/1000000/review/1', page: 'history' },
  { id: 'timer', path: '/timer', page: 'timer' },
  { id: 'debug-studio', path: '/dev/studio', page: 'scroll' },
  { id: 'unknown', path: '/__layout-unknown__', page: 'scroll' },
];

const ALL_VIEWPORTS = [
  [320, 568], [360, 740], [390, 844], [768, 1024],
  [1024, 768], [1280, 720], [1440, 900], [1920, 1080],
];
// LAYOUT_WIDTHS=320,360,390 narrows a focused run (the full matrix is the gate; this is for iterating).
const ONLY_WIDTHS = (process.env.LAYOUT_WIDTHS || '').split(',').filter(Boolean).map(Number);
export const VIEWPORTS = ONLY_WIDTHS.length ? ALL_VIEWPORTS.filter(([w]) => ONLY_WIDTHS.includes(w)) : ALL_VIEWPORTS;

export const THEMES = ['dark', 'light'];

export const STATES = [
  'idle', 'connecting', 'guided-scramble', 'wrong-turn', 'inspection', 'inspection-overtime',
  'solving', 'results', 'review-detail', 'replay-midway', 'drill-midround',
  'alg-playback-midway', 'timer-inspection', 'timer-running', 'timer-results',
  'crowded-markers', 'settings-open', 'debug-open',
  'connection-menu-open', 'case-colour-yellow-top', 'case-colour-white-top',
  'case-colour-dual', 'case-colour-neutral', 'case-colour-fixed',
  'goal-unset', 'goal-insufficient', 'goal-progress', 'goal-reached',
  'f1-idle', 'f1-connecting-full', 'f1-guided-scramble-current-progress', 'f1-wrong-turn-undo',
  'f1-inspection-normal', 'f1-inspection-plus2', 'f1-inspection-dnf-ticks', 'f1-solving-fill',
  'f1-live-results', 'f1-case-choices', 'f1-staged-detail-comparison', 'f1-marker-detail',
  'f1-settings-open', 'f1-past-results-review-deeplink',
];

// Shared registrar contract for snapshot and feature suites. A suite can add a
// route or fixture-backed state without forking the viewport/theme dimensions.
export const STATE_FIXTURES = [
  { id: 'idle', route: '/solve', driver: 'fake-cube' },
  { id: 'connecting', route: '/solve', driver: 'fake-cube' },
  { id: 'guided-scramble', route: '/solve', driver: 'fake-cube' },
  { id: 'wrong-turn', route: '/solve', driver: 'fake-cube' },
  { id: 'inspection', route: '/solve', driver: 'fake-cube' },
  { id: 'inspection-overtime', route: '/solve', driver: 'fake-cube' },
  { id: 'solving', route: '/solve', driver: 'fake-cube' },
  { id: 'results', route: '/solve', driver: 'fake-cube' },
  { id: 'review-detail', route: '/solve', driver: 'review-fixture' },
  { id: 'replay-midway', route: '/history/1000000/replay', driver: 'recording-fixture' },
  { id: 'drill-midround', route: '/drills/corners', driver: 'drill-fixture', owner: 'F15', dataOwner: 'F15' },
  { id: 'alg-playback-midway', route: '/algs/pll/T', driver: 'alg-fixture' },
  { id: 'timer-inspection', route: '/timer', driver: 'manual-timer', phase: 'inspecting' },
  { id: 'timer-running', route: '/timer', driver: 'manual-timer', phase: 'running' },
  { id: 'timer-results', route: '/timer', driver: 'manual-timer', phase: 'done' },
  { id: 'goal-unset', route: '/progress', driver: 'goal-progress-fixture', goalState: 'unset', owner: 'F5', dataOwner: 'F6' },
  { id: 'goal-insufficient', route: '/progress', driver: 'goal-progress-fixture', goalState: 'insufficient', owner: 'F5', dataOwner: 'F6' },
  { id: 'goal-progress', route: '/progress', driver: 'goal-progress-fixture', goalState: 'progress', owner: 'F5', dataOwner: 'F6' },
  { id: 'goal-reached', route: '/progress', driver: 'goal-progress-fixture', goalState: 'reached', owner: 'F5', dataOwner: 'F6' },
  { id: 'crowded-markers', route: '/solve', driver: 'orbit-fixture' },
  { id: 'settings-open', route: '/solve', driver: 'fake-cube-settings' },
  { id: 'debug-open', route: '/solve', driver: 'fake-cube-debug' },
  { id: 'connection-menu-open', route: '/solve', driver: 'connection-menu-fixture' },
  { id: 'case-colour-yellow-top', route: '/algs/oll/1', driver: 'case-colour-fixture', colour: 'yellow top' },
  { id: 'case-colour-white-top', route: '/algs/oll/1', driver: 'case-colour-fixture', colour: 'white top' },
  { id: 'case-colour-dual', route: '/algs/oll/1', driver: 'case-colour-fixture', colour: 'yellow or white' },
  { id: 'case-colour-neutral', route: '/algs/oll/1', driver: 'case-colour-fixture', colour: 'any colour' },
  { id: 'case-colour-fixed', route: '/algs/oll/1', driver: 'case-colour-fixture', colour: 'fixed: red' },
  { id: 'f1-idle', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'idle' },
  { id: 'f1-connecting-full', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'connecting-full' },
  { id: 'f1-guided-scramble-current-progress', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'guided-scramble-current-progress' },
  { id: 'f1-wrong-turn-undo', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'wrong-turn-undo' },
  { id: 'f1-inspection-normal', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'inspection-normal', penalty: 'normal' },
  { id: 'f1-inspection-plus2', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'inspection-plus2', penalty: '+2' },
  { id: 'f1-inspection-dnf-ticks', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'inspection-dnf-ticks', penalty: 'DNF', ticks: true },
  { id: 'f1-solving-fill', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'solving-fill' },
  { id: 'f1-live-results', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'live-results' },
  { id: 'f1-case-choices', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'case-choices', cases: { oll: '1', pll: 'T', f2l: 'FR' } },
  { id: 'f1-staged-detail-comparison', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'staged-detail-comparison', comparison: 'yours-better' },
  { id: 'f1-marker-detail', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'marker-detail' },
  { id: 'f1-settings-open', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'settings-open' },
  { id: 'f1-past-results-review-deeplink', route: '/solve', driver: 'f1-orbit-fixture', owner: 'F1', f1State: 'past-results-review-deeplink' },
  { id: 'demo-playback-midway', route: '/demo?title=Snapshot%20pair&setup=R%20U&alg=R%27%20U%27&highlight=pair%3AFR&case=f2l/1&color=white%20top', driver: 'demo-fixture', owner: 'F17' },
];

const LAYOUT_DRIVERS = new Map();

export function registerLayoutDriver(id, driver) {
  if (!id || typeof driver !== 'function') throw new TypeError('driver registration requires an id and function');
  if (LAYOUT_DRIVERS.has(id)) throw new Error(`duplicate layout driver: ${id}`);
  LAYOUT_DRIVERS.set(id, driver);
  return driver;
}

export function getLayoutDriver(id) {
  return LAYOUT_DRIVERS.get(id);
}

export function listLayoutDrivers() {
  return [...LAYOUT_DRIVERS.keys()];
}

export function registerLayoutRoute(route) {
  if (!route?.id || !route?.path || !route?.page) throw new TypeError('route requires id, path, and page');
  if (ROUTES.some(item => item.id === route.id)) throw new Error(`duplicate layout route: ${route.id}`);
  ROUTES.push(route);
  return route;
}

export function registerLayoutState(state) {
  if (!state?.id || !state?.route || !state?.driver) throw new TypeError('state requires id, route, and driver');
  if (STATE_FIXTURES.some(item => item.id === state.id)) throw new Error(`duplicate layout state: ${state.id}`);
  STATE_FIXTURES.push(state);
  return state;
}

export function getLayoutMatrix() {
  return { routes: ROUTES, viewports: VIEWPORTS, themes: THEMES, states: STATE_FIXTURES };
}
