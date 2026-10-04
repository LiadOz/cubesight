import '../pages/page.css';
import './lookahead.css';
import { Cube } from '../ui/cube/index.js';
import { readCaseColorSetting, CASE_COLOR_CHANGE_EVENT } from '../ui/cube/case-color.js';
import { createSequencePlayer } from '../moves/sequence-player.js';
import { validateSolution } from '../cross-cube.js';
import { createPlannerSetup, plannerChoices, formatWeight, wideURequest, wideUResults } from '../f2l-planner.js';
import { solveCross } from '../cross-solver.js';
import { parseDrillStart } from './start-position.js';
import { createRoundStore, QUICK_ROUNDS } from './rounds.js';
import { syncPageTokens } from '../pages/tokens.js';
import { loadLearning, saveLearning, review, itemKey, chooseDue } from '../learning.js';
import { resolveDrillPosition } from './position.js';
import { analysisStateFromScramble } from '../analysis/long-replay.js';
import { relabelMoves } from '../analysis/normalize.js';
import { parseCaseFilter } from './case-filter.js';
import { loadSettings } from '../brain/settings.js';
import { createRoundPanel } from './round-panel.js';
import { createTrainerOrbit } from '../trainers/orbit-round.js';
import { mountCaseColorControl } from '../trainers/case-color-control.js';

const LEARNING_KEY = 'cubesight-lookahead-learning-v1';
const randomSeed = () => Math.floor(Math.random() * 0x7fffffff) + 1;

