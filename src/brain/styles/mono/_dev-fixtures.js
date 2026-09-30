// Development-only BrainVM samples for building and screenshotting the shell and
// the Mono style before the real view-model (WP1) lands. They follow
// src/brain/types.js exactly and use the README's example solve.

/** @typedef {import('../../types.js').BrainVM} BrainVM */
/** @typedef {import('../../types.js').SegmentVM} SegmentVM */

const PLAN = [
  { key: 'cross', label: 'cross', short: 'x', group: null, avgMs: 2410, splitMs: 2080, moves: 8 },
  { key: 'pair1', label: 'pair 1', short: 'p1', group: 'f2l', avgMs: 1880, splitMs: 1710, moves: 7 },
  { key: 'pair2', label: 'pair 2', short: 'p2', group: 'f2l', avgMs: 1920, splitMs: 1960, moves: 9 },
  { key: 'pair3', label: 'pair 3', short: 'p3', group: 'f2l', avgMs: 1950, splitMs: 1520, moves: 7, pseudo: true },
  { key: 'pair4', label: 'pair 4', short: 'p4', group: 'f2l', avgMs: 2040, splitMs: 2310, moves: 10 },
  { key: 'eo', label: 'eo', short: 'eo', group: 'oll', avgMs: 980, splitMs: null, moves: 0, skipped: true },
  { key: 'co', label: 'co', short: 'co', group: 'oll', avgMs: 1550, splitMs: 1640, moves: 8 },
  { key: 'cp', label: 'cp', short: 'cp', group: 'pll', avgMs: 1620, splitMs: 1470, moves: 9 },
  { key: 'ep', label: 'ep', short: 'ep', group: 'pll', avgMs: 1490, splitMs: 1380, moves: 10 },
];
const TOTAL_AVG = PLAN.reduce((sum, s) => sum + s.avgMs, 0);
const GROUPS = [
  { id: 'f2l', label: 'f2l', sub: '', from: 1, to: 4 },
  { id: 'oll', label: 'oll', sub: '2-look', from: 5, to: 6 },
  { id: 'pll', label: 'pll', sub: '2-look', from: 7, to: 8 },
];
const sec = ms => (ms / 1000).toFixed(2);
const signed = ms => `${ms <= 0 ? '−' : '+'}${Math.abs(ms / 1000).toFixed(2)}`;

/** Segments with every stage before `current` done; `currentFill` for the live one. */
function segments(current, currentFill = 0, { liveSplitMs = null } = {}) {
  return PLAN.map((s, i) => {
    const state = i < current ? (s.skipped ? 'skipped' : 'done') : i === current ? 'current' : 'future';
    const done = state === 'done';
    const deltaMs = done ? s.splitMs - s.avgMs : null;
    /** @type {SegmentVM} */
    const seg = {
      key: s.key, label: s.label, short: s.short, group: s.group,
      weight: s.avgMs / TOTAL_AVG, avgMs: s.avgMs, avgSource: 'history',
      state, fill: done || state === 'skipped' ? 1 : state === 'current' ? currentFill : 0,
      startedAt: state === 'current' ? 0 : null,
      splitMs: done ? s.splitMs : state === 'current' ? liveSplitMs : null,
      splitText: state === 'skipped' ? 'skip' : done ? sec(s.splitMs) : state === 'current' && liveSplitMs != null ? sec(liveSplitMs) : '',
      delta: deltaMs == null ? null : { ms: deltaMs, text: signed(deltaMs), tone: deltaMs < 0 ? 'faster' : deltaMs > 0 ? 'slower' : 'even' },
      moves: done ? s.moves : null,
      tags: s.pseudo ? ['pseudo'] : [],
      skip: state === 'skipped' ? { label: `${s.label} skip`, fresh: false } : null,
      over: false,
    };
    return seg;
  });
}

function timeline({ current = 0, fill = 0, visible = true, ghost = false, insp = null, liveSplitMs = null } = {}) {
  const segs = segments(current, fill, { liveSplitMs });
  const name = segs[current]?.label ?? 'solved';
  return {
    visible, ghost, planKey: 'cfop|pseudo|2look|2look', groups: GROUPS, segments: segs,
    currentIndex: current, totalAvgMs: TOTAL_AVG, insp,
    aria: { now: current, max: PLAN.length, text: `stage ${current + 1} of ${PLAN.length}: ${name}` },
  };
}

