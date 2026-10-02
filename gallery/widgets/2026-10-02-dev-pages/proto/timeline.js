// W-32: the timeline graph, three ways. Real data: the 43 posts in this repo + this one.
import { header, polar, arcPath } from '../../_proto/common.js';
import { posts, ord, idx, branches, byId, count, kids, PATH, onPath, attachedTo, roots, short, thumbs, attach } from './data.js';
import { anchor, UI, key, kbi, kbar, primary, secondary, textBtn, toast, abs, co, sbadge, btag, node, dl, CHECK } from './kit.js';

export const phHdr = () => `<div class="hdr" style="padding:0 18px;height:52px"><span class="word" style="font-size:17px;margin:0">cubesight</span><span class="chip-cube" style="font-size:11px"><i class="dot"></i>GAN 356 i3 · 84%</span></div>`;
export const pageHead = (title, sub, active = 'timeline') => `<div><div class="eyebrow">dev · gallery</div><h1>${title}</h1><div class="sub-m" style="margin-top:6px">${sub}</div></div>
  <div class="tabs">${['folders', 'blog', 'timeline'].map(t => `<span class="${t === active ? 'on' : ''}">${t}</span>`).join('')}</div>`;
export const shell = (phone, body, extra = '', cls = 'tall') => `<div class="frame ${cls} ${phone ? 'phone touch' : ''}">${phone ? phHdr() : header({ active: '' })}<div class="pg">${body}</div>${extra}</div>`;

const SEL = 'widgets-W-21-moves-v2';
const N = ord.length;
const nb = branches.length;
const statusLegend = `<div class="legend-row" data-co="3">
  <span class="lg"><svg width="14" height="14">${node('built', 7, 7, { r: 5 })}</svg>built</span>
  <span class="lg"><svg width="14" height="14">${node('chosen', 7, 7, { r: 5 })}</svg>chosen</span>
  <span class="lg"><svg width="14" height="14">${node('exploring', 7, 7, { r: 5 })}</svg>exploring</span>
  <span class="lg"><svg width="14" height="14">${node('rejected', 7, 7, { r: 5 })}</svg>rejected</span>
  <span class="lg"><svg width="14" height="14">${node('superseded', 7, 7, { r: 5 })}</svg>superseded</span>
  <span class="lg"><svg width="26" height="14"><path d="M1 7h24" stroke="var(--b-ink)" stroke-width="3" stroke-linecap="round"/></svg>the chosen path</span></div>`;
const viewSeg = (phone) => UI.seg('view', ['all posts', 'chosen path', 'built'], 0).replace('class="seg"', phone ? 'class="seg" data-full' : 'class="seg"');

