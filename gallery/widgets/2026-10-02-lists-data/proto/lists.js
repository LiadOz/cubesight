/* global document, window */
// Lists and data proposal: W-11 rows (with the mini Orbit glyph), W-19 stats, W-18 badges/tags, W-25 empty states, W-30 eyebrows.
import { q, mount, header, cubeSVG, orbitSVG, arcPath, resultsSegs, resultsMarkers } from '../../_proto/common.js';

const UI = window.UI;
const view = q.get('view') || 'history';
const opt = q.get('opt') || '1';
const boardId = q.get('id') || 'L';
const NAMES = { 1: 'open rows', 2: 'banded rows', 3: 'hairline list' };

const abs = (style, html, extra = '') => `<div class="abs" ${extra} style="${style}">${html}</div>`;
const co = (n) => (n ? `data-co="${n}"` : '');
const k = (g, size = 's') => `<kbd class="key key--${size}">${g}</kbd>`;
const kp = (a, b, size = 's') => `<span class="kp">${k(a, size)}${k(b, size)}</span>`;
const kbi = (c, l) => `<span class="kbi">${c}<span>${l}</span></span>`;
const kbar = (...a) => `<div class="kbar">${a.join('')}</div>`;
const primary = (label, cap = '', n = 0, size = 'btn--l') => `<span class="on-primary" ${co(n)}><button class="btn btn--primary ${size}" type="button"><span>${label}</span>${cap}</button></span>`;
const secondary = (label, n = 0, size = '') => `<span class="on-secondary" ${co(n)}><button class="btn btn--secondary ${size}" type="button"><span>${label}</span></button></span>`;
const textBtn = (label) => `<button class="btn btn--text btn--muted" type="button">${label}</button>`;
const sel = (l, items, i = 0) => UI.sel(l, items, i, { cls: 'sel--sm' });

/* ---------------------------------------------------------------- the mini Orbit glyph */
// str: one letter per segment: n neutral, g good, w warn, f future. sections: run lengths (a wider gap between runs).
function glyph(str, o = {}) {
  const size = o.size || 40; const c = 20; const r = 16; const n = str.length;
  const bounds = new Set(); if (o.sections) { let a = 0; o.sections.slice(0, -1).forEach((s) => { a += s; bounds.add(a); }); }
  const gap = (i) => (bounds.has(i) ? 30 : 9);
  const total = 360 - Array.from({ length: n }, (_, i) => gap(i)).reduce((s, x) => s + x, 0);
  const w = total / n; let a = gap(0) / 2; let out = '';
  const cap = (1.75 / r) * (180 / Math.PI);
  for (let i = 0; i < n; i += 1) {
    const a0 = a; const a1 = a0 + w; a = a1 + (i + 1 < n ? gap(i + 1) : gap(0));
    const s0 = a0 + cap; const s1 = Math.max(a1 - cap, s0 + 0.5);
    out += `<path class="${str[i]}" d="${arcPath(c, c, r, s0, s1)}"/>`;
  }
  (o.dots || []).forEach((d) => { const rad = ((d.a - 90) * Math.PI) / 180; out += `<circle class="d${d.k}" cx="${(c + (r + 4.6) * Math.cos(rad)).toFixed(1)}" cy="${(c + (r + 4.6) * Math.sin(rad)).toFixed(1)}" r="1.7"/>`; });
  if (o.center) out += `<text class="c" x="${c}" y="${c + 4}" ${o.cfs ? `style="font-size:${o.cfs}px"` : ''}>${o.center}</text>`;
  return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">${out}</svg>`;
}
const STAR = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0.8L7.4 4.6L11.2 6L7.4 7.4L6 11.2L4.6 7.4L0.8 6L4.6 4.6Z"/></svg>';
const RING = '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.4"/></svg>';
const tg = (kind, text) => `<span class="tg tg-${kind}">${kind === 'g' ? STAR : RING}${text}</span>`;
const bd = (text, cls = '') => `<span class="bd ${cls}">${text}</span>`;
const eyebrow = (t) => `<span class="eyebrow">${t}</span>`;
const shead = (left, end = '', cnt = '', n = 0) => `<div class="shead"><span ${co(n)}>${eyebrow(left)}</span>${cnt ? `<span class="cnt">${cnt}</span>` : ''}${end ? `<span class="end">${end}</span>` : ''}</div>`;
const stat = (l, v, d = '', o = {}) => `<div class="stat ${o.sm ? 'sm' : ''}"><span class="l">${l}</span><span class="v ${o.acc ? 'acc' : ''}">${v}</span>${d ? `<span class="d ${d.startsWith('−') ? 'pos' : d.startsWith('+') ? 'neg' : ''}">${d}</span>` : ''}</div>`;
const empty = (sentence, hint, action, n = 0) => `<div class="empty" ${co(n)}><svg class="glyph" width="64" height="64" viewBox="0 0 40 40" aria-hidden="true"><circle class="e" cx="20" cy="20" r="15"/><circle class="ed" cx="20" cy="5" r="2.2"/></svg><div class="s">${sentence}</div><div class="h">${hint}</div>${action}</div>`;

