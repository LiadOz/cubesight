// The F2L drills (pair deduction, scan, planner), moved out of main.js so that they load only when #/drills/f2l
// is opened. The code below is main.js's own, unchanged apart from where shared state now lives (trainer-host.js
// and legacy-common.js). main.js keeps the page markup, routing and the pause overlay, and talks to this module
// through the small interface at the bottom.
import { fmt, KEYS } from '../copy/terms.js';
import { parseHash } from '../routes.js';
import { parseDrillStart } from './start-position.js';
import { parseCaseFilter } from './case-filter.js';
import { resolveDrillPosition } from './position.js';
import { createRoundPanel } from './round-panel.js';
import { analysisStateFromScramble } from '../analysis/long-replay.js';
import { relabelMoves } from '../analysis/normalize.js';
import { currentDShift } from '../solve-tracker.js';
import { createTrainerOrbit } from '../trainers/orbit-round.js';
import { mountCaseColorControl } from '../trainers/case-color-control.js';
import { mountTrainerSettings } from '../trainers/settings-controls.js';
import { readCaseColorSetting, CASE_COLOR_CHANGE_EVENT } from '../ui/cube/case-color.js';
import { createCaseDisplayMap, colorHex, displayColorKey, recolorStickers } from '../trainers/case-display.js';
import { createF2LCase, createF2LCaseFromWasm, createF2LCaseFromCubeState, createPseudoScanCase, createPinnedPseudoScanCase, colorNeutralOrientation } from '../f2l-logic.js';
import { solveCross } from '../cross-solver.js';
import { toRenderData, validateSolution } from '../cross-cube.js';
import { createPlannerSetup, plannerChoices, formatWeight, wideURequest, wideUResults } from '../f2l-planner.js';
import { review, f2lKey, chooseDue } from '../learning.js';
import { host, legacyRounds } from './trainer-host.js';
import { store, COLORS, FACE_COLOR, COLOR_FACE, formatMs, saveLearningState, updateLearningUI, ensureWasm, loadSharedCube, randomSeed } from './legacy-common.js';

// The Rust core generates F2L cases when it is up; until then the JavaScript generator does.
let wasmF2LCase = null;
const wasmLoaded = ensureWasm().then(wasm => { wasmF2LCase = wasm.f2l_case; }).catch(() => {});

let f2lStartHash = null;
let f2lStartPromise = null;
let f2lStartPosition = null;
let f2lActivePin = null;
let f2lCaseFilter = null;

function prepareF2LStart(hash) {
  if (f2lStartHash === hash) return;
  stopF2LScan();
  f2lState.plannerGeneration++;
  const params = new URLSearchParams(parseHash(hash).query);
  if (['scan', 'deduction', 'planner'].includes(params.get('drill'))) f2lState.drill = params.get('drill');
  if (params.has('pseudo')) {
    if (f2lState.drill === 'scan') f2lState.scanPseudo = params.get('pseudo') === '1';
    else if (f2lState.drill === 'planner') f2lState.plannerShiftD = params.get('pseudo') === '1';
  }
  f2lStartHash = hash;
  f2lStartPosition = null;
  f2lActivePin = null;
  const start = parseDrillStart(hash);
  f2lCaseFilter = parseCaseFilter(start.cases, ['FR', 'BR', 'BL', 'FL']);
  if (!(start.moves.length || start.review || start.invalid)) { f2lStartPromise = null; return; }
  f2lStartPromise = (async () => {
    if (start.invalid) return { error: 'This setup is not valid move notation. Check the link and try again.' };
    const position = await resolveDrillPosition(start, 'f2l');
    if (position.missing) return { error: 'This saved position is no longer available. Open the solve from history to choose another point.' };
    const moves = position.moves;
    const face = position.pin?.crossFace || start.face || 'D';
    const normalizedMoves = face === 'D' ? moves : relabelMoves(moves, face);
    try { return { state: analysisStateFromScramble(normalizedMoves.join(' ')), scramble: normalizedMoves.join(' '), pin: position.pin ?? null, face }; }
    catch { return { error: 'This position could not be loaded. No substitute case was started.' }; }
  })();
}

async function nextF2LPinPosition(pin) {
  if (!pin) return null;
  const { generatePinVariations } = await import('./pin-variations.js');
  const variations = await generatePinVariations(pin, { count: 3 });
  const variation = variations[Math.floor(Math.random() * variations.length)];
  if (!variation) return null;
  const face = pin.crossFace || 'D';
  const moves = variation.scramble.split(/\s+/).filter(Boolean);
  const normalized = face === 'D' ? moves : relabelMoves(moves, face);
  try { return { state: analysisStateFromScramble(normalized.join(' ')), scramble: normalized.join(' '), pin, face }; }
  catch { return null; }
}


let f2lCube3D = null;
let f2lState = {
  drill: ['deduction', 'scan', 'planner'].includes(localStorage.getItem('cubesight-f2l-mode')) ? localStorage.getItem('cubesight-f2l-mode') : 'deduction',
  current: null,
  caseNumber: 0,
  selected: null,
  matchedPairIds: [],
  feedback: null,
  locked: false,
  nextTimer: null,
  startedAt: 0,
  firstSelectedAt: 0,
  correction: false,
  scanDuration: [15, 30, 45].includes(Number(localStorage.getItem('cubesight-f2l-scan-seconds'))) ? Number(localStorage.getItem('cubesight-f2l-scan-seconds')) : 30,
  scanPseudo: localStorage.getItem('cubesight-f2l-scan-pseudo') === 'true',
  scanRunning: false,
  scanEndsAt: 0,
  scanScore: 0,
  scanMisses: 0,
  scanFrame: null,
  matchedPieceIds: [],
  plannerShiftD: false,
  planner: null,
  plannerGeneration: 0,
};

