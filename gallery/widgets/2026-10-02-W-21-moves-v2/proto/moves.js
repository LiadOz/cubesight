/* global document, window */
// W-21 prototypes: one token model, three presentations. ?opt=1|2|3 &view=... &theme=dark|light
import { q, mount, theme, cubeSVG, header, arcPath, polar } from '../../_proto/common.js';

const view = q.get('view') || 'states';
const boardId = q.get('id') || 'W-21';

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
let SIDE = '';
const tok = (it, { tag = 'span', extra = '', cls = '', style = '' } = {}) => {
  const lbl = `${it.m}, ${it.st}`;
  const inner = `${it.st === 'ucur' ? UNDO : ''}${it.st === 'wrong' ? BANG : ''}<span class="t">${it.m}</span>`;
  const state = it.state ? ` ${it.state}` : '';
  const dis = it.state && it.state.includes('is-disabled') && tag === 'button' ? ' disabled' : '';
  return `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="mv is-${it.st}${state}${cls ? ` ${cls}` : ''}" ${it.st === 'cur' || it.st === 'ucur' ? 'aria-current="step"' : ''} aria-label="${lbl}" ${it.co ? `data-co="${it.co}"${SIDE ? ` data-co-side="${SIDE}"` : ''}` : ''} ${extra}${dis} ${style ? `style="${style}"` : ''}>${inner}</${tag}>`;
};
/** A section is ONLY extra space: a token whose section differs from the previous token's gets the class .gp (a wider margin before it).
 *  No wrapper, no bracket, no name: a section may even wrap onto the next line, the space marks where it begins. */
function runs(M, items, o = {}) {
  let out = ''; let prev = null;
  items.forEach((it, i) => {
    const gp = i > 0 && it.sec !== prev && (it.sec !== -1 || prev !== -1);
    out += tok(it, { ...o, cls: `${o.cls || ''}${gp ? ' gp' : ''}`.trim() });
    prev = it.sec;
  });
  return out;
}

