import './pll-trainer.css';
import { mountTrainerSettings } from './trainers/settings-controls.js';
import { createRoundPanel } from './drills/round-panel.js';
import { Cube } from './ui/cube/index.js';
import { readCaseColorSetting, CASE_COLOR_CHANGE_EVENT } from './ui/cube/case-color.js';
import { renderCube } from './cube-renderer.js';
import { toRenderData } from './cross-cube.js';
import { PLL_CASES, createPLLTrial } from './pll-logic.js';
import { KEYS, fmt } from './copy/terms.js';
import { resolvePLLStart } from './drills/pll-start.js';
import { createTrainerOrbit } from './trainers/orbit-round.js';
import { mountCaseColorControl } from './trainers/case-color-control.js';

/*
 * PLL trainer UI contract
 * -----------------------
 * `createPLLTrial({ mode, family, caseId })` may return a trial synchronously
 * or as a Promise. A trial should contain `{ caseId, name, family, state,
 * cue }`; `state` is the cubie state accepted by cross-cube.toRenderData.
 * `renderData` can be supplied instead when a state is not available. The UI
 * deliberately keeps the scoring layer here so the cube generator can evolve
 * independently (and later receive a smart-cube state).
 */

const STORE_KEY = 'cubesight-pll-progress-v1';
const IDLE_LIMIT = 10_000;
const GLANCE_MIN = 25;
const GLANCE_MAX = 1500;
const ANSWER_KEYS = '1234567890qwertyuiopasdfghjklzxcvbnm';
const GLANCE_STEPS = [25, 50, 75, 100, 150, 200, 300, 450, 600, 800, 1000, 1500];
const MODES = [
  { id: 'learn', label: 'learn', note: 'Build a reliable cue before speed.' },
  { id: 'mix', label: 'mix', note: 'Mix cases to sharpen recog.' },
  { id: 'transfer', label: 'random AUF', note: 'New AUFs check your recog. Cases due after 24 h count separately.' },
];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const pretty = (value) => String(value || '').replace(/\b\w/g, (ch) => ch.toUpperCase());
const median = (values) => {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const sameId = (a, b) => String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '') === String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const blankStats = () => ({ attempts: 0, correct: 0, times: [], confusion: {}, transfer: { attempts: 0, correct: 0, times: [] }, delayed: { attempts: 0, correct: 0, times: [] }, lastSeen: 0, reviewStreak: 0, intervalDays: 0, nextReviewAt: 0 });
const validAttempts = (item) => (item.attempts || 0) + (item.transfer?.attempts || 0);
const validCorrect = (item) => (item.correct || 0) + (item.transfer?.correct || 0);
const isDelayedRetentionEligible = (lastSeen, now = Date.now()) => Number.isFinite(lastSeen) && lastSeen > 0 && now - lastSeen >= 24 * 60 * 60 * 1000;
function nextGlanceMs(current, outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length < 10) return current;
  const accuracy = outcomes.filter(Boolean).length / outcomes.length;
  const index = Math.max(0, GLANCE_STEPS.indexOf(Number(current)));
  if (accuracy >= .9) return GLANCE_STEPS[Math.max(0, index - 1)];
  if (accuracy <= .7) return GLANCE_STEPS[Math.min(GLANCE_STEPS.length - 1, index + 1)];
  return GLANCE_STEPS[index];
}

function catalog() {
  const values = Array.isArray(PLL_CASES) ? PLL_CASES.map((value) => [null, value]) : Object.entries(PLL_CASES || {});
  return values.map(([key, value], index) => {
    const source = typeof value === 'string' ? { id: value, name: value } : value || {};
    const id = String(source.id || source.caseId || key || source.name || `case-${index + 1}`);
    return {
      ...source,
      id,
      caseId: id,
      name: source.name || source.label || id,
      family: source.family || id.replace(/[^A-Za-z].*$/, '') || 'Other',
      key: ANSWER_KEYS[index] || '',
    };
  });
}

