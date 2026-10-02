// W-33: the thumbnail card and its grid, three ways. Real images from this repo.
import { pool } from './data.js';
import { UI, key, textBtn, toast, co, CHECK, glyph, copyLink, secondary } from './kit.js';
import { pageHead, shell } from './timeline.js';

const IMG = it => `<img src="${it.url}" alt="">`;
const pick = (n, off = 0) => Array.from({ length: n }, (_, i) => pool[(i + off) % pool.length]);

const card1 = (it, { sel, hov, n } = {}) => `<figure class="c1 ${sel ? 'sel' : ''} ${hov ? 'hov' : ''}" ${co(n)}><span class="pick">${CHECK}</span><div class="th ${it.tall ? 'tall' : ''}">${IMG(it)}</div><figcaption class="cap"><span class="id">${it.id}</span><span class="tt">${it.title}</span><span class="acts"><span class="sub-m">${it.cap}</span>${copyLink()}</span></figcaption></figure>`;
const card2 = (it, { sel, hov, n } = {}) => `<figure class="c2 ${sel ? 'sel' : ''} ${hov ? 'hov' : ''}" ${co(n)}>${IMG(it)}<span class="ck">${CHECK}</span><span class="id">${it.id}</span><span class="hv"><b>${it.id}</b><span>${it.title}</span></span><span class="cpy">${copyLink('copy')}</span></figure>`;
const card3 = (it, { sel, n } = {}) => `<article class="c3 ${sel ? 'sel' : ''}" ${co(n)}><div class="th">${IMG(it)}</div><div class="bd"><div class="id"><span>${it.id}</span><span class="tag">${it.cap.split(' · ')[0]}</span></div><div class="tt">${it.title}</div><div class="cp">The image opens in the lightbox; the ID is what you quote when you give feedback on it.</div><div class="ac">${secondary('open', 0, 'btn--s')}${copyLink()}</div></div></article>`;

const filters = phone => `<div class="fhead">${phone ? '' : '<span class="field-ph" ' + co(1) + '>filter this folder</span>'}${UI.chip('dark', { sel: true })}${UI.chip('light')}${UI.chip('phone')}${phone ? '' : `<span class="sp"></span><span class="sub-m">10 images · updated just now</span>`}</div>`;
const tm = ['14.07', '15.42', '14.91', '16.80', '13.62', '17.05', '15.06', '14.44'];
const histLabel = '<div class="lab-mono">the same card in history and alg browsing: a mini Orbit instead of a picture</div>';
const stripLabel = '<div class="lab-mono">in a blog post: the strip under the text</div>';

export function cards(opt, phone) {
  const P = pick(8);
  let grid = ''; let strip = ''; let hist = '';
  if (opt === 1) {
    const list = phone ? P.slice(0, 6) : P;
    grid = `<div class="grid1">${list.map((it, i) => card1(it, { sel: i === 1 || i === 4, hov: i === 2, n: i === 0 ? 2 : i === 2 ? 3 : i === 1 ? 4 : 0 })).join('')}</div>`;
    strip = `<div class="strip">${pick(5, 3).map(it => card1(it)).join('')}</div>`;
    hist = `<div class="grid1" style="grid-template-columns:repeat(${phone ? 2 : 6},minmax(0,1fr))">${tm.slice(0, phone ? 4 : 6).map((t, i) => `<div class="hc1" ${i === 0 ? co(6) : ''}>${glyph(phone ? 56 : 64, i)}<span class="tm">${t}</span><span class="mt">#${23 - i} · 17:${33 - i * 4}</span></div>`).join('')}</div>`;
  } else if (opt === 2) {
    const list = pick(phone ? 12 : 24);
    grid = `<div class="grid2">${list.map((it, i) => card2(it, { sel: i === 1 || i === 8, hov: i === 3, n: i === 0 ? 2 : i === 3 ? 3 : i === 1 ? 4 : 0 })).join('')}</div>`;
    strip = `<div class="strip">${pick(7, 2).map(it => card2(it)).join('')}</div>`;
    hist = `<div class="grid2" style="grid-template-columns:repeat(${phone ? 4 : 12},minmax(0,1fr));gap:6px">${tm.concat(tm).slice(0, phone ? 8 : 12).map((t, i) => `<div class="hc2" ${i === 0 ? co(6) : ''}>${glyph(phone ? 34 : 40, i)}<span class="tm">${t}</span></div>`).join('')}</div>`;
  } else {
    const list = phone ? P.slice(0, 5) : P;
    grid = `<div class="grid3">${list.map((it, i) => card3(it, { sel: i === 1, n: i === 0 ? 2 : i === 1 ? 4 : 0 })).join('')}</div>`;
    strip = `<div class="strip" data-co="3" style="overflow:hidden">${pick(3, 3).map(it => `<div style="flex-basis:${phone ? 300 : 360}px">${card3(it)}</div>`).join('')}</div>`;
    hist = `<div class="grid3">${tm.slice(0, phone ? 3 : 4).map((t, i) => `<div class="hc3" ${i === 0 ? co(6) : ''}>${glyph(48, i)}<span><span class="tm">${t}</span><br><span class="mt">#${23 - i} · today 17:${33 - i * 4} · speed</span></span>${copyLink('open')}</div>`).join('')}</div>`;
  }
  const body = `${pageHead('system-check', 'gallery / widgets / 2026-10-02-system-check · 10 images', 'folders')}
    ${filters(phone)}
    ${grid}
    ${stripLabel}${strip}
    ${histLabel}${hist}`;
  const t = phone ? '<div class="abs" style="left:18px;right:18px;top:770px;z-index:7;display:flex;justify-content:center">' + toast('link copied', '', 5) + '</div>'
    : `<div class="abs" style="right:48px;top:842px;z-index:7">${toast('link copied · SC-02', '', 5)}</div>`;
  void key; void textBtn;
  return shell(phone, body, t);
}
