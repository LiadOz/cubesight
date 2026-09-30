// Sample BrainVMs for developing the Orbit style before the controller lands
// (dev harness + visual spec only; not imported by the app). They follow
// src/brain/types.js exactly and use the design README's example solve:
// 14.07 s, 68 moves, cross 2.08, pairs 1.71/1.96/1.52 (pseudo)/2.31,
// EO skip, CO 1.64, CP 1.47, EP 1.38; ao5 14.62, ao12 15.03, PB 12.41.

const AVG = { cross: 2410, pair1: 1880, pair2: 1920, pair3: 1950, pair4: 2040, eo: 980, co: 1550, cp: 1620, ep: 1490 };
const SPLIT = { cross: 2080, pair1: 1710, pair2: 1960, pair3: 1520, pair4: 2310, eo: 0, co: 1640, cp: 1470, ep: 1380 };
const MOVES = { cross: 8, pair1: 7, pair2: 9, pair3: 7, pair4: 10, eo: 0, co: 8, cp: 9, ep: 10 };
const PLAN = [
  { key: 'cross', label: 'cross', short: 'x', group: null },
  { key: 'pair1', label: 'pair 1', short: 'p1', group: 'f2l' },
  { key: 'pair2', label: 'pair 2', short: 'p2', group: 'f2l' },
  { key: 'pair3', label: 'pair 3', short: 'p3', group: 'f2l' },
  { key: 'pair4', label: 'pair 4', short: 'p4', group: 'f2l' },
  { key: 'eo', label: 'eo', short: 'eo', group: 'oll' },
  { key: 'co', label: 'co', short: 'co', group: 'oll' },
  { key: 'cp', label: 'cp', short: 'cp', group: 'pll' },
  { key: 'ep', label: 'ep', short: 'ep', group: 'pll' },
];
const TOTAL_AVG = Object.values(AVG).reduce((a, b) => a + b, 0);
const fmt = ms => (ms / 1000).toFixed(2);
const delta = (ms, avg) => {
  const d = ms - avg;
  return { ms: d, text: `${d < 0 ? '−' : '+'}${Math.abs(d / 1000).toFixed(2)}`.replace('−', '-'), tone: d < -20 ? 'faster' : d > 20 ? 'slower' : 'even' };
};

/** Timeline with steps before `currentKey` done, `currentKey` live at `fill`. */
function timeline({ currentKey = null, fill = 0, ghost = false, visible = true, liveMs = null, skipFresh = false } = {}) {
  const currentIndex = currentKey ? PLAN.findIndex(p => p.key === currentKey) : -1;
  const segments = PLAN.map((p, i) => {
    let state = 'future';
    if (!ghost && currentIndex >= 0) state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'future';
    if (!ghost && currentKey === '__solved') state = 'done';
    if (state === 'done' && p.key === 'eo') state = 'skipped';
    const splitMs = state === 'done' ? SPLIT[p.key] : state === 'current' ? liveMs : null;
    return {
      key: p.key, label: p.label, short: p.short, group: p.group,
      weight: AVG[p.key] / TOTAL_AVG, avgMs: AVG[p.key], avgSource: 'history',
      state, fill: state === 'done' || state === 'skipped' ? 1 : state === 'current' ? fill : 0,
      startedAt: state === 'current' ? 0 : null,
      splitMs, splitText: state === 'skipped' ? 'skip' : splitMs != null ? fmt(splitMs) : '',
      delta: state === 'done' ? delta(SPLIT[p.key], AVG[p.key]) : null,
      moves: state === 'done' ? MOVES[p.key] : null,
      tags: p.key === 'pair3' ? ['pseudo'] : [],
      skip: state === 'skipped' ? { label: 'EO skip', fresh: skipFresh } : null,
      over: false,
    };
  });
  return {
    visible, ghost, planKey: 'cfop|2look|2look|pseudo',
    groups: [
      { id: 'f2l', label: 'f2l', sub: '', from: 1, to: 4 },
      { id: 'oll', label: 'oll', sub: '2-look', from: 5, to: 6 },
      { id: 'pll', label: 'pll', sub: '2-look', from: 7, to: 8 },
    ],
    segments, currentIndex, totalAvgMs: TOTAL_AVG,
    insp: ghost ? null : { text: 'insp 8.7' },
    aria: { now: Math.max(0, currentIndex), max: PLAN.length, text: currentKey || 'idle' },
  };
}

