// W-35: the compare view, three ways (side by side, overlay, wipe in every one). A-05 against B-05: the same screen in two directions.
import { header, orbitSVG, cubeSVG, resultsSegs, resultsMarkers } from '../../_proto/common.js';
import { ROOT } from './data.js';
import { UI, key, kbi, kbar, primary, secondary, textBtn, toast, co, abs, sbadge, btag, ARROWS } from './kit.js';
import { phHdr } from './timeline.js';

const A = `${ROOT}docs/design/orbit-v3/A-05-results.png`;
const B = `${ROOT}docs/design/orbit-v3/B-05-results.png`;
const BT2 = `${ROOT}gallery/widgets/2026-10-02-buttons/W-04-02-option1-results.png`;
const BT7 = `${ROOT}gallery/widgets/2026-10-02-buttons/W-04-07-option2-results.png`;
let SHORT = false;
const selA = (n = 0) => `<span ${co(n)}>${UI.sel('left', [SHORT ? 'A-05 results' : 'orbit-v3 · A-05 results', 'orbit-v3 · A-07 history', 'orbit-v3 · A-08 drill'], 0)}</span>`;
const selB = (n = 0) => `<span ${co(n)}>${UI.sel('right', [SHORT ? 'B-05 results' : 'orbit-v3 · B-05 results', 'orbit-v3 · B-07 history', 'orbit-v3 · B-08 drill'], 0)}</span>`;
const modeSeg = (i, n = 0) => `<span ${co(n)}>${UI.seg('mode', ['side by side', 'overlay', 'wipe'], i)}</span>`;
const head = (phone, sub) => `<div class="row" style="justify-content:space-between;align-items:flex-end"><div><div class="eyebrow">dev · gallery</div><h1 style="font-size:${phone ? 24 : 28}px">compare</h1></div>${phone ? '' : `<span class="sub-m">${sub}</span>`}</div>`;
const tabsRow = `<div class="tabs"><span>folders</span><span class="on">blog</span><span>timeline</span></div>`;
const tag = (t, side) => `<span class="tagc" style="${side}">${t}</span>`;

/** The one compare stage: mode = 'side' | 'overlay' | 'wipe' | 'diff'. Used by every option so it can be reused later. */
export function stage({ a = A, b = B, mode = 'wipe', pos = 46, op = 50, w, h, la = 'A', lb = 'B' }) {
  const st = `style="width:${w}px;height:${h}px"`;
  if (mode === 'overlay') return `<div class="stage" ${st}><img src="${a}" alt="">${`<img src="${b}" alt="" style="opacity:${op / 100}">`}${tag(`${la} ${100 - op}% · ${lb} ${op}%`, 'left:12px')}</div>`;
  if (mode === 'diff') return `<div class="stage" ${st}><img src="${a}" alt=""><img src="${b}" alt="" style="mix-blend-mode:difference">${tag('difference', 'left:12px')}</div>`;
  if (mode === 'wipe') {
    return `<div class="stage" ${st}><img src="${b}" alt=""><img src="${a}" alt="" style="clip-path:inset(0 ${100 - pos}% 0 0)">${tag(la, 'left:12px')}${tag(lb, 'right:12px')}<div class="handle" style="left:${pos}%"><span class="grip" ${co(0)}>${ARROWS}</span></div></div>`;
  }
  return '';
}

/* ------------------------------------------------------------- option 1: toolbar on top, two panes (the current look, refined) */
function x1(phone, mode = 'side') {
  const pw = phone ? 354 : 664; const ph = Math.round(pw * 0.625);
  const pane = (side, sel, img, status, date, n) => `<div class="pane"><div class="ph2"><div class="row" style="justify-content:space-between">${sel}<span class="sub-m">${side}</span></div><div class="row" style="gap:8px">${sbadge(status)}${btag('orbit', true)}<span class="sub-m">${date}</span></div></div><div class="stg" ${co(n)}><img src="${img}" alt="" style="height:${ph}px;object-fit:cover;object-position:top left"></div></div>`;
  const tools = `<div class="toolbar">${modeSeg(mode === 'side' ? 0 : mode === 'overlay' ? 1 : 2, 2)}${phone ? '' : `<span ${co(3)}>${UI.seg('zoom', ['fit', '100%', '200%'], 0)}</span><span>${UI.sw('sync zoom', true)}</span><span class="sp"></span>${secondary('swap sides', 0, 'btn--s')}`}</div>`;
  const panes = mode === 'side'
    ? `<div style="display:grid;grid-template-columns:${phone ? '1fr' : '1fr 1fr'};gap:16px">${pane('A · left', selA(1), A, 'chosen', 'oct 1', 4)}${pane('B · right', selB(), B, 'chosen', 'oct 1', 0)}</div>`
    : `<div style="display:grid;gap:12px">${stage({ mode, w: phone ? 354 : 1344, h: phone ? 221 : 640, pos: 46 })}</div>`;
  const body = `${head(phone, 'two posts, any image on each side · click an image to zoom')}${tabsRow}${tools}${panes}`;
  const t = `<div class="abs" style="${phone ? 'left:18px;right:18px;top:770px' : 'right:48px;top:842px'};z-index:7;display:flex;justify-content:center">${toast('sides swapped', 'undo', 5)}</div>`;
  return `<div class="frame ${phone ? 'phone touch tall' : ''}" ${phone ? '' : ''}>${phone ? phHdr() : header({ active: '' })}<div class="pg">${body}</div>${phone ? '' : abs('left:48px;bottom:16px;z-index:4', kbar(kbi(key('1') + key('2') + key('3'), 'mode'), kbi(key('x'), 'swap'), kbi(key('esc'), 'back')))}${t}</div>`;
}

