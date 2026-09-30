// Brain v2 controller: every side effect of the Brain view. It owns the
// subscriptions (smart-cube session, live tracker, connection log), the 3D
// cube mirror, the solve store, settings, the recording/replay wiring, the
// keyboard, the theme observer and the per-frame loop, and turns them into a
// BrainVM (view-model.js) that the shell and the style components render.
// Behaviour is ported from the v1 src/brain.js; the DOM lives in shell.js.

import { createCube3D } from '../cube-3d.js';
import { FACE_COLORS, toRenderData } from '../cross-cube.js';
import { createSolveLive } from '../solve-live.js';
import { crossSuggestion, crossHindsight, f2lNextPairHint, ollStage, pllLens, efficiencyScore } from '../solve-coach.js';
import { loadSolves, appendSolve, updateSolve } from '../solve-store.js';
import { exportAll, serializeExport, parseImport, importAll } from '../data-port.js';
import { subscribeConnection, clearConnectionLog, getConnectionLog, logConnection } from '../smart-cube-diag.js';
import { clearSavedCubeData } from '../smart-cube-bluetooth.js';
import { recordLiveCalls, recordRead, replaySpeed, isReplaying, record, now as recorderNow } from '../recorder.js';
import { attachBrainRecording } from '../brain-recording.js';
import { loadSettings, saveSettings, setSetting, parseCommand } from './settings.js';
import { buildStagePlan, xcrossLabel } from './stage-plan.js';
import { createTrack, trackMilestones, splitsFromTrack, stageProgress } from './milestones.js';
import { buildViewModel, frameState } from './view-model.js';
import { coachLines } from './coach-lines.js';
import { resolveKey } from './keys.js';
import { readStickerPalette, themedRender } from './cube-theme.js';
import { fmtSeconds } from './format.js';

// Dev-server-only features (Send to dev) are compiled out of production builds.
const DEV = Boolean(import.meta.env?.DEV);

const LENSES = { crossHindsight, f2lNextPairHint, ollStage, pllLens, efficiencyScore, faceColors: FACE_COLORS };
const TIMING_SCREENS = new Set(['inspection', 'ready', 'solving']);
const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
// UI actions recorded for replay. Start/cancel and the pseudo/inspection
// settings are already recorded at the live-tracker seam (live.call).
const RECORDED = new Set(['setSetting', 'setStyle', 'toggleTimer', 'cycleCoach', 'setPenalty', 'togglePenalty']);
const LIVE_RECORDED_PATHS = /^(f2l|inspection)(\.|$)/;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Mount one Brain view. `createShell(root, {dispatch})` builds the DOM,
 * `loadStyle(id)` resolves a StyleModule, `rebuild()` replaces this view.
 */
