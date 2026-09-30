// Sample Brain view-models for every screen, built through the real
// buildViewModel() from synthetic snapshots, so the style components can be
// developed and screenshot-tested without a cube (the dev gallery at
// /?brainGallery=1#/brain renders them). The data is the design README's
// example solve: cross 2.08, pairs 1.71 / 1.96 / 1.52 (pseudo) / 2.31, EO
// skip, CO 1.64, CP 1.47, EP 1.38 = 14.07 s, 68 moves, 4.83 TPS.

import { DEFAULT_INSPECTION } from '../solve-live.js';
import { buildViewModel, inspectionState } from './view-model.js';
import { normalizeSettings } from './settings.js';
import { createTrack } from './milestones.js';

export const EXAMPLE_SPLITS = [
  { key: 'cross', ms: 2080, moves: 8 },
  { key: 'pair1', ms: 1710, moves: 7 },
  { key: 'pair2', ms: 1960, moves: 9 },
  { key: 'pair3', ms: 1520, moves: 7, pseudo: true },
  { key: 'pair4', ms: 2310, moves: 10 },
  { key: 'eo', ms: 0, moves: 0, skipped: true },
  { key: 'co', ms: 1640, moves: 8 },
  { key: 'cp', ms: 1470, moves: 9 },
  { key: 'ep', ms: 1380, moves: 10 },
];
// Average split per stage in the history (the deltas in the design frames).
const HISTORY_AVG = { cross: 2410, pair1: 1880, pair2: 1920, pair3: 1950, pair4: 2040, eo: 980, co: 1550, cp: 1620, ep: 1490 };

const T0 = 1_000_000;          // controller clock at the solve start
const AT = 1_790_000_000_000;  // wall-clock ms of the example solve

// Deterministic wobble in [-1, 1].
const wobble = i => Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 4.1414) * 0.5;

function moveTimesFor(splits) {
  const times = [];
  let start = 0;
  for (const s of splits) {
    for (let m = 1; m <= s.moves; m++) {
      // Pair 4 has a 0.9 s pause finding the pair (the coach line in the design).
      const pause = s.key === 'pair4' ? 900 : 0;
      times.push(Math.round(start + pause + (m / s.moves) * (s.ms - pause)));
    }
    start += s.ms;
  }
  return times;
}

function historyRecord(i, n) {
  const splits = Object.entries(HISTORY_AVG).map(([key, avg], k) => {
    const ms = Math.max(0, Math.round(avg * (1 + 0.12 * wobble(i * 9 + k))));
    return { key, ms, moves: Math.max(1, Math.round((ms / 1000) * 4.5)), skipped: false, pseudo: false };
  });
  let solveMs = splits.reduce((sum, s) => sum + s.ms, 0);
  let penalty = null;
  if (i === n - 5) { solveMs = 12970; penalty = '+2'; }      // 14.97+
  if (i === n - 12) { solveMs = 13200; penalty = 'DNF'; }    // DNF(13.20)
  if (i === n - 3) solveMs = 12410;                          // PB
  const moveCount = splits.reduce((sum, s) => sum + s.moves, 0);
  return {
    at: AT - (n - i) * 90_000, scramble: '', free: false, crossFace: 'D', crossColor: 'yellow',
    solveMs, penalty, inspectionMs: 8000 + 900 * wobble(i), inspectionMode: 'wca',
    moveCount, solveMoves: [], tps: moveCount / (solveMs / 1000), phases: null, xcross: 'cross',
    crossMoveCount: 8, rotations: 1, solved: true, splits, moveTimes: null,
    config: { method: 'cfop', cross: 'cross', f2l: 'pseudo', oll: '2look', pll: '2look', inspectionMode: 'wca' },
  };
}

export const EXAMPLE_RECORD = {
  at: AT, scramble: "R2 D' F2 U B2 L' U2 F R' D2 B U' L2", free: false, crossFace: 'D', crossColor: 'yellow',
  solveMs: 14070, penalty: null, inspectionMs: 8700, inspectionMode: 'wca',
  moveCount: 68, solveMoves: [], tps: 68 / 14.07, phases: null, xcross: 'cross',
  crossMoveCount: 8, rotations: 1, solved: true,
  splits: EXAMPLE_SPLITS.map(s => ({ skipped: false, pseudo: false, ...s })),
  moveTimes: moveTimesFor(EXAMPLE_SPLITS),
  config: { method: 'cfop', cross: 'cross', f2l: 'pseudo', oll: '2look', pll: '2look', inspectionMode: 'wca' },
};

