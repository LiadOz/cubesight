/* global document, window */
// W-22 timer display and W-20 coach line, three options each (opt 1 | 2 | 3), on the A frames. Prototype only; tokens + approved widgets.
//   views: timer-solve timer-inspect timer-states timer-drill timer-phone | coach-results coach-tones coach-crowded coach-phone | light
//   hidden-a/b/c, crowd-a/b/c are the single-crop views the decision sheet uses (they take no opt).
import { q, mount, header, cubeSVG, polar, arcPath } from '../../_proto/common.js';
import * as S from '../../_proto/scenes.js';
import { ST, MK, CX, CY, R, resultsRing, stageLabel, marker, connector, glyph, crop, abs, toneColour, markerXY } from '../../_proto/orbit-kit.js';

const view = q.get('view') || 'timer-solve';
const OPT = Number(q.get('opt') || 1);
const boardId = q.get('id') || 'TC';
const NAMES = { 1: 'quiet digits + rail with a curve', 2: 'tone on the digits + line at the marker height', 3: 'two-line slot + sentence attached to the label' };
const co = (n) => (n ? `data-co="${n}"` : '');
const k = (g, size = 's') => `<kbd class="key key--${size}">${g}</kbd>`;
const kp = (a, b, size = 's') => `<span class="kp">${k(a, size)}${k(b, size)}</span>`;
const kbi = (c, l) => `<span class="kbi">${c}<span>${l}</span></span>`;
const kbar = (...a) => `<div class="kbar">${a.join('')}</div>`;
const primary = (label, cap = '', n = 0, size = 'btn--l') => `<span class="on-primary" ${co(n)}><button class="btn btn--primary ${size}" type="button"><span>${label}</span>${cap}</button></span>`;
const textBtn = (label, n = 0) => `<button class="btn btn--text btn--muted" type="button" ${co(n)}>${label}</button>`;
const choice = (label, key, o = {}) => `<button type="button" class="choice" ${o.sel ? 'aria-pressed="true"' : ''}><kbd class="key key--s choice__kc">${key}</kbd><span>${label}</span></button>`;
const afterMount = () => { document.getElementById('board').dataset.opt = '3'; };
const scaled = (html, s) => `<div style="width:${1440 * s}px;height:${900 * s}px;overflow:hidden;position:relative"><div style="transform:scale(${s});transform-origin:0 0;width:1440px;position:absolute;left:0;top:0">${html}</div></div>`;

/* ================================================================ W-22 the readout */
const SPARKS = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0.8L7.4 4.6L11.2 6L7.4 7.4L6 11.2L4.6 7.4L0.8 6L4.6 4.6Z" fill="currentColor"/></svg>';
const RINGI = '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
const STAGE = 'F2L · pair 4';
const STATE_NAMES = { ready: 'ready', run: 'running', stop: 'stopped', p2: '+2', dnf: 'DNF', insp: 'inspection', ov1: 'inspection over by 1 s', ov2: 'inspection over by 2 s', idnf: 'inspection over 17 s', hidden: 'timer hidden' };
const N = (t, c = '') => `<span class="n ${c}">${t}</span>`;
function mainHtml(st, opt) {
  switch (st) {
    case 'ready': return N('0.00', 'faint');
    case 'run': return N('8.42');
    case 'stop': return N('14.07');
    case 'p2': return opt === 2 ? `${N('14.97', 'warn')}<span class="cmp cmp-r warn">+2</span>` : `${N('14.97')}<span class="pen warn">+</span>`;
    case 'dnf': return opt === 2 ? `<span class="cmp cmp-l dnf">DNF</span>${N('13.20', 'dnf')}` : `<span class="pen dnf">DNF</span><span class="raw">(13.20)</span>`;
    case 'insp': return N('7');
    case 'ov1': return N('+1', 'warn');
    case 'ov2': return N('+2', 'warn');
    case 'idnf': return N('DNF', 'dnf');
    case 'hidden': return opt === 1 ? '<span class="word">hidden</span>' : opt === 2 ? N('–.––', 'faint') : `<span class="stagew">${STAGE}</span>`;
    default: return N(st);
  }
}
const THRESH = '+2 after 15 s · DNF after 17 s';
const SUB = {
  1: { ready: 'ready', insp: 'seconds left', ov1: '1 s over', ov2: '2 s over', idnf: 'over 17 s', run: '', stop: '−0.96 vs ao12 · ao5 14.62 · pb 12.41', p2: '12.97 +2 = 14.97', dnf: 'DNF · 13.20 raw', hidden: 't to show' },
  2: { ready: 'ready', insp: 'seconds left', ov1: '1 s over', ov2: '2 s over', idnf: 'over 17 s', run: '', stop: '−0.96 vs ao12 · ao5 14.62 · pb 12.41', p2: '12.97 +2 = 14.97', dnf: 'DNF · 13.20 raw', hidden: 't to show' },
  3: { ready: THRESH, insp: THRESH, ov1: '+2 if you start now', ov2: '+2 if you start now', idnf: 'DNF if you start now', run: `<span class="t" style="color:var(--b-accent-text);font-weight:500">${STAGE}</span>`, stop: '−0.96 vs ao12 · ao5 14.62 · pb 12.41', p2: '12.97 +2 = 14.97', dnf: 'DNF · 13.20 raw', hidden: 'timer hidden · t to show' },
};
/** the readout element alone, in a size: xl | xlp (phone) | l | m */
const rd = (st, opt, size = 'xl') => `<span class="rd rd--${size}" style="${size === 'xl' ? '--rd:120px' : size === 'xlp' ? '--rd:76px' : ''}" aria-label="${STATE_NAMES[st]}">${mainHtml(st, opt)}</span>`;
/** the slot under the cube: the stage line, the readout, the sub line. The readout never moves between states. */
function slot(st, opt, { phone = false, top = 664, width = 1440, n1 = 0, n2 = 0 } = {}) {
  const above = opt !== 3 && st === 'run' ? STAGE : '';
  const size = phone ? 76 : 120;
  return abs(`left:0;width:${width}px;top:${top}px;display:grid;justify-items:center;--rd:${size}px`,
    `<div class="rd-stage">${above}</div><div ${co(n1)}><span class="rd" aria-label="${STATE_NAMES[st]}">${mainHtml(st, opt)}</span></div><div class="rd-sub" ${co(n2)}>${SUB[opt][st]}</div>`, phone ? 'data-phone="1"' : '');
}