/* ---------------------------------------------------------------- data */
const SOLVES = [
  { n: 23, t: '14.07', d: '−0.96', g: 'gnnnwnnnn', tags: [['g', 'EO skip'], ['w', 'cross detour']], w: '17:33', sel: true },
  { n: 22, t: '14.83', d: '−0.20', g: 'nnwnnnnnn', tags: [], w: '17:29' },
  { n: 21, t: '14.55', d: '−0.48', g: 'nnnnnnnnn', tags: [], w: '17:24' },
  { n: 20, t: '15.36', d: '+0.33', g: 'nwnnnnwnn', tags: [], w: '17:20' },
  { n: 19, t: '14.97+', d: '', g: 'nnwnnnnnn', tags: [['w', 'slow pair 4'], ['g', 'clean cross']], w: '17:17', plus: true },
  { n: 18, t: '15.94', d: '+0.91', g: 'ngnnnnwnn', tags: [['g', 'optimal x-cross'], ['g', 'clean cross']], w: '17:12' },
  { n: 17, t: '12.41', d: '', g: 'gnnnnngnn', tags: [['g', 'PLL skip'], ['g', 'optimal x-cross']], w: '17:08', pb: true },
];
const SOLVES2 = [
  { n: 13, t: '18.40', d: '+3.37', g: 'nwnnnngnn', tags: [['g', 'PLL skip'], ['g', 'best pair chosen']], w: '08:51' },
  { n: 12, t: '15.02', d: '−0.01', g: 'wnnnnnwnn', tags: [['w', 'cancelled 2 moves'], ['w', 'slow pair 4']], w: '08:46' },
  { n: 11, t: '14.36', d: '−0.67', g: 'nnngnnnnw', tags: [['g', 'clean cross'], ['w', 'slow pair 4']], w: '08:41' },
];
const dots = (g) => [...g].map((c, i) => (c === 'g' || c === 'w' ? { a: (i + 0.5) * 40, k: c } : null)).filter(Boolean).slice(0, 1);

function hrow(h, { ph = false, hist = true } = {}) {
  const d = h.d ? `<small class="${h.d.startsWith('−') ? 'pos' : 'neg'}">${h.d}</small>` : '';
  const tm = `<span class="tm"><span style="${h.plus ? 'color:var(--b-warn-text)' : ''}">${h.t}</span>${d}${h.pb ? bd('PB', 'bd-pb') : ''}</span>`;
  if (ph) {
    return `<div class="lrow ph ${h.sel ? 'is-sel' : ''}" style="--cols:40px 1fr auto;min-height:60px;gap:0 12px">${glyph(h.g, { size: 36 })}<div style="display:grid;gap:5px">${tm}<span class="tags" style="gap:10px">${h.tags.slice(0, 1).map(([kk, t]) => tg(kk, t)).join('')}</span></div><span class="endcell"><span class="when">${h.w}</span><span class="go">open ›</span></span></div>`;
  }
  return `<div class="lrow ${h.sel ? 'is-sel' : ''}" style="min-height:50px"><span class="no">#${h.n}</span>${glyph(h.g, { size: 40, dots: dots(h.g) })}${tm}<span class="tags">${h.tags.map(([kk, t]) => tg(kk, t)).join('')}</span><span class="endcell"><span class="when">${h.w}</span><span class="go">open ›</span></span></div>`;
}

