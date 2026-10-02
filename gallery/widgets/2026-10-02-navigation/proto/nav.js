/* global document, window */
// Navigation proposal: W-13 tabs and sub-nav, W-26 links + crumbs + the back link, W-27 the header cube chip and its menu.
// Three options on one DOM (data-n = 1 | 2 | 3). Real tokens only; the approved widgets (buttons, ink controls, keycaps, W-16 status,
// frameless containers, list rows with the mini Orbit) are reused as they are.
import { q, mount, cubeSVG, orbitSVG, arcPath, idleSegs } from '../../_proto/common.js';

const UI = window.UI;
const view = q.get('view') || 'menu';
const opt = q.get('opt') || '1';
const boardId = q.get('id') || 'N';
const NAMES = { 1: 'underline tabs, teal links, text chip', 2: 'segmented tabs, underlined links, ring chip', 3: 'side rail, path crumbs, pill chip' };

const abs = (style, html, extra = '') => `<div class="abs" ${extra} style="${style}">${html}</div>`;
const co = (n) => (n ? `data-co="${n}"` : '');
const k = (g, size = 's') => `<kbd class="key key--${size}">${g}</kbd>`;
const kp = (a, b, size = 's') => `<span class="kp">${k(a, size)}${k(b, size)}</span>`;
const kbi = (c, l) => `<span class="kbi">${c}<span>${l}</span></span>`;
const kbar = (...a) => `<div class="kbar">${a.join('')}</div>`;
const primary = (label, cap = '', n = 0, size = 'btn--l') => `<span class="on-primary" ${co(n)}><button class="btn btn--primary ${size}" type="button"><span>${label}</span>${cap}</button></span>`;
const secondary = (label, size = 'btn--s') => `<span class="on-secondary"><button class="btn btn--secondary ${size}" type="button"><span>${label}</span></button></span>`;
const eyebrow = (t) => `<span class="eyebrow">${t}</span>`;
const CHEV = '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>';
const LT = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2L3.5 6l4 4"/></svg>';
const GT = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2l4 4-4 4"/></svg>';
const EXT = '<svg class="ext" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5h5.5V8M9.5 2.5L2.5 9.5"/></svg>';

/* ------------------------------------------------------------------ W-27: the chip */
const S = {
  off: { name: 'no cube', sub: 'connect', cls: 'off' },
  connecting: { name: 'connecting…' },
  syncing: { name: 'GAN 356 i3', sub: 'syncing…' },
  ok: { name: 'GAN 356 i3', pct: 84 },
  desync: { name: 'GAN 356 i3', sub: 'out of sync', tone: 'warn', pct: 84 },
  lost: { name: 'GAN 356 i3', sub: 'connection lost', tone: 'err', pct: 84 },
};
const mini = (inner, spin = false) => `<svg class="cg ${spin ? 'spin' : ''}" viewBox="0 0 16 16" aria-hidden="true"><circle class="t" cx="8" cy="8" r="6.5"/>${inner}</svg>`;
const marc = (cls, a0, a1) => `<path class="${cls}" d="${arcPath(8, 8, 6.5, a0, a1)}"/>`;
function glyph(state, n) {
  const pct = S[state].pct;
  if (state === 'connecting' || state === 'syncing') return mini(marc('a', -90, 10), true);    // the uniform sweep: one colour, no segments
  if (n === '2') {                                                                              // option 2: the glyph is always a ring; its arc is the battery
    if (state === 'off') return mini('');
    if (state === 'desync') return mini(`${marc('w', -90, -90 + 359.9 * pct / 100)}<text x="8" y="11.2" fill="var(--b-warn)">!</text>`);
    if (state === 'lost') return mini(`${marc('e', -90, -90 + 359.9 * pct / 100)}<path class="x" d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>`);
    return mini(marc(pct < 20 ? 'w' : 'a', -90, -90 + 359.9 * pct / 100));
  }
  if (state === 'off') return '<i class="cdot off"></i>';                                       // options 1 and 3: the dot of the A frames
  if (state === 'desync') return mini('<circle class="w" cx="8" cy="8" r="6.5"/><text x="8" y="11.2" fill="var(--b-warn)">!</text>');
  if (state === 'lost') return mini('<circle class="e" cx="8" cy="8" r="6.5"/><path class="x" d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>');
  return '<i class="cdot"></i>';
}
function chip(state, o = {}) {
  const s = S[state]; const n = o.n || opt;
  return `<button type="button" class="cc ${s.cls || ''} ${o.hover ? 'is-hover' : ''} ${o.focus ? 'is-focus' : ''} ${o.noName ? 'name-off' : ''}" aria-haspopup="menu" aria-expanded="${!!o.open}" ${o.co ? co(o.co) : ''}>${glyph(state, n)}<span class="cn">${s.name}</span>${s.sub ? `<span class="cs ${s.tone || ''}">${s.sub}</span>` : ''}${s.pct ? `<span class="cp">${s.pct}%</span>` : ''}${n === '3' ? CHEV : ''}</button>`;
}

