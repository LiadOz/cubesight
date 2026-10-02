/* global document */
// Shared Orbit pieces for the combined-screen prototypes (time-and-coach, progress-and-charts): the A-05 stage ring with
// real label positions, markers (spark = good, ! = to fix), a selected-marker ring, the mini Orbit glyph and a frame crop helper.
// Geometry follows docs/design/orbit-v3/A-05-results.png at 1440 x 900 (centre 720,440, r 300, an open dial of 290 degrees).
import { polar, arcPath, cubeSVG, header } from './common.js';

export const CX = 720, CY = 440, R = 300;

/** The nine stages of the A-05 solve. a0..a1 in degrees (0 = top, clockwise); pos = label anchor (x, y, align). */
export const ST = [
  { k: 'cross', a0: -145, a1: -107, tone: 'good', val: '2.08', d: '−0.33', pos: [437, 632, 'c'] },
  { k: 'p1', a0: -103, a1: -70, tone: 'good', val: '1.71', d: '−0.17', pos: [398, 404, 'r'] },
  { k: 'p2', a0: -66, a1: -31, tone: 'done', val: '1.96', d: '+0.04', pos: [474, 170, 'r'] },
  { k: 'p3', a0: -27, a1: -1, tone: 'good', val: '1.52', d: '−0.43', pos: [640, 66, 'c'] },
  { k: 'p4', a0: 3, a1: 45, tone: 'warn', val: '2.31', d: '+0.27', pos: [868, 84, 'c'], dw: 1 },
  { k: 'eo', a0: 47, a1: 55, tone: 'good', val: 'skip', d: '', pos: [968, 190, 'l'] },
  { k: 'co', a0: 59, a1: 90, tone: 'done', val: '1.64', d: '+0.09', pos: [1030, 314, 'l'], dw: 1 },
  { k: 'cp', a0: 94, a1: 121, tone: 'good', val: '1.47', d: '−0.15', pos: [1034, 490, 'l'] },
  { k: 'ep', a0: 125, a1: 145, tone: 'good', val: '1.38', d: '−0.11', pos: [960, 660, 'l'] },
];
/** Markers of A-05 (angle on the ring, tone, the line under the label, the stage it belongs to). */
export const MK = {
  cross: { a: -128, tone: 'warn', line: 'detour +2 mv' },
  p2: { a: -48, tone: 'good', line: 'best pair chosen' },
  p3: { a: -11.5, tone: 'good', line: 'pseudo pair' },
  p4: { a: 15.5, tone: 'warn', line: 'pause 0.9 s' },
  eo: { a: 51, tone: 'good', line: 'EO skip' },
};
export const toneColour = (t) => (t === 'warn' ? 'var(--b-warn)' : t === 'good' ? 'var(--b-good)' : t === 'bad' ? 'var(--b-dnf)' : 'var(--b-fill)');
const strokeFor = (t) => (t === 'good' ? 'var(--b-good)' : t === 'warn' ? 'var(--b-warn)' : t === 'live' ? 'var(--b-fill-live)' : t === 'future' ? 'var(--b-track)' : 'var(--b-fill)');

/** A marker: a shape plus a colour, never colour alone. sel adds the white selection ring of A-05. */
export function marker(x, y, tone, { sel = false, n = 0, dim = false, small = false } = {}) {
  x = Number(x); y = Number(y);
  const col = toneColour(tone); const r = small ? 7 : 10;
  const shape = n ? `<text x="${x}" y="${y + 4}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="11" font-weight="500" fill="${col}">${n}</text>`
    : tone === 'warn' ? `<text x="${x}" y="${y + 4}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="12" font-weight="500" fill="${col}">!</text>`
      : `<path d="M${x} ${y - 5}L${x + 1.6} ${y - 1.6}L${x + 5} ${y}L${x + 1.6} ${y + 1.6}L${x} ${y + 5}L${x - 1.6} ${y + 1.6}L${x - 5} ${y}L${x - 1.6} ${y - 1.6}Z" fill="${col}"/>`;
  return `<g opacity="${dim ? 0.45 : 1}">${sel ? `<circle cx="${x}" cy="${y}" r="${r + 5}" fill="none" stroke="var(--b-ink)" stroke-width="1.6"/>` : ''}<circle cx="${x}" cy="${y}" r="${r}" fill="var(--b-bg)" stroke="${col}" stroke-width="2.4"/>${shape}</g>`;
}

/** The stage label (A-05): name, value, delta, optional marker line. */
export function stageLabel(s, { mk = null, dim = false, hideLine = false } = {}) {
  const [x, y, a] = s.pos;
  const tx = a === 'r' ? '-100%' : a === 'c' ? '-50%' : '0';
  const line = mk && !hideLine ? `<div style="font:400 11px var(--b-font-mono);color:${toneColour(mk.tone)};margin-top:2px">${mk.tone === 'good' ? '✦' : '○'} ${mk.line}</div>` : '';
  return `<div style="position:absolute;left:${x}px;top:${y}px;transform:translateX(${tx});text-align:${a === 'r' ? 'right' : a === 'c' ? 'center' : 'left'};white-space:nowrap;opacity:${dim ? 0.38 : 1};transition:none">`
    + `<div style="font:400 11px var(--b-font-mono);color:var(--b-muted)">${s.k}</div>`
    + `<div style="font:500 17px var(--b-font-sans);color:var(--b-ink);margin-top:2px">${s.val}</div>`
    + (s.d ? `<div style="font:400 11px var(--b-font-mono);color:${s.dw ? 'var(--b-warn-text)' : 'var(--b-good)'}">${s.d}</div>` : '') + line + '</div>';
}

