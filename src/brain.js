import './brain.css';
import { createCube3D } from './cube-3d.js';
import { FACE_COLORS, toRenderData } from './cross-cube.js';
import { smartCube } from './smart-cube-bluetooth.js';
import { createSmartCubeTurnGuide } from './smart-cube-turn-guide.js';
import { recoveryMoves } from './smart-cube-guidance.js';
import { createSolveLive } from './solve-live.js';
import { crossSuggestion, crossHindsight, f2lNextPairHint, ollStage, pllLens, efficiencyScore } from './solve-coach.js';
import { loadSolves, appendSolve } from './solve-store.js';
import { summarize, ao5, ao12 } from './solve-metrics.js';
import { exportAll, serializeExport, parseImport, importAll } from './data-port.js';
import { subscribeConnection, clearConnectionLog, getConnectionLog } from './smart-cube-diag.js';
import { clearSavedCubeData } from './smart-cube-bluetooth.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const title = color => color[0].toUpperCase() + color.slice(1);
const ms = value => value == null ? '—' : `${(value / 1000).toFixed(2)}s`;
const TOGGLE_STORE = 'cubesight-brain-toggles-v1';

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
  autoCross: true,         // detect cross from the held bottom at first move
};

function loadToggles() {
  try { return { ...DEFAULT_TOGGLES, ...JSON.parse(localStorage.getItem(TOGGLE_STORE)) }; } catch { return { ...DEFAULT_TOGGLES }; }
}
function saveToggles(toggles) {
  try { localStorage.setItem(TOGGLE_STORE, JSON.stringify(toggles)); } catch { /* keep in memory */ }
}

