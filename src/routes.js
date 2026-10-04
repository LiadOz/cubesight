// Hash routing, as pure functions (tests/routes-unit.test.mjs).
//
// Canonical routes: #/solve  #/drills  #/drills/{corners,pll,f2l,scout}  #/algs
// #/progress  #/dev/studio. Old hashes redirect, keeping their query string;
// an empty hash resolves to the home route (chooseHome); unknown routes have
// an explicit not-found destination so they never masquerade as a solve.

/** tool id -> canonical path. The tool ids are the internal module names used by main.js. */
export const TOOL_PATHS = Object.freeze({
  brain: '/solve',
  notfound: '/not-found',
  drills: '/drills',
  corner: '/drills/corners',
  pll: '/drills/pll',
  f2l: '/drills/f2l',
  scout: '/drills/scout',
  oll: '/drills/oll',
  lookahead: '/drills/lookahead',
  algs: '/algs',
  progress: '/progress',
  history: '/history',
  timer: '/timer',
  smart: '/dev/studio',
  recording: '/recording',
  help: '/help',
  demo: '/demo',
});

/** Old paths that still work. */
export const REDIRECTS = Object.freeze({
  '/brain': '/solve',
  '/corners': '/drills/corners',
  '/pll-recognition': '/drills/pll',
  '/pll': '/drills/pll',
  '/f2l': '/drills/f2l',
  '/cross-scout': '/drills/scout',
  '/scout': '/drills/scout',
  '/oll': '/drills/oll',
  '/lookahead': '/drills/lookahead',
  '/debug': '/dev/studio',
  '/smart-cube': '/dev/studio',
  '/dev': '/dev/studio',
});

/**
 * The legacy `#/review/<at>` page is gone: the history review is the only review screen.
 * `#/review` -> history, `#/review/import` -> the import form on the history page,
 * `#/review/<at>[/retry]` -> that solve in history (the query, e.g. ?move=7, is kept).
 */
export function legacyReviewTarget(path) {
  if (path === '/review') return '/history';
  if (path === '/review/import') return '/history/import';
  const match = path.match(/^\/review\/(\d+)(?:\/retry)?$/);
  return match ? `/history/${match[1]}` : null;
}

/** Only the legacy drills own the global drill keys. */
const KEY_SCOPES = Object.freeze({ corner: 'corner', f2l: 'f2l' });
/**
 * Dev-only route families (the image gallery), registered from main.js inside an
 * `import.meta.env.DEV` block so a production build contains none of them.
 * @type {Array<{ tool: string, match: (path: string) => boolean }>}
 */
const DEV_ROUTES = [];
export function registerDevRoute(route) { DEV_ROUTES.push(route); }
export const isKnownTool = tool => Object.hasOwn(TOOL_PATHS, tool) || DEV_ROUTES.some(route => route.tool === tool);

/** 'corner' | 'f2l' for the routes whose keys main.js handles; null anywhere else. */
export const keyScope = tool => KEY_SCOPES[tool] ?? null;

const PATH_TOOLS = Object.fromEntries(Object.entries(TOOL_PATHS).map(([tool, path]) => [path, tool]));
// Feature-owned route families retain their full path/query as they evolve.
// Keep this list declarative so adding an alg page/drill does not alter the
// base hash parser or collapse the selected case back to its section root.
const DYNAMIC_ROUTES = [
  { tool: 'demo', match: path => path === '/demo/format' },
  { tool: 'history', match: path => path === '/history/import' || /^\/history\/\d+(?:\/(?:replay|review\/[^/]+))?$/.test(path) },
  { tool: 'algs', match: path => /^\/algs\/(?:pll|oll|oll2|f2l)(?:\/[a-z0-9-]+(?:\/drill)?)?$/i.test(path) },
];

/** '#/drills/pll?cases=Aa' -> { path: '/drills/pll', query: '?cases=Aa' } (trailing slash dropped). */
export function parseHash(hash = '') {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const cut = raw.indexOf('?');
  let path = cut < 0 ? raw : raw.slice(0, cut);
  const query = cut < 0 ? '' : raw.slice(cut);
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return { path, query: query === '?' ? '' : query };
}

/**
 * Where #/ goes. A connected cube (any session phase but 'disconnected') means
 * a solve; otherwise a phone gets the drills and a desktop gets the solve screen.
 */
export function chooseHome({ isPhone = false, cubeConnected = false } = {}) {
  if (cubeConnected) return '/solve';
  return isPhone ? '/drills' : '/solve';
}

/**
 * @returns {{ tool: string, hash: string }} the tool to show and the canonical
 * hash to put in the address bar (the caller replaces the URL when it differs).
 */
export function resolveRoute(hash, context = {}) {
  const { path, query } = parseHash(hash);
  let tool = PATH_TOOLS[path];
  if (!tool) tool = DYNAMIC_ROUTES.find(route => route.match(path))?.tool;
  if (!tool) tool = DEV_ROUTES.find(route => route.match(path))?.tool;
  if (!tool && Object.hasOwn(REDIRECTS, path)) tool = PATH_TOOLS[REDIRECTS[path]];
  const legacyReview = tool ? null : legacyReviewTarget(path);
  if (legacyReview) return { tool: 'history', hash: `#${legacyReview}${query}` };
  // Only the empty home hash is context-sensitive. Preserve unknown route and
  // query text so a not-found view does not hide the address the user entered.
  if (!tool && (path === '' || path === '/')) tool = PATH_TOOLS[chooseHome(context)];
  if (!tool) return { tool: 'notfound', hash: `#${path}${query}` };
  const keepDynamicPath = DYNAMIC_ROUTES.some(route => route.tool === tool && route.match(path))
    || DEV_ROUTES.some(route => route.tool === tool && route.match(path));
  return { tool, hash: `#${keepDynamicPath ? path : TOOL_PATHS[tool]}${query}` };
}
