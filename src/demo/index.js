import { Cube } from '../ui/cube/index.js';
import { createOrbit } from '../ui/orbit/index.js';
import { describeMove, expandToHeld } from '../moves/notation.js';
import { getCase } from '../algs/seed/cases.js';
import { createFilledSelect, createTextarea } from '../ui/shared/index.js';
import { loadSettings } from '../brain/settings.js';
import { syncPageTokens } from '../pages/tokens.js';
import { applyDemoMove, parseDemoHash, parseDemoPaste, serializeDemo, setupState } from './model.js';
import { buildDemoViewModel } from './view-model.js';
import './demo.css';

const el = (tag, text = '', className = '') => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const button = (label, action, variant = 'secondary') => {
  const node = el('button', label, `btn btn--${variant}`);
  node.type = 'button'; node.dataset.action = action;
  return node;
};
const safeParse = () => { try { return parseDemoHash(location.hash); } catch (error) { return { error: error.message, parts: [] }; } };
const speedOptions = speed => {
  const options = [.25, .5, .75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4].map(value => ({ value: String(value), label: `${value}×` }));
  if (!options.some(option => option.value === String(speed))) options.push({ value: String(speed), label: `${speed}× · link` });
  return options;
};
const partSeed = (demo, index) => `${demo.title}:${index + 1}:${demo.parts[index]?.title || `case ${index + 1}`}`;

