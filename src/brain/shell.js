// Brain v2 shell: the layout and every part shared by the Orbit and Mono styles
// (tabs and device chip, config bar, settings panel, scramble line, clock,
// coach, key hints, results frame, debug drawer). The style module supplies the timeline,
// the inspection view and the results body. Updates are in place: each part
// compares its view-model slice with the previous one and patches the DOM.
//
// Compatibility: the ids and data attributes of the first Brain UI are kept
// (tests/brain-solve.spec.js and recorded sessions replayed by
// brain-recording.js click them), mapped onto the new elements.

import './css/base.css';
import { reconcileChildren, setAttr, setText, toggleClass } from './dom.js';
import { createMoveGuide } from '../moves/move-guide.js';
import { readGuidePrefs, writeGuidePref } from '../moves/prefs.js';

// The dev server's log sink (/__devlog) doesn't exist in production builds.
const DEV = Boolean(import.meta.env?.DEV);

/** @typedef {import('./types.js').BrainVM} BrainVM */
/** @typedef {import('./types.js').BrainAction} BrainAction */
/** @typedef {import('./types.js').StyleModule} StyleModule */
/** @typedef {import('./types.js').FrameVM} FrameVM */

const TEMPLATE = `
  <header class="b-top">
    <nav class="b-tabs" aria-label="solve views">
      <button class="b-tab b-tab-brain" type="button" data-tab="brain" aria-current="page">solve</button>
      <details class="brain-pill-setup b-settings">
        <summary class="b-tab"><span>settings</span></summary>
        <div class="b-settings-body" role="region" aria-label="settings">
          <div class="b-panel-head"><h2>settings</h2><button class="b-textbtn b-close" type="button" data-action="toggleSettings" aria-label="close settings"><span>close</span><kbd>tab</kbd></button></div>
          <nav class="b-configbar b-configbar-copy" aria-label="Quick settings"></nav>
          <p class="b-settings-caption">quick settings above · defaults follow WCA rules</p>
          <div class="b-settings-sections"></div>
          <section class="b-settings-section b-quick" aria-label="Quick toggles">
            <h3><span>quick</span></h3>
            <label class="b-check"><input type="checkbox" id="brain-pseudo"><span>pseudo pairs · D offset</span></label>
            <label class="b-check"><input type="checkbox" id="brain-inspection" checked><span>inspection countdown</span></label>
            <details class="brain-advanced-scramble">
              <summary><span>use a specific scramble</span></summary>
              <div class="brain-scramble-wrap" id="brain-guided-wrap">
                <textarea id="brain-scramble" rows="2" spellcheck="false" autocomplete="off" placeholder="paste a scramble, or generate one…"></textarea>
                <div class="brain-scramble-actions">
                  <button class="b-btn" id="brain-generate" type="button">new scramble</button>
                  <button class="b-btn" id="brain-start-custom" type="button">start</button>
                </div>
              </div>
            </details>
            <form class="b-command" autocomplete="off"><label><kbd>type</kbd><input name="command" placeholder="“insp 10” · “oll 1” · “style orbit”" aria-label="Settings command"></label></form>
          </section>
        </div>
      </details>
      <a class="b-tab b-tab-timer" href="#/timer">manual timer</a>
      <a class="b-tab b-tab-history" href="#/history">history</a>
    </nav>
    <div class="b-device brain-connect-chip" aria-label="Smart cube connection">
      <button class="b-device-toggle" type="button" aria-expanded="false" aria-controls="b-device-menu">
        <i class="b-dot" aria-hidden="true"></i><span id="brain-device-inline">No cube</span>
        <span class="b-battery" aria-hidden="true"><i></i></span><span class="b-battery-text"></span>
      </button>
      <button class="b-textbtn b-connect" id="brain-connect" type="button" hidden>connect</button>
      <div class="b-device-menu" id="b-device-menu" hidden>
        <strong id="brain-device">No cube</strong>
        <p id="brain-status" role="status" aria-live="polite">No cube. Connect to start.</p>
        <div class="brain-controls">
          <button class="b-btn" id="brain-sync" type="button" hidden>sync</button>
          <button class="b-btn" id="brain-recenter" type="button" hidden>recenter</button>
          <button class="b-btn" id="brain-disconnect" type="button" hidden>disconnect</button>
          <button class="b-btn" id="brain-clear-cube" type="button" hidden>forget this cube</button>
        </div>
      </div>
    </div>
  </header>
  <div class="b-banner" data-slot="banner"></div>
  <nav class="b-configbar" aria-label="Quick settings"></nav>
  <main class="b-stage" aria-label="Live solve">
    <div class="brain-body">
      <div class="brain-stage">
        <div class="b-cube-wrap" data-slot="cube">
          <div id="brain-cube" class="cube-mount b-cube"></div>
          <button class="b-textbtn b-cube-reset" id="brain-reset-view" type="button" title="Reset the camera">reset view</button>
        </div>
        <div class="b-slot b-slot-timeline brain-cube-timeline" id="brain-timeline" data-slot="timeline" role="progressbar" aria-label="Solve stage timeline"></div>
        <div class="b-slot b-slot-inspection" data-slot="inspection"></div>
      </div>
      <div class="brain-hero">
        <p class="b-scramble-head"></p>
        <p class="b-stepline"></p>
        <div class="b-steptitle"><strong></strong><span class="b-steptags"></span></div>
        <div class="b-clock" aria-hidden="true">0.00</div>
        <p class="b-toast" role="status" hidden></p>
        <div class="b-aside" data-slot="inspection-aside"></div>
        <div class="b-aside" data-slot="timeline-aside"></div>
        <p class="b-sub"></p>
        <div id="brain-moves" class="b-moves" aria-label="Scramble moves" hidden></div>
        <div id="brain-recovery" class="b-recovery-cue" role="status" hidden>
          <p class="b-recovery-do"></p>
          <div class="b-recovery-moves"></div>
        </div>
        <div class="b-guide-tools" hidden>
          <button class="b-textbtn" id="brain-cue" type="button" aria-pressed="true" aria-label="Show the current move on the 3D cube">cue</button>
        </div>
        <div id="brain-coach" class="b-coach" aria-live="polite"></div>
        <p class="b-idle-status" aria-live="polite"></p>
        <div class="b-progress" aria-hidden="true"><i></i></div>
        <div class="b-primary">
          <button class="b-start" id="brain-start" type="button"><span>start</span><kbd>space</kbd></button>
          <button class="b-start b-start-alt" type="button" data-primary="connect" hidden><span>connect cube</span></button>
          <button class="b-textbtn" id="brain-stop" type="button" hidden>stop</button>
        </div>
        <dl class="b-stats"></dl>
      </div>
    </div>
    <section class="brain-review b-slot-results" id="brain-review" hidden aria-live="polite">
      <div class="b-slot b-results-host" data-slot="results"></div>
      <div class="b-results-actions"><button class="b-textbtn" id="brain-review-close" type="button">next</button></div>
    </section>
  </main>
  <div class="b-foot">
    <div class="b-keys"></div>
    <p id="brain-error" class="brain-error" role="alert" hidden></p>
    <div class="b-sr" aria-live="polite"><h2 id="brain-phase-label">connect cube</h2><p id="brain-phase-detail" class="brain-phase-detail"></p></div>
    <div class="b-foot-tools">
      <button class="b-textbtn" id="brain-rebuild-view" type="button" title="Rebuild this view without reloading (keeps the cube connected)">rebuild view</button>
      <button class="b-textbtn" id="brain-debug-toggle" type="button" aria-expanded="false" aria-controls="brain-debug" title="Connection log and settings"><span>dev</span><kbd>\`</kbd></button>
    </div>
  </div>
  <aside class="b-debug" id="brain-debug" role="dialog" aria-label="dev" hidden>
    <div class="b-panel-head"><h2>dev</h2><button class="b-textbtn b-close" type="button" data-action="toggleDebug" aria-label="close dev"><span>close</span><kbd>esc</kbd></button></div>
    <p class="b-label brain-studio-link"><a href="#/dev/studio" data-testid="open-studio">open studio</a> · raw cube events, gyro and scramble rehearsal</p>
    <section class="brain-diagnostics b-debug-section" aria-label="Connection diagnostics">
      <h3><span>connection</span></h3>
      <div class="brain-connection-log-head"><p class="b-label">what the attach is doing</p><div class="brain-log-actions"><button class="b-btn" id="brain-send-log" type="button" title="Send this log to the dev server so the agent can read it">send to dev</button><button class="b-btn" id="brain-clear-log" type="button">clear log</button></div></div>
      <ol id="brain-connection-log" class="brain-log-list"></ol><p id="brain-send-status" role="status" aria-live="polite"></p>
    </section>
    <section class="brain-recording b-debug-section" aria-label="Recordings">
      <h3><span>recordings</span></h3>
      <p class="b-label">save a recording to share a cube issue with the dev team</p>
      <div class="brain-log-actions brain-recording-actions"><button class="b-btn" id="brain-save-recording" type="button" title="export recording">export recording</button><button class="b-btn" id="brain-clear-recording" type="button">start fresh recording</button><button class="b-btn" id="brain-load-recording" type="button" title="import recording">import recording…</button><select id="brain-replay-speed" aria-label="replay speed"><option value="1">1×</option><option value="4">4×</option><option value="0">instant</option></select><button class="b-btn" id="brain-replay-stop" type="button" hidden>stop replay</button><input type="file" id="brain-load-recording-file" accept="application/json,.json" hidden></div>
      <p id="brain-recording-status" role="status" aria-live="polite"></p>
    </section>
    <section class="brain-coach-settings b-debug-section" aria-label="Coach and data">
      <h3><span>coach &amp; data</span></h3>
      <p class="b-label">choose which insights appear</p>
      <div id="brain-toggles" class="brain-toggles"></div>
      <div class="brain-data-port"><span>Everything stays on this device.</span><button class="b-btn" id="brain-export" type="button">export data</button><button class="b-btn" id="brain-import" type="button">import data</button><input type="file" id="brain-import-file" accept="application/json,.json" hidden><p id="brain-port-status" role="status" aria-live="polite"></p></div>
    </section>
  </aside>`;