/* ================================================================ rings */
const ang = (s) => -145 + s * (290 / 17);
function liveRing(partial = 0.55) {
  let svg = ''; let html = '';
  ST.forEach((s, i) => {
    if (i < 4) svg += `<path d="${arcPath(CX, CY, R, s.a0, s.a1)}" fill="none" stroke="var(--b-fill)" stroke-width="6" stroke-linecap="round"/>`;
    else if (i === 4) {
      const mid = s.a0 + (s.a1 - s.a0) * partial;
      svg += `<path d="${arcPath(CX, CY, R, mid, s.a1)}" fill="none" stroke="var(--b-track)" stroke-width="3" stroke-linecap="round"/>`
        + `<path d="${arcPath(CX, CY, R, s.a0, mid)}" fill="none" stroke="var(--b-fill-live)" stroke-width="8" stroke-linecap="round"/>`;
      const [x, y] = polar(CX, CY, R, mid);
      svg += `<circle cx="${x}" cy="${y}" r="14" fill="var(--b-accent-soft)"/><circle cx="${x}" cy="${y}" r="5.5" fill="var(--b-bg)" stroke="var(--b-fill-live)" stroke-width="2.6"/>`;
    } else svg += `<path d="${arcPath(CX, CY, R, s.a0, s.a1)}" fill="none" stroke="var(--b-track)" stroke-width="3" stroke-linecap="round"/>`;
  });
  for (const key of ['cross', 'p2', 'p3']) { const [x, y] = markerXY(key); svg += marker(x.toFixed(1), y.toFixed(1), MK[key].tone); }
  ST.forEach((s, i) => {
    if (i < 4) html += stageLabel(s, { mk: null });
    else {
      const [x, y, a] = s.pos; const tx = a === 'r' ? '-100%' : a === 'c' ? '-50%' : '0';
      const live = i === 4;
      html += `<div style="position:absolute;left:${x}px;top:${y}px;transform:translateX(${tx});white-space:nowrap;text-align:${a === 'r' ? 'right' : a === 'c' ? 'center' : 'left'}"><div style="font:400 11px var(--b-font-mono);color:${live ? 'var(--b-accent-text)' : 'var(--b-muted)'}">${s.k}</div><div style="font:${live ? '500 17px var(--b-font-sans)' : '400 11px var(--b-font-mono)'};color:${live ? 'var(--b-accent-text)' : 'var(--b-faint)'};margin-top:2px">${live ? '1.15' : `~${{ eo: '0.98', co: '1.55', cp: '1.62', ep: '1.49' }[s.k]}`}</div></div>`;
    }
  });
  html += `<div class="pill-live" style="left:665px;top:166px">pseudo pair, nice</div>`;
  return { svg: `<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${svg}</svg>`, html };
}
function inspRing(elapsed, { cx = CX, cy = CY, r = R, w = 1440, h = 900, small = false } = {}) {
  const a = (s) => ang(s);
  let svg = `<path d="${arcPath(cx, cy, r, a(0), a(17))}" fill="none" stroke="var(--b-track)" stroke-width="3" stroke-linecap="round"/>`;
  const e = Math.min(elapsed, 17);
  if (e < 15) svg += `<path d="${arcPath(cx, cy, r, a(e), a(15))}" fill="none" stroke="var(--b-fill-live)" stroke-width="${small ? 6 : 8}" stroke-linecap="round"/>`;
  if (e < 17) svg += `<path d="${arcPath(cx, cy, r, a(Math.max(e, 15)), a(17))}" fill="none" stroke="var(--b-warn)" stroke-width="${small ? 5 : 6}" stroke-linecap="round" opacity="${e >= 15 ? 1 : 0.5}"/>`;
  else svg += `<path d="${arcPath(cx, cy, r, a(15), a(17))}" fill="none" stroke="var(--b-dnf)" stroke-width="5" stroke-linecap="round" opacity=".55"/>`;
  const tick = (s, col, len = 9) => { const [x0, y0] = polar(cx, cy, r - len, a(s)); const [x1, y1] = polar(cx, cy, r + len, a(s)); return `<path d="M${x0} ${y0}L${x1} ${y1}" stroke="${col}" stroke-width="1.6"/>`; };
  svg += tick(15, 'var(--b-muted)') + tick(17, 'var(--b-dnf)');
  const [cxp, cyp] = polar(cx, cy, r, a(e));
  svg += `<circle cx="${cxp}" cy="${cyp}" r="${small ? 11 : 14}" fill="${e >= 15 ? 'var(--b-plus2-soft)' : 'var(--b-accent-soft)'}"/><circle cx="${cxp}" cy="${cyp}" r="${small ? 4.5 : 5.5}" fill="var(--b-bg)" stroke="${e >= 15 ? 'var(--b-warn)' : 'var(--b-fill-live)'}" stroke-width="2.6"/>`;
  let html = '';
  const lb = (s, text, col, off = 34) => { const [x, y] = polar(cx, cy, r + off, a(s)); return `<div style="position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);font:400 ${small ? 10 : 12}px var(--b-font-mono);color:${col};white-space:nowrap">${text}</div>`; };
  html += lb(8, '8 s', 'var(--b-muted)') + lb(12, '12 s', 'var(--b-muted)') + lb(15, '15', 'var(--b-muted)') + lb(16, '+2', 'var(--b-warn)', 38) + lb(17, 'DNF', 'var(--b-dnf)', 34);
  return { svg: `<svg class="stage-svg" width="${w}" height="${h}" aria-hidden="true">${svg}</svg>`, html };
}
const idleRing = () => {
  let svg = '';
  ST.forEach((s) => { svg += `<path d="${arcPath(CX, CY, R, s.a0, s.a1)}" fill="none" stroke="var(--b-track)" stroke-width="3" stroke-linecap="round"/>`; });
  return { svg: `<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${svg}</svg>`, html: '' };
};

