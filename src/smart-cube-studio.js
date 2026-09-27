import './smart-cube-studio.css';
import { createCube3D } from './cube-3d.js';
import { applyMoves, createSolvedState, parseScramble, randomScramble, sameCubeState, toRenderData } from './cross-cube.js';
import { followPlanTurn, inverseMove } from './smart-cube-guidance.js';
import { smartCube } from './smart-cube-bluetooth.js';
import { createSmartCubeTurnGuide } from './smart-cube-turn-guide.js';

const MAX_EVENTS = 100;
const solved = createSolvedState();

// A connection-first diagnostic space. The cube and scramble rehearsal only
// consume the shared device-neutral session, never a simulated move button.
export function createSmartCubeStudio(root, cubeSession = smartCube) {
  root.innerHTML = `
    <section class="intro-row"><div><p class="eyebrow">Practice / Smart cube</p><h1>Smart Cube Studio</h1></div><p class="intro-copy">Connect. Turn.<br>See what happened.</p></section>
    <section class="studio-connection" aria-label="Smart cube connection">
      <div><strong id="studio-device">No cube connected</strong><p id="studio-status" role="status">Connect a smart cube to inspect its events.</p></div>
      <div class="studio-controls"><button id="studio-connect" type="button">Connect cube</button><button id="studio-sync" type="button">Sync solved cube</button><button id="studio-disconnect" type="button">Disconnect</button></div>
    </section>
    <div class="studio-tabs" role="tablist" aria-label="Smart cube debug modes">
      <button id="studio-inspect-tab" role="tab" aria-controls="studio-inspect" aria-selected="true" type="button">Inspect tracking</button>
      <button id="studio-scramble-tab" role="tab" aria-controls="studio-scramble" aria-selected="false" type="button">Scramble rehearsal</button>
    </div>
    <div class="studio-layout">
      <section class="studio-stage" aria-label="Live smart cube">
        <div id="studio-cube" class="studio-cube"></div>
        <div class="studio-stage-footer"><span>Live cube · white top / green front at reset</span><button id="studio-reset-view" type="button">Reset view</button></div>
        <div id="studio-turn-guide" hidden></div>
      </section>
      <section id="studio-inspect" class="studio-panel" role="tabpanel" aria-labelledby="studio-inspect-tab">
        <p class="eyebrow">01 / observe</p><h2>What the cube reports</h2>
        <p>Turn your connected cube. This view separates the raw decoded event from the trusted state built after a solved sync.</p>
        <dl class="studio-readout">
          <div><dt>Last reported move</dt><dd id="studio-reported-move">—</dd></div>
          <div><dt>Tracked move history</dt><dd id="studio-move-count">0</dd></div>
          <div><dt>Gyro packets captured</dt><dd id="studio-gyro-count">0</dd></div>
          <div><dt>Last orientation (x, y, z, w)</dt><dd id="studio-orientation">—</dd></div>
          <div><dt>Wide-turn label</dt><dd id="studio-wide-status">Not reported separately</dd></div>
          <div><dt>Slice-turn label (M/E/S)</dt><dd id="studio-slice-status">Not reported separately</dd></div>
        </dl>
        <p class="studio-caveat">The current GAN decoder emits U/R/F/D/L/B face moves and gyro data, not a verified Uw or M gesture. A physical wide/slice turn may create several events. This screen shows those events without guessing their meaning.</p>
      </section>
      <section id="studio-scramble" class="studio-panel" role="tabpanel" aria-labelledby="studio-scramble-tab" hidden>
        <p class="eyebrow">02 / experiment</p><h2>Scramble rehearsal</h2>
        <p>Start with a physically solved, synced cube. The next turn advances only when the tracked cube reaches the expected state; a wrong turn shows a return path.</p>
        <label for="studio-scramble-input">Scramble to try</label>
        <textarea id="studio-scramble-input" rows="3" spellcheck="false"></textarea>
        <div class="studio-controls"><button id="studio-generate" type="button">Generate 12 moves</button><button id="studio-start" type="button">Start on real cube</button></div>
        <p id="studio-scramble-error" class="studio-error" role="alert" hidden></p>
        <p id="studio-scramble-status" class="studio-scramble-status" role="status"></p>
        <div id="studio-scramble-moves" class="studio-moves" aria-label="Scramble turns"></div>
        <p class="studio-caveat">This rehearses the face-turn stream the cube actually reports. It does not silently treat a physical wide or M turn as a verified single move.</p>
      </section>
    </div>
    <section class="studio-events" aria-label="Decoded device events">
      <div class="studio-events-head"><div><p class="eyebrow">Event stream</p><h2>What arrived</h2></div><div class="studio-controls"><button id="studio-copy" type="button">Copy diagnostic</button><button id="studio-clear" type="button">Clear log</button></div></div>
      <p>Every move is logged. Gyro samples are shown every 20 packets so they don’t bury turns; the gyro counter includes all packets. Times are relative to this capture.</p>
      <p id="studio-copy-status" role="status"></p>
      <ol id="studio-event-log" class="studio-event-log"><li>No device events captured yet.</li></ol>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  const cube = createCube3D($('#studio-cube'), { mode: 'scout' });
  cube.setFullTouchRotation(true);
  const turnGuide = createSmartCubeTurnGuide($('#studio-turn-guide'));
  let active = false;
  let mode = 'inspect';
  let snapshot = cubeSession.getSnapshot();
  let renderedSnapshot = null;
  let displayedState = null;
  let processedState = snapshot.state;
  let scramble = null;
  let run = null;
  let events = [];
  let captureStart = null;
  let gyroCount = 0;
  let lastRawMove = null;
  let sawWideLabel = false;
  let sawSliceLabel = false;
  let lastScrambleRenderKey = null;

  function expectedMove() {
    return run?.detour.length ? inverseMove(run.detour.at(-1)) : run?.moves[run.step];
  }
  function renderScramble() {
    const ready = snapshot.phase === 'tracking' && sameCubeState(snapshot.state, solved);
    const key = [active, mode, snapshot.phase, ready, Boolean(run), run?.step, run?.detour.join(' '), run?.complete,
      scramble?.moves.join(' '), snapshot.lastMove].join('|');
    if (key === lastScrambleRenderKey) return;
    lastScrambleRenderKey = key;
    $('#studio-start').disabled = !ready;
    $('#studio-scramble-status').textContent = run?.complete ? `Scramble complete · ${run.moves.length} turns matched on the real cube.`
      : run?.detour.length ? `Off route after ${snapshot.lastMove || 'a turn'}. Return with ${run.detour.slice().reverse().map(inverseMove).join(' ')}; the scramble stays active.`
        : run ? `Matched ${run.step} of ${run.moves.length}. Turn ${run.moves[run.step]} on your real cube.`
          : ready ? 'Cube is solved and synced. Start to track this scramble.'
            : snapshot.phase === 'tracking' ? 'Solve the physical cube, then start the scramble.'
              : 'Connect and sync a solved cube before starting.';
    const move = mode === 'scramble' && run && !run.complete ? expectedMove() : null;
    cube.setTurnHint(active ? move : null);
    turnGuide.render({ mode: move ? run?.detour.length ? 'recovery' : 'scramble-live' : null, move, index: run?.step || 0, total: run?.moves.length || 0,
      recovery: run?.detour.slice().reverse().map(inverseMove) || [] });
    $('#studio-turn-guide').hidden = !move;
    $('#studio-scramble-moves').replaceChildren(...(scramble?.moves || []).map((token, index) => {
      const chip = document.createElement('span');
      chip.textContent = token;
      chip.className = run && index < run.step ? 'done' : run && index === run.step && !run.complete ? 'next' : '';
      return chip;
    }));
  }
  function capture(event) {
    if (captureStart === null) captureStart = event.receivedAt;
    if (event.type === 'GYRO') {
      gyroCount += 1;
      $('#studio-gyro-count').textContent = String(gyroCount);
      const q = event.quaternion;
      if (q) $('#studio-orientation').textContent = [q.x, q.y, q.z, q.w].map(n => Number(n).toFixed(3)).join(', ');
      if (gyroCount % 20 !== 1) return;
    }
    if (event.type === 'MOVE') {
      lastRawMove = event.move;
      $('#studio-reported-move').textContent = event.move;
      if (/^[URFDLB]w/.test(event.move)) sawWideLabel = true;
      if (/^[MES]/.test(event.move)) sawSliceLabel = true;
      $('#studio-wide-status').textContent = sawWideLabel ? 'Raw label seen; tracker needs support' : 'Not reported separately';
      $('#studio-slice-status').textContent = sawSliceLabel ? 'Raw label seen; tracker needs support' : 'Not reported separately';
    }
    events.unshift(event);
    events = events.slice(0, MAX_EVENTS);
    const list = $('#studio-event-log');
    list.replaceChildren(...events.map((item) => {
      const row = document.createElement('li');
      const offset = ((item.receivedAt - captureStart) / 1000).toFixed(2);
      const details = item.type === 'MOVE' ? `${item.move} · serial ${item.serial ?? '—'} · face ${item.face ?? '—'} / dir ${item.direction ?? '—'} · cube ${item.cubeTimestamp ?? '—'} ms · local ${item.localTimestamp ?? '—'} ms`
        : item.type === 'GYRO' ? 'orientation sample'
          : item.type === 'FACELETS' ? `facelets ${String(item.facelets || '').slice(0, 54)}`
            : item.type === 'BATTERY' ? `${item.batteryLevel}%` : '';
      row.textContent = `+${offset}s  ${item.type}  ${details}`;
      return row;
    }));
  }
  function onSnapshot(next) {
    const previous = renderedSnapshot;
    snapshot = next;
    renderedSnapshot = next;
    if (!previous || next.deviceName !== previous.deviceName || next.protocol !== previous.protocol) {
      $('#studio-device').textContent = next.deviceName ? `${next.deviceName}${next.protocol ? ` · ${next.protocol}` : ''}` : 'No cube connected';
    }
    if (!previous || next.phase !== previous.phase || next.detail !== previous.detail) {
      $('#studio-status').textContent = `${next.phase} · ${next.detail}`;
    }
    if (!previous || next.moves.length !== previous.moves.length) $('#studio-move-count').textContent = String(next.moves.length);
    if (!previous || next.phase !== previous.phase) {
      $('#studio-connect').disabled = next.phase !== 'disconnected';
      $('#studio-sync').disabled = next.phase === 'disconnected' || next.phase === 'connecting';
      $('#studio-disconnect').disabled = next.phase === 'disconnected';
    }
    if (run && next.phase !== 'tracking') run = null;
    if (run && !run.complete && next.state !== processedState) {
      const progress = followPlanTurn(run.states, run.step, run.detour, next.state, next.lastMove);
      run.step = progress.step;
      run.detour = progress.detour;
      run.complete = run.step === run.moves.length && progress.onPlan;
    }
    processedState = next.state;
    if (!previous || next.state !== previous.state || next.phase !== previous.phase || next.lastMove !== previous.lastMove) renderScramble();
    if (!active) return;
    if (!previous || next.gyro !== previous.gyro || next.protocol !== previous.protocol || !displayedState) {
      cube.setGyroOrientation(next.protocol.startsWith('GAN') ? next.gyro : null);
    }
    // Gyro/status packets carry the same state; never let them cancel a turn.
    if (next.state !== displayedState) {
      const data = toRenderData(next.state);
      if (displayedState && next.phase === 'tracking' && next.lastMove) cube.queueLiveMove(next.lastMove, data);
      else cube.update(data);
      displayedState = next.state;
    }
  }
  function setMode(next) {
    if (mode === next) return;
    mode = next;
    for (const name of ['inspect', 'scramble']) {
      $(`#studio-${name}`).hidden = next !== name;
      $(`#studio-${name}-tab`).setAttribute('aria-selected', String(next === name));
    }
    renderScramble();
  }
  function generate() {
    $('#studio-scramble-input').value = randomScramble(12);
    scramble = null;
    run = null;
    $('#studio-scramble-error').hidden = true;
    try { scramble = makeScramble($('#studio-scramble-input').value); } catch { /* Generator always emits supported turns. */ }
    renderScramble();
  }
  function makeScramble(input) {
    const moves = parseScramble(input);
    if (!moves.length) throw new Error('Enter at least one face turn.');
    const states = [solved];
    for (const move of moves) states.push(applyMoves(states.at(-1), move));
    return { moves, states };
  }
  function startScramble() {
    if (snapshot.phase !== 'tracking' || !sameCubeState(snapshot.state, solved)) return renderScramble();
    try {
      scramble = makeScramble($('#studio-scramble-input').value);
      run = { ...scramble, step: 0, detour: [], complete: false };
      processedState = snapshot.state;
      $('#studio-scramble-error').hidden = true;
      renderScramble();
    } catch (error) {
      $('#studio-scramble-error').textContent = error.message;
      $('#studio-scramble-error').hidden = false;
    }
  }
  $('#studio-inspect-tab').addEventListener('click', () => setMode('inspect'));
  $('#studio-scramble-tab').addEventListener('click', () => setMode('scramble'));
  $('#studio-generate').addEventListener('click', generate);
  $('#studio-start').addEventListener('click', startScramble);
  $('#studio-scramble-input').addEventListener('input', () => { run = null; scramble = null; renderScramble(); });
  $('#studio-reset-view').addEventListener('click', () => cube.resetView());
  $('#studio-connect').addEventListener('click', () => { void cubeSession.connect(); });
  $('#studio-sync').addEventListener('click', () => { void cubeSession.syncSolved().catch(() => {}); });
  $('#studio-disconnect').addEventListener('click', () => { void cubeSession.disconnect(); });
  $('#studio-clear').addEventListener('click', () => {
    events = []; captureStart = null; gyroCount = 0; lastRawMove = null; sawWideLabel = false; sawSliceLabel = false;
    $('#studio-event-log').innerHTML = '<li>No device events captured yet.</li>';
    $('#studio-reported-move').textContent = '—';
    $('#studio-gyro-count').textContent = '0';
    $('#studio-orientation').textContent = '—';
    $('#studio-wide-status').textContent = 'Not reported separately';
    $('#studio-slice-status').textContent = 'Not reported separately';
  });
  $('#studio-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ protocol: snapshot.protocol, phase: snapshot.phase, lastRawMove, trackedMoves: snapshot.moves.length, gyroPackets: gyroCount, events: events.slice().reverse() }, null, 2));
      $('#studio-copy-status').textContent = 'Diagnostic copied. No MAC address is included.';
    } catch { $('#studio-copy-status').textContent = 'Could not copy; clipboard access is unavailable.'; }
  });
  cubeSession.subscribe(onSnapshot);
  cubeSession.subscribeEvents?.(capture);
  generate();
  return {
    setActive(value) {
      active = Boolean(value);
      if (!active) cube.setTurnHint(null);
      else { displayedState = null; renderScramble(); onSnapshot(snapshot); }
    },
  };
}
