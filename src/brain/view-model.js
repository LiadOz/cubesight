// The Brain view-model: everything the shell and the style components render,
// derived from the session and live-tracker snapshots, the stored records, the
// settings and the milestone track. Pure (no DOM, no clock reads; `now` comes
// in), so node tests cover every screen and fixtures.js builds the design
// states through the same code path.
//
// buildViewModel(input, prev) memoises slices on `prev`: an unchanged slice is
// the same object, so components skip it by identity (vm.x !== prev?.x).
// frameState(vm, now) is the cheap per-animation-frame refinement (clock text,
// current segment fill, inspection caret) between emits.

import { FACE_COLORS } from '../cross-cube.js';
import { recoveryMoves } from '../smart-cube-guidance.js';
import { currentDShift } from '../solve-tracker.js';
import { inspectionLimitMs, inspectionPenalty } from '../solve-live.js';
import { summarize, ao5, ao12, resultMs, PLUS_TWO_MS } from '../solve-metrics.js';
import { buildStagePlan, planKey as planKeyOf, planGroups, stageAverages, pbSplits, xcrossLabel, isMergedSplit } from './stage-plan.js';
import { stageProgress, createTrack } from './milestones.js';
import { tpsSeries, splitRows, donutArcs, sparkline } from './series.js';
import { fmtTime, fmtSeconds, fmtDelta, deltaTone, fmtTps, fmtResult, penaltyTag } from './format.js';
import { buildSettingsPanel, buildConfigBar, inspectionLabel } from './settings.js';
import { keyHints } from './keys.js';
import { resultsCoach } from './coach-lines.js';

const MEMO = new WeakMap();   // vm -> cached inputs/slices for the next build

// --- Screen and legacy phase text --------------------------------------------------

/** @returns {import('./types.js').Screen} */
export function screenFor(session, live) {
  const lp = live?.phase;
  if (lp === 'done') return 'results';
  if (session?.phase === 'desynced' || lp === 'desynced') return 'desynced';
  if (!session || session.phase === 'disconnected') return 'disconnected';
  if (session.phase === 'connecting' || session.phase === 'awaiting-solved') return 'connecting';
  return { applying: 'scramble', inspecting: 'inspection', ready: 'ready', solving: 'solving' }[lp] ?? 'idle';
}

const SOLVING_LABEL = { 'pre-cross': 'Building the cross', cross: 'F2L', 'f2l-0': 'F2L', 'f2l-1': 'F2L', 'f2l-2': 'F2L', 'f2l-3': 'F2L', 'f2l-4': 'F2L', eo: 'OLL · orient edges', co: 'OLL · orient edges', 'co-pending': 'OLL · orient corners', pll: 'PLL', solved: 'Solved' };

/** The v1 #brain-phase-label / #brain-phase-detail strings, byte for byte. */
export function phaseText(live) {
  const snap = live || {};
  const p = snap.progress || {};
  let label = 'Connect and start a solve';
  if (snap.phase === 'applying') label = 'Perform the scramble';
  else if (snap.phase === 'inspecting') label = 'Inspection';
  else if (snap.phase === 'ready') label = 'Start solving — the clock starts on your first turn';
  else if (snap.phase === 'solving') label = p.phase ? (SOLVING_LABEL[p.phase] || 'F2L') : 'Solving';
  else if (snap.phase === 'done') label = 'Solved';
  let detail;
  if (snap.phase === 'inspecting' && snap.inspection) {
    const remaining = snap.inspection.remainingMs;
    detail = remaining != null ? `Inspect — ${(remaining / 1000).toFixed(1)}s left (clock starts on your first move)` : 'Inspect — start solving on your first move';
  } else {
    const moves = snap.phase === 'done' && snap.record ? snap.record.moveCount : (snap.solveMoveCount ?? 0);
    const msElapsed = (snap.phase === 'done' ? snap.record?.solveMs : snap.elapsedMs) ?? 0;
    const tps = msElapsed > 0 ? (moves / (msElapsed / 1000)).toFixed(2) : '0.00';
    const pairs = p.f2lDone ? '4/4' : p.crossDone ? `${p.pairsSolved ?? 0}/4 pairs` : '';
    detail = (snap.phase === 'solving' || snap.phase === 'done')
      ? `${moves} turn${moves === 1 ? '' : 's'} · ${tps} TPS · ${(msElapsed / 1000).toFixed(2)}s${pairs ? ' · ' + pairs : ''}`
      : snap.phase === 'applying' ? `Scramble turn ${Math.min(snap.applyStep + 1, snap.applyTotal)} of ${snap.applyTotal}.`
        : 'Cross is read from the bottom at your first move.';
  }
  return { label, detail };
}

