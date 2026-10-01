import { applyMoves, createSolvedState, toRenderData } from '../cross-cube.js';
import { physicalModelTokens, tokenizeReconstruction } from '../review/import-parser.js';
import { createMoveGuide } from './move-guide.js';
import { createRingTimeline } from '../brain/styles/orbit/timeline-ring.js';
import { createLinearTimeline } from '../brain/styles/mono/timeline-linear.js';
import '../brain/css/orbit.css';
import '../brain/css/mono.css';
import './sequence-player.css';

let activePlayer = null;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Indexed playback on a page's single existing cube; the page owns the cube. */
export function createSequencePlayer(host, options = {}) {
  const { cube3d, label = 'Move playback', onChange = () => {} } = options;
  let states = [], moves = [], index = 0, playing = false, active = true;
  let destroyed = false, generation = 0, speed = 1, timeline = null, style = null;
  const api = { load, play, pause, step, reset, setActive, setSpeed, destroy, getSnapshot };
  host.classList.add('sequence-player');
  host.innerHTML = '<div class="sequence-progress" data-sequence-progress></div><div data-sequence-guide></div><div class="sequence-controls"><button type="button" data-sequence="reset">reset <kbd>r</kbd></button><button type="button" data-sequence="back" aria-label="Previous move">←</button><button type="button" data-sequence="play">play <kbd>space</kbd></button><button type="button" data-sequence="next" aria-label="Next move">→</button><label>speed<select data-sequence-speed aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label><span data-sequence-position role="status"></span></div>';
  host.setAttribute('aria-label', label);
  const guide = createMoveGuide(host.querySelector('[data-sequence-guide]'), { cube3d, label });
  const progressHost = host.querySelector('[data-sequence-progress]');
  const page = host.closest('.brain');
  const observer = new MutationObserver(render);
  if (page) observer.observe(page, { attributes: true, attributeFilter: ['data-brain-style'] });
  host.addEventListener('click', onClick);
  host.addEventListener('change', onSpeed);
  host.addEventListener('keydown', onKey);
  load(options);
  return api;

  function getSnapshot() { return { index, playing, moves: [...moves], state: states[index], speed }; }
  function render() {
    if (destroyed) return;
    const nextStyle = page?.dataset.brainStyle === 'mono' ? 'mono' : 'orbit';
    if (style !== nextStyle) {
      timeline?.destroy();
      style = nextStyle;
      cube3d?.host?.classList.toggle('has-sequence-ring', style === 'orbit');
      if (style === 'orbit' && cube3d?.host) cube3d.host.append(progressHost);
      else host.prepend(progressHost);
      timeline = style === 'mono' ? createLinearTimeline(progressHost, { mode: 'sequence' }) : createRingTimeline(progressHost, { mode: 'sequence' });
    }
    const chunks = Math.min(4, moves.length);
    const segments = Array.from({ length: chunks }, (_, i) => {
      const from = Math.floor(i * moves.length / chunks), to = Math.floor((i + 1) * moves.length / chunks);
      return { key: `moves-${i}`, label: `group ${i + 1}`, short: `group ${i + 1}`, weight: (to - from) / moves.length,
        state: index >= to ? 'done' : index >= from ? 'current' : 'future', fill: Math.max(0, Math.min(1, (index - from) / (to - from))),
        tags: [], splitText: '', splitMs: null, avgMs: 0, delta: null };
    });
    timeline.update({ screen: 'solving', timeline: { planKey: moves.join(' '), visible: active && Boolean(moves.length), ghost: false, segments, groups: [], currentIndex: segments.findIndex(s => s.state === 'current') } }, null);
    guide.update({ moves, index, cube3d: active && !playing ? cube3d : null });
    host.dataset.sequenceIndex = String(index);
    host.dataset.sequencePlaying = String(playing);
    host.querySelector('[data-sequence="play"]').firstChild.textContent = playing ? 'pause ' : 'play ';
    host.querySelector('[data-sequence-position]').textContent = `${index} / ${moves.length}`;
    host.querySelector('[data-sequence="back"]').disabled = !active || index === 0;
    host.querySelector('[data-sequence="next"]').disabled = !active || index === moves.length;
    host.querySelector('[data-sequence="play"]').disabled = !active || !moves.length;
    onChange(getSnapshot());
  }
  function draw() { if (states[index]) cube3d?.update(toRenderData(states[index])); }
  function pause() {
    generation++;
    playing = false;
    if (activePlayer === api) activePlayer = null;
    draw();
    render();
  }
  function load({ startState = createSolvedState(), moves: nextMoves = [], index: initialIndex = 0 } = {}) {
    generation++; playing = false;
    if (activePlayer === api) activePlayer = null;
    cube3d?.clearCue();
    moves = Array.isArray(nextMoves) ? [...nextMoves] : String(nextMoves).split(/\s+/).filter(Boolean);
    const parsed = tokenizeReconstruction(moves.join(' '), { allowEmpty: true }).tokens;
    // Use the reconstruction parser so rotations, wide and slice turns retain
    // exactly the same physical meaning as review and algorithm verification.
    moves = parsed.map(token => token.notation ?? `${token.face}${token.kind === 'wide' ? 'w' : ''}${token.amount === 2 ? '2' : token.amount === 3 ? "'" : ''}`);
    states = [startState];
    for (const token of parsed) states.push(applyMoves(states.at(-1), physicalModelTokens([token])));
    index = Math.max(0, Math.min(moves.length, Math.trunc(initialIndex) || 0));
    draw(); render();
  }
  async function play() {
    if (!active || destroyed || !moves.length) return;
    if (playing) { pause(); return; }
    if (activePlayer && activePlayer !== api) activePlayer.pause();
    if (index === moves.length) { index = 0; draw(); }
    if (reduced()) { index = moves.length; draw(); render(); return; }
    activePlayer = api;
    playing = true;
    const token = ++generation;
    render();
    while (index < moves.length && token === generation && active && !destroyed) {
      await cube3d?.animateMove(moves[index], toRenderData(states[index + 1]), 320 / speed);
      if (token !== generation || !active || destroyed) return;
      index++;
      render();
    }
    if (token === generation) { playing = false; if (activePlayer === api) activePlayer = null; render(); }
  }
  function step(direction = 1) { pause(); index = Math.max(0, Math.min(moves.length, index + Math.sign(direction))); draw(); render(); }
  function reset() { pause(); index = 0; draw(); render(); }
  function setActive(value) { active = Boolean(value); pause(); }
  function onClick(event) {
    const action = event.target.closest('[data-sequence]')?.dataset.sequence;
    if (!action) return;
    event.stopPropagation();
    if (action === 'play') void play();
    else if (action === 'next') step(1);
    else if (action === 'back') step(-1);
    else reset();
  }
  function setSpeed(value) { speed = Math.max(.25, Math.min(4, Number(value) || 1)); }
  function onSpeed(event) { if (event.target.matches('[data-sequence-speed]')) setSpeed(event.target.value); }
  function onKey(event) {
    if (event.target.matches('select,input,textarea')) return;
    if (![' ', 'ArrowLeft', 'ArrowRight', 'r', 'Escape'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === ' ') void play();
    else if (event.key === 'ArrowLeft') step(-1);
    else if (event.key === 'ArrowRight') step(1);
    else if (event.key === 'r') reset();
    else pause();
  }
  function destroy() {
    if (destroyed) return;
    pause(); destroyed = true;
    observer.disconnect(); guide.destroy(); timeline?.destroy();
    cube3d?.host?.classList.remove('has-sequence-ring'); progressHost.remove();
    host.removeEventListener('click', onClick); host.removeEventListener('change', onSpeed); host.removeEventListener('keydown', onKey);
    host.replaceChildren(); host.classList.remove('sequence-player');
  }
}