/** The A-05 results ring as { svg, html }: arcs, markers, labels. sel = the selected marker's stage key, extra = raw svg on top. */
export function resultsRing({ cx = CX, cy = CY, r = R, sel = null, dimOthers = true, labels = true, markers = MK, hideLine = null, w = 1440, h = 900, extra = '', strokeScale = 1 } = {}) {
  let body = '';
  for (const s of ST) {
    body += `<path d="${arcPath(cx, cy, r, s.a0, s.a1)}" fill="none" stroke="${strokeFor(s.tone)}" stroke-width="${6 * strokeScale}" stroke-linecap="round"/>`;
  }
  for (const [k, m] of Object.entries(markers)) {
    const [x, y] = polar(cx, cy, r, m.a);
    body += marker(x.toFixed(1), y.toFixed(1), m.tone, { sel: sel === k, dim: sel && sel !== k && dimOthers });
  }
  let html = '';
  if (labels) for (const s of ST) html += stageLabel(s, { mk: markers[s.k], dim: !!(sel && sel !== s.k && dimOthers), hideLine: hideLine === s.k });
  return { svg: `<svg class="stage-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}${extra}</svg>`, html };
}
export const markerXY = (k, cx = CX, cy = CY, r = R) => polar(cx, cy, r, MK[k].a);

/** A dotted connector with a fade at both ends (the A-05 pattern). d = svg path; id must be unique per page. */
export function connector(d, { id = 'cn', tone = 'warn', from, to, fadeIn = 1, width = 2 } = {}) {
  const col = toneColour(tone);
  const [x0, y0] = from; const [x1, y1] = to;
  return `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}">`
    + `<stop offset="0" stop-color="var(--b-muted)" stop-opacity="0"/><stop offset=".22" stop-color="var(--b-muted)" stop-opacity="${0.95 * fadeIn}"/>`
    + `<stop offset=".78" stop-color="${col}" stop-opacity="${0.95 * fadeIn}"/><stop offset="1" stop-color="${col}" stop-opacity="${fadeIn}"/></linearGradient></defs>`
    + `<path d="${d}" fill="none" stroke="url(#${id})" stroke-width="${width}" stroke-dasharray="1.6 4.2" stroke-linecap="round"/>`;
}

/** Mini Orbit glyph (the approved list form: one arc per stage, sections as gaps). str: n neutral, g good, w warn, f future. */
export function glyph(str, { size = 40, ring = 16, dots = [], center = '', cfs = 13, sw = 3.4, sel = false } = {}) {
  const c = 20; const n = str.length; const gap = n > 12 ? 4 : 9; const w = (360 - gap * n) / n; let a = gap / 2; let out = '';
  const cap = (1.75 / ring) * (180 / Math.PI);
  for (let i = 0; i < n; i += 1) {
    const a0 = a; const a1 = a0 + w; a = a1 + gap;
    const col = { n: 'var(--b-fill)', g: 'var(--b-good)', w: 'var(--b-warn)', f: 'var(--b-track)', l: 'var(--b-fill-live)', b: 'var(--b-dnf)' }[str[i]];
    out += `<path d="${arcPath(c, c, ring, a0 + cap, Math.max(a1 - cap, a0 + cap + 0.5))}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }
  for (const d of dots) { const [x, y] = polar(c, c, ring + 4.6, d.a); out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.7" fill="${d.k === 'w' ? 'var(--b-warn)' : 'var(--b-good)'}"/>`; }
  if (sel) out += `<circle cx="20" cy="20" r="19.2" fill="none" stroke="var(--b-ink)" stroke-width=".8" opacity=".55"/>`;
  if (center) out += `<text x="${c}" y="${c + cfs * 0.34}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="${cfs}" fill="var(--b-ink)">${center}</text>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true" style="display:block;flex:none">${out}</svg>`;
}

/** Show only a window of a (larger) frame, scaled: the light strips and the decision crops. */
export function crop(frameHtml, { x = 0, y = 0, w = 720, h = 450, s = 1, cls = '', style = '' } = {}) {
  return `<div class="crop ${cls}" style="position:relative;width:${w * s}px;height:${h * s}px;overflow:hidden;${style}"><div style="position:absolute;left:${-x * s}px;top:${-y * s}px;width:1440px;transform:scale(${s});transform-origin:0 0">${frameHtml}</div></div>`;
}

/** Position helper for absolutely placed html blocks. */
export const abs = (style, html, extra = '') => `<div class="abs" ${extra} style="position:absolute;${style}">${html}</div>`;
export { header, cubeSVG, polar, arcPath };
