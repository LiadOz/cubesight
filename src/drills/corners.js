// The corner recognition drill, moved out of main.js so that it loads only when #/drills/corners is opened.
// The code below is main.js's own, unchanged apart from where shared state now lives (trainer-host.js and
// legacy-common.js). main.js keeps the page markup, routing and the pause overlay, and talks to this module
// through the small interface at the bottom.
import '../recognition-profile.css';
import { fmt, KEYS } from '../copy/terms.js';
import { parseDrillStart } from './start-position.js';
import { parseCaseFilter } from './case-filter.js';
import { resolveDrillPosition } from './position.js';
import { createRoundPanel } from './round-panel.js';
import { analysisStateFromScramble } from '../analysis/long-replay.js';
import { relabelMoves } from '../analysis/normalize.js';
import { renderCube } from '../cube-renderer.js';
import { createTrainerOrbit } from '../trainers/orbit-round.js';
import { mountCaseColorControl } from '../trainers/case-color-control.js';
import { mountTrainerSettings } from '../trainers/settings-controls.js';
import { readCaseColorSetting, CASE_COLOR_CHANGE_EVENT } from '../ui/cube/case-color.js';
import { createCaseDisplayMap, colorHex, displayColorKey, logicalColorKey, recolorStickers } from '../trainers/case-display.js';
import { toRenderData } from '../cross-cube.js';
import { loadLearning, review, itemKey, chooseDue } from '../learning.js';
import { createGlancePacing } from '../glance-pacing.js';
import { createRecognitionProfile } from '../recognition-profile.js';
import { chooseCornerView } from '../corner-view.js';
import { host, legacyRounds } from './trainer-host.js';
import { store, COLORS, FACE_COLOR, formatMs, saveLearningState, updateLearningUI, armTrialTimeout, expireTrial, ensureWasm, loadSharedCube } from './legacy-common.js';

let cornerStartHash = null;
let cornerStartPromise = null;
let cornerStartPosition = null;
let cornerCaseFilter = null;

function prepareCornerStart(hash) {
  if (cornerStartHash === hash) return;
  cornerStartHash = hash;
  cornerStartPosition = null;
  const start = parseDrillStart(hash);
  cornerCaseFilter = parseCaseFilter(start.cases, [...TARGETS.map(item => item.corner), ...CORNER_PIECES.map(familyId)]);
  if (!(start.moves.length || start.review || start.invalid)) { cornerStartPromise = null; return; }
  cornerStartPromise = (async () => {
    if (start.invalid) return { error: 'This setup is not valid move notation. Check the link and try again.' };
    const position = await resolveDrillPosition(start, 'corners');
    if (position.missing) return { error: 'This saved position is no longer available. Open the solve from history to choose another point.' };
    const face = position.pin?.crossFace || start.face || 'D';
    const moves = face === 'D' ? position.moves : relabelMoves(position.moves, face);
    try {
      return { state: analysisStateFromScramble(moves.join(' ')), pin: position.pin ?? null, cases: start.cases };
    } catch { return { error: 'This position could not be loaded. No substitute case was started.' }; }
  })();
}

const FACE_VECTORS = {
  white: [0, 1, 0], yellow: [0, -1, 0],
  green: [0, 0, 1], blue: [0, 0, -1],
  red: [1, 0, 0], orange: [-1, 0, 0],
};
const VECTOR_COLORS = Object.fromEntries(Object.entries(FACE_VECTORS).map(([color, v]) => [v.join(','), color]));
const TARGETS = [
  { id: 'ufl', corner: 'UFL', faces: ['U', 'F', 'L'], visible: ['U', 'F'], hidden: 'L' },
  { id: 'ubr', corner: 'UBR', faces: ['U', 'B', 'R'], visible: ['U', 'R'], hidden: 'B' },
  { id: 'dfr', corner: 'DFR', faces: ['D', 'F', 'R'], visible: ['F', 'R'], hidden: 'D' },
];
const CORNER_SLOTS = [
  { id: 'ufr', corner: 'UFR', faces: ['U', 'R', 'F'] },
  { id: 'ubr', corner: 'UBR', faces: ['U', 'B', 'R'] },
  { id: 'ubl', corner: 'UBL', faces: ['U', 'L', 'B'] },
  { id: 'ufl', corner: 'UFL', faces: ['U', 'F', 'L'] },
  { id: 'dfr', corner: 'DFR', faces: ['D', 'F', 'R'] },
  { id: 'dfl', corner: 'DFL', faces: ['D', 'L', 'F'] },
  { id: 'dbl', corner: 'DBL', faces: ['D', 'B', 'L'] },
  { id: 'drb', corner: 'DRB', faces: ['D', 'R', 'B'] },
];
// Cyclic sticker order is significant; reversing any row creates a mirrored,
// impossible corner. This is the standard U/D, F/B, R/L color scheme.
const CORNER_PIECE_FACES = [
  ['U', 'R', 'F'], ['U', 'B', 'R'], ['U', 'L', 'B'], ['U', 'F', 'L'],
  ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B'],
];
const CORNER_PIECES = CORNER_PIECE_FACES.map((piece) => piece.map((face) => FACE_COLOR[face]));
const EDGE_SLOTS = [
  ['U', 'F', 'UF'], ['U', 'R', 'UR'], ['U', 'B', 'UB'], ['U', 'L', 'UL'],
  ['F', 'R', 'FR'], ['R', 'B', 'BR'], ['B', 'L', 'BL'], ['L', 'F', 'FL'],
  ['D', 'F', 'DF'], ['D', 'R', 'DR'], ['D', 'B', 'DB'], ['D', 'L', 'DL'],
];
// v2 resets results recorded by the original mirrored-corner generator.
const STORAGE_KEY = 'cubesight-progress-v2';

let previousCornerView = '';

