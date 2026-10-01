import '../pages/page.css';
import './cross-planning.css';
import { createCube3D } from '../cube-3d.js';
import { COLOR_HEX, FACE_COLORS, applyMoves, randomScramble, toRenderData, validateSolution } from '../cross-cube.js';
import { analysisStateFromScramble, parseAnalysisMoves } from '../analysis/long-replay.js';
import { solveCross } from '../cross-solver.js';
import { createRoundPanel } from './round-panel.js';
import { parseDrillStart } from './start-position.js';
import { resolveDrillPosition } from './position.js';
import { generatePinVariations } from './pin-variations.js';
import { syncPageTokens } from '../pages/tokens.js';
import { loadSettings } from '../brain/settings.js';
import { fmt } from '../copy/terms.js';

const faces = Object.keys(FACE_COLORS);
const title = color => color[0].toUpperCase() + color.slice(1);

export function createCrossPlanning(root) {
  const start = parseDrillStart();
  let active = true, detached = false, current = null, cube = null, roundPanel = null, startedAt = 0;
  let answer = null, states = [], step = 0, generation = 0, caseNumber = 0;
  let activePin = null;
  root.innerHTML = `<section class="cs-page brain cross-planning-page" data-brain-style="${loadSettings().style}">
    <header class="cs-head"><p class="cs-eyebrow">drills / cross planning</p><h1>cross planning</h1><p class="cs-sub">Choose a cross from the scramble. Then check the verified plans.</p></header>
    <section class="cp-session" aria-label="Cross planning case">
      <div class="cp-status"><span id="cp-case">case 1</span><span id="cp-time">—</span></div>
      <div class="cp-layout"><div class="cp-cube" id="cp-cube" aria-label="Scrambled cube"></div>
        <div class="cp-work"><p class="cp-question">Which cross would you start with?</p><p class="cp-hint">Pick a face before seeing the plans. The search checks all six crosses locally.</p>
          <div class="cp-faces" id="cp-faces" role="group" aria-label="Choose a cross face"></div>
          <p id="cp-feedback" role="status" aria-live="polite">Preparing the scramble…</p>
          <div class="cp-reveal" id="cp-reveal" hidden></div>
          <div class="cp-playback" id="cp-playback" hidden><button id="cp-restart" type="button">restart</button><button id="cp-back" type="button" aria-label="previous move">←</button><button id="cp-forward" type="button" aria-label="next move">→</button><span id="cp-step">scrambled state</span></div>
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
  try { cube = createCube3D($('#cp-cube'), { mode: 'scout' }); }
  catch { $('#cp-cube').textContent = '3D cube needs WebGL. Cross choices still work.'; }
  function buildRoundPanel() {
    roundPanel = createRoundPanel(root, { drill: 'cross', getSettings: () => ({ search: 'all six crosses' }), onComplete: () => { renderChoices(); $('#cp-next').hidden = true; }, onRestart: () => { void nextCase(); } });
    roundPanel.setActive(active);
  }
  function renderStep() {
    if (!states.length) return;
    step = Math.max(0, Math.min(step, states.length - 1));
    cube?.update(toRenderData(states[step]));
    $('#cp-step').textContent = step === 0 ? 'scrambled state' : `move ${step} of ${states.length - 1}`;
    $('#cp-back').disabled = step === 0;
    $('#cp-forward').disabled = step === states.length - 1;
  }
  function renderChoices() {
    $('#cp-faces').replaceChildren();
    for (const face of faces) {
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
    for (const face of faces) {
      if (token !== generation || detached || !active) return [];
      $('#cp-feedback').textContent = `Checking ${title(FACE_COLORS[face])} cross…`;
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
    answer = null; states = []; step = 0; current = null;
    $('#cp-reveal').hidden = true; $('#cp-playback').hidden = true; $('#cp-next').hidden = true;
    $('#cp-time').textContent = '—';
    let text = scramble;
    if (!text && start.invalid) { $('#cp-feedback').textContent = 'This setup is not valid move notation. Check the link and try again.'; renderChoices(); return; }
    if (!text && (start.moves.length || start.review)) {
      const position = await resolveDrillPosition(start, 'cross');
      if (token !== generation || detached) return;
      if (position.missing) { $('#cp-feedback').textContent = 'This saved position is no longer available. Open the solve from history to choose another point.'; renderChoices(); return; }
      activePin = position.pin ?? null;
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
    if (token !== generation || detached) return;
    current.plans = plans;
    startedAt = performance.now();
    renderChoices();
    $('#cp-feedback').textContent = plans.length ? 'Choose the cross you would start with.' : 'No cross plan was verified in this search window. Start another scramble.';
    if (!plans.length) $('#cp-next').hidden = false;
    syncPageTokens(root);
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
      states = [current.state];
      for (const move of chosen.moves) states.push(applyMoves(states.at(-1), [move]));
      $('#cp-playback').hidden = false; renderStep();
    }
    $('#cp-next').hidden = Boolean(roundPanel?.complete);
    renderChoices();
  }
  $('#cp-next').addEventListener('click', () => { start.moves = []; start.review = null; start.invalid = false; void nextCase(); });
  $('#cp-restart').addEventListener('click', () => { step = 0; renderStep(); });
  $('#cp-back').addEventListener('click', () => { step -= 1; renderStep(); });
  $('#cp-forward').addEventListener('click', () => { step += 1; renderStep(); });
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
  void nextCase();
  return {
    ready: Promise.resolve(),
    setActive(value) { active = value; roundPanel?.setActive(value); if (active && !current && !detached) void nextCase(); else if (!active) { generation++; current = null; answer = null; states = []; } },
    detach() { detached = true; active = false; generation++; document.removeEventListener('keydown', onKeydown); roundPanel?.destroy(); cube?.destroy(); root.replaceChildren(); },
  };
}