// Pair deduction: one arc per pair to be found in this case (3 or 4 depending on how many the cube lets you deduce),
// all empty, each filling as its pair is found. Rounds and the other F2L drills keep the round Orbit.
function f2lSlotSegments() {
  const current = f2lState.current;
  if (f2lState.drill !== 'deduction' || !current?.targetPairIds?.length) return null;
  const round = legacyRounds.f2l?.getViewModel?.().round;
  if (round && (round.status === 'active' || round.status === 'complete')) return null;
  return current.targetPairIds.map((pairId, index) => {
    const found = f2lState.matchedPairIds.includes(pairId);
    return { key: `slot-${index + 1}`, weight: 1, fill: found ? 1 : 0, state: found ? 'good' : 'future' };
  });
}
const f2lTrainerOrbit = createTrainerOrbit(document.querySelector('#f2l-view .cube-stage'), { customSegments: f2lSlotSegments });
mountCaseColorControl(document.querySelector('#f2l-view .intro-row'));
const f2lSettings = mountTrainerSettings(document.querySelector('#f2l-view .training-settings'));

function f2lViewModel() {
  const roundPanelModel = legacyRounds.f2l?.getViewModel?.() || null;
  const current = f2lState.current;
  const planner = f2lState.planner;
  const buttons = [...document.querySelectorAll('#f2l-planner-choices [data-planner-choice]')];
  const selectable = current?.selectablePieces || [];
  const orientation = current?.orientation || planner?.orientation;
  const displayMap = orientation
    ? current?.displayColorMap || createCaseDisplayMap(orientation, readCaseColorSetting(), `f2l-planner:${f2lState.caseNumber}`)
    : {};
  return { screen: 'trainer', drill: 'f2l', phase: f2lState.locked ? 'feedback' : current || planner ? 'recognition' : 'idle',
    currentCase: current || planner ? { number: f2lState.caseNumber, id: current?.id || `f2l-planner:${f2lState.caseNumber}`, seed: `f2l:${current?.id || f2lState.caseNumber}`, topColor: orientation?.U ? displayColorKey(orientation.U, displayMap) : null, orientation: displayMap, targets: current?.targetPairIds || planner?.choices?.map(choice => choice.slot) || null } : null,
    answers: planner ? buttons.map(button => { const choice = planner.choices[Number(button.dataset.plannerChoice)]; return { logicalKey: choice?.slot, displayKey: choice ? plannerPairLabel(choice, planner.orientation) : '', label: button.querySelector('strong')?.textContent || '', selected: Number(button.dataset.plannerChoice) === planner.answer, correct: choice?.weight === planner.choices[0]?.weight }; }) : selectable.map(id => ({ logicalKey: id, displayKey: id, label: id, selected: f2lState.selected === id, correct: f2lState.matchedPieces?.includes?.(id) || matchedPieces().includes(id) })),
    round: roundPanelModel, cube: f2lCube3D?.getSnapshot?.() || null, feedback: document.querySelector('#f2l-status')?.textContent || '', settings: { mode: f2lState.drill, scanDuration: f2lState.scanDuration, pseudo: f2lState.scanPseudo, plannerShiftD: f2lState.plannerShiftD, caseColor: readCaseColorSetting() } };
}

window.addEventListener(CASE_COLOR_CHANGE_EVENT, () => {
  if (host.activeTool === 'f2l' && f2lState.current) renderF2L();
  else if (host.activeTool === 'f2l' && f2lState.planner) renderF2LPlanner();
});


function matchedPieces() {
  if (!f2lState.current) return [];
  if (f2lState.drill === 'scan' && f2lState.scanPseudo) return f2lState.matchedPieceIds;
  return Object.entries(f2lState.current.pairByPiece)
    .filter(([, item]) => f2lState.matchedPairIds.includes(item.pairId))
    .map(([piece]) => piece);
}

function pairLearningKey(current, pairId) {
  const members = Object.entries(current.pairByPiece).filter(([, item]) => item.pairId === pairId);
  const corner = members.find(([, item]) => item.type === 'corner')?.[0] || '';
  const edge = members.find(([, item]) => item.type === 'edge')?.[0] || '';
  return f2lKey({ bottom: current.bottomColor, pair: pairId, position: `${corner}/${edge}`, visibility: current.frontColor });
}

