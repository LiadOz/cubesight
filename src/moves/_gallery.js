// Development only: the move guide on the five example sequences of
// docs/design/brain-v2/moves (same examples, same frames), for screenshots and
// the Playwright visual test.
//   /src/moves/_gallery.html?style=orbit|mono&theme=dark|light&variant=chips|arrows|net&fingers=1&ghost=1
import '@fontsource-variable/manrope';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import '../brain/css/tokens-orbit.css';
import '../brain/css/tokens-mono.css';
import { createMoveGuide } from './move-guide.js';
import { writeGuidePref } from './prefs.js';
import { createCube3D } from '../cube-3d.js';
import { createSolvedState, toRenderData } from '../cross-cube.js';

const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
const style = params.get('style') === 'mono' ? 'mono' : 'orbit';
const variant = ['arrows', 'net'].includes(params.get('variant')) ? params.get('variant') : 'chips';
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;
writeGuidePref('fingertricks', params.get('fingers') !== '0');

export const EXAMPLES = [
  { id: 'scramble', title: '1 · guided scramble, move 15 of 20', moves: "U2 R2 F' D2 L B2 U' F R D' B' L' U F' R' D2 R U' F2 L'".split(' '), index: 14, held: { bottom: 'D', front: 'F' }, grouping: 'none' },
  { id: 'tperm', title: '2 · T-perm, yellow on top', moves: "R U R' U' R' F R2 U' R' U' R U R' F'".split(' '), index: 6, held: { bottom: 'U', front: 'F' }, grouping: 'auto' },
  { id: 'rotation', title: "3 · rotation, then a trigger", moves: "y' R U R'".split(' '), index: 0, held: { bottom: 'D', front: 'F' }, frame: 'start', grouping: 'auto' },
  { id: 'wide', title: '4 · wide move', moves: "r U R' U' r' F R F'".split(' '), index: 0, held: { bottom: 'D', front: 'F' }, grouping: 'auto' },
  { id: 'slice', title: "5 · slice", moves: "M' U M".split(' '), index: 0, held: { bottom: 'D', front: 'F' }, grouping: 'none' },
];

const app = document.querySelector('#app');
const brain = document.createElement('div');
brain.className = 'brain';
brain.dataset.brainStyle = style;
brain.style.cssText = 'width:min(1100px,100% - 48px);margin:0 auto;padding:24px 0 40px;background:var(--b-bg);color:var(--b-ink);font-family:var(--b-font-sans);font-size:14px;box-sizing:border-box;';
app.append(brain);
document.body.style.background = 'var(--b-bg)';
const guides = {};
for (const ex of EXAMPLES) {
  const section = document.createElement('section');
  section.dataset.example = ex.id;
  section.style.cssText = 'padding:14px 0;border-bottom:1px solid var(--b-hairline)';
  const title = document.createElement('p');
  title.textContent = ex.title;
  title.style.cssText = 'margin:0 0 8px;color:var(--b-accent-text);font:13px var(--b-font-mono)';
  const host = document.createElement('div');
  section.append(title, host);
  brain.append(section);
  guides[ex.id] = createMoveGuide(host, { moves: ex.moves, index: ex.index, held: ex.held, frame: ex.frame ?? 'held', grouping: ex.grouping, variant, label: ex.title });
}
window.gallery = { guides, EXAMPLES };

if (params.get('ghost') === '1') {
  const mount = document.createElement('div');
  mount.style.cssText = 'position:fixed;right:24px;top:24px;width:320px;height:320px';
  document.body.append(mount);
  const cube = createCube3D(mount, { mode: 'scout' });
  cube.update(toRenderData(createSolvedState()));
  window.gallery.cube = cube;
  guides.scramble.update({ cube3d: cube });
}
document.documentElement.dataset.galleryReady = 'true';