/* ================================================================ W-20 the coach line */
const COACH = {
  cross: { tone: 'warn', text: 'Pseudo pair 3 and the EO skip were the highlights; the cross detour at move 4 cost 0.6 s, 6 moves existed.' },
  p3: { tone: 'good', text: 'Pair 3 went in pseudo: 2 moves fewer than the best normal pair.' },
  p4: { tone: 'warn', text: '0.9 s pause before R. You usually move every 0.3 s.' },
  eo: { tone: 'good', text: 'EO skip! 4 moves saved.' },
  crowd: { tone: 'warn', text: 'Cross took 8. 6 was possible on yellow: D R′ F.' },
};
const tagInner = (tone, extra = '') => `${tone === 'good' ? SPARKS : RINGI}<span>coach${extra}</span>`;
// per option: block position, text alignment and the connector path (start, end) of the shown selections
const P1 = { // rail: two fixed slots per side (top 84, bottom 548); a gentle curve
  cross: { x: 48, y: 548, d: 'M316 608 Q392 606 466 636', from: [316, 608], to: [466, 636] },
  p3: { x: 48, y: 84, d: 'M316 146 Q480 138 642 147', from: [316, 146], to: [642, 147] },
  p4: { x: 1130, y: 84, d: 'M1124 146 Q960 160 818 153', from: [1124, 146], to: [818, 153] },
  eo: { x: 1130, y: 84, d: 'M1124 146 C1050 150 990 190 963 238', from: [1124, 146], to: [963, 238] },
};
const P2 = { // the sentence sits at the marker's own height; a straight line
  cross: { x: 48, y: 570, d: 'M316 626L467 626', from: [316, 626], to: [467, 626] },
  p3: { x: 48, y: 104, d: 'M316 146L642 146', from: [316, 146], to: [642, 146] },
  p4: { x: 1130, y: 109, d: 'M1124 151L817 151', from: [1124, 151], to: [817, 151] },
  eo: { x: 1130, y: 221, d: 'M1124 249L968 249', from: [1124, 249], to: [968, 249] },
};
const P3 = { // attached to the label, no line
  cross: { x: 60, y: 628, w: 292, align: 'right' },
  p3: { x: 300, y: 70, w: 284, align: 'right' },
  p4: { x: 962, y: 84, w: 300, align: 'left' },
  eo: { x: 1058, y: 190, w: 280, align: 'left' },
};
/** the coach for one selected marker: { svg, html } to add on top of the frame. opt picks the placement. */
function coach(opt, key, { id = 'cn', textOverride = null, extra = '', more = '', noLine = false } = {}) {
  const c = COACH[key === 'crowd' ? 'crowd' : key]; const tone = c.tone; const text = textOverride || c.text;
  if (opt === 3) {
    const p = P3[key];
    return { svg: '', html: abs(`left:${p.x}px;top:${p.y}px;width:${p.w}px;text-align:${p.align}`, `<div class="coach at is-${tone}" style="position:static;width:auto"><div class="tag" style="justify-content:${p.align === 'right' ? 'flex-end' : 'flex-start'}">${tagInner(tone, extra)}</div><p>${text}</p>${more}</div>`) };
  }
  const p = (opt === 1 ? P1 : P2)[key];
  const html = abs(`left:${p.x}px;top:${p.y}px;width:262px`, `<div class="coach is-${tone}" style="position:static"><div class="tag">${tagInner(tone, extra)}</div><p>${text}</p>${more}</div>`);
  return { svg: noLine ? '' : `<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${connector(p.d, { id, tone, from: p.from, to: p.to })}</svg>`, html };
}

/* ================================================================ frames */
const cubeSvg = (o = {}) => `<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(720, 440, 215, o)}</svg>`;
/** the A-04/A-05 screen: ring + cube + slot, with optional extras. */
function screen({ opt, mode, st, sel = null, bottom = '', keys = '', meta = '', overlay = '', cube = {}, ringExtra = '', active = 'solve', elapsed = 8, hideLines = false, slotOpts = {} }) {
  let r;
  if (mode === 'results') r = resultsRing({ sel, hideLine: sel, extra: ringExtra, labels: true, markers: hideLines ? {} : MK });
  else if (mode === 'live') r = liveRing();
  else if (mode === 'insp') r = inspRing(elapsed);
  else r = idleRing();
  return `<div class="frame">${header({ active })}${r.svg}${cubeSvg(cube)}${r.html}${slot(st, opt, slotOpts)}
    ${keys ? abs('left:48px;bottom:16px', keys) : ''}${bottom ? abs('left:0;width:1440px;top:846px;display:flex;justify-content:center;align-items:center;gap:22px', bottom) : ''}${meta ? abs('right:48px;bottom:20px', meta) : ''}${overlay}</div>`;
}
const resultsActions = `${primary('next scramble', k('space', 'm'))}${textBtn('review')}${textBtn('more…')}`;
const resultsKeys = kbar(kbi(kp('[', ']'), 'markers'), kbi(k('esc'), 'back'));
const liveKeys = kbar(kbi(k('esc'), 'stop'), kbi(k('t'), 'hide timer'));

