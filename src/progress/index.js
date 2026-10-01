import '../pages/page.css';
import './progress.css';
import { loadSettings } from '../brain/settings.js';
import { syncPageTokens } from '../pages/tokens.js';
import { openHistory } from '../store/history.js';
import { readProgress } from './adapter.js';
import { algDatabase } from '../algs/runtime.js';
import { loadLearning } from '../learning.js';

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
  let active = false, detached = false, history = null, algorithms = [], refreshId = 0;
  const filters = { source: 'smart', focus: 'speed', days: '30' };
  host.replaceChildren(page);
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
    page.innerHTML = `<header class="cs-head"><h1>progress</h1><p class="cs-sub">Solves, drills, and what’s ready for another look.</p></header>
      <form class="progress-filters" aria-label="Progress filters"><label>solve source<select name="source" aria-label="solve source"><option value="smart">cube</option><option value="manual">manual</option><option value="all">all solves</option></select></label><label>focus<select name="focus" aria-label="focus"><option value="speed">speed</option><option value="flow">flow</option><option value="learning">learning</option><option value="all">all focuses</option></select></label><label>period<select name="days" aria-label="period"><option value="7">7 days</option><option value="30">30 days</option><option value="all">all time</option></select></label></form>
      <section class="progress-card" aria-label="Solve progress"><div class="progress-stats"><div><span>timed solves</span><strong>${data.stats.timedCount}</strong></div><div><span>PB</span><strong>${seconds(data.stats.best)}</strong></div><div><span>ao5</span><strong>${seconds(data.stats.ao5)}</strong></div><div><span>ao12</span><strong>${seconds(data.stats.ao12)}</strong></div></div>${trendMarkup(data.trend)}<a class="progress-link" href="#/history">see solve history ›</a></section>
      <section class="progress-card"><h2>where your time goes</h2>${data.splits.length ? `<div class="progress-splits">${data.splits.map(row => `<a href="${row.href}" ${row.largest ? 'class="is-largest"' : ''}><span>${row.label}</span><strong>${seconds(row.ms)} s</strong><small>${plural(row.samples, 'solve')} · drill this ›</small></a>`).join('')}</div>` : '<p class="progress-empty">Finish a cube solve with recorded stages to see its split times.</p>'}</section>
      <section class="progress-card"><div class="progress-section-head"><h2>drills</h2><a class="progress-link" href="#/drills?review=due">${data.due ? `${plural(data.due, 'case')} due · review now ›` : 'start a round ›'}</a></div><p class="progress-caption">Rounds follow the period filter. Earlier cases appear as all-time totals.</p><div class="progress-drills">${data.drills.map(row => `<article><a class="progress-drill-name" href="${row.href}">${row.title} ›</a><p>${plural(row.rounds, 'round')} · ${plural(row.cases, 'case')}</p><div><span>${percent(row.accuracy)} correct</span><span>${seconds(row.medianMs)} s median of round medians</span></div>${row.trendMs != null ? `<p>${seconds(Math.abs(row.trendMs))} s ${row.trendMs <= 0 ? 'faster' : 'slower'} in the latest five rounds</p>` : ''}${row.lifetime?.attempts ? `<small>${plural(row.lifetime.attempts, 'case')} all time${row.lifetime.accuracy != null ? ` · ${percent(row.lifetime.accuracy)} correct` : ''}${row.lifetime.medianMs != null ? ` · ${seconds(row.lifetime.medianMs)} s median` : ''}</small>` : ''}<a href="${row.href}?review=due" class="progress-due">${plural(row.due, 'case')} due</a></article>`).join('')}</div></section>
      <section class="progress-card"><h2>activity</h2><p class="progress-caption">Selected solves and drill cases by day.</p>${data.activity.length ? `<ol class="progress-activity">${data.activity.map(day => `<li><time datetime="${day.date}">${day.date}</time><strong>${plural(day.solves, 'solve')} · ${plural(day.cases, 'case')}</strong><span aria-hidden="true" class="progress-day" style="--activity-strength:${Math.min(1, (day.solves + day.cases) / 20)}"></span></li>`).join('')}</ol>` : '<p class="progress-empty">Your first solve or drill round starts this view.</p>'}<a href="#/history" class="progress-link">export or import data ›</a></section>`;
    for (const [key, value] of Object.entries(filters)) page.querySelector(`[name="${key}"]`).value = value;
    syncPageTokens(page);
  }
  page.addEventListener('change', event => {
    const key = event.target.name;
    if (!active || !Object.hasOwn(filters, key)) return;
    filters[key] = event.target.value; render();
  });
  const onTheme = () => { if (active) syncPageTokens(page); };
  document.addEventListener('cubesight-theme', onTheme);
  render();
  return {
    ready,
    setActive(value) { active = Boolean(value); if (active) { render(); void (history ? history.reload().catch(() => {}) : historyReady).then(() => { if (active && !detached) return refresh(); }); } },
    detach() { detached = true; active = false; document.removeEventListener('cubesight-theme', onTheme); page.remove(); },
  };
}