const initialStats = () => ({ attempts: 0, correct: 0, totalMs: 0, bestMs: null, streak: 0, bestStreak: 0, byCase: {}, history: [] });
const GLANCE_EXPOSURES = [25, 50, 75, 100, 150, 200, 300, 450, 600, 800, 1000, 1500];
let stats = loadStats();
let session = { attempts: 0, correct: 0, times: [], streak: 0, outcomes: [] };
let state = {
  mode: ['single', 'triple', 'recall'].includes(localStorage.getItem('cubesight-corner-mode')) ? localStorage.getItem('cubesight-corner-mode') : 'single',
  sprint: false,
  sprintLength: 10,
  current: null,
  startedAt: 0,
  locked: false,
  timerFrame: null,
  answerChoices: [],
  glance: localStorage.getItem('cubesight-corner-glance') === 'true',
  exposureMs: GLANCE_EXPOSURES.includes(Number(localStorage.getItem('cubesight-corner-exposure-ms'))) ? Number(localStorage.getItem('cubesight-corner-exposure-ms')) : 600,
  exposureMode: localStorage.getItem('cubesight-corner-exposure-mode') === 'fixed' ? 'fixed' : 'adaptive',
  glanceTimer: null,
  transitionTimer: null,
  onsetFrame: null,
  generation: 0,
};
const glancePacing = createGlancePacing({ mode: state.exposureMode, exposureMs: state.exposureMs });
let cube3D = null;


// A three-corner case is three guesses; with no quick round running the Orbit shows them, one arc per guess.
function cornerGuessSegments() {
  if (!state.current || !['triple', 'recall'].includes(state.mode)) return null;
  const round = legacyRounds.corner?.getViewModel?.().round;
  if (round && (round.status === 'active' || round.status === 'complete')) return null;
  const guesses = state.current.guesses || [];
  return state.current.targets.map((_, index) => ({
    key: `guess-${index + 1}`,
    weight: 1,
    fill: guesses[index] === undefined ? 0 : 1,
    // Every arc starts empty (future, no fill), the one being answered included; an answer fills it, teal when right and amber when wrong.
    // Recall keeps answers unmarked until the reveal, as the mode promises no interim feedback: a neutral fill, no tone.
    state: guesses[index] === true ? 'good' : guesses[index] === false ? 'bad'
      : index < (state.current.recallAnswers?.length ?? 0) ? 'done' : 'future',
  }));
}
const cornerTrainerOrbit = createTrainerOrbit(document.querySelector('#corner-view .cube-stage'), { customSegments: cornerGuessSegments });
mountCaseColorControl(document.querySelector('#corner-view .intro-row'));
const cornerSettings = mountTrainerSettings(document.querySelector('#corner-view .training-settings'));

function cornerViewModel() {
  const roundPanelModel = legacyRounds.corner?.getViewModel?.() || null;
  const current = state.current;
  const target = activeTarget();
  const buttons = [...document.querySelectorAll('#answers [data-color]')];
  const correct = target?.target?.hidden ? target.stickers?.[target.target.hidden] : null;
  const round = state.sprint ? { ...(roundPanelModel || {}), round: { status: session.attempts >= state.sprintLength ? 'complete' : 'active', kind: 'cases', total: state.sprintLength, answered: session.attempts, answers: session.outcomes, combo: session.streak, bestCombo: stats.bestStreak } } : roundPanelModel;
  return { screen: 'trainer', drill: 'corner', phase: state.locked ? 'feedback' : current ? 'recognition' : 'idle',
    currentCase: current ? { id: target?.target?.id || current.targets?.map(item => item.target?.id).join('+'), seed: current.caseSeed || null, topColor: current.orientation?.U ? displayColorKey(current.orientation.U, current.displayColorMap) : null, orientation: current.displayColorMap || null, targets: current.targets?.map(item => ({ id: item.target?.id, hidden: displayColorKey(item.hidden, current.displayColorMap), visible: item.visible?.map(color => displayColorKey(color, current.displayColorMap)) })) || null } : null,
    answers: buttons.map(button => ({ logicalKey: button.dataset.logicalColor || logicalColorKey(button.dataset.color, current?.displayColorMap), displayKey: button.dataset.color, label: button.querySelector('span')?.textContent || '', selected: button.classList.contains('wrong') || button.classList.contains('correct'), correct: logicalColorKey(button.dataset.color, current?.displayColorMap) === correct })),
    round, cube: cube3D?.getSnapshot?.() || null, feedback: document.querySelector('.corner-result')?.textContent || '', settings: { mode: state.mode, glance: state.glance, exposureMode: state.exposureMode, exposureMs: state.exposureMs, caseColor: readCaseColorSetting() } };
}

window.addEventListener(CASE_COLOR_CHANGE_EVENT, () => {
  if (host.activeTool === 'corner' && state.current) {
    state.current.displayColorSetting = null;
    renderCurrentCase();
    renderAnswers();
  }
});
document.addEventListener('cubesight-recenter', () => { if (['corner', 'f2l'].includes(host.activeTool)) cube3D?.recenterGyro?.(); });

const recognitionProfile = createRecognitionProfile(document.querySelector('#recognition-profile'));

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function opposite(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] === -1;
}

function allOrientations() {
  const colors = Object.keys(COLORS);
  const result = [];
  for (const up of colors) {
    for (const front of colors) {
      const u = FACE_VECTORS[up];
      const f = FACE_VECTORS[front];
      if (up === front || opposite(u, f) || u.join() === f.join()) continue;
      const right = VECTOR_COLORS[cross(u, f).join(',')];
      const down = VECTOR_COLORS[u.map((n) => -n).join(',')];
      const back = VECTOR_COLORS[f.map((n) => -n).join(',')];
      const left = VECTOR_COLORS[FACE_VECTORS[right].map((n) => -n).join(',')];
      result.push({ U: up, D: down, F: front, B: back, R: right, L: left });
    }
  }
  return result;
}

const ORIENTATIONS = allOrientations();

function loadStats() {
  try { return { ...initialStats(), ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }; }
  catch { return initialStats(); }
}

function saveStats() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch { /* Practice still works without storage. */ }
}

function cancelCornerTimers() {
  clearTimeout(host.trialTimeout);
  state.generation++;
  cancelAnimationFrame(state.onsetFrame);
  cancelAnimationFrame(state.timerFrame);
  clearTimeout(state.glanceTimer);
  clearTimeout(state.transitionTimer);
  state.timerFrame = null;
  state.glanceTimer = null;
  state.transitionTimer = null;
  state.holdSkip = null;
  document.querySelector('#cube')?.classList.remove('glance-mask');
  const overlay = document.querySelector('#glance-overlay');
  if (overlay) overlay.hidden = true;
}

function cornerLearningKey(item) {
  const visible = item.target.visible.map((face) => `${face}=${item.stickers[face]}`).join(',');
  // Exposure is practice difficulty, not case identity. Keeping this stable
  // lets spacing follow the pattern while adaptive glance pacing changes.
  // The exact exposure still lives in attempt history for analysis.
  return itemKey('corner', item.family, `${state.mode}:${item.target.corner}:${visible}:${usesGlance() ? 'glance' : 'open'}`);
}

