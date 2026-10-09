// What the corner and F2L trainers share and main.js does not need: the spaced-repetition store, the retention
// panel, the trial timeout and the Rust core. Loaded with the first of the two trainers.
import { fmt } from '../copy/terms.js';
import { keyScope } from '../routes.js';
import { loadLearning, saveLearning, sessionSummary } from '../learning.js';
import { host } from './trainer-host.js';

export const COLORS = {
  white: { label: 'White', hex: '#ffffff', ink: '#171815' },
  yellow: { label: 'Yellow', hex: '#ffd500', ink: '#171815' },
  green: { label: 'Green', hex: '#009b48', ink: '#ffffff' },
  blue: { label: 'Blue', hex: '#0051ba', ink: '#ffffff' },
  red: { label: 'Red', hex: '#e7332a', ink: '#ffffff' },
  orange: { label: 'Orange', hex: '#ff6b00', ink: '#17120c' },
};
export const FACE_COLOR = { U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' };
export const COLOR_FACE = Object.fromEntries(Object.entries(FACE_COLOR).map(([face, color]) => [color, face]));

export const TRIAL_TIMEOUT_MS = 10_000;

// Both trainers read and write one learning store, so it lives here (a swapped object, hence the holder).
export const store = { learning: loadLearning(localStorage) };

export function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

export function formatMs(ms) {
  return fmt.time(ms, { unit: true });
}

export function saveLearningState() {
  saveLearning(localStorage, store.learning);
  updateLearningUI();
}

export function updateLearningUI() {
  document.querySelector('.retention-panel').hidden = !keyScope(host.activeTool);
  if (!keyScope(host.activeTool)) return;
  const retentionPanel = document.querySelector('.retention-panel');
  // copy-ok: DOM selector for the existing progress disclosure, not display copy
  const progressSummary = document.querySelector(`#${host.activeTool}-view .trainer-progress-details > summary`);
  if (progressSummary) progressSummary.after(retentionPanel);
  else document.querySelector(`#${host.activeTool}-view .trainer-shell`)?.after(retentionPanel);
  const items = Object.fromEntries(Object.entries(store.learning.items).filter(([key]) => key.startsWith(`${host.activeTool === 'corner' ? 'corner' : 'f2l'}|`)));
  const summary = sessionSummary({ ...store.learning, items });
  const due = document.querySelector('#review-due');
  const note = document.querySelector('#review-summary');
  if (due) due.textContent = `${summary.due} due`;
  if (note) note.textContent = summary.attempts
    ? `${host.activeTool === 'corner' ? 'corners' : 'F2L'} · ${Math.round(summary.accuracy * 100)}% accuracy · median recog ${summary.medianMs !== null ? fmt.time(summary.medianMs, { unit: true }) : '—'}`
    : 'No cases due. Do a round to build your queue.';
  if (note && summary.delayedAttempts) note.textContent += ` · 24 h+: ${summary.delayedCorrect} of ${summary.delayedAttempts} correct`;
}


export function armTrialTimeout(startedAt) {
  clearTimeout(host.trialTimeout);
  host.trialTimeout = setTimeout(() => {
    if (!expireTrial(startedAt) && !host.paused) armTrialTimeout(startedAt);
  }, Math.max(1, TRIAL_TIMEOUT_MS - (performance.now() - startedAt)));
}

export function expireTrial(startedAt) {
  if (performance.now() - startedAt < TRIAL_TIMEOUT_MS) return false;
  host.pause('timeout');
  return true;
}

// The Rust core (wasm-bindgen). Started once, on first use.
let wasmLoad = null;
export const ensureWasm = () => wasmLoad ??= import('../wasm/cubesight_core.js').then(async module => { await module.default(); return module; });

// The shared WebGL cube; the browser caches the module, so each caller may import it independently.
export const loadSharedCube = () => import('../ui/cube/index.js');
