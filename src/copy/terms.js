// Shared words, messages, formats, and keyboard labels for user-facing copy.
// This module stays dependency-free so unit tests and feature pages can import it.
export const T = Object.freeze({
  start: 'start', next: 'next', again: 'one more round', retry: 'retry', skip: 'skip',
  reveal: 'reveal', stop: 'stop', back: 'back', sync: 'sync', recenter: 'recenter',
  connect: 'connect cube', disconnect: 'disconnect', settings: 'settings',
  exportData: 'export data', importData: 'import data', clear: 'clear', drill: 'drill',
  round: 'round', case: 'case', answer: 'answer', solve: 'solve', scramble: 'scramble',
  nav: Object.freeze({ solve: 'solve', drills: 'drills', algs: 'algs', progress: 'progress' }),
  stage: Object.freeze({
    cross: 'cross', f2l: 'F2L', eo: 'EO', co: 'CO', oll: 'OLL', cp: 'CP', ep: 'EP', pll: 'PLL',
    fb: 'FB', sb: 'SB', cmll: 'CMLL', l6e: 'L6E', solved: 'solved', inspection: 'inspection',
  }),
  stat: Object.freeze({ pb: 'PB', tps: 'TPS', recog: 'recog', ao5: 'ao5', ao12: 'ao12', ao50: 'ao50', ao100: 'ao100', mo3: 'mo3' }),
  label: Object.freeze({
    optimal: 'optimal', efficient: 'efficient', clean: 'clean', flow: 'flow', skip: 'skip',
    freePair: 'free pair', xCross: 'x-cross', pseudoPair: 'pseudo pair', fine: 'fine', ok: 'ok',
    dFix: 'D fix', extraMove: 'extra move', detour: 'detour', cancel: 'cancel',
    betterPair: 'better pair', betterCross: 'better cross', missedXCross: 'missed x-cross',
    pause: 'pause', slowRecog: 'slow recog', rotation: 'rotation', extraAuf: 'extra AUF', strayOffset: 'stray offset',
  }),
});

export const MSG = Object.freeze({
  noCube: 'No cube. Connect to start.',
  syncFirst: 'Solve the cube, then sync.',
  stays: 'Everything stays on this device.',
  loadFailed: name => `Couldn't load ${name}. Reload and try again.`,
  unscored: "Taking a break? This one won't count.",
});

const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const timeNumber = ms => {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}:${String(m).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
  }
  if (seconds >= 60) return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
  return seconds.toFixed(2);
};

export const fmt = Object.freeze({
  time(ms, { unit = false } = {}) {
    const value = finite(ms);
    if (value === null || value < 0) return '—';
    const output = timeNumber(value);
    return unit && value < 60_000 ? `${output} s` : output;
  },
  delta(ms) {
    const value = finite(ms);
    if (value === null) return '—';
    const seconds = value / 1000;
    if (Math.abs(seconds) < 0.005) return '0.00';
    return `${seconds < 0 ? '−' : '+'}${Math.abs(seconds).toFixed(2)}`;
  },
  penalty(record) {
    if (!record || !Number.isFinite(record.solveMs)) return '—';
    const raw = timeNumber(record.solveMs);
    if (record.penalty === 'DNF') return `DNF(${raw})`;
    if (record.penalty === '+2') return timeNumber(record.solveMs + 2000) + '+';
    return raw;
  },
  move(value) {
    let token = String(value ?? '').trim().replace(/[’‘`]/g, "'");
    if (/^[urfdlb]/.test(token)) token = `${token[0].toUpperCase()}w${token.slice(1)}`;
    if (/^[URFDLBMESxyz]2['']$/.test(token)) token = token.slice(0, -1);
    return token.replace(/'/g, '′');
  },
  moves(value) { return String(value ?? '').trim().split(/[\s,]+/).filter(Boolean).map(move => this.move(move)).join(' '); },
  parseMoves(value) {
    const text = String(value ?? '').replace(/[’‘`]/g, "'");
    const tokens = text.trim().split(/[\s,]+/).filter(Boolean);
    const valid = /^(?:[URFDLBMESxyz](?:w)?|[urfdlb])(?:2'?|'?)$/;
    if (tokens.some(token => !valid.test(token))) return null;
    return tokens.map(token => {
      if (/^[urfdlb]/.test(token)) return `${token[0].toUpperCase()}w${token.slice(1)}`;
      return token.replace(/2'$/, '2');
    });
  },
  count(n, noun) { return `${Math.max(0, Math.trunc(Number(n) || 0))} ${noun}${Number(n) === 1 ? '' : 's'}`; },
  date(timestamp, now = Date.now()) {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return '—';
    const day = 24 * 60 * 60 * 1000;
    const today = new Date(now);
    const dateDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const nowDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const difference = Math.round((nowDay - dateDay) / day);
    if (difference === 0) return 'today';
    if (difference === 1) return 'yesterday';
    if (difference > 0 && difference < 7) return `${difference} days ago`;
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return `${date.getDate()} ${months[date.getMonth()]}${date.getFullYear() === today.getFullYear() ? '' : ` ${date.getFullYear()}`}`;
  },
});

export const KEYS = Object.freeze({
  global: Object.freeze({ space: 'next', enter: 'next', esc: 'stop', tab: 'settings', '?': 'help' }),
  idle: Object.freeze({ space: 'start', enter: 'start', tab: 'settings', '?': 'help' }),
  answers: Object.freeze({ w: 'answer', y: 'answer', g: 'answer', b: 'answer', r: 'answer', o: 'answer' }),
  answered: Object.freeze({ space: 'next', enter: 'next', tab: 'settings', '?': 'help' }),
  results: Object.freeze({ r: 'retry', b: 'back', f: 'drill this', x: 'scout', p: 'progress' }),
  case: Object.freeze({ s: 'skip' }),
});

// Keep these patterns focused on UI language and show the preferred term in
// lint output; internal code and feature names are not scanned as copy.
export const BANNED = Object.freeze([
  [/\b(practi[cs]e|train(ing|er)?)\b/i, 'drill'],
  [/\b(analy[sz]e|analysis)\b/i, 'review (solve) / find plans (scout)'],
  [/\bcontinue\b/i, 'next (or resume)'],
  [/\b(attempt|trial|probe|retrieval|sprint)s?\b/i, 'case / answer / round / recall'],
  [/\bcancel(?! \(label\))\b/i, 'stop'],
  [/\b(colour|recognis|practis|centre|unlabelled)/i, 'American spelling'],
  [/\bdouble x(-| )?cross|extended cross\b/i, 'xx-cross / x-cross'],
  [/\b(pseudo[- ]?F2L|D[- ]shift|shift(ed)? D\b)/i, 'pseudo pair / D offset'],
  [/\bbest\b(?! (move|of|next|combo))/i, 'PB (all-time) or best of session'],
  [/\b\d+(?:\.\d+)?(?:s|ms)\b/, 'number, space, unit: 12.34 s, 300 ms'],
  [/\bturns?\b(?= \d)|\b\d+ turns?\b/i, 'moves'],
  [/\b(blunder|brilliant|mistake|inaccuracy|excellent)\b/i, 'coach words (section 3)'],
  [/[a-z] — [a-z]/, 'use · or a full stop'],
  [/\b(?!HTTPS\b)[A-Z]{5,}\b/, 'no all-caps in source; use CSS'],
  [/\bBrain\b/, 'solve'],
]);
