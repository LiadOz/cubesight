// The drills hub (#/drills): a plain list of the trainers in the new visual
// language (Orbit / Mono tokens), a "continue" row for the last drill, and a
// needs-a-cube marker on each. Phase 1 has no "for you" block and no stats.
//
// createDrillsHub(root) -> { setActive(bool), detach() }. The hub owns its own
// keys (c p f x open a drill, enter continues) while it is the active page.

import '../pages/page.css';
import './hub.css';
import { loadSettings } from '../brain/settings.js';
import { createSolvedState } from '../cross-cube.js';
import { Orbit } from '../ui/orbit/index.js';
import { Cube } from '../ui/cube/index.js';
import { readCaseColorSetting } from '../ui/cube/case-color.js';
import { caseDisplayState } from '../ui/cube/orientation.js';
import { CUBE_LABELS, DRILLS, agoLabel, drillSettings, lastDrill } from './catalog.js';
import { dayStreak, loadShell } from './rounds.js';
import { syncPageTokens } from '../pages/tokens.js';
import { buildDrillViewModel } from './view-model.js';

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
  let active = false, detached = false, cube = null;
  let heroOrbit = null;
  const rowOrbits = [];
  const page = el('section', 'brain cs-page drills-hub');
  const hero = el('section', 'hub-hero');
  const intro = el('div', 'hub-hero-copy');
  const head = el('header', 'cs-head');
  const h1 = el('h1', null, 'drills');
  const sub = el('p', 'cs-sub', 'short rounds, one key to start. no cube needed unless marked.');
  head.append(h1, sub);
  intro.append(head);
  const stage = el('div', 'hub-hero-stage');
  stage.setAttribute('aria-label', '3D cube preview');
  const cubeMount = el('div', 'hub-cube-mount');
  cubeMount.setAttribute('aria-label', '3D cube');
  const orbitMount = el('div', 'hub-orbit-mount');
  stage.append(orbitMount, cubeMount);
  hero.append(intro, stage);
  const content = el('div', 'hub-content');
  page.append(hero, content);
  root.replaceChildren(page);

  function mountCube() {
    if (!active || cube || detached) return Promise.resolve(cube);
    try {
      cube = new Cube(cubeMount, { state: createSolvedState(), mode: 'case', size: 'L', caseColorSetting: readCaseColorSetting(), caseSeed: 'drills-hub', label: 'Drills cube preview' });
      heroOrbit = new Orbit(orbitMount, { size: 'L', shape: 'open', fitHost: true, label: 'Drills orbit', segments: [] });
      return Promise.resolve(cube);
    } catch {
      cubeMount.textContent = '3D cube preview unavailable.';
      return Promise.resolve(null);
    }
  }

  function unmountCube() {
    heroOrbit?.destroy(); heroOrbit = null;
    cube?.destroy(); cube = null;
    cubeMount.replaceChildren();
  }

  function render() {
    page.dataset.brainStyle = loadSettings(storage).style;
    rowOrbits.splice(0).forEach(orbit => orbit.destroy());
    content.replaceChildren();
    const rounds = loadShell(storage);
    const streak = dayStreak(rounds.days);
    if (streak) {
      const note = el('p', 'hub-streak', `${streak} day${streak === 1 ? '' : 's'} active`);
      note.setAttribute('aria-label', `${streak} day streak`);
      content.append(note);
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
    content.append(goOn);

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
      const glyph = el('span', 'hub-row-orbit');
      rowOrbits.push(new Orbit(glyph, { size: 'mini', glyphSize: 32, label: `${drill.title} orbit`, segments: [{ key: drill.id, weight: 1, state: 'future' }] }));
      name.append(key);
      link.append(glyph, name, el('span', 'hub-modes', drill.modes.join(' · ')), cubeMarker(drill), el('span', 'hub-chevron'));
      link.lastChild.setAttribute('aria-hidden', 'true');
      row.append(link);
      list.append(row);
    }
    content.append(list);

    const pageLinks = el('nav', 'hub-page-links');
    pageLinks.setAttribute('aria-label', 'More pages');
    const timerLink = el('a', null, 'manual timer');
    timerLink.href = '#/timer';
    const historyLink = el('a', null, 'history');
    historyLink.href = '#/history';
    pageLinks.append(timerLink, historyLink);
    content.append(pageLinks);

    const hints = el('p', 'hub-keys');
    hints.setAttribute('aria-hidden', 'true');
    hints.innerHTML = '<span><kbd>enter</kbd> next</span>';
    content.append(hints);
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
  const onTheme = () => { if (active && !detached) render(); };
  document.addEventListener('cubesight-theme', onTheme);
  document.addEventListener('keydown', onKey);
  render();

  return {
    get ready() { return Promise.resolve(cube); },
    getViewModel() {
      const last = lastDrill(storage);
      const rounds = loadShell(storage);
      const caseColor = readCaseColorSetting(storage);
      const caseSeed = rounds.round ? `${rounds.round.drill}:${rounds.round.startedAt}:${rounds.round.answers?.length ?? 0}` : `${last?.drill?.id ?? 'drills'}:${last?.at ?? 0}`;
      const topColor = caseDisplayState(createSolvedState(), caseColor, caseSeed).topColor;
      return buildDrillViewModel({ page: 'hub', drill: last?.drill?.id ?? null,
        phase: active ? 'active' : 'inactive', caseColor, topColor, caseSeed,
        round: rounds.round ? { status: rounds.round.status, kind: rounds.round.preset?.kind,
          total: rounds.round.preset?.cases ?? rounds.round.answers?.length ?? 0,
          answers: rounds.round.answers ?? [], combo: rounds.round.combo, bestCombo: rounds.round.bestCombo } : null });
    },
    setActive(value) {
      const wasActive = active;
      active = Boolean(value);
      if (active && !wasActive) render();   // pick up a new "continue" and the current style
      if (active) mountCube();
      else if (wasActive) unmountCube();
    },
    detach() {
      detached = true; active = false;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('cubesight-theme', onTheme);
      unmountCube();
      if (page.parentNode === root) page.remove();
    },
  };
}
