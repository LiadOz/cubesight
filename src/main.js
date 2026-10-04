import '@fontsource-variable/manrope';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import './styles.css';
import './pages/page.css';
import './brain/css/tokens-orbit.css';
import './brain/css/tokens-mono.css';
import './legacy-reskin.css';
import './not-found.css';
import { setupTheme } from './theme.js';
import { createHeader, createToastSlot } from './ui/shared/index.js';
import { buildSharedViewModel } from './ui/shared/snapshot-model.js';
import { createSnapshotBridge } from './ui/shared/snapshot-bridge.js';
import { smartCube, clearSavedCubeData, setReplayConnectDevice } from './smart-cube-bluetooth.js';
import { clearRecording, enableRecordingPersistence, getRecording, recordNavigation, recordView } from './recorder.js';
import { saveRecording } from './brain-recording.js';
import { APP_NAME, NAV_FOR_TOOL, PAGE_TITLES } from './copy/nav.js';
import { T, MSG, fmt, KEYS } from './copy/terms.js';
import { isKnownTool, resolveRoute, keyScope, parseHash, registerDevRoute } from './routes.js';
import { rememberDrill } from './drills/catalog.js';
import { createRoundPanel } from './drills/round-panel.js';
import { syncPageTokens } from './pages/tokens.js';
import { parseDrillStart } from './drills/start-position.js';
import { parseCaseFilter } from './drills/case-filter.js';
import { resolveDrillPosition } from './drills/position.js';
import { analysisStateFromScramble } from './analysis/long-replay.js';
import { relabelMoves } from './analysis/normalize.js';
import { currentDShift } from './solve-tracker.js';
import { loadSettings } from './brain/settings.js';
import { renderCube } from './cube-renderer.js';
import { createPageCube } from './pages/cube-view.js';
import { createHelpPage } from './help/index.js';
import { createTrainerOrbit } from './trainers/orbit-round.js';
import { mountCaseColorControl } from './trainers/case-color-control.js';
import { mountTrainerSettings } from './trainers/settings-controls.js';
import initWasm, { f2l_case as wasmF2LCase } from './wasm/cubesight_core.js';
import { createF2LCase, createF2LCaseFromWasm, createF2LCaseFromCubeState, createPseudoScanCase, createPinnedPseudoScanCase, colorNeutralOrientation } from './f2l-logic.js';
import { solveCross } from './cross-solver.js';
import { toRenderData, validateSolution } from './cross-cube.js';
import { readCaseColorSetting, CASE_COLOR_CHANGE_EVENT } from './ui/cube/case-color.js';
import { createCaseDisplayMap, colorHex, displayColorKey, logicalColorKey, recolorStickers } from './trainers/case-display.js';
import { createPlannerSetup, plannerChoices, formatWeight, wideURequest, wideUResults } from './f2l-planner.js';
import { loadLearning, saveLearning, review, itemKey, f2lKey, sessionSummary, chooseDue } from './learning.js';
import { createGlancePacing } from './glance-pacing.js';
import { createRecognitionProfile } from './recognition-profile.js';
const BUILD_REVISION = __CUBESIGHT_REVISION__;
const BUILD_LABEL = BUILD_REVISION === 'development' ? BUILD_REVISION : BUILD_REVISION.slice(0, 7);
let f2lStartHash = null;
let f2lStartPromise = null;
let f2lStartPosition = null;
let f2lActivePin = null;
let cornerStartHash = null;
let cornerStartPromise = null;
let cornerStartPosition = null;
let cornerCaseFilter = null;
let f2lCaseFilter = null;

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
  const { generatePinVariations } = await import('./drills/pin-variations.js');
  const variations = await generatePinVariations(pin, { count: 3 });
  const variation = variations[Math.floor(Math.random() * variations.length)];
  if (!variation) return null;
  const face = pin.crossFace || 'D';
  const moves = variation.scramble.split(/\s+/).filter(Boolean);
  const normalized = face === 'D' ? moves : relabelMoves(moves, face);
  try { return { state: analysisStateFromScramble(normalized.join(' ')), scramble: normalized.join(' '), pin, face }; }
  catch { return null; }
}

// A newly activated service worker owns a different set of hashed lazy-load
// chunks. Reload an already-installed app as soon as its controller changes
// so a live old shell never asks the new worker for a deleted PLL/Scout chunk.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloadingForUpdate = false;
  const cubeIsConnected = () => {
    const phase = document.documentElement.dataset.cubePhase;
    return phase && phase !== 'disconnected' && phase !== 'connecting';
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return;
    // A full reload drops the live Bluetooth GATT link, so if a smart cube is
    // connected, defer the reload until it disconnects (a lighter refresh via
    // the in-app “Reset view” keeps the link). Watch the phase attribute.
    if (cubeIsConnected()) {
      const observer = new MutationObserver(() => {
        if (!cubeIsConnected()) { observer.disconnect(); reloadingForUpdate = true; location.reload(); }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-cube-phase'] });
      return;
    }
    reloadingForUpdate = true;
    location.reload();
  });
}
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
const GLANCE_EXPOSURES = [25, 50, 75, 100, 150, 200, 300, 450, 600, 800, 1000, 1500];
let stats = loadStats();
let learning = loadLearning(localStorage);
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
let wasmReady = false;
let activeTool = 'corner';
// tool id -> the element that shows it (routes live in src/routes.js).
const TOOL_VIEWS = { corner: 'corner-view', f2l: 'f2l-view', pll: 'pll-view', scout: 'scout-view', oll: 'oll-view', lookahead: 'lookahead-view', brain: 'brain-view', smart: 'smart-view', drills: 'drills-view', algs: 'algs-view', progress: 'progress-view', history: 'history-view', timer: 'timer-view', review: 'review-view', recording: 'recording-view', help: 'help-view', demo: 'demo-view', notfound: 'not-found-view' };
let drillsHub = null;
let drillsHubLoad = null;
let algsPage = null;
let algsPageLoad = null;
let demoPage = null;
let demoPageLoad = null;
let progressPage = null;
let progressPageLoad = null;
let historyPage = null;
let historyPageLoad = null;
let timerPage = null;
let timerPageLoad = null;
let reviewPage = null;
let reviewPageLoad = null;
let reviewRouteHash = '';
const drillPages = Object.create(null);
const drillPageHashes = Object.create(null);
const drillPageLoads = Object.create(null);
let scout = null;
let scoutLoad = null;
let scoutRouteHash = null;
let smart = null;
let smartLoad = null;
let galleryPage = null; // dev only: stays null in a production build
let labPage = null;
let helpPage = null;
let helpReturnHash = '#/solve';
let helpPausedForReturn = false;
let galleryLoad = null;
let brain = null;
let brainLoad = null;
let labPreviewCube = null;
let pll = null;
let pllLoad = null;
let f2lCube3D = null;
let paused = false;
const legacyRounds = Object.create(null);
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

