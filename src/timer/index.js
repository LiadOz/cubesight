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
import { createRoundStore } from '../drills/rounds.js';
import { BRAIN_STYLES, DEFAULT_BRAIN_STYLE } from '../brain/types.js';
import { createTimerMachine, HOLD_OPTIONS } from './machine.js';
import { buildManualRecord, statsRow } from './record.js';
import { buildInspectionVM, inspectionFrame } from './inspection-vm.js';
import { loadTimerPrefs, saveTimerPrefs } from './prefs.js';
import { generateWcaScramble } from '../scramble.js';
import { openHistory } from '../store/history.js';
import { syncPageTokens } from '../pages/tokens.js';
import { createSolvedState } from '../cross-cube.js';

const STYLES = {
  orbit: () => import('../brain/styles/orbit/index.js'),
  mono: () => import('../brain/styles/mono/index.js'),
};
const INSPECTION_CYCLE = ['wca', 'custom', 'unlimited', 'off'];
const OVERTIME_CYCLE = ['wca', 'count', 'grace', 'autostart'];
const inspectionName = insp => (insp.mode === 'off' ? 'off' : insp.mode === 'unlimited' ? '∞' : `${insp.mode === 'custom' ? `custom ${insp.seconds}` : 'WCA 15'} s`);
const inspectionControlName = insp => insp.mode === 'wca' ? 'WCA 15 s' : inspectionName(insp);
const overtimeName = insp => insp.overtime === 'wca' ? 'WCA +2 / DNF' : insp.overtime === 'autostart' ? 'auto-start' : insp.overtime === 'grace' ? `grace ${insp.graceSeconds} s · ${insp.gracePenalty === 'none' ? 'none' : insp.gracePenalty === 'dnf' ? 'DNF' : '+2'}` : insp.overtime;

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
  let refreshingHistory = false;
  let settings = loadSettings(storage);
  let prefs = loadTimerPrefs(storage);
  let styleId = BRAIN_STYLES.includes(styleOption) ? styleOption : settings.style ?? DEFAULT_BRAIN_STYLE;

  // --- state --------------------------------------------------------------------------------
  let currentScramble = null;   // the scramble shown (null while it is generated)
  let lastScramble = null;
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
  let cubeView = null;
  let sequencePlayer = null;
  let previewLoadToken = 0;
  let previewMountToken = 0;
  let previewMountPromise = null;
  let activationToken = 0;
  let previousBusy = false;

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
  const secondsBtn = el('button', 'tm-opt'); secondsBtn.type = 'button'; secondsBtn.dataset.action = 'inspection-seconds';
  const overBtn = el('button', 'tm-opt'); overBtn.type = 'button'; overBtn.dataset.action = 'overtime';
  options.append(inspBtn, secondsBtn, overBtn, holdBtn);
  top.append(title, options);

  const scrambleRow = el('div', 'tm-scramble-row');
  const scrambleText = el('p', 'tm-scramble');
  scrambleText.dataset.testid = 'scramble';
  const nextBtn = el('button', 'tm-textbtn', 'new scramble'); nextBtn.type = 'button'; nextBtn.dataset.action = 'new-scramble';
  scrambleRow.append(scrambleText, nextBtn);

  // The preview cube is mounted only while this route is active. The shared sequence player
  // owns its cue, chips and controls and is torn down with the cube on route deactivation.
  const preview = el('section', 'tm-preview');
  preview.dataset.testid = 'scramble-preview';
  preview.setAttribute('aria-label', '3D cube scramble preview');
  const previewCube = el('div', 'tm-preview-cube');
  previewCube.dataset.testid = 'timer-cube';
  const previewTools = el('div', 'tm-preview-tools');
  preview.append(previewCube, previewTools);

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
  const sourceBtn = el('button', 'tm-opt tm-source'); sourceBtn.type = 'button'; sourceBtn.dataset.action = 'stats-source';
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
  root.append(top, scrambleRow, preview, pad, stats, sourceBtn, controls, keys, status);

  // --- scramble -----------------------------------------------------------------------------
  function loadScramble() {
    const token = ++scrambleToken;
    scrambleState = 'loading';
    currentScramble = null;
    sequencePlayer?.load({ startState: createSolvedState(), moves: [], index: 0 });
    preview.dataset.state = 'loading';
    Promise.resolve().then(scramble).then(text => {
      if (token !== scrambleToken || detached) return;
      currentScramble = String(text); scrambleState = 'ready'; preview.dataset.state = 'ready';
      void loadPreviewSequence(currentScramble);
      render();
    }, () => {
      if (token !== scrambleToken || detached) return;
      currentScramble = ''; scrambleState = 'failed'; preview.dataset.state = 'failed'; render();
    });
    render();
  }

  function previewMoves(text) { return String(text || '').trim().split(/\s+/).filter(Boolean); }

  function paintPreview(snapshot = sequencePlayer?.getSnapshot?.()) {
    preview.dataset.playing = String(Boolean(snapshot?.playing));
    preview.dataset.index = String(snapshot?.index ?? 0);
    preview.dataset.moves = String(snapshot?.moves?.length ?? 0);
    root.classList.toggle('has-ready-scramble', scrambleState === 'ready' && Boolean(snapshot?.moves?.length));
    // A ready scramble is a reading strip, starting at its first move. During
    // playback the shared guide instead follows the current move.
    if (snapshot?.moves?.length && snapshot.index === snapshot.moves.length && !snapshot.playing) {
      previewTools.querySelector('.mg-strip')?.scrollTo({ left: 0, behavior: 'instant' });
    }
  }

  async function loadPreviewSequence(text) {
    const token = ++previewLoadToken;
    if (!sequencePlayer || detached || !text) { paintPreview(); return; }
    try {
      await sequencePlayer.load({ startState: createSolvedState(), moves: previewMoves(text), index: previewMoves(text).length });
      if (token === previewLoadToken && !detached) paintPreview();
    } catch {
      if (token === previewLoadToken) preview.dataset.state = 'unavailable';
    }
  }

  async function mountPreview() {
    if (!active || detached || cubeView || sequencePlayer) return;
    if (previewMountPromise) {
      await previewMountPromise;
      if (active && !detached && !cubeView && !sequencePlayer) return mountPreview();
      return;
    }
    const token = ++previewMountToken;
    const task = (async () => {
      const [cubeModule, playerModule] = await Promise.all([
        import('../pages/cube-view.js'), import('../moves/sequence-player.js'),
      ]);
      if (token !== previewMountToken || !active || detached) return;
      const mountedCube = await cubeModule.createPageCube(previewCube, { state: createSolvedState(), mode: 'corner' });
      if (token !== previewMountToken || !active || detached) { mountedCube?.destroy?.(); return; }
      cubeView = mountedCube;
      sequencePlayer = playerModule.createSequencePlayer(previewTools, {
        cube3d: mountedCube, startState: createSolvedState(), moves: [], label: 'scramble',
        onChange: snapshot => paintPreview(snapshot),
      });
      sequencePlayer.setActive(active && !machine.snapshot().hold && machine.snapshot().phase === 'idle');
      if (scrambleState === 'ready') await loadPreviewSequence(currentScramble);
      else paintPreview();
    })();
    previewMountPromise = task;
    try { await task; }
    finally { if (previewMountPromise === task) previewMountPromise = null; }
  }

  function unmountPreview() {
    previewMountToken++;
    previewLoadToken++;
    sequencePlayer?.destroy();
    sequencePlayer = null;
    cubeView?.destroy?.();
    cubeView = null;
    previewCube.replaceChildren();
    previewTools.replaceChildren();
  }

  // --- saving and editing ---------------------------------------------------------------------
  function focus() { return settings.session?.focus ?? 'speed'; }

  function save(result) {
    const records = store.records;
    const at = Math.max(wall(), (records.length ? records[records.length - 1].at : 0) + 1);
    const scrambleOfSolve = attemptScramble ?? currentScramble ?? '';
    lastScramble = scrambleOfSolve;
    const record = store.append(buildManualRecord(result, { at, scramble: scrambleOfSolve, focus: focus() }));
    attemptScramble = undefined;
    if (record) {
      createRoundStore(storage).markActiveDay(record.at);
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

  function retry() {
    if (!lastScramble || !editable()) return;
    machine.reset();
    currentScramble = lastScramble;
    scrambleState = 'ready';
    preview.dataset.state = 'ready';
    void loadPreviewSequence(currentScramble);
    render();
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
    const styleChanged = root.dataset.brainStyle !== styleId;
    root.dataset.brainStyle = styleId;
    if (styleChanged) syncPageTokens(root);
    root.dataset.phase = snap.phase;
    root.dataset.hold = snap.hold ?? '';
    root.classList.toggle('is-busy', Boolean(busy));
    preview.dataset.phase = snap.phase;
    preview.setAttribute('aria-hidden', String(Boolean(busy)));
    previewTools.hidden = Boolean(busy);
    if (sequencePlayer && busy !== previousBusy) {
      if (busy) sequencePlayer.pause();
      sequencePlayer.setActive(active && !busy);
    }
    previousBusy = Boolean(busy);

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
    else line = refreshingHistory ? 'loading history…' : notice || (store.readOnly ? 'history is read-only' : 'touch and hold, or hold space');
    if (snap.phase === 'done' && !record && notice) line = notice;
    setText(sub, line);

    // Scramble: locked to the attempt's own while it is under way.
    if (busy && attemptScramble === undefined && snap.phase !== 'idle') attemptScramble = currentScramble;
    if (!busy && snap.phase === 'idle') attemptScramble = undefined;
    const shownScramble = snap.phase === 'inspecting' || snap.phase === 'running' ? attemptScramble ?? currentScramble : currentScramble;
    const scrambleLine = scrambleState === 'failed' ? 'could not make a scramble. Choose new scramble.'
      : shownScramble == null ? 'generating scramble…' : fmtMoves(shownScramble);
    setText(scrambleText, scrambleLine);
    scrambleText.dataset.state = scrambleState;
    // The chips are the visible scramble when available. Keep the full notation
    // line in the accessibility tree (and as the loading/error message), without
    // asking sighted users to read the same scramble twice.
    root.classList.toggle('has-ready-scramble', scrambleState === 'ready' && Boolean(shownScramble) && Boolean(sequencePlayer?.getSnapshot().moves.length));

    // Stats.
    const row = statsRow(store.records, focus(), prefs.statsSource);
    const statsKey = JSON.stringify([row.count, row.cells, focus(), prefs.statsSource]);
    if (stats.dataset.key !== statsKey) {
      stats.dataset.key = statsKey;
      stats.replaceChildren();
      if (!row.count) stats.append(el('span', 'tm-stat-empty', prefs.statsSource === 'all' ? `no ${focus()} solves yet` : `no manual ${focus()} solves yet`));
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
    sourceBtn.hidden = Boolean(busy);
    secondsBtn.hidden = machine.inspection.mode !== 'custom';
    setText(holdBtn, `hold ${prefs.holdMs} ms`);
    setText(inspBtn, inspectionControlName(machine.inspection));
    setText(secondsBtn, `length ${machine.inspection.seconds} s`);
    setText(overBtn, `overtime ${overtimeName(machine.inspection)}`);
    setText(sourceBtn, prefs.statsSource === 'manual' ? 'stats · manual solves' : 'stats · all solves');
    holdBtn.title = 'how long to hold before the timer is ready (ms)';
    inspBtn.title = 'inspection mode and length (shared with solve)';
    inspBtn.setAttribute('aria-label', `inspection ${inspectionName(machine.inspection)}`);
    overBtn.title = 'inspection overtime rule (shared with solve)';
    sourceBtn.title = 'choose which solves appear in stats';
    let hints;
    if (snap.phase === 'running') hints = keycap('any key', 'stop') + keycap('esc', 'stop');
    else if (snap.phase === 'inspecting') hints = keycap('space', 'hold, release to start') + keycap('esc', 'stop');
    else if (snap.hold) hints = keycap('esc', 'stop');
    else {
      hints = keycap('space', snap.phase === 'done' ? 'next scramble' : 'hold to start');
      if (lastScramble) hints += keycap('r', 'retry');
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
  const eventTime = event => {
    const stamp = Number(event.timeStamp);
    if (!Number.isFinite(stamp) || stamp < 0) return now();
    if (stamp <= 1e12) return stamp;
    return Number.isFinite(performance.timeOrigin) ? stamp - performance.timeOrigin : now();
  };

  function onKeyDown(event) {
    if (!active || refreshingHistory || event.ctrlKey || event.metaKey || event.altKey || editable_(event.target)
      || (event.target instanceof Element && event.target.closest('.tm-preview-tools'))) return;
    const key = event.key === 'Spacebar' ? ' ' : event.key;
    const snap = machine.snapshot();
    if (key === 'Escape') {
      if (snap.phase === 'running' || snap.phase === 'inspecting' || snap.hold) { event.preventDefault(); machine.cancel(); }
      return;
    }
    if (snap.phase === 'running') {   // any key stops
      event.preventDefault();
      if (!event.repeat) { machine.down(eventTime(event)); if (key !== ' ') machine.up(eventTime(event)); }
      return;
    }
    if (key === ' ') {
      if (snap.phase === 'done') { event.preventDefault(); if (!event.repeat) newScramble(); return; }
      if (snap.phase === 'idle' && scrambleState !== 'ready') return;
      event.preventDefault();
      if (!event.repeat && !keyHeld) { keyHeld = true; machine.down(eventTime(event)); }
      return;
    }
    if (event.repeat || snap.hold || snap.phase === 'inspecting') return;
    const lower = key.length === 1 ? key.toLowerCase() : key;
    if (lower === 'r') retry();
    else if (lower === '2') togglePenalty('+2');
    else if (lower === 'd') togglePenalty('DNF');
    else if (key === 'Delete' || key === 'Backspace') deleteLast();
    else if (lower === 'u') undoDelete();
    else return;
    event.preventDefault();
  }
  function onKeyUp(event) {
    if (!active || editable_(event.target) || (event.target instanceof Element && event.target.closest('.tm-preview-tools'))) return;
    const key = event.key === 'Spacebar' ? ' ' : event.key;
    if (key !== ' ') return;
    event.preventDefault();
    if (keyHeld) { keyHeld = false; machine.up(eventTime(event)); }
  }
  function onBlur() { keyHeld = false; machine.abortHold(); }

  function onPointerDown(event) {
    if (!active || refreshingHistory || activePointer != null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const snap = machine.snapshot();
    const onPad = event.target instanceof Element && pad.contains(event.target);
    if (snap.phase !== 'running' && !onPad) return;   // only the timer area starts; anything stops
    if (snap.phase === 'idle' && scrambleState !== 'ready') return;
    event.preventDefault();
    activePointer = event.pointerId;
    try { root.setPointerCapture(event.pointerId); } catch { /* synthetic pointers */ }
    machine.down(eventTime(event));
  }
  function onPointerUp(event) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    if (event.type === 'pointercancel') machine.abortHold(); else machine.up(eventTime(event));
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
      case 'inspection-seconds': {
        const lengths = [10, 15, 20, 30, 45, 60];
        const nextSeconds = lengths[(lengths.indexOf(settings.inspection.seconds) + 1) % lengths.length];
        settings = setSetting(settings, 'inspection.seconds', nextSeconds);
        saveSettings(storage, settings);
        machine.setInspection(settings.inspection); break;
      }
      case 'overtime': {
        if (settings.inspection.overtime === 'grace' && settings.inspection.gracePenalty !== 'none') {
          const penalties = ['plus2', 'dnf', 'none'];
          settings = setSetting(settings, 'inspection.gracePenalty', penalties[(penalties.indexOf(settings.inspection.gracePenalty) + 1) % penalties.length]);
        } else {
          const next = OVERTIME_CYCLE[(OVERTIME_CYCLE.indexOf(settings.inspection.overtime) + 1) % OVERTIME_CYCLE.length];
          settings = setSetting(settings, 'inspection.overtime', next);
        }
        saveSettings(storage, settings);
        machine.setInspection(settings.inspection); break;
      }
      case 'stats-source': {
        prefs = { ...prefs, statsSource: prefs.statsSource === 'manual' ? 'all' : 'manual' };
        saveTimerPrefs(storage, prefs); render(); break;
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
  syncPageTokens(root);

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
  const ready = Promise.all([mountStyle(), mountPreview()]);
  render();

  return {
    ready,
    machine,
    getPreviewSnapshot: () => sequencePlayer?.getSnapshot?.() ?? null,
    async setActive(next) {
      const token = ++activationToken;
      active = Boolean(next);
      if (!active) { refreshingHistory = false; machine.cancel(); keyHeld = false; activePointer = null; unmountPreview(); wake(false); }
      else {
        refreshingHistory = true;
        render();
        await store.reload().catch(() => {});
        if (token !== activationToken || !active || detached) return;
        refreshingHistory = false;
        settings = loadSettings(storage);
        machine.setInspection(settings.inspection);
        await mountPreview();
        if (!active || detached) return;
        sequencePlayer?.setActive(machine.snapshot().phase === 'idle' && !machine.snapshot().hold);
        const nextStyle = BRAIN_STYLES.includes(styleOption) ? styleOption : settings.style;
        if (nextStyle !== styleId) { styleId = nextStyle; void mountStyle(); }
        render();
      }
    },
    detach() {
      detached = true;
      active = false;
      previewLoadToken++;
      previewMountToken++;
      if (raf) cancelAnimationFrame(raf);
      wake(false);
      sequencePlayer?.destroy();
      sequencePlayer = null;
      cubeView?.destroy?.();
      cubeView = null;
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

/** Shell entry point: opens the shared IndexedDB history, then mounts the timer page. */
export function createManualTimer(host, options = {}) {
  let timer = null;
  let active = true;
  let detached = false;
  const ready = openHistory(options.historyOptions).then(store => {
    if (detached) return null;
    timer = createTimer(host, { ...options, store });
    if (!active) void timer.setActive(false);
    return timer.ready;
  });
  return {
    ready,
    setActive(next) { active = Boolean(next); timer?.setActive(active); },
    detach() { detached = true; timer?.detach(); },
  };
}
