// The design-system sheets and the flow storyboard: everything here is drawn with the same two components.
import * as L from './lib.mjs';
const { chev, pauseGlyph, K, tx, sans, arc, dot, line, star, pol, Cube, OrbitSegs, layoutSegs, OutLabel, Marker, Pill, TextBtn, Chip, chipW, Keys, Header, OrbitGlyph, STAGES, MARKS, CUM, MOVES, fmt, sgn, MV, svgDoc, resultSegs, colorSegs, segAngle, deltaColor, caret, HIST, histLabel, OLL_CASE, STATES, SessionRing } = L;

const kick = (x, y, s, c = K.accent) => tx(x, y, s, { size: 12, fill: c, w: 500, ls: 1 });
const h2 = (x, y, s) => sans(x, y, s, { size: 26, fill: K.ink, w: 700, ls: -.4 });
const p = (x, y, s, o = {}) => sans(x, y, s, { size: o.size || 14, fill: o.fill || K.muted, w: 500, a: o.a });
const rule = (y) => line(48, y, 1392, y, K.hair);
const scaled = (x, y, k, inner) => `<g transform="translate(${x} ${y}) scale(${k})">${inner}</g>`;

export function sysComponents() {
  let b = sans(48, 76, 'Orbit v3 · the design system', { size: 34, fill: K.ink, w: 700, ls: -.8 });
  b += p(48, 106, 'Two components carry every screen: the CUBE and the ORBIT. Five small pieces sit around them. Nothing else is allowed on a frame.', { size: 16 });
  // ---------- CUBE ----------
  b += rule(140) + kick(48, 172, 'COMPONENT 1 · CUBE') + h2(48, 208, 'one cube, five sizes, five states');
  const sizes = [['XS · 9', 9, 'compass'], ['S · 30', 30, 'glyph centre'], ['M · 70', 70, 'phone drills'], ['L · 130', 130, 'phone hero, cards'], ['XL · 215', 215, 'desktop hero: 430 px = 48 % of 900']];
  let x = 90;
  const cy = 372;
  [[x, 'XS', 9], [x + 100, 'S', 30], [x + 250, 'M', 70], [x + 470, 'L', 130]].forEach(([cx, n, s]) => { b += Cube(cx, cy, s, 'solved', { glow: s >= 70 }); });
  b += scaled(x + 800, cy, .5, Cube(0, 0, 215, 'solved'));
  sizes.forEach(([n, s, c], i) => { const cx = [x, x + 100, x + 250, x + 470, x + 800][i]; b += tx(cx, 536, n, { size: 14, fill: K.ink, w: 500, a: 'middle' }) + tx(cx, 556, c, { size: 11, fill: K.muted, a: 'middle' }); });
  b += tx(1160, 340, 'phone: XL becomes 118', { size: 12, fill: K.muted }) + tx(1160, 362, 'sticker gap 9 % (14 % below 50)', { size: 12, fill: K.muted }) + tx(1160, 384, 'plastic #1d1b18, F .86, R .72', { size: 12, fill: K.muted });
  const st = [
    ['live', 'solved', 'mirrors the cube in your hand', {}],
    ['case', OLL_CASE, 'a fixed case; unknown stickers dark', {}],
    ['replay', 'f2l', 'the position at the playhead', { head: true }],
    ['highlight', 'inspect', 'pieces outlined: teal focus, amber wrong', { hl: { F: [6, 7, 8], R: [6, 7, 8] } }],
    ['cue', 'midScramble', 'the face to turn is lit; the move is named beside it', { hl: { U: [0, 1, 2, 3, 4, 5, 6, 7, 8] }, cue: true }],
  ];
  st.forEach(([n, state, cap, o], i) => {
    const cx = 150 + i * 270;
    b += Cube(cx, 676, 56, state, { highlight: o.hl });
    if (o.head) b += line(cx - 60, 776, cx + 60, 776, K.track, 3).replace('<line', '<line stroke-linecap="round"') + line(cx - 60, 776, cx + 8, 776, K.accent, 3).replace('<line', '<line stroke-linecap="round"') + dot(cx + 8, 776, 6, K.accent);
    if (o.cue) b += sans(cx + 80, 686, 'U', { size: 40, fill: K.accent, w: 600 });
    b += sans(cx, 810, n, { size: 16, fill: K.ink, w: 700, a: 'middle' }) + sans(cx, 832, cap, { size: 12, fill: K.muted, a: 'middle' });
  });
  b += tx(48, 868, 'states are layered on one cube: live (the cube) + case (a drill) + replay (a position) are sources; highlight and cue are overlays on any of them.', { size: 12, fill: K.muted });
  // ---------- ORBIT ----------
  b += rule(892) + kick(48, 924, 'COMPONENT 2 · ORBIT') + h2(48, 960, 'one ring, one API, a new meaning per flow');
  const R0 = { cx: 330, cy: 1200, r: 150, start: 0, sweep: 360 };
  const segs = colorSegs(resultSegs(R0));
  b += OrbitSegs(R0, segs) + caret(R0, 0, 10, K.faint, 1.5);
  for (const m of MARKS) { const [mx, my] = pol(R0.cx, R0.cy, R0.r, segAngle(segs[m.i], m.f)); b += Marker(mx, my, m.kind).replace(/r="10"/g, 'r="8"'); }
  b += Cube(330, 1200, 'M', 'solved');
  // labels: outer label rule shown for pair 2
  b += OutLabel(R0, segs[2].mid, [{ t: 'p2', fill: K.muted }, { t: '1.96', fill: K.ink, w: 500, size: 15 }, { t: '+0.04', fill: K.ink, size: 12 }, { t: 'best pair chosen', g: 'good' }], { pad: 16 });
  // annotations
  const note = (tx_, ty, s, fromDeg, ra = R0.r, anchor = 'start') => { const [ax, ay] = pol(R0.cx, R0.cy, ra, fromDeg); return line(ax, ay, tx_ + (anchor === 'end' ? 4 : -4), ty - 4, K.faint, 1, ' stroke-dasharray="2 3"') + tx(tx_, ty, s, { size: 12, fill: K.muted, a: anchor }); };
  b += note(300, 1032, 'segment: weight, state, label', 300, R0.r, 'end');
  b += note(286, 1000, 'start tick, playhead, countdown', 2, R0.r, 'end');
  b += note(48, 1334, 'gap: 2.5° between segments', 229, R0.r);
  b += note(520, 1334, 'marker: good (spark) · bad (!)', 193, R0.r);
  b += note(48, 1196, 'centre: the cube', 270, 60);
  b += tx(520, 1360, 'outer label: name · value · delta · marker line', { size: 12, fill: K.muted });
  // state table
  const states = [
    ['future', 'track, 3 px', 'still to come', K.track, 3],
    ['current', 'teal, 8 px + dot', 'live stage, move, case', K.accent, 8],
    ['done', 'ink, 6 px', 'finished (delta colours)', K.ink, 6],
    ['skipped', 'hairline + spark', 'EO / PLL skip', K.good, 3],
    ['good', 'teal, 6 px', 'faster · right answer', K.good, 6],
    ['bad', 'amber, 6 px', 'slower · wrong answer', K.warn, 6],
    ['wrong', 'amber, 8 px', 'the move just got wrong', K.warn, 8],
  ];
  b += kick(660, 1012, 'SEGMENT STATES');
  states.forEach(([n, d, u, c, w], i) => { const y = 1050 + i * 42; b += arc(700, y + 4 + 120, 120, -18, 18, { w, c, cap: 'round' }); b += sans(790, y, n, { size: 15, fill: K.ink, w: 700 }) + tx(870, y, d, { size: 12, fill: K.muted }) + tx(870, y + 17, u, { size: 12, fill: K.faint }); });
  // weight rules + API
  b += kick(1090, 1012, 'API');
  const code = ['Orbit({ cx, cy, r, start, sweep,', '  segs: [{ key, weight, state,', '           fill?,          // 0..1 on current', '           label?, value?, delta?,', "           marker?: 'good' | 'bad' }],", '  caret?: deg })', '', 'weight   seconds | your avg | 1 each', 'sweep    360 (ring) | 290 (dial)', 'label    outside, along the radius', 'glyph    r 14 · 17 (row) · 44 (card)'];
  code.forEach((l, i) => { b += tx(1090, 1048 + i * 20, l, { size: 12, fill: i < 6 ? K.ink : K.muted }); });
  b += tx(1090, 1048 + 11 * 20 + 14, 'glyphs r 14 · 17 · 44', { size: 12, fill: K.faint });
  [14, 17, 44].forEach((r, i) => { b += OrbitGlyph(1110 + [0, 52, 120][i], 1344, r, HIST[22].steps, { marks: HIST[22].marks }); });
  // ---------- shared pieces ----------
  return svgDoc(1440, 1400, b);
}
export function sysPieces() {
  let b = sans(48, 76, 'Orbit v3 · the five shared pieces', { size: 34, fill: K.ink, w: 700, ls: -.8 });
  b += p(48, 106, 'Header, key bar, coach line, actions, chip. They are the only chrome. Every frame in the gallery is the cube, the orbit and these.', { size: 16 });
  b += rule(140);
  // header
  b += kick(48, 176, '1 · HEADER') + p(48, 200, 'wordmark, five sections, one status. Dims to 30 % while a solve is running.');
  b += scaled(48, 224, .8, Header(1440, { active: 'solve' }));
  b += p(48, 290, 'In direction C the section links live on the outer ring and the header keeps a compass (cube XS + five dots).');
  // key hint bar
  b += rule(330) + kick(48, 366, '2 · KEY BAR') + p(48, 390, 'one row, bottom left, at most 3 keys. Never a button row.');
  b += Keys(48, 440, [['space', 'next scramble'], ['[ ]', 'markers'], ['esc', 'back']]);
  // coach line
  b += rule(480) + kick(48, 516, '3 · COACH LINE') + p(48, 540, 'one sentence, praise first, tied to ONE ring marker (same glyph, same colour). Tap another marker to swap the sentence.');
  b += Marker(58, 590, 'bad') + tx(80, 595, 'cross detour · move 4', { size: 12, fill: K.warn, w: 500 });
  ['Pseudo pair 3 and the EO skip were the highlights;', 'the cross detour at move 4 cost 0.6 s, 6 moves existed.'].forEach((l, i) => { b += sans(48, 634 + i * 28, l, { size: 19, fill: K.ink, w: 500 }); });
  b += Marker(700, 590, 'good') + tx(722, 595, 'pseudo pair · pair 3', { size: 12, fill: K.good, w: 500 });
  ['Pseudo pair saved about 3 moves: D′ first, then a short trigger.'].forEach((l, i) => { b += sans(700, 634 + i * 28, l, { size: 19, fill: K.ink, w: 500 }); });
  // actions
  b += rule(700) + kick(48, 736, '4 · ACTIONS') + p(48, 760, 'one primary pill, at most two quiet text actions. Everything else lives behind “more…”.');
  b += Pill(48, 786, 200, 48, 'next scramble', { primary: true, key: 'space', size: 16 }) + TextBtn(284, 817, 'review', { fill: K.ink, a: 'start' }) + TextBtn(354, 817, 'more…', { a: 'start' });
  b += Pill(560, 786, 170, 48, 'replay', { primary: true, key: 'space', size: 16 }) + TextBtn(766, 817, 'review', { fill: K.ink, a: 'start' }) + TextBtn(836, 817, 'more…', { a: 'start' });
  b += tx(1000, 805, 'more… = +2 · DNF · pin · share · delete · export', { size: 12, fill: K.muted });
  // chip
  b += rule(880) + kick(48, 916, '5 · CHIP') + p(48, 940, 'a filter or a setting value: one pill, one line. Teal fill = on. Used for filters, speed, sessions.');
  let x = 48; [['all sessions', 1], ['speed', 0], ['cube', 0], ['0.5×', 0], ['1×', 1], ['2×', 0]].forEach(([c, on]) => { b += Chip(x, 966, c, { on }); x += chipW(c) + 8; });
  b += rule(1030) + kick(48, 1066, 'THE RULE') + sans(48, 1100, 'If a frame needs something that is not one of these seven things, the frame is wrong.', { size: 20, fill: K.ink, w: 600 });
  b += p(48, 1130, 'No cards, no bordered panels, no tables, no bars, no charts, no chip strips, no second ring that means something else.', { size: 15 });
  return svgDoc(1440, 1190, b);
}