function renderF2LControls() {
  document.querySelectorAll('[data-f2l-drill]').forEach((button) => {
    const selected = button.dataset.f2lDrill === f2lState.drill;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelector('#scan-duration-wrap').hidden = f2lState.drill !== 'scan' || f2lState.scanRunning;
  document.querySelector('#scan-pseudo-wrap').hidden = f2lState.drill !== 'scan';
  document.querySelector('#f2l-scan-pseudo').checked = f2lState.scanPseudo;
  document.querySelector('#f2l-scan-pseudo').disabled = f2lState.scanRunning;
  const scanStart = document.querySelector('#f2l-scan-start');
  scanStart.hidden = f2lState.drill !== 'scan' || f2lState.scanRunning;
  scanStart.textContent = `start ${f2lState.scanDuration} s scan`;
  document.querySelector('.f2l-controls > [data-action="new-f2l"]').hidden = f2lState.drill === 'scan';
  document.querySelector('#planner-shift-wrap').hidden = f2lState.drill !== 'planner';
  document.querySelector('#planner-shift-d').checked = f2lState.plannerShiftD;
  document.querySelector('#f2l-scan-duration').value = String(f2lState.scanDuration);
  document.querySelector('#f2l-planner-choices').hidden = f2lState.drill !== 'planner';
  document.querySelector('#f2l-selection').hidden = f2lState.drill === 'planner';
  f2lSettings.sync();
}

function recolorPlannerData(state, orientation, displayMap = {}) {
  const data = toRenderData(state);
  const replacements = Object.fromEntries(Object.entries(FACE_COLOR).map(([face, color]) => [COLORS[color].hex, colorHex(displayColorKey(orientation[face], displayMap))]));
  const replace = (value) => replacements[String(value).toLowerCase()] || value;
  data.mode = 'f2l';
  data.colors = Object.fromEntries(Object.entries(data.colors).map(([key, value]) => [key, replace(value)]));
  data.cornerStickers = Object.fromEntries(Object.entries(data.cornerStickers).map(([key, value]) => [key, replace(value)]));
  data.stickerColors = Object.fromEntries(Object.entries(data.stickerColors).map(([key, value]) => [key, replace(value)]));
  data.selectablePieces = [];
  return data;
}

function plannerPairLabel(choice, orientation) {
  const map = createCaseDisplayMap(orientation, readCaseColorSetting(), `f2l-planner:${f2lState.caseNumber}`);
  return [...choice.slot].map((face) => COLORS[displayColorKey(orientation[face], map)].label).join(' + ');
}

function renderF2LPlanner() {
  renderF2LControls();
  const planner = f2lState.planner;
  const displayMap = planner ? createCaseDisplayMap(planner.orientation, readCaseColorSetting(), `f2l-planner:${f2lState.caseNumber}`) : {};
  if (f2lCube3D && planner) {
    f2lCube3D.caseColorSetting = readCaseColorSetting();
    f2lCube3D.caseSeed = `f2l-planner:${f2lState.caseNumber}`;
  }
  const status = document.querySelector('#f2l-status');
  const choices = document.querySelector('#f2l-planner-choices');
  const roundIndex = legacyRounds.f2l?.getViewModel?.().round?.answers?.length ?? 0;
  f2lTrainerOrbit?.update({ index: roundIndex, state: 'current', value: `${planner?.setup.solvedCount ?? 0}/4 pairs` });
  document.querySelector('#f2l-orientation').textContent = planner
    ? `${COLORS[displayColorKey(planner.orientation.D, displayMap)].label} bottom · ${COLORS[displayColorKey(planner.orientation.F, displayMap)].label} front`
    : 'preparing a verified case…';
  document.querySelector('#f2l-timings').textContent = 'U/R/L/D/Uw = 1 · F/B = 5 · rotations = 2';
  const button = document.querySelector('#f2l-continue');
  button.dataset.action = 'new-f2l';
  button.innerHTML = `next case <kbd>space</kbd>`;
  button.setAttribute('aria-label', 'next case');
  document.querySelector('#f2l-cube').hidden = !planner;
  if (!planner) {
    status.className = '';
    status.textContent = f2lState.message || 'searching…';
    choices.innerHTML = '<div class="planner-loading">finding verified next-pair plans…</div>';
    return;
  }
  f2lCube3D?.update(recolorPlannerData(planner.setup.state, planner.orientation, displayMap));
  document.querySelector('#f2l-view').dataset.preference = 'neutral';
  document.querySelector('#f2l-view').dataset.bottomColor = displayColorKey(planner.orientation.D, displayMap);
  document.querySelector('#f2l-view').dataset.caseSource = 'verified-planner';
  const answerIsBest = planner.answer != null && planner.choices[planner.answer].weight === planner.choices[0].weight;
  status.className = planner.answer == null ? '' : answerIsBest ? 'is-correct' : 'is-wrong';
  status.textContent = planner.answer == null
    ? `Which pair has the cheapest verified insertion? ${f2lState.plannerShiftD ? 'The D layer starts shifted.' : 'The D layer starts aligned.'}`
    : answerIsBest
      ? `Nice. ${plannerPairLabel(planner.choices[planner.answer], planner.orientation)} costs ${formatWeight(planner.choices[planner.answer].weight)}.`
      : `${plannerPairLabel(planner.choices[planner.answer], planner.orientation)} costs ${formatWeight(planner.choices[planner.answer].weight)}. Try ${plannerPairLabel(planner.choices[0], planner.orientation)} at ${formatWeight(planner.choices[0].weight)} next time.`;
  choices.innerHTML = planner.choices.map((choice, index) => {
    const reveal = planner.answer == null ? '' : `<small>${fmt.moves(choice.moves.join(' '))} · weighted ${formatWeight(choice.weight)}${choice.pseudo ? ' · D fix restores the cross and pair' : ''}</small>`;
    const stateClass = planner.answer == null ? '' : choice.weight === planner.choices[0].weight ? 'best' : index === planner.answer ? 'picked-wrong' : '';
    return `<button class="planner-choice ${stateClass}" data-planner-choice="${index}" ${planner.answer == null ? '' : 'disabled'}><strong>${plannerPairLabel(choice, planner.orientation)}</strong><span>${choice.slot} slot</span>${reveal}</button>`;
  }).join('');
}

async function pinnedPlannerChoices(setup) {
  const { pinnedPairChoices } = await import('./pinned-pairs.js');
  return pinnedPairChoices(setup);
}

async function newF2LPlannerCase(pinned = null) {
  const generation = ++f2lState.plannerGeneration;
  f2lState = { ...f2lState, planner: null, locked: true, correction: false, caseNumber: f2lState.caseNumber + 1, message: 'searching…' };
  renderF2LPlanner();
  for (let attempt = 0; attempt < (pinned ? 1 : 8); attempt += 1) {
    const seed = randomSeed() + attempt;
    const setup = pinned ? {
      scramble: pinned.scramble,
      state: pinned.state,
      solvedPairs: validateSolution(pinned.state, [], 'D').pairs,
      dShift: null,
      recoveryPlans: [],
    } : createPlannerSetup(seed, { shiftD: f2lState.plannerShiftD });
    setup.solvedCount = setup.solvedPairs.length;
    if (!pinned && (setup.solvedCount < 0 || setup.solvedCount > 2)) continue;
    const results = setup.recoveryPlans.map((moves) => ({ moves }));
    const searches = pinned ? [] : [{ scramble: setup.scramble, timeLimitMs: 1800 }, ...['', "'"].map((suffix) => ({ ...wideURequest(setup, suffix), timeLimitMs: 900 }))];
    for (const search of searches) {
      if (generation !== f2lState.plannerGeneration || host.activeTool !== 'f2l' || f2lState.drill !== 'planner') return;
      try {
        const reply = await solveCross({ scramble: search.scramble, face: 'D', kind: 'xcross', maxResults: 8, maxDepth: 10, timeLimitMs: search.timeLimitMs });
        results.push(...(search.prefix ? wideUResults(search, reply.results) : reply.results));
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
    if (generation !== f2lState.plannerGeneration || host.activeTool !== 'f2l' || f2lState.drill !== 'planner') return;
    const foundChoices = pinned ? await pinnedPlannerChoices(setup) : plannerChoices(setup, results);
    const choices = f2lCaseFilter?.requested ? foundChoices.filter(choice => f2lCaseFilter.values.includes(choice.slot)) : foundChoices;
    if (generation !== f2lState.plannerGeneration || host.activeTool !== 'f2l' || f2lState.drill !== 'planner') return;
    if (choices.length < (pinned || f2lCaseFilter?.requested ? 1 : 2)) continue;
    f2lState.planner = { setup, choices, orientation: pinned ? FACE_COLOR : colorNeutralOrientation(seed), answer: null, pinned: Boolean(pinned) };
    f2lState.locked = false;
    f2lState.message = '';
    f2lState.startedAt = performance.now();
    renderF2LPlanner();
    return;
  }
  if (generation !== f2lState.plannerGeneration) return;
  f2lState.message = 'No verified case found. Select next case to try again.';
  renderF2LPlanner();
}

function stopF2LScan() {
  clearTimeout(f2lState.scanFrame);
  f2lState.scanFrame = null;
  f2lState.scanRunning = false;
}

function updateF2LScanClock() {
  if (!f2lState.scanRunning || f2lState.drill !== 'scan' || host.activeTool !== 'f2l') return;
  const remaining = Math.max(0, f2lState.scanEndsAt - performance.now());
  document.querySelector('#f2l-timings').textContent = `${(remaining / 1000).toFixed(1)} s · ${f2lState.scanScore} pairs · ${f2lState.scanMisses} miss`;
  if (remaining <= 0) {
    stopF2LScan();
    f2lState.locked = true;
    f2lState.selected = null;
    f2lState.message = `Time. You found ${f2lState.scanScore} ${f2lState.scanScore === 1 ? 'pair' : 'pairs'} with ${f2lState.scanMisses} ${f2lState.scanMisses === 1 ? 'miss' : 'misses'}.`;
    renderF2L();
    return;
  }
  f2lState.scanFrame = setTimeout(updateF2LScanClock, 100);
}

function startF2LScan() {
  if (f2lState.drill !== 'scan') return;
  stopF2LScan();
  f2lState.scanRunning = true;
  f2lState.scanScore = 0;
  f2lState.scanMisses = 0;
  f2lState.scanEndsAt = performance.now() + f2lState.scanDuration * 1000;
  if (f2lState.current?.pinned) {
    f2lState.locked = false;
    f2lState.startedAt = performance.now();
    f2lState.message = 'Find a corner and its matching edge.';
    renderF2L();
  } else newF2LCase();
  updateF2LScanClock();
}

function setF2LDrill(drill) {
  if (!['deduction', 'scan', 'planner'].includes(drill) || drill === f2lState.drill) return;
  stopF2LScan();
  f2lState.plannerGeneration += 1;
  f2lState.drill = drill;
  try { localStorage.setItem('cubesight-f2l-mode', drill); } catch { /* Keep the current drill for this page. */ }
  f2lState.planner = null;
  f2lState.current = null;
  f2lState.scanScore = 0;
  f2lState.scanMisses = 0;
  renderF2LControls();
  newF2LCase();
}

function renderF2L() {
  if (f2lState.drill === 'planner') return renderF2LPlanner();
  renderF2LControls();
  const current = f2lState.current;
  document.querySelector('#f2l-cube').hidden = !current;
  if (!current) { document.querySelector('#f2l-status').textContent = f2lState.message || 'preparing a case…'; return; }
  // A found pair stays exactly as it looks: a real cube does not re-tint what you have already spotted.
  const matched = matchedPieces();
  const selectable = current.selectablePieces.filter((piece) => !matched.includes(piece));
  const displayMap = current.displayColorMap = createCaseDisplayMap(current.orientation, readCaseColorSetting(), `f2l:${current.id || f2lState.caseNumber}`);
  if (f2lCube3D) {
    f2lCube3D.caseColorSetting = readCaseColorSetting();
    f2lCube3D.caseSeed = `f2l:${current.id || f2lState.caseNumber}`;
  }
  const displayPalette = Object.fromEntries(Object.keys(current.orientation).map(face => [face, colorHex(displayColorKey(current.orientation[face], displayMap))]));
  f2lCube3D?.update({
    mode: 'f2l',
    colors: displayPalette,
    cornerStickers: recolorStickers(current.cornerStickers, displayMap),
    stickerColors: recolorStickers(current.edgeStickers, displayMap),
    showAllCorners: true,
    targets: [],
    selectablePieces: selectable,
    f2lSelection: f2lState.selected ? [f2lState.selected] : [],
    f2lFeedback: f2lState.feedback,
    onPieceClick: handleF2LPiece,
  });
  const view = document.querySelector('#f2l-view');
  view.dataset.preference = 'neutral';
  view.dataset.bottomColor = displayColorKey(current.bottomColor, displayMap);
  view.dataset.caseSource = current.source;
  document.querySelector('#f2l-orientation').textContent = `${COLORS[displayColorKey(current.bottomColor, displayMap)].label.toLowerCase()} bottom · ${COLORS[displayColorKey(current.frontColor, displayMap)].label.toLowerCase()} front${current.dShift ? ` · ${current.dShift} offset` : ''}`;
  const roundAnswers = legacyRounds.f2l?.getViewModel?.().round?.answers?.length ?? 0;
  const currentRoundIndex = Math.max(0, roundAnswers - (f2lState.feedback ? 1 : 0));
  f2lTrainerOrbit?.update({ index: currentRoundIndex, state: f2lState.feedback?.status === 'correct' ? 'good' : f2lState.feedback?.status === 'wrong' ? 'bad' : 'current', value: f2lState.drill === 'scan' ? `${f2lState.scanScore} found` : `${f2lState.matchedPairIds.length}/${current.targetPairIds.length} pairs` });
  const status = document.querySelector('#f2l-status');
  status.textContent = f2lState.message || 'Select a corner or edge to begin.';
  status.className = f2lState.feedback?.status === 'correct' ? 'is-correct' : f2lState.feedback?.status === 'wrong' ? 'is-wrong' : '';
  const selection = document.querySelector('#f2l-selection');
  if (f2lState.selected) {
    const metadata = current.pieceByPiece?.[f2lState.selected] || current.pairByPiece[f2lState.selected];
    selection.className = 'selected-piece-card has-selection';
    selection.innerHTML = `<span>First selection</span><strong>${metadata.type === 'corner' ? 'Corner' : 'Edge'} · ${f2lState.selected}</strong><small>Now choose its matching ${metadata.type === 'corner' ? 'edge' : 'corner'}</small>`;
  } else {
    selection.className = 'selected-piece-card';
    selection.innerHTML = '<span>First selection</span><strong>None</strong><small>Click a visible F2L corner or edge</small>';
  }
  const continueButton = document.querySelector('#f2l-continue');
  if (continueButton) {
    const waitingScan = f2lState.drill === 'scan' && !f2lState.scanRunning;
    continueButton.dataset.action = waitingScan ? 'start-scan' : 'new-f2l';
    continueButton.innerHTML = `${waitingScan ? `start ${f2lState.scanDuration} s` : f2lState.correction ? 'next case' : 'skip'} <kbd>${waitingScan ? 'space' : 's'}</kbd>`;
    continueButton.classList.toggle('correction-button', Boolean(f2lState.correction));
    continueButton.setAttribute('aria-label', waitingScan ? `start ${f2lState.scanDuration} s scan` : f2lState.correction ? 'next case' : 'skip');
  }
}

function filterF2LCase(current) {
  if (!f2lCaseFilter?.requested) return current;
  const ids = f2lCaseFilter.values.map(slot => [...slot].map(face => current.orientation[face]).sort().join('-'));
  return {...current, targetPairIds: current.targetPairIds.filter(id => current.pairOptions?.[id] ? f2lCaseFilter.values.includes(current.pairOptions[id].slot) : ids.includes(id))};
}

function newF2LCase() {
  clearTimeout(host.trialTimeout);
  clearTimeout(f2lState.nextTimer);
  if (host.paused || host.activeTool !== 'f2l' || legacyRounds.f2l?.complete) return;
  if (f2lStartPromise) {
    const pending = f2lStartPromise;
    f2lStartPromise = null;
    f2lState = { ...f2lState, current: null, locked: true, message: 'loading the saved position…' };
    renderF2L();
    void pending.then(position => {
      if (host.activeTool !== 'f2l' || f2lStartHash !== location.hash) return;
      if (position.error) { f2lState.message = position.error; renderF2L(); return; }
      f2lStartPosition = position;
      newF2LCase();
    });
    return;
  }
  if (f2lCaseFilter && !f2lCaseFilter.valid) { f2lState.current = null; f2lState.planner = null; f2lState.locked = true; f2lState.message = 'No known F2L cases match this link.'; renderF2L(); return; }
  if (f2lState.drill === 'planner') {
    if (f2lStartPosition) {
      const pinned = f2lStartPosition; f2lStartPosition = null;
      f2lActivePin = pinned.pin ?? null;
      return newF2LPlannerCase(pinned);
    }
    if (f2lActivePin) {
      f2lState = { ...f2lState, current: null, locked: true, message: 'preparing a verified variation…' };
      renderF2L();
      void nextF2LPinPosition(f2lActivePin).then(position => {
        if (host.activeTool !== 'f2l') return;
        if (!position) { f2lState.message = 'No new verified variation was found for this saved position. Choose another point in the solve.'; renderF2L(); return; }
        newF2LPlannerCase(position);
      });
      return;
    }
    return newF2LPlannerCase();
  }
  // Pick the neutral bottom once; adaptive case filtering must not bias it.
  const pinned = f2lStartPosition;
  f2lStartPosition = null;
  if (pinned?.pin) f2lActivePin = pinned.pin;
  if (!pinned && f2lActivePin) {
    f2lState = { ...f2lState, current: null, locked: true, message: 'preparing a verified variation…' };
    renderF2L();
    void nextF2LPinPosition(f2lActivePin).then(position => {
      if (host.activeTool !== 'f2l') return;
      if (!position) { f2lState.message = 'No new verified variation was found for this saved position. Choose another point in the solve.'; renderF2L(); return; }
      f2lStartPosition = position;
      newF2LCase();
    });
    return;
  }
  const candidates = [];
  let generated;
  if (pinned) {
    generated = createF2LCaseFromCubeState(pinned.state, randomSeed(), 'neutral');
    if (f2lState.drill === 'scan' && f2lState.scanPseudo) generated = createPinnedPseudoScanCase(generated, currentDShift(pinned.state, 'D'));
  }
  else {
    // Pick the neutral bottom once; adaptive case filtering must not bias it.
    const bottom = Object.keys(COLORS)[randomSeed() % 6];
    for (let attempt = 0; attempt < 64; attempt++) {
      const seed = randomSeed();
      let candidate;
      if (wasmF2LCase) candidate = createF2LCaseFromWasm(JSON.parse(wasmF2LCase(BigInt(seed), COLOR_FACE[bottom])), seed, 'neutral');
      else candidate = createF2LCase(seed, bottom);
      if (f2lState.drill === 'scan' && f2lState.scanPseudo) candidate = createPseudoScanCase(candidate, 1 + seed % 3);
      candidate = filterF2LCase(candidate);
      candidate.targetPairIds.forEach((pairId) => candidates.push({ current: candidate, learningKey: f2lState.scanPseudo && f2lState.drill === 'scan' ? `scan-pseudo:${pairId}` : pairLearningKey(candidate, pairId) }));
      if (candidates.length >= 32) break;
    }
    generated = chooseDue(store.learning, candidates)?.current;
  }
  if (pinned && generated) generated = filterF2LCase(generated);
  if (pinned && generated && !generated.targetPairIds.length && f2lState.drill !== 'planner') {
    f2lState.current = null;
    f2lState.locked = true;
    f2lState.message = generated.pseudoError || 'No pair is visible enough to identify from this pinned position. Choose another point in the solve.';
    renderF2L();
    return;
  }
  if (!generated) {
    f2lState.locked = true;
    document.querySelector('#f2l-status').textContent = 'No suitable case found. Select next case to try again.';
    return;
  }
  f2lState = {
    ...f2lState,
    current: {...generated, pinned: Boolean(pinned)},
    caseNumber: f2lState.caseNumber + 1,
    selected: null,
    matchedPairIds: [],
    matchedPieceIds: [],
    feedback: null,
    locked: f2lState.drill === 'scan' && !f2lState.scanRunning,
    nextTimer: null,
    message: f2lState.drill === 'scan'
      ? (f2lState.scanRunning
        ? (f2lState.scanPseudo ? `Tap a corner, then the edge of its ${generated.dShift}-shifted slot.` : 'Tap a visible corner, then its matching edge. Keep finding pairs.')
        : `Tap start ${f2lState.scanDuration} s scan above the cube, then tap a corner and its ${f2lState.scanPseudo ? 'D offset pair' : 'matching edge'}.`)
      : 'Select a corner or edge to begin.',
    startedAt: 0,
    firstSelectedAt: 0,
    correction: false,
  };
  renderF2L();
  document.querySelector('#f2l-timings').textContent = f2lState.drill === 'scan'
    ? `Round score ${f2lState.scanScore} · misses ${f2lState.scanMisses}`
    : 'Find a pair to see search and matching times.';
  f2lState.startedAt = performance.now();
}

function handleF2LPiece({ piece }) {
  if (host.paused || host.activeTool !== 'f2l' || f2lState.locked || !f2lState.current?.pieceByPiece?.[piece] || matchedPieces().includes(piece)) return;
  const current = f2lState.current;
  const picked = current.pieceByPiece[piece];
  if (!f2lState.selected) {
    f2lState.selected = piece;
    f2lState.firstSelectedAt = performance.now();
    f2lState.feedback = null;
    f2lState.message = `Selected ${piece}. Now find its matching ${picked.type === 'corner' ? 'edge' : 'corner'}.`;
    renderF2L();
    return;
  }
  if (f2lState.selected === piece) {
    f2lState.selected = null;
    f2lState.firstSelectedAt = 0;
    f2lState.message = 'Selection cleared. Choose either piece of a pair.';
    renderF2L();
    return;
  }
  const first = current.pieceByPiece[f2lState.selected];
  const second = picked;
  if (first.type === second.type) {
    f2lState.message = `That is another ${second.type}. Choose ${second.type === 'corner' ? 'an edge' : 'a corner'}.`;
    renderF2L();
    return;
  }

  const sameTruePair = first.pairId && first.pairId === second.pairId;
  const pseudoScan = f2lState.drill === 'scan' && f2lState.scanPseudo;
  const corner = first.type === 'corner' ? first : second;
  const edge = first.type === 'edge' ? first : second;
  const pseudoPairId = `${corner.pairId}>${edge.pairId}`;
  const correct = pseudoScan ? current.targetPairIds.includes(pseudoPairId) : sameTruePair && current.targetPairIds.includes(first.pairId);
  if (sameTruePair && !correct && !pseudoScan) {
    f2lState.selected = null;
    f2lState.firstSelectedAt = 0;
    f2lState.message = 'Those match, but they are outside this case’s pairs. This one won’t count.';
    renderF2L();
    return;
  }
  f2lState.feedback = { status: correct ? 'correct' : 'wrong', piece };
  if (f2lState.drill === 'scan') {
    legacyRounds.f2l?.record({correct:Boolean(correct),ms:Math.round(performance.now()-f2lState.firstSelectedAt),caseId:pseudoScan?pseudoPairId:first.pairId});
    if (legacyRounds.f2l?.complete) return;
    const firstPiece = f2lState.selected;
    f2lState.selected = null;
    f2lState.firstSelectedAt = 0;
    if (correct) {
      f2lState.scanScore += 1;
      f2lState.matchedPairIds.push(pseudoScan ? pseudoPairId : first.pairId);
      if (pseudoScan) f2lState.matchedPieceIds.push(firstPiece, piece);
      f2lState.message = pseudoScan ? 'Pseudo pair!' : 'Found.';
      renderF2L();
      if (f2lState.matchedPairIds.length === current.targetPairIds.length) {
        f2lState.nextTimer = setTimeout(() => { if (f2lState.scanRunning) newF2LCase(); }, 180);
      }
    } else {
      f2lState.scanMisses += 1;
      f2lState.message = pseudoScan ? 'Miss.' : 'Miss.';
      f2lState.feedback = null;
      renderF2L();
    }
    return;
  }
  clearTimeout(host.trialTimeout);
  const now = performance.now();
  const elapsed = Math.round(now - f2lState.startedAt);
  const findMs = Math.round(f2lState.firstSelectedAt - f2lState.startedAt);
  const matchMs = Math.round(now - f2lState.firstSelectedAt);
  document.querySelector('#f2l-timings').textContent = `find ${formatMs(findMs)} · match ${formatMs(matchMs)}`;
  const pairId = first.pairId || second.pairId;
  if (pairId) review(store.learning, pairLearningKey(current, pairId), { correct: Boolean(correct), ms: elapsed, responseThresholdMs: 3000 });
  saveLearningState();
  legacyRounds.f2l?.record({correct:Boolean(correct),ms:elapsed,caseId:pairId});
  if (legacyRounds.f2l?.complete) return;
  if (correct) {
    f2lState.matchedPairIds.push(first.pairId);
    f2lState.message = 'Pair found. Nice deduction.';
    const complete = f2lState.matchedPairIds.length === current.targetPairIds.length;
    f2lState.locked = true;
    const answeredCase = f2lState;
    renderF2L();
    f2lState.nextTimer = setTimeout(() => {
      if (host.activeTool !== 'f2l' || f2lState !== answeredCase || host.paused) return;
      if (complete) newF2LCase();
      else {
        f2lState.selected = null;
        f2lState.feedback = null;
        f2lState.firstSelectedAt = 0;
        f2lState.locked = false;
        f2lState.message = 'Nice. Find another pair.';
        renderF2L();
        f2lState.startedAt = performance.now();
      }
    }, complete ? 1050 : 600);
  } else {
    const mate = first.pairId && Object.entries(current.pieceByPiece).find(([candidate, metadata]) => candidate !== f2lState.selected && metadata.type !== first.type && metadata.pairId === first.pairId)?.[0];
    const colors = first.pairId?.split('-').map((color) => COLORS[color].label).join(' + ');
    f2lState.message = `Those do not match. ${mate ? `${f2lState.selected} pairs with ${mate}: ${colors}. Green outlines show the correct pair.` : `An F2L corner contains ${COLORS[current.bottomColor].label}; its edge has the other two colors.`}`;
    f2lState.feedback.correctPieces = mate ? [f2lState.selected, mate] : [];
    f2lState.locked = true;
    f2lState.correction = true;
    renderF2L();
    f2lState.nextTimer = null;
  }
}


document.addEventListener('click', (event) => {
  const f2lDrillButton = event.target.closest('[data-f2l-drill]');
  if (f2lDrillButton) return setF2LDrill(f2lDrillButton.dataset.f2lDrill);
  const plannerChoice = event.target.closest('[data-planner-choice]');
  if (plannerChoice && f2lState.drill === 'planner' && f2lState.planner?.answer == null) {
    f2lState.planner.answer = Number(plannerChoice.dataset.plannerChoice);
    const choice = f2lState.planner.choices[f2lState.planner.answer];
    legacyRounds.f2l?.record({correct:choice.weight===f2lState.planner.choices[0].weight,ms:Math.round(performance.now()-f2lState.startedAt),caseId:choice.slot});
    f2lState.locked = true;
    return renderF2LPlanner();
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'new-f2l' && (host.activeTool === 'f2l' || !f2lState.correction)) newF2LCase();
  if (action === 'start-scan' && host.activeTool === 'f2l') startF2LScan();
});

document.querySelector('#f2l-scan-duration').addEventListener('change', (event) => {
  f2lState.scanDuration = [15, 30, 45].includes(Number(event.target.value)) ? Number(event.target.value) : 30;
  try { localStorage.setItem('cubesight-f2l-scan-seconds', String(f2lState.scanDuration)); } catch { /* Keep it in memory. */ }
  if (!f2lState.scanRunning) f2lState.message = `Tap start ${f2lState.scanDuration} s scan above the cube, then tap a corner and its ${f2lState.scanPseudo ? 'D offset pair' : 'matching edge'}.`;
  renderF2L();
});
document.querySelector('#f2l-scan-pseudo').addEventListener('change', (event) => {
  if (f2lState.scanRunning) return;
  f2lState.scanPseudo = event.target.checked;
  try { localStorage.setItem('cubesight-f2l-scan-pseudo', String(f2lState.scanPseudo)); } catch { /* Keep it in memory. */ }
  if (host.activeTool === 'f2l' && f2lState.drill === 'scan') newF2LCase();
});
document.querySelector('#planner-shift-d').addEventListener('change', (event) => {
  f2lState.plannerShiftD = event.target.checked;
  if (host.activeTool === 'f2l' && f2lState.drill === 'planner') newF2LPlannerCase();
});

let legacyCubeLoad = null;
function syncLegacyCubes(tool) {
  if (tool !== 'f2l' && f2lCube3D) { f2lCube3D.destroy(); f2lCube3D = null; }
  if (legacyCubeLoad?.tool === tool) return;
  legacyCubeLoad?.controller.abort();
  legacyCubeLoad = null;
  if (tool !== 'f2l' || f2lCube3D) return;
  const controller = new AbortController();
  legacyCubeLoad = { tool, controller };
  const mount = document.querySelector('#f2l-cube');
  void Promise.resolve().then(async () => {
    // copy-ok: internal cancellation reason used only to stop stale cube mounts
    if (controller.signal.aborted) throw new DOMException('Trainer cube mount was cancelled.', 'AbortError');
    const { Cube } = await loadSharedCube();
    // copy-ok: internal cancellation reason used only to stop stale cube mounts
    if (controller.signal.aborted) throw new DOMException('Trainer cube mount was cancelled.', 'AbortError');
    // The legacy renderer may have installed its accessible SVG fallback before
    // this shared WebGL cube was ready. Keep one visible Cube in the stage.
    mount.replaceChildren();
    const view = new Cube(mount, { mode: 'case', size: 'L', caseColorSetting: readCaseColorSetting(), caseSeed: `${tool}:initial`, label: 'F2L deduction case' });
    view.setViewOffset = (...args) => view.cube.setViewOffset?.(...args);
    view.recenterGyro = (...args) => view.cube.recenterGyro?.(...args);
    return view;
  }).then(view => {
    if (controller.signal.aborted || host.activeTool !== tool) { view.destroy(); return; }
    f2lCube3D = view; renderF2L();
  }).catch(error => {
    if (error.name === 'AbortError') return;
    if (host.activeTool === 'f2l') mount.textContent = 'F2L drills need WebGL. Enable hardware acceleration or try another browser.';
  }).finally(() => { if (legacyCubeLoad?.controller === controller) legacyCubeLoad = null; });
}

// What main.js calls. Everything else in this file is private to the drill.
export const f2l = {
  /** Resolves once the Rust core is up (or has failed), so the first case is generated the same way every time. */
  ready: wasmLoaded,
  /** Open the drill: parse the start position from the hash, show the cube, deal the first case. */
  enter(hash) {
    syncLegacyCubes('f2l');
    prepareF2LStart(hash);
    newF2LCase();
    legacyRounds.f2l ??= createRoundPanel(document.querySelector('#f2l-view'), {
      orbitHost: document.querySelector('#f2l-view .cube-stage'),
      drill: 'f2l',
      getSettings: () => ({drill:f2lState.drill,pseudo:f2lState.plannerShiftD}),
      onComplete: () => { f2lState.locked=true;clearTimeout(f2lState.nextTimer);stopF2LScan();f2lState.plannerGeneration++; },
      onRestart: () => { host.paused=false;newF2LCase(); },
    });
    f2lTrainerOrbit.connect(legacyRounds.f2l.orbit, () => f2lViewModel());
    legacyRounds.f2l.setActive(true);
    updateLearningUI();
  },
  syncCube: syncLegacyCubes,
  /** Called on every route change: stop what the drill had running (the scan clock, a planner search). */
  leave(tool) {
    clearTimeout(f2lState.nextTimer);
    if (tool !== 'f2l') {
      stopF2LScan();
      f2lState.plannerGeneration += 1;
    }
  },
  lock() { f2lState.locked = true; },
  pause() {
    clearTimeout(f2lState.nextTimer);
    stopF2LScan();
    f2lState.plannerGeneration += 1;
    f2lState.locked = true;
  },
  resume: () => newF2LCase(),
  handleKey(event) {
      if (f2lState.drill === 'scan' && !f2lState.scanRunning && (event.key === ' ' || event.key === 'Enter')) return startF2LScan();
      if ((event.key === ' ' || event.key === 'Enter') && f2lState.correction) newF2LCase();
      else if (KEYS.case[event.key.toLowerCase()] === 'skip') newF2LCase();
    return;
  },
  getViewModel: f2lViewModel,
  /** Test-only (the DEV hook in main.js): the pairs of the current case and the cube's own click handler. */
  testCase: () => ({ targets: f2lState.current?.targetPairIds ?? [], pieces: f2lState.current?.pieceByPiece ?? {}, matched: f2lState.matchedPairIds }),
  testPick: piece => handleF2LPiece({ piece }),
};