export const EXAMPLE_HISTORY = Array.from({ length: 22 }, (_, i) => historyRecord(i, 22));
export const EXAMPLE_SCRAMBLE = EXAMPLE_RECORD.scramble;

const SESSION = { phase: 'tracking', detail: 'Live cube updated.', deviceName: 'GAN 356 i3', protocol: 'GAN Gen4', battery: 84, gyro: null, state: null, moves: [], lastMove: null };

// A track with the example solve's stamps up to `upTo` stages done.
function exampleTrack(upTo) {
  const track = createTrack();
  track.active = true;
  track.solveStartAt = T0;
  track.inspectionMs = 8700;
  const st = track.stamps;
  let at = T0; let idx = 0;
  const times = moveTimesFor(EXAMPLE_SPLITS);
  EXAMPLE_SPLITS.slice(0, upTo).forEach(s => {
    at += s.ms; idx += s.moves;
    if (s.key === 'cross') { st.crossAt = at; st.crossIdx = idx; }
    if (s.key.startsWith('pair')) { st.pairAt.push(at); st.pairIdx.push(idx); st.pairPseudo.push(Boolean(s.pseudo)); }
    if (s.key === 'pair4') { st.f2lAt = at; st.f2lIdx = idx; }
    if (s.key === 'eo') { st.eoAt = at; st.eoIdx = idx; }
    if (s.key === 'co') { st.coAt = at; st.coIdx = idx; st.ollAt = at; st.ollIdx = idx; }
    if (s.key === 'cp') { st.cpAt = at; st.cpIdx = idx; }
    if (s.key === 'ep') { st.solvedAt = at; st.solvedIdx = idx; }
  });
  track.moveTimes = times.slice(0, idx);
  return { track, at, idx };
}

function liveSolving(elapsedMs, count, progress) {
  return {
    mode: 'guided', phase: 'solving', scrambleStr: EXAMPLE_SCRAMBLE, applyStep: 13, applyTotal: 13, applyDetour: [],
    solveMoves: [], solveMoveCount: count, elapsedMs, inspection: null, inspectionConfig: { ...DEFAULT_INSPECTION },
    penalty: null, inspectionMs: 8700, crossFace: 'D', crossColor: 'yellow', rotations: 1, crossMoveCount: 8,
    progress, prev: null, skip: progress?.skip ?? null, record: null, done: false,
  };
}

// The live tracker's snapshot.inspection for a config at `elapsedMs`.
function liveInspection(config, elapsedMs) {
  const st = inspectionState(config, elapsedMs);
  return { mode: config.mode, overtime: config.overtime, enabled: true, limitMs: st.layout.limitMs, elapsedMs, remainingMs: st.remainingMs, overtimeMs: st.overtimeMs, penalty: st.penalty, callout: st.callout };
}

const COACH_SOLVING = [{ key: 'hint', tone: 'info', text: 'The blue-orange pair is already connected — insert it next.' }];

/**
 * Every fixture as a BrainVM, keyed by name. Inspection variants are keyed
 * `inspection:<mode>/<overtime>/<early|over>`.
 */