/* ------------------------------------------------------------------ the ring (a simplified Orbit: open, 290 degrees, grows) */
/** gaps: normal gap gs between moves of one run, gsec between two different sections (undo group included). */
function layout(M, gs, gsec) {
  const C = M.items.filter((x) => x.count); const n = C.length; const gaps = [];
  for (let i = 1; i < n; i += 1) { const a = C[i - 1].sec; const b = C[i].sec; gaps.push(a !== b && (a !== -1 || b !== -1) ? gsec : gs); }
  const w = (290 - gaps.reduce((s, x) => s + x, 0)) / n; let a = -145;
  return C.map((it, i) => { const s = { it, a0: a, a1: a + w, mid: a + w / 2 }; a += w + (gaps[i] || 0); return s; });
}
function ringHtml(M, { W, H, cx, cy, r, labels, win = 26, Rl, gs = 2.4, gsec = 14, small = false }) {
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
    const lo = n <= win ? 0 : Math.max(0, Math.min(M.at - Math.round(win * 0.3), n - win));
    const hi = n <= win ? n : lo + win;
    const dense = n > 26; // labels closer than their own width: neighbours alternate between two radii
    segs.forEach((s, i) => {
      if (i < lo || i >= hi) return;
      const d = Math.abs(i - M.at); const zig = dense && d > 0 ? [0, 36, 18][d % 3] : 0;
      const [x, y] = polar(cx, cy, r + Rl + zig, s.mid);
      const edge = n > win && (i === lo || i === hi - 1) ? 'opacity:.45;' : n > win && (i === lo + 1 || i === hi - 2) ? 'opacity:.75;' : '';
      html += tok(s.it, { cls: 'lab', style: `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;${edge}`, extra: s.it.st === 'cur' ? 'data-co-target="cur"' : '' });
    });
    if (n > win) {
      const [x0, y0] = polar(cx, cy, r + Rl + 52, segs[lo].mid - 4), [x1, y1] = polar(cx, cy, r + Rl + 52, segs[hi - 1].mid + 4);
      if (lo) html += `<div class="lwin" style="left:${x0.toFixed(0)}px;top:${y0.toFixed(0)}px;transform:translate(-50%,-50%)">‹ ${lo}</div>`;
      if (n - hi) html += `<div class="lwin" style="left:${x1.toFixed(0)}px;top:${y1.toFixed(0)}px;transform:translate(-50%,-50%)">${n - hi} ›</div>`;
    }
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
/** a callout on the gap between ring points: gaps = [[counted index k (gap after k), n]] or ['u', n] (before the undo group) */
function gapMarks(R, cx, cy, r, gaps = []) {
  return gaps.map(([k0, n]) => {
    const k = k0 === 'u' ? R.segs.findIndex((s) => s.it.sec === 'u') - 1 : k0;
    if (k < 0 || !R.segs[k + 1]) return '';
    const a = (R.segs[k].a1 + R.segs[k + 1].a0) / 2; const [x, y] = polar(cx, cy, r - 20, a);
    return mk(Math.round(x), Math.round(y), n);
  }).join('');
}
const keybar = (extra = '') => `<span><kbd>esc</kbd>stop</span><span><kbd>n</kbd>new scramble</span>${extra}`;

function centreDesktop(M, { wrong, nextMove, bigCo, posCo }) {
  const c = M.items.find((x) => x.st === 'cur' || x.st === 'ucur');
  const u = c.st === 'ucur';
  return `<div class="big ${u ? 'warn' : ''}" style="top:682px;--big:92px">${u ? UNDO.replace('width="15" height="15"', 'width="34" height="34"') : ''}${bigText(c.m)}</div>
    ${bigCo ? mk(800, 704, bigCo) : ''}${posCo ? mk(925, 842, posCo) : ''}
    <div class="cap ${u ? 'warn' : ''}" style="top:800px;font-size:18px">${u ? `you turned ${wrong}, ${M.undoN > 1 ? 'undo them in this order' : `turn ${c.m} to undo it`}` : desc(c.m)}</div>
    <div class="pos" style="top:${u ? 834 : 836}px">${u ? `then carry on with ${nextMove} · ` : ''}move ${M.at + 1} of ${M.total}${u ? ` (+${M.undoN} undo)` : ''}</div>`;
}

const TITLE = (t, s) => `<div class="abs" style="left:48px;top:96px"><div style="font-size:22px;font-weight:600">${t}</div><div class="tag" style="margin-top:4px">${s}</div></div>`;

/** DESKTOP = option 1: labels on the Orbit. Sections are wider gaps between Orbit points, nothing else. */
function desktopFrame(M0, { wrong = '', nextMove = '', key = keybar(), foot = 'guided · follow the lit face', cap = 26, c = {}, head = '' } = {}) {
  const M = withCo(M0, c.items || {});
  const cx = 720, cy = 440, r = 300;
  const R = ringHtml(M, { W: 1440, H: 900, cx, cy, r, labels: true, Rl: 30, win: cap });
  const glow = '<div class="glow" style="left:520px;top:575px;width:400px;height:190px"></div>';
  return `<div class="o1"><div class="frame">
    ${header()}${head}
    ${glow}${R.svg}
    <svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(cx, cy, 215)}</svg>
    ${R.html}${(c.marks || []).map(([x, y, n]) => mk(x, y, n)).join('')}${gapMarks(R, cx, cy, r, c.gaps)}
    ${centreDesktop(M, { wrong, nextMove, bigCo: c.big, posCo: c.pos })}
    <div class="abs" style="left:48px;bottom:16px"><div class="keybar">${key}</div></div>
    <div class="foot-r">${foot}</div>
  </div></div>`;
}
const PLAYKEYS = '<span><kbd>space</kbd>pause</span><span><kbd>[</kbd><kbd>]</kbd>step</span>';

/** PHONE = option 3: the wrapped sequence under the cube. Sections = extra spacing, the undo group too. */
function phoneFrame(M0, { wrong = '', nextMove = '', c = {}, roll = false } = {}) {
  const M = withCo(M0, c.items || {});
  const cx = 195, cy = 262, r = 138;
  const R = ringHtml(M, { W: 390, H: 844, cx, cy, r, labels: false, gs: 2.8, gsec: 11 });
  const cur = M.items.find((x) => x.st === 'cur' || x.st === 'ucur'); const u = cur.st === 'ucur';
  SIDE = 'br'; const paraHtml = runs(M, M.items); SIDE = '';
  return `<div class="o3"><div class="frame phone touch" style="width:390px;height:844px">
    <div class="hdr"><span class="word" style="font-size:17px;margin:0">cubesight</span><span class="chip-cube" style="font-size:11px"><i class="dot"></i>GAN 356 i3</span></div>
    <div class="glow" style="left:95px;top:340px;width:200px;height:110px"></div>${R.svg}
    <svg class="stage-svg" width="390" height="844" aria-hidden="true">${cubeSVG(cx, cy + 6, 98)}</svg>
    <div class="big ${u ? 'warn' : ''}" style="top:452px;--big:56px">${u ? UNDO.replace('width="15" height="15"', 'width="24" height="24"') : ''}${bigText(cur.m)}</div>
    <div class="cap ${u ? 'warn' : ''}" style="top:520px;font-size:15px">${u ? `you turned ${wrong}, undo ${M.undoN > 1 ? 'them' : 'it'}` : desc(cur.m)}</div>
    <div class="pos" style="top:546px">${u ? `then ${nextMove} · ` : ''}move ${M.at + 1} of ${M.total}${u ? ` (+${M.undoN} undo)` : ''}</div>
    <div class="para ${roll ? 'roll' : ''}" style="left:24px;top:584px;width:342px;height:196px"><div class="para-in">${paraHtml}</div></div>
    ${(c.marks || []).map(([x, y, n]) => mk(x, y, n)).join('')}
    <div class="abs" style="left:0;right:0;bottom:30px;text-align:center;font-size:15px;color:var(--b-muted)">stop</div>
  </div></div>`;
}

/* ------------------------------------------------------------------ scenes */
const CUR = 12; // U, move 13 of 20 (A-02)
const MID = build({ moves: SCR, cur: CUR });
const WRONG = build({ moves: SCR, cur: CUR + 1, undo: ['L′'], wrong: 'L' });
const WRONG2 = build({ moves: SCR, cur: CUR + 1, undo: ['D′', 'L′'], wrong: 'L D' });
const ALG = (k) => build({ moves: TPERM, cur: k, sections: TSECS });
const LNG = build({ moves: LONG, cur: 22 });
const LNGW = build({ moves: LONG, cur: 23, undo: ['R′', 'D′'], wrong: 'D R' });
const idx = (M, st) => M.items.filter((x) => x.count).findIndex((x) => x.st === st);

function dBoard(name, M, o, legend) {
  mount({ id: boardId, name, frame: desktopFrame(M, o), legend, cols: 1 });
}
const D = 'desktop 1440 x 900';

function solveBoard() {
  dBoard(`desktop, labels on the Orbit: mid scramble (${D})`, MID, { c: { items: { 3: 1, cur: 2, 19: 3 }, big: 4 } }, [
    '<b>The A-02 look.</b> Every move of the scramble is a label on the Orbit: done dim, upcoming bright, so the ring itself is the strip. Nothing is added to the screen.',
    '<b>The current move</b> is an outlined teal pill at the end of the filled arc.',
    '<b>Lookahead:</b> all 20 labels readable at once, 7 after the current one. A scramble has no sections, so the points are evenly spaced (2.4 degrees apart).',
    '<b>The big move</b> in the centre says the same for the glance: move, face, direction.',
  ]);
}
function wrongBoard() {
  dBoard(`desktop: wrong turn, the undo move is a spaced section (${D})`, WRONG, { wrong: 'L', nextMove: 'F′', c: { items: { cur: 1, 14: 2 }, big: 3, pos: 4, gaps: [['u', 5]] } }, [
    '<b>The undo move is inserted on the ring</b> as an amber pill with a return arrow; the ring gets one more segment (21 now).',
    '<b>The planned move</b> (F′) moves one place on and waits, unchanged and bright.',
    '<b>Amber is not an error red:</b> the return arrow and the words carry the meaning, the pill stays calm.',
    '<b>The centre says what happened</b> and how to fix it; the count shows +1 undo.',
    '<b>The undo is a section, and a section is only extra space:</b> a wider gap before and after the undo point (14 degrees instead of 2.4). No bracket and no arc above the curve.',
  ]);
}
function wrong2Board() {
  dBoard(`desktop: two undo moves form one spaced section (${D})`, WRONG2, { wrong: 'L D', nextMove: 'F′', c: { items: { cur: 1, [idx(WRONG2, 'undo')]: 2, 15: 4 }, big: 3, pos: 5, gaps: [['u', 6]] } }, [
    '<b>Two wrong turns (L then D)</b> insert two undo moves, D′ then L′: amber pills in the order to turn them; the current one has the return arrow.',
    '<b>The group stays together:</b> its two points sit at the normal 2.4 degree spacing, so they read as one run.',
    '<b>The centre</b> names what was turned and says to undo in order.',
    '<b>The planned move</b> (F′) waits after the group, unchanged.',
    '<b>The group is a section:</b> the wide gap (14 degrees) on each side is the only thing that sets it apart.',
    '<b>Nothing is drawn around the labels:</b> the gap before the group is the same as the gap after it.',
  ]);
}
function algBoard() {
  const frame = desktopFrame(ALG(5), { c: { items: { cur: 1 }, marks: [[Math.round(polar(720, 440, 300, -118)[0]), Math.round(polar(720, 440, 300, -118)[1]), 2]], gaps: [[3, 3], [9, 3]] }, key: PLAYKEYS, foot: 'playing · T-perm', head: TITLE('T-perm', 'PLL · 14 moves') });
  mount({ id: boardId, name: `desktop: alg playback, T-perm with its three triggers (${D})`, frame, cols: 1, legend: [
    '<b>The current move</b> (F, 6 of 14) is the pill.',
    '<b>The filled arc</b> is what has been played.',
    '<b>Sections are wider gaps</b> between Orbit points: one after R U R′ U′ (the sexy move), one after R′ F R2 U′ R′ U′.',
    '<b>Three runs, two gaps:</b> 4 + 6 + 4 moves, written (R U R′ U′) (R′ F R2 U′ R′ U′) (R U R′ F′) in notation. Nothing is bracketed or named on screen; the spacing carries the structure.',
  ] });
}
function longBoard() {
  dBoard(`desktop: a 45-move scramble, rolling window of labels (${D})`, LNG, { cap: 22, c: { items: { cur: 1 }, big: 3, marks: [[418, 500, 2]] } }, [
    '<b>A rolling window of labels:</b> the current move keeps its pill; 22 labels are drawn (7 done, the current move and 14 upcoming), the ends fading, with the counts of what is outside (‹ 15, 8 ›).',
    '<b>The ring keeps all 45 segments</b> (the position in the whole). Neighbouring labels sit 4 degrees apart, closer than their width, so they fan out over three radii and never overlap.',
    '<b>The big move</b> and the count (move 23 of 45) stay in the centre.',
  ]);
}
function longWrongBoard() {
  dBoard(`desktop: a 45-move scramble with a wrong turn (${D})`, LNGW, { cap: 22, wrong: 'D R', nextMove: 'F′', c: { items: { cur: 1 }, gaps: [['u', 2]], big: 3 } }, [
    '<b>The undo group (R′ then D′)</b> is inserted in the window: amber pills, the current one with the return arrow.',
    '<b>Section = space:</b> the group has a wider gap on each side, even in a window of 22 labels over 47 segments.',
    '<b>The window</b> follows the undo move and keeps the planned move right after the group.',
  ]);
}

function pBoard(spec, legend, name) {
  const frame = `<div style="display:flex;gap:56px;justify-content:center;padding:26px 0 8px;align-items:flex-start">${spec.map(([t, M, o]) => `<div><div class="tag" style="margin-bottom:8px">${t}</div>${phoneFrame(M, o)}</div>`).join('')}</div>`;
  mount({ id: boardId, name, frame, legend, cols: 1, width: spec.length === 3 ? 1330 : 920 });
}
function pSolve() {
  pBoard([
    ['mid scramble', MID, { c: { items: { 2: 1, cur: 2 } } }],
    ['wrong turn, one undo move', WRONG, { wrong: 'L', nextMove: 'F′', c: { items: { cur: 3, [idx(WRONG, 'ucur') + 1]: 4 } } }],
  ], [
    '<b>The block sits under the cube:</b> 20 moves in 3 lines, so the whole scramble stays readable on a phone. A scramble has no sections, so every move is spaced the same.',
    '<b>The highlight</b> follows the current move, as the filled arc does on the ring.',
    '<b>Undo:</b> an amber highlight with the return arrow; the following moves reflow by one place.',
    '<b>The undo move is a section:</b> a wider space before it and after it (the planned F′ is marked), and the wrong turn stays as an amber ! word; no parentheses.',
  ], 'phone 390 x 844: wrapped sequence, scramble and wrong turn');
}
function pAlg() {
  pBoard([
    ['T-perm, playing move 6 of 14', ALG(5), { c: { items: { 4: 1, 9: 2 } } }],
    ['wrong turn, an undo group of two', WRONG2, { wrong: 'L D', nextMove: 'F′', c: { items: { cur: 3 } } }],
  ], [
    '<b>Sections are spaces:</b> (R U R′ U′) (R′ F R2 U′ R′ U′) (R U R′ F′) become three runs with a wider space between them, nothing written around them.',
    '<b>A section may wrap onto the next line;</b> the wider space marks where it begins, and a space that falls at the start of a line is dropped.',
    '<b>Two undo moves</b> form one amber section with the same spacing, after the amber ! wrong turn.',
  ], 'phone 390 x 844: wrapped sequence, an alg with triggers and an undo group');
}
function pLong() {
  pBoard([
    ['move 5 of 45', build({ moves: LONG, cur: 4 }), { roll: true, c: { items: { cur: 1 } } }],
    ['move 23 of 45: a window of lines', LNG, { roll: true, c: { items: { cur: 2 } } }],
    ['move 24 of 47: with an undo group', LNGW, { wrong: 'D R', nextMove: 'F′', roll: true, c: { items: { cur: 3 } } }],
  ], [
    '<b>At the start</b> the block shows the first lines with the current move in the second: about 25 moves ahead.',
    '<b>The block rolls by lines:</b> the current line stays near the top, the ends fade, so about 16 moves ahead are readable. The ring keeps all 45 arcs.',
    '<b>The undo group</b> keeps its extra space and its amber colour while the lines roll.',
  ], 'phone 390 x 844: a 45-move scramble, rolling lines');
}

/* ------------------------------------------------------------------ state sheets */
const T = (m, st, extra = {}) => ({ m, st, sec: -1, count: true, ...extra });
const cell = (label, html, c = '') => `<div class="cell" ${c ? co(c) : ''}>${html}<span class="tag">${label}</span></div>`;
const snipRing = (M, w, label, c, gaps = []) => {
  const R = ringHtml(M, { W: w, H: 270, cx: w / 2, cy: 160, r: 95, labels: true, Rl: 26, gs: 3, gsec: 16, win: 40 });
  const marks = gaps.map(([k, n]) => { const a = (R.segs[k].a1 + R.segs[k + 1].a0) / 2; const [x, y] = polar(w / 2, 160, 70, a); return `<i class="abs" data-co="${n}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:1px;height:1px"></i>`; }).join('');
  return `<div class="cell"><div style="position:relative;width:${w}px;height:260px">${R.svg.replace('class="stage-svg"', 'style="position:absolute;left:0;top:0"')}${R.html}${marks}</div><span class="tag">${label}</span></div>`;
};
const small = (M) => { const R = ringHtml(M, { W: 150, H: 150, cx: 75, cy: 75, r: 60, labels: false, small: true, gs: 5, gsec: 9 }); return `<div style="position:relative;width:150px;height:140px">${R.svg.replace('class="stage-svg"', 'style="position:absolute;left:0;top:0"')}</div>`; };

function statesBoard(phone) {
  const o = phone ? 3 : 1;
  const read = [
    cell('done', tok(T('L′', 'done'))), cell('current', tok(T('U', 'cur')), 1), cell('upcoming', tok(T('F′', 'next'))),
    cell('wrong turn', tok(T('L', 'wrong')), 2), cell('undo, queued', tok(T('D′', 'undo'))), cell('undo, current', tok(T('L′', 'ucur')), 2),
    cell('disabled', tok(T('R2', 'next', { state: 'is-disabled' }))),
  ].join('');
  const btn = [
    cell('default', tok(T('R′', 'next'), { tag: 'button' })), cell('hover', tok(T('R′', 'next', { state: 'is-hover' }), { tag: 'button' })),
    cell('focus-visible', tok(T('R′', 'next', { state: 'is-focus' }), { tag: 'button' }), phone ? 4 : 5), cell('pressed', tok(T('R′', 'next', { state: 'is-active' }), { tag: 'button' })),
    cell('current + focus', tok(T('U', 'cur', { state: 'is-focus' }), { tag: 'button' })), cell('done, hover', tok(T('L′', 'done', { state: 'is-hover' }), { tag: 'button' })),
    cell('disabled', tok(T('R2', 'next', { state: 'is-disabled' }), { tag: 'button' })),
  ].join('');
  let secRow;
  if (!phone) {
    const sM = build({ moves: TPERM.slice(0, 8), cur: 5, sections: [{ from: 0, to: 3 }, { from: 4, to: 7 }] });
    const uM = build({ moves: SCR.slice(9, 15), cur: 3, undo: ['D′', 'L′'], wrong: 'L D' });
    secRow = `<div ${co(3)} style="display:contents">${snipRing(sM, 420, 'two sections: one wide gap between R U R′ U′ and R′ F R2 U′', 3, [[3, 3]])}</div>${snipRing(uM, 420, 'wrong turn: two undo moves, spaced on both sides', 2, [[idx(uM, 'ucur') - 1, 3]])}`;
  } else {
    const para = (M, label, c, w = 330) => `<div class="cell" ${c ? co(c) : ''}><div class="para-in" style="width:${w}px;padding-top:0">${runs(M, M.items)}</div><span class="tag">${label}</span></div>`;
    const sm = build({ moves: TPERM, cur: -1, sections: TSECS });
    const um = build({ moves: SCR.slice(9, 15), cur: 3, undo: ['D′', 'L′'], wrong: 'L D' });
    secRow = para(sm, 'T-perm: three runs, a wide space between them', 3) + para(um, 'wrong turn: a ! word, then two undo moves as one spaced section');
  }
  const grow = `<div class="rings" ${co(4)}><div class="cell">${small(build({ moves: SCR.slice(0, 8), cur: 4 }))}<span class="tag">8 moves</span></div><span style="font-size:22px;color:var(--b-muted)">→</span><div class="cell">${small(build({ moves: SCR.slice(0, 8), cur: 4, undo: ['B′'], wrong: 'B' }))}<span class="tag">9 after a wrong turn: one segment inserted, a gap each side</span></div></div>`;
  const rows = [
    ['read-only token', '1 current, 2 amber states', `<div class="cells states-row">${read}</div>`],
    ['token as a button', `jump to a move (alg playback, review). ${phone ? 4 : 5} focus-visible`, `<div class="cells states-row">${btn}</div>`],
    ['sections = space', phone ? '3 a wider space between runs, no brackets' : '3 a wider gap between points, no brackets', `<div class="cells states-row">${secRow}</div>`],
    ...(phone ? [] : [['the Orbit grows', '4 segment count follows the sequence (300 to 450 ms)', grow]]),
  ].map(([h, sm, body]) => `<div class="srow"><div class="rh">${h}<small>${sm}</small></div>${body}</div>`).join('');
  const legend = [
    '<b>Current</b> is the only teal token: a pill on the ring, a highlight in the text; done is faint, upcoming is full ink.',
    '<b>Amber</b> = the wrong turn (outlined, with a !) and the undo moves (return arrow on the current one). Never a filled red, and always with a glyph or a word beside the colour.',
    `<b>A section is only extra space:</b> ${phone ? 'a wider space between two words of the text' : 'a wider gap between two points on the Orbit (14 degrees instead of 2.4)'}; it has no name, bracket, arc or parenthesis. The undo group is one such section.`,
    ...(phone ? ['<b>Focus-visible:</b> a 2 px teal outline, 3 px off, as the buttons of W-04; only buttons (playback, review) take focus. A scramble in progress is not focusable.'] : ['<b>Growth:</b> the ring re-divides when moves are inserted; static under reduced motion.', '<b>Focus-visible:</b> a 2 px teal outline, 3 px off, as the buttons of W-04; only buttons (playback, review) take focus. A scramble in progress is not focusable.']),
  ];
  mount({ id: boardId, name: `${phone ? 'phone: wrapped sequence' : 'desktop: labels on the Orbit'}, states`, frame: `<div class="o${o}"><div class="sheet" style="width:1440px">${rows}</div></div>`, legend, cols: 1 });
}

/* ------------------------------------------------------------------ mini form (sections = a wider space) */
function miniRow(M, { max, label, meta }) {
  let items = M.items; let more = '';
  if (max) { items = items.slice(0, max); more = `<span class="rest">… +${M.items.length - max}</span>`; }
  return `<div class="lrow"><span class="lname">${label}</span><div class="mini">${runs(M, items)}${more}</div><span class="meta">${meta}</span></div>`;
}
function miniBoard() {
  const hist = build({ moves: SCR, cur: -1 });
  const alg = build({ moves: TPERM, cur: -1, sections: TSECS });
  const play = build({ moves: TPERM, cur: 6, sections: TSECS });
  const det = build({ moves: SCR.slice(8, 20), cur: 4, undo: ['L′'], wrong: 'L' });
  const lng = build({ moves: LONG, cur: -1 });
  const frame = `<div class="o3"><div class="page" style="width:1200px"><div><h4>list rows, the same on desktop and phone</h4>
    ${miniRow(hist, { max: 12, label: 'solve 23', meta: '14.07' })}
    ${miniRow(lng, { max: 16, label: 'long scramble', meta: '45' })}
    ${miniRow(alg, { label: 'T-perm', meta: '0:03' })}
    ${miniRow(play, { label: 'T-perm · playing', meta: '7 / 14' })}
    ${miniRow(det, { label: 'review detour', meta: '+1' })}</div></div></div>`;
  mount({ id: boardId, name: 'mini form for list rows (history, algs, review): sections are a wider space', frame, cols: 1, width: 1240, legend: [
    '<b>One line of DM Mono 13 px</b> in a list row. Sections are only a wider space between runs (the T-perm shows three), so there is no bracket here either; the current move is a small highlight, done dim, the amber group is an undo and is spaced like any section.',
    '<b>Long scrambles</b> truncate with … +8 (… +29 for 45 moves); the full sequence is one click away.',
  ] });
}

/* ------------------------------------------------------------------ the light sheet */
function lightBoard() {
  const dsk = (t, html) => `<div><h4>${t}</h4><div class="shrink">${html}</div></div>`;
  const ph = (t, M, o) => `<div style="display:flex;flex-direction:column;align-items:center"><h4 style="align-self:flex-start">${t}</h4><div class="shrink" style="zoom:.62">${phoneFrame(M, o)}</div></div>`;
  const algF = desktopFrame(ALG(5), { key: PLAYKEYS, foot: 'playing · T-perm', head: TITLE('T-perm', 'PLL · 14 moves') });
  mount({
    id: boardId, name: 'light sheet: desktop (labels on the Orbit) above, phone (wrapped sequence) below', width: 1960,
    frame: `<div class="cmp3">${dsk('1  T-perm: sections are wider gaps', algF)}${dsk('2  wrong turn, two undo moves = one spaced section', desktopFrame(WRONG2, { wrong: 'L D', nextMove: 'F′' }))}${dsk('3  45-move scramble, rolling window', desktopFrame(LNG, { cap: 22 }))}</div>
    <div class="cmp3" style="padding-top:0">${ph('4  T-perm, wrapped', ALG(5), {})}${ph('5  wrong turn, undo group spaced', WRONG2, { wrong: 'L D', nextMove: 'F′' })}${ph('6  45 moves, rolling lines', LNG, { roll: true })}</div>`,
    legend: ['<b>Light theme</b> of the approved pair: desktop labels on the Orbit (1 to 3) and the wrapped sequence on a phone (4 to 6). The same section rule everywhere: more space, nothing drawn around it.'], cols: 1,
  });
}

({ states: () => statesBoard(false), 'p-states': () => statesBoard(true), solve: solveBoard, wrong: wrongBoard, wrong2: wrong2Board, alg: algBoard, long: longBoard, 'long-wrong': longWrongBoard, mini: miniBoard, light: lightBoard, 'p-solve': pSolve, 'p-alg': pAlg, 'p-long': pLong }[view] || (() => statesBoard(false)))();

/* a section space that falls at the start of a line is dropped */
document.fonts.ready.then(() => {
  document.querySelectorAll('.para-in').forEach((inn) => {
    inn.querySelectorAll('.gp').forEach((g) => { if (g.offsetLeft - parseFloat(window.getComputedStyle(g).marginLeft) <= 2) g.style.marginLeft = '0'; });
  });
});
/* the paragraph rolls to keep the current line in the second row */
document.fonts.ready.then(() => {
  document.querySelectorAll('.para.roll').forEach((p) => {
    const inn = p.firstElementChild; const c = inn.querySelector('.is-cur,.is-ucur'); if (!c) return;
    inn.style.transform = `translateY(${-Math.max(0, c.getBoundingClientRect().top - inn.getBoundingClientRect().top - 58)}px)`;
  });
});
void theme; void window;
if (q.get('legend') === '0') document.querySelector('.legend')?.remove();
