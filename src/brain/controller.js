// Brain v2 controller: every side effect of the Brain view. It owns the
// subscriptions (smart-cube session, live tracker, connection log), the 3D
// cube mirror, the solve store, settings, the recording/replay wiring, the
// keyboard, the theme observer and the per-frame loop, and turns them into a
// BrainVM (view-model.js) that the shell and the style components render.
// Behaviour is ported from the v1 src/brain.js; the DOM lives in shell.js.

import { Cube } from '../ui/cube/index.js';
import { FACE_COLORS, toRenderData, applyMoves, createSolvedState } from '../cross-cube.js';
import { stateAfter } from '../review/replay.js';
import { analysisInputFromRecord } from '../analysis/record.js';
import { createSolveLive } from '../solve-live.js';
import { crossSuggestion, crossHindsight, f2lNextPairHint, ollStage, pllLens, efficiencyScore } from '../solve-coach.js';
import { openHistory } from '../store/history.js';
import { createRoundStore } from '../drills/rounds.js';
import { SOLVE_STORE_KEY } from '../solve-metrics.js';
import { exportAll, serializeExport, parseImport, importAll, historyFromImport, pinsFromImport, algorithmsFromImport } from '../data-port.js';
import { algDatabase } from '../algs/runtime.js';
import { subscribeConnection, clearConnectionLog, getConnectionLog, logConnection } from '../smart-cube-diag.js';
import { clearSavedCubeData } from '../smart-cube-bluetooth.js';
import { recordLiveCalls, recordRead, recordAsyncRead, replaySpeed, isReplaying, record, now as recorderNow } from '../recorder.js';
import { attachBrainRecording } from '../brain-recording.js';
import { MSG } from '../copy/terms.js';
import { loadSettings, saveSettings, setSetting, parseCommand, withVoiceCalloutStatus } from './settings.js';
import { createVoiceCallouts } from '../goals/voice-callouts.js';
import { buildStagePlan, xcrossLabel } from './stage-plan.js';
import { createTrack, trackMilestones, splitsFromTrack, stageProgress } from './milestones.js';
import { buildViewModel, frameState } from './view-model.js';
import { coachLines } from './coach-lines.js';
import { resolveKey } from './keys.js';
import { fmtSeconds, fmtResult } from './format.js';
import { getThemePreference, setThemePreference, THEME_EVENT } from '../theme.js';

// Dev-server-only features (Send to dev) are compiled out of production builds.
const DEV = Boolean(import.meta.env?.DEV);

const LENSES = { crossHindsight, f2lNextPairHint, ollStage, pllLens, efficiencyScore, faceColors: FACE_COLORS };
const TIMING_SCREENS = new Set(['inspection', 'ready', 'solving']);
const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
// UI actions recorded for replay. Start/cancel and the pseudo/inspection
// settings are already recorded at the live-tracker seam (live.call).
const RECORDED = new Set(['setSetting', 'setStyle', 'toggleTimer', 'cycleCoach', 'setPenalty', 'togglePenalty', 'deleteSolve', 'undoDelete']);
const LIVE_RECORDED_PATHS = /^(f2l|inspection)(\.|$)/;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Mount one Brain view. `createShell(root, {dispatch})` builds the DOM,
 * `loadStyle(id)` resolves a StyleModule, `rebuild()` replaces this view.
 */