// --- Device --------------------------------------------------------------------------

/** @returns {import('./types.js').DeviceVM} */
export function deviceFor(session, supported = true, connectStep = '') {
  const s = session || { phase: 'disconnected', detail: '' };
  const connecting = s.phase === 'connecting';
  const connected = !connecting && s.phase !== 'disconnected';
  const gyro = connected && Boolean(s.protocol?.startsWith('GAN')) && Boolean(s.gyro);
  const phase = { disconnected: 'disconnected', connecting: 'connecting', 'awaiting-solved': 'syncing', tracking: 'tracking', desynced: 'desynced' }[s.phase] ?? 'disconnected';
  // Without Web Bluetooth only a disconnected cube needs the explanation (a
  // replayed recording connects through the adapter seam regardless).
  // While connecting, the status line is the latest step of the attach (the picker, the advertisement
  // watch, the address lookup, the manual-address prompt, …), newest of the session detail and the log.
  const failed = s.phase === 'disconnected' && /^(Connection failed|No cube selected)/.test(s.detail ?? '');
  const detail = connecting ? (connectStep || s.detail || 'Select your cube…')
    : failed ? s.detail
      : supported || connected ? `${s.detail ?? ''}${gyro ? ' Hold the cube as shown and tap Recenter motion to align.' : ''}`
        : 'Web Bluetooth needs Chrome or Edge on Android/desktop over HTTPS.';
  return {
    phase,
    name: connected ? (s.deviceName || 'Smart cube') : connecting ? 'connecting…' : 'No cube',
    protocol: s.protocol || '',
    battery: Number.isFinite(s.battery) ? s.battery : null,
    supported,
    gyro,
    detail,
    // The attach is under way (the picker, the address lookup, the first read of the cube), or just failed.
    busy: connecting || phase === 'syncing',
    failed,
    actions: {
      // Offered even without Web Bluetooth: connecting then explains what's missing.
      connect: s.phase === 'disconnected',
      sync: connected,
      recenter: gyro,
      disconnect: s.phase !== 'disconnected',
      clearSaved: s.phase === 'disconnected',
    },
  };
}

// --- Inspection ------------------------------------------------------------------------

/**
 * Static layout of the inspection lane/ring for a config. The full scale is
 * the limit + 2 s (60 s per lap when unlimited). Zones: normal up to the
 * limit, then per overtime rule — wca: +2 for 2 s then an open-ended DNF;
 * count: one open-ended count zone with +1/+2/+3 ticks; grace: the grace
 * period, then a 2 s +2 zone or an open-ended DNF (nothing for no penalty).
 */