/* the menu: same items in the same order in every state (disabled, not removed) */
const ENABLED = (s) => ({ connect: s === 'off' || s === 'lost', sync: s === 'ok' || s === 'desync' || s === 'syncing', recenter: s === 'ok' || s === 'desync', disconnect: s !== 'off', forget: true });
const mi = (label, hint = '', o = {}) => `<div class="mi ${o.dis ? 'dis' : ''} ${o.dng ? 'dng' : ''} ${o.focus ? 'is-focus' : ''} ${o.hover ? 'is-hover' : ''}" role="menuitem" ${o.co ? co(o.co) : ''}><span>${label}</span><span class="h">${hint}</span></div>`;
function items(state, c = {}) {
  const e = ENABLED(state);
  return `${mi('connect cube', '', { dis: !e.connect })}${mi('sync', 'solve the cube first', { dis: !e.sync })}${mi('recenter', 'hold it as you solve', { dis: !e.recenter })}${mi('disconnect', '', { dis: !e.disconnect })}${mi('forget this cube', '', { dng: true })}
    <div class="msep"></div>${mi('save recording', 'file + connection log', { co: c.rec })}${mi('report a problem', 'adds a note', {})}${mi('dev drawer', k('`', 's'), {})}`;
}
const STATUS = {
  off: ['No cube. Connect to start.', 'off'], connecting: ['Looking for your cube…', 'work'], syncing: ['Solve the cube, then sync.', 'work'],
  ok: ['Connected. In sync.', 'ok'], desync: ['Out of sync. Solve it, then sync.', 'warn'], lost: ['Lost the connection.', 'err'],
};
const NEXT = { off: ['connect cube', 'primary'], connecting: ['stop', 'secondary'], syncing: ['sync', 'secondary'], ok: null, desync: ['sync', 'primary'], lost: ['connect cube', 'primary'] };
const stIcon = (t) => ({ off: '<i class="cdot off"></i>', ok: '<i class="cdot"></i>', work: mini(marc('a', -90, 10), true), warn: mini('<circle class="w" cx="8" cy="8" r="6.5"/><text x="8" y="11.2" fill="var(--b-warn)">!</text>'), err: mini('<circle class="e" cx="8" cy="8" r="6.5"/><path class="x" d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>') }[t]);
function menuA(state, style = '', c = {}) {
  const sub = { ok: 'GAN Gen4 · 84% · in sync', desync: 'GAN Gen4 · 84% · out of sync', off: 'no cube saved', connecting: 'searching', syncing: 'GAN Gen4 · 84%', lost: 'GAN Gen4 · last seen 84%' }[state];
  return `<div class="menu ${c.cls || ''}" role="menu" style="${style}"><div class="mh"><b>${S[state].name === 'no cube' ? 'No cube' : S[state].name === 'connecting…' ? 'Connecting' : 'GAN 356 i3'}</b><span class="msub">${sub}</span></div>${items(state, c)}</div>`;
}
function menuB(state, style = '', c = {}) {
  const [text, tone] = STATUS[state]; const nx = NEXT[state];
  const act = nx ? `<span class="${nx[1] === 'primary' ? 'on-primary' : 'on-secondary'}"><button class="btn btn--${nx[1]} btn--s" type="button"><span>${nx[0]}</span></button></span>` : '';
  return `<div class="menu mb ${c.cls || ''}" role="menu" style="${style}"><div class="mh"><span class="st" ${c.co ? co(c.co) : ''}>${stIcon(tone)}<b>${text}</b></span>${act}</div><div class="msep" style="margin-top:0"></div>${items(state, c)}</div>`;
}
function drawer(state, style = '', c = {}) {
  const e = ENABLED(state); const [text, tone] = STATUS[state];
  return `<div class="cdr" style="${style}"><h2>${S[state].name === 'no cube' ? 'Cube' : 'GAN 356 i3'}<small>${c.small || 'GAN Gen4'}</small></h2>
    <div class="sec"><span class="st">${stIcon(tone)}<b>${text}</b></span></div>
    <div class="sec"><span class="eyebrow">cube</span><div class="kv" style="margin-top:6px"><span>battery</span><b>${S[state].pct ? `${S[state].pct}%` : '—'}</b><span>state</span><b>${{ ok: 'in sync', desync: 'out of sync', off: 'not connected', connecting: 'connecting', syncing: 'syncing', lost: 'lost' }[state]}</b><span>address</span><b>saved</b></div></div>
    <div class="sec"><span class="eyebrow">connection</span>${mi('connect cube', '', { dis: !e.connect })}${mi('sync', 'solve the cube first', { dis: !e.sync })}${mi('recenter', 'hold it as you solve', { dis: !e.recenter })}${mi('disconnect', '', { dis: !e.disconnect })}${mi('forget this cube', '', { dng: true })}</div>
    <div class="sec" ${c.co ? co(c.co) : ''}><span class="eyebrow">problems</span>${mi('save recording', 'file + connection log')}${mi('report a problem', 'adds a note')}</div>
    <div class="sec"><span class="eyebrow">connection log · last 3</span><div class="log"><div><i>17:31:08</i>connected</div><div><i>17:31:09</i>synced</div><div><i>17:33:41</i>battery 84%</div></div></div></div>`;
}
const MENU = { 1: menuA, 2: menuB, 3: drawer };

