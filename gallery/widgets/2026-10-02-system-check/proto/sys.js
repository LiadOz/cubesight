/* global document, window */
// System check: the approved widgets together on the same screens.
//   ink selection controls (W-05..08, W-28) + quiet-fill buttons (W-04) + bevelled keycaps (W-17)
//   + the W-16 bottom-right status/toast + the W-21 Orbit labels (desktop) / wrapped sequence (phone)
import { q, mount, header, cubeSVG, orbitSVG, polar, arcPath, resultsSegs, resultsMarkers } from '../../_proto/common.js';
import * as S from '../../_proto/scenes.js';
import { build, runs, ringHtml, SCR, TPERM, TSECS, desc } from '../../_proto/moves-kit.js';

const UI = window.UI;
const view = q.get('view') || 'd1';
const boardId = q.get('id') || 'SC';

/* ---------------------------------------------------------------- small builders */
const abs = (style, html, extra = '') => `<div class="abs" ${extra} style="${style}">${html}</div>`;
const k = (g, size = 's') => `<kbd class="key key--${size}">${g}</kbd>`;
const kp = (a, b, size = 's') => `<span class="kp">${k(a, size)}${k(b, size)}</span>`;   // provisional: pairs as two caps (form b), still open
const kbi = (c, l) => `<span class="kbi">${c}<span>${l}</span></span>`;
const kbar = (...a) => `<div class="kbar">${a.join('')}</div>`;
const co = (n) => (n ? `data-co="${n}"` : '');
const primary = (label, cap = '', n = 0, size = 'btn--l') => `<span class="on-primary" ${co(n)}><button class="btn btn--primary ${size}" type="button"><span>${label}</span>${cap}</button></span>`;
const secondary = (label, cap = '', n = 0, size = '') => `<span class="on-secondary" ${co(n)}><button class="btn btn--secondary ${size}" type="button"><span>${label}</span>${cap}</button></span>`;
const textBtn = (label, n = 0) => `<button class="btn btn--text btn--muted" type="button" ${co(n)}>${label}</button>`;
const stat = (txt) => `<span class="st"><i class="g-dot"></i>${txt}</span>`;
const toast = (txt, badge = '', act = '', n = 0) => `<span class="toast ${act ? 'has-act' : ''}" ${co(n)}><span>${txt}</span>${badge ? `<span class="badge badge--pb">${badge}</span>` : ''}${act ? `<button class="act" type="button">${act}</button>` : ''}</span>`;
const chips = (items, n = 0) => `<span class="row" style="gap:8px;flex-wrap:wrap" ${co(n)}>${items.map(([l, on]) => UI.chip(l, { sel: on })).join('')}</span>`;
const choice = (label, key, o = {}) => `<button type="button" class="choice ${o.cls || ''}" ${o.sel ? 'aria-pressed="true"' : ''} ${co(o.co)}><kbd class="key key--s choice__kc">${key}</kbd><span>${label}</span></button>`;
const mono = (t) => `<div class="lab-mono">${t}</div>`;
const miniRun = (M, max) => { const items = max ? M.items.slice(0, max) : M.items; return `<div class="mini">${runs(items)}${max && M.items.length > max ? `<span class="rest">… +${M.items.length - max}</span>` : ''}</div>`; };

const SCRM = build({ moves: SCR, cur: -1 });
const afterMount = () => { document.getElementById('board').dataset.opt = '3'; };