export function mountBrainController(root, cubeSession, { createShell, loadStyle, rebuild }) {
  let settings = loadSettings(globalThis.localStorage);
  let records = loadSolves(globalThis.localStorage);
  let active = true;
  let detached = false;
  let vm = null;
  let track = createTrack();
  let skips = [];               // { kind, label } hurrahs this solve (for the toast)
  let toast = null;
  let toastTimer = 0;
  let optimalCross = null;      // {face, length} from crossSuggestion during inspection
  let pendingSuggestion = null;
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
  let palette = null;           // sticker palette for the current style/theme
  let snapshots = [];           // cube snapshots at stage transitions (end-of-solve review)
  let lastCapturedStage = -1;
  let raf = 0;
  let styleToken = 0;

  const shell = createShell(root, { dispatch });
  const $ = selector => root.querySelector(selector);
  const brainEl = () => root.querySelector('.brain') ?? root;
  const theme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

  let cube = null;
  try { cube = createCube3D(shell.slots.cube, { mode: 'scout' }); }
  catch { shell.slots.cube.textContent = 'The Brain needs WebGL. Enable hardware acceleration or try another browser.'; }

  // Recorded seam: start/cancel/settings calls (with the exact scramble), the
  // held-orientation reads and the clock are captured for deterministic replay.
  const live = recordLiveCalls(createSolveLive(cubeSession, {
    now: recorderNow,
    getOrientation: () => recordRead('orientation', () => (cube?.getHeldFaces?.() ?? { bottom: 'D', front: 'F' })),
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
      now: recorderNow(), held: liveSnap.phase === 'applying' ? cube?.getHeldFaces?.() : null,
      scrambleText, scrambleNumber, settingsOpen, debugOpen, connectStep, commandOpen, toast,
    }, vm);
    commandOpen = false;
    const prev = vm;
    vm = next;
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
    if (box.querySelectorAll('[data-brain-toggle]').length !== entries.length) {
      box.innerHTML = entries.map(([key]) => `<label class="brain-toggle"><input type="checkbox" data-brain-toggle="${key}"><span>${key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</span></label>`).join('');
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

  // Sticker colours come from the style's --b-st-* tokens (the page background
  // follows the style through CSS alone).
  const themed = data => themedRender(data, palette ?? (palette = readStickerPalette(brainEl())));
  function retheme() {
    palette = null;
    const state = cubeSession.getSnapshot().state;
    if (state) cube?.update(themed(toRenderData(state)));
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
    if (state && !detached) cube?.update(themed(toRenderData(state)));
  }
  function showState(state) {
    if (replaySpeed() === 0) {
      instantState = state;
      if (!instantFrame) instantFrame = requestAnimationFrame(showInstantState);
      return;
    }
    if (instantFrame) { cancelAnimationFrame(instantFrame); instantFrame = 0; instantState = null; }
    cube?.update(themed(toRenderData(state)));
  }
  function mirrorTurn(move, state) {
    const speed = replaySpeed();
    if (speed === 0) { showState(state); return; }
    if (instantFrame) showInstantState();
    cube?.queueLiveMove(move, themed(toRenderData(state)), { speed: speed ?? 1 });
  }

  function onSession(snapshot) {
    if (detached) return;
    // Log EVERY snapshot before any phase guard, so a desync-causing move is captured.
    // Gyro/battery-only snapshots repeat the same line many times a second; log each distinct line once.
    const sessionLogLabel = `session: phase=${snapshot.phase} moves=${snapshot.moves?.length ?? '-'} lastMove=${snapshot.lastMove ?? '-'} detail=${snapshot.detail ?? '-'} `;
    if (sessionLogLabel !== lastSessionLogLabel) { lastSessionLogLabel = sessionLogLabel; logConnection({ label: sessionLogLabel, kind: 'debug' }); }
    const gyro = snapshot.protocol?.startsWith('GAN') ? snapshot.gyro : null;
    if (gyro !== lastGyro) { cube?.setGyroOrientation(gyro); lastGyro = gyro; }
    if (snapshot.phase === 'connecting') connectStep = snapshot.detail || connectStep;
    else connectStep = '';
    const key = [snapshot.phase, snapshot.detail, snapshot.deviceName, snapshot.protocol, Boolean(gyro), snapshot.battery].join('|');
    let changed = false;
    if (key !== lastStatusKey) { lastStatusKey = key; statusOverride = null; changed = true; }
    if (snapshot.phase !== 'tracking') {
      lastMirroredMove = null; lastMirroredLen = 0; lastMirroredState = null;
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
    if (!settings.toggles.crossSuggest || settings.crossHint === 'off' || !scramble) { optimalCross = null; return; }
    pendingSuggestion = scramble;
    try {
      const result = await crossSuggestion(scramble, { extended: false, timeLimitMs: 1500 });
      if (pendingSuggestion !== scramble || detached) return;
      optimalCross = result.best;
      render();
    } catch { optimalCross = null; }
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
      records = appendSolve(globalThis.localStorage, records, {
        ...snap.record,
        splits: splitsFromTrack(track, plan),
        moveTimes: track.moveTimes.slice(-200),
        config: { method: settings.method, f2l: settings.f2l, oll: settings.oll, pll: settings.pll, inspectionMode: snap.record.inspectionMode ?? settings.inspection.mode },
      });
      statusOverride = `Solve logged · ${fmtSeconds(snap.record.solveMs)} · ${snap.record.moveCount} moves.`;
    }
    if (active) render();
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
    if (cubeSession.getSnapshot().phase !== 'tracking') { showError('Connect and sync a solved cube first.'); return; }
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
        generating = true; message('Generating a scramble…');
        try { scramble = await generateScramble(); scrambleText = scramble; }
        catch (err) { generating = false; showError(`Could not generate a scramble: ${err.message}`); return; }
        generating = false;
        if (detached) return;
      }
      if (!startGuidedWith(scramble)) return;
    }
    message('Scramble ready — inspect, then start solving on your first move. The clock starts when you turn.');
  }

  function startCustom() {
    const scramble = scrambleText.trim();
    if (!scramble) { showError('Paste a scramble first.'); return; }
    if (cubeSession.getSnapshot().phase !== 'tracking') { showError('Connect and sync a solved cube first.'); return; }
    error = '';
    if (startGuidedWith(scramble)) render();
  }

  function cancel() { live.cancel(); optimalCross = null; render(); }

  function togglePenalty(penalty, toggle) {
    const at = savedRecord?.at ?? live.getSnapshot().record?.at;
    const stored = records.find(r => r.at === at);
    if (!stored) return;
    const next = toggle && stored.penalty === penalty ? null : penalty;
    records = updateSolve(globalThis.localStorage, records, at, { penalty: next });
    render();
  }

  // --- Actions ----------------------------------------------------------------------------------

  function dispatch(action) {
    if (detached || !action) return;
    if (RECORDED.has(action.type) && !(action.type === 'setSetting' && LIVE_RECORDED_PATHS.test(action.path))) record('ui', { type: 'action', action });
    switch (action.type) {
      case 'connect': connectStep = ''; connectLogFrom = getConnectionLog().length; void cubeSession.connect(); break;
      case 'sync': void cubeSession.syncSolved().catch(() => {}); break;
      case 'recenter': cube?.recenterGyro(); message('Cube motion recentered.'); break;
      case 'disconnect': void cubeSession.disconnect(); break;
      case 'clearSavedCube': clearSavedCubeData(); message('Saved cube address cleared. Connect again to derive it from scratch.'); break;
      case 'resetView': cube?.resetView(); break;
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
        live.cancel(); optimalCross = null;
        if (settings.scramble === 'free') { render(); break; }
        scrambleText = settings.scramble === 'paste' ? scrambleText : '';
        return start();
      }
      case 'retry': {
        const scramble = live.getSnapshot().record?.scramble || lastScramble;
        live.cancel(); optimalCross = null;
        if (!scramble) { render(); break; }
        scrambleText = scramble;
        return start();
      }
      case 'setPenalty': togglePenalty(action.penalty, false); break;
      case 'togglePenalty': togglePenalty(action.penalty, true); break;
      case 'setSetting': applySetting(action.path, action.value); break;
      case 'setStyle': applySetting('style', action.style); break;
      case 'toggleSettings': settingsOpen = !settingsOpen; render(); break;
      case 'toggleDebug': {
        debugOpen = !debugOpen;
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
        applySetting(parsed.path, parsed.value);
        break;
      }
      case 'toggleTimer': applySetting('timer', settings.timer === 'hide' ? 'visible' : 'hide'); break;
      case 'cycleCoach': applySetting('coach', { live: 'after', after: 'off', off: 'live' }[settings.coach]); break;
      case 'export': exportData(); break;
      case 'import': void importData(action.file); break;
      case 'sendLog': void sendLog(); break;
      case 'clearLog': clearConnectionLog(); break;
      default: break;
    }
    return undefined;
  }

  // --- Data port ---------------------------------------------------------------------------------

  const setStatusText = (selector, text) => { const el = $(selector); if (el) el.textContent = text; };
  function exportData() {
    try {
      const blob = new Blob([serializeExport(exportAll(globalThis.localStorage))], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `cubesight-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusText('#brain-port-status', 'Exported a backup of your local data.');
    } catch (err) { setStatusText('#brain-port-status', `Export failed: ${err.message}`); }
  }
  async function importData(file) {
    if (!file) return;
    try {
      const parsed = parseImport(await file.text());
      importAll(globalThis.localStorage, parsed, { clearOwned: false });
      records = loadSolves(globalThis.localStorage);
      applySettings(loadSettings(globalThis.localStorage));
      setStatusText('#brain-port-status', 'Imported. Metrics refreshed. Reload to update all trainers.');
      render();
    } catch (err) { setStatusText('#brain-port-status', `Import failed: ${err.message}`); }
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
    setStatusText('#brain-send-status', 'Sending…');
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
      setStatusText('#brain-send-status', res.ok ? 'Sent — the agent can read the log now.' : `Send failed: HTTP ${res.status}`);
    } catch (err) { setStatusText('#brain-send-status', `Send failed: ${err.message}`); }
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
    list.innerHTML = entries.length ? entries.map(e => `<li class="brain-log-item brain-log-${e.kind || 'info'}"><span class="brain-log-time">${new Date(e.at).toLocaleTimeString()}</span><span>${escape(e.label)}</span></li>`).join('') : '<li class="brain-log-muted">No connection attempts yet in this session.</li>';
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
      records = loadSolves(globalThis.localStorage);
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
    dispatch,
    setActive(value) {
      if (detached) return;
      active = value;
      if (!value) { live.cancel(); cancelAnimationFrame(raf); raf = 0; }
      else render();
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
      cancelAnimationFrame(raf); raf = 0;
      cancelAnimationFrame(logFrame); logFrame = 0;
      if (instantFrame) cancelAnimationFrame(instantFrame);
      clearTimeout(toastTimer);
      live?.cancel();   // stops its inspection interval
      live?.detach();
      cube?.destroy();  // releases the WebGL context and its render loop
      cube = null;
      shell.destroy();
      root.innerHTML = '';
    },
  };
}
