// Dev harness for the Orbit style: mounts the Orbit components into a
// stand-in shell with the same slot layout the real shell provides, fed by
// _dev-fixtures.js. Open /src/brain/styles/orbit/_dev.html?state=solving&theme=dark
// States: idle, inspection, overtime, variants, solving, skip, results, charts-mono.
import '@fontsource-variable/manrope';
import '@fontsource/dm-mono/latin-300.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import { orbitStyle } from './index.js';
import { INSPECTION_VARIANTS, fixture, frameFor } from './_dev-fixtures.js';
import { createTpsLine } from '../../charts/tps-line.js';
import { createSplitBars } from '../../charts/split-bars.js';
import { createSparkline } from '../../charts/sparkline.js';

const params = new URLSearchParams(location.search);
const state = params.get('state') || 'solving';
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;

const css = document.createElement('style');
css.textContent = `
  html, body { margin: 0; min-height: 100%; }
  body { background: var(--b-bg, #141311); }
  .brain { min-height: 100vh; box-sizing: border-box; padding: 26px clamp(16px, 3.3vw, 48px) 28px; display: grid; grid-template-rows: auto auto 1fr auto; }
  .h-top { display: flex; align-items: center; gap: 40px; font: 500 15px var(--b-font-sans); color: var(--b-muted); }
  .h-top b { font: 800 19px var(--b-font-sans); color: var(--b-ink); letter-spacing: -.02em; }
  .h-top .on { color: var(--b-ink); font-weight: 700; }
  .h-top .dev { margin-left: auto; font: 12px var(--b-font-mono); display: flex; gap: 12px; align-items: center; }
  .h-top .dev i { width: 7px; height: 7px; border-radius: 50%; background: var(--b-accent); }
  .h-config { display: flex; justify-content: center; gap: 14px; margin: 42px 0 12px; font: 500 14px var(--b-font-mono); color: var(--b-accent-text); }
  .h-config span.off { color: var(--b-muted); }
  .h-config i { width: 1px; background: var(--b-hairline); }
  .brain[data-screen="solving"] .h-config, .brain[data-screen="inspection"] .h-config { opacity: .45; }
  .brain-hero { display: grid; gap: 0; align-content: center; max-width: 470px; }
  .brain-hero p { margin: 0; }
  .h-step { font: 500 14px var(--b-font-mono); color: var(--b-accent-text); }
  .h-clock { font: 300 var(--b-fs-clock)/1 var(--b-font-num); letter-spacing: -.02em; color: var(--b-ink); font-variant-numeric: tabular-nums; margin: 18px 0 14px !important; }
  .h-clock.is-idle { color: var(--b-track); }
  .h-title { display: flex; align-items: center; gap: 26px; font: 700 var(--b-fs-step) var(--b-font-sans); color: var(--b-ink); margin-bottom: 30px !important; }
  .h-tag { font: 400 14px var(--b-font-mono); padding: 6px 12px; border-radius: 999px; background: var(--b-accent-soft); color: var(--b-accent-text); }
  .h-sub { font: 14px var(--b-font-mono); color: var(--b-muted); margin-top: 26px !important; }
  .h-ready { font: 500 16px var(--b-font-sans); color: var(--b-muted); margin: 14px 0 0 !important; }
  .brain-hero .h-btn { margin: 28px 0 34px !important; } .h-btn { display: inline-flex; align-items: center; gap: 60px; margin: 28px 0 34px; padding: 12px 22px 12px 32px; border-radius: 999px; background: var(--b-ink); color: var(--b-bg); font: 700 18px var(--b-font-sans); width: max-content; }
  .h-btn kbd { font: 12px var(--b-font-mono); padding: 5px 16px; border-radius: 6px; background: var(--b-bg); color: var(--b-ink); }
  .h-stats { display: grid; grid-template-columns: repeat(4, auto); gap: 6px 48px; justify-content: start; }
  .h-stats span { font: 12px var(--b-font-mono); color: var(--b-muted); }
  .h-stats b { font: 600 24px var(--b-font-sans); color: var(--b-ink); }
  .h-keys { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 34px; font: 12px var(--b-font-mono); color: var(--b-muted); margin-top: 18px; }
  .h-keys kbd { font: 12px var(--b-font-mono); padding: 4px 8px; margin-right: 10px; border-radius: var(--b-radius-key); background: var(--b-key-bg); color: var(--b-key-ink); }
  .h-toast { font: 600 22px var(--b-font-sans); color: var(--b-accent-text); margin-bottom: 18px !important; }
  .cube-ph { width: 100%; height: 100%; display: block; }
  .h-variants { display: grid; grid-template-columns: repeat(4, 1fr); gap: 34px 28px; }
  .h-variant .brain-stage { aspect-ratio: 4 / 3; }
  .h-variant .brain-stage > [data-slot="cube"] { display: grid; place-items: center; font: 300 58px var(--b-font-num); color: var(--b-ink); }
  .h-variant h3 { margin: 4px 0 6px; font: 500 16px var(--b-font-mono); color: var(--b-ink); }
  .h-variant p { margin: 0; font: 500 14px var(--b-font-sans); color: var(--b-muted); }
  .h-mono { display: grid; gap: 30px; }
  @media (max-width: 720px) {
    .h-top { gap: 18px; } .h-top span:not(.on) { display: none; } .h-config { display: none; }
    .h-clock { margin: 8px 0 !important; } .brain-hero { max-width: none; }
    .h-stats { gap: 6px 22px; } .h-variants { grid-template-columns: 1fr 1fr; }
  }
`;
document.head.append(css);

