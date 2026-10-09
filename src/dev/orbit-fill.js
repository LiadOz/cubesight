import '@fontsource-variable/manrope';
import '@fontsource/dm-mono/latin-400.css';
import { ORBIT } from '../ui/design-spec.js';
import { Orbit } from '../ui/orbit/index.js';
import { Cube } from '../ui/cube/index.js';
import { createActions, createChip } from '../ui/shared/index.js';
import './orbit-fill.css';

// Component proposal only: no product route imports this module.
const variants = [
  { id: 'A', number: '①', name: 'Quick sweep', duration: 180, description: '180 ms · fills forward, then settles' },
  { id: 'B', number: '②', name: 'Calm sweep', duration: 300, description: '300 ms · the same fill, with more time to read it' },
  { id: 'C', number: '③', name: 'Center out', duration: 300, description: '300 ms · grows from the middle to both ends' },
];
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const $ = selector => document.querySelector(selector);
let variant = variants.find(item => item.id === params.get('variant')) || variants[0];
let scene = params.get('state') === 'round' ? 'round' : 'stages';
let frame = 0;
let playing = false;
const orbit = new Orbit($('.proposal-orbit'), { size: 'XL', clampLabels: true });
const cube = new Cube($('.proposal-cube'), { mode: 'live', size: 'L', cubeOptions: { interactive: false } });
const optionControls = variants.map(item => createChip($('.proposal-controls'), { label: `${item.number} ${item.name.toLowerCase()}`, pressed: item.id === variant.id, onClick: () => { choose(item.id); play(); } }));
const sceneControls = ['stages', 'round'].map(value => createChip($('.proposal-settings'), { label: value === 'stages' ? 'solve stages' : '20-case round', pressed: value === scene, onClick: () => { scene = value; syncControls(); play(); } }));
createActions($('.proposal-actions'), [{ label: 'replay', primary: true, onClick: play }, { label: 'rapid', onClick: () => play(true) }, { label: 'theme', onClick: () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light') }]);

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.dispatchEvent(new Event('cubesight-theme'));
}
function stop() { playing = false; cancelAnimationFrame(frame); }
function syncControls() {
  optionControls.forEach((control, index) => control.setAttribute('aria-pressed', String(variants[index].id === variant.id)));
  sceneControls.forEach((control, index) => control.setAttribute('aria-pressed', String(['stages', 'round'][index] === scene)));
  $('.proposal-id').textContent = `OF-0${variants.indexOf(variant) + 1} · proposal`;
  $('h1').textContent = `${variant.number} ${variant.name}`;
  $('.proposal-description').textContent = variant.description;
  document.documentElement.dataset.fillVariant = variant.id;
}
function choose(id) {
  stop(); variant = variants.find(item => item.id === id) || variant; syncControls(); seek(0);
}

// The deterministic capture and live rAF playback use this exact same timeline.
// Only one segment moves at a time; complete segments hold before the next one.
function seek(elapsed, animate = false) {
  const cycle = 1100;
  const completed = Math.min(3, Math.floor(elapsed / cycle));
  const local = elapsed - completed * cycle - 350;
  const raw = completed >= 3 ? 0 : Math.min(1, Math.max(0, local / variant.duration));
  const fill = reduced.matches ? (local >= 0 ? 1 : 0) : 1 - Math.pow(1 - raw, 3);
  const labels = scene === 'round' ? Array.from({ length: 20 }, (_, index) => `case ${index + 1}`) : ['cross', 'pair 1', 'pair 2', 'pair 3', 'pair 4', 'EO', 'CO', 'PLL'];
  const target = 2 + completed;
  const segments = labels.map((label, index) => ({
    key: `segment-${index}`, label: scene === 'round' ? undefined : label,
    weight: scene === 'round' ? 1 : [2.1, 1.8, 1.7, 1.8, 2.2, 1, .8, .9][index],
    state: index < target ? 'done' : index === target && completed < 3 ? (fill >= 1 ? 'good' : 'current') : 'future',
    fill: index < target ? 1 : index === target && completed < 3 ? fill : 0,
    fillOffset: index === target && variant.id === 'C' ? (1 - fill) / 2 : 0,
    fillColor: index === target ? ORBIT.stroke.doneGood.stroke : undefined,
  }));
  orbit.update({ segments, labelKind: 'stage' }, { animate });
  $('.proposal-slot').textContent = `${Math.min(labels.length, target + (fill >= 1 ? 1 : 0))} / ${labels.length}`;
  $('.proposal-note').textContent = reduced.matches ? 'Reduced motion · instant completion · sample data' : 'Three completions · actual speed · sample data';
}
function play(rapid = false) {
  stop(); seek(0); playing = true;
  const start = performance.now();
  let step = 0;
  const tick = now => {
    if (!playing) return;
    const elapsed = now - start;
    if (variant.id === 'A') {
      const interval = rapid ? 60 : 1100;
      while (step < 3 && elapsed >= 350 + step * interval) {
        // Chosen option uses the shared default, including rapid retargeting.
        seek(step * 1100 + 350 + variant.duration, true); step++;
      }
    } else seek(Math.min(3300, elapsed));
    if (elapsed < (rapid ? 900 : 3900)) frame = requestAnimationFrame(tick); else playing = false;
  };
  frame = requestAnimationFrame(tick);
}
reduced.addEventListener('change', () => { stop(); seek(3300); });
// The lab calls this only inside its same-origin isolated component iframe.
window.orbitFillPreview = { choose, seek: elapsed => { stop(); seek(elapsed); }, play, stop, get variant() { return variant.id; }, get playing() { return playing; }, destroy: () => { stop(); orbit.destroy(); cube.destroy(); } };
setTheme(params.get('theme') === 'light' ? 'light' : 'dark');
syncControls(); seek(0);
if (params.get('capture') !== '1') play();
