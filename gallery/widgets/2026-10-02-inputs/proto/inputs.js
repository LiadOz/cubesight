/* global document, window */
// Inputs proposal: W-09 text inputs (text, textarea, number, file picker, range) and W-36 the search field.
// Three skins on one DOM (data-f = 1 filled pill | 2 underline | 3 hairline box). Approved widgets reused as they are.
import { q, mount, header, cubeSVG, orbitSVG, arcPath, idleSegs } from '../../_proto/common.js';

const UI = window.UI;
const view = q.get('view') || 'kit';
const opt = q.get('opt') || '1';
const boardId = q.get('id') || 'I';
const NAMES = { 1: 'filled pill fields', 2: 'underline fields', 3: 'hairline box fields' };

const abs = (style, html, extra = '') => `<div class="abs" ${extra} style="${style}">${html}</div>`;
const co = (n) => (n ? `data-co="${n}"` : '');
const k = (g, size = 's') => `<kbd class="key key--${size}">${g}</kbd>`;
const kp = (a, b, size = 's') => `<span class="kp">${k(a, size)}${k(b, size)}</span>`;
const kbi = (c, l) => `<span class="kbi">${c}<span>${l}</span></span>`;
const kbar = (...a) => `<div class="kbar">${a.join('')}</div>`;
const primary = (label, cap = '', size = 'btn--l') => `<span class="on-primary"><button class="btn btn--primary ${size}" type="button"><span>${label}</span>${cap}</button></span>`;
const secondary = (label, size = 'btn--s', n = 0) => `<span class="on-secondary" ${co(n)}><button class="btn btn--secondary ${size}" type="button"><span>${label}</span></button></span>`;
const eyebrow = (t) => `<span class="eyebrow">${t}</span>`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ERRI = '<svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.8"/><path d="M5 5l4 4M9 5l-4 4"/></svg>';
const MG = '<svg class="mg" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6"/><path d="M10.6 10.6L14 14"/></svg>';
const XX = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>';

/* ------------------------------------------------------------------ the controls */
function fld(label, control, o = {}) {
  return `<div class="fld" ${o.co ? co(o.co) : ''}>${label ? `<label class="fld__l"><span>${label}</span>${o.opt ? `<i>${o.opt}</i>` : ''}</label>` : ''}${control}${o.err ? `<div class="fld__e">${ERRI}<span>${o.err}</span></div>` : o.help ? `<div class="fld__h">${o.help}</div>` : ''}</div>`;
}
const text = (val = '', o = {}) => `<input class="in ${o.cls || ''}" type="text" value="${esc(val)}" placeholder="${esc(o.ph || '')}" ${o.dis ? 'disabled' : ''} ${o.mono ? 'style="font-family:var(--b-font-mono);font-weight:400"' : ''} aria-label="${esc(o.ph || 'field')}">`;
const area = (val = '', o = {}) => `<textarea class="ta ${o.cls || ''}" placeholder="${esc(o.ph || '')}" ${o.dis ? 'disabled' : ''} style="${o.h ? `min-height:${o.h}px` : ''}">${esc(val)}</textarea>`;
const num = (val, unit, o = {}) => (o.stepper
  ? `<span class="stp"><button class="btn btn--secondary btn--s" type="button" aria-label="less">−</button><span class="inw" style="width:104px"><input class="in ${o.cls || ''}" type="text" inputmode="numeric" value="${val}" style="padding-right:30px"><span class="unit">${unit}</span></span><button class="btn btn--secondary btn--s" type="button" aria-label="more">+</button></span>`
  : `<span class="inw" style="width:${o.w || 112}px"><input class="in ${o.cls || ''}" type="text" inputmode="numeric" value="${val}" ${o.dis ? 'disabled' : ''}><span class="unit">${unit}</span></span>`);
const file = (name, o = {}) => (o.drop
  ? `<div class="drop ${o.over ? 'is-over' : ''}"><span>${name ? `<b style="color:var(--b-ink);font-weight:500">${name}</b>` : 'Drop a file here, or choose one.'}</span>${secondary(name ? 'choose another' : 'choose file…')}</div>`
  : `<div class="file">${secondary(name ? 'choose another' : 'choose file…')}<span class="nm">${name ? `<b>${name}</b>` : 'no file chosen'}</span>${name ? `<button class="x" type="button" aria-label="remove file">${XX.replace('<svg', '<svg').replace('</svg>', '</svg>')}</button>` : ''}</div>`);
