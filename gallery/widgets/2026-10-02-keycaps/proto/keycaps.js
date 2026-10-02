/* global document */
import { q, mount, theme } from '../../_proto/common.js';
import * as S from '../../_proto/scenes.js';

const opt = ['1', '2', '3'].includes(q.get('opt')) ? q.get('opt') : '1';
const view = q.get('view') || 'states';
const withLegend = q.get('legend') !== '0';
const NAMES = { 1: 'flat', 2: 'bevel', 3: 'outline' };
const ID = { states: 'W-17-01', idle: 'W-17-02', button: 'W-17-03', results: 'W-17-04' };

/** A keycap. size s (bar, 20) | '' (22) | m (24). */
const K = (t, { size = 's', state = '', co = '' } = {}) => `<kbd class="key key--${size} ${state}" ${co ? `data-co="${co}"` : ''}>${t}</kbd>`;
const PAIR = (a, b, { size = 's', down = '', state = '', co = '' } = {}) => `<kbd class="key key--${size} key--pair ${state}" ${co ? `data-co="${co}"` : ''}><i class="${down === 'a' || down === 'both' ? 'is-down' : ''}">${a}</i><i class="${down === 'b' || down === 'both' ? 'is-down' : ''}">${b}</i></kbd>`;
const BAR = items => `<div class="kbar">${items.map(([k, v, st]) => `<span class="${st === 'is-off' ? 'is-off' : ''}">${k}${v}</span>`).join('')}</div>`;
const bar = (k, v, o) => [k, v, o];

const COLS = [['default', ''], ['pressed (key is down)', 'is-down'], ['held (space arms the timer)', 'is-held'], ['unavailable', 'is-off']];

function statesFrame() {
  const rows = [
    ['letter · S 20', st => K('s', { state: st, co: st === '' ? '1' : '' })],
    ['word · S 20', st => K('space', { state: st })],
    ['word · M 24', st => K('enter', { size: 'm', state: st })],
    ['range', st => K('1-4', { state: st })],
    ['pair (one cap)', st => PAIR('[', ']', { state: st, down: st === 'is-down' ? 'b' : st === 'is-held' ? 'both' : '', co: st === 'is-down' ? '2' : '' })],
    ['arrows', st => PAIR('‹', '›', { state: st, down: st === 'is-down' ? 'a' : st === 'is-held' ? 'both' : '' })],
    ['on a primary', st => `<span class="on-primary pill primary ${st === 'is-down' ? 'is-down' : ''}" style="height:44px">start ${K('space', { size: 'm', state: st, co: st === 'is-held' ? '3' : '' })}</span>`],
    ['on a secondary', st => `<span class="on-secondary pill sec ${st === 'is-off' ? 'is-off' : ''}" style="height:44px">OLL27 ${K('2', { size: 'm', state: st, co: st === '' ? '4' : '' })}</span>`],
    ['key bar', st => BAR([bar(K('space', { state: st }), 'next scramble'), bar(K('esc', { state: st === 'is-off' ? '' : '' }), 'back')].slice(0, st === 'is-off' ? 1 : 2).map(a => a))],
  ];
  const head = `<div></div>${COLS.map(([n]) => `<div class="colhead">${n}</div>`).join('')}`;
  const grid = rows.map(([n, f]) => `<div class="colhead">${n}</div>${COLS.map(([, st]) => `<div class="cell">${f(st)}</div>`).join('')}`).join('');
  const set = ['space', 'enter', 'esc', 'tab', '`', 's', 'r', 'n', 't', 'b', '1-4', 'q-p'].map(t => K(t)).join('') + PAIR('[', ']') + PAIR('‹', '›') + PAIR('↑', '↓');
  return `<div class="sheet"><h3>keycaps x states</h3><div class="matrix" style="grid-template-columns:150px repeat(4,minmax(0,1fr))">${head}${grid}</div>
    <div class="spacer"></div><h3>the glyph set (lowercase, literal; ranges and pairs are one cap)</h3><div class="glyphs" data-co="5" data-co-side="tl">${set}</div></div>`;
}

