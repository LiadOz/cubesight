import { CASES, ALG_SETS, getCase, canonicalCasePath } from './seed/cases.js';
import { algDatabase } from './runtime.js';
import { createAlgDrillSession } from './drill/session.js';
import { smartCube } from '../smart-cube-bluetooth.js';
import { createPageCube } from '../pages/cube-view.js';
import { createSequencePlayer } from '../moves/sequence-player.js';
import { sameCubeState, toRenderData } from '../cross-cube.js';
import { caseSetupState, f2lStateIntact, matchesCaseSetup } from './drill/cube.js';
import { createVirtualRepaint } from './drill/repaint.js';
import { loadSettings } from '../brain/settings.js';
import { syncPageTokens } from '../pages/tokens.js';
import { fmt } from '../copy/terms.js';
import { algorithmMetrics } from './notation.js';
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
  return `<a class="alg-case-card" href="${canonicalCasePath(row)}"><span class="alg-case-card__id">${esc(row.set.toUpperCase())} ${esc(row.number ?? row.name)}</span><span class="alg-case-card__name">${esc(row.name)}</span><span class="alg-case-card__count">${count} verified algorithms</span></a>`;
}

function caseDetail(row) {
  const algorithms = row.algs.map((alg, index) => {
    const moveCount = algorithmMetrics(alg.moves).stm;
    return `<article class="alg-entry" data-alg-entry="${esc(alg.id)}">
    <div class="alg-entry__top"><strong>Algorithm ${index + 1}</strong><span>${moveCount} ${moveCount === 1 ? 'move' : 'moves'}</span></div>
    <code>${esc(fmt.moves(alg.moves))}</code>
    <p>Credit: ${esc(alg.credit)} · ${safeHttpUrl(alg.source?.url) ? `<a href="${esc(safeHttpUrl(alg.source.url))}" target="_blank" rel="noopener noreferrer">Source (needs internet)</a>` : 'Source link unavailable'}</p>
    <div class="alg-entry__actions"><button type="button" data-pick="${esc(alg.id)}">Choose this alg</button><button type="button" data-drill-alg="${esc(alg.id)}">Drill</button></div>
  </article>`;
  }).join('');
  return `<section class="cs-page brain alg-page" data-brain-style="orbit">
    <section class="alg-detail">
    <header class="alg-detail__head"><a href="#/algs/${esc(row.set)}">← ${esc(row.set.toUpperCase())} cases</a><p class="alg-eyebrow">${esc(row.set.toUpperCase())} ${esc(row.number ?? row.name)}</p><h1>${esc(row.name)}</h1><p>${row.set === 'oll' ? 'Standard OLL case. The setup below preserves the solved first two layers.' : row.set === 'oll2' ? `${esc(row.stage)} stage. Goal: ${esc(row.goal)}.` : row.set === 'f2l' ? `F2L pair insertion. The cross and three solved pairs are preserved; the ${esc(row.targetPair)} pair needs insertion.` : 'Standard PLL case. The setup below preserves the solved first two layers.'}</p><p class="alg-setup"><span>Case setup</span><code>${esc(fmt.moves(row.setup))}</code></p></header>
    <section class="alg-case-playback" aria-label="Algorithm playback"><h2>Play an alg</h2><p>Choose an alg below, then follow its cue and move chips on the cube.</p></section>
    <section class="alg-cube-card"><div class="alg-cube" data-alg-cube aria-label="3D cube case setup"></div><div data-case-sequence></div><div class="alg-cube-info"><strong>${supportsVirtualRepaint(row) ? 'Virtual repaint' : 'F2L setup'}</strong><p>${supportsVirtualRepaint(row) ? 'Use this setup as a reference. After a clean OLL, PLL, or two-look round, the virtual case can repaint while your physical cube stays in place.' : 'Set up this F2L case on your cube before each round. F2L drills do not use the no-reset virtual repaint flow.'}</p><p data-cube-status>Connect your cube to check the setup and time each turn.</p><div class="alg-cube-actions"><button type="button" data-action="connect-cube">Connect smart cube</button><button type="button" data-action="start-cube-drill" disabled>Start cube drill</button></div></div></section>
    <div class="alg-detail__tools"><button type="button" data-action="start-case-drill">Start no-cube drill</button><span data-case-usage>Imported reconstruction usage loading…</span></div>
    <div class="alg-entry-grid">${algorithms}</div>
    <details class="alg-add-own"><summary>Add your own algorithm</summary><p>It is checked against this case and rejected if it does not solve it while preserving F2L.</p><label>Moves<textarea data-new-alg rows="2" placeholder="R U R′ U′"></textarea></label><button type="button" data-action="save-alg">Check and save</button><span data-own-alg-status role="status"></span></details>
    <section class="alg-personal-entries" data-personal-algs hidden></section>
    <section class="alg-drill" data-drill hidden aria-live="polite"></section>
    </section>
  </section>`;
}

