import { KEYS } from '../copy/terms.js';
import { keyHints, resolveKey } from '../brain/keys.js';
import { DRILLS } from '../drills/catalog.js';
import { PLL_CASES } from '../pll-logic.js';

const keyForAction = action => Object.keys(KEYS.global).find(key => KEYS.global[key] === action);
const nextKey = keyForAction('next') || 'space';
const helpKey = keyForAction('help') || '?';
const nextKeys = `${nextKey} / enter`;

const SOLVE_SCREENS = Object.freeze([
  ['solve · disconnected', 'disconnected'], ['solve · ready', 'idle'], ['solve · scramble', 'scramble'],
  ['solve · inspection', 'inspection'], ['solve · solving', 'solving'], ['solve · results', 'results'],
]);
const SOLVE_CANDIDATES = Object.freeze(['Escape', 'Tab', ',', ' ', '[', ']', 'r', '2', 'd', 'Delete', 'Backspace', 'u', 't', 'c']);
const resolveShortcuts = SOLVE_SCREENS.flatMap(([context, screen]) => SOLVE_CANDIDATES.flatMap(key => {
  const result = resolveKey({ key, focusOnPage: true }, screen);
  if (!result) return [];
  const labels = { cancel: 'stop', command: 'open command line', toggleSettings: 'settings', toggleDebug: 'developer drawer', connect: 'connect', start: 'start', next: 'next scramble', stepMarker: 'move between moments', retry: 'retry scramble', togglePenalty: result.penalty === '+2' ? '+2' : 'DNF', deleteSolve: 'delete solve', undoDelete: 'undo delete', toggleTimer: 'show or hide timer', cycleCoach: 'cycle coach' };
  return [{ context, key: key === ' ' ? 'space' : key, action: labels[result.type] ?? result.type }];
}));
const solveHints = SOLVE_SCREENS.flatMap(([context, screen]) => keyHints(screen)
  .filter(({ key }) => key !== 'turn')
  .map(({ key, label }) => ({ context, key, action: label })));
const cornerKeys = [
  { context: 'corner recognition · answer', key: 'w / y / g / b / r / o', action: 'answer with a color key' },
  { context: 'corner recognition · answer', key: '1–6', action: 'choose a visible answer' },
  { context: 'corner recognition · answer', key: KEYS.case.s, action: 'skip this case' },
  { context: 'corner recognition · recall after answer', key: nextKeys, action: 'next case' },
];
const hubKeys = DRILLS.map(drill => ({ context: 'drills · hub', key: drill.key, action: `open ${drill.title}` }));
const f2lKeys = [
  { context: 'F2L deduction', key: 's', action: 'skip or next case' },
  { context: 'F2L timed scan', key: nextKeys, action: 'start scan' },
];
const pllKeys = [
  { context: 'PLL recognition · round', key: 's', action: 'skip' },
  { context: 'PLL recognition · after an answer', key: nextKeys, action: 'next case' },
  ...PLL_CASES.filter(item => item.key).map(item => ({ context: 'PLL recognition · answers', key: item.key, action: `answer ${item.name}` })),
];
const timerKeys = [
  { context: 'manual timer · ready', key: 'space', action: 'hold to start' },
  { context: 'manual timer · inspection', key: 'space', action: 'hold to start solve' },
  { context: 'manual timer · running', key: 'any key / space', action: 'stop solve' },
  { context: 'manual timer · running or inspection', key: 'esc', action: 'stop' },
  { context: 'manual timer · results', key: 'space', action: 'next scramble' },
  { context: 'manual timer · results', key: 'r', action: 'retry scramble' },
  { context: 'manual timer · results', key: '2', action: '+2' },
  { context: 'manual timer · results', key: 'd', action: 'DNF' },
  { context: 'manual timer · results', key: 'delete / backspace', action: 'delete solve' },
  { context: 'manual timer · results', key: 'u', action: 'undo delete' },
];
const scoutKeys = [
  { context: 'cross planning', key: 'u / d / f / b / r / l', action: 'choose a cross face' },
  { context: 'cross planning · after an answer', key: nextKeys, action: 'next case' },
];
const playerKeys = ['space', '←', '→', 'r', 'esc'].map((key, index) => ({ context: 'algs · focused playback', key, action: ['play or pause', 'previous move', 'next move', 'reset playback', 'pause playback'][index] }));
const reviewKeys = [
  { context: 'solve review', key: '← / →', action: 'step through moves' },
  { context: 'solve review', key: '[ / ]', action: 'previous or next moment' },
  { context: 'solve review', key: 'r', action: 'retry from this move' },
];
const shortcutRows = [
  { context: 'every page', key: helpKey, action: 'help' },
  { context: 'every page', key: '`', action: 'open developer drawer' },
  ...solveHints, ...resolveShortcuts, ...cornerKeys, ...hubKeys, ...f2lKeys, ...pllKeys, ...timerKeys, ...playerKeys, ...reviewKeys,
  ...scoutKeys,
];
const shortcutKeys = new Set();
const shortcuts = Object.freeze(shortcutRows.filter(row => {
  const key = row.key === 'Escape' ? 'esc' : row.key === ' ' ? 'space' : String(row.key).toLowerCase();
  const identity = `${row.context}|${key}`;
  if (shortcutKeys.has(identity)) return false;
  shortcutKeys.add(identity);
  return true;
}));

