// Direction C, "Orbit as navigation": the ring segments ARE the UI. Inside, the stage ring (tap an arc to open it).
// Outside, a second ring holds the sections (idle), the actions (results) or the answers (drills). Elsewhere it
// shrinks into a compass in the header.
import * as L from './lib.mjs';
import { scrambleRing, inspectRing } from './genA.mjs';
const { chev, pauseGlyph, K, tx, sans, arc, dot, line, star, pol, Cube, OrbitSegs, layoutSegs, OutLabel, Marker, Callout, Pill, TextBtn, Chip, chipW, Keys, Phone, PhoneHeader, OrbitGlyph, STAGES, MARKS, CUM, MOVES, fmt, sgn, MV, svgDoc, resultSegs, colorSegs, segAngle, deltaColor, caret, HIST, histLabel, rad } = L;

const W = 1440, H = 900;
export const CR = { cx: 720, cy: 458, r: 262, start: 0, sweep: 360 };
const OR = 384;       // outer ring radius
const SECTIONS = ['solve', 'drills', 'algs', 'progress', 'history'];
const frame = (b, css) => svgDoc(W, H, b, { css });
const tick0 = spec => caret(spec, 0, 10, K.faint, 1.5);

// compass: the nav orbit in its small form. Always top-left. 5 dots, the current one lit.
export function Compass(cx, cy, active) {
  let b = `<circle cx="${cx}" cy="${cy}" r="19" fill="none" stroke="${K.track}" stroke-width="1.5"/>`;
  SECTIONS.forEach((s, i) => { const [x, y] = pol(cx, cy, 19, i * 72); b += dot(x, y, s === active ? 3.6 : 2.4, s === active ? K.accent : K.faint); });
  b += Cube(cx, cy, 9, 'solved', { glow: false });
  return b;
}
function Head(opts = {}) {
  const active = opts.active || 'solve';
  let b = `<g opacity="${opts.dim ?? 1}">` + Compass(64, 38, active) + sans(100, 44, 'cubesight', { size: 20, fill: K.ink, w: 800, ls: -.4 }) + sans(214, 44, active, { size: 15, fill: K.accent, w: 700 });
  b += dot(W - 48 - 124, 33, 4, K.good) + tx(W - 48 - 112, 37, 'GAN 356 i3', { size: 12, fill: K.muted }) + tx(W - 48, 37, '84%', { size: 12, fill: K.muted, a: 'end' }) + '</g>';
  return b;
}
// the outer ring: nodes sit ON the line (pill with a bg fill breaks the line)
function OuterRing(nodes, o = {}) {
  let b = `<circle cx="${CR.cx}" cy="${CR.cy}" r="${OR}" fill="none" stroke="${o.dim ? '#24221e' : K.track}" stroke-width="1.5"${o.dash ? ' stroke-dasharray="2 7"' : ''}/>`;
  for (const n of nodes) {
    const [x, y] = pol(CR.cx, CR.cy, OR, n.deg);
    const w = n.w || (n.label.length * 8.6 + 30), h = n.h || 34;
    const fill = n.primary ? K.ink : n.on ? K.accentSoft : K.bg, fg = n.primary ? K.bg : n.on ? K.accent : (n.fg || K.ink);
    b += `<rect x="${(x - w / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"${n.primary || n.on ? '' : ` stroke="${K.hair}"`}/>`;
    b += sans(x + (n.key ? -16 : 0), y + 5.2, n.label, { size: n.size || 15, fill: fg, w: 700, a: 'middle' });
    if (n.key) b += `<rect x="${(x + w / 2 - 50).toFixed(1)}" y="${y - 10}" width="42" height="20" rx="6" fill="${n.primary ? K.bg : K.keyBg}"/>` + tx(x + w / 2 - 29, y + 4, n.key, { size: 10.5, fill: K.keyInk, w: 500, a: 'middle' });
  }
  return b;
}
const leftTime = (s, y, size = 108, fill = K.ink) => sans(48, y, s, { size, fill, w: 300, ls: -3.5 });
const lk = (y, s, c = K.muted) => tx(48, y, s, { size: 12, fill: c });
const rk = (y, s, c = K.muted) => tx(1100, y, s, { size: 12, fill: c });

