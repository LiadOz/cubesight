// Development only: mount the real shell with a style and a sample view-model,
// for building and screenshotting without a cube or controller.
//   /src/brain/_gallery.html?style=orbit|mono&theme=dark|light&fx=<fixture>
// Fixtures come from the style's own dev fixtures, falling back to the other
// set (both conform to types.js). ?fixtures=mono|orbit forces one set.
import '@fontsource-variable/manrope';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import { createShell } from './shell.js';
import monoStyle from './styles/mono/index.js';
import orbitStyle from './styles/orbit/index.js';
import { FIXTURES as MONO, FRAMES as MONO_FRAMES } from './styles/mono/_dev-fixtures.js';
import { fixture as orbitFixture } from './styles/orbit/_dev-fixtures.js';
import { createCube3D } from '../cube-3d.js';
import { createSolvedState, stateFromScramble, toRenderData } from '../cross-cube.js';

const ORBIT_FIXTURES = ['idle', 'inspection', 'overtime', 'solving', 'skip', 'results'];
const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
const styleId = params.get('style') === 'mono' ? 'mono' : 'orbit';
const fx = params.get('fx') || 'idle';
const source = params.get('fixtures') || (styleId === 'orbit' && ORBIT_FIXTURES.includes(fx) ? 'orbit' : 'mono');
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;

function load() {
  if (source === 'orbit') return orbitFixture(fx);
  return { vm: (MONO[fx] ?? MONO.idle)(), frame: MONO_FRAMES[fx] };
}

const actions = [];
const shell = createShell(document.querySelector('#app'), { dispatch: action => { actions.push(action); console.log('[gallery] action', action); } });
shell.setStyle(styleId === 'mono' ? monoStyle : orbitStyle);
const { vm: raw, frame } = load();
const vm = { ...raw, theme, style: styleId };
shell.update(vm, null);
if (frame) shell.frame(frame);
document.body.style.background = getComputedStyle(shell.root).getPropertyValue('--b-bg');

const CUBE_STATE = {
  idle: () => createSolvedState(),
  disconnected: () => createSolvedState(),
  skip: () => stateFromScramble("R U R' U R U2 R'"),
};
try {
  const cube = createCube3D(shell.slots.cube, { mode: 'scout' });
  cube.update(toRenderData((CUBE_STATE[fx] ?? (() => stateFromScramble("D2 F2 U' B2 R2 U2 F2 U' L2 D' B'")))()));
} catch (error) { console.warn('[gallery] no WebGL', error); }

window.gallery = { shell, vm, actions, styles: { mono: monoStyle, orbit: orbitStyle } };
document.documentElement.dataset.galleryReady = 'true';
