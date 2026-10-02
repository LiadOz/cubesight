/* global document */
import { q, mount, theme } from '../../_proto/common.js';
import * as S from '../../_proto/scenes.js';

const opt = ['1', '2', '3'].includes(q.get('opt')) ? q.get('opt') : '1';
const view = q.get('view') || 'states';
const withLegend = q.get('legend') !== '0';
const NAMES = { 1: 'quiet fill', 2: 'outline', 3: 'teal action' };
const ID = { states: 'W-04-01', results: 'W-04-02', settings: 'W-04-03', drill: 'W-04-04', phone: 'W-04-05' };

const ringSvg = '<svg class="btn-ring" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity=".28" stroke-width="2"/><path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const X = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>';
const goodGlyph = '<svg class="glyph" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1l1.6 3.9L13 6.5 8.6 8.1 7 13 5.4 8.1 1 6.5l4.4-1.6z" fill="var(--b-good)"/></svg>';
const badGlyph = '<svg class="glyph" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.6" fill="none" stroke="var(--b-warn)" stroke-width="1.6"/><path d="M7 4v3.6M7 9.6v.1" stroke="var(--b-warn)" stroke-width="1.6" stroke-linecap="round"/></svg>';

/** kind: primary | secondary | text | icon | choice. */
function B(kind, label, { size = '', kbd = '', state = '', tone = '', co = '', glyph = '', dataState = '', aria = '' } = {}) {
  const cls = ['btn', kind === 'choice' ? 'btn--secondary btn--choice' : `btn--${kind}`, size && `btn--${size}`, tone && `btn--${tone}`, state].filter(Boolean).join(' ');
  const loading = state.includes('is-loading');
  const body = kind === 'icon' ? X : `${loading ? ringSvg : ''}${glyph}<span>${loading ? 'working…' : label}</span>${kbd && !loading ? `<kbd>${kbd}</kbd>` : ''}`;
  return `<button class="${cls}" ${state.includes('is-disabled') ? 'disabled' : ''} ${dataState ? `data-state="${dataState}"` : ''} ${aria ? `aria-label="${aria}"` : ''} ${co ? `data-co="${co}"` : ''}>${body}</button>`;
}
const keybar = items => `<div class="keybar">${items.map(([k, v]) => `<span><kbd>${k}</kbd>${v}</span>`).join('')}</div>`;

const STATE_COLS = [['default', ''], ['hover', 'is-hover'], ['focus-visible', 'is-focus'], ['pressed', 'is-active'], ['disabled', 'is-disabled'], ['loading', 'is-loading']];

function statesFrame() {
  const rows = [
    ['primary · L 48', st => B('primary', 'start', { size: 'l', kbd: 'space', state: st, co: st === '' ? '1' : st === 'is-focus' ? '4' : st === 'is-loading' ? '5' : '' })],
    ['primary · M 40', st => B('primary', 'retry', { state: st })],
    ['secondary · M', st => B('secondary', 'recenter', { state: st, co: st === '' ? '2' : '' })],
    ['text · ink', st => B('text', 'review', { state: st, co: st === '' ? '3' : '' })],
    ['text · muted', st => B('text', 'more…', { tone: 'muted', state: st })],
    ['text · danger', st => B('text', 'forget cube', { tone: 'danger', state: st })],
    ['icon-only · close', st => B('icon', '', { state: st, aria: 'close' })],
  ];
  const head = `<div></div>${STATE_COLS.map(([n]) => `<div class="colhead">${n}</div>`).join('')}`;
  const grid = rows.map(([n, f]) => `<div class="colhead">${n}</div>${STATE_COLS.map(([, st]) => `<div class="cell">${f(st)}</div>`).join('')}`).join('');
  const choice = `<div class="matrix" style="grid-template-columns:150px repeat(5,minmax(0,1fr))">
      <div class="colhead">answer (choice)</div>
      <div class="cell">${B('choice', 'OLL21', { kbd: '1' })}</div>
      <div class="cell">${B('choice', 'OLL27', { kbd: '2', state: 'is-focus' })}</div>
      <div class="cell">${B('choice', 'OLL31', { kbd: '3', glyph: goodGlyph, dataState: 'good', co: '7' })}</div>
      <div class="cell">${B('choice', 'OLL33', { kbd: '4', glyph: badGlyph, dataState: 'bad' })}</div>
      <div class="cell">${B('choice', 'OLL35', { kbd: '5', state: 'is-disabled' })}</div>
      <div class="colhead" style="grid-row:2">sizes (desktop)</div>
      <div class="cell">${B('secondary', 'S 32', { size: 's' })}</div><div class="cell">${B('secondary', 'M 40')}</div><div class="cell">${B('secondary', 'L 48', { size: 'l' })}</div>
      <div class="cell">${B('text', 'S 32', { size: 's' })}</div><div class="cell">${B('icon', '', { aria: 'close' })}</div>
    </div>`;
  const phone = `<div class="touch matrix" style="grid-template-columns:150px repeat(5,minmax(0,1fr));margin-top:10px">
      <div class="colhead">touch (phone)</div>
      <div class="cell">${B('primary', 'start', { size: 'l', co: '6' }).replace('class="btn', 'class="hit btn')}</div>
      <div class="cell">${B('secondary', 'recenter').replace('class="btn', 'class="hit btn')}</div>
      <div class="cell">${B('text', 'review').replace('class="btn', 'class="hit btn')}</div>
      <div class="cell">${B('text', 'skip', { size: 's', tone: 'muted' }).replace('class="btn', 'class="hit btn')}</div>
      <div class="cell">${B('icon', '', { aria: 'close' }).replace('class="btn', 'class="hit btn')}</div>
    </div>`;
  return `<div class="sheet"><h3>emphases x states</h3><div class="matrix" style="grid-template-columns:150px repeat(6,minmax(0,1fr))">${head}${grid}</div>
    <div class="spacer"></div><h3>answers · sizes</h3>${choice}${phone}</div>`;
}