/* ------------------------------------------------------------------ the page frames */
const NAV = ['solve', 'drills', 'algs', 'progress', 'history'];
const hdr = (active, chipHtml, phone = false) => `<div class="hdr2"><span class="word">cubesight</span>${phone ? '' : `<nav>${NAV.map((n) => `<span class="${n === active ? 'on' : ''}">${n}</span>`).join('')}</nav>`}<span class="right">${chipHtml}${phone ? '' : '<span class="help">?</span>'}</span></div>`;
const kb = (...a) => abs('left:48px;bottom:16px', kbar(...a));
function solve({ state = 'ok', menu = false, c = {} } = {}) {
  const conn = state === 'connecting' || state === 'syncing';
  const orbit = conn ? orbitSVG({ full: true, spin: true, r: 300 }) : orbitSVG({ segs: idleSegs });
  const cube = `<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(720, 440, 215, { dim: state === 'off' || state === 'lost' ? 0.55 : 1 })}</svg>`;
  const clock = `<div class="clock dim" style="top:692px">0.00</div>`;
  let bottom;
  if (conn) bottom = abs('right:48px;bottom:22px', `<span class="st" ${co(c.st)} data-co-side="l">${mini(marc('a', -90, 10), true)}<b>${STATUS[state][0]}</b><button class="act" type="button">stop</button></span>`);
  else if (state === 'off' || state === 'lost') bottom = abs('left:0;width:100%;top:826px;text-align:center', `<span class="st" ${co(c.st)}>${state === 'off' ? 'No cube. Connect to start.' : 'Lost the connection.'} <span style="color:var(--b-accent-text);font-weight:600">${state === 'off' ? 'cube chip, top right' : 'cube chip, top right'}</span></span>`);
  else bottom = abs('left:0;width:100%;top:820px;display:flex;justify-content:center', primary('start', k('space', 'm'), 0));
  const stats = abs('right:48px;bottom:22px;font:400 12px var(--b-font-mono);color:var(--b-muted)', conn ? '' : 'ao5 14.62 · ao12 15.03 · pb 12.41');
  const chipHtml = chip(state, { open: menu, co: c.chip, hover: c.hover });
  const m = menu ? (opt === '3' ? `<div class="scrim" style="z-index:5"></div>${drawer(state, '', c)}` : MENU[opt](state, 'right:40px;top:52px', c)) : '';
  const orbMark = c.orb ? abs('left:430px;top:186px;width:560px;height:14px', '', co(c.orb)) : '';
  return `<div class="frame" data-n="${opt}">${orbit}${cube}${clock}${bottom}${conn ? '' : stats}${kb(kbi(k('tab'), 'settings'), kbi(k('esc'), 'command'))}${hdr('solve', chipHtml)}${orbMark}${m}</div>`;
}