/* ---------------------------------------------------------------- D1: solve idle (scramble ready) + settings drawer */
function d1() {
  const M = build({ moves: SCR, cur: 0 });
  const R = ringHtml(M, { W: 1440, H: 900, cx: 720, cy: 420, r: 290, labels: true, Rl: 30 });
  const drawer = `<div class="drawer"><h2>settings<small>solve</small></h2>
    <div>${mono('inspection')}${UI.seg('inspection', ['15 s', '∞', 'off'], 0)}</div>
    <div>${mono('focus')}${UI.seg('focus', ['speed', 'flow', 'learning'], 0)}</div>
    <div>${mono('hints')}<div style="display:grid;gap:2px;margin-top:6px">${UI.sw('pseudo pairs', true, { row: true })}${UI.sw('WCA penalties', false, { row: true, sub: '+2 and DNF from inspection' })}${UI.sw('cross hint', true, { row: true })}</div></div>
    <div data-co="3">${mono('show on the ring')}<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">${[['cross', 1], ['pairs', 1], ['EO', 0], ['skips', 1], ['detours', 0]].map(([l, on]) => UI.chip(l, { sel: !!on })).join('')}</div></div>
    <div>${mono('case colours')}<div style="margin-top:8px">${UI.sel('case colours', ['yellow top', 'white top', 'yellow or white'], 0)}</div></div>
    <div class="row" style="margin-top:6px;justify-content:space-between">${secondary('reset to defaults', '', 4, 'btn--s')}${textBtn('close')}</div></div>`;
  const frame = `<div class="o1"><div class="frame">
    ${header()}${R.svg}
    <svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(720, 420, 205)}</svg>${R.html}
    <div class="clock dim" style="top:668px;--clock-size:112px;color:var(--b-faint)">0.00</div>
    <div class="sub" style="top:790px">scramble ready · 20 moves · follow the lit face</div>
    ${abs('left:0;width:1440px;top:828px;display:flex;justify-content:center', primary('start', k('space', 'm'), 2))}
    ${abs('left:48px;bottom:16px', kbar(kbi(k('tab'), 'settings'), kbi(k('esc'), 'command')))}
    <div class="scrim" style="left:0;top:0;right:392px;bottom:0"></div>
    ${drawer}
    ${abs('right:424px;bottom:18px;z-index:7', toast('cross hint on', '', 'undo', 5))}
    ${abs('left:48px;top:100px', `<div style="font-size:22px;font-weight:600">guided scramble</div><div class="lab-mono" style="margin-top:4px" data-co="1">labels on the Orbit · move 1 of 20</div>`)}
  </div></div>`;
  mount({
    id: boardId, name: 'solve, scramble ready, settings open (desktop 1440 x 900)', frame, cols: 1, legend: [
      '<b>W-21 labels on the Orbit:</b> the scramble is on the ring (current move a pill), exactly the approved desktop form; sections would only be wider gaps.',
      '<b>W-04 primary:</b> the one cream pill on the screen, with the W-17 bevelled space cap inside. It is 48 px high and the only filled cream thing outside the drawer.',
      '<b>Ink chips (W-05):</b> selected = cream fill, 32 px high, in the drawer next to the segmented control and switches, which share the same ink.',
      '<b>W-04 secondary and text:</b> quiet fill (reset to defaults) and a text button (close); no second bright button.',
      '<b>W-16:</b> the toast sits in the bottom-right slot, moved left of the open drawer, with one text action.',
    ],
  });
  afterMount();
}

/* ---------------------------------------------------------------- D2: results */
function d2() {
  const tail = SCRM;
  const frame = S.results({
    actions: `${primary('next scramble', k('space', 'm'), 2)}${textBtn('review', 0)}${textBtn('more…', 0)}`,
    keybar: kbar(kbi(kp('[', ']'), 'markers'), kbi(k('esc'), 'back')),
    meta: '', coach: true,
    overlay: `<div class="o3">${abs('left:48px;top:98px', `<div class="lab-mono">scramble · solve 23</div><div style="margin-top:8px">${miniRun(tail, 12)}</div>`, co(1))}</div>
      ${abs('right:48px;top:96px;width:300px;display:grid;justify-items:end;gap:8px', `<div class="lab-mono">show on the ring</div>${chips([['cross', 1], ['pairs', 1], ['EO', 0], ['skips', 1], ['detours', 0]], 3)}`)}
      ${abs('right:48px;bottom:16px;z-index:7', toast('Solve saved · 12.41', 'PB', 'undo', 4))}`,
  });
  mount({
    id: boardId, name: 'results (desktop 1440 x 900)', frame, cols: 1, legend: [
      '<b>W-21 mini form:</b> the scramble as one line of text at the top left, sections and undo only as extra space; the Orbit itself shows stage labels here.',
      '<b>W-04 primary:</b> cream pill with the bevelled space cap; review and more… are text buttons; never a second bright button.',
      '<b>Ink chips:</b> the five ring toggles; three are on (cream), two off (surface fill). A cream selected chip next to a cream primary is the risk checked in SC-31.',
      '<b>W-16 toast:</b> bottom-right slot, a PB badge (flat, not a key) and one text action.',
      '<b>W-17:</b> the key bar bottom-left uses bevelled caps only for real keys; the [ ] pair is drawn as two caps for now (still open, see the keycap-pairs post).',
    ],
  });
  afterMount();
}

