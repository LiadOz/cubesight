// The universal move guide: shows HOW to perform each move of a sequence
// wherever the app gives one (scramble, recovery, algorithms, coach, review).
//
//   C  a strip of chips, one per move: a mini cube glyph with the turning layer
//      lit and an arrow, the notation under it, the current chip enlarged,
//      known triggers bracketed, mistakes marked
//   B  a ghost on the live 3D cube (cube3d.showGhost) for the current move
//   A  static arrows on an isometric cube (variant 'arrows'), also the fallback
//      when motion is reduced
//   D  an unfolded net (variant 'net')
//
// Update paths patch classes and text only (no innerHTML, no rebuild of chips
// that did not change); see src/brain/dom.js. Colours come from --b-* tokens.
import './move-guide.css';
import { setAttr, setText, toggleClass } from '../brain/dom.js';
import { fingertrick } from './fingertricks.js';
import { renderGlyph } from './glyph.js';
import { renderNet } from './net.js';
import { describeMove, displayMove, heldAfter, isMove, normalizeMove } from './notation.js';
import { readGuidePrefs } from './prefs.js';
import { groupMoves } from './triggers.js';

const DEFAULT_HELD = { bottom: 'D', front: 'F' };
const STATUS_CLASS = { wrong: 'wrong', fix: 'fix', best: 'best', played: 'played' };
const STATUS_WORD = { wrong: 'Played by mistake.', fix: 'Undo move.', best: 'Best move.', played: 'Played.' };

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
 * @param {number} [options.index]        current move; moves.length means finished
 * @param {{bottom:string, front:string}} [options.held]  the hold the moves are written for (from the gyro)
 * @param {'held'|'start'} [options.frame] 'start': a rotation in the sequence changes the frame of what follows
 * @param {'chips'|'arrows'|'net'} [options.variant]  what draws the current move besides the strip
 * @param {'none'|'auto'|Array} [options.grouping]
 * @param {Record<number,'wrong'|'fix'|'best'|'played'>} [options.statuses]
 * @param {object} [options.cube3d]       the live cube: the ghost plays the current move on it
 * @param {boolean} [options.fingertricks] default: the stored preference
 * @param {(delta:number)=>void} [options.onStep]    left/right arrows
 * @param {(index:number)=>void} [options.onSelect]  a chip was clicked
 * @param {string} [options.label]        accessible name of the group
 */