/* ---------------------------------------------------------------- crowded ring (feedback 8): 14 markers, four clusters within 5 degrees */
const CM = [
  { a: -134, t: 'warn', rk: 1 }, { a: -129.5, t: 'warn', rk: 2 }, { a: -126, t: 'warn', rk: 3 },
  { a: -90, t: 'good', rk: 1 }, { a: -52, t: 'good', rk: 1 }, { a: -49, t: 'warn', rk: 2 },
  { a: -12.5, t: 'good', rk: 1 }, { a: -9.5, t: 'warn', rk: 2 }, { a: 14, t: 'warn', rk: 1 }, { a: 17.5, t: 'warn', rk: 2 },
  { a: 50, t: 'good', rk: 1 }, { a: 75, t: 'warn', rk: 1 }, { a: 108, t: 'good', rk: 1 }, { a: 135, t: 'good', rk: 1 },
];
function clusters() { // consecutive markers closer than 5 degrees
  const out = []; let cur = [];
  CM.forEach((m, i) => { if (cur.length && m.a - CM[i - 1].a > 5) { out.push(cur); cur = []; } cur.push(m); });
  out.push(cur); return out;
}
function crowdRing(opt, { cx = CX, cy = CY, r = R, w = 1440, h = 900, selIdx = 0, small = false } = {}) {
  let svg = ''; let extraHtml = '';
  const labelsDim = true;
  for (const s of ST) svg += `<path d="${arcPath(cx, cy, r, s.a0, s.a1)}" fill="none" stroke="${s.tone === 'good' ? 'var(--b-good)' : s.tone === 'warn' ? 'var(--b-warn)' : 'var(--b-fill)'}" stroke-width="${small ? 4.5 : 6}" stroke-linecap="round"/>`;
  const cls = clusters();
  let selPt = null; let selPts = [];
  cls.forEach((cl, ci) => {
    const mean = cl.reduce((s, m) => s + m.a, 0) / cl.length; const top = cl.find((m) => m.rk === 1);
    const isSel = ci === selIdx;
    if (cl.length === 1) { const [x, y] = polar(cx, cy, r, mean); svg += marker(x.toFixed(1), y.toFixed(1), top.t, { small }); return; }
    if (opt === 3) {
      const [x, y] = polar(cx, cy, r, top.a); svg += marker(x.toFixed(1), y.toFixed(1), top.t, { sel: isSel, small });
      const [tx, ty] = polar(cx, cy, r + (small ? 20 : 24), top.a + 4);
      extraHtml += `<div style="position:absolute;left:${tx}px;top:${ty}px;transform:translate(-50%,-50%);font:500 ${small ? 9 : 10}px var(--b-font-mono);color:var(--b-muted)">+${cl.length - 1}</div>`;
      if (isSel) selPt = [x, y];
      return;
    }
    if (!isSel) { const [x, y] = polar(cx, cy, r, mean); svg += marker(x.toFixed(1), y.toFixed(1), top.t, { n: cl.length, small }); return; }
    if (opt === 1) { // expanded in place: the markers spread to 8 degrees on the ring, numbered
      cl.forEach((m, i) => { const aa = mean + (i - (cl.length - 1) / 2) * (small ? 12 : 8); const [x, y] = polar(cx, cy, r, aa); svg += marker(x.toFixed(1), y.toFixed(1), m.t, { n: i + 1, sel: i === 0, small }); if (i === 0) selPt = [x, y]; });
    } else { // opt 2: fanned out onto a second radius with leader lines
      cl.forEach((m, i) => {
        const [x0, y0] = polar(cx, cy, r, m.a); const aa = mean + (i - (cl.length - 1) / 2) * (small ? 14 : 10); const [x, y] = polar(cx, cy, r + (small ? 30 : 46), aa);
        svg += `<path d="M${x0} ${y0}L${x} ${y}" stroke="var(--b-faint)" stroke-width="1" fill="none"/><circle cx="${x0}" cy="${y0}" r="2.4" fill="${toneColour(m.t)}"/>`;
        svg += marker(x.toFixed(1), y.toFixed(1), m.t, { n: i + 1, sel: i === 0, small }); if (i === 0) selPt = [x, y];
        selPts.push([x, y]);
      });
    }
  });
  return { svg: `<svg class="stage-svg" width="${w}" height="${h}" aria-hidden="true">${svg}</svg>`, html: extraHtml, selPt, labelsDim };
}
function crowdScreen(opt) {
  const cr = crowdRing(opt);
  const labels = ST.map((s) => stageLabel(opt === 2 && s.k === 'cross' ? { ...s, pos: [368, 606, 'r'] } : s, { dim: s.k !== 'cross' })).join('');
  const [sx, sy] = cr.selPt;
  const dx = 466 - sx; // marker end
  const hint = opt === 1 ? `<div class="more">${kp('[', ']')}<span>1 of 3 · next</span></div>` : opt === 2 ? `<div class="more">${kp('[', ']')}<span>1 of 3 · next</span></div>` : '';
  const alsoLine = opt === 3 ? `<div class="more" style="margin-top:8px;display:block;line-height:1.5">also here: pause 0.6 s · rotation before R</div>` : '';
  let cc;
  const sel = { x: sx, y: sy };
  if (opt === 1) {
    const to = [sx - 18, sy + 3]; const from = [316, 608];
    cc = { svg: `<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${connector(`M316 608 Q${(316 + to[0]) / 2} 604 ${to[0]} ${to[1]}`, { id: 'cr1', tone: 'warn', from, to })}</svg>`,
      html: abs('left:48px;top:548px;width:262px', `<div class="coach is-warn" style="position:static"><div class="tag">${RINGI}<span>coach · to fix</span></div><p>${COACH.crowd.text}</p>${hint}</div>`) };
  } else if (opt === 2) {
    const y = sy; const to = [sx - 19, y]; const from = [316, y];
    cc = { svg: `<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${connector(`M316 ${y}L${to[0]} ${y}`, { id: 'cr2', tone: 'warn', from, to })}</svg>`,
      html: abs(`left:48px;top:${y - 72}px;width:262px`, `<div class="coach is-warn" style="position:static"><div class="tag">${RINGI}<span>coach · to fix</span></div><p>${COACH.crowd.text}</p>${hint}</div>`) };
  } else {
    cc = { svg: '', html: abs('left:60px;top:652px;width:292px;text-align:right', `<div class="coach at is-warn" style="position:static;width:auto"><div class="tag" style="justify-content:flex-end">${RINGI}<span>coach · to fix</span></div><p>${COACH.crowd.text}</p>${alsoLine}</div>`) };
  }
  void dx; void sel;
  return `<div class="frame">${header()}${cr.svg}${cubeSvg()}${labels}${cr.html}${cc.svg}${cc.html}${slot('stop', opt)}
    ${abs('left:0;width:1440px;top:846px;display:flex;justify-content:center;align-items:center;gap:22px', resultsActions)}${abs('left:48px;bottom:16px', resultsKeys)}</div>`;
}

