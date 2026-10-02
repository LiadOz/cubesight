/* global document */
// W-17 keycap pairs. The bevelled keycap is approved; this explores how a COMBINED key is written.
//   a = one cap holding both glyphs     b = two caps side by side
//   c = two caps joined by a connector  d = cap + separator + cap (for ranges and chords)
import { q, mount } from '../../_proto/common.js';
import * as S from '../../_proto/scenes.js';

const view = q.get('view') || 'matrix';
const boardId = q.get('id') || 'W-17';
const VARS = { a: 'one cap', b: 'two caps', c: 'joined by a connector', d: 'cap – cap' };

/** one keycap (the approved bevelled key) */
const k = (g, size = 's', st = '') => `<kbd class="key key--${size} ${st}">${g}</kbd>`;
/** a combined key. kind: pair | range | chord. down = index of the glyph that is pressed (b, c, d) or any form a. */
function cap(kind, glyphs, v, { size = 's', down = -1 } = {}) {
  const [g0, g1] = glyphs;
  const dn = (i) => (down === i ? 'is-down' : '');
  if (v === 'a') {
    const text = kind === 'range' ? `${g0}–${g1}` : kind === 'chord' ? `${g0} + ${g1}` : `${g0} ${g1}`;
    return k(text, size, down >= 0 ? 'is-down' : '');
  }
  if (v === 'b' || (v === 'd' && kind === 'pair')) return `<span class="kp">${k(g0, size, dn(0))}${k(g1, size, dn(1))}</span>`;
  if (v === 'c') return `<span class="kp kp--c">${k(g0, size, dn(0))}<i class="link"></i>${k(g1, size, dn(1))}</span>`;
  return `<span class="kp kp--d">${k(g0, size, dn(0))}<span class="sep">${kind === 'range' ? '–' : '+'}</span>${k(g1, size, dn(1))}</span>`;
}
const PAIR = ['[', ']'], ARROWS = ['←', '→'], RANGE = ['1', '4'], CHORD = ['shift', 'R'];
const cof = (n, html) => `<span data-co="${n}" style="display:inline-flex">${html}</span>`;
const kb = (capHtml, label) => `<span class="kbi">${capHtml}<span>${label}</span></span>`;
const bar = (...items) => `<div class="kbar">${items.join('')}</div>`;
const btn2 = (label, capHtml, extra = '') => `<span class="on-secondary ${extra}"><button type="button" class="btn btn--secondary"><span>${label}</span>${capHtml}</button></span>`;
const btn1 = (label, capHtml) => `<span class="on-primary"><button type="button" class="btn btn--primary btn--l"><span>${label}</span>${capHtml}</button></span>`;

/* ------------------------------------------------------------------ the matrix */
function matrixBoard() {
  const rows = [
    ['key bar', 'a pair, size S 20', (v) => bar(kb(cap('pair', PAIR, v), 'markers')), 1],
    ['key bar', 'a range', (v) => bar(kb(cap('range', RANGE, v), 'answers')), 2],
    ['key bar', 'arrows', (v) => bar(kb(cap('pair', ARROWS, v), 'step')), 3],
    ['key bar', 'a chord with shift', (v) => bar(kb(cap('chord', CHORD, v), 'redo')), 4],
    ['key bar, pressed', 'the half that is down', (v) => bar(kb(cap('pair', PAIR, v, { down: 1 }), 'markers')), 5],
    ['in a secondary button', 'size M 24', (v) => btn2('markers', cap('pair', PAIR, v, { size: 'm' })), 6],
    ['in a secondary button', 'a chord', (v) => btn2('redo', cap('chord', CHORD, v, { size: 'm' })), 6],
    ['in the primary button', 'the single cap for reference', (v) => btn1('next scramble', k('space', 'm') + (v === 'x' ? '' : '')), 7],
  ];
  const head = `<div></div>${Object.entries(VARS).map(([v, n]) => `<div class="ch">form ${v}: ${n}</div>`).join('')}`;
  const grid = rows.map(([h, sm, f, n], i) => `<div class="rh" ${i === 0 || rows[i - 1][3] !== n ? `data-co="${n}"` : ''}><b>${h}</b>${sm}</div>${Object.keys(VARS).map((v) => `<div>${f(v)}</div>`).join('')}`).join('');
  mount({
    id: boardId, name: 'combined keys: four ways to write a pair, a range and a chord', width: 1440,
    frame: `<div class="mx2">${head}${grid}</div>`, cols: 1,
    legend: [
      '<b>The pair in the key bar (S 20):</b> form a is the narrowest and the one the old proposal used; form b reads as two keys you can press; form c says they belong together; form d falls back to form b for pairs because there is nothing to put between them.',
      '<b>A range (1 to 4):</b> in form b and form c "1 4" or "1 – 4" does not say that 2 and 3 count too; only form a "1–4" and form d "1 – 4" with a visible dash read as a range.',
      '<b>Arrows:</b> in form a the two arrows share one cap, in form b to form d each is its own key, which matches the keyboard.',
      '<b>A chord (shift + R):</b> form a is one wide cap, form b puts two caps side by side with no hint they are pressed together, form c joins them, form d writes the plus.',
      '<b>Pressed:</b> only form b, form c and form d can sink the half that is down; form a must sink the whole cap, so a pair can no longer show which of the two is held.',
      '<b>Inside a button (M 24):</b> the cap keeps its lip on the quiet-fill secondary; form b to form d make the button about 28 px wider than form a.',
      '<b>Reference:</b> the single space cap in the cream primary, bevelled and unchanged by this choice.',
    ],
  });
}

