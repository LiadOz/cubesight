// Development only: mount the shell with the Mono style and a sample
// view-model, for building and screenshotting without a cube or controller.
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import { createShell } from '../../shell.js';
import monoStyle from './index.js';
import { FIXTURES, FRAMES } from './_dev-fixtures.js';
import { createCube3D } from '../../../cube-3d.js';
import { createSolvedState, stateFromScramble, toRenderData } from '../../../cross-cube.js';

const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
const fx = params.get('fx') || 'idle';
document.documentElement.dataset.theme = theme;

const actions = [];
const shell = createShell(document.querySelector('#app'), { dispatch: action => { actions.push(action); console.log('[gallery] action', action); } });
shell.setStyle(monoStyle);
const vm = { ...FIXTURES[fx](), theme };
shell.update(vm, null);
if (FRAMES[fx]) shell.frame(FRAMES[fx]);
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

window.gallery = { shell, vm, actions };
document.documentElement.dataset.galleryReady = 'true';