const CONFIG_BAR = {
  items: [
    { id: 'method', label: '', options: [{ value: 'cfop', label: 'cfop', active: true }, { value: 'roux', label: 'roux', active: false }] },
    { id: 'cross', label: '', options: [{ value: 'cross', label: 'cross', active: true }, { value: 'xcross', label: 'x-cross', active: false }] },
    { id: 'f2l', label: '', options: [{ value: 'pseudo', label: 'pseudo pairs', active: true }] },
    { id: 'oll', label: 'oll', options: [{ value: '2look', label: '2-look', active: true }] },
    { id: 'pll', label: 'pll', options: [{ value: '2look', label: '2-look', active: true }] },
    { id: 'inspection', label: 'insp', options: [{ value: '15', label: '15', active: true }, { value: 'wca', label: 'wca', active: true }] },
    { id: 'coach', label: '', options: [{ value: 'live', label: 'coach', active: true }] },
  ],
};

const opt = (value, label, active, isDefault = false) => ({ value, label, active, isDefault });
const SETTINGS = {
  open: false,
  sections: [
    { id: 'method', label: 'method', rows: [
      { id: 'method', label: 'method', help: 'which stages the timeline tracks', control: 'segmented', options: [opt('cfop', 'cfop', true, true), opt('roux', 'roux', false)] },
      { id: 'cross', label: 'cross', help: 'target for the first step', control: 'segmented', options: [opt('cross', 'cross', true, true), opt('xcross', 'x-cross', false), opt('xxcross', 'xx-cross', false)] },
      { id: 'f2l', label: 'f2l pairs', help: 'count a pair when it is solved relative to the cross (d-shift)', control: 'segmented', options: [opt('standard', 'standard', false, true), opt('pseudo', 'pseudo pairs', true)] },
      { id: 'oll', label: 'oll', help: '2-look splits the segment into eo → co', control: 'segmented', options: [opt('1look', '1-look', false, true), opt('2look', '2-look', true)] },
      { id: 'pll', label: 'pll', help: '2-look splits the segment into cp → ep', control: 'segmented', options: [opt('1look', '1-look', false, true), opt('2look', '2-look', true)] },
    ] },
    { id: 'inspection', label: 'inspection & penalties', rows: [
      { id: 'inspection.mode', label: 'inspection', help: 'length of the countdown lane', control: 'segmented', options: [opt('wca', '15 s', true, true), opt('custom', 'custom · 10', false), opt('unlimited', 'unlimited', false), opt('off', 'off', false)] },
      { id: 'inspection.overtime', label: 'overtime', help: 'what happens after the limit', control: 'segmented', options: [opt('wca', 'wca +2 / dnf', true, true), opt('count', 'count only', false), opt('grace', 'grace · 3 s', false), opt('autostart', 'auto-start', false)] },
      { id: 'inspection.callouts', label: 'judge callouts', help: 'flash + optional voice at 8 s and 12 s', control: 'segmented', options: [opt('off', 'off', false), opt('on', '8 s · 12 s', true, true), opt('voice', 'voice', false)] },
      { id: 'penalties', label: 'penalties', help: 'how +2 / dnf are recorded in history', control: 'segmented', options: [opt('apply', 'apply', true, true), opt('note', 'note only', false)] },
    ] },
    { id: 'training', label: 'training', rows: [
      { id: 'scramble', label: 'scramble', help: 'guided walks you through each move', control: 'segmented', options: [opt('guided', 'guided', true, true), opt('paste', 'paste', false), opt('free', 'free', false)] },
      { id: 'coach', label: 'coach', help: 'hints during the solve or only after', control: 'segmented', options: [opt('live', 'live', true, true), opt('after', 'after solve', false), opt('off', 'off', false)] },
      { id: 'crossHint', label: 'cross hint', help: 'optimal cross peek during inspection', control: 'segmented', options: [opt('tab', 'on tab', true, true), opt('always', 'always', false), opt('off', 'off', false)] },
      { id: 'timer', label: 'timer', help: 'hide the running clock to focus on the cube', control: 'segmented', options: [opt('visible', 'visible', true, true), opt('hide', 'hide while solving', false)] },
      { id: 'timeline', label: 'timeline', help: 'segmented lane under the timer', control: 'segmented', options: [opt('on', 'on', true, true), opt('off', 'off', false)] },
      { id: 'compare', label: 'split compare', help: 'what deltas under each split are against', control: 'segmented', options: [opt('avg', 'vs average', true, true), opt('pb', 'vs pb', false), opt('raw', 'raw', false)] },
      { id: 'style', label: 'style', help: 'orbit ring or mono lanes; light/dark follows the site', control: 'segmented', options: [opt('orbit', 'orbit', false, true), opt('mono', 'mono', true)] },
    ] },
  ],
};

