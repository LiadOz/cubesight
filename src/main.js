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
import { APP_NAME, NAV_FOR_TOOL, PAGE_TITLES } from './copy/nav.js';
import { T, MSG } from './copy/terms.js';
import { isKnownTool, resolveRoute, keyScope, parseHash, registerDevRoute } from './routes.js';
import { rememberDrill, drillByTool } from './drills/catalog.js';
import { createWakeLock } from './wake-lock.js';
import './drills/round-panel.css';
import { syncPageTokens } from './pages/tokens.js';
import { loadSettings } from './brain/settings.js';
import './trainers/trainer-orbit.css';
import './recognition-profile.css';
import { host, legacyRounds } from './drills/trainer-host.js';
const BUILD_REVISION = __CUBESIGHT_REVISION__;
const BUILD_LABEL = BUILD_REVISION === 'development' ? BUILD_REVISION : BUILD_REVISION.slice(0, 7);

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
// tool id -> the element that shows it (routes live in src/routes.js).
const TOOL_VIEWS = { corner: 'corner-view', f2l: 'f2l-view', pll: 'pll-view', scout: 'scout-view', oll: 'oll-view', lookahead: 'lookahead-view', brain: 'brain-view', smart: 'smart-view', drills: 'drills-view', algs: 'algs-view', progress: 'progress-view', history: 'history-view', timer: 'timer-view', recording: 'recording-view', help: 'help-view', demo: 'demo-view', notfound: 'not-found-view' };
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
// One screen wake lock for every drill route (corners, F2L, PLL, scout, OLL, look-ahead). The hub
// is a menu, so it is not in the catalog and does not hold it.
const drillWake = createWakeLock();
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
let helpLoad = null;
let helpReturnHash = '#/solve';
let helpPausedForReturn = false;
let galleryLoad = null;
let brain = null;
let brainLoad = null;
let labPreviewCube = null;
let pll = null;
let pllLoad = null;

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
    <section class="retention-panel" aria-label="drill progress" hidden><div><span>due</span><strong id="review-due">0 cases</strong></div><p id="review-summary">No cases due. Do a round to build your queue.</p><small>Misses and slow recog return sooner. Accuracy and delayed recall are separate.</small></section>
  </main>


  <div id="pause-overlay" class="pause-overlay" hidden role="region" aria-label="paused" aria-live="polite"><div><p class="pause-label">paused</p><h2>Taking a break?</h2><p class="pause-note">This one won't count.</p><button class="btn btn--primary" type="button" data-action="resume">resume</button></div></div>
  <dialog id="summary-dialog" class="summary-dialog">
    <button class="dialog-close" data-action="close-summary" aria-label="Close">×</button>
    <p class="eyebrow">round done</p>
    <h2>Clean round.</h2>
    <div class="summary-metrics" id="summary-metrics"></div>
    <button class="primary-button" data-action="restart-sprint">one more round</button>
    <button class="text-button" data-action="practice-mode">endless</button>
  </dialog>