/* ---------------------------------------------------------------- phone frames (390 x 844) */
const PCX = 195, PCY = 318, PR = 150;
function phoneRing({ mode, sel = null, elapsed = 8, opt, crowd = false }) {
  let svg = ''; let html = '';
  if (mode === 'insp') { const r = inspRing(elapsed, { cx: PCX, cy: PCY, r: PR, w: 390, h: 844, small: true }); return r; }
  if (crowd) { const cr = crowdRing(opt, { cx: PCX, cy: PCY, r: PR, w: 390, h: 844, small: true }); return { svg: cr.svg, html: cr.html, selPt: cr.selPt }; }
  for (const s of ST) {
    if (mode === 'live' && ST.indexOf(s) >= 4) svg += `<path d="${arcPath(PCX, PCY, PR, s.a0, s.a1)}" fill="none" stroke="var(--b-track)" stroke-width="3" stroke-linecap="round"/>`;
    else svg += `<path d="${arcPath(PCX, PCY, PR, s.a0, s.a1)}" fill="none" stroke="${mode === 'live' ? 'var(--b-fill)' : s.tone === 'good' ? 'var(--b-good)' : s.tone === 'warn' ? 'var(--b-warn)' : 'var(--b-fill)'}" stroke-width="5" stroke-linecap="round"/>`;
    const [x, y] = polar(PCX, PCY, PR + 26, (s.a0 + s.a1) / 2);
    if (mode !== 'idle') html += `<div style="position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);font:400 11px var(--b-font-mono);color:${s.dw ? 'var(--b-warn-text)' : s.tone === 'good' ? 'var(--b-good)' : 'var(--b-ink)'};opacity:${sel && mode === 'results' ? 0.5 : 1}">${s.val === 'skip' ? 'skip' : s.val}</div>`;
  }
  const keys = mode === 'live' ? ['cross', 'p2', 'p3'] : Object.keys(MK);
  for (const key of keys) { const [x, y] = polar(PCX, PCY, PR, MK[key].a); svg += marker(x.toFixed(1), y.toFixed(1), MK[key].tone, { sel: sel === key, small: true }); }
  return { svg: `<svg class="stage-svg" width="390" height="844" aria-hidden="true">${svg}</svg>`, html };
}
function phoneScreen({ opt, mode, st, sel = null, elapsed = 8, crowd = false, sentence = '', conn = '', actions = '', stopBtn = false, hdrDot = '' }) {
  const r = phoneRing({ mode, sel, elapsed, opt, crowd });
  return `<div class="frame phone touch" style="width:390px;height:844px">
    <div class="hdr" style="padding:0 24px;height:60px"><span class="word" style="font-size:17px;margin:0">cubesight</span><span class="chip-cube" style="font-size:11px"><i class="dot ${hdrDot}"></i>GAN 356 i3</span></div>
    ${r.svg}<svg class="stage-svg" width="390" height="844" aria-hidden="true">${cubeSVG(PCX, PCY + 4, 108, mode === 'insp' ? { top: 'y', left: 'b', right: 'o' } : {})}</svg>${r.html}
    ${conn}
    ${slot(st, opt, { phone: true, top: 488, width: 390 })}
    ${sentence}
    ${stopBtn ? abs('left:24px;right:24px;bottom:28px;display:flex;justify-content:center', textBtn('stop')) : ''}
    ${actions ? abs('left:24px;right:24px;bottom:28px;display:flex;flex-direction:column;align-items:stretch;gap:6px', actions) : ''}
  </div>`;
}
const phoneActions = `${primary('next scramble', '', 0, 'btn--l')}<div class="row" style="justify-content:space-between;padding:0 8px">${textBtn('review')}${textBtn('more…')}</div>`;
function phoneCoach(opt, key, { crowd = false, st = 'stop' } = {}) {
  const c = crowd ? COACH.crowd : COACH[key]; const tone = c.tone;
  const mk = crowd ? null : polar(PCX, PCY, PR, MK[key].a);
  const tag = `<div class="tag">${tone === 'good' ? SPARKS : RINGI}<span>coach${opt === 3 ? ` · ${crowd ? 'cross' : key}` : ''}${crowd ? ' · 1 of 3' : ''}</span></div>`;
  const more = crowd && opt === 3 ? `<div class="more" style="display:block;margin-top:6px">also here: pause 0.6 s · rotation before R</div>` : crowd ? `<div class="more"><span>[ ] next · 1 of 3</span></div>` : '';
  const text = abs('left:24px;right:24px;top:600px', `<div class="coach phone-c is-${tone}">${tag}<p>${c.text}</p>${more}</div>`);
  let conn = '';
  const pt = crowd ? phoneCrowdPt(opt) : mk;
  const top = pt[1] < PCY;   // a marker in the upper half: route through the left margin, never across the cube
  if (opt === 1) {
    const to = top ? [pt[0] - 14, pt[1] - 2] : [pt[0] - 12, pt[1] + 11];
    const d = top ? `M24 598 C4 470 4 214 ${to[0]} ${to[1]}` : `M30 598 C12 540 22 478 ${to[0]} ${to[1]}`;
    conn = `<svg class="stage-svg" width="390" height="844" aria-hidden="true">${connector(d, { id: 'pc1', tone, from: [top ? 24 : 30, 598], to })}</svg>`;
  } else if (opt === 2) {
    const to = [pt[0] - 15, pt[1]];   // arrives horizontally at the marker's own height, like the desktop line
    conn = `<svg class="stage-svg" width="390" height="844" aria-hidden="true">${connector(`M20 598L20 ${to[1]}L${to[0]} ${to[1]}`, { id: 'pc2', tone, from: [20, 598], to })}</svg>`;
  }
  return { sentence: text, conn };
}
function phoneCrowdPt(opt) { return opt === 3 ? polar(PCX, PCY, PR, -134) : opt === 1 ? polar(PCX, PCY, PR, -129.5 - 12) : polar(PCX, PCY, PR + 30, -129.5 - 14); }