const LEG = {
  1: [
    '<b>flat key</b>: the A-frame look. A key-colour fill, radius 6, DM Mono 11 / 500, 20 px high in the bar and 24 px inside buttons.',
    '<b>pressed</b>: the cap inverts (ink fill, bg text) while the real key is down. A pair lights only the half that is down.',
    '<b>held</b>: teal fill while a hold is arming (the timer’s space, 0.3 s). Teal stays reserved for good / on.',
    '<b>inside a button</b>: inverse on a primary, inset on a secondary. Hidden on touch (the button text is the verb).',
    '<b>glyph set</b>: lowercase literal text; a range (1-4) and a pair ([ ]) are one cap, never two.',
  ],
  2: [
    '<b>bevel key</b>: a fill with a hairline edge and a 2 px lip underneath, like a real cap. The most recognisable as a key.',
    '<b>pressed</b>: the cap sinks 2 px and the lip disappears. The only motion, 90 ms.',
    '<b>held</b>: sunk, with a teal edge and a soft teal fill.',
    '<b>inside a button</b>: the lip stays, so a cap on the cream primary reads as a physical key.',
    '<b>glyph set</b>: the same glyphs; the lip adds 2 px of height to every row of the key bar.',
  ],
  3: [
    '<b>outline key</b>: no fill, a 1 px edge and muted text. Calmest in the key bar (monkeytype-like), but the weakest on the cream primary.',
    '<b>pressed</b>: the outline fills with ink, so the change is large at a glance.',
    '<b>held</b>: a teal edge with a soft teal fill.',
    '<b>inside a button</b>: an outline in the button’s text colour at 50 %.',
    '<b>glyph set</b>: the same glyphs and sizes as the other options.',
  ],
};