function readStats(cases) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { saved = {}; }
  const result = {};
  cases.forEach((item) => { result[item.id] = { ...blankStats(), ...(saved[item.id] || {}) }; });
  Object.values(result).forEach((item) => {
    item.times = Array.isArray(item.times) ? item.times.filter(Number.isFinite).slice(-80) : [];
    item.confusion = item.confusion && typeof item.confusion === 'object' ? item.confusion : {};
    item.transfer = { ...blankStats().transfer, ...(item.transfer || {}) };
    item.delayed = { ...blankStats().delayed, ...(item.delayed || {}) };
    item.transfer.times = Array.isArray(item.transfer.times) ? item.transfer.times.filter(Number.isFinite).slice(-40) : [];
    item.delayed.times = Array.isArray(item.delayed.times) ? item.delayed.times.filter(Number.isFinite).slice(-40) : [];
    item.lastSeen = Number.isFinite(item.lastSeen) ? item.lastSeen : 0;
    item.reviewStreak = Number.isFinite(item.reviewStreak) ? Math.max(0, Math.floor(item.reviewStreak)) : 0;
    item.intervalDays = Number.isFinite(item.intervalDays) ? Math.max(0, item.intervalDays) : 0;
    item.nextReviewAt = Number.isFinite(item.nextReviewAt) ? Math.max(0, item.nextReviewAt) : 0;
  });
  return result;
}

function saveStats(stats) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(stats)); } catch { /* Private browsing: keep the live session. */ }
}

function renderDataFor(trial) {
  if (trial?.renderData) return { ...trial.renderData, mode: 'corner', showAllCorners: true };
  const state = trial?.state || trial?.cubeState || trial?.cube || trial;
  if (state?.cubies) return { ...toRenderData(state), mode: 'corner', showAllCorners: true };
  return { mode: 'corner', showAllCorners: true, colors: {}, cornerStickers: {}, stickerColors: {}, corners: [], edges: [] };
}

