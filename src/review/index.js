import '../brain/css/review-screen.css';
import { createCube3D } from '../cube-3d.js';
import { toRenderData, applyMoves } from '../cross-cube.js';
import { loadSettings } from '../brain/settings.js';
import { readStickerPalette, themedRender } from '../brain/cube-theme.js';
import { syncPageTokens } from '../pages/tokens.js';
import { openHistory } from '../store/history.js';
import { smartCube } from '../smart-cube-bluetooth.js';
import { createSolveLive } from '../solve-live.js';
import { analysisClient } from '../analysis/client.js';
import { buildImportedReconstruction, parseAlgCubingUrl } from './import-parser.js';
import { applyMovesInChunks, gradeRetry, retryPlan, retryRegradeRecord, stateAfter } from './replay.js';
import { graphPath, keyMoments, labelsFor, stageOf, stageScores } from './view-model.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const moveText = move => move.replace(/'/g, '′');
const hasRecordedTimes = record => Array.isArray(record?.moveTimes) && record.moveTimes.length === record.solveMoves?.length && record.moveTimes.length > 0 && record.moveTimes.every(Number.isFinite);
const routeDetails = context => {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  const params = new URLSearchParams(hash.split('?')[1] ?? '');
  const path = context?.path ?? context?.route?.path ?? hash.split('?')[0].replace(/^#/, '');
  const segments = path.split('/').filter(Boolean);
  return { path, at: Number(context?.at ?? context?.params?.at ?? segments[1]) || null, move: Number(context?.move ?? context?.params?.move ?? params.get('move')) || 0, imported: path.includes('/import'), retry: path.includes('/retry') };
};
const setHash = href => { if (typeof location !== 'undefined') location.hash = href.replace(/^#/, ''); };
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };

/** Feature-owned page for a full solve review, retry, or pasted reconstruction import. */
export function createSolveReview(host, routeContext = {}) {
  const route = routeDetails(routeContext);
  const root = el('main', 'brain cs-page solve-review-page');
  root.dataset.brainStyle = loadSettings(globalThis.localStorage).style;
  host.replaceChildren(root);
  syncPageTokens(root);
  let active = true, detached = false, record = routeContext.record ?? null, history = null, cube = null, live = null;
  let lastCubeState = null, graphView = 'auto';
  const cleanups = [];
  let currentMove = Math.max(0, route.move), labels = [], moments = [], scores = [], attemptMoves = [], retryResult = null;
  let inferredVisible = false;
  const showCubeState = state => {
    lastCubeState = state;
    cube?.update(themedRender(toRenderData(state), readStickerPalette(root)));
  };
  const themeChanged = () => {
    root.dataset.brainStyle = loadSettings(globalThis.localStorage).style;
    syncPageTokens(root);
    if (lastCubeState) showCubeState(lastCubeState);
  };
  document.addEventListener('cubesight-theme', themeChanged);
  const ready = (async () => {
    try {
      history = await openHistory();
      if (detached) return;
      if (!record && route.at != null) record = history.records.find(item => item.at === route.at) ?? null;
      if (route.imported) renderImport();
      else if (!record) renderError('This solve is no longer in your local history.');
      else {
        if (!record.analysis) record = { ...record, analysis: await analysisClient().analyze(record) };
        if (detached) return;
        labels = labelsFor(record, { inferred: inferredVisible ? inferLabels(record) : [] });
        moments = keyMoments(record);
        scores = stageScores(record);
        if (route.retry) renderRetry(); else renderReview();
      }
    } catch (error) { renderError(error?.message ?? 'The review could not be opened.'); }
  })();

  function header(title, back = '#/brain') {
    const head = el('header', 'sr-head');
    const backLink = el('a', 'sr-back', '← results'); backLink.href = back;
    head.append(backLink, el('div', 'sr-title-wrap', title));
    root.replaceChildren(head);
    return head;
  }
  function renderError(message) { root.replaceChildren(el('p', 'sr-error', message)); }

  function renderImport() {
    header('Import a reconstruction', '#/solve');
    const form = el('form', 'sr-import');
    form.innerHTML = `<p>Paste a scramble and solution, or import an alg.cubing.net link. Parsing and cube-state checks stay on this device.</p>
      <label>alg.cubing.net link <input name="url" inputmode="url" autocomplete="url" placeholder="https://alg.cubing.net/?setup=…&amp;alg=…"></label>
      <button class="sr-secondary" type="button" data-action="decode">use link fields</button>
      <label>scramble <textarea name="scramble" rows="3" spellcheck="false" placeholder="R U R′ U′"></textarea></label>
      <label>solution <textarea name="solution" rows="5" spellcheck="false" placeholder="U R U′ R′"></textarea></label>
      <p class="sr-error" role="alert" hidden></p><button class="sr-primary" type="submit">check and review</button>`;
    root.append(form);
    const field = name => form.elements.namedItem(name);
    const error = form.querySelector('.sr-error');
    form.addEventListener('click', event => {
      if (event.target.dataset.action !== 'decode') return;
      try { const decoded = parseAlgCubingUrl(field('url').value.trim()); field('scramble').value = decoded.scramble; field('solution').value = decoded.solution; error.hidden = true; }
      catch (cause) { error.hidden = false; error.textContent = cause.message; }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault(); error.hidden = true;
      try {
        const result = buildImportedReconstruction({ scramble: field('scramble').value, solution: field('solution').value });
        const imported = history.append({ ...result.record, solved: result.solves });
        if (!imported) throw new Error('History is read-only, so this reconstruction cannot be saved.');
        if (detached) return;
        setHash(`#/review/${imported.at}`);
        routeContext.onNavigate?.({ path: `/review/${imported.at}`, at: imported.at });
        record = { ...imported, analysis: await analysisClient().analyze(imported) };
        if (detached) return;
        labels = labelsFor(record); moments = keyMoments(record); scores = stageScores(record);
        currentMove = 0; route.retry = false; renderReview();
      } catch (cause) { error.hidden = false; error.textContent = cause.message ?? 'The reconstruction could not be checked.'; }
    });
  }

  function stageAccuracyMarkup() {
    return scores.map(score => `<article class="sr-score" data-stage="${score.key}"><span>${escapeHtml(score.label)}</span><strong>${score.text}</strong><small>${score.skipped ? 'Skipped' : score.flow ? 'Flow' : `${score.loss.toFixed(1)} efficiency points lost`}</small></article>`).join('');
  }

  function drillLinkMarkup(item) {
    if (!item || !['Extra move', 'Detour', 'Better cross'].includes(item.text)) return `<span class="sr-label ${item?.kind ?? ''}" title="${escapeHtml(item?.detail ?? '')}">${escapeHtml(item?.text ?? 'Optimal')}</span>`;
    const scramble = encodeURIComponent(record.scramble.replace(/[′’]/g, "'").replaceAll(' ', '_'));
    const from = `review:${record.at}:${currentMove}`;
    return `<a class="sr-label sr-drill" href="#/drills/scout?scramble=${scramble}&amp;face=${record.analysis?.face ?? 'D'}&amp;kind=cross&amp;from=${encodeURIComponent(from)}" title="${escapeHtml(item.detail)}">${escapeHtml(item.text)} · Cross Scout ›</a>`;
  }

  function renderReview() {
    const back = routeContext.backHref ?? '#/solve';
    header(`Solve review · ${record.moveCount || record.solveMoves.length} moves`, back);
    if (!cube) {
      const layout = el('div', 'sr-layout');
      layout.innerHTML = `<section class="sr-cube-area"><div class="sr-cube" aria-label="3D cube review"></div><div class="sr-step-controls"><button data-step="-1" aria-label="Previous move">←</button><span class="sr-step-count"></span><button data-step="1" aria-label="Next move">→</button><button data-action="retry">Retry this moment</button></div></section>
        <section class="sr-analysis"><p class="sr-scramble"></p><div class="sr-position-note" aria-live="polite"></div><div class="sr-labels"></div>
          ${hasRecordedTimes(record) ? '<label class="sr-graph-mode">Graph axis <select data-graph-view aria-label="Graph axis"><option value="auto">Time</option><option value="moves">Moves</option></select></label>' : ''}
          <svg class="sr-graph" viewBox="0 0 640 180" role="img" aria-label="Moves versus efficiency loss graph"><line x1="8" y1="90" x2="632" y2="90" class="sr-par"></line><path class="sr-graph-line"></path><circle class="sr-cursor" r="6"></circle></svg>
          <div class="sr-scores">${stageAccuracyMarkup()}</div><section class="sr-moments"><h2>Key moments</h2><div class="sr-moment-list"></div></section>
          <label class="sr-toggle"><input type="checkbox" data-toggle="inferred"> show inferred labels</label>
          <div class="sr-continuation"><h2>Best continuation</h2><p class="sr-best"></p><button data-action="play-best">show on cube</button></div></section>
        <section class="sr-moves"><h2>Moves <small>([ and ] key moments · arrow keys step)</small></h2><ol>${record.solveMoves.map((move, i) => `<li><button data-move="${i}" title="Move ${i + 1}">${moveText(move)}</button></li>`).join('')}</ol></section>`;
      root.append(layout);
      try { cube = createCube3D(layout.querySelector('.sr-cube'), { mode: 'scout' }); }
      catch { layout.querySelector('.sr-cube').textContent = '3D cube needs WebGL.'; }
      layout.querySelector('.sr-scramble').textContent = `scramble · ${record.scramble}`;
      layout.querySelector('.sr-moment-list').replaceChildren(...moments.map(moment => {
        const button = el('button', 'sr-moment', `move ${moment.i + 1} · ${moment.label}`); button.dataset.jump = String(moment.i); button.title = moment.detail; return button;
      }));
      layout.querySelector('[data-graph-view]')?.addEventListener('change', event => { graphView = event.target.value; paintReview(layout); });
      layout.addEventListener('click', event => {
        const step = event.target.closest('[data-step]');
        const move = event.target.closest('[data-move]');
        const jump = event.target.closest('[data-jump]');
        if (step) setMove(currentMove + Number(step.dataset.step));
        else if (move) setMove(Number(move.dataset.move) + 1);
        else if (jump) setMove(Number(jump.dataset.jump) + 1);
        else if (event.target.closest('[data-action="retry"]')) setHash(`#/review/${record.at}/retry?move=${currentMove}`);
        else if (event.target.closest('[data-action="play-best"]')) void playBest();
      });
      layout.addEventListener('change', event => {
        if (event.target.dataset.toggle !== 'inferred') return;
        inferredVisible = event.target.checked;
        labels = labelsFor(record, { inferred: inferredVisible ? inferLabels(record) : [] });
        paintReview(layout);
      });
      paintReview(layout);
    } else paintReview(root.querySelector('.sr-layout'));
  }

  function paintReview(layout) {
    if (!layout || detached || !record) return;
    currentMove = Math.max(0, Math.min(record.solveMoves.length, currentMove));
    const state = stateAfter(record, currentMove);
    showCubeState(state);
    const at = Math.max(0, currentMove - 1), current = labels[at] ?? [];
    layout.querySelector('.sr-step-count').textContent = `move ${currentMove} / ${record.solveMoves.length}`;
    layout.querySelector('.sr-position-note').textContent = current.length ? current.map(item => item.detail).join(' · ') : `${stageOf(record, at)} · ${record.moveTimes?.[at] != null ? `${(record.moveTimes[at] / 1000).toFixed(2)} s` : 'time not recorded'}`;
    layout.querySelector('.sr-labels').replaceChildren(...(current.length ? current : [{ text: currentMove ? 'Fine' : 'Start', kind: 'good', detail: 'No verified loss is flagged at this position.' }]).map(item => {
      const wrapper = document.createElement('span'); wrapper.innerHTML = drillLinkMarkup(item); return wrapper.firstElementChild;
    }));
    layout.querySelectorAll('[data-move]').forEach(button => { button.classList.toggle('is-current', Number(button.dataset.move) === at); button.setAttribute('aria-pressed', String(Number(button.dataset.move) === at)); });
    const graph = layout.querySelector('.sr-graph');
    const path = graphPath(record, labels, 640, 180, graphView);
    graph.querySelector('.sr-graph-line').setAttribute('d', path);
    const points = [...path.matchAll(/[ML]([\d.]+),([\d.]+)/g)];
    const point = points[Math.min(currentMove, Math.max(0, points.length - 1))];
    graph.querySelector('.sr-cursor').setAttribute('cx', point?.[1] ?? '8');
    graph.querySelector('.sr-cursor').setAttribute('cy', point?.[2] ?? '90');
    const best = bestContinuation(currentMove);
    layout.querySelector('.sr-best').textContent = best ? moveText(best) : 'No verified continuation is available for this moment.';
    layout.querySelector('[data-action="play-best"]').disabled = !best;
  }

  function bestContinuation(move) {
    const index = Math.max(0, move - 1);
    if (move === 0 && record.analysis?.cross?.best) return record.analysis.cross.best;
    const crossLoss = record.analysis?.cross?.losses?.find(item => item.i === index && item.best);
    if (crossLoss) return crossLoss.best;
    const pair = record.analysis?.pairs?.find(item => item.from === index && item.better?.moves);
    return pair?.better?.moves ?? null;
  }

  async function playBest() {
    if (!cube || !active) return;
    const best = (bestContinuation(currentMove) ?? '').split(' ').filter(Boolean);
    let state = stateAfter(record, currentMove);
    for (const move of best) { if (!active || detached) break; state = applyMoves(state, [move]); await cube.animateMove(move, toRenderData(state), 260); }
  }

  function inferLabels(rec) {
    // Conservative visual hints stay hidden until explicitly requested.
    const locks = rec.analysis?.cancels?.filter(cancel => cancel.waste === 0) ?? [];
    return locks.map(cancel => ({ i: cancel.from, label: 'Possible lockup' }));
  }

  function renderRetry() {
    const plan = retryPlan(record, route.move);
    header(`Retry this moment · move ${plan.from + 1}`, `#/review/${record.at}?move=${plan.from}`);
    const retry = el('section', 'sr-retry');
    retry.innerHTML = `<div class="sr-retry-cube"></div><div><p>Start from the solve position after ${plan.from} moves, then repeat this stage to move ${plan.to - plan.from}.</p><p class="sr-setup">Setup · ${escapeHtml(plan.setup.join(' '))}</p><p class="sr-retry-status" role="status">Use a connected cube for guided setup, or try the segment with the virtual move pad.</p><div class="sr-retry-actions"><button data-action="connect">connect cube</button><button data-action="setup" disabled>guide setup</button><button data-action="reset">reset retry</button></div><div class="sr-virtual"><strong>Virtual retry</strong><div class="sr-virtual-pad">${['U','D','R','L','F','B'].flatMap(face => [face, `${face}'`, `${face}2`]).map(move => `<button data-virtual="${move}">${moveText(move)}</button>`).join('')}</div></div><p class="sr-grade" aria-live="polite"></p><p class="sr-regrade" aria-live="polite"></p></div>`;
    root.append(retry);
    try { cube = createCube3D(retry.querySelector('.sr-retry-cube'), { mode: 'scout' }); cube.update(toRenderData(plan.startState)); } catch { retry.querySelector('.sr-retry-cube').textContent = '3D cube needs WebGL.'; }
    const status = retry.querySelector('.sr-retry-status');
    const connect = retry.querySelector('[data-action="connect"]'), setup = retry.querySelector('[data-action="setup"]'), reset = retry.querySelector('[data-action="reset"]');
    const cubeSession = routeContext.smartCube ?? smartCube;
    const makeLive = routeContext.createSolveLive ?? createSolveLive;
    live = makeLive(cubeSession);
    live.setInspection({ mode: 'off' });
    let gradingGeneration = 0;
    const showGrade = async moves => {
      if (!active || detached) return;
      retryResult = gradeRetry(plan, moves);
      retry.querySelector('.sr-grade').textContent = `${retryResult.label} · ${retryResult.moves} moves · ${retryResult.efficiency}% efficiency`;
      const generation = ++gradingGeneration;
      if (!retryResult.exact) { retry.querySelector('.sr-regrade').textContent = ''; return; }
      status.textContent = 'The target position is back. Regrading this continuation with the solve analysis engine.';
      const candidate = retryRegradeRecord(record, plan, moves);
      if (!candidate) return;
      try {
        candidate.analysis = await analysisClient().analyze(candidate);
        if (generation !== gradingGeneration || !active || detached) return;
        const currentStage = stageOf(record, Math.max(0, plan.from - 1));
        const key = currentStage === 'cross' ? 'cross' : currentStage.startsWith('pair') ? 'f2l' : 'll';
        const score = stageScores(candidate).find(item => item.key === key);
        retry.querySelector('.sr-regrade').textContent = score ? `Shared engine regrade · ${currentStage} · ${score.text}` : 'Shared engine regrade complete.';
      } catch { if (generation === gradingGeneration && active && !detached) retry.querySelector('.sr-regrade').textContent = 'The shared analysis engine could not regrade this continuation.'; }
    };
    const updateCube = snap => { if (active && !detached && snap.state) showCubeState(snap.state); };
    const onCube = snap => {
      updateCube(snap);
      if (!active || detached) return;
      const livePhase = live.getSnapshot().phase;
      const readyToSetup = snap.phase === 'tracking' && (livePhase === 'idle' || livePhase === 'done');
      setup.disabled = !readyToSetup;
      if (readyToSetup) status.textContent = 'Cube connected and synced. Guide the setup to the exact solve position.';
    };
    const onLive = snap => {
      if (!active || detached) return;
      if (snap.phase === 'applying') { attemptMoves = []; retry.querySelector('.sr-grade').textContent = ''; retry.querySelector('.sr-regrade').textContent = ''; reset.disabled = true; status.textContent = 'Follow the guided setup moves on your cube.'; }
      else if (snap.phase === 'ready') { attemptMoves = []; retryResult = null; reset.disabled = false; status.textContent = 'Position ready. Repeat the segment; the cube checks the endpoint.'; }
      else if (snap.phase === 'solving' || snap.phase === 'done') {
        attemptMoves = [...(snap.solveMoves ?? [])];
        void showGrade(attemptMoves);
        if (gradeRetry(plan, attemptMoves).exact) { status.textContent = 'The target position is back. Your retry has been graded.'; live.cancel(); }
      }
    };
    cleanups.push(cubeSession.subscribe(onCube), live.subscribe(onLive));
    connect.addEventListener('click', async () => { if (!active || detached) return; connect.disabled = true; try { await cubeSession.connect(); await cubeSession.syncSolved(); } catch (error) { if (active && !detached) status.textContent = error.message; } finally { if (active && !detached) connect.disabled = false; } });
    setup.addEventListener('click', () => { if (!active || detached) return; try { live.startGuided(plan.setup.join(' ')); } catch (error) { status.textContent = error.message; } });
    reset.addEventListener('click', () => { if (!active || detached) return; attemptMoves = []; retryResult = null; gradingGeneration++; retry.querySelector('.sr-grade').textContent = ''; retry.querySelector('.sr-regrade').textContent = ''; status.textContent = 'Retry counter reset. Repeat the segment.'; });
    retry.addEventListener('click', event => {
      const turn = event.target.closest('[data-virtual]');
      if (!turn || !active || detached) return;
      attemptMoves.push(turn.dataset.virtual);
      const state = applyMovesInChunks(plan.startState, attemptMoves);
      showCubeState(state);
      void showGrade(attemptMoves);
      if (gradeRetry(plan, attemptMoves).exact) status.textContent = 'The target position is back. Your retry has been graded.';
    });
  }

  function onKeyDown(event) {
    if (!active || detached || route.imported || route.retry || !record || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); currentMove--; paintReview(root.querySelector('.sr-layout')); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); currentMove++; paintReview(root.querySelector('.sr-layout')); }
    else if (event.key === '[') { event.preventDefault(); const prev = moments.filter(moment => moment.i < currentMove - 1).at(-1); if (prev) setMove(prev.i + 1); }
    else if (event.key === ']') { event.preventDefault(); const next = moments.find(moment => moment.i >= currentMove); if (next) setMove(next.i + 1); }
    else if (event.key.toLowerCase() === 'r') setHash(`#/review/${record.at}/retry?move=${currentMove}`);
  }
  function setMove(value) { currentMove = value; paintReview(root.querySelector('.sr-layout')); }
  document.addEventListener('keydown', onKeyDown);

  return {
    ready,
    setActive(value) { active = Boolean(value); if (!active) live?.cancel?.(); },
    detach() { detached = true; active = false; document.removeEventListener('keydown', onKeyDown); document.removeEventListener('cubesight-theme', themeChanged); live?.cancel?.(); live?.detach?.(); for (const cleanup of cleanups.splice(0)) cleanup?.(); cube?.destroy?.(); root.replaceChildren(); },
    reset() { return this; },
  };
}
