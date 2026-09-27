import './brain.css';
import { createCube3D } from './cube-3d.js';
import { FACE_COLORS, toRenderData } from './cross-cube.js';
import { smartCube } from './smart-cube-bluetooth.js';
import { createSmartCubeTurnGuide } from './smart-cube-turn-guide.js';
import { createSolveLive } from './solve-live.js';
import { generateWcaScramble } from './scramble.js';
import { crossSuggestion, crossHindsight, f2lNextPairHint, ollStage, pllLens, efficiencyScore } from './solve-coach.js';
import { analyze } from './solve-tracker.js';
import { loadSolves, appendSolve } from './solve-store.js';
import { summarize, ao5, ao12 } from './solve-metrics.js';

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
  moveFraction: false,     // move-fraction animation instead of arrows (WIP)
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
  let optimalCross = null;     // {face, length} from crossSuggestion during inspection
  let pendingSuggestion = null;

  root.innerHTML = `
    <section class="intro-row"><div><p class="eyebrow">Practice / Smart cube</p><h1>Brain</h1></div><p class="intro-copy">Connect your cube.<br>Solve. Learn what to fix.</p></section>
    <section class="brain-connection" aria-label="Smart cube connection">
      <div><strong id="brain-device">No cube connected</strong><p id="brain-status" role="status" aria-live="polite">Connect a smart cube to start a tracked solve.</p></div>
      <div class="brain-controls"><button class="brain-button" id="brain-connect">Connect cube</button><button class="brain-button" id="brain-sync" hidden>Sync solved cube</button><button class="brain-button" id="brain-recenter" hidden>Recenter motion</button><button class="brain-button" id="brain-disconnect" hidden>Disconnect</button></div>
    </section>
    <section class="brain-setup" aria-label="Solve setup">
      <div class="brain-mode" role="group" aria-label="Solve mode">
        <span class="control-label">Mode</span>
        <div class="segmented"><button class="segment active" data-brain-mode="guided">Guided scramble</button><button class="segment" data-brain-mode="free">Free scramble</button></div>
      </div>
      <div class="brain-scramble-wrap" id="brain-guided-wrap">
        <label for="brain-scramble">Scramble</label>
        <textarea id="brain-scramble" rows="2" spellcheck="false" autocomplete="off" placeholder="Generate a WCA scramble, or paste one…"></textarea>
        <button class="brain-button" id="brain-generate">New WCA scramble</button>
      </div>
      <button class="primary-button" id="brain-start">Start guided</button>
      <button class="brain-button" id="brain-stop" hidden>Stop</button>
      <p id="brain-error" class="brain-error" role="alert" hidden></p>
    </section>
    <section class="trainer-shell brain-shell">
      <div class="cube-stage">
        <div class="stage-topline"><span class="status-dot"><i></i> Live cube</span><span class="view-lock">Free tumble</span></div>
        <div id="brain-cube" class="cube-mount"></div>
        <div class="cube-caption"><span id="brain-view-caption">White top · Green front</span><button class="text-button" id="brain-reset-view">Reset view</button></div>
        <div id="brain-turn-guide" hidden></div>
      </div>
      <div class="brain-side">
        <div class="brain-phase" aria-live="polite">
          <p class="eyebrow">Solve phase</p>
          <h2 id="brain-phase-label">Connect and start a solve</h2>
          <div id="brain-timeline" class="brain-timeline"></div>
          <p id="brain-phase-detail" class="brain-phase-detail">Cross is detected from the face on the bottom at your first solving move.</p>
        </div>
        <div id="brain-coach" class="brain-coach" aria-live="polite"></div>
      </div>
    </section>
    <section class="brain-metrics" aria-label="Your solve metrics">
      <div class="section-heading"><div><p class="eyebrow">Progress</p><h2>Your metrics</h2></div></div>
      <div class="brain-metrics-grid" id="brain-metrics-grid"></div>
      <p class="brain-footnote">All data stays on this device. Nothing is sent to a server. Export and import your data from the settings menu.</p>
    </section>
    <details class="brain-debug">
      <summary><span>Coach &amp; visual debug menu</span><small>Toggle every affordance to inspect it</small><i aria-hidden="true"></i></summary>
      <div id="brain-toggles" class="brain-toggles"></div>
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
    $('#brain-status').textContent = supported ? snapshot.detail + (gyroLive ? ' Hold the cube as shown and tap Recenter motion to align.' : '') : 'Web Bluetooth needs Chrome or Edge on Android/desktop over HTTPS.';
    $('#brain-connect').hidden = snapshot.phase !== 'disconnected';
    $('#brain-connect').disabled = !supported;
    $('#brain-sync').hidden = !connected;
    $('#brain-recenter').hidden = !gyroLive;
    $('#brain-disconnect').hidden = snapshot.phase === 'disconnected';
    const tracking = snapshot.phase === 'tracking';
    $('#brain-scramble').readOnly = tracking;
    $('#brain-generate').disabled = tracking;
  }

  function onSession(snapshot) {
    const gyro = snapshot.protocol?.startsWith('GAN') ? snapshot.gyro : null;
    if (gyro !== lastGyro) { cube?.setGyroOrientation(gyro); lastGyro = gyro; }
    const key = [snapshot.phase, snapshot.detail, snapshot.deviceName, snapshot.protocol, Boolean(gyro)].join('|');
    if (key !== lastStatusKey) { renderConnection(snapshot); lastStatusKey = key; }
    if (snapshot.phase === 'tracking' && live.getSnapshot().phase !== 'solving' && live.getSnapshot().phase !== 'applying') {
      // Mirror the live cube whenever we are not mid-solve so the user can inspect.
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
  function renderCoach() {
    const snap = live.getSnapshot();
    const sessionSnap = cubeSession.getSnapshot();
    const state = sessionSnap.state;
    const crossFace = snap.crossFace;
    const lines = [];
    if (snap.phase === 'applying') {
      lines.push({ tone: 'info', text: 'Perform the scramble shown in the cue. A wrong turn shows the return path without discarding the attempt.' });
    } else if (snap.phase === 'solving' && crossFace && state) {
      if (toggles.crossSuggest && optimalCross) {
        lines.push({ tone: 'info', text: `Optimal cross here: ${title(FACE_COLORS[optimalCross.face])} face in ${optimalCross.length} move${optimalCross.length === 1 ? '' : 's'}.` });
      }
      const a = analyze(state, crossFace);
      if (toggles.crossHindsight && snap.crossMoveCount != null && optimalCross) {
        const h = crossHindsight(snap.crossMoveCount, optimalCross.length, crossFace);
        if (h) lines.push({ tone: h.kind === 'optimal' ? 'good' : 'warn', text: h.text });
      }
      if (a.crossDone && !a.f2lDone && toggles.f2lHint) {
        const hint = f2lNextPairHint(state, crossFace);
        if (hint) lines.push({ tone: 'info', text: hint.text });
      }
      if (toggles.ollStage && a.f2lDone && !a.ollDone) {
        const stage = ollStage(state, crossFace);
        lines.push({ tone: 'info', text: stage.eoDone ? 'Edges oriented — orient the corners (2-look OLL).' : 'Orient the last-layer edges first (2-look OLL).' });
      }
      if (toggles.pllLens && a.ollDone && !a.solved) {
        const pll = pllLens(state, crossFace);
        if (pll?.name) lines.push({ tone: 'info', text: `PLL: ${pll.name} (${pll.family}). ${pll.cue}` });
      }
      if (toggles.rotationFlag && snap.rotations > 2) {
        lines.push({ tone: 'warn', text: `${snap.rotations} whole-cube rotation${snap.rotations === 1 ? '' : 's'} this solve — fewer rotations often save time.` });
      }
      if (toggles.efficiencyScore) {
        const score = efficiencyScore({ userCrossMoves: snap.crossMoveCount ?? 0, optimalCrossMoves: optimalCross?.length ?? null, rotations: snap.rotations, solved: a.solved, f2lPairs: a.pairsSolved, ollDone: a.ollDone });
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
    const a = snap.prev;
    const steps = [
      { key: 'cross', label: 'Cross', done: a?.crossDone },
      { key: 'f2l', label: `F2L ${a?.pairsSolved ?? 0}/4`, done: a?.f2lDone },
      { key: 'oll', label: 'OLL', done: a?.ollDone },
      { key: 'pll', label: 'PLL', done: a?.solved },
    ];
    $('#brain-timeline').innerHTML = steps.map(s => `<i class="${s.done ? 'done' : ''}"><span>${s.label}</span></i>`).join('');
    let label = 'Connect and start a solve';
    if (snap.phase === 'applying') label = 'Perform the scramble…';
    else if (snap.phase === 'solving') label = a?.solved ? 'Solved' : (a?.ollDone ? 'PLL' : (a?.f2lDone ? 'OLL' : (a?.crossDone ? `F2L · ${a.pairsSolved}/4 pairs` : 'Building the cross')));
    else if (snap.phase === 'done') label = 'Solved';
    $('#brain-phase-label').textContent = label;
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
    try { $('#brain-scramble').value = await generateWcaScramble(); }
    catch (error) { showError(`Could not generate a scramble: ${error.message}`); }
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
  $('#brain-toggles').addEventListener('change', event => {
    const input = event.target.closest('[data-brain-toggle]');
    if (!input) return;
    toggle(input.dataset.brainToggle, input.checked);
    renderCoach();
  });

  renderToggles();
  renderMetrics();
  renderTimeline();
  renderCoach();
  cubeSession.subscribe(onSession);
  live.subscribe(onLive);

  return {
    setActive(value) {
      active = value;
      if (!value) { live.cancel(); $('#brain-start').hidden = false; $('#brain-stop').hidden = true; }
    },
  };
}
