import {
  createBreadcrumbs, createButton, createChip, createCoachLine, createDialog, createDisclosure,
  createFileInput, createFilledInput, createFilledSelect, createGroup, createKeyBar, createLineChart, createListRow,
  createMoveDisplay, createNavigationRail, createPanel, createRangeInput, createRightDrawer, createSection,
  createSearch, createSegmented, createStatus, createTextarea, createTimerReadout, createToastSlot, createToggle, createWipeComparison,
} from '../ui/shared/index.js';
import { Orbit } from '../ui/orbit/index.js';

const el = (tag, cls, text = '') => { const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; };
const segmentFixtures = label => [
  { key: `${label}-a`, label: 'cross', value: '2.08', weight: 2, state: 'done' },
  { key: `${label}-b`, label: 'pair 1', value: '1.71', weight: 1.7, state: 'current', fill: .6 },
  { key: `${label}-c`, label: 'pair 2', value: '1.96', weight: 2, state: 'future' },
];

export function mountApprovedWidgetGallery(host) {
  host.replaceChildren(); host.classList.add('g-widget-live'); host.dataset.opt = '3';
  const priorTheme = document.documentElement.dataset.theme;
  const priorColorScheme = document.documentElement.style.colorScheme;
  const intro = el('div', 'g-widget-live__intro');
  intro.append(el('p', 'g-eyebrow', 'F0 · approved component kit'), el('h2', '', 'Live components'), el('p', 'g-widget-live__copy', 'These examples use the shared app components. Try the controls, theme, touch sizing and reduced-motion preview.'));
  const settings = el('div', 'g-widget-live__settings');
  const currentTheme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const theme = createButton(settings, { label: `switch to ${currentTheme() === 'dark' ? 'light' : 'dark'}`, variant: 'secondary', size: 's' });
  theme.addEventListener('click', () => { const next = currentTheme() === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; document.documentElement.style.colorScheme = next; theme.textContent = `switch to ${next === 'dark' ? 'light' : 'dark'}`; document.dispatchEvent(new Event('cubesight-theme')); });
  const touch = createButton(settings, { label: 'touch sizes off', variant: 'secondary', size: 's' });
  touch.addEventListener('click', () => { const on = host.classList.toggle('touch'); touch.textContent = `touch sizes ${on ? 'on' : 'off'}`; });
  const motion = createButton(settings, { label: 'reduced motion off', variant: 'secondary', size: 's' });
  motion.addEventListener('click', () => { const on = host.dataset.motion !== 'reduce'; host.dataset.motion = on ? 'reduce' : 'full'; motion.textContent = `reduced motion ${on ? 'on' : 'off'}`; });
  intro.append(settings); host.append(intro);

  const grid = el('div', 'g-widget-live__grid'); host.append(grid);
  const addPanel = title => { const panel = el('section', 'g-widget-live__panel'); panel.append(el('h3', '', title)); grid.append(panel); return panel; };

  const buttons = addPanel('W-04 · buttons');
  const buttonRow = el('div', 'g-widget-live__row'); buttons.append(buttonRow);
  createButton(buttonRow, { label: 'primary', variant: 'primary' }); createButton(buttonRow, { label: 'secondary', variant: 'secondary' }); createButton(buttonRow, { label: 'text', variant: 'text' });
  const buttonStates = el('div', 'g-widget-live__row'); buttons.append(buttonStates);
  createButton(buttonStates, { label: 'hover', variant: 'primary' }).classList.add('is-hover'); createButton(buttonStates, { label: 'pressed', variant: 'secondary' }).classList.add('is-active'); createButton(buttonStates, { label: 'disabled', variant: 'primary', disabled: true }); createButton(buttonStates, { label: 'loading', variant: 'secondary', loading: true });

  const choices = addPanel('W-05–08 · selection controls');
  const chips = el('div', 'g-widget-live__row'); choices.append(chips); createChip(chips, { label: 'all', pressed: true }); createChip(chips, { label: 'PLL', value: 21 }); createChip(chips, { label: 'focus', pressed: true }).classList.add('is-focus'); createChip(chips, { label: 'disabled', disabled: true });
  const segmented = el('div', 'g-widget-live__row'); choices.append(segmented); createSegmented(segmented, { label: 'Chart period', value: '12', options: [{ value: '5', label: 'ao5' }, { value: '12', label: 'ao12' }, { value: '50', label: '50 solves' }] });
  createToggle(choices, { label: 'inspection', description: '15 seconds', checked: true }); createToggle(choices, { label: 'sync cube', disabled: true });
  const answerRow = el('div', 'g-widget-live__row'); choices.append(answerRow); ['U', 'R', 'F'].forEach((label, i) => { const choice = createButton(answerRow, { label, variant: 'secondary' }); choice.classList.add('btn--choice'); if (i === 1) choice.dataset.state = 'good'; });

  const inputs = addPanel('W-09 / W-36 · filled fields and search');
  createFilledInput(inputs, { label: 'session name', value: 'evening solves', placeholder: 'name this session' });
  createFilledSelect(inputs, { label: 'filter', value: 'all', options: [{ value: 'all', label: 'all sessions' }, { value: 'recent', label: 'recent' }, { value: 'pinned', label: 'pinned' }] });
  createFilledSelect(inputs, { label: 'disabled filter', value: 'recent', disabled: true, options: [{ value: 'recent', label: 'recent' }, { value: 'pinned', label: 'pinned' }] });
  createFilledInput(inputs, { label: 'validation state', value: '', placeholder: 'name this session', error: /* copy-ok: validation example shows accessible error-state styling */ 'Choose a name to continue.' });
  createTextarea(inputs, { label: 'paste moves', value: "R U R' U'", rows: 2, hint: 'Notation stays on this device.' });
  createRangeInput(inputs, { label: 'playback speed', min: .5, max: 2, step: .25, value: 1, unit: '×' });
  createFileInput(inputs, { label: 'open a recording', accept: 'application/json,.json' });
  const searchHost = el('div', 'g-widget-live__wide'); inputs.append(searchHost); createSearch(searchHost, { placeholder: 'search cases', count: '2 of 21' });

  const containers = addPanel('W-10 / W-14 / W-15 / W-29 · container ladder');
  const disclosure = createDisclosure(containers, { title: 'advanced details', detail: 'rarely needed', open: true }); disclosure.body.append(el('p', 'g-widget-live__copy', 'Sections use space and a heading. The list and log variants get a panel.'));
  const group = createGroup(containers, { label: 'group of settings' }); group.append(el('p', 'g-widget-live__copy', 'Groups stay frameless and add space between related controls.'));
  const listGroup = createPanel(containers, { kind: 'list', label: 'example list panel' });
  createListRow(listGroup, { title: 'Cross Scout', detail: 'last practiced · today', value: '1.42', selected: true, orbit: { segments: segmentFixtures('scout') } });
  const dialogHost = el('div', 'g-widget-live__row'); containers.append(dialogHost); const dialog = createDialog(document.body, { title: 'One decision', description: 'A compact dialog for one choice.', actions: [{ label: 'cancel', close: true }, { label: 'continue', primary: true }] });
  createButton(dialogHost, { label: 'open dialog', variant: 'secondary' }).addEventListener('click', () => dialog.open());
  const drawer = createRightDrawer(document.body, { title: 'Review detail', subtitle: 'right drawer · one selected item' }); drawer.body.append(el('p', 'g-widget-live__copy', 'The selected review detail lives here.')); createButton(dialogHost, { label: 'open right drawer', variant: 'secondary' }).addEventListener('click', () => drawer.open());

  const lists = addPanel('W-11 / W-18 / W-19 / W-25 / W-30 · open rows');
  const section = createSection(lists, { title: 'Recent solves', eyebrow: 'history', count: 3 });
  const rows = el('div', 'ui-list'); section.append(rows);
  createListRow(rows, { title: '14.07', detail: 'cross · pair 1 · pair 2', value: '−0.22', selected: true, tags: ['PB', 'PLL skip'], orbit: { segments: segmentFixtures('solve1') } });
  createListRow(rows, { title: '15.31', detail: 'cross · pair 1 · pair 2', value: '+0.14', tags: ['session 4'], orbit: { segments: segmentFixtures('solve2') } });
  const empty = el('div', 'g-widget-live__empty'); empty.append(el('b', '', 'No pinned cases yet'), el('span', '', 'Pin a case from the alg list to keep it here.')); lists.append(empty);

  const navigation = addPanel('W-13 / W-26 / W-27 · navigation');
  createNavigationRail(navigation, { active: 'history', items: [{ id: 'solve', label: 'solve', href: '#/solve' }, { id: 'drills', label: 'drills', href: '#/drills' }, { id: 'history', label: 'history', href: '#/history' }] });
  createBreadcrumbs(navigation, [{ label: 'history', href: '#/history' }, { label: 'session 4', href: '#/history/session-4' }, { label: 'solve 23', href: '#/history/solve-23' }]);
  navigation.append(el('p', 'g-widget-live__copy', 'The cube chip in the global header opens the approved right drawer.'));

  const status = addPanel('W-16 / W-17 · status and keyboard');
  createStatus(status, { text: 'connected', detail: 'GAN 356 i3' }); createStatus(status, { text: 'sync needed', tone: 'warn' });
  const toastSlot = createToastSlot(document.body); const toastButton = createButton(status, { label: 'show saved toast', variant: 'secondary' }); toastButton.addEventListener('click', () => toastSlot.show({ detail: 'Solve saved', text: '12.41 · PB', action: { label: 'view', onClick: () => { location.hash = '#/history'; } } }));
  createKeyBar(status, [{ key: ['[', ']'], label: 'marker range' }, { key: 'space', label: 'next' }, { key: 'esc', label: 'back' }]);

  const timeMove = addPanel('W-20 / W-21 / W-22 · coach, moves and timer');
  const timerRow = el('div', 'g-widget-live__row'); timeMove.append(timerRow); const timer = createTimerReadout(timerRow, { value: '14.07', subtitle: 'solve time' }); createTimerReadout(timerRow, { value: '12.00', hidden: true, subtitle: 't to show' });
  const timerButton = createButton(timerRow, { label: 'hide timer', variant: 'text', size: 's' }); let isHidden = false; timerButton.addEventListener('click', () => { isHidden = !isHidden; timer.setHidden(isHidden); timerButton.textContent = isHidden ? 'show timer' : 'hide timer'; });
  const moveHost = el('div', 'g-widget-live__wide'); timeMove.append(moveHost); const moveDisplay = createMoveDisplay(moveHost, { moves: ['R', 'U', "R′", "U′", 'F', 'R2', "U′"], current: 3, sections: [{ start: 4 }] });
  const coachExample = el('div', 'g-widget-live__coach-example'); timeMove.append(coachExample);
  const coachHost = el('div', 'g-widget-live__coach'); coachExample.append(coachHost);
  const coachOrbitHost = el('div', 'g-widget-live__coach-orbit'); coachExample.append(coachOrbitHost);
  const coachOrbit = new Orbit(coachOrbitHost, { size: 'S', gap: 48, segments: segmentFixtures('coach'), markers: [{ key: 'coach-marker', segment: 'coach-b', position: .6, label: 'pair 1', tone: 'good' }], label: 'Coach marker example' });
  const coach = createCoachLine(coachHost, { text: 'Nice lookahead. Pair 1 stayed efficient.', marker: 'coach-marker', orbit: coachOrbit, connectorHost: coachExample });

  const data = addPanel('W-23 / W-24 / W-35 / W-37 · progress, charts and comparison');
  const round = el('div', 'g-widget-live__wide'); data.append(round); const roundOrbit = new Orbit(round, { size: 'M', gap: 56, segments: [{ key: 'round1', label: 'case 1', weight: 1.42, value: '1.42', state: 'done' }, { key: 'round2', label: 'case 2', weight: 1.81, value: '1.81', state: 'done' }, { key: 'round3', label: 'case 3', weight: 1.3, value: '1.30', state: 'current', fill: .3 }], label: 'Round progress; segment widths show time spent' });
  const chart = el('div', 'g-widget-live__wide'); data.append(chart); createLineChart(chart, { label: 'ao12 trend over recent sessions', series: [{ name: 'ao12', values: [16.2, 15.9, 16.4, 15.2, 15.6, 14.9, 15.1, 14.7, 14.4, 14.8, 14.2, 14.1] }] });
  const chartExamples = el('div', 'g-widget-live__charts'); data.append(chartExamples);
  const tpsChart = el('div', 'g-widget-live__wide'); chartExamples.append(tpsChart); createLineChart(tpsChart, { label: 'Turns per second by split', series: [{ name: 'TPS', values: [2.8, 3.4, 3.1, 4.2, 3.8, 4.5, 3.9, 4.7] }] });
  const sparkline = el('div', 'g-widget-live__wide'); chartExamples.append(sparkline); createLineChart(sparkline, { label: 'Recent solve times sparkline', height: 120, series: [{ name: 'recent solves', values: [15.2, 14.8, 15.4, 14.1, 13.9, 14.4, 13.6] }] });
  const splitChart = el('div', 'g-widget-live__wide'); chartExamples.append(splitChart); createLineChart(splitChart, { label: 'Split comparison: your solve and reference', series: [{ name: 'your solve', values: [3.2, 3.1, 4.4, 3.37] }, { name: 'reference', color: 'var(--b-warn)', values: [3.0, 3.3, 4.0, 3.55] }] });
  const wipe = el('div', 'g-widget-live__wide'); data.append(wipe);
  const wipeModes = el('div', 'g-widget-live__row'); wipe.append(wipeModes); const wipeStageHost = el('div', 'g-widget-live__wide'); wipe.append(wipeStageHost);
  const comparison = createWipeComparison(wipeStageHost, { before: el('span', 'g-widget-live__sample', 'your solve · 14.07'), after: el('span', 'g-widget-live__sample', 'reference · 13.85'), value: 54, label: 'Wipe between solve and reference' });
  createSegmented(wipeModes, { label: 'Comparison view', value: 'wipe', options: [{ value: 'wipe', label: 'wipe' }, { value: 'side-by-side', label: 'side by side' }, { value: 'overlay', label: 'overlay' }], onChange: mode => comparison.setMode(mode) });

  host._approvedWidgetGallery = { dialog, drawer, toastSlot, moveDisplay, coach, coachOrbit, roundOrbit, comparison, destroy() { dialog.destroy(); drawer.destroy(); toastSlot.destroy(); moveDisplay.destroy(); coach.destroy(); coachOrbit.destroy(); roundOrbit.destroy(); comparison.destroy(); host.classList.remove('touch'); if (priorTheme == null) delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = priorTheme; document.documentElement.style.colorScheme = priorColorScheme; host.replaceChildren(); } };
  return host._approvedWidgetGallery;
}
