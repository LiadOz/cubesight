import '../pages/page.css';
import './oll.css';
import { Cube } from '../ui/cube/index.js';
import { readCaseColorSetting, CASE_COLOR_CHANGE_EVENT } from '../ui/cube/case-color.js';
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
import { mountCaseColorControl } from '../trainers/case-color-control.js';

const LEARNING_KEY = 'cubesight-oll-learning-v1';
const allCases = getCases('oll');
const random = values => values[Math.floor(Math.random() * values.length)];

export function createDrillPage(root, storage = globalThis.localStorage) {
  const start = parseDrillStart();
  const rounds = createRoundStore(storage);
  const learning = loadLearning(storage, LEARNING_KEY);
  let active = true, disposed = false, generation = 0, startedAt = 0, current = null, choices = [], answered = false, selectedAnswer = null;
  let round = rounds.current?.drill === 'oll' ? rounds.current : null;
  let forced = null, cube = null, timerId = null, activePin = null, activeCaseSeed = '';
  let roundPanel = null, renderState = null;
  const dueCount = () => dueItems(learning).filter(item => String(item.key ?? '').startsWith('oll')).length;
  root.innerHTML = `<section class="cs-page brain oll-page" data-brain-style="${loadSettings(storage).style}">
    <header class="cs-head oll-head"><h1>OLL recognition</h1><p class="cs-sub" id="oll-due">spaced · ${dueCount()} due</p></header>
    <div class="trainer-round-host" id="oll-round-host"></div>
    <section class="oll-session" aria-label="OLL recognition round">
      <div class="oll-stage"><div class="oll-stage__orbit" id="oll-orbit"></div><div id="oll-cube" class="oll-cube oll-stage__cube" aria-label="OLL case"></div></div>
      <p id="oll-feedback" class="oll-prompt" role="status" aria-live="polite">start a round when you’re ready</p>
      <div id="oll-answers" class="oll-answers" role="group" aria-label="Choose the OLL case"></div>
      <p id="oll-caption" class="oll-caption"></p>
      <div id="oll-reveal" class="oll-reveal" hidden></div><button id="oll-next" type="button" class="oll-next" hidden>next case <kbd>space</kbd></button>
    </section>
    <div class="oll-keybar-host"><div class="ui-key-bar" aria-label="keyboard shortcuts"><span><kbd class="key">1-4</kbd><span>answer</span></span><span><kbd class="key">space</kbd><span>skip</span></span><button type="button" class="oll-end" data-end-round><kbd class="key">esc</kbd><span>end round</span></button></div><a class="oll-all" href="#/drills">all drills</a></div>
  </section>`;
  const $ = selector => root.querySelector(selector);
  const disposeCaseColorControl = mountCaseColorControl($('.oll-head'), storage);
  const cubeReady = Promise.resolve().then(() => {
    if (disposed) return;
    cube = new Cube($('#oll-cube'), { mode: 'case', size: 'XL', caseColorSetting: readCaseColorSetting(storage), caseSeed: 'oll:initial', label: 'OLL case' });
    if (renderState) cube.setState(renderState);
  }).catch(() => { if (!disposed) $('#oll-cube').textContent = '3D cube needs WebGL. The case choices still work.'; });
  roundPanel = createRoundPanel($('#oll-round-host'), {
    drill: 'oll', storage, store: rounds, orbitHost: $('#oll-orbit'), variant: 'stage',
    onRestart() {
      round = rounds.current; current = null;
      void nextCase();
    },
    onComplete() {
      clearInterval(timerId);
      $('#oll-next').hidden = true; $('#oll-caption').textContent = '';
      $('#oll-feedback').textContent = 'round complete';
      [...$('#oll-answers').children].forEach(button => { button.disabled = true; });
      round = rounds.current;
    },
  });

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
    $('#oll-feedback').textContent = 'choosing a due case…';
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
    selectedAnswer = null;
    try {
      const state = customPosition ? analysisStateFromScramble(customPosition) : caseSetupState(current);
      renderState = state;
      activeCaseSeed = `oll:${round?.answers?.length || 0}:${current.id}`;
      cube?.setCaseOrientation(readCaseColorSetting(storage), { seed: activeCaseSeed });
      cube?.setState(state);
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
      button.setAttribute('aria-label', `${row.number} · ${row.name}`);
      const keyCap = document.createElement('span'); keyCap.className = 'oll-answer__key'; keyCap.textContent = String(answerRoot.children.length + 1); keyCap.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span'); text.textContent = `OLL ${row.number}`;
      button.append(keyCap, text);
      button.addEventListener('click', () => answer(row));
      answerRoot.append(button);
    });
    $('#oll-reveal').hidden = true;
    $('#oll-next').hidden = true;
    $('#oll-feedback').textContent = 'which OLL is this?';
    roundPanel.resetElapsed();
    startedAt = performance.now();
    paintCaption(0);
    clearInterval(timerId);
    timerId = setInterval(() => {
      if (!active || answered || !round || round.status !== 'active') return;
      const elapsed = performance.now() - startedAt;
      paintCaption(elapsed); roundPanel.setElapsed(elapsed);
    }, 80);
    if (token !== generation || disposed) clearInterval(timerId);
  }
  /** "case 13 of 20 · 1.84 s": the case in play and the time on it. */
  function paintCaption(elapsed) {
    const live = rounds.current?.drill === 'oll' && rounds.current.status === 'active' ? rounds.current : null;
    if (!live || !current || answered) { $('#oll-caption').textContent = ''; return; }
    const position = live.preset.kind === 'cases' ? `case ${live.answers.length + 1} of ${live.preset.cases}` : `case ${live.answers.length + 1}`;
    $('#oll-caption').textContent = `${position} · ${(elapsed / 1000).toFixed(2)} s`;
  }
  function onKey(event) {
    if (!active || disposed || event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? '') || event.target?.isContentEditable) return;
    if (roundPanel.handleKey(event)) return;
    if (/^[1-4]$/.test(event.key)) { const button = $('#oll-answers').children[Number(event.key) - 1]; if (button && !button.disabled) { event.preventDefault(); button.click(); } }
    else if (event.key === ' ' && round?.status === 'active' && !roundPanel.complete && !event.target?.closest?.('button, a')) { event.preventDefault(); if (answered) $('#oll-next').click(); else void nextCase(); }
    else if (event.key === 'Escape' && round?.status === 'active') { event.preventDefault(); roundPanel.stop(); }
  }
  document.addEventListener('keydown', onKey);
  $('[data-end-round]').addEventListener('click', () => roundPanel.stop());
  const onCaseColorChange = event => { if (cube && renderState) cube.setCaseOrientation(event.detail?.setting || readCaseColorSetting(storage), { seed: activeCaseSeed }); };
  window.addEventListener(CASE_COLOR_CHANGE_EVENT, onCaseColorChange);
  function answer(row) {
    if (!active || answered || !round || round.status !== 'active') return;
    answered = true;
    selectedAnswer = row.id;
    clearInterval(timerId);
    const ms = Math.max(0, performance.now() - startedAt);
    const correct = row.id === current.id;
    const key = itemKey('oll', current.id);
    review(learning, key, { correct, ms, responseThresholdMs: 900 });
    saveLearning(storage, learning, LEARNING_KEY);
    const result = roundPanel.record({ correct, ms, caseId: current.id });
    round = rounds.current;
    $('#oll-caption').textContent = '';
    [...$('#oll-answers').children].forEach(button => {
      button.disabled = true;
      if (button.dataset.caseId === current.id) button.dataset.correct = 'true';
      if (button.dataset.caseId === row.id && !correct) button.dataset.missed = 'true';
    });
    $('#oll-feedback').textContent = correct ? 'nice, that’s the case' : `not quite: this is OLL ${current.number}, ${current.name}`;
    const alg = current.algs?.[0];
    $('#oll-reveal').hidden = false;
    $('#oll-reveal').innerHTML = `<strong>OLL ${current.number} · ${current.name}</strong>${alg ? `<p>${fmt.moves(alg.moves)}</p><small><a href="${alg.source.url}" target="_blank" rel="noopener noreferrer">${alg.credit} (opens a website)</a></small>` : ''}`;
    if (result.complete) return;
    else $('#oll-next').hidden = false;
  }
  function startRound(resume = true) {
    if (start.invalid) { $('#oll-feedback').textContent = 'This setup is not valid move notation. Check the link and try again.'; return; }
    round = rounds.startRound({ drill: 'oll', preset: QUICK_ROUNDS.oll, from: start.from, resume });
    roundPanel.refresh();

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
  syncPageTokens(root.querySelector('.brain'));
  return {
    ready: cubeReady,
    getViewModel() {
      const snapshot = cube?.getSnapshot?.() ?? null;
      return { screen: 'trainer', drill: 'oll', phase: answered ? 'feedback' : current ? 'recognition' : 'idle',
        currentCase: current ? { id: current.id ?? null, seed: activeCaseSeed || null, topColor: snapshot?.renderData?.colors?.U ?? null, orientation: snapshot?.caseColorSetting ?? null, targets: current.id ?? null } : null,
        answers: [...($('#oll-answers')?.querySelectorAll('button') || [])].map(button => ({ logicalKey: button.dataset.caseId, displayKey: button.dataset.caseId, label: button.textContent, selected: button.dataset.caseId === selectedAnswer, correct: button.dataset.caseId === current?.id })),
        round: roundPanel.getViewModel(), cube: snapshot, feedback: $('#oll-feedback')?.textContent || '', settings: { caseColor: readCaseColorSetting(storage) } };
    },
    setActive(value) { active = value; roundPanel.setActive(value); if (!value) { clearInterval(timerId); generation++; current = null; } else if (round?.status === 'active' && !current) void nextCase(); },
    detach() { disposed = true; active = false; clearInterval(timerId); generation++; window.removeEventListener(CASE_COLOR_CHANGE_EVENT, onCaseColorChange); disposeCaseColorControl(); document.removeEventListener('keydown', onKey); roundPanel.destroy(); cube?.destroy(); root.replaceChildren(); },
  };
}
