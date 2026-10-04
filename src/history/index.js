import './history.css';
import { openHistory } from '../store/history.js';
import { listSessions } from '../store/sessions.js';
import { normalizeSettings, loadSettings, saveSettings, setSetting } from '../brain/settings.js';
import { buildStagePlan } from '../brain/stage-plan.js';
import { analysisClient } from '../analysis/client.js';
import { buildImportedReconstruction, parseAlgCubingUrl } from '../review/import-parser.js';
import { stagePieces } from '../ui/cube/pieces.js';
import { Cube } from '../ui/cube/index.js';
import { Orbit, createMiniOrbit } from '../ui/orbit/index.js';
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
    <header class="history-top">
      <div class="history-heading"><h1>history</h1><p class="history-context sr-only" aria-live="polite"></p></div>
      <div class="history-summary">
        <div class="history-summary__ring" aria-hidden="true"></div>
        <p class="history-summary__today"></p>
        <dl class="history-summary__stats"></dl>
      </div>
      <form class="history-filters" aria-label="Filter history">
        <label class="history-pill"><span class="sr-only">session</span><select name="session"><option value="all">all sessions</option></select></label>
        <label class="history-pill"><span class="sr-only">focus</span><select name="focus"><option value="all">all foci</option><option value="speed">speed</option><option value="flow">flow</option><option value="learning">learning</option></select></label>
        <label class="history-pill"><span class="sr-only">source</span><select name="source"><option value="all">all sources</option><option value="smart">cube</option><option value="manual">manual</option><option value="import">import</option></select></label>
        <label class="history-search"><span>search</span><input type="search" name="query" placeholder="scramble, case, time" aria-label="search history" /><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></label>
        <details class="history-data"><summary>data…</summary><div class="history-filters__fields">
          <label>stats source<select name="statsSource"><option value="smart">smart cube</option><option value="manual">manual timer</option><option value="all">all</option></select></label>
        </div><div class="history-data__items">
          <button type="button" data-action="backup">export data</button><label class="history-file">import data<input type="file" data-import="backup" accept=".json,application/json" /></label>
          <button type="button" data-action="cstimer">export csTimer</button><label class="history-file">import csTimer<input type="file" data-import="cstimer" accept=".json,application/json" /></label>
          <a class="history-import-link" href="#/history/import">import a solve…</a>
          <label>session gap · min<input type="number" name="gap" min="1" max="1440" value="${settings.session.gapMin}" /></label>
        </div></details>
      </form>
    </header>
    <p class="history-status" role="status" aria-live="polite"></p>
    <div class="history-layout">
      <section class="history-list-panel" aria-label="Solve sessions">
        <p class="history-count sr-only"></p><div class="history-list"></div>
      </section>
      <section class="history-focus" aria-label="Selected solve">
        <div class="history-stage">
          <div class="history-stage__cube"></div><div class="history-stage__orbit"></div>
        </div>
        <p class="history-stage__number"></p><p class="history-stage__subline"></p>
        <p class="history-counter"></p><a class="history-back" href="#/history"></a>
        <div class="history-replay-controls" hidden></div>
        <div class="history-results-host" hidden></div>
        <div class="history-actions-host"></div>
      </section>
      <section class="history-import" aria-label="Import a solve" hidden></section>
    </div>
    <div class="history-keybar-host"></div>
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
  const importHost = root.querySelector('.history-import');
  const counter = root.querySelector('.history-counter');
  const backLink = root.querySelector('.history-back');
  const keyHost = root.querySelector('.history-keybar-host');
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
      segments, markers, size: 'XL', fitHost: true, shape: 'open', gap: 70, direction: 'clockwise', labelStyle: 'around',
      centerClearance: 150, label: 'solve orbit', duration: 360,
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
    const number = root.querySelector('.history-stage__number');
    if (route.kind === 'replay') {
      number.replaceChildren(make('span', fmtShort(elapsed)), make('small', `/ ${fmtShort(last)}`));
    } else number.textContent = timeText(record);
    root.querySelector('.history-stage__subline').textContent = route.kind === 'replay'
      ? `move ${cursor} of ${record.solveMoves?.length || 0}${selected?.hasTiming ? '' : ' · timing not recorded'}`
      : `solve ${selectedIndex(record) || ''} · ${whenText(record.at)} · ${record.focus || 'speed'} · ${record.source === 'manual' ? 'manual' : record.source === 'import' ? 'import' : 'cube'}`;
    applyCubeEmphasis(record, cursor);
  }
  const chronologicalRows = () => filterHistory(storageRecords(), filters).sort((a, b) => a.at - b.at);
  const selectedIndex = record => chronologicalRows().findIndex(item => item.at === record.at) + 1;
  /** What to emphasise on the cube: the stage of the reviewed moment or the opened stage. Everything else dims. */
  function emphasisFor(record, cursor) {
    const selected = viewModel().selected, analysis = selected?.analysis;
    // The approved replay frame (A-11) shows the whole cube plain, so only a review moment or an opened stage emphasises pieces.
    let key = null;
    if (route.kind === 'review') key = selected?.markers?.find(item => item.id === route.marker)?.stage ?? null;
    else if (inlineReviewDetail?.kind === 'stage') key = inlineReviewDetail.key;
    if (!key) return null;
    const pairNumber = /^pair(\d)$/.exec(key)?.[1];
    const slot = pairNumber ? analysis?.pairs?.find(pair => String(pair.n) === pairNumber)?.chosenSlot ?? null : null;
    const target = analysis?.cross?.target;
    const stage = key === 'cross' && target?.slots?.length ? 'xcross' : key;
    return { stage, options: { crossFace: analysis?.face || 'D', slot, slots: key === 'cross' ? target?.slots ?? [] : [] } };
  }
  let lastEmphasis = '';
  function applyCubeEmphasis(record, cursor) {
    if (!cube) return;
    const wanted = emphasisFor(record, cursor);
    const key = wanted ? JSON.stringify([record.at, wanted]) : '';
    // Re-painting cancels a running turn, so only touch the cube when the emphasis actually changes.
    if (key === lastEmphasis && cube.lastHighlight?.dimOthers === Boolean(wanted)) return;
    lastEmphasis = key;
    const found = wanted && cube.state ? stagePieces(cube.state, wanted.stage, wanted.options) : null;
    if (found) cube.highlight(found); else cube.clearHighlight();
  }
  const clock = at => { const date = new Date(at); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; };
  const whenText = at => { const now = new Date(Date.now()), day = new Date(at); const same = day.getFullYear() === now.getFullYear() && day.getMonth() === now.getMonth() && day.getDate() === now.getDate(); return `${same ? 'today' : fmt.date(at)} ${clock(at)}`; };
  function renderSessions(vm) {
    destroyMiniOrbits();
    const selected = route.at ?? selectedAt;
    const groups = vm.sessions.map(session => {
      const section = make('section', undefined, 'history-session');
      section.dataset.session = session.id;
      const heading = make('header', `${session.period} · ${session.startTime} · ${session.count} ${session.count === 1 ? 'solve' : 'solves'} · ao12 ${session.ao12}`, 'history-session__heading');
      section.append(heading);
      const rows = make('ol', undefined, 'history-session__solves');
      session.solves.forEach(solve => {
        const isSelected = solve.at === selected;
        const row = make('li', undefined, `history-solve${isSelected ? ' is-selected' : ''}`);
        row.dataset.at = String(solve.at);
        const link = make('a', ''); link.href = href(solve.href); link.dataset.at = String(solve.at); link.setAttribute('aria-current', isSelected ? 'true' : 'false');
        const number = make('span', solve.number != null ? `#${solve.number}` : '', 'history-solve__no');
        const glyph = make('span', undefined, 'history-solve__orbit');
        const mini = createMiniOrbit(glyph, { label: 'solve orbit', value: '', size: 38, segments: solve.segments, shape: 'full', labelStyle: 'side' }); miniOrbits.push(mini);
        const result = make('span', solve.result, `history-solve__time${solve.dnf ? ' is-dnf' : solve.penalty === '+2' ? ' is-plus2' : ''}`);
        const delta = solve.pb ? make('span', 'PB', 'history-solve__pb') : make('span', solve.delta?.text ?? '', 'history-solve__delta');
        if (solve.delta && !solve.pb) delta.dataset.tone = solve.delta.tone;
        const moments = make('span', undefined, 'history-solve__moments');
        for (const chip of solve.moments ?? []) moments.append(make('span', chip.label, `history-chip is-${chip.tone}`));
        const meta = make('span', clock(solve.at), 'history-solve__meta');
        link.append(number, glyph, result, delta, moments, meta); row.append(link); rows.append(row);
      });
      section.append(rows);
      return section;
    });
    listHost.replaceChildren(...groups.length ? groups : [make('p', 'No solves match. Change a filter or start a solve.', 'history-empty')]);
  }
  let summaryRing = null;
  function updateSummary(vm) {
    root.querySelector('.history-context').textContent = `${vm.summary.count} solves · PB ${vm.summary.pb} · ao5 ${vm.summary.ao5} · ao12 ${vm.summary.ao12}`;
    root.querySelector('.history-count').textContent = `${vm.summary.count} solves`;
    // "today · 2 sessions" and a ring with one arc per solve of today, coloured by how it ran against the ao12 before it.
    const today = new Date(Date.now()), sameDay = at => { const day = new Date(at); return day.getFullYear() === today.getFullYear() && day.getMonth() === today.getMonth() && day.getDate() === today.getDate(); };
    const sessionsToday = vm.sessions.filter(session => sameDay(session.lastAt));
    const solvesToday = sessionsToday.flatMap(session => session.solves).sort((a, b) => a.at - b.at);
    const shown = solvesToday.length ? solvesToday : vm.sessions.flatMap(session => session.solves).sort((a, b) => a.at - b.at).slice(-24);
    root.querySelector('.history-summary__today').textContent = solvesToday.length
      ? `today · ${sessionsToday.length} ${sessionsToday.length === 1 ? 'session' : 'sessions'}`
      : `${vm.sessions.length} ${vm.sessions.length === 1 ? 'session' : 'sessions'}`;
    const stats = root.querySelector('.history-summary__stats');
    stats.replaceChildren(...[['pb', vm.summary.pb, 'good'], ['ao12', vm.summary.ao12, ''], ['ao5', vm.summary.ao5, '']].map(([name, value, tone]) => {
      const item = make('div'); item.append(make('dt', name), make('dd', value)); if (tone) item.dataset.tone = tone; return item;
    }));
    const ringHost = root.querySelector('.history-summary__ring');
    const segments = shown.map(solve => ({ key: String(solve.at), weight: 1, fill: 1, state: solve.dnf ? 'bad' : solve.delta?.tone === 'good' ? 'good' : solve.delta?.tone === 'bad' ? 'wrong' : 'done' }));
    if (!summaryRing) summaryRing = createMiniOrbit(ringHost, { label: 'solves today', value: '', size: 48, segments, shape: 'full', labelStyle: 'side' });
    else summaryRing.update({ segments });
    ringHost.dataset.count = String(shown.length);
    ringHost.querySelector('.orbit-mini-row__copy')?.replaceChildren();
    if (!ringHost.querySelector('.history-summary__count')) ringHost.append(make('span', '', 'history-summary__count'));
    ringHost.querySelector('.history-summary__count').textContent = String(shown.length);
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
    if (route.kind === 'list') {
      // A-07: the primary action with its key, then replay as a text action. The edit menu lives on the past solve.
      const open = make('a', 'open this solve', 'history-open'); open.href = href(historyPath(record.at)); open.append(make('kbd', 'enter', 'key'));
      const replay = make('a', 'replay', 'history-replay-link'); replay.href = href(replayPath(record.at));
      actionsHost.append(open, replay);
      return;
    }
    if (route.kind === 'past' || route.kind === 'review') actionsHost.append(more);
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
  const ICONS = {
    previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 6-6 6 6 6M19 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 6 6 6-6 6M5 6l6 6-6 6"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.6" y="5.5" width="3.6" height="13" rx=".6" fill="currentColor" stroke="none"/><rect x="13.8" y="5.5" width="3.6" height="13" rx=".6" fill="currentColor" stroke="none"/></svg>',
  };
  const iconButton = (action, label, icon) => {
    const button = make('button', undefined, `history-transport__${icon}`); button.type = 'button'; button.dataset.action = action; button.setAttribute('aria-label', label); button.title = label; button.innerHTML = ICONS[icon]; return button;
  };
  function updateReplayInfo() {
    const record = currentRecord, moves = record?.solveMoves || [];
    const move = replayMove > 0 ? moves[replayMove - 1] : null;
    const info = replayHost.querySelector('.history-replay-info');
    if (!info) return;
    info.querySelector('.history-replay-info__move').textContent = move ? fmt.moves(move) : '—';
    // "pseudo pair · tap to see": the moment under the playhead, one tap from its review
    const pill = replayHost.querySelector('.history-replay-marker');
    const near = (viewModel().selected?.markers || []).filter(marker => Math.abs((marker.at ?? (marker.idx ?? 0) + 1) - replayMove) <= 2)
      .sort((a, b) => Math.abs((a.at ?? 0) - replayMove) - Math.abs((b.at ?? 0) - replayMove))[0];
    pill.hidden = !near;
    if (near) { pill.textContent = `${near.tone === 'good' ? '✦' : '○'} ${near.label} · tap to see`; pill.href = href(historyReviewPath(record.at, near.id)); pill.dataset.tone = near.tone === 'good' ? 'good' : 'bad'; }
  }
  function updateReplayControls() {
    if (!currentRecord || route.kind !== 'replay') { replayHost.hidden = true; replayHost.replaceChildren(); return; }
    replayHost.hidden = false;
    const existing = replayHost.querySelector('.history-transport');
    if (existing) {
      const toggle = replayHost.querySelector('[data-action="play"], [data-action="pause"]');
      toggle.dataset.action = playing ? 'pause' : 'play'; toggle.setAttribute('aria-label', playing ? 'pause' : 'play'); toggle.title = toggle.getAttribute('aria-label'); toggle.innerHTML = ICONS[playing ? 'pause' : 'play'];
      replayHost.querySelectorAll('[data-speed]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === replaySpeed)));
      const note = replayHost.querySelector('.history-timing-note'); note.textContent = viewModel().selected?.hasTiming ? '' : 'timing not recorded';
      updateReplayInfo(); updateKeys();
      return;
    }
    replayHost.replaceChildren();
    const info = make('div', undefined, 'history-replay-info');
    info.append(make('p', '', 'history-replay-info__move'), make('p', undefined, 'history-replay-info__help'));
    info.querySelector('.history-replay-info__help').innerHTML = '<span>drag the ring to scrub</span><span>tap an arc to jump to a stage</span><span>tap a marker to see it</span>';
    const transport = make('div', undefined, 'history-transport');
    const toggle = iconButton(playing ? 'pause' : 'play', playing ? 'pause' : 'play', playing ? 'pause' : 'play'); toggle.classList.add('history-transport__toggle');
    transport.append(iconButton('previous-marker', 'previous marker', 'previous'), toggle, iconButton('next-marker', 'next marker', 'next'));
    const speeds = make('div', undefined, 'history-speeds'); speeds.setAttribute('role', 'group'); speeds.setAttribute('aria-label', 'playback speed');
    [0.5, 1, 2].forEach(speed => { const button = make('button', `${speed}×`); button.type = 'button'; button.dataset.speed = String(speed); button.setAttribute('aria-pressed', String(speed === replaySpeed)); speeds.append(button); });
    const timing = make('p', viewModel().selected?.hasTiming ? '' : 'timing not recorded', 'history-timing-note');
    const pill = make('a', undefined, 'history-replay-marker'); pill.hidden = true;
    replayHost.append(info, transport, speeds, pill, timing);
    updateReplayInfo(); updateKeys();
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
    importHost.hidden = true; listHost.hidden = false; resultsHost.hidden = true; replayHost.hidden = true;
    renderSessions(vm);
    focusHost.classList.remove('is-replay', 'is-past');
    counter.textContent = '';
    if (record) updateStage(record, { move: record.solveMoves?.length || 0, animate: false });
    else {
      root.querySelector('.history-stage__number').textContent = '—';
      root.querySelector('.history-stage__subline').textContent = 'select a solve';
      orbit?.update({ segments: [], markers: [], size: 'XL', fitHost: true, shape: 'open', gap: 70, centerClearance: 150, label: 'solve orbit' }, { animate: false });
      cube?.setState(createSolvedState());
      cube?.clearHighlight();
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
          } else if (action.type === 'closeDetail') closeReviewDetail();
          else if (action.type === 'playVariant') void playReviewVariant(action.variant);
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
    importHost.hidden = true; listHost.hidden = true; resultsHost.hidden = false; replayHost.hidden = true;
    counter.textContent = `solve ${selectedIndex(record)} of ${chronologicalRows().length}`;
    focusHost.classList.remove('is-replay'); focusHost.classList.add('is-past');
    resultsHost.classList.remove('is-hidden');
    updateStage(record, { move: record.solveMoves?.length || 0, animate: false });
    await ensureResultsPresenter();
    if (!active || route.kind !== 'past' && route.kind !== 'review' || currentRecord?.at !== record.at) return;
    updatePastPresenter(record);
    makeActions(record, true);
  }
  function renderReplay(record, vm) {
    root.dataset.view = 'replay'; importHost.hidden = true; listHost.hidden = true; resultsHost.hidden = true; replayHost.hidden = false;
    root.querySelector('.history-data').open = false;
    counter.textContent = `replay · ${replaySpeed}×`;
    backLink.textContent = '‹ results'; backLink.href = href(historyPath(record.at));
    focusHost.classList.remove('is-past'); focusHost.classList.add('is-replay');
    replayMove = vm.selected?.move ?? replayMove;
    updateStage(record, { move: replayMove, animate: false });
    updateReplayControls();
    makeActions(record, false);
  }
  // Old review links ("#/review/<at>?move=7", from drills that came from a review) name a move, not a marker:
  // land on the moment nearest to it, or on the solve itself when none is close.
  function landOnMoment(vm) {
    const raw = new URLSearchParams(location.hash.split('?')[1] ?? '').get('move');
    if (raw == null || raw === '' || !Number.isFinite(Number(raw))) return false;
    const move = Number(raw);
    const nearest = (vm.selected?.markers ?? []).map(marker => ({ marker, distance: Math.abs((marker.idx ?? (marker.at ?? 1) - 1) - move) })).sort((a, b) => a.distance - b.distance)[0];
    location.replace(href(nearest && nearest.distance <= 3 ? historyReviewPath(currentRecord.at, nearest.marker.id) : historyPath(currentRecord.at)));
    return true;
  }
  function renderKeys() {
    const keys = {
      list: [{ key: 'j k', label: 'move' }, { key: 'enter', label: 'open' }, { key: '/', label: 'search' }],
      past: [{ key: 'esc', label: 'history' }, { key: '‹ ›', label: 'prev / next solve' }, { key: '[ ]', label: 'markers' }],
      review: [{ key: '[ ]', label: 'prev / next marker' }, { key: 'space', label: 'play line' }, { key: 'esc', label: 'back' }],
      replay: [{ key: 'space', label: 'play / pause' }, { key: '‹ ›', label: 'step' }, { key: '[ ]', label: 'markers' }, { key: 'esc', label: 'results' }],
      import: [],
    }[route.kind] ?? [];
    const bar = make('div', undefined, 'ui-key-bar'); bar.setAttribute('aria-label', 'keyboard shortcuts');
    for (const { key, label } of keys) {
      const item = make('span'); const kbd = make('kbd', undefined, 'key');
      kbd.textContent = key;
      item.append(kbd, make('span', label)); bar.append(item);
    }
    const right = make('p', currentRecord && ['past', 'review'].includes(route.kind) ? `${whenText(currentRecord.at)} · ${currentRecord.focus || 'speed'} · ${currentRecord.source === 'manual' ? 'manual' : currentRecord.source === 'import' ? 'import' : 'cube'}` : '', 'history-keybar__meta');
    keyHost.replaceChildren(bar, right);
  }
  const updateKeys = () => renderKeys();
  function render() {
    if (!store || !active) return;
    if (route.kind === 'import') { renderImport(); return; }
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
    if (route.kind === 'past' && currentRecord && landOnMoment(vm)) return;
    if (route.kind === 'replay' && currentRecord) renderReplay(currentRecord, vm);
    else if ((route.kind === 'past' || route.kind === 'review') && currentRecord) void renderPast(currentRecord);
    else renderList(vm, currentRecord);
    renderKeys();
  }

  // --- #/history/import (also where the old #/review/import lands): paste a scramble and solution, then
  // open the stored solve in the history review. Parsing and cube-state checks stay on this device.
  function renderImport() {
    root.dataset.view = 'import';
    listHost.hidden = true; resultsHost.hidden = true; replayHost.hidden = true; importHost.hidden = false;
    counter.textContent = '';
    if (importHost.dataset.ready !== 'true') {
      importHost.dataset.ready = 'true';
      importHost.innerHTML = `<form class="history-import__form"><h2>import a solve</h2>
        <p>Paste a scramble and solution, or import an alg.cubing.net link. Parsing and cube-state checks stay on this device.</p>
        <label>alg.cubing.net link<input name="url" inputmode="url" autocomplete="url" placeholder="https://alg.cubing.net/?setup=…&amp;alg=…"></label>
        <button type="button" data-action="decode">use link fields</button>
        <label>scramble<textarea name="scramble" rows="3" spellcheck="false" placeholder="R U R′ U′"></textarea></label>
        <label>solution<textarea name="solution" rows="5" spellcheck="false" placeholder="U R U′ R′"></textarea></label>
        <p class="history-import__error" role="alert" hidden></p>
        <div class="history-import__actions"><button class="history-import__submit" type="submit">check and review</button><a href="#/history">back to history</a></div></form>`;
    }
    renderKeys();
  }
  async function submitImport(form) {
    const field = name => form.elements.namedItem(name);
    const error = form.querySelector('.history-import__error');
    error.hidden = true;
    try {
      const result = buildImportedReconstruction({ scramble: field('scramble').value, solution: field('solution').value });
      const imported = store.append({ ...result.record, solved: result.solves });
      if (!imported) throw new Error('History is read-only, so this reconstruction cannot be saved.');
      await store.flush();
      // Analyse before landing so the review opens with its moments, then save the summary on the record.
      let analysis = null;
      try { analysis = await analysisClient().analyze(imported); } catch { /* the solve still opens; its review says it is unanalysed */ }
      if (analysis) {
        store.update(imported.at, { analysis, ollCase: analysis.lastLayer?.oll?.caseId ?? null, pllCase: analysis.lastLayer?.pll?.caseId ?? null });
        await store.flush();
      }
      location.hash = href(historyPath(imported.at));
    } catch (cause) { error.hidden = false; error.textContent = cause.message ?? 'The reconstruction could not be checked.'; }
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
    if (action === 'decode') {
      const form = target.closest('form'), error = form.querySelector('.history-import__error');
      try { const decoded = parseAlgCubingUrl(form.elements.url.value.trim()); form.elements.scramble.value = decoded.scramble; form.elements.solution.value = decoded.solution; error.hidden = true; }
      catch (cause) { error.hidden = false; error.textContent = cause.message; }
      return;
    }
    if (action === 'play') play();
    else if (action === 'pause') { stopPlayback(); updateReplayControls(); }
    else if (action === 'previous-marker') markerMove(currentRecord, -1);
    else if (action === 'next-marker') markerMove(currentRecord, 1);
    else if (target.dataset.speed) { replaySpeed = Number(target.dataset.speed); counter.textContent = `replay · ${replaySpeed}×`; updateReplayControls(); }
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
  function closeReviewDetail() {
    if (!currentRecord) return;
    reviewPlaybackGeneration++; cube?.stop(); inlineReviewDetail = null; reviewVariant = 'yours'; reviewCursor = null;
    if (route.kind === 'review') location.hash = href(historyPath(currentRecord.at));
    else void renderPast(currentRecord);
  }
  function moveSelection(step) {
    const rows = [...root.querySelectorAll('.history-solve a')];
    if (!rows.length) return;
    const index = rows.findIndex(row => Number(row.dataset.at) === selectedAt);
    const next = rows[Math.max(0, Math.min(rows.length - 1, (index < 0 ? 0 : index) + step))];
    selectedAt = Number(next.dataset.at); render();
    root.querySelector(`.history-solve a[data-at="${selectedAt}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function neighbourSolve(step) {
    const rows = chronologicalRows(), index = rows.findIndex(item => item.at === currentRecord?.at);
    const target = rows[index + step];
    if (target) location.hash = href(historyPath(target.at));
  }
  function reviewMarkerStep(step) {
    const markers = viewModel().selected?.markers || [];
    if (!markers.length || !currentRecord) return;
    const index = markers.findIndex(item => item.id === route.marker);
    const target = markers[index < 0 ? (step > 0 ? 0 : markers.length - 1) : Math.max(0, Math.min(markers.length - 1, index + step))];
    location.hash = href(historyReviewPath(currentRecord.at, target.id));
  }
  function onKeyDown(event) {
    if (!active || event.metaKey || event.ctrlKey || event.altKey) return;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (event.key === 'Escape' && (route.kind === 'review' || inlineReviewDetail)) {
      event.preventDefault(); closeReviewDetail(); return;
    }
    if (typing) return;
    if (route.kind === 'list') {
      if (event.key === 'j' || event.key === 'ArrowDown') { event.preventDefault(); moveSelection(1); }
      else if (event.key === 'k' || event.key === 'ArrowUp') { event.preventDefault(); moveSelection(-1); }
      else if (event.key === 'Enter' && currentRecord && !event.target.closest?.('a, button, summary')) { event.preventDefault(); location.hash = href(historyPath(currentRecord.at)); }
      else if (event.key === '/') { event.preventDefault(); form.elements.query.focus(); }
      return;
    }
    if (route.kind === 'past' && currentRecord) {
      if (event.key === 'Escape') { event.preventDefault(); location.hash = '#/history'; }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); neighbourSolve(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); neighbourSolve(1); }
      else if (event.key === ' ' && !event.target.closest?.('button, a, summary')) { event.preventDefault(); location.hash = href(replayPath(currentRecord.at)); }
      else if (event.key === '[' || event.key === ']') { event.preventDefault(); reviewMarkerStep(event.key === '[' ? -1 : 1); }
      return;
    }
    if (route.kind === 'review') {
      if (event.key === '[' || event.key === ']') { event.preventDefault(); reviewMarkerStep(event.key === '[' ? -1 : 1); }
      else if (event.key === ' ' && !event.target.closest?.('button, a, summary')) { event.preventDefault(); void playReviewVariant('better'); }
      return;
    }
    if (route.kind !== 'replay') return;
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
  root.addEventListener('submit', event => { if (event.target.closest('.history-import__form')) { event.preventDefault(); void ready.then(() => submitImport(event.target.closest('form'))); } });
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
  orbit = new Orbit(orbitHost, { segments: [], size: 'XL', fitHost: true, shape: 'open', gap: 70, centerClearance: 150, label: 'solve orbit' });
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