export function createPLLTrainer(root) {
  const cases = catalog();
  const families = [...new Set(cases.map((item) => item.family))].filter(Boolean);
  const stats = readStats(cases);
  const storedMode = localStorage.getItem('cubesight-pll-mode');
  let mode = ['learn', 'mix', 'transfer'].includes(storedMode) ? storedMode : 'learn';
  // Learn starts with one small family/block. Mixing all 21 cases is useful
  // later, but is needlessly noisy for a first exposure.
  const storedFamily = localStorage.getItem('cubesight-pll-family');
  let family = storedFamily === 'all' || families.includes(storedFamily) ? storedFamily : families[0] || 'all';
  if (mode !== 'learn') family = 'all';
  let active = true;
  let trial = null;
  let trialToken = 0;
  let startHash = null, linkedStart = null, startPromise = null;
  let linkedAttempts = 0, linkedVariations = null;
  let startedAt = 0;
  let timerFrame = null;
  let idleTimer = null;
  let elapsed = 0;
  let paused = false;
  let locked = false;
  let glanceMs = Number(localStorage.getItem('cubesight-pll-glance-ms') || 600);
  if (!GLANCE_STEPS.includes(glanceMs)) glanceMs = 600;
  // Start with the cube continuously visible. A sub-second flash during the
  // initial route load looks like a broken renderer and is inappropriate
  // before the learner has encoded the case family.
  let glanceEnabled = localStorage.getItem('cubesight-pll-glance-enabled') === 'true';
  let dueRetries = [];
  let completed = 0;
  let paceWindow = [];

  root.innerHTML = `
    <section class="pll-intro"><div><p class="eyebrow">drills / PLL recognition</p><h1>PLL recognition</h1></div><p class="intro-copy">Recognize the case.</p></section>
    <details class="pll-settings"><summary><span>settings</span><small>glance · case family</small><i aria-hidden="true"></i></summary>
      <div class="pll-controls">
        <div class="pll-control-group"><span class="pll-label">mode</span><div class="pll-segmented" role="group" aria-label="PLL mode">${MODES.map((item) => `<button type="button" class="pll-segment${item.id === mode ? ' active' : ''}" data-pll-mode="${item.id}">${item.label}</button>`).join('')}</div><small id="pll-mode-note">${MODES[0].note}</small></div>
        <label class="pll-control-group"><span class="pll-label">case family</span><select id="pll-family" aria-label="PLL case family"><option value="all">all PLL cases · mixed</option>${families.map((item) => `<option value="${esc(item)}"${item === family ? ' selected' : ''}>${esc(pretty(item))} family · learn</option>`).join('')}</select></label>
        <div class="pll-control-group pll-pacing"><span class="pll-label">glance</span><label class="pll-check"><input id="pll-glance" type="checkbox" ${glanceEnabled ? 'checked' : ''}> <span>hide after glance</span></label><label class="pll-select-label" for="pll-glance-ms"><span id="pll-glance-caption">adaptive glance · ${glanceMs} ms</span><select id="pll-glance-ms" aria-label="glance time"><option value="25">25 ms</option><option value="50">50 ms</option><option value="75">75 ms</option><option value="100">100 ms</option><option value="150">150 ms</option><option value="200">200 ms</option><option value="300">300 ms</option><option value="450">450 ms</option><option value="600">600 ms</option><option value="800">800 ms</option><option value="1000">1 s</option><option value="1500">1.5 s</option></select></label></div>
      </div>
    </details>
    <div id="pll-round-host"></div>
    <section class="pll-trainer-shell">
      <div class="pll-cube-stage"><div class="pll-stage-topline"><span class="status-dot"><i></i> identify the PLL</span><span class="view-lock">fixed two-sided view</span></div><div id="pll-cube" class="pll-cube-mount"></div><div id="pll-glance-overlay" class="pll-glance-overlay" hidden>answer now</div><div id="pll-pause" class="pll-pause" hidden><strong>Taking a break?</strong><span>This one won’t count. Resume for a fresh case.</span><button type="button" id="pll-resume">resume</button></div><div class="pll-cube-caption"><span>U top · F/R sides · AUF varies</span><span>Rotation locked to protect recog.</span></div></div>
      <div class="pll-answer-stage"><div class="pll-case-meta"><span id="pll-case-mode">learn · all cases</span></div><div class="pll-prompt"><p>Which PLL case is this?</p><small>Answer before you reveal the cue.</small><small id="pll-timing-note">Accuracy first. Speed follows stable cues.</small></div><div id="pll-answers" class="pll-answer-grid" role="group" aria-label="Choose the PLL case"></div><div class="pll-feedback-row"><p id="pll-feedback" role="status" aria-live="polite">Choose the case you see.</p><button type="button" class="pll-skip" id="pll-skip">skip <kbd>s</kbd></button></div><button type="button" class="pll-next" id="pll-next" hidden>next case</button></div>
    </section>
    <details class="pll-progress-details"><summary>Progress · PLL recognition</summary><section class="pll-progress"><div class="pll-section-heading"><div><p class="eyebrow">progress</p><h2>PLL recognition</h2></div><button type="button" class="pll-text-button danger" id="pll-clear">clear PLL history</button></div><div class="pll-metric-grid"><article><span>accuracy</span><strong id="pll-accuracy">—</strong><small id="pll-accuracy-note">No answers yet</small></article><article><span>random AUF accuracy</span><strong id="pll-transfer">—</strong><small id="pll-transfer-note">No random AUF answers</small></article><article><span>median recog</span><strong id="pll-median">—</strong><small>correct answers only</small></article><article><span>due</span><strong id="pll-due">0</strong><small id="pll-due-note">due · retry</small></article><article><span>24 h retention</span><strong id="pll-retention">—</strong><small>delayed random AUF answers</small></article></div><div class="pll-case-card"><div class="pll-case-head"><div><span>by case</span><small>misses and slow recog first</small></div><button type="button" class="pll-text-button" id="pll-retention-help">why 24 h returns?</button></div><div id="pll-case-list"></div></div></section></details>`;

  const $ = (selector) => root.querySelector(selector);
  const disposeCaseColorControl = mountCaseColorControl($('.pll-intro'));
  const trainerOrbit = createTrainerOrbit($('.pll-cube-stage'));
  let cube = null, renderData = null, disposed = false, activeCaseSeed = '';
  const cubeReady = Promise.resolve().then(() => {
    if (disposed) return;
    cube = new Cube($('#pll-cube'), { mode: 'case', size: 'L', cubeOptions: { mode: 'corner' }, caseColorSetting: readCaseColorSetting(), caseSeed: 'pll:initial', label: 'PLL recognition case' });
    // Recognition is about the last layer: emphasise it, dim the solved first two layers.
    cube.highlightStage('pll');
    if (trial?.state?.cubies) cube.setState(trial.state);
    else if (renderData) cube.update(renderData);
  }).catch(error => {
    if (disposed) return;
    console.warn('WebGL PLL cube unavailable; using the offline SVG view.', error);
    const mount=$('#pll-cube');
    mount.classList.add('is-svg-fallback');
    $('.pll-stage-topline .view-lock').textContent='Fixed 2D compatibility view';
    cube={
      update(data){mount.replaceChildren(renderCube(data,{title:'PLL recognition cube',description:'Top, front, and right stickers for the current PLL case.'}));},
      destroy(){mount.replaceChildren();},
    };
    if (renderData) cube.update(renderData);
  });
  const setTimerText = milliseconds => trainerOrbit.tick(fmt.time(milliseconds));
  const totalAttempts = () => Object.values(stats).reduce((sum, item) => sum + (item.attempts || 0), 0);
  const totalCorrect = () => Object.values(stats).reduce((sum, item) => sum + (item.correct || 0), 0);
  const allTimes = () => Object.values(stats).flatMap((item) => [...item.times, ...(item.transfer?.times || [])]);
  const currentFamilyLabel = () => family === 'all' ? 'all cases' : `${pretty(family)} family`;

  function getCase(item) { return cases.find((candidate) => sameId(candidate.id, item)) || { id: item, caseId: item, name: item, family: 'Other', key: '' }; }
  function caseStats(id) { return stats[id] || (stats[id] = blankStats()); }
  function refreshStats() {
    const attempts = totalAttempts();
    const correct = totalCorrect();
    const transferAttempts = Object.values(stats).reduce((sum, item) => sum + (item.transfer?.attempts || 0), 0);
    const transferCorrect = Object.values(stats).reduce((sum, item) => sum + (item.transfer?.correct || 0), 0);
    const retentionAttempts = Object.values(stats).reduce((sum, item) => sum + (item.delayed?.attempts || 0), 0);
    const retentionCorrect = Object.values(stats).reduce((sum, item) => sum + (item.delayed?.correct || 0), 0);
    const spacedDue = Object.values(stats).filter((item) => item.nextReviewAt > 0 && item.nextReviewAt <= Date.now()).length;
    $('#pll-accuracy').textContent = attempts ? `${Math.round(correct / attempts * 100)}%` : '—';
    $('#pll-accuracy-note').textContent = attempts ? `${correct} of ${attempts} answers` : 'No answers yet';
    $('#pll-transfer').textContent = transferAttempts ? `${Math.round(transferCorrect / transferAttempts * 100)}%` : '—';
    $('#pll-transfer-note').textContent = transferAttempts ? `${transferCorrect} of ${transferAttempts} random AUF answers` : 'No random AUF answers';
    const middle = median(allTimes());
    $('#pll-median').textContent = middle == null ? '—' : fmt.time(middle, { unit: true });
    $('#pll-due').textContent = String(spacedDue + dueRetries.length);
    $('#pll-due-note').textContent = `${spacedDue} due · ${dueRetries.length} retry`;
    $('#pll-retention').textContent = retentionAttempts ? `${Math.round(retentionCorrect / retentionAttempts * 100)}%` : '—';
    const rows = cases.map((item) => {
      const itemStats = caseStats(item.id);
      const attempts = validAttempts(itemStats), correct = validCorrect(itemStats);
      const accuracy = attempts ? Math.round(correct / attempts * 100) : null;
      const med = median([...itemStats.times, ...(itemStats.transfer?.times || [])]);
      const delay = itemStats.delayed?.attempts ? Math.round(itemStats.delayed.correct / itemStats.delayed.attempts * 100) : null;
      const confused = Object.entries(itemStats.confusion || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      return { item, accuracy, med, delay, confused };
    }).filter((row) => family === 'all' || row.item.family === family).sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || (b.med ?? -1) - (a.med ?? -1));
    $('#pll-case-list').innerHTML = rows.map(({ item, accuracy, med, delay, confused }) => `<div class="pll-case-row"><span class="pll-case-name"><b>${esc(item.name)}</b><small>${esc(pretty(item.family))}${confused ? ` · confused with ${esc(getCase(confused).name)}` : ''}</small></span><span>${accuracy == null ? '—' : `${accuracy}%`}<small>accuracy</small></span><span>${med == null ? '—' : `${(med / 1000).toFixed(2)} s`}<small>median recog</small></span><span>${delay == null ? '—' : `${delay}%`}<small>24 h retention</small></span><i class="pll-mini-track"><em style="width:${accuracy == null ? 0 : accuracy}%"></em></i></div>`).join('') || '<p class="pll-empty">No cases in this family yet.</p>';
  }

  function setMessage(message, kind = '') {
    const output = $('#pll-feedback'); output.textContent = message; output.dataset.kind = kind;
  }
  function stopClock() {
    if (timerFrame) cancelAnimationFrame(timerFrame);
    timerFrame = null;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  }
  function runClock(token) {
    const frame = () => {
      if (token !== trialToken || locked || paused || !startedAt) return;
      elapsed = performance.now() - startedAt;
      setTimerText(elapsed);
      timerFrame = requestAnimationFrame(frame);
    };
    frame();
    idleTimer = setTimeout(() => {
      if (token !== trialToken || locked || paused) return;
      elapsed = performance.now() - startedAt;
      // Stop measuring after ten seconds, but do not make a learner restart
      // just as they are working the pattern out. They can still answer and
      // reveal the cue; the slow attempt simply stays out of their statistics.
      trial = { ...trial, invalidated: true }; stopClock(); setTimerText(IDLE_LIMIT); setMessage('Taking a break? This one won’t count.', 'info');
    }, IDLE_LIMIT);
  }
  function setGlance(value) {
    $('#pll-glance-overlay').hidden = value;
    $('#pll-cube').classList.toggle('is-glance-hidden', !value);
  }
  function tuneGlance(correct, skipped) {
    if (skipped) return;
    paceWindow.push(Boolean(correct));
    if (paceWindow.length < 10) {
      $('#pll-glance-caption').textContent = `adaptive glance · ${glanceMs} ms · ${paceWindow.length}/10`;
      return;
    }
    // A faster window is earned only by 90%+ accuracy across ten valid
    // retrievals. A struggling learner gets a little more viewing time; a
    // middle result holds steady so speed never outruns recognition.
    glanceMs = nextGlanceMs(glanceMs, paceWindow);
    paceWindow = [];
    localStorage.setItem('cubesight-pll-glance-ms', String(glanceMs));
    $('#pll-glance-ms').value = String(glanceMs);
    settingsControls.sync();
    $('#pll-glance-caption').textContent = `Adaptive · ${glanceMs} ms · 0/10`;
  }
  function scheduleRetry(id) {
    if (!id) return;
    if (dueRetries.some((item) => item.id === id)) dueRetries = dueRetries.filter((item) => item.id !== id);
    dueRetries.push({ id, due: completed + 3 });
  }
  async function readLinkedStart() {
    const hash = globalThis.location?.hash ?? '';
    if (hash !== startHash) {
      startHash = hash; linkedStart = null; linkedAttempts = 0; linkedVariations = null;
      startPromise = resolvePLLStart(hash).catch(() => ({ error: 'This position could not be loaded. Check the link and try again.' }));
    }
    const value = await startPromise;
    if (hash !== startHash) return null;
    linkedStart = value;
    if (value.state || value.allowed) { family = 'all'; $('#pll-family').value = 'all'; }
    let back = root.querySelector('.pll-review-back');
    const from = /^review:(\d+):(\d+)$/.exec(value.start?.from ?? '');
    if (from) {
      if (!back) { back = document.createElement('a'); back.className = 'pll-review-back'; $('.pll-intro').append(back); }
      back.href = `#/history/${from[1]}?move=${from[2]}`; back.textContent = 'back to review ›';
    } else back?.remove();
    return value;
  }
  function chooseCase() {
    const due = dueRetries.find((item) => item.due <= completed && (!linkedStart?.allowed || linkedStart.allowed.includes(item.id)));
    if (due) { dueRetries = dueRetries.filter((item) => item !== due); return cases.find((item) => sameId(item.id, due.id)) || { id: due.id, caseId: due.id }; }
    const deferred = new Set(dueRetries.filter((item) => item.due > completed).map((item) => item.id));
    const selectedFamily = cases.filter((item) => (family === 'all' || item.family === family) && (!linkedStart?.allowed || linkedStart.allowed.includes(item.id)));
    const eligible = selectedFamily.filter((item) => !deferred.has(item.id));
    if (!eligible.length) return selectedFamily[Math.floor(Math.random() * selectedFamily.length)] || cases[0];
    // In Learn, give new cases a chance first; in Mix/Transfer, weak cases
    // are sampled more often without turning the session into a blocked drill.
    const unseen = eligible.filter((item) => !caseStats(item.id).attempts);
    if (mode === 'learn' && unseen.length) return unseen[Math.floor(Math.random() * unseen.length)];
    const spacedDue = eligible.filter((item) => caseStats(item.id).nextReviewAt > 0 && caseStats(item.id).nextReviewAt <= Date.now());
    if (spacedDue.length) return spacedDue.sort((a, b) => caseStats(a.id).nextReviewAt - caseStats(b.id).nextReviewAt)[0];
    const weighted = eligible.flatMap((item) => {
      const itemStats = caseStats(item.id); const attempts = validAttempts(itemStats); const accuracy = attempts ? validCorrect(itemStats) / attempts : .5; const weight = Math.max(1, Math.round((1.2 - accuracy) * 4));
      return Array(weight).fill(item);
    });
    return weighted[Math.floor(Math.random() * weighted.length)];
  }
  async function newTrial() {
    settingsControls.sync();
    if (roundPanel.complete) return;
    const token = ++trialToken; stopClock(); trial = null; locked = false; paused = false; elapsed = 0; $('#pll-pause').hidden = true; $('#pll-cube').classList.remove('is-paused'); $('#pll-next').hidden = true; setTimerText(0); setGlance(true); setMessage('Choose the case you see.');
    const start = await readLinkedStart();
    if (token !== trialToken || !active) return;
    if (!start || start.error) {
      trial = null; locked = true; delete root.dataset.pllCase;
      $('#pll-answers').replaceChildren(); $('#pll-cube').hidden = true;
      setMessage(start?.error ?? 'This position could not be loaded.', 'error');
      return;
    }
    $('#pll-cube').hidden = false;
    let linkedState = start.state;
    if (start.pin && linkedAttempts > 0) {
      setMessage('preparing a verified variation…');
      linkedVariations ??= import('./drills/pin-variations.js').then(({generatePinVariations}) => generatePinVariations(start.pin, {count: 3})).catch(() => []);
      const variants = await linkedVariations;
      if (token !== trialToken || !active) return;
      const variation = variants[(linkedAttempts - 1) % variants.length];
      if (!variation) {
        locked = true; $('#pll-cube').hidden = true; $('#pll-answers').replaceChildren();
        setMessage('No new verified variation was found for this saved position. Choose another point in the solve.', 'info');
        return;
      }
      linkedState = variation.state;
    }
    const selected = start.recognized ? getCase(start.recognized.name) : chooseCase();
    let generated;
    try {
      generated = await Promise.resolve(createPLLTrial({ mode, family, caseId: selected?.id || selected?.caseId }));
      if (linkedState) {
        const state = linkedState;
        generated = {...generated, state, renderData: toRenderData(state)};
      }
    } catch { setMessage('Couldn’t load PLL cases. Reload and try again.', 'error'); return; }
    if (token !== trialToken || !active) return;
    trial = { ...generated, caseId: generated?.caseId || generated?.id || selected?.id, name: generated?.name || generated?.label || selected?.name || selected?.id, family: generated?.family || selected?.family || family };
    const roundIndex = roundPanel?.getViewModel()?.round?.answers?.length || 0;
    trainerOrbit?.update({ index: roundIndex, state: 'current', value: `${roundIndex + 1}` });
    root.dataset.pllCase = trial.caseId;
    if (start.pin) linkedAttempts++;
    const seenStats = caseStats(trial.caseId);
      trial.delayedEligible = mode === 'transfer' && isDelayedRetentionEligible(seenStats.lastSeen);
    const data = renderDataFor(trial); renderData = data;
    if (trial.state?.cubies && cube?.setState) {
      activeCaseSeed = `pll:${completed}:${trial.caseId}`;
      cube.setCaseOrientation(readCaseColorSetting(), { seed: activeCaseSeed });
      cube.setState(trial.state);
    } else cube?.update(data);
    $('#pll-case-mode').textContent = `${MODES.find(item => item.id === mode)?.label || 'learn'} · ${currentFamilyLabel()}`;
    $('#pll-timing-note').textContent = mode === 'transfer'
      ? 'random AUF · no cue until reveal.'
      : glanceEnabled ? `adaptive glance · ${glanceMs} ms · accuracy first.` : 'full view · enable glance when the cues feel reliable.';
    renderAnswers(); refreshStats();
    startedAt = performance.now(); runClock(token);
    if (glanceEnabled) window.setTimeout(() => { if (token === trialToken && !locked && !paused) setGlance(false); }, glanceMs);
  }
  function renderAnswers() {
    const options = cases.filter((item) => family === 'all' || item.family === family);
    $('#pll-answers').innerHTML = options.map((item) => `<button type="button" class="pll-answer" data-pll-answer="${esc(item.id)}"><span>${esc(item.name)}</span><kbd>${esc(item.key.toLowerCase())}</kbd></button>`).join('');
  }
  function feedbackCue() {
    const cue = trial?.cue || trial?.recognitionCue || trial?.hint;
    if (!cue) return '';
    if (typeof cue === 'string') return cue;
    return cue.text || cue.label || cue.description || '';
  }
  function answer(value, skipped = false) {
    if (roundPanel.complete) return;
    if (!trial || locked || paused) return;
    locked = true; stopClock(); elapsed = trial.invalidated ? IDLE_LIMIT : performance.now() - startedAt; setTimerText(elapsed); setGlance(true);
    const correct = !skipped && sameId(value, trial.caseId); const itemStats = caseStats(trial.caseId); const retention = mode === 'transfer'; const recordable = !trial.invalidated;
    const delayed = retention && Boolean(trial.delayedEligible);
    if (recordable && !retention) {
      itemStats.attempts++;
      if (correct) { itemStats.correct++; itemStats.times.push(elapsed); itemStats.times = itemStats.times.slice(-80); }
      if (!correct && value) itemStats.confusion[value] = (itemStats.confusion[value] || 0) + 1;
    } else if (recordable) {
      // Transfer is its own accuracy stream. It becomes a delayed-retention
      // observation only when this case was last seen at least 24 hours ago.
      itemStats.transfer.attempts++;
      if (correct) { itemStats.transfer.correct++; itemStats.transfer.times.push(elapsed); itemStats.transfer.times = itemStats.transfer.times.slice(-40); }
      if (delayed) {
        itemStats.delayed.attempts++;
        if (correct) { itemStats.delayed.correct++; itemStats.delayed.times.push(elapsed); itemStats.delayed.times = itemStats.delayed.times.slice(-40); }
      }
      if (!correct && value) itemStats.confusion[value] = (itemStats.confusion[value] || 0) + 1;
    }
    if (recordable) {
      if (!correct) scheduleRetry(trial.caseId);
      if (glanceEnabled) tuneGlance(correct, skipped);
      const answeredAt = Date.now();
      itemStats.lastSeen = answeredAt;
      if (correct) {
        itemStats.reviewStreak = (itemStats.reviewStreak || 0) + 1;
        const fluent = elapsed <= 900;
        itemStats.intervalDays = itemStats.reviewStreak === 1 ? 1 : Math.min(30, Math.max(1, itemStats.intervalDays || 1) * (fluent ? 2 : 1.4));
        itemStats.nextReviewAt = answeredAt + itemStats.intervalDays * 24 * 60 * 60 * 1000;
      } else {
        itemStats.reviewStreak = 0;
        itemStats.intervalDays = 0;
        itemStats.nextReviewAt = answeredAt + 15 * 60 * 1000;
      }
      completed++; saveStats(stats); refreshStats();
      roundPanel.record({correct,ms:elapsed,caseId:trial.caseId,at:answeredAt});
    }
    trainerOrbit?.update({ index: Math.max(0, (roundPanel?.getViewModel()?.round?.answers?.length || 1) - 1), state: correct ? 'good' : 'bad', value: `${(elapsed / 1000).toFixed(2)} s`, text: correct ? `${getCase(trial.caseId).name} · recognized.` : `This is ${getCase(trial.caseId).name}.` });
    if (roundPanel.complete) return;
    const expected = getCase(trial.caseId); const cue = feedbackCue();
    const result = skipped ? `Skipped, it was ${expected.name}.` : correct ? `Nice · ${expected.name}` : `Not quite, it was ${expected.name}.`;
    setMessage(`${result}${recordable ? '' : ' · this one won’t count.'}`, correct ? 'correct' : 'wrong');
    $('#pll-next').hidden = false; $('#pll-next').focus({ preventScroll: true });
    const note = $('#pll-timing-note'); note.textContent = cue ? `${cue}${expected.algorithm ? ` · ${expected.algorithm}` : ''}` : (expected.algorithm ? `alg: ${expected.algorithm}` : 'This case is due again soon.');
    $('#pll-answers').querySelectorAll('.pll-answer').forEach((button) => { const id = button.dataset.pllAnswer; button.disabled = true; button.classList.toggle('correct', sameId(id, trial.caseId)); button.classList.toggle('wrong', !skipped && sameId(id, value) && !correct); });
  }
  function clearHistory() { Object.keys(stats).forEach((id) => { stats[id] = blankStats(); }); dueRetries = []; completed = 0; paceWindow = []; saveStats(stats); refreshStats(); setMessage('History cleared.'); }
  function onKey(event) {
    if (roundPanel.handleKey(event)) return;
    if (!active || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.toLowerCase() === KEYS.case.s && !locked && !paused) { event.preventDefault(); answer('', true); return; }
    if ((event.key === 'Enter' || event.key === ' ') && locked) { event.preventDefault(); newTrial(); return; }
    if (locked || paused) return;
    const key = event.key.toLowerCase(); const option = cases.find((item) => (family === 'all' || item.family === family) && item.key === key);
    if (option) { event.preventDefault(); answer(option.id); }
  }
  function onClick(event) { const button = event.target.closest('[data-pll-answer]'); if (button) answer(button.dataset.pllAnswer); }
  $('#pll-answers').addEventListener('click', onClick); $('#pll-next').addEventListener('click', newTrial); $('#pll-skip').addEventListener('click', () => answer('', true)); $('#pll-resume').addEventListener('click', newTrial); $('#pll-clear').addEventListener('click', () => { if (confirm('Clear PLL history?')) clearHistory(); });
  $('#pll-family').value = family;
  $('#pll-mode-note').textContent = MODES.find((item) => item.id === mode).note;
  $('#pll-family').addEventListener('change', (event) => { family = event.target.value; localStorage.setItem('cubesight-pll-family', family); renderAnswers(); newTrial(); });
  $('#pll-glance').addEventListener('change', (event) => { glanceEnabled = event.target.checked; localStorage.setItem('cubesight-pll-glance-enabled', String(glanceEnabled)); newTrial(); });
  $('#pll-glance-ms').value = String(glanceMs); $('#pll-glance-ms').addEventListener('change', (event) => { glanceMs = Math.max(GLANCE_MIN, Math.min(GLANCE_MAX, Number(event.target.value) || 600)); localStorage.setItem('cubesight-pll-glance-ms', String(glanceMs)); $('#pll-glance-caption').textContent = `adaptive glance · ${glanceMs} ms`; if (glanceEnabled) newTrial(); });
  root.querySelectorAll('[data-pll-mode]').forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.pllMode;
    // Learn deliberately blocks a small family; Mix and Transfer begin with
    // all cases so their discrimination/transfer purpose is explicit.
    family = mode === 'learn' ? (families[0] || 'all') : 'all';
    localStorage.setItem('cubesight-pll-mode', mode);
    localStorage.setItem('cubesight-pll-family', family);
    $('#pll-family').value = family;
    root.querySelectorAll('[data-pll-mode]').forEach((item) => item.classList.toggle('active', item === button));
    $('#pll-mode-note').textContent = MODES.find((item) => item.id === mode).note;
    newTrial();
  }));
  $('#pll-retention-help').addEventListener('click', () => setMessage('Random AUF cases return after 24 h to check your recog.', 'info'));
  const onCaseColorChange = event => { if (cube?.setCaseOrientation && trial?.state?.cubies) cube.setCaseOrientation(event.detail?.setting || readCaseColorSetting(), { seed: activeCaseSeed }); };
  window.addEventListener(CASE_COLOR_CHANGE_EVENT, onCaseColorChange);
  window.addEventListener('keydown', onKey);
  const roundPanel = createRoundPanel($('#pll-round-host'), {drill:'pll',orbitHost:$('.pll-cube-stage'),getSettings:()=>({mode,family,glanceEnabled,glanceMs}),onRestart:()=>newTrial(),onComplete:()=>{locked=true;stopClock();$('#pll-answers').querySelectorAll('button').forEach(button=>button.disabled=true);}});
  trainerOrbit.connect(roundPanel.orbit, () => roundPanel.getViewModel());
  roundPanel.setActive(true);
  const settingsControls = mountTrainerSettings($('.pll-settings'));
  refreshStats(); renderAnswers(); newTrial();

  return {
    // Route changes and hidden tabs invalidate the live observation. Returning
    // to the trainer always starts a fresh case, so unseen time is never
    // mistaken for recognition time.
    ready: cubeReady,
    getViewModel() {
      const snapshot = cube?.getSnapshot?.() ?? null;
      return { screen: 'trainer', drill: 'pll', phase: locked ? 'feedback' : trial ? (paused ? 'paused' : 'recognition') : 'loading',
        currentCase: trial ? { id: trial.caseId ?? null, seed: activeCaseSeed || `pll:${trial.caseId}`, topColor: snapshot?.renderData?.colors?.U ?? null, orientation: snapshot?.caseColorSetting ?? null, targets: trial.caseId ?? null } : null,
        answers: [...($('#pll-answers')?.querySelectorAll('[data-pll-answer]') || [])].map(button => ({ logicalKey: button.dataset.pllAnswer, displayKey: button.dataset.pllAnswer, label: button.querySelector('span')?.textContent || button.textContent.trim(), selected: button.classList.contains('wrong') || button.classList.contains('correct'), correct: button.classList.contains('correct') || (Boolean(trial) && sameId(button.dataset.pllAnswer, trial.caseId)) })),
        round: roundPanel.getViewModel(), cube: snapshot, feedback: $('#pll-feedback')?.textContent || '', settings: { mode, family, glanceEnabled, glanceMs, caseColor: readCaseColorSetting() } };
    },
    setActive(value) {
      if (active === value) return;
      active = value;
      roundPanel.setActive(value);
      if (!value) { stopClock(); locked = true; paused = true; if (trial) trial = { ...trial, invalidated: true }; }
      else { newTrial(); }
    },
    handleKey(event) { onKey(event); },
    updateHelp() {},
    destroy() { disposed = true; active = false; roundPanel.destroy(); trainerOrbit?.destroy(); stopClock(); window.removeEventListener(CASE_COLOR_CHANGE_EVENT, onCaseColorChange); window.removeEventListener('keydown', onKey); disposeCaseColorControl(); settingsControls.destroy(); cube?.destroy(); root.replaceChildren(); },
  };
}

export { median as pllMedian, renderDataFor as pllRenderData, nextGlanceMs as pllNextGlanceMs, isDelayedRetentionEligible as pllIsDelayedRetentionEligible };
