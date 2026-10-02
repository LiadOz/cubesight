import '../pages/page.css';
import './progress.css';
import { loadSettings } from '../brain/settings.js';
import { createSolvedState } from '../cross-cube.js';
import { syncPageTokens } from '../pages/tokens.js';
import { openHistory } from '../store/history.js';
import { readProgress } from './adapter.js';
import { algDatabase } from '../algs/runtime.js';
import { loadLearning } from '../learning.js';
import { Orbit } from '../ui/orbit/index.js';
import { buildWeeklyReport, goalProgress, readGoal, saveGoal, clearGoal } from '../goals/adapter.js';
import { createShareCardPng } from '../goals/share-card.js';
import { inFocus, inStatsSource } from '../store/focus.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const seconds = ms => ms === Infinity ? 'DNF' : Number.isFinite(ms) ? (Math.floor(ms / 10) / 100).toFixed(2) : '—';
const percent = n => Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export function trendMarkup(points) {
  const finite = points.filter(p => Number.isFinite(p.ms));
  if (finite.length < 2) return '<p class="progress-empty">An ao12 trend appears after 13 timed solves.</p>';
  const min = Math.min(...finite.map(p => p.ms)), max = Math.max(...finite.map(p => p.ms)), span = Math.max(100, max - min), start = points[0].at, end = Math.max(start + 1, points.at(-1).at);
  const xy = p => [12 + ((p.at - start) / (end - start)) * 616, 16 + ((max - p.ms) / span) * 108];
  let path = '', disconnected = true;
  for (const p of points) {
    if (!Number.isFinite(p.ms)) { disconnected = true; continue; }
    const [x, y] = xy(p); path += `${disconnected ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`; disconnected = false;
  }
  return `<svg class="progress-trend" viewBox="0 0 640 145" role="img" aria-label="ao12 trend over solve dates"><path d="${path}"></path>${finite.map(p => { const [x, y] = xy(p); return `<circle cx="${x}" cy="${y}" r="4" tabindex="0"><title>${escape(new Date(p.at).toLocaleString())} · ao12 ${seconds(p.ms)}</title></circle>`; }).join('')}</svg><p class="progress-caption">ao12 · ${seconds(min)}–${seconds(max)} · hover or focus a point for its date</p>`;
}