/* ---------------------------------------------------------------- D3: a drill round */
function d3() {
  const answers = [choice('L-shape', 1), choice('T-shape', 2, { sel: true, co: 1 }), choice('Dot', 3), choice('Line', 4)].join('');
  const frame = S.drill({
    answers, question: 'which OLL is this?',
    keybar: kbar(kbi(k('s'), 'skip'), kbi(k('esc'), 'quit')),
    foot: '<span class="meta">case 13 of 20 · 1.84 s</span>',
    overlay: `${abs('right:48px;top:214px;display:grid;justify-items:end;gap:8px', `<div class="lab-mono">round</div>${UI.seg('round', ['5', '10', '20'], 2)}`, co(2))}
      ${abs('right:48px;bottom:16px;z-index:7', toast('Marked for review', '', 'undo', 3))}
      ${abs('left:48px;top:400px;display:grid;gap:8px', `<div class="lab-mono">cases</div>${chips([['OLL', 1], ['PLL', 0]], 4)}`)}`,
  });
  mount({
    id: boardId, name: 'a drill round (desktop 1440 x 900)', frame, cols: 1, legend: [
      '<b>Ink choice (W-28):</b> the picked answer is cream; the number keys are bevelled caps on the buttons (the same W-17 cap).',
      '<b>Segmented (W-06):</b> round length, ink thumb, the same cream as the picked choice.',
      '<b>W-16:</b> the toast with one action in the bottom-right slot; the case counter stays centred.',
      '<b>Ink chips:</b> the case set, flat pills, no lip.',
    ],
  });
  afterMount();
}