/* ================================================================ views */
const VIEWS = {};

VIEWS['timer-solve'] = () => {
  const frame = screen({ opt: OPT, mode: 'live', st: 'run', keys: liveKeys, slotOpts: { n1: 1, n2: 2 }, ringExtra: '' });
  mount({ id: boardId, name: `W-22 option ${OPT}: solving, the XL readout in the dial slot (A-04, 1440 x 900)`, frame, cols: 1, legend: [
    `<b>XL readout (1):</b> ${['digits only, always cream; the stage name sits above (A-04). Nothing else changes while the clock runs.', 'digits only while running; tone appears only for penalties (see the states sheet). Stage name above as in A-04.', 'digits only, and the stage name moves into the second line under the time, so the readout and what sits above it never shift.'][OPT - 1]}`,
    `<b>Under the readout (2):</b> ${['empty while running (the Orbit carries the stage).', 'empty while running.', 'the stage name in teal: this line always exists in option 3 (it is also the +2 / DNF thresholds before the start).'][OPT - 1]}`,
    '<b>The slot never moves.</b> The Orbit, the cube and the readout are the same shapes in every state; the clock is driven by the timer without CSS transitions.'] });
  afterMount();
};

VIEWS['timer-inspect'] = () => {
  const one = (elapsed, st, note) => crop(screen({ opt: OPT, mode: 'insp', st, elapsed, cube: { top: 'y', left: 'b', right: 'o' } }), { x: 340, y: 90, w: 760, h: 800, s: 0.6 }) + `<div class="lab-mono" style="margin-top:8px;max-width:456px">${note}</div>`;
  const frame = `<div class="grid2" style="grid-template-columns:repeat(3,456px);gap:24px;justify-content:center">
    <div>${one(8, 'insp', 'insp · 8 s elapsed: the digit is whole seconds left (VOICE 4.1)')}</div>
    <div>${one(15.5, 'ov1', 'insp · 15.5 s: the digit counts seconds over: +1, then +2')}</div>
    <div>${one(17.3, 'idnf', 'insp · past 17 s: DNF if you start now')}</div></div>`;
  mount({ id: boardId, name: `W-22 option ${OPT}: inspection countdown, overtime and the DNF line (A-03)`, frame: `<div class="frame" style="height:auto;width:1440px;overflow:visible"><div style="height:24px"></div>${frame}<div style="height:12px"></div></div>`, cols: 1, width: 1440, legend: [
    'The same XL readout, the same slot: the whole-second countdown, then <b>+1 / +2</b> (seconds over 15, amber) and <b>DNF</b> (red) after 17 s. The Orbit dial carries the +2 zone and the DNF tick (A-03); the readout carries the number.',
    `Option ${OPT}: ${['sub line only when it adds something (seconds left, 1 s over, over 17 s).', 'the same digits; the sub line is the only text; amber and red come from the token states.', 'the permanent second line says what happens now: the thresholds before 15 s, then “+2 if you start now”, then “DNF if you start now”.'][OPT - 1]}`] });
};

VIEWS['timer-states'] = () => {
  const states = ['ready', 'run', 'stop', 'p2', 'dnf', 'insp', 'ov1', 'ov2', 'idnf', 'hidden'];
  const noteBy = {
    ready: 'ghost zero, faint; “hold space” is the button’s job', run: 'ink; no sub line from the readout', stop: 'one time and one comparison line (VOICE 4.2)', p2: 'list form 14.97+ (VOICE 4.3), detail 12.97 +2 = 14.97',
    dnf: 'DNF(13.20): raw time kept, never DNF alone', insp: 'whole seconds left', ov1: 'seconds over 15', ov2: 'seconds over 15', idnf: 'past 17 s', hidden: 'the timer-hidden mode (key t); the Orbit still shows the stage',
  };
  const rows = states.map((st, i) => `<div class="srow"><div class="st-name"><b>${STATE_NAMES[st]}</b>${st}</div>
    <div class="xl" ${i === 3 ? co(1) : i === 9 ? co(2) : ''}><span class="rd" style="--rd:120px">${mainHtml(st, OPT)}</span><div class="rd-sub">${SUB[OPT][st]}</div></div>
    <div class="cellL" ${i === 1 ? co(3) : ''}><span class="rd rd--l">${mainHtml(st, OPT)}</span></div>
    <div ${i === 1 ? co(4) : ''}><span class="inl">case 13 · <span class="rd rd--m">${mainHtml(st, OPT)}</span></span></div>
    <div class="note">${noteBy[st]}</div></div>`).join('');
  const frame = `<div class="frame" style="height:auto;width:1440px;overflow:visible"><div class="srow head"><span>state</span><span>XL (120 px; phone 76) · the dial slot under the cube</span><span>L (60) · drills</span><span>M (28) · inline</span><span>note</span></div>${rows}</div>`;
  mount({ id: boardId, name: `W-22 option ${OPT}: every state in the three sizes`, frame, cols: 2, legend: [
    `<b>+2 (1):</b> ${['“14.97+” as one string; the plus is amber, the digits stay cream.', 'the digits turn amber and “+2” sits raised to the right of them; the sub line shows 12.97 +2.', 'the same “14.97+” as option 1; the second line is always present and says 12.97 +2 = 14.97.'][OPT - 1]}`,
    `<b>Timer hidden (2):</b> ${['the word “hidden” in faint mono; “t to show” below.', 'faint ghost digits “–.––” at full size: the readout is there, only the value is not.', 'the stage name in the slot (F2L · pair 4) and the line “timer hidden · t to show”.'][OPT - 1]}`,
    '<b>L (3)</b> is the drill case time and the alg drill clock (today W-22a 60 px and W-22b/d); <b>M (4)</b> is the inline form used in counters, history rows and the drill foot line. Same markup, same states.',
    'Formats follow VOICE 4.1 to 4.3: two decimals, a real minus in deltas, 14.97+ and DNF(13.20).'] });
  afterMount();
};