const LEG = {
  1: [
    '<b>primary</b>: the cream pill with a dark label and the key inside (A-05). One per screen; the only bright filled thing.',
    '<b>secondary</b>: a surface pill with a hairline edge. Answers, presets and drawer actions. Never beside a primary unless it must be.',
    '<b>text</b>: no container. Ink (review), muted (more…) or danger. Hover is a soft fill, so it still reads as pressable.',
    '<b>focus-visible</b>: a 2 px teal outline 3 px outside the shape, identical on every emphasis and both themes.',
    '<b>loading</b>: the label becomes “working…” and a 16 px mini ring appears (the only motion). Input is ignored meanwhile.',
    '<b>touch</b>: M 44, L 52, S 40 (dashed = real box, always ≥ 40). The key hint inside buttons is hidden on touch.',
    '<b>answer states</b>: correct = teal edge + ✦, wrong = amber edge + !. A glyph always accompanies the colour.',
  ],
  2: [
    '<b>primary</b>: the same cream pill with the key inside. One per screen.',
    '<b>secondary</b>: an outlined pill (1 px, no fill). Lighter than a filled pill, so a row of answers stays calm. Hover fills 6 %.',
    '<b>text</b>: no container; hover underlines instead of filling. Quietest form, closest to A-05 “review”.',
    '<b>focus-visible</b>: the same 2 px teal outline, 3 px off. Always visible, never only a colour change.',
    '<b>loading</b>: “working…” with the 16 px mini ring; the outline stays, input is ignored.',
    '<b>touch</b>: M 44, L 52, S 40 (dashed = real box). Underline-on-hover has no touch equivalent, so pressed = muted.',
    '<b>answer states</b>: correct = teal edge + ✦, wrong = amber edge + !.',
  ],
  3: [
    '<b>primary</b>: teal, 12 px radius, key tinted inside. The accent colour now means “do this”. Teal also means good and on elsewhere.',
    '<b>secondary</b>: a surface-2 fill with a hairline edge, 12 px radius. Same as option ① apart from the corner.',
    '<b>text</b>: teal text; muted and danger tones available. Hover = a soft teal fill.',
    '<b>focus-visible</b>: a 2 px cream (ink) outline, because teal on teal would vanish.',
    '<b>loading</b>: “working…” with the 16 px mini ring on the teal fill.',
    '<b>touch</b>: M 44, L 52, S 40 (dashed = real box). Same sizes as the other options.',
    '<b>answer states</b>: correct = teal edge + ✦, wrong = amber edge + !.',
  ],
};

function resultsFrame() {
  const actions = [B('primary', 'next scramble', { size: 'l', kbd: 'space', co: '1' }), B('text', 'review', { co: '2' }), B('text', 'more…', { tone: 'muted', co: '3' })].join('');
  return S.results({ actions, keybar: keybar([['[ ]', 'markers']]) });
}
const LEG_RES = {
  1: ['<b>one primary</b> per screen, A-05’s cream pill with the space key inside (L 48).', '<b>review</b> is a text button (ink). It is a real action, so it is bold and ink.', '<b>more…</b> is the muted text button; +2, DNF, pin, share, delete and export live behind it. Three actions, never more.'],
  2: ['<b>one primary</b>: the same cream pill. Identical to ① here; the options differ in secondary and text.', '<b>review</b> as a text button; hovering underlines it. No container, closest to the frame as drawn.', '<b>more…</b> muted text. Three actions, never more.'],
  3: ['<b>one primary</b>, now teal with a 12 px radius. It competes with the teal good-markers on the orbit and the ring glow.', '<b>review</b> is teal text, so the whole action row is teal-on-dark.', '<b>more…</b> muted text. Three actions, never more.'],
};