/* ---------------------------------------------------------------- D4: history filters */
function d4() {
  const rows = [
    ['23', '14.07', 'today 17:33', 'PB', 12], ['22', '15.42', 'today 17:28', '', 12], ['21', '14.91', 'today 17:21', '+2', 12], ['20', '16.80', 'today 17:12', '', 12],
    ['19', '13.62', 'today 16:58', '', 12], ['18', '17.05', 'yesterday', 'detour', 12], ['17', '14.44', 'yesterday', '', 12], ['16', '15.07', 'yesterday', '', 12], ['15', '14.80', '2 days ago', '', 12],
  ].map(([n, t, d, tag, mx], i) => {
    const M = build({ moves: [...SCR.slice(i % 5), ...SCR.slice(0, i % 5)], cur: -1 });
    return `<div class="hrow"><span class="n">${n}</span><span class="t">${t}</span><div class="o3">${miniRun(M, mx)}</div><span>${tag ? `<span class="badge ${tag === 'PB' ? 'badge--pb' : ''}">${tag}</span>` : ''}</span><span class="d">${d}</span></div>`;
  }).join('');
  const frame = `<div class="o1"><div class="frame">
    ${header({ active: 'history' })}
    ${abs('left:48px;top:96px', '<div style="font-size:26px;font-weight:600">history</div>')}
    ${abs('left:48px;top:150px;right:48px;display:flex;gap:26px;align-items:center;flex-wrap:wrap', `
      <div ${co(1)} class="row" style="gap:8px">${[['PB only', 0], ['with detours', 1], ['DNF', 0], ['+2', 0]].map(([l, on]) => UI.chip(l, { sel: !!on })).join('')}</div>
      <div ${co(2)}>${UI.seg('period', ['7 d', '30 d', 'all'], 1)}</div>
      <div ${co(3)}>${UI.sel('cube', ['all cubes', 'GAN 356 i3', 'MoYu'], 0, { cls: 'sel--sm' })}</div>
      ${UI.sw('compare to ao12', true)}
      <span style="margin-left:auto" class="row">${textBtn('clear filters')}${secondary('export', '', 4, 'btn--s')}</span>`)}
    ${abs('left:48px;top:222px;right:48px', `<div class="hrow head"><span>#</span><span>time</span><span>scramble (W-21 mini form)</span><span>tag</span><span style="text-align:right">when</span></div>${rows}`)}
    ${abs('left:48px;bottom:16px', kbar(kbi(k('/'), 'filter'), kbi(kp('↑', '↓'), 'move'), kbi(k('enter'), 'open')))}
    ${abs('right:48px;bottom:18px', toast('Showing 9 of 214 · detours', '', 'clear', 5))}
  </div></div>`;
  mount({
    id: boardId, name: 'history with filters (desktop 1440 x 900)', frame, cols: 1, legend: [
      '<b>Ink chips (W-05):</b> filters; "with detours" is on (cream).',
      '<b>Segmented (W-06):</b> period, with the ink thumb; the cream on the chip and on the thumb is the same ink.',
      '<b>Select (W-08):</b> the cube filter, a 32 px field next to the chips.',
      '<b>W-04 secondary:</b> export is a quiet fill; clear filters a text button. There is no primary on this page, so no cream pill competes with the cream chip.',
      '<b>W-16 + W-21:</b> the result count sits in the bottom-right slot; every row carries the scramble in the mini form, sections only as extra space.',
    ],
  });
  afterMount();
}

/* ---------------------------------------------------------------- D5: alg playback */
function d5() {
  const M = build({ moves: TPERM, cur: 5, sections: TSECS });
  const R = ringHtml(M, { W: 1440, H: 900, cx: 720, cy: 420, r: 290, labels: true, Rl: 30 });
  const c = M.items.find((x) => x.st === 'cur');
  const frame = `<div class="o1"><div class="frame">
    ${header({ active: 'algs' })}
    ${abs('left:48px;top:96px', `<div style="font-size:22px;font-weight:600">T-perm</div><div class="lab-mono" style="margin-top:4px">PLL · 14 moves</div>`)}
    ${R.svg}<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(720, 420, 205)}</svg>${R.html}
    <div class="big" style="top:652px;--big:84px">${c.m}</div>
    <div class="cap" style="top:752px;font-size:17px">${desc(c.m)}</div>
    ${abs('left:48px;top:190px;display:grid;gap:14px;width:230px', `<div class="lab-mono" ${co(3)}>options</div>${UI.sw('mirror', false)}${UI.sw('inverse', false)}<div class="row" style="gap:8px">${UI.chip('AUF', { sel: true })}${UI.chip('U-face', { sel: false })}</div>`)}
    ${abs('left:0;right:0;top:806px;display:flex;justify-content:center;align-items:center;gap:18px', `${secondary('reset', k('r', 'm'), 4)}<span ${co(2)}>${UI.seg('speed', ['0.5×', '1×', '2×', '4×'], 1)}</span>${primary('drill this alg', k('enter', 'm'), 5)}`)}
    ${abs('left:48px;bottom:16px', kbar(kbi(k('space'), 'pause'), kbi(kp('[', ']'), 'step')))}
    ${abs('right:48px;bottom:18px', `<span ${co(6)}>${stat('<b>playing</b> · move 6 of 14')}</span>`)}
  </div></div>`;
  mount({
    id: boardId, name: 'alg playback, T-perm (desktop 1440 x 900)', frame, cols: 1, legend: [
      '<b>W-21 labels on the Orbit:</b> 14 moves with the two trigger gaps as wider spaces on the ring; the current move (F) is the teal pill.',
      '<b>Ink segmented (W-06):</b> playback speed, between the secondary and the primary: three cream-ish things in one row, the case studied in SC-31.',
      '<b>Switches and chips:</b> mirror and inverse (ink switches), AUF and U-face (chips) in the left rail.',
      '<b>W-04 secondary with a bevelled r cap,</b> and the primary with a bevelled enter cap.',
      '<b>One primary only:</b> drill this alg is the one cream pill; reset is a quiet fill.',
      '<b>W-16:</b> a status line (not a toast) for the playing position, bottom-right, plain text with no spinner.',
    ],
  });
  afterMount();
}

/* ---------------------------------------------------------------- phones (5 screens in a row) */
const PH = (inner, extra = '') => `<div class="frame phone touch" style="width:390px;height:844px;${extra}">${inner}</div>`;
const phHdr = (active) => `<div class="hdr" style="padding:0 24px;height:60px"><span class="word" style="font-size:17px;margin:0">cubesight</span><span class="chip-cube" style="font-size:11px"><i class="dot"></i>${active || 'GAN 356 i3'}</span></div>`;
function wrapped(M, top, h = 130) { return `<div class="o3"><div class="para" style="position:absolute;left:24px;width:342px;top:${top}px;height:${h}px"><div class="para-in">${runs(M.items)}</div></div></div>`; }

function phones() {
  // 1 solve + settings sheet
  const M1 = build({ moves: SCR, cur: 0 });
  const orb = (cx, cy, r, M) => ringHtml(M, { W: 390, H: 844, cx, cy, r, labels: false, gs: 2.8, gsec: 11, small: false }).svg;
  const p1 = PH(`${phHdr()}${orb(195, 160, 112, M1)}<svg class="stage-svg" width="390" height="844">${cubeSVG(195, 166, 80)}</svg>
    ${wrapped(M1, 284, 132)}
    ${abs('left:24px;right:24px;top:432px', `<div class="on-primary" style="display:block"><button class="btn btn--primary btn--l" type="button" style="width:100%"><span>start</span></button></div>`, co(2))}
    <div class="scrim" style="left:0;right:0;top:0;height:424px"></div>
    <div class="sheet-b" style="top:500px"><div class="grab"></div><div class="row" style="justify-content:space-between"><b style="font-size:18px">settings</b>${textBtn('close')}</div>
      <div>${mono('inspection')}<div style="margin-top:6px">${UI.seg('inspection', ['15 s', '∞', 'off'], 0, { cls: '' }).replace('class="seg"', 'class="seg" data-full')}</div></div>
      <div data-co="3">${mono('show on the ring')}<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">${[['cross', 1], ['pairs', 1], ['EO', 0], ['skips', 1]].map(([l, on]) => UI.chip(l, { sel: !!on })).join('')}</div></div>
      ${UI.sw('cross hint', true, { row: true })}
      <div class="row" style="justify-content:space-between;margin-top:2px"><span data-co="5" style="display:inline-block">${secondary('reset', '', 0, 'btn--s')}</span></div>
      <div style="height:44px"></div></div>
    ${abs('left:20px;right:20px;bottom:18px;z-index:7', toast('cross hint on', '', 'undo', 4))}`);
  // 2 results
  const p2 = S.phoneResults({
    actions: `<div class="on-primary" style="display:block"><button class="btn btn--primary btn--l" type="button" style="width:100%"><span>next scramble</span></button></div><div class="row" style="justify-content:center;gap:4px">${textBtn('review')}${textBtn('more…')}</div>`,
    status: abs('left:24px;right:24px;bottom:124px', toast('Solve saved · 12.41', 'PB', 'undo', 4)),
    top: abs('left:24px;top:68px;right:24px', `<div class="row" style="gap:6px;flex-wrap:wrap">${[['cross', 1], ['pairs', 1], ['EO', 0], ['skips', 1]].map(([l, on]) => UI.chip(l, { sel: !!on })).join('')}</div>`, co(1)),
  });
  // 3 drill
  const p3 = S.phoneDrill({
    answers: [choice('L-shape', 1), choice('T-shape', 2, { sel: true }), choice('Dot', 3), choice('Line', 4)].join(''),
    stop: textBtn('skip'),
    status: abs('left:20px;right:20px;bottom:90px', toast('Marked for review', '', 'undo', 4)) + abs('left:24px;right:24px;top:632px', `<div class="lab-mono">round</div><div style="margin-top:6px">${UI.seg('round', ['5', '10', '20'], 2).replace('class="seg"', 'class="seg" data-full')}</div>`, co(2)),
  });
  // 4 history
  const hist = [['14.07', 'PB', 0], ['15.42', '', 1], ['14.91', '+2', 2], ['16.80', '', 3], ['13.62', '', 4], ['17.05', 'detour', 5]].map(([t, tag, i]) => {
    const M = build({ moves: [...SCR.slice(i), ...SCR.slice(0, i)], cur: -1 });
    return `<div class="o3" style="padding:10px 14px;border-radius:14px;background:${i % 2 ? 'transparent' : 'var(--b-surface)'}"><div class="row" style="justify-content:space-between"><span style="font:500 16px var(--b-font-mono)">${t}</span>${tag ? `<span class="badge ${tag === 'PB' ? 'badge--pb' : ''}">${tag}</span>` : ''}</div><div style="margin-top:6px">${miniRun(M, 9)}</div></div>`;
  }).join('');
  const p4 = PH(`${phHdr()}${abs('left:24px;top:76px', '<div style="font-size:24px;font-weight:600">history</div>')}
    ${abs('left:24px;right:24px;top:122px;display:grid;gap:12px', `<div class="row" style="gap:8px;flex-wrap:wrap" data-co="1">${[['PB only', 0], ['with detours', 1], ['DNF', 0], ['+2', 0]].map(([l, on]) => UI.chip(l, { sel: !!on })).join('')}</div>${UI.seg('period', ['7 d', '30 d', 'all'], 1).replace('class="seg"', 'class="seg" data-full')}<div class="row" style="justify-content:space-between">${UI.sel('cube', ['all cubes', 'GAN 356 i3'], 0, { cls: 'sel--sm' })}${secondary('export', '', 4, 'btn--s')}</div>`)}
    ${abs('left:12px;right:12px;top:324px;display:grid;gap:2px', hist)}
    ${abs('left:20px;right:20px;bottom:18px', toast('Showing 6 of 214', '', 'clear', 5))}`);
  // 5 alg playback
  const M5 = build({ moves: TPERM, cur: 5, sections: TSECS });
  const p5 = PH(`${phHdr()}${abs('left:24px;top:72px', `<div style="font-size:20px;font-weight:600">T-perm</div><div class="lab-mono" style="margin-top:3px">PLL · 14 moves</div>`)}
    ${orb(195, 214, 112, M5)}<svg class="stage-svg" width="390" height="844">${cubeSVG(195, 220, 80)}</svg>
    <div class="big" style="top:352px;--big:46px">F</div>
    ${wrapped(M5, 424, 96)}
    ${abs('left:24px;right:24px;top:516px', `<div class="lab-mono">speed</div><div style="margin-top:6px" data-co="2">${UI.seg('speed', ['0.5×', '1×', '2×', '4×'], 1).replace('class="seg"', 'class="seg" data-full')}</div>`)}
    ${abs('left:24px;right:24px;top:596px;display:grid;gap:6px', `${UI.sw('mirror', false, { row: true })}<div class="row" style="gap:8px">${UI.chip('AUF', { sel: true })}${UI.chip('U-face', { sel: false })}</div>`)}
    ${abs('left:24px;right:24px;bottom:96px;display:grid', `<div class="on-primary" style="display:block" data-co="3"><button class="btn btn--primary btn--l" type="button" style="width:100%"><span>drill this alg</span></button></div>`)}
    ${abs('left:24px;right:24px;bottom:30px;text-align:center', `<span ${co(5)}>${stat('<b>playing</b> · move 6 of 14')}</span>`)}`);
  const frame = `<div class="o1" style="display:flex;gap:40px;padding:26px 30px 10px;align-items:flex-start">${[['solve + settings', p1], ['results', p2], ['drill', p3], ['history filters', p4], ['alg playback', p5]].map(([t, f]) => `<div><div class="lab-mono" style="margin-bottom:8px">${t}</div>${f}</div>`).join('')}</div>`;
  mount({
    id: boardId, name: 'the five screens on a phone (390 x 844)', frame, width: 2200, cols: 1, legend: [
      '<b>Ink chips and segmented controls</b> are 40 px high on a phone, the same cream; the primary is always 52 px, full width, in the bottom action zone, with no keycap (keys are hidden on touch).',
      '<b>Segmented (W-06)</b> full width on a phone; the thumb is the same ink.',
      '<b>Alg playback uses the wrapped sequence (W-21),</b> with the trigger gaps as extra space, between the cube and the controls.',
      '<b>W-16:</b> the toast lives above the bottom action zone (a full-width pill with one action); status text is one plain line at the bottom.',
      '<b>W-04 secondary and text:</b> quiet fills; export and reset are 40 px.',
    ],
  });
  afterMount();
  document.querySelector('[data-scene="phone-results"] .rail-coach')?.remove();
}

/* ---------------------------------------------------------------- the confusion study (selected ink chip vs the cream primary) */
function confuse() {
  const group = (cls) => `<div class="cf-cell ${cls}">${chips([['cross', 1], ['pairs', 0], ['EO', 0]])}<span class="on-primary"><button class="btn btn--primary btn--l" type="button"><span>start</span>${k('space', 'm')}</button></span></div>`;
  const group2 = (cls) => `<div class="cf-cell ${cls}">${UI.seg('speed', ['0.5×', '1×', '2×', '4×'], 1)}<span class="on-primary"><button class="btn btn--primary btn--l" type="button"><span>drill this alg</span>${k('enter', 'm')}</button></span></div>`;
  const group3 = (cls) => `<div class="cf-cell ${cls}">${[choice('T-shape', 2, { sel: true })].join('')}${textBtn('skip')}</div>`;
  const cols = [['A', 'as approved', 'cream chip, 32 px, pill'], ['B', 'check mark in the selected chip', 'a second cue, not colour only'], ['C', 'chips are rounded rectangles', 'pills stay buttons-only'], ['D', 'a thin teal edge on the selected chip', 'teal = on (good/on)']];
  const klass = ['', 'd-b', 'd-c', 'd-e'];
  const rowOf = (head, sub, maker, n) => `<div class="cf-row"><div class="rh" ${co(n)}><b>${head}</b>${sub}</div>${klass.map((c) => maker(c)).join('')}</div>`;
  const frame = `<div class="cf"><div class="cf-row head"><div></div>${cols.map(([l, t, s]) => `<div>${l}. ${t}<small>${s}</small></div>`).join('')}</div>
    ${rowOf('chips beside the primary', 'settings drawer, results rail', group, 1)}
    ${rowOf('segmented beside the primary', 'alg playback bar', group2, 2)}
    ${rowOf('picked answer', 'drill; no primary on this screen', group3, 3)}
    <div class="cf-row"><div class="rh" ${co(4)}><b>sizes</b>why they differ already</div>
      <div class="cf-cell" style="grid-column: 2 / span 4;gap:34px">
        <div class="dim-line"><span class="row">${UI.chip('cross', { sel: true })}</span><span class="dim">chip: 32 px high, 13 px label, weight 600, no cap</span></div>
        <div class="dim-line"><span class="on-primary"><button class="btn btn--primary btn--l" type="button"><span>start</span>${k('space', 'm')}</button></span><span class="dim">primary: 48 px high, 16 px label, bevelled key inside</span></div>
        <div class="dim-line"><span class="on-primary"><button class="btn btn--primary" type="button" style="width:220px"><span>next scramble</span></button></span><span class="dim">phone primary: 52 px, full width, no key (touch)</span></div>
        <div class="dim-line"><span class="row">${UI.chip('cross', { sel: true })}</span><span class="dim">phone chip: 40 px</span></div></div></div></div>`;
  mount({
    id: boardId, name: 'does a selected ink chip look like the cream primary? four small differentiators', width: 1440, frame, cols: 1, legend: [
      '<b>The risk is real but small:</b> both are cream pills with dark text. What separates them today is size (32 against 48 px), weight, and the bevelled cap inside the primary on desktop. On a phone the cap is hidden, so only size and the full-width position separate them (40 against 52 px).',
      '<b>The segmented control</b> has the same ink thumb inside a track; the track (a filled surface) already says "this is a choice", so it is not confused with a button.',
      '<b>A picked answer</b> (drill) is a cream choice with no primary on screen: no conflict there.',
      '<b>Sizes:</b> the 16 px size gap between chip and primary is the main differentiator and must stay; do not enlarge chips or shrink the primary.',
      '<b>Recommended: B, the check mark.</b> It adds a non-colour cue (selected), costs 14 px of width, keeps the approved cream and the pill shape, and a primary never carries a check. C breaks the pill shape of the approved chip; D adds a second colour to the ink look.',
    ],
  });
  afterMount();
}

/* ---------------------------------------------------------------- in progress: the Orbit, never a spinner or a bar */
const tail = (cx, cy, r, a0) => [[a0 - 84, a0 - 56, 0.14], [a0 - 56, a0 - 32, 0.3], [a0 - 32, a0 - 12, 0.55], [a0 - 12, a0 + 10, 1]].map(([x, y, o], i) => `<path d="${arcPath(cx, cy, r, x, y)}" fill="none" stroke="var(--b-fill-live)" stroke-opacity="${o}" stroke-width="${i === 3 ? 9 : 7}" stroke-linecap="round"/>`).join('');
function connect() {
  const frame = `<div class="frame">${header({ chip: 'connecting…', dot: 'warn' })}
    <svg class="stage-svg" width="1440" height="900"><circle cx="720" cy="420" r="290" fill="none" stroke="var(--b-track)" stroke-width="3"/>${tail(720, 420, 290, 35)}</svg>
    <svg class="stage-svg" width="1440" height="900">${cubeSVG(720, 420, 205, { dim: 0.55 })}</svg>
    <div class="clock dim" style="top:668px;--clock-size:112px;color:var(--b-faint)">0.00</div>
    ${abs('left:0;right:0;top:806px;display:flex;justify-content:center;align-items:center;gap:18px', `${secondary('cancel', k('esc', 'm'), 3)}`)}
    ${abs('left:48px;bottom:16px', kbar(kbi(k('esc'), 'cancel')))}
    ${abs('right:48px;bottom:18px', `<span ${co(2)}>${stat('Connecting to GAN 356 i3…').replace('class="g-dot"', 'class="g-dot" style="background:var(--b-warn)"')}</span>`)}
    ${abs('left:0;right:0;top:112px;text-align:center', '<span class="lab-mono">the full ring turns; a bright arc with a fading tail travels around it</span>', co(1))}
  </div>`;
  mount({ id: boardId, name: 'in progress: connecting (the whole Orbit travels)', frame, cols: 1, legend: [
    '<b>The Orbit is the progress:</b> a closed track ring with one bright arc and a fading tail, one lap in 1.6 s; no spinner, no bar. Under reduced motion the arc rests at the top.',
    '<b>W-16 status line,</b> bottom-right: plain text, an amber dot (not teal: it is not yet good). It becomes the green connected chip in the header when done.',
    '<b>Only one action:</b> cancel as a quiet fill with a bevelled esc cap; no primary while waiting.',
  ] });
}
function analyse() {
  const segs = resultsSegs.map((s, i) => ({ ...s, tone: i < 5 ? 'done' : i === 5 ? 'live' : 'future' }));
  const frame = `<div class="frame">${header()}
    ${orbitSVG({ segs })}
    <svg class="stage-svg" width="1440" height="900">${cubeSVG(720, 440, 215, { dim: 0.9 })}</svg>
    <div class="clock" style="top:688px;--clock-size:120px">14.07</div>
    <div class="sub" style="top:812px">analysing your solve · stage 6 of 9</div>
    ${abs('left:0;right:0;top:838px;display:flex;justify-content:center;align-items:center;gap:22px', `<button class="btn btn--primary btn--l" type="button" style="" disabled><span>next scramble</span></button>`.replace('class="btn', 'class="btn') + `${textBtn('review')}${textBtn('more…')}`)}
    ${abs('left:48px;bottom:16px', kbar(kbi(k('space'), 'next scramble')))}
    ${abs('right:48px;bottom:18px', `<span ${co(2)}>${stat('<b>analysing</b> · 5 of 9 stages done').replace('class="g-dot"', 'class="g-dot" style="background:var(--b-warn)"')}</span>`)}
    ${abs('left:48px;top:100px', '<span class="lab-mono">the stage arcs fill in as each stage is analysed</span>', co(1))}
  </div>`;
  mount({ id: boardId, name: 'in progress: analysing a solve (the result Orbit fills in)', frame, cols: 1, legend: [
    '<b>The Orbit does the work:</b> the nine stage arcs of the results ring fill in one by one (done = cream arcs, the live arc at the frontier is thick, the rest are thin tracks). Markers and labels appear when a stage is analysed.',
    '<b>W-16 status line,</b> bottom-right: one line that says what and how far; no spinner, no progress bar.',
    '<b>The primary stays visible but disabled</b> (grey surface, no lip on the key) while the analysis runs; the clock is already final.',
  ] });
}
function search() {
  const segs = [];
  for (let i = 0; i < 20; i += 1) { const a0 = -144 + i * 13.4; segs.push({ a0, a1: a0 + 11, tone: i < 7 ? (i === 2 || i === 5 ? 'good' : 'done') : i === 7 ? 'live' : 'future' }); }
  const frame = `<div class="frame">${header()}
    ${orbitSVG({ segs })}
    <svg class="stage-svg" width="1440" height="900">${cubeSVG(720, 440, 215, { dim: 0.9 })}</svg>
    ${abs('left:0;right:0;top:680px;text-align:center', '<div style="font-size:22px;font-weight:600">searching for a better pair</div><div class="lab-mono" style="margin-top:8px">pair 3 · 120 pairings · 38 tried · 2 better</div>')}
    ${abs('left:0;right:0;top:808px;display:flex;justify-content:center;align-items:center;gap:18px', `${secondary('stop', k('esc', 'm'), 3)}`)}
    ${abs('left:48px;bottom:16px', kbar(kbi(k('esc'), 'stop')))}
    ${abs('right:48px;bottom:18px', `<span ${co(2)}>${stat('<b>searching</b> · 38 of 120 pairings').replace('class="g-dot"', 'class="g-dot" style="background:var(--b-warn)"')}</span>`)}
    ${abs('left:48px;top:100px', '<span class="lab-mono">one arc per candidate: tried (faint), better (cream with a dot), trying now (thick)</span>', co(1))}
  </div>`;
  mount({ id: boardId, name: 'in progress: searching for a better pair (one arc per candidate)', frame, cols: 1, legend: [
    '<b>The Orbit is divided into the candidates:</b> each arc is a pairing; tried ones go faint, the better ones keep a bright arc, the one being tried is thick. It is the progress, so there is no bar.',
    '<b>W-16 status line,</b> bottom-right, says the count; the centre says what is happening in one title and one mono line.',
    '<b>Stop</b> is a quiet secondary with the bevelled esc cap; nothing else competes.',
  ] });
}

({ d1, d2, d3, d4, d5, phones, confuse, connect, analyse, search }[view] || d1)();
if (q.get('legend') === '0') document.querySelector('.legend')?.remove();
void polar;
void resultsMarkers;