export function mountBrainController(root, cubeSession, { createShell, loadStyle, rebuild }) {
  let settings = loadSettings(globalThis.localStorage);
  // The solve history lives in IndexedDB (src/store/history.js) and opens asynchronously; until
  // it is ready `records` is empty and history writes wait in `pendingHistory`.
  let records = [];
  let history = null;
  let pendingHistory = [];
  const undoStack = [];         // solves deleted in this view, newest last (undoDelete)
  let active = true;
  let detached = false;
  let vm = null;
  let track = createTrack();
  let skips = [];               // { kind, label } hurrahs this solve (for the toast)
  let toast = null;
  let toastTimer = 0;
  let optimalCross = null;      // {face, length} from crossSuggestion during inspection
  let pendingSuggestion = null;
  let suggestionRequest = 0;
  let savedRecord = null;       // the live record already appended to the solve store
  let scrambleText = '';
  let lastScramble = '';
  let scrambleLoad = null;
  let settingsOpen = false;
  let debugOpen = false;        // the debug drawer (connection log, recordings, coach switches, data)
  let commandOpen = false;      // one-shot: the next render asks the shell to focus the command line
  let scrambleNumber = 0;       // scrambles started in this view
  let error = '';
  let connectStep = '';         // the latest step of a running connection attempt (session detail or connection log)
  let connectLogFrom = 0;       // connection-log length when the attempt began
  let statusOverride = null;    // a message() until the connection status next changes
  let replayBackup = null;      // settings before a replay changed them (restored after)
  let generating = false;
  let lastGyro = null;
  let lastStatusKey = '';
  let lastSessionLogLabel = '';
  let lastMirroredMove = null;
  let lastMirroredLen = 0;
  let lastMirroredSeq = cubeSession.getSnapshot().moveEvent?.seq ?? null; // don't replay a turn made before mount
  let lastMirroredState = null;
  let snapshots = [];           // cube snapshots at stage transitions (end-of-solve review)
  let lastCapturedStage = -1;
  let raf = 0;
  let activationToken = 0;
  let styleToken = 0;
  // Solve review: the selected marker, the open detail (a stage or a marker), the cube position it shows,
  // and whether the cube is held on a review position instead of mirroring the real cube.
  const NO_REVIEW = { selectedId: null, detail: null, cursor: null, variant: 'yours' };
  let reviewUi = NO_REVIEW;
  let caseChoice = null;
  let reviewHold = false;
  let playToken = 0;
  const analysisState = new Map();   // record.at -> 'pending' | 'done' | 'none'
  const NO_PINS = [];

  const shell = createShell(root, { dispatch });
  const voiceCallouts = createVoiceCallouts();
  const $ = selector => root.querySelector(selector);
  const brainEl = () => root.querySelector('.brain') ?? root;
  const theme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

  let cube = null;
  try { cube = new Cube(shell.slots.cube, { mode: 'live', state: cubeSession.getSnapshot().state ?? createSolvedState(), size: 'XL', label: 'Live solve cube' }); }
  catch { shell.slots.cube.textContent = 'Solve needs WebGL. Enable hardware acceleration or try another browser.'; }
  shell.setCube?.(cube);   // the move guide plays its ghost on this cube

  // Recorded seam: start/cancel/settings calls (with the exact scramble), the
  // held-orientation reads and the clock are captured for deterministic replay.
  const live = recordLiveCalls(createSolveLive(cubeSession, {
    now: recorderNow,
    getOrientation: () => recordRead('orientation', () => (cube?.cube?.getHeldFaces?.() ?? { bottom: 'D', front: 'F' })),
  }));
  live.setPseudo(settings.f2l === 'pseudo');
  live.setInspection(settings.inspection);

  // --- Rendering -------------------------------------------------------------------------

  function render() {
    if (detached) return;
    const liveSnap = live.getSnapshot();
    const session = cubeSession.getSnapshot();
    const coach = coachLines({ live: liveSnap, state: session.state, toggles: settings.toggles, optimalCross, xcross: xcrossLabel(track.stamps.xPairs), coach: settings.coach }, LENSES);
    const next = buildViewModel({
      session, live: liveSnap, records, settings, track, optimalCross, coach, error,
      status: statusOverride, theme: theme(), supported: Boolean(window.isSecureContext && navigator.bluetooth?.requestDevice),
      now: recorderNow(), held: liveSnap.phase === 'applying' ? cube?.cube?.getHeldFaces?.() : null,
      scrambleText, scrambleNumber, settingsOpen, themePreference: getThemePreference(), debugOpen, connectStep, commandOpen, toast,
      reviewUi, caseChoice, pins: history?.pins.list ?? NO_PINS, analysisStatus: analysisState.get(currentAt()) ?? 'none',
    }, vm);
    next.settings = withVoiceCalloutStatus(next.settings, voiceCallouts.status());
    commandOpen = false;
    const prev = vm;
    vm = next;
    voiceCallouts.update({ callout: next.inspection?.callout, enabled: settings.voice, calloutsEnabled: settings.inspection.callouts });
    shell.update(next, prev);
    renderToggles();
    ensureLoop();
  }

  // Coach lens switches (#brain-toggles): the controller owns them.
  let paintedToggles = null;
  function renderToggles() {
    const box = $('#brain-toggles');
    if (!box || paintedToggles === settings.toggles) return;
    paintedToggles = settings.toggles;
    const entries = Object.entries(settings.toggles);
    const labels = {
      crossSuggest: 'cross hint', f2lHint: 'next pair hint', pllLens: 'PLL cue',
      ollStage: 'OLL stages', rotationFlag: 'rotation flag', efficiencyScore: 'efficiency', autoCross: 'auto cross',
    };
    if (box.querySelectorAll('[data-brain-toggle]').length !== entries.length) {
      box.innerHTML = entries.map(([key]) => `<label class="brain-toggle"><input type="checkbox" data-brain-toggle="${key}"><span>${labels[key] ?? key}</span></label>`).join('');
    }
    for (const [key, value] of entries) { const input = box.querySelector(`[data-brain-toggle="${key}"]`); if (input && input.checked !== value) input.checked = value; }
  }
  const onToggleChange = event => {
    const input = event.target.closest?.('[data-brain-toggle]');
    if (input && root.contains(input)) dispatch({ type: 'setSetting', path: `toggles.${input.dataset.brainToggle}`, value: input.checked });
  };
  root.addEventListener('change', onToggleChange);

  function ensureLoop() {
    if (raf || detached || !active || !vm || !TIMING_SCREENS.has(vm.screen)) return;
    raf = requestAnimationFrame(tick);
  }
  function tick() {
    raf = 0;
    if (detached || !active || !vm || !TIMING_SCREENS.has(vm.screen)) return;
    shell.frame?.(frameState(vm, recorderNow()));
    ensureLoop();
  }

  function showError(text) { error = text || ''; render(); }
  function message(text) { statusOverride = text; render(); }
  function showToast(text) {
    toast = { text, tone: 'info' };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast = null; render(); }, 2500);
  }

  // --- Cube mirror -------------------------------------------------------------------------

  // Cube owns theme-aware rendering and the page's sole WebGL canvas.
  function retheme() {
    const state = cubeSession.getSnapshot().state;
    if (state) cube?.setState(state);
  }

  // Animate a mirrored turn. A fast replay shortens the animation so the cube
  // keeps up; an instant replay shows only the latest state, once per frame
  // (every cube.update renders the scene, and hundreds queued back to back
  // stall the page for seconds).
  let instantState = null;
  let instantFrame = 0;
  function showInstantState() {
    instantFrame = 0;
    const state = instantState;
    instantState = null;
    if (state && !detached) cube?.setState(state);
  }
  function showState(state) {
    if (replaySpeed() === 0) {
      instantState = state;
      if (!instantFrame) instantFrame = requestAnimationFrame(showInstantState);
      return;
    }
    if (instantFrame) { cancelAnimationFrame(instantFrame); instantFrame = 0; instantState = null; }
    cube?.setState(state);
  }
  function mirrorTurn(move, state) {
    const speed = replaySpeed();
    if (speed === 0) { showState(state); return; }
    if (instantFrame) showInstantState();
    cube?.queueLiveMove(move, state, { speed: speed ?? 1 });
  }

  function onSession(snapshot) {
    if (detached) return;
    // Log EVERY snapshot before any phase guard, so a desync-causing move is captured.
    // Gyro/battery-only snapshots repeat the same line many times a second; log each distinct line once.
    const sessionLogLabel = `session: phase=${snapshot.phase} moves=${snapshot.moves?.length ?? '-'} lastMove=${snapshot.lastMove ?? '-'} detail=${snapshot.detail ?? '-'} `;
    if (sessionLogLabel !== lastSessionLogLabel) { lastSessionLogLabel = sessionLogLabel; logConnection({ label: sessionLogLabel, kind: 'debug' }); }
    const gyro = snapshot.protocol?.startsWith('GAN') ? snapshot.gyro : null;
    if (gyro !== lastGyro) { cube?.cube?.setGyroOrientation(gyro); lastGyro = gyro; }
    if (snapshot.phase === 'connecting') connectStep = snapshot.detail || connectStep;
    else connectStep = '';
    const key = [snapshot.phase, snapshot.detail, snapshot.deviceName, snapshot.protocol, Boolean(gyro), snapshot.battery].join('|');
    let changed = false;
    if (key !== lastStatusKey) { lastStatusKey = key; statusOverride = null; changed = true; }
    if (snapshot.phase !== 'tracking') {
      lastMirroredMove = null; lastMirroredLen = 0; lastMirroredState = null;
    } else if (reviewHold) {
      // A review position is on the cube: keep the bookkeeping, show the real cube again when it closes.
      lastMirroredSeq = snapshot.moveEvent?.seq ?? lastMirroredSeq;
      lastMirroredState = snapshot.state;
    } else if (snapshot.moveEvent !== undefined) {
      // Sessions bump moveEvent.seq on every applied turn (a coalesced double has
      // replaces:true and `turn` is the quarter just applied). A state replaced
      // without a turn (sync to a solved baseline) is shown without animation.
      const event = snapshot.moveEvent;
      if (event && event.seq !== lastMirroredSeq) {
        lastMirroredSeq = event.seq;
        mirrorTurn(event.turn ?? event.move, snapshot.state);
        changed = true;
      } else if (snapshot.state !== lastMirroredState) {
        showState(snapshot.state);
        changed = true;
      }
      lastMirroredState = snapshot.state;
    } else {
      // Older sessions (the replay harness) fall back to the history length + last entry.
      const lastEntry = snapshot.moves[snapshot.moves.length - 1];
      if (snapshot.moves.length !== lastMirroredLen || lastEntry !== lastMirroredMove) {
        lastMirroredLen = snapshot.moves.length;
        lastMirroredMove = lastEntry;
        if (lastEntry) mirrorTurn(lastEntry, snapshot.state);
        else showState(snapshot.state);
        changed = true;
      }
    }
    if (changed && active) render();
  }

  // --- Cross suggestion (async, during inspection) -------------------------------------------
  async function suggestCrossFor(scramble) {
    const request = ++suggestionRequest;
    if (!settings.toggles.crossSuggest || settings.crossHint === 'off' || !scramble) { optimalCross = null; return; }
    pendingSuggestion = scramble;
    try {
      const color = settings.crossColor;
      const result = await recordAsyncRead(`brain.crossSuggestion:${scramble}:${color}`, () => crossSuggestion(scramble, { extended: false, timeLimitMs: 1500, color }));
      if (request !== suggestionRequest || pendingSuggestion !== scramble || detached) return;
      optimalCross = result.best ? { ...result.best, best: result.best, bestXcross: result.bestXcross } : null;
      render();
    } catch { if (request === suggestionRequest) optimalCross = null; }
  }

  // --- Live tracker ---------------------------------------------------------------------------

  function captureSnapshot(label) {
    const state = cubeSession.getSnapshot().state;
    if (!state) return;
    snapshots.push({ label, at: Date.now(), render: toRenderData(state) });
    snapshots = snapshots.slice(-12);
  }

  function onLive(snap) {
    if (detached) return;
    const hadX = track.stamps.xPairs;
    track = trackMilestones(track, snap, recorderNow(), { state: cubeSession.getSnapshot().state });
    if (track.stamps.xPairs > 0 && !(hadX > 0)) showToast(`✦ ${xcrossLabel(track.stamps.xPairs)}`);   // celebrate the opportunity taken
    const skipInfo = snap.progress?.skip;
    if (skipInfo && !skips.some(s => s.kind === skipInfo.kind && s.label === skipInfo.label)) {
      skips.push({ kind: skipInfo.kind, label: skipInfo.label });
      skips = skips.slice(-8);
      showToast(`✦ ${skipInfo.kind} skip`);
    }
    // Capture a cube snapshot at each stage transition for the end-of-solve review,
    // labelled with the stage just completed.
    const plan = buildStagePlan(settings);
    const stage = stageProgress(track, plan).currentIndex;
    if (snap.phase !== 'solving' && snap.phase !== 'done') { lastCapturedStage = -1; if (snap.phase === 'idle') snapshots = []; }
    else if (snap.phase === 'solving' && stage !== lastCapturedStage) {
      lastCapturedStage = stage;
      captureSnapshot(stage > 0 ? `${plan[stage - 1].label} done` : 'Start');
    }
    // The tracker re-emits while 'done' (e.g. setting changes), so key the save on
    // the record object: each finished solve is stored exactly once, with its splits.
    if (snap.phase === 'done' && snap.record && snap.record !== savedRecord) {
      savedRecord = snap.record;
      const entry = {
        ...snap.record,
        focus: settings.session.focus,   // a focus change starts a new session (store/sessions.js)
        splits: splitsFromTrack(track, plan),
        moveTimes: [...track.moveTimes],
        config: { method: settings.method, f2l: settings.f2l, oll: settings.oll, pll: settings.pll, inspectionMode: snap.record.inspectionMode ?? settings.inspection.mode },
      };
      const replaying = isReplaying();   // replayed solves stay out of the stored history
      withHistory(store => { if (replaying) store.beginEphemeral(); store.append(entry); });
      if (!replaying) createRoundStore().markActiveDay(entry.at);
      startAnalysis(entry);
      statusOverride = `Solve saved · ${fmtSeconds(snap.record.solveMs)} · ${snap.record.moveCount} moves.`;
    }
    // Leaving the results (a new scramble, cancel) puts the real cube back.
    if (snap.phase !== 'done' && (reviewHold || reviewUi !== NO_REVIEW)) closeReview();
    if (active) render();
  }

  // --- Solve review -------------------------------------------------------------------------------
  // The finished solve is analysed in a Web Worker (src/analysis), once, and the compact summary is
  // stored on the record; the markers, the detail view and the pins are built from that.

  function startAnalysis(entry) {
    const at = entry.at;
    if (!analysisInputFromRecord(entry).input) { analysisState.set(at, 'none'); return; }
    analysisState.set(at, 'pending');
    const saveSummary = summary => {
      if (!summary || detached) return;
      withHistory(store => { store.update(at, {
        analysis: summary,
        ollCase: summary.lastLayer?.oll?.caseId ?? summary.ollCase?.id ?? entry.ollCase ?? null,
        pllCase: summary.lastLayer?.pll?.caseId ?? summary.pllCase?.id ?? entry.pllCase ?? null,
        ollRecognitionMs: summary.lastLayer?.oll?.recognitionMs ?? entry.ollRecognitionMs ?? null,
        ollExecutionMs: summary.lastLayer?.oll?.executionMs ?? entry.ollExecutionMs ?? null,
        pllRecognitionMs: summary.lastLayer?.pll?.recognitionMs ?? entry.pllRecognitionMs ?? null,
        pllExecutionMs: summary.lastLayer?.pll?.executionMs ?? entry.pllExecutionMs ?? null,
      }); });
    };
    void import('../analysis/client.js').then(({ analysisClient }) => analysisClient().analyze(entry, {
      onProgress: summary => {
        if (detached || !['pending', 'partial'].includes(analysisState.get(at))) return;
        analysisState.set(at, 'partial');
        saveSummary(summary);
        if (active) render();
      },
    })).catch(() => null).then(summary => {
      if (detached) return;
      analysisState.set(at, summary ? 'done' : 'none');
      saveSummary(summary);
      if (active) render();
    });
  }

  const reviewRecord = () => records.find(r => r.at === currentAt()) ?? live.getSnapshot().record ?? null;
  const replayable = rec => Boolean(rec?.scramble) && Array.isArray(rec.solveMoves) && rec.solveMoves.length === rec.moveCount;
  const positionState = (rec, n) => stateAfter(rec, n);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  /** Show the cube after `n` solve moves (0 = scrambled). The real cube's mirror waits until the review closes. */
  function showPosition(n) {
    const rec = reviewRecord();
    if (!cube || !replayable(rec)) return;
    reviewHold = true;
    playToken++;
    cube.setState(positionState(rec, n));
    reviewUi = { ...reviewUi, cursor: n };
  }

  /** Animate `moves` on the cube from position `from` (yours or the better solution). */
  async function playMoves(from, moves, variant) {
    const rec = reviewRecord();
    if (!cube || !replayable(rec)) return;
    reviewHold = true;
    const token = ++playToken;
    let state = positionState(rec, from);
    cube.setState(state);
    reviewUi = { ...reviewUi, variant, cursor: from };
    render();
    await pause(320);
    for (const move of moves) {
      if (token !== playToken || detached) return;
      state = applyMoves(state, [move]);
      await cube.animateMove(move, state, 380);
      await pause(90);
    }
  }

  function closeReview() {
    playToken++;
    reviewUi = NO_REVIEW;
    if (reviewHold) {
      reviewHold = false;
      const state = cubeSession.getSnapshot().state;
      if (state) showState(state);
    }
  }

  function openDetail(detail) {
    const rec = reviewRecord();
    if (!rec) return;
    reviewUi = { ...reviewUi, detail, variant: 'yours', cursor: null, ...(detail.kind === 'marker' ? { selectedId: detail.key } : {}) };
    render();   // builds the detail (and its start position) for the view-model
    const d = vm?.results?.review?.detail;
    if (d?.replayable) showPosition(d.start);
    render();
  }

  function togglePin() {
    const payload = vm?.results?.review?.pin?.payload;
    if (!payload || !history) return;
    if (history.readOnly) { message('History is read-only right now.'); return; }
    const pinned = history.pins.toggle(payload);
    showToast(pinned ? `pinned · ${history.pins.count}` : `unpinned · ${history.pins.count}`);
    render();
  }

  // --- Settings -------------------------------------------------------------------------------

  // Persist a change, except during a replay: recorded setting changes then apply
  // in memory only, and the pre-replay settings come back when the replay ends.
  function persistSettings(before) {
    if (isReplaying()) { replayBackup ??= before; return; }
    saveSettings(globalThis.localStorage, settings);
  }

  function applySettings(next, before = settings) {
    if (next === settings) return;
    settings = next;
    if (next.f2l !== before.f2l) live.setPseudo(next.f2l === 'pseudo');
    if (JSON.stringify(next.inspection) !== JSON.stringify(before.inspection)) live.setInspection(next.inspection);
    if (next.style !== before.style) void applyStyle(next.style);
    const livePhase = live.getSnapshot().phase;
    if (livePhase === 'inspecting' && (next.crossColor !== before.crossColor || next.crossHint !== before.crossHint
      || next.toggles.crossSuggest !== before.toggles.crossSuggest)) void suggestCrossFor(lastScramble);
    if (next.session.gapMin !== before.session.gapMin && history && !isReplaying()) { history.setSessionGapMin(next.session.gapMin); history.regroupSessions(); records = history.records; }
    render();
  }

  function applySetting(path, value) {
    const before = settings;
    const next = setSetting(settings, path, value);
    if (JSON.stringify(next) === JSON.stringify(before)) return;
    applySettings(next, before);
    persistSettings(before);
  }

  async function applyStyle(id) {
    const token = ++styleToken;
    try {
      const mod = await loadStyle(id);
      if (token !== styleToken || detached) return;
      shell.setStyle(mod);
      retheme();
      render();
    } catch (err) {
      console.error('[brain] style failed to load', err);
      showError(`Could not load the ${id} style: ${err.message}`);
    }
  }

  // --- Solve lifecycle ------------------------------------------------------------------------

  async function generateScramble() {
    const mod = await (scrambleLoad || import('../scramble.js'));
    scrambleLoad = Promise.resolve(mod);
    return mod.generateWcaScramble();
  }

  function startGuidedWith(scramble) {
    try { live.startGuided(scramble); } catch (err) { showError(err.message); return false; }
    settingsOpen = false;   // a solve started from the settings panel goes back to the cube
    scrambleNumber++;
    lastScramble = scramble;
    skips = [];
    void suggestCrossFor(scramble);
    return true;
  }

  async function start() {
    error = '';
    if (cubeSession.getSnapshot().phase !== 'tracking') { showError(MSG.syncFirst); return; }
    if (settings.scramble === 'free') {
      try { live.startFree(); } catch (err) { showError(err.message); return; }
      settingsOpen = false;
      scrambleNumber++;
      skips = [];
      void suggestCrossFor(cubeSession.getSnapshot().moves.join(' '));
    } else {
      // Guided: auto-generate a WCA scramble when none is set. Paste needs one.
      let scramble = scrambleText.trim();
      if (!scramble && settings.scramble === 'paste') { showError('Paste a scramble first.'); return; }
      if (!scramble) {
        if (generating) return;
        generating = true; message('generating scramble…');
        try { scramble = await generateScramble(); scrambleText = scramble; }
        catch { generating = false; showError('Couldn’t load a scramble. Reload and try again.'); return; }
        generating = false;
        if (detached) return;
      }
      if (!startGuidedWith(scramble)) return;
    }
    message('Scramble ready. The clock starts on your first move.');
  }

  function startCustom() {
    const scramble = scrambleText.trim();
    if (!scramble) { showError('Paste a scramble first.'); return; }
    if (cubeSession.getSnapshot().phase !== 'tracking') { showError(MSG.syncFirst); return; }
    error = '';
    if (startGuidedWith(scramble)) render();
  }

  function cancel() { closeReview(); live.cancel(); optimalCross = null; render(); }

  const currentAt = () => savedRecord?.at ?? live.getSnapshot().record?.at;

  // Set (or with toggle, flip) the penalty of any stored solve; the current result by default.
  function setPenaltyAt(at, penalty, toggle) {
    const stored = records.find(r => r.at === at);
    if (!stored || !history) return;
    const wanted = penalty === 'none' ? null : penalty ?? null;
    const next = toggle && stored.penalty === wanted ? null : wanted;
    if (!history.setPenalty(at, next)) { message('History is read-only right now.'); return; }
    records = history.records;
    render();
  }

  function deleteSolve(at) {
    const target = Number.isFinite(at) ? at : currentAt();
    const removed = history?.remove(target);
    if (!removed) { if (history?.readOnly) message('History is read-only right now.'); return; }
    undoStack.push(removed);
    if (undoStack.length > 20) undoStack.shift();
    records = history.records;
    if (currentAt() === target) { live.cancel(); optimalCross = null; }
    message(`Deleted ${fmtResult(removed)} · u to undo`);
  }

  function undoDelete() {
    const record = undoStack.pop();
    if (!record || !history) return;
    history.restore(record);
    records = history.records;
    message(`Restored ${fmtResult(record)}`);
  }

  // Run a history write now, or once the history has opened.
  function withHistory(fn) {
    if (!history) { pendingHistory.push(fn); return; }
    fn(history);
    records = history.records;
  }

  const historyReady = openHistory({ sessionGapMin: settings.session.gapMin }).then(store => {
    history = store;
    if (detached) return;
    for (const fn of pendingHistory) fn(store);
    pendingHistory = [];
    records = store.records;
    if (store.warning) error = store.warning;
    render();
  }).catch(err => { if (!detached) showError(`Could not open your history: ${err.message}`); });

  // --- Actions ----------------------------------------------------------------------------------

  function dispatch(action) {
    if (detached || !action) return;
    // (The site mode is the page's, not the session's: a replay must not flip it.)
    if (RECORDED.has(action.type) && !(action.type === 'setSetting' && (LIVE_RECORDED_PATHS.test(action.path) || action.path === 'theme'))) record('ui', { type: 'action', action });
    switch (action.type) {
      case 'connect': connectStep = ''; connectLogFrom = getConnectionLog().length; void cubeSession.connect(); break;
      case 'reconnect': void cubeSession.reconnect({ gesture: true }); break;
      case 'resumeSolve': live.resume(); break;
      case 'sync': void cubeSession.syncSolved().catch(() => {}); break;
      case 'recenter': cube?.cube?.recenterGyro(); message('Cube motion recentered.'); break;
      case 'disconnect': void cubeSession.disconnect(); break;
      case 'clearSavedCube': clearSavedCubeData(); message('Cube address forgotten. Connect again to derive it from scratch.'); break;
      case 'resetView': cube?.cube?.resetView(); break;
      case 'rebuildView': rebuild(); break;
      case 'start': return start();
      case 'startCustom': startCustom(); break;
      case 'generateScramble': {
        error = ''; generating = true; render();
        return generateScramble().then(s => { scrambleText = s; }, err => { error = `Could not generate a scramble: ${err.message}`; })
          .finally(() => { generating = false; render(); });
      }
      case 'setScrambleText': scrambleText = String(action.text ?? ''); render(); break;
      case 'cancel': cancel(); break;
      case 'dismissResults': cancel(); break;
      case 'next': {
        closeReview();
        live.cancel(); optimalCross = null;
        if (settings.scramble === 'free') { render(); break; }
        scrambleText = settings.scramble === 'paste' ? scrambleText : '';
        return start();
      }
      case 'retry': {
        const scramble = live.getSnapshot().record?.scramble || lastScramble;
        closeReview();
        live.cancel(); optimalCross = null;
        if (!scramble) { render(); break; }
        scrambleText = scramble;
        return start();
      }
      case 'caseClick': caseChoice = action.key || null; render(); break;
      case 'closeCase': caseChoice = null; render(); break;
      case 'setPenalty': setPenaltyAt(Number.isFinite(action.at) ? action.at : currentAt(), action.penalty, false); break;
      case 'togglePenalty': setPenaltyAt(currentAt(), action.penalty, true); break;
      case 'deleteSolve': deleteSolve(action.at); break;
      case 'undoDelete': undoDelete(); break;
      case 'selectMarker': reviewUi = { ...reviewUi, selectedId: action.id }; openDetail({ kind: 'marker', key: action.id }); break;
      case 'openDetail': openDetail({ kind: action.kind === 'marker' ? 'marker' : 'stage', key: action.key }); break;
      case 'closeDetail': closeReview(); render(); break;
      case 'jumpTo': if (Number.isInteger(action.at)) { showPosition(action.at); render(); } break;
      case 'playVariant': {
        const compare = vm?.results?.review?.detail?.compare;
        if (!compare || compare.status === 'pending') break;
        const moves = action.variant === 'better' ? compare.better : compare.yours;
        if (moves.length) return playMoves(compare.from, moves, action.variant);
        break;
      }
      case 'playOption': {
        const compare = vm?.results?.review?.detail?.compare;
        const option = compare?.options?.[action.option];
        if (compare && option?.moves?.length) return playMoves(compare.from, option.moves, 'better');
        break;
      }
      case 'stepMarker': {
        const list = vm?.results?.review?.markers ?? [];
        if (!list.length) break;
        const at = Math.max(0, list.findIndex(m => m.id === vm.results.review.selectedId));
        const next = list[(at + (action.delta < 0 ? -1 : 1) + list.length) % list.length];
        openDetail({ kind: 'marker', key: next.id });
        break;
      }
      case 'togglePin': togglePin(); break;
      // The site mode belongs to the page (src/theme.js), not to the Brain settings.
      case 'setSetting': if (action.path === 'theme') setThemePreference(action.value); else applySetting(action.path, action.value); break;
      case 'setStyle': applySetting('style', action.style); break;
      case 'toggleSettings': settingsOpen = !settingsOpen; render(); break;
      case 'toggleDebug': {
        debugOpen = !debugOpen;
        if (debugOpen) settingsOpen = false;
        if (debugOpen) pendingLog ??= getConnectionLog();
        render();
        if (debugOpen) paintConnectionLog();
        break;
      }
      case 'command': {
        const text = String(action.text ?? '').trim();
        // An empty command asks for the command line (it lives in the settings panel).
        if (!text) { settingsOpen = true; commandOpen = true; render(); break; }
        const parsed = parseCommand(text);
        if (!parsed) { showError(`Unknown command: ${text}`); break; }
        error = '';
        if (parsed.path === 'theme') setThemePreference(parsed.value); else applySetting(parsed.path, parsed.value);
        break;
      }
      case 'toggleTimer': applySetting('timer', settings.timer === 'hide' ? 'visible' : 'hide'); break;
      case 'cycleCoach': applySetting('coach', { live: 'after', after: 'off', off: 'live' }[settings.coach]); break;
      case 'export': void exportData(); break;
      case 'import': void importData(action.file); break;
      case 'sendLog': void sendLog(); break;
      case 'clearLog': clearConnectionLog(); break;
      default: break;
    }
    return undefined;
  }

  // --- Data port ---------------------------------------------------------------------------------

  const setStatusText = (selector, text) => { const el = $(selector); if (el) el.textContent = text; };
  async function exportData() {
    try {
      await historyReady;
      await history?.flush();
      await history?.pins.flush();
      const algs = await algDatabase.exportPersonalData();
      const blob = new Blob([serializeExport(exportAll(globalThis.localStorage, history ? history.records : null, history?.pins.list, algs))], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `cubesight-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    setStatusText('#brain-port-status', 'Backup exported.');
    } catch { setStatusText('#brain-port-status', 'Couldn’t export data. Try again.'); }
  }
  async function importData(file) {
    if (!file) return;
    try {
      const parsed = parseImport(await file.text());
      await historyReady;
      importAll(globalThis.localStorage, parsed, { clearOwned: false, skipKeys: history ? [SOLVE_STORE_KEY] : [] });
      const algorithms = algorithmsFromImport(parsed);
      if (algorithms) await algDatabase.importPersonalData(algorithms);
      if (history && !history.importRecords(historyFromImport(parsed))) {
        if (history.readOnly) throw new Error('the history is read-only right now');
      }
      history?.pins.importPins(pinsFromImport(parsed));
      records = history?.records ?? [];
      applySettings(loadSettings(globalThis.localStorage));
      setStatusText('#brain-port-status', 'Data imported. Reload to update drills.');
      render();
    } catch { setStatusText('#brain-port-status', 'Couldn’t import data. Check the file and try again.'); }
  }

  // --- Diagnostics -------------------------------------------------------------------------------

  // Capture browser-side errors so they can be sent along with the log.
  const runtimeErrors = [];
  const onWindowError = e => runtimeErrors.push(String(e.error?.stack || e.message || e).slice(0, 500));
  const onUnhandledRejection = e => runtimeErrors.push('unhandledrejection: ' + String(e.reason?.stack || e.reason || e).slice(0, 500));
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  async function sendLog() {
    if (!DEV) return;   // /__devlog only exists on the dev server
    setStatusText('#brain-send-status', 'sending…');
    const log = getConnectionLog();
    const redact = text => String(text || '').replace(/([\da-f]{2}:){5}[\da-f]{2}/gi, 'XX:XX:XX:XX:XX:XX');
    const snap = cubeSession.getSnapshot();
    const payload = JSON.stringify({
      at: Date.now(),
      href: location.href,
      ua: navigator.userAgent,
      session: { phase: snap.phase, deviceName: snap.deviceName, protocol: snap.protocol },
      connectionLog: log.map(e => ({ ...e, label: redact(e.label) })),
      runtimeErrors: runtimeErrors.slice(-20).map(redact),
      toggles: settings.toggles,
      settings,
    });
    try {
      const res = await fetch('/__devlog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
      setStatusText('#brain-send-status', res.ok ? 'Sent. The dev team can read the log.' : 'Couldn’t send the log. Try again.');
    } catch { setStatusText('#brain-send-status', 'Couldn’t send the log. Try again.'); }
  }

  // The log holds up to 2000 lines and grows on every cube event: rebuild it at
  // most once per frame, and only while the debug drawer is open.
  let pendingLog = null;
  let logFrame = 0;
  function paintConnectionLog() {
    logFrame = 0;
    const entries = pendingLog;
    const list = $('#brain-connection-log');
    if (detached || !entries || !list || !debugOpen) return;
    pendingLog = null;
    list.innerHTML = entries.length ? entries.map(e => `<li class="brain-log-item brain-log-${e.kind || 'info'}"><span class="brain-log-time">${new Date(e.at).toLocaleTimeString('en-US', { hour12: false })}</span><span>${escape(e.label)}</span></li>`).join('') : '<li class="brain-log-muted">No connection events in this session.</li>';
  }
  // The adapter logs steps the session never sees (the address lookup, the manual-address
  // prompt): while connecting, the newest of them is the status line too.
  const redactMac = text => String(text || '').replace(/([\da-f]{2}:){5}[\da-f]{2}/gi, 'XX:XX:XX:XX:XX:XX');
  function followConnectionSteps(entries) {
    if (detached || cubeSession.getSnapshot().phase !== 'connecting') return;
    const step = entries.slice(connectLogFrom).reverse().find(e => e.kind !== 'debug' && e.kind !== 'env' && e.label);
    const text = step ? redactMac(step.label).slice(0, 140) : '';
    if (text && text !== connectStep) { connectStep = text; render(); }
  }
  function renderConnectionLog(entries) {
    followConnectionSteps(entries);
    pendingLog = entries;
    if (!logFrame) logFrame = requestAnimationFrame(paintConnectionLog);
  }

  // --- Keyboard and theme -------------------------------------------------------------------------

  function onKeydown(event) {
    if (!active || detached || !vm) return;
    if (event.key === 'Escape' && reviewUi.detail && vm.screen === 'results' && !settingsOpen && !debugOpen) { event.preventDefault(); dispatch({ type: 'closeDetail' }); return; }
    const target = event.target;
    const focused = document.activeElement;
    const formControl = el => el && (FORM_TAGS.has(el.tagName) || el.isContentEditable);
    const action = resolveKey({
      key: event.key, repeat: event.repeat, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
      editable: formControl(target),
      dialogOpen: Boolean(document.querySelector('dialog[open]')),
      // The settings tab itself (focused after a click on it) still lets tab/esc close the panel.
      focusOnPage: !focused || focused === document.body || focused.matches?.('.b-settings > summary')
        || (root.contains(focused) && !formControl(focused) && !['BUTTON', 'A', 'SUMMARY'].includes(focused.tagName)),
      settingsOpen, debugOpen,
    }, vm.screen);
    if (!action) return;
    event.preventDefault();
    void dispatch(action);
  }
  window.addEventListener('keydown', onKeydown);

  const themeObserver = new MutationObserver(() => { retheme(); render(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  // Choosing the mode the page already shows (system -> the same explicit mode) changes no attribute.
  const onThemeChoice = () => render();
  document.addEventListener(THEME_EVENT, onThemeChoice);

  // --- Wiring ----------------------------------------------------------------------------------------

  const unsubSession = cubeSession.subscribe(onSession);
  const unsubLive = live.subscribe(onLive);
  const unsubConnectionLog = subscribeConnection(renderConnectionLog);
  // Always-on input recording: Save / Start fresh / Load (replay into this view).
  // Replayed actions go through dispatch; replayed solves and settings are restored after.
  attachBrainRecording({
    root, live, cubeSession, dispatch,
    getContext: () => ({ toggles: settings.toggles, method: settings.method, settings }),
    onSolvesRestored: () => {
      history?.endEphemeral();
      records = history?.records ?? [];
      if (replayBackup) { const restore = replayBackup; replayBackup = null; applySettings(restore); }
      render();
    },
  });
  // Pre-warm the (heavy) WCA scramble loader so the first click is instant.
  scrambleLoad = import('../scramble.js').then(m => m).catch(() => null);

  render();
  void applyStyle(settings.style);

  return {
    /** @returns {import('./types.js').BrainVM|null} */
    getViewModel: () => vm,
    /** A read-only snapshot of the one Cube mounted by this Brain controller. */
    getCubeState: () => (cube?.mode === 'case' ? cube.displayState : cube?.state) ?? null,
    dispatch,
    /** Resolves once the history is open and every queued write has reached IndexedDB (tests, export). */
    async flushHistory() { await historyReady; await history?.flush(); },
    async setActive(value) {
      if (detached) return;
      active = value;
      const token = ++activationToken;
      if (!value) {
        live.cancel();
        playToken++;
        cube?.stop();
        cube?.clearCue();
        shell.setCube?.(null);
        // main.js keeps Brain mounted while another route is active. Remove its
        // WebGL canvas from the document, but retain this Cube instance so every
        // Brain phase and style continues to use the same canvas.
        cube?.element.remove();
        cancelAnimationFrame(raf); raf = 0;
        return;
      }
      if (cube && !cube.element.isConnected) cube.mount(shell.slots.cube);
      shell.setCube?.(cube);
      render();
      await historyReady;
      if (detached || !active || token !== activationToken) return;
      // A replay owns an ephemeral history snapshot; reloading it would discard the
      // replayed solve before onSolvesRestored puts the real history back.
      if (!isReplaying() && !history?.ephemeral) {
        await history?.reload().catch(() => {});
        if (detached || !active || token !== activationToken) return;
        records = history?.records ?? [];
        const latest = loadSettings(globalThis.localStorage);
        applySettings(latest);
      }
      render();
    },
    detach() {
      if (detached) return;
      detached = true;
      active = false;
      unsubSession();
      unsubLive();
      unsubConnectionLog();
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('keydown', onKeydown);
      root.removeEventListener('change', onToggleChange);
      themeObserver.disconnect();
      document.removeEventListener(THEME_EVENT, onThemeChoice);
      cancelAnimationFrame(raf); raf = 0;
      cancelAnimationFrame(logFrame); logFrame = 0;
      if (instantFrame) cancelAnimationFrame(instantFrame);
      clearTimeout(toastTimer);
      live?.cancel();   // stops its inspection interval
      voiceCallouts.destroy();
      live?.detach();
      shell.setCube?.(null);
      cube?.destroy();  // releases the WebGL context and its render loop
      cube = null;
      shell.destroy();
      root.innerHTML = '';
    },
  };
}