export function inspectionLayout(config) {
  const limit = inspectionLimitMs(config);
  if (limit == null) return { limitMs: null, scaleMs: 60000, zones: [], ticks: [] };
  const zones = [{ kind: 'normal', fromMs: 0, toMs: limit }];
  const ticks = [];
  if (config.overtime === 'wca') zones.push({ kind: 'plus2', fromMs: limit, toMs: limit + PLUS_TWO_MS }, { kind: 'dnf', fromMs: limit + PLUS_TWO_MS, toMs: null });
  if (config.overtime === 'count') zones.push({ kind: 'count', fromMs: limit, toMs: null });
  if (config.overtime === 'grace') {
    const grace = config.graceSeconds * 1000;
    zones.push({ kind: 'grace', fromMs: limit, toMs: limit + grace });
    if (config.gracePenalty === 'plus2') zones.push({ kind: 'plus2', fromMs: limit + grace, toMs: limit + grace + PLUS_TWO_MS });
    if (config.gracePenalty === 'dnf') zones.push({ kind: 'dnf', fromMs: limit + grace, toMs: null });
  }
  if (config.callouts && limit >= 12000) ticks.push({ atMs: 8000, label: '8s', kind: 'callout' }, { atMs: 12000, label: '12s', kind: 'callout' });
  ticks.push({ atMs: limit, label: '', kind: 'limit' });
  if (config.overtime === 'count') for (let n = 1; n <= 3; n++) ticks.push({ atMs: limit + n * 1000, label: `+${n}`, kind: 'count' });
  return { limitMs: limit, scaleMs: limit + PLUS_TWO_MS, zones, ticks };
}

/** The moving part of inspection at `elapsedMs` (recomputed every frame). */
export function inspectionState(config, elapsedMs) {
  const layout = inspectionLayout(config);
  const limit = layout.limitMs;
  const elapsed = Math.max(0, elapsedMs);
  const remainingMs = limit == null ? null : Math.max(0, limit - elapsed);
  const overtimeMs = limit == null ? 0 : Math.max(0, elapsed - limit);
  const penalty = inspectionPenalty(config, elapsed);
  const callout = config.callouts && limit != null ? (elapsed >= 12000 ? 12 : elapsed >= 8000 ? 8 : null) : null;
  let bigText;
  if (limit == null) bigText = `${Math.floor(elapsed / 60000)}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')}`;
  else if (overtimeMs <= 0) bigText = String(Math.ceil(remainingMs / 1000));
  else if (config.overtime === 'grace') bigText = `+${(overtimeMs / 1000).toFixed(1)}`;
  else if (config.overtime === 'autostart') bigText = '0';
  else bigText = `+${Math.max(1, Math.floor(overtimeMs / 1000))}`;
  const tone = penalty === 'DNF' ? 'error' : overtimeMs > 0 && config.overtime !== 'grace' && config.overtime !== 'autostart' ? 'warn' : 'accent';
  const s = ms => (ms / 1000).toFixed(1);
  let consequence = '';
  const secs = limit == null ? null : limit / 1000;
  if (limit == null) consequence = 'unlimited inspection · the clock starts on your first turn';
  else if (config.overtime === 'wca') {
    if (overtimeMs <= 0) consequence = `+2 after ${secs} s · dnf after ${secs + 2} s`;
    else if (penalty === '+2') consequence = `starting now = +2 penalty · dnf in ${s(limit + PLUS_TWO_MS - elapsed)} s`;
    else consequence = 'over the limit · dnf';
  } else if (config.overtime === 'count') {
    consequence = overtimeMs <= 0 ? `${secs} s · then counting, no penalty` : `+${Math.ceil(overtimeMs / 1000)} s over · no penalty`;
  } else if (config.overtime === 'grace') {
    const grace = config.graceSeconds * 1000;
    const name = { plus2: '+2', dnf: 'dnf', none: 'no penalty' }[config.gracePenalty] ?? 'no penalty';
    if (overtimeMs <= 0) consequence = `${secs} s + ${grace / 1000} s grace`;
    else if (overtimeMs <= grace) consequence = config.gracePenalty === 'none' ? 'grace · no penalty' : `grace · ${name} in ${s(grace - overtimeMs)} s`;
    else consequence = config.gracePenalty === 'none' ? 'over · no penalty' : `starting now = ${name}`;
  } else if (config.overtime === 'autostart') consequence = `the clock starts itself at ${secs} s`;
  const caret = limit == null ? (elapsed % layout.scaleMs) / layout.scaleMs : Math.min(1, elapsed / layout.scaleMs);
  return { elapsedMs: elapsed, remainingMs, overtimeMs, penalty, callout, bigText, tone, consequence, caret, layout };
}