const multiCorner = () => state.mode === 'triple' || state.mode === 'recall';
const usesGlance = () => state.glance || state.mode === 'recall';

function familyId(colors) {
  return [...colors].sort().join('-');
}

function familyLabel(id) {
  return id.split('-').map((c) => COLORS[c].label).join(' · ');
}

function makeTargetCase(target, piece, twist = Math.floor(Math.random() * 3)) {
  const stickers = Object.fromEntries(target.faces.map((face, index) => [face, piece[(index + twist) % 3]]));
  return { target, colors: piece, stickers, family: familyId(piece), twist };
}

function createCornerCaseFromCubeState(cubeState, requestedCases = []) {
  const rendered = toRenderData(cubeState);
  const nameByHex = Object.fromEntries(Object.entries(COLORS).map(([name, color]) => [color.hex.toLowerCase(), name]));
  const orientation = Object.fromEntries(Object.entries(rendered.colors).map(([face, hex]) => [face, nameByHex[String(hex).toLowerCase()]]));
  if (Object.values(orientation).some(color => !color)) throw new Error('This position has no readable center colors.');
  const targets = TARGETS.map(target => {
    const row = rendered.corners.find(item => item.position === target.corner);
    if (!row) return null;
    const stickers = Object.fromEntries(target.faces.map(face => [face, nameByHex[String(rendered.cornerStickers[`${face}:${target.corner}`] || '').toLowerCase()]]));
    if (Object.values(stickers).some(color => !color)) return null;
    const colors = target.faces.map(face => stickers[face]);
    return { target, colors, stickers, family: familyId(colors), twist: 0 };
  }).filter(Boolean);
  const allowed = new Set(requestedCases.map(value => value.toLowerCase()));
  const selected = allowed.size ? targets.filter(item => allowed.has(item.target.id.toLowerCase()) || allowed.has(item.target.corner.toLowerCase()) || allowed.has(item.family.toLowerCase())) : targets;
  if (!selected.length) throw new Error('No corners in this position match the requested cases.');
  // copy-ok: setup-constraint guidance when a requested case filter omits corners
  if (multiCorner() && selected.length !== 3) throw new Error('This mode needs three visible corners. Choose another setup or switch to single-corner practice.');
  return {
    orientation,
    targets: multiCorner() ? selected : [selected[0]],
    cornerStickers: rendered.cornerStickers,
    edgeStickers: rendered.stickerColors,
    activeIndex: 0,
    viewPose: chooseCornerView(previousCornerView),
    pinned: true,
  };
}

