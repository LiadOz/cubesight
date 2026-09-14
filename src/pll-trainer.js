import './pll-trainer.css';
import { createCube3D } from './cube-3d.js';
import { toRenderData } from './cross-cube.js';
import { PLL_CASES, createPLLTrial } from './pll-logic.js';

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
  { id: 'learn', label: 'Learn', note: 'Build a reliable cue before speed.' },
  { id: 'mix', label: 'Mix', note: 'Interleave cases and practise retrieval.' },
  { id: 'transfer', label: 'Transfer', note: 'Random-AUF check; 24-hour returns count separately.' },
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
  let mode = 'learn';
  // Learn starts with one small family/block. Mixing all 21 cases is useful
  // later, but is needlessly noisy for a first exposure.
  let family = families[0] || 'all';
  let active = true;
  let trial = null;
  let trialToken = 0;
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
    <section class="pll-intro"><div><p class="eyebrow">Practice / PLL recognition</p><h1>PLL recognition</h1></div><p class="intro-copy">See the permutation.<br>Call it instantly.</p></section>
    <details class="pll-settings" open><summary><span>Training settings</span><small>Retrieval, pacing & case families</small><i aria-hidden="true"></i></summary>
      <div class="pll-controls">
        <div class="pll-control-group"><span class="pll-label">Practice mode</span><div class="pll-segmented" role="group" aria-label="PLL practice mode">${MODES.map((item) => `<button type="button" class="pll-segment${item.id === mode ? ' active' : ''}" data-pll-mode="${item.id}">${item.label}</button>`).join('')}</div><small id="pll-mode-note">${MODES[0].note}</small></div>
        <label class="pll-control-group"><span class="pll-label">Case family</span><select id="pll-family" aria-label="PLL case family"><option value="all">All PLL cases · mixed</option>${families.map((item) => `<option value="${esc(item)}"${item === family ? ' selected' : ''}>${esc(pretty(item))} family · learn block</option>`).join('')}</select></label>
        <div class="pll-control-group pll-pacing"><span class="pll-label">Glance window</span><label class="pll-check"><input id="pll-glance" type="checkbox" ${glanceEnabled ? 'checked' : ''}> <span>Hide after exposure</span></label><label class="pll-select-label" for="pll-glance-ms"><span id="pll-glance-caption">Adaptive · ${glanceMs} ms</span><select id="pll-glance-ms" aria-label="Glance exposure"><option value="25">25 ms</option><option value="50">50 ms</option><option value="75">75 ms</option><option value="100">100 ms</option><option value="150">150 ms</option><option value="200">200 ms</option><option value="300">300 ms</option><option value="450">450 ms</option><option value="600">600 ms</option><option value="800">800 ms</option><option value="1000">1 s</option><option value="1500">1.5 s</option></select></label></div>
      </div>
    </details>
    <section class="pll-trainer-shell">
      <div class="pll-cube-stage"><div class="pll-stage-topline"><span class="status-dot"><i></i> Identify the PLL</span><span class="view-lock">Fixed two-sided view</span></div><div id="pll-cube" class="pll-cube-mount"></div><div id="pll-glance-overlay" class="pll-glance-overlay" hidden>Answer now</div><div id="pll-pause" class="pll-pause" hidden><strong>Paused locally</strong><span>This attempt passed 10 seconds without an answer, so it is not recorded.</span><button type="button" id="pll-resume">Resume with fresh case</button></div><div class="pll-cube-caption"><span>U top · F/R sides · AUF varies</span><span>Rotation locked to protect recognition</span></div></div>
      <div class="pll-answer-stage"><div class="pll-case-meta"><span id="pll-case-number">CASE 001</span><span id="pll-case-mode">LEARN · ALL CASES</span></div><div class="pll-timer-wrap"><span class="pll-timer-label">Recognition time</span><div id="pll-timer" class="pll-timer">0.00<span>s</span></div><small id="pll-timing-note">Accuracy first; speed follows stable retrieval.</small></div><div class="pll-prompt"><p>Which PLL case is this?</p><small>Use a button or its keyboard shortcut. Reveal the cue only after retrieval.</small></div><div id="pll-answers" class="pll-answer-grid" role="group" aria-label="Choose the PLL case"></div><div class="pll-feedback-row"><p id="pll-feedback" role="status" aria-live="polite">Choose the case you see.</p><button type="button" class="pll-skip" id="pll-skip">Skip <kbd>S</kbd></button></div><button type="button" class="pll-next" id="pll-next" hidden>Next case <span>→</span></button></div>
    </section>
    <section class="pll-progress"><div class="pll-section-heading"><div><p class="eyebrow">Progress</p><h2>Recognition profile</h2></div><button type="button" class="pll-text-button danger" id="pll-clear">Clear PLL history</button></div><div class="pll-metric-grid"><article><span>Practice accuracy</span><strong id="pll-accuracy">—</strong><small id="pll-accuracy-note">No recorded answers</small></article><article><span>Transfer accuracy</span><strong id="pll-transfer">—</strong><small id="pll-transfer-note">No transfer probes</small></article><article><span>Median recognition</span><strong id="pll-median">—</strong><small>Correct responses only</small></article><article><span>Reviews ready</span><strong id="pll-due">0</strong><small id="pll-due-note">Spaced + corrective returns</small></article><article><span>24h retention</span><strong id="pll-retention">—</strong><small>Delayed transfer probes only</small></article></div><div class="pll-case-card"><div class="pll-case-head"><div><span>By case</span><small>Weak and slow cases surface first</small></div><button type="button" class="pll-text-button" id="pll-retention-help">Why 24h probes?</button></div><div id="pll-case-list"></div></div></section>`;

  const $ = (selector) => root.querySelector(selector);
  if (window.matchMedia('(max-width: 700px)').matches) $('.pll-settings').open = false;
  const cube = createCube3D($('#pll-cube'), { mode: 'corner' });
  const setTimerText = (milliseconds) => { $('#pll-timer').innerHTML = `${(milliseconds / 1000).toFixed(2)}<span>s</span>`; };
  const totalAttempts = () => Object.values(stats).reduce((sum, item) => sum + (item.attempts || 0), 0);
  const totalCorrect = () => Object.values(stats).reduce((sum, item) => sum + (item.correct || 0), 0);
  const allTimes = () => Object.values(stats).flatMap((item) => [...item.times, ...(item.transfer?.times || [])]);
  const currentFamilyLabel = () => family === 'all' ? 'ALL CASES' : `${pretty(family)} FAMILY`;

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
    $('#pll-accuracy-note').textContent = attempts ? `${correct} of ${attempts} valid answers` : 'No recorded answers';
    $('#pll-transfer').textContent = transferAttempts ? `${Math.round(transferCorrect / transferAttempts * 100)}%` : '—';
    $('#pll-transfer-note').textContent = transferAttempts ? `${transferCorrect} of ${transferAttempts} transfer probes` : 'No transfer probes';
    const middle = median(allTimes());
    $('#pll-median').textContent = middle == null ? '—' : `${(middle / 1000).toFixed(2)}s`;
    $('#pll-due').textContent = String(spacedDue + dueRetries.length);
    $('#pll-due-note').textContent = `${spacedDue} spaced · ${dueRetries.length} corrective`;
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
    $('#pll-case-list').innerHTML = rows.map(({ item, accuracy, med, delay, confused }) => `<div class="pll-case-row"><span class="pll-case-name"><b>${esc(item.name)}</b><small>${esc(pretty(item.family))}${confused ? ` · confused with ${esc(getCase(confused).name)}` : ''}</small></span><span>${accuracy == null ? '—' : `${accuracy}%`}<small>accuracy</small></span><span>${med == null ? '—' : `${(med / 1000).toFixed(2)}s`}<small>correct median</small></span><span>${delay == null ? '—' : `${delay}%`}<small>24h retention</small></span><i class="pll-mini-track"><em style="width:${accuracy == null ? 0 : accuracy}%"></em></i></div>`).join('') || '<p class="pll-empty">No cases in this family yet.</p>';
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
      // A ten-second lapse is an abandoned observation, not a slow response.
      // Lock it permanently and make the only continuation a fresh trial.
      paused = true; locked = true; trial = { ...trial, invalidated: true }; stopClock(); $('#pll-pause').hidden = false; $('#pll-cube').classList.add('is-paused'); setMessage('Abandoned after 10 seconds · not logged.', 'paused');
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
      $('#pll-glance-caption').textContent = `Adaptive · ${glanceMs} ms · ${paceWindow.length}/10`;
      return;
    }
    // A faster window is earned only by 90%+ accuracy across ten valid
    // retrievals. A struggling learner gets a little more viewing time; a
    // middle result holds steady so speed never outruns recognition.
    glanceMs = nextGlanceMs(glanceMs, paceWindow);
    paceWindow = [];
    localStorage.setItem('cubesight-pll-glance-ms', String(glanceMs));
    $('#pll-glance-ms').value = String(glanceMs);
    $('#pll-glance-caption').textContent = `Adaptive · ${glanceMs} ms · 0/10`;
  }
  function scheduleRetry(id) {
    if (!id) return;
    if (dueRetries.some((item) => item.id === id)) dueRetries = dueRetries.filter((item) => item.id !== id);
    dueRetries.push({ id, due: completed + 3 });
  }
  function chooseCase() {
    const due = dueRetries.find((item) => item.due <= completed);
    if (due) { dueRetries = dueRetries.filter((item) => item !== due); return cases.find((item) => sameId(item.id, due.id)) || { id: due.id, caseId: due.id }; }
    const deferred = new Set(dueRetries.filter((item) => item.due > completed).map((item) => item.id));
    const selectedFamily = cases.filter((item) => family === 'all' || item.family === family);
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
    const token = ++trialToken; stopClock(); locked = false; paused = false; elapsed = 0; $('#pll-pause').hidden = true; $('#pll-cube').classList.remove('is-paused'); $('#pll-next').hidden = true; setTimerText(0); setGlance(true); setMessage('Choose the case you see.');
    const selected = chooseCase();
    let generated;
    try { generated = await Promise.resolve(createPLLTrial({ mode, family, caseId: selected?.id || selected?.caseId })); } catch (error) { setMessage(`Could not generate a PLL case: ${error.message}`, 'error'); return; }
    if (token !== trialToken || !active) return;
    trial = { ...generated, caseId: generated?.caseId || generated?.id || selected?.id, name: generated?.name || generated?.label || selected?.name || selected?.id, family: generated?.family || selected?.family || family };
    root.dataset.pllCase = trial.caseId;
    const seenStats = caseStats(trial.caseId);
    trial.delayedEligible = mode === 'transfer' && isDelayedRetentionEligible(seenStats.lastSeen);
    const data = renderDataFor(trial); cube.update(data);
    $('#pll-case-number').textContent = `TRIAL ${String(completed + 1).padStart(3, '0')}`; $('#pll-case-mode').textContent = `${mode.toUpperCase()} · ${currentFamilyLabel()}`;
    $('#pll-timing-note').textContent = mode === 'transfer'
      ? 'Transfer probe · no cue until retrieval.'
      : glanceEnabled ? `Adaptive glance · ${glanceMs} ms · accuracy first.` : 'Full view · enable glance after the cues feel reliable.';
    renderAnswers(); refreshStats();
    startedAt = performance.now(); runClock(token);
    if (glanceEnabled) window.setTimeout(() => { if (token === trialToken && !locked && !paused) setGlance(false); }, glanceMs);
  }
  function renderAnswers() {
    const options = cases.filter((item) => family === 'all' || item.family === family);
    $('#pll-answers').innerHTML = options.map((item) => `<button type="button" class="pll-answer" data-pll-answer="${esc(item.id)}"><span>${esc(item.name)}</span><kbd>${esc(item.key.toUpperCase())}</kbd></button>`).join('');
  }
  function feedbackCue() {
    const cue = trial?.cue || trial?.recognitionCue || trial?.hint;
    if (!cue) return '';
    if (typeof cue === 'string') return cue;
    return cue.text || cue.label || cue.description || '';
  }
  function answer(value, skipped = false) {
    if (!trial || locked || paused) return;
    locked = true; stopClock(); elapsed = performance.now() - startedAt; setTimerText(elapsed); setGlance(true);
    const correct = !skipped && sameId(value, trial.caseId); const itemStats = caseStats(trial.caseId); const retention = mode === 'transfer';
    const delayed = retention && Boolean(trial.delayedEligible);
    if (!retention) {
      itemStats.attempts++;
      if (correct) { itemStats.correct++; itemStats.times.push(elapsed); itemStats.times = itemStats.times.slice(-80); }
      if (!correct && value) itemStats.confusion[value] = (itemStats.confusion[value] || 0) + 1;
    } else {
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
    if (!correct) scheduleRetry(trial.caseId);
    if (glanceEnabled) tuneGlance(correct, skipped);
    // Abandoned/hidden-tab trials never reach here, so they do not erase a
    // genuinely delayed return interval.
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
    const expected = getCase(trial.caseId); const cue = feedbackCue();
    setMessage(skipped ? `Skipped · correct case: ${expected.name}` : correct ? `Correct · ${expected.name}` : `Not quite · correct case: ${expected.name}`, correct ? 'correct' : 'wrong');
    $('#pll-next').hidden = false; $('#pll-next').focus({ preventScroll: true });
    const note = $('#pll-timing-note'); note.textContent = cue ? `${cue}${expected.algorithm ? ` · ${expected.algorithm}` : ''}` : (expected.algorithm ? `Algorithm: ${expected.algorithm}` : 'Corrective retrieval is scheduled after a short interleaved delay.');
    $('#pll-answers').querySelectorAll('.pll-answer').forEach((button) => { const id = button.dataset.pllAnswer; button.disabled = true; button.classList.toggle('correct', sameId(id, trial.caseId)); button.classList.toggle('wrong', !skipped && sameId(id, value) && !correct); });
  }
  function clearHistory() { Object.keys(stats).forEach((id) => { stats[id] = blankStats(); }); dueRetries = []; completed = 0; paceWindow = []; saveStats(stats); refreshStats(); setMessage('PLL history cleared.'); }
  function onKey(event) {
    if (!active || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.toLowerCase() === 's' && !locked && !paused) { event.preventDefault(); answer('', true); return; }
    if (event.key === 'Enter' && locked) { event.preventDefault(); newTrial(); return; }
    if (locked || paused) return;
    const key = event.key.toLowerCase(); const option = cases.find((item) => (family === 'all' || item.family === family) && item.key === key);
    if (option) { event.preventDefault(); answer(option.id); }
  }
  function onClick(event) { const button = event.target.closest('[data-pll-answer]'); if (button) answer(button.dataset.pllAnswer); }
  $('#pll-answers').addEventListener('click', onClick); $('#pll-next').addEventListener('click', newTrial); $('#pll-skip').addEventListener('click', () => answer('', true)); $('#pll-resume').addEventListener('click', newTrial); $('#pll-clear').addEventListener('click', () => { if (confirm('Clear all PLL recognition history?')) clearHistory(); });
  $('#pll-family').addEventListener('change', (event) => { family = event.target.value; renderAnswers(); newTrial(); });
  $('#pll-glance').addEventListener('change', (event) => { glanceEnabled = event.target.checked; localStorage.setItem('cubesight-pll-glance-enabled', String(glanceEnabled)); newTrial(); });
  $('#pll-glance-ms').value = String(glanceMs); $('#pll-glance-ms').addEventListener('change', (event) => { glanceMs = Math.max(GLANCE_MIN, Math.min(GLANCE_MAX, Number(event.target.value) || 600)); localStorage.setItem('cubesight-pll-glance-ms', String(glanceMs)); $('#pll-glance-caption').textContent = `Adaptive · ${glanceMs} ms`; if (glanceEnabled) newTrial(); });
  root.querySelectorAll('[data-pll-mode]').forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.pllMode;
    // Learn deliberately blocks a small family; Mix and Transfer begin with
    // all cases so their discrimination/transfer purpose is explicit.
    family = mode === 'learn' ? (families[0] || 'all') : 'all';
    $('#pll-family').value = family;
    root.querySelectorAll('[data-pll-mode]').forEach((item) => item.classList.toggle('active', item === button));
    $('#pll-mode-note').textContent = MODES.find((item) => item.id === mode).note;
    newTrial();
  }));
  $('#pll-retention-help').addEventListener('click', () => setMessage('Transfer probes return after practice so we can check durable retrieval, not just a warmed-up run.', 'info'));
  window.addEventListener('keydown', onKey);
  refreshStats(); renderAnswers(); newTrial();

  return {
    // Route changes and hidden tabs invalidate the live observation. Returning
    // to the trainer always starts a fresh case, so unseen time is never
    // mistaken for recognition time.
    setActive(value) {
      active = value;
      if (!value) { stopClock(); locked = true; paused = true; if (trial) trial = { ...trial, invalidated: true }; }
      else { newTrial(); }
    },
    handleKey(event) { onKey(event); },
    updateHelp() {},
    destroy() { active = false; stopClock(); window.removeEventListener('keydown', onKey); cube.destroy(); root.replaceChildren(); },
  };
}

export { median as pllMedian, renderDataFor as pllRenderData, nextGlanceMs as pllNextGlanceMs, isDelayedRetentionEligible as pllIsDelayedRetentionEligible };