/** @returns {import('./types.js').InspectionVM|null} */
function inspectionVM(live, now) {
  if (live?.phase !== 'inspecting' || !live.inspection) return null;
  const config = { ...live.inspectionConfig };
  const st = inspectionState(config, live.inspection.elapsedMs);
  return {
    mode: config.mode, overtime: config.overtime,
    limitMs: st.layout.limitMs, elapsedMs: st.elapsedMs, remainingMs: st.remainingMs, overtimeMs: st.overtimeMs,
    penalty: st.penalty, callout: st.callout,
    scaleMs: st.layout.scaleMs, zones: st.layout.zones,
    ticks: st.layout.ticks.map(t => ({ ...t, passed: st.elapsedMs >= t.atMs })),
    bigText: st.bigText, tone: st.tone, consequence: st.consequence,
    autostartHandoff: config.overtime === 'autostart' && st.remainingMs != null && st.remainingMs <= 1000,
    startedAt: now - st.elapsedMs,
  };
}

// --- Stages: plan, averages, per-stage progress ----------------------------------------------

// Stage rows for the record being reviewed: from the live track when it belongs
// to this solve, else from the stored splits (times relative to the solve start).
function recordStages(record, track, plan) {
  if (track?.active && track.stamps.solvedAt != null) {
    const sp = stageProgress(track, plan);
    return { stages: sp.stages.filter(s => s.done).map(s => ({ ...s, label: plan.find(p => p.key === s.key)?.label })), solveStartAt: track.solveStartAt, moveTimes: track.moveTimes };
  }
  let at = 0;
  const stages = (record.splits || []).filter(s => plan.some(p => p.key === s.key)).map(s => {
    const startAt = at;
    at += s.ms ?? 0;
    return { key: s.key, label: plan.find(p => p.key === s.key)?.label, startAt, endAt: at, ms: s.ms, moves: s.moves, skipped: s.skipped, merged: isMergedSplit(s), pseudo: s.pseudo, done: true };
  });
  return { stages, solveStartAt: 0, moveTimes: record.moveTimes || [] };
}

