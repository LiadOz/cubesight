import { applyMoves, createSolvedState, parseScramble, toRenderData } from '../../cross-cube.js';
import { resolveSlotPieces } from './slots.js';
export { resolveSlotPieces } from './slots.js';
import { readStickerPalette, themedRender } from '../../brain/cube-theme.js';
import { createCube3D } from '../../cube-3d.js';
import { caseDisplayState, normalizeCaseColorSetting } from './orientation.js';
import './cube.css';

const SIZES = { XS: 72, S: 128, M: 196, L: 300, XL: 460 };
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const caseStateSeed = state => JSON.stringify(state?.cubies?.map(cubie => [cubie.id, cubie.position, cubie.stickers]) || []);

/** Stable wrapper over the site's single WebGL cube. Model states use cross-cube.js states. */
export class Cube {
  constructor(host, { mode = 'case', state = createSolvedState(), size = 'L', label = '3D cube', caseColorSetting = 'yellow top', caseSeed = '', cubeOptions = {} } = {}) {
    if (!host) throw new Error('Cube needs a host element.');
    this.host = host;
    this.mode = mode;
    this.state = state;
    this.size = size;
    this.caseColorSetting = normalizeCaseColorSetting(caseColorSetting);
    this.caseSeed = caseSeed || caseStateSeed(state);
    this.explicitCaseSeed = Boolean(caseSeed);
    this.destroyed = false;
    this.lastHighlight = null;
    this.playGeneration = 0;
    this.element = document.createElement('div');
    this.element.className = `shared-cube shared-cube--${size.toLowerCase()}`;
    this.element.style.setProperty('--cube-size', `${SIZES[size] || SIZES.L}px`);
    this.element.dataset.mode = mode;
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', label);
    host.append(this.element);
    this.cube = createCube3D(this.element, { mode: 'scout', ...cubeOptions });
    this.paint();
    this.retheme = () => this.paint();
    document.addEventListener('cubesight-theme', this.retheme);
    this.recenter = () => { if (this.element.isConnected && !this.element.closest('[hidden]')) this.cube.recenterGyro?.(); };
    document.addEventListener('cubesight-recenter', this.recenter);
    const brain = host.closest('.brain');
    this.observer = brain ? new MutationObserver(this.retheme) : null;
    this.observer?.observe(brain, { attributes: true, attributeFilter: ['data-brain-style'] });
  }

  paint(highlight = this.lastHighlight) {
    if (this.destroyed || !this.state) return;
    this.lastHighlight = highlight;
    const data = this.renderData(this.state, highlight);
    this.displayState = this.mode === 'case' ? caseDisplayState(this.state, this.caseColorSetting, this.caseSeed).state : this.state;
    this.cube.update(themedRender(data, readStickerPalette(this.element)));
  }

  renderData(state, highlight = this.lastHighlight) {
    const ids = Array.isArray(highlight?.pieces) ? highlight.pieces : [];
    const display = this.mode === 'case' ? caseDisplayState(state, this.caseColorSetting, this.caseSeed).state : state;
    const data = toRenderData(display, ids);
    data.mode = 'scout';
    data.dimOthers = Boolean(highlight?.dimOthers);
    data.highlightedPieces = ids;
    return data;
  }

  setMode(mode) {
    this.mode = mode;
    this.element.dataset.mode = mode;
    this.cube.setMode('scout');
    this.paint();
    return this;
  }

  setState(state) {
    if (!state?.cubies) throw new TypeError('Cube state must contain cubies.');
    this.stop();
    if (this.mode === 'case' && !this.explicitCaseSeed) this.caseSeed = caseStateSeed(state);
    this.state = state;
    this.paint();
    return this;
  }

  setCaseOrientation(setting, { seed = this.caseSeed } = {}) {
    this.caseColorSetting = normalizeCaseColorSetting(setting);
    this.caseSeed = seed;
    this.paint();
    return { setting: this.caseColorSetting, state: this.displayState };
  }

  setMoves(moves, { startState = createSolvedState() } = {}) {
    this.stop();
    const tokens = Array.isArray(moves) ? moves : parseScramble(moves, { allowWide: true });
    this.state = applyMoves(startState, tokens);
    if (this.mode === 'case' && !this.explicitCaseSeed) this.caseSeed = caseStateSeed(this.state);
    this.paint();
    return this;
  }