const range = (v, min, max, step, unit) => `<div class="rng"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" aria-label="speed"><output>${v}${unit}</output></div>`;
function search(qv, o = {}) {
  const tail = qv
    ? `<span class="tail">${o.count ? `<span class="cnt ${o.none ? 'none' : ''}">${o.count}</span>` : ''}<button class="clr" type="button" aria-label="clear">${XX}</button></span>`
    : `<span class="tail">${k('/', 's')}</span>`;
  return `<span class="srch ${o.w || 'w260'}" role="search" ${o.co ? co(o.co) : ''}>${MG}<input class="in ${o.cls || ''}" type="search" value="${esc(qv)}" placeholder="${esc(o.ph || 'search cases')}" aria-label="search">${tail}</span>`;
}

/* ------------------------------------------------------------------ frames */
const hdr = (a) => header({ active: a });
const kb = (...a) => abs('left:48px;bottom:16px', kbar(...a));
const SETS_NOTE = '';
function settingsFrame() {
  const body = `<h2>settings<span class="eyebrow">solve</span></h2>
    <div class="sec">${eyebrow('inspection')}${UI.seg('inspection', ['WCA 15 s', 'custom', 'off'], 1)}
      ${fld('custom inspection', `<span ${co(1)}>${num(12, 's', { w: 120 })}</span>`, { help: 'From 3 to 30 seconds.' })}</div>
    <div class="sec">${eyebrow('scramble')}
      ${fld('use a specific scramble', area("R U R' U' R' F R2 U' R' U' R U R' F'", { ph: 'Paste the moves here', h: 96 }), { co: 2, opt: 'optional', help: "One scramble, used once. Moves like R U R' U' or R U R′ U′." })}
      <div>${secondary('use this scramble')}</div></div>
    <div class="sec">${eyebrow('cube')}${fld('cube name', text('GAN 356 i3'), { help: 'Shown in the header chip.' })}
      ${fld('orbit speed', range(1.0, 0.5, 2, 0.25, '×'), { co: 3 })}</div>`;
  const frame = `<div class="frame" data-f="${opt}">${orbitSVG({ segs: idleSegs })}<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(720, 440, 215)}</svg><div class="clock dim" style="top:692px">0.00</div>${hdr('solve')}<div class="scrim"></div><div class="dr">${body}</div></div>`;
  return { name: `settings drawer: number, textarea, text and range, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: [
    '<b>W-09 number:</b> a mono value with its unit inside the field; the range of values is the help line; wrong values show the error line (see the kit).',
    '<b>W-09 textarea:</b> for a pasted scramble: mono, 4 lines tall, label with "optional", a help line with the accepted notation, one quiet button to apply.',
    '<b>W-09 range:</b> a track and a thumb only, with the value in mono at the right; no filled part, so it never reads as a progress bar (feedback 1).',
  ] };
}
function importFrame() {
  const form = `<div class="page" style="width:700px;top:92px">
    <div class="phead">${eyebrow('review')}<h1>import a reconstruction</h1><div class="sub">Paste an alg.cubing.net link or the moves, or open a file. It stays on this device.</div></div>
    <div style="display:grid;gap:22px;margin-top:26px">
      ${fld('alg.cubing.net link', text('', { ph: 'https://alg.cubing.net/?setup=…' }), { co: 1, opt: 'optional' })}
      ${fld('scramble and moves', area("R U R' U' R' F R2 Q2 U' R' U' R U R' F'", { ph: 'Paste the scramble, then the solve', h: 112, cls: 'is-err' }), { co: 2, err: 'Move 8 is “Q2”, which is not a cube move. Fix it or remove it.' })}
      ${fld('or open a file', file('solve-23-recording.json'), { co: 3, opt: 'JSON or text' })}
      <div class="row" style="gap:14px;margin-top:4px">${primary('import', k('enter', 'm'), '')}${secondary('clear', 'btn--s')}</div></div></div>`;
  const right = `${orbitSVG({ cx: 1100, cy: 400, r: 220, segs: idleSegs })}<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(1100, 402, 150, { dim: 0.55 })}</svg>${abs('left:880px;width:440px;top:660px;text-align:center', '<span class="st"><b>Not read yet.</b> The preview appears when the moves are valid.</span>')}`;
  return { name: `import: link, textarea, file picker and an error, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame: `<div class="frame" data-f="${opt}">${hdr('history')}${form}${right}${kb(kbi(k('enter'), 'import'), kbi(k('esc'), 'back'))}</div>`, legend: [
    '<b>W-09 text:</b> label above, optional marker at the right, no placeholder as label. A link is plain text; nothing is fetched (the app is offline-first).',
    '<b>W-09 textarea in error:</b> the field takes the error edge and the line below says what is wrong and where, in plain words (VOICE: no exception text). It stays until the text is fixed.',
    '<b>W-09 file picker:</b> a quiet secondary button and the file name in mono; the file is read on this device and never sent anywhere.',
  ] };
}

