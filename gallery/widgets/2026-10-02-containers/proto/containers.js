/* global document, window */
// Containers proposal: W-10 / W-14 / W-15 / W-29 as one system, three skins (data-c 1 frameless, 2 soft panels, 3 hairline rules).
import { q, mount, header, cubeSVG, orbitSVG, idleSegs, resultsSegs, resultsMarkers } from '../../_proto/common.js';
import * as S from '../../_proto/scenes.js';

const UI = window.UI;
const view = q.get('view') || 'settings';
const opt = q.get('opt') || '1';
const boardId = q.get('id') || 'C';
const NAMES = { 1: 'frameless first', 2: 'soft panels', 3: 'hairline rules' };

const abs = (style, html, extra = '') => `<div class="abs" ${extra} style="${style}">${html}</div>`;
const co = (n) => (n ? `data-co="${n}"` : '');
const k = (g, size = 's') => `<kbd class="key key--${size}">${g}</kbd>`;
const kp = (a, b, size = 's') => `<span class="kp">${k(a, size)}${k(b, size)}</span>`;
const kbi = (c, l) => `<span class="kbi">${c}<span>${l}</span></span>`;
const kbar = (...a) => `<div class="kbar">${a.join('')}</div>`;
const primary = (label, cap = '', n = 0, size = 'btn--l') => `<span class="on-primary" ${co(n)}><button class="btn btn--primary ${size}" type="button"><span>${label}</span>${cap}</button></span>`;
const secondary = (label, cap = '', n = 0, size = '') => `<span class="on-secondary" ${co(n)}><button class="btn btn--secondary ${size}" type="button"><span>${label}</span>${cap}</button></span>`;
const danger = (label, n = 0, size = '') => `<span class="on-secondary" ${co(n)}><button class="btn btn--secondary btn--danger ${size}" type="button"><span>${label}</span></button></span>`;
const textBtn = (label, n = 0) => `<button class="btn btn--text btn--muted" type="button" ${co(n)}>${label}</button>`;
const toast = (txt, act = '') => `<span class="toast ${act ? 'has-act' : ''}"><span>${txt}</span>${act ? `<button class="act" type="button">${act}</button>` : ''}</span>`;
const CHEV = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>';
const mono = (t, cls = '') => `<div class="eyebrow ${cls}">${t}</div>`;
const sect = (head, body, n = 0, right = '') => `<section class="sect" ${co(n)}><div class="sect-h">${mono(head)}${right}</div>${body}</section>`;
const grp = (body, n = 0) => `<div class="grp" ${co(n)}>${body}</div>`;
const disc = (title, sub, inner, open = false, n = 0) => `<details class="disc" ${open ? 'open' : ''} ${co(n)}><summary><span>${title}</span><small>${sub}</small>${CHEV}</summary><div class="in">${inner}</div></details>`;
const chips = (items) => `<span class="row" style="gap:8px;flex-wrap:wrap">${items.map(([l, on]) => UI.chip(l, { sel: !!on })).join('')}</span>`;

/* ---------- contexts ---------- */
const solveBg = (w = 1440) => `<div class="dimmed">${header()}${orbitSVG({ segs: idleSegs })}<svg class="stage-svg" width="1440" height="900" aria-hidden="true">${cubeSVG(720, 440, 215)}</svg><div class="clock" style="top:690px;--clock-size:120px;color:var(--b-faint)">0.00</div></div><div class="scrim" style="inset:0;width:${w}px"></div>`;

function settingsBody(n = true) {
  return `${sect('inspection', UI.seg('inspection', ['15 s', '∞', 'off'], 0), n ? 1 : 0)}
    ${sect('focus', UI.seg('focus', ['speed', 'flow', 'learning'], 0))}
    ${grp(`${UI.sw('pseudo pairs', true, { row: true })}${UI.sw('WCA penalties', false, { row: true, sub: '+2 and DNF from inspection' })}${UI.sw('cross hint', true, { row: true })}`, n ? 2 : 0)}
    ${sect('show on the ring', chips([['cross', 1], ['pairs', 1], ['EO', 0], ['skips', 1], ['detours', 0]]))}
    ${disc('advanced scramble', 'closed', '', false, n ? 3 : 0)}
    ${disc('case colours', 'yellow top', `${UI.sel('case colours', ['yellow top', 'white top', 'yellow or white'], 0, { cls: 'sel--sm' })}`, true)}`;
}
const settingsDrawer = (n = true, extra = '') => `<aside class="drawer" data-co-side="l" ${co(n ? 4 : 0)}><h2>settings<small>solve</small></h2>${settingsBody(n)}<div class="foot">${secondary('reset to defaults', '', 0, 'btn--s')}${textBtn('close')}</div>${extra}</aside>`;