/** InspectionVM for a mode × overtime combination at `elapsedMs`. */
export function inspection({ mode = 'wca', overtime = 'wca', limitMs = 15000, elapsedMs = 9000, graceMs = 3000, gracePenalty = 'plus2', callouts = true } = {}) {
  const unlimited = mode === 'unlimited' || mode === 'off';
  const limit = unlimited ? null : limitMs;
  const over = limit ? Math.max(0, elapsedMs - limit) : 0;
  const zones = [];
  const ticks = [];
  if (limit) {
    zones.push({ kind: 'normal', fromMs: 0, toMs: limit });
    if (overtime === 'wca') zones.push({ kind: 'plus2', fromMs: limit, toMs: limit + 2000 }, { kind: 'dnf', fromMs: limit + 2000, toMs: null });
    if (overtime === 'count') zones.push({ kind: 'count', fromMs: limit, toMs: null });
    if (overtime === 'grace') {
      zones.push({ kind: 'grace', fromMs: limit, toMs: limit + graceMs });
      if (gracePenalty === 'plus2') zones.push({ kind: 'plus2', fromMs: limit + graceMs, toMs: limit + graceMs + 2000 });
      if (gracePenalty === 'dnf') zones.push({ kind: 'dnf', fromMs: limit + graceMs, toMs: null });
    }
    if (callouts && limit >= 12000) ticks.push({ atMs: 8000, label: '8s', kind: 'callout', passed: elapsedMs >= 8000 }, { atMs: 12000, label: '12s', kind: 'callout', passed: elapsedMs >= 12000 });
    ticks.push({ atMs: limit, label: '', kind: 'limit', passed: elapsedMs >= limit });
    if (overtime === 'count') for (let k = 1; k <= 3; k++) ticks.push({ atMs: limit + k * 1000, label: `+${k}`, kind: 'count', passed: elapsedMs >= limit + k * 1000 });
  }
  let penalty = null;
  if (overtime === 'wca' && over > 0) penalty = over > 2000 ? 'DNF' : '+2';
  if (overtime === 'grace' && over > graceMs) penalty = gracePenalty === 'dnf' ? 'DNF' : gracePenalty === 'plus2' ? '+2' : null;
  const remaining = limit ? Math.max(0, limit - elapsedMs) : null;
  const bigText = mode === 'off' ? '—'
    : unlimited ? `${Math.floor(elapsedMs / 60000)}:${String(Math.floor(elapsedMs / 1000) % 60).padStart(2, '0')}`
    : over > 0 ? (overtime === 'grace' ? `+${(over / 1000).toFixed(1)}` : `+${Math.max(1, Math.floor(over / 1000))}`)
    : String(Math.ceil(remaining / 1000));
  const tone = penalty === 'DNF' ? 'error' : over > 0 && overtime !== 'grace' ? 'warn' : 'accent';
  const callout = callouts && limit ? (elapsedMs >= 12000 ? 12 : elapsedMs >= 8000 ? 8 : null) : null;
  return {
    mode, overtime, limitMs: limit, elapsedMs, remainingMs: remaining, overtimeMs: over, penalty, callout,
    scaleMs: limit ? limit + 2000 : 60000, zones, ticks, bigText, tone,
    consequence: over > 0 && overtime === 'wca' ? 'past 15 s — start now and it counts as +2.' : 'the solve clock starts on your first turn.',
    autostartHandoff: overtime === 'autostart' && remaining === 0, startedAt: 0,
  };
}

const configBar = {
  items: [
    { id: 'method', options: [{ value: 'cfop', label: 'cfop', active: true }, { value: 'roux', label: 'roux', active: false }] },
    { id: 'f2l', options: [{ value: 'pseudo', label: 'pseudo pairs', active: true }] },
    { id: 'oll', options: [{ value: '2look', label: 'oll 2-look', active: true }] },
    { id: 'pll', options: [{ value: '2look', label: 'pll 2-look', active: true }] },
    { id: 'inspection', options: [{ value: 'wca', label: 'insp 15s', active: true }] },
    { id: 'penalties', options: [{ value: 'wca', label: 'wca penalties', active: true }] },
  ],
};

const recent = ['14.07', '14.83', '14.55', '15.36', '14.97', '15.94', '12.41'];