function settingsFrame() {
  const row = (t, d, b) => `<div class="row"><div><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div>${b}</div>`;
  const drawer = `<div class="drawer">
    <div class="dh"><h2>settings</h2>${B('icon', '', { aria: 'close', co: '1' })}</div>
    <div class="sec">cube</div>
    ${row('recenter cube', 'use the way it faces now as front', B('secondary', 'recenter', { size: 's', co: '2' }))}
    ${row('sync solved cube', 'when the app and the cube disagree', B('secondary', 'sync', { size: 's' }))}
    ${row('forget saved cube', 'removes GAN 356 i3 from this device', B('text', 'forget', { size: 's', tone: 'danger', co: '3' }))}
    <div class="sec">app</div>
    ${row('version 0.14.2', 'everything stays on this device', B('text', 'check for update', { size: 's' }))}
    ${row('save recording', 'includes the connection log', B('secondary', 'save', { size: 's' }))}
    <div style="margin-top:auto;display:flex;justify-content:flex-end;gap:10px;align-items:center">${B('text', 'clear history', { tone: 'danger' })}${B('primary', 'done', { co: '4' })}</div>
  </div>`;
  return S.drawerScene({ drawer });
}
const LEG_SET = {
  1: ['<b>close</b> is the icon-only form (40, hover = a surface disc). It never carries a label.', '<b>row-end secondary S</b>: one action per row, on the right; S 32 on desktop, 40 on touch.', '<b>danger</b> is a text button in the DNF colour, never a filled red; the destructive step asks for confirmation.', '<b>one primary</b> (done) in the drawer footer, with the destructive text beside it.'],
  2: ['<b>close</b> is the icon-only form (40, plain; outline on hover).', '<b>row-end secondary S</b>: an outlined pill, lighter than a fill when there are many rows.', '<b>danger</b>: text in the DNF colour; underline on hover.', '<b>one primary</b> (done) in the footer.'],
  3: ['<b>close</b> is the icon-only form, 12 px radius.', '<b>row-end secondary S</b>: a filled 12 px rect.', '<b>danger</b>: text in the DNF colour. Teal text buttons (check for update) sit beside it.', '<b>one primary</b> (done): the teal rectangle.'],
};

function drillFrame() {
  const answers = [B('choice', 'OLL21', { kbd: '1' }), B('choice', 'OLL27', { kbd: '2', state: 'is-focus', co: '1' }), B('choice', 'OLL31', { kbd: '3', glyph: badGlyph, dataState: 'bad', co: '2' }), B('choice', 'OLL33', { kbd: '4', glyph: goodGlyph, dataState: 'good' }), '<span style="width:12px"></span>', B('text', 'skip', { tone: 'muted', kbd: 's', co: '3' })].join('');
  return S.drill({ answers, keybar: keybar([['1-4', 'answer'], ['space', 'skip'], ['esc', 'end round']]) });
}
const LEG_DRILL = {
  1: ['<b>answers are secondary pills</b> (L 48) with the number key leading; keyboard focus is the 2 px outline.', '<b>after answering</b>: the picked wrong one gets an amber edge + !, the right one a teal edge + ✦.', '<b>skip</b> is a muted text button with its key. The four answers are one choice set, not four actions; the screen still has one extra action.'],
  2: ['<b>answers are outlined pills</b> (L 48): the calmest row, the cube stays the centrepiece.', '<b>after answering</b>: amber edge + ! on the wrong pick, teal edge + ✦ on the right one.', '<b>skip</b> is muted text with its key; hover underlines.'],
  3: ['<b>answers are filled 12 px rects</b>; the primary teal never appears here, so teal keeps meaning “right”.', '<b>after answering</b>: amber edge + ! on the wrong pick, teal edge + ✦ on the right one.', '<b>skip</b> is muted text with its key.'],
};