/* ------------------------------------------------------------- option 2: immersive stage, one dock (onion skin first) */
function x2(phone, diff = false) {
  const dock = `<div class="dock" style="${phone ? 'bottom:14px;left:12px;right:12px;transform:none;flex-wrap:wrap;gap:10px;justify-content:center;padding:10px' : 'bottom:20px;'}" ${co(2)}>${UI.seg('mode', ['side by side', 'overlay', 'wipe'], 1)}${phone ? '' : `<span class="lab-mono">${diff ? 'difference' : 'B over A'}</span>`}${UI.seg('opacity', ['0', '25', '50', '75', '100'], 2)}${UI.chip('difference', { sel: diff })}${phone ? '' : secondary('swap', 0, 'btn--s')}</div>`;
  if (phone) {
    return `<div class="frame phone touch" style="height:844px;overflow:hidden">${phHdr()}<div class="pg" style="padding-top:60px">${head(true, '')}<div style="margin:0 -18px">${stage({ mode: diff ? 'diff' : 'overlay', w: 390, h: 244, op: 50 })}</div>
      <div class="row" style="gap:10px"><div style="flex:1;display:grid;gap:4px"><span class="lab-mono">A</span>${selA(1)}</div><div style="flex:1;display:grid;gap:4px"><span class="lab-mono">B</span>${selB()}</div></div></div>${dock.replace('bottom:14px', 'bottom:30px')}</div>`;
  }
  const rail = `<div class="abs" style="left:1262px;top:86px;width:134px;display:grid;gap:14px;z-index:3"><div class="lab-mono">A · beneath</div><div class="c2" style="aspect-ratio:16/10"><img src="${A}" alt=""><span class="id">A-05</span></div><div class="lab-mono">B · over</div><div class="c2" style="aspect-ratio:16/10"><img src="${B}" alt=""><span class="id">B-05</span></div><span ${co(3)}>${secondary('swap', 0, 'btn--s')}</span></div>`;
  return `<div class="frame">${header({ active: '' })}
    ${abs('left:48px;top:76px;z-index:3;display:flex;gap:16px;align-items:center', `<span class="lab-mono">compare</span>${selA(1)}<span class="lab-mono">over</span>${selB()}`)}
    ${abs('left:48px;top:122px;', `<div style="position:relative">${stage({ mode: diff ? 'diff' : 'overlay', w: 1190, h: 744, op: 50 })}${dock.replace('bottom:20px;', 'bottom:18px;')}</div>`)}
    ${rail}${abs('right:48px;bottom:18px;z-index:7', toast(diff ? 'showing the difference' : 'B over A at 50%', 'undo', 4))}</div>`;
}