function vSettings() {
  const frame = `<div class="frame">${solveBg(1048)}${settingsDrawer()}${abs('right:430px;bottom:18px;z-index:7', toast('cross hint on', 'undo'))}</div>`;
  const L = {
    1: ['<b>Sections are spacing:</b> a mono head, a segmented control, 30 px of air. No frame around any of them.', '<b>Switches</b> are the only group (hints): bare rows, no fill, no rules.', '<b>Disclosures</b> are a muted text row with a chevron; open, the label turns ink and the control appears under it.', '<b>The drawer</b> is the page background with a soft shadow on its left edge; no border, no radius.'],
    2: ['<b>Every group is a soft panel</b> (surface fill, 1 px hairline, radius 20): the head sits outside, the rows inside.', '<b>Rows inside a panel</b> are separated by hairlines; the segmented controls sit directly on the drawer.', '<b>Disclosures</b> are panels too (closed = one 48 px row, open = the control inside the same panel).', '<b>The drawer floats:</b> inset 12 px, radius 28, a shadow all round; the page shows on every side.'],
    3: ['<b>A hairline between sections,</b> nothing filled and nothing rounded: structure by rules only.', '<b>Switch rows</b> sit between two rules; disclosures use the same two rules, so the drawer reads as one ruled list.', '<b>Open disclosure:</b> the control appears under its row, still between the same rules.', '<b>The drawer</b> is the page background with one hairline on its left edge; no shadow.'],
  }[opt];
  return { name: `settings drawer over solve, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: L };
}

function debugDrawer() {
  const log = [['17:33:02.118', 'move <b>R</b> · 3 ms'], ['17:33:02.401', 'move <b>U′</b> · 2 ms'], ['17:33:02.690', '<span class="w">gap 412 ms</span> · queue 0'], ['17:33:03.004', 'state <b>solved</b> check ok'], ['17:33:03.350', 'battery <b>84%</b>'], ['17:33:04.011', 'move <b>F</b> · 4 ms'], ['17:33:04.320', '<span class="g">sync</span> facelets match'], ['17:33:04.902', 'move <b>D2</b> · 3 ms']];
  return `<aside class="drawer" data-co-side="l" style="--dr-w:560px" ${co(1)}><h2>dev<small>\` or esc to close</small></h2>
    ${sect('session', grp(`<div class="prow"><span>cube</span><span class="v"><b>GAN 356 i3</b> · connected · 84%</span></div><div class="prow"><span>recorder</span><span class="v"><b>3 412</b> events · 21 min</span></div><div class="prow"><span>route</span><span class="v"><b>#/solve</b></span></div>`, 2))}
    <div class="row" style="margin:18px 0 28px;gap:10px">${secondary('save recording', '', 3, 'btn--s')}${textBtn('report a problem')}${textBtn('clear')}</div>
    ${sect('events', `<div class="panel" ${co(4)}><div class="log">${log.map(([t, m]) => `<div>${t}  ${m}</div>`).join('')}</div></div>`)}
    ${disc('connection log', '212 lines', '', false, 5)}
    ${disc('state', 'facelets', '', false)}
  </aside>`;
}
function vDebug() {
  const frame = `<div class="frame">${solveBg(880)}${debugDrawer()}</div>`;
  return { name: `debug drawer (the \` key), option ${opt} ${NAMES[opt]}`, frame, legend: [
    '<b>W-14:</b> the same drawer as settings, only wider (560 px): one container for every side panel.',
    '<b>W-10 group:</b> three key/value rows. The group follows the option (bare, soft panel, ruled).',
    '<b>Buttons:</b> one quiet-fill secondary and two text buttons; no primary in a drawer.',
    '<b>W-10 panel:</b> the event log is a list, so it keeps a frame in options 1 and 2 (surface fill) and two rules in option 3.',
    '<b>W-29:</b> the long logs sit behind disclosures, closed.',
  ] };
}

function histBg(w) {
  const rows = [['23', '14.07', 'today 17:33'], ['22', '14.83', 'today 17:29'], ['21', '14.55', 'today 17:24'], ['20', '15.36', 'today 17:20'], ['19', '14.97+', 'today 17:17'], ['18', '15.94', 'today 17:12'], ['17', '12.41', 'today 17:08'], ['13', '18.40', 'today 08:51'], ['12', '15.02', 'today 08:46']];
  return `<div class="dimmed">${header({ active: 'history' })}${abs('left:48px;top:96px', '<div style="font-size:30px;font-weight:600">history</div>')}
    ${abs('left:48px;top:170px;width:700px', rows.map(([n, t, d]) => `<div class="row" style="height:48px;gap:26px"><span class="lab-mono" style="width:30px">#${n}</span><span style="font:300 24px var(--b-font-mono);width:110px">${t}</span><span class="lab-mono">${d}</span></div>`).join(''))}
    ${abs('right:120px;top:260px', `<svg width="380" height="380">${orbitSVG({ cx: 190, cy: 190, r: 150, w: 380, h: 380, segs: resultsSegs, markers: resultsMarkers }).replace('class="stage-svg"', '')}</svg>`)}</div><div class="scrim" style="inset:0;width:${w}px;opacity:.6"></div>`;
}
function vConfirm() {
  const dlg = `<div class="dialog" ${co(1)} role="alertdialog"><h2>delete this solve?</h2><p><b>14.07</b> · today 17:33. It leaves your history, your ao12 and your pb stay as they were before it. This can't be undone.</p>
    <div class="acts">${textBtn('cancel', 2)}${danger('delete solve', 3)}</div></div>`;
  const frame = `<div class="frame">${histBg(1440)}${dlg}${abs('left:48px;bottom:16px;z-index:7', `<span ${co(4)} data-co-side="tr">${kbar(kbi(k('esc'), 'cancel'), kbi(k('enter'), 'delete'))}</span>`)}</div>`;
  return { name: `confirm dialog, delete a solve, option ${opt} ${NAMES[opt]}`, frame, legend: [
    '<b>W-15 dialog:</b> small (440 px), centred, one decision, over a dimmed page. Used ONLY for destructive or irreversible choices. The option decides its skin: ' + { 1: 'a surface fill with a soft shadow, no edge', 2: 'a raised fill with a hairline edge and radius 28', 3: 'the page background with a strong hairline, radius 16' }[opt] + '.',
    '<b>Cancel</b> is a text button and is the focus default, so enter never deletes by accident.',
    '<b>delete solve</b> is the danger quiet-fill secondary (W-04), never the cream primary: nothing here is "the" action to nudge the user toward.',
    '<b>Keys:</b> esc and enter in the bottom-left key bar, outside the dialog, as on every page.',
  ] };
}

function importBody(touch = false) {
  return `<div class="eyebrow">paste or choose a file</div>
    <textarea class="area" readonly ${co(touch ? 0 : 2)}>R U R′ U′ R′ F R2 U′ R′ U′ R U R′ F′   // 14 moves
D2 F2 U′ B2 R2 U2 F2 U′ L2 D′ B′ L′ …</textarea>
    <div class="row" style="justify-content:space-between;gap:10px">${secondary('choose file…', '', touch ? 0 : 3, 'btn--s')}${UI.seg('format', ['detect', 'cstimer', 'text'], 0)}</div>
    <div class="hint">Everything stays on this device. 1 reconstruction found, 38 moves.</div>`;
}
function vImport() {
  const dlg = `<div class="dialog" style="--dl-w:580px" ${co(1)}><h2>import a reconstruction</h2>${importBody()}<div class="acts">${textBtn('cancel')}${primary('import', k('enter', 'm'), 4, '')}</div></div>`;
  const frame = `<div class="frame">${histBg(1440)}${dlg}</div>`;
  return { name: `import sheet, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: [
    '<b>W-15 sheet / dialog:</b> the same container as the confirm dialog, wider (580 px), for a task with a few fields. On a phone it becomes a bottom sheet (see the phone image).',
    '<b>The paste field</b> is an ink-fill text input (' + { 1: 'surface-2 fill', 2: 'page fill on the raised panel plus a hairline', 3: 'hairline only' }[opt] + '), so it never matches the panel behind it.',
    '<b>Secondary + segmented:</b> choose file and the format control share one row; nothing else is framed inside the dialog.',
    '<b>One primary:</b> import, the only cream pill, with its enter cap; cancel is text.',
  ] };
}