// Buttons whose click is one action.
const CLICK_ACTIONS = {
  'brain-connect': { type: 'connect' },
  'brain-sync': { type: 'sync' },
  'brain-recenter': { type: 'recenter' },
  'brain-disconnect': { type: 'disconnect' },
  'brain-clear-cube': { type: 'clearSavedCube' },
  'brain-reset-view': { type: 'resetView' },
  'brain-rebuild-view': { type: 'rebuildView' },
  'brain-start': { type: 'start' },
  'brain-stop': { type: 'cancel' },
  'brain-review-close': { type: 'dismissResults' },
  'brain-generate': { type: 'generateScramble' },
  'brain-start-custom': { type: 'startCustom' },
  'brain-export': { type: 'export' },
  'brain-send-log': { type: 'sendLog' },
  'brain-clear-log': { type: 'clearLog' },
};

// Settings rows that also carry the first UI's data attributes, so recorded
// sessions that click them keep replaying.
const LEGACY_ROW_ATTR = { method: 'brainMethod', cross: 'brainCross', scramble: 'brainMode' };

/**
 * Keyed list update with custom create/patch (for items richer than text).
 * @template T
 * @param {HTMLElement} container
 * @param {T[]} items
 * @param {(item:T)=>string} keyOf
 * @param {(item:T)=>HTMLElement} create
 * @param {(el:HTMLElement, item:T)=>void} patch
 */
