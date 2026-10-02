/* global document, window */
// W-21 prototypes: one token model, three presentations. ?opt=1|2|3 &view=... &theme=dark|light
import { q, mount, theme, cubeSVG, header, arcPath, polar } from '../../_proto/common.js';

const opt = ['1', '2', '3'].includes(q.get('opt')) ? q.get('opt') : '1';
const view = q.get('view') || 'states';
const boardId = q.get('id') || 'W-21';
const NAMES = { 1: 'labels on the Orbit', 2: 'a tape under the cube', 3: 'a wrapped sequence' };

/* ------------------------------------------------------------------ data */
const SCR = "D2 F2 U′ B2 R2 U2 F2 U′ L2 D′ B′ L′ U F′ R′ D2 R U′ F2 L′".split(' ');
const LONG = (() => { const faces = 'UDFBRL'; let s = 7; let last = ''; const out = []; for (let i = 0; i < 45; i += 1) { s = (s * 31 + 17) % 97; let f = faces[s % 6]; if (f === last) f = faces[(s + 1) % 6]; last = f; out.push(f + ['', '′', '2'][(s >> 3) % 3]); } return out; })();
const TPERM = "R U R′ U′ R′ F R2 U′ R′ U′ R U R′ F′".split(' ');
const TSECS = [{ from: 0, to: 3, name: 'sexy move' }, { from: 4, to: 9, name: '' }, { from: 10, to: 13, name: '' }];

const FACE = { U: 'top', D: 'bottom', F: 'front', B: 'back', R: 'right', L: 'left' };
const desc = (m) => `${FACE[m[0]]} face, ${m[1] === '′' ? 'counter-clockwise' : m[1] === '2' ? 'a half turn' : 'clockwise'}`;
const inv = (m) => (m[1] === '2' ? m : m[1] === '′' ? m[0] : `${m[0]}′`);

const UNDO = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5h6.2a3.3 3.3 0 0 1 0 6.6H5M5.8 3.5L2.8 6.5l3 3"/></svg>';
const BANG = '<svg class="bang" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 4v3.6M7 9.6v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

