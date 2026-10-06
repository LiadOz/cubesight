import { createRoundStore, QUICK_ROUNDS } from './rounds.js';
import { loadSettings } from '../brain/settings.js';
import { syncPageTokens } from '../pages/tokens.js';
import { createOrbit } from '../ui/orbit/index.js';
import { readCaseColorSetting } from '../ui/cube/case-color.js';
import { caseDisplayState } from '../ui/cube/orientation.js';
import { createSolvedState } from '../cross-cube.js';
import { buildDrillViewModel } from './view-model.js';
import { buildRoundSegments } from './round-segments.js';
import { ORBIT } from '../ui/design-spec.js';
import { polar } from '../ui/orbit/geometry.js';
import './round-panel.css';

const PRESETS = Object.freeze({ '2m': { kind: 'timed', durationMs: 120000 }, '20': { kind: 'cases', cases: 20 }, '30s': { kind: 'timed', durationMs: 30000 } });
const label = preset => preset.kind === 'cases' ? `${preset.cases} cases` : `${Math.ceil(preset.durationMs / 1000)} s`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** Shared quick-round controls; ordinary practice continues until a round is chosen. */

/** A-08 ring: a quick correct case is a plain done arc, a missed or slow (over 1.5 x the round average) one amber (doneWarn); the answered ones carry their case number. */
function stageSegmentsFor(round, answers, total, elapsedFill) {
  const times = answers.map(answer => answer.ms).filter(Number.isFinite);
  const slow = times.length ? 1.5 * times.reduce((sum, value) => sum + value, 0) / times.length : Infinity;
  return buildRoundSegments({ ...round, answers }, total).map((segment, index) => {
    const answer = answers[index];
    if (answer) return { ...segment, state: answer.correct && !(answer.ms > slow) ? 'done' : 'bad', caseLabel: caseNumber(answer.caseId) || String(index + 1), ariaLabel: `case ${index + 1}, ${caseNumber(answer.caseId)}${answer.correct ? '' : ', missed'}`, fill: 0 };
    return segment.state === 'current' ? { ...segment, fill: elapsedFill } : segment;
  });
}

