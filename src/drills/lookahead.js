import '../pages/page.css';
import './lookahead.css';
import { createCube3D } from '../cube-3d.js';
import { toRenderData, validateSolution } from '../cross-cube.js';
import { createPlannerSetup, plannerChoices, formatWeight, wideURequest, wideUResults } from '../f2l-planner.js';
import { solveCross } from '../cross-solver.js';
import { parseDrillStart } from './start-position.js';
import { createRoundStore, QUICK_ROUNDS } from './rounds.js';
import { syncPageTokens } from '../pages/tokens.js';
import { loadLearning, saveLearning, review, itemKey, chooseDue } from '../learning.js';
import { resolveDrillPosition } from './position.js';
import { analysisStateFromScramble } from '../analysis/long-replay.js';
import { relabelMoves } from '../analysis/normalize.js';

const LEARNING_KEY = 'cubesight-lookahead-learning-v1';
const randomSeed = () => Math.floor(Math.random() * 0x7fffffff) + 1;

export function createDrillPage(root, storage = globalThis.localStorage) {
  const start = parseDrillStart();
  const rounds = createRoundStore(storage);
  const learning = loadLearning(storage, LEARNING_KEY);
  let active = true, disposed = false, generation = 0, current = null, startedAt = 0, selected = null;
  let currentSeed = null, round = rounds.current?.drill === 'lookahead' ? rounds.current : null;
  let activePin = null;
  let cube = null, feedback = '', loading = false, clockTimer = null;
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

  root.innerHTML = `<section class="cs-page brain lookahead-page" data-brain-style="orbit">
    <header class="cs-head"><p class="cs-eyebrow">drills / F2L</p><h1>lookahead</h1><p class="cs-sub">Choose a pair to solve while keeping the next pair in view.</p></header>
    <section class="lookahead-session" aria-label="Lookahead round">
      <div class="lookahead-status"><span id="la-round-label">20-case round</span><span id="la-round-count">case 0 of 20</span><span id="la-combo">combo 0</span><span id="la-clock">3.00 s</span></div>
      <div class="lookahead-layout"><div class="lookahead-cube" id="la-cube" aria-label="F2L case cube"></div>
        <div class="lookahead-work"><p class="lookahead-prompt">Which pair would you solve next?</p><p class="lookahead-hint">Choose a short, verified pair solution. Keep your eyes on the other unsolved pairs.</p>
          <div id="la-choices" class="lookahead-choices" role="group" aria-label="Choose the next pair"></div>
          <p id="la-feedback" role="status" aria-live="polite">Preparing a verified F2L case…</p>
          <button id="la-next" class="la-next" type="button" hidden>next case</button>
        </div>
      </div>
      <div class="lookahead-actions"><button id="la-start" type="button">start 20-case round</button><a href="#/drills">all drills</a></div>
    </section>
    <section class="lookahead-result" id="la-result" hidden aria-live="polite"></section>
  </section>`;
  const $ = selector => root.querySelector(selector);
  try { cube = createCube3D($('#la-cube'), { mode: 'scout' }); }
  catch { $('#la-cube').textContent = '3D cube needs WebGL. The verified choices still work.'; }

  function labelState() {
    $('#la-round-count').textContent = `case ${round?.answers?.length ?? 0} of ${round?.preset?.cases ?? 20}`;
    $('#la-combo').textContent = `combo ${round?.combo ?? 0}`;
    $('#la-round-label').textContent = round?.status === 'active' ? 'round in progress' : '20-case round';
  }
  function renderCase() {
    if (!current) return;
    startedAt = performance.now();
    clearInterval(clockTimer);
    $('#la-clock').textContent = '3.00 s';
    clockTimer = setInterval(() => {
      const remaining = Math.max(0, 3000 - (performance.now() - startedAt));
      $('#la-clock').textContent = `${(remaining / 1000).toFixed(2)} s`;
      if (remaining <= 0) answer(null, true);
    }, 40);
    cube?.update({ ...toRenderData(current.setup.state), mode: 'scout' });
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
    labelState();
  }
  async function makeCase(seed = randomSeed(), custom = '') {
    const token = ++generation;
    clearInterval(clockTimer);
    loading = true;
    $('#la-feedback').textContent = 'Finding pair choices and checking each one…';
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
      const choices = plannerChoices(setup, results);
      if (choices.length < (customScramble ? 1 : 2)) continue;
      currentSeed = candidateSeed;
      current = { setup, choices, pinned: Boolean(custom?.pinned) };
      loading = false;
      renderCase();
      return;
    }
    loading = false;
    $('#la-feedback').textContent = 'No verified pair choice was found. Start a fresh case to try again.';
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
    const result = rounds.recordAnswer({ correct, ms, caseId: String(currentSeed) });
    round = rounds.current;
    [...$('#la-choices').children].forEach((button, at) => {
      button.disabled = true;
      if (current.choices[at].weight === best) button.dataset.best = 'true';
      if (at === index && !correct) button.dataset.missed = 'true';
    });
    $('#la-feedback').textContent = timedOut ? 'Time is up. No answer was recorded.' : correct ? 'Good choice. This pair has the lowest verified cost.' : 'Another pair had a shorter verified solution. Keep it in view while you solve.';
    labelState();
    if (result.complete) finishRound(result.summary);
    else $('#la-next').hidden = false;
  }
  function finishRound(summary) {
    $('#la-result').hidden = false;
    $('#la-result').innerHTML = `<p class="cs-eyebrow">round complete</p><h2>${summary.correct} of ${summary.total} choices were the shortest</h2><p>Best combo: ${summary.bestCombo}. ${summary.accuracy == null ? '' : `${Math.round(summary.accuracy * 100)}% accuracy.`}</p><button id="la-again" type="button">one more round</button>`;
    $('#la-again').addEventListener('click', () => startRound(false));
    $('#la-round-label').textContent = 'round complete';
  }
  function startRound(resume = true) {
    if (start.invalid) { $('#la-feedback').textContent = 'This setup is not valid move notation. Check the link and try again.'; return; }
    round = rounds.startRound({ drill: 'lookahead', preset: QUICK_ROUNDS.lookahead || { kind: 'cases', cases: 20 }, from: start.from, resume });
    $('#la-start').textContent = 'resume round';
    $('#la-result').hidden = true;
    selected = null;
    current = null;
    startedAt = performance.now();
    labelState();
    const target = start.cases.map(Number).find(Number.isInteger);
    void pinnedSetup().then(setup => makeCase(target || dueSeed(), setup));
  }
  $('#la-start').addEventListener('click', () => startRound(Boolean(round?.status === 'active')));
  $('#la-next').addEventListener('click', () => {
    selected = null;
    startedAt = performance.now();
    if (activePin) {
      void nextPinnedSetup().then(setup => setup
        ? makeCase(dueSeed(), setup)
        : ($('#la-feedback').textContent = 'No new verified variation was found for this saved position. Choose another point in the solve.'));
    } else void makeCase();
  });
  $('#la-start').textContent = round?.status === 'active' ? 'resume round' : 'start 20-case round';
  if (start.invalid) $('#la-feedback').textContent = 'This setup is not valid move notation. Check the link and try again.';
  else if (start.moves.length || start.cases.length || start.review) {
    round = rounds.startRound({ drill: 'lookahead', preset: QUICK_ROUNDS.lookahead || { kind: 'cases', cases: 20 }, resume: false, from: start.from });
    startedAt = performance.now();
    void pinnedSetup().then(setup => makeCase(Number(start.cases[0]) || dueSeed(), setup));
  } else if (round?.status === 'active') {
    labelState();
    startedAt = performance.now();
    void makeCase();
  }
  syncPageTokens(root);
  return {
    ready: Promise.resolve(),
    setActive(value) {
      active = value;
      if (!value) { generation++; clearInterval(clockTimer); }
      else if (round?.status === 'active' && current && selected == null) renderCase();
      else if (round?.status === 'active' && !current && !loading) void makeCase(dueSeed());
    },
    detach() { disposed = true; active = false; generation++; clearInterval(clockTimer); cube?.destroy(); root.replaceChildren(); },
  };
}