function timelineVM({ screen, settings, plan, averages, pbs, track, live, now, prevTimeline, dShift }) {
  const sp = stageProgress(track || createTrack(), plan);
  const solving = screen === 'solving';
  const results = screen === 'results';
  const preSolve = screen === 'inspection' || screen === 'ready';
  const currentIndex = solving ? Math.min(sp.currentIndex, plan.length - 1) : results ? plan.length : 0;
  const total = averages.totalAvgMs || 1;
  // Arc widths follow the averages, with a floor so a stage that is always skipped keeps a visible arc.
  const rawWeights = plan.map(stage => averages.byKey[stage.key].avgMs / total);
  const floored = rawWeights.map(w => Math.max(w, 0.03));
  const flooredSum = floored.reduce((sum, w) => sum + w, 0) || 1;
  const prevByKey = new Map((prevTimeline?.segments || []).map(s => [s.key, s]));
  // X-cross: pairs that were already built when the cross completed are done at
  // the same moment; the cross segment carries the tag.
  const xLabel = (solving || results) ? xcrossLabel(sp.stages.filter(st => st.merged).length) : null;
  const segments = plan.map((stage, i) => {
    const p = sp.stages[i];
    const avg = averages.byKey[stage.key];
    const done = (solving || results) && p.done;
    // From inspection on, the timeline sits on the first stage (the cross).
    const current = (solving && i === currentIndex && !p.done) || (preSolve && i === 0);
    const state = done ? (p.skipped ? 'skipped' : 'done') : current ? 'current' : 'future';
    const ref = settings.compare === 'pb' ? pbs[stage.key] : settings.compare === 'avg' ? avg.avgMs : null;
    const deltaMs = done && !p.skipped && !p.merged && ref != null && p.ms != null ? p.ms - ref : null;
    const elapsed = current && p.startAt != null ? Math.max(0, now - p.startAt) : 0;
    const merged = Boolean(done && p.merged);
    const tags = p.pseudo ? ['pseudo'] : [];
    if (stage.key === 'cross' && done && xLabel) tags.push(xLabel);
    if (current && /^pair\d$/.test(stage.key) && settings.f2l === 'pseudo' && dShift) tags.push('pseudo');
    const prevSeg = prevByKey.get(stage.key);
    return {
      key: stage.key, label: stage.label, short: stage.short, group: stage.group,
      weight: floored[i] / flooredSum, avgMs: avg.avgMs, avgSource: avg.source,
      state,
      fill: done ? 1 : current ? Math.min(1, elapsed / Math.max(1, avg.avgMs)) : 0,
      startedAt: current ? p.startAt : null,
      splitMs: done ? p.ms : null,
      splitText: done ? (p.skipped ? 'skip' : merged ? 'with cross' : fmtTime(p.ms)) : '',
      merged,
      xcross: stage.key === 'cross' && done ? xLabel : null,
      delta: deltaMs == null ? null : { ms: deltaMs, text: fmtDelta(deltaMs), tone: deltaTone(deltaMs) },
      moves: done ? p.moves : null,
      tags,
      skip: state === 'skipped' ? { label: `${stage.label} skip`, fresh: Boolean(prevSeg) && prevSeg.state !== 'skipped' } : null,
      over: current && elapsed > avg.avgMs,
    };
  });
  const visibleScreens = ['idle', 'scramble', 'inspection', 'ready', 'solving', 'results'];
  const inspMs = live?.inspectionMs ?? live?.record?.inspectionMs ?? null;
  const label = results ? 'solved' : plan[currentIndex]?.label ?? '';
  return {
    visible: settings.timeline === 'on' && visibleScreens.includes(screen),
    ghost: ['idle', 'scramble'].includes(screen),
    planKey: `${planKeyOf(plan)}|${settings.f2l}`,
    groups: planGroups(plan, settings),
    segments,
    currentIndex,
    totalAvgMs: averages.totalAvgMs,
    insp: (solving || results) && Number.isFinite(inspMs) ? { text: `insp ${(inspMs / 1000).toFixed(1)}` } : null,
    aria: { now: currentIndex, max: plan.length, text: label },
  };
}

// --- Clock --------------------------------------------------------------------------------

function clockVM({ screen, live, settings, now, timeline, result }) {
  const seg = timeline.segments[timeline.currentIndex];
  const group = seg?.group && seg.group !== seg.key ? seg.group : null;
  const tags = seg?.tags ?? [];
  const stepLine = screen === 'solving' && seg ? [
    ...(group ? [{ text: group, tone: 'accent' }] : []),
    { text: seg.label, tone: 'accent' },
    ...tags.map(t => ({ text: t, tone: 'sub' })),
  ] : [];
  const stepTitle = screen === 'solving' && seg ? seg.label.replace(/^./, c => c.toUpperCase()).replace(/^(Eo|Co|Cp|Ep|Oll|Pll|Cmll|L6e)$/, x => x.toUpperCase()) : '';
  if (screen === 'solving') {
    const elapsed = live.elapsedMs ?? 0;
    const moves = live.solveMoveCount ?? 0;
    return {
      text: fmtTime(elapsed), ms: elapsed, startedAt: now - elapsed, running: true, hidden: settings.timer === 'hide',
      tone: 'text', sub: `${moves} moves · ${elapsed > 0 ? (moves / (elapsed / 1000)).toFixed(2) : '0.00'} tps`,
      stepLine, stepTitle, stepTags: tags.includes('pseudo') ? ['pseudo · D′ shift'] : [],
    };
  }
  if (screen === 'results' && result) {
    return {
      text: result.text, ms: result.ms, startedAt: null, running: false, hidden: false,
      tone: result.penalty === 'DNF' ? 'error' : result.penalty === '+2' ? 'warn' : 'accent',
      sub: `${result.record.moveCount} moves · ${fmtTps(result.record.tps)} tps`, stepLine: [], stepTitle: '', stepTags: [],
    };
  }
  return { text: '0.00', ms: null, startedAt: null, running: false, hidden: false, tone: 'text', sub: '', stepLine: [], stepTitle: '', stepTags: [] };
}

