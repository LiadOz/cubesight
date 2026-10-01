// Brain diagnostics: save the always-on input recording, start a fresh one,
// and replay a recording into the real Brain UI.
//
// Replay goes through the shared REAL smart-cube session (its device adapter
// is routed to the recording) and re-applies the recorded user actions by
// driving the same controls the user used (mode buttons, scramble box, Start,
// Cancel, setting checkboxes), so the 3D cube, coach and timeline react
// exactly as they did live.

import { record, serializeRecording, clearRecording, parseRecording, isReplaying } from './recorder.js';
import { replayIntoSession } from './recording-replay.js';
import { setReplayConnectDevice } from './smart-cube-bluetooth.js';
import { getConnectionLog } from './smart-cube-diag.js';
import { SOLVE_STORE_KEY } from './solve-metrics.js';

const DEV = Boolean(import.meta.env?.DEV);
let urlReplayStarted = false;

// Controls whose clicks/changes are recorded as 'ui' actions. Start/Cancel and
// the pseudo/inspection checkboxes are recorded at the live-tracker seam
// (live.call) instead, with their exact arguments (the scramble string).
const UI_CLICK = ['[data-brain-mode]', '[data-brain-method]', '[data-brain-cross]', '#brain-recenter', '#brain-reset-view'];

function selectorFor(el) {
  for (const attr of ['data-brain-mode', 'data-brain-method', 'data-brain-cross', 'data-brain-toggle']) {
    if (el.hasAttribute(attr)) return `[${attr}="${el.getAttribute(attr)}"]`;
  }
  return el.id ? `#${el.id}` : null;
}