function vHelp() {
  const keys = [['space', 'start, stop, next scramble'], ['tab', 'settings'], ['`', 'dev drawer'], ['esc', 'back, close'], [kp('[', ']'), 'previous / next marker'], ['1–4', 'answer a drill'], ['s', 'skip']];
  const keyHtml = keys.map(([a, b]) => `<div class="kk">${typeof a === 'string' && !a.startsWith('<') ? k(a, 'm') : a}</div><div class="kt">${b}</div>`).join('');
  const frame = `<div class="frame">${header({ active: '' })}
    <div class="help"><h1>help</h1>
      <div>${sect('keys', `<div class="panel" ${co(1)}><div class="keys" style="padding:8px 0">${keyHtml}</div></div>`)}
        ${sect('start here', `<div class="hint" style="font-size:15px;color:var(--b-ink);max-width:460px">Scramble the cube, press space and solve. The orbit around the cube shows where your time went. Connect a smart cube from the chip at the top right, or use the manual timer.</div>`)}</div>
      <div>${sect('on this device', `<div class="hint" style="font-size:15px;color:var(--b-ink);max-width:460px" ${co(2)}>Everything stays on this device. cubesight works offline once installed; imports are by paste or file.</div>`)}
        ${grp(`<div class="prow"><span>build</span><span class="v"><b>2026-10-02</b> · 7d7d554</span></div><div class="prow"><span>storage</span><span class="v"><b>12.4 MB</b> on this device</span></div>`, 3)}
        ${disc('how recognition drills work', '', '<div class="hint">Cases come back when they are due. A miss returns sooner, a fast answer later.</div>', true, 4)}
        ${disc('what the markers mean', '', '', false)}
        ${disc('export and import', '', '', false)}
      </div></div>
    ${abs('left:48px;bottom:16px', kbar(kbi(k('esc'), 'back')))}</div>`;
  return { name: `help page, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: [
    '<b>A page, not a dialog</b> (feedback #12): the help is a route with its own title, two columns of sections. It follows the same section / group / disclosure rules as the drawer.',
    '<b>Sections</b> are a mono head over content; ' + { 1: 'the key list is the only panel (a list); the prose has no frame', 2: 'each list is a soft panel; prose stays bare', 3: 'every section is cut by a hairline; no fills' }[opt] + '.',
    '<b>Footer content</b> (build, storage, "everything stays on this device") now lives here as a plain group of key / value rows.',
    '<b>W-29:</b> three disclosures for the long answers; one open to show how it expands in place.',
  ] };
}

function reviewPanel() {
  const body = `<div class="row" style="gap:8px" ${co(4)}><i style="width:12px;height:12px;border-radius:50%;border:1.5px solid var(--b-warn);display:inline-block"></i><span class="eyebrow warn">detour · cross</span></div>
    <p style="margin:0;font-size:20px;line-height:28px">From here R D′ F gets the cross in 3 moves; your D R D′ L F took 5.</p>
    ${grp(`<div class="prow"><span>yours</span><span class="v"><b>D R D′ L F</b> · 5</span></div><div class="prow"><span>better</span><span class="v"><b>R D′ F</b> · 3</span></div><div class="prow"><span>cost</span><span class="v"><b>0.6 s</b></span></div>`, 2)}
    <div class="row" style="gap:10px;margin-top:6px">${secondary('better line', '', 3, '')}${textBtn('retry this moment')}</div>
    <div class="foot" style="margin-top:auto">${textBtn('back to results')}${kbar(kbi(kp('[', ']'), 'marker'))}</div>`;
  if (opt === '1') return `<aside class="abs" style="left:48px;top:150px;width:300px;display:flex;flex-direction:column;gap:18px;height:690px;z-index:6" ${co(1)}>${body}</aside>`;
  return `<aside class="drawer" data-co-side="l" style="--dr-w:330px;top:calc(var(--dr-inset) + 70px);bottom:calc(var(--dr-inset) + 40px)" ${co(1)}>${body.replace('class="foot" style="margin-top:auto"', 'class="foot"')}</aside>`;
}
function vReview() {
  const frame = S.results({ coach: false, actions: '', keybar: '', meta: '', overlay: reviewPanel() });
  return { name: `review detail panel, option ${opt} ${NAMES[opt]} (desktop 1440 x 900)`, frame, legend: [
    opt === '1' ? '<b>Frameless rail (A-06):</b> the detail is a left column on the page background; it is not a drawer at all, because it does not hide the Orbit and needs no dismissing.' : '<b>W-14 drawer for detail:</b> a non-modal drawer on the right, on top of the results page, the same container as settings (' + (opt === '2' ? 'floating, inset, soft shadow' : 'a hairline on the left edge') + ').',
    '<b>Group:</b> the three key/value rows (yours, better, cost).',
    '<b>Buttons:</b> better line as a quiet-fill secondary, retry this moment as text; never a cream primary on a review detail.',
    '<b>Eyebrow</b> in amber for a fix, teal for praise, as in A-06; no icon needed besides the existing ! marker on the Orbit.',
  ] };
}

/* ---------- kit: the five containers side by side ---------- */
function vKit() {
  const ghost = '<div class="ghost"><i style="width:70%"></i><i style="width:90%"></i><i style="width:55%"></i><i style="width:80%"></i></div>';
  const frame = `<div class="kit">
    <div class="spec"><h4>section</h4>${sect('inspection', UI.seg('inspection', ['15 s', '∞', 'off'], 0))}${sect('show on the ring', chips([['cross', 1], ['pairs', 0]]))}<div class="cap"><b>frameless.</b> A head and space; option 3 adds a rule.</div></div>
    <div class="spec"><h4>group / panel</h4>${grp(`${UI.sw('cross hint', true, { row: true })}${UI.sw('pseudo pairs', false, { row: true })}`)}<div class="panel" style="margin-top:6px"><div class="prow"><span>PB</span><span class="v"><b>12.41</b></span></div><div class="prow"><span>ao12</span><span class="v"><b>15.03</b></span></div></div><div class="cap"><b>group</b> = settings rows; <b>panel</b> = a list or a log. Never around one control.</div></div>
    <div class="spec"><h4>disclosure</h4>${disc('advanced scramble', 'closed', '')}${disc('case colours', 'yellow top', UI.sel('case colours', ['yellow top', 'white top'], 0, { cls: 'sel--sm' }), true)}<div class="cap"><b>a row with a chevron.</b> Closed 48 px; open shows its content in the same container.</div></div>
    <div class="spec"><h4>drawer / sheet</h4><div class="mini-scene">${ghost}<aside class="drawer" style="--dr-inset:calc(var(--dr-inset-m,0px));right:var(--dr-inset);top:var(--dr-inset);bottom:var(--dr-inset)"><div class="eyebrow">settings</div><div style="height:8px"></div><div class="ghost" style="position:static;opacity:1;padding:0"><i style="width:80%"></i><i style="width:60%"></i><i style="width:90%"></i></div></aside></div><div class="cap"><b>from the right</b> on desktop, <b>from the bottom</b> on a phone. Side tasks, long forms, detail.</div></div>
    <div class="spec"><h4>dialog</h4><div class="mini-scene">${ghost}<div class="scrim" style="inset:0;opacity:.45"></div><div class="dialog"><h2>delete this solve?</h2><p>It can't be undone.</p><div class="row" style="justify-content:flex-end;gap:8px"><span class="eyebrow">cancel</span><span class="eyebrow warn">delete</span></div></div></div><div class="cap"><b>centred, modal,</b> one decision. Destructive or irreversible only.</div></div>
  </div>`;
  return { name: `the five containers, option ${opt} ${NAMES[opt]}`, frame, legend: [], noTitleLegend: true };
}

/* ---------- rules (the answer to "when is it what") ---------- */
function vRules() {
  const rows = [
    ['section', 'Anything that groups content on a page or inside a drawer: a head and white space.', '<b>Default.</b> A section never has a frame of its own. Pages (solve, drills, history, help) are made of sections only, as in the A frames.', 'settings blocks, help sections, the progress page'],
    ['group', 'Several rows of one kind inside a section: switches, key / value pairs.', 'Option 1 bare, option 2 a soft panel, option 3 between two rules. Never one control alone.', 'hint switches, session facts, build info'],
    ['panel', 'A list or a log that scrolls or is read line by line.', 'The only framed thing in option 1. Do not nest a panel in a panel.', 'event log, import preview, history of a pin'],
    ['disclosure', 'Rarely needed content on the same screen: advanced, long, technical.', 'Opens in place, never a modal. Replaces today\'s seven details looks. Not for the main action.', 'advanced scramble, connection log, help answers'],
    ['drawer / sheet', 'A side task that keeps the page visible: settings, dev, a detail panel.', 'Right on desktop, bottom on a phone, one width per use (392, 560). Closes with esc. No primary button; one drawer at a time.', 'settings, debug, review detail, filters on a phone'],
    ['dialog', 'One decision that must be taken before anything else.', 'Small, centred, modal, focus on the safe choice. Destructive or irreversible only; reversible things use a toast with undo (W-16).', 'delete a solve, forget the saved cube, import'],
  ];
  const frame = `<div class="rules"><h1>containers: which one when</h1><p class="lead">The Orbit look is mostly frameless: space and a head do the work. Reach for the next container only when the rule in the row says so. The three options below differ in how much frame each container wears, not in this ladder.</p>
    <div class="rt"><div class="h">container</div><div class="h">use it when</div><div class="h">rules</div><div class="h">examples</div>${rows.map(([a, b, c, d]) => `<div class="k">${a}</div><div>${b}</div><div>${c}</div><div>${d}</div>`).join('')}</div></div>`;
  return { name: 'the ladder: section, group, panel, disclosure, drawer, dialog', frame, legend: [], bare: true };
}

/* ---------- compare: settings drawer, the three options side by side ---------- */
function vCompare() {
  const col = (o) => `<div data-c="${o}" data-opt="3"><div class="cmp-h">option ${o}: ${NAMES[o]}</div><div class="cmp-body"><div class="dimmed" style="opacity:.3">${orbitSVG({ segs: idleSegs, w: 480, h: 900, cx: 200 }).replace(/width="1440"/, '')}</div>${settingsDrawerStatic()}</div></div>`;
  const frame = `<div class="cmp">${[1, 2, 3].map(col).join('')}</div>`;
  return { name: 'the settings drawer in the three options', frame, legend: [], bare: true };
}
const settingsDrawerStatic = () => `<aside class="drawer" style="--dr-w:auto;left:var(--dr-inset);right:var(--dr-inset);top:var(--dr-inset);bottom:var(--dr-inset)"><h2>settings<small>solve</small></h2>${settingsBody(false)}<div class="foot">${secondary('reset to defaults', '', 0, 'btn--s')}${textBtn('close')}</div></aside>`;

/* ---------- phone: settings sheet, confirm dialog, import sheet ---------- */
const PH = (inner) => `<div class="frame phone touch" style="width:390px;height:844px">${inner}</div>`;
const phHdr = '<div class="hdr" style="padding:0 24px;height:60px"><span class="word" style="font-size:17px;margin:0">cubesight</span><span class="chip-cube" style="font-size:11px"><i class="dot"></i>GAN 356 i3</span></div>';
function vPhone() {
  const bg1 = `<div class="dimmed">${phHdr}${orbitSVG({ cx: 195, cy: 190, r: 120, w: 390, h: 844, segs: idleSegs })}<svg class="stage-svg" width="390" height="844">${cubeSVG(195, 196, 86)}</svg></div><div class="scrim" style="inset:0"></div>`;
  const p1 = PH(`${bg1}<div class="sheet-b" style="top:300px" ${co(1)}><div class="grab"></div><h2>settings${textBtn('close')}</h2>
    ${sect('inspection', UI.seg('inspection', ['15 s', '∞', 'off'], 0))}
    ${grp(`${UI.sw('pseudo pairs', true, { row: true })}${UI.sw('cross hint', true, { row: true })}`, 2)}
    ${sect('show on the ring', chips([['cross', 1], ['pairs', 1], ['EO', 0], ['skips', 1]]))}
    ${disc('advanced scramble', 'closed', '', false, 3)}
    <div class="foot" style="padding-top:12px">${secondary('reset to defaults', '', 0, 'btn--s')}</div></div>`);
  const hrows = [['23', '14.07', 'today 17:33'], ['22', '14.83', 'today 17:29'], ['21', '14.55', 'today 17:24'], ['20', '15.36', 'today 17:20'], ['19', '14.97+', 'today 17:17'], ['18', '15.94', 'today 17:12'], ['17', '12.41', 'today 17:08']];
  const bg2 = `<div class="dimmed">${phHdr}${abs('left:24px;top:76px', '<div style="font-size:26px;font-weight:600">history</div>')}${abs('left:24px;top:140px;right:24px', hrows.map(([n, t, d]) => `<div class="row" style="height:56px;gap:14px"><span class="lab-mono" style="width:26px">#${n}</span><span style="font:300 22px var(--b-font-mono);width:90px">${t}</span><span class="lab-mono">${d}</span></div>`).join(''))}</div><div class="scrim" style="inset:0;opacity:.6"></div>`;
  const p2 = PH(`${bg2}<div class="dialog phone-d" ${co(4)}><h2 style="font-size:20px">delete this solve?</h2><p><b>14.07</b> · today 17:33. It leaves your history. This can't be undone.</p><div class="acts">${textBtn('cancel')}${danger('delete solve')}</div></div>`);
  const p3 = PH(`${bg2}<div class="sheet-b" style="top:330px" ${co(5)}><div class="grab"></div><h2>import a reconstruction</h2>${importBody(true).replace('height:150px', '')}<div class="foot" style="padding-top:14px">${textBtn('cancel')}${primary('import', '', 0, '')}</div></div>`);
  const frame = `<div class="phones">${p1}${p2}${p3}</div>`;
  return { name: `phone 390 x 844: settings sheet, confirm dialog, import sheet, option ${opt} ${NAMES[opt]}`, frame, width: 1290, legend: [
    '<b>W-14 on a phone:</b> the drawer becomes a bottom sheet with a grab handle, ' + { 1: 'page background, soft shadow above, flush to the screen edges', 2: 'floating and inset by 10 px with rounded corners all round', 3: 'page background with one hairline above' }[opt] + '.',
    '<b>Group</b> (hint switches): the same skin as on desktop; touch rows are 48 px and keycaps are hidden.',
    '<b>W-29 disclosure</b> in the sheet: advanced scramble, closed, the same row as on desktop.',
    '<b>W-15 dialog</b> on a phone: still centred, 350 px wide; the actions stack, the danger full width and cancel as text under it.',
    '<b>Import</b> is a tall bottom sheet, not a dialog, because it holds a text field and the keyboard may open under it.',
  ] };
}

const VIEWS = { settings: vSettings, debug: vDebug, help: vHelp, review: vReview, confirm: vConfirm, import: vImport, kit: vKit, rules: vRules, compare: vCompare, phone: vPhone };
const v = VIEWS[view]();
mount({ id: boardId, name: v.name, frame: v.frame, legend: v.legend || [], cols: 1, width: v.width });
const board = document.getElementById('board');
board.dataset.opt = '3';
board.dataset.c = opt;