/* ------------------------------------------------------------- option 3: wipe first, one pair component with a list of changes */
function x3(phone) {
  const changes = ['A has the dotted connector from the coach line to its marker; B says “tap a marker on the ring”.', 'B moves the time into the rail (120 px); A keeps it under the cube.', 'B shows the three actions in the rail; A centres them under the clock.'];
  const chg = `<div class="chg" ${co(4)}>${changes.map((t, i) => `<div class="it"><b>${i + 1}</b><span>${t}</span></div>`).join('')}</div>`;
  if (phone) {
    return `<div class="frame phone touch tall">${phHdr()}<div class="pg">${head(true, '')}
      <div style="margin:0 -18px">${stage({ mode: 'wipe', w: 390, h: 244, pos: 46 })}</div>
      <div class="row" style="gap:10px"><div style="flex:1;display:grid;gap:4px"><span class="lab-mono">A · left</span>${selA(1)}</div><div style="flex:1;display:grid;gap:4px"><span class="lab-mono">B · right</span>${selB()}</div></div>
      ${modeSeg(2, 2).replace('class="seg"', 'class="seg" data-full')}${chg}
      <div class="row">${secondary('swap sides', 0, 'btn--s')}${textBtn('open both', 0, 'btn--s')}</div></div></div>`;
  }
  return `<div class="frame">${header({ active: '' })}<div class="pg" style="padding-top:78px">${head(false, 'wipe is the default; the same component serves the design lab and “yours vs better”')}
    <div style="display:grid;grid-template-columns:860px minmax(0,1fr);gap:40px;align-items:start;margin-top:4px">
      <div style="display:grid;gap:12px"><div data-co="3" style="width:860px">${stage({ mode: 'wipe', w: 860, h: 537, pos: 46 })}</div><div class="row" style="justify-content:space-between"><span class="cap-m">drag the handle, or ← → to move it · 1 2 3 switches the mode</span>${UI.chip('lock the handle', { sel: false })}</div></div>
      <div style="display:grid;gap:18px;align-content:start">
        <div style="display:grid;gap:6px"><span class="lab-mono">A · left</span>${selA(1)}</div><div style="display:grid;gap:6px"><span class="lab-mono">B · right</span>${selB()}</div>
        <div style="display:grid;gap:6px"><span class="lab-mono">mode</span>${modeSeg(2, 2)}</div>
        <div style="display:grid;gap:8px"><span class="lab-mono">what differs · 3</span>${chg}</div>
        <div class="row">${secondary('swap sides', 0, 'btn--s')}${textBtn('open both', 0, 'btn--s')}</div></div></div></div>
    ${abs('left:48px;bottom:16px;z-index:4', kbar(kbi(key('←') + key('→'), 'move handle'), kbi(key('1') + key('2') + key('3'), 'mode'), kbi(key('x'), 'swap')))}</div>`;
}

/* ------------------------------------------------------------- the same pair reused: design lab, yours vs better, history */
function orbitPane(better) {
  const segs = resultsSegs.map(s => (better && s.tone === 'warn' ? { ...s, tone: 'good' } : s));
  const mk = better ? [] : resultsMarkers;
  const svg = orbitSVG({ segs, markers: mk }).replace('width="1440" height="900" viewBox="0 0 1440 900"', 'width="100%" height="100%" viewBox="330 90 780 700"');
  return `<div class="stage" style="width:100%;height:100%;border-radius:0;box-shadow:none">${svg}<svg width="100%" height="100%" viewBox="330 90 780 700" style="position:absolute;left:0;top:0">${cubeSVG(720, 440, 190)}</svg></div>`;
}
function pair(inner, l, r, cap) { return `<div style="display:grid;gap:8px"><div class="row" style="justify-content:space-between"><span class="lab-mono">${cap}</span><span class="sub-m">${l} · ${r}</span></div>${inner}</div>`; }
function reuse() {
  const lab = `<div class="stage" style="width:100%;height:340px"><img src="${BT7}" alt=""><img src="${BT2}" alt="" style="clip-path:inset(0 54% 0 0)">${tag('option 1', 'left:12px')}${tag('option 2', 'right:12px')}<div class="handle" style="left:46%"><span class="grip">${ARROWS}</span></div></div>`;
  const yb = `<div class="stage" style="width:100%;height:340px;display:grid;grid-template-columns:1fr 1fr;gap:0"><div style="position:relative;overflow:hidden">${orbitPane(false)}${tag('yours · 14.07', 'left:12px')}</div><div style="position:relative;overflow:hidden;border-left:2px solid var(--b-ink)">${orbitPane(true)}${tag('better · 12.9', 'left:12px')}</div></div>`;
  const hist = `<div class="stage" style="width:100%;height:340px"><img src="${B}" alt=""><img src="${A}" alt="" style="opacity:.5">${tag('solve 23 over solve 22', 'left:12px')}</div>`;
  const body = `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;padding:30px 40px 20px">
    <div ${co(1)}>${pair(lab, 'W-04 option 1', 'option 2', 'design lab: wipe')}</div>
    <div ${co(2)}>${pair(yb, 'solve 23', 'best path', 'yours vs better')}</div>
    <div ${co(3)}>${pair(hist, 'solve 23', 'solve 22', 'history: overlay')}</div></div>`;
  return `<div class="frame tall" style="height:480px">${body}</div>`;
}

export function compare(view, phone) {
  SHORT = phone;
  if (view === 'x1') return x1(phone, 'side');
  if (view === 'x1o') return x1(phone, 'overlay');
  if (view === 'x2') return x2(phone, false);
  if (view === 'x2d') return x2(phone, true);
  if (view === 'x3') return x3(phone);
  return reuse();
}
void primary;