// --- Scramble --------------------------------------------------------------------------------

function scrambleVM({ live, settings, scrambleText, held, number }) {
  const applying = live?.phase === 'applying';
  const text = applying ? (live.scrambleStr || '') : (scrambleText || '');
  if (!applying && !text) return null;
  const moves = text.split(/\s+/).filter(Boolean);
  const detour = applying ? live.applyDetour || [] : [];
  const step = applying ? live.applyStep : 0;
  let recovery = null;
  if (detour.length) {
    try { recovery = recoveryMoves(detour, held?.bottom ?? 'D', held?.front ?? 'F').map((m, i) => ({ key: `r${i}`, text: m, state: i === 0 ? 'current' : 'todo' })); }
    catch { recovery = null; }
  }
  const busy = ['applying', 'solving', 'done'].includes(live?.phase);
  return {
    source: settings.scramble,
    moves: moves.map((m, i) => ({ key: `s${i}`, text: m, state: !applying ? 'todo' : i < step ? 'done' : i === step && !detour.length ? 'current' : 'todo' })),
    recovery,
    wrongTurn: detour.length ? detour[0] : null,
    step,
    total: applying ? live.applyTotal : moves.length,
    editable: !busy,
    text,
    ...(Number.isFinite(number) && number > 0 ? { number } : {}),
  };
}

// --- Results -----------------------------------------------------------------------------------

// Short method line for the results header, e.g. 'cfop · 2-look · pseudo'.
function methodSummary(record, settings) {
  const c = record.config || {};
  const method = c.method || settings.method;
  const parts = [method];
  if (method === 'cfop') {
    if (c.cross === 'xcross' || c.cross === 'xxcross') parts.push(c.cross === 'xcross' ? 'x-cross' : 'xx-cross');   // older records
    const oll = c.oll || settings.oll;
    const pll = c.pll || settings.pll;
    parts.push(oll === pll ? (oll === '1look' ? '1-look' : '2-look') : `oll ${oll === '1look' ? '1' : '2'}-look · pll ${pll === '1look' ? '1' : '2'}-look`);
    if ((c.f2l || settings.f2l) === 'pseudo') parts.push('pseudo');
  }
  return parts.join(' · ');
}

function resultsVM({ live, records, settings, plan, track, optimalCross }) {
  const record = live?.record;
  if (!record) return null;
  const stored = records.find(r => r.at === record.at) ?? record;
  const penalty = settings.penalties === 'ignore' ? null : stored.penalty ?? null;
  const shown = { ...stored, penalty };
  const ms = resultMs(shown);
  const others = records.filter(r => r.at !== stored.at);
  const averages = stageAverages(others, plan);
  const pbs = pbSplits(others, plan);
  const { stages, solveStartAt, moveTimes } = recordStages(stored, track, plan);
  const prevAo12 = ao12(others);
  const vsAo12 = Number.isFinite(prevAo12) && Number.isFinite(ms) ? { text: fmtDelta(ms - prevAo12), tone: deltaTone(ms - prevAo12) } : null;
  const tpsValues = others.map(r => r.tps).filter(Number.isFinite).sort((a, b) => a - b);
  const avgFlat = tpsValues.length ? tpsValues[Math.floor(tpsValues.length / 2)] : null;
  const summary = summarize(records);
  const a5 = ao5(records); const a12 = ao12(records);
  const prevA5 = ao5(others);
  const tones = {
    ao5: Number.isFinite(a5) && Number.isFinite(prevA5) ? deltaTone(a5 - prevA5) : 'none',
    ao12: Number.isFinite(a12) && Number.isFinite(prevAo12) ? deltaTone(a12 - prevAo12) : 'none',
    pb: Number.isFinite(ms) && summary.bestSolveMs === ms ? 'faster' : 'none',
    mean: 'none',
  };
  return {
    key: String(stored.at),
    ms,
    record: stored,
    penalty,
    text: fmtTime(ms),
    vm: {
      key: String(stored.at),
      time: { text: fmtTime(ms), resultText: fmtResult(shown, 'long'), penalty, tone: penalty === 'DNF' ? 'error' : penalty === '+2' ? 'warn' : 'accent' },
      moves: String(stored.moveCount ?? 0),
      tps: fmtTps(stored.tps),
      inspection: Number.isFinite(stored.inspectionMs) ? (stored.inspectionMs / 1000).toFixed(2) : '—',
      method: methodSummary(shown, settings),
      vsAo12,
      tpsSeries: tpsSeries(moveTimes, { durationMs: stored.solveMs, stages, solveStartAt, averages, avgFlat }),
      splits: splitRows(stages, plan, averages, { compare: settings.compare, pbs }),
      donut: { centerValue: String(stored.moveCount ?? 0), centerLabel: 'moves', arcs: donutArcs(stages, plan, averages) },
      session: { ao5: fmtTime(a5), ao12: fmtTime(a12), pb: fmtTime(summary.bestSolveMs), mean: fmtTime(summary.meanSolveMs), tones },
      spark: sparkline(records, { currentAt: stored.at }),
      recent: records.slice(-7).reverse().map(r => ({ key: String(r.at), text: fmtResult(r, 'short'), penaltyTag: penaltyTag(r), current: r.at === stored.at })),
      coach: resultsCoach({ record: stored, optimalCross, stages, plan, averages, faceColors: FACE_COLORS }),
    },
  };
}