function createCase(randomOnly = false) {
  if (multiCorner() && !randomOnly) {
    const cases = Array.from({ length: 24 }, () => createCase(true)).filter(current => !cornerCaseFilter?.requested || current.targets.every(item => cornerCaseFilter.values.some(value => value === item.target.corner || value === item.family)));
    if (!cases.length) throw new Error('This mode needs three matching corners. Choose another case filter or single-corner mode.');
    const candidates = cases.flatMap((current) => current.targets.map((item) => ({ current, learningKey: cornerLearningKey(item) })));
    return chooseDue(store.learning, candidates).current;
  }
  const orientation = ORIENTATIONS[Math.floor(Math.random() * ORIENTATIONS.length)];
  if (multiCorner()) {
    const pieces = shuffle(CORNER_PIECES);
    const twists = Array.from({ length: 7 }, () => Math.floor(Math.random() * 3));
    twists.push((3 - twists.reduce((sum, twist) => sum + twist, 0) % 3) % 3);
    const assignments = CORNER_SLOTS.map((slot, index) => makeTargetCase(slot, pieces[index], twists[index]));
    const targets = TARGETS.map((target) => {
      const assignment = assignments.find((item) => item.target.id === target.id);
      return { ...assignment, target };
    });
    const cornerStickers = {};
    assignments.forEach((assignment) => {
      assignment.target.faces.forEach((face) => {
        cornerStickers[`${face}:${assignment.target.corner}`] = COLORS[assignment.stickers[face]].hex;
      });
    });
    return { orientation, targets, cornerStickers, activeIndex: 0, cornerParity: permutationParity(pieces.map((piece) => CORNER_PIECES.indexOf(piece))) };
  }
  const candidates = TARGETS.flatMap((target) => CORNER_PIECES.flatMap((piece) => [0, 1, 2].map((twist) => {
    const item = makeTargetCase(target, piece, twist);
    return { item, learningKey: cornerLearningKey(item) };
  })));
  const filtered = cornerCaseFilter?.requested ? candidates.filter(({item}) => cornerCaseFilter.values.some(value => value === item.target.corner || value === item.family)) : candidates;
  if (!filtered.length) throw new Error('No corners match the requested cases. Choose another case filter.');
  const chosen = chooseDue(store.learning, filtered);
  return { orientation, targets: [chosen.item], activeIndex: 0 };
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function permutationParity(permutation) {
  let parity = 0;
  for (let i = 0; i < permutation.length; i++) for (let j = i + 1; j < permutation.length; j++) parity ^= Number(permutation[i] > permutation[j]);
  return parity;
}

function createScrambledEdges(orientation, cornerParity) {
  const indices = shuffle(EDGE_SLOTS.map((_, index) => index));
  if (cornerParity !== undefined && permutationParity(indices) !== cornerParity) [indices[0], indices[1]] = [indices[1], indices[0]];
  const pieces = indices.map((index) => EDGE_SLOTS[index].slice(0, 2).map((face) => orientation[face]));
  const stickerColors = {};
  let flipParity = 0;
  EDGE_SLOTS.forEach(([a, b, piece], index) => {
    const flip = index === EDGE_SLOTS.length - 1 ? flipParity : Math.random() < .5 ? 1 : 0;
    flipParity ^= flip;
    const colors = flip ? [...pieces[index]].reverse() : pieces[index];
    stickerColors[`${a}:${piece}`] = COLORS[colors[0]].hex;
    stickerColors[`${b}:${piece}`] = COLORS[colors[1]].hex;
  });
  return stickerColors;
}

function activeTarget() {
  return state.current.targets[state.current.activeIndex];
}

function cubeTargetData(item) {
  const displayMap = state.current?.displayColorMap || {};
  return {
    targetCorner: item.target.corner,
    knownFaces: item.target.visible,
    hiddenFace: item.target.hidden,
    knownStickers: Object.fromEntries(item.target.visible.map((face) => [face, colorHex(displayColorKey(item.stickers[face], displayMap))])),
  };
}

// Names the corner being asked about (the case shows all three); the Orbit alone shows progress.
const CORNER_POSITIONS = ['Left', 'Top right', 'Bottom right'];
function renderCurrentCase() {
  cornerSettings.sync();
  const current = state.current;
  const active = activeTarget();
  const caseColorSetting = readCaseColorSetting();
  if (current.displayColorSetting !== caseColorSetting) {
    current.displayColorSetting = caseColorSetting;
    current.displayColorMap = createCaseDisplayMap(current.orientation, caseColorSetting, current.caseSeed || `corner:${stats.attempts}:${current.family}`);
  }
  const palette = Object.fromEntries(['U', 'D', 'F', 'B', 'R', 'L'].map((face) => [face, colorHex(displayColorKey(current.orientation[face], current.displayColorMap))]));
  const cubeData = {
    mode: 'corner',
    targets: current.targets.map(cubeTargetData),
    activeTargetIndex: current.activeIndex,
    stickerColors: recolorStickers(current.edgeStickers, current.displayColorMap),
    cornerStickers: recolorStickers(current.cornerStickers, current.displayColorMap),
    showAllCorners: multiCorner(),
    colors: palette,
    feedback: current.feedback || null,
  };
  if (cube3D) {
    cube3D.caseColorSetting = caseColorSetting;
    cube3D.caseSeed = current.caseSeed || `corner:${stats.attempts}:${current.family}`;
    cube3D.setViewOffset(current.viewPose);
    cube3D.update(cubeData);
  }
  else {
    const fallback = renderCube(cubeTargetData(active), { title: 'Corner recognition cube' });
    document.querySelector('#cube').replaceChildren(fallback);
  }
  document.querySelector('#orientation-caption').textContent = `${COLORS[displayColorKey(current.orientation.U, current.displayColorMap)].label} top · ${COLORS[displayColorKey(current.orientation.F, current.displayColorMap)].label} front`;
  document.querySelector('#case-mode').textContent = multiCorner() ? `${state.mode === 'recall' ? 'one-glance recall' : 'three corners'} · ${current.activeIndex + 1}/3` : 'single corner';
  document.querySelector('#case-mode').dataset.targetCorner = active.target.corner;
  document.querySelector('#prompt-text').innerHTML = multiCorner()
    ? `${CORNER_POSITIONS[current.activeIndex]} corner. Which color <br>completes it?`
    : 'Which color completes <br>this corner?';
  const activeRoundIndex = legacyRounds.corner?.getViewModel?.().round?.answers?.length ?? 0;
  cornerTrainerOrbit?.update({ index: cornerGuessSegments() ? state.current.activeIndex : state.sprint ? session.attempts : activeRoundIndex, state: 'current', value: `${stats.streak} combo` });
}

function renderAnswers() {
  // The six buttons sit in one fixed order of DISPLAYED colours, so a colour (and its key) never moves between cases.
  // The cube may be recoloured per case; each press is resolved back to its logical colour through the case's map when it is scored.
  state.answerChoices = Object.keys(COLORS);
  document.querySelector('#answers').innerHTML = state.answerChoices.map((key) => {
    const color = COLORS[key];
    return `
      <button class="answer-button color-${key}" data-color="${key}" style="--swatch:${color.hex};--swatch-ink:${color.ink}">
      <i aria-hidden="true"></i><span>${color.label}</span><kbd>${color.label[0]}</kbd>
    </button>
  `}).join('');
}

// Transient result: the approved toast (W-16, bottom-right), never a box over the cube. It auto-dismisses at the dwell
// length, so even a wrong answer never persists (tone "error" would) in a speed drill.
const CORNER_DWELL_MS = 1100;
function showCornerResult(isCorrect, correctColor, skipped) {
  const shownColor = displayColorKey(correctColor, state.current?.displayColorMap);
  const name = COLORS[shownColor].label.toLowerCase();
  const toast = host.toast.show({
    text: isCorrect ? `Nice · ${name}` : skipped ? `Skipped, it was ${name}.` : `Not quite, it was ${name}.`,
    tone: isCorrect ? 'default' : 'warn',
    duration: CORNER_DWELL_MS,
  });
  toast.classList.add('corner-result', isCorrect ? 'is-correct' : 'is-wrong');
}

function syncExposureSelect() {
  const select = document.querySelector('#exposure-select');
  const value = String(state.exposureMs);
  let option = [...select.options].find((item) => item.value === value);
  if (!option) {
    option = document.createElement('option');
    option.value = value;
    option.textContent = `${state.exposureMs} ms`;
    select.append(option);
  }
  select.value = value;
  cornerSettings.sync();
  try { localStorage.setItem('cubesight-corner-exposure-ms', value); } catch { /* Keep the current pace for this page. */ }
}

function showCornerUnavailable(message) {
  state.current = null; state.locked = true;
  document.querySelector('#cube').hidden = true;
  document.querySelector('#feedback').textContent = message;
  document.querySelectorAll('.answer-button').forEach(button => { button.disabled = true; });
}

function startCase(successNotice = null) {
  cancelCornerTimers();
  if (host.activeTool !== 'corner' || host.paused || legacyRounds.corner?.complete) return;
  if (cornerStartPromise) {
    const pending = cornerStartPromise;
    cornerStartPromise = null;
    showCornerUnavailable('loading the saved position…');
    void pending.then(position => {
      if (host.activeTool !== 'corner' || cornerStartHash !== location.hash) return;
      if (position.error) { showCornerUnavailable(position.error); return; }
      cornerStartPosition = position;
      startCase();
    });
    return;
  }
  if (cornerCaseFilter && !cornerCaseFilter.valid) { showCornerUnavailable('No known corner cases match this link.'); return; }
  document.querySelector('#cube').hidden = false;
  const pinned = cornerStartPosition;
  cornerStartPosition = null;
  try { state.current = pinned ? createCornerCaseFromCubeState(pinned.state, pinned.cases) : createCase(); }
  catch (error) {
    showCornerUnavailable(error.message);
    return;
  }
  state.current.viewPose = chooseCornerView(previousCornerView);
  state.current.caseSeed = `corner:${state.sprint ? 'sprint' : 'practice'}:${stats.attempts}:${session.attempts}:${state.generation}`;
  previousCornerView = state.current.viewPose.id;
  state.current.exposureMs = state.exposureMs;
  state.current.recallAnswers = [];
  state.current.guesses = [];
  document.querySelector('[data-action="next-recall"]').hidden = true;
  document.querySelector('[data-action="skip"]').hidden = false;
  if (!state.current.edgeStickers) state.current.edgeStickers = createScrambledEdges(state.current.orientation, state.current.cornerParity);
  if (state.mode === 'recall') return presentRecall();
  presentCorner(null, successNotice);
}

function coverRecall() {
  const mount = document.querySelector('#cube');
  mount.classList.add('glance-mask');
  mount.dataset.learningState = 'covered';
  const overlay = document.querySelector('#glance-overlay');
  overlay.textContent = `From memory · corner ${state.current.activeIndex + 1} of 3`;
  overlay.hidden = false;
}

function presentRecall() {
  state.locked = true;
  const generation = state.generation;
  const mount = document.querySelector('#cube');
  mount.classList.add('glance-mask');
  mount.dataset.learningState = 'preparing';
  renderAnswers();
  renderCurrentCase();
  document.querySelector('#feedback').className = '';
  document.querySelector('#feedback').textContent = 'One look. Then answer left, top right, bottom right.';
  document.querySelector('#prompt-text').textContent = 'Remember all three missing colors.';
  document.querySelector('#exposure-note').textContent = `glance ${state.current.exposureMs} ms · ${glancePacing.progress}/10 answers toward adjustment`;
  document.querySelector('.timer-label').textContent = 'recog · from cube reveal';
  document.querySelectorAll('.answer-button').forEach((button) => { button.disabled = true; });
  state.onsetFrame = requestAnimationFrame(() => {
    if (generation !== state.generation || host.activeTool !== 'corner' || host.paused) return;
    mount.classList.remove('glance-mask');
    mount.dataset.learningState = 'visible';
    state.startedAt = performance.now();
    armTrialTimeout(state.startedAt);
    tickTimer(true);
    state.glanceTimer = setTimeout(() => {
      if (generation !== state.generation || host.activeTool !== 'corner' || host.paused) return;
      coverRecall();
      state.locked = false;
      document.querySelector('#prompt-text').textContent = 'Case 1 of 3. Which color was missing?';
      document.querySelectorAll('.answer-button').forEach((button) => { button.disabled = false; });
    }, state.current.exposureMs);
  });
}

function answerRecall(color, skipped, answeredAt) {
  const current = state.current;
  current.recallAnswers.push({ color, skipped, ms: Math.round(answeredAt - state.startedAt), at: Date.now() });
  if (current.activeIndex < 2) {
    current.activeIndex++;
    // No feedback, reveal, or input lock between answers; the clock carries on.
    state.startedAt = answeredAt;
    armTrialTimeout(answeredAt);
    renderCurrentCase();
    coverRecall();
    document.querySelector('#prompt-text').textContent = `Case ${current.activeIndex + 1} of 3. Which color was missing?`;
    document.querySelector('#feedback').textContent = `${current.activeIndex} answered · keep going from memory`;
    document.querySelector('.timer-label').textContent = 'recog · from your last answer';
    return;
  }
  state.locked = true;
  cancelCornerTimers();
  // An interrupted sequence is never partly scored. Commit only all three.
  const outcomes = current.recallAnswers.map((response, index) =>
    recordCornerAnswer(current.targets[index], response.color, response.skipped, response.ms, index + 1, response.at));
  if (legacyRounds.corner?.complete) return;
  const allCorrect = outcomes.every((outcome) => outcome.isCorrect);
  const pacingResult = glancePacing.record(allCorrect);
  state.exposureMs = glancePacing.exposureMs;
  if (pacingResult.changed) syncExposureSelect();
  current.feedback = {
    status: outcomes[2].isCorrect ? 'correct' : 'wrong',
    correctColor: COLORS[displayColorKey(outcomes[2].correctColor, current.displayColorMap)].hex,
    correctName: COLORS[displayColorKey(outcomes[2].correctColor, current.displayColorMap)].label,
  };
  renderCurrentCase();
  document.querySelector('#cube').dataset.learningState = 'feedback';
  const positions = ['Left', 'Top right', 'Bottom right'];
  document.querySelector('#feedback').className = allCorrect ? 'is-correct' : 'is-wrong';
  document.querySelector('#feedback').textContent = outcomes.map((outcome, index) =>
    `${positions[index]}: ${outcome.isCorrect ? '✓' : '✗'} ${COLORS[displayColorKey(outcome.correctColor, current.displayColorMap)].label}${outcome.isCorrect ? '' : ` (you: ${current.recallAnswers[index].color ? COLORS[displayColorKey(current.recallAnswers[index].color, current.displayColorMap)].label : 'skip'})`}`).join(' · ');
  document.querySelector('#prompt-text').textContent = `${outcomes.filter((outcome) => outcome.isCorrect).length} of 3 correct · inspect, then next`;
  document.querySelector('#timer').textContent = formatMs(current.recallAnswers.reduce((sum, response) => sum + response.ms, 0));
  document.querySelector('.timer-label').textContent = 'recog · full sequence';
  document.querySelectorAll('.answer-button').forEach((button) => { button.disabled = true; });
  document.querySelector('[data-action="skip"]').hidden = true;
  document.querySelector('[data-action="next-recall"]').hidden = false;
  updateStatsUI();
  updateSprintUI();
  if (state.sprint && session.attempts >= state.sprintLength) showSummary();
}

function presentCorner(previousInputAt = null, successNotice = null) {
  cancelCornerTimers();
  state.locked = true;
  const generation = state.generation;
  const mount = document.querySelector('#cube');
  mount.classList.add('glance-mask');
  mount.dataset.learningState = 'preparing';
  document.querySelector('#feedback').textContent = successNotice || 'Tap or press a color key.';
  document.querySelector('#feedback').className = successNotice ? 'is-correct' : '';
  document.querySelector('#timer').textContent = previousInputAt === null ? '0.00' : formatMs(performance.now() - previousInputAt);
  document.querySelector('.timer-label').textContent = previousInputAt === null
    ? 'recog · includes key' : 'recog · from your last answer';
  document.querySelector('#exposure-note').textContent = state.glance
    ? `${state.exposureMode === 'adaptive' ? `adaptive glance · ${state.exposureMs} ms · ${glancePacing.progress}/10 toward adjustment` : `glance ${state.exposureMs} ms · fixed`}${state.mode === 'triple' ? ' · first corner sets pace' : ''}`
    : `Accuracy before speed${state.mode === 'triple' ? ' · later corners have preview' : ''}`;
  renderAnswers();
  renderCurrentCase();
  state.onsetFrame = requestAnimationFrame(() => {
    if (generation !== state.generation || host.activeTool !== 'corner' || host.paused) return;
    mount.classList.remove('glance-mask');
    mount.dataset.learningState = 'visible';
    state.locked = false;
    state.startedAt = previousInputAt ?? performance.now();
    armTrialTimeout(state.startedAt);
    tickTimer();
    if (state.glance) state.glanceTimer = setTimeout(() => {
      if (generation !== state.generation || state.locked || host.paused) return;
      mount.classList.add('glance-mask');
      mount.dataset.learningState = 'covered';
      const overlay = document.querySelector('#glance-overlay');
      overlay.textContent = 'What did you see?';
      overlay.hidden = false;
    }, state.exposureMs);
  });
}

function tickTimer(includeFeedback = false) {
  if (state.locked && !includeFeedback) return;
  if (expireTrial(state.startedAt)) return;
  const elapsed = performance.now() - state.startedAt;
  document.querySelector('#timer').textContent = fmt.time(elapsed);
  state.timerFrame = requestAnimationFrame(() => tickTimer(includeFeedback));
}

function recordCornerAnswer(active, color, skipped, elapsed, position, at = Date.now()) {
  const correctColor = active.stickers[active.target.hidden];
  const isCorrect = !skipped && color === correctColor;
  const family = active.family;
  const trialExposureMs = usesGlance() ? (state.mode === 'recall' ? state.current.exposureMs : state.exposureMs) : null;
  const learningKey = cornerLearningKey(active);
  review(store.learning, learningKey, { correct: isCorrect, ms: elapsed });
  saveLearningState();
  if (state.glance && state.mode !== 'recall') {
    const pacingResult = glancePacing.record(isCorrect, state.mode !== 'triple' || state.current.activeIndex === 0);
    state.exposureMs = glancePacing.exposureMs;
    if (pacingResult.changed) syncExposureSelect();
  }

  if (state.current) state.current.guesses[position - 1] = isCorrect;
  stats.attempts++;
  session.attempts++;
  session.outcomes.push({ correct: isCorrect, ms: elapsed, caseId: family });
  stats.byCase[family] ??= { attempts: 0, correct: 0, totalMs: 0, bestMs: null };
  const familyStats = stats.byCase[family];
  familyStats.attempts++;

  if (isCorrect) {
    stats.correct++;
    session.correct++;
    stats.streak++;
    session.streak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    stats.totalMs += elapsed;
    stats.bestMs = stats.bestMs === null ? elapsed : Math.min(stats.bestMs, elapsed);
    familyStats.correct++;
    familyStats.totalMs += elapsed;
    familyStats.bestMs = familyStats.bestMs === null ? elapsed : Math.min(familyStats.bestMs, elapsed);
    session.times.push(elapsed);
  } else {
    stats.streak = 0;
    session.streak = 0;
  }
  stats.history.push({
    ms: elapsed, correct: isCorrect, family, at,
    target: active.target.corner,
    visible: active.target.visible.map((face) => active.stickers[face]),
    missing: correctColor, selected: color, skipped,
    mode: state.mode, position,
    glance: usesGlance(), exposureMs: trialExposureMs,
    viewPose: state.current.viewPose?.id || 'center',
    viewYaw: state.current.viewPose?.yaw || 0,
    viewPitch: state.current.viewPose?.pitch || 0,
  });
  stats.history = stats.history.slice(-1000);
  saveStats();
  legacyRounds.corner?.record({correct:isCorrect,ms:elapsed,caseId:family,at});
  const activeRoundAnswers = legacyRounds.corner?.getViewModel?.().round?.answers?.length ?? session.attempts;
  cornerTrainerOrbit?.update({ index: cornerGuessSegments() ? position - 1 : Math.max(0, activeRoundAnswers - 1), state: isCorrect ? 'good' : 'bad', value: fmt.time(elapsed), text: isCorrect ? 'Color recognized.' : `This corner needs ${COLORS[displayColorKey(correctColor, state.current.displayColorMap)].label.toLowerCase()}.` });
  return { isCorrect, correctColor };
}

function answer(color, skipped = false) {
  if (state.locked && state.holdSkip && host.activeTool === 'corner' && !host.paused) return state.holdSkip();
  if (state.locked || host.activeTool !== 'corner' || host.paused) return;
  const answeredAt = performance.now();
  if (expireTrial(state.startedAt)) return;
  color = logicalColorKey(color, state.current.displayColorMap);
  if (state.mode === 'recall') return answerRecall(color, skipped, answeredAt);
  state.locked = true;
  cancelCornerTimers();
  const elapsed = Math.round(answeredAt - state.startedAt);
  const { isCorrect, correctColor } = recordCornerAnswer(activeTarget(), color, skipped, elapsed, state.current.activeIndex + 1);
  if (legacyRounds.corner?.complete) return;
  showCornerResult(isCorrect, correctColor, skipped);
  const feedback = document.querySelector('#feedback');
  if (!isCorrect) {
    document.querySelectorAll('.answer-button').forEach((button) => {
      const buttonColor = button.dataset.color;
      if (logicalColorKey(buttonColor, state.current.displayColorMap) === correctColor) button.classList.add('correct');
      else if (!skipped && logicalColorKey(buttonColor, state.current.displayColorMap) === color) button.classList.add('wrong');
      else button.classList.add('muted');
    });
    feedback.className = 'is-wrong';
    const shownColor = displayColorKey(correctColor, state.current.displayColorMap);
    feedback.textContent = skipped ? `Skipped, it was ${COLORS[shownColor].label.toLowerCase()}.` : `Not quite, it was ${COLORS[shownColor].label.toLowerCase()}.`;
    state.current.feedback = {
      status: 'wrong',
      correctColor: COLORS[shownColor].hex,
      correctName: COLORS[shownColor].label,
    };
    renderCurrentCase();
    document.querySelector('#cube').dataset.learningState = 'feedback';
  }

  updateStatsUI();
  updateSprintUI();
  const sprintDone = state.sprint && session.attempts >= state.sprintLength;
  const moreCorners = state.mode === 'triple' && state.current.activeIndex < state.current.targets.length - 1;
  if (isCorrect) {
    if (sprintDone) return showSummary();
    if (moreCorners) {
      state.current.activeIndex++;
      state.current.feedback = null;
      return presentCorner(answeredAt, `Nice · ${fmt.time(elapsed, { unit: true })}`);
    }
    if (!cornerGuessSegments()) return startCase(`Nice · ${fmt.time(elapsed, { unit: true })}`);
    // Three right in a row: hold the completed Orbit so the reward registers, then move on (any key or skip moves on sooner).
    renderCurrentCase();
    return holdCornerResult(() => startCase(`Nice · ${fmt.time(elapsed, { unit: true })}`));
  }
  if (moreCorners && !sprintDone) {
    // Later corners remain visible during feedback: that inspection time is
    // part of the NEXT answer, not a free preview or a fresh timer at reveal.
    state.startedAt = answeredAt;
    document.querySelector('.timer-label').textContent = 'Next corner · clock already running';
    armTrialTimeout(answeredAt);
    tickTimer(true);
  }
  const generation = state.generation;
  const advance = () => {
    if (generation !== state.generation || host.activeTool !== 'corner' || host.paused) return;
    if (sprintDone) return showSummary();
    if (!moreCorners) return startCase();
    state.current.activeIndex++;
    state.current.feedback = null;
    presentCorner(answeredAt);
  };
  if (moreCorners) state.transitionTimer = setTimeout(advance, CORNER_DWELL_MS);
  else holdCornerResult(advance);
}

// The end of a case lingers CORNER_DWELL_MS, right or wrong; an answer key or skip ends it early so speed practice is never blocked.
function holdCornerResult(next) {
  const generation = state.generation;
  const go = () => {
    clearTimeout(state.transitionTimer);
    state.holdSkip = null;
    if (generation === state.generation) next();
  };
  state.holdSkip = go;
  state.transitionTimer = setTimeout(go, CORNER_DWELL_MS);
}
function updateStatsUI() {
  recognitionProfile.update(stats);
  const avg = stats.correct ? stats.totalMs / stats.correct : null;
  document.querySelector('#avg-stat').textContent = avg ? formatMs(avg) : '—';
  document.querySelector('#avg-note').textContent = stats.bestMs ? `PB ${fmt.time(stats.bestMs, { unit: true })}` : 'No cases yet';
  const accuracy = stats.attempts ? Math.round(stats.correct / stats.attempts * 100) : null;
  document.querySelector('#accuracy-stat').textContent = accuracy === null ? '—' : `${accuracy}%`;
  document.querySelector('#accuracy-note').textContent = stats.attempts ? `${stats.correct} of ${stats.attempts} correct` : 'Start a round';
  document.querySelector('#streak-stat').textContent = stats.streak;
  document.querySelector('#streak-note').textContent = `best combo: ${stats.bestStreak}`;

  const recent = stats.history.filter((item) => item.correct).slice(-12);
  document.querySelector('#trend-value').textContent = recent.length ? formatMs(recent.reduce((sum, item) => sum + item.ms, 0) / recent.length) : '—';
  const max = Math.max(...recent.map((item) => item.ms), 1);
  document.querySelector('#trend-chart').innerHTML = recent.length
    ? recent.map((item, i) => `<i style="height:${Math.max(12, item.ms / max * 100)}%" title="${formatMs(item.ms)}"><span>${i + 1}</span></i>`).join('')
    : '<p>Your timing trend will appear here.</p>';

  const entries = Object.entries(stats.byCase).sort(([, a], [, b]) => caseScore(b) - caseScore(a)).slice(0, 4);
  document.querySelector('#case-list').innerHTML = entries.length ? entries.map(([id, item]) => {
    const acc = Math.round(item.correct / item.attempts * 100);
    const caseAvg = item.correct ? item.totalMs / item.correct : null;
    return `<div class="case-row"><div class="family-swatches">${id.split('-').map((c) => `<i style="--case-color:${COLORS[c].hex}"></i>`).join('')}</div><strong>${familyLabel(id)}</strong><span>${acc}%</span><span>${caseAvg ? formatMs(caseAvg) : '—'}</span><div class="mini-track"><i style="width:${acc}%"></i></div></div>`;
  }).join('') : '<div class="empty-cases"><span>Eight corner families will be tracked here.</span><small>Complete your first case to begin.</small></div>';
}
function caseScore(item) {
  if (!item.attempts) return 10;
  return (1 - item.correct / item.attempts) * 10 + (item.correct ? item.totalMs / item.correct / 1000 : 5);
}

function updateSprintUI() {
  cornerTrainerOrbit?.update();
}

function resetSession() {
  session = { attempts: 0, correct: 0, times: [], streak: 0, outcomes: [] };
  updateSprintUI();
}

function setMode(mode) {
  if (!['single', 'triple', 'recall'].includes(mode)) return;
  state.mode = mode;
  try { localStorage.setItem('cubesight-corner-mode', mode); } catch { /* Keep the current mode for this page. */ }
  const glanceToggle = document.querySelector('#glance-toggle');
  document.querySelector('#exposure-mode').value = state.exposureMode;
  syncExposureSelect();
  glanceToggle.checked = usesGlance();
  glanceToggle.disabled = mode === 'recall';
  const sprintLength = mode === 'recall' ? 12 : 10;
  if (sprintLength !== state.sprintLength) { state.sprintLength = sprintLength; resetSession(); }
  document.querySelector('[data-session="sprint"]').textContent = `${sprintLength}-case round`;
  glancePacing.reset();
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.add('chip');
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  startCase();
}

function setSession(type) {
  state.sprint = type === 'sprint';
  resetSession();
  document.querySelectorAll('[data-session]').forEach((button) => {
    const selected = button.dataset.session === type;
    button.classList.add('chip');
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  startCase();
}

function showSummary() {
  const avg = session.times.length ? session.times.reduce((a, b) => a + b, 0) / session.times.length : 0;
  const best = session.times.length ? Math.min(...session.times) : null;
  document.querySelector('#summary-metrics').innerHTML = `
    <div><span>Accuracy</span><strong>${Math.round(session.correct / session.attempts * 100)}%</strong></div>
    <div><span>Average</span><strong>${avg ? formatMs(avg) : '—'}</strong></div>
    <div><span>best of round</span><strong>${best ? fmt.time(best, { unit: true }) : '—'}</strong></div>`;
  document.querySelector('#summary-dialog').showModal();
}

document.querySelector('#summary-dialog').addEventListener('cancel', (event) => {
  event.preventDefault();
  document.querySelector('#summary-dialog').close();
  setSession('practice');
});

document.addEventListener('click', (event) => {
  const answerButton = event.target.closest('[data-color]');
  if (answerButton && host.activeTool === 'corner') return answer(answerButton.dataset.color);
  const modeButton = event.target.closest('[data-mode]');
  if (modeButton) return setMode(modeButton.dataset.mode);
  const sessionButton = event.target.closest('[data-session]');
  if (sessionButton) return setSession(sessionButton.dataset.session);
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'next-recall' && host.activeTool === 'corner' && state.mode === 'recall') return startCase();
  if (action === 'skip' && host.activeTool === 'corner') answer(null, true);
  if (action === 'reset-view') cube3D?.resetView();
  if (action === 'clear' && confirm('Clear all drill history?')) {
    stats = initialStats(); store.learning = loadLearning(null); saveLearningState(); saveStats(); updateStatsUI(); startCase();
  }
  if (action === 'close-summary') { document.querySelector('#summary-dialog').close(); setSession('practice'); }
  if (action === 'restart-sprint') { document.querySelector('#summary-dialog').close(); resetSession(); startCase(); }
  if (action === 'practice-mode') { document.querySelector('#summary-dialog').close(); setSession('practice'); }
});

document.querySelector('#glance-toggle').addEventListener('change', (event) => {
  state.glance = event.target.checked;
  try { localStorage.setItem('cubesight-corner-glance', String(state.glance)); } catch { /* Keep the current setting for this page. */ }
  glancePacing.reset();
  startCase();
});
document.querySelector('#exposure-mode').addEventListener('change', (event) => {
  state.exposureMode = event.target.value === 'fixed' ? 'fixed' : 'adaptive';
  glancePacing.setMode(state.exposureMode);
  state.exposureMs = glancePacing.exposureMs;
  try { localStorage.setItem('cubesight-corner-exposure-mode', state.exposureMode); } catch { /* Keep the current pace for this page. */ }
  startCase();
});
document.querySelector('#exposure-select').addEventListener('change', (event) => {
  state.exposureMs = Number(event.target.value) || 600;
  glancePacing.setExposure(state.exposureMs);
  try { localStorage.setItem('cubesight-corner-exposure-ms', String(state.exposureMs)); } catch { /* Keep the current pace for this page. */ }
  if (usesGlance()) startCase();
});

let legacyCubeLoad = null;
function syncLegacyCubes(tool) {
  if (tool !== 'corner' && cube3D) { cube3D.destroy(); cube3D = null; }
  if (legacyCubeLoad?.tool === tool) return;
  legacyCubeLoad?.controller.abort();
  legacyCubeLoad = null;
  if (tool !== 'corner' || cube3D) return;
  const controller = new AbortController();
  legacyCubeLoad = { tool, controller };
  const host_ = document.querySelector('#cube');
  void Promise.resolve().then(async () => {
    // copy-ok: internal cancellation reason used only to stop stale cube mounts
    if (controller.signal.aborted) throw new DOMException('Trainer cube mount was cancelled.', 'AbortError');
    const { Cube } = await loadSharedCube();
    // copy-ok: internal cancellation reason used only to stop stale cube mounts
    if (controller.signal.aborted) throw new DOMException('Trainer cube mount was cancelled.', 'AbortError');
    // The legacy renderer may have installed its accessible SVG fallback before
    // this shared WebGL cube was ready. Keep one visible Cube in the stage.
    host_.replaceChildren();
    const view = new Cube(host_, { mode: 'case', size: 'L', caseColorSetting: readCaseColorSetting(), caseSeed: `${tool}:initial`, label: 'corner recognition case' });
    view.setViewOffset = (...args) => view.cube.setViewOffset?.(...args);
    view.recenterGyro = (...args) => view.cube.recenterGyro?.(...args);
    return view;
  }).then(view => {
    if (controller.signal.aborted || host.activeTool !== tool) { view.destroy(); return; }
    cube3D = view; if (state.current) renderCurrentCase();
  }).catch(error => {
    if (error.name === 'AbortError') return;
    console.warn('WebGL cube unavailable; using accessible SVG fallback.', error);
  }).finally(() => { if (legacyCubeLoad?.controller === controller) legacyCubeLoad = null; });
}
updateStatsUI();
updateSprintUI();
updateLearningUI();
// The Rust core runs alongside the visual trainer; the badge says whether it is up.
ensureWasm().then(() => {
  document.querySelector('#engine-badge').textContent = 'RUST · WASM';
}).catch(() => {});

// What main.js calls. Everything else in this file is private to the drill.
export const corner = {
  /** Open the drill: parse the start position from the hash, show the cube, deal the first case. */
  enter(hash) {
    syncLegacyCubes('corner');
    prepareCornerStart(hash);
    setMode(state.mode);
    legacyRounds.corner ??= createRoundPanel(document.querySelector('#corner-view'), {
      orbitHost: document.querySelector('#corner-view .cube-stage'),
      drill: 'corners',
      getSettings: () => ({mode:state.mode,glance:state.glance,exposureMs:state.exposureMs}),
      onComplete: () => { state.locked=true;cancelCornerTimers();document.querySelectorAll('.answer-button').forEach(button=>button.disabled=true); },
      onRestart: () => { host.paused=false;startCase(); },
    });
    cornerTrainerOrbit.connect(legacyRounds.corner.orbit, () => cornerViewModel());
    legacyRounds.corner.setActive(true);
    updateLearningUI();
  },
  syncCube: syncLegacyCubes,
  cancelTimers: cancelCornerTimers,
  lock() { state.locked = true; },
  pause() { cancelCornerTimers(); state.locked = true; },
  resume: () => startCase(),
  handleKey(event) {
    if (state.mode === 'recall' && state.locked && !document.querySelector('[data-action="next-recall"]').hidden && [KEYS.global.space, 'enter'].includes(event.key === ' ' ? KEYS.global.space : event.key.toLowerCase())) return startCase();
    const displayChoices = state.answerChoices;
    const colorKey = displayChoices.find(color => color[0] === event.key.toLowerCase());
    if (colorKey) return answer(colorKey);
    if (/^[1-6]$/.test(event.key)) answer(displayChoices[Number(event.key) - 1]);
    if (KEYS.case[event.key.toLowerCase()] === 'skip') answer(null, true);
  },
  getViewModel: cornerViewModel,
};