const DEVICE = {
  phase: 'tracking', name: 'GAN 356 i3', protocol: 'GAN Gen4', battery: 84, supported: true, gyro: true,
  detail: 'Live cube updated.',
  actions: { connect: false, sync: true, recenter: true, disconnect: true, clearSaved: true },
};

const STATS = { solves: 23, best: '12.41', ao5: '14.62', ao12: '15.03', medianTps: '4.71', medianMoves: '66' };

const clock = (over = {}) => ({
  text: '0.00', ms: null, startedAt: null, running: false, hidden: false, tone: 'text', sub: '',
  stepLine: [], stepTitle: '', stepTags: [], ...over,
});

const KEYS = {
  idle: [{ key: 'tab', label: 'settings', action: 'toggleSettings' }, { key: 'c', label: 'coach hints', action: 'cycleCoach' }, { key: 'esc', label: 'command line', action: 'command' }],
  scramble: [{ key: 'esc', label: 'cancel', action: 'cancel' }, { key: 'n', label: 'new scramble', action: 'generateScramble' }, { key: 'p', label: 'paste scramble', action: 'toggleSettings' }],
  solving: [{ key: 'esc', label: 'abort · dnf', action: 'cancel' }, { key: 't', label: 'hide timer', action: 'toggleTimer' }, { key: 'c', label: 'coach off', action: 'cycleCoach' }],
  results: [{ key: 'space', label: 'next scramble', action: 'next' }, { key: 'r', label: 'retry this scramble', action: 'retry' }, { key: 'd', label: 'dnf', action: 'togglePenalty' }, { key: 'tab', label: 'settings', action: 'toggleSettings' }],
  settings: [{ key: 'esc', label: 'command line', action: 'command' }, { key: 'tab', label: 'back to brain', action: 'toggleSettings' }],
};

/** @returns {BrainVM} */
function base(over = {}) {
  return {
    rev: 1, style: 'mono', theme: 'dark', screen: 'idle',
    phaseText: { label: 'Connect and start a solve', detail: 'Cross is read from the bottom at your first move.' },
    device: DEVICE, configBar: CONFIG_BAR, settings: SETTINGS, scramble: null,
    clock: clock(), inspection: null, timeline: timeline({ visible: false, ghost: true }),
    coach: [], results: null, stats: STATS, keys: KEYS.idle, toast: null,
    status: 'cube solved · scramble 24 ready', error: '', chromeDimmed: false,
    ...over,
  };
}

const SCRAMBLE = "D2 F2 U' B2 R2 U2 F2 U' L2 D' B' L' U F' R' D2 R U' F2 L'".split(' ');

function inspection(over = {}) {
  return {
    mode: 'wca', overtime: 'wca', limitMs: 15000, elapsedMs: 9000, remainingMs: 6000, overtimeMs: 0,
    penalty: null, callout: 8, scaleMs: 17000,
    zones: [{ kind: 'normal', fromMs: 0, toMs: 15000 }, { kind: 'plus2', fromMs: 15000, toMs: 17000 }, { kind: 'dnf', fromMs: 17000, toMs: null }],
    ticks: [{ atMs: 0, label: '0', kind: 'limit', passed: true }, { atMs: 8000, label: '8s', kind: 'callout', passed: true }, { atMs: 12000, label: '12s', kind: 'callout', passed: false }, { atMs: 15000, label: '15', kind: 'limit', passed: false }, { atMs: 17000, label: '17', kind: 'limit', passed: false }],
    bigText: '6', tone: 'accent', consequence: 'turn any face to start · 8 s called', autostartHandoff: false, startedAt: 0,
    ...over,
  };
}

const TPS_POINTS = [2.4, 3.3, 3.8, 4.0, 4.0, 4.3, 4.4, 4.2, 3.9, 4.1, 4.9, 5.5, 5.2, 4.5, 4.3, 5.0, 5.6, 5.0, 4.1, 4.0, 4.6, 5.1, 4.6, 3.8, 3.3, 3.9, 4.2, 3.8, 4.5, 5.6, 5.9, 5.4, 5.1, 5.5, 6.0, 5.7, 5.5]
  .map((tps, i, all) => ({ tMs: Math.round(i * 14070 / (all.length - 1)), tps }));