/* =============================================================== option 1: the git graph, kept, in the Orbit's quiet language */
export function tl1(phone) {
  const rows = [...ord].reverse();
  const LP = phone ? 8.5 : 15;
  const GW = Math.ceil(nb * LP + 12);
  const RH = phone ? 50 : 34;
  const EXP = phone ? 236 : 200;
  const PICK = new Set(['widgets-W-04-buttons', SEL]);
  const top = [];
  let y = 0;
  rows.forEach(p => { top.push(y); y += RH + (p.id === SEL ? EXP : 0); });
  const rowIdx = new Map(rows.map((p, i) => [p.id, i]));
  const laneX = b => 8 + branches.indexOf(b) * LP;
  let eN = '';
  let eP = '';
  for (const p of rows) {
    for (const par of p.parent) {
      if (!rowIdx.has(par)) continue;
      const a = rowIdx.get(p.id);
      const b = rowIdx.get(par);
      const x1 = laneX(p.branch); const y1 = top[a] + RH / 2;
      const q = byId.get(par);
      const x2 = laneX(q.branch); const y2 = top[b] + RH / 2;
      const yc = Math.min(y1 + RH, y2);
      const d = x1 === x2 ? `M${x1} ${y1}L${x2} ${y2}` : `M${x1} ${y1}C${x1} ${y1 + RH * 0.8} ${x2} ${yc - RH * 0.5} ${x2} ${yc}L${x2} ${y2}`;
      if (onPath.has(p.id) && onPath.has(par)) eP += `<path d="${d}" fill="none" stroke="var(--b-ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
      else eN += `<path d="${d}" fill="none" stroke="var(--b-faint)" stroke-width="1.4" opacity=".75" stroke-linecap="round"/>`;
    }
  }
  const nodes = rows.map((p, i) => node(p.status, laneX(p.branch), top[i] + RH / 2, { r: phone ? 3.6 : 4.6, path: onPath.has(p.id), sel: p.id === SEL })).join('');
  const total = y;
  const cols = phone ? `${GW}px minmax(0,1fr) 26px` : `${GW}px minmax(0,1fr) 112px 104px 62px 28px`;
  const th = thumbs(byId.get(SEL), 3).map(u => `<img src="${u}" alt="">`).join('');
  const htmlRows = rows.map(p => {
    const sel = p.id === SEL;
    const cls = `r ${onPath.has(p.id) ? 'path' : ''} ${sel ? 'sel' : ''}`;
    const pick = PICK.has(p.id) ? `<span class="ck" style="position:static;display:grid" ${p.id === SEL ? co(5) : ''}>${CHECK}</span>` : '<span></span>';
    const exp = sel ? `<div class="exp" style="height:${EXP}px;grid-column:${phone ? '2 / -1' : '2 / -1'}"><div class="mini-th">${th.split('<img').slice(1, phone ? 3 : 4).map(s => '<img' + s).join('')}</div><div class="m" style="display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${byId.get(SEL).decision}</div><div class="row">${secondary('open post', 4, 'btn--s')}${textBtn('compare with parent', 0, 'btn--s')}${textBtn('copy link', 0, 'btn--s')}</div></div>` : '';
    if (phone) {
      return `<div class="${cls}" style="grid-template-columns:${cols};height:${RH + (sel ? EXP : 0)}px;grid-template-rows:${RH}px ${sel ? EXP + 'px' : ''}"><span></span><div style="min-width:0;display:grid;gap:3px"><span class="t" style="font-size:13px">${p.title}</span><span class="sub-m" style="font-size:10.5px;color:var(--b-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${dl(p.date)} · ${p.branch} · ${p.status}</span></div>${pick}${exp}</div>`;
    }
    return `<div class="${cls}" style="grid-template-columns:${cols};height:${RH + (sel ? EXP : 0)}px;grid-template-rows:${RH}px ${sel ? EXP + 'px' : ''}"><span></span><span class="t">${p.title}</span>${btag(p.branch, onPath.has(p.id))}<span>${sbadge(p.status)}</span><span class="d">${dl(p.date)}</span>${pick}${exp}</div>`;
  }).join('');
  const body = `${pageHead('timeline', `${posts.length} posts · ${nb} branches · newest first`)}
    <div class="row wrap" style="gap:14px;justify-content:space-between"><span ${co(2)}>${viewSeg(phone)}</span>${phone ? '' : `<span class="sub-m">click a row to open it · pick two to compare</span>`}</div>
    ${statusLegend}
    <div class="tl1"><div class="rows" style="height:${total}px"><svg class="gsvg" data-co="1" width="${GW}" height="${total}" aria-hidden="true">${eN}${eP}${nodes}</svg>${htmlRows}</div></div>`;
  const extra = `<div class="abs" style="${phone ? 'left:18px;right:18px;top:770px' : 'right:48px;top:842px'};z-index:7;display:flex;justify-content:${phone ? 'center' : 'flex-end'}">${toast('2 picked · W-04 buttons, W-21 moves v2', 'compare', 6)}</div>`;
  return shell(phone, body, extra);
}