export function createMoveGuide(host, options = {}) {
  const state = {
    moves: [], index: 0, held: null, frame: 'held', variant: 'chips', grouping: 'none', statuses: {}, cube3d: null,
    fingertricks: undefined, label: 'Move guide', ...options,
  };
  let destroyed = false;
  let keys = [];
  let ghostKey = null;
  let ghostCube = null;
  let ghostId;
  let glyphOf = new Map();      // arrows / net SVGs, cached by move + hold
  const chips = new Map();      // key -> chip element

  host.classList.add('mg-guide');
  setAttr(host, 'role', 'group');
  setAttr(host, 'aria-label', state.label);
  const stage = el('div', 'mg-stage');
  const stageArt = el('div', 'mg-stage-art');
  const stageText = el('p', 'mg-stage-text');
  stage.append(stageArt, stageText);
  const strip = el('div', 'mg-strip');
  strip.setAttribute('role', 'list');
  host.append(stage, strip);

  const fingersOn = () => (state.fingertricks ?? readGuidePrefs().fingertricks) !== false;
  const heldNow = () => state.held ?? state.cube3d?.getHeldFaces?.() ?? DEFAULT_HELD;
  // The hold each move is written in: one hold for a 'held' sequence; in a 'start'
  // sequence a rotation changes the frame of everything after it.
  let helds = [];
  function computeHelds() {
    let held = heldNow();
    helds = state.moves.map(move => {
      const here = held;
      if (state.frame === 'start' && isMove(move)) held = heldAfter(held, move);
      return here;
    });
  }
  const heldFor = i => helds[i] ?? heldNow();

  /** What the move at `i` is: the structured description, with its position and the hold it is drawn in. */
  function describe(i = state.index) {
    const raw = state.moves[i];
    if (raw == null) return null;
    const total = state.moves.length;
    if (!isMove(raw)) return { index: i, total, notation: String(raw), display: String(raw), kind: 'unknown', text: `Move ${i + 1} of ${total}: ${raw}.`, sentence: `Move ${i + 1} of ${total}: ${raw}.` };
    const held = heldFor(i);
    const base = describeMove(raw, held);
    const tricks = fingertrick(raw);
    const status = state.statuses[i];
    return {
      ...base, index: i, total, held, status: status ?? null, fingertrick: tricks?.text ?? null,
      sentence: `Move ${i + 1} of ${total}: ${base.display}. ${status ? `${STATUS_WORD[status]} ` : ''}${base.text}${tricks && fingersOn() ? ` Fingers: ${tricks.text}.` : ''}`,
    };
  }

  function buildChip(move, index) {
    const chip = el('i');
    chip.setAttribute('role', 'listitem');
    chip.dataset.index = String(index);
    if (isMove(move)) chip.append(renderGlyph(move, { variant: 'chip' }));
    else chip.append(el('span', 'mg-noglyph', '?'));
    const label = el('b', 'mg-label', isMove(move) ? displayMove(move) : String(move));
    const caption = el('b', 'mg-caption', isMove(move) ? describeMove(move, DEFAULT_HELD).caption : '');
    const cross = el('b', 'mg-cross', '×');
    cross.setAttribute('aria-hidden', 'true');
    chip.append(label, caption, cross);
    return chip;
  }

  function syncChips() {
    const list = state.moves.map(m => (isMove(m) ? normalizeMove(m) : String(m)));
    const nextKeys = list.map((m, i) => `${i}:${m}`);
    if (nextKeys.length !== keys.length || nextKeys.some((k, i) => k !== keys[i])) {
      const wanted = nextKeys.map((key, i) => {
        let chip = chips.get(key);
        if (!chip) { chip = buildChip(list[i], i); chip.dataset.key = key; chips.set(key, chip); }
        chips.delete(key); chips.set(key, chip);   // keep map order = document order
        return chip;
      });
      for (const [key, chip] of [...chips]) if (!nextKeys.includes(key)) { chip.remove(); chips.delete(key); }
      let cursor = strip.firstElementChild;
      for (const chip of wanted) {
        if (chip === cursor) cursor = cursor.nextElementSibling; else strip.insertBefore(chip, cursor);
      }
      keys = nextKeys;
      glyphOf = new Map();
    }
  }

  function syncState() {
    const groups = groupMoves(state.moves.filter(isMove), state.grouping);
    // groupMoves works on the valid moves only; with an unparseable token keep grouping off
    const valid = state.moves.every(isMove);
    const at = new Map();
    if (valid) for (const [start, end, label] of groups) for (let i = start; i <= end; i++) at.set(i, { start: i === start, end: i === end, label });
    const chipList = [...strip.children];
    chipList.forEach((chip, i) => {
      const status = state.statuses[i];
      const grouped = at.get(i);
      const cls = [
        i < state.index ? 'done' : i === state.index ? 'current' : '',
        STATUS_CLASS[status] ?? '',
        grouped ? `mg-in${grouped.start ? ' mg-gs' : ''}${grouped.end ? ' mg-ge' : ''}` : '',
        isMove(state.moves[i]) && parseKind(state.moves[i]) === 'rot' ? 'mg-rot' : '',
      ].filter(Boolean).join(' ');
      if (chip.className !== cls) chip.className = cls;
      setAttr(chip, 'aria-current', i === state.index ? 'step' : null);
      setAttr(chip, 'data-group', grouped?.start && grouped.label ? grouped.label : null);
    });
    const finished = state.index >= state.moves.length;
    toggleClass(host, 'mg-finished', finished);
    toggleClass(host, 'mg-fingers-on', fingersOn());
  }

  const parseKind = move => describeMove(move, DEFAULT_HELD).kind;

  function syncLabels() {
    [...strip.children].forEach((chip, i) => {
      const d = describe(i);
      if (d) setAttr(chip, 'aria-label', d.sentence);
    });
  }

  function syncStage() {
    // Arrows / net: the static picture of the current move, and its words.
    const d = describe();
    // The chip strip stands alone unless asked for more; with a live cube but reduced
    // motion the ghost does not loop, so the static arrows take its place.
    const wants = state.variant === 'net' ? 'net' : state.variant === 'arrows' || (reduced() && state.cube3d) ? 'arrows' : null;
    const show = Boolean(d) && d.kind !== 'unknown' && Boolean(wants);
    if (stage.hidden === show) stage.hidden = !show;
    if (!show) return;
    const key = `${wants}:${d.notation}:${d.held.bottom}${d.held.front}:${fingersOn()}`;
    let art = glyphOf.get(key);
    if (!art) {
      art = wants === 'net' ? renderNet(d.notation) : renderGlyph(d.notation, { variant: 'arrows', held: d.held, fingers: fingersOn() });
      glyphOf.set(key, art);
    }
    if (stageArt.firstChild !== art) stageArt.replaceChildren(art);
    setText(stageText, d.text);
    stage.dataset.kind = d.kind;
    stage.dataset.move = d.notation;
  }

  function syncGhost() {
    const cube = state.cube3d;
    const d = state.index >= 0 && state.index < state.moves.length && cube?.showGhost && readGuidePrefs().ghost !== false ? describe() : null;
    if (!d || d.kind === 'unknown') {
      if (ghostKey) { ghostCube?.clearGhost?.(ghostId); ghostKey = null; ghostCube = null; }
      return;
    }
    const key = `${d.notation}|${d.held.bottom}${d.held.front}|${reduced()}`;
    if (key === ghostKey && cube === ghostCube) return;
    if (ghostCube && ghostCube !== cube) ghostCube.clearGhost?.(ghostId);
    ghostKey = key;
    ghostCube = cube;
    ghostId = cube.showGhost(d.notation, { loop: !reduced(), held: d.held });
  }

  function scrollToCurrent() {
    const chip = strip.children[Math.min(state.index, strip.children.length - 1)];
    if (!chip || strip.scrollWidth <= strip.clientWidth) return;
    const target = chip.offsetLeft - Math.max(0, (strip.clientWidth - chip.offsetWidth) / 2);
    const left = Math.max(0, target);
    if (Math.abs(strip.scrollLeft - left) > 2) strip.scrollTo({ left, behavior: reduced() ? 'auto' : 'smooth' });
  }

  function render() {
    computeHelds();
    syncChips();
    syncState();
    syncLabels();
    syncStage();
    syncGhost();
    scrollToCurrent();
  }

  strip.addEventListener('click', event => {
    const chip = event.target.closest?.('i');
    if (chip && strip.contains(chip) && state.onSelect) state.onSelect(Number(chip.dataset.index));
  });
  host.addEventListener('keydown', event => {
    if (!state.onStep || event.target.closest?.('input, textarea, select')) return;
    if (event.key === 'ArrowLeft') { state.onStep(-1); event.preventDefault(); }
    else if (event.key === 'ArrowRight') { state.onStep(1); event.preventDefault(); }
  });

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
    /** The hold after the whole sequence (rotations change it). */
    heldAtEnd: () => (state.frame === 'start' ? state.moves.filter(isMove).reduce((held, m) => heldAfter(held, m), heldNow()) : heldNow()),
    destroy() {
      destroyed = true;
      ghostCube?.clearGhost?.(ghostId);
      ghostKey = null;
      ghostCube = null;
      chips.clear();
      host.replaceChildren();
      host.classList.remove('mg-guide', 'mg-finished', 'mg-fingers-on');
    },
  };
}
