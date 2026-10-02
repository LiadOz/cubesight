/* global document, window, Image */
// W-23 round/progress panels and W-24 charts replaced by Orbit forms (3 options: Orbit only / Orbit trend / Orbit + one trend line),
// and W-37 the compare wipe handle (3 forms). Prototype only: tokens + approved widgets.
//   views: replace | drill-round | drill-end | progress | phone | wipe-stage | wipe-states | wipe-phone | light
//   decision crops: round-width round-equal wipe-crop (opt = handle 1..3)
import { q, mount, header, cubeSVG, polar, arcPath } from '../../_proto/common.js';
import * as S from '../../_proto/scenes.js';
import { glyph, marker, abs, crop, ST, CX, CY, R } from '../../_proto/orbit-kit.js';

const UI = window.UI;
const view = q.get('view') || 'progress';
const OPT = Number(q.get('opt') || 1);
const boardId = q.get('id') || 'PC';
const co = (n) => (n ? `data-co="${n}"` : '');
const k = (g, size = 's') => `<kbd class="key key--${size}">${g}</kbd>`;
const kbi = (c, l) => `<span class="kbi">${c}<span>${l}</span></span>`;
const kbar = (...a) => `<div class="kbar">${a.join('')}</div>`;
const primary = (label, cap = '', n = 0, size = 'btn--l') => `<span class="on-primary" ${co(n)}><button class="btn btn--primary ${size}" type="button"><span>${label}</span>${cap}</button></span>`;
const textBtn = (label, n = 0) => `<button class="btn btn--text btn--muted" type="button" ${co(n)}>${label}</button>`;
const choice = (label, key, o = {}) => `<button type="button" class="choice" ${o.sel ? 'aria-pressed="true"' : ''}><kbd class="key key--s choice__kc">${key}</kbd><span>${label}</span></button>`;
const afterMount = () => { document.getElementById('board').dataset.opt = '3'; };
const TONE = { good: 'var(--b-good)', warn: 'var(--b-warn)', done: 'var(--b-fill)', future: 'var(--b-track)', live: 'var(--b-fill-live)', bad: 'var(--b-dnf)' };
const OPTNAME = { 1: 'Orbit only', 2: 'Orbit + the trend as a tick dial', 3: 'Orbit + one minimal trend line' };

/* ================================================================ data */
const TIMES = [1.2, 0.9, 1.8, 2.4, 1.1, 3.9, 1.5, 1.3, 2.2, 1.0, 1.7, 2.8, 0.92, 1.4, 5.1, 1.6, 1.2, 2.0, 1.1, 1.5];
const MISS = new Set([5, 14]);
const CASES = [57, 37, 51, 26, 31, 22, 9, 2, 45, 33, 21, 27, 13, 41, 43, 18, 36, 28, 47, 11];
const toneOf = (i) => (MISS.has(i) ? 'warn' : TIMES[i] < 1.5 ? 'good' : 'done');
const ROUNDS = Array.from({ length: 24 }, (_, i) => +(2.98 - 0.027 * i + 0.17 * Math.sin(i * 1.7) + 0.08 * Math.sin(i * 0.6)).toFixed(2)); ROUNDS[23] = 2.31;
const AO12 = Array.from({ length: 90 }, (_, i) => +(17.3 - 2.3 * (i / 89) + 0.22 * Math.sin(i * 0.31) + 0.1 * Math.sin(i * 1.3)).toFixed(2)); AO12[89] = 15.03;
const STAGES = ST.map((s) => ({ k: s.k, v: parseFloat(s.val) || 0.98, d: s.d, dw: s.dw, tone: s.k === 'eo' ? 'done' : s.d.startsWith('−') ? 'good' : s.dw || s.d.startsWith('+0.2') ? 'warn' : 'done' }));
const sessGlyph = (s) => Array.from({ length: 9 }, (_, i) => { const v = (s * 7 + i * 13) % 10; return v < s / 3 ? 'g' : v > 8 - s / 6 ? 'w' : 'n'; }).join('');
const roundGlyph = (s) => Array.from({ length: 20 }, (_, i) => { const v = (s * 5 + i * 11) % 13; return v < 5 + s / 4 ? 'g' : v === 12 ? 'w' : 'n'; }).join('');

