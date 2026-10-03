import './history.css';
import { openHistory } from '../store/history.js';
import { loadSettings, saveSettings, setSetting } from '../brain/settings.js';
import { listSessions } from '../store/sessions.js';
import { createPageCube } from '../pages/cube-view.js';
import { createSequencePlayer } from '../moves/sequence-player.js';
import { stateAfter } from '../review/replay.js';
import { parseCsTimer, exportCsTimer, filterHistory } from './cstimer.js';
import { exportAll, serializeExport, parseImport, importAll, historyFromImport, pinsFromImport, algorithmsFromImport } from '../data-port.js';
import { algDatabase } from '../algs/runtime.js';
import { SOLVE_STORE_KEY } from '../solve-metrics.js';
import { syncPageTokens } from '../pages/tokens.js';
import { fmt } from '../copy/terms.js';
import { createButton, createCountPill, createFileInput, createFilledInput, createFilledSelect, createListRow, createSearch } from '../ui/shared/index.js';

export const historyTime = record => {
  return fmt.penalty(record);
};
const historyDate = at => {
  const date = new Date(at);
  return `${fmt.date(at)} · ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
  let store, active = false, cube = null, player = null, cubeAbort = null, cubeGeneration = 0, selected = null, move = 0;
  const settings = loadSettings(globalThis.localStorage);
  host.innerHTML = `<section class="brain cs-page history-page" data-brain-style="${settings.style}">
    <header><h1>history</h1><p>Solves and saved moments on this device.</p><a href="#/solve">back to solve</a></header>
    <form class="history-filters" aria-label="Filter history">
      <div data-history-search></div>
      <div data-history-session></div>
      <div data-history-focus></div>
      <div data-history-source></div>
    </form>
    <details class="history-data"><summary>data and sessions</summary><div class="history-actions">
      <span data-history-export-actions></span><div data-history-imports></div><div data-history-gap></div>
    </div><p>Changing the gap starts future sessions after that idle time.</p></details>
    <p class="history-status" role="status" aria-live="polite"></p>
    <div class="history-layout"><div><p class="history-count"></p><ol class="history-list" aria-label="Solves"></ol></div>
    <section class="history-detail" aria-label="Solve detail"><p>Select a solve to see its scramble and replay.</p></section></div>
  </section>`;
  const root = host.firstElementChild;
  syncPageTokens(root);
  const form = root.querySelector('form');
  createSearch(form.querySelector('[data-history-search]'), { placeholder: 'scramble, case, time', label: 'search', name: 'query' });
  const filterSelects = [
    createFilledSelect(form.querySelector('[data-history-session]'), { label: 'session', name: 'session', value: 'all', options: [{ value: 'all', label: 'all sessions' }] }),
    createFilledSelect(form.querySelector('[data-history-focus]'), { label: 'focus', name: 'focus', value: 'all', options: [{ value: 'all', label: 'all foci' }, { value: 'speed', label: 'speed' }, { value: 'flow', label: 'flow' }, { value: 'learning', label: 'learning' }] }),
    createFilledSelect(form.querySelector('[data-history-source]'), { label: 'source', name: 'source', value: 'all', options: [{ value: 'all', label: 'all sources' }, { value: 'smart', label: 'cube' }, { value: 'manual', label: 'manual' }, { value: 'import', label: 'import' }] }),
  ];
  const status = root.querySelector('.history-status');
  const detail = root.querySelector('.history-detail');
  const countHost = root.querySelector('.history-count');
  const solveCount = createCountPill(countHost, 0, 'solves');
  const pinCount = createCountPill(countHost, 0, 'pins');
  const exportActions = root.querySelector('[data-history-export-actions]');
  createButton(exportActions, { label: 'export data', variant: 'secondary' }).dataset.action = 'backup';
  createButton(exportActions, { label: 'export csTimer', variant: 'secondary' }).dataset.action = 'cstimer';
  const backupFile = createFileInput(root.querySelector('[data-history-imports]'), { label: 'import data', accept: '.json,application/json' }); backupFile.input.dataset.import = 'backup';
  const csTimerFile = createFileInput(root.querySelector('[data-history-imports]'), { label: 'import csTimer', accept: '.json,application/json' }); csTimerFile.input.dataset.import = 'cstimer';
  const gapInput = createFilledInput(root.querySelector('[data-history-gap]'), { label: 'session gap (minutes)', name: 'gap', type: 'number', value: settings.session.gapMin });
  gapInput.input.min = '1'; gapInput.input.max = '1440'; gapInput.input.step = '1';
  const report = text => { status.textContent = text; };
  const stopPlayback = () => player?.pause();
  function destroyReplay() {
    cubeGeneration++;
    cubeAbort?.abort(); cubeAbort = null;
    player?.destroy(); player = null;
    cube?.destroy(); cube = null;
  }
  function mountReplay(record, mount, controls, moveLabel, range) {
    cubeAbort?.abort();
    const abort = new AbortController(); cubeAbort = abort;
    const generation = ++cubeGeneration;
    const startState = stateAfter({ ...record, scramble: record.scramble || record.scrambleTurns.join(' ') }, 0);
    createPageCube(mount, { state: startState, mode: 'scout', signal: abort.signal }).then(instance => {
      if (abort.signal.aborted || generation !== cubeGeneration || !active || !mount.isConnected) { instance.destroy(); return; }
      cube = instance;
      player = createSequencePlayer(controls, {
        cube3d: cube, startState, moves: record.solveMoves, index: move,
        onChange(snapshot) {
          if (generation !== cubeGeneration || !active) return;
          move = snapshot.index;
          moveLabel.textContent = `move ${move} of ${record.solveMoves.length}${move ? ` · ${fmt.move(record.solveMoves[move - 1])}` : ''}`;
          range.value = move;
        },
      });
    }).catch(error => {
      if (!abort.signal.aborted && generation === cubeGeneration && active) {
        mount.textContent = '3D replay is unavailable in this browser.';
        report(error?.message ?? 'The move list is still available.');
      }
    });
  }
  function renderList() {
    if (!store) return;
    const filters = Object.fromEntries(new FormData(form));
    const list = filterHistory(store.records, filters);
    solveCount.textContent = `${list.length} solves`;
    pinCount.textContent = `${store.pins.count} pins`;
    const rows = list.map(record => {
      const row = make('li');
      const source = record.source === 'manual' ? 'manual' : record.source === 'import' ? 'import' : 'cube';
      const moves = Array.isArray(record.solveMoves) ? record.solveMoves : [];
      const durations = Array.isArray(record.moveTimes) ? record.moveTimes : [];
      const segments = moves.map((move, index) => {
        const duration = Number(durations[index]);
        return { key: `move-${index}`, label: fmt.move(move), weight: Number.isFinite(duration) && duration > 0 ? duration : 1, state: 'done', fill: 1 };
      });
      const button = createListRow(row, {
        title: historyTime(record), detail: `${historyDate(record.at)} · ${record.focus} · ${source}`,
        selected: record.at === selected?.at, ariaPressed: record.at === selected?.at, interactive: true,
        orbit: { segments, label: `Solve ${historyTime(record)} by move timing` },
      });
      button.dataset.at = String(record.at);
      return row;
    });
    const listHost = root.querySelector('.history-list');
    listHost.querySelectorAll('.ui-list-row').forEach(row => row.destroy?.());
    listHost.replaceChildren(...rows.length ? rows : [make('li', 'No solves match. Change a filter or start a solve.')]);
  }
  function refreshSessions() {
    const sessionFilter = filterSelects[0];
    const options = [{ value: 'all', label: 'all sessions' }, ...listSessions(store.records).reverse().map(session => ({
      value: session.id, label: `${historyDate(session.firstAt)} · ${fmt.count(session.count, 'solve')} · ${session.focus}`,
    }))];
    sessionFilter.setOptions(options, sessionFilter.value());
  }
  function showPosition() {
    if (!selected?.solveMoves?.length) return;
    try {
      const startState = stateAfter({ ...selected, scramble: selected.scramble || selected.scrambleTurns.join(' ') }, 0);
      player?.load({ startState, moves: selected.solveMoves, index: move });
      detail.querySelector('[data-move]').textContent = `move ${move} of ${selected.solveMoves.length}${move ? ` · ${fmt.move(selected.solveMoves[move - 1])}` : ''}`;
      detail.querySelector('input[type="range"]').value = move;
    } catch { stopPlayback(); report('This solve uses notation the replay cannot read yet.'); }
  }
  function showRecord(record) {
    destroyReplay(); selected = record; move = 0;
    const title = make('h2', historyTime(record));
    const metadata = make('p', `${historyDate(record.at)} · ${record.focus}`);
    const scramble = make('p', fmt.moves(record.scramble) || 'No scramble recorded.', 'history-scramble');
    detail.replaceChildren(title, metadata, scramble);
    if (record.solveMoves.length) {
      const mount = make('div', undefined, 'history-cube');
      const label = make('p', '', 'history-move'); label.dataset.move = '';
      const range = make('input'); range.type = 'range'; range.min = '0'; range.max = String(record.solveMoves.length); range.value = '0'; range.setAttribute('aria-label', 'Replay move');
      const controls = make('div', undefined, 'history-playback');
      detail.append(mount, label, range, controls);
      mountReplay(record, mount, controls, label, range);
      detail.append(make('p', fmt.moves(record.solveMoves.join(' ')), 'history-scramble'));
    } else detail.append(make('p', 'This solve has a time only. No moves were recorded.'));
    const pins = store.pins.forRecord(record.at);
    if (pins.length) detail.append(make('p', `${pins.length} saved moments`));
    const actions = make('div', undefined, 'history-actions');
    for (const [action, text] of [['none', 'clear penalty'], ['plus2', '+2'], ['dnf', 'DNF'], ['delete', 'delete']]) {
      const button = createButton(actions, { label: text, variant: action === 'delete' ? 'text' : 'secondary' }); button.dataset.action = action;
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
      const backup = action === 'backup' ? serializeExport(exportAll(globalThis.localStorage, store.records, store.pins.list, await algDatabase.exportPersonalData())) : exportCsTimer(store.records);
      download(backup, action === 'backup' ? 'cubesight-backup.json' : 'cstimer.json'); return;
    }
    if (action === 'undo' && deleted) { store.restore(deleted); await store.flush(); deleted = null; button.remove(); refreshSessions(); renderList(); report('Solve restored.'); return; }
    if (!selected) return;
    if (['previous', 'next', 'play'].includes(action)) {
      if (action === 'play') player?.play();
      else player?.step(action === 'next' ? 1 : -1);
    } else if (action === 'delete') {
      deleted = store.remove(selected.at);
      if (!deleted) { report(store.warning || 'This history is read-only. Update the app and reload.'); return; }
      await store.flush();
      destroyReplay(); selected = null;
      detail.replaceChildren(make('p', 'Solve deleted.'));
      const undo = createButton(detail, { label: 'undo', variant: 'secondary' }); undo.dataset.action = 'undo'; refreshSessions(); renderList();
    } else if (['none', 'plus2', 'dnf'].includes(action)) {
      const record = store.setPenalty(selected.at, action === 'none' ? null : action === 'plus2' ? '+2' : 'DNF'); await store.flush(); if (record) showRecord(record);
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
        else {
          const parsed = parseImport(text);
          importAll(globalThis.localStorage, parsed, { skipKeys: [SOLVE_STORE_KEY] });
          const algorithms = algorithmsFromImport(parsed); if (algorithms) await algDatabase.importPersonalData(algorithms);
          count = store.importRecords(historyFromImport(parsed)); store.pins.importPins(pinsFromImport(parsed));
        }
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
    if (event.target.type === 'range') { move = Number(event.target.value); showPosition(); }
    else if (event.target.name === 'query') renderList();
  });
  form.addEventListener('submit', event => event.preventDefault());
  const retheme = () => { if (active) { root.dataset.brainStyle = loadSettings(globalThis.localStorage).style; syncPageTokens(root); } };
  document.addEventListener('cubesight-theme', retheme);
  const ready = openHistory({ sessionGapMin: settings.session.gapMin }).then(value => { store = value; refreshSessions(); renderList(); report(store.warning); });
  return {
    ready,
    async setActive(value) {
      active = Boolean(value);
      if (!active) { stopPlayback(); return; }
      await ready;
      if (!active) return;
      root.dataset.brainStyle = loadSettings(globalThis.localStorage).style;
      syncPageTokens(root);
      await store.reload();
      refreshSessions(); renderList();
      if (selected) {
        const record = store.records.find(r => r.at === selected.at);
        if (record) { const previousMove = move; showRecord(record); move = previousMove; showPosition(); }
        else { selected = null; detail.replaceChildren(make('p', 'This solve was deleted. Select another solve.')); }
      }
    },
    detach() { active = false; stopPlayback(); destroyReplay(); filterSelects.forEach(filter => filter.destroy()); document.removeEventListener('cubesight-theme', retheme); host.replaceChildren(); },
  };
}