export function brainFixtures({ style = 'orbit', theme = 'dark' } = {}) {
  const settings = normalizeSettings({ style, f2l: 'pseudo' });
  const base = { session: SESSION, records: EXAMPLE_HISTORY, settings, theme, supported: true, now: T0 };
  const vm = (input, prev = null) => buildViewModel({ ...base, ...input }, prev);
  const idleLive = { phase: 'idle', inspectionConfig: { ...DEFAULT_INSPECTION }, progress: null };
  const out = {};
  out.disconnected = vm({ session: { ...SESSION, phase: 'disconnected', detail: 'Connect a smart cube to mirror its turns.', deviceName: '', protocol: '', battery: null }, live: idleLive });
  out.connecting = vm({ session: { ...SESSION, phase: 'connecting', detail: 'Select your cube…', deviceName: '' }, live: idleLive });
  out.idle = vm({ live: idleLive, scrambleText: EXAMPLE_SCRAMBLE, coach: [{ key: 'empty', tone: 'muted', text: 'Coach insights appear here as you solve.' }] });
  const applying = { ...idleLive, mode: 'guided', phase: 'applying', scrambleStr: EXAMPLE_SCRAMBLE, applyStep: 5, applyTotal: 13, applyDetour: [] };
  const applyCoach = [{ key: 'info:apply', tone: 'info', text: 'Perform the scramble shown in the cue. A wrong turn shows the return path without discarding the attempt.' }];
  out.scramble = vm({ live: applying, coach: applyCoach });
  out.scrambleRecovery = vm({ live: { ...applying, applyDetour: ['L'] }, coach: applyCoach });
  const inspecting = (config, elapsedMs) => ({ ...idleLive, mode: 'guided', phase: config.mode === 'off' ? 'ready' : 'inspecting', scrambleStr: EXAMPLE_SCRAMBLE, applyStep: 13, applyTotal: 13, applyDetour: [], inspection: config.mode === 'off' ? null : liveInspection(config, elapsedMs), inspectionConfig: config });
  out.inspection = vm({ live: inspecting({ ...DEFAULT_INSPECTION }, 8700) });
  out.overtime = vm({ live: inspecting({ ...DEFAULT_INSPECTION }, 15800) });
  out.ready = vm({ live: inspecting({ ...DEFAULT_INSPECTION, mode: 'off' }, 0) });
  for (const mode of ['wca', 'custom', 'unlimited', 'off']) {
    for (const overtime of ['wca', 'count', 'grace', 'autostart']) {
      const config = { ...DEFAULT_INSPECTION, mode, seconds: mode === 'custom' ? 10 : 15, overtime };
      const limit = mode === 'custom' ? 10000 : 15000;
      out[`inspection:${mode}/${overtime}/early`] = vm({ live: inspecting(config, limit - 6300) });
      out[`inspection:${mode}/${overtime}/over`] = vm({ live: inspecting(config, limit + (overtime === 'grace' ? 2600 : 800)) });
    }
  }
  // Solving: F2L pair 3 (pseudo, D′ offset), 6.91 s in, 1.16 s into the pair.
  const three = exampleTrack(3);
  out.solving = vm({
    live: liveSolving(6910, 31, { phase: 'f2l-2', crossDone: true, pairsSolved: 2, f2lDone: false, eoDone: false, coDone: false, ollDone: false, solved: false, skip: null }),
    track: three.track, now: T0 + 6910, dShift: 3, coach: COACH_SOLVING,
  });
  // EO skip: F2L done and edges already oriented; now on CO.
  const beforeSkip = vm({ live: liveSolving(9570, 41, { phase: 'f2l-3', crossDone: true, pairsSolved: 3, f2lDone: false, eoDone: false, coDone: false, ollDone: false, solved: false, skip: null }), track: exampleTrack(4).track, now: T0 + 9270 });
  const eo = exampleTrack(6);
  out.skip = vm({
    live: liveSolving(9900, 41, { phase: 'co-pending', crossDone: true, pairsSolved: 4, f2lDone: true, eoDone: true, coDone: false, ollDone: false, solved: false, skip: { kind: 'eo', label: 'EO skipped — edges oriented while solving F2L!' } }),
    track: eo.track, now: T0 + 9900, toast: { text: '✦ eo skip', tone: 'info' },
  }, beforeSkip);
  // Results: the example solve as the latest record.
  const records = [...EXAMPLE_HISTORY, EXAMPLE_RECORD];
  const done = { ...liveSolving(null, 68, { phase: 'solved', crossDone: true, pairsSolved: 4, f2lDone: true, eoDone: true, coDone: true, ollDone: true, solved: true, skip: null }), phase: 'done', record: EXAMPLE_RECORD, done: true };
  out.results = vm({ live: done, records, track: createTrack(), optimalCross: { face: 'D', length: 6, solution: "F' R D2 L' B2 D" } });
  out.resultsPlus2 = vm({ live: done, records: [...EXAMPLE_HISTORY, { ...EXAMPLE_RECORD, penalty: '+2' }], track: createTrack() });
  out.resultsDnf = vm({ live: done, records: [...EXAMPLE_HISTORY, { ...EXAMPLE_RECORD, penalty: 'DNF' }], track: createTrack() });
  out.desynced = vm({ session: { ...SESSION, phase: 'desynced', detail: 'Unsupported move from cube: x. Solve it and sync again.' }, live: { ...idleLive, phase: 'desynced' } });
  out.settings = vm({ live: idleLive, settingsOpen: true });
  return out;
}

export const FIXTURE_NAMES = Object.keys(brainFixtures());
