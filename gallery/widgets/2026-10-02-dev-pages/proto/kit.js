/* global window */
// Small builders shared by the dev-page prototypes (approved widgets only, plus the proposed dev widgets).
import { arcPath } from '../../_proto/common.js';
import { dateLabel } from './data.js';

export const UI = window.UI;
export const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
export const ARROWS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>';
export const co = n => (n ? `data-co="${n}"` : '');
export const key = (g, size = 's') => `<kbd class="key key--${size}">${g}</kbd>`;
export const kbi = (c, l) => `<span class="kbi">${c}<span>${l}</span></span>`;
export const kbar = (...a) => `<div class="kbar">${a.join('')}</div>`;
export const primary = (label, cap = '', n = 0, size = 'btn--l') => `<span class="on-primary" ${co(n)}><button class="btn btn--primary ${size}" type="button"><span>${label}</span>${cap}</button></span>`;
export const secondary = (label, n = 0, size = '') => `<span class="on-secondary" ${co(n)}><button class="btn btn--secondary ${size}" type="button"><span>${label}</span></button></span>`;
export const textBtn = (label, n = 0, size = '') => `<button class="btn btn--text btn--muted ${size}" type="button" ${co(n)}>${label}</button>`;
export const stat = txt => `<span class="st"><i class="g-dot"></i>${txt}</span>`;
export const toast = (txt, act = '', n = 0) => `<span class="toast ${act ? 'has-act' : ''}" ${co(n)}><span>${txt}</span>${act ? `<button class="act" type="button">${act}</button>` : ''}</span>`;
export const abs = (style, html, extra = '') => `<div class="abs" ${extra} style="${style}">${html}</div>`;
export const chips = (items, n = 0) => `<span class="row wrap" style="gap:8px" ${co(n)}>${items.map(([l, on, c]) => UI.chip(l, { sel: on, n: c })).join('')}</span>`;

const GL = { built: '✦ ', chosen: '', exploring: '', rejected: '! ', superseded: '' };
export const sbadge = (s, n = 0) => `<span class="sb sb--${s}" ${co(n)}>${s === 'chosen' ? CHECK : GL[s] || ''}${s}</span>`;
export const btag = (b, on = false) => `<span class="bt ${on ? 'on' : ''}">${b}</span>`;
export const dl = d => dateLabel(d);

/** Small status node for the graphs (shape + colour, never colour alone). */
export function node(status, x0, y0, { r = 5, path = false, sel = false } = {}) {
  const x = Number(x0); const y = Number(y0);
  const R = path ? r + 1.5 : r;
  let s = '';
  if (sel) s += `<circle cx="${x}" cy="${y}" r="${R + 5}" fill="none" stroke="var(--b-ink)" stroke-width="1.5"/>`;
  if (status === 'built') s += `<circle cx="${x}" cy="${y}" r="${R}" fill="var(--b-good)"/>`;
  else if (status === 'chosen') s += `<circle cx="${x}" cy="${y}" r="${R}" fill="var(--b-ink)"/>`;
  else if (status === 'exploring') s += `<circle cx="${x}" cy="${y}" r="${R - 1}" fill="var(--b-bg)" stroke="var(--b-ink)" stroke-width="2"/>`;
  else if (status === 'rejected') s += `<circle cx="${x}" cy="${y}" r="${R - 1}" fill="var(--b-bg)" stroke="var(--b-warn)" stroke-width="2"/><path d="M${x - 2.2} ${y - 2.2}l4.4 4.4M${x + 2.2} ${y - 2.2}l-4.4 4.4" stroke="var(--b-warn)" stroke-width="1.4" stroke-linecap="round"/>`;
  else s += `<circle cx="${x}" cy="${y}" r="${R - 1}" fill="var(--b-bg)" stroke="var(--b-faint)" stroke-width="1.6" stroke-dasharray="2 2"/>`;
  return s;
}

/** A mini Orbit glyph (the list form of the ring) for history / alg rows: n segments with a couple of markers. */
export function glyph(size = 44, seed = 0, { n = 9 } = {}) {
  const c = size / 2, r = size / 2 - 5;
  const per = 360 / n;
  let s = '';
  for (let i = 0; i < n; i += 1) {
    const tone = (i + seed) % 7 === 3 ? 'var(--b-warn)' : (i + seed) % 5 === 1 ? 'var(--b-good)' : 'var(--b-fill)';
    s += `<path d="${arcPath(c, c, r, i * per + 3, (i + 1) * per - 3)}" fill="none" stroke="${tone}" stroke-width="${Math.max(2.4, size / 14)}" stroke-linecap="round"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${s}</svg>`;
}

export function copyLink(label = 'copy link') { return `<button class="btn btn--text btn--muted btn--s" type="button">${label}</button>`; }

export const anchor = (n, x, y, side = '') => `<span class="abs" data-co="${n}" ${side ? `data-co-side="${side}"` : ''} style="left:${Math.round(x)}px;top:${Math.round(y)}px;width:2px;height:2px;z-index:8"></span>`;