function renderKeyed(container, items, keyOf, create, patch) {
  const byKey = new Map();
  for (const el of container.children) if (el.dataset.key != null) byKey.set(el.dataset.key, el);
  const wanted = items.map(item => {
    const key = keyOf(item);
    let el = byKey.get(key);
    if (el) byKey.delete(key);
    else { el = create(item); el.dataset.key = key; }
    patch(el, item);
    return el;
  });
  for (const el of byKey.values()) el.remove();
  let cursor = container.firstElementChild;
  for (const el of wanted) {
    if (el === cursor) cursor = cursor.nextElementSibling;
    else container.insertBefore(el, cursor);
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Mount the shared Brain layout.
 * @param {HTMLElement} root
 * @param {{dispatch:(a:BrainAction)=>void}} ctx
 */
export function createShell(root, { dispatch }) {
  const brain = el('div', 'brain');
  brain.innerHTML = TEMPLATE;   // one-time mount; updates below are in place
  root.append(brain);
  const $ = selector => brain.querySelector(selector);
  if (!DEV) $('#brain-send-log')?.remove();   // Send to dev only exists on the dev server

  const parts = {
    configBar: brain.querySelector(':scope > .b-configbar'),
    configCopy: $('.b-configbar-copy'),
    deviceToggle: $('.b-device-toggle'),
    debug: $('#brain-debug'),
    debugToggle: $('#brain-debug-toggle'),
    brainTab: $('.b-tab-brain'),
    deviceMenu: $('.b-device-menu'),
    scrambleHead: $('.b-scramble-head'),
    stepLine: $('.b-stepline'),
    stepTitle: $('.b-steptitle strong'),
    stepTags: $('.b-steptags'),
    clock: $('.b-clock'),
    sub: $('.b-sub'),
    moves: $('#brain-moves'),
    recoveryCue: $('#brain-recovery'),
    recoveryDo: $('#brain-recovery .b-recovery-do'),
    recoveryMoves: $('#brain-recovery .b-recovery-moves'),
    guideTools: $('.b-guide-tools'),
    cueButton: $('#brain-cue'),
    coach: $('#brain-coach'),
    idleStatus: $('.b-idle-status'),
    start: $('#brain-start'),
    primaryAlt: $('[data-primary]'),
    stop: $('#brain-stop'),
    stats: $('.b-stats'),
    toast: $('.b-toast'),
    timeline: $('#brain-timeline'),
    review: $('#brain-review'),
    settings: $('.brain-pill-setup'),
    sections: $('.b-settings-sections'),
    keys: $('.b-keys'),
    error: $('#brain-error'),
    scrambleText: $('#brain-scramble'),
  };
  const slots = {
    cube: $('#brain-cube'),
    timeline: parts.timeline,
    inspection: $('.b-slot-inspection'),
    results: $('.b-results-host'),
    inspectionAside: $('[data-slot="inspection-aside"]'),
    timelineAside: $('[data-slot="timeline-aside"]'),
  };

  /** @type {BrainVM|null} */
  let last = null;
  /** @type {StyleModule|null} */
  let style = null;
  /** @type {{timeline:any, inspection:any, results:any}|null} */
  let components = null;
  // The move guide draws the scramble (and, after a wrong turn, the way back) as plain
  // notation chips and, when a live cube is shown, cues the current move on it.
  let cube3d = null;
  let planGuide = null;
  let recoveryGuide = null;
  const guides = () => {
    planGuide ??= createMoveGuide(parts.moves, { label: 'Scramble moves', cube3d });
    recoveryGuide ??= createMoveGuide(parts.recoveryMoves, { label: 'Undo the wrong turn', cube3d });
    return { planGuide, recoveryGuide };
  };

  // --- Events: thin delegation to actions ---------------------------------
  brain.addEventListener('click', event => {
    const target = /** @type {HTMLElement} */ (event.target);
    // The backdrop behind the settings panel is the <details> element's own ::before.
    if (target === parts.settings && parts.settings.open) { dispatch({ type: 'toggleSettings' }); return; }
    const button = target.closest('button');
    if (!button || !brain.contains(button)) return;
    if (button === parts.brainTab) { if (parts.settings.open) dispatch({ type: 'toggleSettings' }); return; }
    if (button === parts.debugToggle) { dispatch({ type: 'toggleDebug' }); return; }
    if (button.id && CLICK_ACTIONS[button.id]) { dispatch(CLICK_ACTIONS[button.id]); return; }
    if (button === parts.cueButton) {
      writeGuidePref('cue', readGuidePrefs().cue === false);
      setAttr(button, 'aria-pressed', String(readGuidePrefs().cue !== false));
      const { planGuide: plan, recoveryGuide: undo } = guides();
      plan.update({}); undo.update({});
      return;
    }
    if (button === parts.deviceToggle) { setDeviceMenu(parts.deviceMenu.hidden); return; }
    if (button.id === 'brain-import') { $('#brain-import-file').click(); return; }
    if (button.dataset.primary === 'connect') { dispatch({ type: 'connect' }); return; }
    if (button.dataset.primary === 'reconnect') { dispatch({ type: 'reconnect' }); return; }
    if (button.dataset.primary === 'resume') { dispatch({ type: 'resumeSolve' }); return; }
    if (button.dataset.primary === 'sync') { dispatch({ type: 'sync' }); return; }
    if (button.dataset.setting) {
      dispatch({ type: 'setSetting', path: button.dataset.setting, value: button.dataset.value });
      return;
    }
    if (button.dataset.action) {
      const action = button.dataset.action;
      if (action === 'togglePenalty') dispatch({ type: 'togglePenalty', penalty: /** @type {'+2'|'DNF'} */ (button.dataset.penalty || 'DNF') });
      else if (action === 'setStyle') dispatch({ type: 'setStyle', style: /** @type {any} */ (button.dataset.value) });
      else if (action === 'command') focusCommand();
      else dispatch(/** @type {BrainAction} */ ({ type: action }));
    }
  });
  brain.addEventListener('change', event => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    if (target.id === 'brain-pseudo') dispatch({ type: 'setSetting', path: 'f2l', value: target.checked ? 'pseudo' : 'standard' });
    else if (target.id === 'brain-inspection') dispatch({ type: 'setSetting', path: 'inspection', value: { enabled: target.checked } });
    else if (target.id === 'brain-import-file' && target.files?.[0]) { dispatch({ type: 'import', file: target.files[0] }); target.value = ''; }
    else if (target.dataset.settingNumber) dispatch({ type: 'setSetting', path: target.dataset.settingNumber, value: Number(target.value) });
  });
  parts.scrambleText.addEventListener('input', () => dispatch({ type: 'setScrambleText', text: parts.scrambleText.value }));
  $('.b-command').addEventListener('submit', event => {
    event.preventDefault();
    const input = /** @type {HTMLInputElement} */ (event.target.elements.command);
    const text = input.value.trim();
    if (text) dispatch({ type: 'command', text });
    input.value = '';
  });
  // The settings <details> toggles natively (tests and recordings click its
  // summary); keep the controller's open state in step with it.
  parts.settings.addEventListener('toggle', () => {
    if (last && parts.settings.open !== last.settings.open) dispatch({ type: 'toggleSettings' });
    syncSettingsOpen();
  });
  const onDocClick = event => {
    if (!parts.deviceMenu.hidden && !$('.b-device').contains(/** @type {Node} */ (event.target))) setDeviceMenu(false);
  };
  document.addEventListener('click', onDocClick);

  // One active item in the tab row: settings while its panel is open, brain otherwise.
  function syncSettingsOpen() {
    const open = parts.settings.open;
    toggleClass(brain, 'is-settings-open', open);
    setAttr(parts.brainTab, 'aria-current', open ? null : 'page');
    setAttr(parts.settings.querySelector(':scope > summary'), 'aria-current', open ? 'page' : null);
    parts.settings.querySelector(':scope > summary').setAttribute('aria-expanded', String(open));
  }
  function syncDebugOpen(open) {
    parts.debug.hidden = !open;
    toggleClass(brain, 'is-debug-open', open);
    parts.debugToggle.setAttribute('aria-expanded', String(open));
  }
  function setDeviceMenu(open) {
    parts.deviceMenu.hidden = !open;
    parts.deviceToggle.setAttribute('aria-expanded', String(open));
  }
  function focusCommand() {
    if (!parts.settings.open) parts.settings.open = true;
    /** @type {HTMLInputElement} */ ($('.b-command input')).focus();
  }

  // --- Parts ----------------------------------------------------------------
  function updateDevice(device, prev) {
    if (device === prev) return;
    const connected = device.phase === 'tracking' || device.phase === 'syncing' || device.phase === 'desynced';
    const brainChip = $('.b-device');
    brainChip.dataset.phase = device.phase;
    setText($('#brain-device-inline'), connected ? device.name || 'smart cube' : device.phase === 'connecting' ? 'connecting…' : 'no cube · connect');
    setText($('#brain-device'), connected ? [device.name, device.protocol].filter(Boolean).join(' · ') : 'No cube');
    setText($('#brain-status'), device.detail);
    const battery = device.battery;
    $('.b-battery').hidden = battery == null;
    $('.b-battery i').style.setProperty('--level', battery == null ? '0' : String(battery / 100));
    setText($('.b-battery-text'), battery == null ? '' : `${battery}%`);
    for (const [id, key] of [['brain-sync', 'sync'], ['brain-recenter', 'recenter'], ['brain-disconnect', 'disconnect'], ['brain-clear-cube', 'clearSaved']]) {
      $(`#${id}`).hidden = !device.actions[key];
    }
    // Connect sits beside the chip whenever no cube is connected (every screen);
    // the disconnected screen also offers it as the primary action.
    const connect = $('#brain-connect');
    // (While the attach runs the primary button carries the progress, so this one steps aside.)
    connect.hidden = !device.actions.connect;
    toggleClass(connect, 'is-connecting', device.phase === 'connecting');
    connect.disabled = device.phase === 'connecting';
    setText(connect, device.phase === 'connecting' ? 'connecting…' : 'connect');
  }

  function renderOptions(container, items) {
    const flat = [];
    items.forEach((item, i) => {
      if (i) flat.push({ key: `sep${i}`, sep: true });
      if (item.label) flat.push({ key: `lbl-${item.id}`, label: item.label });
      for (const option of item.options) flat.push({ key: `${item.id}=${option.value}`, id: item.id, option });
    });
    renderKeyed(container, flat, item => item.key,
      item => item.sep ? el('i', 'b-sep', '|') : item.label ? el('span', 'b-cfg-label', item.label)
        : Object.assign(el('button', 'b-cfg'), { type: 'button' }),
      (node, item) => {
        if (item.sep) return;
        if (item.label) { setText(node, item.label); return; }
        node.dataset.setting = item.id;
        node.dataset.value = item.option.value;
        setText(node, item.option.label);
        toggleClass(node, 'is-active', item.option.active);
        setAttr(node, 'aria-pressed', String(item.option.active));
      });
  }

  function updateConfigBar(bar, prev) {
    if (bar === prev) return;
    renderOptions(parts.configBar, bar.items);
    renderOptions(parts.configCopy, bar.items);
  }

  function updateSettings(settings, prev) {
    if (settings === prev) return;
    if (settings.open !== prev?.open && parts.settings.open !== settings.open) parts.settings.open = settings.open;
    syncSettingsOpen();
    renderKeyed(parts.sections, settings.sections, s => s.id,
      section => {
        const node = el('section', 'b-settings-section');
        node.append(el('h3'), el('div', 'b-settings-rows'));
        node.querySelector('h3').append(el('span'));
        return node;
      },
      (node, section) => {
        setText(node.querySelector('h3 span'), section.label);
        renderKeyed(node.querySelector('.b-settings-rows'), section.rows, row => row.id,
          () => {
            const row = el('div', 'b-row');
            const text = el('div', 'b-row-text');
            text.append(el('p', 'b-row-label'), el('p', 'b-row-help'));
            row.append(text, el('div', 'b-row-options'));
            return row;
          },
          (rowNode, row) => {
            setText(rowNode.querySelector('.b-row-label'), row.label);
            setText(rowNode.querySelector('.b-row-help'), row.help);
            const options = rowNode.querySelector('.b-row-options');
            if (row.control === 'number') {
              renderKeyed(options, [row], r => `num-${r.id}`,
                () => Object.assign(el('input', 'b-number'), { type: 'number', min: 0, max: 60 }),
                (input, r) => { input.dataset.settingNumber = r.id; setAttr(input, 'aria-label', r.label); if (document.activeElement !== input) input.value = String(r.value ?? ''); });
              return;
            }
            renderKeyed(options, row.options, o => o.value,
              () => Object.assign(el('button', 'b-opt'), { type: 'button' }),
              (button, o) => {
                button.dataset.setting = row.id;
                button.dataset.value = o.value;
                const legacy = LEGACY_ROW_ATTR[row.id];
                if (legacy && (row.id !== 'scramble' || o.value !== 'paste')) button.dataset[legacy] = o.value;
                setText(button, o.label);
                toggleClass(button, 'is-active', o.active);
                toggleClass(button, 'is-default', o.isDefault);
                setAttr(button, 'aria-pressed', String(o.active));
              });
          });
      });
    // The quick toggles mirror the matching settings rows.
    const rowValue = id => settings.sections.flatMap(s => s.rows).find(r => r.id === id)?.options.find(o => o.active)?.value;
    const pseudo = /** @type {HTMLInputElement} */ ($('#brain-pseudo'));
    const f2l = rowValue('f2l');
    if (f2l != null) pseudo.checked = f2l === 'pseudo';
    const inspection = /** @type {HTMLInputElement} */ ($('#brain-inspection'));
    const mode = rowValue('inspection.mode') ?? rowValue('inspection');
    if (mode != null) inspection.checked = mode === 'wca' || mode === 'custom';
  }

  // The scramble line is the move guide's chip strip. Chips are <i> elements whose
  // class is exactly their state ('done' | 'current' | '' plus 'wrong'), so a correct
  // turn changes only classes. After a WRONG turn the plan move stays current (marked
  // wrong) and the way back is shown as its own strip with the cue on the first move.
  function updateScramble(scramble, prev) {
    if (scramble === prev) return;
    const moves = parts.moves;
    moves.hidden = !scramble;
    const { planGuide: plan, recoveryGuide: undo } = guides();
    if (!scramble) {
      setText(parts.scrambleHead, '');
      plan.update({ moves: [], index: -1, statuses: {}, cube3d });
      undo.update({ moves: [], index: -1, cube3d });
      parts.recoveryCue.hidden = true;
      parts.guideTools.hidden = true;
      return;
    }
    setText(parts.scrambleHead, `scramble · ${Math.min(scramble.step + 1, scramble.total)} / ${scramble.total}`);
    const done = scramble.moves.filter(m => m.state === 'done').length;
    const started = scramble.moves.some(m => m.state !== 'todo');
    const way = scramble.recovery?.length ? scramble.recovery.map(m => m.text) : null;
    // The plan guide holds the cue unless a wrong turn hands it to the undo strip.
    plan.update({
      moves: scramble.moves.map(m => m.text), index: started ? done : -1,
      statuses: way && done < scramble.moves.length ? { [done]: 'wrong' } : {},
      held: { bottom: 'D', front: 'F' }, cube3d: way ? null : cube3d,
    });
    parts.recoveryCue.hidden = !way;
    if (way) {
      setText(parts.recoveryDo, 'undo:');
      undo.update({ moves: way, index: 0, statuses: {}, held: scramble.held ?? undefined, cube3d });
    } else undo.update({ moves: [], index: -1, statuses: {}, cube3d: null });
    const prefs = readGuidePrefs();
    parts.guideTools.hidden = false;
    setAttr(parts.cueButton, 'aria-pressed', String(prefs.cue !== false));
    // Paste box: show the scramble unless the user is typing in it.
    if (document.activeElement !== parts.scrambleText && parts.scrambleText.value !== scramble.text) parts.scrambleText.value = scramble.text;
    parts.scrambleText.readOnly = !scramble.editable;
  }

  function updateClock(clock, prev) {
    if (clock === prev) return;
    setText(parts.clock, clock.text);
    parts.clock.dataset.tone = clock.tone;
    setText(parts.sub, clock.sub);
    toggleClass(brain, 'is-timer-hidden', clock.hidden);
    setAttr(brain, 'data-timer-hidden', clock.hidden);
    renderKeyed(parts.stepLine, clock.stepLine.flatMap((part, i) => i ? [{ key: `d${i}`, dot: true }, { key: `p${i}`, part }] : [{ key: `p${i}`, part }]),
      item => item.key,
      item => el('span', item.dot ? 'b-dot-sep' : 'b-step-part', item.dot ? '·' : ''),
      (node, item) => { if (item.dot) return; setText(node, item.part.text); node.dataset.tone = item.part.tone; });
    setText(parts.stepTitle, clock.stepTitle);
    reconcileChildren(parts.stepTags, clock.stepTags.map((tag, i) => ({ key: `t${i}`, text: tag, className: 'b-tag' })), 'span');
  }

  function updateCoach(coach, prev) {
    if (coach === prev) return;
    renderKeyed(parts.coach, coach, line => line.key,
      () => { const p = el('p', 'b-coach-line brain-coach-line'); p.append(el('span', 'b-coach-tag'), el('span', 'b-coach-text')); return p; },
      (node, line) => {
        node.dataset.tone = line.tone;
        const tag = node.querySelector('.b-coach-tag');
        setText(tag, line.tag || '');
        tag.hidden = !line.tag;
        setText(node.querySelector('.b-coach-text'), line.text);
      });
  }

  function updateStats(stats, prev) {
    if (stats === prev) return;
    const items = [['ao5', stats.ao5], ['ao12', stats.ao12], ['pb', stats.best], ['solves', String(stats.solves)]];
    renderKeyed(parts.stats, items, ([k]) => k,
      () => { const d = el('div', 'b-stat'); d.append(el('dt'), el('dd')); return d; },
      (node, [k, v]) => { setText(node.querySelector('dt'), k); setText(node.querySelector('dd'), v || '—'); });
  }

  function updateKeys(keys, prev) {
    if (keys === prev) return;
    renderKeyed(parts.keys, keys, k => `${k.key}:${k.action}`,
      () => { const b = el('button', 'b-key'); b.type = 'button'; b.append(el('kbd'), el('span')); return b; },
      (node, k) => { node.dataset.action = k.action; setText(node.querySelector('kbd'), k.key); setText(node.querySelector('span'), k.label); });
  }

  function updatePrimary(vm) {
    const screen = vm.screen;
    parts.start.hidden = screen !== 'idle';
    const busy = vm.device.busy;   // the attach is under way: the button stays, disabled, as plain text
    const alt = screen === 'disconnected' || screen === 'connecting'
      ? (vm.device.actions.resume ? { action: 'resume', label: 'resume solve' }
        : vm.device.actions.reconnect ? { action: 'reconnect', label: 'reconnect cube' }
          : { action: 'connect', label: busy ? 'connecting…' : vm.device.failed ? 'retry connection' : 'connect cube' })
      : screen === 'desynced' ? { action: 'sync', label: 'sync' } : null;
    parts.primaryAlt.hidden = !alt;
    if (alt) {
      parts.primaryAlt.dataset.primary = alt.action;
      setText(parts.primaryAlt.querySelector('span'), alt.label);
      parts.primaryAlt.disabled = screen !== 'desynced' && busy;
      toggleClass(parts.primaryAlt, 'is-connecting', screen !== 'desynced' && busy);
      setAttr(parts.primaryAlt, 'aria-busy', busy ? 'true' : null);
    }
    parts.stop.hidden = !(screen === 'scramble' || screen === 'inspection' || screen === 'ready' || screen === 'solving');
  }

  // --- Public API -----------------------------------------------------------
  /** @param {BrainVM} vm @param {BrainVM|null} prev */
  function update(vm, prev = last) {
    const p = prev ?? null;
    brain.dataset.screen = vm.screen;
    brain.dataset.theme = vm.theme;
    toggleClass(brain, 'is-chrome-dimmed', vm.chromeDimmed);
    if (vm.debugOpen !== p?.debugOpen) syncDebugOpen(Boolean(vm.debugOpen));
    updateDevice(vm.device, p?.device);
    updateConfigBar(vm.configBar, p?.configBar);
    updateSettings(vm.settings, p?.settings);
    updateScramble(vm.scramble, p?.scramble);
    updateClock(vm.clock, p?.clock);
    updateCoach(vm.coach, p?.coach);
    updateStats(vm.stats, p?.stats);
    updateKeys(vm.keys, p?.keys);
    updatePrimary(vm);
    const showStatus = vm.screen === 'idle' || vm.screen === 'disconnected' || vm.screen === 'desynced' || vm.screen === 'connecting';
    setText(parts.idleStatus, showStatus ? vm.status : '');
    parts.idleStatus.dataset.tone = vm.screen === 'disconnected' && vm.device.failed ? 'error' : 'text';
    parts.toast.hidden = !vm.toast;
    if (vm.toast) { setText(parts.toast, vm.toast.text); parts.toast.dataset.tone = vm.toast.tone; }
    parts.error.hidden = !vm.error;
    setText(parts.error, vm.error);
    setText($('#brain-phase-label'), vm.phaseText.label);
    setText($('#brain-phase-detail'), vm.phaseText.detail);
    // Timeline host (aria lives on the host so both styles share it).
    // Orbit keeps its ring host while connecting: the ring sweeps around the cube then.
    parts.timeline.hidden = !(vm.timeline.visible || (vm.screen === 'connecting' && style?.layout === 'orbit'));
    toggleClass(parts.timeline, 'is-ghost', vm.timeline.ghost);
    setAttr(parts.timeline, 'aria-valuemin', 0);
    setAttr(parts.timeline, 'aria-valuemax', vm.timeline.aria.max);
    setAttr(parts.timeline, 'aria-valuenow', vm.timeline.aria.now);
    setAttr(parts.timeline, 'aria-valuetext', vm.timeline.aria.text);
    parts.review.hidden = !vm.results;
    if (components) {
      components.timeline.update(vm, p);
      components.inspection.update(vm, p);
      components.results.update(vm, p);
    }
    last = vm;
  }

  /** @param {FrameVM} f */
  function frame(f) {
    if (last?.screen === 'solving' && !last.clock.hidden) setText(parts.clock, f.clockText);
    components?.timeline.frame?.(f);
    components?.inspection.frame?.(f);
  }

  /** @param {StyleModule} mod */
  function setStyleModule(mod) {
    if (style === mod) return;
    if (components) for (const c of Object.values(components)) c.destroy();
    style = mod;
    brain.dataset.brainStyle = mod.id;
    brain.dataset.layout = mod.layout;
    for (const slot of [slots.timeline, slots.inspection, slots.results, slots.inspectionAside, slots.timelineAside]) slot.replaceChildren();
    // Styles that draw part of a view in the right-hand column (Orbit) get a
    // second host for it; the other style's asides stay empty and hidden.
    const asides = mod.asides ?? {};
    slots.inspectionAside.hidden = !asides.inspection;
    slots.timelineAside.hidden = !asides.timeline;
    components = {
      timeline: mod.timeline(slots.timeline, { dispatch, aside: asides.timeline ? slots.timelineAside : undefined }),
      inspection: mod.inspection(slots.inspection, { dispatch, aside: asides.inspection ? slots.inspectionAside : undefined }),
      results: mod.results(slots.results, { dispatch }),
    };
    if (last) {
      const vm = last;
      last = null;
      update(vm, null);
    }
  }

  function destroy() {
    planGuide?.destroy(); recoveryGuide?.destroy();
    planGuide = recoveryGuide = null;
    if (components) for (const c of Object.values(components)) c.destroy();
    components = null;
    document.removeEventListener('click', onDocClick);
    brain.remove();
  }

  /** The live 3D cube (or null): the move guide cues the current move on it. */
  function setCube(cube) {
    cube3d = cube;
    if (!cube) { planGuide?.update({ cube3d: null }); recoveryGuide?.update({ cube3d: null }); }
    else if (last) update(last, null);
  }

  return { root: brain, slots, update, frame, setStyle: setStyleModule, setCube, destroy };
}