function phoneFrames() {
  const left = S.phoneDrill({
    answers: [B('choice', 'OLL21', { kbd: '1', co: '1' }), B('choice', 'OLL27', { kbd: '2' }), B('choice', 'OLL31', { kbd: '3' }), B('choice', 'OLL33', { kbd: '4' })].join(''),
    stop: B('text', 'stop', { tone: 'muted', co: '2' }),
  });
  const right = S.phoneResults({
    actions: B('primary', 'next scramble', { size: 'l', co: '3' }) + `<div style="display:flex;justify-content:center;gap:12px">${B('text', 'review')}${B('text', 'more…', { tone: 'muted' })}</div>`,
  });
  return `<div style="display:flex;gap:44px;padding:28px;justify-content:center;background:var(--b-canvas)"><div class="touch">${left}</div><div class="touch">${right}</div></div>`;
}
const LEG_PHONE = {
  1: ['<b>answers</b>: 2 x 2 grid, each pill 52 high (≥ 40). The number key is hidden on touch.', '<b>stop</b>: a text button, 44 high, centred at the bottom (thumb reach).', '<b>primary</b> is full width, 52 high; review and more… are 44-high text buttons under it.'],
  2: ['<b>answers</b>: 2 x 2 outlined pills, 52 high.', '<b>stop</b>: a text button, 44 high.', '<b>primary</b> full width, 52 high; review and more… are 44-high text buttons.'],
  3: ['<b>answers</b>: 2 x 2 rects, 52 high, 12 px radius.', '<b>stop</b>: a text button, 44 high.', '<b>primary</b> full width, 52 high, teal; review and more… 44-high text.'],
};

function compareFrame() {
  const rows = [1, 2, 3].map(n => { const c = k => (n === 1 ? k : ''); return `<div class="o${n}" style="display:contents">
    <div class="colhead" style="font-size:13px"><b style="color:var(--b-ink)">${['①', '②', '③'][n - 1]}</b> ${NAMES[n]}</div>
    <div class="cell">${B('primary', 'next scramble', { size: 'l', kbd: 'space', co: c('1') })}</div>
    <div class="cell">${B('secondary', 'recenter', { co: c('2') })}</div>
    <div class="cell">${B('text', 'review', { co: c('3') })}${B('text', 'more…', { tone: 'muted' })}</div>
    <div class="cell">${B('icon', '', { aria: 'close' })}</div>
    <div class="cell">${B('choice', 'OLL27', { kbd: '2', co: c('4') })}</div>
  </div>`; }).join('');
  return `<div class="sheet"><div class="matrix" style="grid-template-columns:150px 250px 160px 220px 64px 1fr;gap:26px 18px"><div></div>${['primary', 'secondary', 'text · text muted', 'icon', 'answer'].map(h => `<div class="colhead">${h}</div>`).join('')}${rows}</div></div>`;
}
const LEG_CMP = [
  '<b>primary colour</b>: cream (① ②, as A-05) or teal (③, today’s dominant look). Cream keeps teal for “good / on”.',
  '<b>secondary</b>: a filled surface pill (① ③) or an outlined pill (②).',
  '<b>text</b>: ink, with a soft fill on hover (①), an underline (②) or teal text (③).',
  '<b>shape</b>: pill (① ②, the control radius token) or 12 px (③, the bar radius token).',
];

const views = {
  compare: { frame: compareFrame, legend: LEG_CMP, cols: 2, name: 'the three options side by side' },
  states: { frame: statesFrame, legend: LEG[opt], cols: 2, name: 'states, dark and light', width: 1440 },
  results: { frame: resultsFrame, legend: LEG_RES[opt], cols: 3, name: 'in context: results actions (A-05)' },
  settings: { frame: settingsFrame, legend: LEG_SET[opt], cols: 2, name: 'in context: settings drawer (light)' },
  drill: { frame: drillFrame, legend: LEG_DRILL[opt], cols: 3, name: 'in context: drill answers (A-08)' },
  phone: { frame: phoneFrames, legend: LEG_PHONE[opt], cols: 3, name: 'in context: phone (A-09), touch sizes', width: 900 },
};
const v = views[view];
document.documentElement.dataset.theme = view === 'settings' && !q.get('theme') ? 'light' : theme;
mount({
  id: `${q.get('id') || ID[view]}${view === 'compare' ? '' : ` · option ${opt}`}`,
  name: view === 'compare' ? `W-04 buttons · ${v.name}` : `W-04 buttons · ${['①', '②', '③'][opt - 1]} ${NAMES[opt]} · ${v.name}`,
  frame: `<div class="o${opt}" style="display:contents">${v.frame()}</div>`,
  legend: withLegend ? v.legend : [],
  cols: v.cols,
  width: v.width,
});
