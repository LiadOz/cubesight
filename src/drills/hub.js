// The drills hub (#/drills): a plain list of the trainers in the new visual
// language (Orbit / Mono tokens), a "continue" row for the last drill, and a
// needs-a-cube marker on each. Phase 1 has no "for you" block and no stats.
//
// createDrillsHub(root) -> { setActive(bool), detach() }. The hub owns its own
// keys (c p f x open a drill, enter continues) while it is the active page.

import '../pages/page.css';
import './hub.css';
import { loadSettings } from '../brain/settings.js';
import { CUBE_LABELS, DRILLS, agoLabel, drillSettings, lastDrill } from './catalog.js';
import { dayStreak, loadShell } from './rounds.js';
import { syncPageTokens } from '../pages/tokens.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function cubeMarker(drill) {
  const marker = el('span', 'hub-cube', CUBE_LABELS[drill.cube]);
  marker.dataset.cube = drill.cube;
  return marker;
}

export function createDrillsHub(root, storage = globalThis.localStorage) {
  let active = false;

  function render() {
    const page = el('section', 'brain cs-page drills-hub');
    page.dataset.brainStyle = loadSettings(storage).style;

    const head = el('header', 'cs-head');
    head.append(el('h1', null, 'drills'), el('p', 'cs-sub', 'short rounds, one key to start. no cube needed unless marked.'));
    page.append(head);
    const rounds = loadShell(storage);
    const streak = dayStreak(rounds.days);
    if (streak) {
      const note = el('p', 'hub-streak', `${streak} day${streak === 1 ? '' : 's'} active`);
      note.setAttribute('aria-label', `${streak} day streak`);
      page.append(note);
    }

    const last = lastDrill(storage);
    const pick = last?.drill ?? DRILLS[0];
    const goOn = el('a', 'hub-continue');
    goOn.href = last?.hash ?? pick.href;
    goOn.dataset.hubContinue = pick.id;
    const copy = el('span', 'hub-continue-copy');
    copy.append(
      el('span', 'hub-eyebrow', last ? 'continue' : 'start here'),
      el('strong', 'hub-continue-title', pick.title),
      el('span', 'hub-continue-meta', [drillSettings(storage, pick), last ? `last played ${agoLabel(last.at)}` : null].filter(Boolean).join(' · ')),
    );
    const play = el('span', 'hub-play', last ? 'continue' : 'start');
    play.append(el('kbd', null, 'enter'));
    goOn.append(copy, play);
    page.append(goOn);

    const list = el('ul', 'hub-list');
    list.setAttribute('aria-label', 'drills');
    list.append(el('li', 'hub-list-head', ''));
    list.firstChild.append(el('span', null, 'drill'), el('span', 'hub-col-modes', 'modes'), el('span', 'hub-col-cube', 'cube'));
    for (const drill of DRILLS) {
      const row = el('li', 'hub-row');
      const link = el('a', 'hub-link');
      link.href = drill.href;
      link.dataset.drill = drill.id;
      const key = el('kbd', 'hub-key', drill.key);
      const name = el('span', 'hub-name');
      name.append(el('strong', null, drill.title), el('span', 'hub-blurb', drill.blurb));
      link.append(key, name, el('span', 'hub-modes', drill.modes.join(' · ')), cubeMarker(drill), el('span', 'hub-chevron'));
      link.lastChild.setAttribute('aria-hidden', 'true');
      row.append(link);
      list.append(row);
    }
    page.append(list);

    const pageLinks = el('nav', 'hub-page-links');
    pageLinks.setAttribute('aria-label', 'More pages');
    const timerLink = el('a', null, 'manual timer');
    timerLink.href = '#/timer';
    const historyLink = el('a', null, 'history');
    historyLink.href = '#/history';
    pageLinks.append(timerLink, historyLink);
    page.append(pageLinks);

    const hints = el('p', 'hub-keys');
    hints.setAttribute('aria-hidden', 'true');
    hints.innerHTML = `<span><kbd>${DRILLS.map(drill => drill.key).join(' ')}</kbd> open drill</span><span><kbd>enter</kbd> next</span>`;
    page.append(hints);

    root.replaceChildren(page);
    syncPageTokens(page);
  }

  function onKey(event) {
    if (!active || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    const key = event.key.toLowerCase();
    if (key === 'enter') {
      // A focused link or button handles its own enter.
      if (event.target instanceof HTMLAnchorElement || event.target instanceof HTMLButtonElement) return;
      root.querySelector('[data-hub-continue]')?.click();
      return;
    }
    const drill = DRILLS.find(item => item.key === key);
    if (drill) location.hash = drill.href;
  }
  document.addEventListener('keydown', onKey);
  render();

  return {
    setActive(value) {
      const wasActive = active;
      active = value;
      if (value && !wasActive) render();   // pick up a new "continue" and the current style
    },
    detach() { active = false; document.removeEventListener('keydown', onKey); root.replaceChildren(); },
  };
}