function bands() {
  let t = 0;
  return PLAN.map(s => { const ms = s.splitMs ?? 0; const band = { key: s.key, label: s.short, fromMs: t, toMs: t + ms }; t += ms; return band; });
}

function results() {
  return {
    key: '1727700000000',
    time: { text: '14.07', resultText: '14.07', penalty: null, tone: 'accent' },
    moves: '68', tps: '4.83', inspection: '8.7 s · ok', method: 'cfop 2-look',
    vsAo12: { text: '−0.96', tone: 'faster' },
    tpsSeries: {
      points: TPS_POINTS,
      avg: bands().map((b, i) => ({ fromMs: b.fromMs, toMs: b.toMs, tps: [3.3, 3.9, 4.2, 4.0, 4.3, 4.3, 5.1, 5.3, 5.6][i] })),
      avgFlat: 4.52, bands: bands(), marks: [{ tMs: 8900, kind: 'pause', label: '0.9 s pause' }, { tMs: 10650, kind: 'skip', label: 'eo skip' }],
      durationMs: 14070, maxTps: 8,
    },
    splits: PLAN.map(s => {
      const ms = s.splitMs; const d = ms == null ? null : ms - s.avgMs;
      return {
        key: s.key, label: s.pseudo ? `${s.label}*` : s.label, ms, text: ms == null ? 'skip' : sec(ms),
        deltaText: d == null ? `avg ${sec(s.avgMs)}` : signed(d), tone: d == null ? 'none' : d < 0 ? 'faster' : 'slower',
        moves: s.moves || null, avgMs: s.avgMs, ratio: ms == null ? 0 : ms / 2600, avgRatio: s.avgMs / 2600,
        skipped: Boolean(s.skipped), pseudo: Boolean(s.pseudo),
      };
    }),
    donut: { centerValue: '68', centerLabel: 'moves', arcs: PLAN.map(s => ({ key: s.key, label: s.short, fraction: (s.splitMs ?? 0) / 14070, tone: s.skipped ? 'skip' : (s.splitMs < s.avgMs ? 'faster' : 'slower') })) },
    session: { ao5: '14.62', ao12: '15.03', pb: '12.41', mean: '15.21', tones: { ao5: 'faster', ao12: 'none', pb: 'none', mean: 'none' } },
    spark: {
      points: [15.2, 14.7, 16.1, 15.4, 15.3, 15.9, 15.6, 16.4, 15.8, 15.4, 15.1, 13.9, 16.8, 15.2, 15.0, 15.8, 16.6, 12.41, 14.7, 15.5, 15.2, 15.4, 14.07]
        .map((s, i) => ({ i, ms: i === 9 ? null : s * 1000, kind: i === 1 || i === 20 ? 'plus2' : i === 9 ? 'dnf' : i === 17 ? 'pb' : i === 22 ? 'current' : 'normal' })),
      min: 12000, max: 17000,
    },
    recent: [
      { key: 'r0', text: '14.07', penaltyTag: '', current: true },
      { key: 'r1', text: '14.83', penaltyTag: '', current: false },
      { key: 'r2', text: '14.55', penaltyTag: '', current: false },
      { key: 'r3', text: '15.36', penaltyTag: '', current: false },
      { key: 'r4', text: '14.97', penaltyTag: '+2', current: false },
      { key: 'r5', text: '15.94', penaltyTag: '', current: false },
    ],
    coach: [
      { key: 'c0', tag: 'cross', text: 'Cross took 8 moves — optimal was 6:', alg: "F' R D2 L' B2 D", tone: 'warn' },
      { key: 'c1', tag: 'pair 4', text: 'Pair 4 was 0.27 s over your average — 0.9 s pause finding it.', tone: 'warn' },
      { key: 'c2', tag: 'pseudo', text: 'Pair 3 went in pseudo (D-shift) — saved ~3 moves.', tone: 'good' },
      { key: 'c3', tag: 'eo skip', text: 'EO skip. Your 3rd this session (1 in 8 odds).', tone: 'good' },
    ],
  };
}