VIEWS['timer-drill'] = () => {
  const answers = [choice('L-shape', 1), choice('T-shape', 2, { sel: true }), choice('Dot', 3), choice('Line', 4)].join('');
  const rail = `<div style="--rd:60px" ${co(1)}><div class="meta" style="margin-bottom:8px">case time</div><span class="rd rd--l">${N('1.84')}</span></div>`;
  const foot = `<span class="inl" ${co(2)}>case 13 of 20 · <span class="rd rd--m">${N('1.84')}</span> s</span>`;
  const frame = S.drill({ answers, question: 'which OLL is this?', keybar: kbar(kbi(k('s'), 'skip'), kbi(k('esc'), 'quit')), foot, overlay: abs('left:48px;top:392px', rail) });
  mount({ id: boardId, name: `W-22 option ${OPT}: a drill (A-08), L readout in the rail and M inline`, frame, cols: 1, legend: [
    '<b>L (1):</b> the running case time, one number at 60 px, no sub line; it becomes the answer time when you answer (the Orbit segment takes the colour).',
    '<b>M (2):</b> the inline form in the foot line (28 px, regular weight): the same states, so a slow answer reads 2.31 s and a skipped one DNF-free “—”.',
    `Option ${OPT} changes nothing here: penalties and inspection do not exist in drills.`] });
  afterMount();
};

VIEWS['timer-phone'] = () => {
  const a = phoneScreen({ opt: OPT, mode: 'live', st: 'run', stopBtn: true });
  const b = phoneScreen({ opt: OPT, mode: 'insp', st: 'ov2', elapsed: 16.2 });
  const c = phoneScreen({ opt: OPT, mode: 'results', st: 'p2', actions: phoneActions });
  const frame = `<div class="phones" style="gap:36px;justify-content:center">${a}${b}${c}</div>`;
  mount({ id: boardId, name: `W-22 option ${OPT}: phone 390 x 844, running, overtime, +2 result`, frame, cols: 1, width: 1440, legend: [
    'The XL readout at 76 px in the dial slot under the cube (A-09), the same three states as on the desktop. Left: running; middle: inspection 1 s past 15 (“+2”, amber); right: the result with a +2 (14.97+).',
    `Option ${OPT}: ${['sub line only when it adds something.', 'digits take the amber/red tone; companions sit at the digits.', 'the permanent second line (thresholds, then the consequence).'][OPT - 1]}`] });
  afterMount();
};

VIEWS['coach-results'] = () => {
  const cc = coach(OPT, 'cross', { id: 'cr' });
  const frame = screen({ opt: OPT, mode: 'results', st: 'p2', sel: 'cross', keys: resultsKeys, bottom: resultsActions, overlay: `<div style="position:absolute;inset:0;pointer-events:none">${cc.svg}</div>${cc.html}` });
  mount({ id: boardId, name: `W-20 option ${OPT}: results with the coach line and its connector (A-05, 1440 x 900)`, frame, cols: 1, legend: [
    `<b>Option ${OPT}:</b> ${['the A-05 form: one sentence in a fixed rail (two slots per side, top and bottom), a dotted curve to the marker, fading in and out.', 'the sentence sits at the marker’s own height in the margin; a straight dotted line, fading in and out.', 'no rail and no line: the sentence is attached to the marker’s label (the label’s marker line becomes the sentence).'][OPT - 1]}`,
    '<b>The selected marker</b> has the cream ring; the other labels dim to 38 % while a sentence is shown; the time, the cube and the actions never dim.',
    '<b>Tone:</b> a shape and a colour, never colour alone: an amber ring = something to fix, a teal spark = went well. The connector ends in the marker’s colour.'] });
  afterMount();
};

VIEWS['coach-tones'] = () => {
  const REG = { p3: [20, 76, 720, 290], cross: [0, 500, 620, 330], p4: [700, 76, 720, 290], eo: [700, 76, 720, 330] };
  const cell = (key, title, selKey = key) => {
    const cc = coach(OPT, key, { id: `ct${key}` });
    const f = screen({ opt: OPT, mode: 'results', st: 'stop', sel: selKey, overlay: `<div style="position:absolute;inset:0">${cc.svg}</div>${cc.html}` });
    const [x, y, w, h] = REG[key];
    return `<div class="cell"><div class="cell-h">${title}</div>${crop(f, { x, y, w, h, s: 0.97 })}</div>`;
  };
  // anatomy: the connector in three moments, drawn large
  const anat = (d, from, to, tone, o, id) => `<svg width="560" height="150" viewBox="0 0 560 150" style="display:block">${connector(d, { id, tone, from, to, fadeIn: o })}<circle cx="${to[0]}" cy="${to[1]}" r="9" fill="var(--b-bg)" stroke="${toneColour(tone)}" stroke-width="2.4" opacity="${Math.max(o, 0.35)}"/></svg>`;
  const aw = `<div class="cell" style="padding:46px 18px 14px"><div class="cell-h">the connector in time: in (160 ms) · held · out (120 ms)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">${[['in', 0.35], ['held', 1], ['out', 0.2]].map(([n, o], i) => `<div><div class="lab-mono" style="margin-bottom:2px">${n}</div><svg width="212" height="120" viewBox="0 0 212 120" style="display:block">${connector('M10 84 Q80 82 190 40', { id: `an${i}`, tone: 'warn', from: [10, 84], to: [190, 40], fadeIn: o })}<circle cx="198" cy="36" r="8" fill="var(--b-bg)" stroke="var(--b-warn)" stroke-width="2.4" opacity="${Math.max(o, 0.4)}"/></svg></div>`).join('')}</div>
    <div class="lab-mono" style="margin-top:6px;line-height:1.5">Both ends fade (the dots thin out towards the sentence and towards the marker); it draws from the marker to the sentence on selection and fades out on deselection. One animation at a time; reduced motion = an 80 ms cross-fade.</div></div>`;
  void anat;
  const frame = `<div class="frame" style="height:auto;width:1440px;overflow:visible"><div class="grid2" style="grid-template-columns:700px 700px;gap:18px;justify-content:center;padding:24px 0">
    ${cell('p3', 'praise · a marker at the top (teal spark)')}${cell('cross', 'fix · the cross detour (amber ring)')}${cell('p4', 'fix · a marker on the right (the rail mirrors)')}${cell('eo', 'praise · the EO skip on the right')}
    </div><div style="padding:0 0 24px;display:grid;justify-items:center">${aw}</div></div>`;
  mount({ id: boardId, name: `W-20 option ${OPT}: praise and fix, left and right, and the connector in time`, frame, cols: 1, width: 1440, legend: [
    `Option ${OPT} for four selections: praise first (teal spark, “coach” line), then the fix (amber ring). Right-hand markers mirror the placement to the right margin.`,
    `${['Rail slots: the sentence snaps to the top or bottom slot of the marker’s side; the curve reaches the marker from outside the ring.', 'The sentence follows the marker’s height; the line is straight and never crosses the ring or another label.', 'No line: the sentence sits next to the label, on the outer side of the ring.'][OPT - 1]}`,
    'The bottom card shows the connector’s life: it draws in from the marker, holds, then fades out; the dotted line is the A-05 pattern reused wherever text explains a ring point.'] });
  afterMount();
};

