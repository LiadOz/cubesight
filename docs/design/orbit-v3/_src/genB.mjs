// Direction B, "Orbit + rail": a full ring on the left carries every graphic; one thin borderless rail on the
// right carries the words and the single number that matters. The rail has no cards: a hairline and type.
import * as L from './lib.mjs';
import { scrambleRing, inspectRing, histRow } from './genA.mjs';
const { chev, pauseGlyph, K, tx, sans, arc, dot, line, star, pol, Cube, OrbitSegs, layoutSegs, OutLabel, Marker, Callout, Pill, TextBtn, Chip, chipW, Keys, Header, Phone, PhoneHeader, OrbitGlyph, STAGES, MARKS, CUM, MOVES, fmt, sgn, MV, svgDoc, resultSegs, colorSegs, segAngle, deltaColor, caret, HIST } = L;

const W = 1440, H = 900;
export const BR = { cx: 520, cy: 462, r: 290, start: 0, sweep: 360 };
const RX = 1040;           // rail left edge
const frame = (b, css) => svgDoc(W, H, b, { css });
const rail = () => line(RX - 44, 150, RX - 44, 790, K.hair);
const bigNum = (s, y, o = {}) => sans(RX, y, s, { size: o.size || 128, fill: o.fill || K.ink, w: 300, ls: -4 });
const kicker = (y, s, c = K.muted) => tx(RX, y, s, { size: 12, fill: c });
const tick0 = spec => caret(spec, 0, 10, K.faint, 1.5);