function statsVM(records) {
  const s = summarize(records);
  return {
    solves: String(s.solvedCount ?? 0),
    best: fmtSeconds(s.bestSolveMs),
    ao5: fmtSeconds(ao5(records)),
    ao12: fmtSeconds(ao12(records)),
    medianTps: s.medianTPS?.toFixed(2) ?? '—',
    medianMoves: s.medianMoveCount != null ? String(s.medianMoveCount) : '—',
  };
}

// --- Build ----------------------------------------------------------------------------------

/**
 * @param {{session:Object, live:Object, records:Object[], settings:Object, track?:Object, optimalCross?:Object|null,
 *   coach?:import('./types.js').CoachLine[], error?:string, status?:string|null, theme?:'dark'|'light',
 *   supported?:boolean, now?:number, held?:{bottom:string, front:string}, scrambleText?:string,
 *   settingsOpen?:boolean, themePreference?:'light'|'dark'|'system', debugOpen?:boolean, connectStep?:string, commandOpen?:boolean, scrambleNumber?:number, toast?:{text:string, tone:string}|null,
 *   dShift?:number|null}} input
 * @param {import('./types.js').BrainVM|null} prev
 * @returns {import('./types.js').BrainVM}
 */
export function buildViewModel(input, prev = null) {
  const { session, live, records = [], settings, track = null, optimalCross = null, now = 0 } = input;
  const memo = (prev && MEMO.get(prev)) || {};
  const next = {};
  const same = (key, deps) => memo[key] && memo[key].deps.length === deps.length && memo[key].deps.every((d, i) => d === deps[i]);
  const cached = (key, deps, compute) => {
    const value = same(key, deps) ? memo[key].value : compute();
    next[key] = { deps, value };
    return value;
  };

  const screen = screenFor(session, live);
  const plan = cached('plan', [settings.method, settings.oll, settings.pll], () => buildStagePlan(settings));
  const averages = cached('averages', [records, plan], () => stageAverages(records, plan));
  const pbs = cached('pbs', [records, plan], () => pbSplits(records, plan));
  const dShift = input.dShift !== undefined ? input.dShift
    : (screen === 'solving' && settings.f2l === 'pseudo' && session?.state && live?.crossFace ? currentDShift(session.state, live.crossFace) : null);
  const timeline = timelineVM({ screen, settings, plan, averages, pbs, track, live, now, prevTimeline: prev?.timeline, dShift });
  const result = screen === 'results'
    ? cached('results', [live?.record, records, settings.penalties, settings.compare, plan, track?.stamps?.solvedAt, optimalCross], () => resultsVM({ live, records, settings, plan, track, optimalCross }))
    : null;
  const device = cached('device', [session?.phase, session?.detail, session?.deviceName, session?.protocol, session?.battery, Boolean(session?.gyro), input.supported ?? true, input.connectStep ?? ''], () => deviceFor(session, input.supported ?? true, input.connectStep ?? ''));
  const themePreference = input.themePreference ?? 'system';
  const settingsPanel = cached('settingsPanel', [settings, Boolean(input.settingsOpen), themePreference], () => buildSettingsPanel(settings, Boolean(input.settingsOpen), themePreference));
  const configBar = cached('configBar', [settings], () => buildConfigBar(settings));
  const stats = cached('stats', [records], () => statsVM(records));
  const keys = cached('keys', [screen, settings.timer, settings.coach], () => keyHints(screen, { timerHidden: settings.timer === 'hide', coach: settings.coach }));
  const coachIn = input.coach ?? [];
  const coach = prev && sameLines(prev.coach, coachIn) ? prev.coach : coachIn;
  const phase = phaseText(live);
  const vm = {
    rev: (prev?.rev ?? 0) + 1,
    style: settings.style,
    theme: input.theme ?? 'dark',
    screen,
    phaseText: prev && prev.phaseText.label === phase.label && prev.phaseText.detail === phase.detail ? prev.phaseText : phase,
    device,
    configBar,
    settings: settingsPanel,
    scramble: scrambleVM({ live, settings, scrambleText: input.scrambleText, held: input.held, number: input.scrambleNumber }),
    clock: clockVM({ screen, live, settings, now, timeline, result }),
    inspection: inspectionVM(live, now),
    timeline,
    coach,
    results: result?.vm ?? null,
    stats,
    keys,
    toast: input.toast ?? null,
    status: input.status ?? device.detail,
    error: input.error ?? '',
    chromeDimmed: ['scramble', 'inspection', 'ready', 'solving'].includes(screen),
    commandOpen: Boolean(input.commandOpen),
    debugOpen: Boolean(input.debugOpen),
  };
  // Keep identity for slices that did not change, so components can skip them.
  if (prev) {
    for (const key of ['scramble', 'clock', 'inspection', 'timeline']) if (deepEqual(vm[key], prev[key])) vm[key] = prev[key];
  }
  next.inspectionConfig = live?.inspectionConfig ?? null;
  MEMO.set(vm, next);
  return vm;
}

