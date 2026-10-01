// Development only: mount the real shell with a style and a fixture from
// fixtures.js (the view-model samples WP1's view-model tests use), for building
// and screenshotting without a cube or controller.
//   /src/brain/_gallery.html?style=orbit|mono&theme=dark|light&fx=<fixture name>
// The in-app gallery (/?brainGallery=1#/brain) renders the same fixtures with
// pickers and a running clock; this page is frozen for screenshots.
import '@fontsource-variable/manrope';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import { createShell } from './shell.js';
import monoStyle from './styles/mono/index.js';
import orbitStyle from './styles/orbit/index.js';
import { brainFixtures, FIXTURE_NAMES } from './fixtures.js';
import { frameState } from './view-model.js';
import { createCube3D } from '../cube-3d.js';
import { createSolvedState, stateFromScramble, toRenderData } from '../cross-cube.js';

const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
const styleId = params.get('style') === 'mono' ? 'mono' : 'orbit';
const fx = FIXTURE_NAMES.includes(params.get('fx')) ? params.get('fx') : 'idle';
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;

const actions = [];
let vm = brainFixtures({ style: styleId, theme })[fx];
const shell = createShell(document.querySelector('#app'), { dispatch: action => {
  actions.push(action);
  console.log('[gallery] action', action);
  if (action.type === 'toggleSettings') {
    const next = { ...vm, settings: { ...vm.settings, open: !vm.settings.open } };
    shell.update(next, vm);
    vm = next;
    if (window.gallery) window.gallery.vm = vm;
  }
} });
shell.setStyle(styleId === 'mono' ? monoStyle : orbitStyle);
shell.update(vm, null);
// The fixture's frozen instant: the clock or the inspection at its own elapsed time.
const at = vm.clock.startedAt != null ? vm.clock.startedAt + (vm.clock.ms ?? 0)
  : vm.inspection?.startedAt != null ? vm.inspection.startedAt + vm.inspection.elapsedMs : null;
if (at != null) shell.frame(frameState(vm, at));
document.body.style.background = getComputedStyle(shell.root).getPropertyValue('--b-bg');

const SOLVED = new Set(['disconnected', 'connecting', 'idle', 'settings']);
try {
  const cube = createCube3D(shell.slots.cube, { mode: 'scout' });
  cube.update(toRenderData(SOLVED.has(fx) ? createSolvedState() : stateFromScramble("D2 F2 U' B2 R2 U2 F2 U' L2 D' B'")));
} catch (error) { console.warn('[gallery] no WebGL', error); }

window.gallery = { shell, vm, actions, styles: { mono: monoStyle, orbit: orbitStyle } };
document.documentElement.dataset.galleryReady = 'true';
