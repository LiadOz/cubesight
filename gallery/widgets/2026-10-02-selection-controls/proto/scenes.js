/* global window */
/* The scenes: a state matrix and the controls in real contexts from the orbit-v3 A frames. */
(function () {
  const { UI } = window;
  const A = '../../../../docs/design/orbit-v3/';
  const boot = window.UIBoot();
  const { opt, theme, scene, root } = boot;
  const co = UI.co;
  const NAMES = { 1: 'tint', 2: 'underline', 3: 'ink' };

  function cell(label, html, extra = '') { return `<div class="cell"><span class="cell__l">${label}</span>${html}${extra}</div>`; }
  function row(title, sub, cells, extra = '') { return `<div class="mx__k"><b>${title}</b>${sub}</div><div class="mx__v">${cells}${extra}</div>`; }

  function states() {
    const speed = ['0.5×', '1×', '2×', '4×'];
    const rows = [
      row('chip', 'W-05<br>filter, tag, quick action<br>32 px (40 on phone)', [
        cell('default', UI.chip('cross')),
        cell('hover', UI.chip('cross', { cls: 'is-hover' })),
        cell('focus-visible', UI.chip('cross', { cls: 'is-focus' })),
        cell('selected', UI.chip('cross', { sel: true }), co(1, '')),
        cell('selected + hover', UI.chip('cross', { sel: true, cls: 'is-hover' })),
        cell('pressed', UI.chip('cross', { cls: 'is-press' })),
        cell('disabled', UI.chip('cross', { dis: true })),
        cell('count', UI.chip('detour', { n: 2, sel: true })),
        cell('marker dot', UI.chip('pause 4.3 s', { dot: true, n: '~6 lost' })),
      ].join('')),
      row('segmented', 'W-06<br>2 to 5 fixed options<br>40 px, equal columns', [
        cell('default (4)', UI.seg('speed', speed, 1), co(2, '')),
        cell('hover on 2×', UI.seg('speed', speed, 1, { states: ['', '', 'is-hover', ''] })),
        cell('focus-visible', UI.seg('speed', speed, 1, { states: ['', 'is-focus', '', ''] })),
        cell('pressed 2×', UI.seg('speed', speed, 1, { states: ['', '', 'is-press', ''] })),
        cell('disabled', UI.seg('speed', speed, 1, { dis: true })),
        cell('two options', UI.seg('OLL', ['1-look', '2-look'], 1)),
        cell('three options', UI.seg('focus', ['speed', 'flow', 'learning'], 0)),
        cell('mono labels', UI.seg('speed', speed, 2, { mono: true })),
      ].join('')),
      row('switch', 'W-07<br>on or off<br>44 × 26, row 40 px', [
        cell('off', UI.sw('cross hint', false)),
        cell('on', UI.sw('cross hint', true), co(3, '')),
        cell('hover (off)', UI.sw('cross hint', false, { cls: 'is-hover' })),
        cell('hover (on)', UI.sw('cross hint', true, { cls: 'is-hover' })),
        cell('focus-visible', UI.sw('cross hint', true, { cls: 'is-focus' })),
        cell('pressed', UI.sw('cross hint', false, { cls: 'is-press' })),
        cell('disabled off', UI.sw('cross hint', false, { dis: true })),
        cell('disabled on', UI.sw('cross hint', true, { dis: true })),
        cell('with a sub line', UI.sw('WCA penalties', true, { sub: '+2 and DNF from inspection' })),
      ].join('')),
      row('checkbox', 'W-07<br>only to tick items in a list', [
        cell('off', UI.cb('OLL 21', false)),
        cell('on', UI.cb('OLL 21', true)),
        cell('hover', UI.cb('OLL 21', false, { cls: 'is-hover' })),
        cell('focus-visible', UI.cb('OLL 21', true, { cls: 'is-focus' })),
        cell('disabled', UI.cb('OLL 21', false, { dis: true })),
      ].join('')),
      row('select', 'W-08<br>6 or more options, or long labels<br>40 px', [
        cell('default', UI.sel('case colours', ['yellow top', 'white top', 'yellow or white', 'any colour', 'fixed: red'], 0)),
        cell('hover', UI.sel('case colours', ['yellow top', 'white top', 'yellow or white', 'any colour', 'fixed: red'], 0, { cls: '', open: false }).replace('class="sel__btn"', 'class="sel__btn is-hover"')),
        cell('focus-visible', UI.sel('case colours', ['yellow top', 'white top', 'yellow or white', 'any colour', 'fixed: red'], 0).replace('class="sel__btn"', 'class="sel__btn is-focus"')),
        cell('disabled', UI.sel('case colours', ['yellow top', 'white top'], 0, { dis: true })),
        cell('open (arrows move, Enter picks)', UI.sel('case colours', ['yellow top', 'white top', 'yellow or white', 'any colour', 'fixed: red'], 2, { open: true, active: 3 }) + '<div style="height:228px"></div>', co(4, 'top:30px;bottom:auto')),
      ].join('')),
      row('choice button', 'W-28<br>a drill answer<br>48 px (52 on phone)', [
        cell('default', UI.choice('OLL 27', { key: 1 })),
        cell('hover', UI.choice('OLL 27', { key: 1, cls: 'is-hover' })),
        cell('focus-visible', UI.choice('OLL 27', { key: 1, cls: 'is-focus' })),
        cell('pressed', UI.choice('OLL 27', { key: 1, cls: 'is-press' })),
        cell('picked', UI.choice('OLL 27', { key: 1, sel: true }), co(5, '')),
        cell('correct', UI.choice('OLL 27', { key: 1, cls: 'is-correct', mark: '✓' })),
        cell('miss (amber)', UI.choice('OLL 31', { key: 3, cls: 'is-miss', mark: '!' })),
        cell('the answer, revealed', UI.choice('OLL 27', { key: 1, cls: 'is-reveal' })),
        cell('disabled', UI.choice('OLL 27', { key: 1, dis: true })),
        cell('colour picker', UI.choice('Yellow', { key: 'Y', swatch: 'y' })),
        cell('colour, correct', UI.choice('White', { key: 'W', swatch: 'w', cls: 'is-correct', mark: '✓' })),
      ].join('')),
    ];
    return `<div class="page"><div class="page__head"><span class="page__id">W-SEL option ${opt}</span><h1 class="page__title">${NAMES[opt]}: every state</h1>`
      + `<span class="page__sub">${theme} · Orbit tokens · Manrope + DM Mono</span></div><div class="mx">${rows.join('')}</div></div>`;
  }

  function drawerBody(phone) {
    const insp = UI.seg('inspection', phone ? ['15 s', '∞', 'off'] : ['15 s', '∞', 'off'], 0);
    return `
      <div class="sec"><span class="sec__l">inspection</span>${insp}${co(1, 'right:2px;top:-10px')}</div>
      <div class="sec"><span class="sec__l">focus</span>${UI.seg('focus', ['speed', 'flow', 'learning'], 0)}</div>
      <div class="sec"><div class="sec__r"><span>OLL</span>${UI.seg('OLL', ['1-look', '2-look'], 1)}</div>
        <div class="sec__r"><span>PLL</span>${UI.seg('PLL', ['1-look', '2-look'], 1)}</div></div>
      <div class="sec"><span class="sec__l">case colours</span>${UI.sel('case colours', ['yellow top', 'white top', 'yellow or white', 'any colour', 'fixed: red'], 0, { cls: 'sel--full' })}${co(3, 'right:2px;top:-10px')}</div>
      <div class="sec"><span class="sec__l">hints</span>
        ${UI.sw('pseudo pairs', true, { row: true })}
        ${UI.sw('WCA penalties', false, { row: true, sub: '+2 and DNF from inspection' })}
        ${UI.sw('cross hint', true, { row: true })}${co(2, 'right:62px;top:26px')}</div>
      <div class="sec"><span class="sec__l">show on the ring</span><div class="chips">${['cross', 'pairs', 'EO', 'skips', 'detours'].map((t, k) => UI.chip(t, { sel: k !== 2 && k !== 4 })).join('')}</div>${co(4, 'right:2px;top:-10px')}</div>`;
  }

  function frameDrawer() {
    return `<div class="frame" style="background-image:url(${A}A-01-idle.png)"><div class="scrim"></div>
      <aside class="drawer" aria-label="settings"><h2 class="drawer__h">settings <span>solve</span></h2>${drawerBody(false)}</aside></div>`;
  }

  function framePhone() {
    return `<div class="frame frame--phone" style="background-image:url(${A}A-09-phone.png);background-position:-40px -28px"><div class="scrim"></div>
      <aside class="drawer drawer--sheet" aria-label="settings" style="bottom:0"><span class="drawer__grip"></span><h2 class="drawer__h">settings <span>solve</span></h2>${drawerBody(true)}</aside></div>`;
  }

  function frameSpeed() {
    return `<div class="frame" style="background-image:url(${A}A-11-replay.png)">
      <div class="cover" style="left:764px;top:814px;width:160px;height:46px"></div>
      <div class="at" style="left:756px;top:815px">${UI.seg('speed', ['0.5×', '1×', '2×', '4×'], 1)}</div>${co(1, 'left:996px;top:824px')}
      <div class="at" style="left:1040px;top:827px;font:400 13px var(--b-font-sans);color:var(--b-muted)">today a select in four different looks</div></div>`;
  }

  function frameHistory() {
    return `<div class="frame" style="background-image:url(${A}A-07-history.png)">
      <div class="cover" style="left:40px;top:228px;width:570px;height:46px"></div>
      <div class="at" style="left:48px;top:231px;display:flex;gap:10px;align-items:center">
        ${UI.sel('sessions', ['all sessions', 'today', 'evening 17:33', 'morning 08:12', '28 sep', '27 sep', '26 sep'], 0, { cls: 'sel--sm' })}
        <span style="width:1px;height:20px;background:var(--b-hairline)"></span>
        ${UI.chip('speed', { sel: true })}${UI.chip('flow')}${UI.chip('PB', { n: 2 })}${UI.chip('DNF', { n: 1 })}${UI.chip('skip', { n: 4 })}</div>
      ${co(1, 'left:30px;top:222px')}${co(2, 'left:262px;top:212px')}</div>`;
  }

  function frameDrill() {
    const k = (n, l, c, m) => UI.choice(l, { key: n, cls: c, mark: m });
    return `<div class="frame" style="background-image:url(${A}A-08-drill.png)">
      <div class="cover" style="left:460px;top:722px;width:540px;height:84px"></div>
      <div class="at" style="left:0;width:1440px;top:739px;display:flex;justify-content:center;gap:12px;padding-right:0">
        ${k(1, 'OLL 21', 'is-dim')}${k(2, 'OLL 27', 'is-reveal')}${k(3, 'OLL 31', 'is-miss', '!')}${k(4, 'OLL 33', 'is-dim')}</div>
      ${co(1, 'left:1006px;top:732px')}</div>`;
  }

  function framePhoneDrill() {
    const s = 260 / 470;
    return `<div class="frame frame--phone" style="background:var(--b-bg)"><div class="at" style="left:0;right:0;top:34px;text-align:center;font:500 12px var(--b-font-mono);color:var(--b-muted)">OLL recognition · case 13 of 20</div>
      <div class="at" style="left:65px;top:120px;width:260px;height:260px;border-radius:50%;background:url(${A}A-08-drill.png) -${485 * s}px -${205 * s}px / ${1440 * s}px ${900 * s}px no-repeat"></div>
      <div class="at" style="left:0;right:0;top:410px;text-align:center;font:600 22px var(--b-font-sans)">which OLL is this?</div>
      <div class="at" style="left:20px;right:20px;top:470px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${UI.choice('OLL 21', { cls: 'is-dim' })}${UI.choice('OLL 27', { cls: 'is-reveal' })}${UI.choice('OLL 31', { cls: 'is-miss', mark: '!' })}${UI.choice('OLL 33', { cls: 'is-dim' })}</div>
      <div class="at" style="left:20px;right:20px;top:636px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${UI.choice('Yellow', { swatch: 'y' })}${UI.choice('White', { swatch: 'w', sel: true })}${UI.choice('Red', { swatch: 'r' })}${UI.choice('Green', { swatch: 'g' })}</div>
      <div class="at" style="left:0;right:0;top:606px;text-align:center;font:400 12px var(--b-font-sans);color:var(--b-faint)">colour picker, same button</div>
      ${co(1, 'left:352px;top:452px')}</div>`;
  }

  /* The overview: the same controls in the three looks, side by side. */
  function overview() {
    const col = (k, name, line) => `<section class="brain" data-brain-style="orbit" data-opt="${k}" style="padding:26px 28px;border-radius:24px;display:grid;gap:22px;align-content:start;background:var(--b-surface)">
      <header><div style="font:500 12px var(--b-font-mono);color:var(--b-accent-text)">option ${k}</div><h2 style="margin:4px 0 4px;font:600 22px var(--b-font-sans)">${name}</h2><div style="font:400 13px/1.4 var(--b-font-sans);color:var(--b-muted)">${line}</div></header>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${UI.chip('cross', { sel: true })}${UI.chip('pairs', { sel: true })}${UI.chip('EO')}${UI.chip('detour', { n: 2 })}</div>
      ${UI.seg('speed', ['0.5×', '1×', '2×', '4×'], 1)}
      ${UI.seg('focus', ['speed', 'flow', 'learning'], 0)}
      <div style="display:grid;gap:0">${UI.sw('pseudo pairs', true, { row: true })}${UI.sw('cross hint', false, { row: true })}${UI.cb('OLL 21', true)}</div>
      ${UI.field('case colours', UI.sel('case colours', ['yellow top', 'white top'], 0))}
      <div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:8px">${UI.choice('OLL 27', { key: 2, sel: true })}${UI.choice('OLL 31', { key: 3, cls: 'is-miss', mark: '!' })}</div>
    </section>`;
    return `<div class="frame" style="width:1440px;height:auto;background:var(--b-bg)"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:28px 36px">`
      + col(1, 'tint', 'teal tint is the selected state, like the A-11 speed chips') + col(2, 'underline', 'text first; the selected one wears the nav underline')
      + col(3, 'ink', 'filled surfaces; the selected one flips to the page ink') + '</div></div>';
  }

  const scenes = { states, drawer: frameDrawer, phone: framePhone, speed: frameSpeed, history: frameHistory, drill: frameDrill, 'phone-drill': framePhoneDrill, overview };
  root.innerHTML = scenes[scene]();
  window.UIWire(root);
})();