/* algs list for the tabs frame */
function glyph40(n, sections, size = 40) {
  const c = 20; const r = 16; const bounds = new Set(); let a0 = 0;
  sections.slice(0, -1).forEach((s) => { a0 += s; bounds.add(a0); });
  const gap = (i) => (bounds.has(i) ? 30 : 9);
  const total = 360 - Array.from({ length: n }, (_, i) => gap(i)).reduce((s, x) => s + x, 0);
  const w = total / n; let a = gap(0) / 2; let out = ''; const cap = (1.75 / r) * (180 / Math.PI);
  for (let i = 0; i < n; i += 1) { const s0 = a + cap; const s1 = Math.max(a + w - cap, s0 + 0.5); out += `<path class="n" d="${arcPath(c, c, r, s0, s1)}"/>`; a += w + (i + 1 < n ? gap(i + 1) : gap(0)); }
  return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">${out}</svg>`;
}
const ALGS = [['T-perm', 'PLL · adjacent swap', 'R U R′ U′ R′ F R2 U′ R′ U′ R U R′ F′', 14, [4, 6, 4], 'learned'], ['Y-perm', 'PLL · diagonal swap', 'F R U′ R′ U′ R U R′ F′ R U R′ U′ R′ F R F′', 17, [9, 8], 'due'], ['Aa-perm', 'PLL · corners', 'x R′ U R′ D2 R U′ R′ D2 R2', 9, [3, 3, 3], 'learned'], ['Ja-perm', 'PLL · adjacent swap', 'R′ U L′ U2 R U′ R′ U2 R L', 10, [5, 5], 'new'], ['Jb-perm', 'PLL · adjacent swap', 'R U R′ F′ R U R′ U′ R′ F R2 U′ R′', 13, [4, 5, 4], 'learned'], ['Ua-perm', 'PLL · edges', 'R U′ R U R U R U′ R′ U′ R2', 11, [5, 6], 'due']];
const bd = (t) => `<span class="bd ${t === 'due' ? 'bd-due' : ''}">${t}</span>`;
const algRow = (a, i, ph = false) => (ph
  ? `<div class="lrow ${i === 0 ? 'is-sel' : ''}" style="--cols:40px 1fr auto;min-height:60px;gap:0 12px">${glyph40(a[3], a[4], 36)}<span class="nm" style="font-size:15px">${a[0]}<small>${a[3]} moves</small></span>${bd(a[5])}</div>`
  : `<div class="lrow ${i === 0 ? 'is-sel' : ''}" style="--cols:44px 150px minmax(0,1fr) 90px;min-height:52px">${glyph40(a[3], a[4])}<span class="nm">${a[0]}<small>${a[1]}</small></span><span class="alg">${a[2]}</span><span>${bd(a[5])}</span></div>`);
const SETS = [['PLL', 21], ['OLL', 57], ['2-look', 16], ['F2L', 41]];
function tabsHtml(items, sel = 0, n = opt, o = {}) {
  if (n === '2') return UI.seg('set', items.map(([l, c]) => (c != null ? `${l}\u2002${c}` : l)), sel, { cls: o.cls || '' });
  if (n === '3') return `<div class="rail" role="tablist" aria-orientation="vertical">${items.map(([l, c], i) => `<button class="rtab ${o.states && o.states[i] ? o.states[i] : ''}" role="tab" aria-selected="${i === sel}"><span>${l}</span>${c != null ? `<span class="n">${c}</span>` : ''}</button>`).join('')}</div>`;
  return `<div class="tabs" role="tablist">${items.map(([l, c], i) => `<button class="tab ${o.states && o.states[i] ? o.states[i] : ''}" role="tab" aria-selected="${i === sel}" ${o.states && o.states[i] === 'is-dis' ? 'disabled' : ''}><span>${l}</span>${c != null ? `<span class="n">${c}</span>` : ''}</button>`).join('')}</div>`;
}
const shead = (l, r) => `<div class="shead"><span class="eyebrow">${l}</span><span class="end">${r}</span></div>`;
function algsFrame(c = {}) {
  const list = `<div class="list" data-co-side="l" ${c.list ? co(c.list) : ''}>${ALGS.map((a, i) => algRow(a, i)).join('')}</div>`;
  const head = `<div class="phead">${eyebrow('offline algorithm library')}<h1>algs</h1><div class="sub">135 cases · 17 learned · 2 due</div></div>`;
  const body = opt === '3'
    ? `<div style="display:grid;grid-template-columns:188px 1fr;gap:56px;margin-top:26px"><div ${co(1)}>${tabsHtml(SETS, 0)}</div><div>${shead('<b>PLL</b> · sorted by name', '6 of 21')}${list}</div></div>`
    : `<div style="margin:24px 0 18px;${opt === '2' ? 'display:inline-block' : 'width:560px'}" ${co(1)}>${tabsHtml(SETS, 0)}</div>${shead('<b>PLL</b> · sorted by name', '6 of 21')}${list}`;
  return `<div class="frame" data-n="${opt}">${hdr('algs', chip('ok'))}<div class="page" style="right:48px">${head}${body}</div>${kb(kbi(kp('←', '→'), 'set'), kbi(kp('↑', '↓'), 'move'), kbi(k('enter'), 'open'))}</div>`;
}

