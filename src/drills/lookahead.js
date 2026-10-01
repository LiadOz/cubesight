import '../pages/page.css';
import './lookahead.css';
import { createCube3D } from '../cube-3d.js';
import { stateFromScramble, toRenderData, validateSolution } from '../cross-cube.js';
import { createPlannerSetup, plannerChoices, formatWeight, wideURequest, wideUResults } from '../f2l-planner.js';
import { solveCross } from '../cross-solver.js';
import { parseDrillStart } from './start-position.js';
import { createRoundStore, QUICK_ROUNDS } from './rounds.js';
import { syncPageTokens } from '../pages/tokens.js';
import { loadLearning, saveLearning, review, itemKey } from '../learning.js';
import { resolveDrillPosition } from './position.js';

const LEARNING_KEY = 'cubesight-lookahead-learning-v1';
const randomSeed = () => Math.floor(Math.random() * 0x7fffffff) + 1;

export function createDrillPage(root, storage = globalThis.localStorage) {
  const start = parseDrillStart();
  const rounds = createRoundStore(storage);
  const learning = loadLearning(storage, LEARNING_KEY);
  let active = true, disposed = false, generation = 0, current = null, startedAt = 0, selected = null;
  let currentSeed = null, round = rounds.current?.drill === 'lookahead' ? rounds.current : null;
  let cube = null, feedback = '', loading = false;
  const positionPromise = resolveDrillPosition(start, 'lookahead');

  root.innerHTML = `<section class="cs-page brain lookahead-page" data-brain-style="orbit">
    <header class="cs-head"><p class="cs-eyebrow">drills / F2L</p><h1>lookahead</h1><p class="cs-sub">Choose a pair to solve while keeping the next pair in view.</p></header>
    <section class="lookahead-session" aria-label="Lookahead round">
      <div class="lookahead-status"><span id="la-round-label">20-case round</span><span id="la-round-count">case 0 of 20</span><span id="la-combo">combo 0</span></div>
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
    $('#la-feedback').textContent = feedback || 'Pick the pair you would solve first.';
    $('#la-next').hidden = true;
    $('#la-next').disabled = false;
    labelState();
  }
  async function makeCase(seed = randomSeed(), custom = '') {
    const token = ++generation;
    loading = true;
    $('#la-feedback').textContent = 'Finding pair choices and checking each one…';
    for (let attempt = 0; attempt < 5; attempt++) {
      if (token !== generation || disposed) return;
      const candidateSeed = seed + attempt;
      const setup = createPlannerSetup(candidateSeed);
      if (custom) {
        try {
          setup.scramble = custom;
          setup.state = stateFromScramble(custom);
          setup.solvedPairs = validateSolution(setup.state, [], 'D').pairs;
        }
        catch { /* An invalid start falls back to a generated, verified case. */ }
      }
      const results = setup.recoveryPlans.map(moves => ({ moves }));
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
      if (choices.length < 2) continue;
      currentSeed = candidateSeed;
      current = { setup, choices };
      loading = false;
      renderCase();
      return;
    }
    loading = false;
    $('#la-feedback').textContent = 'No verified pair choice was found. Start a fresh case to try again.';
  }
  function answer(index) {
    if (!active || loading || !current || selected != null || !round || round.status !== 'active') return;
    selected = index;
    const choice = current.choices[index];
    const best = Math.min(...current.choices.map(item => item.weight));
    const correct = choice.weight === best;
    const ms = Math.max(0, performance.now() - startedAt);
    const key = itemKey('lookahead', current.choices[index].slot);
    review(learning, key, { correct, ms, responseThresholdMs: 3000 });
    saveLearning(storage, learning, LEARNING_KEY);
    const result = rounds.recordAnswer({ correct, ms, caseId: String(currentSeed) });
    round = rounds.current;
    [...$('#la-choices').children].forEach((button, at) => {
      button.disabled = true;
      if (current.choices[at].weight === best) button.dataset.best = 'true';
      if (at === index && !correct) button.dataset.missed = 'true';
    });
    $('#la-feedback').textContent = correct ? 'Good choice. This pair has the lowest verified cost.' : 'Another pair had a shorter verified solution. Keep it in view while you solve.';
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
    round = rounds.startRound({ drill: 'lookahead', preset: QUICK_ROUNDS.lookahead || { kind: 'cases', cases: 20 }, from: start.from, resume });
    $('#la-start').textContent = 'resume round';
    rounds.markActiveDay();
    $('#la-result').hidden = true;
    selected = null;
    current = null;
    startedAt = performance.now();
    labelState();
    const target = start.cases.map(Number).find(Number.isInteger);
    void makeCase(target || randomSeed(), start.moves.length ? start.moves.join(' ') : '');
  }
  $('#la-start').addEventListener('click', () => startRound(Boolean(round?.status === 'active')));
  $('#la-next').addEventListener('click', () => {
    selected = null;
    startedAt = performance.now();
    void makeCase();
  });
  $('#la-start').textContent = round?.status === 'active' ? 'resume round' : 'start 20-case round';
  if (start.moves.length || start.cases.length || start.review) {
    round = rounds.startRound({ drill: 'lookahead', preset: QUICK_ROUNDS.lookahead || { kind: 'cases', cases: 20 }, resume: false, from: start.from });
    startedAt = performance.now();
    void positionPromise.then(position => makeCase(Number(start.cases[0]) || randomSeed(), position.moves.join(' ')));
  } else if (round?.status === 'active') {
    labelState();
    startedAt = performance.now();
    void makeCase();
  }
  syncPageTokens(root);
  return {
    ready: Promise.resolve(),
    setActive(value) { active = value; if (!value) generation++; else if (round?.status === 'active' && !current && !loading) void makeCase(); },
    detach() { disposed = true; active = false; generation++; cube?.destroy(); root.replaceChildren(); },
  };
}