export function createProgressPage(host, { storage = globalThis.localStorage } = {}) {
  const page = document.createElement('section'); page.className = 'brain cs-page progress-page';
  let active = false, detached = false, history = null, algorithms = [], refreshId = 0, cube = null, cubeLoad = null;
  let goalOrbit = null;
  const filters = { source: 'smart', focus: 'speed', days: '30' };
  const hero = document.createElement('section'); hero.className = 'progress-hero';
  const intro = document.createElement('header'); intro.className = 'cs-head progress-hero-copy';
  const title = document.createElement('h1'); title.textContent = 'progress';
  const subtitle = document.createElement('p'); subtitle.className = 'cs-sub'; subtitle.textContent = 'solves, drills, and what’s ready again.';
  intro.append(title, subtitle);
  const stage = document.createElement('div'); stage.className = 'progress-hero-stage'; stage.setAttribute('aria-label', '3D cube preview');
  const cubeMount = document.createElement('div'); cubeMount.className = 'progress-cube-mount'; cubeMount.setAttribute('aria-label', '3D cube');
  stage.append(cubeMount);
  hero.append(intro, stage);
  const filterForm = document.createElement('form'); filterForm.className = 'progress-filters'; filterForm.setAttribute('aria-label', 'Progress filters');
  filterForm.innerHTML = '<label>solve source<select name="source" aria-label="solve source"><option value="smart">cube</option><option value="manual">manual</option><option value="all">all solves</option></select></label><label>focus<select name="focus" aria-label="focus"><option value="speed">speed</option><option value="flow">flow</option><option value="learning">learning</option><option value="all">all focuses</option></select></label><label>period<select name="days" aria-label="period"><option value="7">7 days</option><option value="30">30 days</option><option value="all">all time</option></select></label>';
  const content = document.createElement('div'); content.className = 'progress-content';
  page.append(hero, filterForm, content);
  host.replaceChildren(page);

  function mountCube() {
    if (cubeLoad || cube || detached) return;
    cubeLoad = import('../pages/cube-view.js').then(async ({ createPageCube }) => {
      if (detached || !cubeMount.isConnected) return null;
      const instance = await createPageCube(cubeMount, { state: createSolvedState(), mode: 'corner' });
      if (detached || !cubeMount.isConnected) { instance?.destroy?.(); return null; }
      cube = instance;
      return instance;
    }).catch(() => {
      if (!detached && cubeMount.isConnected) cubeMount.textContent = '3D cube preview unavailable.';
      return null;
    });
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
  function render() {
    if (detached) return;
    page.dataset.brainStyle = loadSettings(storage).style;
    const data = readProgress(storage, { ...filters, algorithms, ...(history ? { records: history.records } : {}) });
    content.innerHTML = `<section class="progress-card" aria-label="Solve progress"><div class="progress-stats"><div><span>timed solves</span><strong>${data.stats.timedCount}</strong></div><div><span>PB</span><strong>${seconds(data.stats.best)}</strong></div><div><span>ao5</span><strong>${seconds(data.stats.ao5)}</strong></div><div><span>ao12</span><strong>${seconds(data.stats.ao12)}</strong></div></div>${trendMarkup(data.trend)}<a class="progress-link" href="#/history">see solve history ›</a></section>
      <section class="progress-card"><h2>where your time goes</h2>${data.splits.length ? `<div class="progress-splits">${data.splits.map(row => `<a href="${row.href}" ${row.largest ? 'class="is-largest"' : ''}><span>${row.label}</span><strong>${seconds(row.ms)} s</strong><small>${plural(row.samples, 'solve')} · drill this ›</small></a>`).join('')}</div>` : '<p class="progress-empty">Finish a cube solve with recorded stages to see its split times.</p>'}</section>
      <section class="progress-card"><div class="progress-section-head"><h2>drills</h2><a class="progress-link" href="#/drills?review=due">${data.due ? `${plural(data.due, 'case')} due · drill now ›` : 'start a round ›'}</a></div><p class="progress-caption">Rounds follow the period filter. Earlier cases appear as all-time totals.</p><div class="progress-drills">${data.drills.map(row => `<article><a class="progress-drill-name" href="${row.href}">${row.title} ›</a><p>${plural(row.rounds, 'round')} · ${plural(row.cases, 'case')}</p><div><span>${percent(row.accuracy)} correct</span><span>${seconds(row.medianMs)} s median of round medians</span></div>${row.trendMs != null ? `<p>${seconds(Math.abs(row.trendMs))} s ${row.trendMs <= 0 ? 'faster' : 'slower'} in the latest five rounds</p>` : ''}${row.lifetime?.attempts ? `<small>${plural(row.lifetime.attempts, 'answer')} all time${row.lifetime.accuracy != null ? ` · ${percent(row.lifetime.accuracy)} correct` : ''}${row.lifetime.medianMs != null ? ` · ${seconds(row.lifetime.medianMs)} s median` : ''}</small>` : ''}<a href="${row.href}?review=due" class="progress-due">${plural(row.due, 'case')} due</a></article>`).join('')}</div></section>
      <section class="progress-card progress-goals"><h2>goal</h2><div class="progress-goal-row"><div data-goal-orbit aria-label="ao12 goal progress"></div><div><strong data-goal-copy></strong><p data-goal-note></p></div></div><form data-goal-form><label>ao12 target in seconds<input name="target" type="number" min="1" max="120" step="0.01" required placeholder="15.00"></label><button type="submit">save goal</button><button type="button" data-clear-goal>clear</button></form></section>
      <section class="progress-card progress-weekly"><h2>this week</h2><p data-weekly-copy></p><button type="button" data-share-solve>share latest solve · PNG</button><a href="#/history" class="progress-link">export or import data ›</a></section>
      <section class="progress-card"><h2>activity</h2><p class="progress-caption">Selected solves and drill cases by day.</p>${data.activity.length ? `<ol class="progress-activity">${data.activity.map(day => `<li><time datetime="${day.date}">${day.date}</time><strong>${plural(day.solves, 'solve')} · ${plural(day.cases, 'case')}</strong><span aria-hidden="true" class="progress-day" style="--activity-strength:${Math.min(1, (day.solves + day.cases) / 20)}"></span></li>`).join('')}</ol>` : '<p class="progress-empty">Your first solve or drill round starts this view.</p>'}<a href="#/history" class="progress-link">export or import data ›</a></section>`;
    goalOrbit?.destroy(); goalOrbit = null;
    const goal = readGoal(storage), currentMs = data.stats.ao12;
    const goalState = goalProgress(goal, Number.isFinite(currentMs) ? currentMs / 1000 : null);
    const goalCopy = content.querySelector('[data-goal-copy]'), goalNote = content.querySelector('[data-goal-note]');
    content.querySelector('[name="target"]').value = goal ? goal.targetSeconds.toFixed(2) : '';
    content.querySelector('[data-clear-goal]').disabled = !goal;
    const goalTime = currentMs === Infinity ? 'DNF' : seconds(currentMs);
    goalCopy.textContent = goal ? `ao12 ${goalTime} → ${goal.targetSeconds.toFixed(2)} s` : 'set an ao12 target';
    goalNote.textContent = goal ? (goalState.reached ? 'goal reached' : currentMs === Infinity ? 'this ao12 is a DNF; finish a clean ao12 to track progress.' : goalState.percent == null ? '12 timed solves will start this ring' : goalState.mode === 'proximity' ? `target proximity · ${Math.round(goalState.percent)}%` : `${Math.round(goalState.percent)}% toward goal`) : 'track progress on the Orbit';
    if (goal) goalOrbit = new Orbit(content.querySelector('[data-goal-orbit]'), { shape: 'full', size: 'mini', glyphSize: 48, label: `ao12 ${goalState.mode} · ${Math.round(goalState.percent ?? 0)}%`, segments: [{ key: 'goal', label: 'goal', value: `${Math.round(goalState.percent ?? 0)}%`, weight: 1, fill: (goalState.percent ?? 0) / 100, state: goalState.reached ? 'good' : 'current' }] });
    content.querySelector('[data-goal-form]').addEventListener('submit', event => {
      event.preventDefault();
      try { saveGoal(storage, { targetSeconds: content.querySelector('[name="target"]').value, baselineSeconds: Number.isFinite(currentMs) ? currentMs / 1000 : null }); render(); }
      catch (error) { goalNote.textContent = error.message; }
    });
    content.querySelector('[data-clear-goal]').addEventListener('click', () => { clearGoal(storage); render(); });
    const savedRounds = (() => { try { const raw = JSON.parse(storage?.getItem('cubesight-rounds-v1') ?? '[]'); return Array.isArray(raw) ? raw : raw?.rounds ?? []; } catch { return []; } })();
    const weekly = buildWeeklyReport({ solves: history?.records ?? [], rounds: savedRounds }, { source: filters.source, focus: filters.focus });
    const weeklyCopy = content.querySelector('[data-weekly-copy]');
    weeklyCopy.textContent = `${plural(weekly.solves, 'solve')} · ${plural(weekly.rounds, 'round')} · ${plural(weekly.cases, 'case')}${weekly.ao12Ms != null ? ` · ao12 ${weekly.ao12Ms === Infinity ? 'DNF' : seconds(weekly.ao12Ms)}` : ''}${weekly.improvedMost ? ` · ${weekly.improvedMost.key} improved ${seconds(Math.abs(weekly.improvedMost.changeMs))} s` : ''}`;
    content.querySelector('[data-share-solve]').addEventListener('click', async event => {
      const button = event.currentTarget;
      try {
        const records = history?.records ?? [];
        const cohort = [...inStatsSource(filters.focus === 'all' ? records : inFocus(records, filters.focus), filters.source)];
        const latest = cohort.sort((a, b) => b.at - a.at)[0];
        if (!latest) throw new Error('Finish a solve before sharing its Orbit.');
        const blob = await createShareCardPng(latest), url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'cubesight-solve.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        button.textContent = 'PNG saved';
      } catch (error) { button.textContent = error.message; }
    });
    for (const [key, value] of Object.entries(filters)) filterForm.querySelector(`[name="${key}"]`).value = value;
    syncPageTokens(page);
  }
  filterForm.addEventListener('change', event => {
    const key = event.target.name;
    if (!active || !Object.hasOwn(filters, key)) return;
    filters[key] = event.target.value; render();
  });
  const onTheme = () => { if (active) render(); };
  document.addEventListener('cubesight-theme', onTheme);
  render();
  return {
    get ready() { return Promise.all([ready, cubeLoad ?? Promise.resolve(null)]); },
    setActive(value) { active = Boolean(value); if (active) { render(); mountCube(); void (history ? history.reload().catch(() => {}) : historyReady).then(() => { if (active && !detached) return refresh(); }); } },
    detach() {
      detached = true; active = false; refreshId++;
      document.removeEventListener('cubesight-theme', onTheme);
      cube?.destroy?.(); cube = null;
      goalOrbit?.destroy?.(); goalOrbit = null;
      if (page.parentNode === host) page.remove();
    },
  };
}