/* ================================================================ Orbit builders */
function segRing({ cx, cy, r, weights, tones, sweep = 290, start = -145, gap = 2.4, wd = 6, sel = -1 }) {
  const n = weights.length; const tot = weights.reduce((a, b) => a + b, 0); const avail = sweep - gap * (n - 1); let a = start; const segs = []; let svg = '';
  weights.forEach((w, i) => {
    const a0 = a; const a1 = a + (avail * w) / tot; a = a1 + gap; segs.push({ a0, a1, mid: (a0 + a1) / 2 });
    const t = tones[i];
    svg += `<path d="${arcPath(cx, cy, r, a0, Math.max(a1, a0 + 0.4))}" fill="none" stroke="${TONE[t]}" stroke-width="${t === 'future' ? 3 : t === 'live' ? wd + 2 : wd}" stroke-linecap="round"/>`;
  });
  return { svg, segs };
}
const mk = (cx, cy, r, deg, tone, o = {}) => { const [x, y] = polar(cx, cy, r, deg); return marker(x.toFixed(1), y.toFixed(1), tone, o); };
function ringLab(cx, cy, r, deg, html, { off = 26, color = 'var(--b-muted)', fs = 11 } = {}) {
  const [x, y] = polar(cx, cy, r + off, deg); const s = Math.sin((deg * Math.PI) / 180); const c = Math.cos((deg * Math.PI) / 180);
  const tx = Math.abs(s) < 0.28 ? '-50%' : s > 0 ? '0' : '-100%'; const ty = c > 0.8 ? '-100%' : c < -0.8 ? '0' : '-50%';
  return `<div style="position:absolute;left:${x}px;top:${y}px;transform:translate(${tx},${ty});font:400 ${fs}px var(--b-font-mono);color:${color};white-space:nowrap;text-align:${Math.abs(s) < 0.28 ? 'center' : s > 0 ? 'left' : 'right'}">${html}</div>`;
}
const svgBox = (w, h, body) => `<svg class="stage-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;

/** the drill round as an Orbit: one segment per case; width = time spent (the summary) or equal */
function roundRing({ cx = CX, cy = CY, r = R, mode = 'width', small = false, ids = true }) {
  const weights = TIMES.map((t) => (mode === 'width' ? Math.pow(t, 0.75) : 1)); const tones = TIMES.map((_, i) => toneOf(i));
  const { svg, segs } = segRing({ cx, cy, r, weights, tones, wd: small ? 5 : 6, gap: small ? 2.2 : 2.4 });
  let body = svg; let html = '';
  segs.forEach((s, i) => {
    if (MISS.has(i)) body += mk(cx, cy, r, s.mid, 'warn', { small });
    if (ids && !small) html += ringLab(cx, cy, r, s.mid, MISS.has(i) ? `${CASES[i]}<br><b style="font-weight:500">${TIMES[i].toFixed(1)} s</b>` : `${CASES[i]}`, { off: MISS.has(i) ? 38 : 22, color: MISS.has(i) ? 'var(--b-warn-text)' : 'var(--b-muted)' });
  });
  return { svg: body, html, segs };
}

/* ---- the trend forms: three renderings of the same numbers ---- */
// 1: a column of mini Orbits (one per recent round / session)
// 2: a tick dial: one tick per round/day, tick length = value (longer = slower)
// 3: one hairline
function tickDial({ cx, cy, r0, len, vals, n = vals.length, pb = true, labelStart = '', labelEnd = '', fs = 11 }) {
  const lo = Math.min(...vals); const hi = Math.max(...vals); let svg = ''; let html = '';
  const a0 = -145; const step = 290 / (n - 1); const iMin = vals.indexOf(lo);
  vals.forEach((v, i) => {
    const a = a0 + i * step; const L = 10 + (len - 10) * ((v - lo) / (hi - lo)); const [x0, y0] = polar(cx, cy, r0, a); const [x1, y1] = polar(cx, cy, r0 + L, a);
    const last = i >= n - 7; const isPb = pb && i === iMin;
    svg += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="${isPb ? 'var(--b-good)' : last ? 'var(--b-fill)' : 'var(--b-faint)'}" stroke-width="${isPb || i === n - 1 ? 3 : 2}" stroke-linecap="round"/>`;
    if (isPb) svg += mk(cx, cy, r0 + L + 12, a, 'good', { small: true });
  });
  svg += `<path d="${arcPath(cx, cy, r0 - 5, -145, 145)}" fill="none" stroke="var(--b-track)" stroke-width="2" stroke-linecap="round"/>`;
  html += ringLab(cx, cy, r0 + len, -145, labelStart, { off: 14, fs }) + ringLab(cx, cy, r0 + len, 145, labelEnd, { off: 14, fs });
  return { svg, html };
}
function hairline({ x, y, w, h, vals, endLabels = true, pbIdx = [], fs = 11 }) {
  const lo = Math.min(...vals) - 0.3; const hi = Math.max(...vals) + 0.3; const n = vals.length;
  const X = (i) => x + (w * i) / (n - 1); const Y = (v) => y + h - (h * (v - lo)) / (hi - lo);
  let d = ''; vals.forEach((v, i) => { d += `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; });
  let svg = `<path d="${d}" fill="none" stroke="var(--b-fill)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
  pbIdx.forEach((i) => { svg += `<circle cx="${X(i)}" cy="${Y(vals[i])}" r="4.5" fill="var(--b-bg)" stroke="var(--b-good)" stroke-width="2"/>`; });
  const li = n - 1; svg += `<circle cx="${X(li)}" cy="${Y(vals[li])}" r="9" fill="var(--b-accent-soft)"/><circle cx="${X(li)}" cy="${Y(vals[li])}" r="4" fill="var(--b-bg)" stroke="var(--b-fill-live)" stroke-width="2.4"/>`;
  let html = '';
  if (endLabels) {
    html += `<div class="tl" style="position:absolute;left:${x}px;top:${y + h + 10}px;font-size:${fs}px">${n > 30 ? '90 d ago' : '24 rounds ago'}</div><div class="tl" style="position:absolute;left:${x + w}px;top:${y + h + 10}px;transform:translateX(-100%);font-size:${fs}px">today</div>`;
    html += `<div class="tl" style="position:absolute;left:${x - 10}px;top:${Y(vals[0]) - 8}px;transform:translateX(-100%);font-size:${fs}px">${vals[0].toFixed(2)}</div><div style="position:absolute;left:${X(li) + 14}px;top:${Y(vals[li]) - 9}px;font:500 ${fs + 2}px var(--b-font-mono);color:var(--b-accent-text)">${vals[li].toFixed(2)}</div>`;
  }
  return { svg, html };
}

/* ================================================================ screens */
function drillEnd(opt, { mode = 'width', w = 1440, onlyRing = false } = {}) {
  const rr = roundRing({ mode });
  const side = (() => {
    if (opt === 1) {
      const rows = [[0.0, '2.31 s', '−0.18'], [1, '2.49 s', '−0.21'], [2, '2.70 s', '+0.05'], [3, '2.65 s', '−0.09'], [4, '2.74 s', '']];
      return abs('right:48px;top:150px;width:300px', `<div class="lab-mono" style="margin-bottom:12px" ${co(3)}>last 5 rounds</div>${rows.map(([s, a, d], i) => `<div class="row" style="gap:14px;height:46px"><span style="opacity:${i ? 0.85 : 1}">${glyph(roundGlyph(s + 1), { size: 40, ring: 16, sw: 3 })}</span><span style="font:500 16px var(--b-font-mono);width:70px">${a}</span><span style="font:400 12px var(--b-font-mono);color:${d.startsWith('−') ? 'var(--b-good)' : 'var(--b-warn-text)'}">${d}</span></div>`).join('')}`);
    }
    if (opt === 2) {
      const t = tickDial({ cx: 1228, cy: 262, r0: 52, len: 62, vals: ROUNDS, labelStart: '24 ago', labelEnd: 'now' });
      return `${svgBox(1440, 900, t.svg)}${t.html}${abs('right:48px;top:130px;text-align:right', '<div class="lab-mono" data-co="3">last 24 rounds · longer = slower</div>')}${abs('left:1228px;top:262px;transform:translate(-50%,-50%);text-align:center', '<div class="big" style="--bs:28px">2.31</div>')}`;
    }
    const L = hairline({ x: 1120, y: 190, w: 230, h: 90, vals: ROUNDS, pbIdx: [ROUNDS.indexOf(Math.min(...ROUNDS))], fs: 11 });
    return `${svgBox(1440, 900, L.svg)}${L.html}${abs('right:48px;top:130px;text-align:right', '<div class="lab-mono" data-co="3">last 24 rounds · average per round</div>')}`;
  })();
  const misses = `<div class="lab-mono">round 20 of 20</div><div style="margin-top:6px" class="mono-s">18 right · 2 not quite</div>
    <div style="margin-top:34px" class="lab-mono">not quite</div><div class="mono-s" style="margin-top:8px;color:var(--b-ink)">OLL 45 read as OLL 46</div><div class="mono-s" style="margin-top:6px;color:var(--b-ink)">OLL 9 read as OLL 10</div>`;
  return `<div class="frame">${header({ active: 'drills' })}${svgBox(1440, 900, rr.svg)}${onlyRing ? '' : ''}
    <svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(720, 440, 205, { top: 'y', dim: 0.5 })}</svg>${rr.html}
    ${abs('left:48px;top:140px;width:260px', misses, co(2))}
    ${side}
    ${abs('left:0;width:1440px;top:692px;display:grid;justify-items:center', `<div class="big" style="--bs:92px" ${co(1)}>2.31<small>s</small></div><div class="mono-s" style="margin-top:6px;font-size:13px">round average · −0.18 vs your last 5 rounds</div>`)}
    ${abs('left:0;width:1440px;top:846px;display:flex;justify-content:center;align-items:center;gap:22px', `${primary('another round', k('space', 'm'))}${textBtn('review misses')}${textBtn('all drills')}`)}
    ${abs('left:48px;bottom:16px', kbar(kbi(k('space'), 'again'), kbi(k('esc'), 'back')))}</div>`;
}

function progressDesk(opt, { w = 1440 } = {}) {
  const cx = 440; const cy = 500; const r = 250;
  const { svg, segs } = segRing({ cx, cy, r, weights: STAGES.map((s) => s.v), tones: STAGES.map((s) => s.tone) });
  let body = svg; let html = '';
  segs.forEach((s, i) => {
    const st = STAGES[i]; const c = st.tone === 'good' ? 'var(--b-good)' : 'var(--b-warn-text)';
    html += ringLab(cx, cy, r, s.mid, `<span style="color:var(--b-muted)">${st.k}</span><br><b style="font:500 16px var(--b-font-sans);color:var(--b-ink)">${st.v === 0.98 && st.k === 'eo' ? '0.98' : st.v.toFixed(2)}</b>${st.d ? `<br><span style="color:${c}">${st.d}</span>` : ''}`, { off: 24 });
  });
  body += mk(cx, cy, r, STAGES.length ? segs[4].mid : 0, 'warn', { sel: true });
  let trend = '';
  if (opt === 1) {
    const cells = Array.from({ length: 12 }, (_, i) => `<div style="display:grid;justify-items:center;gap:6px">${glyph(sessGlyph(i + 1), { size: 66, ring: 16, sw: 3.2, sel: i === 11 })}<span class="tl" style="font-size:10px">${['3 sep', '5 sep', '8 sep', '10 sep', '12 sep', '15 sep', '17 sep', '19 sep', '22 sep', '25 sep', '28 sep', 'today'][i]}</span></div>`).join('');
    trend = abs('left:840px;top:130px;width:552px', `<div class="lab-mono" ${co(3)}>last 12 sessions · one ring each, one arc per stage</div><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:26px 8px;margin-top:22px">${cells}</div><div class="mono-s" style="margin-top:20px">teal arc: faster than the session before · amber: slower</div>`);
  } else if (opt === 2) {
    const t = tickDial({ cx: 1116, cy: 340, r0: 96, len: 100, vals: AO12.filter((_, i) => i % 2 === 1), labelStart: '90 d ago', labelEnd: 'today' });
    trend = `${svgBox(1440, 900, t.svg)}${t.html}${abs('left:840px;top:130px;width:552px', `<div class="lab-mono" ${co(3)}>ao12 per day · 90 days · longer tick = slower</div>`)}${abs('left:1116px;top:340px;transform:translate(-50%,-50%);text-align:center', '<div class="big" style="--bs:44px">15.03</div><div class="mono-s" style="margin-top:4px">ao12 now</div>')}`;
  } else {
    const L = hairline({ x: 900, y: 190, w: 400, h: 250, vals: AO12, pbIdx: [30, 62], fs: 12 });
    trend = `${svgBox(1440, 900, L.svg)}${L.html}${abs('left:840px;top:130px;width:552px', `<div class="lab-mono" ${co(3)}>ao12 over 90 days · the one line</div>`)}`;
  }
  return `<div class="frame">${header({ active: 'progress' })}
    ${abs('left:48px;top:92px', '<h1 class="h1">progress</h1>')}
    ${abs('left:48px;top:150px', UI.seg('period', ['7 d', '30 d', '90 d', 'all'], 1), co(2))}
    ${svgBox(1440, 900, body)}<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(cx, cy - 10, 138)}</svg>${html}
    ${abs(`left:${cx - 200}px;width:400px;top:690px;display:grid;justify-items:center`, `<div class="big" style="--bs:56px" ${co(1)}>15.03</div><div class="mono-s" style="margin-top:6px;font-size:13px">ao12 · −0.84 vs the 30 days before</div>`)}
    ${trend}
    ${abs('left:840px;top:610px;width:520px', `<div class="lab-mono">where the time goes</div><p class="sent" style="margin-top:10px;font-size:18px;line-height:26px">Pair 4 is the biggest loss: 2.31 s, +0.27 against the 30 days before.</p><div style="margin-top:10px">${textBtn('drill pair 4')}</div>`)}
    ${abs('left:840px;top:840px', '<div class="mono-s">pb 12.41 · ao12 15.03 · ao5 14.62</div>')}
    ${abs('left:48px;bottom:16px', kbar(kbi(k('1'), '7 d'), kbi(k('2'), '30 d'), kbi(k('3'), '90 d')))}</div>`;
}

const PCX = 195;
function phoneShell(inner) {
  return `<div class="frame phone touch" style="width:390px;height:844px"><div class="hdr" style="padding:0 24px;height:60px"><span class="word" style="font-size:17px;margin:0">cubesight</span><span class="chip-cube" style="font-size:11px"><i class="dot"></i>GAN 356 i3</span></div>${inner}</div>`;
}
function phoneRound(opt, kind) { // kind: live | end
  const cx = PCX; const cy = 262; const r = 138;
  const rr = roundRing({ cx, cy, r, mode: kind === 'end' ? 'width' : 'equal', small: true });
  if (kind === 'live') {
    const weights = Array(20).fill(1); const tones = weights.map((_, i) => (i < 12 ? toneOf(i) : i === 12 ? 'live' : 'future'));
    const live = segRing({ cx, cy, r, weights, tones, wd: 5, gap: 2.2 });
    return phoneShell(`${svgBox(390, 844, live.svg + mk(cx, cy, r, live.segs[5].mid, 'warn', { small: true }))}<svg class="stage-svg" width="390" height="844">${cubeSVG(cx, cy + 4, 98, { top: 'y' })}</svg>
      ${abs('left:0;width:390px;top:450px;text-align:center;font:600 20px var(--b-font-sans)', 'which OLL is this?')}
      ${abs('left:20px;right:20px;top:500px;display:grid;grid-template-columns:1fr 1fr;gap:10px', [choice('L-shape', 1), choice('T-shape', 2), choice('Dot', 3), choice('Line', 4)].join(''))}
      ${abs('left:0;width:390px;top:640px;text-align:center', '<span class="mono-s">case 13 of 20 · 1.84 s</span>')}
      ${abs('left:24px;right:24px;bottom:28px;display:flex;justify-content:center', textBtn('end round'))}`);
  }
  let trend = '';
  if (opt === 1) trend = abs('left:24px;right:24px;top:560px', `<div class="lab-mono">last 5 rounds</div><div class="row" style="justify-content:space-between;margin-top:10px">${[0, 1, 2, 3, 4].map((s) => `<div style="display:grid;justify-items:center;gap:4px">${glyph(roundGlyph(s + 1), { size: 50, ring: 16, sw: 3.2 })}<span class="tl" style="font-size:10px">${['2.31', '2.49', '2.70', '2.65', '2.74'][s]}</span></div>`).join('')}</div>`);
  else if (opt === 2) { const t = tickDial({ cx: 195, cy: 612, r0: 34, len: 44, vals: ROUNDS, labelStart: '24 ago', labelEnd: 'now', fs: 10 }); trend = `${svgBox(390, 844, t.svg)}${t.html}${abs('left:24px;top:526px', '<div class="lab-mono">last 24 rounds · longer = slower</div>')}`; }
  else { const L = hairline({ x: 50, y: 600, w: 270, h: 70, vals: ROUNDS, pbIdx: [ROUNDS.indexOf(Math.min(...ROUNDS))], fs: 10 }); trend = `${svgBox(390, 844, L.svg)}${L.html}${abs('left:24px;top:556px', '<div class="lab-mono">last 24 rounds</div>')}`; }
  return phoneShell(`${svgBox(390, 844, rr.svg)}<svg class="stage-svg" width="390" height="844">${cubeSVG(cx, cy + 4, 98, { top: 'y', dim: 0.5 })}</svg>
    ${abs('left:0;width:390px;top:406px;display:grid;justify-items:center', '<div class="big" style="--bs:56px">2.31<small>s</small></div><div class="mono-s" style="margin-top:4px;font-size:11px">round average · −0.18</div>')}
    ${trend}
    ${abs('left:24px;right:24px;bottom:28px;display:flex;flex-direction:column;gap:6px', `${primary('another round')}<div class="row" style="justify-content:space-between;padding:0 8px">${textBtn('review misses')}${textBtn('all drills')}</div>`)}`);
}
function phoneProgress(opt) {
  const cx = PCX; const cy = 300; const r = 112;
  const { svg, segs } = segRing({ cx, cy, r, weights: STAGES.map((s) => s.v), tones: STAGES.map((s) => s.tone), wd: 5, gap: 2.2 });
  let html = '';
  segs.forEach((s, i) => { const st = STAGES[i]; html += ringLab(cx, cy, r, s.mid, `${st.v.toFixed(2)}`, { off: 20, color: st.tone === 'good' ? 'var(--b-good)' : st.tone === 'warn' ? 'var(--b-warn-text)' : 'var(--b-ink)' }); });
  let trend = '';
  if (opt === 1) trend = abs('left:20px;right:20px;top:560px', `<div class="lab-mono">last 12 sessions</div><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px 0;margin-top:12px">${Array.from({ length: 12 }, (_, i) => `<div style="display:grid;justify-items:center">${glyph(sessGlyph(i + 1), { size: 50, ring: 16, sw: 3.4, sel: i === 11 })}</div>`).join('')}</div>`);
  else if (opt === 2) { const t = tickDial({ cx: 195, cy: 650, r0: 40, len: 52, vals: AO12.filter((_, i) => i % 3 === 2), labelStart: '90 d', labelEnd: 'today', fs: 10 }); trend = `${svgBox(390, 844, t.svg)}${t.html}${abs('left:24px;top:556px', '<div class="lab-mono">ao12 per day · longer = slower</div>')}${abs('left:195px;top:650px;transform:translate(-50%,-50%)', '<div class="big" style="--bs:24px">15.03</div>')}`; }
  else { const L = hairline({ x: 56, y: 590, w: 262, h: 130, vals: AO12, pbIdx: [30, 62], fs: 10 }); trend = `${svgBox(390, 844, L.svg)}${L.html}${abs('left:24px;top:556px', '<div class="lab-mono">ao12 over 90 days</div>')}`; }
  return phoneShell(`${abs('left:24px;top:76px', '<div class="h1" style="font-size:26px">progress</div>')}${abs('left:24px;top:116px', UI.seg('period', ['7 d', '30 d', '90 d', 'all'], 1))}
    ${svgBox(390, 844, svg + mk(cx, cy, r, segs[4].mid, 'warn', { small: true, sel: true }))}<svg class="stage-svg" width="390" height="844">${cubeSVG(cx, cy + 12, 78)}</svg>${html}
    ${abs('left:0;width:390px;top:446px;display:grid;justify-items:center', '<div class="big" style="--bs:44px">15.03</div><div class="mono-s" style="margin-top:4px;font-size:11px">ao12 · −0.84 vs the 30 days before</div>')}
    ${trend}`);
}

/* ================================================================ W-37 the wipe handle */
const GL = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const handleHtml = (kind, state, { touch = false, pct = 50 } = {}) => `<div class="hd k${kind} ${state ? `is-${state}` : ''} ${touch ? 'touch-t' : ''}" role="slider" aria-label="wipe position" aria-valuenow="${pct}">
  ${kind === 2 ? '<span class="band"></span>' : ''}<span class="line"></span>
  ${kind === 1 ? `<span class="knob">${GL}</span>` : kind === 2 ? '<span class="grab"><i></i><i></i><i></i></span>' : `<span class="cap t"></span><span class="cap b"></span><span class="dot"></span><span class="ab a">A</span><span class="ab b">B</span><span class="pct">${pct} %</span>`}</div>`;
const IMG_A = '/docs/design/orbit-v3/A-05-results.png'; const IMG_B = '/docs/design/orbit-v3/B-05-results.png';
/** a wipe stage w x h showing the two frames (A left of the handle, B right of it); iw = image width in px */
function wipeStage({ w, h, kind, state, pos = 0.5, iw = 1000, ox = null, oy = 150, touch = false }) {
  const left = ox === null ? -(iw / 2 - w / 2) : ox; const x = w * pos;
  const img = (src, extra) => `<img class="im" src="${src}" width="${iw}" style="left:${left}px;top:${-oy}px;${extra}">`;
  return `<div class="stage" style="width:${w}px;height:${h}px">${img(IMG_B, '')}<div style="position:absolute;inset:0;clip-path:inset(0 ${w - x}px 0 0)">${img(IMG_A, '')}</div><div style="position:absolute;left:${x}px;top:0;bottom:0;width:0">${handleHtml(kind, state, { touch, pct: Math.round(pos * 100) })}</div></div>`;
}
const HNAME = { 1: 'A  ink knob', 2: 'B  hairline + bottom grabber', 3: 'C  the Orbit caret' };

function wipeScreen(kind, state = '') {
  return `<div class="frame">${header({ active: '' })}
    ${abs('left:48px;top:84px;font:400 12px var(--b-font-mono);color:var(--b-muted)', 'dev · gallery')}${abs('left:48px;top:100px', '<h1 class="h1">compare</h1>')}
    ${abs('left:48px;top:176px', wipeStage({ w: 864, h: 540, kind, state, iw: 864, ox: 0, oy: 0 }), co(1))}
    ${abs('left:48px;top:740px', '<div class="mono-s">drag the handle, or ← → to move it · 1 2 3 switch the mode</div>')}
    ${abs('left:48px;bottom:16px', kbar(kbi(`<span class="kp">${k('←')}${k('→')}</span>`, 'move handle'), kbi(`<span class="kp">${k('1')}${k('2')}${k('3')}</span>`, 'mode'), kbi(k('x'), 'swap')))}
    ${abs('left:960px;top:176px;width:432px;display:grid;gap:22px', `<div><div class="lab-mono">A · left</div><div style="margin-top:8px">${UI.sel('A', ['orbit-v3 · A-05 results', 'orbit-v3 · B-05 results'], 0)}</div></div>
      <div><div class="lab-mono">B · right</div><div style="margin-top:8px">${UI.sel('B', ['orbit-v3 · B-05 results', 'orbit-v3 · A-05 results'], 0)}</div></div>
      <div ${co(2)}><div class="lab-mono">mode</div><div style="margin-top:8px">${UI.seg('mode', ['side by side', 'overlay', 'wipe'], 2)}</div></div>
      <div><div class="lab-mono">what differs · 3</div><p class="ltxt" style="margin:10px 0 0">A has the dotted connector from the coach line to its marker; B says “tap a marker on the ring”.</p></div>
      <div class="row">${textBtn('swap sides')}${textBtn('lock the handle')}</div>`)}</div>`;
}
const KIND = { 1: 1, 2: 2, 3: 3 };

/* ================================================================ views */
const V = {};

V['drill-end'] = () => {
  mount({ id: boardId, name: `W-23 / W-24 option ${OPT} (${OPTNAME[OPT]}): end of a drill round (A-08, 1440 x 900)`, frame: drillEnd(OPT), cols: 1, legend: [
    '<b>The round is the Orbit (1):</b> 20 cases = 20 segments; after the round the arcs are re-weighted to the time you spent on each case (teal fast, cream normal, an amber ring for a miss with its time). It replaces the round panel, the stats row and the progress track (W-23a, e, f, h).',
    '<b>Misses (2)</b> are text lines, one per miss (VOICE: “not quite”); nothing else needs a chart.',
    `<b>Recent rounds (3):</b> ${['five mini Orbits in a column, one per round (the approved list glyph), with the average and the change.', 'a tick dial: one tick per round, length = the average (longer = slower), the newest ticks brighter, the best one teal.', 'one hairline of the average per round, the best round ringed, the last point teal.'][OPT - 1]}`] });
  afterMount();
};
V['round-width'] = () => { mount({ id: 'x', name: '', frame: drillEnd(1, { mode: 'width' }), legend: [] }); };
V['round-equal'] = () => { mount({ id: 'x', name: '', frame: drillEnd(1, { mode: 'equal' }), legend: [] }); };

V['drill-round'] = () => {
  const frame = S.drill({ answers: [choice('L-shape', 1), choice('T-shape', 2, { sel: true }), choice('Dot', 3), choice('Line', 4)].join(''), question: 'which OLL is this?', keybar: kbar(kbi(k('s'), 'skip'), kbi(k('esc'), 'end round')), foot: '<span class="meta">case 13 of 20 · 1.84 s</span>' });
  mount({ id: boardId, name: 'W-23: a drill round in progress (A-08): the Orbit is the round panel and the progress track', frame, cols: 1, legend: [
    'The 20 segments are the round: done (cream, amber for a miss), the live segment with its dot, the rest as track. This one frame replaces the answer stage, the round panel, the 3 s timer bar and pll-mini-track (W-23a, e, f, h). Shared by all three options.',
    'The case time (1.84 s) is the M readout of the timer family; the combo, round average and best case are plain text in the left rail.'] });
  afterMount();
};

V.progress = () => {
  mount({ id: boardId, name: `W-23 / W-24 option ${OPT} (${OPTNAME[OPT]}): the progress page`, frame: progressDesk(OPT), cols: 1, legend: [
    '<b>The Orbit (1):</b> one ring = your average split per stage over the period; the arc width is the time, the colour is the change against the period before (teal faster, amber slower, cream about the same). It replaces the stage averages card, the donut, the stat cards and the sparklines. The cube in the middle is the shared Cube.',
    '<b>Period (2):</b> the approved segmented control.',
    `<b>The trend over time (3):</b> ${['a grid of 12 mini Orbits, one per session, oldest to newest; the arc colours show where each session got faster or slower. No line anywhere.', 'a tick dial of 90 days: one tick per day, longer = slower; PB teal. Still the Orbit family: ticks on an arc, no axes.', 'one hairline of the ao12 over 90 days, no axes or grid, three labels (start, end, now), the PBs ringed. The only non-Orbit chart in the whole site.'][OPT - 1]}`] });
  afterMount();
};

V.phone = () => {
  const frame = `<div class="phones">${phoneRound(OPT, 'live')}${phoneRound(OPT, 'end')}${phoneProgress(OPT)}</div>`;
  mount({ id: boardId, name: `W-23 / W-24 option ${OPT} (${OPTNAME[OPT]}): phone 390 x 844, the round, the end of the round and progress`, frame, cols: 1, width: 1440, legend: [
    'Left: a round in progress (the same Orbit as the desktop). Middle: the round summary with the option’s trend element under the average. Right: the progress page with the same trend element. The period control is the approved segmented control.'] });
  afterMount();
};

/* ---- the replacement map: what each current widget becomes ---- */
V.replace = () => {
  const preload = (src) => new Promise((res) => { const i = new Image(); i.onload = res; i.onerror = res; i.src = src; });
  const inv = (f) => `/gallery/widgets/2026-10-02-inventory/${f}`;
  const stagesMini = (tones, sel = -1) => glyph(tones, { size: 86, ring: 16, sw: 3.2, sel: false });
  const threeForms = () => {
    const d = tickDial({ cx: 45, cy: 48, r0: 18, len: 22, vals: ROUNDS });
    const L = hairline({ x: 4, y: 14, w: 74, h: 50, vals: ROUNDS, endLabels: false });
    const lb = (n, el) => `<span style="display:grid;justify-items:center;gap:4px">${el}<span class="tl">${n}</span></span>`;
    return `<span class="row" style="gap:20px">${lb('1', glyph(roundGlyph(3), { size: 70, ring: 16, sw: 2.8 }))}${lb('2', `<svg width="90" height="90" viewBox="0 0 90 90">${d.svg}</svg>`)}${lb('3', `<svg width="86" height="80" viewBox="0 0 86 80">${L.svg}</svg>`)}</span>`;
  };
  const rows = [
    ['W-23c', 'W-23c-rounds-b-ch-bar.png', 'split bars (b-ch-bar), 108 on results', stagesMini('gnnngnnng'), '<b>The stage arcs of the Orbit</b> carry the same numbers (width = time, colour = change); the bars go.'],
    ['W-23d', 'W-23d-rounds-progress-day.png', 'progress-day line', glyph('gggnnwgnnng', { size: 86, ring: 16, sw: 3.2, center: '23', cfs: 12 }), '<b>A day or session ring</b> (the A-07 glyph): one arc per solve, the count in the middle.'],
    ['W-23h', 'W-23h-rounds-pll-mini-track.png', 'pll-mini-track (the round progress line)', glyph(roundGlyph(2), { size: 86, ring: 16, sw: 2.6 }), '<b>The round as segments</b> around the cube (A-08), the live one with its dot. Also replaces the answer stage header and the 3 s bar (W-23a, e, f).'],
    ['W-23b', 'W-23b-rounds-b-oinsp.png', 'inspection dial (b-oinsp), a one-off ring', `<svg width="86" height="86" viewBox="0 0 86 86"><path d="${arcPath(43, 43, 34, -145, 145)}" fill="none" stroke="var(--b-track)" stroke-width="2.6"/><path d="${arcPath(43, 43, 34, -20, 70)}" fill="none" stroke="var(--b-fill-live)" stroke-width="5" stroke-linecap="round"/><path d="${arcPath(43, 43, 34, 70, 110)}" fill="none" stroke="var(--b-warn)" stroke-width="4" stroke-linecap="round"/><path d="${arcPath(43, 43, 34, 110, 145)}" fill="none" stroke="var(--b-dnf)" stroke-width="3" opacity=".6" stroke-linecap="round"/></svg>`, '<b>The inspection Orbit</b> (+2 and DNF zones on the dial, A-03): see the timer post.'],
    ['W-24c', 'W-24c-charts-b-ch-tps.png', 'TPS chart with stage bands', glyph('gnnngnnng', { size: 86, ring: 16, sw: 3.2 }), '<b>The stage arcs</b>; TPS is one number in the selected stage’s sentence (“cross: 2.08 s, 5.3 TPS”), not a curve.'],
    ['W-24d', 'W-24d-charts-svg-in-b-ch-spark.png', 'sparkline of the last 4 solves', `<span class="row" style="gap:6px">${[0, 1, 2, 3].map((s) => glyph(sessGlyph(s + 4), { size: 40, ring: 16, sw: 3.2 })).join('')}</span>`, '<b>Four mini Orbits</b> in a row (the list glyph): the last four solves, each with its own arcs.'],
    ['W-24e/f', 'W-24e-charts-trend-card.png', 'trend card + trend chart (recent pace)', threeForms(), '<b>Per option:</b> 1 mini Orbits, 2 a tick dial, 3 one hairline. The card around it goes (containers: frameless).'],
    ['W-24b', 'W-24b-charts-rp-trend.png', 'recognition trend (rp-trend)', threeForms(), '<b>The same three forms</b> for the per-answer recognition trend, on the drill summary and the progress page.'],
    ['W-24g', 'W-24g-charts-sr-graph.png', 'moves vs efficiency graph (review)', `<svg width="86" height="86" viewBox="0 0 86 86"><path d="${arcPath(43, 43, 34, -145, 145)}" fill="none" stroke="var(--b-fill)" stroke-width="4" stroke-linecap="round"/><path d="${arcPath(43, 43, 24, -145, 90)}" fill="none" stroke="var(--b-good)" stroke-width="4" stroke-linecap="round"/></svg>`, '<b>Yours against better</b>: two nested rings (the one approved use of a ring in a ring, feedback 7).'],
    ['W-24a', 'W-24a-charts-g-graph.png', 'git graph in the dev timeline (68 on one page)', glyph('nnnnnnnnnn', { size: 86, ring: 16, sw: 3.2 }), 'Not decided here: the timeline is W-32 (dev-pages post).'],
  ];
  const html = rows.map(([id, img, name, now, txt]) => `<div class="srow2"><div class="was"><span class="id">${id} · ${name}</span><img src="${inv(img)}"></div><div class="arrow">→</div><div class="now">${now}<div class="t">${txt}</div></div></div>`).join('');
  Promise.all(rows.map((r) => preload(inv(r[1])))).then(() => {
    mount({ id: boardId, name: 'W-23 / W-24: what every current bar, panel and chart becomes', frame: `<div class="frame" style="height:auto;width:1440px;overflow:visible"><div class="srow2" style="min-height:34px;font:500 11px var(--b-font-mono);color:var(--b-muted)"><span>today (inventory image)</span><span></span><span>becomes (an Orbit form)</span></div>${html}</div>`, cols: 1, legend: [
      'Feedback 1: progress is only shown with the Orbit. Every row that is a bar, a line or a one-off chart is replaced; the three options only differ in what happens to the long-term trend (rows W-24e/f and W-24b).'] });
    afterMount();
  });
};

/* ---- W-37 ---- */
V['wipe-stage'] = () => {
  mount({ id: boardId, name: `W-37 handle ${'ABC'[OPT - 1]}: ${HNAME[OPT].slice(3)} on the compare stage (1440 x 900)`, frame: wipeScreen(OPT), cols: 1, legend: [
    `<b>The wipe handle (1):</b> ${['an ink knob (the same cream as the primary pill) on a 2 px line; the arrows glyph says “drag sideways”.', 'a hairline with a pill grabber on the bottom edge: nothing covers the picture; the whole line (32 px) is the grab area.', 'the Orbit caret: a teal tick line with its ends marked, the live dot with its halo, the A and B tags; a percentage shows while you drag.'][OPT - 1]}`,
    '<b>Mode (2):</b> the approved segmented control; wipe is the default.'] });
  afterMount();
};
V['wipe-crop'] = () => {
  mount({ id: 'x', name: '', frame: `<div class="frame" style="width:560px;height:340px">${abs('left:0;top:0', wipeStage({ w: 560, h: 340, kind: OPT, state: '', iw: 900, oy: 110 }))}</div>`, legend: [] });
};
V['wipe-states'] = () => {
  const states = [['', 'rest'], ['hover', 'hover'], ['drag', 'dragging'], ['focus', 'keyboard focus'], ['locked', 'locked']];
  const cell = (kind, st, lab) => `<div class="cell" style="width:420px"><div class="cell-h">${HNAME[kind].slice(0, 1)} · ${lab}</div>${wipeStage({ w: 420, h: 150, kind, state: st, iw: 760, oy: 130 })}</div>`;
  const frame = `<div class="frame" style="height:auto;width:1440px;overflow:visible;padding:24px 28px"><div style="display:grid;grid-template-columns:repeat(3,420px);gap:16px 26px;justify-content:center">
    ${[1, 2, 3].map((kk) => `<div class="lab-mono" style="font-size:13px;color:var(--b-ink)">${HNAME[kk]}</div>`).join('')}
    ${states.map(([st, lab]) => [1, 2, 3].map((kk) => cell(kk, st, lab)).join('')).join('')}</div></div>`;
  mount({ id: boardId, name: 'W-37 the three handles in five states (rest, hover, dragging, keyboard focus, locked)', frame, cols: 1, width: 1440, legend: [
    'Each handle is one element with a 44 px hit area on touch (shown on the phone sheet). Keyboard: the slider role, ← → move by 1 %, Shift by 10 %; the focus ring is the 2 px teal outline used by every approved control. Locked: dashed line, handle outlined; the stage stops following the pointer.',
    'Dragging: A grows and glows, B widens its grabber, C shows the percentage above the dot. Colours are tokens only: ink and teal; no new colour.'] });
};
V['wipe-phone'] = () => {
  const ph = (kind) => `<div class="frame phone touch" style="width:390px;height:844px"><div class="hdr" style="padding:0 24px;height:60px"><span class="word" style="font-size:17px;margin:0">cubesight</span></div>
    ${abs('left:24px;top:76px', '<div class="h1" style="font-size:26px">compare</div>')}
    ${abs('left:16px;top:130px', wipeStage({ w: 358, h: 470, kind, state: 'drag', pos: 0.46, iw: 760, oy: 0, touch: true }))}
    ${abs('left:24px;top:620px', UI.seg('mode', ['side by side', 'overlay', 'wipe'], 2))}
    ${abs('left:24px;top:690px;right:24px', `<div class="lab-mono">${HNAME[kind]}</div><p class="ltxt" style="margin:8px 0 0">the dashed circle is the 44 px touch target</p>`)}</div>`;
  mount({ id: boardId, name: 'W-37 on a phone: the 44 px touch target of each handle', frame: `<div class="phones">${[1, 2, 3].map(ph).join('')}</div>`, cols: 1, width: 1440, legend: ['Dragging on a 390 px phone, 46 % position. The handle’s visible part stays small; the touch target is 44 px (the dashed circle) wide in every option.'] });
  afterMount();
};

V.light = () => {
  const col = (o) => `<div><div class="lab-mono" style="padding:0 0 8px">option ${o}</div>${crop(progressDesk(o).replace(/data-co="\d"/g, ""), { x: 820, y: 120, w: 560, h: 480, s: 0.78 })}</div>`;
  const wcol = (kk) => `<div><div class="lab-mono" style="padding:0 0 8px">handle ${'ABC'[kk - 1]}</div>${wipeStage({ w: 440, h: 190, kind: kk, state: '', iw: 800, oy: 130 })}</div>`;
  mount({ id: boardId, name: 'light sheet: the trend forms (progress page) and the three wipe handles', frame: `<div class="frame" style="height:auto;width:1440px;overflow:visible"><div style="display:grid;grid-template-columns:repeat(3,440px);gap:30px;justify-content:center;padding:20px 0 12px">${[1, 2, 3].map(col).join('')}</div><div style="display:grid;grid-template-columns:repeat(3,440px);gap:30px;justify-content:center;padding:6px 0 24px">${[1, 2, 3].map(wcol).join('')}</div></div>`, cols: 1, width: 1440, legend: ['Light theme: the three trend forms of the progress page (top) and the three wipe handles at rest (bottom).'] });
};

(V[view] || V.progress)();
void CY; void KIND; void ST;
