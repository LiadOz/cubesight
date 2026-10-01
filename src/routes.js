// Hash routing, as pure functions (tests/routes-unit.test.mjs).
//
// Canonical routes: #/solve  #/drills  #/drills/{corners,pll,f2l,scout}  #/algs
// #/progress  #/dev/studio. Old hashes redirect, keeping their query string;
// an unknown or empty hash resolves to the home route (chooseHome).

/** tool id -> canonical path. The tool ids are the internal module names used by main.js. */
export const TOOL_PATHS = Object.freeze({
  brain: '/solve',
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
  review: '/review',
  smart: '/dev/studio',
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

/** Only the legacy drills own the global drill keys. */
const KEY_SCOPES = Object.freeze({ corner: 'corner', f2l: 'f2l' });
/** 'corner' | 'f2l' for the routes whose keys main.js handles; null anywhere else. */
export const keyScope = tool => KEY_SCOPES[tool] ?? null;

const PATH_TOOLS = Object.fromEntries(Object.entries(TOOL_PATHS).map(([tool, path]) => [path, tool]));
// Feature-owned route families retain their full path/query as they evolve.
// Keep this list declarative so adding an alg page/drill does not alter the
// base hash parser or collapse the selected case back to its section root.
const DYNAMIC_ROUTES = [
  { tool: 'review', match: path => path === '/review/import' || /^\/review\/\d+(?:\/retry)?$/.test(path) },
  { tool: 'algs', match: path => /^\/algs\/(?:pll|oll|f2l)\/[a-z0-9-]+(?:\/drill)?$/i.test(path) },
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
  if (!tool && Object.hasOwn(REDIRECTS, path)) tool = PATH_TOOLS[REDIRECTS[path]];
  // Home and unknown hashes resolve by context; a stray query is kept.
  if (!tool) tool = PATH_TOOLS[chooseHome(context)];
  const keepDynamicPath = DYNAMIC_ROUTES.some(route => route.tool === tool && route.match(path));
  return { tool, hash: `#${keepDynamicPath ? path : TOOL_PATHS[tool]}${query}` };
}
