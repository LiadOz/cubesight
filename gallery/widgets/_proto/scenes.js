// Scene builders: the A-frame screens (A-01 idle, A-05 results, A-08 drill, A-09 phone) as HTML, with slots
// where a widget proposal puts its components. Positions follow docs/design/orbit-v3/A-*.png at 1440x900.
import { cubeSVG, orbitSVG, header, resultsSegs, resultsMarkers, idleSegs, arcPath } from './common.js';

const abs = (style, html, cls = '') => `<div class="abs ${cls}" style="position:absolute;${style}">${html}</div>`;
const lab = (x, y, a, name, val, delta, tone = '') => abs(
  `left:${x}px;top:${y}px;transform:translateX(${a === 'r' ? '-100%' : a === 'c' ? '-50%' : '0'});text-align:${a === 'r' ? 'right' : a === 'c' ? 'center' : 'left'};white-space:nowrap`,
  `<div style="font:400 11px var(--b-font-mono);color:var(--b-muted)">${name}</div>`
  + `<div style="font:500 17px var(--b-font-sans);color:var(--b-ink);margin-top:2px">${val}</div>`
  + (delta ? `<div style="font:400 11px var(--b-font-mono);color:${tone === 'warn' ? 'var(--b-warn-text)' : 'var(--b-good)'}">${delta}</div>` : ''));

export const CUBE_AT = { x: 720, y: 440, s: 215 };

/** A-05 results. Slots: actions (the primary + 2 text), keybar (bottom-left), meta (bottom-right), overlay (anything on top). */
export function results({ actions = '', keybar = '', meta = '<span class="meta">solve 23 · today 17:33 · speed · cube</span>', overlay = '', chip, dot, coach = true, clockColor = '' } = {}) {
  
  return `<div class="frame" data-scene="results">
    ${header({ chip, dot })}
    ${orbitSVG({ segs: resultsSegs, markers: resultsMarkers, extra: `${coach ? `<path d="M312 608 Q 400 606 488 640" fill="none" stroke="var(--b-faint)" stroke-width="1.4" stroke-dasharray="1.5 4" stroke-linecap="round"/>` : ''}` })}
    <svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(CUBE_AT.x, CUBE_AT.y, CUBE_AT.s)}</svg>
    ${lab(640, 66, 'c', 'p3', '1.52', '−0.43')}${lab(868, 84, 'c', 'p4', '2.31', '+0.27', 'warn')}${lab(474, 170, 'r', 'p2', '1.96', '+0.04')}
    ${lab(398, 404, 'r', 'p1', '1.71', '−0.17')}${lab(437, 632, 'c', 'cross', '2.08', '−0.33')}${lab(968, 190, 'l', 'eo', 'skip', '')}
    ${lab(1030, 314, 'l', 'co', '1.64', '+0.09', 'warn')}${lab(1034, 490, 'l', 'cp', '1.47', '−0.15')}${lab(960, 660, 'l', 'ep', '1.38', '−0.11')}
    ${coach ? `<div class="rail-coach"><div class="tag"><i></i>coach</div><p>Pseudo pair 3 and the EO skip were the highlights; the cross detour at move 4 cost 0.6 s, 6 moves existed.</p></div>` : ''}
    <div class="clock" style="top:688px;--clock-size:120px;${clockColor}">14.07</div>
    <div class="sub" style="top:812px">−0.96 vs ao12 · ao5 14.62 · pb 12.41</div>
    ${abs('left:0;width:100%;top:838px;display:flex;justify-content:center;align-items:center;gap:22px', actions)}
    ${abs('left:48px;bottom:16px;display:flex;gap:26px;align-items:center', keybar)}
    ${abs('right:48px;bottom:20px', meta)}
    ${overlay}
  </div>`;
}

/** A-01 idle. */
export function idle({ actions = '', keybar = '', meta = '<span class="meta">ao5 14.62 · ao12 15.03 · pb 12.41</span>', overlay = '', chip, dot, full = false, spin = false, dim = false, clock = '0.00', sub = '', cubeDim = 1, below = '' } = {}) {
  return `<div class="frame" data-scene="idle">
    ${header({ chip, dot })}
    ${orbitSVG({ segs: idleSegs, full, spin })}
    <svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(CUBE_AT.x, CUBE_AT.y, CUBE_AT.s, { dim: cubeDim })}</svg>
    ${full ? '' : [['p3', '~1.95', 640, 100], ['p4', '~2.04', 856, 112], ['p2', '~1.92', 474, 208], ['eo', '~0.98', 985, 204], ['p1', '~1.88', 398, 400], ['co', '~1.55', 1045, 340], ['cross', '~2.41', 437, 624], ['cp', '~1.62', 1050, 500], ['ep', '~1.49', 975, 656]].map(([n, v, x, y]) => abs(`left:${x}px;top:${y}px;transform:translateX(-50%);text-align:center;font:400 11px/1.3 var(--b-font-mono);color:var(--b-muted)`, `${n}<br>${v}`)).join('')}
    <div class="clock ${dim ? 'dim' : ''}" style="top:690px;--clock-size:120px;color:var(--b-faint)">${clock}</div>
    ${sub ? `<div class="sub" style="top:800px">${sub}</div>` : ''}
    ${abs('left:0;width:100%;top:812px;display:flex;justify-content:center;align-items:center;gap:22px', actions)}
    ${abs('left:48px;bottom:16px;display:flex;gap:26px;align-items:center', keybar)}
    ${abs('right:48px;bottom:20px', meta)}
    ${below}
    ${overlay}
  </div>`;
}