function idleFrame() {
  const actions = `<span class="on-primary pill primary" data-co="1">start ${K('space', { size: 'm' })}</span>`;
  const keybar = BAR([bar(K('tab'), 'settings'), bar(K('esc'), 'command')]);
  return S.idle({ actions, keybar, meta: '<span class="meta" data-co="3" data-co-side="tl">ao5 14.62 · ao12 15.03 · pb 12.41</span>' }).replace('data-scene="idle"', 'data-scene="idle"').replace(/<div class="abs " style="position:absolute;left:48px;bottom:16px/, '<div class="abs " data-co="2" data-co-side="tl" style="position:absolute;left:48px;bottom:16px');
}
const LEG_IDLE = {
  1: ['<b>space inside the primary</b>: an inverse flat cap (24 px) on the cream pill, as in A-01.', '<b>key bar</b>: one row, bottom-left, at most 3 keys, cap then one lowercase verb; only keys that are live now.', '<b>not a key</b>: the stats line is plain mono text, so a cap always means “press this”.'],
  2: ['<b>space inside the primary</b>: a bevelled cap with a visible lip on the cream pill.', '<b>key bar</b>: bevel caps are 2 px taller, so the bar looks heavier than A-01.', '<b>not a key</b>: the stats line stays plain text.'],
  3: ['<b>space inside the primary</b>: an outline cap at 50 % of the label colour. Quiet, and still readable.', '<b>key bar</b>: outline caps, the lightest bar of the three.', '<b>not a key</b>: the stats line stays plain text.'],
};

function buttonFrame() {
  const answers = [1, 2, 3, 4].map((n, i) => `<span class="on-secondary pill sec" ${i === 0 ? 'data-co="1"' : ''}>OLL${['21', '27', '31', '33'][i]} ${K(String(n), { size: 'm' })}</span>`).join('')
    + '<span style="width:10px"></span>' + `<span class="pill txt" data-co="2">skip ${K('s', { size: 'm' })}</span>`;
  const keybar = BAR([bar(K('space'), 'skip'), bar(K('esc'), 'end round')]);
  return S.drill({ answers, keybar });
}
const LEG_BTN = {
  1: ['<b>answer keys lead</b> the label: 1 to 4 inside each pill, an inset cap on the surface fill.', '<b>skip</b> keeps its key at the end (s). Keys are decoration on touch and are hidden there.', '<b>the bar drops “1-4 answer”</b> because the answers carry their own keys, so a key is never shown twice.'],
  2: ['<b>answer keys lead</b> the label, each a small bevel cap.', '<b>skip</b> keeps its bevel cap (s).', '<b>the bar drops “1-4 answer”</b>: the answers carry their keys.'],
  3: ['<b>answer keys lead</b> the label as outline caps; the least visual weight next to the cube.', '<b>skip</b> with an outline cap (s).', '<b>the bar drops “1-4 answer”</b>: the answers carry their keys.'],
};

function resultsFrame() {
  const actions = `<span class="on-primary pill primary" data-co="3">next scramble ${K('space', { size: 'm' })}</span><span class="pill txt ink">review</span><span class="pill txt">more…</span>`;
  const keybar = BAR([bar(PAIR('[', ']', { down: 'b', co: '1' }), 'markers', ''), bar(K('esc'), 'back'), bar(K('r', { state: 'is-off' }), 'retry', 'is-off')]);
  return S.results({ actions, keybar });
}
const LEG_RES = {
  1: ['<b>a pair is one cap</b> ([ ]); the half that is down inverts while you step to the next marker.', '<b>unavailable</b>: a key that does nothing right now is dimmed (r retry), not removed, so the bar does not jump. 3 keys max.', '<b>primary</b>: space on the cream pill, at rest.'],
  2: ['<b>a pair is one cap</b>; the pressed half sinks 2 px.', '<b>unavailable</b>: outlined and flat (no lip).', '<b>primary</b>: space with its lip.'],
  3: ['<b>a pair is one cap</b>; the pressed half fills with ink.', '<b>unavailable</b>: a faint outline.', '<b>primary</b>: an outline cap.'],
};

function compareFrame() {
  const rows = [1, 2, 3].map(n => `<div class="o${n}" style="display:contents">
    <div class="colhead" style="font-size:13px"><b style="color:var(--b-ink)">${['①', '②', '③'][n - 1]}</b> ${NAMES[n]}</div>
    <div class="cell">${BAR([bar(K('space', { co: n === 1 ? '1' : '' }), 'next'), bar(PAIR('[', ']'), 'markers'), bar(K('esc'), 'back')])}</div>
    <div class="cell"><span class="on-primary pill primary" ${n === 1 ? 'data-co="2"' : ''}>start ${K('space', { size: 'm' })}</span></div>
    <div class="cell"><span class="on-secondary pill sec">OLL27 ${K('2', { size: 'm' })}</span></div>
    <div class="cell">${K('s', { state: 'is-down' })}&nbsp;${K('space', { state: 'is-held', co: n === 1 ? '3' : '' })}&nbsp;${K('r', { state: 'is-off' })}</div>
  </div>`).join('');
  return `<div class="sheet"><div class="matrix" style="grid-template-columns:150px 380px 190px 190px 1fr;gap:30px 18px"><div></div>${['key bar', 'on a primary', 'on a secondary', 'pressed · held · unavailable'].map(h => `<div class="colhead">${h}</div>`).join('')}${rows}</div></div>`;
}
const LEG_CMP = [
  '<b>fill</b>: a flat key-colour fill (①), a bevelled cap with a lip (②) or an outline with no fill (③).',
  '<b>weight</b>: ③ is the lightest in the bar, ② the heaviest. ① is the A-frame look.',
  '<b>pressed / held</b>: ① and ③ change colour only; ② also moves 2 px.',
  '<b>all three</b>: 20 / 24 px, lowercase DM Mono, one cap for a range or a pair, hidden on touch.',
];

const views = {
  compare: { frame: compareFrame, legend: LEG_CMP, cols: 2, name: 'the three options side by side' },
  states: { frame: statesFrame, legend: LEG[opt], cols: 2, name: 'states, dark and light' },
  idle: { frame: idleFrame, legend: LEG_IDLE[opt], cols: 3, name: 'in context: key bar and start key (A-01)' },
  button: { frame: buttonFrame, legend: LEG_BTN[opt], cols: 3, name: 'in context: keycaps inside buttons (A-08)' },
  results: { frame: resultsFrame, legend: LEG_RES[opt], cols: 3, name: 'in context: results key bar (A-05)' },
};
const v = views[view];
mount({
  id: `${q.get('id') || ID[view]}${view === 'compare' ? '' : ` · option ${opt}`}`,
  name: view === 'compare' ? `W-17 keycaps · ${v.name}` : `W-17 keycaps · ${['①', '②', '③'][opt - 1]} ${NAMES[opt]} · ${v.name}`,
  frame: `<div class="o${opt}" style="display:contents">${v.frame()}</div>`,
  legend: withLegend ? v.legend : [],
  cols: v.cols,
});
document.documentElement.dataset.theme = theme;