const app = document.getElementById('app');

/** Isometric placeholder cube (the real app mounts the 3D cube here). */
function cubeSvg(solved = false) {
  const top = solved ? Array(9).fill('w') : ['y','y','y','o','y','b','w','b','y'];
  const left = solved ? Array(9).fill('g') : ['r','g','o','y','g','w','b','y','g'];
  const right = solved ? Array(9).fill('r') : ['o','r','y','w','r','b','r','o','y'];
  const s = 36, ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', '-120 -130 240 260');
  el.setAttribute('class', 'cube-ph');
  const col = c => `var(--b-st-${c})`;
  const poly = (pts, fill, shade) => {
    const p = document.createElementNS(ns, 'polygon');
    p.setAttribute('points', pts.map(q => q.join(',')).join(' '));
    p.setAttribute('fill', fill);
    p.setAttribute('stroke', '#111');
    p.setAttribute('stroke-width', '3.4');
    p.setAttribute('stroke-linejoin', 'round');
    if (shade) p.setAttribute('style', `filter: brightness(${shade})`);
    el.append(p);
  };
  const cx = 0.866 * s, cy = 0.5 * s;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const o = [(c - r) * cx, (c + r) * cy - 3 * cy * 2];
    poly([[o[0], o[1]], [o[0] + cx, o[1] + cy], [o[0], o[1] + 2 * cy], [o[0] - cx, o[1] + cy]], col(top[r * 3 + c]));
  }
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const o = [-3 * cx + c * cx, -cy * 3 + c * cy + r * s];
    poly([[o[0], o[1]], [o[0] + cx, o[1] + cy], [o[0] + cx, o[1] + cy + s], [o[0], o[1] + s]], col(left[r * 3 + c]), 0.86);
  }
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const o = [c * cx, 0 - c * cy + r * s];
    poly([[o[0], o[1]], [o[0] + cx, o[1] - cy], [o[0] + cx, o[1] - cy + s], [o[0], o[1] + s]], col(right[r * 3 + c]), 0.72);
  }
  return el;
}

function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function topbar(root) {
  const top = h('div', 'h-top');
  top.append(h('b', '', 'cubesight'), h('span', 'on', 'brain'), h('span', '', 'history'), h('span', '', 'trainers'));
  const dev = h('span', 'dev');
  dev.append(h('i'), h('span', '', 'GAN 356 i3'), h('span', '', '84%'));
  top.append(dev);
  root.append(top);
}

function configBar(root, vm) {
  const bar = h('div', 'h-config');
  vm.configBar.items.forEach((item, i) => {
    if (i) bar.append(h('i'));
    for (const o of item.options) bar.append(h('span', o.active ? '' : 'off', o.label));
  });
  root.append(bar);
}

function keysRow(root, vm) {
  const row = h('div', 'h-keys');
  for (const k of vm.keys) { const s = h('span'); s.append(h('kbd', '', k.key), document.createTextNode(k.label)); row.append(s); }
  root.append(row);
}