document.querySelector('#app').innerHTML = `
  <div id="site-header"></div>
  <main>
    <div id="corner-view">
    <section class="intro-row">
      <div>
        <p class="eyebrow">drills / corner recognition</p>
        <h1>Corner recognition</h1>
      </div>
        <p class="intro-copy">Find the hidden color.</p>
    </section>

    <details class="training-settings">
    <summary><span>settings</span><small>drill, round & glance</small><i aria-hidden="true"></i></summary>
    <section class="mode-bar" aria-label="settings">
      <div class="mode-group">
        <span class="control-label">${T.drill}</span>
        <div class="segmented" role="group" aria-label="corner drill">
          <button class="segment active" data-mode="single">single corner</button>
          <button class="segment" data-mode="triple">three corners</button>
          <button class="segment" data-mode="recall">one-glance recall</button>
        </div>
      </div>
        <div class="mode-group">
        <span class="control-label">session</span>
        <div class="segmented" role="group" aria-label="Session type">
          <button class="segment active" data-session="practice">endless</button>
          <button class="segment" data-session="sprint">10-case round</button>
        </div>
      </div>
      <div class="learning-controls" aria-label="Recognition pacing">
        <label class="learning-toggle"><input id="glance-toggle" type="checkbox"><span>glance</span></label>
        <label class="exposure-picker" for="exposure-mode">mode <select id="exposure-mode" aria-label="glance mode" title="Adaptive glance changes after every 10 eligible answers based on accuracy. It ranges from 25 ms to 1,500 ms. A recall sequence counts as one answer."><option value="adaptive" selected>adaptive glance</option><option value="fixed">fixed</option></select></label>
        <label class="exposure-picker" for="exposure-select">glance time <select id="exposure-select" aria-label="glance time"><option value="25">25 ms</option><option value="50">50 ms</option><option value="75">75 ms</option><option value="100">100 ms</option><option value="150">150 ms</option><option value="200">200 ms</option><option value="300">300 ms</option><option value="450">450 ms</option><option value="600" selected>600 ms</option><option value="800">800 ms</option><option value="1000">1 s</option><option value="1500">1.5 s</option></select></label>
      </div>
    </section>
    </details>

    <section class="trainer-shell">
      <div class="cube-stage">
        <div class="stage-topline">
          <span class="status-dot"><i></i> find the hidden color</span>
          <span class="view-lock">locked · varied angle</span>
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
          <span id="case-mode">single corner</span>
        </div>
        <div class="timer-wrap">
          <span class="timer-label">recog · includes key</span>
          <div id="timer" class="timer" aria-live="off">0.00</div>
          <small id="exposure-note" class="timing-note">adaptive glance · accuracy before speed</small>
        </div>
        <div class="prompt-block">
          <p id="prompt-text">Which color completes <br>this corner?</p>
          <div id="known-colors" class="known-colors" hidden></div>
        </div>
        <div id="answers" class="answer-grid" role="group" aria-label="Choose the hidden color"></div>
        <div class="feedback-line">
          <p id="feedback" role="status" aria-live="polite">Tap or press a color key.</p>
          <button class="skip-button" data-action="skip">skip <kbd>s</kbd></button>
          <button class="skip-button" data-action="next-recall" hidden>next case</button>
        </div>
      </div>
    </section>

    <details class="trainer-progress-details">
      <summary>Progress · recognition profile</summary>
    <section class="stats-section">
      <div class="section-heading">
        <div><p class="eyebrow">Progress</p><h2>Your recognition profile</h2></div>
        <button class="text-button danger" data-action="clear">Clear history</button>
      </div>
      <div class="stats-grid">
        <article class="metric-card"><span>mean recog</span><strong id="avg-stat">—</strong><small id="avg-note">No cases yet</small></article>
        <article class="metric-card"><span>accuracy</span><strong id="accuracy-stat">—</strong><small id="accuracy-note">Start a round</small></article>
        <article class="metric-card"><span>combo</span><strong id="streak-stat">0</strong><small id="streak-note">best combo: 0</small></article>
        <article class="trend-card">
          <div class="trend-head"><div><span>Recent pace</span><small>Last 12 correct answers</small></div><strong id="trend-value">—</strong></div>
          <div id="trend-chart" class="trend-chart" aria-label="Recent recognition times"></div>
        </article>
      </div>
      <div class="case-table-card">
        <div class="case-table-head"><div><span>Corner families</span><small>Needs attention first</small></div><span class="engine-badge" id="engine-badge">js engine</span></div>
        <div id="case-list" class="case-list"></div>
      </div>
      <div id="recognition-profile"></div>
    </section>
    </details>
    </div>

    <div id="f2l-view" hidden>
      <section class="intro-row f2l-intro">
        <div><p class="eyebrow">drills / F2L</p><h1>F2L deduction</h1></div>
        <p class="intro-copy">Find your next pair.</p>
      </section>
      <details class="training-settings">
      <summary><span>settings</span><small>color neutral · choose a drill</small><i aria-hidden="true"></i></summary>
      <section class="mode-bar f2l-controls" aria-label="F2L settings">
        <div class="mode-group f2l-drill-picker"><span class="control-label">drill</span><div class="segmented" aria-label="F2L drill"><button class="segment active" data-f2l-drill="deduction">pair deduction</button><button class="segment" data-f2l-drill="scan">timed scan</button><button class="segment" data-f2l-drill="planner">best next pair</button></div></div>
        <label class="scan-duration" id="scan-duration-wrap" hidden><span class="control-label">round</span><select id="f2l-scan-duration"><option value="15">15 s</option><option value="30" selected>30 s</option><option value="45">45 s</option></select></label>
        <label class="planner-shift" id="scan-pseudo-wrap" hidden><input id="f2l-scan-pseudo" type="checkbox"> pseudo pairs · D offset</label>
        <button class="new-case-button" id="f2l-scan-start" data-action="start-scan" hidden>start scan</button>
        <label class="planner-shift" id="planner-shift-wrap" hidden><input id="planner-shift-d" type="checkbox"> D offset</label>
        <button class="new-case-button" data-action="new-f2l">next case</button>
      </section>
      </details>
      <section class="trainer-shell f2l-shell">
        <div class="cube-stage">
          <div class="stage-topline"><span class="status-dot"><i></i> Find a matching pair</span><span>Drag left or right</span></div>
          <div id="f2l-cube" class="cube-mount"></div>
          <div class="cube-caption"><span id="f2l-orientation">White bottom · Green front</span><span>Drag left / right · click pieces to pair</span></div>
        </div>
        <div class="answer-stage f2l-answer-stage">
          <div class="f2l-instructions">
            <p id="f2l-status" role="status" aria-live="polite">Select a corner or edge to begin.</p>
            <small>Then select its matching piece. Selecting the same piece again clears it.</small>
          </div>
          <div class="selected-piece-card" id="f2l-selection"><span>First selection</span><strong>None</strong><small>Click a visible F2L corner or edge</small></div>
          <div class="f2l-timings" id="f2l-timings">Find a pair to see search and matching times.</div>
          <div id="f2l-planner-choices" class="f2l-planner-choices" hidden></div>
          <div class="f2l-footer-actions"><span>back and bottom faces are locked</span><button id="f2l-continue" class="skip-button" data-action="new-f2l">skip <kbd>s</kbd></button></div>
        </div>
      </section>
      <details class="trainer-progress-details"><summary>Progress · F2L deduction</summary></details>
    </div>
    <div id="drills-view" class="cs-host" hidden></div>
    <div id="algs-view" class="cs-host" hidden></div>
    <div id="progress-view" class="cs-host" hidden></div>
    <div id="history-view" class="cs-host" hidden></div>
    <div id="timer-view" class="cs-host" hidden></div>
    <div id="review-view" class="cs-host" hidden></div>
    <section id="not-found-view" class="brain not-found-page" data-brain-style="orbit" hidden aria-labelledby="not-found-title">
      <p class="not-found-kicker">route unavailable</p>
      <h1 id="not-found-title">not found</h1>
      <p class="not-found-copy">The address may have changed, or the page may have been removed.</p>
      <nav class="not-found-links" aria-label="Choose a page">
        <a id="not-found-drills" href="#/drills">go to drills</a>
        <a id="not-found-solve" href="#/solve">go to solve</a>
      </nav>
    </section>
    <section id="recording-view" class="recording-page" hidden aria-labelledby="recording-title">
      <p class="eyebrow">developer tools</p>
      <h1 id="recording-title">recording</h1>
      <p class="recording-page__intro">CubeSight keeps a bounded local ring of cube input, connection events and page changes. Exported recordings mask device identifiers and coarse browser details.</p>
      <div id="recording-cube" class="recording-page__cube" aria-label="current smart cube"></div>
      <p class="recording-page__count" id="recording-count" role="status"></p>
      <div class="recording-page__actions"><button class="primary-button" data-action="save-recording">save anonymized recording</button><button class="text-button" data-action="clear-recording">clear recording</button></div>
      <ol class="recording-page__events" id="recording-events" aria-label="recent recorded events"></ol>
    </section>
    <div id="oll-view" class="cs-host" hidden></div>
    <div id="lookahead-view" class="cs-host" hidden></div>
    <div id="pll-view" hidden></div>
    <div id="scout-view" hidden></div>
    <div id="brain-view" hidden></div>
    <div id="smart-view" hidden></div>
    <div id="help-view" class="cs-host" hidden></div>
    <div id="demo-view" class="cs-host" hidden></div>
    <section class="retention-panel" aria-label="drill progress"><div><span>due</span><strong id="review-due">0 cases</strong></div><p id="review-summary">No cases due. Do a round to build your queue.</p><small>Misses and slow recog return sooner. Accuracy and delayed recall are separate.</small></section>
  </main>


  <div id="pause-overlay" class="pause-overlay" hidden role="region" aria-label="paused" aria-live="polite"><div><p class="eyebrow">Taking a break?</p><h2>paused</h2><p>This case won't count.</p><button class="primary-button" data-action="resume">resume</button></div></div>
  <dialog id="summary-dialog" class="summary-dialog">
    <button class="dialog-close" data-action="close-summary" aria-label="Close">×</button>
    <p class="eyebrow">round done</p>
    <h2>Clean round.</h2>
    <div class="summary-metrics" id="summary-metrics"></div>
    <button class="primary-button" data-action="restart-sprint">one more round</button>
    <button class="text-button" data-action="practice-mode">endless</button>
  </dialog>

`;

