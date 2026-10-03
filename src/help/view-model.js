import { KEYS } from '../copy/terms.js';
import { keyHints, resolveKey } from '../brain/keys.js';
import { DRILLS } from '../drills/catalog.js';
import { PLL_CASES } from '../pll-logic.js';

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
const solveHints = SOLVE_SCREENS.flatMap(([context, screen]) => keyHints(screen).map(({ key, label }) => ({ context, key, action: label })));
const cornerKeys = [
  { context: 'corner recognition · answer', key: 'w / y / g / b / r / o', action: 'answer with a color key' },
  { context: 'corner recognition · answer', key: '1–6', action: 'choose a visible answer' },
  { context: 'corner recognition · answer', key: KEYS.case.s, action: 'skip this case' },
  { context: 'corner recognition · recall after answer', key: `${KEYS.global.space} / enter`, action: 'next case' },
];
const hubKeys = DRILLS.map(drill => ({ context: 'drills · hub', key: drill.key, action: `open ${drill.title}` }));
const f2lKeys = [
  { context: 'F2L deduction', key: 's', action: 'skip or next case' },
  { context: 'F2L timed scan', key: 'space / enter', action: 'start scan' },
];
const pllKeys = [
  { context: 'PLL recognition · round', key: 's', action: 'skip' },
  { context: 'PLL recognition · after an answer', key: 'space / enter', action: 'next case' },
  ...PLL_CASES.filter(item => item.key).map(item => ({ context: 'PLL recognition · answers', key: item.key, action: `answer ${item.name}` })),
];
const timerKeys = [
  { context: 'manual timer · ready', key: 'space', action: 'hold to start' },
  { context: 'manual timer · inspection', key: 'space', action: 'hold to start solve' },
  { context: 'manual timer · running', key: 'any key / space', action: 'stop solve' },
  { context: 'manual timer · running or inspection', key: 'escape', action: 'stop' },
  { context: 'manual timer · results', key: 'space', action: 'next scramble' },
  { context: 'manual timer · results', key: 'r', action: 'retry scramble' },
  { context: 'manual timer · results', key: '2', action: '+2' },
  { context: 'manual timer · results', key: 'd', action: 'DNF' },
  { context: 'manual timer · results', key: 'delete / backspace', action: 'delete solve' },
  { context: 'manual timer · results', key: 'u', action: 'undo delete' },
];
const playerKeys = ['space', '←', '→', 'r', 'escape'].map((key, index) => ({ context: 'algs · focused playback', key, action: ['play or pause', 'previous move', 'next move', 'reset playback', 'pause playback'][index] }));
const reviewKeys = [
  { context: 'solve review', key: '← / →', action: 'step through moves' },
  { context: 'solve review', key: '[ / ]', action: 'previous or next moment' },
  { context: 'solve review', key: 'r', action: 'retry from this move' },
];
const shortcuts = Object.freeze([
  { context: 'every page', key: '?', action: 'help' },
  { context: 'every page', key: '`', action: 'open developer drawer' },
  ...solveHints, ...resolveShortcuts, ...cornerKeys, ...hubKeys, ...f2lKeys, ...pllKeys, ...timerKeys, ...playerKeys, ...reviewKeys,
]);

const COPY = Object.freeze({
  title: 'one cube, one orbit',
  intro: 'Solve with a smart cube. Build recognition with short drills. Learn algs, then follow progress over time.',
  connect: 'Use Chrome or Edge on Android, Windows, or Linux, on a secure page. Choose connect in the header and select the cube. If it is already connected elsewhere, disconnect it there first, then reconnect here.',
  mac: 'Web Bluetooth hides device addresses. If CubeSight asks for a MAC address, open Chrome on Android, Windows, or Linux and visit chrome://bluetooth-internals/#devices. Turn on the cube, find its address, then return to CubeSight. Chrome on macOS may show a substitute address.',
  ios: 'iPhone and iPad browsers do not provide Web Bluetooth; drills and the manual timer work there.',
  privacy: 'CubeSight works offline after its first load. Solve history, drill progress, settings and saved algorithms stay in this browser on this device. CubeSight has no account or backend.',
  backup: 'Export a backup before clearing browser data or moving devices. Import merges it into this browser, matching solves by their recorded time.',
  algorithms: 'Algorithms are curated from the sources linked here. Each bundled algorithm links to its source.',
  engine: 'The cube-xcross engine is MIT licensed. Fonts: Manrope and DM Mono.',
});

/** Pure, serializable help state. Shortcut rows are derived from the shared key map. */
export function buildHelpViewModel({ build = 'development', updateStatus = '', backupStatus = '', returnHref = '#/solve', returnLabel = 'return to solve', browserBluetooth = false, expandedSections = ['shortcuts'] } = {}) {
  const expanded = [...new Set(expandedSections)];
  return {
    screen: 'help',
    title: COPY.title,
    intro: COPY.intro,
    content: { connect: COPY.connect, mac: COPY.mac, ios: COPY.ios, privacy: COPY.privacy, backup: COPY.backup, algorithms: COPY.algorithms, engine: COPY.engine },
    build,
    selectedSection: expanded.at(-1) ?? null,
    expandedSections: expanded,
    backupStatus,
    returnHref,
    returnLabel,
    sections: [
      { id: 'shortcuts', title: 'keyboard shortcuts' },
      { id: 'connect', title: 'connect a smart cube' },
      { id: 'privacy', title: 'your data stays here' },
      { id: 'credits', title: 'build and credits' },
    ],
    updateStatus,
    browserBluetooth: Boolean(browserBluetooth),
    shortcuts,
  };
}