function mountScreen() {
  const { vm, frame } = fixture(state);
  vm.theme = theme;
  const root = h('div', 'brain');
  root.dataset.brainStyle = 'orbit';
  root.dataset.screen = vm.screen;
  app.append(root);
  topbar(root);
  configBar(root, vm);

  const body = h('div', 'brain-body');
  const stage = h('div', 'brain-stage');
  const cube = h('div');
  cube.dataset.slot = 'cube';
  cube.append(cubeSvg(vm.screen === 'idle'));
  const tlSlot = h('div'); tlSlot.dataset.slot = 'timeline';
  const inspSlot = h('div'); inspSlot.dataset.slot = 'inspection';
  stage.append(cube, tlSlot, inspSlot);
  const hero = h('div', 'brain-hero');
  const inspAside = h('div'); inspAside.dataset.slot = 'inspection-aside';
  const tlAside = h('div'); tlAside.dataset.slot = 'timeline-aside';
  if (vm.screen === 'idle') {
    hero.append(h('p', 'h-step', 'ready'), h('p', 'h-ready', 'Cube connected, solved and centered.'), h('p', 'h-clock is-idle', '0.00'));
    const btn = h('p', 'h-btn', 'Scramble'); btn.append(h('kbd', '', 'space')); hero.append(btn);
    const stats = h('div', 'h-stats');
    for (const k of ['ao5', 'ao12', 'pb', 'today']) stats.append(h('span', '', k));
    for (const v of [vm.stats.ao5, vm.stats.ao12, vm.stats.best, String(vm.stats.solves)]) stats.append(h('b', '', v));
    hero.append(stats, h('p', 'h-sub', 'The ring maps your pace. Each arc shows the average for that stage.'));
  } else if (vm.screen === 'solving') {
    hero.append(h('p', 'h-step', vm.clock.stepLine.map(s => s.text).join(' · ')), h('p', 'h-clock', vm.clock.text));
    const title = h('p', 'h-title', vm.clock.stepTitle);
    for (const t of vm.clock.stepTags) title.append(h('span', 'h-tag', t));
    hero.append(title);
    if (vm.toast) hero.append(h('p', 'h-toast', vm.toast.text));
    hero.append(tlAside, h('p', 'h-sub', vm.clock.sub));
  } else {
    hero.append(inspAside, tlAside);
  }
  body.append(stage, hero);
  root.append(body);
  const results = h('div'); results.dataset.slot = 'results';
  root.append(results);
  keysRow(root, vm);

  const dispatch = a => console.log('dispatch', a);
  const timeline = orbitStyle.timeline(tlSlot, { dispatch, aside: tlAside });
  const insp = orbitStyle.inspection(inspSlot, { dispatch, aside: inspAside });
  const res = orbitStyle.results(results, { dispatch });
  for (const c of [timeline, insp, res]) c.update(vm, null);
  if (frame) for (const c of [timeline, insp, res]) c.frame?.(frame);
  document.documentElement.dataset.harness = 'ready';
}

function mountVariants() {
  const root = h('div', 'brain');
  root.dataset.brainStyle = 'orbit';
  root.dataset.screen = 'inspection';
  app.append(root);
  topbar(root);
  const title = h('div');
  title.append(h('h1', '', 'inspection, your way'));
  title.firstChild.setAttribute('style', 'font: 700 30px var(--b-font-sans); color: var(--b-ink); margin: 40px 0 6px');
  root.append(title);
  const grid = h('div', 'h-variants');
  for (const v of INSPECTION_VARIANTS) {
    const cell = h('div', 'h-variant');
    cell.dataset.mode = v.i.mode; cell.dataset.overtime = v.i.overtime;
    const stage = h('div', 'brain-stage');
    const num = h('div', '', v.i.bigText); num.dataset.slot = 'cube';
    const slot = h('div'); slot.dataset.slot = 'timeline';
    stage.append(num, slot);
    cell.append(stage, h('h3', '', v.title), h('p', '', v.note));
    grid.append(cell);
    const vm = fixture('inspection').vm;
    vm.inspection = v.i;
    const c = orbitStyle.timeline(slot, {});
    c.update(vm, null);
    c.frame(frameFor(v.i));
  }
  root.append(grid);
  document.documentElement.dataset.harness = 'ready';
}

function mountMonoCharts() {
  // WP2 check: the shared charts in their Mono variants on Mono-ish tokens.
  const root = h('div', 'brain h-mono');
  root.dataset.brainStyle = 'orbit';
  root.setAttribute('style', '--b-bg:#16171b;--b-ink:#d9d6cb;--b-muted:#8a8e99;--b-faint:#6b6f7a;--b-accent:#e7b34c;--b-accent-text:#e7b34c;--b-warn:#e0675e;--b-warn-text:#e0675e;--b-track:#34373f;--b-fill:#e7b34c;--b-hairline:#34373f;--b-surface:#1f2126;--b-chart-band:#1b1c21;--b-font-sans:"DM Mono";--b-font-num:"DM Mono"');
  app.append(root);
  const r = fixture('results').vm.results;
  const a = h('div'); root.append(a); createTpsLine(a, { variant: 'mono' }).update(r.tpsSeries, { drawIn: false });
  const b = h('div'); root.append(b); createSplitBars(b, { layout: 'columns' }).update(r.splits);
  const c = h('div'); c.style.maxWidth = '360px'; root.append(c); createSparkline(c).update(r.spark);
  document.documentElement.dataset.harness = 'ready';
}

if (state === 'variants') mountVariants();
else if (state === 'charts-mono') mountMonoCharts();
else mountScreen();