const cornerTrainerOrbit = createTrainerOrbit(document.querySelector('#corner-view .cube-stage'));
const f2lTrainerOrbit = createTrainerOrbit(document.querySelector('#f2l-view .cube-stage'));
mountCaseColorControl(document.querySelector('#corner-view .intro-row'));
mountCaseColorControl(document.querySelector('#f2l-view .intro-row'));
const cornerSettings = mountTrainerSettings(document.querySelector('#corner-view .training-settings'));
const f2lSettings = mountTrainerSettings(document.querySelector('#f2l-view .training-settings'));

function legacyTrainerViewModel(tool) {
  const roundPanelModel = legacyRounds[tool]?.getViewModel?.() || null;
  if (tool === 'corner') {
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
window.__cubesightLegacyTrainerHandles = { corner: { getViewModel: () => legacyTrainerViewModel('corner') }, f2l: { getViewModel: () => legacyTrainerViewModel('f2l') } };

window.addEventListener(CASE_COLOR_CHANGE_EVENT, () => {
  if (activeTool === 'corner' && state.current) {
    state.current.displayColorSetting = null;
    renderCurrentCase();
    renderAnswers();
  } else if (activeTool === 'f2l' && f2lState.current) renderF2L();
  else if (activeTool === 'f2l' && f2lState.planner) renderF2LPlanner();
});

const globalHeaderStatus = document.createElement('span');
globalHeaderStatus.className = 'ui-header-status';
globalHeaderStatus.setAttribute('role', 'status');
const globalHeader = createHeader(document.querySelector('#site-header'), {
  title: APP_NAME,
  sections: [
    { id: 'solve', label: 'solve', href: '#/solve' },
    { id: 'drills', label: 'drills', href: '#/drills' },
    { id: 'algs', label: 'algs', href: '#/algs' },
    { id: 'progress', label: 'progress', href: '#/progress' },
    { id: 'history', label: 'history', href: '#/history' },
  ],
  session: smartCube,
  actions: {
    connect: () => { const state = smartCube.getSnapshot(); const attempt = state.link?.status === 'lost' ? smartCube.reconnect({ gesture: true }) : smartCube.connect(); void attempt.catch(error => { globalHeaderStatus.textContent = error?.message || 'Could not connect to the cube.'; }); },
    sync: () => { void smartCube.syncSolved().catch(error => { globalHeaderStatus.textContent = error?.message || 'Could not sync the cube.'; }); },
    recenter: () => document.dispatchEvent(new Event('cubesight-recenter')),
    disconnect: () => { void smartCube.disconnect(); },
    forget: () => clearSavedCubeData(),
    'save-recording': () => { void saveRecording({ context: { route: location.hash }, status: message => { globalHeaderStatus.textContent = message; } }); },
    'report-problem': () => { location.hash = '#/recording'; },
    forgetAvailable: () => { try { return Object.keys(localStorage).some(key => key.startsWith('cubesight-smartcube-mac-name:') || key.startsWith('smartcube-ble-mac:')); } catch { return false; } },
  },
});
document.addEventListener('cubesight-recenter', () => { if (['corner', 'f2l'].includes(activeTool)) cube3D?.recenterGyro?.(); });
globalHeader.querySelector('.header-actions')?.prepend(globalHeaderStatus);
void enableRecordingPersistence();

// Keep the training surface within reach on a phone. Settings remain one tap away.
setupTheme();
function syncLegacyDrillStyle() {
  const style = loadSettings(localStorage).style;
  for (const view of ['#corner-view', '#pll-view', '#f2l-view'].map(selector => document.querySelector(selector))) {
    if (!view) continue;
    view.classList.add('brain', 'legacy-drill-view');
    view.dataset.brainStyle = style;
  }
  const current = document.querySelector('#corner-view:not([hidden]), #pll-view:not([hidden]), #f2l-view:not([hidden])');
  if (current) syncPageTokens(current);
}
syncLegacyDrillStyle();
document.addEventListener('cubesight-theme', syncLegacyDrillStyle);
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
  const filtered = cornerCaseFilter?.requested ? candidates.filter(({item}) => cornerCaseFilter.values.some(value => value === item.target.corner || value === item.family)) : candidates;
  if (!filtered.length) throw new Error('No corners match the requested cases. Choose another case filter.');
  const chosen = chooseDue(learning, filtered);
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
    ? `Case ${current.activeIndex + 1} of 3. Which color <br>completes it?`
    : 'Which color completes <br>this corner?';
  renderSequence();
  const activeRoundIndex = legacyRounds.corner?.getViewModel?.().round?.answers?.length ?? 0;
  cornerTrainerOrbit?.update({ index: state.sprint ? session.attempts : activeRoundIndex, state: 'current', value: `${stats.streak} combo` });
}

function renderAnswers() {
  state.answerChoices = Object.keys(COLORS);
  const displayMap = state.current?.displayColorMap || {};
  document.querySelector('#answers').innerHTML = state.answerChoices.map((logicalKey, index) => {
    const key = displayColorKey(logicalKey, displayMap);
    const color = COLORS[key];
    return `
      <button class="answer-button color-${key}" data-color="${key}" data-logical-color="${logicalKey}" style="--swatch:${color.hex};--swatch-ink:${color.ink}">
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

function showCornerResult(isCorrect, correctColor, skipped) {
  document.querySelector('.corner-result')?.remove();
  const result = document.createElement('div');
  result.className = `corner-result ${isCorrect ? 'is-correct' : 'is-wrong'}`;
  result.setAttribute('aria-hidden', 'true');
  const shownColor = displayColorKey(correctColor, state.current?.displayColorMap);
  result.textContent = isCorrect
    ? `Nice · ${COLORS[shownColor].label.toLowerCase()}`
    : skipped ? `Skipped, it was ${COLORS[shownColor].label.toLowerCase()}.` : `Not quite, it was ${COLORS[shownColor].label.toLowerCase()}.`;
  result.addEventListener('animationend', () => result.remove(), { once: true });
  document.querySelector('#corner-view .cube-stage').append(result);
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
  if (activeTool !== 'corner' || paused || legacyRounds.corner?.complete) return;
  if (cornerStartPromise) {
    const pending = cornerStartPromise;
    cornerStartPromise = null;
    showCornerUnavailable('loading the saved position…');
    void pending.then(position => {
      if (activeTool !== 'corner' || cornerStartHash !== location.hash) return;
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
  review(learning, learningKey, { correct: isCorrect, ms: elapsed });
  saveLearningState();
  if (state.glance && state.mode !== 'recall') {
    const pacingResult = glancePacing.record(isCorrect, state.mode !== 'triple' || state.current.activeIndex === 0);
    state.exposureMs = glancePacing.exposureMs;
    if (pacingResult.changed) syncExposureSelect();
  }

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
  cornerTrainerOrbit?.update({ index: Math.max(0, activeRoundAnswers - 1), state: isCorrect ? 'good' : 'bad', value: fmt.time(elapsed), text: isCorrect ? 'Color recognized.' : `This corner needs ${COLORS[displayColorKey(correctColor, state.current.displayColorMap)].label.toLowerCase()}.` });
  return { isCorrect, correctColor };
}

function answer(color, skipped = false) {
  if (state.locked || activeTool !== 'corner' || paused) return;
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
    return startCase(`Nice · ${fmt.time(elapsed, { unit: true })}`);
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
  state.transitionTimer = setTimeout(() => {
    if (generation !== state.generation || activeTool !== 'corner' || paused) return;
    if (sprintDone) return showSummary();
    if (!moreCorners) return startCase();
    state.current.activeIndex++;
    state.current.feedback = null;
    presentCorner(answeredAt);
  }, 1100);
}

function formatMs(ms) {
  return fmt.time(ms, { unit: true });
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

function updateLearningUI() {
  document.querySelector('.retention-panel').hidden = !keyScope(activeTool);
  if (!keyScope(activeTool)) return;
  const retentionPanel = document.querySelector('.retention-panel');
  // copy-ok: DOM selector for the existing progress disclosure, not display copy
  const progressSummary = document.querySelector(`#${activeTool}-view .trainer-progress-details > summary`);
  if (progressSummary) progressSummary.after(retentionPanel);
  else document.querySelector(`#${activeTool}-view .trainer-shell`)?.after(retentionPanel);
  const items = Object.fromEntries(Object.entries(learning.items).filter(([key]) => key.startsWith(`${activeTool === 'corner' ? 'corner' : 'f2l'}|`)));
  const summary = sessionSummary({ ...learning, items });
  const due = document.querySelector('#review-due');
  const note = document.querySelector('#review-summary');
  if (due) due.textContent = `${summary.due} due`;
  if (note) note.textContent = summary.attempts
    ? `${activeTool === 'corner' ? 'corners' : 'F2L'} · ${Math.round(summary.accuracy * 100)}% accuracy · median recog ${summary.medianMs !== null ? fmt.time(summary.medianMs, { unit: true }) : '—'}`
    : 'No cases due. Do a round to build your queue.';
  if (note && summary.delayedAttempts) note.textContent += ` · 24 h+: ${summary.delayedCorrect} of ${summary.delayedAttempts} correct`;
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

const appToast = createToastSlot();
function showToast(message) { appToast.show({ text: message }); }

let checkingForUpdate = false;
async function checkForUpdate() {
  if (checkingForUpdate) return;
  checkingForUpdate = true;
  try {
    const response = await fetch(`/version.json?check=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const serverRevision = String((await response.json()).revision || '');
    const serverLabel = serverRevision === 'development' ? serverRevision : serverRevision.slice(0, 7);
    if (!serverRevision || serverRevision === BUILD_REVISION) {
      const message = `Build ${BUILD_LABEL} is current.`;
      showToast(`CubeSight build ${BUILD_LABEL} is current`);
      return message;
    }
    const message = `Build ${serverLabel} is available. Updating…`;
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.update();
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    }
    location.reload();
    return message;
  } catch (error) {
    return `Could not check for an update: ${error.message}`;
  } finally {
    checkingForUpdate = false;
  }
}

function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

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
  const { pinnedPairChoices } = await import('./drills/pinned-pairs.js');
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
      if (generation !== f2lState.plannerGeneration || activeTool !== 'f2l' || f2lState.drill !== 'planner') return;
      try {
        const reply = await solveCross({ scramble: search.scramble, face: 'D', kind: 'xcross', maxResults: 8, maxDepth: 10, timeLimitMs: search.timeLimitMs });
        results.push(...(search.prefix ? wideUResults(search, reply.results) : reply.results));
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
    if (generation !== f2lState.plannerGeneration || activeTool !== 'f2l' || f2lState.drill !== 'planner') return;
    const foundChoices = pinned ? await pinnedPlannerChoices(setup) : plannerChoices(setup, results);
    const choices = f2lCaseFilter?.requested ? foundChoices.filter(choice => f2lCaseFilter.values.includes(choice.slot)) : foundChoices;
    if (generation !== f2lState.plannerGeneration || activeTool !== 'f2l' || f2lState.drill !== 'planner') return;
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
  if (!f2lState.scanRunning || f2lState.drill !== 'scan' || activeTool !== 'f2l') return;
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
    matchedPieces: matched,
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
  clearTimeout(trialTimeout);
  clearTimeout(f2lState.nextTimer);
  if (paused || activeTool !== 'f2l' || legacyRounds.f2l?.complete) return;
  if (f2lStartPromise) {
    const pending = f2lStartPromise;
    f2lStartPromise = null;
    f2lState = { ...f2lState, current: null, locked: true, message: 'loading the saved position…' };
    renderF2L();
    void pending.then(position => {
      if (activeTool !== 'f2l' || f2lStartHash !== location.hash) return;
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
        if (activeTool !== 'f2l') return;
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
      if (activeTool !== 'f2l') return;
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
      if (wasmReady) candidate = createF2LCaseFromWasm(JSON.parse(wasmF2LCase(BigInt(seed), COLOR_FACE[bottom])), seed, 'neutral');
      else candidate = createF2LCase(seed, bottom);
      if (f2lState.drill === 'scan' && f2lState.scanPseudo) candidate = createPseudoScanCase(candidate, 1 + seed % 3);
      candidate = filterF2LCase(candidate);
      candidate.targetPairIds.forEach((pairId) => candidates.push({ current: candidate, learningKey: f2lState.scanPseudo && f2lState.drill === 'scan' ? `scan-pseudo:${pairId}` : pairLearningKey(candidate, pairId) }));
      if (candidates.length >= 32) break;
    }
    generated = chooseDue(learning, candidates)?.current;
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
  clearTimeout(trialTimeout);
  const now = performance.now();
  const elapsed = Math.round(now - f2lState.startedAt);
  const findMs = Math.round(f2lState.firstSelectedAt - f2lState.startedAt);
  const matchMs = Math.round(now - f2lState.firstSelectedAt);
  document.querySelector('#f2l-timings').textContent = `find ${formatMs(findMs)} · match ${formatMs(matchMs)}`;
  const pairId = first.pairId || second.pairId;
  if (pairId) review(learning, pairLearningKey(current, pairId), { correct: Boolean(correct), ms: elapsed, responseThresholdMs: 3000 });
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
      if (activeTool !== 'f2l' || f2lState !== answeredCase || paused) return;
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

// Hash routes work on static hosts too, without a server-side SPA rewrite.
// Old hashes and unknown ones are replaced (not pushed) so Back still works.
const isPhone = () => !(matchMedia('(pointer: fine)').matches || innerWidth >= 900);
const cubeConnected = () => {
  const phase = document.documentElement.dataset.cubePhase;
  return Boolean(phase) && phase !== 'disconnected';
};
let routedHash = null;
const snapshotBridge = createSnapshotBridge();
const SNAPSHOT_OWNER = {
  corner: { owner: 'F15', dataOwner: 'F15' },
  f2l: { owner: 'F15', dataOwner: 'F15' },
  brain: { owner: 'F1', dataOwner: 'F1' },
  history: { owner: 'F2', dataOwner: 'F2' },
  drills: { owner: 'F4', dataOwner: 'F4' },
  algs: { owner: 'F4', dataOwner: 'F4' },
  timer: { owner: 'F4', dataOwner: 'F4' },
  oll: { owner: 'F4', dataOwner: 'F4' },
  scout: { owner: 'F4', dataOwner: 'F4' },
  pll: { owner: 'F4', dataOwner: 'F4' },
  lookahead: { owner: 'F4', dataOwner: 'F4' },
  progress: { owner: 'F5', dataOwner: 'F6' },
  demo: { owner: 'F17', dataOwner: 'F17' },
  review: { owner: 'F1', dataOwner: 'F1' },
  recording: { owner: 'F0', dataOwner: 'F0' },
};
const recordingSnapshotHandle = { getViewModel: () => recordingViewModel };
function activeSnapshotHandle(tool) {
  return ({ brain, history: historyPage, drills: drillsHub, algs: algsPage, timer: timerPage,
    progress: progressPage, review: reviewPage, recording: recordingSnapshotHandle, demo: demoPage,
    corner: window.__cubesightLegacyTrainerHandles?.corner, f2l: window.__cubesightLegacyTrainerHandles?.f2l,
    oll: drillPages.oll, lookahead: drillPages.lookahead, scout, pll })[tool] || null;
}
function mountSnapshotPage(tool, handle = activeSnapshotHandle(tool)) {
  const owner = SNAPSHOT_OWNER[tool];
  if (activeTool !== tool || !owner || !handle) return;
  const path = parseHash(location.hash).path;
  snapshotBridge.mount({ ...owner, route: path ? `/${path.replace(/^\/+/, '')}` : '/', handle });
}
function snapshotViewModel() {
  const path = parseHash(location.hash).path;
  const shared = globalHeader.getViewModel({ route: path ? `/${path.replace(/^\/+/, '')}` : '/', recording: activeTool === 'recording' ? recordingSnapshotSource : null });
  return snapshotBridge.getViewModel(shared);
}
function syncRoute(initial = false) {
  const incomingHash = location.hash;
  const { tool, hash } = resolveRoute(incomingHash, { isPhone: isPhone(), cubeConnected: cubeConnected() });
  if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  recordNavigation({ hash: incomingHash, resolvedHash: hash, tool, initial });
  if (tool === 'review' && reviewRouteHash && reviewRouteHash !== hash) {
    reviewPage?.detach(); reviewPage = null; reviewPageLoad = null;
  }
  reviewRouteHash = tool === 'review' ? hash : '';
  setTool(tool, initial || routedHash !== hash);
  routedHash = hash;
  mountSnapshotPage(tool);
  rememberDrill(localStorage, tool, hash);
}

function openHelp() {
  if (activeTool === 'help' || location.hash === '#/help') return;
  if (activeTool !== 'help') {
    helpReturnHash = location.hash || '#/solve';
    if (keyScope(activeTool)) {
      if (!paused) pausePractice('help');
      helpPausedForReturn = paused;
    } else helpPausedForReturn = false;
  }
  if (helpPage) helpPage.setReturn(helpReturnHash, `return to ${PAGE_TITLES[resolveRoute(helpReturnHash).tool] ?? 'solve'}`);
  location.hash = '#/help';
}

function renderRecordingView() {
  recordingSnapshotSource = getRecording();
  recordingViewModel = buildSharedViewModel({ recording: recordingSnapshotSource }).recording;
  const count = document.querySelector('#recording-count');
  const list = document.querySelector('#recording-events');
  if (!count || !list) return;
  count.textContent = `${recordingViewModel.eventCount.toLocaleString()} events · ${(recordingViewModel.durationMs / 1000).toFixed(1)} s recording duration · local buffer`;
  list.replaceChildren(...recordingViewModel.events.map(event => {
    const item = document.createElement('li');
    const kind = document.createElement('strong'); kind.textContent = event.kind;
    const timing = document.createElement('span'); timing.textContent = `+${Math.round(event.elapsedMs)} ms`;
    item.append(kind, timing); return item;
  }));
}

let recordingViewModel = null;
let recordingSnapshotSource = null;
let recordingCube = null;
let recordingCubeGeneration = 0;
let sharedCubeModule = null;
const loadSharedCube = () => sharedCubeModule ??= import('./ui/cube/index.js');
function syncRecordingCube(tool) {
  if (tool !== 'recording') {
    recordingCubeGeneration++;
    recordingCube?.destroy(); recordingCube = null;
    return;
  }
  if (recordingCube) return;
  const generation = ++recordingCubeGeneration;
  void loadSharedCube().then(({ Cube }) => {
    if (generation !== recordingCubeGeneration || activeTool !== 'recording') return;
    const host = document.querySelector('#recording-cube');
    if (!host) return;
    recordingCube = new Cube(host, { mode: 'live', size: 'M', label: 'current smart cube recording preview' });
    recordingCube.bindSession(smartCube);
  }).catch(error => {
    if (generation === recordingCubeGeneration) console.error('Could not load the recording cube preview.', error);
  });
}

function setTool(tool, initial = false) {
  // History owns several nested routes without changing the active tool.
  // Keep its page mounted and let it update the selected solve/replay state.
  if (tool === 'history' && tool === activeTool && !initial) {
    historyPage?.setRoute?.(location.hash);
    return;
  }
  if (!isKnownTool(tool) || (tool === activeTool && !initial && tool !== 'review')) return;
  snapshotBridge.clear();
  if ((tool === 'oll' || tool === 'lookahead') && drillPages[tool] && drillPageHashes[tool] !== location.hash) {
    drillPages[tool].detach();
    delete drillPages[tool];
    delete drillPageLoads[tool];
  }
  if (tool === 'scout' && scoutLoad && scoutRouteHash !== location.hash) {
    scout?.detach?.(); scout?.destroy?.(); scout = null; scoutLoad = null;
  }
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  scout?.setActive(false);
  smart?.setActive(false);
  galleryPage?.setActive(false);
  window.cubesightDesignLab?.setActive(false);
  pll?.setActive(false);
  brain?.setActive(false);
  drillsHub?.setActive(false);
  historyPage?.setActive(false);
  algsPage?.setActive(false);
  demoPage?.setActive(false);
  progressPage?.setActive(false);
  timerPage?.setActive(false);
  reviewPage?.setActive(false);
  Object.values(drillPages).forEach(page => page?.setActive(false));
  if (activeTool === 'review' && tool !== 'review') {
    reviewPage?.detach(); reviewPage = null; reviewPageLoad = null;
  }
  Object.values(legacyRounds).forEach(panel => panel.setActive(false));
  const previousTool = activeTool;
  if (previousTool !== tool || initial) {
    if (previousTool && previousTool !== tool) recordView('unmount', { tool: previousTool });
    recordView('mount', { tool });
  }
  if (tool === 'recording') renderRecordingView();
  if (tool === 'help' && !helpPage) { helpPage = createHelpPage(document.querySelector('#help-view'), { build: BUILD_LABEL, development: import.meta.env.DEV, onCheckUpdate: checkForUpdate }); syncPageTokens(helpPage.element); }
  if (tool === 'help' && helpPage) {
    helpPage.setReturn(helpReturnHash, `return to ${PAGE_TITLES[resolveRoute(helpReturnHash).tool] ?? 'solve'}`);
    helpPage.open();
  }
  activeTool = tool;
  syncLegacyCubes(tool);
  syncRecordingCube(tool);
  mountSnapshotPage(tool);
  if (tool === 'corner' || tool === 'pll' || tool === 'f2l') syncLegacyDrillStyle();
  document.title = `${PAGE_TITLES[tool] ?? tool} · ${APP_NAME}`;
  for (const [id, viewId] of Object.entries(TOOL_VIEWS)) document.querySelector(`#${viewId}`).hidden = id !== tool;
  // Help can temporarily hide a paused drill. Returning to the same drill keeps
  // its explicit-resume prompt; choosing another route clears the pause.
  if (tool === 'help') {
    document.querySelector('#pause-overlay').hidden = true;
  } else if (previousTool === 'help' && helpPausedForReturn && location.hash === helpReturnHash) {
    paused = true;
    document.querySelector('#pause-overlay').hidden = false;
    placePausePrompt();
  } else {
    helpPausedForReturn = false;
    paused = false;
    document.querySelector('#pause-overlay').hidden = true;
  }
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const selected = link.dataset.nav === NAV_FOR_TOOL[tool];
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  clearTimeout(f2lState.nextTimer);
  if (tool !== 'f2l') {
    stopF2LScan();
    f2lState.plannerGeneration += 1;
  }
  cancelCornerTimers();
  if (tool === 'notfound') {
    state.locked = true;
    f2lState.locked = true;
    const page = document.querySelector('#not-found-view');
    page.dataset.brainStyle = loadSettings(globalThis.localStorage).style;
    syncPageTokens(page);
    return;
  }
  legacyRounds[tool]?.setActive(true);
  if (tool === 'help') {
    state.locked = true;
    f2lState.locked = true;
  } else if (tool === 'brain') {
    state.locked = true;
    f2lState.locked = true;
    if (!brainLoad) {
      document.querySelector('#brain-view').textContent = 'loading solve…';
      brainLoad = import('./brain.js').then(async ({ createBrain }) => {
        const labQuery = new URLSearchParams(location.search);
        if (import.meta.env.DEV && labQuery.has('labPreview')) {
          const lab = await import('./dev/lab/fake-cube.js');
          labPreviewCube = await lab.createLabCube();
          window.__CUBESIGHT_LAB_PREVIEW__ = {
            async runResults() {
              await lab.runResultsFixture(document.querySelector('#brain-view'), labPreviewCube, {
                openReview: labQuery.get('state') === 'review-detail',
                getViewModel: () => brain?.getViewModel?.() ?? null,
              });
            },
            getViewModel: () => brain?.getViewModel?.() ?? null,
          };
        }
        const testCube = import.meta.env.DEV && window.__CUBESIGHT_TEST_CUBE_FACTORY__
          ? await window.__CUBESIGHT_TEST_CUBE_FACTORY__()
          : null;
        if (testCube) setReplayConnectDevice(testCube.connectDevice);
        brain = createBrain(document.querySelector('#brain-view'), smartCube);
        await brain.ready;
        if (testCube) window.testBrain = { ...testCube, session: smartCube, handle: brain, root: document.querySelector('#brain-view') };
        brain.setActive(activeTool === 'brain');
        mountSnapshotPage('brain', brain);
        if (labPreviewCube) {
          await smartCube.connect();
          if (labQuery.get('fixture') === 'results') await window.__CUBESIGHT_LAB_PREVIEW__.runResults();
        }
      }).catch((error) => {
        document.querySelector('#brain-view').textContent = MSG.loadFailed('solve');
        brainLoad = null;
      });
    } else brain?.setActive(true);
  } else if (tool === 'drills' || tool === 'algs' || tool === 'progress' || tool === 'history' || tool === 'timer' || tool === 'review' || tool === 'oll' || tool === 'lookahead' || tool === 'demo') {
    state.locked = true;
    f2lState.locked = true;
    mountPage(tool);
  } else if (tool === 'smart') {
    state.locked = true;
    f2lState.locked = true;
    if (!smartLoad) {
      document.querySelector('#smart-view').textContent = 'loading studio…';
      smartLoad = import('./smart-cube-studio.js').then(({ createSmartCubeStudio }) => {
        smart = createSmartCubeStudio(document.querySelector('#smart-view'));
        smart.setActive(activeTool === 'smart');
      }).catch((error) => {
        document.querySelector('#smart-view').textContent = MSG.loadFailed('studio');
        smartLoad = null;
      });
    } else smart?.setActive(true);
  } else if (import.meta.env.DEV && tool === 'gallery') {
    showDevGallery();
  } else if (import.meta.env.DEV && tool === 'lab') {
    showDevLab();
  } else if (tool === 'scout') {
    state.locked = true;
    f2lState.locked = true;
    if (!scoutLoad) {
      const explore = new URLSearchParams(parseHash(location.hash).query).get('mode') === 'explore';
      document.querySelector('#scout-view').textContent = explore ? 'loading cross scout…' : 'loading cross planning…';
      const moduleLoad = explore ? import('./cross-scout.js') : import('./drills/cross-planning.js');
      const routeHash = location.hash;
      scoutRouteHash = routeHash;
      const load = moduleLoad.then(module => {
        if (activeTool !== 'scout' || location.hash !== routeHash) { if (scoutLoad === load) scoutLoad = null; return; }
        scout = explore ? module.createCrossScout(document.querySelector('#scout-view')) : module.createCrossPlanning(document.querySelector('#scout-view'));
        scoutRouteHash = location.hash;
        scout.setActive(activeTool === 'scout');
        mountSnapshotPage('scout', scout);
      }).catch((error) => {
        document.querySelector('#scout-view').textContent = MSG.loadFailed('cross planning');
        if (scoutLoad === load) scoutLoad = null;
      });
      scoutLoad = load;
    } else scout?.setActive(true);
  } else if (tool === 'pll') {
    state.locked = true;
    f2lState.locked = true;
    if (!pllLoad) {
      document.querySelector('#pll-view').textContent = 'loading PLL recognition…';
      pllLoad = import('./pll-trainer.js').then(({ createPLLTrainer }) => {
        pll = createPLLTrainer(document.querySelector('#pll-view'));
        pll.setActive(activeTool === 'pll');
        mountSnapshotPage('pll', pll);
      }).catch((error) => {
        document.querySelector('#pll-view').textContent = MSG.loadFailed('PLL recognition');
        pllLoad = null;
      });
    } else pll?.setActive(true);
  } else if (tool === 'f2l') {
    state.locked = true;
    prepareF2LStart(location.hash);
    newF2LCase();
  } else {
    if (tool === 'corner') prepareCornerStart(location.hash);
    f2lCube3D?.setMode('f2l');
    setMode(state.mode);
  }
  if (tool === 'corner' || tool === 'f2l') {
    legacyRounds[tool] ??= createRoundPanel(document.querySelector(`#${TOOL_VIEWS[tool]}`), {
      orbitHost: document.querySelector(tool === 'corner' ? '#corner-view .cube-stage' : '#f2l-view .cube-stage'),
      drill: tool === 'corner' ? 'corners' : 'f2l',
      getSettings: () => tool === 'corner' ? {mode:state.mode,glance:state.glance,exposureMs:state.exposureMs} : {drill:f2lState.drill,pseudo:f2lState.plannerShiftD},
      onComplete: () => { if(tool==='corner'){state.locked=true;cancelCornerTimers();document.querySelectorAll('.answer-button').forEach(button=>button.disabled=true);} else {f2lState.locked=true;clearTimeout(f2lState.nextTimer);stopF2LScan();f2lState.plannerGeneration++;} },
      onRestart: () => { paused=false;if(tool==='corner')startCase();else newF2LCase(); },
    });
    const trainerOrbit = tool === 'corner' ? cornerTrainerOrbit : f2lTrainerOrbit;
    trainerOrbit.connect(legacyRounds[tool].orbit, () => legacyTrainerViewModel(tool));
    legacyRounds[tool].setActive(true);
  }
  updateLearningUI();
}

// The hub and the placeholders load on demand, like the trainers.
const PLACEHOLDERS = {
  algs: { title: 'algs', blurb: 'cases, algs and the ones you pick.', next: { label: 'drill what you know', href: '#/drills' } },
  progress: { title: 'progress', blurb: 'your solves and drills in one place.', next: { label: 'back to solve', href: '#/solve' } },
};
function showDevGallery() {
  state.locked = true;
  f2lState.locked = true;
  const root = document.querySelector('#gallery-view');
  if (galleryPage) { galleryPage.setActive(true); return; }
  if (galleryLoad) return;
  root.textContent = 'loading gallery…';
  galleryLoad = import('./dev/gallery.js').then(({ mountGalleryPage }) => {
    galleryPage = mountGalleryPage(root);
    galleryPage.setActive(activeTool === 'gallery');
  }).catch(() => { root.textContent = MSG.loadFailed('gallery'); galleryLoad = null; });
}

function showDevLab() {
  state.locked = true;
  f2lState.locked = true;
  const root = document.querySelector('#lab-view');
  if (window.cubesightDesignLab) { window.cubesightDesignLab.setActive(true); return; }
  if (labPage) return;
  root.textContent = 'loading design lab…';
  labPage = import('./dev/lab/index.js').then(({ mountDesignLab }) => {
    if (activeTool !== 'lab') return;
    window.cubesightDesignLab = mountDesignLab(root);
  }).catch(error => { root.textContent = `Design lab failed: ${error.message}`; labPage = null; });
}

function mountPage(tool) {
  const root = document.querySelector(`#${TOOL_VIEWS[tool]}`);
  const failed = (_error) => { root.textContent = MSG.loadFailed('this page'); };
  if (tool === 'drills') {
    if (drillsHub) drillsHub.setActive(true);
    else if (!drillsHubLoad) {
      drillsHubLoad = import('./drills/hub.js').then(({ createDrillsHub }) => {
        drillsHub = createDrillsHub(root);
        mountSnapshotPage('drills', drillsHub);
        drillsHub.setActive(activeTool === 'drills');
      }).catch((error) => { drillsHubLoad = null; failed(error); });
    }
    return;
  }
  if (tool === 'history') {
    if (historyPage) { historyPage.setRoute?.(location.hash); historyPage.setActive(true); return; }
    if (!historyPageLoad) {
      const load = import('./history/index.js').then(({ initHistory }) => {
        const page = initHistory(root);
        page.setRoute?.(location.hash);
        if (activeTool !== 'history') {
          page.detach?.();
          if (historyPageLoad === load) historyPageLoad = null;
          return null;
        }
        historyPage = page;
        mountSnapshotPage('history', historyPage);
        historyPage.setActive(true);
        return historyPage.ready;
      }).catch((error) => {
        if (historyPageLoad === load) historyPageLoad = null;
        failed(error);
      });
      historyPageLoad = load;
    }
    return;
  }
  if (tool === 'timer') {
    if (timerPage) { timerPage.setActive(true); return; }
    if (!timerPageLoad) {
      timerPageLoad = import('./timer/index.js').then(({ createManualTimer }) => {
        timerPage = createManualTimer(root);
        mountSnapshotPage('timer', timerPage);
        syncPageTokens(root);
        timerPage.setActive(activeTool === 'timer');
        return timerPage.ready;
      }).catch((error) => { timerPageLoad = null; failed(error); });
    }
    return;
  }
  if (tool === 'review') {
    if (reviewPage) { reviewPage.setActive(true); return; }
    if (!reviewPageLoad) {
      const routeHash = location.hash;
      const { path, query } = parseHash(location.hash);
      const params = new URLSearchParams(query);
      const segments = path.split('/').filter(Boolean);
      const context = { path, query, params: { at: Number(segments[1]) || null, move: Number(params.get('move')) || 0 }, at: Number(segments[1]) || null, move: Number(params.get('move')) || 0 };
      const load = import('./review/index.js').then(({ createSolveReview }) => {
        const page = createSolveReview(document.querySelector('#review-view'), context);
        if (routeHash !== reviewRouteHash || activeTool !== 'review') {
          page.detach();
          if (reviewPageLoad === load) reviewPageLoad = null;
          if (activeTool === 'review') mountPage('review');
          return null;
        }
        reviewPage = page;
        mountSnapshotPage('review', reviewPage);
        reviewPage.setActive(activeTool === 'review');
        syncPageTokens(document.querySelector('#review-view'));
        return reviewPage.ready;
      }).catch((error) => {
        if (reviewPageLoad === load) reviewPageLoad = null;
        if (routeHash === reviewRouteHash && activeTool === 'review') document.querySelector('#review-view').textContent = MSG.loadFailed('review');
      });
      reviewPageLoad = load;
    }
    return;
  }
  if (tool === 'progress') {
    if (progressPage) { progressPage.setActive(true); return; }
    if (!progressPageLoad) {
      progressPageLoad = import('./progress/index.js').then(({ createProgressPage }) => {
        progressPage = createProgressPage(root);
        mountSnapshotPage('progress', progressPage);
        progressPage.setActive(activeTool === 'progress');
        return progressPage.ready;
      }).catch(error => { progressPageLoad = null; failed(error); });
    }
    return;
  }
  if (tool === 'oll' || tool === 'lookahead') {
    const existing = drillPages[tool];
    if (existing) { existing.setActive(true); return; }
    if (!drillPageLoads[tool]) {
      const load = tool === 'oll' ? import('./drills/oll.js') : import('./drills/lookahead.js');
      drillPageLoads[tool] = load.then(module => {
        const page = module.createDrillPage(root);
        drillPages[tool] = page;
        mountSnapshotPage(tool, page);
        drillPageHashes[tool] = location.hash;
        syncPageTokens(root);
        page.setActive(activeTool === tool);
        return page.ready;
      }).catch(error => { delete drillPageLoads[tool]; failed(error); });
    }
    return;
  }
  if (tool === 'algs') {
    if (algsPage) { algsPage.setActive(true); return; }
    if (!algsPageLoad) {
      const load = import('./algs/page.js').then(({ mountAlgsPage }) => {
        if (activeTool !== 'algs') { if (algsPageLoad === load) algsPageLoad = null; return; }
        algsPage = mountAlgsPage(root);
        mountSnapshotPage('algs', algsPage);
      }).catch(error => { if (algsPageLoad === load) algsPageLoad = null; failed(error); });
      algsPageLoad = load;
    }
    return;
  }
  if (tool === 'demo') {
    if (demoPage) { demoPage.setActive(true); return; }
    if (!demoPageLoad) {
      const load = import('./demo/index.js').then(({ createDemoPage }) => {
        if (activeTool !== 'demo') { if (demoPageLoad === load) demoPageLoad = null; return; }
        demoPage = createDemoPage(root);
        mountSnapshotPage('demo', demoPage);
      }).catch(error => { if (demoPageLoad === load) demoPageLoad = null; failed(error); });
      demoPageLoad = load;
    }
    return;
  }
  const held = progressPage;
  if (held) { held.setActive(true); return; }
  import('./pages/placeholder.js').then(({ createPlaceholderPage }) => {
    createPlaceholderPage(root, PLACEHOLDERS[tool]);
  }).catch(failed);
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
  if (activeTool === 'smart') { smart?.setActive(false); return; }
  if (activeTool === 'brain') { brain?.setActive(false); return; }
  if (activeTool === 'scout') { scout?.setActive(false); return; }
  if (activeTool === 'pll') { pll?.setActive(false); return; }
  if (!keyScope(activeTool)) return;
  if (paused || document.querySelector('#summary-dialog').open) return;
  paused = true;
  cancelCornerTimers();
  state.locked = true;
  clearTimeout(f2lState.nextTimer);
  stopF2LScan();
  f2lState.plannerGeneration += 1;
  f2lState.locked = true;
  document.querySelector('#pause-overlay h2').textContent = 'Taking a break?';
  document.querySelector('#pause-overlay p:not(.eyebrow)').textContent = reason === 'timeout'
    ? '10 s elapsed. This one won’t count. Resume for a fresh case.'
    : MSG.unscored;
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
  if (document.hidden) { pausePractice(); drillPages[activeTool]?.setActive(false); }
  else if (activeTool === 'scout') scout?.setActive(true);
  else if (activeTool === 'smart') smart?.setActive(true);
  else if (activeTool === 'brain') brain?.setActive(true);
  else if (activeTool === 'pll') pll?.setActive(true);
  else if (activeTool === 'oll' || activeTool === 'lookahead') drillPages[activeTool]?.setActive(true);
});
document.querySelector('#summary-dialog').addEventListener('cancel', (event) => {
  event.preventDefault();
  document.querySelector('#summary-dialog').close();
  setSession('practice');
});

document.addEventListener('click', (event) => {
  const toolButton = event.target.closest('[data-nav]');
  if (toolButton) return; // Native links preserve new-tab behavior; hashchange switches trainers.
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
  const answerButton = event.target.closest('[data-color]');
  if (answerButton && activeTool === 'corner') return answer(answerButton.dataset.color);
  const modeButton = event.target.closest('[data-mode]');
  if (modeButton) return setMode(modeButton.dataset.mode);
  const sessionButton = event.target.closest('[data-session]');
  if (sessionButton) return setSession(sessionButton.dataset.session);
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'save-recording') {
    void saveRecording({ context: { route: location.hash }, status: message => { globalHeaderStatus.textContent = message; } });
    return;
  }
  if (action === 'clear-recording') { clearRecording(); renderRecordingView(); return; }
  if (action === 'resume') return resumePractice();
  if (action === 'next-recall' && activeTool === 'corner' && state.mode === 'recall') return startCase();
  if (action === 'skip' && activeTool === 'corner') answer(null, true);
  if (action === 'new-f2l' && (activeTool === 'f2l' || !f2lState.correction)) newF2LCase();
  if (action === 'start-scan' && activeTool === 'f2l') startF2LScan();
  if (action === 'reset-view') cube3D?.resetView();
  if (action === 'check-update') return checkForUpdate();
  if (action === 'clear' && confirm('Clear all drill history?')) {
    stats = initialStats(); learning = loadLearning(null); saveLearningState(); saveStats(); updateStatsUI(); startCase();
  }
  if (action === 'open-help') { openHelp(); return; }
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
  if (activeTool === 'f2l' && f2lState.drill === 'scan') newF2LCase();
});
document.querySelector('#planner-shift-d').addEventListener('change', (event) => {
  f2lState.plannerShiftD = event.target.checked;
  if (activeTool === 'f2l' && f2lState.drill === 'planner') newF2LPlannerCase();
});

document.addEventListener('keydown', (event) => {
  if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('dialog[open]')
      && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target?.isContentEditable)) {
    event.preventDefault(); openHelp(); return;
  }
  if (legacyRounds[activeTool]?.handleKey(event)) return;
  // Keys are scoped per route: only the corner and F2L drills use this handler. Every other page
  // (solve, hub, algs, progress, studio, PLL, Scout) owns its keys or has none.
  const scope = keyScope(activeTool);
  if (!scope) return;
  if (event.repeat || paused || document.querySelector('dialog[open]')) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  if (scope === 'f2l') {
    if (f2lState.drill === 'scan' && !f2lState.scanRunning && (event.key === ' ' || event.key === 'Enter')) return startF2LScan();
    if ((event.key === ' ' || event.key === 'Enter') && f2lState.correction) newF2LCase();
    else if (event.key.toLowerCase() === KEYS.case.s) newF2LCase();
    return;
  }
  if (state.mode === 'recall' && state.locked && !document.querySelector('[data-action="next-recall"]').hidden && [KEYS.global.space, 'enter'].includes(event.key === ' ' ? KEYS.global.space : event.key.toLowerCase())) return startCase();
  const displayChoices = state.answerChoices.map(color => displayColorKey(color, state.current?.displayColorMap));
  const colorKey = displayChoices.find(color => color[0] === event.key.toLowerCase());
  if (colorKey) return answer(colorKey);
  if (/^[1-6]$/.test(event.key)) answer(displayChoices[Number(event.key) - 1]);
  if (event.key.toLowerCase() === KEYS.case.s) answer(null, true);
});

let legacyCubeLoad = null;
function syncLegacyCubes(tool) {
  if (tool !== 'corner' && cube3D) { cube3D.destroy(); cube3D = null; }
  if (tool !== 'f2l' && f2lCube3D) { f2lCube3D.destroy(); f2lCube3D = null; }
  if (legacyCubeLoad?.tool === tool) return;
  legacyCubeLoad?.controller.abort();
  legacyCubeLoad = null;
  if (!['corner', 'f2l'].includes(tool) || (tool === 'corner' ? cube3D : f2lCube3D)) return;
  const controller = new AbortController();
  legacyCubeLoad = { tool, controller };
  const host = document.querySelector(tool === 'corner' ? '#cube' : '#f2l-cube');
  void Promise.resolve().then(async () => {
    // copy-ok: internal cancellation reason used only to stop stale cube mounts
    if (controller.signal.aborted) throw new DOMException('Trainer cube mount was cancelled.', 'AbortError');
    const { Cube } = await loadSharedCube();
    // copy-ok: internal cancellation reason used only to stop stale cube mounts
    if (controller.signal.aborted) throw new DOMException('Trainer cube mount was cancelled.', 'AbortError');
    // The legacy renderer may have installed its accessible SVG fallback before
    // this shared WebGL cube was ready. Keep one visible Cube in the stage.
    host.replaceChildren();
    const view = new Cube(host, { mode: 'case', size: 'L', caseColorSetting: readCaseColorSetting(), caseSeed: `${tool}:initial`, label: tool === 'corner' ? 'corner recognition case' : 'F2L deduction case' });
    view.setViewOffset = (...args) => view.cube.setViewOffset?.(...args);
    view.recenterGyro = (...args) => view.cube.recenterGyro?.(...args);
    return view;
  }).then(view => {
    if (controller.signal.aborted || activeTool !== tool) { view.destroy(); return; }
    if (tool === 'corner') { cube3D = view; if (state.current) renderCurrentCase(); }
    else { f2lCube3D = view; renderF2L(); }
  }).catch(error => {
    if (error.name === 'AbortError') return;
    if (tool === 'corner') console.warn('WebGL cube unavailable; using accessible SVG fallback.', error);
    else if (activeTool === 'f2l') host.textContent = 'F2L drills need WebGL. Enable hardware acceleration or try another browser.';
  }).finally(() => { if (legacyCubeLoad?.controller === controller) legacyCubeLoad = null; });
}
updateStatsUI();
updateSprintUI();
updateLearningUI();
if (import.meta.env.DEV) {
  window.__cubesightSnapshot = Object.freeze({ getViewModel: snapshotViewModel });
  // Dev-only image gallery (#/dev/gallery): registered here so a production build has no trace of it.
  registerDevRoute({ tool: 'gallery', match: path => /^\/dev\/gallery(?:\/.*)?$/.test(path) });
  TOOL_VIEWS.gallery = 'gallery-view';
  const galleryView = document.createElement('div');
  galleryView.id = 'gallery-view';
  galleryView.hidden = true;
  document.querySelector('#smart-view').after(galleryView);
  registerDevRoute({ tool: 'lab', match: path => /^\/dev\/lab(?:\/.*)?$/.test(path) });
  TOOL_VIEWS.lab = 'lab-view';
  const labView = document.createElement('div');
  labView.id = 'lab-view';
  labView.hidden = true;
  document.querySelector('#gallery-view').after(labView);
}
window.addEventListener('hashchange', () => syncRoute());
document.addEventListener('cubesight-theme', () => {
  if (activeTool === 'notfound') syncPageTokens(document.querySelector('#not-found-view'));
});
syncRoute(true);

// The Rust core is compiled with wasm-bindgen and runs alongside the visual trainer.
initWasm().then(() => {
  wasmReady = true;
  document.querySelector('#engine-badge').textContent = 'RUST · WASM';
}).catch(() => {});