/* =============================================================== option 2: branches as rings (the Orbit language) */
const RING = (cx, cy, rIn, rOut) => {
  const m = new Map();
  branches.forEach((b, i) => m.set(b, rIn + (rOut - rIn) * (i / (nb - 1))));
  return m;
};
const ang = i => -145 + 290 * (i / (N - 1));
const hug = (r1, a1, r2, a2, cx, cy) => {
  if (r1 === r2) return arcPath(cx, cy, r1, a1, a2);
  const hop = Math.min(5, (a2 - a1) * 0.6);
  const aE = a2 - hop;
  const P = (r, a) => polar(cx, cy, r, a).map(v => v.toFixed(1));
  const [x0, y0] = P(r1, a1); const [xe, ye] = P(r1, aE); const [c1x, c1y] = P(r1, aE + hop * 0.7); const [c2x, c2y] = P(r2, a2 - hop * 0.7); const [x2, y2] = P(r2, a2);
  const arc = aE - a1 > 0.3 ? `A${r1} ${r1} 0 0 1 ${xe} ${ye}` : '';
  return `M${x0} ${y0}${arc}C${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
};
const quad = (r1, a1, r2, a2, cx, cy) => {
  const [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r2, a2);
  const [qx, qy] = polar(cx, cy, ((r1 + r2) / 2) * 0.82, (a1 + a2) / 2);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${qx.toFixed(1)} ${qy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};

function railCard(sel, { x, y, w, n = {} }) {
  const p = byId.get(sel);
  const par = p.parent.map(id => byId.get(id)).filter(Boolean);
  const ch = kids.get(sel).map(id => byId.get(id));
  const th = thumbs(p, 3).map(u => `<div class="c2" style="flex:1;min-width:0"><img src="${u}" alt=""></div>`).join('');
  return abs(`left:${x}px;top:${y}px;width:${w}px`, `<div class="rail" style="position:static">
    <div class="row" style="gap:10px">${sbadge(p.status)}${btag(p.branch, true)}<span class="sub-m">${dl(p.date)}</span></div>
    <h2>${p.title.length > 64 ? p.title.slice(0, 62) + '…' : p.title}</h2>
    <div class="dec">${p.decision || 'pending user choice'}</div>
    <div class="row" style="gap:8px">${th}</div>
    <div class="rel"><div>grew out of <b>${par.map(q => short(q.id)).join(', ') || '-'}</b></div><div>led to <b>${ch.map(q => short(q.id)).join(', ') || '-'}</b></div></div>
    <div class="row wrap" style="gap:6px 8px">${primary('open post', key('enter', 'm'), n.open || 0, 'btn--l')}${textBtn('compare', 0)}${textBtn('copy link', 0)}</div></div>`);
}

export function tl2(phone) {
  if (phone) return tl2Phone();
  const cx = 565; const cy = 524; const rIn = 124; const rOut = 318;
  const R = RING(cx, cy, rIn, rOut);
  const pos = p => polar(cx, cy, R.get(p.branch), ang(idx.get(p.id)));
  let tracks = '';
  const span = new Map();
  for (const p of ord) { const s = span.get(p.branch) || [999, -1]; s[0] = Math.min(s[0], idx.get(p.id)); s[1] = Math.max(s[1], idx.get(p.id)); span.set(p.branch, s); }
  for (const b of branches) {
    const r = R.get(b); const [s0, s1] = span.get(b);
    tracks += `<path d="${arcPath(cx, cy, r, -145, 145)}" fill="none" stroke="var(--b-track)" stroke-width="1" opacity=".55"/>`;
    if (s1 > s0) tracks += `<path d="${arcPath(cx, cy, r, ang(s0), ang(s1))}" fill="none" stroke="var(--b-faint)" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>`;
  }
  let eN = ''; let eP = '';
  for (const p of ord) {
    for (const par of p.parent) {
      const q = byId.get(par); if (!q) continue;
      const r1 = R.get(q.branch); const r2 = R.get(p.branch); const a1 = ang(idx.get(q.id)); const a2 = ang(idx.get(p.id));
      const isPath = onPath.has(p.id) && onPath.has(par);
      const d = hug(r1, a1, r2, a2, cx, cy);
      if (isPath) eP += `<path d="${d}" fill="none" stroke="var(--b-ink)" stroke-width="3.2" stroke-linecap="round"/>`;
      else eN += `<path d="${d}" fill="none" stroke="var(--b-faint)" stroke-width="1.1" opacity=".7"/>`;
    }
  }
  const nodes = ord.map(p => { const [x, y] = pos(p); return node(p.status, x.toFixed(1), y.toFixed(1), { r: 3.8, path: onPath.has(p.id), sel: p.id === SEL }); }).join('');
  // date ticks outside
  let ticks = ''; let lastDate = '';
  ord.forEach((p, i) => {
    if (p.date === lastDate) return; lastDate = p.date;
    const showLab = i > 3;
    const a = i === 0 ? ang(0) : (ang(i) + ang(i - 1)) / 2;
    const [x1, y1] = polar(cx, cy, rOut + 10, a); const [x2, y2] = polar(cx, cy, rOut + 16, a); const [tx, ty] = polar(cx, cy, rOut + 27, a);
    ticks += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="var(--b-faint)" stroke-width="1.2"/>${showLab ? `<text x="${tx.toFixed(1)}" y="${(ty + 3.5).toFixed(1)}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="10.5" fill="var(--b-faint)">${dl(p.date)}</text>` : ''}`;
  });
  // labels for the chosen path: two tiers, pushed apart so none overlap, a dotted leader (the A-05 connector)
  const L = PATH.map((id, k) => {
    const p = byId.get(id); const a = ang(idx.get(id));
    const rl = rOut + 44 + (k % 2) * 28;
    const [lx, ly] = polar(cx, cy, rl, a);
    return { id, p, a, lx, ly, anchor: lx < cx - 24 ? 'end' : lx > cx + 24 ? 'start' : 'middle' };
  });
  for (const side of ['end', 'start', 'middle']) {
    const g = L.filter(l => l.anchor === side).sort((m, n) => m.ly - n.ly);
    for (let i = 1; i < g.length; i += 1) if (g[i].ly - g[i - 1].ly < 17 && side !== 'middle') g[i].ly = g[i - 1].ly + 17;
  }
  let labs = '';
  for (const l of L) {
    const [x1, y1] = polar(cx, cy, R.get(l.p.branch) + 6, l.a);
    const dx = l.anchor === 'end' ? -6 : l.anchor === 'start' ? 6 : 0;
    labs += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${(l.lx + dx * 0.2).toFixed(1)} ${(l.ly - 4).toFixed(1)}" stroke="var(--b-faint)" stroke-width="1.2" stroke-dasharray="1.5 4" stroke-linecap="round" fill="none"/>
      <text x="${(l.lx + dx).toFixed(1)}" y="${l.ly.toFixed(1)}" text-anchor="${l.anchor}" font-family="var(--b-font-mono)" font-size="10.5" fill="var(--b-muted)">${short(l.id)} <tspan font-family="var(--b-font-sans)" font-size="12.5" font-weight="500" fill="var(--b-ink)">· ${dl(l.p.date)}</tspan></text>`;
  }
  // branch names stacked in the gap at the bottom
  let bl = '';
  for (const b of branches) {
    const r = R.get(b);
    bl += `<text x="${cx}" y="${(cy + r + 3.5).toFixed(1)}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="10.5" fill="var(--b-muted)" paint-order="stroke" stroke="var(--b-bg)" stroke-width="5">${b} ${count(b)}</text>`;
  }
  // dotted connector from the rail card to the selected node
  const [sx, sy] = pos(byId.get(SEL));
  const conn = `<path d="M${(sx + 9).toFixed(1)} ${sy.toFixed(1)}C${(sx + 90).toFixed(1)} ${(sy - 10).toFixed(1)} 1060 ${(sy - 60).toFixed(1)} 1108 262" stroke="var(--b-faint)" stroke-width="1.4" stroke-dasharray="1.5 4" stroke-linecap="round" fill="none"/>`;
  const sp = byId.get(SEL);
  const centre = `<foreignObject x="${cx - 86}" y="${cy - 80}" width="172" height="170"><div xmlns="http://www.w3.org/1999/xhtml" style="display:grid;gap:6px;justify-items:center">
    <div class="c2" style="width:168px;aspect-ratio:16/10"><img src="${thumbs(sp, 1)[0]}" alt=""></div>
    <div class="lab-mono" style="color:var(--b-accent-text)">${short(SEL)}</div><div style="font-size:12px;color:var(--b-ink);text-align:center;line-height:1.3;width:150px">${sp.decision.slice(0, 44)}</div></div></foreignObject>`;
  const body = `${abs('left:48px;top:80px;width:330px;z-index:3', pageHead('timeline', `${posts.length} posts · ${nb} rings<br>oldest inside, time runs clockwise`))}
    <svg class="stage-svg" width="1440" height="900" aria-hidden="true">${tracks}${eN}${eP}${nodes}${ticks}${labs}${bl}${conn}${centre}</svg>`;
  const rail = railCard(SEL, { x: 1112, y: 104, w: 290, n: { open: 4 } });
  const rail2 = abs('left:1112px;top:610px;width:290px;z-index:3;display:grid;gap:14px', `<div ${co(3)}>${UI.seg('view', ['all', 'chosen path', 'built'], 0).replace('class="seg"', 'class="seg" data-full')}</div>${statusLegend.replace('data-co="3"', '').replace('class="legend-row"', 'class="legend-row" style="gap:6px 14px;width:auto"')}`);
  const [wx, wy] = polar(cx, cy, rOut, 62); const [lx5, ly5] = polar(cx, cy, rOut + 44, ang(idx.get('orbit-v3')));
  const anchors = anchor(1, wx, wy) + anchor(2, sx, sy, 'l') + anchor(5, lx5 + 96, ly5 - 12);
  return `<div class="frame">${header({ active: '' })}${body}${rail}${rail2}${anchors}
    ${abs('left:48px;bottom:16px;z-index:4', kbar(kbi(key('←') + key('→'), 'step'), kbi(key('enter'), 'open')))}
    ${abs('right:48px;bottom:18px;z-index:7', toast('2 picked', 'compare', 6))}</div>`;
}

