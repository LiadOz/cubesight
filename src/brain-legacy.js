import './brain.css';
import { createCube3D } from './cube-3d.js';
import { FACE_COLORS, toRenderData } from './cross-cube.js';
import { smartCube } from './smart-cube-bluetooth.js';
import { recoveryMoves } from './smart-cube-guidance.js';
import { createSolveLive } from './solve-live.js';
import { crossSuggestion, crossHindsight, f2lNextPairHint, ollStage, pllLens, efficiencyScore } from './solve-coach.js';
import { loadSolves, appendSolve } from './solve-store.js';
import { summarize, ao5, ao12 } from './solve-metrics.js';
import { exportAll, serializeExport, parseImport, importAll } from './data-port.js';
import { subscribeConnection, clearConnectionLog, getConnectionLog, logConnection } from './smart-cube-diag.js';
import { clearSavedCubeData } from './smart-cube-bluetooth.js';
import { METHODS, getMethod, DEFAULT_METHOD } from './solve-methods.js';
import { recordLiveCalls, recordRead, replaySpeed, now as recorderNow } from './recorder.js';
import { attachBrainRecording } from './brain-recording.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const title = color => color[0].toUpperCase() + color.slice(1);
const ms = value => value == null ? '—' : !Number.isFinite(value) ? 'DNF' : `${(value / 1000).toFixed(2)}s`;
const TOGGLE_STORE = 'cubesight-brain-toggles-v1';

// Keyed DOM reconciliation for per-move renders. Rebuilding innerHTML on every live
// emit replaced every node, which restarted their CSS entry animations (the coach fade)
// and made static guidance visibly flicker on each turn. This reuses the element with the
// same key, touches class/text only when they differ, and moves nodes only when the order
// changes, so only genuinely new items are inserted (and animate in).
// items: [{ key, className, text, title? }]
function reconcileChildren(container, items, tag = 'p') {
  const byKey = new Map();
  for (const el of container.children) if (el.dataset.key != null && !byKey.has(el.dataset.key)) byKey.set(el.dataset.key, el);
  const wanted = items.map(item => {
    let el = byKey.get(item.key);
    if (!el) { el = document.createElement(tag); el.dataset.key = item.key; }
    byKey.delete(item.key);   // a duplicate key gets its own element
    return el;
  });
  const keep = new Set(wanted);
  for (const el of [...container.children]) if (!keep.has(el)) el.remove();
  let cursor = container.firstElementChild;
  items.forEach((item, i) => {
    const el = wanted[i];
    if (el.className !== item.className) el.className = item.className;
    if (el.textContent !== item.text) el.textContent = item.text;
    const title = item.title ?? '';
    if ((el.getAttribute('title') ?? '') !== title) { if (title) el.setAttribute('title', title); else el.removeAttribute('title'); }
    if (el === cursor) cursor = cursor.nextElementSibling;
    else container.insertBefore(el, cursor);
  });
}
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };

// Default coach/debug toggles. Every coach affordance and visual option is a
// switch so the design can be inspected feature-by-feature, as requested.
const DEFAULT_TOGGLES = {
  crossSuggest: true,      // suggest an optimal cross during inspection
  crossHindsight: true,    // “your cross was non-optimal”
  f2lHint: true,           // readiness hint for the next pair
  pllLens: true,           // identify the PLL case
  ollStage: true,          // 2-look OLL stage labels
  rotationFlag: true,      // flag excessive whole-cube rotations
  efficiencyScore: true,  // chess.com-style accuracy analogue
  autoCross: true,         // detect the cross face from the cube (first face solved)
};

function loadToggles() {
  try { return { ...DEFAULT_TOGGLES, ...JSON.parse(localStorage.getItem(TOGGLE_STORE)) }; } catch { return { ...DEFAULT_TOGGLES }; }
}
function saveToggles(toggles) {
  try { localStorage.setItem(TOGGLE_STORE, JSON.stringify(toggles)); } catch { /* keep in memory */ }
}

// main.js keeps the object returned here for the lifetime of the page, so it is a
// stable handle: "Reset view" tears the current view down completely (subscriptions,
// live tracker, WebGL cube, window listeners) and mounts a fresh one behind it.
export function createBrain(root, cubeSession = smartCube) {
  let active = true;
  let view = null;
  const rebuild = () => {
    view?.detach();
    view = mountBrain(root, cubeSession, rebuild);
    view.setActive(active);
  };
  rebuild();
  return {
    setActive(value) { active = value; view.setActive(value); },
    detach() { view.detach(); },
    reset() { rebuild(); return this; },
  };
}