/* ------------------------------------------------------------------ one variant in real contexts */
const crop = (html, y, h, label) => `<div><h5>${label}</h5><div class="crop" style="height:${h}px;width:1384px"><div class="in" style="top:${-y}px;left:-28px">${html}</div></div></div>`;
function variantBoard(v) {
  const results = S.results({
    actions: `${btn1('next scramble', k('space', 'm'))}<button class="btn btn--text btn--muted" type="button">review</button><button class="btn btn--text btn--muted" type="button">more…</button>`,
    keybar: bar(kb(k('space'), 'next scramble'), kb(cof(1, cap('pair', PAIR, v)), 'markers'), kb(k('esc'), 'back')),
    coach: false,
  });
  const ans = ['L-shape', 'T-shape', 'Dot', 'Line'].map((t) => `<button class="btn btn--secondary btn--choice" type="button" style="min-width:150px"><span>${t}</span></button>`).join('');
  const drill = S.drill({
    answers: ans, question: 'which OLL is this?', foot: '<span class="meta">case 13 of 20 · 1.84 s</span>',
    keybar: bar(kb(cof(2, cap('range', RANGE, v)), 'answers'), kb(k('s'), 'skip'), kb(k('esc'), 'quit')),
  });
  const help = `<div class="helpcard" data-co="4"><h4>keyboard shortcuts</h4>
    <div class="hl"><span>${k('space', 'm')}</span><span><b>start</b> and stop the timer</span></div>
    <div class="hl"><span>${cap('pair', PAIR, v, { size: 'm' })}</span><span><b>previous / next</b> marker</span></div>
    <div class="hl"><span>${cap('range', RANGE, v, { size: 'm' })}</span><span><b>answer</b> in a drill</span></div>
    <div class="hl"><span>${cap('pair', ARROWS, v, { size: 'm' })}</span><span><b>step</b> through the alg</span></div>
    <div class="hl"><span>${cap('chord', CHORD, v, { size: 'm' })}</span><span><b>redo</b> the last drill</span></div>
    <div class="hl"><span>${k('esc', 'm')}</span><span><b>back</b> or close</span></div></div>`;
  const btns = `<div><h5>buttons with a combined key inside</h5><div class="btnrow" data-co="3">${btn2('markers', cap('pair', PAIR, v, { size: 'm' }))}${btn2('redo', cap('chord', CHORD, v, { size: 'm' }))}${btn2('step', cap('pair', ARROWS, v, { size: 'm' }))}</div>
    <div style="height:18px"></div><h5>pressed: the real ] key is down</h5><div class="btnrow">${bar(kb(cap('pair', PAIR, v, { down: 1 }), 'markers'))}${btn2('markers', cap('pair', PAIR, v, { size: 'm', down: 1 }))}</div></div>`;
  const frame = `<div class="ctx">${crop(results, 800, 100, 'results (A-05), bottom: the key bar and the primary')}${crop(drill, 650, 250, 'drill (A-08), bottom: answers without their own caps, the bar says 1–4')}
    <div style="display:grid;grid-template-columns:660px 1fr;gap:34px;align-items:start"><div><h5>the help list</h5>${help}</div>${btns}</div></div>`;
  const notes = {
    a: ['<b>Key bar, pair in one cap:</b> <code>[ ]</code> is one cap; narrow and tidy, the way it was first drawn.', '<b>The range</b> <code>1–4</code> is one cap with the en dash inside.', '<b>Buttons:</b> the combined cap is a single wide key; the shortest button.', '<b>Help list:</b> <code>shift + R</code> becomes one wide cap, wider than the <code>space</code> cap above it.'],
    b: ['<b>Key bar, two caps:</b> <code>[</code> and <code>]</code> are two real keys, 4 px apart, the way the keyboard has them.', '<b>The range</b> is <code>1</code> and <code>4</code> as two caps; without a dash it can be read as "1 then 4".', '<b>Buttons:</b> two caps side by side; about 28 px wider than one cap.', '<b>Help list:</b> <code>shift</code> and <code>R</code> as two caps with only space between: the chord reads as two separate keys.'],
    c: ['<b>Key bar, joined caps:</b> a thin 8 px connector says "these two go together" without text.', '<b>The range</b> <code>1 ─ 4</code> reads as a span, but the same connector is also used for the pair and for shift + R, so it means three different things.', '<b>Buttons:</b> the connector adds 8 px to the two-cap width and has to be re-tinted on the cream primary.', '<b>Help list:</b> <code>shift ─ R</code> joined.'],
    d: ['<b>Key bar:</b> the pair falls back to two caps form b; there is nothing sensible to put between <code>[</code> and <code>]</code>.', '<b>The range</b> <code>1 – 4</code> has a visible dash between two caps, the clearest range.', '<b>Buttons:</b> the widest form, the separator takes about 16 px.', '<b>Help list:</b> <code>shift + R</code> with a written plus is how a shortcut is usually printed.'],
  };
  mount({ id: boardId, name: `form ${v}: ${VARS[v]}, in real contexts`, frame, legend: notes[v], cols: 1, width: 1440 });
}