function browser(set = null) {
  const active = ALG_SETS.find(item => item.id === set) ?? ALG_SETS.find(item => item.status === 'ready');
  const requestedSlot = new URLSearchParams(location.hash.split('?')[1] ?? '').get('slot') ?? 'FR';
  const slot = ['FR', 'BR', 'BL', 'all'].includes(requestedSlot) ? requestedSlot : 'FR';
  const rows = (active ? CASES.filter(row => row.set === active.id) : CASES).filter(row => active?.id !== 'f2l' || slot === 'all' || row.targetPair === slot);
  const slotNav = active?.id === 'f2l' ? `<nav class="alg-set-tabs" aria-label="F2L slot">${[['FR', 'front right'], ['BR', 'back right'], ['BL', 'back left'], ['all', 'all slots']].map(([value, label]) => `<a class="${slot === value ? 'is-active' : ''}" href="#/algs/f2l?slot=${value}">${label}</a>`).join('')}</nav>` : '';
  // copy-ok: Algorithms is the library's name, separate from the Drills navigation label.
  const note = set === 'f2l' ? '<p class="alg-browser__scope">All 41 standard F2L cases, plus 41 back-right and 41 back-left variants. Each credited insertion is checked with the cross and other three pairs solved.</p>' : set === 'oll2' ? '<p class="alg-browser__scope">Practice each stage goal separately: edge orientation, corner orientation, corner permutation, then edge permutation.</p>' : '';
  return /* copy-ok: Drill is a feature label used by the algorithm case actions. */ `<section class="cs-page brain alg-page" data-brain-style="orbit"><section class="alg-browser"><header class="alg-browser__head"><p class="alg-eyebrow">OFFLINE ALGORITHM LIBRARY</p><h1>Algorithm library</h1><p>Browse canonical cases, compare credited variants, and practice your picked algorithm. Community source links need an internet connection.</p>${note}</header>
    <nav class="alg-set-tabs" aria-label="Algorithm sets">${ALG_SETS.map(item => item.status === 'ready' ? `<a class="${item.id === active?.id ? 'is-active' : ''}" href="#/algs/${item.id}">${esc(item.name)} <small>${item.count}</small></a>` : `<span class="is-disabled" aria-disabled="true">${esc(item.name)} <small>Coming soon</small></span>`).join('')}</nav>
    ${slotNav}<div class="alg-case-grid">${rows.map(caseCard).join('')}</div></section></section>`;
}

