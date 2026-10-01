import '../pages/page.css';
import './oll.css';
import { createPageCube } from '../pages/cube-view.js';
import { toRenderData } from '../cross-cube.js';
import { analysisStateFromScramble } from '../analysis/long-replay.js';
import { caseSetupState } from '../algs/drill/cube.js';
import { getCase, getCases } from '../algs/seed/cases.js';
import { identifyOllCase } from './oll-model.js';
import { resolveDrillPosition } from './position.js';
import { syncPageTokens } from '../pages/tokens.js';
import { loadLearning, saveLearning, review, itemKey, chooseDue, dueItems } from '../learning.js';
import { QUICK_ROUNDS, createRoundStore } from './rounds.js';
import { parseDrillStart } from './start-position.js';
import { fmt } from '../copy/terms.js';
import { relabelMoves } from '../analysis/normalize.js';
import { loadSettings } from '../brain/settings.js';
import { createRoundPanel } from './round-panel.js';

const LEARNING_KEY = 'cubesight-oll-learning-v1';
const allCases = getCases('oll');
const random = values => values[Math.floor(Math.random() * values.length)];

export function createDrillPage(root, storage = globalThis.localStorage) {
  const start = parseDrillStart();
  const rounds = createRoundStore(storage);
  const learning = loadLearning(storage, LEARNING_KEY);
  let active = true, disposed = false, generation = 0, startedAt = 0, current = null, choices = [], answered = false;
  let round = rounds.current?.drill === 'oll' ? rounds.current : null;
  let forced = null, cube = null, timerId = null, activePin = null;
  let roundPanel = null, renderState = null;
  root.innerHTML = `<section class="cs-page brain oll-page" data-brain-style="${loadSettings().style}">
    <header class="cs-head"><p class="cs-eyebrow">drills / OLL</p><h1>OLL recognition</h1><p class="cs-sub">Name the last-layer pattern before you think about the turns.</p></header>
    <section class="oll-session" aria-label="OLL recognition round">
      <div class="oll-round-bar"><span id="oll-round-state">20-case round</span><span id="oll-round-count">case 0 of 20</span><span id="oll-combo">combo 0</span><span id="oll-clock">0.00 s</span></div>
      <div class="oll-layout"><div id="oll-cube" class="oll-cube" aria-label="OLL case"></div>
        <div class="oll-answer-side"><p class="oll-prompt">Which OLL case is this?</p><p class="oll-hint">Match the top-layer pattern to its standard case number.</p>
          <div id="oll-answers" class="oll-answers" role="group" aria-label="Choose the OLL case"></div>
          <p id="oll-feedback" role="status" aria-live="polite">Start a round when you’re ready.</p>
          <div id="oll-reveal" class="oll-reveal" hidden></div><button id="oll-next" type="button" hidden>next case</button>
        </div>
      </div>
      <div class="oll-actions"><button id="oll-start" type="button">start 20-case round</button><a href="#/drills">all drills</a></div>
    </section>
    <section class="oll-progress"><p id="oll-due">${dueItems(learning).length} due</p><p>Recognition builds over short rounds.</p></section>
    <section id="oll-result" class="oll-result" hidden aria-live="polite"></section>
  </section>`;
  const $ = selector => root.querySelector(selector);
  const cubeReady = createPageCube($('#oll-cube'), { mode: 'scout' }).then(view => {
    if (disposed) { view.destroy(); return; }
    cube = view;
    if (renderState) cube.update({ ...toRenderData(renderState), mode: 'scout' });
  }).catch(() => { if (!disposed) $('#oll-cube').textContent = '3D cube needs WebGL. The case choices still work.'; });
  roundPanel = createRoundPanel(root, {
    drill: 'oll', storage, store: rounds,
    onRestart() {
      round = rounds.current; current = null; $('#oll-result').hidden = true;
      $('#oll-start').textContent = 'resume round';
      void nextCase();
    },
    onComplete() {
      clearInterval(timerId);
      $('#oll-next').hidden = true;
      [...$('#oll-answers').children].forEach(button => { button.disabled = true; });
      round = rounds.current; updateRound();
    },
  });

  function updateRound() {
    $('#oll-round-count').textContent = `case ${round?.answers?.length ?? 0} of ${round?.preset?.cases ?? 20}`;
    $('#oll-combo').textContent = `combo ${round?.combo ?? 0}`;
    $('#oll-round-state').textContent = round?.status === 'active' ? 'round in progress' : round?.status === 'complete' ? 'round complete' : '20-case round';
  }
  function buildChoices(target) {
    const pool = start.cases.length ? start.cases.map(id => getCase(id.startsWith('oll/') ? id : `oll/${id}`)).filter(Boolean) : allCases;
    const candidate = pool.length ? pool : allCases;
    const distractors = [];
    while (distractors.length < Math.min(3, candidate.length - 1)) {
      const row = random(candidate);
      if (row.id !== target.id && !distractors.some(item => item.id === row.id)) distractors.push(row);
    }
    return [target, ...distractors].sort(() => Math.random() - 0.5);
  }
  async function nextCase(seedCase = null, customPosition = '') {
    const token = ++generation;
    $('#oll-feedback').textContent = 'Choosing a due case…';
    const eligible = start.cases.length
      ? start.cases.map(id => getCase(id.startsWith('oll/') ? id : `oll/${id}`)).filter(Boolean)
      : allCases;
    if (seedCase) current = seedCase;
    else {
      const candidates = eligible.map(row => ({ ...row, key: itemKey('oll', row.id) }));
      current = chooseDue(learning, candidates);
    }
    if (!current) current = random(allCases);
    forced = customPosition ? await identifyOllCase(customPosition) : null;
    if (token !== generation || disposed || !active) return;
    if (customPosition && !forced) {
      $('#oll-feedback').textContent = 'This position does not match a standard OLL case with the first two layers solved.';
      $('#oll-answers').replaceChildren();
      return;
    }
    if (forced) current = forced;
    choices = buildChoices(current);
    answered = false;
    try {
      const state = customPosition ? analysisStateFromScramble(customPosition) : caseSetupState(current);
      renderState = state;
      cube?.update({ ...toRenderData(state), mode: 'scout' });
    }
    catch {
      $('#oll-feedback').textContent = 'This verified case setup could not be loaded. No substitute case was started.';
      $('#oll-answers').replaceChildren();
      return;
    }
    const answerRoot = $('#oll-answers');
    answerRoot.replaceChildren();
    choices.forEach(row => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'oll-answer'; button.dataset.caseId = row.id;
      button.textContent = `${row.number} · ${row.name}`;
      button.addEventListener('click', () => answer(row));
      answerRoot.append(button);
    });
    $('#oll-reveal').hidden = true;
    $('#oll-next').hidden = true;
    $('#oll-feedback').textContent = 'Choose the case you see.';
    startedAt = performance.now();
    clearInterval(timerId);
    timerId = setInterval(() => {
      if (!active || answered || !round || round.status !== 'active') return;
      $('#oll-clock').textContent = `${((performance.now() - startedAt) / 1000).toFixed(2)} s`;
    }, 80);
    updateRound();
    if (token !== generation || disposed) clearInterval(timerId);
  }
  function answer(row) {
    if (!active || answered || !round || round.status !== 'active') return;
    answered = true;
    clearInterval(timerId);
    const ms = Math.max(0, performance.now() - startedAt);
    const correct = row.id === current.id;
    const key = itemKey('oll', current.id);
    review(learning, key, { correct, ms, responseThresholdMs: 900 });
    saveLearning(storage, learning, LEARNING_KEY);
    const result = roundPanel.record({ correct, ms, caseId: current.id });
    round = rounds.current;
    $('#oll-clock').textContent = `${(ms / 1000).toFixed(2)} s`;
    [...$('#oll-answers').children].forEach(button => {
      button.disabled = true;
      if (button.dataset.caseId === current.id) button.dataset.correct = 'true';
      if (button.dataset.caseId === row.id && !correct) button.dataset.missed = 'true';
    });
    $('#oll-feedback').textContent = correct ? 'Nice. That’s the case.' : `Not quite. This is OLL ${current.number}, ${current.name}.`;
    const alg = current.algs?.[0];
    $('#oll-reveal').hidden = false;
    $('#oll-reveal').innerHTML = `<strong>OLL ${current.number} · ${current.name}</strong>${alg ? `<p>${fmt.moves(alg.moves)}</p><small><a href="${alg.source.url}" target="_blank" rel="noopener noreferrer">${alg.credit} (opens a website)</a></small>` : ''}`;
    updateRound();
    if (result.complete) return;
    else $('#oll-next').hidden = false;
  }
  function finish(summary) {
    $('#oll-result').hidden = false;
    $('#oll-result').innerHTML = `<p class="cs-eyebrow">round complete</p><h2>${summary.correct} of ${summary.total} cases correct</h2><p>Best combo: ${summary.bestCombo}. ${Math.round((summary.accuracy ?? 0) * 100)}% accuracy.</p><button id="oll-again" type="button">one more round</button>`;
    $('#oll-again').addEventListener('click', () => startRound(false));
    $('#oll-round-state').textContent = 'round complete';
  }
  function startRound(resume = true) {
    if (start.invalid) { $('#oll-feedback').textContent = 'This setup is not valid move notation. Check the link and try again.'; return; }
    round = rounds.startRound({ drill: 'oll', preset: QUICK_ROUNDS.oll, from: start.from, resume });
    roundPanel.refresh();
    $('#oll-result').hidden = true;
    $('#oll-start').textContent = 'resume round';
    updateRound();
    void resolveDrillPosition(start, 'oll').then(async position => {
      if (position.missing) {
        $('#oll-feedback').textContent = 'This saved position is no longer available. Open the solve from history to choose another point.';
        $('#oll-answers').replaceChildren();
        return;
      }
      const face = position.pin?.crossFace || start.face || 'D';
      const toD = moves => face === 'D' ? moves : relabelMoves(moves, face);
      const setup = toD(position.moves).join(' ');
      if (position.pin) {
        activePin = {
          ...position.pin,
          scramble: toD(position.pin.scramble.split(/\s+/).filter(Boolean)).join(' '),
          movesUpTo: toD(position.pin.movesUpTo),
          crossFace: 'D',
        };
      }
      await nextCase(null, setup);
    });
  }
  $('#oll-start').textContent = round?.status === 'active' ? 'resume round' : 'start 20-case round';
  $('#oll-start').addEventListener('click', () => startRound(round?.status === 'active'));
  $('#oll-next').addEventListener('click', async () => {
    if (!activePin) return nextCase();
    const { generatePinVariations } = await import('./pin-variations.js');
    const variations = await generatePinVariations(activePin, { count: 3 });
    const variation = random(variations);
    if (!variation) { $('#oll-feedback').textContent = 'No new verified variation was found for this saved position. Choose another point in the solve.'; return; }
    nextCase(null, variation.scramble);
  });
  if (start.invalid) $('#oll-feedback').textContent = 'This setup is not valid move notation. Check the link and try again.';
  else if (start.cases.length || start.moves.length || start.review) startRound(false);
  else if (round?.status === 'active') startRound(true);
  updateRound();
  syncPageTokens(root.querySelector('.brain'));
  return {
    ready: cubeReady,
    setActive(value) { active = value; roundPanel.setActive(value); if (!value) { clearInterval(timerId); generation++; current = null; } else if (round?.status === 'active' && !current) void nextCase(); },
    detach() { disposed = true; active = false; clearInterval(timerId); generation++; roundPanel.destroy(); cube?.destroy(); root.replaceChildren(); },
  };
}