/** Named sample screens. */
export const FIXTURES = {
  disconnected: () => base({
    screen: 'disconnected', status: 'connect a smart cube to start',
    device: { ...DEVICE, phase: 'disconnected', name: '', protocol: '', battery: null, gyro: false, detail: 'Connect a smart cube to mirror its turns.', actions: { connect: true, sync: false, recenter: false, disconnect: false, clearSaved: true } },
  }),
  idle: () => base(),
  scramble: () => base({
    screen: 'scramble', chromeDimmed: true, keys: KEYS.scramble, status: '',
    phaseText: { label: 'Perform the scramble', detail: 'Scramble turn 12 of 20.' },
    scramble: {
      source: 'guided', step: 11, total: 20, editable: false, text: SCRAMBLE.join(' '), wrongTurn: 'L',
      moves: SCRAMBLE.map((m, i) => ({ key: `s${i}`, text: m, state: i < 11 ? 'done' : i === 11 ? 'current' : 'todo' })),
      recovery: [{ key: 'r0', text: 'L2', state: 'current' }],
    },
    coach: [
      { key: 'wrong', tone: 'warn', text: "you turned L instead of L' — turn L2 and carry on" },
      { key: 'resync', tone: 'muted', text: 'the cube mirror and move list resync automatically; no need to restart' },
    ],
  }),
  inspection: () => base({
    screen: 'inspection', chromeDimmed: true, keys: [],
    phaseText: { label: 'Inspection', detail: 'Inspect — 6.0s left (clock starts on your first move)' },
    inspection: inspection(),
    timeline: timeline({ visible: true, ghost: true }),
    coach: [{ key: 'hint', tone: 'muted', tag: 'cross hint', text: 'white · 6 moves' }],
  }),
  overtime: () => base({
    screen: 'inspection', chromeDimmed: true, keys: [],
    phaseText: { label: 'Inspection', detail: 'Inspect — 0.0s left (clock starts on your first move)' },
    inspection: inspection({ elapsedMs: 15800, remainingMs: 0, overtimeMs: 800, penalty: '+2', callout: null, bigText: '+1', tone: 'error', consequence: 'starting now = +2 penalty · dnf in 1.2 s',
      ticks: inspection().ticks.map(t => ({ ...t, passed: t.atMs <= 15800 })) }),
    timeline: timeline({ visible: true, ghost: true }),
  }),
  inspectionCount: () => base({
    screen: 'inspection', chromeDimmed: true, keys: [],
    inspection: inspection({ overtime: 'count', elapsedMs: 17100, remainingMs: 0, overtimeMs: 2100, bigText: '+2', tone: 'warn', consequence: 'count only · no penalty',
      scaleMs: 19500, zones: [{ kind: 'normal', fromMs: 0, toMs: 15000 }, { kind: 'count', fromMs: 15000, toMs: 19500 }],
      ticks: [{ atMs: 0, label: '0', kind: 'limit', passed: true }, { atMs: 15000, label: '15', kind: 'limit', passed: true }, { atMs: 16000, label: '+1', kind: 'count', passed: true }, { atMs: 17000, label: '+2', kind: 'count', passed: true }, { atMs: 18000, label: '+3', kind: 'count', passed: false }, { atMs: 19000, label: '+4', kind: 'count', passed: false }] }),
    timeline: timeline({ visible: true, ghost: true }),
  }),
  inspectionUnlimited: () => base({
    screen: 'inspection', chromeDimmed: true, keys: [],
    inspection: inspection({ mode: 'unlimited', limitMs: null, elapsedMs: 23400, remainingMs: null, callout: null, bigText: '23.4', tone: 'accent', consequence: 'unlimited · counts up, never penalises', scaleMs: 30000,
      zones: [{ kind: 'normal', fromMs: 0, toMs: null }],
      ticks: [0, 5, 10, 15, 20, 25].map(s => ({ atMs: s * 1000, label: String(s), kind: 'limit', passed: s * 1000 <= 23400 })).concat([{ atMs: 30000, label: '30+', kind: 'limit', passed: false }]) }),
    timeline: timeline({ visible: true, ghost: true }),
  }),
  inspectionAutostart: () => base({
    screen: 'inspection', chromeDimmed: true, keys: [],
    inspection: inspection({ overtime: 'autostart', elapsedMs: 11000, remainingMs: 4000, callout: null, bigText: '4', tone: 'accent', consequence: 'the clock starts itself at 15 s', autostartHandoff: false, scaleMs: 17000,
      zones: [{ kind: 'normal', fromMs: 0, toMs: 15000 }],
      ticks: [{ atMs: 0, label: '0', kind: 'limit', passed: true }, { atMs: 15000, label: '15 ▸ solve', kind: 'limit', passed: false }] }),
    timeline: timeline({ visible: true, ghost: true }),
  }),
  solving: () => base({
    screen: 'solving', chromeDimmed: true, keys: KEYS.solving, status: '',
    phaseText: { label: 'F2L', detail: '31 turns · 4.49 TPS · 6.91s · 2/4 pairs' },
    clock: clock({ text: '6.91', ms: 6910, startedAt: 0, running: true, sub: '31 moves · 4.49 tps',
      stepLine: [{ text: 'f2l', tone: 'accent' }, { text: 'pair 3', tone: 'accent' }, { text: 'pseudo', tone: 'sub' }, { text: "d′ aligned", tone: 'sub' }],
      stepTitle: 'Pair 3', stepTags: ['pseudo · D′ shift'] }),
    timeline: timeline({ current: 3, fill: 0.6, insp: { text: 'insp 8.7' }, liveSplitMs: 1160 }),
    coach: [{ key: 'pair', tone: 'info', tag: 'coach', text: 'blue-orange pair is already connected' }],
  }),
  skip: () => base({
    screen: 'solving', chromeDimmed: true, keys: KEYS.solving, status: '',
    phaseText: { label: 'PLL', detail: '57 turns · 4.77 TPS · 11.96s · 4/4' },
    clock: clock({ text: '11.96', ms: 11960, startedAt: 0, running: true, sub: '57 moves · 4.77 tps',
      stepLine: [{ text: 'pll', tone: 'accent' }, { text: 'corners', tone: 'accent' }], stepTitle: 'PLL', stepTags: ['corners'] }),
    timeline: (() => { const t = timeline({ current: 7, fill: 0.45, insp: { text: 'insp 8.7' }, liveSplitMs: 740 }); t.segments[5].skip = { label: 'eo skip', fresh: true }; return t; })(),
    toast: { text: '✦ eo skip', tone: 'info' },
    coach: [{ key: 'co', tone: 'muted', text: 'co 1.64 · sune' }],
  }),
  results: () => base({
    screen: 'results', keys: KEYS.results, status: '',
    phaseText: { label: 'Solved', detail: '68 turns · 4.83 TPS · 14.07s · 4/4' },
    clock: clock({ text: '14.07', ms: 14070, sub: '68 moves · 4.83 tps' }),
    timeline: timeline({ current: PLAN.length, insp: { text: 'insp 8.7' } }),
    results: results(),
  }),
  settings: () => base({ settings: { ...SETTINGS, open: true }, keys: KEYS.settings, status: '' }),
};