export function c01() {
  let b = Head();
  const segs = layoutSegs(CR, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' })));
  b += OrbitSegs(CR, segs) + tick0(CR);
  segs.forEach((s, i) => { b += OutLabel(CR, s.mid, [{ t: L.SHORT[s.key], fill: K.faint }, { t: '~' + fmt(STAGES[i].avg), fill: K.faint }], { pad: 14 }); });
  b += OuterRing(SECTIONS.map((s, i) => ({ label: s, deg: i * 72, on: i === 0 })));
  b += Cube(720, 458, 'XL', 'solved');
  b += lk(190, 'cube synced');
  b += leftTime('0.00', 300, 108, K.faint);
  b += Pill(48, 326, 204, 48, 'start', { primary: true, key: 'space', size: 17 });
  b += tx(1190, 190, 'today', { size: 12, fill: K.muted });
  [['ao5', '14.62'], ['ao12', '15.03'], ['pb', '12.41'], ['solves', '23']].forEach(([k, v], i) => { b += tx(1190, 236 + i * 38, k, { size: 12, fill: K.muted }) + sans(1392, 242 + i * 38, v, { size: 20, fill: k === 'pb' ? K.accent : K.ink, w: 600, a: 'end' }); });
  b += tx(48, 862, 'cfop · 2-look · pseudo pairs · wca inspection', { size: 12, fill: K.muted });
  b += Keys(48, 884, [['tab', 'settings'], ['esc', 'command']]);
  b += tx(W - 48, 884, 'tap a section on the outer ring', { size: 12, fill: K.muted, a: 'end' });
  return frame(b);
}
export function c02(wrong = false) {
  const done = wrong ? 13 : L.SC_DONE;
  let b = Head({ dim: .3 });
  b += scrambleRing(CR, done, wrong);
  b += Cube(720, 458, 'XL', 'midScramble', { highlight: wrong ? { F: [0, 1, 2, 3, 4, 5, 6, 7, 8] } : { U: [0, 1, 2, 3, 4, 5, 6, 7, 8] } });
  const m = MV(MOVES[done]);
  b += lk(190, `scramble · move ${done + 1} of 20`, wrong ? K.warn : K.accent);
  if (!wrong) { b += sans(48, 330, m, { size: 150, fill: K.accent, w: 600 }) + sans(48, 376, 'top face, clockwise', { size: 18, fill: K.ink, w: 600 }); }
  else { b += sans(48, 330, 'F2', { size: 150, fill: K.warn, w: 600 }) + sans(48, 376, 'you turned F, the scramble wants F′', { size: 17, fill: K.warn, w: 600 }) + sans(48, 406, 'turn F2 to fix it, then carry on.', { size: 15, fill: K.muted, w: 500 }); }
  b += rk(190, 'next');
  b += tx(1100, 224, MOVES.slice(done + 1, done + 5).map(MV).join('  '), { size: 20, fill: K.muted });
  b += Keys(48, 884, [['esc', 'stop'], ['n', 'new scramble']]);
  return frame(b, wrong ? '.hl{stroke:#e6a642}' : '');
}
export function c03() {
  let b = Head({ dim: .3 });
  b += inspectRing(CR, 8.0);
  b += Cube(720, 458, 'XL', 'scrambled');
  b += lk(190, 'inspection');
  b += sans(48, 372, '7', { size: 200, fill: K.ink, w: 300 });
  b += sans(48, 410, 'seconds left · “8 s” called', { size: 16, fill: K.muted, w: 500 });
  b += rk(190, 'cross hint') + sans(1100, 232, 'white · 6 moves', { size: 22, fill: K.ink, w: 700 }) + tx(1100, 264, "F′ R D2 L′ B2 D", { size: 16, fill: K.accent, w: 500 }) + tx(1100, 292, 'your usual: 7.3 moves', { size: 12, fill: K.faint });
  b += Keys(48, 884, [['tab', 'hide hint'], ['esc', 'abort']]);
  return frame(b);
}
export function c04() {
  const upto = 4, elapsed = 8.42;
  let b = Head({ dim: .3 });
  const segs = layoutSegs(CR, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' }))).map((s, i) => i < upto ? { ...s, state: 'done' } : i === upto ? { ...s, state: 'current', fill: (elapsed - CUM[i - 1]) / STAGES[i].avg } : s);
  b += OrbitSegs(CR, segs) + tick0(CR);
  segs.forEach((s, i) => {
    const st = STAGES[i];
    if (i < upto) b += OutLabel(CR, s.mid, [{ t: L.SHORT[st.key], fill: K.muted }, { t: fmt(st.t), fill: K.ink, w: 500, size: 15 }, { t: sgn(st.delta), fill: deltaColor(st.delta), size: 12 }], { pad: 14 });
    else if (i === upto) b += OutLabel(CR, s.mid, [{ t: L.SHORT[st.key], fill: K.accent, w: 500 }, { t: fmt(elapsed - CUM[i - 1]), fill: K.accent, w: 500, size: 15 }], { pad: 14 });
    else b += OutLabel(CR, s.mid, [{ t: L.SHORT[st.key], fill: K.faint }, { t: '~' + fmt(st.avg), fill: K.faint }], { pad: 14 });
  });
  for (const m of MARKS.filter(m => m.i < upto)) { const [x, y] = pol(CR.cx, CR.cy, CR.r, segAngle(segs[m.i], m.f)); b += Marker(x, y, m.kind); }
  b += Cube(720, 458, 'XL', 'f2l');
  b += lk(190, 'F2L · pair 4', K.accent) + leftTime('8.42', 300);
  b += `<rect x="48" y="326" width="200" height="28" rx="14" fill="${K.accentSoft}"/>` + star(66, 340, 5, K.good) + tx(80, 345, 'pseudo pair, nice', { size: 12, fill: K.accent, w: 500 });
  b += Keys(48, 884, [['esc', 'stop'], ['t', 'hide timer']]);
  return frame(b);
}
export function c05(o = {}) {
  let b = Head(o.past ? { active: 'history' } : {});
  const segs = colorSegs(resultSegs(CR));
  const selI = 0;
  const s0 = segs[selI]; b += arc(CR.cx, CR.cy, CR.r, s0.a0, s0.a1, { w: 20, c: K.ink, op: .13 });
  b += OrbitSegs(CR, segs) + tick0(CR);
  segs.forEach((s, i) => {
    const st = STAGES[i]; const mk = MARKS.find(m => m.i === i);
    b += OutLabel(CR, s.mid, [{ t: L.SHORT[st.key], fill: K.muted }, st.skip ? { t: 'skip', fill: K.good, w: 500, size: 15 } : { t: fmt(st.t), fill: K.ink, w: 500, size: 16 }, st.skip ? null : { t: sgn(st.delta), fill: deltaColor(st.delta), size: 12 }, mk ? { t: mk.text, g: mk.kind } : null].filter(Boolean), { pad: 14 });
  });
  for (const m of MARKS) { const [x, y] = pol(CR.cx, CR.cy, CR.r, segAngle(segs[m.i], m.f)); b += Marker(x, y, m.kind, { sel: m.id === 'detour' }); }
  b += Cube(720, 458, 'XL', 'solved');
  b += o.past ? OuterRing([{ label: 'replay', deg: 180, primary: true, key: 'space', w: 170 }, { label: 'review', deg: 148, fg: K.ink }, { label: 'more…', deg: 212, fg: K.muted }], { dash: true, dim: true })
              : OuterRing([{ label: 'next scramble', deg: 180, primary: true, key: 'space', w: 200 }, { label: 'review', deg: 148, fg: K.ink }, { label: 'more…', deg: 212, fg: K.muted }], { dash: true, dim: true });
  if (o.past) b += chev(60, 98, 7, 'l', K.ink, 2.2) + sans(76, 104, 'history', { size: 15, fill: K.ink, w: 600 }) + tx(48, 130, 'solve 23 of 23 · today 17:33 · speed · cube', { size: 12, fill: K.muted });
  else b += lk(130, 'time');
  b += leftTime('14.07', 250, 104);
  b += tx(48, 284, '−0.96 vs ao12', { size: 13, fill: K.muted }) + tx(48, 306, 'ao5 14.62 · pb 12.41', { size: 13, fill: K.muted });
  b += Marker(58, 382, 'bad', { sel: true }) + tx(80, 387, 'cross detour · move 4', { size: 12, fill: K.warn, w: 500 });
  ['Pseudo pair 3 and the EO', 'skip were the highlights;', 'the cross detour at move 4', 'cost 0.6 s, 6 moves existed.'].forEach((l, i) => { b += sans(48, 424 + i * 26, l, { size: 17, fill: K.ink, w: 500 }); });
  // selected arc: the stage opens on the right and links to its drill
  b += rk(178, 'cross · selected', K.ink) + line(1100, 192, 1392, 192, K.hair);
  b += sans(1100, 250, '2.08', { size: 52, fill: K.ink, w: 300 }) + tx(1392, 244, '−0.33 vs avg 2.41', { size: 12, fill: K.good, a: 'end' });
  b += tx(1100, 290, '8 moves · 6 possible', { size: 13, fill: K.muted }) + tx(1100, 314, 'white cross · 3.8 tps', { size: 13, fill: K.muted });
  b += Pill(1100, 346, 232, 40, 'practice cross planning', { size: 13, stroke: true });
  b += tx(1100, 420, 'tap any arc or marker', { size: 12, fill: K.faint }) + tx(1100, 440, 'to open it here', { size: 12, fill: K.faint });
  return frame(b);
}
export function c06() {
  // review a PRAISE marker: pair 3, pseudo. Ring zooms into the stage: your 6 moves outer, the standard 9 on the inner ring
  let b = Head({});
  const yours = MV("D′ R U R′ D F′").split(' '), std = MV("R U R′ U′ R U′ R′ U R").split(' '), cur = 0;
  const segs = layoutSegs(CR, yours.map((m, i) => ({ key: i, w: 1, state: i === cur ? 'good' : 'done' })), { gap: 4 });
  b += OrbitSegs(CR, segs.map((s, i) => i === cur ? { ...s, w6: 9, color: K.good } : { ...s, w6: 6 }));
  segs.forEach((s, i) => { const [x, y] = pol(CR.cx, CR.cy, CR.r + 28, s.mid); b += i === cur ? `<rect x="${x - 26}" y="${y - 16}" width="52" height="32" rx="16" fill="${K.accentSoft}" stroke="${K.accent}" stroke-width="1.5"/>` + tx(x, y + 7, yours[i], { size: 20, fill: K.accent, w: 500, a: 'middle' }) : tx(x, y + 5, yours[i], { size: 17, fill: K.ink, a: 'middle' }); });
  const inner = { ...CR, r: 230 };
  const ss = layoutSegs(inner, std.map((m, i) => ({ key: i, w: 1, state: 'done' })), { gap: 3 });
  b += OrbitSegs(inner, ss.map(s => ({ ...s, w6: 4, color: K.faint })));
  ss.forEach((s, i) => { const [x, y] = pol(CR.cx, CR.cy, 207, s.mid); b += tx(x, y + 4, std[i], { size: 11, fill: K.muted, a: 'middle' }); });
  b += Cube(720, 458, 'XL', 'f2l', { highlight: { F: [3, 4, 5, 6, 7, 8], R: [0, 1, 2, 3, 4, 5, 6, 7, 8] } });
  b += Marker(58, 190, 'good') + tx(80, 195, 'pseudo pair · pair 3', { size: 12, fill: K.good, w: 500 });
  b += sans(48, 300, '6 moves', { size: 64, fill: K.good, w: 300 }) + sans(48, 336, 'the standard pair takes 9', { size: 16, fill: K.ink, w: 600 });
  ['D′ shifted the layer first, so', 'the pair slotted in with a', 'short trigger. ~0.4 s saved.'].forEach((l, i) => { b += sans(48, 386 + i * 26, l, { size: 17, fill: K.ink, w: 500 }); });
  b += line(48, 506, 84, 506, K.ink, 5).replace('<line', '<line stroke-linecap="round"') + tx(98, 511, 'outer · yours, 6 moves', { size: 12, fill: K.muted });
  b += line(48, 534, 84, 534, K.faint, 5).replace('<line', '<line stroke-linecap="round"') + tx(98, 539, 'inner · standard, 9 moves', { size: 12, fill: K.muted });
  b += OuterRing([{ label: 'pin this', deg: 148 }, { label: 'drill pseudo pairs', deg: 180, primary: true, w: 230 }, { label: 'back', deg: 212, fg: K.muted }], { dash: true, dim: true });
  b += Keys(48, 884, [['[ ]', 'prev / next marker'], ['esc', 'back']]);
  return frame(b);
}
export function c07() {
  // history: a grid of orbit cards. Each card is the solve's own orbit with a tiny cube in the middle.
  let b = Head({ active: 'history' });
  b += sans(48, 128, 'history', { size: 36, fill: K.ink, w: 700, ls: -.8 });
  b += sans(240, 126, 'pb 12.41', { size: 20, fill: K.accent, w: 700 }) + sans(360, 126, 'ao12 15.03', { size: 20, fill: K.ink, w: 700 }) + sans(506, 126, 'ao5 14.62', { size: 20, fill: K.ink, w: 700 });
  let x = 48; ['all sessions', 'speed', 'cube'].forEach((c, i) => { b += Chip(x, 156, c, { on: i === 0 }); x += chipW(c) + 8; });
  b += tx(W - 48, 174, 'search', { size: 12, fill: K.faint, a: 'end' });
  const card = (cx, cy, h, sel) => {
    let o = sel ? `<rect x="${cx - 88}" y="${cy - 56}" width="176" height="164" rx="18" fill="${K.surface}"/>` : '';
    o += OrbitGlyph(cx, cy, 44, h.steps, { marks: h.marks });
    o += Cube(cx, cy, 'S', 'solved', { glow: false });
    const pb = h.t === 12.41 && !h.pen;
    o += sans(cx, cy + 82, histLabel(h), { size: 20, fill: h.pen === 'DNF' ? K.dnf : h.pen ? K.warn : pb ? K.accent : K.ink, w: 600, a: 'middle' });
    o += tx(cx, cy + 100, `#${h.n}` + (pb ? ' · pb' : ''), { size: 11, fill: K.faint, a: 'middle' });
    return o;
  };
  const colX = k => 150 + k * 190;
  b += tx(48, 218, 'evening · 17:33 · 14 solves · ao12 15.03', { size: 12, fill: K.muted });
  b += tx(1392, 218, 'tap a card to open its orbit', { size: 12, fill: K.faint, a: 'end' });
  for (let k = 0; k < 14; k++) b += card(colX(k % 7), (k < 7 ? 290 : 462), HIST[22 - k], k === 0);
  b += line(48, 616, 1392, 616, K.hair) + tx(48, 640, 'morning · 08:12 · 9 solves · ao12 15.9', { size: 12, fill: K.muted });
  for (let k = 0; k < 7; k++) b += card(colX(k), 716, HIST[8 - k], false);
  b += tx(W - 48, 884, '+ 2 more this morning', { size: 12, fill: K.muted, a: 'end' });
  return frame(b);
}
export function c08() {
  let b = Head({ active: 'drills' });
  const res = ['ok', 'ok', 'ok', 'bad', 'ok', 'ok', 'ok', 'ok', 'ok', 'bad', 'ok', 'ok'], ids = ['27', '21', '33', '45', '2', '9', '22', '31', '26', '57', '37', '51'];
  const cur = 12;
  const segs = layoutSegs(CR, Array.from({ length: 20 }, (_, i) => ({ key: i, w: 1, state: i < cur ? 'done' : i === cur ? 'current' : 'future', fill: .62 })), { gap: 2.4 }).map((s, i) => i < cur ? { ...s, color: res[i] === 'ok' ? K.ink : K.warn, w6: 6 } : s);
  b += OrbitSegs(CR, segs) + tick0(CR);
  segs.forEach((s, i) => { if (i < cur) { const [x, y] = pol(CR.cx, CR.cy, CR.r + 22, s.mid); b += tx(x, y + 4, ids[i], { size: 12, fill: res[i] === 'ok' ? K.muted : K.warn, a: 'middle' }); } });
  b += Cube(720, 458, 'XL', L.OLL_CASE);
  // the answers ARE nodes on the outer ring
  b += OuterRing([{ label: 'OLL 21', deg: 150, key: '1', w: 130 }, { label: 'OLL 27', deg: 172, key: '2', w: 130 }, { label: 'OLL 31', deg: 194, key: '3', w: 130 }, { label: 'OLL 33', deg: 216, key: '4', w: 130 }], { dash: true, dim: true });
  b += lk(190, 'OLL recognition · case 13 of 20');
  b += sans(48, 250, 'which OLL', { size: 30, fill: K.ink, w: 700 }) + sans(48, 286, 'is this?', { size: 30, fill: K.ink, w: 700 });
  b += tx(48, 336, 'combo', { size: 12, fill: K.faint }) + sans(48, 374, '×7', { size: 40, fill: K.accent, w: 300 });
  b += tx(1100, 190, 'round avg', { size: 12, fill: K.faint }) + sans(1100, 220, '2.31 s', { size: 24, fill: K.ink, w: 600 });
  b += tx(1100, 266, 'best case', { size: 12, fill: K.faint }) + sans(1100, 296, '0.92 s', { size: 24, fill: K.ink, w: 600 });
  b += tx(1100, 342, 'this case', { size: 12, fill: K.faint }) + sans(1100, 372, '1.84 s', { size: 24, fill: K.ink, w: 600 });
  b += Keys(48, 884, [['1-4', 'answer'], ['space', 'skip'], ['esc', 'end round']]);
  return frame(b);
}
export const c10 = () => c05({ past: true });
export function c11(tNow = 7.42) {
  let b = Head({ active: 'history', dim: .6 });
  const segs = colorSegs(resultSegs(CR));
  const cur = CUM.findIndex(c => c >= tNow), f = (tNow - (CUM[cur - 1] || 0)) / STAGES[cur].t;
  const shown = segs.map((s, i) => i < cur ? s : i === cur ? { ...s, state: 'current', fill: f } : { ...s, state: 'future', color: undefined, skip: false });
  b += OrbitSegs(CR, shown) + tick0(CR);
  shown.forEach((s, i) => { const st = STAGES[i]; b += OutLabel(CR, s.mid, i < cur ? [{ t: L.SHORT[st.key], fill: K.muted }, st.skip ? { t: 'skip', fill: K.good, w: 500, size: 15 } : { t: fmt(st.t), fill: K.ink, w: 500, size: 15 }] : i === cur ? [{ t: L.SHORT[st.key], fill: K.accent, w: 500 }, { t: fmt(tNow - CUM[i - 1]), fill: K.accent, w: 500, size: 15 }] : [{ t: L.SHORT[st.key], fill: K.faint }], { pad: 14 }); });
  for (const m of MARKS) { const [x, y] = pol(CR.cx, CR.cy, CR.r, segAngle(segs[m.i], m.f)); b += m.i < cur ? Marker(x, y, m.kind) : dot(x, y, 5, K.bg, K.faint, 1.5); }
  b += Cube(720, 458, 'XL', 'f2l');
  // transport nodes on the outer ring
  const [px, py] = pol(CR.cx, CR.cy, OR, 180);
  b += `<circle cx="${CR.cx}" cy="${CR.cy}" r="${OR}" fill="none" stroke="#24221e" stroke-width="1.5" stroke-dasharray="2 7"/>`;
  b += dot(px, py, 26, K.ink) + pauseGlyph(px, py, 9, K.bg);
  const [lx, ly] = pol(CR.cx, CR.cy, OR, 156), [rx, ry] = pol(CR.cx, CR.cy, OR, 204);
  b += dot(lx, ly, 20, K.bg, K.hair, 1.5) + chev(lx - 2, ly, 7, 'r', K.muted, 2.2) + chev(lx + 4, ly, 7, 'r', K.muted, 2.2);
  b += dot(rx, ry, 20, K.bg, K.hair, 1.5) + chev(rx + 2, ry, 7, 'l', K.muted, 2.2) + chev(rx - 4, ry, 7, 'l', K.muted, 2.2);
  const [sx, sy] = pol(CR.cx, CR.cy, OR, 132), [sx2, sy2] = pol(CR.cx, CR.cy, OR, 228);
  b += Chip(sx - 12, sy - 13, '2×') + Chip(sx2 - 20, sy2 - 13, '0.5×');
  b += chev(60, 98, 7, 'l', K.ink, 2.2) + sans(76, 104, 'results', { size: 15, fill: K.ink, w: 600 }) + tx(48, 130, 'replay · solve 23 · 1×', { size: 12, fill: K.muted });
  b += leftTime('7.42', 250, 104) + tx(48, 284, '/ 14.07', { size: 14, fill: K.muted });
  b += tx(48, 330, 'move 38 of 68 · R′', { size: 13, fill: K.muted });
  b += `<rect x="48" y="360" width="190" height="28" rx="14" fill="${K.accentSoft}"/>` + star(66, 374, 5, K.good) + tx(80, 379, 'pseudo pair, nice', { size: 12, fill: K.accent, w: 500 });
  ['drag the ring to scrub,', 'tap an arc to jump to a stage,', 'tap a marker to see it.'].forEach((l, i) => { b += sans(1100, 190 + i * 22, l, { size: 14, fill: K.muted, w: 500 }); });
  b += Keys(48, 884, [['space', 'play / pause'], ['‹ ›', 'step'], ['esc', 'results']]);
  return frame(b);
}

// ---------- phone: ring + compass dock ----------
const PR = { cx: 195, cy: 252, r: 140, start: 0, sweep: 360 };
const dock = (active) => {
  const Rr = 900, cy0 = 1722, yAt = dx => cy0 - Math.sqrt(Rr * Rr - dx * dx);
  let b = `<path d="M${195 - 150} ${yAt(150).toFixed(1)}A${Rr} ${Rr} 0 0 1 ${195 + 150} ${yAt(150).toFixed(1)}" fill="none" stroke="${K.track}" stroke-width="1.5"/>`;
  SECTIONS.forEach((s, i) => { const dx = (i - 2) * 66; const y = yAt(dx); const on = s === active; b += dot(195 + dx, y, on ? 5 : 3.5, on ? K.accent : K.faint) + tx(195 + dx, y - 14, s, { size: 10.5, fill: on ? K.accent : K.muted, a: 'middle', w: on ? 500 : 400 }); });
  return b;
};
export function phoneScene(kind) {
  let b = PhoneHeader();
  b = sans(24, 50, 'cubesight', { size: 17, fill: K.ink, w: 800, ls: -.3 }) + dot(366 - 80, 45, 3.5, K.good) + tx(366, 49, 'GAN 356 i3', { size: 11, fill: K.muted, a: 'end' });
  const num = (s, y, size = 76) => sans(195, y, s, { size, fill: K.ink, w: 300, a: 'middle', ls: -2.5 });
  if (kind === 'solve') {
    const upto = 4, elapsed = 8.42;
    const segs = layoutSegs(PR, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' }))).map((s, i) => i < upto ? { ...s, state: 'done' } : i === upto ? { ...s, state: 'current', fill: (elapsed - CUM[i - 1]) / STAGES[i].avg } : s);
    b += OrbitSegs(PR, segs);
    segs.forEach((s, i) => { if (i < upto) b += OutLabel(PR, s.mid, [{ t: fmt(STAGES[i].t), fill: deltaColor(STAGES[i].delta), size: 11 }], { pad: 12 }); });
    for (const m of MARKS.filter(m => m.i < upto)) { const [x, y] = pol(PR.cx, PR.cy, PR.r, segAngle(segs[m.i], m.f)); b += Marker(x, y, m.kind).replace(/r="10"/g, 'r="8"'); }
    b += Cube(195, 252, 112, 'f2l');
    b += sans(195, 468, 'F2L · pair 4', { size: 15, fill: K.accent, w: 700, a: 'middle' }) + num('8.42', 560, 100);
    b += `<rect x="108" y="590" width="174" height="28" rx="14" fill="${K.accentSoft}"/>` + star(126, 604, 5, K.good) + tx(140, 609, 'pseudo pair, nice', { size: 12, fill: K.accent, w: 500 });
    b += sans(195, 790, 'stop', { size: 15, fill: K.muted, w: 600, a: 'middle' });
    return b;
  }
  const past = kind === 'past', replay = kind === 'replay';
  const segs0 = colorSegs(resultSegs(PR));
  let cur = -1, shown = segs0;
  if (replay) { cur = CUM.findIndex(c => c >= 7.42); const f = (7.42 - CUM[cur - 1]) / STAGES[cur].t; shown = segs0.map((s, i) => i < cur ? s : i === cur ? { ...s, state: 'current', fill: f } : { ...s, state: 'future', color: undefined, skip: false }); }
  b += OrbitSegs(PR, shown);
  shown.forEach((s, i) => { const st = STAGES[i]; if (!replay || i < cur) b += OutLabel(PR, s.mid, [{ t: st.skip ? 'skip' : fmt(st.t), fill: st.skip ? K.good : deltaColor(st.delta), size: 11 }], { pad: 12 }); });
  for (const m of MARKS) { if (replay && m.i >= cur) continue; const [x, y] = pol(PR.cx, PR.cy, PR.r, segAngle(segs0[m.i], m.f)); b += Marker(x, y, m.kind, { sel: m.id === 'detour' && !replay }).replace(/r="10"/g, 'r="8"').replace(/r="16"/g, 'r="13"'); }
  b += Cube(195, 252, 112, replay ? 'f2l' : 'solved');
  if (past) b += chev(26, 90, 6, 'l', K.ink, 2) + sans(40, 95, 'history', { size: 14, fill: K.ink, w: 600 }) + sans(366, 95, '23 of 23', { size: 12, fill: K.muted, w: 500, a: 'end' });
  if (replay) b += chev(26, 90, 6, 'l', K.ink, 2) + sans(40, 95, 'results', { size: 14, fill: K.ink, w: 600 }) + sans(366, 95, 'replay · 1×', { size: 12, fill: K.muted, w: 500, a: 'end' });
  if (replay) {
    b += num('7.42', 500, 84) + tx(290, 500, '/ 14.07', { size: 11, fill: K.muted });
    b += chev(100, 570, 9, 'l', K.muted, 2.4) + chev(110, 570, 9, 'l', K.muted, 2.4) + dot(195, 570, 28, K.ink) + pauseGlyph(195, 570, 10, K.bg) + chev(280, 570, 9, 'r', K.muted, 2.4) + chev(290, 570, 9, 'r', K.muted, 2.4);
    b += Chip(112, 620, '0.5×') + Chip(168, 620, '1×', { on: true }) + Chip(212, 620, '2×');
    b += `<rect x="88" y="680" width="214" height="30" rx="15" fill="${K.accentSoft}"/>` + star(108, 695, 5, K.good) + tx(120, 699, 'pseudo pair · tap to see', { size: 12, fill: K.accent, w: 500 });
    b += sans(195, 770, 'drag the ring to scrub', { size: 14, fill: K.muted, w: 500, a: 'middle' });
    return b;
  }
  b += num('14.07', 500, 84) + tx(195, 530, '−0.96 vs ao12 · pb 12.41', { size: 12, fill: K.muted, a: 'middle' });
  b += Marker(34, 574, 'bad').replace(/r="10"/g, 'r="8"') + tx(50, 578, 'cross detour · move 4', { size: 12, fill: K.warn, w: 500 });
  ['Pseudo pair 3 and the EO skip were the', 'highlights; the cross detour at move 4', 'cost 0.6 s.'].forEach((l, i) => { b += sans(24, 612 + i * 24, l, { size: 16, fill: K.ink, w: 500 }); });
  b += Pill(24, 676, 342, 50, past ? 'replay' : 'next scramble', { primary: true, size: 17 }) + TextBtn(120, 756, 'review', { fill: K.ink }) + TextBtn(270, 756, 'more…');
  b += dock(past ? 'history' : 'solve');
  return b;
}
const phones = (a, c) => svgDoc(900, 900, `<rect width="900" height="900" fill="${K.canvas}"/>` + Phone(40, 28, phoneScene(a), { id: 'pa' }) + Phone(470, 28, phoneScene(c), { id: 'pb' }));
export const c09 = () => phones('solve', 'results');
export const c12 = () => phones('past', 'replay');
