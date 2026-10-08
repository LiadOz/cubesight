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
import { FACE_TO_D } from '../analysis/normalize.js';
import { inverseMove, recoveryMoves } from '../smart-cube-guidance.js';
import { logConnection } from '../smart-cube-diag.js';
import { currentDShift } from '../solve-tracker.js';
import { inspectionLimitMs, inspectionPenalty } from '../solve-live.js';
import { summarize, ao5, ao12, scopeStats, flowStats, learningStats, resultMs, PLUS_TWO_MS } from '../solve-metrics.js';
import { sessionRecords, currentSessionId } from '../store/sessions.js';
import { FOCI, focusOf, inFocus, inStatsSource, normalizeFocus } from '../store/focus.js';
import { buildStagePlan, planKey as planKeyOf, planGroups, stageAverages, pbSplits, xcrossLabel, isMergedSplit } from './stage-plan.js';
import { stageProgress, createTrack } from './milestones.js';
import { tpsSeries, splitRows, donutArcs, sparkline } from './series.js';
import { fmtTime, fmtSeconds, fmtDelta, deltaTone, fmtTps, fmtResult, penaltyTag } from './format.js';
import { buildSettingsPanel, buildConfigBar, inspectionLabel } from './settings.js';
import { keyHints } from './keys.js';
import { describeMove, displayMove } from '../moves/notation.js';
import { resultsCoach } from './coach-lines.js';
import { buildMarkers } from './review/markers.js';
import { reviewBaselines } from './review/baselines.js';
import { buildDetail } from './review/detail.js';
import { cleanAnalysis } from '../store/analysis-field.js';
import { getCase } from '../algs/seed/cases.js';

const MEMO = new WeakMap();   // vm -> cached inputs/slices for the next build

// --- Screen and legacy phase text --------------------------------------------------

/** @returns {import('./types.js').Screen} */
export function screenFor(session, live) {
  const lp = live?.phase;
  if (lp === 'done') return 'results';
  if (session?.phase === 'desynced' || lp === 'desynced') return 'desynced';
  // A solve paused by a lost connection shows the connection screen (reconnect / resume).
  if (!session || session.phase === 'disconnected' || lp === 'interrupted') return 'disconnected';
  if (session.phase === 'connecting' || session.phase === 'awaiting-solved') return 'connecting';
  return { applying: 'scramble', inspecting: 'inspection', ready: 'ready', solving: 'solving' }[lp] ?? 'idle';
}

const SOLVING_LABEL = { 'pre-cross': 'cross', cross: 'F2L', 'f2l-0': 'F2L', 'f2l-1': 'F2L', 'f2l-2': 'F2L', 'f2l-3': 'F2L', 'f2l-4': 'F2L', eo: 'EO', co: 'CO', 'co-pending': 'CO', pll: 'PLL', solved: 'solved' };
const xcrossPairName = ({ face, slot }) => {
  if (!face || !slot || !FACE_TO_D[face]) return null;
  const toPhysical = Object.fromEntries(Object.entries(FACE_TO_D[face]).map(([physical, normalized]) => [normalized, physical]));
  return [...slot].map(normalized => FACE_COLORS[toPhysical[normalized]]).join('-');
};

/** The v1 #brain-phase-label / #brain-phase-detail strings, byte for byte. */
export function phaseText(live) {
  const snap = live || {};
  const p = snap.progress || {};
  let label = 'connect cube';
  if (snap.phase === 'applying') label = 'apply scramble';
  else if (snap.phase === 'inspecting') label = 'inspection';
  else if (snap.phase === 'ready') label = 'start';
  else if (snap.phase === 'solving') label = p.phase ? (SOLVING_LABEL[p.phase] || 'F2L') : 'solving';
  else if (snap.phase === 'done') label = 'solved';
  let detail;
  if (snap.phase === 'inspecting' && snap.inspection) {
    const remaining = snap.inspection.remainingMs;
    detail = remaining != null ? `Inspection · ${(remaining / 1000).toFixed(1)} s left. Clock starts on your first move.` : 'Inspection. Clock starts on your first move.';
  } else {
    const moves = snap.phase === 'done' && snap.record ? snap.record.moveCount : (snap.solveMoveCount ?? 0);
    const msElapsed = (snap.phase === 'done' ? snap.record?.solveMs : snap.elapsedMs) ?? 0;
    const tps = msElapsed > 0 ? (moves / (msElapsed / 1000)).toFixed(2) : '0.00';
    const pairs = p.f2lDone ? '4/4' : p.crossDone ? `${p.pairsSolved ?? 0}/4 pairs` : '';
    detail = (snap.phase === 'solving' || snap.phase === 'done')
      ? `${moves} ${moves === 1 ? 'move' : 'moves'} · ${tps} TPS · ${fmtSeconds(msElapsed)}${pairs ? ' · ' + pairs : ''}`
      : snap.phase === 'applying' ? `Scramble move ${Math.min(snap.applyStep + 1, snap.applyTotal)} of ${snap.applyTotal}.`
        : 'Cross follows the first face you solve.';
  }
  return { label, detail };
}