/** Per-frame refinements for the timing screens (what frameState() would produce). */
export const FRAMES = {
  inspection: { startedAtSolve: null, clockText: '0.00', currentFill: 0, currentSplitText: '', currentOver: false,
    inspection: { elapsedMs: 9000, remainingMs: 6000, overtimeMs: 0, bigText: '6', tone: 'accent', caret: 9000 / 17000, consequence: 'turn any face to start · 8 s called' } },
  overtime: { startedAtSolve: null, clockText: '0.00', currentFill: 0, currentSplitText: '', currentOver: false,
    inspection: { elapsedMs: 15800, remainingMs: 0, overtimeMs: 800, bigText: '+1', tone: 'error', caret: 15800 / 17000, consequence: 'starting now = +2 penalty · dnf in 1.2 s' } },
  inspectionCount: { startedAtSolve: null, clockText: '0.00', currentFill: 0, currentSplitText: '', currentOver: false,
    inspection: { elapsedMs: 17100, remainingMs: 0, overtimeMs: 2100, bigText: '+2', tone: 'warn', caret: 17100 / 19500, consequence: 'count only · no penalty' } },
  inspectionUnlimited: { startedAtSolve: null, clockText: '0.00', currentFill: 0, currentSplitText: '', currentOver: false,
    inspection: { elapsedMs: 23400, remainingMs: null, overtimeMs: 0, bigText: '23.4', tone: 'accent', caret: 23400 / 30000, consequence: 'unlimited · counts up, never penalises' } },
  inspectionAutostart: { startedAtSolve: null, clockText: '0.00', currentFill: 0, currentSplitText: '', currentOver: false,
    inspection: { elapsedMs: 11000, remainingMs: 4000, overtimeMs: 0, bigText: '4', tone: 'accent', caret: 11000 / 17000, consequence: 'the clock starts itself at 15 s' } },
  solving: { startedAtSolve: 0, clockText: '6.91', currentFill: 0.6, currentSplitText: '1.16', currentOver: false, inspection: null },
  skip: { startedAtSolve: 0, clockText: '11.96', currentFill: 0.45, currentSplitText: '0.74', currentOver: false, inspection: null },
};