/* the case page (links, crumbs, back) */
function backBlock(n, label = 'review', c = {}) {
  if (n === '1') return `<div class="back-wrap"><a class="back1" ${c.back ? co(c.back) : ''}>${LT}back to ${label}</a></div>`;
  if (n === '2') return `<div class="back-wrap" style="margin-left:-14px"><span class="on-secondary" ${c.back ? co(c.back) : ''}><button class="btn btn--text btn--s btn--muted" type="button"><span>${LT.replace('<svg', '<svg width="12" height="12" style="stroke:currentcolor;fill:none;stroke-width:2"')}back to ${label}</span>${k('esc', 's')}</button></span></div>`;
  return `<div class="back-wrap"><div class="crumbs" ${c.back ? co(c.back) : ''}><a class="parent-a">${LT}<span>solve 23</span></a><a class="parent-a" style="display:none"></a><span class="sep">${GT}</span><a>${label}</a><span class="sep">${GT}</span><b>T-perm</b></div></div>`;
}
function caseBody(c = {}, ph = false) {
  const L = (t, o = {}) => `<a class="lnk ${o.ext ? 'ext-l' : ''} ${o.inl ? 'inl' : ''} ${o.hover ? 'is-hover' : ''}">${t}${o.ext ? EXT : ''}${o.need ? '<span class="need">needs internet</span>' : ''}</a>`;
  return `<div class="cpage">${backBlock(opt, 'review', c)}
    ${opt === '3' ? '' : eyebrow('PLL · adjacent swap')}<h1 ${ph ? 'style="font-size:30px"' : ''}>T-perm</h1>
    <div class="alg" ${ph ? 'style="font-size:15px"' : ''}>R U R′ U′ R′ F R2 U′ R′ U′ R U R′ F′</div>
    <p>It came up at the last step of ${L('solve 23', { inl: 1 })} and cost 1.3 s. ${L('Show that moment', { inl: 1 })} on the review, or ${L('drill this case', { inl: 1 })} until it is quick.</p>
    <div class="links" ${c.links ? co(c.links) : ''}>${L('all PLL cases')}${L('see this case in your history')}${L('SpeedSolving wiki', { ext: true, need: true })}</div>
    ${ph ? '' : `<div class="pn"><a class="lnk inl-no">‹ Ja-perm</a><a class="lnk inl-no">Ua-perm ›</a></div>`}</div>`;
}
function linksFrame(c = {}) {
  const segs = Array.from({ length: 14 }, (_, i) => ({ a0: -145 + i * 20.2, a1: -145 + i * 20.2 + 17, tone: 'done' }));
  const right = `${orbitSVG({ cx: 1110, cy: 440, r: 240, segs })}<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(1110, 440, 170)}</svg>`;
  return `<div class="frame" data-n="${opt}">${hdr('algs', chip('ok'))}<div class="page" style="width:620px;top:84px">${caseBody(c)}</div>${right}${kb(kbi(k('esc'), 'back'), kbi(kp('←', '→'), 'case'), kbi(k('space'), 'play'))}</div>`;
}

/* ------------------------------------------------------------------ views */
const LEG = {
  menu: {
    1: ['<b>W-27 chip:</b> exactly the A-frame chip: a dot, the cube name, the battery, in mono; no container. Hover and open show a soft fill.', '<b>The menu:</b> a popover under the chip, the same rows in the same order in every state (not available = dimmed, never removed). Mono hints on the right.', '<b>Recording:</b> "save recording" and "report a problem" are in the menu on every page (feedback 15); the dev drawer key sits in the same group.'],
    2: ['<b>W-27 chip:</b> the glyph is the battery ring: the arc is the charge, so the number is readable at a glance; the same ring turns amber with ! when out of sync.', '<b>The menu:</b> a popover with a status head, the state in one sentence and the ONE next action as a button (here none: all is well). Rows below as in option 1.', '<b>Recording:</b> the same group of rows at the bottom.'],
    3: ['<b>W-27 chip:</b> a pill with a chevron, so it reads as a control without hovering; same dot as the A frames inside it.', '<b>The menu:</b> a right drawer (containers ①, frameless) with sections: state, connection, problems and the last three lines of the connection log. Largest, and the page dims.', '<b>Recording:</b> its own section, always visible.'],
  },
};

