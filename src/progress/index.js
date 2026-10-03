import '../pages/page.css';
import './progress.css';
import { loadSettings } from '../brain/settings.js';
import { createSolvedState } from '../cross-cube.js';
import { syncPageTokens } from '../pages/tokens.js';
import { openHistory } from '../store/history.js';
import { listSessions } from '../store/sessions.js';
import { readProgress } from './adapter.js';
import { buildProgressViewModel } from './view-model.js';
import { algDatabase } from '../algs/runtime.js';
import { loadLearning } from '../learning.js';
import { Orbit } from '../ui/orbit/index.js';
import { buildWeeklyReport, goalProgress, readGoal, saveGoal, clearGoal } from '../goals/adapter.js';
import { createShareCardPng } from '../goals/share-card.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const seconds = ms => ms === Infinity ? 'DNF' : Number.isFinite(ms) ? (Math.floor(ms / 10) / 100).toFixed(2) : '—';
const percent = n => Number.isFinite(n) ? `${Math.round(n * 100)}%` : null;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function drillMeta(row) {
  const parts = [plural(row.rounds, 'round'), plural(row.cases, 'case')];
  if (row.accuracy != null) parts.push(`${percent(row.accuracy)} correct`);
  if (Number.isFinite(row.medianMs)) parts.push(`${seconds(row.medianMs)} s median`);
  if (row.trendMs != null) parts.push(`${seconds(Math.abs(row.trendMs))} s ${row.trendMs <= 0 ? 'faster' : 'slower'} in recent rounds`);
  parts.push(`${plural(row.due, 'case')} due`);
  if (row.lifetime?.attempts) parts.push(`${plural(row.lifetime.attempts, 'answer')} all time`);
  return parts.join(' · ');
}