/** A-08 drill: ring of cases, the cube with a dark top, question + answers, combo etc. in the rails. */
export function drill({ answers = '', question = 'which OLL is this?', keybar = '', foot = '<span class="meta">case 13 of 20 · 1.84 s</span>', overlay = '', chip, dot } = {}) {
  const segs = [];
  for (let i = 0; i < 20; i++) { const a0 = -144 + i * 13.4; segs.push({ a0, a1: a0 + 11, tone: i < 12 ? (i === 6 ? 'warn' : 'done') : (i === 12 ? 'live' : 'future') }); }
  return `<div class="frame" data-scene="drill">
    ${header({ active: 'drills', chip, dot })}
    ${orbitSVG({ segs })}
    <svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(CUBE_AT.x, CUBE_AT.y, CUBE_AT.s, { top: 'y' })}</svg>
    ${abs('left:48px;top:140px', `<div class="meta">combo</div><div style="font:300 42px var(--b-font-mono);color:var(--b-accent-text)">×7</div>
      <div class="meta" style="margin-top:20px">round avg</div><div style="font:500 26px var(--b-font-sans)">2.31 s</div>
      <div class="meta" style="margin-top:18px">best case</div><div style="font:500 26px var(--b-font-sans)">0.92 s</div>`)}
    ${abs('right:48px;top:136px;text-align:right', `<div style="font:500 13px var(--b-font-mono)">OLL recognition</div><div class="meta" style="margin-top:6px">spaced · 12 due</div>`)}
    <div class="slot-title" style="top:674px">${question}</div>
    ${abs('left:0;width:100%;top:728px;display:flex;justify-content:center;align-items:center;gap:12px', answers)}
    ${abs('left:0;width:100%;top:812px;text-align:center', foot)}
    ${abs('left:48px;bottom:16px;display:flex;gap:26px;align-items:center', keybar)}
    ${overlay}
  </div>`;
}

/** A-09 phone: left = solving (drill-like stop), right = results. Returns one 390x844 frame. */
export function phoneResults({ actions = '', status = '', overlay = '', top = '' } = {}) {
  const cx = 195, cy = 330;
  return `<div class="frame phone touch" data-scene="phone-results" style="width:390px;height:844px">
    <div class="hdr" style="padding:0 24px;height:60px"><span class="word" style="font-size:17px;margin:0">cubesight</span><span class="chip-cube" data-chip style="font-size:11px"><i class="dot"></i>GAN 356 i3</span></div>
    ${top}
    ${orbitSVG({ cx, cy, r: 150, w: 390, h: 844, segs: resultsSegs.map(s => ({ ...s })), markers: resultsMarkers })}
    <svg class="stage-svg" width="390" height="844" aria-hidden="true">${cubeSVG(cx, cy + 4, 108)}</svg>
    <div class="clock" style="top:488px;--clock-size:76px">14.07</div>
    <div class="sub" style="top:572px;font-size:11px">−0.96 vs ao12 · pb 12.41</div>
    ${abs('left:24px;right:24px;top:600px', `<div class="rail-coach" style="position:static;width:auto"><div class="tag"><i></i>coach</div><p style="font-size:16px;line-height:24px">Pseudo pair 3 and the EO skip were the highlights; the cross detour at move 4 cost 0.6 s.</p></div>`)}
    ${status}
    ${abs('left:24px;right:24px;bottom:28px;display:flex;flex-direction:column;align-items:stretch;gap:6px', actions)}
    ${overlay}
  </div>`;
}

export function phoneDrill({ answers = '', stop = '', status = '', overlay = '' } = {}) {
  const cx = 195, cy = 270;
  const segs = [];
  for (let i = 0; i < 20; i++) { const a0 = -144 + i * 13.4; segs.push({ a0, a1: a0 + 11, tone: i < 12 ? 'done' : (i === 12 ? 'live' : 'future') }); }
  return `<div class="frame phone touch" data-scene="phone-drill" style="width:390px;height:844px">
    <div class="hdr" style="padding:0 24px;height:60px"><span class="word" style="font-size:17px;margin:0">cubesight</span><span class="chip-cube" data-chip style="font-size:11px"><i class="dot"></i>GAN 356 i3</span></div>
    ${orbitSVG({ cx, cy, r: 140, w: 390, h: 844, segs })}
    <svg class="stage-svg" width="390" height="844" aria-hidden="true">${cubeSVG(cx, cy + 4, 100, { top: 'y' })}</svg>
    <div class="slot-title" style="top:450px;font-size:20px">which OLL is this?</div>
    ${abs('left:20px;right:20px;top:500px;display:grid;grid-template-columns:1fr 1fr;gap:10px', answers)}
    ${status}
    ${abs('left:24px;right:24px;bottom:28px;display:flex;justify-content:center', stop)}
    ${overlay}
  </div>`;
}

/** Idle screen dimmed with a right drawer on top (A-01 + the settings drawer). */
export function drawerScene({ drawer = '', chip, dot } = {}) {
  return `<div class="frame" data-scene="drawer">
    <div style="opacity:.45;position:absolute;inset:0">${header({ chip, dot })}${orbitSVG({ segs: idleSegs })}<svg class="stage-svg" width="1440" height="900">${cubeSVG(CUBE_AT.x, CUBE_AT.y, CUBE_AT.s)}</svg><div class="clock" style="top:690px;--clock-size:120px;color:var(--b-faint)">0.00</div></div>
    <div style="position:absolute;inset:0;background:var(--b-canvas);opacity:.5"></div>
    ${drawer}
  </div>`;
}
export { arcPath };