/* the algs list for the search view */
function glyph(n, sections) {
  const c = 20; const r = 16; const b = new Set(); let t = 0;
  sections.slice(0, -1).forEach((s) => { t += s; b.add(t); });
  const gap = (i) => (b.has(i) ? 30 : 9);
  const total = 360 - Array.from({ length: n }, (_, i) => gap(i)).reduce((s, x) => s + x, 0);
  const w = total / n; let a = gap(0) / 2; let out = ''; const cap = (1.75 / r) * (180 / Math.PI);
  for (let i = 0; i < n; i += 1) { const s0 = a + cap; const s1 = Math.max(a + w - cap, s0 + 0.5); out += `<path class="n" d="${arcPath(c, c, r, s0, s1)}"/>`; a += w + (i + 1 < n ? gap(i + 1) : gap(0)); }
  return `<svg class="glyph" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">${out}</svg>`;
}
const bd = (t) => `<span class="bd ${t === 'due' ? 'bd-due' : ''}">${t}</span>`;
const ALL = [['T-perm', 'PLL · adjacent swap', 'R U R′ U′ R′ F R2 U′ R′ U′ R U R′ F′', 14, [4, 6, 4], 'learned'], ['Y-perm', 'PLL · diagonal swap', 'F R U′ R′ U′ R U R′ F′ R U R′ U′ R′ F R F′', 17, [9, 8], 'due'], ['Ja-perm', 'PLL · adjacent swap', 'R′ U L′ U2 R U′ R′ U2 R L', 10, [5, 5], 'new'], ['Jb-perm', 'PLL · adjacent swap', 'R U R′ F′ R U R′ U′ R′ F R2 U′ R′', 13, [4, 5, 4], 'learned'], ['Ua-perm', 'PLL · edges', 'R U′ R U R U R U′ R′ U′ R2', 11, [5, 6], 'due']];
const row = (a, i, ph) => (ph
  ? `<div class="lrow ${i === 0 ? 'is-sel' : ''}" style="--cols:40px 1fr auto;min-height:60px;gap:0 12px">${glyph(a[3], a[4])}<span class="nm" style="font-size:15px">${a[0]}<small>${a[3]} moves</small></span>${bd(a[5])}</div>`
  : `<div class="lrow ${i === 0 ? 'is-sel' : ''}" style="--cols:44px 150px minmax(0,1fr) 90px;min-height:52px">${glyph(a[3], a[4])}<span class="nm">${a[0]}<small>${a[1]}</small></span><span class="alg">${a[2]}</span><span>${bd(a[5])}</span></div>`);