/* ------------------------------------------------------------------ keys vs not keys */
function notKeysBoard() {
  const chips = (cls = '') => `<span class="${cls}" style="display:inline-flex;gap:8px"><button class="chip" aria-pressed="true" type="button">cross</button><button class="chip" aria-pressed="false" type="button">pairs</button><button class="chip" aria-pressed="false" type="button">EO</button></span>`;
  const row = (head, sub, good, bad, n) => `<div class="rh" ${n ? `data-co="${n}"` : ''}><b>${head}</b>${sub}</div><div>${good}</div><div class="bad">${bad}</div>`;
  const rows = [
    row('keyboard keys', 'the only bevelled thing', `${bar(kb(k('space'), 'next scramble'), kb(cap('pair', PAIR, 'b'), 'markers'), kb(k('esc'), 'back'))}`, `<span class="tag">(nothing: this is the right use)</span>`, 1),
    row('chips', 'W-05 filter and tag chips, ink', `${chips()}`, `${chips()}`, 2),
    row('badges and tags', 'count, PB, a case name', `<span class="badge badge--pb">PB</span><span class="badge">12 new</span><span class="badge">+2</span><span class="tagchip">OLL 21</span>`, `<span class="badge badge--pb">PB</span><span class="badge">12 new</span><span class="badge">+2</span><span class="tagchip">OLL 21</span>`, 3),
    row('buttons', 'W-04 quiet fill: flat; only the key inside is bevelled', `${btn1('next scramble', k('space', 'm'))}${btn2('review', '')}<button class="btn btn--text btn--muted" type="button">more…</button>`, `${btn1('next scramble', k('space', 'm'))}${btn2('review', '')}<button class="btn btn--text btn--muted" type="button">more…</button>`, 4),
    row('status and toast', 'W-16, a line and a pill', `<span class="stat"><i></i>GAN 356 i3 · 84%</span><span class="toast"><span>Solve saved · 12.41</span><span class="badge badge--pb">PB</span><button class="act" type="button">undo</button></span>`, `<span class="stat"><i></i>GAN 356 i3 · 84%</span><span class="toast"><span>Solve saved · 12.41</span><span class="badge badge--pb">PB</span><button class="act" type="button">undo</button></span>`, 5),
  ];
  const head = '<div></div><div class="hd ok">right: flat, as approved</div><div class="hd no">wrong: the same things bevelled (never do this)</div>';
  // the "wrong" column re-draws chips, badges, tags and buttons with a lip, so the reader sees what the rule forbids
  const frame = `<div class="nk">${head}${rows.join('')}</div>`;
  mount({
    id: boardId, name: 'what is NOT a keyboard key stays flat: chips, badges, tags, buttons, toast', width: 1440, frame, cols: 1,
    legend: [
      '<b>Only keyboard keys are bevelled,</b> so a bevel always means "press this key". Next to the lipped caps everything else is flat.',
      '<b>Chips</b> (ink selection) stay flat pills; a selected chip is a cream fill, never a lip.',
      '<b>Badges and tags</b> (PB, count, case name) stay flat; mono text alone does not make something a key.',
      '<b>Buttons</b> stay flat quiet-fill pills; only the cap inside a button is bevelled, and it is hidden on touch.',
      '<b>Status line and toast</b> stay flat; the toast action (undo) is a text action, not a key.',
    ],
  });
  document.getElementById('board').dataset.opt = '3';
  // the right-hand column draws the same widgets with a lip (the forbidden look)
  document.querySelectorAll('.bad .chip, .bad .badge, .bad .tagchip, .bad .btn, .bad .toast').forEach((el) => { el.style.boxShadow = 'inset 0 0 0 1px var(--b-hairline), 0 2px 0 var(--b-cube-body)'; el.style.borderRadius = '7px'; el.style.marginBottom = '3px'; });
}

({ matrix: matrixBoard, a: () => variantBoard('a'), b: () => variantBoard('b'), c: () => variantBoard('c'), d: () => variantBoard('d'), notkeys: notKeysBoard }[view] || matrixBoard)();
if (q.get('legend') === '0') document.querySelector('.legend')?.remove();
