import './brain.css';
import { createCube3D } from './cube-3d.js';
import { FACE_COLORS, toRenderData } from './cross-cube.js';
import { smartCube } from './smart-cube-bluetooth.js';
import { describeTurn, recoveryMoves } from './smart-cube-guidance.js';
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
  let skips = [];          // { stage, kind, label } — hurrahs marked on the timeline
  const STAGE_FOR_SKIP = { oll: 3, pll: 4, f2l: 2 };
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
            <p id="brain-phase-detail" class="brain-phase-detail">Cross is read from the bottom at your first move.</p>
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
    <details class="brain-diagnostics"><summary><span>Connection diagnostics</span><small>What the attach is doing — send to dev</small><i aria-hidden="true"></i></summary><div class="brain-connection-log-head"><div><p class="eyebrow">Connection log</p><h2>What the attach is doing</h2></div><div class="brain-log-actions"><button class="brain-button" id="brain-send-log" type="button" title="Send this log to the dev server so the agent can read it">Send to dev</button><button class="brain-button" id="brain-clear-log" type="button">Clear log</button></div></div><ol id="brain-connection-log" class="brain-log-list"></ol><p id="brain-send-status" role="status" aria-live="polite"></p></details>
    <details class="brain-coach-settings"><summary><span>Coach settings</span><small>Choose which insights appear</small><i aria-hidden="true"></i></summary><div id="brain-toggles" class="brain-toggles"></div><div class="brain-data-port"><span>Your data stays on this device.</span><button class="brain-button" id="brain-export" type="button">Export data</button><button class="brain-button" id="brain-import" type="button">Import data</button><input type="file" id="brain-import-file" accept="application/json,.json" hidden><p id="brain-port-status" role="status" aria-live="polite"></p></div></details>`;

  const $ = selector => root.querySelector(selector);

  try { cube = createCube3D($('#brain-cube'), { mode: 'scout' }); }
  catch (error) { $('#brain-cube').textContent = 'The Brain needs WebGL. Enable hardware acceleration or try another browser.'; }

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
  // The scramble flow under the cube is the single place the scramble is shown. The current move
  // carries a tooltip describing how to turn it (an affordance), replacing the old separate
  // turn-guide card the user disliked.
  function renderApplyGuide() {
    const snap = live.getSnapshot();
    const movesEl = $('#brain-moves');
    if (snap.phase !== 'applying') { if (movesEl) { movesEl.hidden = true; movesEl.innerHTML = ''; } return; }
    const held = cube?.getHeldFaces?.() ?? { bottom: 'D', front: 'F' };
    const scrambleMoves = snap.scrambleStr ? snap.scrambleStr.split(/\s+/).filter(Boolean) : [];
    if (snap.applyDetour.length) {
      // A wrong turn is folded into the scramble as an extra step (CubeStation-style):
      // show what to do next, not a 'undo your wrong turn', and the prior done moves animate away.
      const recovery = recoveryMoves(snap.applyDetour, held.bottom, held.front);
      if (movesEl) {
        movesEl.hidden = false;
        movesEl.innerHTML = `<p class="brain-moves-recovery">Off by ${snap.applyDetour.length}. Next do <strong>${escape(recovery.join(' '))}</strong>, then continue the scramble.</p>`;
      }
    } else {
      const move = scrambleMoves[snap.applyStep];
      if (movesEl) {
        movesEl.hidden = false;
        movesEl.innerHTML = scrambleMoves.map((m, i) => {
          const current = i === snap.applyStep;
          const c = current ? describeTurn(m, held.bottom, held.front) : null;
          return `<i class="${i < snap.applyStep ? 'done' : ''} ${current ? 'current' : ''}"${c ? ` title="${escape(c.text)}"` : ''}>${escape(m)}</i>`;
        }).join('');
      }
    }
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

  // Stage definitions for the bottom horizontal timeline. Labels are stage names only —
  // the live pair count lives in the phase detail, so F2L is never shown twice.
  const STAGES = ['Scramble', 'Cross', 'F2L', 'OLL', 'PLL', 'Solved'];
  function stageIndex(progress, phase) {
    const p = progress || {};
    if (phase === 'applying' || phase === 'inspecting') return 0;       // Scramble stage
    if (!p.crossDone) return 0;
    if (!p.f2lDone) return 1 + Math.min(3, Math.max(0, (p.pairsSolved ?? 0)) / 4 * 3 | 0); // inside F2L
    if (!p.ollDone) return 4;
    if (!p.solved) return 5;
    return 6;
  }
  function renderTimeline() {
    const snap = live.getSnapshot();
    const p = snap.progress || {};
    const current = stageIndex(p, snap.phase);
    const pct = (current / (STAGES.length - 1)) * 100;
    // A thin glowing line with a moving dot at the current stage (not chips).
    $('#brain-timeline').innerHTML = `
      <div class="brain-tl-line"><i style="width:${pct}%"></i></div>
      <div class="brain-tl-dot" style="left:${pct}%"></div>
      <div class="brain-tl-marks">${STAGES.map((label, i) => {
        const skip = skips.find(s => s.stage === i);
        const cls = skip ? 'skip' : '';
        const title = skip ? ` title="${escape(skip.label)}"` : '';
        return `<span class="${cls}" style="left:${(i / (STAGES.length - 1)) * 100}%"${title}>${label}${skip ? ' ★' : ''}</span>`;
      }).join('')}</div>`;
    let label = 'Connect and start a solve';
    if (snap.phase === 'applying') label = 'Perform the scramble';
    else if (snap.phase === 'inspecting') label = 'Inspection';
    else if (snap.phase === 'solving') label = p.phase ? ({ 'pre-cross': 'Building the cross', cross: 'Cross', 'f2l-0': 'F2L', 'f2l-1': 'F2L', 'f2l-2': 'F2L', 'f2l-3': 'F2L', 'f2l-4': 'F2L', 'oll': 'OLL', pll: 'PLL', solved: 'Solved' }[p.phase] || 'F2L') : 'Solving';
    else if (snap.phase === 'done') label = 'Solved';
    $('#brain-phase-label').textContent = label;
    if (snap.phase === 'inspecting' && snap.inspection) {
      const remaining = snap.inspection.remainingMs;
      $('#brain-phase-detail').textContent = remaining != null ? `Inspect — ${(remaining / 1000).toFixed(1)}s left (clock starts on your first move)` : 'Inspect — start solving on your first move';
    } else {
      const moves = snap.solveMoveCount ?? 0;
      const msElapsed = snap.elapsedMs ?? 0;
      const tps = msElapsed > 0 ? (moves / (msElapsed / 1000)).toFixed(2) : '0.00';
      const pairs = p.f2lDone ? '4/4' : p.crossDone ? `${p.pairsSolved ?? 0}/4 pairs` : '';
      $('#brain-phase-detail').textContent = (snap.phase === 'solving' || snap.phase === 'done')
        ? `${moves} turn${moves === 1 ? '' : 's'} · ${tps} TPS · ${(msElapsed / 1000).toFixed(2)}s${pairs ? ' · ' + pairs : ''}`
        : 'Scramble ready — start solving on your first move. The clock starts when you turn.';
    }
    renderReview();
  }

  // End-game review: stats in the middle + cube snapshots at key moments + hindsight.
  let snapshots = [];
  let lastCapturedStage = -1;
  function captureSnapshot(label) {
    const state = cubeSession.getSnapshot().state;
    if (!state) return;
    snapshots.push({ label, at: Date.now(), render: toRenderData(state) });
    snapshots = snapshots.slice(-12);
  }
  function renderReview() {
    const snap = live.getSnapshot();
    const panel = $('#brain-review');
    if (snap.phase !== 'done' || !snap.record) { panel.hidden = true; panel.innerHTML = ''; return; }
    const r = snap.record;
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
    renderTimeline();
    renderCoach();
    renderApplyGuide();
    refreshScrambleState();
    const skipInfo = snap.progress?.skip;
    if (skipInfo) {
      skips.push({ stage: STAGE_FOR_SKIP[skipInfo.kind] ?? 0, kind: skipInfo.kind, label: skipInfo.label });
      skips = skips.slice(-8);
    }
    // Capture a cube snapshot at each stage transition for the end-game review.
    const stage = stageIndex(snap.progress, snap.phase);
    if (snap.phase === 'solving' && stage !== lastCapturedStage) {
      lastCapturedStage = stage;
      captureSnapshot(STAGES[stage] || 'solve');
    }
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
      live.startFree();
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
    skips = [];
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