function searchFrame() {
  const rows = ALL.filter((a) => /j/i.test(a[0]));
  const sf = (w, c) => search('j', { count: '2 of 21', w, co: c });
  const head = `<div class="phead"><div style="display:flex;justify-content:space-between;align-items:flex-end"><div>${eyebrow('offline algorithm library')}<h1>algs</h1><div class="sub">135 cases · 17 learned · 2 due</div></div>${opt === '2' ? sf('w300', 1) : ''}</div></div>`;
  const tabs = `<div style="margin:22px 0 16px">${UI.seg('set', ['PLL 21', 'OLL 57', '2-look 16', 'F2L 41'], 0)}</div>`;
  const shead = `<div class="shead" style="min-height:40px;margin-bottom:6px"><span class="eyebrow"><b>PLL</b> · matching “j”</span>${opt === '1' ? `<span style="margin-left:auto">${sf('w260', 1)}</span>` : '<span class="end">2 of 21</span>'}</div>`;
  const box = opt === '3' ? `<div style="margin-bottom:14px">${sf('w100', 1)}</div>` : '';
  const frame = `<div class="frame" data-f="${opt}">${hdr('algs')}<div class="page" style="right:48px">${head}${tabs}${box}${shead}<div class="list" data-co-side="l" ${co(2)}>${rows.map((a, i) => row(a, i)).join('')}</div>
    <div class="nores" style="margin-top:22px;opacity:.0">.</div></div>${kb(kbi(k('/'), 'search'), kbi(k('esc'), 'clear'), kbi(kp('↑', '↓'), 'move'), kbi(k('enter'), 'open'))}</div>`;
  return { name: `search in the algs list, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: [
    { 1: '<b>W-36 search:</b> the same filled pill as the approved select, in the section head at the right, so it filters the list under it; the / key sits inside it while empty.', 2: '<b>W-36 search:</b> an underline field in the page head at the right (the page-level filter); the / key sits inside it while empty.', 3: '<b>W-36 search:</b> a full-width hairline box above the list, the largest and most obvious, with the / key inside.' }[opt],
    '<b>Live filtering:</b> the list narrows as you type (no submit); the count says how many of the whole ("2 of 21"); × or esc clears. Matching is on the name and the alg; nothing is sent anywhere.',
  ] };
}
function phoneFrame(inner, extra = '') { return `<div class="frame phone touch" data-f="${opt}" style="width:390px;height:844px">${inner}${extra}</div>`; }
function vPhone() {
  const ph = (a) => `<div class="hdr" style="padding:0 20px;height:60px"><span class="word" style="font-size:17px;margin:0">cubesight</span><span class="chip-cube" style="font-size:11px"><i class="dot"></i>GAN 356 i3</span></div>`;
  const p1 = phoneFrame(`${ph()}${orbitSVG({ cx: 195, cy: 280, r: 140, w: 390, h: 844, segs: idleSegs })}<svg class="stage-svg" width="390" height="844" aria-hidden="true">${cubeSVG(195, 282, 100)}</svg><div class="scrim"></div>
    <div class="sheet2"><div class="grab"></div><h2>settings</h2>${UI.seg('inspection', ['WCA 15 s', 'custom', 'off'], 1)}${fld('custom inspection', num(12, 's', { w: 140 }), { help: 'From 3 to 30 seconds.' })}${fld('use a specific scramble', area("R U R' U' R' F R2 U' R' U' R U R' F'", { h: 84 }), { opt: 'optional' })}<div class="row" style="gap:12px">${primary('use this scramble', '', 'btn--l')}</div></div>`);
  const p2 = phoneFrame(`${ph()}${abs('left:20px;right:20px;top:72px;display:grid;gap:18px', `<div class="phead">${eyebrow('review')}<h1 style="font-size:28px">import</h1></div>
    ${fld('alg.cubing.net link', text('', { ph: 'https://alg.cubing.net/?setup=…' }), { opt: 'optional' })}${fld('scramble and moves', area("R U R' U' R' F R2 Q2 U' R' U' R U R' F'", { h: 100, cls: 'is-err' }), { err: 'Move 8 is “Q2”, which is not a cube move.' })}
    ${fld('or open a file', file(''), { opt: 'JSON or text' })}<div>${primary('import', '', 'btn--l')}</div>`)}`);
  const p3 = phoneFrame(`${ph()}${abs('left:20px;right:20px;top:72px', `<div class="phead">${eyebrow('offline algorithm library')}<h1 style="font-size:28px">algs</h1></div><div style="margin:16px 0 12px">${search('j', { count: '2 of 21', w: 'w100' })}</div>
    <div class="shead"><span class="eyebrow"><b>PLL</b> · matching “j”</span><span class="end">2 of 21</span></div><div class="list">${ALL.filter((a) => /j/i.test(a[0])).map((a, i) => row(a, i, true)).join('')}</div>`)}`);
  return { name: `phone 390 x 844: settings sheet, import and search, option ${opt} ${NAMES[opt]}`, frame: `<div class="nphones">${p1}${p2}${p3}</div>`, width: 1290, legend: [
    '<b>Touch sizes:</b> fields are 48 px high with 16 px text (no zoom on focus); the textarea keeps mono at 14 px. No keyboard caps on touch.',
    '<b>Error and file picker</b> on a phone: the same lines, the button is 40 px.',
    '<b>Search</b> full width under the title; the count pill and × appear while there is a query.',
  ] };
}

/* ------------------------------------------------------------------ the kit */
function vKit() {
  const states = [['empty', text('', { ph: 'cube name' })], ['hover', text('GAN 356 i3', { cls: 'is-hover' })], ['focus', text('GAN 356 i3', { cls: 'is-focus' })], ['filled', text('GAN 356 i3')], ['error', fld('', text('GAN 356 i3 GAN 356 i3 GAN 356 i3 GAN 356 i3 GAN 356 i3', { cls: 'is-err' }), { err: 'Use 24 letters or fewer.' })], ['unavailable', text('GAN 356 i3', { dis: true })]];
  const st = states.map(([l, c]) => `<div class="fld"><span class="eyebrow">${l}</span>${c}</div>`).join('');
  const frame = `<div class="kit2" data-f="${opt}">
    <div class="sp"><h4>text field: label, help, states</h4>${fld('cube name', text('GAN 356 i3'), { help: 'Shown in the header chip.' })}<div class="g3" style="gap:16px 18px">${st}</div></div>
    <div class="sp"><h4>number with a unit, textarea (mono), error</h4>
      <div class="g2">${fld('custom inspection', num(12, 's'), { help: 'From 3 to 30 seconds.' })}${fld('custom inspection', num(45, 's', { cls: 'is-err' }), { err: 'Use 3 to 30 seconds.' })}</div>
      <div class="g2">${fld('use a specific scramble', area('', { ph: 'Paste the moves here', h: 84 }), { opt: 'optional' })}${fld('use a specific scramble', area("R U R' U' R' F R2 U' R' U' R U R' F'", { h: 84 }), { opt: 'optional' })}</div></div>
    <div class="sp"><h4>file picker and range</h4>
      <div class="g2">${fld('or open a file', file(''), { opt: 'JSON or text' })}${fld('or open a file', file('solve-23-recording.json'), { opt: 'JSON or text' })}</div>
      ${fld('orbit speed', range(1.5, 0.5, 2, 0.25, '×'))}</div>
    <div class="sp"><h4>W-36 search: empty, typing with a count, no results</h4>
      <div class="g2">${search('', { w: 'w100' })}${search('ja', { w: 'w100', count: '1 of 21' })}</div>
      <div class="g2"><div>${search('zz', { w: 'w100', count: '0 of 21', none: true })}<div class="nores"><b>No cases match “zz”.</b> Clear the search to see all 21.</div></div>${search('', { w: 'w100', cls: 'is-focus', ph: 'search cases' })}</div></div>
    </div>`;
  return { name: `the input parts, option ${opt} ${NAMES[opt]}`, frame, legend: [] };
}
function vCompare() {
  const col = (n) => `<div data-f="${n}"><div class="ncmp-h">option ${n}: ${NAMES[n]}</div>
    <div class="nblk"><span class="eyebrow">text · focus · error</span>${fld('cube name', text('GAN 356 i3'))}${text('GAN 356 i3', { cls: 'is-focus' })}${fld('', text('Q2 Q2', { cls: 'is-err' }), { err: 'Move 1 is “Q2”.' })}</div>
    <div class="nblk"><span class="eyebrow">number · textarea</span>${num(12, 's')}${area("R U R' U'", { h: 70 })}</div>
    <div class="nblk"><span class="eyebrow">file · range</span>${file('recording.json')}${range(1.5, 0.5, 2, 0.25, '×')}</div>
    <div class="nblk"><span class="eyebrow">search</span>${search('j', { w: 'w100', count: '2 of 21' })}${search('', { w: 'w100' })}</div></div>`;
  return { name: 'the input parts in the three options', frame: `<div class="ncmp">${[1, 2, 3].map(col).join('')}</div>`, legend: [] };
}
function vQ(id) {
  const set = (inner) => `<div class="frame" data-f="1" style="width:420px;height:200px;padding:20px"><div style="display:grid;gap:12px">${inner}</div></div>`;
  if (id === 'q2a') return { name: id, frame: set(fld('custom inspection', num(12, 's', { w: 120 }), { help: 'From 3 to 30 seconds.' })), legend: [] };
  if (id === 'q2b') return { name: id, frame: set(fld('custom inspection', num(12, 's', { stepper: true }), { help: 'From 3 to 30 seconds.' })), legend: [] };
  if (id === 'q3a') return { name: id, frame: `<div class="frame" data-f="1" style="width:420px;height:200px;padding:20px"><div style="display:grid;gap:12px">${fld('or open a file', file('solve-23-recording.json'), { opt: 'JSON or text' })}</div></div>`, legend: [] };
  return { name: id, frame: `<div class="frame" data-f="1" style="width:420px;height:200px;padding:20px"><div style="display:grid;gap:12px">${fld('or open a file', file('', { drop: true }), { opt: 'JSON or text' })}</div></div>`, legend: [] };
}
const VIEWS = { kit: vKit, settings: settingsFrame, import: importFrame, search: searchFrame, phone: vPhone, compare: vCompare };
const v = VIEWS[view] ? VIEWS[view]() : vQ(view);
mount({ id: boardId, name: v.name, frame: v.frame, legend: v.legend || [], cols: 1, width: v.width });
const board = document.getElementById('board');
board.dataset.opt = '3';
board.dataset.f = opt;
if (window.UIWire) window.UIWire(board);
