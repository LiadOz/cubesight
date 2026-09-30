// The manual timer: solve without a smart cube (spacebar, or touch and hold, like csTimer).
// Works where Web Bluetooth does not (iPhone). It is NOT part of the Brain: it shares the
// inspection model (src/solve-live.js), penalties, the history store (src/store) and the stats.
//
//   const timer = createTimer(root, { store, now });   // store = an opened history store
//   timer.setActive(false);                            // the page is hidden: listeners off, attempt cancelled
//   timer.detach();                                    // tear everything down
//
// Options: store (required), now (monotonic ms clock, default performance.now), wall (epoch ms,
// default Date.now), scramble (async () => string, default generateWcaScramble), storage
// (default localStorage: Brain settings + timer prefs), style ('orbit'|'mono', default the Brain
// style setting), loadStyle (async id => StyleModule, for tests).
// Returns { setActive, detach, machine, ready } (machine and ready are for tests and the dev page).

import '@fontsource-variable/manrope';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import '../brain/css/tokens-orbit.css';
import '../brain/css/tokens-mono.css';
import './timer.css';
import { fmtResult, fmtMoves, fmtTime } from '../brain/format.js';
import { loadSettings, saveSettings, setSetting } from '../brain/settings.js';
import { BRAIN_STYLES, DEFAULT_BRAIN_STYLE } from '../brain/types.js';
import { createTimerMachine, HOLD_OPTIONS } from './machine.js';
import { buildManualRecord, statsRow } from './record.js';
import { buildInspectionVM, inspectionFrame } from './inspection-vm.js';
import { loadTimerPrefs, saveTimerPrefs } from './prefs.js';
import { generateWcaScramble } from '../scramble.js';

const STYLES = {
  orbit: () => import('../brain/styles/orbit/index.js'),
  mono: () => import('../brain/styles/mono/index.js'),
};
const INSPECTION_CYCLE = ['wca', 'unlimited', 'off'];
const inspectionName = insp => (insp.mode === 'off' ? 'off' : insp.mode === 'unlimited' ? '∞' : `${insp.mode === 'custom' ? insp.seconds : 15} s`);

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
const keycap = (key, verb) => `<span class="tm-key"><kbd>${key}</kbd><span>${verb}</span></span>`;