function sameLines(a, b) {
  return a.length === b.length && a.every((line, i) => line.key === b[i].key && line.text === b[i].text && line.tone === b[i].tone);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a); const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual(a[k], b[k]));
}

// --- Per-frame -------------------------------------------------------------------------------

/**
 * The per-animation-frame refinement between emits.
 * @returns {import('./types.js').FrameVM}
 */
export function frameState(vm, nowMs) {
  const clock = vm.clock;
  const seg = vm.timeline.segments.find(s => s.state === 'current');
  const segElapsed = seg && seg.startedAt != null ? Math.max(0, nowMs - seg.startedAt) : 0;
  let inspection = null;
  if (vm.inspection && vm.inspection.startedAt != null) {
    const config = MEMO.get(vm)?.inspectionConfig;
    if (config) {
      const st = inspectionState(config, nowMs - vm.inspection.startedAt);
      inspection = { elapsedMs: st.elapsedMs, remainingMs: st.remainingMs, overtimeMs: st.overtimeMs, bigText: st.bigText, tone: st.tone, caret: st.caret, consequence: st.consequence };
    }
  }
  return {
    startedAtSolve: clock.running ? clock.startedAt : null,
    clockText: clock.running && clock.startedAt != null ? fmtTime(nowMs - clock.startedAt) : clock.text,
    currentFill: seg ? Math.min(1, segElapsed / Math.max(1, seg.avgMs)) : 0,
    currentSplitText: seg ? fmtTime(segElapsed) : '',
    currentOver: Boolean(seg) && segElapsed > seg.avgMs,
    inspection,
  };
}

export { inspectionLabel };