// ---------- mini rings for the flow map ----------
const MR = (cx, cy, r = 84) => ({ cx, cy, r, start: 0, sweep: 360 });
function ringScramble(sp) { const segs = layoutSegs(sp, MOVES.map((m, i) => ({ key: i, w: 1, state: i < 12 ? 'done' : i === 12 ? 'current' : 'future' })), { gap: 3 }); return OrbitSegs(sp, segs.map(s => s.state === 'done' ? { ...s, w6: 5, color: K.faint } : s)); }
function ringInspect(sp) { const per = 360 / 17; const a15 = 15 * per, aN = 8 * per; return arc(sp.cx, sp.cy, sp.r, 0, a15, { w: 3, c: K.track }) + arc(sp.cx, sp.cy, sp.r, a15, 360, { w: 7, c: K.warnSoft, cap: 'butt' }) + arc(sp.cx, sp.cy, sp.r, aN, a15, { w: 8, c: K.accent }) + dot(...pol(sp.cx, sp.cy, sp.r, aN), 6, K.accent) + caret(sp, 8 * per, 9, K.ink, 2); }
function ringSolving(sp) { const segs = layoutSegs(sp, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' }))).map((s, i) => i < 4 ? { ...s, state: 'done' } : i === 4 ? { ...s, state: 'current', fill: .56 } : s); return OrbitSegs(sp, segs); }
function ringResults(sp, marks = true) { const segs = colorSegs(resultSegs(sp)); let o = OrbitSegs(sp, segs); if (marks) for (const m of MARKS) { const [x, y] = pol(sp.cx, sp.cy, sp.r, segAngle(segs[m.i], m.f)); o += Marker(x, y, m.kind).replace(/r="10"/g, 'r="6"').replace(/r="16"/g, 'r="10"').replace('font-size="14"', 'font-size="10"').replace(/ y="[\d.]+"/, m2 => m2); } return o; }
function ringAlg(sp) { const groups = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10], [11, 12, 13, 14]]; const n = 15; const mvs = MV("R U R′ U′ R′ F R2 U′ R′ U′ R U R′ F′ x").split(' ').slice(0, n); let a = 4; const per = (360 - 4 * 8 - 11 * 1.2) / n; let o = ''; groups.forEach((g, gi) => { g.forEach((mi, k) => { const a0 = a, a1 = a + per; o += arc(sp.cx, sp.cy, sp.r, a0, a1, { w: mi < 6 ? 6 : mi === 6 ? 8 : 3, c: mi < 6 ? K.ink : mi === 6 ? K.accent : K.track, cap: 'butt' }); a = a1 + 1.2; }); a += 8 - 1.2; }); return o; }
function ringDrill(sp) { const res = ['ok', 'ok', 'ok', 'bad', 'ok', 'ok', 'ok', 'ok', 'ok', 'bad', 'ok', 'ok']; const segs = layoutSegs(sp, Array.from({ length: 20 }, (_, i) => ({ key: i, w: 1, state: i < 12 ? 'done' : i === 12 ? 'current' : 'future', fill: .6 })), { gap: 3 }).map((s, i) => i < 12 ? { ...s, color: res[i] === 'ok' ? K.ink : K.warn, w6: 5 } : s); return OrbitSegs(sp, segs); }
function ringTimer(sp) { return ringInspect({ ...sp, r: sp.r }) + arc(sp.cx, sp.cy, sp.r - 22, 0, 250, { w: 8, c: K.accent }) + arc(sp.cx, sp.cy, sp.r - 22, 250, 357, { w: 3, c: K.track }) + dot(...pol(sp.cx, sp.cy, sp.r - 22, 250), 5.5, K.accent); }
function ringHistory(sp) { let o = ''; [[0, 14, 0], [22, 9, 3], [44, 12, 7], [66, 11, 11]].forEach(([dr, n, seed], i) => { const sol = Array.from({ length: n }, (_, k) => ({ t: 12.5 + ((k * 37 + seed * 13) % 70) / 10, pen: (k * 5 + seed) % 11 === 0 ? 'DNF' : undefined })); o += SessionRing(sp.cx, sp.cy, sp.r - dr, sol, { w: 6 }); }); return o; }
function ringProgress(sp) { const segs = layoutSegs(sp, STAGES.map(s => ({ key: s.key, w: s.avg * (s.key === 'p4' ? 1.2 : 1), state: 'done' })), { gap: 3 }); let o = OrbitSegs(sp, segs.map((s, i) => ({ ...s, w6: 8, color: ['cross', 'p1', 'p2', 'p3', 'p4', 'eo', 'co', 'cp', 'ep'][i] === 'p4' ? K.warn : [0, 1, 3, 8].includes(i) ? K.good : K.ink }))); const inner = { ...sp, r: sp.r - 16 }; return o + OrbitSegs(inner, layoutSegs(inner, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' })), { gap: 3 }).map(s => ({ ...s, w6: 2, color: K.faint }))); }
const FLOWS = [
  ['guided scramble', 'moves are the segments', ['weight 1 each', 'done dim · current teal · wrong amber', 'labels: the move glyphs, on the ring'], ['the scramble text strip beside the cube', 'chip strips of moves'], ringScramble, 'midScramble'],
  ['inspection', 'zones are the segments', ['0–15 s remaining = current, 15–17 s +2 amber, DNF stub hatched', 'caret = now; 8 s and 12 s ticks'], ['the separate timer ring and the digits-only countdown'], ringInspect, 'scrambled'],
  ['solving', 'stages are the segments', ['weight = your average (the pace map)', 'done ink + split · current fills teal · skipped spark', 'labels: name, split, delta'], ['split bars, TPS chart, “now” text rows'], ringSolving, 'f2l'],
  ['results', 'the same stages, by time spent', ['weight = seconds you spent', 'colour = delta · markers good AND bad', 'one coach sentence ties to one marker'], ['split table, split bars, donut, TPS chart, chip strip, coach card'], r => ringResults(r), 'solved'],
  ['alg playback', 'moves, grouped by trigger', ['weight 1 each; a wide gap between groups', 'current move teal; the rest of the alg is track', 'label: the group name once, not four labels'], ['the alg-page ring with “group 1…4” labels and the move chip strip'], ringAlg, 'solved'],
  ['drill round', 'the round’s cases', ['weight 1 each; ink right, amber wrong, teal current', 'answers are chips on the outer ring or the rail', 'combo and avg are two numbers'], ['bordered round panel with stats row and progress text'], ringDrill, OLL_CASE],
  ['manual timer', 'inspection ring, then the solve', ['outer: inspection zones. inner: one segment, the solve', 'the cube shows the scramble case'], ['bordered card, scramble chip strip and transport buttons'], ringTimer, OLL_CASE],
  ['history', 'sessions are concentric rings', ['a ring per session: one tick per solve', 'colour = faster / slower than that session’s average', 'a solve row = its own mini orbit (r 17)'], ['select list, separate mini cube, scrub slider'], ringHistory, null],
  ['progress', 'where your time goes', ['one ring: the average split per stage over the period', 'colour = change vs the period before; inner hairline = last period', 'tap an arc to open that stage’s drill'], ['“where your time goes” card, stat cards, sparklines'], ringProgress, 'solved'],
];
const wrap = (str, n) => { const out = []; let cur = ''; for (const w of str.split(' ')) { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; };
export function sysFlows() {
  let b = sans(48, 76, 'Orbit v3 · every flow is the same ring', { size: 34, fill: K.ink, w: 700, ls: -.8 });
  b += p(48, 106, 'Same component, nine meanings. Left: the ring as it renders. Right: what the segments are, and which of today’s one-off components it replaces.', { size: 16 });
  FLOWS.forEach(([name, tag, lines, repl, fn, cube], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x0 = 48 + col * 686, y0 = 150 + row * 236;
    const sp = MR(x0 + 100, y0 + 96, 84);
    b += fn(sp);
    if (cube) b += Cube(sp.cx, sp.cy, 32, cube, { glow: false });
    const X = x0 + 222;
    b += sans(X, y0 + 34, name, { size: 20, fill: K.ink, w: 700 }) + tx(X, y0 + 58, tag, { size: 12, fill: K.accent });
    let yy = y0 + 88;
    lines.forEach(l => { wrap(l, 58).forEach(w => { b += tx(X, yy, w, { size: 11.5, fill: K.muted }); yy += 18; }); });
    yy += 8; b += tx(X, yy, 'replaces', { size: 11, fill: K.warn }); yy += 18;
    repl.forEach(l => { wrap(l, 58).forEach(w => { b += tx(X, yy, w, { size: 11, fill: K.faint }); yy += 17; }); });
    b += line(x0, y0 + 208, x0 + 650, y0 + 208, '#24221e');
  });
  const x0 = 48 + 686, y0 = 150 + 4 * 236;
  b += sans(x0 + 4, y0 + 34, 'what never changes', { size: 20, fill: K.ink, w: 700 });
  ['the cube sits in the centre, same position, same plastic', 'strokes 3 / 6 / 8 px; state colours teal, ink, amber', 'labels outside, along the radius; markers on the ring', 'one number, one sentence, at most three actions'].forEach((l, k) => { b += tx(x0 + 4, y0 + 66 + k * 22, l, { size: 12, fill: K.muted }); });
  return svgDoc(1440, 1400, b);
}

// ---------- the flow storyboard ----------
export function flowBoard() {
  let b = sans(48, 70, 'One flow: solve, results, history, a drill, back', { size: 32, fill: K.ink, w: 700, ls: -.7 });
  b += p(48, 100, 'The cube and the orbit never leave. They resize, re-segment and move; the page does not swap.', { size: 16 });
  const PW = 252, gap = 18, y0 = 140, ph = 650;
  const panels = ['1 · solving', '2 · results', '3 · history', '4 · a drill', '5 · back to solve'];
  const caps = [
    ['the ring is the live clock;', 'stages fill as you solve'],
    ['same ring, same cube.', 'segments re-size to time spent;', 'markers land; one sentence'],
    ['the ring shrinks into a glyph', 'on its row. tap a row: the', 'glyph grows back to this frame'],
    ['the ring is re-segmented as', 'the round’s 20 cases; the', 'cube shows the case'],
    ['segments go back to your', 'average (the pace map).', 'the cube is solved again'],
  ];
  const trans = ['ring re-weights, 300 ms', 'ring contracts to a glyph, 320 ms', 'ring swaps meaning, 260 ms', 'ring re-weights to averages, 300 ms'];
  panels.forEach((name, i) => {
    const x0 = 48 + i * (PW + gap);
    b += `<rect x="${x0}" y="${y0}" width="${PW}" height="${ph}" rx="20" fill="none" stroke="${K.hair}"/>`;
    b += tx(x0 + 18, y0 + 30, name, { size: 12, fill: K.accent, w: 500 });
    const cx = x0 + PW / 2, cy = y0 + 190;
    const sp = { cx, cy, r: 96, start: 0, sweep: 360 };
    if (i === 0) {
      const segs = layoutSegs(sp, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' }))).map((s, k) => k < 4 ? { ...s, state: 'done' } : k === 4 ? { ...s, state: 'current', fill: .56 } : s);
      b += OrbitSegs(sp, segs) + Cube(cx, cy, 44, 'f2l', { glow: false });
      b += sans(cx, y0 + 380, '8.42', { size: 56, fill: K.ink, w: 300, a: 'middle', ls: -2 }) + tx(cx, y0 + 404, 'F2L · pair 4', { size: 12, fill: K.accent, a: 'middle' });
    } else if (i === 1) {
      b += ringResults(sp) + Cube(cx, cy, 44, 'solved', { glow: false });
      b += sans(cx, y0 + 380, '14.07', { size: 56, fill: K.ink, w: 300, a: 'middle', ls: -2 }) + tx(cx, y0 + 404, '−0.96 vs ao12', { size: 12, fill: K.muted, a: 'middle' });
      b += sans(cx, y0 + 436, 'Pseudo pair 3 and the EO skip', { size: 12.5, fill: K.ink, w: 500, a: 'middle' }) + sans(cx, y0 + 454, 'were the highlights; the cross', { size: 12.5, fill: K.ink, w: 500, a: 'middle' }) + sans(cx, y0 + 472, 'detour cost 0.6 s.', { size: 12.5, fill: K.ink, w: 500, a: 'middle' });
      b += Pill(cx - 70, y0 + 492, 140, 34, 'next scramble', { primary: true, size: 13 });
    } else if (i === 2) {
      b += tx(x0 + 18, y0 + 60, 'history', { size: 12, fill: K.muted });
      [22, 21, 20, 19, 18].forEach((hi, k) => {
        const yy = y0 + 106 + k * 62, sel = k === 0;
        if (sel) b += `<rect x="${x0 + 10}" y="${yy - 28}" width="${PW - 20}" height="56" rx="12" fill="${K.surface}"/>`;
        b += OrbitGlyph(x0 + 54, yy, 20, HIST[hi].steps, { marks: HIST[hi].marks });
        if (sel) b += Cube(x0 + 54, yy, 9, 'solved', { glow: false });
        b += sans(x0 + 96, yy + 8, histLabel(HIST[hi]), { size: 22, fill: K.ink, w: 600 }) + tx(x0 + PW - 20, yy + 5, ['17:33', '17:29', '17:24', '17:20', '17:17'][k], { size: 11, fill: K.faint, a: 'end' });
      });
    } else if (i === 3) {
      b += ringDrill(sp) + Cube(cx, cy, 44, OLL_CASE, { glow: false });
      b += sans(cx, y0 + 376, 'which OLL is this?', { size: 17, fill: K.ink, w: 700, a: 'middle' });
      [['1', '21'], ['2', '27']].forEach(([k, n], q) => { b += `<rect x="${x0 + 18 + q * 112}" y="${y0 + 396}" width="104" height="34" rx="17" fill="${K.s2}"/>` + sans(x0 + 70 + q * 112, y0 + 418, 'OLL ' + n, { size: 13, fill: K.ink, w: 700, a: 'middle' }); });
      b += tx(cx, y0 + 460, 'case 13 of 20 · combo ×7', { size: 12, fill: K.muted, a: 'middle' });
    } else {
      const segs = layoutSegs(sp, STAGES.map(s => ({ key: s.key, w: s.avg, state: 'future' })));
      b += OrbitSegs(sp, segs) + Cube(cx, cy, 44, 'solved', { glow: false });
      b += sans(cx, y0 + 380, '0.00', { size: 56, fill: K.faint, w: 300, a: 'middle', ls: -2 });
      b += Pill(cx - 70, y0 + 400, 140, 34, 'start', { primary: true, size: 13 });
      b += tx(cx, y0 + 470, 'ao5 14.62 · pb 12.41', { size: 12, fill: K.muted, a: 'middle' });
    }
    caps[i].forEach((l, k) => { b += sans(x0 + 18, y0 + ph - 18 - (caps[i].length - 1 - k) * 18, l, { size: 12, fill: K.muted, w: 500 }); });
    if (i < 4) { const ax = x0 + PW + gap / 2; b += `<path d="M${ax - 5} ${y0 + 200 - 6}l8 6 -8 6" fill="none" stroke="${K.accent}" stroke-width="2" stroke-linecap="round"/>`; }
  });
  b += tx(48, 824, 'persistent: the cube at the same screen position, the ring at the same radius, the header, the key bar. changing: segment weights, labels, one number, one sentence, ≤ 3 actions.', { size: 12, fill: K.muted });
  return svgDoc(1440, 860, b);
}