/** The two ticks that bracket the bottom gap and the lit end of the current arc (a 14 / 7.5 / 2.8 halo dot), drawn into the Orbit's SVG. */
function decorateRing(orbit) {
  const model = orbit.displayed || orbit.current, svgNode = orbit.element.querySelector('svg.orbit__svg');
  if (!model || !svgNode || svgNode.querySelector('[data-ring-decoration]')) return;
  const make = (name, attrs) => { const node = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value)); return node; };
  const scale = Math.max(1, model.viewSize / (svgNode.getBoundingClientRect().width || model.viewSize));
  const group = make('g', { 'data-ring-decoration': '', 'aria-hidden': 'true', 'pointer-events': 'none' });
  for (const tick of ORBIT.ticks) {
    const a = polar(model.cx, model.cy, tick.from.radius, tick.from.angleDeg), b = polar(model.cx, model.cy, tick.to.radius, tick.to.angleDeg);
    group.append(make('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: tick.stroke, 'stroke-width': tick.strokeWidth * scale, 'stroke-linecap': tick.linecap }));
  }
  // The case numbers sit on a circle of r 322 (A-08: 12 / 400 text-dim, centred on the glyph), (the spec's drillNumbers), a little inside the Orbit's own move-label radius; the glyph centre is the baseline minus size / 3.
  for (const segment of model.segments) {
    const part = segment.caseLabel && model.layout.find(item => String(item.key) === String(segment.key));
    if (!part) continue;
    const point = polar(model.cx, model.cy, ORBIT.labelRadius.drillNumbers, part.mid), size = 12 * Math.max(1, Math.min(2.2, scale)), text = make('text', { x: point.x, y: point.y + size / 3, 'text-anchor': 'middle', 'font-size': size, 'font-family': "'DM Mono', monospace", fill: segment.state === 'bad' ? ORBIT.stroke.doneWarn.stroke : '#9a9486' });
    text.textContent = segment.caseLabel; group.append(text);
  }
  const current = model.segments.find(segment => segment.state === 'current');
  const part = current && model.layout.find(item => String(item.key) === String(current.key));
  if (part) {
    const at = part.from + (part.to - part.from) * Math.max(0, Math.min(1, Number(current.fill) || 0)), point = polar(model.cx, model.cy, model.radius, at);
    group.append(make('circle', { cx: point.x, cy: point.y, r: 14 * scale, fill: ORBIT.stroke.active.stroke, opacity: .16 }), make('circle', { cx: point.x, cy: point.y, r: 7.5 * scale, fill: ORBIT.stroke.active.stroke }), make('circle', { cx: point.x, cy: point.y, r: 2.8 * scale, fill: '#141311' }));
  }
  svgNode.append(group);
}

const seconds = ms => `${(ms / 1000).toFixed(2)} s`;
const caseNumber = caseId => String(caseId ?? '').split('/').pop();

/**
 * Shared quick-round controls. variant 'stage' is the A-08 layout: the Orbit is the progress of the round (one segment per case,
 * labelled with the case just answered), the stats are three plain blocks (combo, round avg, best case) and the page places them.
 */
export function createRoundPanel(host, { drill, onRestart = () => {}, onComplete = () => {}, getSettings = () => ({}), storage = globalThis.localStorage, now = () => Date.now(), store: sharedStore = null, orbitHost: sharedOrbitHost = null, variant = 'flow' } = {}) {
  const stage = variant === 'stage';
  const panel = document.createElement('section'); panel.className = 'brain quick-round';
  if (stage) panel.dataset.variant = 'stage';
  panel.setAttribute('aria-label', 'Quick round'); host.prepend(panel);
  const orbitHost = sharedOrbitHost || document.createElement('div');
  if (!sharedOrbitHost) orbitHost.classList.add('quick-round-orbit');
  const content = document.createElement('div'); content.className = 'quick-round-content';
  if (!sharedOrbitHost) panel.append(orbitHost);
  panel.append(content);
  const stageOptions = stage ? { size: 'XL', fitHost: true, labelStyle: 'around', labelKind: 'move', gap: ORBIT.bottomGap.spanDeg, segmentGap: ORBIT.gapSpanByFrame['A-08-drill'].min, centerClearance: 150 } : {};
  const orbit = createOrbit(orbitHost, { size: sharedOrbitHost ? 'L' : 'S', shape: 'open', gap: 72, label: `${drill} round`, segments: [], ...stageOptions });
  let elapsedFill = 0;
  if (stage) orbit.element.addEventListener('orbitchange', () => decorateRing(orbit));
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
  function render({ animate = true } = {}) {
    const round = store.current?.drill === drill ? store.current : null;
    const running = round?.status === 'active';
    const remaining = running ? (round.preset.kind === 'cases' ? `${Math.max(0, round.preset.cases - round.answers.length)} cases left` : `${Math.max(0, Math.ceil((round.startedAt + round.preset.durationMs - now()) / 1000))} s left`) : '';
    panel.dataset.brainStyle = loadSettings(storage).style;
    const answers = round?.answers ?? summary?.answers ?? [];
    const target = stage ? Math.max(round?.preset.kind === 'cases' ? round.preset.cases : preset?.kind === 'cases' ? preset.cases : 20, answers.length + (running && round?.preset.kind !== 'cases' ? 1 : 0))
      : round?.preset.kind === 'cases' ? round.preset.cases : Math.max(answers.length + (running ? 1 : 0), 1);
    const segments = stage ? stageSegmentsFor(round, answers, target, elapsedFill) : buildRoundSegments({ ...round, answers }, target);
    orbit.update({ segments, shape: 'open' }, { animate });
    const times = answers.map(answer => answer.ms).filter(Number.isFinite);
    const average = times.length ? `${(times.reduce((sum, ms) => sum + ms, 0) / times.length / 1000).toFixed(2)} s` : '—';
    const chips = answers.map((answer, index) => `<span class="quick-round-chip ${answer.correct ? 'is-good' : 'is-wrong'}" aria-label="case ${index + 1}, ${answer.correct ? 'correct' : 'wrong'}">${answer.correct ? '✓' : '×'} ${esc(answer.caseId ?? index + 1)}</span>`).join('');
    const best = times.length ? seconds(Math.min(...times)) : '—';
    const stat = (name, value, tone = '') => `<span class="quick-round-stat${tone}"><small>${name}</small><b>${value}</b></span>`;
    const stageStats = `<div class="quick-round-metrics" aria-label="Round stats">${stat('combo', `×${round?.combo ?? 0}`, ' is-combo')}${stat('round avg', average)}${stat(/* copy-ok: frame A-08 labels the fastest case of this round 'best case'; it is not a personal best */ 'best case', best)}</div>`;
    if (stage) content.innerHTML = `${stageStats}<span class="sr-only" data-round-remaining>${running ? remaining : 'quick round'}</span>${completed && summary
      ? `<div class="quick-round-result" role="status"><strong>round complete</strong><span>${summary.correct} of ${summary.total} correct · ${summary.medianMs == null ? '—' : (summary.medianMs / 1000).toFixed(2) + ' s median'} · best combo ${summary.bestCombo}</span><div class="quick-round-answers" aria-label="Round answers">${chips}</div><div class="quick-round-actions"><button type="button" data-round="again">one more round</button><a href="#/drills">change drill</a><button type="button" data-round="done">done</button></div></div>`
      : running ? '' : `<div class="quick-round-presets" role="group" aria-label="Start a quick round">${Object.entries(PRESETS).map(([key, value]) => `<button type="button" data-round="${key}">${key === '2m' ? '2 min' : label(value)}</button>`).join('')}</div><small class="quick-round-note">${store.streak ? `${store.streak} day${store.streak === 1 ? '' : 's'} active` : 'every round counts'}</small>`}`;
    else content.innerHTML = completed && summary
      ? `<div class="quick-round-result" role="status"><strong>round complete</strong><span>${summary.correct} of ${summary.total} correct · ${summary.medianMs == null ? '—' : (summary.medianMs / 1000).toFixed(2) + ' s median'} · best combo ${summary.bestCombo}</span><span class="quick-round-metrics"><strong>combo ${round?.combo ?? summary.bestCombo}</strong><strong>avg ${average}</strong></span><div class="quick-round-answers" aria-label="Round answers">${chips}</div><div><button type="button" data-round="again">one more round</button><a href="#/drills">change drill</a><button type="button" data-round="done">done</button></div></div>`
      : `<div class="quick-round-line"><span data-round-remaining>${running ? remaining : 'quick round'}</span><span class="quick-round-metrics"><strong>combo ${round?.combo ?? 0}</strong><strong>avg ${average}</strong></span>${running ? `<button type="button" data-round="stop">finish round</button>` : Object.entries(PRESETS).map(([key, value]) => `<button type="button" data-round="${key}">${key === '2m' ? '2 min' : label(value)}</button>`).join('')}<small>${store.streak ? `${store.streak} day${store.streak === 1 ? '' : 's'} active` : 'every round counts'}</small></div><div class="quick-round-answers" aria-label="Round answers">${chips}</div>`;
    if (!stage) content.querySelectorAll('button, a').forEach(control => control.classList.add('act'));
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
    /** End the running round now (the esc key of the drill screen). */
    stop() { if (!completed && store.current?.drill === drill && store.current.status === 'active') finish(store.finish('stopped')); },
    /** The lit part of the current arc follows the time spent on this case (fraction of the round's average, or 3 s). */
    setElapsed(ms) {
      const round = store.current?.drill === drill ? store.current : null;
      const times = (round?.answers ?? []).map(answer => answer.ms).filter(Number.isFinite);
      const basis = times.length ? 1.5 * times.reduce((sum, value) => sum + value, 0) / times.length : 3000;
      const fill = Math.max(0, Math.min(.97, ms / Math.max(1000, basis)));
      if (Math.abs(fill - elapsedFill) < .02) return;
      elapsedFill = fill; render({ animate: false });
    },
    resetElapsed() { elapsedFill = 0; },
    refresh() { render(); },
    destroy() { active = false; if (timer) clearInterval(timer); orbit.destroy(); panel.remove(); },
  };
}
