import { CASES, ALG_SETS, getCase, canonicalCasePath } from './seed/cases.js';
import { algDatabase } from './runtime.js';
import { createAlgDrillSession } from './drill/session.js';
import { smartCube } from '../smart-cube-bluetooth.js';
import { Cube } from '../ui/cube/index.js';
import { CASE_COLORS, readCaseColorSetting, writeCaseColorSetting } from '../ui/cube/case-color.js';
import { caseDisplayState } from '../ui/cube/orientation.js';
import { createOrbit } from '../ui/orbit/index.js';
import { createSequencePlayer } from '../moves/sequence-player.js';
import { createSolvedState, sameCubeState, toRenderData } from '../cross-cube.js';
import { caseSetupState, f2lStateIntact, matchesCaseSetup } from './drill/cube.js';
import { createVirtualRepaint } from './drill/repaint.js';
import { loadSettings } from '../brain/settings.js';
import { syncPageTokens } from '../pages/tokens.js';
import { createChip, createSegmented } from '../ui/shared/index.js';
import { fmt } from '../copy/terms.js';
import { algorithmMetrics } from './notation.js';
import { groupMoves } from '../moves/triggers.js';
import { buildAlgOrbitSegments, buildAlgViewModel, parseAlgRouteContext } from './view-model.js';
import { parseDemoPaste, serializeDemo } from '../demo/model.js';
import '../pages/page.css';
import './page.css';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeHttpUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
const LEARNING_KEY = 'cubesight-alg-learning-v1';
function loadLearning(storage) {
  try {
    const value = JSON.parse(storage?.getItem(LEARNING_KEY) ?? 'null');
    if (value?.version === 1 && value.items && typeof value.items === 'object') return value;
  } catch { /* Start with a clean local schedule. */ }
  return { version: 1, trial: 0, recentKeys: [], items: {} };
}

function safeReturnHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#/') || hash.startsWith('#//') || [...hash].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  return hash;
}
function returnLabel(hash) {
  const path = safeReturnHash(hash)?.split(/[?#]/)[0] ?? '';
  if (path === '#/solve' || path.startsWith('#/solve/')) return '‹ back to solve';
  if (path.startsWith('#/history/')) return '‹ back to history';
  if (path.startsWith('#/review/')) return '‹ back to review';
  return '‹ back';
}

function routeSelection(hash = location.hash) {
  const match = String(hash).match(/^#\/algs(?:\/([^/?#]+)(?:\/([^/?#]+)(?:\/([^/?#]+))?)?)?/);
  if (!match) return { set: null, caseData: null };
  const set = decodeURIComponent(match[1] ?? '').toLowerCase() || null;
  const caseData = match[2] ? getCase(`${set}/${decodeURIComponent(match[2])}`) : null;
  return { set, caseData, drill: match[3] === 'drill' };
}

const supportsVirtualRepaint = row => ['oll', 'pll', 'oll2'].includes(row?.set);

function caseCard(row) {
  const count = row.algs.length;
  return `<a class="alg-case-card" href="${canonicalCasePath(row)}"><span class="alg-case-card__orbit" data-case-orbit></span><span class="alg-case-card__id">${esc(row.set.toUpperCase())} ${esc(row.number ?? row.name)}</span><span class="alg-case-card__name" title="${esc(row.name)}">${esc(row.name)}</span><span class="alg-case-card__count">${count} alg${count === 1 ? '' : 's'}</span></a>`;
}

function caseDetail(row, context = {}) {
  const algorithms = row.algs.map((alg, index) => {
    const moveCount = algorithmMetrics(alg.moves).stm;
    const used = context.usedAlg === alg.id;
    return `<article class="alg-entry${used ? ' is-used' : ''}" data-alg-entry="${esc(alg.id)}">
    <div class="alg-entry__top"><strong>${used ? 'used in this solve' : `alg ${index + 1}`}</strong><span>${moveCount} ${moveCount === 1 ? 'move' : 'moves'}</span></div>
    <code>${esc(fmt.moves(alg.moves))}</code>
    <p>${esc(alg.credit)} · ${safeHttpUrl(alg.source?.url) ? `<a href="${esc(safeHttpUrl(alg.source.url))}" target="_blank" rel="noopener noreferrer">source ↗</a>` : 'source link unavailable'}</p>
    <div class="alg-entry__actions"><button class="btn btn--secondary btn--s" type="button" data-pick="${esc(alg.id)}">${used ? 'used alg' : 'choose'}</button><button class="btn btn--text btn--s" type="button" data-drill-alg="${esc(alg.id)}">drill</button><button class="btn btn--text btn--s" type="button" data-demo-alg="${esc(alg.id)}">copy demo link</button></div>
  </article>`;
  }).join('');
  const back = context.from ? `<a class="alg-case-back" data-case-back href="${esc(context.from)}">${returnLabel(context.from)}</a>` : `<a class="alg-case-back" data-case-back href="#/algs/${esc(row.set)}">‹ ${esc(row.set.toUpperCase())} cases</a>`;
  const note = row.set === 'oll' ? 'The first two layers stay solved.' : row.set === 'oll2' ? `${esc(row.stage)} · ${esc(row.goal)}.` : row.set === 'f2l' ? `The cross and 3 solved pairs stay intact. Target: ${esc(row.targetPair)}.` : 'The first two layers stay solved.';
  return `<section class="cs-page brain alg-page" data-brain-style="orbit">
    <section class="alg-detail alg-case-shell">
      <header class="alg-case-head">${back}<div><p class="alg-eyebrow">${esc(row.set.toUpperCase())} case</p><h1>${esc(row.name)}</h1><p>${note}</p></div></header>
      <details class="alg-paste-disclosure"><summary>paste a demo link</summary>${demoPasteMarkup()}</details>
      <div class="alg-case-layout">
        <section class="alg-case-focus" aria-label="Case and playback">
          <div class="alg-case-orbit" data-alg-orbit></div>
          <section class="alg-cube-card"><div class="alg-cube" data-alg-cube aria-label="3D cube case setup"></div><div data-case-sequence></div></section>
          <div class="alg-case-display"><div data-display-mode-controls></div><div data-case-colors-host></div></div>
          <p class="alg-cube-status" data-cube-status></p>
          <p class="alg-cube-setup" data-setup-status hidden></p>
        </section>
        <aside class="alg-case-rail">
          <p class="alg-case-note">${supportsVirtualRepaint(row) ? 'virtual case · setup stays on screen' : 'physical setup · follow the setup moves on the ring'}</p>
          ${context.recognitionMs != null || context.executionMs != null ? `<p class="alg-case-context">this solve${context.recognitionMs != null ? ` · recog ${(context.recognitionMs / 1000).toFixed(2)} s` : ''}${context.executionMs != null ? ` · exec ${(context.executionMs / 1000).toFixed(2)} s` : ''}</p>` : ''}
          <div class="alg-case-selected" data-selected-alg></div>
          <div class="alg-entry-grid">${algorithms}</div>
          <div class="alg-detail__tools"><button class="btn btn--secondary btn--s" type="button" data-action="start-case-drill">drill alg</button><button class="btn btn--text btn--s" type="button" data-action="start-cube-drill" disabled>start smart-cube drill</button><span data-case-usage></span></div>
          <details class="alg-add-own"><summary>add your alg</summary><p>It is checked against this case and rejected if it does not solve it while preserving F2L.</p><label>moves<textarea data-new-alg rows="2" placeholder="R U R′ U′"></textarea></label><button class="btn btn--primary btn--s" type="button" data-action="save-alg">check and save</button><span data-own-alg-status role="status"></span></details>
          <section class="alg-personal-entries" data-personal-algs hidden></section>
        </aside>
      </div>
      <section class="alg-drill" data-drill hidden aria-live="polite"></section>
    </section>
  </section>`;
}

function browser(set = null) {
  const active = ALG_SETS.find(item => item.id === set) ?? ALG_SETS.find(item => item.status === 'ready');
  const query = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const requestedSlot = query.get('slot') ?? 'FR';
  const search = (query.get('q') ?? '').slice(0, 80);
  const slot = ['FR', 'BR', 'BL', 'all'].includes(requestedSlot) ? requestedSlot : 'FR';
  const rows = (active ? CASES.filter(row => row.set === active.id) : CASES).filter(row => active?.id !== 'f2l' || slot === 'all' || row.targetPair === slot);
  const filtered = rows.filter(row => `${row.name} ${row.number ?? ''} ${row.id}`.toLowerCase().includes(search.toLowerCase()));
  const perPage = active?.id === 'pll' ? 24 : 20;
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const page = Math.min(pages, Math.max(1, Number.parseInt(query.get('page'), 10) || 1));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
  const pageHref = number => {
    const params = new URLSearchParams({ page: String(number) });
    if (active?.id === 'f2l') params.set('slot', slot);
    if (search) params.set('q', search);
    return `#/algs/${active.id}?${params}`;
  };
  const pagination = `<nav class="alg-pagination" aria-label="Case pages">${page > 1 ? `<a href="${esc(pageHref(page - 1))}">‹ previous</a>` : '<span></span>'}<span>${filtered.length} cases · ${page} of ${pages}</span>${page < pages ? `<a href="${esc(pageHref(page + 1))}">next ›</a>` : '<span></span>'}</nav>`;
  const slotNav = active?.id === 'f2l' ? `<nav class="alg-set-tabs" aria-label="F2L slot">${[['FR', 'front right'], ['BR', 'back right'], ['BL', 'back left'], ['all', 'all slots']].map(([value, label]) => `<a class="chip ${slot === value ? 'is-active' : ''}" aria-pressed="${slot === value}" href="#/algs/f2l?slot=${value}">${label}</a>`).join('')}</nav>` : '';
  // copy-ok: Algorithms is the library's name, separate from the Drills navigation label.
  const note = set === 'f2l' ? '<details class="alg-browser__scope"><summary>about these cases</summary><p>All 41 standard F2L cases, plus 41 back-right and 41 back-left variants. Each credited insertion is checked with the cross and other three pairs solved.</p></details>' : set === 'oll2' ? '<details class="alg-browser__scope"><summary>about these cases</summary><p>Drill each stage goal separately: edge orientation, corner orientation, corner permutation, then edge permutation.</p></details>' : '';
  return /* copy-ok: Drill is a feature label used by the algorithm case actions. */ `<section class="cs-page brain alg-page" data-brain-style="orbit"><section class="alg-browser"><header class="alg-browser__head"><p class="alg-eyebrow">OFFLINE ALGORITHM LIBRARY</p><h1>Algorithm library</h1><p>Find a case, compare algs, then drill your choice.</p>${note}</header>
    <div class="alg-browser-tools"><form class="alg-search" data-alg-search><label for="alg-search">find a case</label><input id="alg-search" class="field__input" type="search" name="q" value="${esc(search)}" placeholder="case name or number"><button class="btn btn--secondary btn--s" type="submit">find</button></form><details class="alg-paste-disclosure"><summary>paste a demo link</summary>${demoPasteMarkup()}</details></div>
    <nav class="alg-set-tabs" aria-label="Algorithm sets">${ALG_SETS.map(item => item.status === 'ready' ? `<a class="chip ${item.id === active?.id ? 'is-active' : ''}" aria-pressed="${item.id === active?.id}" href="#/algs/${item.id}">${esc(item.name)} <small>${item.count}</small></a>` : `<span class="is-disabled" aria-disabled="true">${esc(item.name)} <small>Coming soon</small></span>`).join('')}</nav>
    ${slotNav}<div class="alg-case-grid">${pageRows.map(caseCard).join('')}</div>${pagination}</section></section>`;
}

function demoPasteMarkup() {
  return '<form class="alg-demo-import" data-alg-demo-form><label for="alg-demo-input">Paste a demo link</label><input id="alg-demo-input" class="field__input" data-alg-demo-input type="text" placeholder="CubeSight, alg.cubing.net, or Twizzle link"><button class="btn btn--secondary" type="submit">open demo</button><span data-alg-demo-status role="status" aria-live="polite"></span></form>';
}

function drillMarkup(row, alg, mode = 'self') {
  const smart = mode !== 'self';
  const repaint = mode === 'repeat';
  const sourceUrl = safeHttpUrl(alg.source?.url);
  const seedIndex = row.algs.findIndex(item => item.id === alg.id);
  const label = seedIndex >= 0 ? `Algorithm ${seedIndex + 1}` : 'Your algorithm';
  // copy-ok: The no-cube label distinguishes the manual timer from smart-cube input.
  return `<div class="alg-drill__top"><div><p class="alg-eyebrow">${smart ? 'smart-cube drill' : 'no-cube drill'}</p><h2>${esc(row.name)} · ${label}</h2></div><button class="btn btn--text btn--s" type="button" data-action="close-drill" aria-label="Close drill">×</button></div>
    <p>${smart ? repaint ? 'Follow the verified sequence in the virtual case. This last-layer case was repainted without resetting the physical cube.' : row.set === 'f2l' ? 'Follow the verified insertion on your cube. Set up the displayed F2L case again before each round.' : 'Follow the verified sequence in the virtual case. After a clean round, the next last-layer case can be repainted without resetting the physical cube.' : 'Remember the selected algorithm, then use Start and Done to record a self-timed round. This mode has no per-turn timing.'}</p>
    <div class="alg-drill__alg"><code>${esc(fmt.moves(alg.moves))}</code>${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(alg.credit)} · needs internet</a>` : '<span>Added on this device.</span>'}</div>
    ${smart ? '<p data-cube-match aria-live="polite">Turn through the algorithm on the cube.</p><div data-cube-metrics></div>' : '<div class="alg-drill__timer" data-timer>Ready</div><div class="alg-drill__actions"><button class="btn btn--primary btn--s" type="button" data-action="drill-start">Start</button><button class="btn btn--secondary btn--s" type="button" data-action="drill-done" disabled>Done</button></div><p data-drill-result></p>'}
    <div class="alg-drill__actions"><button class="btn btn--secondary btn--s" type="button" data-action="drill-next">Next due algorithm</button></div>`;
}

/** Mount the canonical case browser. The injected `subscribeTurns` adapter can
 * feed smart-cube turns later without coupling this feature to a Bluetooth SDK. */
export function mountAlgsPage(root, { database = null, storage = globalThis.localStorage } = {}) {
  if (!root) throw new Error('An algorithm page root is required.');
  const db = database ?? algDatabase;
  const learning = loadLearning(storage);
  let session = null, tick = null, destroyed = false, renderId = 0, active = true, lastRouteKey = null;
  let cubeView = null, sequencePlayer = null, caseOrbit = null, caseGeometryObserver = null, selectedAlgId = null, cubeSnapshot = smartCube.getSnapshot(), cubeUnsubscribe = null, cubeSessionUnsubscribe = null, repaintRound = null, repaintReady = false;
  let displayMode = 'case', displayModeWidget = null, caseColorSetting = readCaseColorSetting(storage);
  const browserOrbits = [];
  let setupState = null, lastCubeMoveSeq = 0;
  const saveLearning = () => { try { storage?.setItem(LEARNING_KEY, JSON.stringify(learning)); } catch { /* Keep the schedule for this tab. */ } };

  function disposeVisuals() {
    browserOrbits.splice(0).forEach(orbit => orbit.destroy());
    sequencePlayer?.destroy(); sequencePlayer = null;
    caseGeometryObserver?.disconnect(); caseGeometryObserver = null;
    caseOrbit?.destroy(); caseOrbit = null;
    cubeView?.destroy(); cubeView = null;
    cubeSessionUnsubscribe?.(); cubeSessionUnsubscribe = null;
  }

  async function render() {
    if (destroyed || !active) return;
    const thisRender = ++renderId;
    const { set, caseData, drill } = routeSelection();
    const routeKey = `${set ?? ''}/${caseData?.id ?? ''}`;
    if (lastRouteKey !== null && lastRouteKey !== routeKey) window.scrollTo(0, 0);
    lastRouteKey = routeKey;
    disposeVisuals();
    const context = parseAlgRouteContext(location.hash);
    root.innerHTML = caseData ? caseDetail(caseData, context) : browser(set);
    const shell = root.querySelector('.alg-page');
    displayModeWidget = null;
    root.querySelectorAll('[data-case-orbit]').forEach(host => browserOrbits.push(createOrbit(host, { size: 'mini', glyphSize: 32, label: 'Case orbit', segments: [{ key: 'case', weight: 1, state: 'future' }] })));
    if (shell) { shell.dataset.brainStyle = loadSettings(storage).style; syncPageTokens(shell); }
    const displayModeHost = root.querySelector('[data-display-mode-controls]');
    if (displayModeHost) {
      displayModeWidget = createSegmented(displayModeHost, {
        label: 'Cube display', value: displayMode,
        options: [{ value: 'case', label: 'case' }, { value: 'your cube', label: 'your cube' }],
        onChange: requestedMode => {
          if (requestedMode === 'your cube' && cubeSnapshot.phase !== 'tracking') {
            setCubeMessage('Connect with the cube chip in the header to mirror your cube.');
            displayModeWidget?.setValue('case');
            return;
          }
          displayMode = requestedMode;
          applyCubeDisplay();
          refreshCubeStatus();
        },
      });
      displayModeWidget.element.querySelectorAll('.seg__o').forEach(button => { button.dataset.displayMode = button.dataset.value; });
    }
    const colorHost = root.querySelector('[data-case-colors-host]');
    if (colorHost) {
      const colorChip = createChip(colorHost, { label: 'case colors', value: caseColorSetting });
      colorChip.dataset.caseColors = '';
    }
    if (caseData) {
      const orbitHost = root.querySelector('[data-alg-orbit]');
      const cubeMount = root.querySelector('[data-alg-cube]');
      const cubeWidth = cubeMount?.getBoundingClientRect().width || 250;
      const orbitWidth = orbitHost?.getBoundingClientRect().width || 340;
      const clearanceForGeometry = () => Math.ceil(((cubeMount?.getBoundingClientRect().width || 250) / Math.max(1, orbitHost?.getBoundingClientRect().width || 340)) * 180 + 14);
      const centerClearance = Math.ceil((cubeWidth / orbitWidth) * 180 + 14);
      if (orbitHost) caseOrbit = createOrbit(orbitHost, { size: 'L', shape: 'open', gap: 78, centerClearance, label: `${caseData.name} algorithm progress`, segments: [] });
      if (!supportsVirtualRepaint(caseData)) repaintReady = false;
      try { setupState = caseSetupState(caseData); }
      catch { setupState = null; }
      try {
        const mount = root.querySelector('[data-alg-cube]');
        if (mount) {
          const created = new Cube(mount, { state: setupState, mode: 'case', size: 'L', label: `${caseData.name} case` });
          if (destroyed || !active || thisRender !== renderId || !root.isConnected) { created.destroy(); return; }
          cubeView = created;
          cubeView.setCaseOrientation(caseColorSetting, { seed: caseData.id });
          cubeView.highlight(caseData.set === 'f2l' ? { slot: caseData.targetPair } : { pieces: setupState.cubies.filter(cubie => cubie.id.includes('U')).map(cubie => cubie.id) });
          if (orbitHost) {
            let priorClearance = centerClearance;
            caseGeometryObserver = new ResizeObserver(() => {
              if (destroyed || thisRender !== renderId || !caseOrbit) return;
              const nextClearance = clearanceForGeometry();
              if (nextClearance === priorClearance) return;
              priorClearance = nextClearance;
              caseOrbit.update({ centerClearance: nextClearance }, { animate: false });
            });
            caseGeometryObserver.observe(orbitHost);
            caseGeometryObserver.observe(cubeMount);
          }
        }
      } catch { const mount = root.querySelector('[data-alg-cube]'); if (mount) mount.textContent = 'Virtual cube view is unavailable in this browser.'; }
      const [pick, usage, storedAlgs] = await Promise.all([db.getPick(caseData.id), db.usageFor(caseData.id), db.listAlgs(caseData.id)]);
      if (destroyed || !active || thisRender !== renderId || !root.isConnected) return;
      const personal = storedAlgs.filter(alg => !caseData.algs.some(seed => seed.id === alg.id));
      const allAlgs = [...caseData.algs, ...personal].filter(alg => alg.verified === true);
      selectedAlgId = allAlgs.find(alg => alg.id === pick?.algId)?.id ?? allAlgs[0]?.id ?? null;
      const selectedAlg = allAlgs.find(alg => alg.id === selectedAlgId) ?? null;
      const playerHost = root.querySelector('[data-case-sequence]');
      if (cubeView && selectedAlg && playerHost) {
        const setupGuide = caseData.set === 'f2l';
        sequencePlayer = createSequencePlayer(playerHost, { cube3d: cubeView,
          startState: setupGuide ? createSolvedState() : setupState,
          moves: setupGuide ? caseData.setup : selectedAlg.moves,
          label: setupGuide ? `${caseData.name} setup` : `${caseData.name} alg`, timelineEnabled: false, onChange: state => {
          playerHost.dataset.caseSequenceIndex = String(state.index);
          caseOrbit?.update({ segments: buildAlgOrbitSegments(state.moves, state.index) });
        } });
      }
      const usageEl = root.querySelector('[data-case-usage]');
      if (usageEl) usageEl.textContent = usage.length ? `${usage.reduce((n, row) => n + row.total, 0)} imported reconstruction${usage.reduce((n, row) => n + row.total, 0) === 1 ? '' : 's'} use this case` : 'No imported reconstructions use this case yet';
      if (selectedAlgId) root.querySelector(`[data-alg-entry="${CSS.escape(selectedAlgId)}"]`)?.classList.add('is-picked');
      const colorsButton = root.querySelector('[data-case-colors]');
      if (colorsButton) colorsButton.textContent = `case colors · ${caseColorSetting}`;
      applyCubeDisplay();
      const personalSection = root.querySelector('[data-personal-algs]');
      if (personalSection && personal.length) {
        personalSection.hidden = false;
        personalSection.innerHTML = `<h2>Your algorithms</h2><div class="alg-entry-grid">${personal.map((alg, index) => `<article class="alg-entry ${pick?.algId === alg.id ? 'is-picked' : ''}" data-alg-entry="${esc(alg.id)}"><div class="alg-entry__top"><strong>Personal ${index + 1}</strong><span>${alg.verified ? 'verified' : 'Failed verification · excluded from matching'}</span></div><code>${esc(fmt.moves(alg.moves))}</code><p>${safeHttpUrl(alg.source?.url) ? `Credit: ${esc(alg.credit ?? alg.source.name)} · <a href="${esc(safeHttpUrl(alg.source.url))}" target="_blank" rel="noopener noreferrer">Source (needs internet)</a>` : 'Added on this device.'}</p><div class="alg-entry__actions"><button class="btn btn--secondary btn--s" type="button" data-pick="${esc(alg.id)}" ${alg.verified ? '' : 'disabled'}>Choose this alg</button><button class="btn btn--text btn--s" type="button" data-drill-alg="${esc(alg.id)}" ${alg.verified ? '' : 'disabled'}>Drill</button><button class="btn btn--text btn--s" type="button" data-demo-alg="${esc(alg.id)}" ${alg.verified ? '' : 'disabled'}>copy demo link</button></div></article>`).join('')}</div>`;
      }
      refreshCubeStatus();
      if (drill) void startDrill(pick?.algId, cubeSnapshot.phase === 'tracking' ? supportsVirtualRepaint(caseData) && repaintReady ? 'repeat' : 'smart' : 'self');
    }
  }

  const startDrill = async (algId, mode = 'self') => {
    const { caseData } = routeSelection();
    if (!caseData) return;
    const requestedAlgId = algId ?? selectedAlgId;
    const storedAlg = requestedAlgId ? await db.getAlg(requestedAlgId) : null;
    const alg = storedAlg?.caseId === caseData.id ? storedAlg : caseData.algs.find(item => item.id === requestedAlgId) ?? caseData.algs[0];
    selectedAlgId = alg.id;
    sequencePlayer?.pause();
    sequencePlayer?.setActive(mode === 'self');
    if (mode === 'self') sequencePlayer?.load({ startState: setupState, moves: alg.moves, index: 0 });
    repaintRound = null;
    if (mode !== 'self' && supportsVirtualRepaint(caseData)) {
      repaintRound = createVirtualRepaint(caseData);
      if (cubeView) cubeView.update(toRenderData(repaintRound.state));
    }
    session = createAlgDrillSession({
      caseData, algs: storedAlg?.caseId === caseData.id && !caseData.algs.some(seed => seed.id === alg.id) ? [...caseData.algs, alg] : caseData.algs, cases: CASES, db, learningData: learning, saveLearning, mode,
      f2lIntact: () => repaintRound ? repaintRound.f2lIntact(cubeSnapshot.state) : f2lStateIntact(cubeSnapshot.state),
      onChange: state => {
        const status = root.querySelector('[data-cube-match]');
        if (status) status.textContent = state.match?.status === 'complete' ? 'Algorithm complete · F2L intact.' : state.match?.status === 'f2l-broken' ? 'F2L changed before the algorithm matched.' : state.match?.status === 'mismatch' ? 'That turn sequence does not match this algorithm.' : state.match?.status === 'prefix' ? `Matched ${state.moves.length} turns · next: ${state.match.nextMoves.join(' / ')}` : 'Turn through the algorithm on the cube.';
      },
    });
    session.start({ algId });
    const panel = root.querySelector('[data-drill]');
    panel.innerHTML = drillMarkup(caseData, alg, mode); panel.hidden = false;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  function refreshCubeStatus() {
    const status = root.querySelector('[data-cube-status]');
    const start = root.querySelector('[data-action="start-cube-drill"]');
    if (!status || !start) return;
    const snapshot = cubeSnapshot;
    const tracking = snapshot.phase === 'tracking';
    const atSetup = tracking && setupState && sameCubeState(snapshot.state, setupState);
    const row = routeSelection().caseData;
    const repaint = supportsVirtualRepaint(row) && repaintReady && tracking && f2lStateIntact(snapshot.state);
    const f2lComplete = row?.set === 'f2l' && session?.state.phase === 'results' && session.state.lastAttempt?.clean;
    status.textContent = !tracking ? (snapshot.detail || 'Connect your smart cube to begin.') : repaint ? 'Virtual repaint ready. The physical cube stays in place for the next last-layer case.' : atSetup ? 'Cube matches this case. Start when ready.' : f2lComplete ? 'F2L round complete. Set up this case again before another round.' : 'Turn your cube until it matches the virtual case setup.';
    start.disabled = !(atSetup || repaint);
  }

  function applyCubeDisplay() {
    if (!cubeView) return;
    if (displayMode === 'your cube') {
      sequencePlayer?.pause();
      sequencePlayer?.setActive(false);
      cubeView.setMode('live');
      if (cubeSnapshot.phase === 'tracking') {
        cubeSessionUnsubscribe?.();
        cubeSessionUnsubscribe = cubeView.bindSession(smartCube);
      } else if (cubeSnapshot.state?.cubies) cubeView.setState(cubeSnapshot.state);
    } else {
      cubeSessionUnsubscribe?.(); cubeSessionUnsubscribe = null;
      cubeView.setMode('case').setState(setupState).setCaseOrientation(caseColorSetting, { seed: routeSelection().caseData?.id });
      sequencePlayer?.setActive(true);
    }
  }

  function watchCube() {
    if (!cubeUnsubscribe) cubeUnsubscribe = smartCube.subscribe(snapshot => {
      const before = cubeSnapshot; cubeSnapshot = snapshot;
      refreshCubeStatus();
      const event = snapshot.moveEvent;
      if (session?.state.phase === 'running' && event && event.seq !== lastCubeMoveSeq && event.seq > lastCubeMoveSeq) {
        lastCubeMoveSeq = event.seq;
        if (repaintRound) { try { repaintRound.turn(event.move); if (cubeView) cubeView.update(toRenderData(repaintRound.state)); } catch {} }
        void session.turn(event.move, performance.now()).then(result => {
          if (result?.metrics) {
            showMetrics(result);
            if (result.attempt.clean && supportsVirtualRepaint(routeSelection().caseData)) repaintReady = true;
            refreshCubeStatus();
          }
          if (snapshot.resync !== before.resync) setCubeMessage('Cube state changed unexpectedly. Recheck the case setup before continuing.');
        });
      }
    });
  }

  function setCubeMessage(text) { const node = root.querySelector('[data-cube-match]'); if (node) node.textContent = text; }

  function showMetrics(result) {
    const node = root.querySelector('[data-cube-metrics]'); if (!node) return;
    const metrics = result.metrics;
    const maximum = Math.max(1, ...metrics.gaps);
    const pauses = new Set(metrics.hotspots.map(item => item.index));
    node.innerHTML = `<div class="alg-metric-stats"><span>time<strong>${metrics.executionMs == null ? '—' : `${(metrics.executionMs / 1000).toFixed(2)} s`}</strong></span><span>TPS<strong>${metrics.tps ?? '—'}</strong></span><span>PB<strong>${result.pbMs == null ? '—' : `${(result.pbMs / 1000).toFixed(2)} s`}</strong></span><span>F2L<strong>${result.attempt.clean ? 'intact' : 'check'}</strong></span></div><div class="alg-turn-bars" aria-label="Turn timing bars">${metrics.gaps.map((ms, index) => `<span class="${pauses.has(index) ? 'is-hotspot' : ''}" style="--bar:${Math.max(6, ms / maximum * 100)}%" title="Turn ${index + 1}: ${ms} ms${pauses.has(index) ? ' · hesitation' : ''}"><i></i></span>`).join('')}</div><p>${result.attempt.clean ? 'Verified sequence and F2L intact.' : 'Sequence did not finish with F2L intact.'}${metrics.hotspots.length ? ` ${metrics.hotspots.length} hesitation${metrics.hotspots.length === 1 ? '' : 's'} highlighted.` : ''}</p>`;
  }

  function stopTimer() { if (tick != null) clearInterval(tick); tick = null; }
  const clickHandler = async event => {
    const demoButton = event.target.closest('[data-demo-alg]');
    if (demoButton) {
      const row = routeSelection().caseData;
      const alg = await db.getAlg(demoButton.dataset.demoAlg) ?? row?.algs.find(item => item.id === demoButton.dataset.demoAlg);
      if (!row || !alg) return;
      const params = new URLSearchParams({ title: `${row.name} · ${alg.id}`, setup: row.setup || '', alg: alg.moves, case: row.id, color: caseColorSetting });
      if (row.set === 'f2l') params.set('highlight', `pair:${row.targetPair}`);
      const href = `#/demo?${params}`;
      try {
        await navigator.clipboard.writeText(`${location.origin}${location.pathname}${location.search}${href}`);
        demoButton.textContent = 'link copied';
      } catch { location.hash = href; }
      return;
    }
    if (event.target.closest('[data-case-colors]')) {
      const index = CASE_COLORS.indexOf(caseColorSetting);
      caseColorSetting = writeCaseColorSetting(CASE_COLORS[(index + 1) % CASE_COLORS.length], storage);
      const button = root.querySelector('[data-case-colors]');
      if (button) button.textContent = `case colors · ${caseColorSetting}`;
      if (displayMode === 'case' && cubeView) cubeView.setCaseOrientation(caseColorSetting, { seed: routeSelection().caseData?.id });
      return;
    }
    const pick = event.target.closest('[data-pick]');
    if (pick) {
      const row = routeSelection().caseData;
      if (row) {
        await db.setPick(row.id, pick.dataset.pick);
        selectedAlgId = pick.dataset.pick;
        root.querySelectorAll('.alg-entry').forEach(el => el.classList.toggle('is-picked', el.dataset.algEntry === selectedAlgId));
        const selected = await db.getAlg(selectedAlgId) ?? row.algs.find(alg => alg.id === selectedAlgId);
        if (selected && (!session || session.state.mode === 'self' || session.state.phase !== 'running')) sequencePlayer?.load({ startState: setupState, moves: selected.moves, index: 0 });
      }
      return;
    }
    const drill = event.target.closest('[data-drill-alg]');
    if (drill) { await startDrill(drill.dataset.drillAlg); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'start-cube-drill') {
      const row = routeSelection().caseData;
      const repaint = supportsVirtualRepaint(row) && repaintReady && f2lStateIntact(cubeSnapshot.state);
      if (row && cubeSnapshot.phase === 'tracking' && setupState && (matchesCaseSetup(cubeSnapshot.state, row) || repaint)) {
        displayMode = 'your cube';
        applyCubeDisplay();
        lastCubeMoveSeq = cubeSnapshot.moveEvent?.seq ?? 0;
        const pick = await db.getPick(row.id);
        await startDrill(pick?.algId, repaint ? 'repeat' : 'smart');
      }
      return;
    }
    if (action === 'start-case-drill') return startDrill();
    if (action === 'save-alg') {
      const row = routeSelection().caseData;
      const status = root.querySelector('[data-own-alg-status]');
      const moves = root.querySelector('[data-new-alg]')?.value?.trim();
      try {
        if (!row) throw new Error('Choose a case first.');
        const saved = await db.addAlg({ id: `u.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`, caseId: row.id, moves });
        await render();
        const currentStatus = root.querySelector('[data-own-alg-status]');
        if (currentStatus) currentStatus.textContent = saved.verified ? 'Verified and saved.' : 'Saved without verification.';
      } catch (error) { if (status) status.textContent = error.message; }
      return;
    }
    if (action === 'close-drill') {
      root.querySelector('[data-drill]').hidden = true; session = null; stopTimer();
      sequencePlayer?.setActive(true);
      const row = routeSelection().caseData;
      const alg = row?.algs.find(item => item.id === selectedAlgId);
      if (alg) sequencePlayer?.load({ startState: setupState, moves: alg.moves, index: 0 });
      if (cubeSnapshot.phase === 'tracking' && cubeView) cubeView.update(toRenderData(cubeSnapshot.state));
      return;
    }
    if (action === 'drill-start') {
      sequencePlayer?.pause();
      session?.start({ startedAt: performance.now() }); const started = performance.now();
      root.querySelector('[data-action="drill-start"]').disabled = true; root.querySelector('[data-action="drill-done"]').disabled = false;
      tick = setInterval(() => { const node = root.querySelector('[data-timer]'); if (node) node.textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`; }, 100);
    }
    if (action === 'drill-done') {
      stopTimer(); const result = await session?.completeSelf(performance.now());
      root.querySelector('[data-action="drill-start"]').disabled = false; root.querySelector('[data-action="drill-done"]').disabled = true;
      root.querySelector('[data-drill-result]').textContent = result ? `Recorded ${result.metrics.executionMs} ms${result.pbMs === result.metrics.executionMs ? ' · PB (all-time)' : ''}.` : '';
      const alg = session?.selectedAlg;
      if (result && alg && sequencePlayer) {
        sequencePlayer.setActive(true);
        sequencePlayer.load({ startState: setupState, moves: alg.moves, index: 0 });
        void sequencePlayer.play();
      }
    }
    if (action === 'drill-next') {
      const picked = session?.chooseNext({ cases: CASES });
      stopTimer();
      if (picked) {
        await db.setPick(picked.caseId, picked.algId);
        const row = getCase(picked.caseId);
        if (!row) return;
        const target = `${canonicalCasePath(row)}/drill`;
        if (routeSelection().caseData?.id === row.id) {
          const current = routeSelection().caseData;
          await startDrill(picked.algId, cubeSnapshot.phase === 'tracking' ? supportsVirtualRepaint(current) && repaintReady ? 'repeat' : 'smart' : 'self');
        }
        else location.hash = target.slice(1);
      }
    }
  };
  const pasteSubmitHandler = event => {
    const searchForm = event.target.closest('[data-alg-search]');
    if (searchForm) {
      event.preventDefault();
      const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
      params.delete('page');
      const value = searchForm.querySelector('[name="q"]').value.trim();
      if (value) params.set('q', value); else params.delete('q');
      location.hash = `#/algs/${routeSelection().set ?? 'pll'}${params.size ? `?${params}` : ''}`;
      return;
    }
    const form = event.target.closest('[data-alg-demo-form]');
    if (!form) return;
    event.preventDefault();
    try { location.hash = serializeDemo(parseDemoPaste(form.querySelector('[data-alg-demo-input]')?.value)); }
    catch (error) { form.querySelector('[data-alg-demo-status]').textContent = error.message; }
  };
  root.addEventListener('click', clickHandler);
  root.addEventListener('submit', pasteSubmitHandler);
  window.addEventListener('hashchange', render);
  watchCube();
  void db.ready().then(render);
  const getViewModel = () => {
    const { set, caseData } = routeSelection();
    const playback = sequencePlayer?.getSnapshot?.() ?? {};
    const context = parseAlgRouteContext(location.hash);
    const display = setupState ? caseDisplayState(setupState, caseColorSetting, caseData?.id ?? '') : null;
    const drill = session?.state;
    return buildAlgViewModel({
      route: location.hash, set, caseId: caseData?.id ?? null,
      displayMode, caseColor: caseColorSetting, topColor: display?.topColor ?? null,
      cubeState: cubeView ? (cubeView.mode === 'case' ? cubeView.displayState : cubeView.state) : null,
      gyro: cubeSnapshot.gyro,
      selectedAlg: selectedAlgId,
      algorithms: caseData?.algs ?? [], context,
      playback: { index: playback.index, moveCount: playback.moves?.length, playing: playback.playing, speed: playback.speed,
        groups: groupMoves(playback.moves ?? []).map(([start, end, label]) => ({ start, end, label })) },
      drill: drill ? { mode: drill.mode, phase: drill.phase, attempt: drill.attempt, moveCount: drill.moves?.length, match: drill.match, executionMs: drill.lastAttempt?.executionMs } : null,
    });
  };
  return {
    getSnapshot: getViewModel,
    getViewModel,
    setActive(isActive) {
      const next = Boolean(isActive);
      if (active === next) return;
      active = next;
      if (active) { cubeSnapshot = smartCube.getSnapshot(); watchCube(); void render(); }
      else {
        ++renderId;
        stopTimer(); session = null; disposeVisuals();
        cubeUnsubscribe?.(); cubeUnsubscribe = null;
      }
    },
    destroy() { destroyed = true; active = false; ++renderId; stopTimer(); cubeUnsubscribe?.(); cubeUnsubscribe = null; disposeVisuals(); root.removeEventListener('click', clickHandler); root.removeEventListener('submit', pasteSubmitHandler); window.removeEventListener('hashchange', render); root.replaceChildren(); },
  };
}

export { routeSelection };
