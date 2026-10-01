import './history.css';
import { openHistory } from '../store/history.js';
import { loadSettings, saveSettings, setSetting } from '../brain/settings.js';
import { listSessions } from '../store/sessions.js';
import { createCube3D } from '../cube-3d.js';
import { toRenderData } from '../cross-cube.js';
import { stateAfter } from '../review/replay.js';
import { parseCsTimer, exportCsTimer, filterHistory } from './cstimer.js';
import { exportAll, serializeExport, parseImport, importAll, historyFromImport, pinsFromImport } from '../data-port.js';
import { SOLVE_STORE_KEY } from '../solve-metrics.js';
import { readStickerPalette, themedRender } from '../brain/cube-theme.js';
import { syncPageTokens } from '../pages/tokens.js';

export const historyTime = record => {
  if (!Number.isFinite(record.solveMs)) return '—';
  const raw = (Math.floor(record.solveMs / 10) / 100).toFixed(2);
  if (record.penalty === 'DNF') return `DNF(${raw})`;
  return record.penalty === '+2' ? `${(Math.floor((record.solveMs + 2000) / 10) / 100).toFixed(2)}+` : raw;
};
const make = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const download = (text, name) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = make('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function initHistory(host) {
  let store, active = false, cube = null, selected = null, move = 0, playback = null;
  const settings = loadSettings(globalThis.localStorage);
  host.innerHTML = `<section class="brain cs-page history-page" data-brain-style="${settings.style}">
    <header><h1>history</h1><p>Solves and saved moments on this device.</p><a href="#/solve">back to solve</a></header>
    <form class="history-filters" aria-label="Filter history">
      <label>search<input type="search" name="query" placeholder="scramble, case, time" /></label>
      <label>session<select name="session"><option value="all">all sessions</option></select></label>
      <label>focus<select name="focus"><option value="all">all foci</option><option>speed</option><option>flow</option><option>learning</option></select></label>
      <label>source<select name="source"><option value="all">all sources</option><option value="smart">cube</option><option value="manual">manual</option><option value="import">import</option></select></label>
    </form>
    <details class="history-data"><summary>data and sessions</summary><div class="history-actions">
      <button type="button" data-action="backup">export data</button><label class="history-file">import data<input type="file" data-import="backup" accept=".json,application/json" /></label>
      <button type="button" data-action="cstimer">export csTimer</button><label class="history-file">import csTimer<input type="file" data-import="cstimer" accept=".json,application/json" /></label>
      <label>session gap (minutes)<input type="number" name="gap" min="1" max="1440" value="${settings.session.gapMin}" /></label>
    </div><p>Changing the gap starts future sessions after that idle time.</p></details>
    <p class="history-status" role="status" aria-live="polite"></p>
    <div class="history-layout"><div><p class="history-count"></p><ol class="history-list" aria-label="Solves"></ol></div>
    <section class="history-detail" aria-label="Solve detail"><p>Select a solve to see its scramble and replay.</p></section></div>
  </section>`;
  const root = host.firstElementChild;
  syncPageTokens(root);
  const form = root.querySelector('form');
  const status = root.querySelector('.history-status');
  const detail = root.querySelector('.history-detail');
  const report = text => { status.textContent = text; };
  const stopPlayback = () => { clearInterval(playback); playback = null; };
  function renderList() {
    if (!store) return;
    const filters = Object.fromEntries(new FormData(form));
    const list = filterHistory(store.records, filters);
    root.querySelector('.history-count').textContent = `${list.length} solves · ${store.pins.count} pins`;
    const rows = list.map(record => {
      const row = make('li');
      const button = make('button', `${historyTime(record)} · ${new Date(record.at).toLocaleString()} · ${record.focus} · ${record.source === 'manual' ? 'manual' : record.source === 'import' ? 'import' : 'cube'}`);
      button.type = 'button'; button.dataset.at = String(record.at);
      button.setAttribute('aria-pressed', String(record.at === selected?.at));
      row.append(button); return row;
    });
    root.querySelector('.history-list').replaceChildren(...rows.length ? rows : [make('li', 'No solves match. Change a filter or start a solve.')]);
  }
  function refreshSessions() {
    const select = form.elements.session;
    const old = select.value;
    const all = make('option', 'all sessions'); all.value = 'all';
    select.replaceChildren(all, ...listSessions(store.records).reverse().map(session => {
      const option = make('option', `${new Date(session.firstAt).toLocaleString()} · ${session.count} solves · ${session.focus}`);
      option.value = session.id; return option;
    }));
    if ([...select.options].some(option => option.value === old)) select.value = old;
  }
  function showPosition() {
    if (!selected?.solveMoves?.length) return;
    try {
      const state = stateAfter({ ...selected, scramble: selected.scramble || selected.scrambleTurns.join(' ') }, move);
      cube?.update(themedRender(toRenderData(state), readStickerPalette(root)));
      detail.querySelector('[data-move]').textContent = `move ${move} of ${selected.solveMoves.length}${move ? ` · ${selected.solveMoves[move - 1].replaceAll("'", '′')}` : ''}`;
      detail.querySelector('input[type="range"]').value = move;
    } catch { stopPlayback(); report('This solve uses notation the replay cannot read yet.'); }
  }
  function showRecord(record) {
    stopPlayback(); cube?.destroy(); cube = null; selected = record; move = 0;
    const title = make('h2', historyTime(record));
    const metadata = make('p', `${new Date(record.at).toLocaleString()} · ${record.focus}`);
    const scramble = make('p', record.scramble.replaceAll("'", '′') || 'No scramble recorded.', 'history-scramble');
    detail.replaceChildren(title, metadata, scramble);
    if (record.solveMoves.length) {
      const mount = make('div', undefined, 'history-cube');
      const label = make('p', '', 'history-move'); label.dataset.move = '';
      const range = make('input'); range.type = 'range'; range.min = '0'; range.max = String(record.solveMoves.length); range.value = '0'; range.setAttribute('aria-label', 'Replay move');
      const controls = make('div', undefined, 'history-actions');
      for (const [action, text] of [['previous', 'previous move'], ['play', 'play'], ['next', 'next move']]) {
        const button = make('button', text); button.type = 'button'; button.dataset.action = action; controls.append(button);
      }
      detail.append(mount, label, range, controls);
      try { cube = createCube3D(mount, { mode: 'scout' }); } catch { report('3D replay is unavailable in this browser. The move list is still here.'); }
      detail.append(make('p', record.solveMoves.join(' ').replaceAll("'", '′'), 'history-scramble'));
      showPosition();
    } else detail.append(make('p', 'This solve has a time only. No moves were recorded.'));
    const pins = store.pins.forRecord(record.at);
    if (pins.length) detail.append(make('p', `${pins.length} saved moments`));
    const actions = make('div', undefined, 'history-actions');
    for (const [action, text] of [['none', 'clear penalty'], ['plus2', '+2'], ['dnf', 'DNF'], ['delete', 'delete']]) {
      const button = make('button', text); button.type = 'button'; button.dataset.action = action; actions.append(button);
    }
    detail.append(actions); renderList();
  }
  let deleted = null;
  async function onClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    await ready;
    if (!active) return;
    if (button.dataset.at) { showRecord(store.records.find(r => r.at === Number(button.dataset.at))); return; }
    const action = button.dataset.action;
    if (action === 'backup' || action === 'cstimer') {
      await store.flush(); await store.pins.flush();
      download(action === 'backup' ? serializeExport(exportAll(globalThis.localStorage, store.records, store.pins.list)) : exportCsTimer(store.records), action === 'backup' ? 'cubesight-backup.json' : 'cstimer.json'); return;
    }
    if (action === 'undo' && deleted) { store.restore(deleted); deleted = null; button.remove(); refreshSessions(); renderList(); report('Solve restored.'); return; }
    if (!selected) return;
    if (['previous', 'next', 'play'].includes(action)) {
      if (action === 'play') {
        if (playback) { stopPlayback(); button.textContent = 'play'; }
        else { if (move === selected.solveMoves.length) move = 0; button.textContent = 'pause'; playback = setInterval(() => { move++; showPosition(); if (move >= selected.solveMoves.length) { stopPlayback(); button.textContent = 'play'; } }, 500); }
      } else { stopPlayback(); move = Math.min(selected.solveMoves.length, Math.max(0, move + (action === 'next' ? 1 : -1))); showPosition(); }
    } else if (action === 'delete') {
      deleted = store.remove(selected.at);
      if (!deleted) { report(store.warning || 'This history is read-only. Update the app and reload.'); return; }
      stopPlayback(); cube?.destroy(); cube = null; selected = null;
      detail.replaceChildren(make('p', 'Solve deleted.'));
      const undo = make('button', 'undo'); undo.type = 'button'; undo.dataset.action = 'undo'; detail.append(undo); refreshSessions(); renderList();
    } else if (['none', 'plus2', 'dnf'].includes(action)) {
      const record = store.setPenalty(selected.at, action === 'none' ? null : action === 'plus2' ? '+2' : 'DNF'); if (record) showRecord(record);
    }
  }
  async function onChange(event) {
    await ready;
    if (!active) return;
    if (event.target.dataset.import) {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        if (store.readOnly) throw new Error('History is read-only. Update the app and reload.');
        const text = await file.text(); let count;
        if (event.target.dataset.import === 'cstimer') count = store.importRecords(parseCsTimer(text));
        else { const parsed = parseImport(text); importAll(globalThis.localStorage, parsed, { skipKeys: [SOLVE_STORE_KEY] }); count = store.importRecords(historyFromImport(parsed)); store.pins.importPins(pinsFromImport(parsed)); }
        await store.flush(); await store.pins.flush(); refreshSessions(); renderList(); report(`Imported ${count} solves.`);
      } catch (error) { report(error.message); }
      event.target.value = ''; return;
    }
    if (event.target.name === 'gap') {
      const next = store.setSessionGapMin(Number(event.target.value)); event.target.value = next;
      saveSettings(globalThis.localStorage, setSetting(loadSettings(globalThis.localStorage), 'session.gapMin', next)); report(`Future solves start a new session after ${next} minutes idle.`);
    } else renderList();
  }
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', event => {
    if (event.target.type === 'range') { stopPlayback(); move = Number(event.target.value); showPosition(); }
    else if (event.target.name === 'query') renderList();
  });
  form.addEventListener('submit', event => event.preventDefault());
  const retheme = () => { if (active) showPosition(); };
  document.addEventListener('cubesight-theme', retheme);
  const ready = openHistory({ sessionGapMin: settings.session.gapMin }).then(value => { store = value; refreshSessions(); renderList(); report(store.warning); });
  return {
    ready,
    async setActive(value) {
      active = Boolean(value);
      if (!active) { stopPlayback(); cube?.destroy(); cube = null; return; }
      await ready;
      if (!active) return;
      root.dataset.brainStyle = loadSettings(globalThis.localStorage).style;
      syncPageTokens(root);
      await store.reload();
      refreshSessions(); renderList();
      if (selected) {
        const previousMove = move;
        const record = store.records.find(r => r.at === selected.at);
        if (record) { showRecord(record); move = previousMove; showPosition(); }
        else { selected = null; detail.replaceChildren(make('p', 'This solve was deleted. Select another solve.')); }
      }
    },
    detach() { active = false; stopPlayback(); document.removeEventListener('cubesight-theme', retheme); cube?.destroy(); host.replaceChildren(); },
  };
}
