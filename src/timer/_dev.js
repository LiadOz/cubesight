// Development only: mount the manual timer on a bare page.
//   /src/timer/_dev.html?style=orbit|mono&theme=dark|light&seed=30
// `seed=N` adds N fake manual solves to an empty history (for screenshots). The page exposes
// window.timerDev = { timer, store } for tests.
import { openHistory } from '../store/history.js';
import { createTimer } from './index.js';

const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;

const store = await openHistory();
const seed = Number(params.get('seed')) || 0;
if (seed && !store.records.length) {
  const start = Date.now() - seed * 60_000;
  for (let i = 0; i < seed; i++) {
    const penalty = i % 13 === 7 ? '+2' : i % 29 === 11 ? 'DNF' : null;
    store.append({ at: start + i * 45_000, source: 'manual', scramble: '', solved: true, solveMs: 11_000 + ((i * 7919) % 5_000), penalty, focus: 'speed' });
  }
  await store.flush();
}

const root = document.querySelector('#timer-root');
const timer = createTimer(root, { store, style: params.get('style') === 'mono' ? 'mono' : params.get('style') === 'orbit' ? 'orbit' : undefined });
document.body.style.background = getComputedStyle(root).getPropertyValue('--b-bg');
window.timerDev = { timer, store };
await timer.ready;
document.documentElement.dataset.timerReady = 'true';