function drillMarkup(row, alg, mode = 'self') {
  const smart = mode !== 'self';
  const repaint = mode === 'repeat';
  const sourceUrl = safeHttpUrl(alg.source?.url);
  const seedIndex = row.algs.findIndex(item => item.id === alg.id);
  const label = seedIndex >= 0 ? `Algorithm ${seedIndex + 1}` : 'Your algorithm';
  // copy-ok: The no-cube label distinguishes the manual timer from smart-cube input.
  return `<div class="alg-drill__top"><div><p class="alg-eyebrow">${smart ? 'smart-cube drill' : 'no-cube drill'}</p><h2>${esc(row.name)} · ${label}</h2></div><button type="button" data-action="close-drill" aria-label="Close drill">×</button></div>
    <p>${smart ? repaint ? 'Follow the verified sequence in the virtual case. This last-layer case was repainted without resetting the physical cube.' : row.set === 'f2l' ? 'Follow the verified insertion on your cube. Set up the displayed F2L case again before each round.' : 'Follow the verified sequence in the virtual case. After a clean round, the next last-layer case can be repainted without resetting the physical cube.' : 'Remember the selected algorithm, then use Start and Done to record a self-timed round. This mode has no per-turn timing.'}</p>
    <div class="alg-drill__alg"><code>${esc(fmt.moves(alg.moves))}</code>${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(alg.credit)} · needs internet</a>` : '<span>Added on this device.</span>'}</div>
    ${smart ? '<p data-cube-match aria-live="polite">Turn through the algorithm on the cube.</p><div data-cube-metrics></div>' : '<div class="alg-drill__timer" data-timer>Ready</div><div class="alg-drill__actions"><button type="button" data-action="drill-start">Start</button><button type="button" data-action="drill-done" disabled>Done</button></div><p data-drill-result></p>'}
    <div class="alg-drill__actions"><button type="button" data-action="drill-next">Next due algorithm</button></div>`;
}

/** Mount the canonical case browser. The injected `subscribeTurns` adapter can
 * feed smart-cube turns later without coupling this feature to a Bluetooth SDK. */
export function mountAlgsPage(root, { database = null, storage = globalThis.localStorage } = {}) {
  if (!root) throw new Error('An algorithm page root is required.');
  const db = database ?? algDatabase;
  const learning = loadLearning(storage);
  let session = null, tick = null, destroyed = false, renderId = 0, active = true, lastRouteKey = null;
  let cubeView = null, sequencePlayer = null, selectedAlgId = null, cubeSnapshot = smartCube.getSnapshot(), cubeUnsubscribe = null, repaintRound = null, repaintReady = false;
  let setupState = null, lastCubeMoveSeq = 0;
  const saveLearning = () => { try { storage?.setItem(LEARNING_KEY, JSON.stringify(learning)); } catch { /* Keep the schedule for this tab. */ } };

  async function render() {
    if (destroyed) return;
    const thisRender = ++renderId;
    const { set, caseData, drill } = routeSelection();
    const routeKey = `${set ?? ''}/${caseData?.id ?? ''}`;
    if (lastRouteKey !== null && lastRouteKey !== routeKey) window.scrollTo(0, 0);
    lastRouteKey = routeKey;
    sequencePlayer?.destroy(); sequencePlayer = null;
    cubeView?.destroy(); cubeView = null;
    root.innerHTML = caseData ? caseDetail(caseData) : browser(set);
    const shell = root.querySelector('.alg-page');
    if (shell) { shell.dataset.brainStyle = loadSettings(storage).style; syncPageTokens(shell); }
    if (caseData) {
      if (!supportsVirtualRepaint(caseData)) repaintReady = false;
      try { setupState = caseSetupState(caseData); }
      catch { setupState = null; }
      try {
        const mount = root.querySelector('[data-alg-cube]');
        if (mount) {
          const created = await createPageCube(mount, { state: setupState, mode: 'corner' });
          if (destroyed || !active || thisRender !== renderId || !root.isConnected) { created.destroy(); return; }
          cubeView = created;
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
        sequencePlayer = createSequencePlayer(playerHost, { cube3d: cubeView, startState: setupState, moves: selectedAlg.moves, label: `${caseData.name} alg`, onChange: state => { playerHost.dataset.caseSequenceIndex = String(state.index); } });
      }
      const usageEl = root.querySelector('[data-case-usage]');
      if (usageEl) usageEl.textContent = usage.length ? `${usage.reduce((n, row) => n + row.total, 0)} imported reconstruction${usage.reduce((n, row) => n + row.total, 0) === 1 ? '' : 's'} use this case` : 'No imported reconstructions use this case yet';
      if (selectedAlgId) root.querySelector(`[data-alg-entry="${CSS.escape(selectedAlgId)}"]`)?.classList.add('is-picked');
      const personalSection = root.querySelector('[data-personal-algs]');
      if (personalSection && personal.length) {
        personalSection.hidden = false;
        personalSection.innerHTML = `<h2>Your algorithms</h2><div class="alg-entry-grid">${personal.map((alg, index) => `<article class="alg-entry ${pick?.algId === alg.id ? 'is-picked' : ''}" data-alg-entry="${esc(alg.id)}"><div class="alg-entry__top"><strong>Personal ${index + 1}</strong><span>${alg.verified ? 'verified' : 'Failed verification · excluded from matching'}</span></div><code>${esc(fmt.moves(alg.moves))}</code><p>${safeHttpUrl(alg.source?.url) ? `Credit: ${esc(alg.credit ?? alg.source.name)} · <a href="${esc(safeHttpUrl(alg.source.url))}" target="_blank" rel="noopener noreferrer">Source (needs internet)</a>` : 'Added on this device.'}</p><div class="alg-entry__actions"><button type="button" data-pick="${esc(alg.id)}" ${alg.verified ? '' : 'disabled'}>Choose this alg</button><button type="button" data-drill-alg="${esc(alg.id)}" ${alg.verified ? '' : 'disabled'}>Drill</button></div></article>`).join('')}</div>`;
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

  async function connectCube() {
    if (cubeSnapshot.phase !== 'tracking') await smartCube.connect({ gesture: true });
    if (!cubeUnsubscribe) cubeUnsubscribe = smartCube.subscribe(snapshot => {
      const before = cubeSnapshot; cubeSnapshot = snapshot;
      if (cubeView) { try { cubeView.update(toRenderData(session?.state.phase === 'running' && repaintRound ? repaintRound.state : snapshot.state)); } catch {} }
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
    if (action === 'connect-cube') {
      try { await connectCube(); }
      catch (error) { const status = root.querySelector('[data-cube-status]'); if (status) status.textContent = error.message; }
      return;
    }
    if (action === 'start-cube-drill') {
      const row = routeSelection().caseData;
      const repaint = supportsVirtualRepaint(row) && repaintReady && f2lStateIntact(cubeSnapshot.state);
      if (row && cubeSnapshot.phase === 'tracking' && setupState && (matchesCaseSetup(cubeSnapshot.state, row) || repaint)) {
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
  root.addEventListener('click', clickHandler);
  window.addEventListener('hashchange', render);
  void db.ready().then(render);
  return {
    setActive(isActive) {
      active = Boolean(isActive);
      if (active) { cubeSnapshot = smartCube.getSnapshot(); void render(); }
      else { stopTimer(); sequencePlayer?.setActive(false); session = null; cubeUnsubscribe?.(); cubeUnsubscribe = null; }
    },
    destroy() { destroyed = true; stopTimer(); cubeUnsubscribe?.(); sequencePlayer?.destroy(); cubeView?.destroy(); root.removeEventListener('click', clickHandler); window.removeEventListener('hashchange', render); root.replaceChildren(); },
  };
}

export { routeSelection };