// --- Device --------------------------------------------------------------------------

// The session's own status lines are shared with the scout and debug views, which still
// have an Analyze button; on the Brain the next step is a scramble (docs/design/VOICE.md).
export function brainDetail(text = '') {
  return String(text)
    .replace(/^Solved baseline synced\..*$/, "Cube synced. Start a scramble when you're ready.")
    .replace(/ Analyze when ready\.$/, '');
}

/** @returns {import('./types.js').DeviceVM} */
export function deviceFor(session, supported = true, connectStep = '', live = null) {
  const s = session ? { ...session, detail: brainDetail(session.detail) } : { phase: 'disconnected', detail: '' };
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
      : supported || connected ? `${s.detail ?? ''}${gyro ? ' Hold the cube as shown and tap recenter to align.' : ''}`
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
      // After an unexpected drop: one-tap reconnect, and resuming a paused solve.
      reconnect: s.phase === 'disconnected' && s.link?.status === 'lost',
      resume: Boolean(live?.interrupted?.canResume),
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
function inspectionVM(live, now, optimalCross = null, averages = null) {
  if (live?.phase !== 'inspecting' || !live.inspection) return null;
  const config = { ...live.inspectionConfig };
  const st = inspectionState(config, live.inspection.elapsedMs);
  const crossHint = optimalCross?.best ?? (optimalCross?.face ? optimalCross : null);
  // copy-ok: “best” is the proven lowest-move start plan in the bounded search.
  const bestStart = crossHint
    ? `${crossHint.proven === false ? 'cross found so far' : 'best cross'}: ${FACE_COLORS[crossHint.face] ?? crossHint.face}, ${crossHint.length}${optimalCross?.bestXcross?.proven ? ` · ${FACE_COLORS[optimalCross.bestXcross.face] ?? optimalCross.bestXcross.face} cross with ${xcrossPairName(optimalCross.bestXcross) ?? optimalCross.bestXcross.slot ?? 'an adjacent'} pair · X-cross possible in ${optimalCross.bestXcross.length}` : ''}`
    : '';
  const crossMoves = crossHint?.moves?.length ? crossHint.moves.map(displayMove).join(' ') : '';
  const usual = averages?.byKey?.cross?.source === 'history' ? averages.byKey.cross.avgMoves : null;
  // A-03: "seconds left · "8 s" called" under the digit; once over the limit the rule that applies.
  const hint = st.limitMs == null || st.overtimeMs > 0 || st.remainingMs == null ? st.consequence
    : `seconds left${st.callout ? ` · “${st.callout} s” called` : ''}`;
  return {
    hint,
    // The plan block on the left (A-03): the best cross found, its moves, and what the solver usually spends.
    plan: crossHint ? {
      eyebrow: 'cross hint', head: `${FACE_COLORS[crossHint.face] ?? crossHint.face} · ${crossHint.length} moves`, moves: crossMoves,
      usual: usual == null ? '' : `your usual: ${usual.toFixed(1)} moves`,
    } : null,
    mode: config.mode, overtime: config.overtime,
    limitMs: st.layout.limitMs, elapsedMs: st.elapsedMs, remainingMs: st.remainingMs, overtimeMs: st.overtimeMs,
    penalty: st.penalty, callout: st.callout,
    scaleMs: st.layout.scaleMs, zones: st.layout.zones,
    ticks: st.layout.ticks.map(t => ({ ...t, passed: st.elapsedMs >= t.atMs })),
    bigText: st.bigText, tone: st.tone, consequence: st.consequence,
    autostartHandoff: config.overtime === 'autostart' && st.remainingMs != null && st.remainingMs <= 1000,
    bestStart,
    startedAt: now - st.elapsedMs,
  };
}

// --- Stages: plan, averages, per-stage progress ----------------------------------------------

// Stage rows for the record being reviewed: from the live track when it belongs
// to this solve, else from the stored splits (times relative to the solve start).
function recordStages(record, track, plan) {
  if (track?.active && track.stamps.solvedAt != null) {
    const sp = stageProgress(track, plan);
    return { stages: sp.stages.filter(s => s.done).map(s => ({ ...s, label: plan.find(p => p.key === s.key)?.label, short: plan.find(p => p.key === s.key)?.short })), solveStartAt: track.solveStartAt, moveTimes: track.moveTimes };
  }
  let at = 0;
  const stages = (record.splits || []).filter(s => plan.some(p => p.key === s.key)).map(s => {
    const startAt = at;
    at += s.ms ?? 0;
    return { key: s.key, label: plan.find(p => p.key === s.key)?.label, short: plan.find(p => p.key === s.key)?.short, startAt, endAt: at, ms: s.ms, moves: s.moves, skipped: s.skipped, merged: isMergedSplit(s), pseudo: s.pseudo, done: true };
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

function clockVM({ screen, live, settings, now, timeline, result, scramble, held }) {
  const seg = timeline.segments[timeline.currentIndex];
  const group = seg?.group && seg.group !== seg.key ? seg.group : null;
  const tags = seg?.tags ?? [];
  const stepLine = screen === 'solving' && seg ? [
    ...(group ? [{ text: group, tone: 'accent' }] : []),
    { text: seg.label, tone: 'accent' },
    ...tags.map(t => ({ text: t, tone: 'sub' })),
  ] : [];
  // The live stage title (A-04): "F2L · pair 4", "OLL · eo", "cross".
  const stepTitle = screen === 'solving' && seg ? (group ? `${group.toUpperCase()} · ${seg.label}` : seg.label) : '';
  if (screen === 'scramble' && scramble?.moves?.length) {
    const move = scramble.moves.find(item => item.state === 'current') ?? scramble.moves[scramble.step];
    if (move) {
      const description = describeMove(move.text, held ?? undefined);
      const count = `move ${Math.min(scramble.step + 1, scramble.total)} of ${scramble.total}`;
      return {
        text: '0.00', ms: null, startedAt: null, running: false, hidden: true, tone: 'text', sub: '',
        // Kept for assistive tech and the recordings; the screen draws `guide` instead (A-02: one glyph, one phrase, one counter).
        stepLine: [{ text: count, tone: 'accent' }, { text: description.text, tone: 'text' }],
        stepTitle: description.display, stepTags: [],
        guide: guideVM(scramble, move, description, count),
      };
    }
  }
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
      sub: `${result.record.moveCount} moves · ${fmtTps(result.record.tps)} tps${live?.record?.timing === 'cube' ? ' · cube clock' : ''}${live?.record?.flags?.length ? ` · ${live.record.flags.join(', ')}` : ''}`, stepLine: [], stepTitle: '', stepTags: [],
    };
  }
  return { text: '0.00', ms: null, startedAt: null, running: false, hidden: false, tone: 'text', sub: '', stepLine: [], stepTitle: '', stepTags: [] };
}

const GLOSS_FACE = { U: 'top', D: 'bottom', R: 'right', L: 'left', F: 'front', B: 'back' };
/** "top face, clockwise" (A-02): a short phrase for the move to turn now. */
export function glossMove(description) {
  const direction = /2/.test(description.notation) ? 'half turn' : /['′]/.test(description.notation) ? 'counter-clockwise' : 'clockwise';
  if (description.kind === 'face') return `${GLOSS_FACE[description.reference]} face, ${direction}`;
  if (description.kind === 'wide') return `${GLOSS_FACE[description.reference]} two layers, ${direction}`;
  if (description.kind === 'slice') return `middle layer, ${direction}`;
  return `rotate the cube, ${direction}`;
}

/** What the guidance block under the cube shows: the glyph, one phrase (two when a turn was wrong) and the counter. */
function guideVM(scramble, move, description, count) {
  if (scramble.recovery?.length) {
    const way = scramble.recovery.map(item => item.text);
    return {
      wrong: true, glyph: displayMove(way[0]),
      lines: [{ text: `turn ${way.map(displayMove).join(' ')} to fix it`, tone: 'warn' }, { text: `then carry on with ${displayMove(move.text)}`, tone: 'dim' }],
      count,
    };
  }
  return { wrong: false, glyph: description.display, lines: [{ text: glossMove(description), tone: 'dim' }], count };
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
    let way;
    try { way = recoveryMoves(detour, held?.bottom ?? 'D', held?.front ?? 'F'); }
    catch (error) {
      // Never leave the user stuck without a way back: log it and fall back to the plain
      // inverse of the detour (the canonical frame, which is right for the default hold).
      logConnection({ label: `recovery cue failed, using the plain inverse: ${error?.message || error}`, detour: detour.slice(), held });
      way = detour.slice().reverse().map(inverseMove);
    }
    recovery = way.map((m, i) => ({ key: `r${i}`, text: m, state: i === 0 ? 'current' : 'todo' }));
  }
  const busy = ['applying', 'solving', 'done'].includes(live?.phase);
  return {
    source: settings.scramble,
    moves: moves.map((m, i) => ({ key: `s${i}`, text: m, state: !applying ? 'todo' : i < step ? 'done' : i === step ? 'current' : 'todo' })),
    recovery,
    wrongTurn: detour.length ? detour[0] : null,
    detour: detour.slice(),
    pendingDouble: applying ? live.applyPendingDouble ?? null : null,
    held: held ? { bottom: held.bottom, front: held.front } : null,
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

function canonicalCase(kind, value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let row = getCase(raw.startsWith(`${kind}/`) ? raw : `${kind}/${raw}`);
  // Older summaries stored a human label in ollCase.id (for example
  // "OLL 1 Dot"). Resolve only a numbered label that exists in the curated
  // case library; arbitrary labels never become URLs.
  if (!row && kind === 'oll') {
    const match = raw.match(/^OLL\s*(\d+)(?:\s|$)/i);
    if (match) row = getCase(`oll/${match[1]}`);
  }
  return row?.set === kind ? row : null;
}

function storedF2lCase(record, stageKey) {
  const source = record.analysis?.caseMetadata?.f2lCases ?? record.analysis?.f2lCases ?? record.analysis?.pairs;
  const match = Array.isArray(source)
    ? source.find((row, index) => (row.stage ?? row.key ?? `pair${index + 1}`) === stageKey)
    : source?.[stageKey];
  const row = canonicalCase('f2l', match?.caseId ?? match?.case?.id);
  if (!row) return null;
  return {
    kind: 'f2l', id: row.id.slice('f2l/'.length), name: String(match.name ?? match.case?.name ?? row.name), targetPair: row.targetPair,
    recognitionMs: match.recognitionMs ?? null, executionMs: match.executionMs ?? null,
    usedAlg: match.used?.id ?? match.usedAlg ?? null,
  };
}

/** Build the exact result data rendered by the solve and history pages.
 * `record` may be the current live result or any stored solve.
 */
export function buildResultsViewModel({ record: inputRecord, live = null, records = [], settings, plan, track = null, optimalCross = null, reviewUi = {}, pins = [], analysisStatus = 'none' }) {
  const normalizeRecord = value => {
    if (!value || !value.analysis || typeof value.analysis !== 'object' || Array.isArray(value.analysis)) return value;
    const version = [1, 2, 3, 4].includes(value.analysis.v) ? value.analysis.v : 1;
    const analysis = cleanAnalysis({ ...value.analysis, v: version });
    const caseMetadata = {};
    if (value.analysis.f2lCases != null) caseMetadata.f2lCases = value.analysis.f2lCases;
    if (value.analysis.lastLayer && typeof value.analysis.lastLayer === 'object') {
      caseMetadata.lastLayer = Object.fromEntries(['oll', 'pll'].flatMap(stage => {
        const row = value.analysis.lastLayer[stage];
        if (!row || typeof row !== 'object') return [];
        const safe = {};
        if (typeof row.caseId === 'string') safe.caseId = row.caseId.slice(0, 40);
        if (typeof row.name === 'string') safe.name = row.name.slice(0, 80);
        for (const field of ['recognitionMs', 'executionMs']) if (Number.isFinite(row[field]) && row[field] >= 0) safe[field] = row[field];
        if (typeof row.used?.id === 'string') safe.usedAlg = row.used.id.slice(0, 100);
        return Object.keys(safe).length ? [[stage, safe]] : [];
      }));
    }
    if (Object.keys(caseMetadata).length) analysis.caseMetadata = caseMetadata;
    return { ...value, analysis };
  };
  const record = normalizeRecord(inputRecord ?? live?.record);
  if (!record) return null;
  records = records.map(normalizeRecord);
  const stored = records.find(r => r.at === record.at) ?? record;
  // Comparisons (vs average, vs PB, the strip, the session) stay within this solve's focus.
  records = inFocus(records, focusOf(stored));
  const penalty = settings.penalties === 'ignore' ? null : stored.penalty ?? null;
  const shown = { ...stored, penalty };
  const ms = resultMs(shown);
  const others = records.filter(r => r.at !== stored.at);
  const averages = stageAverages(others, plan);
  const pbs = pbSplits(others, plan);
  const recordTrack = live?.record?.at === stored.at ? track : null;
  const { stages, solveStartAt, moveTimes } = recordStages(stored, recordTrack, plan);
  const reviewState = {
    ...reviewUi,
    variant: reviewUi.variant ?? reviewUi.detail?.variant,
    cursor: reviewUi.cursor ?? reviewUi.detail?.cursor,
  };
  const review = reviewVM({ stored, stages, solveStartAt, plan, averages, others, focus: focusOf(stored), crossColor: settings.crossColor, ui: reviewState, pins, analysisStatus, durationMs: stored.solveMs });
  const lastLayer = stored.analysis?.caseMetadata?.lastLayer ?? stored.analysis?.lastLayer ?? {};
  const caseLinks = {};
  const oll = canonicalCase('oll', lastLayer.oll?.caseId ?? stored.analysis?.ollCase?.id ?? (typeof stored.ollCase === 'string' ? stored.ollCase : stored.ollCase?.id));
  const pll = canonicalCase('pll', lastLayer.pll?.caseId ?? stored.analysis?.pllCase?.id ?? (typeof stored.pllCase === 'string' ? stored.pllCase : stored.pllCase?.id));
  if (oll) caseLinks.oll = { kind: 'oll', id: oll.id.slice('oll/'.length), name: lastLayer.oll?.name ?? oll.name, recognitionMs: lastLayer.oll?.recognitionMs ?? stored.ollRecognitionMs ?? stored.analysis?.ollCase?.recognitionMs ?? null, executionMs: lastLayer.oll?.executionMs ?? stored.ollExecutionMs ?? stored.analysis?.ollCase?.executionMs ?? null, usedAlg: lastLayer.oll?.usedAlg ?? lastLayer.oll?.used?.id ?? null };
  if (pll) caseLinks.pll = { kind: 'pll', id: pll.id.slice('pll/'.length), name: lastLayer.pll?.name ?? pll.name, recognitionMs: lastLayer.pll?.recognitionMs ?? stored.pllRecognitionMs ?? stored.analysis?.pllCase?.recognitionMs ?? null, executionMs: lastLayer.pll?.executionMs ?? stored.pllExecutionMs ?? stored.analysis?.pllCase?.executionMs ?? null, usedAlg: lastLayer.pll?.usedAlg ?? lastLayer.pll?.used?.id ?? null };
  for (const stage of plan.filter(item => /^pair\d$/.test(item.key))) {
    const info = storedF2lCase(stored, stage.key);
    if (info) caseLinks[stage.key] = info;
  }
  const avgTotal = averages.totalAvgMs || 1;
  const stageByKey = new Map(stages.map(stage => [stage.key, stage]));
  const timeline = {
    visible: true, currentIndex: plan.length, planKey: plan.map(stage => stage.key).join(','),
    segments: plan.map(stage => {
      const result = stageByKey.get(stage.key), avg = averages.byKey[stage.key], merged = Boolean(result?.merged);
      const skipped = Boolean(result?.skipped), done = Boolean(result?.done);
      const ref = settings.compare === 'pb' ? pbs[stage.key] : settings.compare === 'avg' ? avg.avgMs : null;
      const delta = done && !skipped && !merged && Number.isFinite(ref) && Number.isFinite(result?.ms) ? result.ms - ref : null;
      const linkedCase = /^pair\d$/.test(stage.key) ? caseLinks[stage.key] : stage.key === 'oll' || stage.key === 'co' ? caseLinks.oll : stage.key === 'pll' || stage.key === 'ep' ? caseLinks.pll : null;
      return {
        key: stage.key, label: stage.label, short: stage.short, weight: avg.avgMs / avgTotal,
        avgMs: avg.avgMs, state: skipped ? 'skipped' : done ? 'done' : 'future', fill: done ? 1 : 0,
        skipped, merged, splitMs: done ? result.ms : null,
        splitText: skipped ? 'skip' : merged ? 'with cross' : done ? fmtTime(result.ms) : '',
        delta: delta == null ? null : { ms: delta, text: fmtDelta(delta), tone: deltaTone(delta) },
        moves: done ? result.moves : null, selectable: true, caseKey: /^pair\d$/.test(stage.key) && linkedCase ? stage.key : linkedCase?.kind ?? null,
      };
    }),
    markers: review.markers,
  };
  const prevAo12 = ao12(others);
  const vsAo12 = Number.isFinite(prevAo12) && Number.isFinite(ms) ? { text: fmtDelta(ms - prevAo12), tone: deltaTone(ms - prevAo12) } : null;
  const tpsValues = others.map(r => r.tps).filter(Number.isFinite).sort((a, b) => a - b);
  const avgFlat = tpsValues.length ? tpsValues[Math.floor(tpsValues.length / 2)] : null;
  // The session strip is per session (automatic sessions, see store/sessions.js);
  // records without sessions count as one.
  const inSession = sessionRecords(records, stored.sessionId);
  const sessionOthers = inSession.filter(r => r.at !== stored.at);
  const summary = summarize(inSession);
  const sessionStats = scopeStats(inSession);
  const a5 = ao5(inSession); const a12 = ao12(inSession);
  const prevA5 = ao5(sessionOthers);
  const prevSessionAo12 = ao12(sessionOthers);
  const tones = {
    ao5: Number.isFinite(a5) && Number.isFinite(prevA5) ? deltaTone(a5 - prevA5) : 'none',
    ao12: Number.isFinite(a12) && Number.isFinite(prevSessionAo12) ? deltaTone(a12 - prevSessionAo12) : 'none',
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
      record: stored,
      time: { text: fmtTime(ms), resultText: fmtResult(shown, 'long'), penalty, tone: penalty === 'DNF' ? 'error' : penalty === '+2' ? 'warn' : 'accent' },
      moves: String(stored.moveCount ?? 0),
      tps: fmtTps(stored.tps),
      inspection: Number.isFinite(stored.inspectionMs) ? (stored.inspectionMs / 1000).toFixed(2) : '—',
      method: methodSummary(shown, settings),
      caseLinks,
      timeline: { ...timeline, markers: review.markers },
      vsAo12,
      tpsSeries: tpsSeries(moveTimes, { durationMs: stored.solveMs, stages, solveStartAt, averages, avgFlat }),
      splits: splitRows(stages, plan, averages, { compare: settings.compare, pbs }),
      donut: { centerValue: String(stored.moveCount ?? 0), centerLabel: 'moves', arcs: donutArcs(stages, plan, averages) },
      session: { ao5: fmtTime(a5), ao12: fmtTime(a12), pb: fmtTime(summary.bestSolveMs), mean: fmtTime(summary.meanSolveMs), tones, count: inSession.length, worst: fmtTime(sessionStats.worst), mo3: fmtTime(sessionStats.mo3), ao50: fmtTime(sessionStats.ao50), ao100: fmtTime(sessionStats.ao100) },
      spark: sparkline(records, { currentAt: stored.at }),
      recent: records.slice(-7).reverse().map(r => ({ key: String(r.at), text: fmtResult(r, 'short'), penaltyTag: penaltyTag(r), current: r.at === stored.at })),
      coach: resultsCoach({ record: stored, optimalCross: optimalCross ?? stored.analysis?.cross ?? null, stages, plan, averages, faceColors: FACE_COLORS }),
      review,
    },
  };
}

const resultsVM = input => buildResultsViewModel({ ...input, record: input.live?.record });

// --- Review: markers on the timeline, the selected note, the detail view -------------------------

/** @returns {import('./types.js').ReviewVM} */
function reviewVM({ stored, stages, solveStartAt, plan, averages, others, focus, crossColor = 'neutral', ui = {}, pins = [], analysisStatus = 'none', durationMs }) {
  const baselines = reviewBaselines(others);
  const pending = analysisStatus === 'pending';
  const { markers, defaultId } = buildMarkers({ record: stored, stages, plan, baselines, focus, faceColors: FACE_COLORS, crossColor });
  const selectedId = markers.some(m => m.id === ui.selectedId) ? ui.selectedId : defaultId;
  // Where each marker sits: inside its stage (by time), so the ring and the lane can place it, and on the time axis.
  const rows = new Map(stages.filter(s => s.startAt != null && s.endAt != null).map(s => [s.key, { from: s.startAt - solveStartAt, to: s.endAt - solveStartAt }]));
  const total = Math.max(1, durationMs ?? 0, ...markers.map(m => m.tMs));
  const shown = markers.map(m => {
    const row = rows.get(m.stage);
    const span = row ? row.to - row.from : 0;
    const frac = row && span > 0 ? Math.min(1, Math.max(0, (m.tMs - row.from) / span)) : 0.5;
    return {
      id: m.id, kind: m.kind, tone: m.tone, label: m.label, stage: m.stage, stageLabel: m.stageLabel, seg: m.stage, frac, tMs: m.tMs, tFrac: Math.min(1, m.tMs / total),
      prominent: m.prominent, rank: m.rank, selected: m.id === selectedId, at: m.at, costText: m.evidenceText ?? (m.tone === 'good' ? `estimated saving: ~${Math.round(m.cost)} moves` : `~${Math.max(1, Math.round(m.rawCost ?? m.cost))} lost`),
    };
  });
  const selected = markers.find(m => m.id === selectedId) ?? null;
  const detail = ui.detail ? buildDetail({ ...ui.detail, record: stored, markers, rows: stages.map(s => ({ ...s, label: plan.find(p => p.key === s.key)?.label })), plan, averages, baselines, pending, pins, cursor: ui.cursor, variant: ui.variant }) : null;
  const selectedPin = selected && detail === null ? buildDetail({ kind: 'marker', key: selected.id, record: stored, markers, rows: stages, plan, averages, baselines, pending, pins }) : null;
  const coach = selected ? {
    markerId: selected.id, tag: selected.label, tone: selected.tone, text: selected.note, compare: selected.compare,
    better: selected.better ? `yours ${selected.better.yours.length} · better ${selected.better.moves.length}` : null,
  } : {
    markerId: null, tag: pending || analysisStatus === 'partial' ? 'review' : 'clean', tone: pending || analysisStatus === 'partial' ? 'info' : 'good',
    text: pending ? 'reviewing this solve…' : analysisStatus === 'partial' ? 'first pass ready · checking pair options…' : analysisStatus === 'done' ? 'Nothing to flag. Clean solve.' : 'No review for this solve.', compare: null, better: null,
  };
  const pinSource = detail?.pin ?? selectedPin?.pin ?? { available: false, pinned: false, payload: null, trainer: null };
  return {
    status: analysisStatus,
    markers: shown, selectedId, coach, detail,
    focus,
    pin: { available: pinSource.available, pinned: pinSource.pinned, trainer: pinSource.trainer, count: pins.length, payload: pinSource.payload },
  };
}

// One scope (all time or one session) as display strings; '—' until an
// average has enough solves, 'DNF' when it is one.
function scopeVM(records) {
  const st = scopeStats(records);
  const flow = flowStats(records);
  const learning = learningStats(records);
  const fixed = (n, digits) => (Number.isFinite(n) ? n.toFixed(digits) : '—');
  return {
    solves: String(st.count),
    best: fmtSeconds(st.best),
    worst: fmtSeconds(st.worst),
    mean: fmtSeconds(st.mean),
    mo3: fmtSeconds(st.mo3),
    ao5: fmtSeconds(st.ao5),
    ao12: fmtSeconds(st.ao12),
    ao50: fmtSeconds(st.ao50),
    ao100: fmtSeconds(st.ao100),
    pb: { mo3: fmtSeconds(st.bestMo3), ao5: fmtSeconds(st.bestAo5), ao12: fmtSeconds(st.bestAo12), ao50: fmtSeconds(st.bestAo50), ao100: fmtSeconds(st.bestAo100) },
    // Flow: steady TPS, few pauses. gapCv is the spread of the gaps between moves as a percentage of their mean.
    flow: {
      meanTps: fmtTps(flow.meanTps), tpsStd: fixed(flow.tpsStd, 2),
      gapCv: Number.isFinite(flow.gapCv) ? `${Math.round(flow.gapCv * 100)}%` : '—',
      pauses: flow.pauses == null ? '—' : String(flow.pauses), pausesPerSolve: fixed(flow.pausesPerSolve, 1),
    },
    // Learning: move count; reviewAccuracy waits for the solve review (src/analysis) to score solves.
    learning: {
      meanMoves: fixed(learning.meanMoves, 1), medianMoves: fixed(learning.medianMoves, 0), bestMoves: fixed(learning.bestMoves, 0),
      reviewAccuracy: Number.isFinite(learning.reviewAccuracy) ? `${Math.round(learning.reviewAccuracy)}%` : '—',
    },
  };
}

// Every statistic is computed within one focus (speed, flow or learning) so a slow
// learning solve never spoils a speed average. The top-level fields describe the
// active focus; `byFocus` has all three; `mixed` is the explicit all-foci view.
function statsVM(all, focus) {
  const active = normalizeFocus(focus);
  const byFocus = {};
  for (const f of FOCI) {
    const recs = inFocus(all, f);
    byFocus[f] = { allTime: scopeVM(recs), session: scopeVM(sessionRecords(recs, currentSessionId(recs))) };
  }
  const records = inFocus(all, active);
  const s = summarize(records);
  const here = byFocus[active];
  return {
    focus: active,
    solves: String(s.solvedCount ?? 0),
    best: fmtSeconds(s.bestSolveMs),
    ao5: fmtSeconds(ao5(records)),
    ao12: fmtSeconds(ao12(records)),
    medianTps: s.medianTPS?.toFixed(2) ?? '—',
    medianMoves: s.medianMoveCount != null ? String(s.medianMoveCount) : '—',
    worst: here.allTime.worst, mo3: here.allTime.mo3, ao50: here.allTime.ao50, ao100: here.allTime.ao100, pb: here.allTime.pb,
    allTime: here.allTime,
    session: here.session,
    byFocus,
    mixed: { mixed: true, ...scopeVM(all) },
  };
}

// --- Build ----------------------------------------------------------------------------------

/**
 * @param {{session:Object, live:Object, records:Object[], settings:Object, track?:Object, optimalCross?:Object|null,
 *   coach?:import('./types.js').CoachLine[], error?:string, status?:string|null, theme?:'dark'|'light',
 *   supported?:boolean, now?:number, held?:{bottom:string, front:string}, scrambleText?:string,
 *   settingsOpen?:boolean, themePreference?:'light'|'dark'|'system', debugOpen?:boolean, connectStep?:string, commandOpen?:boolean, scrambleNumber?:number, toast?:{text:string, tone:string}|null,
 *   dShift?:number|null, caseChoice?:string|null}} input
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
  const scramble = scrambleVM({ live, settings, scrambleText: input.scrambleText, held: input.held, number: input.scrambleNumber });
  const plan = cached('plan', [settings.method, settings.oll, settings.pll], () => buildStagePlan(settings));
  const activeFocus = normalizeFocus(settings.session?.focus);
  const sourceRecords = cached('sourceRecords', [records, settings.stats?.source], () => inStatsSource(records, settings.stats?.source));
  const focusRecords = cached('focusRecords', [sourceRecords, activeFocus], () => inFocus(sourceRecords, activeFocus));
  // On the results the pace map and the deltas compare this solve with the others, not with itself.
  const reviewedAt = screen === 'results' ? live?.record?.at ?? null : null;
  const paceRecords = cached('paceRecords', [focusRecords, reviewedAt], () => (reviewedAt == null ? focusRecords : focusRecords.filter(r => r.at !== reviewedAt)));
  const averages = cached('averages', [paceRecords, plan], () => stageAverages(paceRecords, plan));
  const pbs = cached('pbs', [paceRecords, plan], () => pbSplits(paceRecords, plan));
  const dShift = input.dShift !== undefined ? input.dShift
    : (screen === 'solving' && settings.f2l === 'pseudo' && session?.state && live?.crossFace ? currentDShift(session.state, live.crossFace) : null);
  const timeline = timelineVM({ screen, settings, plan, averages, pbs, track, live, now, prevTimeline: prev?.timeline, dShift });
  const result = screen === 'results'
    ? cached('results', [live?.record, sourceRecords, settings.penalties, settings.compare, settings.crossColor, plan, track?.stamps?.solvedAt, optimalCross, input.reviewUi, input.pins, input.analysisStatus], () => resultsVM({ live, records: sourceRecords, settings, plan, track, optimalCross, reviewUi: input.reviewUi, pins: input.pins ?? [], analysisStatus: input.analysisStatus ?? 'none' }))
    : null;
  const device = cached('device', [session?.phase, session?.detail, session?.deviceName, session?.protocol, session?.battery, Boolean(session?.gyro), input.supported ?? true, input.connectStep ?? '', session?.link?.status, live?.phase, live?.interrupted?.canResume], () => deviceFor(session, input.supported ?? true, input.connectStep ?? '', live));
  const themePreference = input.themePreference ?? 'system';
  const settingsPanel = cached('settingsPanel', [settings, Boolean(input.settingsOpen), themePreference], () => buildSettingsPanel(settings, Boolean(input.settingsOpen), themePreference));
  const configBar = cached('configBar', [settings], () => buildConfigBar(settings));
  const stats = cached('stats', [sourceRecords, activeFocus], () => statsVM(sourceRecords, activeFocus));
  const keys = cached('keys', [screen, settings.timer, settings.coach, settings.style], () => keyHints(screen, { timerHidden: settings.timer === 'hide', coach: settings.coach, style: settings.style }));
  const todayKey = new Date().toDateString();
  const calloutText = screen === 'solving' && timeline.segments.some(segment => segment.state === 'current' && segment.tags?.includes('pseudo')) ? 'pseudo pair, nice' : '';
  const chrome = cached('chrome', [screen, settings, focusRecords, scramble?.source, scramble?.recovery ? 1 : 0, result?.record, todayKey, activeFocus, calloutText], () => chromeVM({ screen, settings, records: focusRecords, scramble, result, todayKey, focus: activeFocus, callout: calloutText }));
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
    scramble,
    clock: clockVM({ screen, live, settings, now, timeline, result, scramble, held: input.held }),
    inspection: inspectionVM(live, now, optimalCross, averages),
    timeline,
    coach,
    results: result?.vm ?? null,
    stats,
    keys,
    chrome,
    toast: input.toast ?? null,
    status: input.status ?? (live?.phase === 'interrupted'
      ? `Connection lost. Your solve is paused. ${live.interrupted.canResume ? 'The cube is back. Resume.' : device.detail}`
      : live?.notice && screen === 'disconnected' ? live.notice
        : screen === 'disconnected' && device.actions.connect && !device.failed ? 'Connect a cube from the header to start a solve.' : device.detail),
    error: input.error ?? '',
    chromeDimmed: ['scramble', 'inspection', 'ready', 'solving'].includes(screen),
    commandOpen: Boolean(input.commandOpen),
    debugOpen: Boolean(input.debugOpen),
    caseChoice: input.caseChoice ?? null,
  };
  // Keep identity for slices that did not change, so components can skip them.
  if (prev) {
    for (const key of ['scramble', 'clock', 'inspection', 'timeline']) if (deepEqual(vm[key], prev[key])) vm[key] = prev[key];
  }
  next.inspectionConfig = live?.inspectionConfig ?? null;
  MEMO.set(vm, next);
  return vm;
}

// --- Chrome around the stage (the frames' bottom corners) ----------------------------------

const lookLabel = value => (value === '1look' ? '1-look' : '2-look');
/**
 * Texts the approved frames draw in the page corners: the config line (idle, bottom left) and the stats lines (idle,
 * bottom right); on the other screens a one-line note replaces the stats ("guided · follow the lit face", the inspection
 * rule, "solve 23 · today 17:33 · speed · cube").
 * @returns {{configLine:string, stats:{line1:string, line2:string}, note:string}}
 */
function chromeVM({ screen, settings, records, scramble, result, todayKey, focus, callout = '' }) {
  const parts = [settings.method];
  if (settings.method === 'cfop') {
    parts.push(settings.oll === settings.pll ? lookLabel(settings.oll) : `oll ${lookLabel(settings.oll)} · pll ${lookLabel(settings.pll)}`);
    if (settings.f2l === 'pseudo') parts.push('pseudo pairs');
  }
  const inspection = settings.inspection;
  parts.push(inspection.mode === 'off' ? 'no inspection' : inspection.mode === 'unlimited' ? 'unlimited inspection' : inspection.mode === 'custom' ? `${inspection.seconds}s inspection` : 'wca inspection');
  const today = records.filter(record => record?.at != null && new Date(record.at).toDateString() === todayKey).length;
  const stats = {
    line1: `ao5 ${fmtTime(ao5(records))} · ao12 ${fmtTime(ao12(records))} · pb ${fmtTime(summarize(records).bestSolveMs)}`,
    line2: `${today} ${today === 1 ? 'solve' : 'solves'} today`,
  };
  let note = '';
  if (screen === 'scramble') note = scramble?.source === 'paste' ? 'pasted scramble · follow the lit face' : 'guided · follow the lit face';
  else if (screen === 'inspection') {
    const secs = inspection.mode === 'custom' ? inspection.seconds : 15;
    note = inspection.mode === 'off' ? '' : inspection.mode === 'unlimited' ? 'start any time. the clock starts on your first turn'
      : inspection.overtime === 'wca' || inspection.mode === 'wca' ? `start any time. +2 after ${secs}, DNF after ${secs + 2}` : `start any time. ${secs} s of inspection`;
  } else if (screen === 'results' && result?.record) {
    const at = new Date(result.record.at);
    const when = at.toDateString() === todayKey ? 'today' : at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    note = `solve ${records.length} · ${when} ${clock} · ${focus} · cube`;
  }
  return { configLine: parts.join(' · '), stats, note, callout };
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