function mountBrain(root, cubeSession, rebuild) {
  let toggles = loadToggles();
  let records = loadSolves(localStorage);
  let active = true;
  let cube = null;
  let live = null;
  let lastGyro = null;
  let lastStatusKey = '';
  let lastSessionLogLabel = '';
  let lastMirroredMove = null;
  let lastMirroredLen = 0;
  let lastMirroredSeq = cubeSession.getSnapshot().moveEvent?.seq ?? null; // don't replay a turn made before mount
  let lastMirroredState = null;
  let savedRecord = null;      // the live record already appended to the solve store
  let scrambleLoad = null;
  let optimalCross = null;     // {face, length} from crossSuggestion during inspection
  let pendingSuggestion = null;
  let crossKind = 'cross';   // cross | xcross | xxcross — solve target chosen in setup
  let solveMethod = getMethod(DEFAULT_METHOD);
  let skips = [];          // { stage, kind, label } — hurrahs marked on the timeline
  // Skip kinds from solve-live, mapped to the timeline stage(s) that were skipped.
  // An OLL skip skips both looks of 2-look OLL. Names absent from the method (e.g. Roux) are ignored.
  const STAGE_NAMES_FOR_SKIP = { f2l: ['F2L'], oll: ['EO', 'CO'], eo: ['EO'], co: ['CO'], pll: ['PLL'] };
  (function restoreSetup() {
    try {
      crossKind = JSON.parse(localStorage.getItem('cubesight-brain-cross') || '"cross"');
      if (!['cross','xcross','xxcross'].includes(crossKind)) crossKind = 'cross';
    } catch { /* ignore */ }
  })();

  root.innerHTML = `
    <section class="intro-row brain-intro"><div><p class="eyebrow">Practice / Smart cube</p><h1>Brain</h1></div><p class="intro-copy">Connect your cube.<br>Solve. Learn what to fix.</p></section>
    <section class="brain-work" aria-label="Live solve">
      <div class="brain-cube-stage">
        <div class="brain-cube-topline"><span class="status-dot"><i></i> <span id="brain-device-inline">No cube</span></span><span class="view-lock">Free tumble</span><button class="text-button" id="brain-reset-view" type="button">Reset view</button></div>
        <div class="brain-connect-chip" aria-label="Smart cube connection">
          <strong id="brain-device">No cube connected</strong>
          <p id="brain-status" role="status" aria-live="polite">Connect a smart cube to start.</p>
          <div class="brain-controls"><button class="brain-chip" id="brain-connect">Connect</button><button class="brain-chip" id="brain-sync" hidden>Sync</button><button class="brain-chip" id="brain-recenter" hidden>Recenter</button><button class="brain-chip" id="brain-disconnect" hidden>Disconnect</button><button class="brain-chip" id="brain-clear-cube" hidden>Clear saved</button></div>
        </div>
        <div id="brain-cube" class="cube-mount"></div>
        <div id="brain-moves" class="brain-moves" aria-label="Scramble moves" hidden></div>
        <div class="brain-cube-timeline" id="brain-timeline" role="progressbar" aria-label="Solve stage timeline"></div>
      </div>
      <div class="brain-pill">
        <div class="brain-pill-row">
          <div class="brain-pill-phase">
            <p class="eyebrow">Phase</p>
            <h2 id="brain-phase-label">Connect and start a solve</h2>
            <p id="brain-phase-detail" class="brain-phase-detail">Cross is detected from the first face you solve.</p>
          </div>
          <div id="brain-coach" class="brain-pill-coach" aria-live="polite"></div>
          <div class="brain-pill-metrics" aria-label="Your solve metrics">
            <div class="brain-metrics-grid" id="brain-metrics-grid"></div>
            <p class="brain-footnote">All data stays on this device.</p>
          </div>
        </div>
        <div class="brain-pill-actions"><button class="primary-button" id="brain-start">Start guided solve</button><button class="brain-button" id="brain-stop" hidden>Cancel solve</button><button class="brain-button" id="brain-rebuild-view" type="button" title="Rebuild this view without reloading (keeps the cube connected)">Reset view</button><p id="brain-error" class="brain-error" role="alert" hidden></p></div>
        <details class="brain-pill-setup">
          <summary><span>Setup</span><i aria-hidden="true"></i></summary>
          <section class="brain-setup" aria-label="Solve setup">
            <div class="brain-setup-row">
              <div class="brain-mode" role="group" aria-label="Solve mode"><span class="control-label">Mode</span><div class="segmented"><button class="segment active" data-brain-mode="guided">Guided</button><button class="segment" data-brain-mode="free">Free</button></div></div>
              <div class="brain-method" role="group" aria-label="Solving method"><span class="control-label">Method</span><div class="segmented">${METHODS.map(m => `<button class="segment${m.id === solveMethod.id ? ' active' : ''}" data-brain-method="${m.id}" title="${escape(m.description || '')}">${m.label}</button>`).join('')}</div></div>
              <div class="brain-cross-kind" role="group" aria-label="Cross style"><span class="control-label">Cross</span><div class="segmented"><button class="segment active" data-brain-cross="cross">Cross</button><button class="segment" data-brain-cross="xcross">X-cross</button><button class="segment" data-brain-cross="xxcross">Double X</button></div></div>
              <label class="brain-pseudo-toggle"><input type="checkbox" id="brain-pseudo"><span>Pseudo F2L · D-shift</span></label>
              <label class="brain-pseudo-toggle"><input type="checkbox" id="brain-inspection" checked><span>Inspection · 15s</span></label>
            </div>
            <details class="brain-advanced-scramble"><summary><span>Use a specific scramble</span><i aria-hidden="true"></i></summary><div class="brain-scramble-wrap" id="brain-guided-wrap"><textarea id="brain-scramble" rows="2" spellcheck="false" autocomplete="off" placeholder="Paste a scramble, or generate one to inspect before starting…"></textarea><div class="brain-scramble-actions"><button class="brain-button" id="brain-generate">New WCA scramble</button><button class="brain-button" id="brain-start-custom">Start with this scramble</button></div></div></details>
          </section>
        </details>
      </div>
      <section class="brain-review" id="brain-review" hidden aria-live="polite"></section>
    </section>
    <details class="brain-diagnostics"><summary><span>Connection diagnostics</span><small>What the attach is doing — send to dev</small><i aria-hidden="true"></i></summary><div class="brain-connection-log-head"><div><p class="eyebrow">Connection log</p><h2>What the attach is doing</h2></div><div class="brain-log-actions"><button class="brain-button" id="brain-send-log" type="button" title="Send this log to the dev server so the agent can read it">Send to dev</button><button class="brain-button" id="brain-clear-log" type="button">Clear log</button></div></div><ol id="brain-connection-log" class="brain-log-list"></ol><p id="brain-send-status" role="status" aria-live="polite"></p><div class="brain-log-actions brain-recording-actions"><button class="brain-button" id="brain-save-recording" type="button" title="Everything the cube and you sent is recorded continuously. Save it to reproduce a problem.">Save recording</button><button class="brain-button" id="brain-clear-recording" type="button">Start fresh recording</button><button class="brain-button" id="brain-load-recording" type="button" title="Replay a saved recording into this view">Load recording…</button><select id="brain-replay-speed" aria-label="Replay speed"><option value="1">1×</option><option value="4">4×</option><option value="0">Instant</option></select><button class="brain-button" id="brain-replay-stop" type="button" hidden>Stop replay</button><input type="file" id="brain-load-recording-file" accept="application/json,.json" hidden></div><p id="brain-recording-status" role="status" aria-live="polite"></p></details>
    <details class="brain-coach-settings"><summary><span>Coach settings</span><small>Choose which insights appear</small><i aria-hidden="true"></i></summary><div id="brain-toggles" class="brain-toggles"></div><div class="brain-data-port"><span>Your data stays on this device.</span><button class="brain-button" id="brain-export" type="button">Export data</button><button class="brain-button" id="brain-import" type="button">Import data</button><input type="file" id="brain-import-file" accept="application/json,.json" hidden><p id="brain-port-status" role="status" aria-live="polite"></p></div></details>`;

  const $ = selector => root.querySelector(selector);

  try { cube = createCube3D($('#brain-cube'), { mode: 'scout' }); }
  catch (error) { $('#brain-cube').textContent = 'The Brain needs WebGL. Enable hardware acceleration or try another browser.'; }

  // Recorded seam: start/cancel/settings calls (with the exact scramble), the
  // held-orientation reads and the clock are captured for deterministic replay.
  live = recordLiveCalls(createSolveLive(cubeSession, {
    now: recorderNow,
    getOrientation: () => recordRead('orientation', () => (cube?.getHeldFaces?.() ?? { bottom: 'D', front: 'F' })),
  }));

  function renderToggles() {
    $('#brain-toggles').innerHTML = Object.entries(toggles).map(([key, value]) =>
      `<label class="brain-toggle"><input type="checkbox" data-brain-toggle="${key}" ${value ? 'checked' : ''}><span>${key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</span></label>`).join('');
  }
  function toggle(key, value) { toggles[key] = value; saveToggles(toggles); }

  function showError(message) { const e = $('#brain-error'); e.textContent = message; e.hidden = !message; }
  function message(text) { $('#brain-status').textContent = text; }

  function renderConnection(snapshot) {
    const connecting = snapshot.phase === 'connecting';
    const connected = !connecting && snapshot.phase !== 'disconnected';
    const gyroLive = connected && snapshot.protocol?.startsWith('GAN') && Boolean(snapshot.gyro);
    const supported = Boolean(window.isSecureContext && navigator.bluetooth?.requestDevice);
    $('#brain-device').textContent = connected ? `${snapshot.deviceName}${snapshot.protocol ? ` · ${snapshot.protocol}` : ''}` : connecting ? 'Smart cube · connecting' : 'No cube connected';
    const inline = $('#brain-device-inline');
    if (inline) inline.textContent = connected ? snapshot.deviceName : (connecting ? 'connecting…' : 'No cube');
    // A clear pairing indicator: show a spinner while connecting (not an affordance).
    $('#brain-status').textContent = supported ? (connecting ? 'Select your cube in the picker…' : snapshot.detail + (gyroLive ? ' Hold the cube as shown and tap Recenter motion to align.' : '')) : 'Web Bluetooth needs Chrome or Edge on Android/desktop over HTTPS.';
    const connectChip = document.querySelector('.brain-connect-chip');
    if (connectChip) connectChip.classList.toggle('is-connecting', connecting);
    $('#brain-connect').hidden = snapshot.phase !== 'disconnected';
    $('#brain-connect').disabled = !supported;
    $('#brain-sync').hidden = !connected;
    $('#brain-recenter').hidden = !gyroLive;
    $('#brain-disconnect').hidden = snapshot.phase === 'disconnected';
    $('#brain-clear-cube').hidden = snapshot.phase !== 'disconnected';
    refreshScrambleState();
  }

  // Scramble generation/editing stays available while a cube is connected (you
  // generate a WCA scramble AFTER connecting, then Start guided). It is only
  // locked while a scramble is actively being applied or a solve is running.
  function refreshScrambleState() {
    const livePhase = live?.getSnapshot().phase;
    const busy = livePhase === 'applying' || livePhase === 'solving' || livePhase === 'done';
    $('#brain-generate').disabled = busy;
    $('#brain-scramble').readOnly = busy;
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
    if (state && !detached) cube?.update(toRenderData(state));
  }
  function showState(state) {
    if (replaySpeed() === 0) {
      instantState = state;
      if (!instantFrame) instantFrame = requestAnimationFrame(showInstantState);
      return;
    }
    if (instantFrame) { cancelAnimationFrame(instantFrame); instantFrame = 0; instantState = null; }
    cube?.update(toRenderData(state));
  }
  function mirrorTurn(move, state) {
    const speed = replaySpeed();
    if (speed === 0) { showState(state); return; }
    if (instantFrame) showInstantState();
    cube?.queueLiveMove(move, toRenderData(state), { speed: speed ?? 1 });
  }

  function onSession(snapshot) {
    if (detached) return;
    // Log EVERY snapshot before any phase guard, so a desync-causing move is captured (not skipped).
    // Gyro/battery-only snapshots repeat the same line many times a second; log each distinct line once.
    const sessionLogLabel = `session: phase=${snapshot.phase} moves=${snapshot.moves?.length ?? '-'} lastMove=${snapshot.lastMove ?? '-'} detail=${snapshot.detail ?? '-'} `;
    if (sessionLogLabel !== lastSessionLogLabel) { lastSessionLogLabel = sessionLogLabel; logConnection({ label: sessionLogLabel, kind: 'debug' }); }
    const gyro = snapshot.protocol?.startsWith('GAN') ? snapshot.gyro : null;
    if (gyro !== lastGyro) { cube?.setGyroOrientation(gyro); lastGyro = gyro; }
    const key = [snapshot.phase, snapshot.detail, snapshot.deviceName, snapshot.protocol, Boolean(gyro)].join('|');
    if (key !== lastStatusKey) { renderConnection(snapshot); lastStatusKey = key; }
    const dbg = $('#brain-debug'); if (dbg) dbg.hidden = snapshot.phase === 'disconnected';
    if (snapshot.phase !== 'tracking') { lastMirroredMove = null; lastMirroredLen = 0; lastMirroredState = null; return; }
    // The session publishes a snapshot on every event — including many gyro/
    // status updates per second — so we must NOT re-queue the last move on
    // each one, or a single physical turn re-animates forever. Dedup by the
    // Mirror when a genuinely new move arrives OR a coalesced double replaces the last entry.
    // (A U2 coalesces two quarter-turns into one 'U2' history entry — the length doesn't
    // grow on the second quarter, but the last entry changes from 'U' to 'U2', so we must
    // mirror it or the cube's faces stick at the first quarter.)
    // Sessions that publish moveEvent bump its seq on every applied turn (a coalesced
    // double has replaces:true); key on that. Older sessions (replay harness) fall back
    // to the history length + last entry.
    // A state replaced without a turn (sync to a solved baseline) is shown without animation.
    if (snapshot.moveEvent !== undefined) {
      const event = snapshot.moveEvent;
      if (event && event.seq !== lastMirroredSeq) {
        lastMirroredSeq = event.seq;
        mirrorTurn(event.turn ?? event.move, snapshot.state); // a coalesced double's first quarter is already animated
      } else if (snapshot.state !== lastMirroredState) {
        showState(snapshot.state);
      }
      lastMirroredState = snapshot.state;
    } else {
      const lastEntry = snapshot.moves[snapshot.moves.length - 1];
      if (snapshot.moves.length !== lastMirroredLen || lastEntry !== lastMirroredMove) {
        lastMirroredLen = snapshot.moves.length;
        lastMirroredMove = lastEntry;
        if (lastEntry) mirrorTurn(lastEntry, snapshot.state);
        else showState(snapshot.state);
      }
    }
    const debug = $('#brain-debug');
    if (debug) debug.textContent = `phase=${snapshot.phase} moves=${snapshot.moves.length} last=${snapshot.lastMove ?? '-'}`;
  }

  // --- Cross suggestion (async, during inspection) --------------------------------------------
  async function suggestCrossFor(scramble) {
    if (!toggles.crossSuggest || !scramble) { optimalCross = null; return; }
    pendingSuggestion = scramble;
    try {
      const result = await crossSuggestion(scramble, { extended: false, timeLimitMs: 1500 });
      if (pendingSuggestion !== scramble) return;
      optimalCross = result.best;
      renderCoach();
    } catch { optimalCross = null; }
  }

  // --- Coach panel ------------------------------------------------------------------------------
  // --- Guided scramble cue + algorithm showcase + recovery ----------------
  // The scramble flow under the cube is the single place the scramble is shown. The current
  // move is the visual indicator (highlighted) — no ↺ symbol, no verbose text.
  function renderApplyGuide() {
    const snap = live.getSnapshot();
    const movesEl = $('#brain-moves');
    if (!movesEl) return;
    if (snap.phase !== 'applying') { movesEl.hidden = true; if (movesEl.firstChild) movesEl.replaceChildren(); return; }
    const held = cube?.getHeldFaces?.() ?? { bottom: 'D', front: 'F' };
    const scrambleMoves = snap.scrambleStr ? snap.scrambleStr.split(/\s+/).filter(Boolean) : [];
    // Keyed per move so each turn only flips the done/current classes on existing chips.
    let items;
    if (snap.applyDetour.length) {
      // A wrong turn is folded into the scramble as an extra step (CubeStation-style):
      // show the recovery path as a flow with the next move highlighted, not a notation paragraph.
      const recovery = recoveryMoves(snap.applyDetour, held.bottom, held.front);
      items = recovery.map((m, i) => ({ key: `r${i}`, className: i === 0 ? 'current' : '', text: m }));
    } else {
      items = scrambleMoves.map((m, i) => ({ key: `s${i}`, className: i < snap.applyStep ? 'done' : i === snap.applyStep ? 'current' : '', text: m }));
    }
    movesEl.hidden = false;
    reconcileChildren(movesEl, items, 'i');
  }

  function renderCoach() {
    const snap = live.getSnapshot();
    const sessionSnap = cubeSession.getSnapshot();
    const state = sessionSnap.state;
    const crossFace = snap.crossFace;
    const p = snap.progress || {};
    const lines = [];
    if (snap.phase === 'applying') {
      lines.push({ tone: 'info', text: 'Perform the scramble shown in the cue. A wrong turn shows the return path without discarding the attempt.' });
    } else if ((snap.phase === 'solving' || snap.phase === 'done') && crossFace && state) {
      if (toggles.crossSuggest && optimalCross) {
        lines.push({ tone: 'info', text: `Optimal cross here: ${title(FACE_COLORS[optimalCross.face])} face in ${optimalCross.length} move${optimalCross.length === 1 ? '' : 's'}.` });
      }
      if (toggles.crossHindsight && snap.crossMoveCount != null && optimalCross) {
        const h = crossHindsight(snap.crossMoveCount, optimalCross.length, crossFace);
        if (h) lines.push({ tone: h.kind === 'optimal' ? 'good' : 'warn', text: h.text });
      }
      if (p.crossDone && !p.f2lDone && toggles.f2lHint) {
        const hint = f2lNextPairHint(state, crossFace);
        if (hint) lines.push({ tone: 'info', text: hint.text });
      }
      if (toggles.ollStage && p.f2lDone && !p.ollDone) {
        const stage = ollStage(state, crossFace);
        lines.push({ tone: 'info', text: stage.eoDone ? 'Edges oriented — orient the corners (2-look OLL).' : 'Orient the last-layer edges first (2-look OLL).' });
      }
      if (toggles.pllLens && p.ollDone && !p.solved) {
        const pll = pllLens(state, crossFace);
        if (pll?.name) lines.push({ tone: 'info', text: `PLL: ${pll.name} (${pll.family}). ${pll.cue}` });
      }
      if (toggles.rotationFlag && snap.rotations > 2) {
        lines.push({ key: 'rotations', tone: 'warn', text: `${snap.rotations} whole-cube rotation${snap.rotations === 1 ? '' : 's'} this solve — fewer rotations often save time.` });
      }
      if (toggles.efficiencyScore) {
        const score = efficiencyScore({ userCrossMoves: snap.crossMoveCount ?? 0, optimalCrossMoves: optimalCross?.length ?? null, rotations: snap.rotations, solved: p.solved, f2lPairs: p.pairsSolved, ollDone: p.ollDone });
        lines.push({ key: 'efficiency', tone: 'good', text: `Solve efficiency so far: ${score}/100.` });
      }
    } else if (snap.phase === 'done' && snap.record) {
      lines.push({ tone: 'good', text: `Solved in ${ms(snap.record.solveMs)} · ${snap.record.moveCount} moves · ${snap.record.tps?.toFixed(2) ?? '—'} TPS.` });
      if (snap.record.xcross) lines.push({ tone: 'good', text: `Extended cross: ${snap.record.xcross === 'xxcross' ? 'double X-cross' : 'X-cross'} built with the cross.` });
    }
    if (!lines.length) lines.push({ key: 'empty', tone: 'muted', text: 'Coach insights appear here as you solve.' });
    // Keyed by content (running counters by a stable key, updated in place): a line that is
    // unchanged between moves keeps its node, so its fade-in does not replay on every turn.
    reconcileChildren($('#brain-coach'), lines.map(l => ({ key: l.key ?? `${l.tone}:${l.text}`, className: `brain-coach-line brain-coach-${l.tone}`, text: l.text })));
  }

  // Stage definitions come from the chosen solving method (CFOP / Roux / ...). The index is
  // the stage you are CURRENTLY working on (the last entry is the finish point).
  function stageIndex(progress, phase) { return solveMethod.mapProgress(progress, phase); }
  const TIMELINE_PHASES = new Set(['inspecting', 'ready', 'solving', 'done']);
  let timelineKey = null;   // method + skip markers the timeline DOM was built for
  function renderTimeline() {
    const snap = live.getSnapshot();
    const p = snap.progress || {};
    const STAGES = solveMethod.stages;
    const last = STAGES.length - 1;
    const current = Math.max(0, Math.min(last, stageIndex(p, snap.phase)));
    const at = i => `${(i / last) * 100}%`;
    // Shown from inspection onwards (it swoops in when the scramble is done): the marker
    // sits on the stage being worked on, the line fills up to it, and passed stages read as done.
    const tl = $('#brain-timeline');
    const visible = TIMELINE_PHASES.has(snap.phase);
    tl.hidden = !visible;
    tl.classList.toggle('brain-timeline--visible', visible);
    if (visible) {
      const skipFor = label => skips.find(s => s.names.includes(label));
      // Rebuild the structure only when the method or the skip markers change; per move,
      // only the fill width, dot position and mark classes are updated in place.
      const key = `${solveMethod.id}|${STAGES.map(l => (skipFor(l) ? '*' : '')).join(',')}`;
      if (key !== timelineKey) {
        timelineKey = key;
        tl.innerHTML = `
          <div class="brain-tl-line"><i></i></div>
          <div class="brain-tl-ticks">${STAGES.map((_, i) => `<i style="left:${at(i)}"></i>`).join('')}</div>
          <div class="brain-tl-dot"></div>
          <div class="brain-tl-marks">${STAGES.map((label, i) => {
            const skip = skipFor(label);
            const title = skip ? ` title="${escape(skip.label)}"` : '';
            return `<span style="left:${at(i)}"${title}>${escape(label)}${skip ? ' ★' : ''}</span>`;
          }).join('')}</div>`;
      }
      const fill = tl.querySelector('.brain-tl-line i');
      const dot = tl.querySelector('.brain-tl-dot');
      if (fill.style.width !== at(current)) fill.style.width = at(current);
      if (dot.style.left !== at(current)) dot.style.left = at(current);
      tl.setAttribute('aria-valuenow', String(current));
      tl.setAttribute('aria-valuetext', STAGES[current]);
      const cls = (label, i) => [i < current ? 'done' : i === current ? 'current' : '', skipFor(label) ? 'skip' : '', i === last ? 'finish' : ''].filter(Boolean).join(' ');
      tl.querySelectorAll('.brain-tl-ticks i').forEach((el, i) => { const c = cls(STAGES[i], i); if (el.className !== c) el.className = c; });
      tl.querySelectorAll('.brain-tl-marks span').forEach((el, i) => { const c = cls(STAGES[i], i); if (el.className !== c) el.className = c; });
    }
    let label = 'Connect and start a solve';
    if (snap.phase === 'applying') label = 'Perform the scramble';
    else if (snap.phase === 'inspecting') label = 'Inspection';
    else if (snap.phase === 'ready') label = 'Start solving — the clock starts on your first turn';
    else if (snap.phase === 'solving') label = p.phase ? ({ 'pre-cross': 'Building the cross', cross: 'F2L', 'f2l-0': 'F2L', 'f2l-1': 'F2L', 'f2l-2': 'F2L', 'f2l-3': 'F2L', 'f2l-4': 'F2L', eo: 'OLL · orient edges', co: 'OLL · orient edges', 'co-pending': 'OLL · orient corners', pll: 'PLL', solved: 'Solved' }[p.phase] || 'F2L') : 'Solving';
    else if (snap.phase === 'done') label = 'Solved';
    setText($('#brain-phase-label'), label);
    if (snap.phase === 'inspecting' && snap.inspection) {
      const remaining = snap.inspection.remainingMs;
      setText($('#brain-phase-detail'), remaining != null ? `Inspect — ${(remaining / 1000).toFixed(1)}s left (clock starts on your first move)` : 'Inspect — start solving on your first move');
    } else {
      const moves = snap.phase === 'done' && snap.record ? snap.record.moveCount : (snap.solveMoveCount ?? 0);
      const msElapsed = (snap.phase === 'done' ? snap.record?.solveMs : snap.elapsedMs) ?? 0;
      const tps = msElapsed > 0 ? (moves / (msElapsed / 1000)).toFixed(2) : '0.00';
      const pairs = p.f2lDone ? '4/4' : p.crossDone ? `${p.pairsSolved ?? 0}/4 pairs` : '';
      setText($('#brain-phase-detail'), (snap.phase === 'solving' || snap.phase === 'done')
        ? `${moves} turn${moves === 1 ? '' : 's'} · ${tps} TPS · ${(msElapsed / 1000).toFixed(2)}s${pairs ? ' · ' + pairs : ''}`
        : snap.phase === 'applying' ? `Scramble turn ${Math.min(snap.applyStep + 1, snap.applyTotal)} of ${snap.applyTotal}.`
        : 'Cross is detected from the first face you solve.');
    }
    renderReview();
  }

  // End-game review: stats in the middle + cube snapshots at key moments + hindsight.
  let snapshots = [];
  let lastCapturedStage = -1;
  let reviewKey = null;      // { record, stats } the review panel was last built for
  function captureSnapshot(label) {
    const state = cubeSession.getSnapshot().state;
    if (!state) return;
    snapshots.push({ label, at: Date.now(), render: toRenderData(state) });
    snapshots = snapshots.slice(-12);
  }
  function renderReview() {
    const snap = live.getSnapshot();
    const panel = $('#brain-review');
    if (snap.phase !== 'done' || !snap.record) { panel.hidden = true; if (panel.firstChild) panel.replaceChildren(); reviewKey = null; return; }
    const r = snap.record;
    // The tracker re-emits while done; rebuild (and replay the card's entry animation) only
    // for a new record or when the stored solves change (the stats row), not on every emit.
    const key = [records.length, records[records.length - 1]?.solveMs];
    if (reviewKey && reviewKey.record === r && reviewKey.stats === key.join('|')) return;
    reviewKey = { record: r, stats: key.join('|') };
    const s = summarize(records);
    panel.hidden = false;
    panel.innerHTML = `
      <div class="brain-review-card">
        <p class="eyebrow">Solve complete</p>
        <h2>${ms(r.solveMs)} · ${r.moveCount} moves · ${r.tps?.toFixed(2) ?? '—'} TPS</h2>
        <div class="brain-review-stats"><span>Solves ${s.solvedCount ?? 0}</span><span>Best ${ms(s.bestSolveMs)}</span><span>ao5 ${ms(ao5(records))}</span><span>ao12 ${ms(ao12(records))}</span></div>
        <div class="brain-review-hindsight" id="brain-review-hindsight"></div>
        <button class="brain-button" id="brain-review-close" type="button">Continue</button>
      </div>`;
    // Hindsight lines reuse the coach lenses on the FINAL state/snapshots (a light version; full per-pair
    // solver hindsight is the follow-up). Show a couple of insights the coach already had.
    const hindsight = [];
    if (r.crossMoveCount != null && optimalCross && r.crossMoveCount > optimalCross.length)
      hindsight.push({ tone: 'warn', text: `Your cross took ${r.crossMoveCount} moves; an optimal ${FACE_COLORS[optimalCross.face]} cross here is ${optimalCross.length}.` });
    if (r.xcross) hindsight.push({ tone: 'good', text: `Extended cross: ${r.xcross === 'xxcross' ? 'double X-cross' : 'X-cross'} built with the cross.` });
    if (r.rotations > 2) hindsight.push({ tone: 'warn', text: `${r.rotations} whole-cube rotation${r.rotations === 1 ? '' : 's'} — fewer rotations often save time.` });
    $('#brain-review-hindsight').innerHTML = hindsight.length
      ? hindsight.map(h => `<p class="brain-coach-line brain-coach-${h.tone}">${escape(h.text)}</p>`).join('')
      : '<p class="brain-coach-line brain-coach-muted">No key-moment insights for this solve. Snapshots and per-pair hindsight arrive with the F2L solver lens.</p>';
    // Bind the close button now that it exists (once).
    const closeBtn = panel.querySelector('#brain-review-close');
    if (closeBtn && !closeBtn.dataset.bound) { closeBtn.dataset.bound = '1'; closeBtn.addEventListener('click', () => { panel.hidden = true; live.cancel(); $('#brain-start').hidden = false; $('#brain-stop').hidden = true; }); }
  }

  function renderMetrics() {
    const s = summarize(records);
    const cells = [
      ['Solves', s.solvedCount ?? 0],
      ['Best', ms(s.bestSolveMs)],
      ['ao5', ms(ao5(records))],
      ['ao12', ms(ao12(records))],
      ['Median TPS', s.medianTPS?.toFixed(2) ?? '—'],
      ['Median moves', s.medianMoveCount ?? '—'],
    ];
    $('#brain-metrics-grid').innerHTML = cells.map(([k, v]) => `<article class="brain-metric"><span>${k}</span><strong>${v}</strong></article>`).join('');
  }

  function onLive(snap) {
    if (!active) return;
    // Record a skip before rendering so its timeline marker shows on this emit.
    const skipInfo = snap.progress?.skip;
    if (skipInfo && !skips.some(s => s.kind === skipInfo.kind && s.label === skipInfo.label)) {
      skips.push({ names: STAGE_NAMES_FOR_SKIP[skipInfo.kind] || [], kind: skipInfo.kind, label: skipInfo.label });
      skips = skips.slice(-8);
    }
    renderTimeline();
    renderCoach();
    renderApplyGuide();
    refreshScrambleState();
    // Capture a cube snapshot at each stage transition for the end-game review, labelled
    // with the stage just completed (the index is the stage now being worked on).
    const stage = stageIndex(snap.progress, snap.phase);
    if (snap.phase !== 'solving' && snap.phase !== 'done') lastCapturedStage = -1;
    else if (snap.phase === 'solving' && stage !== lastCapturedStage) {
      lastCapturedStage = stage;
      captureSnapshot(stage > 0 ? `${solveMethod.stages[stage - 1]} done` : 'Start');
    }
    // The tracker re-emits while 'done' (e.g. toggling inspection/pseudo), so key the
    // save on the record object: each finished solve is stored exactly once.
    if (snap.phase === 'done' && snap.record && snap.record !== savedRecord) {
      savedRecord = snap.record;
      records = appendSolve(localStorage, records, snap.record);
      renderMetrics();
      renderReview();   // refresh the stats row with this solve (before optimalCross is cleared)
      message(`Solve logged · ${ms(snap.record.solveMs)} · ${snap.record.moveCount} moves.`);
      optimalCross = null;
    }
  }

  // --- Wiring -----------------------------------------------------------------------------------
  $('#brain-connect').addEventListener('click', () => { void cubeSession.connect(); });
  $('#brain-sync').addEventListener('click', () => { void cubeSession.syncSolved().catch(() => {}); });
  $('#brain-recenter').addEventListener('click', () => { cube?.recenterGyro(); message('Cube motion recentered.'); });
  $('#brain-disconnect').addEventListener('click', () => { void cubeSession.disconnect(); });
  $('#brain-reset-view').addEventListener('click', () => cube?.resetView());
  $('#brain-generate').addEventListener('click', async () => {
    const button = $('#brain-generate');
    const original = button.textContent;
    button.disabled = true; button.textContent = 'Generating…';
    showError('');
    try {
      const mod = await (scrambleLoad || import('./scramble.js'));
      scrambleLoad = Promise.resolve(mod);
      $('#brain-scramble').value = await mod.generateWcaScramble();
    } catch (error) {
      showError(`Could not generate a scramble: ${error.message}`);
    } finally {
      button.textContent = original;
      refreshScrambleState();
    }
  });
  $('#brain-start').addEventListener('click', async () => {
    showError('');
    const mode = root.querySelector('[data-brain-mode].active')?.dataset.brainMode;
    const sessionSnap = cubeSession.getSnapshot();
    if (sessionSnap.phase !== 'tracking') { showError('Connect and sync a solved cube first.'); return; }
    if (mode === 'guided') {
      // No manual entry needed: auto-generate a WCA scramble if none is set.
      let scramble = $('#brain-scramble').value.trim();
      if (!scramble) {
        const button = $('#brain-start'); const original = button.textContent;
        button.disabled = true; button.textContent = 'Generating…';
        try {
          const mod = await (scrambleLoad || import('./scramble.js'));
          scrambleLoad = Promise.resolve(mod);
          scramble = await mod.generateWcaScramble();
          $('#brain-scramble').value = scramble;
        } catch (error) { showError(`Could not generate a scramble: ${error.message}`); button.disabled = false; button.textContent = original; return; }
        finally { button.disabled = false; button.textContent = original; }
      }
      try { live.startGuided(scramble); void suggestCrossFor(scramble); skips = []; }
      catch (error) { showError(error.message); return; }
    } else {
      try { live.startFree(); } catch (error) { showError(error.message); return; }
      skips = [];
      void suggestCrossFor(cubeSession.getSnapshot().moves.join(' '));
    }
    $('#brain-start').hidden = true;
    $('#brain-stop').hidden = false;
    message('Scramble ready — inspect, then start solving on your first move. The clock starts when you turn.');
  });
  $('#brain-start-custom').addEventListener('click', () => {
    const scramble = $('#brain-scramble').value.trim();
    if (!scramble) { showError('Paste a scramble first.'); return; }
    const sessionSnap = cubeSession.getSnapshot();
    if (sessionSnap.phase !== 'tracking') { showError('Connect and sync a solved cube first.'); return; }
    try { live.startGuided(scramble); void suggestCrossFor(scramble); $('#brain-start').hidden = true; $('#brain-stop').hidden = false; skips = []; }
    catch (error) { showError(error.message); }
  });
  $('#brain-stop').addEventListener('click', () => { live.cancel(); $('#brain-start').hidden = false; $('#brain-stop').hidden = true; optimalCross = null; renderCoach(); renderTimeline(); });
  root.querySelectorAll('[data-brain-mode]').forEach(btn => btn.addEventListener('click', () => {
    root.querySelectorAll('[data-brain-mode]').forEach(b => b.classList.toggle('active', b === btn));
    const guided = btn.dataset.brainMode === 'guided';
    $('#brain-guided-wrap').hidden = !guided;
    $('#brain-start').textContent = guided ? 'Start guided' : 'Start free';
  }));
  root.querySelectorAll('[data-brain-method]').forEach(btn => btn.addEventListener('click', () => {
    root.querySelectorAll('[data-brain-method]').forEach(b => b.classList.toggle('active', b === btn));
    solveMethod = getMethod(btn.dataset.brainMethod);
    try { localStorage.setItem('cubesight-brain-method', solveMethod.id); } catch { /* keep in memory */ }
    renderTimeline();
  }));
  (function restoreMethod() {
    let id = DEFAULT_METHOD; try { id = localStorage.getItem('cubesight-brain-method') || DEFAULT_METHOD; } catch { /* ignore */ }
    solveMethod = getMethod(id);
    root.querySelectorAll('[data-brain-method]').forEach(b => b.classList.toggle('active', b.dataset.brainMethod === solveMethod.id));
  })();
  root.querySelectorAll('[data-brain-cross]').forEach(btn => btn.addEventListener('click', () => {
    root.querySelectorAll('[data-brain-cross]').forEach(b => b.classList.toggle('active', b === btn));
    crossKind = btn.dataset.brainCross;
    try { localStorage.setItem('cubesight-brain-cross', JSON.stringify(crossKind)); } catch { /* keep in memory */ }
    const scramble = $('#brain-scramble').value.trim();
    if (scramble) void suggestCrossFor(scramble);
  }));
  (function restoreCrossKind() {
    root.querySelectorAll('[data-brain-cross]').forEach(b => b.classList.toggle('active', b.dataset.brainCross === crossKind));
  })();
  $('#brain-pseudo').addEventListener('change', event => {
    live?.setPseudo(event.target.checked);
    try { localStorage.setItem('cubesight-brain-pseudo', String(event.target.checked)); } catch { /* keep in memory */ }
  });
  $('#brain-inspection').addEventListener('change', event => { live?.setInspection({ enabled: event.target.checked }); try { localStorage.setItem('cubesight-brain-inspection', String(event.target.checked)); } catch {} });
  (function restorePseudo() {
    let saved = false; try { saved = localStorage.getItem('cubesight-brain-pseudo') === 'true'; } catch { /* ignore */ }
    const cb = $('#brain-pseudo'); if (cb) { cb.checked = saved; live?.setPseudo(saved); }
  })();
  (function restoreInspection() {
    let saved = true; try { saved = localStorage.getItem('cubesight-brain-inspection') !== 'false'; } catch { /* ignore */ }
    const cb = $('#brain-inspection'); if (cb) { cb.checked = saved; live?.setInspection({ enabled: saved }); }
  })();
  $('#brain-toggles').addEventListener('change', event => {
    const input = event.target.closest('[data-brain-toggle]');
    if (!input) return;
    toggle(input.dataset.brainToggle, input.checked);
    renderCoach();
  });
  $('#brain-export').addEventListener('click', () => {
    try {
      const blob = new Blob([serializeExport(exportAll(localStorage))], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `cubesight-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      $('#brain-port-status').textContent = 'Exported a backup of your local data.';
    } catch (error) { $('#brain-port-status').textContent = `Export failed: ${error.message}`; }
  });
  $('#brain-import').addEventListener('click', () => $('#brain-import-file').click());
  $('#brain-import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseImport(text);
      importAll(localStorage, parsed, { clearOwned: false });
      records = loadSolves(localStorage);
      renderMetrics();
      $('#brain-port-status').textContent = 'Imported. Metrics refreshed. Reload to update all trainers.';
    } catch (error) { $('#brain-port-status').textContent = `Import failed: ${error.message}`; }
    event.target.value = '';
  });

  renderToggles();
  renderMetrics();
  renderTimeline();
  renderCoach();
  // Pre-warm the (heavy) WCA scramble loader so the first click is instant.
  scrambleLoad = import('./scramble.js').then(m => m).catch(() => null);

  // Capture browser-side errors so they can be sent along with the log.
  const runtimeErrors = [];
  const onWindowError = e => runtimeErrors.push(String(e.error?.stack || e.message || e).slice(0, 500));
  const onUnhandledRejection = e => runtimeErrors.push('unhandledrejection: ' + String(e.reason?.stack || e.reason || e).slice(0, 500));
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  let detached = false;
  const unsubSession = cubeSession.subscribe(onSession);
  const unsubLive = live.subscribe(onLive);

  // The log holds up to 2000 lines and grows on every cube event: rebuild it at
  // most once per frame, and only while the diagnostics panel is open.
  let pendingLog = null;
  let logFrame = 0;
  function paintConnectionLog() {
    logFrame = 0;
    const entries = pendingLog;
    if (detached || !entries || !$('.brain-diagnostics')?.open) return;
    pendingLog = null;
    $('#brain-connection-log').innerHTML = entries.length ? entries.map(e => `<li class="brain-log-item brain-log-${e.kind || 'info'}"><span class="brain-log-time">${new Date(e.at).toLocaleTimeString()}</span><span>${escape(e.label)}</span></li>`).join('') : '<li class="brain-log-muted">No connection attempts yet in this session.</li>';
  }
  function renderConnectionLog(entries) {
    pendingLog = entries;
    if (!logFrame) logFrame = requestAnimationFrame(paintConnectionLog);
  }
  $('.brain-diagnostics')?.addEventListener('toggle', () => { pendingLog ??= getConnectionLog(); paintConnectionLog(); });
  const unsubConnectionLog = subscribeConnection(renderConnectionLog);
  $('#brain-clear-log').addEventListener('click', () => { clearConnectionLog(); });
  // Send to dev posts to the dev server's /__devlog sink, which production lacks.
  if (!import.meta.env?.DEV) $('#brain-send-log').hidden = true;
  $('#brain-send-log').addEventListener('click', async () => {
    if (!import.meta.env?.DEV) return;
    const status = $('#brain-send-status');
    status.textContent = 'Sending…';
    const log = getConnectionLog();
    const redact = text => String(text || '').replace(/([\da-f]{2}:){5}[\da-f]{2}/gi, 'XX:XX:XX:XX:XX:XX');
    const payload = JSON.stringify({
      at: Date.now(),
      href: location.href,
      ua: navigator.userAgent,
      session: { phase: cubeSession.getSnapshot().phase, deviceName: cubeSession.getSnapshot().deviceName, protocol: cubeSession.getSnapshot().protocol },
      connectionLog: log.map(e => ({ ...e, label: redact(e.label) })),
      runtimeErrors: runtimeErrors.slice(-20).map(redact),
      toggles,
    });
    try {
      const res = await fetch('/__devlog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
      status.textContent = res.ok ? 'Sent — the agent can read the log now.' : `Send failed: HTTP ${res.status}`;
    } catch (error) { status.textContent = `Send failed: ${error.message}`; }
  });
  $('#brain-clear-cube').addEventListener('click', () => {
    clearSavedCubeData();
    message('Saved cube address cleared. Connect again to derive it from scratch.');
  });
  // Always-on input recording: Save / Start fresh / Load (replay into this view).
  attachBrainRecording({
    root, live, cubeSession,
    getContext: () => ({ toggles, method: solveMethod.id, crossKind }),
    onSolvesRestored: () => { records = loadSolves(localStorage); renderMetrics(); },
  });

  $('#brain-rebuild-view').addEventListener('click', () => rebuild());
  return {
    setActive(value) { if (detached) return; active = value; if (!value) { live.cancel(); $('#brain-start').hidden = false; $('#brain-stop').hidden = true; } },
    detach() {
      if (detached) return; detached = true;
      active = false;
      unsubSession();
      unsubLive();
      unsubConnectionLog();
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      live?.cancel();   // stops its inspection interval
      live?.detach();
      cube?.destroy();  // releases the WebGL context and its render loop
      cube = null;
      root.innerHTML = '';
    },
  };
}