function vMenu() {
  const c = { chip: 1, rec: 3, co: 2 };
  const frame = solve({ state: 'ok', menu: true, c: { chip: 1, rec: 3, co: opt === '2' ? 2 : 0 } });
  return { name: `the cube menu on solve, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: LEG.menu[opt] };
}
function vConnect() {
  const frame = solve({ state: 'connecting', c: { st: 3, chip: 1, orb: 2 } });
  return { name: `connecting: the full Orbit sweeps, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: [
    '<b>W-27 chip while connecting:</b> the glyph is the mini ring with one uniform arc sweeping (never a spinner, never coloured by stage).',
    '<b>The Orbit:</b> the CURRENT connecting look is kept: the ring closes to full and one uniform teal arc travels round it (decision log 2026-10-02). No segments, no colours.',
    '<b>W-16 status</b> in the bottom-right slot with its one text action; the start button is gone until the cube is ready.',
  ].map((t, i) => t) };
}
const ROWS = [['off', 'no cube saved'], ['connecting', 'looking for it'], ['syncing', 'connected, waiting for a solved cube'], ['ok', 'connected and in sync, battery 84%'], ['desync', 'moves no longer match the cube'], ['lost', 'Bluetooth dropped; last battery shown']];
function vChips() {
  const stage = `<div class="stage" data-n="${opt}">${hdr('solve', chip('desync', { open: true, co: 2 }), false)}${opt === '3' ? `<div style="position:absolute;inset:0;background:var(--b-canvas);opacity:.5;z-index:5"></div>${drawer('desync', 'top:0', { co: 3, small: 'GAN Gen4' })}` : MENU[opt]('desync', 'right:16px;top:50px', { co: 3 })}</div>`;
  const rows = ROWS.map(([s, d], i) => `<div class="strow"><span class="l">${s}</span><span class="r">${chip(s, { co: i === 3 ? 1 : 0 })}</span><span class="d">${d}</span></div>`).join('');
  const frame = `<div class="nkit" style="grid-template-columns:760px 1fr;gap:40px" data-n="${opt}"><div class="nspec"><h4>the six states (dark page, header height)</h4>${rows}
    <div class="strow" style="margin-top:10px"><span class="l">hover · focus</span><span class="r">${chip('ok', { hover: true })}<span style="display:inline-block;width:24px"></span>${chip('ok', { focus: true })}</span><span class="d">soft fill · accent outline</span></div></div>
    <div class="nspec"><h4>the menu when out of sync (${{ 1: 'popover list', 2: 'popover with the next action', 3: 'right drawer' }[opt]})</h4>${stage}</div></div>`;
  return { name: `W-27 the cube chip: six states and the menu, option ${opt} ${NAMES[opt]}`, frame, width: 1440, legend: [
    '<b>States:</b> disconnected, connecting, syncing, connected (with the battery), desynced, interrupted. Tone is never colour alone: the glyph and the words change too. Connecting and syncing use the one uniform sweep.',
    '<b>Open state</b> of the chip, with the menu or drawer under it.',
    '<b>Save recording</b> is reachable from every page, in every state, including disconnected (the recorder is always on).',
  ] };
}
function vTabs() {
  return { name: `W-13 tabs on the algs page, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame: algsFrame({ list: 2 }), legend: [
    { 1: '<b>Underline tabs:</b> text + count, the selected tab in ink with an ink underline on one hairline. (The header nav keeps its teal underline, so the two never look alike.)', 2: '<b>Segmented tabs:</b> the approved ink segmented control (W-06) used as the tab set: one thing to learn, the selected tab is the ink thumb with the ✓ rule.', 3: '<b>Side rail:</b> a vertical list with the A-07 selected-row fill and the counts at the right; the page gets a left column. On a phone it becomes a select.' }[opt],
    '<b>The list under the tabs</b> is the approved W-11 row with the mini Orbit; the tabs only choose which set. Left/right arrows move between tabs (shown in the key bar).',
  ] };
}
function vTabKit() {
  const ctx = [['algs · sets', SETS, 0], ['dev gallery · folders, blog, timeline', [['folders'], ['blog'], ['timeline']], 1], ['settings · sections', [['solve'], ['timing'], ['cube'], ['data']], 0], ['inside a drawer · debug', [['events'], ['state'], ['recording']], 0]];
  const states = [['default', ''], ['hover', 'is-hover'], ['selected', ''], ['focus', 'is-focus'], ['unavailable', 'is-dis']];
  const one = ([l, it, sel]) => `<div class="nspec"><h4>${l}</h4>${tabsHtml(it, sel)}</div>`;
  const mk = (l, s, i) => {
    if (opt === '3') return `<div class="nspec"><h4>${l}</h4><div class="rail">${tabsHtml([['PLL', 21], ['OLL', 57]], 0, '3', { states: ['', s] })}</div></div>`;
    if (opt === '2') return `<div class="nspec"><h4>${l}</h4>${UI.seg('x', ['PLL\u200221', 'OLL\u200257'], 0, { states: [null, s === 'is-dis' ? '' : s], dis: s === 'is-dis' })}</div>`;
    return `<div class="nspec"><h4>${l}</h4>${tabsHtml([['PLL', 21], ['OLL', 57]], 0, '1', { states: ['', s] })}</div>`;
  };
  const stateLabels = [['default', ''], ['hover', 'is-hover'], ['focus', 'is-focus'], ['unavailable', 'is-dis']];
  const stateRow = `<div style="display:grid;grid-template-columns:repeat(${opt === '3' ? 4 : 4},auto);gap:30px 44px;justify-content:start">${stateLabels.map(([l, s], i) => mk(l, s, i)).join('')}</div>`;
  const frame = `<div class="nkit" data-n="${opt}">${opt === '3' ? `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:40px">${ctx.map(one).join('')}</div>` : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:36px 56px">${ctx.map(one).join('')}</div>`}
    <div class="nspec"><h4>states (first tab selected, the state shown on the second)</h4>${stateRow}</div>
    <div class="nspec ncap"><b>Rules:</b> in-page only (never a second site nav, feedback 17); at most 5 tabs; the count is optional; no horizontal scrolling: on a phone the tabs wrap to the width, or become a select past 4. Keys: left and right arrows move, enter or space selects, home and end jump.</div></div>`;
  return { name: `W-13 tabs: four contexts and the states, option ${opt} ${NAMES[opt]}`, frame, legend: [] };
}
function vLinks() {
  return { name: `W-26 links, crumbs and the back link on a case page, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame: linksFrame({ back: 1, links: 2 }), legend: [
    { 1: '<b>Back link:</b> "‹ back to review" in the link colour above the page, where the eyebrow breadcrumbs used to be. It always names where you came from.', 2: '<b>Back link:</b> a quiet text button (the approved W-04 text button) with the esc key on it, so the keyboard way is visible.', 3: '<b>Path crumbs:</b> the path you took (solve 23 › review › T-perm); every earlier crumb is a link back there. On a phone only the parent shows, as "‹ solve 23".' }[opt],
    { 1: '<b>Links:</b> teal text, underline on hover. An external link carries ↗ and "needs internet" (the app is offline-first).', 2: '<b>Links:</b> ink text with a thin underline always visible (reads as a link in a paragraph), teal underline on hover. External: ↗ + "needs internet".', 3: '<b>Links:</b> ink text with a teal › after it; hover turns it teal. External links use ↗ and "needs internet".' }[opt],
  ] };
}

function phoneFrame(inner, extra = '') { return `<div class="frame phone touch" data-n="${opt}" style="width:390px;height:844px">${inner}${extra}</div>`; }
function vPhone() {
  const hdrP = (a, st = 'ok', open = false) => hdr(a, chip(st, { open, n: opt }), true);
  const p1stage = `${orbitSVG({ cx: 195, cy: 330, r: 150, w: 390, h: 844, segs: idleSegs })}<svg class="stage-svg" width="390" height="844" aria-hidden="true">${cubeSVG(195, 332, 108)}</svg><div class="clock dim" style="top:520px;--clock-size:72px">0.00</div>${abs('left:0;width:100%;top:700px;display:flex;justify-content:center', primary('start', '', 0))}`;
  const sheetItems = items('ok', {});
  const menuP = opt === '3'
    ? `<div class="scrim"></div><div class="sheet2"><div class="grab"></div><h2>GAN 356 i3</h2><div class="msub">GAN Gen4 · 84% · in sync</div>${sheetItems}</div>`
    : MENU[opt]('ok', '', { cls: 'phone-pop' });
  const ph1 = phoneFrame(`${hdrP('solve', 'ok', true)}${p1stage}${menuP}`);
  const setSel = opt === '3' ? `<div ${co(1)}>${UI.sel('set', ['PLL · 21', 'OLL · 57', '2-look · 16', 'F2L · 41'], 0, { cls: 'sel--full' })}</div>` : `<div ${co(1)}>${tabsHtml(SETS, 0, opt)}</div>`;
  const ph2 = phoneFrame(`${hdrP('algs')}${abs('left:20px;right:20px;top:72px', `<div class="phead">${eyebrow('offline algorithm library')}<h1 style="font-size:28px">algs</h1></div><div style="margin:16px 0 14px">${setSel}</div>${shead('<b>PLL</b>', '6 of 21')}<div class="list">${ALGS.map((a, i) => algRow(a, i, true)).join('')}</div>`)}`);
  const ph3 = phoneFrame(`${hdrP('algs')}${abs('left:20px;right:20px;top:72px;font-size:15px', caseBody({ back: 2, links: 3 }, true))}${orbitSVG({ cx: 195, cy: 600, r: 115, w: 390, h: 844, segs: Array.from({ length: 14 }, (_, i) => ({ a0: -145 + i * 20.2, a1: -145 + i * 20.2 + 17, tone: 'done' })) })}<svg class="stage-svg" width="390" height="844" aria-hidden="true">${cubeSVG(195, 602, 82)}</svg>`);
  return { name: `phone 390 x 844: the cube menu, tabs and the back link, option ${opt} ${NAMES[opt]}`, frame: `<div class="nphones">${ph1}${ph2}${ph3}</div>`, width: 1290, legend: [
    { 1: '<b>Chip on a phone:</b> dot + name; the battery and state words live in the menu (a popover, rows 48 px high).', 2: '<b>Chip on a phone:</b> the battery ring + the name; the popover has the status head.', 3: '<b>Chip on a phone:</b> the pill; it opens a bottom sheet (the approved sheet) instead of a drawer.' }[opt],
    { 1: '<b>Tabs on a phone:</b> four underline tabs with counts fit 342 px; no horizontal scroll.', 2: '<b>Tabs on a phone:</b> the segmented control fills the width.', 3: '<b>Tabs on a phone:</b> the rail becomes the approved select, full width.' }[opt],
    { 1: '<b>Back and links on a phone:</b> "‹ back to review" above the title; links are 44 px high targets.', 2: '<b>Back and links on a phone:</b> the text button with no key (touch); links are underlined in ink.', 3: '<b>Back and links on a phone:</b> only the parent shows, as "‹ solve 23".' }[opt],
  ] };
}

/* the decision-image thumbnails (view = q2a|q2b|q3a|q3b|q3c) */
function vQ(id) {
  if (id.startsWith('q2')) {
    const noName = id === 'q2b';
    const row = (st) => `<div style="position:relative;width:390px;height:60px;background:var(--b-bg)" class="phone touch" data-n="2">${hdr('solve', chip(st, { n: '2', noName }), true)}</div>`;
    return { name: id, frame: `<div class="frame" data-n="2" style="width:390px;height:180px;background:var(--b-bg)"><div style="position:relative">${row('ok')}${row('desync')}${row('connecting')}</div></div>`, legend: [] };
  }
  const f = { q3a: menuA, q3b: menuB }[id];
  const stage = id === 'q3c' ? `<div style="position:absolute;inset:0;background:var(--b-canvas);opacity:.5;z-index:5"></div>${drawer('desync', 'top:66px;width:360px;padding:20px 22px;gap:14px')}` : f('desync', 'right:16px;top:58px');
  return { name: id, frame: `<div class="frame qf" data-n="1" style="width:560px;height:700px;overflow:hidden">${hdr('solve', chip('desync', { n: '1', open: true }), false)}${stage}</div>`, legend: [] };
}

/* the three-option comparison (kit-level) */
function vCompare() {
  const col = (n) => {
    const cc = (st) => chip(st, { n: String(n) });
    const tabs = tabsHtml(SETS, 0, String(n));
    const lnk = `<div data-n="${n}" style="display:grid;gap:10px;font:500 15px var(--b-font-sans)"><span>Plain: <a class="lnk">all PLL cases</a></span><span>External: <a class="lnk ext-l">SpeedSolving wiki${EXT}<span class="need">needs internet</span></a></span></div>`;
    const back = { 1: `<a class="back1">${LT}back to review</a>`, 2: `<span class="on-secondary"><button class="btn btn--text btn--s btn--muted" type="button"><span>${LT.replace('<svg', '<svg width="12" height="12" style="stroke:currentcolor;fill:none;stroke-width:2"')}back to review</span>${k('esc', 's')}</button></span>`, 3: `<div class="crumbs"><a>solve 23</a><span class="sep">${GT}</span><a>review</a><span class="sep">${GT}</span><b>T-perm</b></div>` }[n];
    return `<div data-n="${n}"><div class="ncmp-h">option ${n}: ${NAMES[n]}</div>
      <div class="nblk"><span class="eyebrow">chip: ok · desync · connecting</span><div class="row" style="gap:22px;flex-wrap:wrap">${cc('ok')}${cc('desync')}${cc('connecting')}</div></div>
      <div class="nblk"><span class="eyebrow">tabs</span>${tabs}</div>
      <div class="nblk"><span class="eyebrow">links</span>${lnk}</div>
      <div class="nblk"><span class="eyebrow">back</span><div>${back}</div></div></div>`;
  };
  return { name: 'navigation parts in the three options', frame: `<div class="ncmp">${[1, 2, 3].map(col).join('')}</div>`, legend: [] };
}

const VIEWS = { menu: vMenu, connect: vConnect, chips: vChips, tabs: vTabs, tabkit: vTabKit, links: vLinks, phone: vPhone, compare: vCompare };
const v = VIEWS[view] ? VIEWS[view]() : vQ(view);
mount({ id: boardId, name: v.name, frame: v.frame, legend: v.legend || [], cols: 1, width: v.width });
const board = document.getElementById('board');
board.dataset.opt = '3';
board.dataset.n = opt;
/* the live behaviour of the tabs (arrow keys, click) so the prototype can be tried in a browser */
document.querySelectorAll('.tabs, .rail').forEach((g) => {
  const t = [...g.querySelectorAll('[role="tab"]')];
  const pick = (i) => { t.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; }); t[i].focus(); };
  t.forEach((b, i) => { b.addEventListener('click', () => pick(i)); b.addEventListener('keydown', (e) => { const m = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: t.length - 1 }; if (e.key in m) { e.preventDefault(); pick((m[e.key] + t.length) % t.length); } }); });
});
if (window.UIWire) window.UIWire(board);
