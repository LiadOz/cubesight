// The move guide: plain notation chips plus the 3D cue.
//
//   - a strip of chips, one <i> per move, class exactly 'done' | 'current' | '' (plus
//     'wrong'): the current move is highlighted, done moves are dimmed. No glyphs, no
//     direction words, no tooltips.
//   - the cue: the live 3D cube's actual layer leans into the current move
//     (cube3d.setCue). It is the only visual "how" of a move; it restarts when the
//     current move changes and steps aside for real turns (see cube-3d.js).
//   - an accessible description (aria-label per chip and a screen-reader live region)
//     built with describeMove; none of it is visible.
//
// Update paths patch classes and text only (see src/brain/dom.js).
import './move-guide.css';
import { setAttr, setText, toggleClass } from '../brain/dom.js';
import { describeMove, displayMove, heldAfter, isMove, normalizeMove } from './notation.js';
import { readGuidePrefs } from './prefs.js';

const STATUS_WORD = { wrong: 'Unintended move.' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {HTMLElement} host
 * @param {object} [options]
 * @param {string[]} [options.moves]      notation, any kind (R Rw r M x y z, with 2 and prime)
 * @param {number} [options.index]        current move; moves.length (or -1) means none
 * @param {{bottom:string, front:string}} [options.held]  the hold the moves are written for; without it the cue follows the gyro
 * @param {'held'|'start'} [options.frame] 'start': a rotation in the sequence changes the frame of what follows
 * @param {Record<number,'wrong'>} [options.statuses]
 * @param {{at:number, moves:string[]}|null} [options.undo]  the way back after a wrong turn, shown INLINE as an amber spaced section
 *   before move `at` (the planned move, which is marked); decoration only: the cue and the spoken text follow `moves`/`index`
 * @param {object} [options.cube3d]       the live cube: the cue plays the current move on it
 * @param {string} [options.label]        accessible name of the group
 */
export function createMoveGuide(host, options = {}) {
  const state = { moves: [], index: 0, held: null, frame: 'held', statuses: {}, cube3d: null, undo: null, label: 'Move guide', ...options };
  let destroyed = false;
  let keys = [];
  let cueKey = null;
  let cueCube = null;
  let cueId = 0;
  const chips = new Map();      // key -> chip element

  host.classList.add('mg-guide');
  setAttr(host, 'role', 'group');
  setAttr(host, 'aria-label', state.label);
  const strip = el('div', 'mg-strip');
  strip.setAttribute('role', 'list');
  strip.setAttribute('data-scroll-x', 'true');
  strip.tabIndex = 0;
  strip.setAttribute('aria-label', `Moves for ${state.label}`);
  strip.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || strip.scrollWidth <= strip.clientWidth) return;
    event.preventDefault();
    const step = Math.max(40, Math.round(strip.clientWidth * 0.8));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? strip.scrollWidth : strip.scrollLeft + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0);
    strip.scrollTo({ left: next, behavior: 'auto' });
  });
  const live = el('p', 'mg-sr');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  host.append(strip, live);

  // The hold each move is written in: one hold for a 'held' sequence; in a 'start'
  // sequence a rotation changes the frame of everything after it. null = follow the gyro.
  let helds = [];
  function computeHelds() {
    let held = state.held;
    helds = state.moves.map(move => {
      const here = held;
      if (state.frame === 'start' && held && isMove(move)) held = heldAfter(held, move);
      return here;
    });
  }
  const heldFor = i => helds[i] ?? null;
  const currentValid = () => state.index >= 0 && state.index < state.moves.length && isMove(state.moves[state.index]);

  /** What the move at `i` is: the structured description with its position. Text only for assistive tech. */
  function describe(i = state.index) {
    const raw = state.moves[i];
    if (raw == null) return null;
    const total = state.moves.length;
    if (!isMove(raw)) return { index: i, total, notation: String(raw), display: String(raw), kind: 'unknown', text: `Move ${i + 1} of ${total}: ${raw}.`, sentence: `Move ${i + 1} of ${total}: ${raw}.` };
    const base = describeMove(raw, heldFor(i) ?? state.cube3d?.getHeldFaces?.() ?? undefined);
    const status = state.statuses[i];
    return { ...base, index: i, total, status: status ?? null, sentence: `Move ${i + 1} of ${total}: ${base.display}. ${status ? `${STATUS_WORD[status]} ` : ''}${base.text}` };
  }

  // Items of the strip in order: the moves, with the undo section (a spacer, the way back, a spacer) before move `undo.at`.
  function stripItems() {
    const list = state.moves.map((m, i) => ({ key: `${i}:${isMove(m) ? normalizeMove(m) : String(m)}`, text: isMove(m) ? displayMove(m) : String(m), index: i }));
    const undo = state.undo?.moves?.length ? state.undo : null;
    if (!undo) return list;
    const at = Math.max(0, Math.min(list.length, undo.at ?? state.index));
    const section = [
      { key: 'gap:before', gap: true },
      ...undo.moves.map((m, j) => ({ key: `undo${j}:${normalizeMove(m)}`, text: displayMove(m), undo: j })),
      { key: 'gap:after', gap: true },
    ];
    return [...list.slice(0, at), ...section, ...list.slice(at)];
  }

  function syncChips() {
    const items = stripItems();
    const nextKeys = items.map(item => item.key);
    if (nextKeys.length === keys.length && nextKeys.every((k, i) => k === keys[i])) return;
    const wanted = items.map(item => {
      let chip = chips.get(item.key);
      if (!chip) {
        chip = el('i', item.gap ? 'mg-gap' : '', item.gap ? '' : item.text);
        if (item.gap) chip.setAttribute('aria-hidden', 'true');
        else if (item.undo != null) { chip.dataset.undo = String(item.undo); chip.setAttribute('aria-hidden', 'true'); }
        else { chip.setAttribute('role', 'listitem'); chip.dataset.index = String(item.index); }
        chip.dataset.key = item.key;
        chips.set(item.key, chip);
      }
      chips.delete(item.key); chips.set(item.key, chip);   // keep map order = document order
      return chip;
    });
    for (const [key, chip] of [...chips]) if (!nextKeys.includes(key)) { chip.remove(); chips.delete(key); }
    let cursor = strip.firstElementChild;
    for (const chip of wanted) {
      if (chip === cursor) cursor = cursor.nextElementSibling; else strip.insertBefore(chip, cursor);
    }
    keys = nextKeys;
  }

  function syncState() {
    const plannedAt = state.undo?.moves?.length ? Math.max(0, Math.min(state.moves.length - 1, state.undo.at ?? state.index)) : -1;
    [...strip.children].forEach(chip => {
      if (chip.classList.contains('mg-gap')) return;
      if (chip.dataset.undo != null) { const cls = chip.dataset.undo === '0' ? 'undo current' : 'undo'; if (chip.className !== cls) chip.className = cls; return; }
      const i = Number(chip.dataset.index);
      const cls = [i < state.index ? 'done' : i === state.index ? 'current' : '', state.statuses[i] === 'wrong' ? 'wrong' : '', ''].filter(Boolean).join(' ');
      if (chip.className !== cls) chip.className = cls;
      if (i === plannedAt) chip.dataset.planned = 'true'; else delete chip.dataset.planned;   // a data attribute: the class list stays the move's state
      const d = describe(i);
      if (d) setAttr(chip, 'aria-label', d.sentence);
    });
    toggleClass(host, 'mg-finished', state.index >= state.moves.length);
    const d = currentValid() ? describe() : null;
    setText(live, d ? d.sentence : '');
  }

  function syncCue() {
    const cube = state.cube3d;
    const wants = currentValid() && cube?.setCue && readGuidePrefs().cue !== false;
    if (!wants) {
      if (cueKey) { cueCube?.clearCue?.(cueId); cueKey = null; cueCube = null; }
      return;
    }
    const held = heldFor(state.index);
    const key = `${state.index}|${normalizeMove(state.moves[state.index])}|${held ? held.bottom + held.front : 'gyro'}|${reduced()}`;
    if (key === cueKey && cube === cueCube) return;
    if (cueCube && cueCube !== cube) cueCube.clearCue?.(cueId);
    cueKey = key;
    cueCube = cube;
    cueId = cube.setCue(state.moves[state.index], { loop: !reduced(), held });
  }

  function scrollToCurrent() {
    const chip = strip.querySelector(`[data-index="${Math.min(Math.max(state.index, 0), Math.max(0, state.moves.length - 1))}"]`) ?? strip.lastElementChild;
    if (!chip || strip.scrollWidth <= strip.clientWidth) return;
    // offsetLeft is relative to the chip's offsetParent (which may be the guide
    // host rather than the scroll strip). Use viewport geometry so nested page
    // layouts still center the selected chip accurately.
    const stripRect = strip.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const chipCenter = strip.scrollLeft + chipRect.left - stripRect.left + chipRect.width / 2;
    const left = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, chipCenter - strip.clientWidth / 2));
    if (Math.abs(strip.scrollLeft - left) > 2) strip.scrollTo({ left, behavior: reduced() ? 'auto' : 'smooth' });
  }

  function render() {
    computeHelds();
    syncChips();
    syncState();
    syncCue();
    scrollToCurrent();
  }

  render();
  return {
    /** Patch any option; only what changed is redrawn. */
    update(patch = {}) {
      if (destroyed) return;
      Object.assign(state, patch);
      if (patch.label) setAttr(host, 'aria-label', patch.label);
      render();
    },
    describe,
    destroy() {
      destroyed = true;
      cueCube?.clearCue?.(cueId);
      cueKey = null;
      cueCube = null;
      chips.clear();
      host.replaceChildren();
      host.classList.remove('mg-guide', 'mg-finished');
    },
  };
}