function results() {
  const bandsAt = [];
  let t = 0;
  for (const p of PLAN) { bandsAt.push({ key: p.key, label: p.key === 'cross' ? 'cross' : p.short, fromMs: t, toMs: t + SPLIT[p.key] }); t += SPLIT[p.key]; }
  const points = [];
  for (let ms = 0; ms <= 14070; ms += 140) {
    const wave = 4.4 + 1.1 * Math.sin(ms / 780) + 0.5 * Math.sin(ms / 310) + (ms > 11000 ? 0.9 : 0) - (ms < 900 ? 2 * (1 - ms / 900) : 0);
    points.push({ tMs: ms, tps: Math.max(0.4, wave) });
  }
  const splits = PLAN.map(p => {
    const skipped = p.key === 'eo';
    const d = skipped ? { text: `-${fmt(AVG[p.key])}`, tone: 'faster' } : delta(SPLIT[p.key], AVG[p.key]);
    return {
      key: p.key, label: p.short === 'x' ? 'cross' : p.short, ms: skipped ? null : SPLIT[p.key], text: skipped ? 'skip' : fmt(SPLIT[p.key]),
      deltaText: d.text, tone: d.tone, moves: skipped ? null : MOVES[p.key], avgMs: AVG[p.key],
      ratio: skipped ? 0 : SPLIT[p.key] / 2800, avgRatio: AVG[p.key] / 2800, skipped, pseudo: p.key === 'pair3',
    };
  });
  const spark = [15.2, 14.9, 16.1, 15.4, 14.7, 15.8, 15.1, 16.4, 14.2, 15.6, 15.0, 17.9, 14.8, 15.3, 14.4, 13.9, 12.41, 15.1, 14.97, 15.36, 14.55, 14.83, 14.07]
    .map((s, i, arr) => ({ i, ms: s * 1000, kind: i === 11 ? 'dnf' : s === 12.41 ? 'pb' : i === 18 ? 'plus2' : i === arr.length - 1 ? 'current' : 'normal' }));
  return {
    key: '1727700000000',
    time: { text: '14.07', resultText: '14.07', penalty: null, tone: 'accent' },
    moves: '68', tps: '4.83', inspection: '8.70', method: 'cfop · 2-look · pseudo pairs · wca · no penalty',
    vsAo12: { text: '-0.96', tone: 'faster' },
    tpsSeries: { points, avg: bandsAt.map(b => ({ fromMs: b.fromMs, toMs: b.toMs, tps: MOVES[b.key] ? MOVES[b.key] / (AVG[b.key] / 1000) : 0 })), avgFlat: 4.52, bands: bandsAt.filter(b => b.key !== 'eo'), marks: [{ tMs: 9580, kind: 'skip', label: 'eo skip' }], durationMs: 14070, maxTps: 7.2 },
    splits,
    donut: { centerValue: '68', centerLabel: 'moves', arcs: PLAN.map(p => ({ key: p.key, label: p.key === 'cross' ? 'cross' : p.short, fraction: SPLIT[p.key] / 14070, tone: p.key === 'eo' ? 'skip' : delta(SPLIT[p.key], AVG[p.key]).tone === 'faster' ? 'faster' : 'slower' })) },
    session: { ao5: '14.62', ao12: '15.03', pb: '12.41', mean: '15.21', tones: { ao5: 'faster' } },
    spark: { points: spark, min: 12000, max: 18400 },
    recent: recent.map((text, i) => ({ key: `r${i}`, text, penaltyTag: text === '14.97' ? '+' : '', current: i === 0 })),
    coach: [
      { key: 'c1', tag: 'cross', text: 'Cross took 8 moves — optimal was 6:', alg: "F' R D2 L' B2 D", tone: 'info' },
      { key: 'c2', tag: 'pair 4', text: 'Pair 4 was 0.27 s over your average — 0.9 s pause finding it.', tone: 'warn' },
      { key: 'c3', tag: 'pseudo', text: 'Pair 3 went in pseudo (D-shift) — saved ~3 moves.', tone: 'good' },
      { key: 'c4', tag: 'eo skip', text: 'EO skip. Your 3rd this session (1 in 8 odds).', tone: 'good' },
    ],
  };
}

function base(screen, overrides = {}) {
  return {
    rev: 1, style: 'orbit', theme: 'dark', screen,
    phaseText: { label: 'Connect and start a solve', detail: '' },
    device: { phase: 'tracking', name: 'GAN 356 i3', protocol: 'GAN Gen4', battery: 84, supported: true, gyro: true, detail: '', actions: { connect: false, sync: true, recenter: true, disconnect: true, clearSaved: true } },
    configBar,
    settings: { open: false, sections: [] },
    scramble: null,
    clock: { text: '0.00', ms: 0, startedAt: null, running: false, hidden: false, tone: 'text', sub: '', stepLine: [], stepTitle: '', stepTags: [] },
    inspection: null,
    timeline: timeline({ ghost: true }),
    coach: [],
    results: null,
    stats: { solves: 23, best: '12.41', ao5: '14.62', ao12: '15.03', medianTps: '4.71', medianMoves: '66' },
    keys: [],
    toast: null, status: '', error: '', chromeDimmed: false,
    ...overrides,
  };
}

