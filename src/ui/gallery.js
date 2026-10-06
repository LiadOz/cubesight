import '@fontsource-variable/manrope';
import '@fontsource/dm-mono/latin-400.css';
import { stateFromScramble } from '../cross-cube.js';
import { Cube } from './cube/index.js';
import { Orbit } from './orbit/index.js';
import { createActions, createChip, createCoachLine, createHeader, createKeyBar } from './shared/index.js';
import './gallery.css';

const flows = [
  { id: 'scramble', title: 'guided scramble', note: '20 moves · current emphasized · upcoming moves stay readable', segments: "R U R′ U′ F2 L D′ B2 U2 R′ F L2 D B′ U F′ R2 D2 L U′".split(' ').map((label, index) => ({ key: `m${index + 1}`, label, weight: 1, state: index < 8 ? 'done' : index === 8 ? 'current' : 'future', fill: index === 8 ? .42 : index < 8 ? 1 : 0 })), slot: 'F′', actions: ['undo', 'skip', 'stop'] },
  { id: 'inspection', title: 'inspection', note: 'remaining time, +2 and DNF share one Orbit', segments: [{ key: 'remaining', label: 'remaining', value: '8.7 s', weight: 8.7, state: 'current', fill: .58 }, { key: 'plus2', label: '+2', weight: 2, state: 'wrong' }, { key: 'dnf', label: 'DNF', weight: 5, state: 'bad' }], caret: 208, slot: '9', actions: ['start', 'settings'] },
  { id: 'solving', title: 'solving', note: 'stage weights follow the average pace map', segments: ['cross', 'pair 1', 'pair 2', 'pair 3', 'pair 4', 'EO', 'CO', 'PLL'].map((label, index) => ({ key: label, label, weight: [2.1, 1.8, 1.7, 1.8, 2.2, 1, .8, .9][index], state: index < 4 ? 'done' : index === 4 ? 'current' : 'future', fill: index < 4 ? 1 : index === 4 ? .42 : 0 })), slot: '8.42', actions: ['stop solve', 'help'] },
  { id: 'results', title: 'results', note: 'stage time and both good/bad markers; nearby markers cluster', segments: ['cross', 'pair 1', 'pair 2', 'pair 3', 'pair 4', 'EO', 'CO', 'PLL'].map((label, index) => ({ key: label, label, value: ['2.08','1.71','1.96','1.52','2.31','—','1.64','1.47'][index], delta: [0,-.12,.24,-.33,.51,0,-.03,.18][index], weight: [2.08,1.71,1.96,1.52,2.31,.18,1.64,1.47][index], state: index === 5 ? 'skipped' : 'done' })), markers: [0,1,2,3,4,5,6,7,8,9,10,11].map((index) => ({ key: `mark-${index + 1}`, segment: ['cross','cross','pair 1','pair 1','pair 2','pair 2','pair 3','pair 3','pair 4','pair 4','CO','PLL'][index], position: [.3,.34,.4,.43,.5,.52,.64,.67,.33,.36,.6,.75][index], label: index % 2 ? 'pause' : 'efficient', tone: index % 3 ? 'good' : 'bad', type: index % 3 ? 'good' : 'bad' })), slot: '14.07', actions: ['next scramble', 'review', 'more…'] },
  { id: 'alg', title: 'alg playback', note: 'T-perm PLL stays visible with a fixed red top; trigger sections are marked by gaps', segments: "R U R′ U′ R′ F R2 U′ R′ U′ R U R′ F′".split(' ').map((label,index)=>({ key:`alg-${index+1}`, label, weight:1, state:index<5?'done':index===5?'current':'future', fill:index<5?1:index===5?.35:0, sectionStart:[0,4,8,11].includes(index) })), sections: [{ start: 0, label: 'setup' }, { start: 4, label: 'sexy move' }, { start: 8, label: 'insert' }, { start: 11, label: 'finish' }], slot: 'R′', actions: ['play', 'pause', 'next'] },
  { id: 'drill', title: 'drill round', note: 'cases are segments; answers remain chips', segments: Array.from({ length: 12 }, (_, index) => ({ key: `case-${index+1}`, label: `${index+1}`, weight: 1, state: index < 4 ? (index === 2 ? 'wrong' : 'good') : index === 4 ? 'current' : 'future', fill: index < 4 ? 1 : 0 })), slot: '4 / 12', actions: ['skip', 'reveal', 'stop'] },
  { id: 'timer', title: 'manual timer', note: 'single ring for both inspection and solve; no nested progress ring', segments: [{ key: 'insp', label: 'inspection', value: '12 s', weight: 12, state: 'done' }, { key: 'solve', label: 'solve', value: '14.07', weight: 14.07, state: 'current', fill: .61 }], slot: '8', actions: ['start', 'stop', 'settings'] },
  { id: 'history', title: 'history', note: 'browseable solves share the same mini Orbit glyph', segments: Array.from({ length: 14 }, (_, index) => ({ key: `solve-${index+1}`, label: `${index+1}`, weight: 1, state: ['good','done','wrong','done','good','done','done','wrong','done','good','done','done','done','current'][index], fill: 1 })), slot: 'session · 14 solves', actions: ['previous', 'open solve', 'next'] },
  { id: 'progress', title: 'progress', note: 'one ring shows stage averages; no bars or nested progress rings', segments: ['cross', 'pair 1', 'pair 2', 'pair 3', 'pair 4', 'EO', 'CO', 'PLL'].map((label,index)=>({ key:label,label,value:['2.2','1.8','1.9','2.1','2.4','1.0','0.8','1.4'][index],delta:[-.1,-.04,.08,-.12,.06,0,-.03,-.1][index],weight:[2.2,1.8,1.9,2.1,2.4,1,.8,1.4][index],state:'done' })), slot: 'last 30 days', actions: ['period', 'sessions', 'drill this'] },
];