/* ---------------------------------------------------------------- views */
function vHistory() {
  const list = `<div class="list">${SOLVES.slice(0, 6).map((h) => hrow(h)).join('')}</div>`;
  const list2 = `<div class="list">${SOLVES2.slice(0, 2).map((h) => hrow(h)).join('')}</div>`;
  const left = `<div class="page" style="width:740px">
    <div class="phead"><h1>history</h1></div>
    <div class="row" style="gap:26px;margin:14px 0 14px;align-items:center">${glyph('nnngnwnnnnwgnnnnnwnnnnng', { size: 80, center: '23', cfs: 13 })}
      <div style="display:grid;gap:4px"><span class="eyebrow">today · 2 sessions</span><div class="stats" data-co-side="l" ${co(2)}>${stat('pb', '12.41', '', { acc: true })}${stat('ao12', '15.03')}${stat('ao5', '14.62')}</div></div></div>
    <div class="filters" style="margin-bottom:14px">${sel('sessions', ['all sessions', 'today', 'this week'])}${sel('focus', ['speed', 'flow', 'learning'])}${sel('cube', ['cube', 'GAN 356 i3'])}</div>
    ${shead('evening · <b>17:33</b> · 14 solves · ao12 15.03', '14 solves', '14 solves', 3)}${list}
    <div style="height:14px"></div>${shead('morning · <b>08:12</b> · 9 solves · ao12 15.9', '9 solves', '9 solves')}${list2}</div>`;
  const right = `${orbitSVG({ cx: 1110, cy: 330, r: 182, segs: resultsSegs, markers: resultsMarkers })}<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(1110, 332, 100)}</svg>
    <div class="clock" style="left:880px;width:460px;top:535px;--clock-size:84px">14.07</div><div class="sub" style="left:880px;width:460px;top:632px;font-size:12px">solve 23 · today 17:33 · speed · cube</div>
    ${abs('left:880px;width:460px;top:668px;display:flex;justify-content:center;gap:14px;align-items:center', `${primary('open this solve', k('enter', 'm'), 5, '')}${textBtn('replay')}`)}`;
  const frame = `<div class="frame">${header({ active: 'history' })}${left}${right}${abs('left:48px;bottom:16px', kbar(kbi(kp('j', 'k'), 'move'), kbi(k('enter'), 'open'), kbi(k('/'), 'search')))}</div>`;
  return { name: `history: sessions and solves, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: [
    '<b>W-11 row + mini Orbit glyph (feedback #2):</b> every solve has its own ring at the left (one arc per stage, teal = good, amber = to fix); the labels sit to the SIDE of it, not around it.',
    '<b>W-19 stats:</b> ' + { 1: 'frameless numbers, a label over a light mono value', 2: 'each number in a soft block', 3: 'one line of text, label then value' }[opt] + '. The session ring on the left is the same glyph at 80 px with the solve count in its slot.',
    '<b>W-30 section head:</b> ' + { 1: 'a mono eyebrow with the session facts and the count at the right', 2: 'a mono eyebrow with the count as a small pill', 3: 'an eyebrow and a hairline that runs to the count' }[opt] + '.',
    '<b>W-11 selected row:</b> ' + { 1: 'a soft fill (the A-07 look); tags are text with a symbol, only PB is a pill (W-18)', 2: 'a lifted block with a 1.5 px edge; every tag is a pill', 3: 'the time turns teal and the row shows "open ›"; tags are text, PB an outline' }[opt] + '.',
    '<b>W-04 primary</b> for the selected solve with its enter cap, replay as a text button; the same pattern as A-07.',
  ] };
}

function algRow(a, sel) {
  return `<div class="lrow ${sel ? 'is-sel' : ''}" style="--cols:44px 168px minmax(0,1fr) 168px 78px"><span>${glyph('n'.repeat(a.m), { size: 40, sections: a.s })}</span><span class="nm">${a.name}<small>${a.set}</small></span><span class="alg">${a.alg}</span><span class="tags" style="gap:8px">${bd('verified', 'bd-ok')}${a.st}</span><span class="num">${a.m}<small>moves</small></span></div>`;
}
const ALGS = [
  { name: 'T-perm', set: 'PLL · adjacent swap', alg: 'R U R′ U′ R′ F R2 U′ R′ U′ R U R′ F′', m: 14, s: [4, 6, 4], st: bd('learned') },
  { name: 'Y-perm', set: 'PLL · diagonal swap', alg: 'F R U′ R′ U′ R U R′ F′ R U R′ U′ R′ F R F′', m: 17, s: [9, 8], st: bd('due', 'bd-due') },
  { name: 'Aa-perm', set: 'PLL · corners', alg: 'x R′ U R′ D2 R U′ R′ D2 R2', m: 9, s: [3, 3, 3], st: bd('learned') },
  { name: 'Ab-perm', set: 'PLL · corners', alg: 'x R2 D2 R U R′ D2 R U′ R', m: 9, s: [3, 3, 3], st: bd('learned') },
  { name: 'Ja-perm', set: 'PLL · adjacent swap', alg: 'R′ U L′ U2 R U′ R′ U2 R L', m: 10, s: [5, 5], st: bd('new') },
  { name: 'Jb-perm', set: 'PLL · adjacent swap', alg: 'R U R′ F′ R U R′ U′ R′ F R2 U′ R′', m: 13, s: [4, 5, 4], st: bd('learned') },
  { name: 'Ua-perm', set: 'PLL · edges', alg: 'R U′ R U R U R U′ R′ U′ R2', m: 11, s: [5, 6], st: bd('due', 'bd-due') },
  { name: 'Ub-perm', set: 'PLL · edges', alg: 'R2 U R U R′ U′ R′ U′ R′ U R′', m: 11, s: [5, 6], st: bd('learned') },
  { name: 'H-perm', set: 'PLL · edges', alg: 'M2 U M2 U2 M2 U M2', m: 7, s: [3, 4], st: bd('new') },
];
function vAlgs() {
  const frame = `<div class="frame">${header({ active: 'algs' })}
    <div class="page" style="right:48px">
      <div class="phead" data-co-side="l" ${co(1)}>${eyebrow('offline algorithm library')}<h1>PLL</h1><div class="sub">21 cases · 17 learned · 2 due</div></div>
      <div class="row" style="margin:18px 0 18px;gap:16px">${UI.seg('set', ['PLL', 'OLL', 'F2L'], 0)}<span class="row" style="gap:8px">${[['all', 1], ['due', 0], ['new', 0]].map(([l, on]) => UI.chip(l, { sel: !!on })).join('')}</span><span style="margin-left:auto">${sel('sort', ['by name', 'by due', 'by speed'])}</span></div>
      ${shead('<b>cases</b> · sorted by name', '9 of 21', '9 of 21', 4)}
      <div class="list" data-co-side="l" ${co(2)}>${ALGS.map((a, i) => algRow(a, i === 0)).join('')}</div></div>
    ${abs('left:48px;bottom:16px', kbar(kbi(kp('↑', '↓'), 'move'), kbi(k('enter'), 'open'), kbi(k('/'), 'search')))}</div>`;
  return { name: `algs: the case list, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: [
    '<b>W-30 page head:</b> an eyebrow, the title, one quiet sentence of facts. The same head on every list page.',
    '<b>W-11 row with the mini Orbit:</b> here the glyph is the algorithm itself, one arc per move with a wider gap between its triggers (no brackets, W-21 rule); the name and the set sit to the side.',
    '<b>W-18 badges:</b> verified (every shown alg is proven) and the state: learned, due, new. ' + { 1: 'Only the status words are tinted; the rest is plain text.', 2: 'All are pills.', 3: 'Outlines, no fills.' }[opt],
    '<b>W-30 section head</b> over the list with the count at the right (' + { 1: 'plain', 2: 'as a pill', 3: 'on a hairline' }[opt] + ').',
  ] };
}