// `dispatch` (Brain v2) re-applies recorded actions through the controller
// instead of clicking DOM controls; recordings made before v2 still replay.
export function attachBrainRecording({ root, live, cubeSession, getContext = () => ({}), onSolvesRestored = () => {}, dispatch = null }) {
  const $ = selector => root.querySelector(selector);
  const status = text => { const el = $('#brain-recording-status'); if (el) el.textContent = text; };
  let abort = null;

  // Record UI-only inputs once per root (the root outlives view rebuilds).
  if (!root.dataset.recordingBound) {
    root.dataset.recordingBound = '1';
    root.addEventListener('click', event => {
      const el = event.target.closest?.(UI_CLICK.join(','));
      if (el && root.contains(el)) record('ui', { type: 'click', selector: selectorFor(el) });
    }, true);
    root.addEventListener('change', event => {
      const el = event.target.closest?.('[data-brain-toggle]');
      if (el) record('ui', { type: 'toggle', selector: selectorFor(el), checked: el.checked });
    }, true);
  }
  record('ui', { type: 'brain-created', context: getContext() });

  async function save() {
    const json = serializeRecording({ diagnostics: getConnectionLog(), context: getContext() });
    const name = `cubesight-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    const size = `${(json.length / 1024).toFixed(0)} KB`;
    if (!DEV) { status(`Downloaded ${name} (${size}).`); return; }
    try {
      const res = await fetch('/__recording', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json });
      const body = res.ok ? await res.json() : null;
      status(res.ok ? `Downloaded and saved to ${body.file} (${size}). Replay: node scripts/replay-recording.mjs ${body.file}` : `Downloaded (${size}); dev save failed: HTTP ${res.status}`);
    } catch (error) { status(`Downloaded (${size}); dev save failed: ${error.message}`); }
  }

  // Re-apply one recorded user action through the Brain's own controls.
  function applyAction(action) {
    if (dispatch && applyWithDispatch(action)) return;
    const click = selector => { const el = selector && $(selector); if (el) el.click(); return el; };
    const setChecked = (selector, value) => {
      const el = $(selector);
      if (!el) return;
      el.checked = Boolean(value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (action.kind === 'live.call') {
      const [arg] = action.args || [];
      if (action.method === 'startGuided') {
        click('[data-brain-mode="guided"]');
        $('#brain-scramble').value = arg;
        click('#brain-start');
      } else if (action.method === 'startFree') {
        click('[data-brain-mode="free"]');
        click('#brain-start');
      } else if (action.method === 'cancel') {
        if ($('#brain-stop') && !$('#brain-stop').hidden) click('#brain-stop');
        else if ($('#brain-review-close')) click('#brain-review-close');
        else live.cancel();
      } else if (action.method === 'setPseudo') setChecked('#brain-pseudo', arg);
      else if (action.method === 'setInspection') {
        if (typeof arg?.enabled === 'boolean') setChecked('#brain-inspection', arg.enabled);
        else live.setInspection(arg);
      }
    } else if (action.kind === 'ui') {
      if (action.type === 'click') click(action.selector);
      else if (action.type === 'toggle') setChecked(action.selector, action.checked);
    }
  }

  // The v2 path: the same actions the controls dispatch. Returns false for
  // DOM-only entries (v1 clicks/toggles), which the selector path replays.
  function applyWithDispatch(action) {
    if (action.kind === 'live.call') {
      const [arg] = action.args || [];
      if (action.method === 'startGuided') {
        dispatch({ type: 'setSetting', path: 'scramble', value: 'guided' });
        dispatch({ type: 'setScrambleText', text: arg });
        dispatch({ type: 'start' });
      } else if (action.method === 'startFree') {
        dispatch({ type: 'setSetting', path: 'scramble', value: 'free' });
        dispatch({ type: 'start' });
      } else if (action.method === 'cancel') dispatch({ type: live.getSnapshot().phase === 'done' ? 'dismissResults' : 'cancel' });
      else if (action.method === 'setPseudo') dispatch({ type: 'setSetting', path: 'f2l', value: arg ? 'pseudo' : 'standard' });
      else if (action.method === 'setInspection') dispatch({ type: 'setSetting', path: 'inspection', value: arg });
      else return false;
      return true;
    }
    if (action.kind === 'ui' && action.type === 'action' && action.action) { dispatch(action.action); return true; }
    return false;
  }

  // A banner in the connection chip says the cube view is a replay, and after
  // it ends that the real cube can be connected again.
  function banner(text, { stoppable = false } = {}) {
    let el = $('#brain-replay-banner');
    if (!el && text) {
      const chip = $('.brain-connect-chip');
      if (!chip) return;
      el = document.createElement('p');
      el.id = 'brain-replay-banner';
      el.className = 'brain-replay-banner';
      el.setAttribute('role', 'status');
      el.innerHTML = '<span></span> <button class="brain-chip" type="button">Stop replay</button>';
      el.querySelector('button').addEventListener('click', () => abort?.abort());
      // v2 shell: a banner slot under the top bar; v1: inside the connect chip.
      const slot = $('[data-slot="banner"]');
      if (slot) slot.append(el); else chip.querySelector('.brain-controls')?.before(el);
      // Connecting the real cube dismisses the "replay finished" notice.
      $('#brain-connect')?.addEventListener('click', () => { if (!abort) banner(null); });
    }
    if (!el) return;
    el.hidden = !text;
    el.querySelector('span').textContent = text || '';
    el.querySelector('button').hidden = !stoppable;
  }

  // Leave the Brain as the user would after disconnecting their cube: an
  // unfinished replayed solve is cancelled (a stopped replay also closes its
  // review); a finished solve's review stays until the user continues.
  function endReplayUi({ aborted }) {
    const phase = live.getSnapshot().phase;
    if (phase === 'idle' || (phase === 'done' && !aborted)) return;
    applyAction({ kind: 'live.call', method: 'cancel' });
  }

  async function replay(recording, speed) {
    if (abort || isReplaying()) { status('A replay is already running.'); return; }
    const parsed = parseRecording(recording);
    // Replayed solves must not land in the user's history.
    let savedSolves = null;
    try { savedSolves = localStorage.getItem(SOLVE_STORE_KEY); } catch { /* ignore */ }
    abort = new AbortController();
    const signal = abort.signal;
    const stopButton = $('#brain-replay-stop');
    if (stopButton) stopButton.hidden = false;
    document.documentElement.dataset.replay = 'running';
    const moves = parsed.events.filter(e => e.kind === 'cube-event' && e.data?.event?.type === 'MOVE').length;
    status(`Replaying ${parsed.events.length} events (${moves} moves) at ${speed ? `${speed}×` : 'full speed'}…`);
    banner(`Replaying a recording (${moves} moves). This is not your cube.`, { stoppable: true });
    const started = performance.now();
    try {
      const result = await replayIntoSession(parsed, {
        session: cubeSession, setConnectDevice: setReplayConnectDevice, onAction: applyAction, onEnd: endReplayUi, speed, signal,
      });
      const issues = result.divergences.length + result.actionErrors.length;
      const final = result.recording.final;
      status(`Replay ${signal.aborted ? 'stopped' : 'finished'} in ${((performance.now() - started) / 1000).toFixed(1)} s${final ? `. The recording ended in ${final.phase} with ${final.moves?.length ?? 0} tracked moves` : ''}${issues ? `. ${issues} replay issues. See the dev log` : ''}.`);
      if (issues) console.warn('[replay] divergences', result.divergences, result.actionErrors);
      banner(`Replay ${signal.aborted ? 'stopped' : 'finished'}. Connect your cube to start.`);
      document.documentElement.dataset.replay = signal.aborted ? 'stopped' : 'done';
    } catch {
      status('Couldn’t replay this recording. Check the file and try again.');
      banner('Replay failed. Connect your cube to start.');
      document.documentElement.dataset.replay = 'error';
    } finally {
      try { if (savedSolves == null) localStorage.removeItem(SOLVE_STORE_KEY); else localStorage.setItem(SOLVE_STORE_KEY, savedSolves); } catch { /* ignore */ }
      onSolvesRestored();
      if (stopButton) stopButton.hidden = true;
      abort = null;
    }
  }

  const speed = () => Number($('#brain-replay-speed')?.value ?? 1);
  $('#brain-save-recording')?.addEventListener('click', () => { void save(); });
  $('#brain-clear-recording')?.addEventListener('click', () => { clearRecording(); status('Started a fresh recording (the current connection and tracked moves are kept as its starting point).'); });
  $('#brain-load-recording')?.addEventListener('click', () => $('#brain-load-recording-file')?.click());
  $('#brain-replay-stop')?.addEventListener('click', () => abort?.abort());
  $('#brain-load-recording-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { await replay(JSON.parse(await file.text()), speed()); }
    catch (error) { status(`Could not load recording: ${error.message}`); }
  });

  // Playwright / deep link: /?replay=<url>&replaySpeed=0#/brain
  const params = new URLSearchParams(location.search);
  const replayUrl = params.get('replay');
  if (replayUrl && !urlReplayStarted) {
    urlReplayStarted = true;
    const replaySpeed = params.has('replaySpeed') ? Number(params.get('replaySpeed')) || 0 : 1;
    void fetch(replayUrl).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => replay(data, replaySpeed))
      .catch(error => { status(`Could not load ${replayUrl}: ${error.message}`); document.documentElement.dataset.replay = 'error'; });
  }

  return { save, replay, applyAction };
}