export function b01() {
  let b = Header(W) + rail();
  const segs = layoutSegs(BR, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' })));
  b += OrbitSegs(BR, segs) + tick0(BR);
  segs.forEach((s, i) => { b += OutLabel(BR, s.mid, [{ t: L.SHORT[s.key], fill: K.faint }, { t: '~' + fmt(STAGES[i].avg), fill: K.faint }], { pad: 16 }); });
  b += Cube(520, 462, 'XL', 'solved');
  b += kicker(176, 'cube synced');
  b += bigNum('0.00', 300, { fill: K.faint });
  b += Pill(RX, 336, 204, 48, 'start', { primary: true, key: 'space', size: 17 });
  b += line(RX, 440, RX + 340, 440, K.hair);
  [['ao5', '14.62'], ['ao12', '15.03'], ['pb', '12.41'], ['today', '23 solves']].forEach(([k, v], i) => { b += tx(RX, 486 + i * 40, k, { size: 12, fill: K.muted }) + sans(RX + 340, 492 + i * 40, v, { size: 20, fill: k === 'pb' ? K.accent : K.ink, w: 600, a: 'end' }); });
  b += tx(RX, 676, 'cfop · 2-look · pseudo pairs', { size: 12, fill: K.muted }) + tx(RX, 698, 'wca inspection · coach after solve', { size: 12, fill: K.muted });
  b += Keys(RX, 884, [['tab', 'settings'], ['esc', 'command']]);
  return frame(b);
}
export function b02(wrong = false) {
  const done = wrong ? 13 : L.SC_DONE;
  let b = Header(W, { dim: .3 }) + rail();
  b += scrambleRing(BR, done, wrong);
  b += Cube(520, 462, 'XL', 'midScramble', { highlight: wrong ? { F: [0, 1, 2, 3, 4, 5, 6, 7, 8] } : { U: [0, 1, 2, 3, 4, 5, 6, 7, 8] } });
  const m = MV(MOVES[done]);
  b += kicker(176, `scramble · move ${done + 1} of 20`, wrong ? K.warn : K.accent);
  if (!wrong) {
    b += sans(RX, 330, m, { size: 150, fill: K.accent, w: 600 });
    b += sans(RX, 376, 'top face, clockwise', { size: 18, fill: K.ink, w: 600 });
    b += kicker(440, 'next');
    b += tx(RX, 470, MOVES.slice(done + 1, done + 5).map(MV).join('  '), { size: 22, fill: K.muted });
  } else {
    b += sans(RX, 330, 'F2', { size: 150, fill: K.warn, w: 600 });
    b += sans(RX, 376, 'wrong way: you turned F, not F′', { size: 18, fill: K.warn, w: 600 });
    b += sans(RX, 408, 'turn F2 to fix it, then carry on.', { size: 16, fill: K.muted, w: 500 });
  }
  b += Keys(RX, 884, [['esc', 'stop'], ['n', 'new scramble']]);
  return frame(b, wrong ? '.hl{stroke:#e6a642}' : '');
}
export function b03() {
  let b = Header(W, { dim: .3 }) + rail();
  b += inspectRing(BR, 8.0);
  b += Cube(520, 462, 'XL', 'scrambled');
  b += kicker(176, 'inspection');
  b += bigNum('7', 372, { size: 200 });
  b += sans(RX, 420, 'seconds left · “8 s” called', { size: 16, fill: K.muted, w: 500 });
  b += line(RX, 450, RX + 340, 450, K.hair);
  b += kicker(488, 'cross hint');
  b += sans(RX, 524, 'white · 6 moves', { size: 22, fill: K.ink, w: 700 });
  b += tx(RX, 556, "F′ R D2 L′ B2 D", { size: 16, fill: K.accent, w: 500 }) + tx(RX, 584, 'your usual: 7.3 moves', { size: 12, fill: K.faint });
  b += Keys(RX, 884, [['tab', 'hide hint'], ['esc', 'abort']]);
  return frame(b);
}
export function b04() {
  const upto = 4, elapsed = 8.42;
  let b = Header(W, { dim: .3 }) + rail();
  const segs = layoutSegs(BR, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' }))).map((s, i) => i < upto ? { ...s, state: 'done' } : i === upto ? { ...s, state: 'current', fill: (elapsed - CUM[i - 1]) / STAGES[i].avg } : s);
  b += OrbitSegs(BR, segs) + tick0(BR);
  segs.forEach((s, i) => {
    const st = STAGES[i];
    if (i < upto) b += OutLabel(BR, s.mid, [{ t: L.SHORT[st.key], fill: K.muted }, { t: fmt(st.t), fill: K.ink, w: 500, size: 15 }, { t: sgn(st.delta), fill: deltaColor(st.delta), size: 12 }], { pad: 16 });
    else if (i === upto) b += OutLabel(BR, s.mid, [{ t: L.SHORT[st.key], fill: K.accent, w: 500 }, { t: fmt(elapsed - CUM[i - 1]), fill: K.accent, w: 500, size: 15 }], { pad: 16 });
    else b += OutLabel(BR, s.mid, [{ t: L.SHORT[st.key], fill: K.faint }, { t: '~' + fmt(st.avg), fill: K.faint }], { pad: 16 });
  });
  for (const m of MARKS.filter(m => m.i < upto)) { const [x, y] = pol(BR.cx, BR.cy, BR.r, segAngle(segs[m.i], m.f)); b += Marker(x, y, m.kind); }
  b += Cube(520, 462, 'XL', 'f2l');
  b += kicker(176, 'F2L · pair 4', K.accent);
  b += bigNum('8.42', 330);
  b += `<rect x="${RX}" y="372" width="200" height="28" rx="14" fill="${K.accentSoft}"/>` + star(RX + 18, 386, 5, K.good) + tx(RX + 32, 391, 'pseudo pair, nice', { size: 12, fill: K.accent, w: 500 });
  b += Keys(RX, 884, [['esc', 'stop'], ['t', 'hide timer']]);
  return frame(b);
}
export function b05(o = {}) {
  let b = Header(W, o.past ? { active: 'history' } : {}) + rail();
  const segs = colorSegs(resultSegs(BR));
  b += OrbitSegs(BR, segs) + tick0(BR);
  segs.forEach((s, i) => {
    const st = STAGES[i]; const mk = MARKS.find(m => m.i === i);
    b += OutLabel(BR, s.mid, [{ t: L.SHORT[st.key], fill: K.muted }, st.skip ? { t: 'skip', fill: K.good, w: 500, size: 15 } : { t: fmt(st.t), fill: K.ink, w: 500, size: 16 }, st.skip ? null : { t: sgn(st.delta), fill: deltaColor(st.delta), size: 12 }, mk ? { t: mk.text, g: mk.kind } : null].filter(Boolean), { pad: 16 });
  });
  for (const m of MARKS) { const [x, y] = pol(BR.cx, BR.cy, BR.r, segAngle(segs[m.i], m.f)); b += Marker(x, y, m.kind, { sel: m.id === 'detour' }); }
  b += Cube(520, 462, 'XL', 'solved');
  if (o.past) b += chev(RX + 6, 170, 7, 'l', K.ink, 2.2) + sans(RX + 22, 176, 'history', { size: 15, fill: K.ink, w: 600 }) + sans(RX + 322, 176, 'solve 23 of 23', { size: 13, fill: K.muted, w: 500, a: 'end' }) + chev(RX + 214, 170, 7, 'l', K.muted, 2) + chev(RX + 340, 170, 7, 'r', K.faint, 2);
  else b += kicker(176, 'time');
  b += bigNum('14.07', 316);
  b += tx(RX, 352, '−0.96 vs ao12 · ao5 14.62 · pb 12.41', { size: 13, fill: K.muted });
  b += line(RX, 392, RX + 340, 392, K.hair);
  b += Marker(RX + 10, 440, 'bad', { sel: true }).replace('r="16"', 'r="15"') + tx(RX + 34, 445, 'cross detour · move 4', { size: 12, fill: K.warn, w: 500 });
  ['Pseudo pair 3 and the EO skip were', 'the highlights; the cross detour at', 'move 4 cost 0.6 s, 6 moves existed.'].forEach((l, i) => { b += sans(RX, 482 + i * 28, l, { size: 18, fill: K.ink, w: 500 }); });
  b += tx(RX, 592, 'tap a marker on the ring to see it', { size: 12, fill: K.faint });
  if (o.past) { b += Pill(RX, 700, 170, 48, 'replay', { primary: true, key: 'space', size: 16 }) + TextBtn(RX + 216, 731, 'review', { fill: K.ink, a: 'start' }) + TextBtn(RX + 286, 731, 'more…', { a: 'start' }); b += Keys(RX, 884, [['esc', 'history'], ['‹ ›', 'prev / next']]); }
  else { b += Pill(RX, 700, 200, 48, 'next scramble', { primary: true, key: 'space', size: 16 }) + TextBtn(RX + 226, 731, 'review', { fill: K.ink, a: 'start' }) + TextBtn(RX + 296, 731, 'more…', { a: 'start' }); b += Keys(RX, 884, [['[ ]', 'markers']]); }
  return frame(b);
}
export function b06() {
  let b = Header(W, {}) + rail();
  const yours = MV("F′ L B′ D R D′ L F").split(' '), better = MV("F′ L B′ R D′ F").split(' '), cur = 3;
  const segs = layoutSegs(BR, yours.map((m, i) => ({ key: i, w: 1, state: i < cur ? 'done' : i === cur ? 'bad' : 'future' })), { gap: 4 });
  b += OrbitSegs(BR, segs.map(s => s.state === 'done' ? { ...s, w6: 6 } : s.state === 'bad' ? { ...s, w6: 9, color: K.warn } : { ...s, w6: 6, color: K.muted }));
  segs.forEach((s, i) => { const [x, y] = pol(BR.cx, BR.cy, BR.r + 30, s.mid); b += i === cur ? `<rect x="${x - 24}" y="${y - 16}" width="48" height="32" rx="16" fill="${K.warnSoft}" stroke="${K.warn}" stroke-width="1.5"/>` + tx(x, y + 7, yours[i], { size: 20, fill: K.warn, w: 500, a: 'middle' }) : tx(x, y + 5, yours[i], { size: 16, fill: i < cur ? K.ink : K.muted, a: 'middle' }); });
  const inner = { ...BR, r: 252 };
  const bs = layoutSegs(inner, better.map((m, i) => ({ key: i, w: 8 / 6, state: 'done' })), { gap: 4 });
  b += OrbitSegs(inner, bs.map((s, i) => ({ ...s, w6: 5, color: i < 3 ? K.faint : K.good })));
  bs.forEach((s, i) => { const [x, y] = pol(BR.cx, BR.cy, BR.r - 54, s.mid); b += tx(x, y + 4, better[i], { size: 13, fill: i < 3 ? K.faint : K.good, w: 500, a: 'middle' }); });
  b += Cube(520, 462, 'XL', 'inspect', { highlight: { F: [6, 7, 8], R: [6, 7, 8] } });
  b += Marker(RX + 10, 176, 'bad') + tx(RX + 34, 181, 'detour · cross', { size: 12, fill: K.warn, w: 500 });
  b += sans(RX, 300, 'move 4 of 8', { size: 56, fill: K.warn, w: 300 });
  ['From here R D′ F gets the cross in', '3 moves; your D R D′ L F took 5.'].forEach((l, i) => { b += sans(RX, 346 + i * 28, l, { size: 18, fill: K.ink, w: 500 }); });
  b += line(RX, 424, RX + 36, 424, K.ink, 5).replace('<line', '<line stroke-linecap="round"') + tx(RX + 50, 429, 'outer ring · yours, 8 moves', { size: 12, fill: K.muted });
  b += line(RX, 452, RX + 36, 452, K.good, 5).replace('<line', '<line stroke-linecap="round"') + tx(RX + 50, 457, 'inner ring · better, 6 moves', { size: 12, fill: K.muted });
  // yours | better segmented toggle
  b += `<rect x="${RX}" y="500" width="220" height="40" rx="20" fill="${K.s2}"/><rect x="${RX + 112}" y="504" width="104" height="32" rx="16" fill="${K.accent}"/>` + sans(RX + 56, 526, 'yours', { size: 14, fill: K.ink, w: 600, a: 'middle' }) + sans(RX + 164, 526, 'better', { size: 14, fill: K.onAccent, w: 700, a: 'middle' });
  b += Pill(RX, 700, 200, 48, 'retry this moment', { primary: true, size: 15 }) + TextBtn(RX + 226, 731, 'back to results', { a: 'start' });
  b += Keys(RX, 884, [['[ ]', 'prev / next marker'], ['esc', 'back']]);
  return frame(b);
}
export function b07() {
  // history as a calendar: every day is a ring, one tick per solve; the day you select fills the rail
  let b = Header(W, { active: 'history' });
  b += sans(48, 108, 'history', { size: 36, fill: K.ink, w: 700, ls: -.8 });
  b += tx(48, 140, 'september 2026', { size: 13, fill: K.muted }) + chev(190, 135, 6, 'l', K.muted, 2) + chev(212, 135, 6, 'r', K.faint, 2);
  b += sans(48, 190, 'pb 12.41', { size: 20, fill: K.accent, w: 700 }) + sans(168, 190, 'ao12 15.03', { size: 20, fill: K.ink, w: 700 }) + sans(314, 190, 'ao5 14.62', { size: 20, fill: K.ink, w: 700 });
  const x0 = 60, y0 = 258, cw = 92, ch = 100;
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach((d, i) => { b += tx(x0 + i * cw + cw / 2, y0 - 18, d, { size: 11, fill: K.faint, a: 'middle' }); });
  const counts = [0, 12, 8, 0, 23, 5, 0, 0, 14, 9, 17, 0, 3, 11, 0, 21, 6, 0, 0, 13, 10, 0, 18, 4, 0, 0, 15, 7, 9, 23];
  counts.forEach((n, d) => {
    const cell = d + 1; const col = (d + 1) % 7, row = Math.floor((d + 1) / 7);
    const cx = x0 + col * cw + cw / 2, cy = y0 + row * ch + 44;
    const sel = d === 29;
    if (sel) b += `<rect x="${cx - cw / 2 + 4}" y="${cy - 44}" width="${cw - 8}" height="${ch - 8}" rx="14" fill="${K.surface}"/>`;
    b += tx(cx - cw / 2 + 14, cy - 26, String(cell), { size: 11, fill: sel ? K.ink : K.faint });
    if (n === 0) { b += dot(cx, cy + 6, 2.5, K.track); return; }
    const sol = Array.from({ length: n }, (_, i) => { const v = 12.5 + ((i * 37 + d * 11) % 70) / 10; return { t: Math.min(v, 18), pen: (i * 7 + d) % 13 === 0 ? '+2' : (i * 5 + d) % 31 === 0 ? 'DNF' : undefined }; });
    b += L.SessionRing(cx, cy + 6, 22, sol, { w: 5 });
    b += tx(cx, cy + 10, String(n), { size: 12, fill: K.ink, w: 500, a: 'middle' });
  });
  b += tx(48, 884, 'ring = the day. one tick per solve: teal faster than your day average, amber slower, red DNF.', { size: 12, fill: K.muted });
  // rail: the selected day
  b += line(RX - 44, 100, RX - 44, 860, K.hair);
  b += tx(RX, 120, 'wed 30 sep', { size: 12, fill: K.muted });
  b += sans(RX, 160, '23 solves', { size: 26, fill: K.ink, w: 700 });
  b += tx(RX + 160, 160, 'ao12 15.03 · pb 12.41', { size: 12, fill: K.muted });
  b += `<rect x="${RX}" y="184" width="${chipW('all sessions')}" height="26" rx="13" fill="none" stroke="${K.hair}"/>` + tx(RX + chipW('all sessions') / 2, 201, 'all sessions', { size: 12, fill: K.ink, w: 500, a: 'middle' }) + Chip(RX + chipW('all sessions') + 8, 184, 'speed') + Chip(RX + chipW('all sessions') + chipW('speed') + 16, 184, 'cube');
  [22, 21, 20, 19, 18, 17, 16, 15, 14, 13].forEach((i, k) => { b += histRow(RX + 12, 262 + k * 54, HIST[i], { sel: k === 0, when: ['17:33', '17:29', '17:24', '17:20', '17:17', '17:12', '17:08', '17:02', '16:58', '16:51'][k], w: 372, tags: 0 }); });
  return frame(b);
}
export function b08() {
  let b = Header(W, { active: 'drills' }) + rail();
  const res = ['ok', 'ok', 'ok', 'bad', 'ok', 'ok', 'ok', 'ok', 'ok', 'bad', 'ok', 'ok'], ids = ['27', '21', '33', '45', '2', '9', '22', '31', '26', '57', '37', '51'];
  const cur = 12;
  const segs = layoutSegs(BR, Array.from({ length: 20 }, (_, i) => ({ key: i, w: 1, state: i < cur ? 'done' : i === cur ? 'current' : 'future', fill: .62 })), { gap: 2.4 }).map((s, i) => i < cur ? { ...s, color: res[i] === 'ok' ? K.ink : K.warn, w6: 6 } : s);
  b += OrbitSegs(BR, segs) + tick0(BR);
  segs.forEach((s, i) => { if (i < cur) { const [x, y] = pol(BR.cx, BR.cy, BR.r + 22, s.mid); b += tx(x, y + 4, ids[i], { size: 12, fill: res[i] === 'ok' ? K.muted : K.warn, a: 'middle' }); } });
  b += Cube(520, 462, 'XL', L.OLL_CASE);
  b += kicker(176, 'OLL recognition · case 13 of 20');
  b += sans(RX, 250, 'which OLL is this?', { size: 28, fill: K.ink, w: 700 });
  [['1', '21'], ['2', '27'], ['3', '31'], ['4', '33']].forEach(([k, n], i) => { const y = 290 + i * 62; b += `<rect x="${RX}" y="${y}" width="300" height="50" rx="25" fill="${K.s2}"/>` + `<rect x="${RX + 14}" y="${y + 14}" width="22" height="22" rx="6" fill="${K.keyBg}" stroke="${K.bg}" stroke-width="0"/>` + tx(RX + 25, y + 30, k, { size: 12, fill: K.keyInk, a: 'middle' }) + sans(RX + 52, y + 32, 'OLL ' + n, { size: 17, fill: K.ink, w: 700 }); });
  b += line(RX, 566, RX + 340, 566, K.hair);
  [['combo', '×7'], ['round avg', '2.31 s'], ['best case', '0.92 s'], ['this case', '1.84 s']].forEach(([k, v], i) => { b += tx(RX, 600 + i * 34, k, { size: 12, fill: K.muted }) + sans(RX + 340, 606 + i * 34, v, { size: 18, fill: i === 0 ? K.accent : K.ink, w: 600, a: 'end' }); });
  b += Keys(RX, 884, [['1-4', 'answer'], ['space', 'skip'], ['esc', 'end round']]);
  return frame(b);
}
export const b10 = () => b05({ past: true });
export function b11(tNow = 7.42) {
  let b = Header(W, { active: 'history', dim: .5 }) + rail();
  const segs = colorSegs(resultSegs(BR));
  const cur = CUM.findIndex(c => c >= tNow), f = (tNow - (CUM[cur - 1] || 0)) / STAGES[cur].t;
  const shown = segs.map((s, i) => i < cur ? s : i === cur ? { ...s, state: 'current', fill: f } : { ...s, state: 'future', color: undefined, skip: false });
  b += OrbitSegs(BR, shown) + tick0(BR);
  shown.forEach((s, i) => { const st = STAGES[i]; b += OutLabel(BR, s.mid, i < cur ? [{ t: L.SHORT[st.key], fill: K.muted }, st.skip ? { t: 'skip', fill: K.good, w: 500, size: 15 } : { t: fmt(st.t), fill: K.ink, w: 500, size: 15 }] : i === cur ? [{ t: L.SHORT[st.key], fill: K.accent, w: 500 }, { t: fmt(tNow - CUM[i - 1]), fill: K.accent, w: 500, size: 15 }] : [{ t: L.SHORT[st.key], fill: K.faint }], { pad: 16 }); });
  for (const m of MARKS) { const [x, y] = pol(BR.cx, BR.cy, BR.r, segAngle(segs[m.i], m.f)); b += m.i < cur ? Marker(x, y, m.kind) : dot(x, y, 5, K.bg, K.faint, 1.5); }
  b += Cube(520, 462, 'XL', 'f2l');
  b += chev(RX + 6, 170, 7, 'l', K.ink, 2.2) + sans(RX + 22, 176, 'results', { size: 15, fill: K.ink, w: 600 }) + tx(RX + 340, 176, 'replay · solve 23', { size: 12, fill: K.muted, a: 'end' });
  b += bigNum('7.42', 316, { size: 116 }) + tx(RX + 292, 316, '/ 14.07', { size: 13, fill: K.muted });
  b += tx(RX, 360, 'move 38 of 68 · R′', { size: 13, fill: K.muted });
  b += chev(RX + 14, 450, 9, 'l', K.muted, 2.4) + chev(RX + 24, 450, 9, 'l', K.muted, 2.4) + dot(RX + 86, 450, 24, K.ink) + pauseGlyph(RX + 86, 450, 9, K.bg) + chev(RX + 152, 450, 9, 'r', K.muted, 2.4) + chev(RX + 162, 450, 9, 'r', K.muted, 2.4);
  b += Chip(RX + 206, 437, '0.5×') + Chip(RX + 258, 437, '1×', { on: true }) + Chip(RX + 300, 437, '2×');
  b += line(RX, 510, RX + 340, 510, K.hair);
  b += `<rect x="${RX}" y="534" width="190" height="28" rx="14" fill="${K.accentSoft}"/>` + star(RX + 18, 548, 5, K.good) + tx(RX + 32, 553, 'pseudo pair, nice', { size: 12, fill: K.accent, w: 500 });
  ['drag the ring to scrub, tap an arc to jump', 'to that stage, tap a marker to see it.'].forEach((l, i) => { b += sans(RX, 604 + i * 22, l, { size: 14, fill: K.muted, w: 500 }); });
  b += Keys(RX, 884, [['space', 'play / pause'], ['‹ ›', 'step'], ['esc', 'results']]);
  return frame(b);
}

// ---------- phone: full ring on top, the rail becomes the lower third ----------
const PR = { cx: 195, cy: 262, r: 140, start: 0, sweep: 360 };
export function phoneScene(kind) {
  let b = PhoneHeader();
  const rb = (nextY) => line(24, nextY, 366, nextY, K.hair);
  const num = (s, y, size = 72) => sans(24, y, s, { size, fill: K.ink, w: 300, ls: -2.5 });
  if (kind === 'solve') {
    const upto = 4, elapsed = 8.42;
    const segs = layoutSegs(PR, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' }))).map((s, i) => i < upto ? { ...s, state: 'done' } : i === upto ? { ...s, state: 'current', fill: (elapsed - CUM[i - 1]) / STAGES[i].avg } : s);
    b += OrbitSegs(PR, segs);
    segs.forEach((s, i) => { if (i < upto) b += OutLabel(PR, s.mid, [{ t: fmt(STAGES[i].t), fill: deltaColor(STAGES[i].delta), size: 11 }], { pad: 12 }); });
    for (const m of MARKS.filter(m => m.i < upto)) { const [x, y] = pol(PR.cx, PR.cy, PR.r, segAngle(segs[m.i], m.f)); b += Marker(x, y, m.kind).replace(/r="10"/g, 'r="8"'); }
    b += Cube(195, 262, 112, 'f2l');
    b += rb(470) + tx(24, 504, 'F2L · pair 4', { size: 13, fill: K.accent, w: 500 });
    b += num('8.42', 590, 96);
    b += `<rect x="24" y="620" width="170" height="28" rx="14" fill="${K.accentSoft}"/>` + star(42, 634, 5, K.good) + tx(56, 639, 'pseudo pair, nice', { size: 12, fill: K.accent, w: 500 });
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
  b += Cube(195, 262, 112, replay ? 'f2l' : 'solved');
  if (past) b += chev(26, 90, 6, 'l', K.ink, 2) + sans(40, 95, 'history', { size: 14, fill: K.ink, w: 600 }) + sans(366, 95, '23 of 23', { size: 12, fill: K.muted, w: 500, a: 'end' });
  if (replay) b += chev(26, 90, 6, 'l', K.ink, 2) + sans(40, 95, 'results', { size: 14, fill: K.ink, w: 600 }) + sans(366, 95, 'replay · 1×', { size: 12, fill: K.muted, w: 500, a: 'end' });
  b += rb(470);
  if (replay) {
    b += num('7.42', 560, 80) + tx(24 + 196, 560, '/ 14.07', { size: 12, fill: K.muted });
    b += chev(48, 626, 9, 'l', K.muted, 2.4) + chev(58, 626, 9, 'l', K.muted, 2.4) + dot(122, 626, 26, K.ink) + pauseGlyph(122, 626, 9, K.bg) + chev(184, 626, 9, 'r', K.muted, 2.4) + chev(194, 626, 9, 'r', K.muted, 2.4);
    b += Chip(224, 613, '1×', { on: true }) + Chip(266, 613, '2×') + Chip(308, 613, '4×');
    b += `<rect x="24" y="684" width="214" height="30" rx="15" fill="${K.accentSoft}"/>` + star(44, 699, 5, K.good) + tx(56, 703, 'pseudo pair · tap to see', { size: 12, fill: K.accent, w: 500 });
    b += sans(24, 790, 'drag the ring to scrub', { size: 14, fill: K.muted, w: 500 });
    return b;
  }
  b += num('14.07', 560, 80) + tx(366, 552, '−0.96 vs ao12', { size: 12, fill: K.muted, a: 'end' });
  b += Marker(34, 598, 'bad').replace(/r="10"/g, 'r="8"') + tx(50, 602, 'cross detour · move 4', { size: 12, fill: K.warn, w: 500 });
  ['Pseudo pair 3 and the EO skip were the', 'highlights; the cross detour at move 4', 'cost 0.6 s.'].forEach((l, i) => { b += sans(24, 636 + i * 24, l, { size: 16, fill: K.ink, w: 500 }); });
  b += Pill(24, 730, 342, 54, past ? 'replay' : 'next scramble', { primary: true, size: 17 }) + TextBtn(120, 810, 'review', { fill: K.ink }) + TextBtn(270, 810, 'more…');
  return b;
}
const phones = (a, c) => svgDoc(900, 900, `<rect width="900" height="900" fill="${K.canvas}"/>` + Phone(40, 28, phoneScene(a), { id: 'pa' }) + Phone(470, 28, phoneScene(c), { id: 'pb' }));
export const b09 = () => phones('solve', 'results');
export const b12 = () => phones('past', 'replay');