export function createTimer(root, {
  store, now = () => performance.now(), wall = () => Date.now(), scramble = generateWcaScramble,
  storage = globalThis.localStorage, style: styleOption, loadStyle = id => STYLES[id]().then(m => m.default ?? m),
} = {}) {
  if (!store) throw new Error('createTimer needs a history store');
  let active = true;
  let detached = false;
  let settings = loadSettings(storage);
  let prefs = loadTimerPrefs(storage);
  let styleId = BRAIN_STYLES.includes(styleOption) ? styleOption : settings.style ?? DEFAULT_BRAIN_STYLE;

  // --- state --------------------------------------------------------------------------------
  let currentScramble = null;   // the scramble shown (null while it is generated)
  let scrambleState = 'loading';   // loading | ready | failed
  let scrambleToken = 0;
  let attemptScramble;          // the scramble of the attempt in progress (locked when it leaves idle)
  let lastAt = null;            // `at` of the last solve saved by this timer (the one +2/dnf/delete edit)
  let deleted = null;           // the last deleted record, for undo
  let notice = '';              // one quiet line: "not saved", "deleted · u undo"
  let wakeLock = null;
  let raf = 0;
  let activePointer = null;
  let keyHeld = false;
  let styleModule = null;
  let inspectionView = null;
  let inspectionShown = false;

  const machine = createTimerMachine({
    now, inspection: settings.inspection, holdMs: prefs.holdMs,
    onFinish: result => save(result),
    onChange: () => render(),
  });

  // --- DOM ----------------------------------------------------------------------------------
  root.classList.add('brain', 'tm');
  root.replaceChildren();
  const top = el('div', 'tm-top');
  const title = el('span', 'tm-title', 'timer');
  const options = el('div', 'tm-options');
  const holdBtn = el('button', 'tm-opt'); holdBtn.type = 'button'; holdBtn.dataset.action = 'hold';
  const inspBtn = el('button', 'tm-opt'); inspBtn.type = 'button'; inspBtn.dataset.action = 'inspection';
  options.append(inspBtn, holdBtn);
  top.append(title, options);

  const scrambleRow = el('div', 'tm-scramble-row');
  const scrambleText = el('p', 'tm-scramble');
  scrambleText.dataset.testid = 'scramble';
  const nextBtn = el('button', 'tm-textbtn', 'new scramble'); nextBtn.type = 'button'; nextBtn.dataset.action = 'new-scramble';
  scrambleRow.append(scrambleText, nextBtn);

  const pad = el('div', 'tm-pad');
  pad.setAttribute('role', 'button');
  pad.setAttribute('aria-label', 'timer: touch and hold, release to start');
  pad.dataset.testid = 'pad';
  const inspHost = el('div', 'tm-insp'); inspHost.hidden = true;
  const count = el('div', 'tm-count');           // orbit: the countdown in the ring's centre
  const ringHost = el('div', 'tm-ring');
  const consequence = el('p', 'tm-consequence');
  const inspStage = el('div', 'tm-insp-stage');
  inspStage.append(ringHost, count);
  inspHost.append(inspStage, consequence);
  const time = el('div', 'tm-time', '0.00'); time.dataset.testid = 'time';
  const sub = el('p', 'tm-sub'); sub.dataset.testid = 'sub';
  pad.append(inspHost, time, sub);

  const stats = el('div', 'tm-stats'); stats.dataset.testid = 'stats';
  const controls = el('div', 'tm-controls');
  const mkBtn = (action, label, keyLabel) => {
    const b = el('button', 'tm-textbtn'); b.type = 'button'; b.dataset.action = action;
    b.innerHTML = `<kbd>${keyLabel}</kbd><span>${label}</span>`;
    return b;
  };
  const plus2Btn = mkBtn('plus2', '+2', '2');
  const dnfBtn = mkBtn('dnf', 'dnf', 'd');
  const delBtn = mkBtn('delete', 'delete', 'del');
  const undoBtn = mkBtn('undo', 'undo', 'u');
  controls.append(plus2Btn, dnfBtn, delBtn, undoBtn);
  const keys = el('div', 'tm-keys');
  const status = el('p', 'tm-sr'); status.setAttribute('aria-live', 'polite');
  root.append(top, scrambleRow, pad, stats, controls, keys, status);

  // --- scramble -----------------------------------------------------------------------------
  function loadScramble() {
    const token = ++scrambleToken;
    scrambleState = 'loading';
    currentScramble = null;
    Promise.resolve().then(scramble).then(text => {
      if (token !== scrambleToken || detached) return;
      currentScramble = String(text); scrambleState = 'ready'; render();
    }, () => {
      if (token !== scrambleToken || detached) return;
      currentScramble = ''; scrambleState = 'failed'; render();
    });
    render();
  }

  // --- saving and editing ---------------------------------------------------------------------
  function focus() { return settings.session?.focus ?? 'speed'; }

  function save(result) {
    const records = store.records;
    const at = Math.max(wall(), (records.length ? records[records.length - 1].at : 0) + 1);
    const scrambleOfSolve = attemptScramble ?? currentScramble ?? '';
    const record = store.append(buildManualRecord(result, { at, scramble: scrambleOfSolve, focus: focus() }));
    attemptScramble = undefined;
    if (record) {
      lastAt = record.at;
      deleted = null;
      notice = '';
      setText(status, `${fmtResult(record)}`);
    } else {
      lastAt = null;
      notice = 'history is read-only, this solve was not saved';
    }
    loadScramble();
    // Stats and the time are drawn by the render that follows.
  }

  const lastRecord = () => (lastAt == null ? null : store.records.find(r => r.at === lastAt) ?? null);
  const editable = () => { const p = machine.snapshot(); return !p.hold && (p.phase === 'idle' || p.phase === 'done'); };

  function togglePenalty(penalty) {
    const record = lastRecord();
    if (!record || !editable()) return;
    store.setPenalty(record.at, record.penalty === penalty ? null : penalty);
    notice = '';
    render();
  }
  function deleteLast() {
    const record = lastRecord();
    if (!record || !editable()) return;
    deleted = store.remove(record.at);
    lastAt = null;
    machine.reset();
    notice = 'deleted';
    render();
  }
  function undoDelete() {
    if (!deleted || !editable()) return;
    const back = store.restore(deleted);
    if (back) { lastAt = back.at; notice = ''; }
    deleted = null;
    render();
  }
  function newScramble() {
    const p = machine.snapshot();
    if (p.hold || p.phase === 'inspecting' || p.phase === 'running') return;
    machine.reset();
    loadScramble();
  }

  // --- render -------------------------------------------------------------------------------
  function updateInspection(snap) {
    const want = snap.phase === 'inspecting' && Boolean(inspectionView);
    if (want && !inspectionShown) {
      inspectionView.update({ screen: 'inspection', inspection: buildInspectionVM(machine.inspection, snap.inspectionElapsedMs) }, null);
      inspectionShown = true;
    } else if (!want && inspectionShown) {
      inspectionView.update({ screen: 'idle', inspection: null }, null);
      inspectionShown = false;
    }
    inspHost.hidden = snap.phase !== 'inspecting';
    if (want) {
      const f = inspectionFrame(machine.inspection, snap.inspectionElapsedMs);
      inspectionView.frame?.({ startedAtSolve: null, clockText: '', currentFill: 0, currentSplitText: '', currentOver: false, inspection: f });
      setText(count, f.bigText);
      count.dataset.tone = f.tone;
      setText(consequence, f.consequence);
    }
  }

  function render() {
    if (detached) return;
    const snap = machine.snapshot();
    const busy = snap.hold || snap.phase === 'inspecting' || snap.phase === 'running';
    root.dataset.brainStyle = styleId;
    root.dataset.phase = snap.phase;
    root.dataset.hold = snap.hold ?? '';
    root.classList.toggle('is-busy', Boolean(busy));

    // The big time.
    const record = lastRecord();
    let timeText;
    let tone = '';
    if (snap.hold && snap.phase !== 'inspecting') { timeText = fmtTime(0); tone = snap.hold === 'ready' ? 'ready' : 'holding'; }
    else if (snap.phase === 'running') timeText = fmtTime(snap.elapsedMs);
    else if (snap.phase === 'done') {
      const shown = record ?? { solveMs: snap.result.solveMs, penalty: snap.result.penalty };
      timeText = fmtResult(shown);
      tone = shown.penalty === 'DNF' ? 'dnf' : shown.penalty === '+2' ? 'plus2' : '';
    } else timeText = fmtTime(0);
    setText(time, timeText);
    time.dataset.tone = tone;
    time.hidden = snap.phase === 'inspecting';

    // The line under it.
    let line = '';
    if (snap.hold === 'holding') line = 'keep holding';
    else if (snap.hold === 'ready') line = snap.phase === 'inspecting' ? 'release to start the solve' : 'release to start';
    else if (snap.phase === 'running' || snap.phase === 'inspecting') line = '';
    else if (snap.phase === 'done' && record) line = [record.penalty === '+2' ? `${fmtTime(record.solveMs)} +2` : '', notice].filter(Boolean).join(' · ');
    else line = notice || (store.readOnly ? 'history is read-only' : 'touch and hold, or hold space');
    if (snap.phase === 'done' && !record && notice) line = notice;
    setText(sub, line);

    // Scramble: locked to the attempt's own while it is under way.
    if (busy && attemptScramble === undefined && snap.phase !== 'idle') attemptScramble = currentScramble;
    if (!busy && snap.phase === 'idle') attemptScramble = undefined;
    const shownScramble = snap.phase === 'inspecting' || snap.phase === 'running' ? attemptScramble ?? currentScramble : currentScramble;
    const scrambleLine = scrambleState === 'failed' ? 'could not make a scramble, press n to try again'
      : shownScramble == null ? 'generating scramble…' : fmtMoves(shownScramble);
    setText(scrambleText, scrambleLine);
    scrambleText.dataset.state = scrambleState;

    // Stats.
    const row = statsRow(store.records, focus());
    const statsKey = JSON.stringify([row.count, row.cells, focus()]);
    if (stats.dataset.key !== statsKey) {
      stats.dataset.key = statsKey;
      stats.replaceChildren();
      if (!row.count) stats.append(el('span', 'tm-stat-empty', `no ${focus()} solves yet`));
      else {
        for (const c of row.cells) {
          const cell = el('span', 'tm-stat'); cell.dataset.stat = c.key;
          cell.append(el('span', 'tm-stat-label', c.label), el('b', 'tm-stat-value', c.text));
          stats.append(cell);
        }
        stats.append(el('span', 'tm-stat tm-stat-count', `${row.count} ${row.count === 1 ? 'solve' : 'solves'}`));
      }
    }

    // Controls and key hints (only what is live now).
    const canEdit = Boolean(record) && !busy;
    plus2Btn.hidden = dnfBtn.hidden = delBtn.hidden = !canEdit;
    plus2Btn.classList.toggle('is-on', record?.penalty === '+2');
    dnfBtn.classList.toggle('is-on', record?.penalty === 'DNF');
    undoBtn.hidden = !(deleted && !busy);
    nextBtn.hidden = busy;
    options.hidden = busy;
    setText(holdBtn, `hold ${prefs.holdMs}`);
    setText(inspBtn, `insp ${inspectionName(machine.inspection)}`);
    holdBtn.title = 'how long to hold before the timer is ready (ms)';
    inspBtn.title = 'inspection: 15 s, unlimited or off (shared with solve)';
    let hints;
    if (snap.phase === 'running') hints = keycap('any key', 'stop') + keycap('esc', 'abort');
    else if (snap.phase === 'inspecting') hints = keycap('space', 'hold, release to start') + keycap('esc', 'abort');
    else if (snap.hold) hints = keycap('esc', 'abort');
    else {
      hints = keycap('space', 'hold to start') + keycap('n', 'new scramble');
      if (deleted) hints += keycap('u', 'undo');
    }
    if (keys.dataset.key !== hints) { keys.dataset.key = hints; keys.innerHTML = hints; }

    updateInspection(snap);
    wake(Boolean(busy));
    if (busy && !raf && active) raf = requestAnimationFrame(loop);
  }

  function loop() {
    raf = 0;
    if (detached || !active) return;
    render();
  }

  // --- wake lock ----------------------------------------------------------------------------
  async function wake(on) {
    try {
      if (on && !wakeLock && globalThis.navigator?.wakeLock) {
        wakeLock = 'pending';
        const lock = await navigator.wakeLock.request('screen');
        if (wakeLock === 'pending' && !detached) { wakeLock = lock; lock.addEventListener?.('release', () => { if (wakeLock === lock) wakeLock = null; }); }
        else lock.release?.().catch?.(() => {});
      } else if (!on && wakeLock) {
        const lock = wakeLock; wakeLock = null;
        if (lock !== 'pending') await lock.release?.();
      }
    } catch { wakeLock = null; /* best effort: denied, or the page is hidden */ }
  }

  // --- input --------------------------------------------------------------------------------
  const editable_ = target => target instanceof Element && (target.closest('input, textarea, select, [contenteditable="true"]') != null);

  function onKeyDown(event) {
    if (!active || event.ctrlKey || event.metaKey || event.altKey || editable_(event.target)) return;
    const key = event.key === 'Spacebar' ? ' ' : event.key;
    const snap = machine.snapshot();
    if (key === 'Escape') {
      if (snap.phase === 'running' || snap.phase === 'inspecting' || snap.hold) { event.preventDefault(); machine.cancel(); }
      return;
    }
    if (snap.phase === 'running') {   // any key stops
      event.preventDefault();
      if (!event.repeat) machine.down();
      return;
    }
    if (key === ' ') {
      event.preventDefault();
      if (!event.repeat && !keyHeld) { keyHeld = true; machine.down(); }
      return;
    }
    if (event.repeat || snap.hold || snap.phase === 'inspecting') return;
    const lower = key.length === 1 ? key.toLowerCase() : key;
    if (lower === 'n') newScramble();
    else if (lower === '2') togglePenalty('+2');
    else if (lower === 'd') togglePenalty('DNF');
    else if (key === 'Delete' || key === 'Backspace') deleteLast();
    else if (lower === 'u') undoDelete();
    else return;
    event.preventDefault();
  }
  function onKeyUp(event) {
    if (!active || editable_(event.target)) return;
    const key = event.key === 'Spacebar' ? ' ' : event.key;
    if (key !== ' ') return;
    event.preventDefault();
    if (keyHeld) { keyHeld = false; machine.up(); }
  }
  function onBlur() { keyHeld = false; machine.abortHold(); }

  function onPointerDown(event) {
    if (!active || activePointer != null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const snap = machine.snapshot();
    const onPad = event.target instanceof Element && pad.contains(event.target);
    if (snap.phase !== 'running' && !onPad) return;   // only the timer area starts; anything stops
    event.preventDefault();
    activePointer = event.pointerId;
    try { root.setPointerCapture(event.pointerId); } catch { /* synthetic pointers */ }
    machine.down();
  }
  function onPointerUp(event) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    if (event.type === 'pointercancel') machine.abortHold(); else machine.up();
  }
  const stop = event => event.preventDefault();
  function onVisibility() { if (document.hidden) { keyHeld = false; machine.abortHold(); } else if (machine.snapshot().phase === 'running' || machine.snapshot().phase === 'inspecting') wake(true); }

  function onClick(event) {
    const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    if (!button) return;
    switch (button.dataset.action) {
      case 'new-scramble': newScramble(); break;
      case 'plus2': togglePenalty('+2'); break;
      case 'dnf': togglePenalty('DNF'); break;
      case 'delete': deleteLast(); break;
      case 'undo': undoDelete(); break;
      case 'hold': {
        prefs = { holdMs: HOLD_OPTIONS[(HOLD_OPTIONS.indexOf(prefs.holdMs) + 1) % HOLD_OPTIONS.length] };
        saveTimerPrefs(storage, prefs); machine.setHoldMs(prefs.holdMs); break;
      }
      case 'inspection': {
        const next = INSPECTION_CYCLE[(INSPECTION_CYCLE.indexOf(settings.inspection.mode) + 1) % INSPECTION_CYCLE.length];
        settings = setSetting(settings, 'inspection.mode', next);
        saveSettings(storage, settings);
        machine.setInspection(settings.inspection); break;
      }
      default: return;
    }
    button.blur();
  }

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('click', onClick);
  pad.addEventListener('contextmenu', stop);
  root.addEventListener('gesturestart', stop);
  root.addEventListener('touchstart', e => { if (pad.contains(e.target) || machine.snapshot().phase === 'running') e.preventDefault(); }, { passive: false });
  root.addEventListener('touchmove', stop, { passive: false });

  // --- lifecycle ----------------------------------------------------------------------------
  if (store.sessionGapMin !== settings.session?.gapMin && settings.session?.gapMin) store.setSessionGapMin(settings.session.gapMin);
  root.dataset.brainStyle = styleId;

  async function mountStyle() {
    styleModule = await loadStyle(styleId);
    if (detached) return;
    inspectionView?.destroy?.();
    ringHost.replaceChildren();
    // Orbit draws a ring (the big number is the timer's own, in its centre); Mono draws the lane
    // with its own countdown, so the centre number is hidden there.
    const mono = styleId === 'mono';
    inspHost.dataset.kind = mono ? 'lane' : 'ring';
    inspectionView = styleModule.inspection(mono ? inspHost : ringHost, {});
    inspectionShown = false;
    render();
  }
  loadScramble();
  const ready = mountStyle();
  render();

  return {
    ready,
    machine,
    setActive(next) {
      active = Boolean(next);
      if (!active) { machine.cancel(); keyHeld = false; activePointer = null; wake(false); }
      else {
        settings = loadSettings(storage);
        machine.setInspection(settings.inspection);
        const nextStyle = BRAIN_STYLES.includes(styleOption) ? styleOption : settings.style;
        if (nextStyle !== styleId) { styleId = nextStyle; void mountStyle(); }
        render();
      }
    },
    detach() {
      detached = true;
      active = false;
      if (raf) cancelAnimationFrame(raf);
      wake(false);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      inspectionView?.destroy?.();
      root.classList.remove('brain', 'tm');
      root.replaceChildren();
    },
  };
}