VIEWS['coach-crowded'] = () => {
  const frame = crowdScreen(OPT);
  mount({ id: boardId, name: `W-20 option ${OPT}: a crowded ring (14 markers, four clusters within 5 degrees)`, frame, cols: 1, legend: [
    `<b>Cluster handling:</b> ${['markers closer than 5 degrees collapse into one badge with a count; the selected cluster expands in place (numbered 1 to 3, 8 degrees apart); [ ] steps through it; the sentence says “1 of 3”.', 'collapsed badges with a count; the selected cluster fans out onto a second radius with leader lines (numbered), no overlap by construction; [ ] steps through it.', 'only the highest-ranked marker of a cluster is drawn (with a faint +2); the sentence names the others (“also here”). Nothing expands.'][OPT - 1]}`,
    '<b>Never hidden:</b> the time, the stage labels and the actions are untouched; the labels of other stages dim while a cluster is selected.',
    'Ranking: a skip or the largest time loss first, then the cubing labels of the review SPEC (praise before fix when equal).'] });
  afterMount();
};

VIEWS['coach-phone'] = () => {
  const a = phoneCoach(OPT, 'cross'); const b = phoneCoach(OPT, 'p3'); const c = phoneCoach(OPT, 'crowd', { crowd: true });
  const fa = phoneScreen({ opt: OPT, mode: 'results', st: 'stop', sel: 'cross', ...a, actions: phoneActions });
  const fb = phoneScreen({ opt: OPT, mode: 'results', st: 'stop', sel: 'p3', ...b, actions: phoneActions });
  const fc = phoneScreen({ opt: OPT, mode: 'results', st: 'stop', crowd: true, ...c, actions: phoneActions });
  mount({ id: boardId, name: `W-20 option ${OPT}: phone 390 x 844, fix, praise and a crowded cluster`, frame: `<div class="phones" style="gap:36px;justify-content:center">${fa}${fb}${fc}</div>`, cols: 1, width: 1440, legend: [
    `<b>Option ${OPT} on a phone:</b> ${['the sentence under the time (A-09); the dotted connector runs up the left margin to the marker and fades.', 'the sentence under the time; a straight vertical dotted line at the marker’s x.', 'the sentence under the time, no line; its tag repeats the marker’s name and the marker carries the cream ring.'][OPT - 1]}`,
    'Left: fix. Middle: praise. Right: a crowded cluster (badges with counts; the selected one handled as in the desktop option).'] });
  afterMount();
};

/* the single crops used by the decision sheet (no frame chrome) */
function hiddenCrop(which) {
  const opt = { a: 1, b: 2, c: 3 }[which];
  const f = screen({ opt, mode: 'live', st: 'hidden', cube: {} });
  mount({ id: 'x', name: '', frame: f, legend: [] });
}
VIEWS['hidden-a'] = () => hiddenCrop('a');
VIEWS['hidden-b'] = () => hiddenCrop('b');
VIEWS['hidden-c'] = () => hiddenCrop('c');
const crowdCrop = (opt) => { mount({ id: 'x', name: '', frame: crowdScreen(opt), legend: [] }); };
VIEWS['crowd-a'] = () => crowdCrop(1);
VIEWS['crowd-b'] = () => crowdCrop(2);
VIEWS['crowd-c'] = () => crowdCrop(3);

VIEWS.light = () => {
  const col = (opt) => {
    const cc = coach(opt, 'cross', { id: `lg${opt}` });
    const f = screen({ opt, mode: 'results', st: 'p2', sel: 'cross', overlay: `<div style="position:absolute;inset:0">${cc.svg}</div>${cc.html}` });
    const f2 = screen({ opt, mode: 'live', st: 'run' });
    return `<div><div class="lab-mono" style="padding:0 0 8px">option ${opt}</div>${crop(f2, { x: 520, y: 664, w: 400, h: 190, s: 1.11 })}<div style="height:14px"></div>${crop(f, { x: 40, y: 520, w: 470, h: 230, s: 0.95 })}<div style="height:14px"></div>${crop(f, { x: 530, y: 690, w: 400, h: 150, s: 1.11 })}</div>`;
  };
  mount({ id: boardId, name: 'light sheet: the timer and the coach line in the three options', frame: `<div class="frame" style="height:auto;width:1440px;overflow:visible"><div class="grid2" style="grid-template-columns:repeat(3,448px);gap:30px;justify-content:center;padding:20px 0 28px">${[1, 2, 3].map(col).join('')}</div></div>`, cols: 1, width: 1440, legend: [
    'Light theme: the running readout, the results frame with the coach line, and the +2 readout, for each option. Same tokens; amber and red keep their contrast on the light background.'] });
};

(VIEWS[view] || VIEWS['timer-solve'])();