const DRILL = [
  ['OLL 21', 'cross · H shape', 'ggnngnnw', '1.12 s', '100%', ''], ['OLL 27', 'cross · sune', 'nnwnngnn', '1.84 s', '94%', bd('due', 'bd-due')],
  ['OLL 31', 'P shape', 'nwwnnwgn', '2.61 s', '81%', bd('slow', 'bd-due')], ['OLL 33', 'T shape', 'ggnnggnn', '0.92 s', '100%', ''],
  ['OLL 45', 'T shape', 'nnnngnnn', '1.40 s', '97%', ''], ['OLL 37', 'fish', 'nwfffffff', '—', '—', bd('new')],
  ['OLL 26', 'cross · anti-sune', 'nnnnwnnn', '1.95 s', '90%', bd('due', 'bd-due')], ['OLL 57', 'I shape', 'ngnnnngn', '1.33 s', '98%', ''],
];
function drillRow(d, sl) {
  return `<div class="lrow ${sl ? 'is-sel' : ''}" style="--cols:44px 200px minmax(0,1fr) 100px 90px 90px;min-height:52px"><span>${glyph(d[2], { size: 40 })}</span><span class="nm">${d[0]}<small>${d[1]}</small></span><span class="tags"></span><span class="num">${d[3]}<small>mean</small></span><span class="num">${d[4]}<small>right</small></span><span class="endcell">${d[5]}</span></div>`;
}
function vDrill() {
  const frame = `<div class="frame">${header({ active: 'drills' })}
    <div class="page" style="right:48px">
      <div class="phead">${eyebrow('drills / OLL')}<h1>OLL recognition</h1><div class="sub">spaced · 12 due · 57 cases</div></div>
      <div class="stats" data-co-side="l" style="margin:24px 0 26px" ${co(1)}>${stat('combo', '×7', '', { acc: true })}${stat('round avg', '2.31 s', '−0.14')}${stat('best case', '0.92 s')}${stat('right', '94%', '+2%')}${stat('due', '12')}</div>
      ${shead('<b>cases</b> · last 8 answers per case', 'slowest first', 'slowest first', 3)}
      <div class="list" data-co-side="l" ${co(2)}>${DRILL.map((d, i) => drillRow(d, i === 1)).join('')}</div>
      <div class="row" style="margin-top:22px;gap:14px">${primary('start round', k('space', 'm'), 4)}${secondary('only due')}</div></div>
    ${abs('left:48px;bottom:16px', kbar(kbi(k('space'), 'start'), kbi(k('esc'), 'back')))}</div>`;
  return { name: `a drill's case list, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: [
    '<b>W-19 stat blocks</b> (the combo, round average, best case counters of A-08, with a delta): ' + { 1: 'frameless', 2: 'soft blocks', 3: 'one line' }[opt] + '.',
    '<b>W-11 row + glyph:</b> the mini Orbit is the case\'s last 8 answers (teal fast, amber slow or missed, grey not seen yet); the case name and its shape caption to the side; mean and right-rate as small counters at the right.',
    '<b>W-18 badge</b> for the state: due, slow, new. Fast, healthy cases have no badge: no badge is the normal state.',
    '<b>W-04 primary</b> for the one next action, below the list, with the space cap.',
  ] };
}

function vProgress() {
  const drills = [['corner recognition', 'ggnnngngn', '2.31 s', '−0.14', bd('12 due', 'bd-due')], ['OLL recognition', 'nngnnnwng', '1.84 s', '−0.05', bd('2 due', 'bd-due')], ['PLL recognition', 'nnnwnnnnn', '2.02 s', '+0.08', ''], ['F2L pairs', 'nwnnnnnwn', '3.41 s', '+0.20', bd('new')], ['lookahead', 'ggnngnnng', '—', '', '']];
  const week = [['today', 'nnngnwnnnnwg', '23', '15.03'], ['yesterday', 'nngnnnnnnnnn', '31', '15.40'], ['mon', 'nnwnnnnn', '18', '15.92'], ['sun', 'nnnnnnnnnnnnnn', '40', '16.20'], ['sat', 'nnnnw', '9', '16.45']];
  const dRow = (r) => `<div class="lrow" style="--cols:44px minmax(0,1fr) 84px 70px 80px;min-height:52px"><span>${glyph(r[1], { size: 40 })}</span><span class="nm" style="font-size:15px">${r[0]}</span><span class="num">${r[2]}<small>mean</small></span><span class="num ${r[3].startsWith('−') ? 'pos' : r[3].startsWith('+') ? 'neg' : ''}">${r[3]}</span><span class="endcell">${r[4]}</span></div>`;
  const wRow = (r) => `<div class="lrow" style="--cols:44px minmax(0,1fr) 60px 80px;min-height:52px"><span>${glyph(r[1], { size: 40 })}</span><span class="nm" style="font-size:15px">${r[0]}</span><span class="num">${r[2]}<small>solves</small></span><span class="num">${r[3]}<small>ao12</small></span></div>`;
  const frame = `<div class="frame">${header({ active: 'progress' })}
    <div class="page" style="right:48px">
      <div class="row" style="justify-content:space-between;align-items:flex-end"><div class="phead">${eyebrow('your last 30 days')}<h1>progress</h1></div>${UI.seg('period', ['7 d', '30 d', 'all'], 1)}</div>
      <div class="stats" data-co-side="l" style="margin:26px 0 30px" ${co(1)}>${stat('solves', '214', '+31')}${stat('pb', '12.41', '', { acc: true })}${stat('ao12', '15.03', '−0.37')}${stat('ao100', '16.20', '−0.55')}${stat('right in drills', '94%', '+2%')}${stat('due', '14')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 56px">
        <div>${shead('<b>drills</b> · last 10 rounds', '5', '5', 2)}<div class="list">${drills.map(dRow).join('')}</div></div>
        <div>${shead('<b>this week</b> · one arc per solve', 'ao12 per day', '5 days', 3)}<div class="list">${week.map(wRow).join('')}</div></div></div></div></div>`;
  return { name: `progress stats, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: [
    '<b>W-19 stat blocks</b> in one row: label, value, optional delta (green = faster). ' + { 1: 'Frameless: the page is just numbers on the page background.', 2: 'Soft blocks make the row a set of tiles.', 3: 'One line of text, like a sentence under the title.' }[opt],
    '<b>W-11 rows with the glyph</b> for the drills: the ring is the last 10 rounds; the badge says what needs attention.',
    '<b>W-30 section heads</b> with their own count; the two lists sit side by side under one title row.',
    'Progress is shown with the Orbit glyph and numbers only: no bars, no sparklines (feedback #1).',
  ] };
}

function vEmpty() {
  const frame = `<div class="frame">${header({ active: 'history' })}
    <div class="page" style="width:620px"><div class="phead"><h1>history</h1></div>
      <div class="filters" style="margin:18px 0 14px;opacity:.5">${sel('sessions', ['all sessions'])}${sel('focus', ['speed'])}${sel('cube', ['cube'])}</div>
      ${shead('<b>sessions</b>', '0 solves', '0 solves')}
      <div style="margin-top:34px">${empty('No solves yet.', 'Do a solve with a smart cube or the manual timer and it appears here.', primary('start a solve', k('space', 'm'), 0, ''), 1)}</div></div>
    <div class="page" style="left:780px;right:48px;top:94px"><div class="phead"><h1 style="font-size:24px">pins</h1></div>
      <div style="margin-top:14px">${shead('<b>moments and cases</b>', '0 pinned', '0 pinned')}</div>
      <div style="margin-top:6px">${empty('Nothing pinned yet.', 'Pin a moment from a review, or a case from the algs, and it waits here.', secondary('browse algs', 0, ''), 2)}</div>
      <div style="margin-top:46px">${shead('<b>due today</b>', '0 cases', '0 cases')}</div>
      <div style="margin-top:6px">${empty('No cases due.', 'Come back tomorrow, or start a round of anything.', textBtn('start a round'), 3)}</div></div></div>`;
  return { name: `empty states: history, pins, due cases, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: [
    '<b>W-25 empty state:</b> one sentence, one reason or hint, one action, using the same verb as the button (VOICE principle 6). ' + { 1: 'Frameless: a dashed, empty mini Orbit with one teal dot (where the first arc will start), centred in the space.', 2: 'In a soft panel the size of the list it replaces; same empty Orbit.', 3: 'Text only, left aligned under a hairline; no picture.' }[opt],
    '<b>Action</b> is a primary only when the whole page has nothing else to do (history); a quiet secondary or a text button when other things on the page are still useful.',
    '<b>Three sizes of the same pattern:</b> a page (history), a section (pins), a small list (due cases).',
  ] };
}

const PH = (inner) => `<div class="frame phone touch" style="width:390px;height:844px">${inner}</div>`;
const phHdr = (a) => `<div class="hdr" style="padding:0 24px;height:60px"><span class="word" style="font-size:17px;margin:0">cubesight</span><span class="chip-cube" style="font-size:11px"><i class="dot"></i>GAN 356 i3</span></div>`;
function vPhone() {
  const p1 = PH(`${phHdr()}${abs('left:24px;top:70px;right:24px', `<h1 style="margin:0;font:600 28px var(--b-font-sans)">history</h1>
    <div class="row" style="gap:16px;margin:14px 0 12px">${glyph('nnngnwnnnnwgnnnnnwnnnnng', { size: 60, center: '23', cfs: 12 })}<div class="stats" data-co-side="l" style="gap:18px" ${co(1)}>${stat('pb', '12.41', '', { acc: true, sm: true })}${stat('ao12', '15.03', '', { sm: true })}${stat('ao5', '14.62', '', { sm: true })}</div></div>
    ${shead('evening · <b>17:33</b> · 14 solves', '14', '14')}<div class="list" data-co-side="l" ${co(2)}>${SOLVES.slice(0, 6).map((h) => hrow(h, { ph: true })).join('')}</div>`)}`);
  const p2 = PH(`${phHdr()}${abs('left:24px;top:70px;right:24px', `<div class="phead">${eyebrow('offline algorithm library')}<h1 style="font-size:28px">PLL</h1></div>
    <div style="margin:14px 0">${UI.seg('set', ['PLL', 'OLL', 'F2L'], 0)}</div>${shead('<b>cases</b>', '9 of 21', '9 of 21')}
    <div class="list" data-co-side="l" ${co(3)}>${ALGS.map((a) => `<div class="lrow" style="--cols:40px 1fr auto;min-height:60px;gap:0 12px">${glyph('n'.repeat(a.m), { size: 36, sections: a.s })}<span class="nm" style="font-size:15px">${a.name}<small>${a.m} moves</small></span><span>${a.st}</span></div>`).join('')}</div>`)}`);
  const p3 = PH(`${phHdr()}${abs('left:24px;top:70px;right:24px', `<div class="phead"><h1 style="font-size:28px">pins</h1></div><div style="margin-top:14px">${shead('<b>moments and cases</b>', '0 pinned', '0 pinned')}</div>
    <div style="margin-top:80px">${empty('Nothing pinned yet.', 'Pin a moment from a review, or a case from the algs, and it waits here.', secondary('browse algs', 0, ''), 4)}</div>`)}`);
  const frame = `<div class="phones">${p1}${p2}${p3}</div>`;
  return { name: `phone 390 x 844: history, algs list, empty pins, option ${opt} ${NAMES[opt]}`, frame, width: 1290, legend: [
    '<b>W-19 stats on a phone:</b> the same three counters at 22 px next to the session ring (60 px).',
    '<b>W-11 row on a phone:</b> glyph 36 px, the time and ONE tag (the most important) under it, the clock time at the right; rows are 60 px so they are tappable.',
    '<b>Algs list:</b> glyph with the trigger gaps, the name and the move count to the side, one status badge; the alg text is left out on a phone (it is on the case page).',
    '<b>W-25 empty:</b> the same pattern, one action, centred; no keyboard hints on touch.',
  ] };
}

/* ---------------------------------------------------------------- kit and compare */
function kitParts() {
  const rowDemo = (cls, t, g, w) => `<div class="lrow ${cls}" style="--cols:40px 1fr auto">${glyph(g, { size: 36 })}<span class="tm" style="font-size:20px">${t}</span><span class="when">${w}</span></div>`;
  return {
    rows: `<div class="list">${rowDemo('', '14.83', 'nnwnnnnnn', 'default')}${rowDemo('is-hover', '14.55', 'nnnnnnnnn', 'hover')}${rowDemo('is-sel', '14.07', 'gnnnwnnnn', 'selected')}${rowDemo('is-dim', '15.36', 'nwnnnnwnn', 'unavailable')}</div>`,
    glyphs: `<div style="display:grid;grid-template-columns:repeat(4,auto);gap:14px 18px;align-items:end;justify-items:start"><div style="display:grid;gap:6px">${glyph('nnngnwnnn', { size: 28 })}<span class="eyebrow">28</span></div><div style="display:grid;gap:6px">${glyph('nnngnwnnn', { size: 40 })}<span class="eyebrow">40</span></div><div style="display:grid;gap:6px">${glyph('nnngnwnnn', { size: 56, dots: [{ a: 60, k: 'g' }] })}<span class="eyebrow">56</span></div><div style="display:grid;gap:6px">${glyph('nnnnnnnnnnnnnn', { size: 40, sections: [4, 6, 4] })}<span class="eyebrow">alg</span></div></div>
      <div style="display:grid;gap:6px;margin-top:6px"><div class="row" style="gap:10px">${glyph('ggnngnnw', { size: 40 })}${glyph('nnfffffff', { size: 40 })}${glyph('nnngnwnnnnwgnnnnnwnnnnng', { size: 56, center: '23', cfs: 11 })}</div><span class="eyebrow">attempts · not seen · session count</span></div>`,
    stats: `<div style="display:grid;gap:18px"><div class="stats">${stat('pb', '12.41', '', { acc: true })}${stat('ao12', '15.03', '−0.37')}</div><div class="stats">${stat('round avg', '2.31 s', '+0.27')}${stat('combo', '×7', '', { acc: true })}</div></div>`,
    badges: `<div style="display:grid;gap:14px;justify-items:start"><span class="row" style="gap:12px">${tg('g', 'EO skip')}${tg('w', 'slow pair 4')}</span><span class="row" style="gap:10px">${bd('PB', 'bd-pb')}${bd('due', 'bd-due')}${bd('verified', 'bd-ok')}${bd('new')}</span></div>`,
    heads: `${shead('<b>evening</b> · 17:33 · ao12 15.03', '14 solves', '14 solves')}<div style="height:6px"></div>${shead('<b>cases</b>', '9 of 21', '9 of 21')}`,
    empty: empty('No solves yet.', 'Do a solve and it appears here.', secondary('start a solve', 0, 'btn--s')),
  };
}
function vKit() {
  const P = kitParts();
  const frame = `<div class="kit">
    <div class="spec"><h4>list row</h4>${P.rows}<div class="cap"><b>glyph, text, end.</b> Selected, hover and unavailable states. ${{ 1: 'Only the selected row is filled.', 2: 'Every row is a block.', 3: 'Rows are cut by hairlines.' }[opt]}</div></div>
    <div class="spec"><h4>mini Orbit glyph</h4>${P.glyphs}<div class="cap"><b>one arc per item.</b> Teal good, amber to fix, a wider gap for a section. Labels go to the side.</div></div>
    <div class="spec"><h4>stat block</h4>${P.stats}<div class="cap"><b>label, value, delta.</b> ${{ 1: 'Frameless.', 2: 'In a soft block.', 3: 'Reads as a line.' }[opt]}</div></div>
    <div class="spec"><h4>badge and tag</h4>${P.badges}<div class="cap"><b>not interactive.</b> A tag is a finding (symbol + words); a badge is a state (PB, due, new). ${{ 1: 'Text, only PB and status tinted.', 2: 'All pills.', 3: 'Outlines.' }[opt]}</div></div>
    <div class="spec"><h4>section head and empty</h4>${P.heads}${P.empty}<div class="cap"><b>one sentence, one action.</b></div></div></div>`;
  return { name: `the five list parts, option ${opt} ${NAMES[opt]}`, frame, legend: [] };
}
function vCompare() {
  const P = kitParts();
  const col = (o) => `<div data-l="${o}"><div class="cmp-h">option ${o}: ${NAMES[o]}</div>
    <div class="blk">${P.heads}${P.rows}</div><div class="blk">${P.glyphs}</div><div class="blk">${P.stats}</div><div class="blk">${P.badges}</div><div class="blk">${P.empty}</div></div>`;
  return { name: 'the list parts in the three options', frame: `<div class="cmp">${[1, 2, 3].map(col).join('')}</div>`, legend: [] };
}

const VIEWS = { history: vHistory, algs: vAlgs, drill: vDrill, progress: vProgress, empty: vEmpty, phone: vPhone, kit: vKit, compare: vCompare };
const v = VIEWS[view]();
mount({ id: boardId, name: v.name, frame: v.frame, legend: v.legend || [], cols: 1, width: v.width });
const board = document.getElementById('board');
board.dataset.opt = '3';
board.dataset.l = opt;