`;

const globalHeaderStatus = document.createElement('span');
globalHeaderStatus.className = 'ui-header-status';
globalHeaderStatus.setAttribute('role', 'status');

// The header status line is hidden below 700px (shared.css), so a cube that
// refuses to connect used to fail with no visible reason at all on a phone.
// Report through the approved toast as well, which is where an error belongs
// and which stays on screen until it is dismissed.
function reportCubeProblem(message) {
  globalHeaderStatus.textContent = message;
  appToast?.show({ text: message, tone: 'error' });
}
// The session catches its own connection errors (connect() never rejects), so the
// failure arrives on the snapshot. Show each new one once, where a phone can see it.
let lastShownFailure = smartCube.getSnapshot().failure?.seq ?? 0;
smartCube.subscribe(snapshot => {
  const failure = snapshot.failure;
  if (!failure || failure.seq <= lastShownFailure) return;
  lastShownFailure = failure.seq;
  globalHeaderStatus.textContent = failure.message;
  appToast?.show({ text: failure.message, tone: failure.tone === 'neutral' ? undefined : 'error' });
});
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
    connect: () => { const state = smartCube.getSnapshot(); const attempt = state.link?.status === 'lost' ? smartCube.reconnect({ gesture: true }) : smartCube.connect(); void attempt.catch(error => reportCubeProblem(error?.message || 'Could not connect to the cube.')); },
    sync: () => { void smartCube.syncSolved().catch(error => reportCubeProblem(error?.message || 'Could not sync the cube.')); },
    recenter: () => document.dispatchEvent(new Event('cubesight-recenter')),
    disconnect: () => { void smartCube.disconnect(); },
    forget: () => clearSavedCubeData(),
    'save-recording': () => { void saveRecording({ context: { route: location.hash }, status: message => { globalHeaderStatus.textContent = message; } }); },
    'report-problem': () => { location.hash = '#/recording'; },
    forgetAvailable: () => { try { return Object.keys(localStorage).some(key => key.startsWith('cubesight-smartcube-mac-name:') || key.startsWith('smartcube-ble-mac:')); } catch { return false; } },
  },
});
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

if (window.matchMedia('(max-width: 700px)').matches) {
  document.querySelectorAll('.training-settings').forEach((settings) => { settings.open = false; });
}


const appToast = createToastSlot();
host.toast = appToast;
function showToast(message) { appToast.show({ text: message }); }

// The recording tools (and the cubing.js they pull in) load when someone saves a recording, not at boot.
const saveRecording = async options => (await import('./brain-recording.js')).saveRecording(options);

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

// The corner and F2L drills live in their own modules (src/drills/corners.js, f2l.js) and load the first time
// their route opens. The page markup stays here, so the views exist before the code does. Each module hands
// back one object (enter, leave, pause, handleKey, getViewModel...); until it loads, the drill is not running.
const trainers = { corner: null, f2l: null };
const trainerLoads = { corner: null, f2l: null };
const loadTrainer = tool => trainerLoads[tool] ??= (tool === 'corner'
  ? import('./drills/corners.js').then(module => module.corner)
  : import('./drills/f2l.js').then(async module => { await module.f2l.ready; return module.f2l; }))
  .then(trainer => (trainers[tool] = trainer), error => { trainerLoads[tool] = null; throw error; });
let trainerOpenToken = 0;
function openTrainer(tool) {
  const token = ++trainerOpenToken;
  const open = trainer => {
    if (token !== trainerOpenToken || host.activeTool !== tool) return;
    trainer.enter(location.hash);
    mountSnapshotPage(tool);
    replayEarlyInput(tool);
  };
  if (trainers[tool]) open(trainers[tool]);
  else loadTrainer(tool).then(open).catch(() => { if (token === trainerOpenToken) host.toast.show({ text: MSG.loadFailed(tool === 'corner' ? 'corner drill' : 'F2L drill'), tone: 'error' }); });
}
// The drill's controls are on the page before its code is, so a tap can land first. Keep those taps and
// changes, and replay them once the drill is up, so none is lost.
const EARLY_CONTROLS = '[data-color], [data-mode], [data-session], [data-action], [data-f2l-drill], [data-planner-choice]';
const earlyInput = [];
function queueEarlyInput(event) {
  const tool = host.activeTool;
  if (!(tool in trainers) || trainers[tool] || !document.querySelector(`#${TOOL_VIEWS[tool]}`)?.contains(event.target)) return;
  const target = event.type === 'click' ? event.target.closest(EARLY_CONTROLS) : event.target;
  if (target) earlyInput.push({ tool, type: event.type, target });
}
document.addEventListener('click', queueEarlyInput);
document.addEventListener('change', queueEarlyInput);
function replayEarlyInput(tool) {
  for (const item of earlyInput.splice(0)) {
    if (item.tool !== tool || !item.target.isConnected) continue;
    if (item.type === 'click') item.target.click();
    else item.target.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
// Tests and the snapshot bridge read these before the drill has loaded: an idle drill answers until it does.
const idleTrainerModel = drill => ({ screen: 'trainer', drill, phase: 'idle', currentCase: null, answers: [], round: null, cube: null, feedback: '', settings: {} });
window.__cubesightLegacyTrainerHandles = {
  corner: { getViewModel: () => trainers.corner?.getViewModel() ?? idleTrainerModel('corner') },
  f2l: { getViewModel: () => trainers.f2l?.getViewModel() ?? idleTrainerModel('f2l') },
};
// Test-only: the pairs of the current F2L case, and the cube's own click handler, so a spec can pick a true pair
// without rotating the cube to reach the back pieces.
if (import.meta.env.DEV) window.__cubesightF2LCase = () => trainers.f2l?.testCase() ?? { targets: [], pieces: {}, matched: [] };
if (import.meta.env.DEV) window.__cubesightF2LCase.pick = piece => trainers.f2l?.testPick(piece);

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
  recording: { owner: 'F0', dataOwner: 'F0' },
};
const recordingSnapshotHandle = { getViewModel: () => recordingViewModel };
function activeSnapshotHandle(tool) {
  return ({ brain, history: historyPage, drills: drillsHub, algs: algsPage, timer: timerPage,
    progress: progressPage, recording: recordingSnapshotHandle, demo: demoPage,
    corner: window.__cubesightLegacyTrainerHandles?.corner, f2l: window.__cubesightLegacyTrainerHandles?.f2l,
    oll: drillPages.oll, lookahead: drillPages.lookahead, scout, pll })[tool] || null;
}
function mountSnapshotPage(tool, handle = activeSnapshotHandle(tool)) {
  const owner = SNAPSHOT_OWNER[tool];
  if (host.activeTool !== tool || !owner || !handle) return;
  const path = parseHash(location.hash).path;
  snapshotBridge.mount({ ...owner, route: path ? `/${path.replace(/^\/+/, '')}` : '/', handle });
}
function snapshotViewModel() {
  const path = parseHash(location.hash).path;
  const shared = globalHeader.getViewModel({ route: path ? `/${path.replace(/^\/+/, '')}` : '/', recording: host.activeTool === 'recording' ? recordingSnapshotSource : null });
  return snapshotBridge.getViewModel(shared);
}
function syncRoute(initial = false) {
  const incomingHash = location.hash;
  const { tool, hash } = resolveRoute(incomingHash, { isPhone: isPhone(), cubeConnected: cubeConnected() });
  if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  recordNavigation({ hash: incomingHash, resolvedHash: hash, tool, initial });
  setTool(tool, initial || routedHash !== hash);
  routedHash = hash;
  mountSnapshotPage(tool);
  rememberDrill(localStorage, tool, hash);
}

// The help page loads the first time it is opened; later visits reuse it.
function showHelp() {
  const open = () => {
    helpPage.setReturn(helpReturnHash, `return to ${PAGE_TITLES[resolveRoute(helpReturnHash).tool] ?? 'solve'}`);
    helpPage.open();
  };
  if (helpPage) { open(); return; }
  helpLoad ??= import('./help/index.js').then(({ createHelpPage }) => {
    helpPage = createHelpPage(document.querySelector('#help-view'), { build: BUILD_LABEL, development: import.meta.env.DEV, onCheckUpdate: checkForUpdate });
    syncPageTokens(helpPage.element);
  }).catch(() => { helpLoad = null; document.querySelector('#help-view').textContent = MSG.loadFailed('help'); });
  void helpLoad.then(() => { if (helpPage && host.activeTool === 'help') open(); });
}

function openHelp() {
  if (host.activeTool === 'help' || location.hash === '#/help') return;
  if (host.activeTool !== 'help') {
    helpReturnHash = location.hash || '#/solve';
    if (keyScope(host.activeTool)) {
      if (!host.paused) pausePractice('help');
      helpPausedForReturn = host.paused;
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
    if (generation !== recordingCubeGeneration || host.activeTool !== 'recording') return;
    const mount = document.querySelector('#recording-cube');
    if (!mount) return;
    recordingCube = new Cube(mount, { mode: 'live', size: 'M', label: 'current smart cube recording preview' });
    recordingCube.bindSession(smartCube);
  }).catch(error => {
    if (generation === recordingCubeGeneration) console.error('Could not load the recording cube preview.', error);
  });
}

const lockTrainers = () => { trainers.corner?.lock(); trainers.f2l?.lock(); };

function setTool(tool, initial = false) {
  // History owns several nested routes without changing the active tool.
  // Keep its page mounted and let it update the selected solve/replay state.
  if (tool === 'history' && tool === host.activeTool && !initial) {
    historyPage?.setRoute?.(location.hash);
    return;
  }
  if (!isKnownTool(tool) || (tool === host.activeTool && !initial)) return;
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
  Object.values(drillPages).forEach(page => page?.setActive(false));
  Object.values(legacyRounds).forEach(panel => panel.setActive(false));
  if (drillByTool(tool)) drillWake.hold(); else drillWake.release();
  const previousTool = host.activeTool;
  if (previousTool !== tool || initial) {
    if (previousTool && previousTool !== tool) recordView('unmount', { tool: previousTool });
    recordView('mount', { tool });
  }
  if (tool === 'recording') renderRecordingView();
  if (tool === 'help') showHelp();
  host.activeTool = tool;
  trainers.corner?.syncCube(tool);
  trainers.f2l?.syncCube(tool);
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
    host.paused = true;
    document.querySelector('#pause-overlay').hidden = false;
    placePausePrompt();
  } else {
    helpPausedForReturn = false;
    host.paused = false;
    document.querySelector('#pause-overlay').hidden = true;
  }
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const selected = link.dataset.nav === NAV_FOR_TOOL[tool];
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  trainers.f2l?.leave(tool);
  trainers.corner?.cancelTimers();
  if (tool === 'notfound') {
    lockTrainers();
    const page = document.querySelector('#not-found-view');
    page.dataset.brainStyle = loadSettings(globalThis.localStorage).style;
    syncPageTokens(page);
    return;
  }
  legacyRounds[tool]?.setActive(true);
  if (tool === 'help') {
    lockTrainers();
  } else if (tool === 'brain') {
    lockTrainers();
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
        brain.setActive(host.activeTool === 'brain');
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
  } else if (tool === 'drills' || tool === 'algs' || tool === 'progress' || tool === 'history' || tool === 'timer' || tool === 'oll' || tool === 'lookahead' || tool === 'demo') {
    lockTrainers();
    mountPage(tool);
  } else if (tool === 'smart') {
    lockTrainers();
    if (!smartLoad) {
      document.querySelector('#smart-view').textContent = 'loading studio…';
      smartLoad = import('./smart-cube-studio.js').then(({ createSmartCubeStudio }) => {
        smart = createSmartCubeStudio(document.querySelector('#smart-view'));
        smart.setActive(host.activeTool === 'smart');
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
    lockTrainers();
    if (!scoutLoad) {
      const explore = new URLSearchParams(parseHash(location.hash).query).get('mode') === 'explore';
      document.querySelector('#scout-view').textContent = explore ? 'loading cross scout…' : 'loading cross planning…';
      const moduleLoad = explore ? import('./cross-scout.js') : import('./drills/cross-planning.js');
      const routeHash = location.hash;
      scoutRouteHash = routeHash;
      const load = moduleLoad.then(module => {
        if (host.activeTool !== 'scout' || location.hash !== routeHash) { if (scoutLoad === load) scoutLoad = null; return; }
        scout = explore ? module.createCrossScout(document.querySelector('#scout-view')) : module.createCrossPlanning(document.querySelector('#scout-view'));
        scoutRouteHash = location.hash;
        scout.setActive(host.activeTool === 'scout');
        mountSnapshotPage('scout', scout);
      }).catch((error) => {
        document.querySelector('#scout-view').textContent = MSG.loadFailed('cross planning');
        if (scoutLoad === load) scoutLoad = null;
      });
      scoutLoad = load;
    } else scout?.setActive(true);
  } else if (tool === 'pll') {
    lockTrainers();
    if (!pllLoad) {
      document.querySelector('#pll-view').textContent = 'loading PLL recognition…';
      pllLoad = import('./pll-trainer.js').then(({ createPLLTrainer }) => {
        pll = createPLLTrainer(document.querySelector('#pll-view'));
        pll.setActive(host.activeTool === 'pll');
        mountSnapshotPage('pll', pll);
      }).catch((error) => {
        document.querySelector('#pll-view').textContent = MSG.loadFailed('PLL recognition');
        pllLoad = null;
      });
    } else pll?.setActive(true);
  } else if (tool === 'f2l') {
    trainers.corner?.lock();
    openTrainer('f2l');
  } else if (tool === 'corner') {
    openTrainer('corner');
  }
  // The retention panel is shared by the two drills; whichever opens shows it, every other route hides it.
  document.querySelector('.retention-panel').hidden = true;
}

// The hub and the placeholders load on demand, like the trainers.
const PLACEHOLDERS = {
  algs: { title: 'algs', blurb: 'cases, algs and the ones you pick.', next: { label: 'drill what you know', href: '#/drills' } },
  progress: { title: 'progress', blurb: 'your solves and drills in one place.', next: { label: 'back to solve', href: '#/solve' } },
};
function showDevGallery() {
  lockTrainers();
  const root = document.querySelector('#gallery-view');
  if (galleryPage) { galleryPage.setActive(true); return; }
  if (galleryLoad) return;
  root.textContent = 'loading gallery…';
  galleryLoad = import('./dev/gallery.js').then(({ mountGalleryPage }) => {
    galleryPage = mountGalleryPage(root);
    galleryPage.setActive(host.activeTool === 'gallery');
  }).catch(() => { root.textContent = MSG.loadFailed('gallery'); galleryLoad = null; });
}

function showDevLab() {
  lockTrainers();
  const root = document.querySelector('#lab-view');
  if (window.cubesightDesignLab) { window.cubesightDesignLab.setActive(true); return; }
  if (labPage) return;
  root.textContent = 'loading design lab…';
  labPage = import('./dev/lab/index.js').then(({ mountDesignLab }) => {
    if (host.activeTool !== 'lab') return;
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
        drillsHub.setActive(host.activeTool === 'drills');
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
        if (host.activeTool !== 'history') {
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
        timerPage.setActive(host.activeTool === 'timer');
        return timerPage.ready;
      }).catch((error) => { timerPageLoad = null; failed(error); });
    }
    return;
  }
  if (tool === 'progress') {
    if (progressPage) { progressPage.setActive(true); return; }
    if (!progressPageLoad) {
      progressPageLoad = import('./progress/index.js').then(({ createProgressPage }) => {
        progressPage = createProgressPage(root);
        mountSnapshotPage('progress', progressPage);
        progressPage.setActive(host.activeTool === 'progress');
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
        page.setActive(host.activeTool === tool);
        return page.ready;
      }).catch(error => { delete drillPageLoads[tool]; failed(error); });
    }
    return;
  }
  if (tool === 'algs') {
    if (algsPage) { algsPage.setActive(true); return; }
    if (!algsPageLoad) {
      const load = import('./algs/page.js').then(({ mountAlgsPage }) => {
        if (host.activeTool !== 'algs') { if (algsPageLoad === load) algsPageLoad = null; return; }
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
        if (host.activeTool !== 'demo') { if (demoPageLoad === load) demoPageLoad = null; return; }
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


function placePausePrompt() {
  document.querySelector(`#${host.activeTool}-view .cube-stage`).append(document.querySelector('#pause-overlay'));
}

function pausePractice(reason = 'interrupted') {
  if (host.activeTool === 'smart') { smart?.setActive(false); return; }
  if (host.activeTool === 'brain') { brain?.setActive(false); return; }
  if (host.activeTool === 'scout') { scout?.setActive(false); return; }
  if (host.activeTool === 'pll') { pll?.setActive(false); return; }
  if (!keyScope(host.activeTool)) return;
  if (host.paused || document.querySelector('#summary-dialog').open) return;
  host.paused = true;
  trainers.corner?.pause();
  trainers.f2l?.pause();
  document.querySelector('#pause-overlay .pause-note').textContent = reason === 'timeout'
    ? 'No answer in 10 s. This one won\'t count.'
    : MSG.unscored.replace('Taking a break? ', '');
  placePausePrompt();
  document.querySelector('#pause-overlay').hidden = false;
}

function resumePractice() {
  host.paused = false;
  document.querySelector('#pause-overlay').hidden = true;
  if (host.activeTool === 'corner') trainers.corner?.resume();
  else trainers.f2l?.resume();
}
host.pause = pausePractice;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pausePractice(); drillPages[host.activeTool]?.setActive(false); }
  else if (host.activeTool === 'scout') scout?.setActive(true);
  else if (host.activeTool === 'smart') smart?.setActive(true);
  else if (host.activeTool === 'brain') brain?.setActive(true);
  else if (host.activeTool === 'pll') pll?.setActive(true);
  else if (host.activeTool === 'oll' || host.activeTool === 'lookahead') drillPages[host.activeTool]?.setActive(true);
});

// The drills own the clicks and keys that only they use (src/drills/corners.js, f2l.js); these are the shared ones.
document.addEventListener('click', (event) => {
  const toolButton = event.target.closest('[data-nav]');
  if (toolButton) return; // Native links preserve new-tab behavior; hashchange switches trainers.
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'save-recording') {
    void saveRecording({ context: { route: location.hash }, status: message => { globalHeaderStatus.textContent = message; } });
    return;
  }
  if (action === 'clear-recording') { clearRecording(); renderRecordingView(); return; }
  if (action === 'resume') return resumePractice();
  if (action === 'check-update') return checkForUpdate();
  if (action === 'open-help') { openHelp(); return; }
});

document.addEventListener('keydown', (event) => {
  if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('dialog[open]')
      && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target?.isContentEditable)) {
    event.preventDefault(); openHelp(); return;
  }
  if (legacyRounds[host.activeTool]?.handleKey(event)) return;
  // Keys are scoped per route: only the corner and F2L drills use this handler. Every other page
  // (solve, hub, algs, progress, studio, PLL, Scout) owns its keys or has none.
  const scope = keyScope(host.activeTool);
  if (!scope) return;
  if (event.repeat || host.paused || document.querySelector('dialog[open]')) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  trainers[scope]?.handleKey(event);
});

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
  if (host.activeTool === 'notfound') syncPageTokens(document.querySelector('#not-found-view'));
});
syncRoute(true);