  highlight({ pieces = [], slot = null, dimOthers = false } = {}) {
    const slotPieces = resolveSlotPieces(this.state, slot);
    this.paint({ pieces: [...new Set([...pieces, ...slotPieces])], slot, dimOthers });
    return this;
  }

  mount(host) { if (!host) throw new Error('Cube mount needs a host element.'); host.append(this.element); this.host = host; return this; }

  update(data) { if (!this.destroyed) this.cube.update(themedRender(data, readStickerPalette(this.element))); return this; }
  animateMove(move, state, duration) {
    if (state?.cubies) this.state = state;
    const data = state?.cubies ? this.renderData(state) : state;
    return this.cube.animateMove(move, data ? themedRender(data, readStickerPalette(this.element)) : data, duration);
  }
  queueLiveMove(move, state, options) {
    if (state?.cubies) this.state = state;
    const data = state?.cubies ? this.renderData(state) : state;
    this.cube.queueLiveMove(move, data ? themedRender(data, readStickerPalette(this.element)) : data, options);
  }

  bindSession(session) {
    this.liveUnsubscribe?.();
    if (!session?.subscribe) throw new TypeError('A live cube session with subscribe() is required.');
    const initial = session.getSnapshot?.();
    let lastMoveSeq = initial?.moveEvent?.seq ?? null;
    this.mode = 'live'; this.element.dataset.mode = 'live';
    if (initial?.gyro) this.cube.setGyroOrientation(initial.gyro);
    if (initial?.state?.cubies) this.setState(initial.state);
    this.liveUnsubscribe = session.subscribe(snapshot => {
      if (snapshot.gyro) this.cube.setGyroOrientation(snapshot.gyro);
      if (snapshot.state?.cubies) {
        const event = snapshot.moveEvent;
        if (event && event.seq !== lastMoveSeq) {
          lastMoveSeq = event.seq;
          this.state = snapshot.state;
          const data = themedRender(toRenderData(this.state, this.lastHighlight?.pieces || []), readStickerPalette(this.element));
          if (event.replaces || !event.move) this.cube.update(data);
          else this.cube.queueLiveMove(event.move, data);
        } else if (!event || !snapshot.lastMove) this.setState(snapshot.state);
        else if (this.state !== snapshot.state) this.setState(snapshot.state);
      }
    });
    return () => { this.liveUnsubscribe?.(); this.liveUnsubscribe = null; };
  }

  setGyroOrientation(gyro) { this.cube?.setGyroOrientation?.(gyro); return this; }

  cue(move) { this.cube.setCue(move, { loop: !reducedMotion() }); return this; }
  clearCue() { this.cube.clearCue(); return this; }

  async play(moves, { fullTurns = true, speed = 1, startState = this.state } = {}) {
    const tokens = Array.isArray(moves) ? moves : parseScramble(moves, { allowWide: true, allowRotations: true });
    const generation = ++this.playGeneration;
    let state = startState;
    this.element.dataset.playing = 'true';
    this.cube.clearCue();
    if (!fullTurns) { this.state = applyMoves(state, tokens); this.paint(); delete this.element.dataset.playing; return this.state; }
    this.state = state;
    this.paint();
    for (const move of tokens) {
      if (this.destroyed || generation !== this.playGeneration) break;
      const nextState = applyMoves(state, [move]);
      const data = themedRender(this.renderData(nextState), readStickerPalette(this.element));
      await this.cube.animateMove(move, data, (reducedMotion() ? 0 : 260 / Math.max(.1, Number(speed) || 1)));
      if (generation !== this.playGeneration || this.destroyed) break;
      state = nextState; this.state = state;
    }
    if (generation === this.playGeneration) this.paint();
    delete this.element.dataset.playing;
    return this.state;
  }

  seek(position, moves, { startState = createSolvedState() } = {}) {
    this.stop();
    const tokens = Array.isArray(moves) ? moves : parseScramble(moves, { allowWide: true, allowRotations: true });
    this.state = applyMoves(startState, tokens.slice(0, Math.max(0, Number(position) || 0)));
    this.paint();
    return this.state;
  }

  stop() { this.playGeneration++; if (!this.destroyed && this.cube) this.paint(); return this.state; }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.playGeneration++;
    this.liveUnsubscribe?.(); this.liveUnsubscribe = null;
    this.observer?.disconnect();
    document.removeEventListener('cubesight-theme', this.retheme);
    document.removeEventListener('cubesight-recenter', this.recenter);
    this.cube.destroy();
    this.element.remove();
  }
}

export const createCube = (host, options) => new Cube(host, options);