function tl2Phone() {
  const cx = 195; const cy = 262; const rIn = 52; const rOut = 158;
  const R = RING(cx, cy, rIn, rOut);
  const pos = p => polar(cx, cy, R.get(p.branch), ang(idx.get(p.id)));
  let tracks = ''; const span = new Map();
  for (const p of ord) { const s = span.get(p.branch) || [999, -1]; s[0] = Math.min(s[0], idx.get(p.id)); s[1] = Math.max(s[1], idx.get(p.id)); span.set(p.branch, s); }
  for (const b of branches) {
    const r = R.get(b); const [s0, s1] = span.get(b);
    tracks += `<path d="${arcPath(cx, cy, r, -145, 145)}" fill="none" stroke="var(--b-track)" stroke-width="1" opacity=".5"/>`;
    if (s1 > s0) tracks += `<path d="${arcPath(cx, cy, r, ang(s0), ang(s1))}" fill="none" stroke="var(--b-faint)" stroke-width="2" stroke-linecap="round" opacity=".8"/>`;
  }
  let eN = ''; let eP = '';
  for (const p of ord) for (const par of p.parent) {
    const q = byId.get(par); if (!q) continue;
    const r1 = R.get(q.branch); const r2 = R.get(p.branch); const a1 = ang(idx.get(q.id)); const a2 = ang(idx.get(p.id));
    const d = hug(r1, a1, r2, a2, cx, cy);
    if (onPath.has(p.id) && onPath.has(par)) eP += `<path d="${d}" fill="none" stroke="var(--b-ink)" stroke-width="2.6" stroke-linecap="round"/>`;
    else eN += `<path d="${d}" fill="none" stroke="var(--b-faint)" stroke-width=".9" opacity=".7"/>`;
  }
  const nodes = ord.map(p => { const [x, y] = pos(p); return node(p.status, x.toFixed(1), y.toFixed(1), { r: 2.8, path: onPath.has(p.id), sel: p.id === SEL }); }).join('');
  let nums = '';
  PATH.forEach((id, k) => {
    const p = byId.get(id); const a = ang(idx.get(id));
    const [x1, y1] = polar(cx, cy, R.get(p.branch) + 5, a); const [x2, y2] = polar(cx, cy, rOut + 12, a); const [lx, ly] = polar(cx, cy, rOut + 22, a);
    nums += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="var(--b-faint)" stroke-width="1" stroke-dasharray="1.5 3.5" fill="none"/><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="11" font-weight="500" fill="var(--b-ink)">${k + 1}</text>`;
  });
  const centre = `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="26" font-weight="300" fill="var(--b-ink)">${posts.length}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="10.5" fill="var(--b-muted)">posts</text>`;
  const list = PATH.map((id, k) => { const p = byId.get(id); return `<div class="nr ${id === SEL ? 'on' : ''}"><i>${k + 1}</i><span>${p.title}</span><span class="dt">${dl(p.date)}</span></div>`; }).join('');
  const body = `${pageHead('timeline', `${posts.length} posts · ${nb} rings`)}
    <div style="height:318px"></div>
    <div ${co(2)}>${viewSeg(true)}</div>
    <div class="lab-mono">the chosen path, 1 to ${PATH.length}</div>
    <div class="nl" ${co(3)}>${list}</div>`;
  return `<div class="frame tall phone touch">${phHdr()}<div class="pg">${body}</div>
    <svg class="stage-svg" width="390" height="560" aria-hidden="true" style="top:108px">${tracks}${eN}${eP}${nodes}${nums}${centre}</svg>
    <div class="abs" style="left:18px;right:18px;top:690px"></div></div>`;
}

/* =============================================================== option 3: one spine ring, side branches folded into badges */
export function tl3(phone) {
  const W = phone ? 390 : 1440;
  const cx = phone ? 195 : 600; const cy = phone ? 300 : 520; const rS = phone ? 118 : 250;
  const n = PATH.length;
  const aOf = k => -145 + 290 * (k / (n - 1));
  const POPEN = 'brain-v2-themes';
  const open = attachedTo.get(POPEN);
  let arcs = `<path d="${arcPath(cx, cy, rS, -145, 145)}" fill="none" stroke="var(--b-track)" stroke-width="3"/>`;
  PATH.slice(1).forEach((id, i) => {
    const last = i === n - 2;
    arcs += `<path d="${arcPath(cx, cy, rS, aOf(i) + 2.5, aOf(i + 1) - 2.5)}" fill="none" stroke="${last ? 'var(--b-fill-live)' : 'var(--b-fill)'}" stroke-width="${last ? 8 : 6}" stroke-linecap="round"/>`;
  });
  let nodes = ''; let labs = ''; let badges = '';
  PATH.forEach((id, k) => {
    const p = byId.get(id); const a = aOf(k);
    const [x, y] = polar(cx, cy, rS, a);
    nodes += node(p.status, x.toFixed(1), y.toFixed(1), { r: phone ? 6 : 8, path: false, sel: id === SEL });
    if (phone) {
      const [lx, ly] = polar(cx, cy, rS + 22, a);
      labs += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="11" font-weight="500" fill="var(--b-ink)">${k + 1}</text>`;
    } else {
      const [lx, ly] = polar(cx, cy, rS + 34, a);
      const anchor = lx < cx - 24 ? 'end' : lx > cx + 24 ? 'start' : 'middle';
      const mk = p.status === 'built' ? '✦ built' : p.status === 'chosen' ? '✓ chosen' : p.status === 'exploring' ? '○ exploring' : p.status;
      const mc = p.status === 'built' ? 'var(--b-good)' : 'var(--b-muted)';
      labs += `<text x="${lx.toFixed(1)}" y="${(ly - 14).toFixed(1)}" text-anchor="${anchor}" font-family="var(--b-font-mono)" font-size="10.5" fill="var(--b-muted)">${short(id)}</text>
        <text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="${anchor}" font-family="var(--b-font-sans)" font-size="16" font-weight="500" fill="var(--b-ink)">${dl(p.date)}</text>
        <text x="${lx.toFixed(1)}" y="${(ly + 18).toFixed(1)}" text-anchor="${anchor}" font-family="var(--b-font-mono)" font-size="10.5" fill="${mc}">${mk}</text>`;
    }
    const m = attachedTo.get(id).length;
    if (m && id !== POPEN) {
      const [bx, by] = polar(cx, cy, rS - (phone ? 22 : 34), a);
      badges += `<g><rect x="${(bx - 17).toFixed(1)}" y="${(by - 10).toFixed(1)}" width="34" height="20" rx="10" fill="var(--b-surface-2)" stroke="var(--b-hairline)"/><text x="${bx.toFixed(1)}" y="${(by + 4).toFixed(1)}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="11" font-weight="500" fill="var(--b-ink)">+${m}</text></g>`;
    }
  });
  // the expanded cluster: an inner arc of satellites around one path node, numbered
  const k0 = PATH.indexOf(POPEN); const a0 = aOf(k0);
  const rC = rS - (phone ? 40 : 66);
  const spread = phone ? 46 : 50;
  let sat = `<path d="${arcPath(cx, cy, rC, a0 - spread / 2 - 3, a0 + spread / 2 + 3)}" fill="none" stroke="var(--b-track)" stroke-width="1.4"/>`;
  const [px, py] = polar(cx, cy, rS - 8, a0); const [qx, qy] = polar(cx, cy, rC + 4, a0);
  sat += `<path d="M${px.toFixed(1)} ${py.toFixed(1)}L${qx.toFixed(1)} ${qy.toFixed(1)}" stroke="var(--b-faint)" stroke-width="1.4" stroke-dasharray="1.5 4" stroke-linecap="round"/>`;
  open.forEach((p, i) => {
    const a = a0 - spread / 2 + spread * (open.length === 1 ? 0.5 : i / (open.length - 1));
    const [x, y] = polar(cx, cy, rC, a); const [lx, ly] = polar(cx, cy, rC - (phone ? 12 : 15) - (i % 2) * (phone ? 8 : 11), a);
    sat += node(p.status, x.toFixed(1), y.toFixed(1), { r: phone ? 3.2 : 4.4 });
    sat += `<text x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(1)}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="${phone ? 9 : 10}" fill="var(--b-muted)">${i + 1}</text>`;
  });
  const sp = byId.get(SEL);
  const centre = phone ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="26" font-weight="300" fill="var(--b-ink)">${n}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="10.5" fill="var(--b-muted)">on the path</text>`
    : `<foreignObject x="${cx - 100}" y="${cy - 82}" width="200" height="190"><div xmlns="http://www.w3.org/1999/xhtml" style="display:grid;gap:6px;justify-items:center"><div class="c2" style="width:190px;aspect-ratio:16/10"><img src="${thumbs(sp, 1)[0]}" alt=""></div><div class="lab-mono" style="color:var(--b-accent-text)">${short(SEL)}</div><div style="font-size:13px;color:var(--b-ink);text-align:center;line-height:1.3;width:170px">${sp.decision.slice(0, 40)}</div></div></foreignObject>`;
  const rootsBadge = (() => { const [bx, by] = polar(cx, cy, rS + (phone ? 40 : 76), -158); return phone ? '' : `<g><rect x="${(bx - 40).toFixed(1)}" y="${(by - 11).toFixed(1)}" width="84" height="22" rx="11" fill="var(--b-surface-2)" stroke="var(--b-hairline)"/><text x="${(bx + 2).toFixed(1)}" y="${(by + 4).toFixed(1)}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="11" fill="var(--b-ink)">+${roots.length} roots</text></g>`; })();
  const svgH = phone ? 560 : 900;
  const svg = `<svg class="stage-svg" width="${W}" height="${svgH}" aria-hidden="true" ${phone ? 'style="top:108px"' : ''}>${arcs}${sat}${badges}${nodes}${labs}${rootsBadge}${centre}</svg>`;
  if (phone) {
    const list = PATH.map((id, k) => { const p = byId.get(id); const m = attachedTo.get(id).length; return `<div class="nr ${id === SEL ? 'on' : ''}"><i>${k + 1}</i><span>${p.title}</span><span class="dt">${m ? '+' + m + ' · ' : ''}${dl(p.date)}</span></div>`; }).join('');
    const body = `${pageHead('timeline', `${n} on the path · ${side().length} branches folded in`)}
      <div style="height:336px"></div>
      <div ${co(2)}>${UI.seg('view', ['path', 'all posts'], 0).replace('class="seg"', 'class="seg" data-full')}</div>
      <div class="nl" ${co(3)}>${list}</div>
      <div class="lab-mono" ${co(4)}>open: ${short(POPEN)}, ${open.length} posts</div>`;
    return `<div class="frame tall phone touch">${phHdr()}<div class="pg">${body}</div>${svg}</div>`;
  }
  const rows = open.slice(0, 9).map((p, i) => `<div class="nr"><i>${i + 1}</i><span>${p.title}</span><span class="dt">${p.branch}</span></div>`).join('');
  const rail = abs('left:1040px;top:112px;width:360px;z-index:3;display:grid;gap:16px', `<div class="row" style="gap:10px">${sbadge(sp.status)}${btag(sp.branch, true)}<span class="sub-m">${dl(sp.date)}</span></div>
    <div style="font:600 22px/1.2 var(--b-font-sans)">${short(POPEN)}</div>
    <div class="sub-m" ${co(3)}>${open.length} posts hang from here, in ${new Set(open.map(p => p.branch)).size} branches</div>
    <div class="nl">${rows}</div><div class="sub-m">… +${open.length - 9} more</div>
    <div class="row" style="gap:8px">${primary('open post', key('enter', 'm'), 5, 'btn--l')}${textBtn('collapse')}</div>
    <div ${co(2)}>${UI.seg('view', ['path', 'all posts'], 0).replace('class="seg"', 'class="seg" data-full')}</div>`);
  const [ax, ay] = polar(cx, cy, rS, aOf(7)); const [bx6, by6] = polar(cx, cy, rS - 34, aOf(PATH.indexOf('widget-inventory')));
  const anch = anchor(1, ax + 6, ay - 6) + anchor(6, bx6 + 12, by6 - 4);
  return `<div class="frame">${header({ active: '' })}${anch}${abs('left:48px;top:80px;width:330px;z-index:3', pageHead('timeline', `${n} posts on the path<br>${side().length} more folded into badges`))}${svg}${rail}
    ${abs('left:48px;bottom:16px;z-index:4', kbar(kbi(key('←') + key('→'), 'step'), kbi(key('enter'), 'open'), kbi(key('space'), 'expand')))}
    ${abs('right:48px;bottom:18px;z-index:7', toast('expanded ' + short(POPEN), 'collapse', 4))}</div>`;
}
const side = () => posts.filter(p => !onPath.has(p.id));
void attach;
