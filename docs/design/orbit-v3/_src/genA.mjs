// Direction A, "One orbit": a single giant cube inside one open dial. The ring is the only graphic; the
// gap at the bottom of the dial is the one slot for the number that matters in each phase.
import * as L from './lib.mjs';
const { chev, pauseGlyph, play, K, tx, sans, arc, dot, line, star, pol, Cube, OrbitSegs, layoutSegs, OutLabel, Marker, Callout, Pill, TextBtn, Chip, chipW, Keys, Coach, Header, Phone, PhoneHeader, OrbitGlyph, STAGES, NAMES, MARKS, CUM, MOVES, SESSION, fmt, sgn, MV, svgDoc, resultSegs, colorSegs, segAngle, deltaColor, caret, rad } = L;

const W = 1440, H = 900;
export const R = { cx: 720, cy: 440, r: 300, start: -145, sweep: 290 };
const CUBE = 215;
const endCaps = (spec, c = K.faint) => caret(spec, spec.start, 10, c, 1.5) + caret(spec, spec.start + spec.sweep, 10, c, 1.5);
const slotNum = (s, o = {}) => sans(720, o.y ?? 800, s, { size: o.size ?? 140, fill: o.fill ?? K.ink, w: 300, a: 'middle', ls: -4 });
const footer = (items, y = 880) => Keys(48, y, items);

function frame(body, css) { return svgDoc(W, H, body, { css }); }