/** items: {m, st: done|cur|next|wrong|undo|ucur, sec: index | 'u' | -1, count: bool} */
function build({ moves, cur, sections = [], undo = [], wrong = '' }) {
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
const nameOf = (M, sec) => (sec === 'u' ? 'undo' : M.sections[sec] ? M.sections[sec].name : '');

/* ------------------------------------------------------------------ token + runs */
const tok = (it, { tag = 'span', extra = '', cls = '', style = '' } = {}) => {
  const lbl = `${it.m}, ${it.st}`;
  const inner = `${it.st === 'ucur' ? UNDO : ''}${it.st === 'wrong' ? BANG : ''}<span class="t">${it.m}</span>`;
  const state = it.state ? ` ${it.state}` : '';
  const dis = it.state && it.state.includes('is-disabled') && tag === 'button' ? ' disabled' : '';
  return `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="mv is-${it.st}${state}${cls ? ` ${cls}` : ''}" ${it.st === 'cur' || it.st === 'ucur' ? 'aria-current="step"' : ''} aria-label="${lbl}" ${it.co ? `data-co="${it.co}"` : ''} ${extra}${dis} ${style ? `style="${style}"` : ''}>${inner}</${tag}>`;
};
/** consecutive items of one section are wrapped; names become data-name (+ a .nm for the paragraph form). */
function runs(M, items, o = {}) {
  let out = ''; let i = 0;
  while (i < items.length) {
    const s = items[i].sec;
    if (s === -1) { out += tok(items[i], o); i += 1; continue; }
    let j = i; while (j < items.length && items[j].sec === s) j += 1;
    const nm = nameOf(M, s);
    out += `<span class="sec ${s === 'u' ? 'u' : ''}" ${nm ? `data-name="${nm}"` : ''}>${nm ? `<span class="nm">${nm}</span>` : ''}${items.slice(i, j).map((x) => tok(x, o)).join('')}</span>`;
    i = j;
  }
  return out;
}
/** window of the sequence around the current move for long scrambles. */
function windowOf(M, cap) {
  const counted = M.items.filter((x) => x.count);
  if (counted.length <= cap) return { items: M.items, before: 0, after: 0 };
  const lo = Math.max(0, Math.min(M.at - Math.round(cap * 0.3), counted.length - cap));
  const hi = lo + cap;
  const first = counted[lo]; const last = counted[hi - 1];
  const a = M.items.indexOf(first); const b = M.items.indexOf(last);
  return { items: M.items.slice(a, b + 1), before: lo, after: counted.length - hi };
}

/* ------------------------------------------------------------------ the ring (a simplified Orbit: open, 290 degrees, grows) */
function layout(M, gs, gsec) {
  const C = M.items.filter((x) => x.count); const n = C.length; const gaps = [];
  for (let i = 1; i < n; i += 1) { const a = C[i - 1].sec; const b = C[i].sec; gaps.push(a !== b && (a !== -1 || b !== -1) ? gsec : gs); }
  const w = (290 - gaps.reduce((s, x) => s + x, 0)) / n; let a = -145;
  return C.map((it, i) => { const s = { it, a0: a, a1: a + w, mid: a + w / 2 }; a += w + (gaps[i] || 0); return s; });
}
function ringHtml(M, { W, H, cx, cy, r, labels, win = 24, Rl, names, gs = 2.4, gsec = 7, small = false }) {
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
  // sections: a bracket outside the ring (only where a label is shown); gaps in the ring are the cue everywhere
  if (labels) {
    const secIds = [...new Set(segs.map((s) => s.it.sec).filter((x) => x !== -1))];
    for (const id of secIds) {
      const g = segs.filter((s) => s.it.sec === id); const a0 = g[0].a0 - 0.6; const a1 = g[g.length - 1].a1 + 0.6; const Rb = r + Rl + 20;
      const col = id === 'u' ? 'var(--b-warn)' : 'var(--b-muted)';
      const [x0, y0] = polar(cx, cy, Rb, a0); const [x0i, y0i] = polar(cx, cy, Rb - 7, a0);
      const [x1, y1] = polar(cx, cy, Rb, a1); const [x1i, y1i] = polar(cx, cy, Rb - 7, a1);
      svg += `<path d="M${x0i.toFixed(1)} ${y0i.toFixed(1)}L${x0.toFixed(1)} ${y0.toFixed(1)}A${Rb} ${Rb} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}L${x1i.toFixed(1)} ${y1i.toFixed(1)}" fill="none" stroke="${col}" stroke-width="1.5" opacity=".75" stroke-linejoin="round"/>`;
      const nm = nameOf(M, id);
      if (nm && names && id !== 'u') { const mid = (a0 + a1) / 2; const [tx, ty] = polar(cx, cy, Rb + 14 + 34 * Math.abs(Math.sin(mid * Math.PI / 180)), mid); html += `<div class="abs tag" style="left:${tx}px;top:${ty}px;transform:translate(-50%,-50%);color:${col};white-space:nowrap">${nm}</div>`; }
    }
  }
  if (labels) {
    const lo = n <= win ? 0 : Math.max(0, Math.min(M.at - Math.round(win * 0.3), n - win));
    const hi = n <= win ? n : lo + win;
    segs.forEach((s, i) => {
      if (i < lo || i >= hi) return;
      const [x, y] = polar(cx, cy, r + Rl, s.mid);
      const edge = n > win && (i === lo || i === hi - 1) ? 'opacity:.45;' : n > win && (i === lo + 1 || i === hi - 2) ? 'opacity:.75;' : '';
      html += tok(s.it, { cls: 'lab', style: `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;${edge}`, extra: s.it.st === 'cur' ? 'data-co-target="cur"' : '' });
    });
  }
  return { svg: `<svg class="stage-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${svg}</svg>`, html, segs };
}

/* ------------------------------------------------------------------ frames */
const co = (n) => `data-co="${n}"`;
const mk = (x, y, n) => `<i class="abs" data-co="${n}" style="left:${x}px;top:${y}px;width:1px;height:1px"></i>`;
const bigText = (m) => (m[1] === '′' ? `<span>${m[0]}<span class="pr">′</span></span>` : `<span>${m}</span>`);
/** copy of a model with numbered callouts: spec = {<counted index | 'wrong' | 'cur'>: n}. */
function withCo(M, spec = {}) {
  const items = M.items.map((x) => ({ ...x }));
  const counted = items.filter((x) => x.count);
  for (const [k, n] of Object.entries(spec)) {
    const t = k === 'wrong' ? items.find((x) => x.st === 'wrong') : k === 'cur' ? items.find((x) => x.st === 'cur' || x.st === 'ucur') : counted[Number(k)];
    if (t) t.co = n;
  }
  return { ...M, items };
}
const keybar = (extra = '') => `<span><kbd>esc</kbd>stop</span><span><kbd>n</kbd>new scramble</span>${extra}`;

function centreDesktop(M, { opt, wrong, nextMove, bigCo, posCo }) {
  const c = M.items.find((x) => x.st === 'cur' || x.st === 'ucur');
  const u = c.st === 'ucur';
  const o2 = opt === '2';
  const top = o2 ? 650 : 682;
  return `<div class="big ${u ? 'warn' : ''}" style="top:${top}px;--big:${o2 ? 72 : 92}px">${u ? UNDO.replace('width="15" height="15"', 'width="34" height="34"') : ''}${bigText(c.m)}</div>
    ${bigCo ? mk(o2 ? 790 : 800, top + 22, bigCo) : ''}${posCo ? mk(925, (o2 ? 764 : 836) + 6, posCo) : ''}
    <div class="cap ${u ? 'warn' : ''}" style="top:${o2 ? 738 : 800}px;font-size:${o2 ? 16 : 18}px">${u ? `you turned ${wrong}, turn ${c.m} to undo it` : desc(c.m)}</div>
    <div class="pos" style="top:${o2 ? 764 : u ? 834 : 836}px">${u ? `then carry on with ${nextMove} · ` : ''}move ${M.at + 1} of ${M.total}${u ? ` (+${M.undoN} undo)` : ''}</div>`;
}

function desktopFrame(M0, { o = opt, wrong = '', nextMove = '', titleHtml = '', key = keybar(), foot = 'guided · follow the lit face', name = true, cap = 24, c = {} } = {}) {
  const M = withCo(M0, c.items || {});
  const cx = 720, cy = 440, r = 300;
  const labels = o === '1';
  const R = ringHtml(M, { W: 1440, H: 900, cx, cy, r, labels, Rl: 30, names: name, win: cap });
  let region = '';
  if (o === '2') {
    const W = windowOf(M, 22);
    region = `<div class="tape ${W.before || W.after ? 'roll' : ''}" style="top:792px">${W.before ? `<span class="more">‹ ${W.before}</span>` : ''}${runs(M, W.items)}${W.after ? `<span class="more">${W.after} ›</span>` : ''}</div>`;
  } else if (o === '3') {
    const roll = M.total > 24;
    region = `<div class="abs" style="left:48px;top:150px;width:330px">${titleHtml === '-' ? '' : `<div class="tag" style="margin-bottom:6px">${titleHtml || 'scramble'} · ${M.total} moves</div>`}</div>
      <div class="para ${roll ? 'roll' : ''}" style="left:40px;top:176px;width:340px;height:${roll ? 330 : 270}px"><div class="para-in">${runs(M, M.items)}</div></div>`;
  }
  const glow = `<div class="glow" style="left:520px;top:575px;width:400px;height:190px"></div>`;
  return `<div class="o${o}"><div class="frame">
    ${header()}
    ${glow}${R.svg}
    <svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(cx, cy, 215)}</svg>
    ${R.html}${region}${(c.marks || []).map(([x, y, n]) => mk(x, y, n)).join('')}${c.ring ? mk(...polar(720, 440, 300, c.ring.ang).map(Math.round), c.ring.n) : ''}
    ${centreDesktop(M, { opt: o, wrong, nextMove, bigCo: c.big, posCo: c.pos })}
    <div class="abs" style="left:48px;bottom:16px"><div class="keybar">${key}</div></div>
    <div class="foot-r">${foot}</div>
  </div></div>`;
}

function phoneFrame(M0, { o = opt, wrong = '', nextMove = '', c = {} } = {}) {
  const M = withCo(M0, c.items || {});
  const cx = 195, cy = 262, r = 138;
  const labels = o === '1';
  const R = ringHtml(M, { W: 390, H: 844, cx, cy, r, labels, Rl: 25, names: false, win: 24, gs: 2.8, gsec: 7 });
  const cur = M.items.find((x) => x.st === 'cur' || x.st === 'ucur'); const u = cur.st === 'ucur';
  let region = '';
  if (o === '2') {
    const W = windowOf(M, M.undoN ? 7 : 9);
    region = `<div class="tape ${W.before || W.after ? 'roll' : ''}" style="top:612px">${W.before ? `<span class="more">‹ ${W.before}</span>` : ''}${runs(M, W.items)}${W.after ? `<span class="more">${W.after} ›</span>` : ''}</div>`;
  } else if (o === '3') {
    region = `<div class="para" style="left:24px;top:578px;width:342px;height:196px"><div class="para-in">${runs(M, M.items)}</div></div>`;
  }
  return `<div class="o${o}"><div class="frame phone touch" style="width:390px;height:844px">
    <div class="hdr"><span class="word" style="font-size:17px;margin:0">cubesight</span><span class="chip-cube" style="font-size:11px"><i class="dot"></i>GAN 356 i3</span></div>
    <div class="glow" style="left:95px;top:340px;width:200px;height:110px"></div>${R.svg}
    <svg class="stage-svg" width="390" height="844" aria-hidden="true">${cubeSVG(cx, cy + 6, 98)}</svg>
    ${R.html}
    <div class="big ${u ? 'warn' : ''}" style="top:${o === '1' ? 462 : 452}px;--big:56px">${u ? UNDO.replace('width="15" height="15"', 'width="24" height="24"') : ''}${bigText(cur.m)}</div>
    <div class="cap ${u ? 'warn' : ''}" style="top:${o === '1' ? 530 : 520}px;font-size:15px">${u ? `you turned ${wrong}, undo it` : desc(cur.m)}</div>
    <div class="pos" style="top:${o === '1' ? 556 : 546}px">${u ? `then ${nextMove} · ` : ''}move ${M.at + 1} of ${M.total}</div>
    ${region}${(c.marks || []).map(([x, y, n]) => mk(x, y, n)).join('')}
    <div class="abs" style="left:0;right:0;bottom:30px;text-align:center;font-size:15px;color:var(--b-muted)">stop</div>
  </div></div>`;
}

/* ------------------------------------------------------------------ scenes */
const CUR = 12; // U, move 13 of 20 (A-02)
const MID = build({ moves: SCR, cur: CUR });
const WRONG = build({ moves: SCR, cur: CUR + 1, undo: ['L′'], wrong: 'L' });
const ALG = (k) => build({ moves: TPERM, cur: k, sections: TSECS });
const LNG = build({ moves: LONG, cur: 22 });

const LEG = {
  solve: {
    1: ['<b>The A-02 look.</b> Every move of the scramble is a label on the Orbit: done dim, upcoming bright, so the ring itself is the strip. Nothing is added to the screen.',
      '<b>The current move</b> is an outlined teal pill at the end of the filled arc, as in A-02.',
      '<b>Lookahead:</b> all 20 labels are readable at once, 7 of them after the current one. The ring holds about 24 labels; longer sequences roll a window (see the long image).',
      '<b>The big move</b> in the centre says the same thing for the glance: move, face, direction.'],
    2: ['<b>One tape under the cube.</b> The whole scramble in one row: done dim, upcoming boxed and readable, the current move a large teal box.',
      '<b>The Orbit stays clean:</b> only arcs (done thick, upcoming thin), so ring and tape show the same position without repeating the letters.',
      '<b>Lookahead:</b> all 20 fit on a 1440 px screen; beyond about 22 the tape rolls with faded ends and a count.',
      '<b>It reads like a line of text,</b> left to right, which is how a scramble is read on paper.',
      '<b>The big move</b> is smaller here (72 px) to leave room for the tape.'],
    3: ['<b>A block of text beside the cube.</b> The scramble wraps like the words of a typing test: done dim, upcoming readable, the current move highlighted.',
      '<b>The Orbit stays clean</b> (arcs only); the block sits in the left rail, the slot the coach line uses on the results frame.',
      '<b>Lookahead:</b> 20 moves in 3 lines; a long scramble becomes a rolling window of lines with the current line near the top third.',
      '<b>It reads like a paragraph,</b> so several rows can be taken in at one glance; it is the furthest from the cube.',
      '<b>The big move</b> keeps the A-02 size.'],
  },
  wrong: {
    1: ['<b>The undo move is inserted on the ring</b> as an amber pill with a return arrow, and the ring has one more segment (21 now).',
      '<b>The planned move</b> (F′) moves one place on and waits, unchanged and bright.',
      '<b>Amber is not an error red:</b> the return arrow and the words carry the meaning, the pill stays calm.',
      '<b>The centre says what happened</b> and how to fix it; the count shows +1 undo.'],
    2: ['<b>The undo move is inserted in the tape</b> as an amber box with a return arrow, inside a small bracket named undo; the tape makes room and the ring gains a segment.',
      '<b>The wrong turn</b> (L) stays visible as an outlined amber box with a ! so the user can see what they did.',
      '<b>The planned move</b> (F′) waits after the bracket, unchanged.',
      '<b>The centre says what happened</b> and how to fix it; the count shows +1 undo.'],
    3: ['<b>The undo move is inserted in the text</b> as an amber highlight with a return arrow, in its own parentheses named undo; the ring gains a segment.',
      '<b>The wrong turn</b> (L) stays visible as a amber word with a ! so the user can see what they did.',
      '<b>The planned move</b> (F′) waits after the parentheses, unchanged.',
      '<b>The centre says what happened</b> and how to fix it; the count shows +1 undo.'],
  },
};
const COSOLVE = {
  1: { items: { 3: 1, cur: 2, 19: 3 }, big: 4 },
  2: { items: { 1: 1, 19: 3, 9: 4 }, ring: { ang: -62, n: 2 }, big: 5 },
  3: { items: { 2: 1, 19: 3, 14: 4 }, ring: { ang: -62, n: 2 }, big: 5 },
};
const COWRONG = {
  1: { items: { cur: 1, 14: 2 }, big: 3, pos: 4 },
  2: { items: { cur: 1, wrong: 2, 14: 3 }, pos: 4 },
  3: { items: { cur: 1, wrong: 2, 14: 3 }, pos: 4 },
};

function solveBoard(which) {
  const M = which === 'wrong' ? WRONG : MID;
  const c = (which === 'wrong' ? COWRONG : COSOLVE)[opt];
  const frame = desktopFrame(M, { c, ...(which === 'wrong' ? { wrong: 'L', nextMove: 'F′' } : {}) });
  mount({ id: boardId, name: `option ${opt}: ${NAMES[opt]} (${which === 'wrong' ? 'wrong turn, the Orbit grows' : 'mid scramble, A-02'})`, frame, legend: LEG[which][opt], cols: 1 });
}

function phoneBoard() {
  const spec = {
    1: [{ items: { 3: 1, cur: 2 } }, { items: { cur: 3, 20: 4 } }],
    2: [{ items: { 2: 1 }, marks: [[70, 596, 2]] }, { items: { cur: 3, 14: 4 } }],
    3: [{ items: { 2: 1, cur: 2 } }, { items: { cur: 3 }, marks: [[195, 470, 4]] }],
  }[opt];
  const a = phoneFrame(MID, { c: spec[0] }); const b = phoneFrame(WRONG, { wrong: 'L', nextMove: 'F′', c: spec[1] });
  const frame = `<div style="display:flex;gap:56px;justify-content:center;padding:26px 0 8px;align-items:flex-start"><div><div class="tag" style="margin-bottom:8px">mid scramble</div>${a}</div><div><div class="tag" style="margin-bottom:8px">wrong turn, undo inserted</div>${b}</div></div>`;
  const L = {
    1: ['<b>The ring labels again,</b> in 15 px mono around a 138 px ring: 20 labels about 40 px apart, all readable; no extra element, so the screen stays as A-09.',
      '<b>The current move</b> keeps its pill; the big move and the face under the cube are 56 px.',
      '<b>Undo:</b> the amber pill is inserted, the ring gets one more segment (21) and the labels move over one slot.',
      '<b>Touch:</b> the labels are read-only; a 26 px label is under the 40 px touch minimum, so it must not be a button here.'],
    2: ['<b>The tape holds 9 moves</b> on a 390 px phone (3 done, the current, 5 upcoming): a shorter lookahead than on desktop. The ring still shows the position in the whole.',
      '<b>Faded ends and counts</b> (‹ 9, 2 ›) say how much more there is on each side.',
      '<b>Undo:</b> the amber box and its bracket join the tape and the window shifts; it holds 7 here; the ring gets one more segment.',
      '<b>Touch:</b> boxes are 32 x 36 px (the current 44 x 46); read-only during a scramble, 40 px or more where they are buttons.'],
    3: ['<b>The block sits under the cube:</b> 20 moves in 3 lines, so the whole scramble stays readable, which the 9-move window of option 2 cannot do on a phone.',
      '<b>The highlight</b> follows the current move; a section never breaks across a line.',
      '<b>Undo:</b> an amber highlight in its own parentheses; the following moves reflow by one slot.',
      '<b>Cost:</b> the block needs about 150 px of height, so the cube is smaller (98 px edge) than in A-09.'],
  };
  mount({ id: boardId, name: `option ${opt}: ${NAMES[opt]} on a phone (390 x 844)`, frame, legend: L[opt], cols: 1, width: 920 });
}

function algBoard() {
  const M = ALG(5);
  const c = { 1: { items: { cur: 2 }, marks: [[372, 616, 1], [1032, 300, 3]] }, 2: { items: { cur: 2 }, marks: [[470, 926, 1]], ring: { ang: -63, n: 3 } }, 3: { items: {}, marks: [[336, 258, 1], [336, 304, 2], [336, 350, 3]] } }[opt];
  const frame = desktopFrame(M, { c, key: `<span><kbd>space</kbd>pause</span><span><kbd>[</kbd><kbd>]</kbd>step</span>`, foot: 'playing · T-perm', titleHtml: '-', name: true })
    .replace(`<div class="o${opt}"><div class="frame">`, `<div class="o${opt}"><div class="frame"><div class="abs" style="left:48px;top:96px"><div style="font-size:22px;font-weight:600">T-perm</div><div class="tag" style="margin-top:4px">PLL · 14 moves</div></div>`);
  const L = {
    1: ['<b>Sections on the ring:</b> a bigger gap between sections and a hairline bracket outside the labels; <b>sexy move</b> is named, the other two are not (the name is optional).',
      '<b>Playback:</b> the current move (F, 6 of 14) is the pill; the filled arc is what has been played.',
      '<b>Notation:</b> the three brackets are the three parentheses of (R U R′ U′) (R′ F R2 U′ R′ U′) (R U R′ F′).'],
    2: ['<b>Sections in the tape:</b> a bracket under each group and a wider gap; the name sits under its bracket and is optional.',
      '<b>Playback:</b> the current box (F) is large; every box is a button that jumps to that move (see the states).',
      '<b>The Orbit</b> shows the same gaps between its arcs, so ring and tape agree.'],
    3: ['<b>Sections as parentheses,</b> exactly as the algorithm is written; the name is a small caption above its open parenthesis.',
      '<b>Playback:</b> the current word (F) is highlighted; every word is a button to jump to that move.',
      '<b>The text can be copied</b> as the notation, which neither the ring nor the tape can offer.'],
  };
  mount({ id: boardId, name: `option ${opt}: ${NAMES[opt]} (alg playback, T-perm with sections)`, frame, legend: L[opt], cols: 1 });
}

function longBoard() {
  const c = { 1: { items: { cur: 1 }, ring: { ang: 60, n: 2 } }, 2: { items: { cur: 1 }, ring: { ang: -62, n: 2 } }, 3: { items: { cur: 1 }, ring: { ang: -62, n: 2 } } }[opt];
  const frame = desktopFrame(LNG, { cap: 24, name: false, c });
  const L = {
    1: ['<b>A rolling window of labels:</b> the current move keeps its pill; only 24 labels are drawn, 7 done and 16 upcoming, the ends fading.',
      '<b>The ring keeps all 45 segments</b> (the position in the whole). Past about 24 labels (5 degrees each) they would collide, which is where the window starts.'],
    2: ['<b>The tape rolls</b> with the current move near the left third; faded ends and counts (‹ 15, 8 ›) say how much is outside; 22 moves are visible at once.',
      '<b>The ring keeps all 45 arcs</b> as the position in the whole.'],
    3: ['<b>The block rolls by lines:</b> six lines visible, the current line third from the top, faded at both ends, so about 16 moves ahead are readable.',
      '<b>The ring keeps all 45 arcs</b> as the position in the whole.'],
  };
  mount({ id: boardId, name: `option ${opt}: ${NAMES[opt]} (long sequence, 45 moves, rolling window)`, frame, legend: L[opt], cols: 1 });
}

/* ------------------------------------------------------------------ state sheet */
const T = (m, st, extra = {}) => ({ m, st, sec: -1, count: true, ...extra });
const cell = (label, html, c = '') => `<div class="cell" ${c ? co(c) : ''}>${html}<span class="tag">${label}</span></div>`;

function statesBoard() {
  const read = [
    cell('done', tok(T('L′', 'done'))), cell('current', tok(T('U', 'cur')), 1), cell('upcoming', tok(T('F′', 'next'))),
    cell('wrong turn', tok(T('L', 'wrong')), 2), cell('undo, queued', tok(T('D′', 'undo'))), cell('undo, current', tok(T('L′', 'ucur')), 2),
    cell('disabled', tok(T('R2', 'next', { state: 'is-disabled' }))),
  ].join('');
  const btn = [
    cell('default', tok(T('R′', 'next'), { tag: 'button' })), cell('hover', tok(T('R′', 'next', { state: 'is-hover' }), { tag: 'button' })),
    cell('focus-visible', tok(T('R′', 'next', { state: 'is-focus' }), { tag: 'button' }), 5), cell('pressed', tok(T('R′', 'next', { state: 'is-active' }), { tag: 'button' })),
    cell('current + focus', tok(T('U', 'cur', { state: 'is-focus' }), { tag: 'button' })), cell('done, hover', tok(T('L′', 'done', { state: 'is-hover' }), { tag: 'button' })),
    cell('disabled', tok(T('R2', 'next', { state: 'is-disabled' }), { tag: 'button' })),
  ].join('');
  const A = ALG(5);
  const secLabelled = `<div class="cell" ${co(3)}><div style="display:flex;gap:10px;align-items:flex-end;padding-bottom:${opt === '2' ? 20 : 0}px;min-height:${opt === '3' ? 52 : 0}px">${runs({ sections: TSECS, items: A.items }, A.items.slice(0, 4).map((x, i) => ({ ...x, st: 'next', sec: 0 })))}</div><span class="tag">section with a name</span></div>`;
  const secDone = `<div class="cell"><div style="display:flex;gap:10px;align-items:flex-end;padding-bottom:${opt === '2' ? 20 : 0}px;min-height:${opt === '3' ? 52 : 0}px">${runs({ sections: [{ name: '' }], items: [] }, [T('R′', 'done', { sec: 0 }), T('F', 'done', { sec: 0 }), T('R2', 'cur', { sec: 0 }), T('U′', 'next', { sec: 0 })])}</div><span class="tag">section, unnamed, playing</span></div>`;
  const undoGrp = `<div class="cell" ${co(2)}><div style="display:flex;gap:10px;align-items:flex-end;padding-bottom:${opt === '2' ? 20 : 0}px;min-height:${opt === '3' ? 52 : 0}px">${tok(T('L', 'wrong'))}${runs({ sections: [] }, [T('D′', 'ucur', { sec: 'u' }), T('L′', 'undo', { sec: 'u' })])}${tok(T('F′', 'next'))}</div><span class="tag">wrong turn, two undo moves, planned move waits</span></div>`;
  let secRow = `${secLabelled}${secDone}${undoGrp}`;
  if (opt === '1') {
    const snip = (M, w, label, c) => { const R = ringHtml(M, { W: w, H: 270, cx: w / 2, cy: 160, r: 80, labels: true, Rl: 26, names: true, gs: 3, gsec: 9, win: 40 }); return `<div class="cell" ${c ? co(c) : ''}><div style="position:relative;width:${w}px;height:235px">${R.svg.replace('class="stage-svg"', 'style="position:absolute;left:0;top:0"')}${R.html}</div><span class="tag">${label}</span></div>`; };
    const sM = build({ moves: TPERM.slice(0, 8), cur: 5, sections: [{ from: 0, to: 3, name: 'sexy move' }, { from: 4, to: 7, name: '' }] });
    const uM = build({ moves: SCR.slice(9, 15), cur: 3, undo: ['L′', 'D′'], wrong: 'L D' });
    secRow = snip(sM, 400, 'two sections on the ring, one named', 3) + snip(uM, 400, 'wrong turn: two undo moves in an amber bracket', 2);
  }
  const M1 = build({ moves: SCR.slice(0, 8), cur: 4 });
  const M2 = build({ moves: SCR.slice(0, 8), cur: 4, undo: ['B′'], wrong: 'B' });
  const small = (M) => { const R = ringHtml(M, { W: 150, H: 150, cx: 75, cy: 75, r: 60, labels: false, small: true, gs: 5, gsec: 9 }); return `<div style="position:relative;width:150px;height:140px">${R.svg.replace('class="stage-svg"', 'style="position:absolute;left:0;top:0"')}</div>`; };
  const grow = `<div class="rings" ${co(4)}><div class="cell">${small(M1)}<span class="tag">8 moves</span></div><span style="font-size:22px;color:var(--b-muted)">→</span><div class="cell">${small(M2)}<span class="tag">9 after a wrong turn: one segment is inserted</span></div></div>`;
  const rows = [
    ['read-only token', 'in a scramble. 1 current, 2 amber states', `<div class="cells states-row">${read}</div>`],
    ['token as a button', 'alg playback and review: jump to a move. 5 focus-visible', `<div class="cells states-row">${btn}</div>`],
    ['sections', '3 named, optional; the undo group is amber', `<div class="cells states-row">${secRow}</div>`],
    ['the Orbit grows', '4 segment count follows the sequence, calmly (300 to 450 ms)', grow],
  ].map(([h, sm, body]) => `<div class="srow"><div class="rh">${h}<small>${sm}</small></div>${body}</div>`).join('');
  const legend = [
    '<b>Current</b> is the only teal token: pill (1), box (2) or highlight (3); done is faint, upcoming is full ink.',
    '<b>Amber</b> = the wrong turn (outlined, with a !) and the undo moves (return arrow on the current one). Never a filled red, and always with a glyph or word beside the colour.',
    '<b>Section names</b> are optional; an unnamed section is only a gap and a bracket (parentheses in option 3).',
    '<b>Growth:</b> the ring re-divides when moves are inserted; static under reduced motion.',
    '<b>Focus-visible:</b> a 2 px teal outline, 3 px off, the same as the buttons of W-04; only buttons (playback, review) take focus. A scramble in progress is not focusable.',
  ];
  mount({ id: boardId, name: `option ${opt}: ${NAMES[opt]}, states`, frame: `<div class="o${opt}"><div class="sheet" style="width:1440px">${rows}</div></div>`, legend, cols: 1 });
}

/* ------------------------------------------------------------------ mini form */
function miniRow(M, { max, label, meta, rest }) {
  let items = M.items; let more = '';
  if (max) { items = items.slice(0, max); more = `<span class="rest">… +${M.items.length - max}</span>`; }
  return `<div class="lrow"><span class="lname">${label}</span><div class="mini">${runs(M, items)}${rest ? '' : ''}${more}</div><span class="meta">${meta}</span></div>`;
}
function miniBoard() {
  const sections = TSECS;
  const hist = build({ moves: SCR, cur: -1 });
  const alg = build({ moves: TPERM, cur: -1, sections });
  const play = build({ moves: TPERM, cur: 6, sections });
  const det = build({ moves: SCR.slice(8, 20), cur: 4, undo: ['L′'], wrong: 'L' });
  const blocks = ['1', '2', '3'].map((o) => `<div class="o${o}"><h4>option ${o}: ${NAMES[o]}</h4>
    ${miniRow(hist, { max: 12, label: 'solve 23', meta: '14.07' })}
    ${miniRow(alg, { label: 'T-perm', meta: '0:03' })}
    ${miniRow(play, { label: 'T-perm · playing', meta: '7 / 14' })}
    ${miniRow(det, { label: 'review detour', meta: '+1' })}</div>`).join('');
  const legend = [
    '<b>One line of DM Mono 13 px</b> in a list row; the sections are always written with parentheses so the row is copyable notation in every option; the current move is a small highlight, done dim, the amber group is an undo.',
    '<b>Long scrambles</b> truncate with … +8; the full sequence is one click away (the full display).',
  ];
  mount({ id: boardId, name: 'mini form for list rows (history, algs, review)', frame: `<div class="page" style="width:1200px">${blocks}</div>`, legend, cols: 1, width: 1240 });
}

/* ------------------------------------------------------------------ overview */
function compareBoard() {
  const f = ['1', '2', '3'].map((o) => `<div><h4>${o}. ${NAMES[o]}</h4><div class="shrink">${desktopFrame(MID, { o })}</div></div>`).join('');
  const ph = ['1', '2', '3'].map((o) => `<div style="display:flex;justify-content:center"><div class="shrink" style="zoom:.62">${phoneFrame(WRONG, { o, wrong: 'L', nextMove: 'F′' })}</div></div>`).join('');
  mount({
    id: boardId, name: 'the three move displays side by side (desktop, mid scramble; phone, wrong turn)',
    frame: `<div class="cmp">${f}</div><div class="cmp" style="padding-top:0">${ph}</div>`, width: 1960,
    legend: ['<b>1 labels on the Orbit:</b> the A-02 look, nothing added. <b>2 a tape under the cube:</b> one line of boxed moves. <b>3 a wrapped sequence:</b> a block of text in the left rail (under the cube on a phone).'], cols: 1,
  });
}

({ states: statesBoard, solve: () => solveBoard('solve'), wrong: () => solveBoard('wrong'), phone: phoneBoard, alg: algBoard, long: longBoard, mini: miniBoard, compare: compareBoard }[view] || statesBoard)();

/* the paragraph rolls to keep the current line in the third row */
document.fonts.ready.then(() => {
  document.querySelectorAll('.para.roll').forEach((p) => {
    const inn = p.firstElementChild; const c = inn.querySelector('.is-cur,.is-ucur'); if (!c) return;
    inn.style.transform = `translateY(${-(c.getBoundingClientRect().top - inn.getBoundingClientRect().top - 150)}px)`;
  });
});
void theme; void window;
if (q.get('legend') === '0') document.querySelector('.legend')?.remove();
