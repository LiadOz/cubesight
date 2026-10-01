import '../pages/page.css';
import './cross-planning.css';
import { createPageCube } from '../pages/cube-view.js';
import { createSequencePlayer } from '../moves/sequence-player.js';
import { COLOR_HEX, FACE_COLORS, randomScramble, toRenderData, validateSolution } from '../cross-cube.js';
import { analysisStateFromScramble, parseAnalysisMoves } from '../analysis/long-replay.js';
import { solveCross } from '../cross-solver.js';
import { createRoundPanel } from './round-panel.js';
import { parseDrillStart } from './start-position.js';
import { resolveDrillPosition } from './position.js';
import { generatePinVariations } from './pin-variations.js';
import { syncPageTokens } from '../pages/tokens.js';
import { loadSettings } from '../brain/settings.js';
import { fmt } from '../copy/terms.js';
import { parseCaseFilter } from './case-filter.js';

const faces = Object.keys(FACE_COLORS);
const title = color => color[0].toUpperCase() + color.slice(1);

export function createCrossPlanning(root) {
  const start = parseDrillStart();
  const caseFilter = parseCaseFilter(start.cases, faces);
  let requestedFaces = caseFilter.requested ? caseFilter.values : (start.face ? [start.face] : faces);
  let active = true, detached = false, current = null, cube = null, roundPanel = null, startedAt = 0;
  let answer = null, generation = 0, caseNumber = 0;
  let activePin = null;
  let player = null;
  root.innerHTML = `<section class="cs-page brain cross-planning-page" data-brain-style="${loadSettings(globalThis.localStorage).style}">
    <header class="cs-head"><p class="cs-eyebrow">drills / cross planning</p><h1>cross planning</h1><p class="cs-sub">Choose a cross from the scramble. Then check the verified plans.</p></header>
    <section class="cp-session" aria-label="Cross planning case">
      <div class="cp-status"><span id="cp-case">case 1</span><span id="cp-time">—</span></div>
      <div class="cp-layout"><div class="cp-cube" id="cp-cube" aria-label="Scrambled cube"></div>
        <div class="cp-work"><p class="cp-question">Which cross would you start with?</p><p class="cp-hint">Pick a face before seeing the plans. The search checks all six crosses locally.</p>
          <div class="cp-faces" id="cp-faces" role="group" aria-label="Choose a cross face"></div>
          <p id="cp-feedback" role="status" aria-live="polite">preparing the scramble…</p>
          <div class="cp-reveal" id="cp-reveal" hidden></div>
          <div class="cp-playback" id="cp-playback" hidden></div>
          <button id="cp-next" type="button" hidden>next scramble</button>
        </div>
      </div>
    </section>
    <p id="cp-return" class="cp-return" hidden></p>
    <p class="cp-source">Every plan is replayed against the cube state before it appears. Search is local and bounded. <a href="#/drills/scout?mode=explore">open Cross Scout</a></p>
  </section>`;
  const $ = selector => root.querySelector(selector);
  const reviewFrom = /^review:(\d{1,16}):(\d{1,5})$/.exec(start.from ?? '');
  if (reviewFrom) {
    const back = $('#cp-return');
    back.hidden = false;
    back.innerHTML = `<a href="#/review/${reviewFrom[1]}?move=${reviewFrom[2]}">← review · solve · move ${Number(reviewFrom[2]) + 1}</a>`;
  }
  const cubeReady = createPageCube($('#cp-cube'), { mode: 'scout' }).then(view => {
    if (detached) { view.destroy(); return; }
    cube = view;
    if (current?.chosen) showPlan(current.chosen, false);
    else if (current?.state) cube.update(toRenderData(current.state));
  }).catch(() => { if (!detached) $('#cp-cube').textContent = '3D cube needs WebGL. Cross choices still work.'; });
  function buildRoundPanel() {
    roundPanel = createRoundPanel(root, { drill: 'cross', getSettings: () => ({ search: 'all six crosses' }), onComplete: () => { renderChoices(); $('#cp-next').hidden = true; }, onRestart: () => { void nextCase(); } });
    roundPanel.setActive(active);
  }
  function showPlan(chosen, autoplay = true) {
    if (!cube) return;
    if (!player) {
      player = createSequencePlayer($('#cp-playback'), { cube3d: cube, onChange(snapshot) {
        const count = $('#cp-step');
        if (count) count.textContent = snapshot.index === 0 ? 'scrambled state' : `move ${snapshot.index} of ${snapshot.moves.length}`;
      } });
      $('#cp-playback [data-sequence-position]').id = 'cp-step';
      $('#cp-playback [data-sequence="reset"]').id = 'cp-restart';
      $('#cp-playback [data-sequence="back"]').id = 'cp-back';
      $('#cp-playback [data-sequence="next"]').id = 'cp-forward';
    }
    player.load({ startState: current.state, moves: chosen.moves });
    player.setActive(active);
    if (autoplay) void player.play();
  }
  function renderChoices() {
    $('#cp-faces').replaceChildren();
    for (const face of requestedFaces) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'cp-face'; button.dataset.face = face;
      button.disabled = !current?.plans || !current.plans.some(plan => plan.face === face) || Boolean(answer) || Boolean(roundPanel?.complete);
      button.innerHTML = `<i style="--face-color:${COLOR_HEX[FACE_COLORS[face]]}" aria-hidden="true"></i><span>${title(FACE_COLORS[face])}</span><kbd>${face}</kbd>`;
      button.addEventListener('click', () => choose(face));
      $('#cp-faces').append(button);
    }
  }
  async function searchPlans(scramble, state, token) {
    const normalizedScramble = parseAnalysisMoves(scramble).join(' ');
    const plans = [];
    for (const face of requestedFaces) {
      if (token !== generation || detached || !active) return [];
      $('#cp-feedback').textContent = `checking ${title(FACE_COLORS[face])} cross…`;
      try {
        const reply = await solveCross({ scramble: normalizedScramble, face, kind: 'cross', maxResults: 2, maxDepth: 10, timeLimitMs: 450 });
        for (const result of reply.results || []) {
          const moves = Array.isArray(result.moves) ? result.moves : String(result.moves || '').split(/\s+/).filter(Boolean);
          const verified = validateSolution(state, moves, face);
          if (verified.crossSolved && !plans.some(item => item.face === face && item.moves.join(' ') === moves.join(' '))) plans.push({ face, moves });
        }
      } catch { /* Keep verified plans found for other faces. */ }
    }
    return plans;
  }
  async function nextCase(scramble = '') {
    if (roundPanel?.complete) return;
    const token = ++generation;
    player?.setActive(false);
    answer = null; current = null;
    $('#cp-reveal').hidden = true; $('#cp-playback').hidden = true; $('#cp-next').hidden = true;
    $('#cp-time').textContent = '—';
    if (!caseFilter.valid) {
      $('#cp-feedback').textContent = `Unknown cross face${caseFilter.invalid.length > 1 ? 's' : ''}: ${caseFilter.invalid.join(', ')}. Use U, D, F, B, R, or L.`;
      renderChoices();
      return;
    }
    let text = scramble;
    if (!text && start.invalid) { $('#cp-feedback').textContent = 'This setup is not valid move notation. Check the link and try again.'; renderChoices(); return; }
    if (!text && (start.moves.length || start.review)) {
      const position = await resolveDrillPosition(start, 'cross');
      if (token !== generation || detached) return;
      if (position.missing) { $('#cp-feedback').textContent = 'This saved position is no longer available. Open the solve from history to choose another point.'; renderChoices(); return; }
      activePin = position.pin ?? null;
      if (!caseFilter.requested && /^[UDFBRL]$/.test(activePin?.crossFace ?? '')) requestedFaces = [activePin.crossFace];
      text = position.moves.join(' ');
      start.moves = []; start.review = null; start.invalid = false;
    } else if (start.moves.length) {
      start.moves = [];
    }
    if (!text && activePin) {
      const variations = await generatePinVariations(activePin, { count: 3, planner: request => solveCross({ ...request, maxResults: 1, maxDepth: 10, timeLimitMs: 350 }) });
      if (token !== generation || detached) return;
      const chosen = variations[Math.floor(Math.random() * variations.length)];
      if (!chosen) { $('#cp-feedback').textContent = 'No new verified variation was found for this saved position. Choose another point in the solve.'; renderChoices(); return; }
      text = chosen.scramble;
    }
    if (!text) text = randomScramble();
    let state;
    try { state = analysisStateFromScramble(text); }
    catch { $('#cp-feedback').textContent = 'This position could not be loaded. No substitute scramble was started.'; renderChoices(); return; }
    cube?.update(toRenderData(state));
    current = { scramble: text, state, plans: null };
    $('#cp-case').textContent = `case ${++caseNumber}`;
    renderChoices();
    const plans = await searchPlans(text, state, token);
    if (token !== generation || detached || roundPanel?.complete) return;
    current.plans = plans;
    startedAt = performance.now();
    renderChoices();
    $('#cp-feedback').textContent = plans.length ? 'Choose the cross you would start with.' : 'No cross plan was verified in this search window. Start another scramble.';
    if (!plans.length) $('#cp-next').hidden = false;
    syncPageTokens(root.querySelector('.brain'));
  }
  function choose(face) {
    if (!active || roundPanel?.complete || !current?.plans || answer || !current.plans.some(plan => plan.face === face)) return;
    answer = face;
    const elapsed = Math.max(0, performance.now() - startedAt);
    const scored = current.plans.filter(plan => plan.moves.length === Math.min(...current.plans.map(item => item.moves.length)));
    const correct = scored.some(plan => plan.face === face);
    roundPanel?.record({ correct, ms: elapsed, caseId: face });
    const chosen = current.plans.filter(plan => plan.face === face).sort((a, b) => a.moves.length - b.moves.length)[0];
    const best = scored[0];
    $('#cp-feedback').textContent = correct ? `Good read. ${title(FACE_COLORS[face])} is tied for the shortest cross found here.` : `The shortest cross found here is ${title(FACE_COLORS[best.face])}. Compare the routes.`;
    $('#cp-time').textContent = `${(elapsed / 1000).toFixed(2)} s`;
    $('#cp-reveal').hidden = false;
    $('#cp-reveal').innerHTML = chosen
      ? `<strong>${title(FACE_COLORS[face])} cross · ${chosen.moves.length} moves</strong><p>${fmt.moves(chosen.moves.join(' '))}</p><small>Shortest found in this search: ${scored.map(plan => `${FACE_COLORS[plan.face]} · ${plan.moves.length}`).join(' / ')}</small>`
      : `<strong>No verified plan found for ${title(FACE_COLORS[face])}.</strong><p>Shortest found in this search: ${scored.map(plan => `${FACE_COLORS[plan.face]} · ${plan.moves.length} moves`).join(' / ')}</p>`;
    if (chosen) {
      current.chosen = chosen;
      $('#cp-playback').hidden = false; showPlan(chosen);
    }
    $('#cp-next').hidden = Boolean(roundPanel?.complete);
    renderChoices();
  }
  $('#cp-next').addEventListener('click', () => { start.moves = []; start.review = null; start.invalid = false; void nextCase(); });
  const onKeydown = event => {
    if (!active || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? '') || event.target?.closest('button,a')) return;
    if (roundPanel?.handleKey(event)) return;
    if ([' ', 'Enter'].includes(event.key) && !$('#cp-next').hidden && !roundPanel?.complete) { event.preventDefault(); $('#cp-next').click(); return; }
    const face = event.key.toUpperCase();
    const button = $('#cp-faces').querySelector(`[data-face="${face}"]`);
    if (button && !button.disabled) { event.preventDefault(); button.click(); }
  };
  document.addEventListener('keydown', onKeydown);
  buildRoundPanel();
  syncPageTokens(root.querySelector('.brain'));
  void nextCase();
  return {
    ready: cubeReady,
    setActive(value) { active = value; player?.setActive(value); roundPanel?.setActive(value); if (active && !current && !detached) void nextCase(); else if (!active) { generation++; current = null; answer = null; } },
    detach() { detached = true; active = false; generation++; document.removeEventListener('keydown', onKeydown); roundPanel?.destroy(); player?.destroy(); cube?.destroy(); root.replaceChildren(); },
  };
}