export function a01() {
  let b = Header(W, { nav: true });
  const segs = layoutSegs(R, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' })));
  b += OrbitSegs(R, segs) + endCaps(R);
  segs.forEach((s, i) => { b += OutLabel(R, s.mid, [{ t: L.SHORT[s.key], fill: K.faint }, { t: '~' + fmt(STAGES[i].avg), fill: K.faint }], { pad: 18 }); });
  b += Cube(720, 440, 'XL', 'solved');
  b += slotNum('0.00', { fill: K.faint, y: 790, size: 120 });
  b += Pill(618, 818, 204, 48, 'start', { primary: true, key: 'space', size: 17 });
  b += tx(48, 862, 'cfop · 2-look · pseudo pairs · wca inspection', { size: 12, fill: K.muted });
  b += Keys(48, 884, [['tab', 'settings'], ['esc', 'command']]);
  b += tx(W - 48, 862, 'ao5 14.62 · ao12 15.03 · pb 12.41', { size: 12, fill: K.muted, a: 'end' });
  b += tx(W - 48, 884, '23 solves today · history', { size: 12, fill: K.muted, a: 'end' });
  return frame(b);
}

// scramble ring: one segment per move; labels on the ring
export function scrambleRing(spec, done, wrong) {
  const segs = layoutSegs(spec, MOVES.map((m, i) => ({ key: m + i, w: 1, state: i < done ? 'done' : i === done ? (wrong ? 'wrong' : 'current') : 'future' })), { gap: 2 });
  let b = OrbitSegs(spec, segs.map(s => s.state === 'done' ? { ...s, w6: 5, color: K.faint } : s));
  segs.forEach((s, i) => {
    const m = MV(MOVES[i]);
    const [x, y] = pol(spec.cx, spec.cy, spec.r + 30, s.mid);
    if (i === done) {
      b += `<rect x="${x - 27}" y="${y - 17}" width="54" height="34" rx="17" fill="${wrong ? K.warnSoft : K.accentSoft}" stroke="${wrong ? K.warn : K.accent}" stroke-width="1.5"/>` + tx(x, y + 7, m, { size: 21, fill: wrong ? K.warn : K.accent, w: 500, a: 'middle' });
    } else b += tx(x, y + 5, m, { size: i < done ? 14 : 16, fill: i < done ? K.faint : K.ink, a: 'middle', op: i < done ? .8 : 1 });
  });
  return b;
}
const stageLabel = (spec, deg, a, b2, c) => OutLabel(spec, deg, [a, b2, c].filter(Boolean));

export function a02(wrong = false) {
  const done = wrong ? 13 : L.SC_DONE;
  let b = Header(W, { dim: .3 });
  b += scrambleRing(R, done, wrong);
  b += Cube(720, 440, 'XL', 'midScramble', { highlight: wrong ? { F: [0, 1, 2, 3, 4, 5, 6, 7, 8] } : { U: [0, 1, 2, 3, 4, 5, 6, 7, 8] } });
  const m = MV(MOVES[done]);
  if (!wrong) {
    b += sans(720, 770, m, { size: 108, fill: K.accent, w: 600, a: 'middle' });
    b += sans(720, 812, 'top face, clockwise', { size: 16, fill: K.muted, w: 500, a: 'middle' });
    b += tx(720, 846, `move ${done + 1} of 20`, { size: 13, fill: K.faint, a: 'middle' });
  } else {
    b += sans(720, 752, 'F2', { size: 84, fill: K.warn, w: 600, a: 'middle' });
    b += sans(720, 792, "you turned F, the scramble wants F′", { size: 16, fill: K.warn, w: 600, a: 'middle' });
    b += sans(720, 820, 'turn F2 to fix it, then carry on', { size: 15, fill: K.muted, w: 500, a: 'middle' });
    b += tx(720, 850, `move ${done + 1} of 20`, { size: 13, fill: K.faint, a: 'middle' });
  }
  b += footer([['esc', 'stop'], ['n', 'new scramble']]);
  b += tx(W - 48, 884, 'guided · follow the lit face', { size: 12, fill: K.muted, a: 'end' });
  return frame(b, wrong ? '.hl{stroke:#e6a642}' : '');
}

// inspection: the same dial, 0..17 s; remaining span in teal, +2 zone amber, DNF stub hatched
export function inspectRing(spec, elapsed, o = {}) {
  const per = spec.sweep / 17;
  const a15 = spec.start + 15 * per, aEnd = spec.start + 17 * per, aNow = spec.start + elapsed * per;
  let b = arc(spec.cx, spec.cy, spec.r, spec.start, a15, { w: 3, c: K.track });
  b += arc(spec.cx, spec.cy, spec.r, a15, aEnd, { w: 7, c: K.warnSoft, cap: 'butt' });
  b += arc(spec.cx, spec.cy, spec.r, aEnd + 1.5, aEnd + 9, { w: 7, c: 'url(#hatch)', cap: 'butt' });
  b += arc(spec.cx, spec.cy, spec.r, aNow, a15, { w: 8, c: K.accent });
  const [dx, dy] = pol(spec.cx, spec.cy, spec.r, aNow);
  b += dot(dx, dy, 14, K.accent).replace('/>', ' opacity=".16"/>') + dot(dx, dy, 7.5, K.accent) + dot(dx, dy, 2.8, K.bg);
  for (const [e, lab] of [[8, '8 s'], [12, '12 s'], [15, '15'] ]) {
    const a = spec.start + e * per; const passed = elapsed >= e;
    b += caret(spec, a, 11, passed ? K.ink : K.muted, 2);
    b += OutLabel(spec, a, [{ t: lab, fill: passed ? K.ink : K.muted, w: 500, size: 13 }], { pad: 22 });
  }
  b += OutLabel(spec, (a15 + aEnd) / 2, [{ t: '+2', fill: K.warn, w: 500, size: 13 }], { pad: 22 });
  b += OutLabel(spec, aEnd + 6, [{ t: 'DNF', fill: K.dnf, w: 500, size: 13 }], { pad: 22 });
  return b;
}
export function a03() {
  let b = Header(W, { dim: .3 });
  b += inspectRing(R, 8.0);
  const inner = { ...R, r: 268 };
  b += OrbitSegs(inner, layoutSegs(inner, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' }))).map(s => ({ ...s, color: '#2a2823' })), {});
  b += Cube(720, 440, 'XL', 'scrambled');
  b += slotNum('7', { y: 812, size: 168, fill: K.ink });
  b += sans(720, 852, 'seconds left · “8 s” called', { size: 15, fill: K.muted, w: 500, a: 'middle' });
  b += tx(48, 150, 'cross hint', { size: 12, fill: K.faint }) + sans(48, 180, 'white · 6 moves', { size: 20, fill: K.ink, w: 700 });
  b += tx(48, 206, "F′ R D2 L′ B2 D", { size: 15, fill: K.accent, w: 500 }) + tx(48, 230, 'your usual: 7.3 moves', { size: 12, fill: K.faint });
  b += footer([['tab', 'hide hint'], ['esc', 'abort']]);
  b += tx(W - 48, 884, 'start any time. +2 after 15, DNF after 17', { size: 12, fill: K.muted, a: 'end' });
  return frame(b);
}

// solving: stage arcs sized by YOUR AVERAGE (the pace map); done = ink with the split, current fills in teal
export function solvingSegs(spec, upto, elapsed) {
  const segs = layoutSegs(spec, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' })));
  return segs.map((s, i) => i < upto ? { ...s, state: 'done' } : i === upto ? { ...s, state: 'current', fill: (elapsed - (CUM[i - 1] || 0)) / s.st_avg } : s).map((s, i) => ({ ...s, st: STAGES[i] }));
}
export function a04() {
  const upto = 4, elapsed = 8.42;
  let b = Header(W, { dim: .3 });
  const segs = layoutSegs(R, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' }))).map((s, i) => i < upto ? { ...s, state: 'done' } : i === upto ? { ...s, state: 'current', fill: (elapsed - CUM[i - 1]) / STAGES[i].avg } : s);
  b += OrbitSegs(R, segs) + endCaps(R);
  segs.forEach((s, i) => {
    const st = STAGES[i];
    if (i < upto) b += stageLabel(R, s.mid, { t: L.SHORT[st.key], fill: K.muted }, { t: fmt(st.t), fill: K.ink, w: 500, size: 15 }, { t: sgn(st.delta), fill: deltaColor(st.delta), size: 12 });
    else if (i === upto) b += stageLabel(R, s.mid, { t: L.SHORT[st.key], fill: K.accent, w: 500 }, { t: fmt(elapsed - CUM[i - 1]), fill: K.accent, w: 500, size: 15 });
    else b += stageLabel(R, s.mid, { t: L.SHORT[st.key], fill: K.faint }, { t: '~' + fmt(st.avg), fill: K.faint });
  });
  for (const m of MARKS.filter(m => m.i < upto)) { const [x, y] = pol(R.cx, R.cy, R.r, segAngle(segs[m.i], m.f)); b += Marker(x, y, m.kind); }
  b += Callout(R, segAngle(segs[3], .6), 'good', 'pseudo pair, nice');
  b += Cube(720, 440, 'XL', 'f2l');
  b += sans(720, 716, 'F2L · pair 4', { size: 24, fill: K.accent, w: 700, a: 'middle' });
  b += slotNum('8.42', { y: 846, size: 128 });
  b += footer([['esc', 'stop'], ['t', 'hide timer']]);
  return frame(b);
}

// results: arcs sized by the time you actually spent; the story is on the ring
export function a05(o = {}) {
  let b = Header(W, o.past ? { active: 'history' } : {});
  const segs = colorSegs(resultSegs(R));
  b += OrbitSegs(R, segs) + endCaps(R);
  segs.forEach((s, i) => {
    const st = STAGES[i]; const mk = MARKS.find(m => m.i === i);
    b += OutLabel(R, s.mid, [{ t: L.SHORT[st.key], fill: K.muted }, st.skip ? { t: 'skip', fill: K.good, w: 500, size: 15 } : { t: fmt(st.t), fill: K.ink, w: 500, size: 16 }, st.skip ? null : { t: sgn(st.delta), fill: deltaColor(st.delta), size: 12 }, mk ? { t: mk.text, g: mk.kind } : null].filter(Boolean));
  });
  const pos = {};
  for (const m of MARKS) { const [x, y] = pol(R.cx, R.cy, R.r, segAngle(segs[m.i], m.f)); pos[m.id] = [x, y]; b += Marker(x, y, m.kind, { sel: m.id === 'detour' }); }
  b += Cube(720, 440, 'XL', 'solved');
  // coach: one sentence tied to the selected marker
  b += Coach(48, 560, ['Pseudo pair 3 and the EO', 'skip were the highlights; the', 'cross detour at move 4 cost', '0.6 s, 6 moves existed.'], { tag: 'coach', size: 19 });
  const [mx, my] = pos.detour;
  b += `<path d="M312 610C380 600 ${mx - 70} ${my - 4} ${mx - 17} ${my}" fill="none" stroke="${K.muted}" stroke-width="1" stroke-dasharray="2 4"/>`;
  b += sans(720, 782, '14.07', { size: 124, fill: K.ink, w: 300, a: 'middle', ls: -4 });
  b += tx(720, 818, '−0.96 vs ao12 · ao5 14.62 · pb 12.41', { size: 14, fill: K.muted, a: 'middle' });
  if (o.past) {
    b += Pill(560, 836, 160, 44, 'replay', { primary: true, key: 'space', size: 15 });
    b += TextBtn(786, 864, 'review', { fill: K.ink }) + TextBtn(862, 864, 'more…');
    b += chev(60, 98, 7, 'l', K.ink, 2.2) + sans(76, 104, 'history', { size: 15, fill: K.ink, w: 600 });
    b += sans(W - 48 - 170, 104, 'solve 23 of 23', { size: 13, fill: K.muted, w: 500 }) + chev(W - 84, 98, 7, 'l', K.muted, 2) + chev(W - 52, 98, 7, 'r', K.faint, 2);
    b += tx(W - 48, 884, 'today 17:33 · speed · cube', { size: 12, fill: K.muted, a: 'end' });
    b += Keys(48, 884, [['esc', 'history'], ['‹ ›', 'prev / next solve'], ['[ ]', 'markers']]);
  } else {
    b += Pill(536, 836, 190, 44, 'next scramble', { primary: true, key: 'space', size: 15 });
    b += TextBtn(792, 864, 'review', { fill: K.ink }) + TextBtn(870, 864, 'more…');
    b += tx(W - 48, 884, 'solve 23 · today 17:33 · speed · cube', { size: 12, fill: K.muted, a: 'end' });
    b += Keys(48, 884, [['[ ]', 'markers']]);
  }
  return frame(b);
}
export const a05Frame = a05;

// review: tap a ring marker. The ring zooms into the stage: your moves on the ring, the better line on an inner ring
export function a06() {
  let b = Header(W, {});
  const yours = MV("F′ L B′ D R D′ L F").split(' '), better = MV("F′ L B′ R D′ F").split(' ');
  const cur = 3;
  const segs = layoutSegs(R, yours.map((m, i) => ({ key: i, w: 1, state: i < cur ? 'done' : i === cur ? 'bad' : 'future' })), { gap: 4 });
  b += OrbitSegs(R, segs.map(s => s.state === 'done' ? { ...s, w6: 6 } : s.state === 'bad' ? { ...s, w6: 9, color: K.warn } : s.state === 'future' ? { ...s, w6: 6, color: K.muted } : s));
  segs.forEach((s, i) => { const [x, y] = pol(R.cx, R.cy, R.r + 30, s.mid); b += i === cur ? `<rect x="${x - 24}" y="${y - 16}" width="48" height="32" rx="16" fill="${K.warnSoft}" stroke="${K.warn}" stroke-width="1.5"/>` + tx(x, y + 7, yours[i], { size: 20, fill: K.warn, w: 500, a: 'middle' }) : tx(x, y + 5, yours[i], { size: 16, fill: i < cur ? K.ink : K.muted, a: 'middle' }); });
  const inner = { ...R, r: 262 };
  const bsegs = layoutSegs(inner, better.map((m, i) => ({ key: i, w: 8 / 6, state: 'done' })), { gap: 4 });
  b += OrbitSegs(inner, bsegs.map((s, i) => ({ ...s, w6: 5, color: i < 3 ? K.faint : K.good })));
  bsegs.forEach((s, i) => { const [x, y] = pol(R.cx, R.cy, R.r - 54, s.mid); b += tx(x, y + 4, better[i], { size: 13, fill: i < 3 ? K.faint : K.good, w: 500, a: 'middle' }); });
  b += Cube(720, 440, 'XL', 'inspect', { highlight: { F: [6, 7, 8], R: [6, 7, 8] } });
  b += sans(720, 760, 'move 4 of 8', { size: 56, fill: K.warn, w: 300, a: 'middle' });
  b += sans(720, 796, 'D turned you away from the cross', { size: 16, fill: K.ink, w: 600, a: 'middle' });
  b += Pill(540, 820, 150, 44, 'better line', { accent: true, size: 15 }) + Pill(702, 820, 198, 44, 'retry this moment', { size: 15 });
  b += Marker(76, 168, 'bad');
  b += tx(98, 172, 'detour · cross', { size: 12, fill: K.warn, w: 500 });
  b += Coach(48, 214, ['From here R D′ F gets the', 'cross in 3 moves; your D R', 'D′ L F took 5.'], { size: 19 });
  b += arc(54, 370, 0.1, 0, 1, { w: 1 }).replace(/<path.*/, '') + line(48, 372, 78, 372, K.ink, 5).replace('<line', '<line stroke-linecap="round"') + tx(92, 376, 'outer · yours, 8 moves', { size: 12, fill: K.muted });
  b += line(48, 400, 78, 400, K.good, 5).replace('<line', '<line stroke-linecap="round"') + tx(92, 404, 'inner · better, 6 moves', { size: 12, fill: K.muted });
  b += TextBtn(48, 470, 'back to results', { a: 'start', fill: K.muted });
  b += footer([['[ ]', 'prev / next marker'], ['space', 'play line'], ['esc', 'back']]);
  return frame(b);
}

// ---------- history: sessions as rings, solves as rows with a mini orbit ----------
const HIST = L.HIST, histLabel = L.histLabel;
const dropdown = (x, y, label) => { const w = label.length * 8 + 44; return `<rect x="${x}" y="${y}" width="${w}" height="30" rx="15" fill="none" stroke="${K.hair}"/>` + sans(x + 16, y + 20, label, { size: 13, fill: K.ink, w: 600 }) + `<path d="M${x + w - 22} ${y + 13}l4 4 4 -4" fill="none" stroke="${K.muted}" stroke-width="1.6" stroke-linecap="round"/>`; };
export function histRow(x, y, h, o = {}) {
  const sel = o.sel;
  let b = sel ? `<rect x="${x - 12}" y="${y - 22}" width="${o.w || 700}" height="46" rx="10" fill="${K.surface}"/>` : '';
  b += tx(x, y + 5, '#' + h.n, { size: 12, fill: K.faint });
  b += OrbitGlyph(x + 62, y, 17, h.steps, { marks: h.marks });
  const pbk = h.t === 12.41 && !h.pen;
  b += sans(x + 100, y + 8, histLabel(h), { size: 22, fill: h.pen === 'DNF' ? K.dnf : h.pen ? K.warn : K.ink, w: 600 });
  if (pbk) b += `<rect x="${x + 178}" y="${y - 8}" width="30" height="18" rx="9" fill="${K.accentSoft}"/>` + tx(x + 193, y + 5, 'PB', { size: 11, fill: K.accent, w: 500, a: 'middle' });
  else if (!h.pen) { const d = h.t - 15.03; b += tx(x + 180, y + 5, sgn(d), { size: 12, fill: deltaColor(d / 1.5) }); }
  let tx0 = x + 250;
  h.tags.slice(0, o.tags ?? 2).forEach(([k, t]) => { b += (k === 'good' ? star(tx0 + 5, y, 5, K.good) : dot(tx0 + 5, y, 4, K.bg, K.warn, 1.8)) + tx(tx0 + 16, y + 4, t, { size: 12, fill: k === 'good' ? K.good : K.warn }); tx0 += t.length * 7.2 + 36; });
  b += tx(x + (o.w || 700) - 24, y + 5, o.when || '', { size: 12, fill: K.faint, a: 'end' });
  return b;
}
export function a07() {
  let b = Header(W, { active: 'history' });
  b += sans(48, 108, 'history', { size: 36, fill: K.ink, w: 700, ls: -.8 });
  b += L.SessionRing(88, 184, 34, HIST, { w: 6 }) + tx(88, 189, '23', { size: 17, fill: K.ink, w: 500, a: 'middle' });
  b += tx(148, 168, 'today · 2 sessions', { size: 12, fill: K.muted });
  b += sans(148, 194, 'pb 12.41', { size: 20, fill: K.accent, w: 700 }) + sans(262, 194, 'ao12 15.03', { size: 20, fill: K.ink, w: 700 }) + sans(408, 194, 'ao5 14.62', { size: 20, fill: K.ink, w: 700 });
  b += dropdown(48, 236, 'all sessions') + dropdown(186, 236, 'speed') + dropdown(262, 236, 'cube');
  b += tx(660, 256, 'search', { size: 12, fill: K.faint, a: 'end' }) + `<circle cx="676" cy="250" r="6" fill="none" stroke="${K.muted}" stroke-width="1.6"/><line x1="680.5" y1="254.5" x2="685" y2="259" stroke="${K.muted}" stroke-width="1.6" stroke-linecap="round"/>`;
  let y = 322;
  b += tx(48, y - 28, 'evening · 17:33 · 14 solves · ao12 15.03', { size: 12, fill: K.muted });
  const evening = [22, 21, 20, 19, 18, 17, 16];
  const whens = ['17:33', '17:29', '17:24', '17:20', '17:17', '17:12', '17:08'];
  evening.forEach((i, k) => { b += histRow(60, y + k * 46, HIST[i], { sel: k === 0, when: whens[k], w: 700 }); });
  y += evening.length * 46 + 20;
  b += line(48, y - 26, 748, y - 26, K.hair) + tx(48, y, 'morning · 08:12 · 9 solves · ao12 15.9', { size: 12, fill: K.muted });
  [12, 11, 10, 9].forEach((i, k) => { b += histRow(60, y + 34 + k * 46, HIST[i], { when: ['08:51', '08:46', '08:41', '08:37'][k], w: 700 }); });
  // preview of the selected solve: the same orbit, big, with an invitation to open it
  const sp = { cx: 1090, cy: 400, r: 190, start: -145, sweep: 290 };
  const segs = colorSegs(resultSegs(sp, { layout: { gap: 2.5 } }));
  b += OrbitSegs(sp, segs);
  for (const m of MARKS) { const [x, yy] = pol(sp.cx, sp.cy, sp.r, segAngle(segs[m.i], m.f)); b += Marker(x, yy, m.kind); }
  b += Cube(1090, 400, 'L', 'solved');
  b += sans(1090, 640, '14.07', { size: 76, fill: K.ink, w: 300, a: 'middle', ls: -2 });
  b += tx(1090, 672, 'solve 23 · today 17:33 · speed · cube', { size: 12, fill: K.muted, a: 'middle' });
  b += Pill(985, 698, 210, 46, 'open this solve', { primary: true, key: 'enter', size: 15 });
  b += TextBtn(1090, 776, 'replay', { fill: K.ink });
  b += Keys(48, 884, [['j k', 'move'], ['enter', 'open'], ['/', 'search']]);
  return frame(b);
}

// ---------- drill: the round is the ring ----------
export function a08() {
  let b = Header(W, { active: 'drills' });
  const res = ['ok', 'ok', 'ok', 'bad', 'ok', 'ok', 'ok', 'ok', 'ok', 'bad', 'ok', 'ok'];
  const cur = res.length;
  const ids = ['27', '21', '33', '45', '2', '9', '22', '31', '26', '57', '37', '51'];
  const segs = layoutSegs(R, Array.from({ length: 20 }, (_, i) => ({ key: i, w: 1, state: i < cur ? 'done' : i === cur ? 'current' : 'future', fill: .62 })), { gap: 2.4 }).map((s, i) => i < cur ? { ...s, color: res[i] === 'ok' ? K.ink : K.warn, w6: 6 } : s);
  b += OrbitSegs(R, segs) + endCaps(R);
  segs.forEach((s, i) => { if (i < cur) { const [x, y] = pol(R.cx, R.cy, R.r + 22, s.mid); b += tx(x, y + 4, ids[i], { size: 12, fill: res[i] === 'ok' ? K.muted : K.warn, a: 'middle' }); } });
  b += Cube(720, 440, 'XL', L.OLL_CASE);
  b += sans(720, 704, 'which OLL is this?', { size: 24, fill: K.ink, w: 700, a: 'middle' });
  const opts = [['1', '21'], ['2', '27'], ['3', '31'], ['4', '33']];
  opts.forEach(([k, n], i) => { const x = 478 + i * 128; b += `<rect x="${x}" y="738" width="116" height="56" rx="28" fill="${K.s2}"/>` + sans(x + 58, 773, 'OLL ' + n, { size: 17, fill: K.ink, w: 700, a: 'middle' }) + `<rect x="${x + 8}" y="${738 - 9}" width="18" height="18" rx="5" fill="${K.keyBg}" stroke="${K.bg}" stroke-width="3"/>` + tx(x + 17, 738 + 4, k, { size: 11, fill: K.keyInk, a: 'middle' }); });
  b += tx(720, 830, 'case 13 of 20 · 1.84 s', { size: 13, fill: K.muted, a: 'middle' });
  b += tx(48, 150, 'combo', { size: 12, fill: K.faint }) + sans(48, 188, '×7', { size: 40, fill: K.accent, w: 300 });
  b += tx(48, 230, 'round avg', { size: 12, fill: K.faint }) + sans(48, 262, '2.31 s', { size: 24, fill: K.ink, w: 600 });
  b += tx(48, 304, 'best case', { size: 12, fill: K.faint }) + sans(48, 336, '0.92 s', { size: 24, fill: K.ink, w: 600 });
  b += tx(W - 48, 150, 'OLL recognition', { size: 13, fill: K.ink, w: 500, a: 'end' }) + tx(W - 48, 172, 'spaced · 12 due', { size: 12, fill: K.muted, a: 'end' });
  b += Keys(48, 884, [['1-4', 'answer'], ['space', 'skip'], ['esc', 'end round']]);
  return frame(b);
}

// ---------- past solve + replay ----------
export function a10() { return a05({ past: true }); }
export function a11(tNow = 7.42) {
  let b = Header(W, { active: 'history', dim: .5 });
  const segs = colorSegs(resultSegs(R));
  let cur = CUM.findIndex(c => c >= tNow);
  const inStage = (tNow - (CUM[cur - 1] || 0)) / STAGES[cur].t;
  const shown = segs.map((s, i) => i < cur ? s : i === cur ? { ...s, state: 'current', fill: inStage } : { ...s, state: 'future', color: undefined, skip: false });
  b += OrbitSegs(R, shown) + endCaps(R);
  shown.forEach((s, i) => {
    const st = STAGES[i];
    if (i < cur) b += OutLabel(R, s.mid, [{ t: L.SHORT[st.key], fill: K.muted }, st.skip ? { t: 'skip', fill: K.good, w: 500, size: 15 } : { t: fmt(st.t), fill: K.ink, w: 500, size: 15 }]);
    else if (i === cur) b += OutLabel(R, s.mid, [{ t: L.SHORT[st.key], fill: K.accent, w: 500 }, { t: fmt(tNow - CUM[i - 1]), fill: K.accent, w: 500, size: 15 }]);
    else b += OutLabel(R, s.mid, [{ t: L.SHORT[st.key], fill: K.faint }]);
  });
  for (const m of MARKS) { const [x, y] = pol(R.cx, R.cy, R.r, segAngle(segs[m.i], m.f)); b += m.i < cur ? Marker(x, y, m.kind) : dot(x, y, 5, K.bg, K.faint, 1.5); }
  b += Callout(R, segAngle(segs[3], .6), 'good', 'pseudo pair', {});
  b += Cube(720, 440, 'XL', 'f2l');
  b += sans(720, 790, '7.42', { size: 96, fill: K.ink, w: 300, a: 'middle', ls: -3 }) + tx(720 + 138, 790, '/ 14.07', { size: 14, fill: K.muted });
  // transport: prev marker, play/pause, next marker, speed
  b += chev(584, 836, 9, 'l', K.muted, 2.4) + chev(594, 836, 9, 'l', K.muted, 2.4) + dot(656, 836, 24, K.ink) + pauseGlyph(656, 836, 9, K.bg) + chev(724, 836, 9, 'r', K.muted, 2.4) + chev(734, 836, 9, 'r', K.muted, 2.4);
  b += Chip(774, 823, '0.5×') + Chip(826, 823, '1×', { on: true }) + Chip(868, 823, '2×');
  b += tx(48, 150, 'move 38 of 68', { size: 12, fill: K.faint }) + tx(48, 176, "R′", { size: 28, fill: K.ink, w: 500 });
  ['drag the ring to scrub,', 'tap an arc to jump to a stage,', 'tap a marker to see it.'].forEach((l, i) => { b += sans(48, 214 + i * 22, l, { size: 14, fill: K.muted, w: 500 }); });
  b += Keys(48, 884, [['space', 'play / pause'], ['‹ ›', 'step'], ['[ ]', 'markers'], ['esc', 'results']]);
  return frame(b);
}

// ---------- phone (390 x 844): same dial, smaller labels, one slot, one primary action ----------
const PR = { cx: 195, cy: 300, r: 150, start: -145, sweep: 290 };
const PS = 118;
const pnum = (s, y, size = 84, fill = K.ink) => sans(195, y, s, { size, fill, w: 300, a: 'middle', ls: -2.5 });
function phoneRingResult(upto = 9, tNow = null) {
  const segs = colorSegs(resultSegs(PR));
  let b = '';
  let cur = -1, shown = segs;
  if (tNow != null) { cur = CUM.findIndex(c => c >= tNow); const f = (tNow - (CUM[cur - 1] || 0)) / STAGES[cur].t; shown = segs.map((s, i) => i < cur ? s : i === cur ? { ...s, state: 'current', fill: f } : { ...s, state: 'future', color: undefined, skip: false }); }
  b += OrbitSegs(PR, shown);
  shown.forEach((s, i) => { const st = STAGES[i]; if (tNow == null || i < cur) b += OutLabel(PR, s.mid, [{ t: st.skip ? 'skip' : fmt(st.t), fill: st.skip ? K.good : deltaColor(st.delta), size: 11 }], { pad: 14 }); });
  for (const m of MARKS) { if (tNow != null && m.i >= cur) continue; const [x, y] = pol(PR.cx, PR.cy, PR.r, segAngle(segs[m.i], m.f)); b += Marker(x, y, m.kind, { sel: m.id === 'detour' && tNow == null }).replace(/r="10"/g, 'r="8"').replace(/r="16"/g, 'r="13"'); }
  return { b, segs: shown, cur };
}
export function phoneScene(kind) {
  let b = PhoneHeader();
  if (kind === 'solve') {
    const upto = 4, elapsed = 8.42;
    const segs = layoutSegs(PR, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' }))).map((s, i) => i < upto ? { ...s, state: 'done' } : i === upto ? { ...s, state: 'current', fill: (elapsed - CUM[i - 1]) / STAGES[i].avg } : s);
    b += sans(195, 100, 'F2L · pair 4', { size: 17, fill: K.accent, w: 700, a: 'middle' });
    b += OrbitSegs(PR, segs);
    segs.forEach((s, i) => { if (i < upto) b += OutLabel(PR, s.mid, [{ t: fmt(STAGES[i].t), fill: deltaColor(STAGES[i].delta), size: 11 }], { pad: 14 }); });
    for (const m of MARKS.filter(m => m.i < upto)) { const [x, y] = pol(PR.cx, PR.cy, PR.r, segAngle(segs[m.i], m.f)); b += Marker(x, y, m.kind).replace(/r="10"/g, 'r="8"'); }
    b += Cube(195, 300, PS, 'f2l');
    b += pnum('8.42', 520, 92);
    b += `<rect x="108" y="560" width="174" height="28" rx="14" fill="${K.accentSoft}"/>` + tx(195, 579, 'pseudo pair, nice', { size: 12, fill: K.accent, w: 500, a: 'middle' });
    b += sans(195, 790, 'stop', { size: 15, fill: K.muted, w: 600, a: 'middle' });
    return b;
  }
  const past = kind === 'past', replay = kind === 'replay';
  if (past) b += chev(26, 90, 6, 'l', K.ink, 2) + sans(40, 95, 'history', { size: 14, fill: K.ink, w: 600 }) + sans(366, 95, '23 of 23', { size: 12, fill: K.muted, w: 500, a: 'end' });
  if (replay) b += chev(26, 90, 6, 'l', K.ink, 2) + sans(40, 95, 'results', { size: 14, fill: K.ink, w: 600 }) + sans(366, 95, 'replay · 1×', { size: 12, fill: K.muted, w: 500, a: 'end' });
  const ring = phoneRingResult(9, replay ? 7.42 : null);
  b += ring.b;
  b += Cube(195, 300, PS, replay ? 'f2l' : 'solved');
  if (replay) {
    b += pnum('7.42', 520, 84) + tx(290, 520, '/ 14.07', { size: 11, fill: K.muted });
    b += chev(100, 590, 9, 'l', K.muted, 2.4) + chev(110, 590, 9, 'l', K.muted, 2.4) + dot(195, 590, 28, K.ink) + pauseGlyph(195, 590, 10, K.bg) + chev(280, 590, 9, 'r', K.muted, 2.4) + chev(290, 590, 9, 'r', K.muted, 2.4);
    b += Chip(112, 640, '0.5×') + Chip(168, 640, '1×', { on: true }) + Chip(212, 640, '2×');
    b += `<rect x="88" y="700" width="214" height="30" rx="15" fill="${K.accentSoft}"/>` + star(108, 715, 5, K.good) + tx(120, 719, 'pseudo pair · tap to see', { size: 12, fill: K.accent, w: 500 });
    b += sans(195, 790, 'drag the ring to scrub', { size: 14, fill: K.muted, w: 500, a: 'middle' });
    return b;
  }
  b += pnum('14.07', 520, 84);
  b += tx(195, 552, '−0.96 vs ao12 · pb 12.41', { size: 12, fill: K.muted, a: 'middle' });
  b += Coach(32, 596, ['Pseudo pair 3 and the EO skip were', 'the highlights; the cross detour at', 'move 4 cost 0.6 s.'], { tag: 'coach', size: 16, lh: 24 });
  if (past) { b += Pill(24, 722, 342, 54, 'replay', { primary: true, size: 17 }); b += TextBtn(120, 806, 'review', { fill: K.ink }) + TextBtn(270, 806, 'more…'); }
  else { b += Pill(24, 722, 342, 54, 'next scramble', { primary: true, size: 17 }); b += TextBtn(120, 806, 'review', { fill: K.ink }) + TextBtn(270, 806, 'more…'); }
  return b;
}
function phones(a, bK) {
  let b = Phone(40, 28, phoneScene(a), { id: 'pa' }) + Phone(470, 28, phoneScene(bK), { id: 'pb' });
  return svgDoc(900, 900, `<rect width="900" height="900" fill="${K.canvas}"/>` + b);
}
export const a09 = () => phones('solve', 'results');
export const a12 = () => phones('past', 'replay');
