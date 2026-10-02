// W-21 (approved 2026-10-02, v2) as importable helpers for combined-screen prototypes:
// desktop = labels on the Orbit (.o1 .lab), phone = wrapped sequence (.o3 .para-in); a section is only extra space.
// Same code as gallery/widgets/2026-10-02-W-21-moves-v2/proto/moves.js; styles come from that folder's moves.css.
import { arcPath, polar } from './common.js';

export const SCR = "D2 F2 U′ B2 R2 U2 F2 U′ L2 D′ B′ L′ U F′ R′ D2 R U′ F2 L′".split(' ');
export const TPERM = "R U R′ U′ R′ F R2 U′ R′ U′ R U R′ F′".split(' ');
export const TSECS = [{ from: 0, to: 3 }, { from: 4, to: 9 }, { from: 10, to: 13 }];
export const UNDO = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5h6.2a3.3 3.3 0 0 1 0 6.6H5M5.8 3.5L2.8 6.5l3 3"/></svg>';
export const BANG = '<svg class="bang" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 4v3.6M7 9.6v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const FACE = { U: 'top', D: 'bottom', F: 'front', B: 'back', R: 'right', L: 'left' };
export const desc = (m) => `${FACE[m[0]]} face, ${m[1] === '′' ? 'counter-clockwise' : m[1] === '2' ? 'a half turn' : 'clockwise'}`;

/** items: {m, st: done|cur|next|wrong|undo|ucur, sec: index | 'u' | -1, count: bool} */
export function build({ moves, cur, sections = [], undo = [], wrong = '' }) {
  const secOf = (i) => sections.findIndex((s) => i >= s.from && i <= s.to);
  const items = [];
  moves.forEach((m, i) => {
    if (i === cur && undo.length) {
      if (wrong) items.push({ m: wrong, st: 'wrong', sec: -1, count: false });
      undo.forEach((u, k) => items.push({ m: u, st: k === 0 ? 'ucur' : 'undo', sec: 'u', count: true }));
    }
    items.push({ m, st: i < cur ? 'done' : i === cur && !undo.length ? 'cur' : 'next', sec: secOf(i), count: true });
  });
  const counted = items.filter((x) => x.count);
  const at = counted.findIndex((x) => x.st === 'cur' || x.st === 'ucur');
  return { items, sections, total: counted.length, at, undoN: undo.length };
}

export const tok = (it, { cls = '', style = '' } = {}) => {
  const inner = `${it.st === 'ucur' ? UNDO : ''}${it.st === 'wrong' ? BANG : ''}<span class="t">${it.m}</span>`;
  return `<span class="mv is-${it.st}${cls ? ` ${cls}` : ''}" ${it.st === 'cur' || it.st === 'ucur' ? 'aria-current="step"' : ''} aria-label="${it.m}, ${it.st}" ${style ? `style="${style}"` : ''}>${inner}</span>`;
};
/** a section is ONLY extra space: a token whose section differs from the previous one gets .gp (a wider margin) */
export function runs(items, o = {}) {
  let out = ''; let prev = null;
  items.forEach((it, i) => {
    const gp = i > 0 && it.sec !== prev && (it.sec !== -1 || prev !== -1);
    out += tok(it, { ...o, cls: `${o.cls || ''}${gp ? ' gp' : ''}`.trim() });
    prev = it.sec;
  });
  return out;
}

export function layout(M, gs, gsec) {
  const C = M.items.filter((x) => x.count); const n = C.length; const gaps = [];
  for (let i = 1; i < n; i += 1) { const a = C[i - 1].sec; const b = C[i].sec; gaps.push(a !== b && (a !== -1 || b !== -1) ? gsec : gs); }
  const w = (290 - gaps.reduce((s, x) => s + x, 0)) / n; let a = -145;
  return C.map((it, i) => { const s = { it, a0: a, a1: a + w, mid: a + w / 2 }; a += w + (gaps[i] || 0); return s; });
}
/** the ring of a sequence with labels on it (desktop) or arcs only (labels: false) */
export function ringHtml(M, { W, H, cx, cy, r, labels, win = 26, Rl = 30, gs = 2.4, gsec = 14, small = false }) {
  const segs = layout(M, gs, gsec); const n = segs.length;
  let svg = ''; let html = '';
  const done = small ? 3 : 5, next = small ? 2 : 3, live = small ? 5 : 8;
  for (const s of segs) {
    const st = s.it.st; const d = arcPath(cx, cy, r, s.a0, s.a1);
    if (st === 'done') svg += `<path d="${d}" fill="none" stroke="var(--b-faint)" stroke-width="${done}" stroke-linecap="round"/>`;
    else if (st === 'cur') svg += `<path d="${d}" fill="none" stroke="var(--b-fill-live)" stroke-width="${live}" stroke-linecap="round"/>`;
    else if (st === 'ucur') svg += `<path d="${d}" fill="none" stroke="var(--b-warn)" stroke-width="${live}" stroke-linecap="round"/>`;
    else if (st === 'undo') svg += `<path d="${d}" fill="none" stroke="var(--b-warn)" stroke-width="${next + 1}" stroke-linecap="round" opacity=".7"/>`;
    else svg += `<path d="${d}" fill="none" stroke="var(--b-track)" stroke-width="${next}" stroke-linecap="round"/>`;
  }
  if (labels) {
    const at = Math.max(M.at, 0);
    const lo = n <= win ? 0 : Math.max(0, Math.min(at - Math.round(win * 0.3), n - win));
    const hi = n <= win ? n : lo + win;
    const dense = n > 26;
    segs.forEach((s, i) => {
      if (i < lo || i >= hi) return;
      const d = Math.abs(i - at); const zig = dense && d > 0 ? [0, 36, 18][d % 3] : 0;
      const [x, y] = polar(cx, cy, r + Rl + zig, s.mid);
      html += tok(s.it, { cls: 'lab', style: `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;` });
    });
  }
  return { svg: `<svg class="stage-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${svg}</svg>`, html, segs };
}