const COPY = Object.freeze({
  title: 'one cube, one orbit',
  intro: 'Solve with a smart cube. Drill on your phone. Learn algs. Follow progress over time.',
  connect: 'On Android, Windows or Linux, use Chrome or Edge over HTTPS or localhost. Choose connect and select your cube. Disconnect it elsewhere first.',
  mac: 'In regular Chrome (not the installed app), open chrome://bluetooth-internals/#devices. Scan with the cube on and copy its six-pair address. Enter it here; CubeSight remembers it after verification. macOS may show a substitute address; Android users can try nRF Connect.',
  ios: 'iPhone and iPad cannot connect by Bluetooth; drills and the manual timer still work.',
  privacy: 'Everything stays on this device. CubeSight works offline after its first load; solve history, drill progress, settings and saved algorithms stay in this browser. CubeSight has no account or backend.',
  backup: 'Export a backup before clearing browser data or moving devices. Import merges its solves, pins, preferences and personal algorithms with the data already here.',
  algorithms: 'Bundled algorithms are curated from SpeedSolving Wiki and SpeedCubeDB. Each algorithm links to its source.',
  engine: 'The cube-xcross engine is MIT licensed. Interface fonts: Manrope and DM Mono.',
});

/** Pure, serializable help state. Shortcut rows are derived from the shared key map. */
export function buildHelpViewModel({ build = 'development', development = build === 'development', updateStatus = '', backupStatus = '', returnHref = '#/solve', returnLabel = 'return to solve', browserBluetooth = false, secureContext = true, expandedSections = ['shortcuts'] } = {}) {
  const expanded = [...new Set(expandedSections)];
  return {
    screen: 'help',
    title: COPY.title,
    intro: COPY.intro,
    content: { overview: COPY.intro, connect: COPY.connect, mac: COPY.mac, ios: COPY.ios, privacy: COPY.privacy, backup: COPY.backup, algorithms: COPY.algorithms, engine: COPY.engine },
    build,
    selectedSection: expanded.at(-1) ?? null,
    expandedSections: expanded,
    backupStatus,
    returnHref,
    returnLabel,
    updateStatus,
    browserBluetooth: Boolean(browserBluetooth),
    secureContext: Boolean(secureContext),
    sections: [
      { id: 'shortcuts', title: 'keyboard shortcuts' },
      { id: 'connect', title: 'connect a smart cube' },
      { id: 'privacy', title: 'offline and your data' },
      { id: 'credits', title: 'build and credits' },
    ],
    devGalleryLinks: development ? [
      { label: 'gallery blog', href: '#/dev/gallery/blog' },
      { label: 'gallery timeline', href: '#/dev/gallery/timeline' },
    ] : [],
    shortcuts,
  };
}