export function createBrain(root, cubeSession = smartCube) {
  let toggles = loadToggles();
  let records = loadSolves(localStorage);
  let active = true;
  let cube = null;
  let live = null;
  let lastGyro = null;
  let lastStatusKey = '';
  let lastMirroredMove = null;
  let lastMirroredLen = 0;
  let scrambleLoad = null;
  let optimalCross = null;     // {face, length} from crossSuggestion during inspection
  let pendingSuggestion = null;
  let crossKind = 'cross';   // cross | xcross | xxcross — solve target chosen in setup
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
        <div id="brain-cube" class="cube-mount"></div>
        <div class="cube-caption"><span id="brain-view-caption">White top · Green front</span></div>
        <div id="brain-turn-guide" hidden></div>
        <div id="brain-moves" class="brain-moves" aria-label="Scramble moves" hidden></div>
      </div>
      <aside class="brain-hud">
        <section class="brain-connection" aria-label="Smart cube connection">
          <div><strong id="brain-device">No cube connected</strong><p id="brain-status" role="status" aria-live="polite">Connect a smart cube to start a tracked solve.</p></div>
          <div class="brain-controls"><button class="brain-button" id="brain-connect">Connect cube</button><button class="brain-button" id="brain-sync" hidden>Sync solved cube</button><button class="brain-button" id="brain-recenter" hidden>Recenter motion</button><button class="brain-button" id="brain-disconnect" hidden>Disconnect</button><button class="brain-button" id="brain-clear-cube" hidden>Clear saved cube</button></div>
        </section>
        <section class="brain-setup" aria-label="Solve setup">
          <div class="brain-setup-row">
            <div class="brain-mode" role="group" aria-label="Solve mode">
              <span class="control-label">Mode</span>
              <div class="segmented"><button class="segment active" data-brain-mode="guided">Guided</button><button class="segment" data-brain-mode="free">Free</button></div>
            </div>
            <div class="brain-cross-kind" role="group" aria-label="Cross style">
              <span class="control-label">Cross</span>
              <div class="segmented"><button class="segment active" data-brain-cross="cross">Cross</button><button class="segment" data-brain-cross="xcross">X-cross</button><button class="segment" data-brain-cross="xxcross">Double X</button></div>
            </div>
            <label class="brain-pseudo-toggle"><input type="checkbox" id="brain-pseudo"><span>Pseudo F2L · D-shift</span></label>
          </div>
          <div class="brain-scramble-wrap" id="brain-guided-wrap">
            <textarea id="brain-scramble" rows="2" spellcheck="false" autocomplete="off" placeholder="Generate a WCA scramble, or paste one…"></textarea>
            <button class="brain-button" id="brain-generate">New WCA scramble</button>
          </div>
          <div class="brain-setup-actions"><button class="primary-button" id="brain-start">Start guided</button><button class="brain-button" id="brain-stop" hidden>Stop</button><button class="brain-button" id="brain-rebuild-view" type="button" title="Rebuild this view without reloading the page (keeps the cube connected)">Reset view</button></div>
          <p id="brain-error" class="brain-error" role="alert" hidden></p>
        </section>
        <section class="brain-phase" aria-live="polite">
          <p class="eyebrow">Solve phase</p>
          <h2 id="brain-phase-label">Connect and start a solve</h2>
          <div id="brain-timeline" class="brain-timeline"></div>
          <p id="brain-phase-detail" class="brain-phase-detail">Cross is detected from the face on the bottom at your first solving move.</p>
        </section>
        <div id="brain-coach" class="brain-coach" aria-live="polite"></div>
        <section class="brain-metrics" aria-label="Your solve metrics">
          <div class="brain-metrics-grid" id="brain-metrics-grid"></div>
          <p class="brain-footnote">All data stays on this device. Nothing is sent to a server.</p>
        </section>
        <details class="brain-coach-settings">
          <summary><span>Coach settings</span><small>Choose which insights appear</small><i aria-hidden="true"></i></summary>
          <div id="brain-toggles" class="brain-toggles"></div>
          <div class="brain-data-port">
            <span>Your data stays on this device.</span>
            <button class="brain-button" id="brain-export" type="button">Export data</button>
            <button class="brain-button" id="brain-import" type="button">Import data</button>
            <input type="file" id="brain-import-file" accept="application/json,.json" hidden>
            <p id="brain-port-status" role="status" aria-live="polite"></p>
          </div>
        </details>
      </aside>
    </section>
    <details class="brain-diagnostics">
      <summary><span>Connection diagnostics</span><small>What the attach is doing — send to dev</small><i aria-hidden="true"></i></summary>
      <div class="brain-connection-log-head"><div><p class="eyebrow">Connection log</p><h2>What the attach is doing</h2></div><div class="brain-log-actions"><button class="brain-button" id="brain-send-log" type="button" title="Send this log to the dev server so the agent can read it">Send to dev</button><button class="brain-button" id="brain-clear-log" type="button">Clear log</button></div></div>
      <ol id="brain-connection-log" class="brain-log-list"></ol>
      <p id="brain-send-status" role="status" aria-live="polite"></p>
    </details>`;

  const $ = selector => root.querySelector(selector);

  try { cube = createCube3D($('#brain-cube'), { mode: 'scout' }); }
  catch (error) { $('#brain-cube').textContent = 'The Brain needs WebGL. Enable hardware acceleration or try another browser.'; }

  const turnGuide = createSmartCubeTurnGuide($('#brain-turn-guide'), {
    onPrevious: () => { /* guided scramble has no manual prev during apply */ },
    onNext: () => { /* guided scramble auto-advances on physical turns */ },
  });

  live = createSolveLive(cubeSession, {
    getOrientation: () => (cube?.getHeldFaces?.() ?? { bottom: 'D', front: 'F' }),
  });

  function renderToggles() {
    $('#brain-toggles').innerHTML = Object.entries(toggles).map(([key, value]) =>
      `<label class="brain-toggle"><input type="checkbox" data-brain-toggle="${key}" ${value ? 'checked' : ''}><span>${key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</span></label>`).join('');
  }
  function toggle(key, value) { toggles[key] = value; saveToggles(toggles); }

  function showError(message) { const e = $('#brain-error'); e.textContent = message; e.hidden = !message; }
  function message(text) { $('#brain-status').textContent = text; }

  function renderConnection(snapshot) {
    const connected = snapshot.phase !== 'disconnected' && snapshot.phase !== 'connecting';
    const gyroLive = connected && snapshot.protocol?.startsWith('GAN') && Boolean(snapshot.gyro);
    const supported = Boolean(window.isSecureContext && navigator.bluetooth?.requestDevice);
    $('#brain-device').textContent = connected ? `${snapshot.deviceName}${snapshot.protocol ? ` · ${snapshot.protocol}` : ''}` : snapshot.phase === 'connecting' ? 'Smart cube · connecting' : 'No cube connected';
    const inline = $('#brain-device-inline');
    if (inline) inline.textContent = connected ? snapshot.deviceName : (snapshot.phase === 'connecting' ? 'connecting…' : 'No cube');
    $('#brain-status').textContent = supported ? snapshot.detail + (gyroLive ? ' Hold the cube as shown and tap Recenter motion to align.' : '') : 'Web Bluetooth needs Chrome or Edge on Android/desktop over HTTPS.';
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

  function onSession(snapshot) {
    if (detached) return;
    const gyro = snapshot.protocol?.startsWith('GAN') ? snapshot.gyro : null;
    if (gyro !== lastGyro) { cube?.setGyroOrientation(gyro); lastGyro = gyro; }
    const key = [snapshot.phase, snapshot.detail, snapshot.deviceName, snapshot.protocol, Boolean(gyro)].join('|');
    if (key !== lastStatusKey) { renderConnection(snapshot); lastStatusKey = key; }
    if (snapshot.phase !== 'tracking') { lastMirroredMove = null; lastMirroredLen = 0; return; }
    // The session publishes a snapshot on every event — including many gyro/
    // status updates per second — so we must NOT re-queue the last move on
    // each one, or a single physical turn re-animates forever. Dedup by the
    // move HISTORY LENGTH (not the move letter): a repeated move like R then R
    // still grows the history, so it animates, while gyro updates do not.
    if (snapshot.moves.length !== lastMirroredLen) {
      lastMirroredLen = snapshot.moves.length;
      lastMirroredMove = snapshot.lastMove;
      if (snapshot.lastMove) cube?.queueLiveMove(snapshot.lastMove, toRenderData(snapshot.state));
      else cube?.update(toRenderData(snapshot.state));
    }
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
  function renderApplyGuide() {
    const snap = live.getSnapshot();
    const guideEl = $('#brain-turn-guide');
    const movesEl = $('#brain-moves');
    if (snap.phase !== 'applying') { turnGuide.render({ mode: null }); if (movesEl) { movesEl.hidden = true; movesEl.innerHTML = ''; } return; }
    const held = cube?.getHeldFaces?.() ?? { bottom: 'D', front: 'F' };
    const scrambleMoves = snap.scrambleStr ? snap.scrambleStr.split(/\s+/).filter(Boolean) : [];
    if (snap.applyDetour.length) {
      // A wrong turn happened: show the inverse return path (what to do to get back).
      const recovery = recoveryMoves(snap.applyDetour, held.bottom, held.front);
      turnGuide.render({ mode: 'recovery', move: recovery[0], index: 0, total: recovery.length, bottom: held.bottom, front: held.front, recovery });
      if (movesEl) {
        movesEl.hidden = false;
        movesEl.innerHTML = `<p class="brain-moves-recovery">Off the scramble by ${snap.applyDetour.length} move${snap.applyDetour.length === 1 ? '' : 's'}. Do <strong>${escape(recovery.join(' '))}</strong> to get back, then continue.</p>`;
      }
    } else {
      const move = scrambleMoves[snap.applyStep];
      turnGuide.render({ mode: 'guide', move, index: snap.applyStep, total: scrambleMoves.length, bottom: held.bottom, front: held.front });
      // Showcase the whole algorithm with the current step highlighted.
      if (movesEl) {
        movesEl.hidden = false;
        movesEl.innerHTML = scrambleMoves.map((m, i) => `<i class="${i < snap.applyStep ? 'done' : ''} ${i === snap.applyStep ? 'current' : ''}">${escape(m)}</i>`).join('');
      }
    }
    // During guided application the cube advances by physical turns, so the manual ←/→ buttons are meaningless here.
    const actions = guideEl.querySelector('.smart-turn-actions');
    if (actions) actions.hidden = true;
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
        lines.push({ tone: 'warn', text: `${snap.rotations} whole-cube rotation${snap.rotations === 1 ? '' : 's'} this solve — fewer rotations often save time.` });
      }
      if (toggles.efficiencyScore) {
        const score = efficiencyScore({ userCrossMoves: snap.crossMoveCount ?? 0, optimalCrossMoves: optimalCross?.length ?? null, rotations: snap.rotations, solved: p.solved, f2lPairs: p.pairsSolved, ollDone: p.ollDone });
        lines.push({ tone: 'good', text: `Solve efficiency so far: ${score}/100.` });
      }
    } else if (snap.phase === 'done' && snap.record) {
      lines.push({ tone: 'good', text: `Solved in ${ms(snap.record.solveMs)} · ${snap.record.moveCount} moves · ${snap.record.tps?.toFixed(2) ?? '—'} TPS.` });
      if (snap.record.xcross) lines.push({ tone: 'good', text: `Extended cross: ${snap.record.xcross === 'xxcross' ? 'double X-cross' : 'X-cross'} built with the cross.` });
    }
    $('#brain-coach').innerHTML = lines.map(l => `<p class="brain-coach-line brain-coach-${l.tone}">${escape(l.text)}</p>`).join('') || '<p class="brain-coach-line brain-coach-muted">Coach insights appear here as you solve.</p>';
  }

  function renderTimeline() {
    const snap = live.getSnapshot();
    const p = snap.progress || {};
    const steps = [
      { key: 'cross', label: 'Cross', done: p.crossDone },
      { key: 'f2l', label: `F2L ${p.pairsSolved ?? 0}/4`, done: p.f2lDone },
      { key: 'oll', label: 'OLL', done: p.ollDone },
      { key: 'pll', label: 'PLL', done: p.solved },
    ];
    $('#brain-timeline').innerHTML = steps.map(s => `<i class="${s.done ? 'done' : ''}"><span>${s.label}</span></i>`).join('');
    let label = 'Connect and start a solve';
    if (snap.phase === 'applying') label = 'Perform the scramble…';
    else if (snap.phase === 'solving') label = p.phase ? ({ 'pre-cross': 'Building the cross', cross: 'Cross done', 'oll': 'OLL', pll: 'PLL', solved: 'Solved' }[p.phase] || `F2L · ${p.pairsSolved ?? 0}/4`) : 'Solving';
    else if (snap.phase === 'done') label = 'Solved';
    $('#brain-phase-label').textContent = label;
    // Live turn / time / TPS readout so it's obvious turns are being counted.
    const moves = snap.solveMoveCount ?? 0;
    const msElapsed = snap.elapsedMs ?? 0;
    const tps = msElapsed > 0 ? (moves / (msElapsed / 1000)).toFixed(2) : '0.00';
    $('#brain-phase-detail').textContent = (snap.phase === 'solving' || snap.phase === 'done')
      ? `${moves} turn${moves === 1 ? '' : 's'} · ${tps} TPS · ${(msElapsed / 1000).toFixed(2)}s`
      : 'Cross is detected from the face on the bottom at your first solving move.';
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
    renderTimeline();
    renderCoach();
    renderApplyGuide();
    refreshScrambleState();
    if (snap.phase === 'done' && snap.record) {
      records = appendSolve(localStorage, records, snap.record);
      renderMetrics();
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
      button.disabled = cubeSession.getSnapshot().phase === 'tracking';
      button.textContent = original;
    }
  });
  $('#brain-start').addEventListener('click', async () => {
    showError('');
    const mode = root.querySelector('[data-brain-mode].active')?.dataset.brainMode;
    const sessionSnap = cubeSession.getSnapshot();
    if (sessionSnap.phase !== 'tracking') { showError('Connect and sync a solved cube first.'); return; }
    if (mode === 'guided') {
      const scramble = $('#brain-scramble').value.trim();
      if (!scramble) { showError('Generate or paste a scramble first.'); return; }
      try { live.startGuided(scramble); void suggestCrossFor(scramble); }
      catch (error) { showError(error.message); return; }
    } else {
      live.startFree();
      // Best-effort cross suggestion from the user's own scramble (the moves
      // tracked since the solved baseline, up to the solve start).
      void suggestCrossFor(cubeSession.getSnapshot().moves.join(' '));
    }
    $('#brain-start').hidden = true;
    $('#brain-stop').hidden = false;
    message('Start solving when you begin turning. The cross is read from the bottom at your first move.');
  });
  $('#brain-stop').addEventListener('click', () => { live.cancel(); $('#brain-start').hidden = false; $('#brain-stop').hidden = true; optimalCross = null; renderCoach(); renderTimeline(); });
  root.querySelectorAll('[data-brain-mode]').forEach(btn => btn.addEventListener('click', () => {
    root.querySelectorAll('[data-brain-mode]').forEach(b => b.classList.toggle('active', b === btn));
    const guided = btn.dataset.brainMode === 'guided';
    $('#brain-guided-wrap').hidden = !guided;
    $('#brain-start').textContent = guided ? 'Start guided' : 'Start free';
  }));
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
  (function restorePseudo() {
    let saved = false; try { saved = localStorage.getItem('cubesight-brain-pseudo') === 'true'; } catch { /* ignore */ }
    const cb = $('#brain-pseudo'); if (cb) { cb.checked = saved; live?.setPseudo(saved); }
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
  window.addEventListener('error', e => runtimeErrors.push(String(e.error?.stack || e.message || e).slice(0, 500)));
  window.addEventListener('unhandledrejection', e => runtimeErrors.push('unhandledrejection: ' + String(e.reason?.stack || e.reason || e).slice(0, 500)));

  let detached = false;
  const unsubSession = cubeSession.subscribe(onSession);
  const unsubLive = live.subscribe(onLive);

  function renderConnectionLog(entries) {
    $('#brain-connection-log').innerHTML = entries.length ? entries.map(e => `<li class="brain-log-item brain-log-${e.kind || 'info'}"><span class="brain-log-time">${new Date(e.at).toLocaleTimeString()}</span><span>${escape(e.label)}</span></li>`).join('') : '<li class="brain-log-muted">No connection attempts yet in this session.</li>';
  }
  subscribeConnection(renderConnectionLog);
  $('#brain-clear-log').addEventListener('click', () => { clearConnectionLog(); });
  $('#brain-send-log').addEventListener('click', async () => {
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

  $('#brain-rebuild-view').addEventListener('click', () => {
    currentInstance = createBrain(root, cubeSession);
  });
  let currentInstance = {
    setActive(value) { active = value; if (!value) { live.cancel(); $('#brain-start').hidden = false; $('#brain-stop').hidden = true; } },
    detach() {
      if (detached) return; detached = true;
      active = false;
      unsubSession();
      unsubLive();
      live?.detach();
      root.innerHTML = '';
    },
    reset() {
      this.detach();
      return createBrain(root, cubeSession);
    },
  };
  return currentInstance;
}