const root = document.querySelector('#gallery');
const params = new URLSearchParams(location.search);
let activeFlow = flows.find(flow => flow.id === params.get('flow')) || flows[0];
let theme = params.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;

root.innerHTML = `<div class="f0-page"><div class="f0-header"></div><nav class="f0-tabs" data-scroll-x="true" tabindex="0" aria-label="Orbit flow"></nav><section class="f0-frame"><div class="f0-stage"><div class="f0-orbit"></div><div class="f0-cube"></div><div class="f0-slot"></div></div><aside class="f0-copy"><p class="f0-id"></p><h1></h1><p class="f0-note"></p><div class="f0-coach"></div><div class="f0-actions"></div><div class="f0-chips"></div><p class="f0-grow"><button type="button">add undo segment</button><span>dynamic growth</span></p><p class="f0-callout-note">Orbit · centered Cube · open dial slot · coach, actions and chips</p></aside></section><footer class="f0-keys"></footer></div>`;
const $ = selector => root.querySelector(selector);
$('.f0-tabs').addEventListener('keydown', event => {
  if (event.target !== event.currentTarget) return;
  const tabs = event.currentTarget;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    tabs.scrollLeft = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.scrollWidth : tabs.scrollLeft + (event.key === 'ArrowRight' ? 120 : -120);
  }
});
const scrambleState = stateFromScramble('R U F2 L D B2');
const pllCaseState = stateFromScramble("R U R' U' R' F R2 U' R' U' R U R' F'");
const cubeClearance = () => {
  const stage = document.querySelector('.f0-stage').getBoundingClientRect();
  const cubeWidth = innerWidth <= 800 ? Math.min(innerWidth * .42, 166) : Math.min(innerHeight * .36, stage.width * .58);
  const orbitDiameter = Math.min(520, stage.width, stage.height);
  return cubeWidth * 560 / Math.max(1, orbitDiameter) / 2 + 12;
};
const cube = new Cube($('.f0-cube'), { mode: 'case', size: 'XL', state: scrambleState, caseSeed: 'F0-gallery', label: 'F0 component gallery cube' });
const orbit = new Orbit($('.f0-orbit'), { size: 'XL', shape: activeFlow.id === 'inspection' ? 'full' : 'open', gap: 70, direction: 'clockwise', segments: activeFlow.segments, markers: activeFlow.markers || [], sections: activeFlow.sections || [], caret: activeFlow.caret, centerClearance: cubeClearance(), label: `${activeFlow.title} Orbit`, duration: 360 });
let coach;
function render(flow) {
  activeFlow = flow;
  cube.setCaseOrientation(flow.id === 'alg' ? 'fixed: red' : 'yellow top', { seed: flow.id === 'alg' ? 'F0-pll-red-top' : 'F0-gallery' });
  cube.setState(flow.id === 'alg' ? pllCaseState : scrambleState);
  $('.f0-id').textContent = `F0-${String(flows.indexOf(flow) + 1).padStart(2,'0')} · ① Orbit ② Cube ③ slot ④ shared pieces`;
  $('h1').textContent = flow.title;
  $('.f0-note').textContent = flow.note;
  $('.f0-slot').textContent = flow.slot;
  const tabs = $('.f0-tabs');
  tabs.replaceChildren(...flows.map(item => { const button = document.createElement('button'); button.textContent = item.title; button.setAttribute('aria-pressed', String(item.id === flow.id)); button.addEventListener('click', () => render(item)); return button; }));
  const activeTab = tabs.querySelector('[aria-pressed="true"]');
  if (activeTab) {
    const revealActiveTab = () => {
      if (!activeTab.isConnected) return;
      const itemLeft = activeTab.offsetLeft, itemRight = itemLeft + activeTab.offsetWidth;
      if (itemLeft < tabs.scrollLeft) tabs.scrollLeft = itemLeft;
      else if (itemRight > tabs.scrollLeft + tabs.clientWidth) tabs.scrollLeft = itemRight - tabs.clientWidth;
    };
    requestAnimationFrame(() => requestAnimationFrame(revealActiveTab));
    document.fonts?.ready.then(revealActiveTab);
  }
  const clearance = cubeClearance();
  void orbit.update({ size: 'XL', shape: flow.id === 'inspection' ? 'full' : 'open', gap: 70, direction: 'clockwise', segments: flow.segments, markers: flow.markers || [], sections: flow.sections || [], caret: flow.caret, centerClearance: clearance, label: `${flow.title} Orbit`, duration: 360, onSegment(segment) { $('.f0-slot').textContent = [segment.label, segment.value, segment.delta == null ? '' : `${segment.delta > 0 ? '+' : ''}${Number(segment.delta).toFixed(2)}`].filter(Boolean).join(' · '); }, onMarker(marker) { coach?.update({ text: `${marker.label || 'marker'} · ${marker.segment || ''}.`, marker, orbit }); } });
  $('.f0-chips').replaceChildren(...(flow.id === 'drill' ? ['U', 'R', 'F', 'skip'] : flow.id === 'history' ? ['all sessions', 'speed', 'cube'] : flow.id === 'timer' ? ['inspection', 'solve'] : []).map(label => { const host = document.createElement('span'); createChip(host, { label }); return host.firstElementChild; }));
  $('.f0-actions').replaceChildren(); createActions($('.f0-actions'), flow.actions.map((label,index)=>({label,primary:index===0,onClick:()=>{ if(label==='play') void cube.play(['R','U',"R'","U'"],{fullTurns:true}); if(label==='start') orbit.update({shape:'full'}); } })));
  $('.f0-coach').replaceChildren(); coach = createCoachLine($('.f0-coach'), { text: flow.id === 'results' ? 'Pseudo pair 3 saved about 3 moves.' : 'The cube stays at the center of one Orbit.', marker: flow.markers?.[2], orbit });
}
for (const button of root.querySelectorAll('[data-theme]')) button.addEventListener('click', () => { theme = button.dataset.theme; document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; document.dispatchEvent(new Event('cubesight-theme')); });
$('.f0-grow button').addEventListener('click', () => { const segments = [...orbit.options.segments, { key:`undo-${Date.now()}`,label:'U′',weight:1,state:'wrong',fill:.7 }]; render({ ...activeFlow, segments, slot:'U′ · undo' }); });
const gallerySessionSnapshot = { phase: 'tracking', deviceName: 'GAN 356 i3', battery: 84, canSync: true, canDisconnect: true };
const gallerySession = { getSnapshot: () => gallerySessionSnapshot, subscribe(listener) { listener(gallerySessionSnapshot); return () => {}; } };
createHeader($('.f0-header'), { sections: ['solve','drills','algs','progress','history'], active:'solve', session: gallerySession });
window.__f0Cube = cube;
window.__f0Orbit = orbit;
window.addEventListener('resize', () => { void orbit.update({ ...orbit.options, centerClearance: cubeClearance() }, { animate: false }); });
$('#theme-toggle').addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.dispatchEvent(new Event('cubesight-theme'));
});
const themeControls = document.createElement('div'); themeControls.className = 'f0-themes'; themeControls.innerHTML = '<button data-theme="dark">orbit dark</button><button data-theme="light">orbit light</button>'; $('.f0-header').append(themeControls);
for (const button of themeControls.querySelectorAll('[data-theme]')) button.addEventListener('click', () => { theme = button.dataset.theme; document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; document.dispatchEvent(new Event('cubesight-theme')); });
createKeyBar($('.f0-keys'), [{key:'space',label:'next'},{key:'[ ]',label:'markers'},{key:'esc',label:'back'}]);
render(activeFlow);
