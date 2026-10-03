import { createRoundStore, QUICK_ROUNDS } from './rounds.js';
import { loadSettings } from '../brain/settings.js';
import { syncPageTokens } from '../pages/tokens.js';
import { createOrbit } from '../ui/orbit/index.js';
import { readCaseColorSetting } from '../ui/cube/case-color.js';
import { caseDisplayState } from '../ui/cube/orientation.js';
import { createSolvedState } from '../cross-cube.js';
import { buildDrillViewModel } from './view-model.js';
import { buildRoundSegments } from './round-segments.js';
import './round-panel.css';

const PRESETS = Object.freeze({ '2m': { kind: 'timed', durationMs: 120000 }, '20': { kind: 'cases', cases: 20 }, '30s': { kind: 'timed', durationMs: 30000 } });
const label = preset => preset.kind === 'cases' ? `${preset.cases} cases` : `${Math.ceil(preset.durationMs / 1000)} s`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** Shared quick-round controls; ordinary practice continues until a round is chosen. */
export function createRoundPanel(host, { drill, onRestart = () => {}, onComplete = () => {}, getSettings = () => ({}), storage = globalThis.localStorage, now = () => Date.now(), store: sharedStore = null, orbitHost: sharedOrbitHost = null } = {}) {
  const panel = document.createElement('section'); panel.className = 'brain quick-round';
  panel.setAttribute('aria-label', 'Quick round'); host.prepend(panel);
  const orbitHost = sharedOrbitHost || document.createElement('div');
  if (!sharedOrbitHost) orbitHost.classList.add('quick-round-orbit');
  const content = document.createElement('div'); content.className = 'quick-round-content';
  if (!sharedOrbitHost) panel.append(orbitHost);
  panel.append(content);
  const orbit = createOrbit(orbitHost, { size: 'S', shape: 'open', gap: 72, label: `${drill} round`, segments: [] });
  let store = sharedStore || createRoundStore(storage, { now }), active = false, timer = null, summary = null, preset = QUICK_ROUNDS[drill];
  let completed = false;
  function finish(result) {
    if (!result) return;
    summary = result; completed = true; onComplete(result); render();
  }
  function start(nextPreset = preset) {
    preset = nextPreset; summary = null; completed = false;
    store.startRound({ drill, preset, settings: getSettings(), from: new URLSearchParams(location.hash.split('?')[1] ?? '').get('from'), resume: false });
    render(); onRestart();
  }
  function render() {
    const round = store.current?.drill === drill ? store.current : null;
    const running = round?.status === 'active';
    const remaining = running ? (round.preset.kind === 'cases' ? `${Math.max(0, round.preset.cases - round.answers.length)} cases left` : `${Math.max(0, Math.ceil((round.startedAt + round.preset.durationMs - now()) / 1000))} s left`) : '';
    panel.dataset.brainStyle = loadSettings(storage).style;
    const answers = round?.answers ?? summary?.answers ?? [];
    const target = round?.preset.kind === 'cases' ? round.preset.cases : Math.max(answers.length + (running ? 1 : 0), 1);
    const segments = buildRoundSegments({ ...round, answers }, target);
    orbit.update({ segments, shape: 'open' });
    const times = answers.map(answer => answer.ms).filter(Number.isFinite);
    const average = times.length ? `${(times.reduce((sum, ms) => sum + ms, 0) / times.length / 1000).toFixed(2)} s` : '—';
    const chips = answers.map((answer, index) => `<span class="quick-round-chip ${answer.correct ? 'is-good' : 'is-wrong'}" aria-label="case ${index + 1}, ${answer.correct ? 'correct' : 'wrong'}">${answer.correct ? '✓' : '×'} ${esc(answer.caseId ?? index + 1)}</span>`).join('');
    content.innerHTML = completed && summary
      ? `<div class="quick-round-result" role="status"><strong>round complete</strong><span>${summary.correct} of ${summary.total} correct · ${summary.medianMs == null ? '—' : (summary.medianMs / 1000).toFixed(2) + ' s median'} · best combo ${summary.bestCombo}</span><span class="quick-round-metrics"><strong>combo ${round?.combo ?? summary.bestCombo}</strong><strong>avg ${average}</strong></span><div class="quick-round-answers" aria-label="Round answers">${chips}</div><div><button type="button" data-round="again">one more round</button><a href="#/drills">change drill</a><button type="button" data-round="done">done</button></div></div>`
      : `<div class="quick-round-line"><span data-round-remaining>${running ? remaining : 'quick round'}</span><span class="quick-round-metrics"><strong>combo ${round?.combo ?? 0}</strong><strong>avg ${average}</strong></span>${running ? `<button type="button" data-round="stop">finish round</button>` : Object.entries(PRESETS).map(([key, value]) => `<button type="button" data-round="${key}">${key === '2m' ? '2 min' : label(value)}</button>`).join('')}<small>${store.streak ? `${store.streak} day${store.streak === 1 ? '' : 's'} active` : 'every round counts'}</small></div><div class="quick-round-answers" aria-label="Round answers">${chips}</div>`;
    syncPageTokens(panel);
  }
  panel.addEventListener('click', event => {
    const key = event.target.closest('[data-round]')?.dataset.round;
    if (PRESETS[key]) start(PRESETS[key]);
    else if (key === 'again') start();
    else if (key === 'stop') finish(store.finish('stopped'));
    else if (key === 'done') { store.discard(); completed = false; summary = null; render(); onRestart(); }
  });
  const tick = () => {
    if (!active || completed || store.current?.drill !== drill || store.current.status !== 'active') return;
    const round = store.current;
    if (round.preset.kind === 'timed' && now() - round.startedAt >= round.preset.durationMs) finish(store.finish('time'));
    else {
      const node = content.querySelector('[data-round-remaining]');
      if(node && round.preset.kind==='timed') node.textContent=`${Math.max(0,Math.ceil((round.startedAt+round.preset.durationMs-now())/1000))} s left`;
    }
  };
  return {
    get orbit() { return orbit; },
    get complete() { return completed; },
    getViewModel() {
      const round = store.current?.drill === drill ? store.current : null;
      const answers = round?.answers ?? summary?.answers ?? [];
      const timed = answers.map(answer => answer.ms).filter(Number.isFinite);
      const averageMs = timed.length ? timed.reduce((sum, value) => sum + value, 0) / timed.length : null;
      const target = round?.preset.kind === 'cases' ? round.preset.cases : Math.max(answers.length + (round?.status === 'active' ? 1 : 0), 1);
      const segments = buildRoundSegments(round, target).map((segment, index) => ({ ...segment, fill: answers[index] ? 1 : 0 }));
      const caseSeed = round ? `${drill}:${round.startedAt}:${answers.length}` : `${drill}:idle`;
      const caseColor = readCaseColorSetting(storage);
      const topColor = caseDisplayState(createSolvedState(), caseColor, caseSeed).topColor;
      return buildDrillViewModel({ page: 'round', drill, phase: round?.status ?? (completed ? 'complete' : 'idle'),
        caseColor, topColor, caseSeed, currentCase: answers.at(-1)?.caseId ?? null,
        round: round ? { ...round, kind: round.preset.kind, total: target, averageMs, segments } : null });
    },
    record(answer) { if (completed || store.current?.drill !== drill) return null; const result = store.recordAnswer(answer); if (result.summary) finish(result.summary); else render(); return result; },
    handleKey(event) {
      if (!active || !completed || ![' ', 'Enter'].includes(event.key) || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? '') || event.target?.closest('button,a')) return false;
      event.preventDefault(); start(); return true;
    },
    setActive(value) {
      active = Boolean(value); if (timer) clearInterval(timer); timer = null;
      if (!active) return;
      if (!sharedStore) store = createRoundStore(storage, { now });
      completed = false; summary = null;
      const round = store.current;
      if (round?.drill === drill && round.status === 'complete') {
        const saved = store.history.find(row => row.id === `${drill}:${round.startedAt}`);
        if(saved) { preset = round.preset; finish(saved); }
      } else if (round?.drill === drill && round.status === 'active') { preset = round.preset; tick(); }
      else {
        const requested = new URLSearchParams(location.hash.split('?')[1] ?? '').get('round');
        if (PRESETS[requested]) { preset = PRESETS[requested]; store.startRound({ drill, preset, settings: getSettings(), resume: false }); }
      }
      render(); timer = setInterval(tick, 250);
    },
    start(nextPreset = preset) { start(nextPreset); },
    refresh() { render(); },
    destroy() { active = false; if (timer) clearInterval(timer); orbit.destroy(); panel.remove(); },
  };
}