export function createDemoPage(root) {
  if (!root) throw new Error('A demo page root is required.');
  let demo = null, partIndex = 0, moveIndex = 0, cube = null, orbit = null, orbitResizeObserver = null, speedControl = null, playing = false, inFlight = false, generation = 0, view = {}, renderedHash = '';
  let active = true;
  root.className = 'cs-host demo-root';

  const renderFormat = () => {
    stop(); dispose(); root.replaceChildren();
    const page = el('section', '', 'cs-page brain demo-page demo-format');
    stylePage(page);
    const title = el('h1', 'Make a CubeSight demo link');
    const intro = el('p', 'Write a link with a setup and alg. CubeSight opens it here and plays each turn on the cube.');
    const code = el('pre', '', 'demo-format__example');
    code.textContent = '#/demo?title=F2L%20pair&setup=R%20U%20R%27&alg=U%27%20R%20U%20R%27&highlight=pair%3AFR\n\n#/demo?title=Two%20cases&part1.title=case%201&part1.setup=R%20U&part1.alg=R%27%20U%27&part2.title=case%202&part2.setup=F%20R&part2.alg=R%27%20F%27';
    const rules = el('div', '', 'demo-format__copy');
    rules.append(el('p', 'Use #/demo?title=…&setup=…&alg=… . Values use ordinary URL escaping; use a prime apostrophe (\') or prime mark (′) in move notation. Unknown parameters are ignored.'));
    rules.append(el('p', 'Add step1.moves=R%20U and step1.note=extract for a move group; add step2.moves and step2.note for another group. Lesson parts use part1.title/setup/alg, part2.title/setup/alg, and so on; their step fields start part1.step1.moves. Optional fields: highlight=UFR,FR or pair:FR, case=f2l/8, speed=1.5, color=white%20top.'));
    rules.append(el('p', 'The CubeSight format plays locally. A pasted alg.cubing.net or Twizzle link is converted on this device without fetching it.')); 
    const paste = pasteForm();
    page.append(title, intro, code, rules, paste.disclosure);
    root.append(page);
  };

  const pasteForm = () => {
    const disclosure = el('details', '', 'demo-paste-disclosure');
    const summary = el('summary', 'paste a demo');
    const form = el('form', '', 'demo-paste');
    const input = createTextarea(form, { label: 'Paste a demo link or setup + alg', rows: 3, placeholder: 'Paste a link, or write setup: R U\nalg: R′ U′' }).textarea;
    input.id = 'demo-paste-input'; input.name = 'demo';
    const submit = button('open demo', 'open-demo', 'primary');
    submit.type = 'submit';
    const status = el('p', '', 'demo-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    form.append(submit, status);
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const parsed = parseDemoPaste(input.value);
        location.hash = serializeDemo(parsed);
      } catch (error) { status.textContent = error.message; }
    });
    disclosure.append(summary, form);
    return { disclosure, form, input, status };
  };

  function dispose() { orbitResizeObserver?.disconnect(); orbitResizeObserver = null; cube?.destroy(); cube = null; orbit?.destroy(); orbit = null; speedControl?.destroy(); speedControl = null; }
  function stop() {
    generation++; playing = false; inFlight = false; cube?.stop();
    const part = demo?.parts?.[partIndex];
    if (cube && part) {
      const committed = part.alg.slice(0, moveIndex).reduce((state, move) => applyDemoMove(state, move), setupState(part.setup));
      cube.setState(committed);
    }
  }

  function renderDemo(parsed) {
    stop(); dispose(); demo = parsed; partIndex = 0; moveIndex = 0; root.replaceChildren();
    if (parsed.error) {
      const page = el('section', '', 'cs-page brain demo-page');
      stylePage(page);
      const h = el('h1', 'This demo link needs a check');
      const message = el('p', parsed.error, 'demo-error');
      const paste = pasteForm(); page.append(h, message, paste.disclosure); root.append(page); return;
    }
    const page = el('section', '', 'cs-page brain demo-page');
    stylePage(page);
    const header = el('header', '', 'demo-heading');
    const eyebrow = el('p', 'demo'); eyebrow.className = 'demo-eyebrow';
    const heading = el('h1', demo.title || 'cube demo');
    const partTitle = el('p', '', 'demo-part-title');
    header.append(eyebrow, heading, partTitle);
    const lessonNav = el('div', '', 'demo-lesson-nav');
    const previousPart = button('previous case', 'previous-part');
    const partCount = el('span', '', 'demo-part-count');
    const nextPart = button('next case', 'next-part');
    lessonNav.append(previousPart, partCount, nextPart);
    const stage = el('section', '', 'demo-stage'); stage.setAttribute('aria-label', 'Demo playback');
    const visualStage = el('div', '', 'demo-visual-stage');
    visualStage.setAttribute('aria-label', 'Cube and move sequence');
    const orbitHost = el('div', '', 'demo-orbit'); orbitHost.setAttribute('aria-label', 'Move sequence and progress');
    const cubeHost = el('div', '', 'demo-cube');
    const actions = el('div', '', 'demo-actions');
    const restart = button('restart', 'restart');
    const prev = button('previous move', 'previous-move');
    const playButton = button('play', 'play', 'primary');
    const next = button('next move', 'next-move');
    const speedHost = el('div', '', 'demo-speed');
    actions.append(restart, prev, playButton, next, speedHost);
    visualStage.append(orbitHost, cubeHost);
    stage.append(visualStage, actions);
    const coach = el('section', '', 'demo-coach'); coach.setAttribute('aria-live', 'polite');
    const moveDescription = el('p', '', 'demo-move-description');
    const authorNote = el('p', '', 'demo-author-note');
    coach.append(moveDescription, authorNote);
    const paste = pasteForm();
    const copy = button('copy demo link', 'copy-link');
    const copyStatus = el('span', '', 'demo-copy-status'); copyStatus.setAttribute('role', 'status');
    const links = el('div', '', 'demo-tools');
    const caseLink = el('a', 'open case page', 'demo-case-link');
    links.append(copy, copyStatus, caseLink);
    page.append(header, lessonNav, stage, coach, links, paste.disclosure);
    root.append(page);
    view = { heading, partTitle, previousPart, partCount, nextPart, restart, prev, playButton, next, moveDescription, authorNote, caseLink };
    const part = demo.parts[0];
    const setup = setupState(part.setup);
    cube = new Cube(cubeHost, { state: setup, mode: 'case', caseColorSetting: part.colorSetting, caseSeed: partSeed(demo, 0), size: 'L', label: `${demo.title} demonstration` });
    const highlight = part.highlight.length
      ? { pieces: part.highlight.filter(piece => !piece.startsWith('pair:')), slot: part.highlight.find(piece => piece.startsWith('pair:')) || null, dimOthers: true }
      : defaultHighlight(part.caseId, setup);
    cube.highlight(highlight);
    const orbitClearance = () => {
      const orbitWidth = orbitHost.getBoundingClientRect().width;
      const cubeWidth = cubeHost.getBoundingClientRect().width;
      return orbitWidth > 0 ? Math.ceil((cubeWidth / orbitWidth) * 280 + (18 / orbitWidth) * 560) : 220;
    };
    orbit = createOrbit(orbitHost, { size: 'L', shape: 'open', gap: 72, centerClearance: orbitClearance(), label: `${demo.title} move sequence`, sections: [], segments: [] });
    orbitResizeObserver = new ResizeObserver(() => orbit?.update({ centerClearance: orbitClearance() }, { animate: false }));
    orbitResizeObserver.observe(orbitHost); orbitResizeObserver.observe(cubeHost);
    speedControl = createFilledSelect(speedHost, { label: 'speed', value: String(part.speed), options: speedOptions(part.speed), onChange: value => { demo.parts[partIndex].speed = Number(value); if (playing) stop(); renderState(); } });
    previousPart.disabled = true;
    nextPart.disabled = parsed.parts.length < 2;
    previousPart.addEventListener('click', () => switchPart(-1));
    nextPart.addEventListener('click', () => switchPart(1));
    restart.addEventListener('click', () => seek(0));
    prev.addEventListener('click', () => seek(Math.max(0, moveIndex - 1)));
    next.addEventListener('click', () => { if (moveIndex < partMoves().length) void advance(); });
    playButton.addEventListener('click', () => { if (playing) stop(); else void play(); renderState(); });
    copy.addEventListener('click', async () => {
      const link = `${location.origin}${location.pathname}${location.search}${serializeDemo(demo)}`;
      try { await navigator.clipboard.writeText(link); copyStatus.textContent = 'link copied'; }
      catch { copyStatus.textContent = link; }
    });
    renderPart();
  }

  function defaultHighlight(caseId, state) {
    const row = caseId ? getCase(caseId) : null;
    if (row?.set === 'f2l') return { slot: `pair:${row.targetPair}`, dimOthers: true };
    if (row && ['oll', 'pll'].includes(row.set)) return { pieces: state.cubies.filter(cubie => cubie.id.length > 1 && Object.values(cubie.stickers).includes('white')).map(cubie => cubie.id), dimOthers: true };
    const cross = state.cubies.filter(cubie => cubie.id.length === 2 && Object.values(cubie.stickers).includes('yellow')).map(cubie => cubie.id);
    return { pieces: cross, dimOthers: true };
  }
  function partMoves() { return demo.parts[partIndex].alg; }
  function describePosition() {
    const { moveDescription, authorNote } = view;
    const part = demo.parts[partIndex];
    let stepStart = 0;
    let currentStep = part.steps.find(step => {
      const end = stepStart + step.moves.length;
      const current = moveIndex >= stepStart && moveIndex < end;
      stepStart = end;
      return current;
    });
    if (!currentStep && moveIndex >= part.alg.length) currentStep = part.steps.at(-1);
    if (moveIndex >= part.alg.length) moveDescription.textContent = 'Demo complete. The cube shows the final state.';
    else {
      const held = expandToHeld(part.alg)[moveIndex].held;
      const { text } = describeMove(part.alg[moveIndex], held);
      moveDescription.textContent = `Move ${moveIndex + 1} · ${text}`;
    }
    authorNote.textContent = currentStep?.note || '';
  }
  function renderState() {
    const { previousPart, nextPart, partCount, playButton, prev, next, restart } = view;
    const part = demo.parts[partIndex];
    previousPart.disabled = partIndex === 0;
    nextPart.disabled = partIndex === demo.parts.length - 1;
    partCount.textContent = demo.parts.length > 1 ? `case ${partIndex + 1} of ${demo.parts.length}` : '';
    playButton.textContent = playing ? 'pause' : moveIndex >= part.alg.length ? 'play again' : 'play';
    playButton.disabled = inFlight && !playing;
    prev.disabled = moveIndex === 0; next.disabled = moveIndex >= part.alg.length || playing || inFlight;
    restart.disabled = moveIndex === 0 && !playing;
    describePosition();
    const heldMoves = expandToHeld(part.alg);
    orbit?.update({ sections: part.steps.map(step => ({ start: part.steps.slice(0, part.steps.indexOf(step)).reduce((n, item) => n + item.moves.length, 0) })), segments: part.alg.map((move, index) => ({ key: String(index), label: move, state: index === moveIndex ? 'current' : index < moveIndex ? 'done' : 'future', fill: index < moveIndex ? 1 : index === moveIndex ? .35 : 0, ariaLabel: `${move} · ${describeMove(move, heldMoves[index].held).text}` })) }, { animate: false });
  }
  function seek(index) {
    stop();
    const part = demo.parts[partIndex]; moveIndex = Math.max(0, Math.min(part.alg.length, index));
    const state = part.alg.slice(0, moveIndex).reduce((current, move) => applyDemoMove(current, move), setupState(part.setup));
    cube?.setState(state); renderState();
  }
  async function advance() {
    if (inFlight) return;
    const currentGeneration = generation;
    const part = demo.parts[partIndex];
    if (moveIndex >= part.alg.length) return;
    inFlight = true;
    renderState();
    const move = part.alg[moveIndex];
    const nextState = applyDemoMove(cube.state, move);
    try { await cube.animateMove(move, nextState, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260 / Math.max(.25, Number(speedControl.value()) || 1)); }
    catch (error) { if (currentGeneration === generation) { inFlight = false; playing = false; renderState(); } throw error; }
    if (currentGeneration !== generation) return;
    inFlight = false;
    moveIndex++; renderState();
  }
  async function play() {
    if (moveIndex >= partMoves().length) seek(0);
    playing = true; const currentGeneration = ++generation; renderState();
    while (playing && currentGeneration === generation && moveIndex < partMoves().length) await advance();
    if (currentGeneration === generation) { playing = false; renderState(); }
  }
  function switchPart(delta) {
    stop(); partIndex = Math.max(0, Math.min(demo.parts.length - 1, partIndex + delta)); moveIndex = 0;
    const part = demo.parts[partIndex];
    cube?.setState(setupState(part.setup));
    cube?.setCaseOrientation(part.colorSetting, { seed: partSeed(demo, partIndex) });
    cube?.highlight(part.highlight.length ? { pieces: part.highlight.filter(piece => !piece.startsWith('pair:')), slot: part.highlight.find(piece => piece.startsWith('pair:')) || null, dimOthers: true } : defaultHighlight(part.caseId, setupState(part.setup)));
    speedControl.setOptions(speedOptions(part.speed), String(part.speed)); renderPart();
  }
  function renderPart() {
    const part = demo.parts[partIndex];
    view.partTitle.textContent = part.title || (demo.parts.length > 1 ? `case ${partIndex + 1}` : '');
    view.caseLink.hidden = !part.caseId;
    if (part.caseId) view.caseLink.href = `#/algs/${part.caseId}`;
    renderState();
  }

  function stylePage(page) { page.dataset.brainStyle = loadSettings(globalThis.localStorage).style; syncPageTokens(page); }
  const onRoute = () => { if (!active || renderedHash === location.hash) return; renderedHash = location.hash; if (location.hash.startsWith('#/demo/format')) renderFormat(); else renderDemo(safeParse()); };
  window.addEventListener('hashchange', onRoute);
  onRoute();
  return {
    element: root,
    getViewModel() { return buildDemoViewModel({ hash: location.hash, partIndex, moveIndex, playing }); },
    setActive(value) { active = Boolean(value); if (!active) stop(); else onRoute(); },
    destroy() { active = false; stop(); dispose(); window.removeEventListener('hashchange', onRoute); root.replaceChildren(); },
  };
}

export { parseDemoHash, parseDemoPaste, serializeDemo } from './model.js';
