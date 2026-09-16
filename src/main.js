import '@fontsource-variable/manrope';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import './styles.css';
import { setupTheme } from './theme.js';
import { renderCube } from './cube-renderer.js';
import { createCube3D } from './cube-3d.js';
import initWasm, { f2l_case as wasmF2LCase } from './wasm/cubesight_core.js';
import { createF2LCase, createF2LCaseFromWasm } from './f2l-logic.js';
import { loadLearning, saveLearning, review, itemKey, f2lKey, sessionSummary, chooseDue } from './learning.js';
import { createGlancePacing } from './glance-pacing.js';
import { createRecognitionProfile } from './recognition-profile.js';
import { chooseCornerView } from './corner-view.js';
import './recognition-profile.css';

const COLORS = {
  white: { label: 'White', hex: '#ffffff', ink: '#171815' },
  yellow: { label: 'Yellow', hex: '#ffd500', ink: '#171815' },
  green: { label: 'Green', hex: '#009b48', ink: '#ffffff' },
  blue: { label: 'Blue', hex: '#0051ba', ink: '#ffffff' },
  red: { label: 'Red', hex: '#e7332a', ink: '#ffffff' },
  orange: { label: 'Orange', hex: '#ff6b00', ink: '#17120c' },
};

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
const FACE_COLOR = { U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' };
const COLOR_FACE = Object.fromEntries(Object.entries(FACE_COLOR).map(([face, color]) => [color, face]));
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
const TRIAL_TIMEOUT_MS = 10_000;
let trialTimeout = null;
let previousCornerView = '';

const initialStats = () => ({ attempts: 0, correct: 0, totalMs: 0, bestMs: null, streak: 0, bestStreak: 0, byCase: {}, history: [] });
let stats = loadStats();
let learning = loadLearning(localStorage);
let session = { attempts: 0, correct: 0, times: [], streak: 0 };
let state = {
  mode: 'single',
  sprint: false,
  sprintLength: 10,
  current: null,
  startedAt: 0,
  locked: false,
  timerFrame: null,
  answerChoices: [],
  glance: false,
  exposureMs: 600,
  exposureMode: 'adaptive',
  glanceTimer: null,
  transitionTimer: null,
  onsetFrame: null,
  generation: 0,
};
const glancePacing = createGlancePacing();
let cube3D = null;
let wasmReady = false;
let activeTool = 'corner';
const TOOL_ROUTES = { corner: '/corners', f2l: '/f2l', pll: '/pll-recognition', scout: '/cross-scout' };
const TOOL_TITLES = { corner: 'Corner recognition', f2l: 'F2L deduction', pll: 'PLL recognition', scout: 'Cross Scout' };
let scout = null;
let scoutLoad = null;
let pll = null;
let pllLoad = null;
let f2lCube3D = null;
let f2lPreference = localStorage.getItem('cubesight-f2l-bottom') || 'neutral';
if (!['neutral', ...Object.keys(COLORS)].includes(f2lPreference)) f2lPreference = 'neutral';
let paused = false;
let f2lState = {
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
};

document.querySelector('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="#/corners" aria-label="Cubesight home">
      <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>Cubesight<span class="brand-caption">Recognition training</span></span>
    </a>
    <nav class="main-nav" aria-label="Trainers">
      <a class="nav-link active" href="#/corners" data-tool="corner">Corner recognition</a>
      <a class="nav-link" href="#/f2l" data-tool="f2l">F2L deduction</a>
      <a class="nav-link" href="#/pll-recognition" data-tool="pll">PLL recognition</a>
      <a class="nav-link" href="#/cross-scout" data-tool="scout">Cross Scout</a>
    </nav>
    <div class="header-actions">
      <button id="theme-toggle" class="icon-button" aria-label="Switch to dark mode">
        <svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg>
        <svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
      </button>
      <button class="icon-button" data-action="open-help" aria-label="How to play">?</button>
    </div>
  </header>

  <main>
    <div id="corner-view">
    <section class="intro-row">
      <div>
        <p class="eyebrow">Practice / Corners</p>
        <h1>Corner recognition</h1>
      </div>
      <p class="intro-copy">See the pattern.<br>Build the instinct.</p>
    </section>

    <details class="training-settings" open>
    <summary><span>Training settings</span><small>Drill, session & viewing time</small><i aria-hidden="true"></i></summary>
    <section class="mode-bar" aria-label="Training settings">
      <div class="mode-group">
        <span class="control-label">Drill</span>
        <div class="segmented" role="group" aria-label="Corner drill">
          <button class="segment active" data-mode="single">Single corner</button>
          <button class="segment" data-mode="triple">Three corners</button>
          <button class="segment" data-mode="recall">One-glance recall</button>
        </div>
      </div>
      <div class="mode-group">
        <span class="control-label">Session</span>
        <div class="segmented" role="group" aria-label="Session type">
          <button class="segment active" data-session="practice">Open practice</button>
          <button class="segment" data-session="sprint">10-answer sprint</button>
        </div>
      </div>
      <div class="sprint-progress" aria-label="Sprint progress" hidden>
        <span id="sprint-count">0 / 10</span>
        <div class="progress-track"><i id="progress-fill"></i></div>
      </div>
      <div class="learning-controls" aria-label="Recognition pacing">
        <label class="learning-toggle"><input id="glance-toggle" type="checkbox"><span>Glance mode</span></label>
        <label class="exposure-picker" for="exposure-mode">Pace <select id="exposure-mode" aria-label="Glance pacing" title="Adaptive: every 10 eligible outcomes, 90%+ accuracy shortens the glance, down to 25 ms; 70% or lower adds 100 ms. Recall counts a complete three-answer sequence as one outcome."><option value="adaptive" selected>Adaptive</option><option value="fixed">Fixed</option></select></label>
        <label class="exposure-picker" for="exposure-select">View <select id="exposure-select" aria-label="Glance exposure"><option value="25">25 ms</option><option value="50">50 ms</option><option value="75">75 ms</option><option value="100">100 ms</option><option value="150">150 ms</option><option value="200">200 ms</option><option value="300">300 ms</option><option value="450">450 ms</option><option value="600" selected>600 ms</option><option value="800">800 ms</option><option value="1000">1 s</option><option value="1500">1.5 s</option></select></label>
      </div>
    </section>
    </details>

    <section class="trainer-shell">
      <div class="cube-stage">
        <div class="stage-topline">
          <span class="status-dot"><i></i> Find the hidden color</span>
          <span class="view-lock">Locked · varied angle</span>
        </div>
        <div id="cube" class="cube-mount"></div>
        <div id="glance-overlay" class="glance-overlay" hidden aria-live="polite">Look</div>
        <div id="corner-sequence" class="corner-sequence" hidden></div>
        <div class="cube-caption">
          <span id="orientation-caption">White top · Green front</span>
          <span>Nearby solve angles · hidden stickers stay masked</span>
        </div>
      </div>

      <div class="answer-stage">
        <div class="case-meta">
          <span id="case-number">CASE 001</span>
          <span id="case-mode">SINGLE CORNER</span>
        </div>
        <div class="timer-wrap">
          <span class="timer-label">Response time · includes key / click</span>
          <div id="timer" class="timer" aria-live="off">0.00<span>s</span></div>
          <small id="exposure-note" class="timing-note">Adaptive practice · accuracy before speed</small>
        </div>
        <div class="prompt-block">
          <p id="prompt-text">Which color completes <br>this corner?</p>
          <div id="known-colors" class="known-colors" hidden></div>
        </div>
        <div id="answers" class="answer-grid" role="group" aria-label="Choose the hidden color"></div>
        <div class="feedback-line">
          <p id="feedback" role="status" aria-live="polite">Click a color or type its first letter</p>
          <button class="skip-button" data-action="skip">Skip <kbd>S</kbd></button>
          <button class="skip-button" data-action="next-recall" hidden>Next cube →</button>
        </div>
      </div>
    </section>

    <section class="stats-section">
      <div class="section-heading">
        <div><p class="eyebrow">Progress</p><h2>Your recognition profile</h2></div>
        <button class="text-button danger" data-action="clear">Clear history</button>
      </div>
      <div class="stats-grid">
        <article class="metric-card"><span>Average</span><strong id="avg-stat">—</strong><small id="avg-note">No cases yet</small></article>
        <article class="metric-card"><span>Accuracy</span><strong id="accuracy-stat">—</strong><small id="accuracy-note">Start training</small></article>
        <article class="metric-card"><span>Current streak</span><strong id="streak-stat">0</strong><small id="streak-note">Best: 0</small></article>
        <article class="trend-card">
          <div class="trend-head"><div><span>Recent pace</span><small>Last 12 correct answers</small></div><strong id="trend-value">—</strong></div>
          <div id="trend-chart" class="trend-chart" aria-label="Recent recognition times"></div>
        </article>
      </div>
      <div class="case-table-card">
        <div class="case-table-head"><div><span>Corner families</span><small>Needs attention first</small></div><span class="engine-badge" id="engine-badge">JS ENGINE</span></div>
        <div id="case-list" class="case-list"></div>
      </div>
      <div id="recognition-profile"></div>
    </section>
    </div>

    <div id="f2l-view" hidden>
      <section class="intro-row f2l-intro">
        <div><p class="eyebrow">Practice / F2L</p><h1>F2L deduction</h1></div>
        <p class="intro-copy">Find your next pair.<br>Before your next turn.</p>
      </section>
      <details class="training-settings" open>
      <summary><span>Training settings</span><small>Bottom color & new case</small><i aria-hidden="true"></i></summary>
      <section class="mode-bar f2l-controls" aria-label="F2L settings">
        <div class="mode-group cross-picker"><span class="control-label">Bottom face</span><div id="cross-options" class="cross-options"></div></div>
        <button class="new-case-button" data-action="new-f2l">New cube <span>↗</span></button>
      </section>
      </details>
      <section class="trainer-shell f2l-shell">
        <div class="cube-stage">
          <div class="stage-topline"><span class="status-dot"><i></i> Find a matching pair</span><span>Drag left or right</span></div>
          <div id="f2l-cube" class="cube-mount"></div>
          <div class="cube-caption"><span id="f2l-orientation">White bottom · Green front</span><span>Drag left / right · click pieces to pair</span></div>
        </div>
        <div class="answer-stage f2l-answer-stage">
          <div class="case-meta"><span id="f2l-case-number">CASE 001</span><span id="f2l-cross-label">WHITE BOTTOM</span></div>
          <div class="f2l-score"><span>Deducible pairs</span><strong><b id="f2l-found">0</b><i>/</i><b id="f2l-total">0</b></strong></div>
          <div class="f2l-instructions">
            <p id="f2l-status" role="status" aria-live="polite">Select a corner or edge to begin.</p>
            <small>Then select its matching piece. Selecting the same piece again clears it.</small>
          </div>
          <div class="selected-piece-card" id="f2l-selection"><span>First selection</span><strong>None</strong><small>Click a visible F2L corner or edge</small></div>
          <div class="f2l-timings" id="f2l-timings">Find a pair to see search and matching times.</div>
          <div class="f2l-progress" id="f2l-progress"></div>
          <div class="f2l-footer-actions"><span>Back and bottom faces are locked</span><button id="f2l-continue" class="skip-button" data-action="new-f2l">Skip case <kbd>N</kbd></button></div>
        </div>
      </section>
      <section class="f2l-info-grid">
        <article><p class="eyebrow">01 / inspect</p><h3>Use the H</h3><p>Scan the top, front, left, and right faces. The camera stops before the back becomes visible.</p></article>
        <article><p class="eyebrow">02 / deduce</p><h3>Count what remains</h3><p>One-sticker pieces can still be located by eliminating identities already visible elsewhere.</p></article>
        <article><p class="eyebrow">03 / match</p><h3>Learn the difference</h3><p>After a mistake, inspect the correct pieces outlined in green. Continue when you are ready.</p></article>
      </section>
    </div>
    <div id="pll-view" hidden></div>
    <div id="scout-view" hidden></div>
    <section class="retention-panel" aria-label="Adaptive practice progress"><div><span>Ready to review</span><strong id="review-due">0 cases</strong></div><p id="review-summary">Complete cases to build your review queue</p><small>Ready means its spacing interval has elapsed. Missed and slow patterns return sooner; fluent patterns return later.<br>Practice accuracy is separate from delayed retention.</small></section>
  </main>

  <footer><span>Cubesight <span class="footer-dot">·</span> A little practice. A quicker instinct.</span><span>Your progress stays on this device.</span></footer>

  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <div id="pause-overlay" class="pause-overlay" hidden role="region" aria-label="Training paused" aria-live="polite"><div><p class="eyebrow">Take your time</p><h2>Practice paused</h2><p>Your interrupted trial will not be scored.</p><button class="primary-button" data-action="resume">Resume with a fresh case</button></div></div>
  <dialog id="summary-dialog" class="summary-dialog">
    <button class="dialog-close" data-action="close-summary" aria-label="Close">×</button>
    <p class="eyebrow">Sprint complete</p>
    <h2>That was sharp.</h2>
    <div class="summary-metrics" id="summary-metrics"></div>
    <button class="primary-button" data-action="restart-sprint">Run it again</button>
    <button class="text-button" data-action="practice-mode">Return to open practice</button>
  </dialog>
  <dialog id="help-dialog" class="help-dialog">
    <button class="dialog-close" data-action="close-help" aria-label="Close">×</button>
    <p class="eyebrow">How it works</p>
    <h2 id="help-title">Recognize, don’t calculate.</h2>
    <p id="help-copy">Two stickers of each target corner remain visible. Identify its hidden third color across nearby real-world viewing angles.</p>
    <ol id="help-steps"><li>The cube stays locked during each case, but new cases vary slightly left, right, up, and down.</li><li>Use the centers and edges to ground the cube orientation, then click a color or type its first letter.</li><li>In Three corners, answer the highlighted targets from left to right.</li></ol>
    <button class="primary-button" data-action="close-help">Start training</button>
  </dialog>
`;

// Keep the training surface within reach on a phone. Settings remain one tap away.
setupTheme();
const recognitionProfile = createRecognitionProfile(document.querySelector('#recognition-profile'));

if (window.matchMedia('(max-width: 700px)').matches) {
  document.querySelectorAll('.training-settings').forEach((settings) => { settings.open = false; });
}

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

function saveLearningState() {
  saveLearning(localStorage, learning);
  updateLearningUI();
}

function cancelCornerTimers() {
  clearTimeout(trialTimeout);
  state.generation++;
  cancelAnimationFrame(state.onsetFrame);
  cancelAnimationFrame(state.timerFrame);
  clearTimeout(state.glanceTimer);
  clearTimeout(state.transitionTimer);
  state.timerFrame = null;
  state.glanceTimer = null;
  state.transitionTimer = null;
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

function createCase(randomOnly = false) {
  if (multiCorner() && !randomOnly) {
    const cases = Array.from({ length: 24 }, () => createCase(true));
    const candidates = cases.flatMap((current) => current.targets.map((item) => ({ current, learningKey: cornerLearningKey(item) })));
    return chooseDue(learning, candidates).current;
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
  const chosen = chooseDue(learning, candidates);
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
  return {
    targetCorner: item.target.corner,
    knownFaces: item.target.visible,
    hiddenFace: item.target.hidden,
    knownStickers: Object.fromEntries(item.target.visible.map((face) => [face, COLORS[item.stickers[face]].hex])),
  };
}

function renderCurrentCase() {
  const current = state.current;
  const active = activeTarget();
  const palette = Object.fromEntries(['U', 'D', 'F', 'B', 'R', 'L'].map((face) => [face, COLORS[current.orientation[face]].hex]));
  const cubeData = {
    targets: current.targets.map(cubeTargetData),
    activeTargetIndex: current.activeIndex,
    stickerColors: current.edgeStickers,
    cornerStickers: current.cornerStickers,
    showAllCorners: multiCorner(),
    colors: palette,
    feedback: current.feedback || null,
  };
  if (cube3D) {
    cube3D.setViewOffset(current.viewPose);
    cube3D.update(cubeData);
  }
  else {
    const fallback = renderCube(cubeTargetData(active), { title: 'Corner recognition cube' });
    document.querySelector('#cube').replaceChildren(fallback);
  }
  document.querySelector('#orientation-caption').textContent = `${COLORS[current.orientation.U].label} top · ${COLORS[current.orientation.F].label} front`;
  document.querySelector('#case-number').textContent = `CASE ${String(stats.attempts + 1).padStart(3, '0')}`;
  document.querySelector('#case-mode').textContent = multiCorner() ? `${state.mode === 'recall' ? 'ONE GLANCE' : 'THREE CORNERS'} · ${current.activeIndex + 1}/3` : 'SINGLE CORNER';
  document.querySelector('#case-mode').dataset.targetCorner = active.target.corner;
  document.querySelector('#prompt-text').innerHTML = multiCorner()
    ? `Corner ${current.activeIndex + 1} of 3 — which color <br>completes it?`
    : 'Which color completes <br>this corner?';
  renderSequence();
}

function renderAnswers() {
  state.answerChoices = Object.keys(COLORS);
  document.querySelector('#answers').innerHTML = state.answerChoices.map((key, index) => {
    const color = COLORS[key];
    return `
    <button class="answer-button color-${key}" data-color="${key}" style="--swatch:${color.hex};--swatch-ink:${color.ink}">
      <i aria-hidden="true"></i><span>${color.label}</span><kbd>${color.label[0]}</kbd>
    </button>
  `}).join('');
}

function renderSequence() {
  const sequence = document.querySelector('#corner-sequence');
  sequence.hidden = !multiCorner();
  if (!multiCorner()) return;
  const positions = ['Left', 'Top right', 'Bottom right'];
  sequence.innerHTML = state.current.targets.map((_, index) => `<span class="${index === state.current.activeIndex ? 'active' : index < state.current.activeIndex ? 'done' : ''}"><i>${String(index + 1).padStart(2, '0')}</i>${positions[index]}</span>`).join('');
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
}

function startCase() {
  cancelCornerTimers();
  if (activeTool !== 'corner' || paused) return;
  state.current = createCase();
  state.current.viewPose = chooseCornerView(previousCornerView);
  previousCornerView = state.current.viewPose.id;
  state.current.exposureMs = state.exposureMs;
  state.current.recallAnswers = [];
  document.querySelector('[data-action="next-recall"]').hidden = true;
  document.querySelector('[data-action="skip"]').hidden = false;
  state.current.edgeStickers = createScrambledEdges(state.current.orientation, state.current.cornerParity);
  if (state.mode === 'recall') return presentRecall();
  presentCorner();
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
  document.querySelector('#exposure-note').textContent = `One ${state.current.exposureMs} ms glance · ${glancePacing.progress}/10 complete sequences toward adjustment · display refresh limits very short flashes`;
  document.querySelector('.timer-label').textContent = 'First answer · from cube reveal';
  document.querySelectorAll('.answer-button').forEach((button) => { button.disabled = true; });
  state.onsetFrame = requestAnimationFrame(() => {
    if (generation !== state.generation || activeTool !== 'corner' || paused) return;
    mount.classList.remove('glance-mask');
    mount.dataset.learningState = 'visible';
    state.startedAt = performance.now();
    armTrialTimeout(state.startedAt);
    tickTimer(true);
    state.glanceTimer = setTimeout(() => {
      if (generation !== state.generation || activeTool !== 'corner' || paused) return;
      coverRecall();
      state.locked = false;
      document.querySelector('#prompt-text').textContent = 'Corner 1 of 3 — which color was missing?';
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
    document.querySelector('#prompt-text').textContent = `Corner ${current.activeIndex + 1} of 3 — which color was missing?`;
    document.querySelector('#feedback').textContent = `${current.activeIndex} entered · keep going from memory`;
    document.querySelector('.timer-label').textContent = 'Response time · from your last answer';
    return;
  }
  state.locked = true;
  cancelCornerTimers();
  // An interrupted sequence is never partly scored. Commit only all three.
  const outcomes = current.recallAnswers.map((response, index) =>
    recordCornerAnswer(current.targets[index], response.color, response.skipped, response.ms, index + 1, response.at));
  const allCorrect = outcomes.every((outcome) => outcome.isCorrect);
  const pacingResult = glancePacing.record(allCorrect);
  state.exposureMs = glancePacing.exposureMs;
  if (pacingResult.changed) syncExposureSelect();
  current.feedback = {
    status: outcomes[2].isCorrect ? 'correct' : 'wrong',
    correctColor: COLORS[outcomes[2].correctColor].hex,
    correctName: COLORS[outcomes[2].correctColor].label,
  };
  renderCurrentCase();
  document.querySelector('#cube').dataset.learningState = 'feedback';
  const positions = ['Left', 'Top right', 'Bottom right'];
  document.querySelector('#feedback').className = allCorrect ? 'is-correct' : 'is-wrong';
  document.querySelector('#feedback').textContent = outcomes.map((outcome, index) =>
    `${positions[index]}: ${outcome.isCorrect ? '✓' : '✗'} ${COLORS[outcome.correctColor].label}${outcome.isCorrect ? '' : ` (you: ${current.recallAnswers[index].color || 'skip'})`}`).join(' · ');
  document.querySelector('#prompt-text').textContent = `${outcomes.filter((outcome) => outcome.isCorrect).length}/3 correct · inspect, then continue`;
  document.querySelector('#timer').innerHTML = `${(current.recallAnswers.reduce((sum, response) => sum + response.ms, 0) / 1000).toFixed(2)}<span>s</span>`;
  document.querySelector('.timer-label').textContent = 'Complete sequence · from cube reveal';
  document.querySelectorAll('.answer-button').forEach((button) => { button.disabled = true; });
  document.querySelector('[data-action="skip"]').hidden = true;
  document.querySelector('[data-action="next-recall"]').hidden = false;
  updateStatsUI();
  updateSprintUI();
  if (state.sprint && session.attempts >= state.sprintLength) showSummary();
}

function presentCorner(previousInputAt = null) {
  cancelCornerTimers();
  state.locked = true;
  const generation = state.generation;
  const mount = document.querySelector('#cube');
  mount.classList.add('glance-mask');
  mount.dataset.learningState = 'preparing';
  document.querySelector('#feedback').textContent = 'Click a color or type its first letter';
  document.querySelector('#feedback').className = '';
  document.querySelector('#timer').innerHTML = `${previousInputAt === null ? '0.00' : ((performance.now() - previousInputAt) / 1000).toFixed(2)}<span>s</span>`;
  document.querySelector('.timer-label').textContent = previousInputAt === null
    ? 'Response time · includes key / click' : 'Response time · from your last answer';
  document.querySelector('#exposure-note').textContent = state.glance
    ? `${state.exposureMode === 'adaptive' ? `Adaptive · ${state.exposureMs} ms · ${glancePacing.progress}/10 toward adjustment` : `${state.exposureMs} ms view · fixed pace`}${state.mode === 'triple' ? ' · first corner sets pace' : ''}`
    : `Adaptive practice · accuracy before speed${state.mode === 'triple' ? ' · later corners have preview' : ''}`;
  renderAnswers();
  renderCurrentCase();
  state.onsetFrame = requestAnimationFrame(() => {
    if (generation !== state.generation || activeTool !== 'corner' || paused) return;
    mount.classList.remove('glance-mask');
    mount.dataset.learningState = 'visible';
    state.locked = false;
    state.startedAt = previousInputAt ?? performance.now();
    armTrialTimeout(state.startedAt);
    tickTimer();
    if (state.glance) state.glanceTimer = setTimeout(() => {
      if (generation !== state.generation || state.locked || paused) return;
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
  const elapsed = (performance.now() - state.startedAt) / 1000;
  document.querySelector('#timer').innerHTML = `${elapsed.toFixed(2)}<span>s</span>`;
  state.timerFrame = requestAnimationFrame(() => tickTimer(includeFeedback));
}

function recordCornerAnswer(active, color, skipped, elapsed, position, at = Date.now()) {
  const correctColor = active.stickers[active.target.hidden];
  const isCorrect = !skipped && color === correctColor;
  const family = active.family;
  const trialExposureMs = usesGlance() ? (state.mode === 'recall' ? state.current.exposureMs : state.exposureMs) : null;
  const learningKey = cornerLearningKey(active);
  review(learning, learningKey, { correct: isCorrect, ms: elapsed });
  saveLearningState();
  if (state.glance && state.mode !== 'recall') {
    const pacingResult = glancePacing.record(isCorrect, state.mode !== 'triple' || state.current.activeIndex === 0);
    state.exposureMs = glancePacing.exposureMs;
    if (pacingResult.changed) syncExposureSelect();
  }

  stats.attempts++;
  session.attempts++;
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
  return { isCorrect, correctColor };
}

function answer(color, skipped = false) {
  if (state.locked || activeTool !== 'corner' || paused) return;
  const answeredAt = performance.now();
  if (expireTrial(state.startedAt)) return;
  if (state.mode === 'recall') return answerRecall(color, skipped, answeredAt);
  state.locked = true;
  cancelCornerTimers();
  const elapsed = Math.round(answeredAt - state.startedAt);
  const { isCorrect, correctColor } = recordCornerAnswer(activeTarget(), color, skipped, elapsed, state.current.activeIndex + 1);

  document.querySelectorAll('.answer-button').forEach((button) => {
    const buttonColor = button.dataset.color;
    if (buttonColor === correctColor) button.classList.add('correct');
    else if (!skipped && buttonColor === color) button.classList.add('wrong');
    else button.classList.add('muted');
  });
  const feedback = document.querySelector('#feedback');
  feedback.className = isCorrect ? 'is-correct' : 'is-wrong';
  feedback.textContent = isCorrect
    ? `Correct — ${formatMs(elapsed)}`
    : `${skipped ? 'Skipped' : 'Not quite'} — it was ${COLORS[correctColor].label}`;

  state.current.feedback = {
    status: isCorrect ? 'correct' : 'wrong',
    correctColor: COLORS[correctColor].hex,
    correctName: COLORS[correctColor].label,
  };
  renderCurrentCase();
  document.querySelector('#cube').dataset.learningState = 'feedback';

  updateStatsUI();
  updateSprintUI();
  const sprintDone = state.sprint && session.attempts >= state.sprintLength;
  const moreCorners = state.mode === 'triple' && state.current.activeIndex < state.current.targets.length - 1;
  if (moreCorners && !sprintDone) {
    // Later corners remain visible during feedback: that inspection time is
    // part of the NEXT answer, not a free preview or a fresh timer at reveal.
    state.startedAt = answeredAt;
    document.querySelector('.timer-label').textContent = 'Next corner · clock already running';
    armTrialTimeout(answeredAt);
    tickTimer(true);
  }
  const generation = state.generation;
  state.transitionTimer = setTimeout(() => {
    if (generation !== state.generation || activeTool !== 'corner' || paused) return;
    if (sprintDone) return showSummary();
    if (!moreCorners) return startCase();
    state.current.activeIndex++;
    state.current.feedback = null;
    presentCorner(answeredAt);
  }, isCorrect ? 650 : 1100);
}

function formatMs(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function updateStatsUI() {
  recognitionProfile.update(stats);
  const avg = stats.correct ? stats.totalMs / stats.correct : null;
  document.querySelector('#avg-stat').textContent = avg ? formatMs(avg) : '—';
  document.querySelector('#avg-note').textContent = stats.bestMs ? `Best ${formatMs(stats.bestMs)}` : 'No cases yet';
  const accuracy = stats.attempts ? Math.round(stats.correct / stats.attempts * 100) : null;
  document.querySelector('#accuracy-stat').textContent = accuracy === null ? '—' : `${accuracy}%`;
  document.querySelector('#accuracy-note').textContent = stats.attempts ? `${stats.correct} of ${stats.attempts} correct` : 'Start training';
  document.querySelector('#streak-stat').textContent = stats.streak;
  document.querySelector('#streak-note').textContent = `Best: ${stats.bestStreak}`;

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

function updateLearningUI() {
  document.querySelector('.retention-panel').hidden = activeTool === 'scout' || activeTool === 'pll';
  if (activeTool === 'scout' || activeTool === 'pll') return;
  document.querySelector(`#${activeTool}-view .trainer-shell`)?.after(document.querySelector('.retention-panel'));
  const items = Object.fromEntries(Object.entries(learning.items).filter(([key]) => key.startsWith(`${activeTool === 'corner' ? 'corner' : 'f2l'}|`)));
  const summary = sessionSummary({ ...learning, items });
  const due = document.querySelector('#review-due');
  const note = document.querySelector('#review-summary');
  if (due) due.textContent = `${summary.due} case${summary.due === 1 ? '' : 's'}`;
  if (note) note.textContent = summary.attempts
    ? `${activeTool === 'corner' ? 'Corners' : 'F2L'} · ${Math.round(summary.accuracy * 100)}% practice accuracy · median correct response ${summary.medianMs !== null ? formatMs(summary.medianMs) : '—'}`
    : 'Complete cases to build your review queue';
  if (note && summary.delayedAttempts) note.textContent += ` · After 24h+: ${summary.delayedCorrect}/${summary.delayedAttempts} correct`;
}

function caseScore(item) {
  if (!item.attempts) return 10;
  return (1 - item.correct / item.attempts) * 10 + (item.correct ? item.totalMs / item.correct / 1000 : 5);
}

function updateSprintUI() {
  const box = document.querySelector('.sprint-progress');
  box.hidden = !state.sprint;
  document.querySelector('#sprint-count').textContent = `${session.attempts} / ${state.sprintLength}`;
  document.querySelector('#progress-fill').style.width = `${session.attempts / state.sprintLength * 100}%`;
}

function resetSession() {
  session = { attempts: 0, correct: 0, times: [], streak: 0 };
  updateSprintUI();
}

function setMode(mode) {
  if (!['single', 'triple', 'recall'].includes(mode)) return;
  state.mode = mode;
  const glanceToggle = document.querySelector('#glance-toggle');
  glanceToggle.checked = usesGlance();
  glanceToggle.disabled = mode === 'recall';
  const sprintLength = mode === 'recall' ? 12 : 10;
  if (sprintLength !== state.sprintLength) { state.sprintLength = sprintLength; resetSession(); }
  document.querySelector('[data-session="sprint"]').textContent = `${sprintLength}-answer sprint`;
  glancePacing.reset();
  document.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  updateHelp();
  startCase();
}

function setSession(type) {
  state.sprint = type === 'sprint';
  resetSession();
  document.querySelectorAll('[data-session]').forEach((button) => button.classList.toggle('active', button.dataset.session === type));
  startCase();
}

function showSummary() {
  const avg = session.times.length ? session.times.reduce((a, b) => a + b, 0) / session.times.length : 0;
  const best = session.times.length ? Math.min(...session.times) : null;
  document.querySelector('#summary-metrics').innerHTML = `
    <div><span>Accuracy</span><strong>${Math.round(session.correct / session.attempts * 100)}%</strong></div>
    <div><span>Average</span><strong>${avg ? formatMs(avg) : '—'}</strong></div>
    <div><span>Best</span><strong>${best ? formatMs(best) : '—'}</strong></div>`;
  document.querySelector('#summary-dialog').showModal();
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

const F2L_BOTTOMS = ['neutral', 'white', 'yellow', 'green', 'blue', 'red', 'orange'];

function renderCrossOptions() {
  document.querySelector('#cross-options').innerHTML = F2L_BOTTOMS.map((color) => {
    const label = color === 'neutral' ? 'Neutral' : COLORS[color].label;
    const style = color === 'neutral' ? '' : `style="--cross-color:${COLORS[color].hex}"`;
    return `<button class="cross-option ${color === f2lPreference ? 'active' : ''} ${color === 'neutral' ? 'neutral' : ''}" data-cross="${color}" ${style} aria-pressed="${color === f2lPreference}"><i aria-hidden="true"></i><span>${label}</span></button>`;
  }).join('');
}

function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function matchedPieces() {
  if (!f2lState.current) return [];
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

function renderF2L() {
  const current = f2lState.current;
  if (!current) return;
  const matched = matchedPieces();
  const selectable = current.selectablePieces.filter((piece) => !matched.includes(piece));
  f2lCube3D?.update({
    mode: 'f2l',
    colors: current.palette,
    cornerStickers: current.cornerStickers,
    stickerColors: current.edgeStickers,
    showAllCorners: true,
    targets: [],
    selectablePieces: selectable,
    f2lSelection: f2lState.selected ? [f2lState.selected] : [],
    f2lFeedback: f2lState.feedback,
    matchedPieces: matched,
    onPieceClick: handleF2LPiece,
  });
  const bottom = COLORS[current.bottomColor];
  const front = COLORS[current.frontColor];
  const view = document.querySelector('#f2l-view');
  view.dataset.preference = f2lPreference;
  view.dataset.bottomColor = current.bottomColor;
  view.dataset.caseSource = current.source;
  document.querySelector('#f2l-orientation').textContent = `${bottom.label} bottom · ${front.label} front`;
  document.querySelector('#f2l-cross-label').textContent = `${bottom.label.toUpperCase()} BOTTOM`;
  document.querySelector('#f2l-case-number').textContent = `CASE ${String(f2lState.caseNumber).padStart(3, '0')}`;
  document.querySelector('#f2l-found').textContent = f2lState.matchedPairIds.length;
  document.querySelector('#f2l-total').textContent = current.targetPairIds.length;
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
  document.querySelector('#f2l-progress').innerHTML = current.targetPairIds.map((pairId, index) => `<i class="${f2lState.matchedPairIds.includes(pairId) ? 'done' : ''}" title="Pair ${index + 1}"><span>${f2lState.matchedPairIds.includes(pairId) ? '✓' : index + 1}</span></i>`).join('');
  const continueButton = document.querySelector('#f2l-continue');
  if (continueButton) {
    continueButton.innerHTML = `${f2lState.correction ? 'Continue' : 'New case'} <kbd>N</kbd>`;
    continueButton.classList.toggle('correction-button', Boolean(f2lState.correction));
    continueButton.setAttribute('aria-label', f2lState.correction ? 'Continue to the next F2L case' : 'Skip F2L case');
  }
}

function newF2LCase() {
  clearTimeout(trialTimeout);
  clearTimeout(f2lState.nextTimer);
  if (paused || activeTool !== 'f2l') return;
  // Pick the neutral bottom once; adaptive case filtering must not bias it.
  const bottom = f2lPreference === 'neutral' ? Object.keys(COLORS)[randomSeed() % 6] : f2lPreference;
  const candidates = [];
  for (let attempt = 0; attempt < 64; attempt++) {
    const seed = randomSeed();
    let generated;
    if (wasmReady) {
      generated = createF2LCaseFromWasm(JSON.parse(wasmF2LCase(BigInt(seed), COLOR_FACE[bottom])), seed, f2lPreference);
    } else {
      generated = createF2LCase(seed, bottom);
    }
    generated.targetPairIds.forEach((pairId) => candidates.push({ current: generated, learningKey: pairLearningKey(generated, pairId) }));
    if (candidates.length >= 32) break;
  }
  const generated = chooseDue(learning, candidates)?.current;
  if (!generated) {
    f2lState.locked = true;
    document.querySelector('#f2l-status').textContent = 'No suitable case generated. Choose New cube to retry.';
    return;
  }
  f2lState = {
    current: generated,
    caseNumber: f2lState.caseNumber + 1,
    selected: null,
    matchedPairIds: [],
    feedback: null,
    locked: false,
    nextTimer: null,
    message: 'Select a corner or edge to begin.',
    startedAt: 0,
    firstSelectedAt: 0,
    correction: false,
  };
  renderF2L();
  document.querySelector('#f2l-timings').textContent = 'Find a pair to see search and matching times.';
  f2lState.startedAt = performance.now();
}

function handleF2LPiece({ piece }) {
  if (paused || activeTool !== 'f2l' || f2lState.locked || !f2lState.current?.pieceByPiece?.[piece] || matchedPieces().includes(piece)) return;
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
  const correct = sameTruePair && current.targetPairIds.includes(first.pairId);
  if (sameTruePair && !correct) {
    f2lState.selected = null;
    f2lState.firstSelectedAt = 0;
    f2lState.message = 'Those pieces match. This case is outside the trainer’s deduction targets; unscored.';
    renderF2L();
    return;
  }
  f2lState.feedback = { status: correct ? 'correct' : 'wrong', piece };
  clearTimeout(trialTimeout);
  const now = performance.now();
  const elapsed = Math.round(now - f2lState.startedAt);
  const findMs = Math.round(f2lState.firstSelectedAt - f2lState.startedAt);
  const matchMs = Math.round(now - f2lState.firstSelectedAt);
  document.querySelector('#f2l-timings').textContent = `Search ${formatMs(findMs)} · match ${formatMs(matchMs)} · includes pointing`;
  const pairId = first.pairId || second.pairId;
  if (pairId) review(learning, pairLearningKey(current, pairId), { correct: Boolean(correct), ms: elapsed, responseThresholdMs: 3000 });
  saveLearningState();
  if (correct) {
    f2lState.matchedPairIds.push(first.pairId);
    f2lState.message = 'Pair found. Nice deduction.';
    const complete = f2lState.matchedPairIds.length === current.targetPairIds.length;
    f2lState.locked = true;
    const answeredCase = f2lState;
    renderF2L();
    f2lState.nextTimer = setTimeout(() => {
      if (activeTool !== 'f2l' || f2lState !== answeredCase || paused) return;
      if (complete) newF2LCase();
      else {
        f2lState.selected = null;
        f2lState.feedback = null;
        f2lState.firstSelectedAt = 0;
        f2lState.locked = false;
        f2lState.message = 'Correct. Find another deducible pair.';
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

function setF2LPreference(preference) {
  if (!F2L_BOTTOMS.includes(preference)) return;
  f2lPreference = preference;
  try { localStorage.setItem('cubesight-f2l-bottom', preference); } catch { /* Keep the preference in memory. */ }
  renderCrossOptions();
  newF2LCase();
}

function updateHelp() {
  if (activeTool === 'corner' && state.mode === 'recall') {
    document.querySelector('#help-title').textContent = 'One glance. Three answers.';
    document.querySelector('#help-copy').textContent = 'Remember the missing colors at left, top right, and bottom right. The cube is shown only once per sequence.';
    document.querySelector('#help-steps').innerHTML = '<li>Inspect all three corners during the selected glance. Answers unlock when the cube is hidden.</li><li>Type or click the three missing colors in order, without waiting. No feedback appears until all three are entered.</li><li>Inspect the result, then press Next cube or N. An interrupted sequence is discarded. Adaptive pacing counts all three correct as one successful outcome; very short flashes are limited by your display refresh.</li>';
    return;
  }
  if (activeTool === 'scout') {
    document.querySelector('#help-title').textContent = 'Inspect your possibilities.';
    document.querySelector('#help-copy').textContent = 'Cross Scout compares cross and extended-cross plans for the colors you select. Recognition labels are explanatory heuristics, not a guarantee that a plan will feel easy.';
    document.querySelector('#help-steps').innerHTML = '<li>Apply the scramble to a solved cube with white on top and green in front. Paste or generate that same scramble here.</li><li>Select allowed cross colors, or CN for all six. The active color is held on the bottom; use the suggested front or choose another before you analyze.</li><li>Select a plan to highlight its pair pieces. Step through the moves on screen or on your cube. Move notation always uses the original scramble orientation.</li>';
    return;
  }
  if (activeTool === 'pll') {
    document.querySelector('#help-title').textContent = 'See the pattern, then name it.';
    document.querySelector('#help-copy').textContent = 'Recognize all 21 PLL cases from the two adjacent sides available in a normal solve view—without rotating the cube.';
    document.querySelector('#help-steps').innerHTML = '<li>Start with a small PLL family in Learn, then interleave it with other families in Mix.</li><li>Answer before the cue appears. After an error, the case returns only after intervening cases.</li><li>Adaptive glance shortens only after high accuracy. Use Transfer to test new AUFs, and treat 24-hour returns separately from same-session practice.</li>';
    return;
  }
  const f2l = activeTool === 'f2l';
  document.querySelector('#help-title').textContent = f2l ? 'Inspect, deduce, match.' : 'Recognize, don’t calculate.';
  document.querySelector('#help-copy').textContent = f2l
    ? 'Find every corner–edge pair that can be identified from the allowed inspection arc.'
    : 'Two stickers of each target corner remain visible. Identify its hidden third color across nearby real-world viewing angles.';
  document.querySelector('#help-steps').innerHTML = f2l
    ? '<li>Drag only left and right; the camera cannot reveal the back or bottom.</li><li>Select a corner or edge, then select its matching piece. Other pieces also accept clicks.</li><li>After a mistake, inspect the green outlines. Press N or Continue when ready.</li>'
    : '<li>The cube stays locked during each case, but new cases vary slightly left, right, up, and down. Hidden faces never enter view.</li><li>Use the centers and edges to ground the cube orientation, then click a color or type W, Y, G, B, R, or O.</li><li>In Three corners, answer the highlighted targets from left to right; all three share one stable angle.</li>';
}

// Hash routes work on static hosts too, without a server-side SPA rewrite.
function syncRoute(initial = false) {
  const tool = Object.keys(TOOL_ROUTES).find((key) => `#${TOOL_ROUTES[key]}` === location.hash) || 'corner';
  const hash = `#${TOOL_ROUTES[tool]}`;
  if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  setTool(tool, initial);
}

function setTool(tool, initial = false) {
  if (!Object.hasOwn(TOOL_ROUTES, tool) || (tool === activeTool && !initial)) return;
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  scout?.setActive(false);
  pll?.setActive(false);
  activeTool = tool;
  document.title = `${TOOL_TITLES[tool]} · Cubesight`;
  document.querySelector('#corner-view').hidden = tool !== 'corner';
  document.querySelector('#f2l-view').hidden = tool !== 'f2l';
  document.querySelector('#pll-view').hidden = tool !== 'pll';
  document.querySelector('#scout-view').hidden = tool !== 'scout';
  // Choosing another trainer starts fresh; a corner timeout must not block F2L.
  paused = false;
  document.querySelector('#pause-overlay').hidden = true;
  document.querySelectorAll('[data-tool]').forEach((link) => {
    const selected = link.dataset.tool === tool;
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  clearTimeout(f2lState.nextTimer);
  cancelCornerTimers();
  if (tool === 'scout') {
    state.locked = true;
    f2lState.locked = true;
    if (!scoutLoad) {
      document.querySelector('#scout-view').textContent = 'Loading Cross Scout…';
      scoutLoad = import('./cross-scout.js').then(({ createCrossScout }) => {
        scout = createCrossScout(document.querySelector('#scout-view'));
        scout.setActive(activeTool === 'scout');
      }).catch((error) => {
        document.querySelector('#scout-view').textContent = `Cross Scout could not load: ${error.message}. Switch trainers and try again.`;
        scoutLoad = null;
      });
    } else scout?.setActive(true);
  } else if (tool === 'pll') {
    state.locked = true;
    f2lState.locked = true;
    if (!pllLoad) {
      document.querySelector('#pll-view').textContent = 'Loading PLL recognition…';
      pllLoad = import('./pll-trainer.js').then(({ createPLLTrainer }) => {
        pll = createPLLTrainer(document.querySelector('#pll-view'));
        pll.setActive(activeTool === 'pll');
      }).catch((error) => {
        document.querySelector('#pll-view').textContent = `PLL recognition could not load: ${error.message}. Switch trainers and try again.`;
        pllLoad = null;
      });
    } else pll?.setActive(true);
  } else if (tool === 'f2l') {
    state.locked = true;
    newF2LCase();
  } else {
    f2lCube3D?.setMode('f2l');
    startCase();
  }
  updateHelp();
  updateLearningUI();
}

function armTrialTimeout(startedAt) {
  clearTimeout(trialTimeout);
  trialTimeout = setTimeout(() => {
    if (!expireTrial(startedAt) && !paused) armTrialTimeout(startedAt);
  }, Math.max(1, TRIAL_TIMEOUT_MS - (performance.now() - startedAt)));
}

function expireTrial(startedAt) {
  if (performance.now() - startedAt < TRIAL_TIMEOUT_MS) return false;
  pausePractice('timeout');
  return true;
}

function placePausePrompt() {
  document.querySelector(`#${activeTool}-view .cube-stage`).append(document.querySelector('#pause-overlay'));
}

function pausePractice(reason = 'interrupted') {
  if (activeTool === 'scout') { scout?.setActive(false); return; }
  if (activeTool === 'pll') { pll?.setActive(false); return; }
  if (paused || document.querySelector('#summary-dialog').open) return;
  paused = true;
  cancelCornerTimers();
  state.locked = true;
  clearTimeout(f2lState.nextTimer);
  f2lState.locked = true;
  document.querySelector('#pause-overlay h2').textContent = reason === 'timeout' ? 'Taking a break?' : 'Practice paused';
  document.querySelector('#pause-overlay p:not(.eyebrow)').textContent = reason === 'timeout'
    ? '10 seconds elapsed. This trial was not recorded—your times, accuracy, and adaptive pace are unchanged. Resume with a fresh case when you’re ready.'
    : 'Your interrupted trial will not be scored.';
  placePausePrompt();
  document.querySelector('#pause-overlay').hidden = false;
}

function resumePractice() {
  paused = false;
  document.querySelector('#pause-overlay').hidden = true;
  if (activeTool === 'corner') startCase();
  else newF2LCase();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pausePractice();
  else if (activeTool === 'scout') scout?.setActive(true);
  else if (activeTool === 'pll') pll?.setActive(true);
});
document.querySelector('#help-dialog').addEventListener('close', () => {
  if (activeTool === 'scout' && !document.hidden) scout?.setActive(true);
  else if (activeTool === 'pll' && !document.hidden) pll?.setActive(true);
});
document.querySelector('#summary-dialog').addEventListener('cancel', (event) => {
  event.preventDefault();
  document.querySelector('#summary-dialog').close();
  setSession('practice');
});

document.addEventListener('click', (event) => {
  const toolButton = event.target.closest('[data-tool]');
  if (toolButton) return; // Native links preserve new-tab behavior; hashchange switches trainers.
  const crossButton = event.target.closest('[data-cross]');
  if (crossButton) return setF2LPreference(crossButton.dataset.cross);
  const answerButton = event.target.closest('[data-color]');
  if (answerButton && activeTool === 'corner') return answer(answerButton.dataset.color);
  const modeButton = event.target.closest('[data-mode]');
  if (modeButton) return setMode(modeButton.dataset.mode);
  const sessionButton = event.target.closest('[data-session]');
  if (sessionButton) return setSession(sessionButton.dataset.session);
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'resume') return resumePractice();
  if (action === 'next-recall' && activeTool === 'corner' && state.mode === 'recall') return startCase();
  if (action === 'skip' && activeTool === 'corner') answer(null, true);
  if (action === 'new-f2l' && (activeTool === 'f2l' || !f2lState.correction)) newF2LCase();
  if (action === 'reset-view') cube3D?.resetView();
  if (action === 'clear' && confirm('Clear all Cubesight training history?')) {
    stats = initialStats(); learning = loadLearning(null); saveLearningState(); saveStats(); updateStatsUI(); startCase();
  }
  if (action === 'open-help') { pausePractice(); updateHelp(); document.querySelector('#help-dialog').showModal(); }
  if (action === 'close-help') {
    document.querySelector('#help-dialog').close();
    if (activeTool === 'scout') scout?.setActive(true);
  }
  if (action === 'close-summary') { document.querySelector('#summary-dialog').close(); setSession('practice'); }
  if (action === 'restart-sprint') { document.querySelector('#summary-dialog').close(); resetSession(); startCase(); }
  if (action === 'practice-mode') { document.querySelector('#summary-dialog').close(); setSession('practice'); }
});

document.querySelector('#glance-toggle').addEventListener('change', (event) => {
  state.glance = event.target.checked;
  glancePacing.reset();
  startCase();
});
document.querySelector('#exposure-mode').addEventListener('change', (event) => {
  state.exposureMode = event.target.value === 'fixed' ? 'fixed' : 'adaptive';
  glancePacing.setMode(state.exposureMode);
  state.exposureMs = glancePacing.exposureMs;
  startCase();
});
document.querySelector('#exposure-select').addEventListener('change', (event) => {
  state.exposureMs = Number(event.target.value) || 600;
  glancePacing.setExposure(state.exposureMs);
  if (usesGlance()) startCase();
});

document.addEventListener('keydown', (event) => {
  if (activeTool === 'scout' || activeTool === 'pll') return;
  if (event.repeat || paused || document.querySelector('dialog[open]')) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  if (activeTool === 'f2l') {
    if (event.key.toLowerCase() === 'n') newF2LCase();
    return;
  }
  if (state.mode === 'recall' && state.locked && !document.querySelector('[data-action="next-recall"]').hidden && event.key.toLowerCase() === 'n') return startCase();
  const colorKey = Object.keys(COLORS).find((color) => color[0] === event.key.toLowerCase());
  if (colorKey && state.answerChoices.includes(colorKey)) return answer(colorKey);
  if (/^[1-6]$/.test(event.key)) answer(state.answerChoices[Number(event.key) - 1]);
  if (event.key.toLowerCase() === 's') answer(null, true);
});

try {
  cube3D = createCube3D(document.querySelector('#cube'), { mode: 'corner' });
} catch (error) {
  console.warn('WebGL cube unavailable; using accessible SVG fallback.', error);
}
try {
  f2lCube3D = createCube3D(document.querySelector('#f2l-cube'), { mode: 'f2l', onPieceClick: handleF2LPiece });
} catch (error) {
  console.warn('WebGL F2L cube unavailable.', error);
  document.querySelector('#f2l-cube').textContent = 'The F2L trainer needs WebGL. Enable hardware acceleration or try another browser.';
  document.querySelector('[data-tool="f2l"]').title = 'F2L requires WebGL';
}
renderCrossOptions();
updateStatsUI();
updateSprintUI();
updateLearningUI();
window.addEventListener('hashchange', () => syncRoute());
syncRoute(true);

// The Rust core is compiled with wasm-bindgen and runs alongside the visual trainer.
initWasm().then(() => {
  wasmReady = true;
  document.querySelector('#engine-badge').textContent = 'RUST · WASM';
}).catch(() => {});