export function createProgressPage(host, { storage = globalThis.localStorage } = {}) {
  const page = document.createElement('section'); page.className = 'brain cs-page progress-page';
  let active = false, detached = false, history = null, algorithms = [], refreshId = 0, lifecycleGeneration = 0;
  let cube = null, cubeLoad = null, orbit = null, viewModel = null, miniOrbits = [];
  let selectedView = readGoal(storage) ? 'goal' : 'splits';
  let goalFormError = '', shareStatus = 'share latest solve · PNG';
  const filters = { session: 'all', source: 'smart', focus: 'speed', days: '30' };

  const intro = document.createElement('header'); intro.className = 'cs-head progress-heading';
  const title = document.createElement('h1'); title.textContent = 'progress';
  const subtitle = document.createElement('p'); subtitle.className = 'cs-sub'; subtitle.textContent = 'stage averages, drills, and your ao12 goal.';
  intro.append(title, subtitle);

  const filterForm = document.createElement('form'); filterForm.className = 'progress-filters'; filterForm.setAttribute('aria-label', 'Progress filters');
  filterForm.innerHTML = '<label>session<select name="session" aria-label="session"><option value="all">all sessions</option></select></label><label>solve source<select name="source" aria-label="solve source"><option value="smart">cube</option><option value="manual">manual</option><option value="all">all solves</option></select></label><label>focus<select name="focus" aria-label="focus"><option value="speed">speed</option><option value="flow">flow</option><option value="learning">learning</option><option value="all">all focuses</option></select></label><label>period<select name="days" aria-label="period"><option value="7">7 days</option><option value="30">30 days</option><option value="all">all time</option></select></label><label>view<select name="view" aria-label="progress ring view"><option value="splits">stage averages</option><option value="goal">ao12 goal</option></select></label>';

  const visual = document.createElement('section'); visual.className = 'progress-visual'; visual.setAttribute('aria-label', 'Progress Orbit');
  const orbitWrap = document.createElement('div'); orbitWrap.className = 'progress-orbit-wrap';
  const orbitHost = document.createElement('div'); orbitHost.className = 'progress-orbit-host'; orbitHost.setAttribute('data-primary-orbit', '');
  const cubeMount = document.createElement('div'); cubeMount.className = 'progress-cube-mount'; cubeMount.setAttribute('aria-label', '3D cube at the center of the Orbit');
  orbitWrap.append(orbitHost, cubeMount);
  const orbitCaption = document.createElement('p'); orbitCaption.className = 'progress-caption'; orbitCaption.setAttribute('data-orbit-caption', '');
  const splitEmpty = document.createElement('p'); splitEmpty.className = 'progress-empty'; splitEmpty.setAttribute('data-split-empty', '');
  visual.append(orbitWrap, orbitCaption, splitEmpty);

  const content = document.createElement('div'); content.className = 'progress-content';
  page.append(intro, filterForm, visual, content);
  host.replaceChildren(page);

  function mountCube() {
    if (cubeLoad || cube || detached || !active) return;
    const generation = lifecycleGeneration;
    const pending = import('../ui/cube/index.js').then(({ createCube }) => {
      if (detached || !active || generation !== lifecycleGeneration || !cubeMount.isConnected) return null;
      const mountedCube = createCube(cubeMount, { state: createSolvedState(), mode: 'case', size: 'M', label: '3D cube at the center of the progress Orbit' });
      if (detached || !active || generation !== lifecycleGeneration || !cubeMount.isConnected) { mountedCube.destroy(); return null; }
      cube = mountedCube;
      return mountedCube;
    }).catch(() => {
      if (!detached && active && generation === lifecycleGeneration && cubeMount.isConnected) cubeMount.textContent = '3D cube preview unavailable.';
      return null;
    }).finally(() => {
      if (cubeLoad === pending) cubeLoad = null;
      if (active && !detached && !cube && generation !== lifecycleGeneration) mountCube();
    });
    cubeLoad = pending;
  }

  const historyReady = openHistory().then(store => { history = store; }).catch(() => {});
  async function refresh() {
    const id = ++refreshId;
    const result = await algDatabase.progressFor(null, { learningData: loadLearning(storage, 'cubesight-alg-learning-v1') }).catch(() => null);
    if (detached || id !== refreshId) return;
    algorithms = result?.items ?? [];
    render();
  }
  const ready = historyReady.then(refresh);

  function renderContent(model) {
    const goal = model.goal;
    const goalLine = goal.targetSeconds == null
      ? 'ao12 goal · not set'
      : `ao12 ${goal.currentLabel} · baseline ${goal.baselineLabel ?? 'not captured'} · target ${goal.targetLabel}`;
    content.innerHTML = `<section class="progress-section progress-drill-section" aria-label="Drills"><h2>drills · ${plural(model.due, 'case')} due</h2><p class="progress-caption">${escape(model.drillCaption)}</p><ul class="progress-drills">${model.drills.map(row => `<li class="progress-drill-row"><span class="progress-mini-orbit" data-mini-orbit="${escape(row.id)}" aria-hidden="true"></span><a class="progress-drill-name" href="${escape(row.href)}">${escape(row.title)}</a><span class="progress-drill-meta">${escape(drillMeta(row))}</span></li>`).join('')}</ul><a class="progress-link" href="#/drills?review=due">${model.due ? `${plural(model.due, 'case')} due · drill now` : 'start a round'} ›</a></section>
      <section class="progress-section progress-goals" aria-label="ao12 goal"><h2>goal</h2><p>${escape(goalLine)}</p><p class="progress-caption">${escape(goal.message)}</p>${goal.formError ? `<p role="status">${escape(goal.formError)}</p>` : ''}<form data-goal-form><label>ao12 target in seconds<input name="target" type="number" min="1" max="120" step="0.01" required placeholder="15.00" value="${goal.targetSeconds == null ? '' : goal.targetSeconds.toFixed(2)}"></label><button type="submit">save goal</button><button type="button" data-clear-goal ${goal.targetSeconds == null ? 'disabled' : ''}>clear</button></form></section>
      <section class="progress-section progress-weekly" aria-label="This week"><h2>this week</h2><p>${escape(model.weekly.summary || 'No solves or drill rounds this week.')}</p><button type="button" data-share-solve>${escape(model.shareStatus)}</button><a href="${model.historyHref}" class="progress-link">export or import data ›</a></section>`;
    miniOrbits.forEach(item => item.destroy());
    miniOrbits = [...content.querySelectorAll('[data-mini-orbit]')].map(node => {
      const row = model.drills.find(item => item.id === node.dataset.miniOrbit);
      return new Orbit(node, { shape: 'full', size: 'mini', glyphSize: 26, label: `${row.title} · ${row.glyph.value}`, segments: [row.glyph] });
    });
  }

  function render() {
    if (detached) return;
    page.dataset.brainStyle = loadSettings(storage).style;
    const now = Date.now();
    const periodStart = filters.days === 'all' ? -Infinity : now - Math.max(1, Number(filters.days) || 30) * 86_400_000;
    const records = history?.records ?? [];
    const cohort = records.filter(record => record.at >= periodStart && record.at <= now
      && (filters.source === 'all' || (filters.source === 'smart' ? record.source !== 'manual' && record.source !== 'import' : record.source === filters.source))
      && (filters.focus === 'all' || (record.focus ?? 'speed') === filters.focus));
    const sessionOptions = listSessions(cohort).reverse().map(session => ({
      ...session,
      label: `${new Date(session.firstAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${plural(session.count, 'solve')} · ${session.focus}`,
    }));
    if (filters.session !== 'all' && !sessionOptions.some(session => session.id === filters.session)) filters.session = 'all';
    const data = readProgress(storage, { ...filters, algorithms, ...(history ? { records: history.records } : {}), now });
    const goal = readGoal(storage), currentMs = data.stats.ao12;
    const goalState = goalProgress(goal, Number.isFinite(currentMs) ? currentMs / 1000 : null);
    const savedRounds = (() => { try { const raw = JSON.parse(storage?.getItem('cubesight-rounds-v1') ?? '[]'); return Array.isArray(raw) ? raw : raw?.rounds ?? []; } catch { return []; } })();
    const weeklySolves = filters.session === 'all' ? records : records.filter(record => record.sessionId === filters.session);
    const weekly = buildWeeklyReport({ solves: weeklySolves, rounds: savedRounds }, { source: filters.source, focus: filters.focus, now });
    viewModel = buildProgressViewModel({ filters, data, goal, goalState, weekly, sessions: sessionOptions, selectedView, goalFormError, shareStatus });
    orbit?.update(viewModel.orbit);
    orbitCaption.hidden = false;
    orbitCaption.textContent = selectedView === 'goal' ? viewModel.goal.caption : viewModel.splitCaption;
    splitEmpty.hidden = !viewModel.emptySplits || selectedView === 'goal';
    splitEmpty.textContent = filters.source === 'manual' && selectedView === 'splits'
      ? 'Manual solves do not include recorded stage splits.'
      : 'Finish a cube solve with recorded stages to see its split averages.';
    renderContent(viewModel);
    const sessionSelect = filterForm.querySelector('[name="session"]');
    sessionSelect.replaceChildren(new Option('all sessions', 'all'), ...viewModel.sessions.map(session => new Option(session.label, session.id)));
    for (const [key, value] of Object.entries({ ...filters, view: selectedView })) filterForm.querySelector(`[name="${key}"]`).value = value;
    syncPageTokens(page);
  }

  filterForm.addEventListener('change', event => {
    const key = event.target.name;
    if (!active) return;
    if (key === 'view') selectedView = event.target.value === 'goal' ? 'goal' : 'splits';
    else if (Object.hasOwn(filters, key)) filters[key] = event.target.value;
    else return;
    render();
  });
  content.addEventListener('submit', event => {
    if (!event.target.matches('[data-goal-form]')) return;
    event.preventDefault();
    const data = readProgress(storage, { ...filters, ...(history ? { records: history.records } : {}) });
    const currentMs = data.stats.ao12;
    try {
      saveGoal(storage, { targetSeconds: content.querySelector('[name="target"]').value, baselineSeconds: Number.isFinite(currentMs) ? currentMs / 1000 : null });
      selectedView = 'goal'; goalFormError = ''; render();
    } catch (error) { goalFormError = error.message; render(); }
  });
  content.addEventListener('click', async event => {
    if (event.target.closest('[data-clear-goal]')) { clearGoal(storage); goalFormError = ''; selectedView = 'splits'; render(); return; }
    const button = event.target.closest('[data-share-solve]');
    if (!button) return;
    try {
      const latestData = readProgress(storage, { ...filters, algorithms, ...(history ? { records: history.records } : {}) });
      const latest = latestData.solves.at(-1);
      if (!latest) throw new Error('Finish a solve before sharing its Orbit.');
      const blob = await createShareCardPng(latest), url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'cubesight-solve.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      shareStatus = 'PNG saved'; render();
    } catch (error) { shareStatus = error.message; render(); }
  });
  const onTheme = () => { if (active) render(); };
  document.addEventListener('cubesight-theme', onTheme);
  orbit = new Orbit(orbitHost, { shape: 'full', size: 'L', label: 'average split by stage', centerClearance: 105, segments: [], onSegment: segment => { if (segment.href) location.hash = segment.href; } });
  render();

  return {
    get ready() { return Promise.all([ready, cubeLoad ?? Promise.resolve(null)]); },
    getViewModel() { return viewModel; },
    setActive(value) {
      if (detached) return;
      const next = Boolean(value);
      if (next === active) return;
      active = next;
      lifecycleGeneration++;
      if (!active) {
        refreshId++;
        cube?.destroy?.(); cube = null;
        return;
      }
      render(); mountCube();
      const generation = lifecycleGeneration;
      void (history ? history.reload().catch(() => {}) : historyReady).then(() => {
        if (active && !detached && generation === lifecycleGeneration) return refresh();
      });
    },
    detach() {
      detached = true; active = false; lifecycleGeneration++; refreshId++;
      document.removeEventListener('cubesight-theme', onTheme);
      cube?.destroy?.(); cube = null;
      orbit?.destroy(); orbit = null;
      miniOrbits.forEach(item => item.destroy()); miniOrbits = [];
      if (page.parentNode === host) page.remove();
    },
  };
}