export function createDrillPage(root, storage = globalThis.localStorage) {
  const start = parseDrillStart();
  const numericCases = start.cases.filter(value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)));
  const allowedCases = [...new Set([...Array.from({ length: 48 }, (_, index) => String(index + 1)), ...numericCases, 'FR', 'BR', 'BL', 'FL'])];
  const caseFilter = parseCaseFilter(start.cases, allowedCases);
  const requestedSlots = caseFilter.values.filter(value => ['FR', 'BR', 'BL', 'FL'].includes(value));
  const rounds = createRoundStore(storage);
  const learning = loadLearning(storage, LEARNING_KEY);
  let active = true, disposed = false, generation = 0, current = null, startedAt = 0, selected = null;
  let currentSeed = null, round = rounds.current?.drill === 'lookahead' ? rounds.current : null;
  let activePin = null;
  let cube = null, feedback = '', loading = false, clockTimer = null, activeCaseSeed = '';
  let roundPanel = null;
  let player = null;
  const positionPromise = resolveDrillPosition(start, 'lookahead');
  const learningCases = Array.from({ length: 48 }, (_, index) => {
    const id = index + 1;
    return { id, key: itemKey('lookahead', String(id)) };
  });
  async function pinnedSetup() {
    const position = await positionPromise;
    if (position.missing) return { missing: true };
    const pin = position.pin;
    const face = pin?.crossFace || start.face || 'D';
    const toD = moves => face === 'D' ? moves : relabelMoves(moves, face);
    if (!pin) return { scramble: toD(position.moves).join(' '), pinned: false };
    activePin = pin;
    const better = pin.better?.length ? pin.better : pin.yours;
    return { scramble: toD(position.moves).join(' '), better: better?.length ? toD(better) : [], pinned: true };
  }
  async function nextPinnedSetup() {
    if (!activePin) return null;
    const { generatePinVariations } = await import('./pin-variations.js');
    const variations = await generatePinVariations(activePin, { count: 3 });
    const variation = variations[Math.floor(Math.random() * variations.length)];
    if (!variation) return null;
    const face = activePin.crossFace || 'D';
    const toD = moves => face === 'D' ? moves : relabelMoves(moves, face);
    const better = activePin.better?.length ? activePin.better : activePin.yours;
    return { scramble: toD(variation.scramble.split(/\s+/).filter(Boolean)).join(' '), better: better?.length ? toD(better) : [], pinned: true };
  }
  const dueSeed = () => chooseDue(learning, learningCases)?.id || randomSeed();

  root.innerHTML = `<section class="cs-page brain lookahead-page" data-brain-style="${loadSettings(storage).style}">
    <header class="cs-head"><p class="cs-eyebrow">drills / F2L</p><h1>lookahead</h1><p class="cs-sub">Choose a pair to solve while keeping the next pair in view.</p></header>
    <div class="trainer-round-host" id="lookahead-round-host"></div>
    <section class="lookahead-session" aria-label="Lookahead round">
      <div class="lookahead-layout"><div class="lookahead-cube" id="la-cube" aria-label="F2L case cube"></div>
        <div class="lookahead-work"><p class="lookahead-prompt">Which pair would you solve next?</p><p class="lookahead-hint">Choose a short, verified pair solution. Keep your eyes on the other unsolved pairs.</p>
          <div id="la-choices" class="lookahead-choices" role="group" aria-label="Choose the next pair"></div>
          <p id="la-feedback" role="status" aria-live="polite">preparing a verified F2L case…</p><div id="la-playback" hidden></div>
          <button id="la-next" class="la-next" type="button" hidden>next case</button>
        </div>
      </div>
      <div class="lookahead-actions"><a href="#/drills">all drills</a></div>
    </section>
  </section>`;
  const $ = selector => root.querySelector(selector);
  const disposeCaseColorControl = mountCaseColorControl($('.cs-head'), storage);
  const trainerOrbit = createTrainerOrbit($('#la-cube'));
  const cubeReady = Promise.resolve().then(() => {
    if (disposed) return;
    cube = new Cube($('#la-cube'), { mode: 'case', size: 'L', caseColorSetting: readCaseColorSetting(storage), caseSeed: 'lookahead:initial', label: 'F2L lookahead case' });
    if (current) cube.setState(current.setup.state);
    if (typeof selected === 'number') showContinuation(current?.choices[selected]);
  }).catch(() => { if (!disposed) $('#la-cube').textContent = '3D cube needs WebGL. The verified choices still work.'; });
  roundPanel = createRoundPanel($('#lookahead-round-host'), {
    drill: 'lookahead', storage, store: rounds, orbitHost: $('#la-cube'),
    onRestart() {
      round = rounds.current; current = null; selected = null;
      void makeCase(dueSeed());
    },
    onComplete() {
      clearInterval(clockTimer);
      $('#la-next').hidden = true;
      [...$('#la-choices').children].forEach(button => { button.disabled = true; });
      round = rounds.current;
    },
  });
  trainerOrbit.connect(roundPanel.orbit, () => roundPanel.getViewModel());

  function renderCase() {
    player?.setActive(false);
    $('#la-playback').hidden = true;
    if (!current) return;
    startedAt = performance.now();
    clearInterval(clockTimer);
    trainerOrbit.tick('3.00 s');
    clockTimer = setInterval(() => {
      const remaining = Math.max(0, 3000 - (performance.now() - startedAt));
      trainerOrbit.tick(`${(remaining / 1000).toFixed(2)} s`);
      if (remaining <= 0) answer(null, true);
    }, 40);
    activeCaseSeed = `lookahead:${round?.answers?.length || 0}:${currentSeed}`;
    cube?.setCaseOrientation(readCaseColorSetting(storage), { seed: activeCaseSeed });
    cube?.setState(current.setup.state);
    cube?.clearHighlight();
    trainerOrbit?.update({ index: round?.answers?.length || 0, state: 'current', value: `${round?.combo || 0} combo` });
    const choices = $('#la-choices');
    choices.replaceChildren();
    current.choices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'lookahead-choice';
      button.dataset.choice = String(index);
      button.innerHTML = `<strong>${choice.slot}</strong><span>${formatWeight(choice.weight)} · verified</span>`;
      button.addEventListener('click', () => answer(index));
      choices.append(button);
    });
    $('#la-feedback').textContent = feedback || (current.choices.length === 1 ? 'Only one pair remains. Check its verified plan.' : 'Pick the pair you would solve first.');
    $('#la-next').hidden = true;
    $('#la-next').disabled = false;
  }
  const onCaseColorChange = event => { if (cube && current) cube.setCaseOrientation(event.detail?.setting || readCaseColorSetting(storage), { seed: activeCaseSeed }); };
  window.addEventListener(CASE_COLOR_CHANGE_EVENT, onCaseColorChange);
  async function makeCase(seed = randomSeed(), custom = '') {
    const token = ++generation;
    clearInterval(clockTimer);
    loading = true;
    $('#la-feedback').textContent = 'finding pair choices and checking each one…';
    for (let attempt = 0; attempt < 5; attempt++) {
      if (token !== generation || disposed) return;
      const candidateSeed = seed + attempt;
      const setup = createPlannerSetup(candidateSeed);
      const customScramble = typeof custom === 'string' ? custom : custom?.scramble || '';
      if (custom?.missing) {
        loading = false;
        $('#la-feedback').textContent = 'This saved position is no longer available. Open the solve from history to choose another point.';
        return;
      }
      if (customScramble) {
        try {
          setup.scramble = customScramble;
          setup.state = analysisStateFromScramble(customScramble);
          setup.solvedPairs = validateSolution(setup.state, [], 'D').pairs;
        }
        catch {
          loading = false;
          $('#la-feedback').textContent = 'This setup could not be read. No substitute position was started.';
          return;
        }
        let choices = [];
        try {
          const { pinnedPairChoices } = await import('./pinned-pairs.js');
          choices = await pinnedPairChoices(setup);
        } catch { /* Report a missing verified continuation below. */ }
        if (token !== generation || disposed || !active) return;
        if (requestedSlots.length) choices = choices.filter(choice => requestedSlots.includes(choice.slot));
        if (!choices.length) {
          loading = false;
          $('#la-feedback').textContent = 'No verified next pair was found for this exact position. Choose another point in the solve.';
          return;
        }
        currentSeed = candidateSeed;
        current = { setup, choices, pinned: Boolean(custom?.pinned) };
        loading = false;
        renderCase();
        return;
      }
      const results = setup.recoveryPlans.map(moves => ({ moves }));
      if (custom?.better?.length) results.push({ moves: custom.better });
      try {
        const searches = [
          { scramble: setup.scramble, timeLimitMs: 1300 },
          ...["", "'"].map(suffix => ({ ...wideURequest(setup, suffix), timeLimitMs: 650 })),
        ];
        for (const search of searches) {
          if (!active || token !== generation) return;
          const reply = await solveCross({ scramble: search.scramble, face: 'D', kind: 'xcross', maxResults: 8, maxDepth: 10, timeLimitMs: search.timeLimitMs });
          results.push(...(search.prefix ? wideUResults(search, reply.results) : reply.results));
        }
      } catch { /* The verified recovery plans remain available offline. */ }
      let choices = plannerChoices(setup, results);
      if (requestedSlots.length) choices = choices.filter(choice => requestedSlots.includes(choice.slot));
      if (choices.length < (customScramble || requestedSlots.length ? 1 : 2)) continue;
      currentSeed = candidateSeed;
      current = { setup, choices, pinned: Boolean(custom?.pinned) };
      loading = false;
      renderCase();
      return;
    }
    loading = false;
    $('#la-feedback').textContent = 'No verified pair choice was found. Start a fresh case to try again.';
  }
  function showContinuation(choice) {
    if (!choice || !cube || !current || disposed || !active) return;
    if (!player) player = createSequencePlayer($('#la-playback'), { cube3d: cube, label: 'Verified pair continuation' });
    $('#la-playback').hidden = false;
    // The corner + edge of the candidate pair and its slot; the rest dims.
    cube.highlightStage('pair', { slot: choice.slot });
    player.load({ startState: current.setup.state, moves: choice.moves });
    player.setActive(active);
    void player.play();
  }
  function answer(index, timedOut = false) {
    if (!active || loading || !current || selected != null || !round || round.status !== 'active') return;
    clearInterval(clockTimer);
    selected = timedOut ? 'timeout' : index;
    const choice = timedOut ? null : current.choices[index];
    const best = Math.min(...current.choices.map(item => item.weight));
    const correct = Boolean(choice && choice.weight === best);
    const ms = timedOut ? null : Math.max(0, performance.now() - startedAt);
    const key = itemKey('lookahead', String(currentSeed));
    review(learning, key, { correct, ms, responseThresholdMs: 3000 });
    saveLearning(storage, learning, LEARNING_KEY);
    const result = roundPanel.record({ correct, ms, caseId: String(currentSeed) });
    round = rounds.current;
    [...$('#la-choices').children].forEach((button, at) => {
      button.disabled = true;
      if (current.choices[at].weight === best) button.dataset.best = 'true';
      if (at === index && !correct) button.dataset.missed = 'true';
    });
    $('#la-feedback').textContent = timedOut ? 'Time is up. No answer was recorded.' : correct ? 'Good choice. This pair has the lowest verified cost.' : 'Another pair had a shorter verified solution. Keep it in view while you solve.';
    trainerOrbit?.update({ index: Math.max(0, (round?.answers?.length || 1) - 1), state: correct ? 'good' : 'bad', value: timedOut ? 'timeout' : `${(ms / 1000).toFixed(2)} s`, text: correct ? 'This pair has the lowest verified cost.' : 'Keep the next pair in view while you solve.' });
    showContinuation(choice);
    if (result.complete) return;
    else $('#la-next').hidden = false;
  }
  $('#la-next').addEventListener('click', () => {
    selected = null;
    startedAt = performance.now();
    if (activePin) {
      void nextPinnedSetup().then(setup => setup
        ? makeCase(dueSeed(), setup)
        : ($('#la-feedback').textContent = 'No new verified variation was found for this saved position. Choose another point in the solve.'));
    } else void makeCase();
  });
  if (start.invalid) $('#la-feedback').textContent = 'This setup is not valid move notation. Check the link and try again.';
  else if (start.moves.length || start.cases.length || start.review) {
    if (!caseFilter.valid) {
      $('#la-feedback').textContent = `Unknown lookahead case${caseFilter.invalid.length > 1 ? 's' : ''}: ${caseFilter.invalid.join(', ')}. Use a seed 1–48 or pair slot FR, BR, BL, or FL.`;
    } else {
      round = rounds.startRound({ drill: 'lookahead', preset: QUICK_ROUNDS.lookahead || { kind: 'cases', cases: 20 }, resume: false, from: start.from });
      roundPanel.refresh();
      startedAt = performance.now();
      const target = numericCases.map(Number).find(Number.isSafeInteger);
      void pinnedSetup().then(setup => makeCase(target || dueSeed(), setup));
    }
  } else if (round?.status === 'active') {
    startedAt = performance.now();
    void makeCase();
  }
  syncPageTokens(root.querySelector('.brain'));
  return {
    ready: cubeReady,
    getViewModel() {
      const snapshot = cube?.getSnapshot?.() ?? null;
      const buttons = [...(root.querySelectorAll('#la-choices .lookahead-choice') || [])];
      return { screen: 'trainer', drill: 'lookahead', phase: selected == null ? (current ? 'recognition' : loading ? 'loading' : 'idle') : 'feedback',
        currentCase: current ? { id: currentSeed ?? null, seed: activeCaseSeed || null, topColor: snapshot?.renderData?.colors?.U ?? null, orientation: snapshot?.caseColorSetting ?? null, targets: current } : null,
        answers: buttons.map((button, index) => ({ logicalKey: button.dataset.choice ?? String(index), displayKey: button.dataset.choice ?? String(index), label: button.textContent.trim(), selected: index === selected, correct: button.dataset.best === 'true' || button.classList.contains('is-best') })),
        round: roundPanel.getViewModel(), cube: snapshot, feedback: root.querySelector('#la-feedback')?.textContent || feedback || '', settings: { caseColor: readCaseColorSetting(storage) } };
    },
    setActive(value) {
      active = value;
      player?.setActive(value);
      roundPanel.setActive(value);
      if (!value) { generation++; clearInterval(clockTimer); }
      else if (round?.status === 'active' && current && selected == null) renderCase();
      else if (round?.status === 'active' && !current && !loading) void makeCase(dueSeed());
    },
    detach() { disposed = true; active = false; generation++; clearInterval(clockTimer); window.removeEventListener(CASE_COLOR_CHANGE_EVENT, onCaseColorChange); disposeCaseColorControl(); roundPanel.destroy(); trainerOrbit?.destroy(); player?.destroy(); cube?.destroy(); root.replaceChildren(); },
  };
}
