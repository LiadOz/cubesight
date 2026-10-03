import './history.css';
import { openHistory } from '../store/history.js';
import { listSessions } from '../store/sessions.js';
import { normalizeSettings, loadSettings, saveSettings, setSetting } from '../brain/settings.js';
import { buildStagePlan } from '../brain/stage-plan.js';
import { Cube } from '../ui/cube/index.js';
import { Orbit, createMiniOrbit } from '../ui/orbit/index.js';
import { createActions, createKeyBar } from '../ui/shared/index.js';
import { createSolvedState } from '../cross-cube.js';
import { stateAfter } from '../review/replay.js';
import { parseCsTimer, exportCsTimer, filterHistory } from './cstimer.js';
import { parseHistoryRoute, historyPath, replayPath, historyReviewPath, historyReviewHref, buildHistoryViewModel } from './view-model.js';
import { exportAll, serializeExport, parseImport, importAll, historyFromImport, pinsFromImport, algorithmsFromImport } from '../data-port.js';
import { algDatabase } from '../algs/runtime.js';
import { SOLVE_STORE_KEY } from '../solve-metrics.js';
import { syncPageTokens } from '../pages/tokens.js';
import { fmt } from '../copy/terms.js';
import { fmtResult } from '../brain/format.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const timeText = record => fmt.penalty(record);
const fmtShort = ms => Number.isFinite(ms) ? (ms / 1000).toFixed(2) : ms === Infinity ? 'DNF' : '—';
const replayRecord = record => ({ ...record, scramble: record.scramble || record.scrambleTurns?.join(' ') || '' });
const make = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const download = (text, name) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = make('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const href = route => `#${route}`;

export function initHistory(host) {
  let store, active = false, selectedAt = null, route = parseHistoryRoute(location.hash);
  let cube = null, orbit = null, resultPresenter = null, resultPresenterPromise = null, presenterKey = '';
  let currentRecord = null, replayMove = 0, cubeMove = 0, cubeTargetMove = 0, cubePlaybackGeneration = 0, cubeAnimationRunning = false;
  let replaySpeed = 1, playing = false, raf = 0, playStarted = 0, playBase = 0, renderedResults = null, reviewPlaybackGeneration = 0;
  let inlineReviewDetail = null, reviewVariant = 'yours', reviewCursor = null;
  let listScrollTop = 0;
  let suppressOrbitClick = false, deleted = null, miniOrbits = [];
  let settings = normalizeSettings(loadSettings(globalThis.localStorage));
  const filters = { query: '', session: 'all', focus: 'all', source: 'all' };

  host.innerHTML = `<section class="brain cs-page history-page" data-brain-style="${settings.style}">
    <div class="history-heading"><h1>history</h1><p class="history-context" aria-live="polite"></p></div>
    <form class="history-filters" aria-label="Filter history">
      <details class="history-data"><summary>filters & data…</summary><div class="history-filters__fields">
        <label class="history-search">search<input type="search" name="query" placeholder="scramble, case, time" /></label>
        <label>session<select name="session"><option value="all">all sessions</option></select></label>
        <label>focus<select name="focus"><option value="all">all foci</option><option value="speed">speed</option><option value="flow">flow</option><option value="learning">learning</option></select></label>
        <label>source<select name="source"><option value="all">all sources</option><option value="smart">cube</option><option value="manual">manual</option><option value="import">import</option></select></label>
        <label>stats source<select name="statsSource"><option value="smart">smart cube</option><option value="manual">manual timer</option><option value="all">all</option></select></label>
      </div><div class="history-data__items">
        <button type="button" data-action="backup">export data</button><label class="history-file">import data<input type="file" data-import="backup" accept=".json,application/json" /></label>
        <button type="button" data-action="cstimer">export csTimer</button><label class="history-file">import csTimer<input type="file" data-import="cstimer" accept=".json,application/json" /></label>
        <label>session gap · min<input type="number" name="gap" min="1" max="1440" value="${settings.session.gapMin}" /></label>
      </div></details>
    </form>
    <p class="history-status" role="status" aria-live="polite"></p>
    <div class="history-layout">
      <section class="history-list-panel" aria-label="Solve sessions">
        <p class="history-count"></p><div class="history-list"></div>
      </section>
      <section class="history-focus" aria-label="Selected solve">
        <div class="history-stage">
          <div class="history-stage__cube"></div><div class="history-stage__orbit"></div>
          <p class="history-stage__number"></p><p class="history-stage__subline"></p>
        </div>
        <div class="history-replay-controls" hidden></div>
        <div class="history-results-host" hidden></div>
        <div class="history-actions-host"></div>
      </section>
    </div>
  </section>`;

  const root = host.firstElementChild;
  syncPageTokens(root);
  const form = root.querySelector('form');
  form.elements.statsSource.value = settings.stats.source;
  const status = root.querySelector('.history-status');
  const listHost = root.querySelector('.history-list');
  const focusHost = root.querySelector('.history-focus');
  const cubeHost = root.querySelector('.history-stage__cube');
  const orbitHost = root.querySelector('.history-stage__orbit');
  const resultsHost = root.querySelector('.history-results-host');
  const replayHost = root.querySelector('.history-replay-controls');
  const actionsHost = root.querySelector('.history-actions-host');
  const report = text => { status.textContent = text || ''; };
  const storageRecords = () => store?.records ?? [];
  const viewModel = () => buildHistoryViewModel({ records: storageRecords(), route, filters, selectedAt, move: replayMove, speed: replaySpeed, playing, now: 0, settings, results: renderedResults });

  function destroyMiniOrbits() { miniOrbits.forEach(item => item.destroy()); miniOrbits = []; }
  function stageData(record, move = 0) {
    if (!record) return [];
    const records = record.splits || [];
    const ends = viewModel().selected?.stages || [];
    return records.map((split, index) => {
      const key = String(split.key || ends[index]?.key || `stage-${index}`);
      const bounds = ends.find(stage => stage.key === key) || ends[index] || { start: 0, end: 0, skipped: split.skipped };
      const start = Math.max(0, bounds.start || 0), end = Math.max(start, bounds.end || start);
      const span = end - start;
      const fill = span ? clamp((move - start) / span, 0, 1) : (move >= start ? 1 : 0);
      const state = bounds.skipped || split.skipped ? 'skipped' : move >= end ? 'done' : move > start ? 'current' : 'future';
      return { key, label: split.label || split.short || split.key || key, value: Number.isFinite(split.ms) ? (split.ms / 1000).toFixed(2) : '', weight: Math.max(1, Number(split.ms) || 1), fill: state === 'done' ? 1 : state === 'current' ? fill : 0, state, selected: state === 'current', importance: state === 'current' ? 10 : 1 };
    });
  }
  function markerData(record) {
    const markers = viewModel().selected?.markers || [];
    const ends = viewModel().selected?.stages || [];
    return markers.map(marker => {
      const at = Math.max(0, Number(marker.at ?? marker.idx + 1) || 0);
      const stage = ends.find(item => marker.stage === item.key) || ends.find(item => at <= item.end) || ends.at(-1);
      const span = Math.max(1, (stage?.end ?? 0) - (stage?.start ?? 0));
      return { key: marker.id, segment: stage?.key, position: clamp((at - (stage?.start ?? 0)) / span, 0, 1), label: marker.label || marker.note || 'review marker', tone: marker.tone === 'good' ? 'good' : 'bad', type: marker.tone === 'good' ? 'good' : 'bad' };
    });
  }
  function selectedRecord() {
    if (route.at != null) return storageRecords().find(record => record.at === route.at) || null;
    const visible = filterHistory(storageRecords(), filters).sort((a, b) => b.at - a.at);
    return visible.find(record => record.at === selectedAt) || visible[0] || null;
  }
  function updateStage(record, { move = null, animate = false, cubePaint = true } = {}) {
    if (!record || !orbit || !cube) return;
    const cursor = move == null ? (record.solveMoves?.length || 0) : move;
    const selected = viewModel().selected;
    const segments = stageData(record, cursor);
    const markers = markerData(record);
    orbit.update({
      segments, markers, size: 'XL', shape: 'open', gap: 70, direction: 'clockwise', labelStyle: 'around',
      centerClearance: 115, label: 'solve orbit', duration: 360,
      onSegment: segment => {
        if (suppressOrbitClick) { suppressOrbitClick = false; return; }
        const stage = selected?.stages?.find(item => item.key === segment.key);
        if (route.kind === 'replay' && stage) seekMove(stage.start, { updateUrl: false });
      },
      onMarker: marker => {
        if (route.kind === 'replay' && marker.key) {
          const target = viewModel().selected?.markers?.find(item => item.id === marker.key);
          if (target) seekMove(target.at ?? (target.idx ?? 0) + 1, { updateUrl: false });
          location.hash = href(historyReviewPath(record.at, marker.key));
        }
      },
    }, { animate });
    const last = Number(selected?.durationMs) || Number(record.solveMs) || 0;
    const elapsed = selected?.hasTiming ? (cursor ? record.moveTimes?.[cursor - 1] ?? 0 : 0) : (record.solveMoves?.length ? last * cursor / record.solveMoves.length : 0);
    if (cubePaint && (record.scramble || record.scrambleTurns?.length)) {
      try {
        const startState = stateAfter(replayRecord(record), 0);
        cube.seek(cursor, record.solveMoves || [], { startState });
        cubeMove = cursor; cubeTargetMove = cursor; cubePlaybackGeneration++;
      } catch { cube.setState(createSolvedState()); }
    }
    root.querySelector('.history-stage__number').textContent = route.kind === 'replay' ? `${fmtShort(elapsed)} / ${fmtShort(last)} s` : timeText(record);
    root.querySelector('.history-stage__subline').textContent = route.kind === 'replay'
      ? `move ${cursor} of ${record.solveMoves?.length || 0}${selected?.hasTiming ? '' : ' · timing not recorded'}`
      : `${fmt.date(record.at)} · ${record.focus || 'speed'} · ${record.source === 'manual' ? 'manual' : record.source === 'import' ? 'import' : 'cube'}`;
  }
  function renderSessions(vm) {
    destroyMiniOrbits();
    const groups = vm.sessions.map(session => {
      const section = make('section', undefined, 'history-session');
      section.dataset.session = session.id;
      const heading = make('header', undefined, 'history-session__heading');
      const title = make('h2', `${session.period} · ${session.startTime}`);
      const detail = make('p', `${session.count} ${session.count === 1 ? 'solve' : 'solves'} · ao12 ${session.ao12}`);
      heading.append(title, detail); section.append(heading);
      const rows = make('ol', undefined, 'history-session__solves');
      session.solves.forEach(solve => {
        const row = make('li', undefined, `history-solve${solve.at === (route.at ?? selectedAt) ? ' is-selected' : ''}`);
        const link = make('a', ''); link.href = href(solve.href); link.dataset.at = String(solve.at); link.setAttribute('aria-current', solve.at === (route.at ?? selectedAt) ? 'true' : 'false');
        const glyph = make('span', undefined, 'history-solve__orbit');
        const mini = createMiniOrbit(glyph, { label: 'solve orbit', value: '', size: 34, segments: solve.segments, shape: 'full', labelStyle: 'side' }); miniOrbits.push(mini);
        const result = make('span', solve.result, 'history-solve__time');
        const meta = make('span', `${clockAt(solve.at)}${solve.pb ? ' · PB' : ''}${solve.penalty ? ` · ${solve.penalty}` : ''}`, 'history-solve__meta');
        const right = make('span', undefined, 'history-solve__copy'); right.append(result, meta);
        link.append(glyph, right); row.append(link); rows.append(row);
      });
      section.append(rows); return section;
    });
    listHost.replaceChildren(...groups.length ? groups : [make('p', 'No solves match. Change a filter or start a solve.', 'history-empty')]);
  }
  function clockAt(at) { const date = new Date(at); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
  function updateSummary(vm) {
    root.querySelector('.history-context').textContent = `${vm.summary.count} solves · PB ${vm.summary.pb} · ao5 ${vm.summary.ao5} · ao12 ${vm.summary.ao12}`;
    root.querySelector('.history-count').textContent = `${vm.summary.count} solves`;
  }
  function updateSessionFilter() {
    const select = form.elements.session;
    const old = select.value;
    const all = make('option', 'all sessions'); all.value = 'all';
    select.replaceChildren(all, ...listSessions(storageRecords()).reverse().map(session => {
      const date = new Date(session.firstAt);
      const label = `${fmt.date(session.firstAt)} · ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} · ${session.count}`;
      const option = make('option', label); option.value = session.id; return option;
    }));
    if ([...select.options].some(option => option.value === old)) select.value = old;
  }
  function makeActions(record, past = false) {
    actionsHost.replaceChildren();
    if (!record) return;
    const more = make('details', undefined, 'history-more');
    const summary = make('summary', 'more…');
    const menu = make('div', undefined, 'history-more__menu');
    for (const [action, label] of [['none', 'clear penalty'], ['plus2', '+2'], ['dnf', 'DNF'], ['delete', 'delete']]) {
      const button = make('button', label); button.type = 'button'; button.dataset.action = action; menu.append(button);
    }
    if (deleted) {
      const undo = make('button', 'undo delete'); undo.type = 'button'; undo.dataset.action = 'undo'; menu.append(undo);
    }
    more.append(summary, menu);
    if (!past && route.kind === 'list') createActions(actionsHost, [{ label: 'open this solve', href: href(historyPath(record.at)), primary: true }]);
    if (route.kind === 'replay') {
      const back = make('a', '‹ past solve', 'history-back-link'); back.href = href(historyPath(record.at)); actionsHost.append(back);
    }
    actionsHost.append(more);
  }
  function reviewUiForRoute() {
    if (route.kind === 'review') return {
      selectedId: route.marker,
      variant: reviewVariant, cursor: reviewCursor,
      detail: { kind: 'marker', key: route.marker },
    };
    return inlineReviewDetail ? { variant: reviewVariant, cursor: reviewCursor, detail: { ...inlineReviewDetail } } : {};
  }
  function updatePastPresenter(record = currentRecord) {
    if (!resultPresenter?.build || !record) return null;
    const selected = viewModel().selected;
    const presented = replayRecord(record);
    if (selected?.at === record.at) presented.analysis = selected.analysis;
    const records = storageRecords().map(item => item.at === record.at ? presented : replayRecord(item));
    const model = resultPresenter.build({ record: presented, records, settings, plan: buildStagePlan(settings), pins: store.pins.list, reviewUi: reviewUiForRoute(), analysisStatus: record.analysis ? 'complete' : 'none' });
    renderedResults = model.vm;
    resultPresenter.update({ screen: 'results', results: model.vm, history: { navigation: navigationFor(record), replayHref: href(replayPath(record.at)) } });
    return model;
  }
  async function playReviewVariant(variant) {
    if (!['yours', 'better'].includes(variant) || !currentRecord || !resultPresenter?.build) return;
    const compare = renderedResults?.review?.detail?.compare;
    const moves = variant === 'better' ? compare?.better : compare?.yours;
    if (!compare || !Array.isArray(moves) || !moves.length || !cube) return;
    const recordAt = currentRecord.at, routePath = route.path, playbackCube = cube;
    const generation = ++reviewPlaybackGeneration;
    reviewVariant = variant; reviewCursor = compare.from;
    updatePastPresenter();
    const startState = stateAfter(replayRecord(currentRecord), compare.from);
    cube.setState(startState);
    await cube.play(moves, { fullTurns: true, speed: 1, startState });
    if (generation !== reviewPlaybackGeneration || !active || cube !== playbackCube || currentRecord?.at !== recordAt || route.path !== routePath) return;
    reviewCursor = compare.from + moves.length;
    updatePastPresenter();
  }
  function stopPlayback() { if (raf) cancelAnimationFrame(raf); raf = 0; playing = false; }
  function queueCubeTo(target) {
    if (!cube || !currentRecord) return;
    cubeTargetMove = clamp(target, 0, currentRecord.solveMoves?.length || 0);
    if (cubeAnimationRunning) return;
    cubeAnimationRunning = true;
    const generation = cubePlaybackGeneration;
    const advance = async () => {
      try {
        while (active && cube && generation === cubePlaybackGeneration && cubeMove < cubeTargetMove) {
          const index = cubeMove;
          const move = currentRecord.solveMoves[index];
          if (!move) break;
          const before = cube.state;
          const stamps = viewModel().selected?.hasTiming ? currentRecord.moveTimes : null;
          const gap = stamps ? Math.max(40, (stamps[index] ?? 0) - (stamps[index - 1] ?? 0)) : (currentRecord.solveMs || 2000) / Math.max(1, currentRecord.solveMoves.length);
          const turnMs = clamp(gap * 0.8, 70, 260);
          await cube.play([move], { fullTurns: true, speed: replaySpeed * 260 / turnMs, startState: before });
          if (generation !== cubePlaybackGeneration) return;
          cubeMove = index + 1;
        }
      } finally {
        if (generation === cubePlaybackGeneration) {
          cubeAnimationRunning = false;
          if (active && cube && cubeMove < cubeTargetMove) queueCubeTo(cubeTargetMove);
        }
      }
    };
    void advance();
  }
  function cursorAtElapsed(record, elapsed) {
    const moves = record.solveMoves || [];
    const stamps = viewModel().selected?.hasTiming ? record.moveTimes : null;
    if (stamps) {
      let low = 0, high = stamps.length;
      while (low < high) { const mid = (low + high) >>> 1; if (stamps[mid] <= elapsed) low = mid + 1; else high = mid; }
      return low;
    }
    const duration = Math.max(1, Number(record.solveMs) || 1);
    return clamp(Math.floor((elapsed / duration) * moves.length), 0, moves.length);
  }
  function tick(now) {
    const record = currentRecord;
    if (!active || !playing || !record) { stopPlayback(); return; }
    const duration = viewModel().selected?.durationMs || record.solveMs || 1;
    const elapsed = Math.min(duration, playBase + (now - playStarted) * replaySpeed);
    const next = cursorAtElapsed(record, elapsed);
    if (next !== replayMove) { replayMove = next; updateStage(record, { move: replayMove, animate: false, cubePaint: false }); queueCubeTo(replayMove); updateReplayControls(); }
    if (elapsed >= duration) { stopPlayback(); updateReplayControls(); return; }
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (!currentRecord?.solveMoves?.length) return;
    if (replayMove >= currentRecord.solveMoves.length) { seekMove(0, { updateUrl: false }); }
    playBase = viewModel().selected?.elapsedMs || 0;
    playStarted = performance.now(); playing = true;
    updateReplayControls(); raf = requestAnimationFrame(tick);
  }
  function seekMove(index, { updateUrl = true } = {}) {
    const count = currentRecord?.solveMoves?.length || 0;
    replayMove = clamp(Math.floor(Number(index) || 0), 0, count);
    if (playing) { stopPlayback(); }
    reviewPlaybackGeneration++;
    cubePlaybackGeneration++; cube?.stop();
    updateStage(currentRecord, { move: replayMove, animate: false }); updateReplayControls();
    if (updateUrl && route.kind !== 'replay') location.hash = href(replayPath(currentRecord.at));
  }
  function updateReplayControls() {
    if (!currentRecord || route.kind !== 'replay') { replayHost.hidden = true; replayHost.replaceChildren(); return; }
    replayHost.hidden = false;
    const existing = replayHost.querySelector('.history-transport');
    if (existing) {
      const toggle = replayHost.querySelector('[data-action="play"], [data-action="pause"]');
      toggle.textContent = playing ? 'pause' : 'play'; toggle.dataset.action = playing ? 'pause' : 'play';
      replayHost.querySelectorAll('[data-speed]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === replaySpeed)));
      const note = replayHost.querySelector('.history-timing-note'); note.textContent = viewModel().selected?.hasTiming ? '' : 'timing not recorded';
      return;
    }
    replayHost.replaceChildren();
    const transport = make('div', undefined, 'history-transport');
    const toggle = make('button', playing ? 'pause' : 'play'); toggle.type = 'button'; toggle.dataset.action = playing ? 'pause' : 'play'; transport.append(toggle);
    const previous = make('button', '‹ marker'); previous.type = 'button'; previous.dataset.action = 'previous-marker'; transport.append(previous);
    const next = make('button', 'next marker ›'); next.type = 'button'; next.dataset.action = 'next-marker'; transport.append(next);
    const speeds = make('div', undefined, 'history-speeds');
    [0.5, 1, 2].forEach(speed => { const button = make('button', `${speed}×`); button.type = 'button'; button.dataset.speed = String(speed); button.setAttribute('aria-pressed', String(speed === replaySpeed)); speeds.append(button); });
    const timing = make('p', viewModel().selected?.hasTiming ? '' : 'timing not recorded', 'history-timing-note');
    replayHost.append(transport, speeds, timing);
  }
  function markerMove(record, direction) {
    const markers = viewModel().selected?.markers || [];
    const points = markers.map(marker => Math.max(0, marker.at ?? (marker.idx ?? 0) + 1)).sort((a, b) => a - b);
    const target = direction < 0 ? [...points].reverse().find(at => at < replayMove) : points.find(at => at > replayMove);
    if (target != null) seekMove(target, { updateUrl: false });
  }
  function ringProgressFromEvent(event) {
    const svg = event.target.closest('svg');
    if (!svg || !orbit?.current) return null;
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 560;
    const y = (event.clientY - rect.top) / rect.height * 560;
    const angle = (Math.atan2(y - 280, x - 280) * 180 / Math.PI + 360) % 360;
    const current = orbit.current;
    const dir = current.direction === 'counterclockwise' ? -1 : 1;
    const relative = ((angle - current.startAngle) * dir % 360 + 360) % 360;
    if (relative > current.sweep) return null;
    return relative / current.sweep;
  }
  function scrubFromEvent(event) {
    const progress = ringProgressFromEvent(event);
    if (progress == null) return;
    const count = currentRecord?.solveMoves?.length || 0;
    seekMove(Math.round(progress * count), { updateUrl: false });
  }
  function renderList(vm, record) {
    root.dataset.view = 'list';
    listHost.hidden = false; resultsHost.hidden = true; replayHost.hidden = true;
    renderSessions(vm);
    focusHost.classList.remove('is-replay', 'is-past');
    root.querySelector('.history-stage__number').textContent = record ? timeText(record) : '—';
    root.querySelector('.history-stage__subline').textContent = record ? `${fmt.date(record.at)} · ${record.focus || 'speed'}` : 'select a solve';
    if (record) updateStage(record, { move: record.solveMoves?.length || 0, animate: false });
    else {
      orbit?.update({ segments: [], markers: [], size: 'XL', shape: 'open', gap: 70, centerClearance: 115, label: 'solve orbit' }, { animate: false });
      cube?.setState(createSolvedState());
    }
    makeActions(record, false);
  }
  async function ensureResultsPresenter() {
    const nextKey = `${currentRecord?.at ?? ''}/${route.kind}/${route.marker ?? ''}`;
    if (resultPresenter && presenterKey === nextKey) return resultPresenter;
    if (resultPresenter) { resultPresenter.destroy?.(); resultPresenter = null; }
    if (resultPresenterPromise) return resultPresenterPromise;
    resultPresenterPromise = Promise.all([
      import('../brain/view-model.js'), import('../brain/styles/orbit/results-orbit.js'),
    ]).then(([models, renderers]) => {
      root.querySelector('.history-result-rail')?.remove();
      const rail = make('div', undefined, 'history-result-rail'); resultsHost.replaceChildren(rail);
      resultPresenter = renderers.createOrbitResults(rail, {
        mode: 'past', resultsOrbit: orbit, resultsCube: cube,
        dispatch: action => {
          if (action.type === 'selectMarker' && currentRecord) {
            reviewPlaybackGeneration++; inlineReviewDetail = null; reviewVariant = 'yours'; reviewCursor = null;
            location.hash = href(historyReviewPath(currentRecord.at, action.id));
          } else if (action.type === 'openDetail' && action.key && currentRecord) {
            if (action.kind === 'marker') {
              reviewPlaybackGeneration++; inlineReviewDetail = null; reviewVariant = 'yours'; reviewCursor = null;
              location.hash = href(historyReviewPath(currentRecord.at, action.key));
            } else {
              reviewPlaybackGeneration++; cube?.stop(); inlineReviewDetail = { kind: 'stage', key: action.key }; reviewVariant = 'yours'; reviewCursor = null;
              void renderPast(currentRecord);
            }
          } else if (action.type === 'closeDetail') {
            if (route.kind === 'review') location.hash = href(historyPath(currentRecord.at));
            else { reviewPlaybackGeneration++; cube?.stop(); inlineReviewDetail = null; reviewVariant = 'yours'; reviewCursor = null; void renderPast(currentRecord); }
          } else if (action.type === 'playVariant') void playReviewVariant(action.variant);
        },
        onReplay: () => { location.hash = href(replayPath(currentRecord.at)); },
        pastNavigation: navigationFor(currentRecord),
      });
      presenterKey = nextKey;
      resultPresenter.build = models.buildResultsViewModel;
      return resultPresenter;
    }).finally(() => { resultPresenterPromise = null; });
    return resultPresenterPromise;
  }
  function navigationFor(record) {
    const rows = filterHistory(storageRecords(), filters).sort((a, b) => b.at - a.at);
    const index = rows.findIndex(item => item.at === record.at);
    const older = rows[index + 1], newer = rows[index - 1];
    return {
      back: { label: route.kind === 'review' ? `history · ${fmtResult(record, 'long')}` : 'history', href: '#/history' },
      previous: older ? { label: '‹', href: href(historyPath(older.at)) } : null,
      next: newer ? { label: '›', href: href(historyPath(newer.at)) } : null,
      reviewHref: marker => historyReviewHref(record.at, marker),
    };
  }
  async function renderPast(record) {
    root.dataset.view = route.kind;
    root.querySelector('.history-data').open = false;
    listHost.hidden = true; resultsHost.hidden = false; replayHost.hidden = true;
    focusHost.classList.remove('is-replay'); focusHost.classList.add('is-past');
    resultsHost.classList.remove('is-hidden');
    updateStage(record, { move: record.solveMoves?.length || 0, animate: false });
    await ensureResultsPresenter();
    if (!active || route.kind !== 'past' && route.kind !== 'review' || currentRecord?.at !== record.at) return;
    updatePastPresenter(record);
    makeActions(record, true);
  }
  function renderReplay(record, vm) {
    root.dataset.view = 'replay'; listHost.hidden = true; resultsHost.hidden = true; replayHost.hidden = false;
    root.querySelector('.history-data').open = false;
    focusHost.classList.remove('is-past'); focusHost.classList.add('is-replay');
    replayMove = vm.selected?.move ?? replayMove;
    updateStage(record, { move: replayMove, animate: false });
    updateReplayControls();
    makeActions(record, false);
  }
  function render() {
    if (!store || !active) return;
    if (route.kind === 'list') {
      const visible = filterHistory(storageRecords(), filters).sort((a, b) => b.at - a.at);
      if (!visible.some(record => record.at === selectedAt)) selectedAt = visible[0]?.at ?? null;
    }
    const vm = viewModel();
    updateSummary(vm);
    currentRecord = selectedRecord();
    if (currentRecord) {
      selectedAt = currentRecord.at;
      if (!cube) cube = new Cube(cubeHost, { mode: 'replay', state: createSolvedState(), size: 'XL', label: 'selected solve cube' });
      resultPresenter?.setCube?.(cube);
    }
    if (route.kind === 'replay' && currentRecord) renderReplay(currentRecord, vm);
    else if ((route.kind === 'past' || route.kind === 'review') && currentRecord) void renderPast(currentRecord);
    else renderList(vm, currentRecord);
    const keys = route.kind === 'replay' ? [{ key: 'space', label: playing ? 'pause' : 'play' }, { key: '‹ ›', label: 'move' }, { key: 'esc', label: 'back' }] : [];
    const keyHost = root.querySelector('.history-keybar-host') || make('div', undefined, 'history-keybar-host');
    keyHost.replaceChildren(); if (keys.length) createKeyBar(keyHost, keys); root.append(keyHost);
  }
  async function onClick(event) {
    const target = event.target.closest('button'); if (!target) return;
    await ready; if (!active) return;
    const action = target.dataset.action;
    if (action === 'backup' || action === 'cstimer') {
      await store.flush(); await store.pins.flush();
      const backup = action === 'backup' ? serializeExport(exportAll(globalThis.localStorage, store.records, store.pins.list, await algDatabase.exportPersonalData())) : exportCsTimer(store.records);
      download(backup, action === 'backup' ? 'cubesight-backup.json' : 'cstimer.json'); return;
    }
    if (action === 'play') play();
    else if (action === 'pause') { stopPlayback(); updateReplayControls(); }
    else if (action === 'previous-marker') markerMove(currentRecord, -1);
    else if (action === 'next-marker') markerMove(currentRecord, 1);
    else if (target.dataset.speed) { replaySpeed = Number(target.dataset.speed); updateReplayControls(); }
    else if (action === 'undo' && deleted) { store.restore(deleted); await store.flush(); deleted = null; render(); report('Solve restored.'); }
    else if (action === 'delete' && currentRecord) {
      deleted = store.remove(currentRecord.at);
      if (!deleted) { report(store.warning || 'This history is read-only. Update the app and reload.'); return; }
      await store.flush(); location.hash = '#/history'; report('Solve deleted.');
    } else if (['none', 'plus2', 'dnf'].includes(action) && currentRecord) {
      const record = store.setPenalty(currentRecord.at, action === 'none' ? null : action === 'plus2' ? '+2' : 'DNF');
      await store.flush(); if (record) render();
    }
  }
  async function onChange(event) {
    await ready; if (!active) return;
    if (event.target.dataset.import) {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        if (store.readOnly) throw new Error('History is read-only. Update the app and reload.');
        const text = await file.text(); let count;
        if (event.target.dataset.import === 'cstimer') count = store.importRecords(parseCsTimer(text));
        else {
          const parsed = parseImport(text);
          importAll(globalThis.localStorage, parsed, { skipKeys: [SOLVE_STORE_KEY] });
          const algorithms = algorithmsFromImport(parsed); if (algorithms) await algDatabase.importPersonalData(algorithms);
          count = store.importRecords(historyFromImport(parsed)); store.pins.importPins(pinsFromImport(parsed));
        }
        await store.flush(); await store.pins.flush(); updateSessionFilter(); render(); report(`Imported ${count} solves.`);
      } catch (error) { report(error.message); }
      event.target.value = ''; return;
    }
    if (event.target.name === 'gap') {
      const next = store.setSessionGapMin(Number(event.target.value)); event.target.value = next;
      saveSettings(globalThis.localStorage, setSetting(loadSettings(globalThis.localStorage), 'session.gapMin', next));
      store.regroupSessions(); await store.flush(); updateSessionFilter(); render(); report(`Future solves start a new session after ${next} minutes idle.`); return;
    }
    if (event.target.name === 'statsSource') {
      settings = normalizeSettings(saveSettings(globalThis.localStorage, setSetting(loadSettings(globalThis.localStorage), 'stats.source', event.target.value)));
      render(); return;
    }
    if (['query', 'session', 'focus', 'source'].includes(event.target.name)) {
      filters[event.target.name] = event.target.value;
      render();
    }
  }
  function onInput(event) {
    if (event.target.name === 'query') { filters.query = event.target.value; render(); }
  }
  function onKeyDown(event) {
    if (!active || route.kind !== 'replay' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (event.key === ' ') { event.preventDefault(); playing ? (stopPlayback(), updateReplayControls()) : play(); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); seekMove(replayMove + (event.key === 'ArrowRight' ? 1 : -1), { updateUrl: false }); }
    else if (event.key === 'Escape') { event.preventDefault(); location.hash = href(historyPath(currentRecord.at)); }
    else if (event.key === '[' || event.key === ']') { event.preventDefault(); markerMove(currentRecord, event.key === '[' ? -1 : 1); }
  }
  function onPointerDown(event) {
    if (route.kind !== 'replay' || !event.target.closest('.orbit__svg')) return;
    const startX = event.clientX, startY = event.clientY;
    let dragged = false;
    const movePointer = pointer => {
      if (!dragged && Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < 5) return;
      dragged = true; suppressOrbitClick = true; pointer.preventDefault(); scrubFromEvent(pointer);
    };
    const upPointer = () => {
      document.removeEventListener('pointermove', movePointer);
      document.removeEventListener('pointerup', upPointer);
      if (!dragged) return;
      setTimeout(() => { suppressOrbitClick = false; }, 0);
    };
    document.addEventListener('pointermove', movePointer, { passive: false });
    document.addEventListener('pointerup', upPointer, { once: true });
  }
  form.addEventListener('submit', event => event.preventDefault());
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  document.addEventListener('keydown', onKeyDown);
  orbitHost.addEventListener('pointerdown', onPointerDown);
  const retheme = () => {
    if (!active) return;
    settings = normalizeSettings(loadSettings(globalThis.localStorage));
    form.elements.statsSource.value = settings.stats.source;
    root.dataset.brainStyle = settings.style; syncPageTokens(root); render();
  };
  document.addEventListener('cubesight-theme', retheme);
  const ready = openHistory({ sessionGapMin: settings.session.gapMin }).then(value => { store = value; updateSessionFilter(); if (!currentRecord) selectedAt = store.records.at(-1)?.at ?? null; report(store.warning); render(); });
  const setRoute = hash => {
    const next = parseHistoryRoute(hash);
    if (next.kind === 'not-found') { location.hash = '#/not-found'; return; }
    if (route.kind === 'list' && next.kind !== 'list') listScrollTop = window.scrollY;
    if (route.kind !== next.kind || route.at !== next.at || route.marker !== next.marker) { stopPlayback(); reviewPlaybackGeneration++; cubePlaybackGeneration++; cubeAnimationRunning = false; cube?.stop(); }
    if (route.kind !== next.kind || route.at !== next.at || route.marker !== next.marker) { inlineReviewDetail = null; reviewVariant = 'yours'; reviewCursor = null; }
    route = next;
    if (next.kind !== 'past' && next.kind !== 'review') renderedResults = null;
    if (next.at != null) { selectedAt = next.at; replayMove = next.kind === 'replay' ? 0 : replayMove; }
    if (store && active) {
      render();
      if (next.kind === 'list') requestAnimationFrame(() => window.scrollTo(0, listScrollTop));
    }
  };
  orbit = new Orbit(orbitHost, { segments: [], size: 'XL', shape: 'open', gap: 70, centerClearance: 115, label: 'solve orbit' });
  const view = () => viewModel();
  return {
    ready,
    setRoute,
    getViewModel: view,
    async setActive(value) {
      active = Boolean(value);
      if (!active) {
        stopPlayback(); reviewPlaybackGeneration++; cubePlaybackGeneration++; cubeAnimationRunning = false;
        cube?.stop(); cube?.destroy(); cube = null;
        return;
      }
      await ready;
      if (!active) return;
      settings = normalizeSettings(loadSettings(globalThis.localStorage));
      form.elements.statsSource.value = settings.stats.source;
      await store.reload(); updateSessionFilter(); root.dataset.brainStyle = settings.style; syncPageTokens(root); render();
    },
    detach() {
      active = false; stopPlayback(); resultPresenter?.destroy?.(); resultPresenter = null;
      reviewPlaybackGeneration++; cubePlaybackGeneration++; cubeAnimationRunning = false;
      cube?.destroy(); cube = null; orbit?.destroy(); orbit = null; destroyMiniOrbits();
      document.removeEventListener('cubesight-theme', retheme);
      root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.removeEventListener('input', onInput); document.removeEventListener('keydown', onKeyDown);
      host.replaceChildren();
    },
  };
}