/** Named states for the harness: { vm, frame }. */
export function fixture(name) {
  switch (name) {
    case 'idle':
      return { vm: base('idle', { keys: [{ key: 'space', label: 'scramble', action: 'start' }, { key: 'p', label: 'paste scramble', action: 'startCustom' }, { key: 'esc', label: 'settings', action: 'toggleSettings' }, { key: 'h', label: 'history', action: 'next' }] }) };
    case 'inspection': {
      const i = inspection({ elapsedMs: 9000 });
      return { vm: base('inspection', { inspection: i, timeline: timeline({ ghost: true }), keys: [{ key: 'tab', label: 'hide cross hint', action: 'toggleSettings' }, { key: 'esc', label: 'abort solve', action: 'cancel' }] }), frame: frameFor(i) };
    }
    case 'overtime': {
      const i = inspection({ elapsedMs: 15800 });
      return { vm: base('inspection', { inspection: i, keys: [{ key: 'esc', label: 'abort solve', action: 'cancel' }, { key: 's', label: 'inspection settings', action: 'toggleSettings' }] }), frame: frameFor(i) };
    }
    case 'solving': {
      const tl = timeline({ currentKey: 'pair3', fill: 0.48, liveMs: 940 });
      return {
        vm: base('solving', {
          timeline: tl,
          clock: { text: '6.69', ms: 6690, startedAt: 0, running: true, hidden: false, tone: 'text', sub: '31 moves · 4.64 tps · pace -0.51 vs avg', stepLine: [{ text: 'f2l · pair 3 of 4', tone: 'accent' }], stepTitle: 'Pair 3', stepTags: ['pseudo · D′ shift'] },
          keys: [{ key: 'esc', label: 'abort', action: 'cancel' }, { key: 't', label: 'hide timer', action: 'toggleTimer' }, { key: 'c', label: 'coach hints off', action: 'cycleCoach' }],
        }),
        frame: { startedAtSolve: 0, clockText: '6.69', currentFill: 0.48, currentSplitText: '0.94', currentOver: false, inspection: null },
      };
    }
    case 'skip': {
      const tl = timeline({ currentKey: 'cp', fill: 0.38, liveMs: 610, skipFresh: true });
      return {
        vm: base('solving', {
          timeline: tl,
          toast: { text: '✦ eo skip', tone: 'info' },
          clock: { text: '11.83', ms: 11830, startedAt: 0, running: true, hidden: false, tone: 'text', sub: '53 moves · 4.48 tps · pace -1.63 vs avg', stepLine: [{ text: 'pll · corners', tone: 'accent' }], stepTitle: 'Corners', stepTags: ['Aa-perm · headlights on left'] },
        }),
        frame: { startedAtSolve: 0, clockText: '11.83', currentFill: 0.38, currentSplitText: '0.61', currentOver: false, inspection: null },
      };
    }
    case 'results':
      return { vm: base('results', { timeline: timeline({ currentKey: '__solved' }), results: results(), keys: [{ key: 'space', label: 'next scramble', action: 'next' }, { key: 'r', label: 'retry this scramble', action: 'retry' }, { key: 's', label: 'share', action: 'export' }, { key: 'esc', label: 'settings', action: 'toggleSettings' }] }) };
    default:
      return fixture('idle');
  }
}

export function frameFor(i) {
  return { startedAtSolve: null, clockText: '', currentFill: 0, currentSplitText: '', currentOver: false,
    inspection: { elapsedMs: i.elapsedMs, remainingMs: i.remainingMs, overtimeMs: i.overtimeMs, bigText: i.bigText, tone: i.tone, caret: 0, consequence: i.consequence } };
}

/** The eight inspection variants of C-05. */
export const INSPECTION_VARIANTS = [
  { title: 'wca · 15 s', note: 'drains anticlockwise. +2 after 15 s, DNF after 17 s.', i: inspection({ elapsedMs: 9000 }) },
  { title: 'custom · 10 s', note: 'same ring, rescaled to your length.', i: inspection({ mode: 'custom', limitMs: 10000, elapsedMs: 4000, callouts: false }) },
  { title: 'unlimited', note: 'counts up, one lap per minute. no penalty.', i: inspection({ mode: 'unlimited', overtime: 'count', elapsedMs: 27000, callouts: false }) },
  { title: 'off', note: 'no inspection. the clock starts on your first turn.', i: inspection({ mode: 'off', overtime: 'count', elapsedMs: 0, callouts: false }) },
  { title: 'overtime · count only', note: 'keeps counting +1, +2, +3… never penalised.', i: inspection({ overtime: 'count', elapsedMs: 18200, callouts: false }) },
  { title: 'grace · +3 s', note: 'a quiet grace sector, then your chosen penalty.', i: inspection({ overtime: 'grace', graceMs: 3000, elapsedMs: 16600, callouts: false }) },
  { title: 'auto-start', note: 'at 0 the ring flips to the solve ring.', i: inspection({ overtime: 'autostart', elapsedMs: 14200, callouts: false }) },
  { title: '8 s · 12 s callouts', note: 'judge-style marks on the ring.', i: inspection({ elapsedMs: 12400 }) },
];
