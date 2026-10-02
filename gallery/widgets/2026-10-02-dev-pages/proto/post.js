// W-34: the blog post layout, three ways. The text is the real W-04 buttons post (shortened).
import { ROOT } from './data.js';
import { UI, key, primary, secondary, textBtn, toast, co, sbadge, btag, copyLink } from './kit.js';
import { shell } from './timeline.js';

const DIR = `${ROOT}gallery/widgets/2026-10-02-buttons/`;
const IM = [
  ['W-04-00', 'the three options side by side', 'W-04-00-compare-options.png'],
  ['W-04-01', 'option 1: states matrix, dark and light', 'W-04-01-option1-states.png'],
  ['W-04-02', 'option 1: results actions (A-05)', 'W-04-02-option1-results.png'],
  ['W-04-04', 'option 1: drill round answers (A-08)', 'W-04-04-option1-drill.png'],
  ['W-04-05', 'option 1: phone (A-09) touch sizes', 'W-04-05-option1-phone.png'],
  ['W-04-06', 'option 2: states matrix', 'W-04-06-option2-states.png'],
].map(([id, title, f]) => ({ id, title, url: DIR + f }));
const ref = id => `<span class="ref">${id.replace('W-04-', '')}</span>`;

const TITLE = 'W-04 Buttons: three consolidated designs (23 variants become 3 emphases)';
const DEC = 'pending user choice';
const para = (n = 0) => `<p ${co(n)}><b>What is there today.</b> 23 button variants on 21 pages. They differ in fill (teal in six of them, cream, dark surface, outline), shape (pill, 6 px, 8 px, 12 px), height (25 to 48 px) and in whether the key hint is inside. The look in the A frames is much simpler: <b>one cream pill with the key inside, then two quiet text actions</b> (<code>next scramble · review · more…</code>).</p>
<p><b>What every option shares.</b></p>
<ul><li>Three emphases: <b>primary</b> (one per screen), <b>secondary</b>, <b>text</b>, plus an icon-only form for close.</li><li>Sizes L 48, M 40, S 32; on touch L 52, M 44, S 40.</li><li>Answer buttons show <b>correct</b> (teal edge and ✦) and <b>wrong</b> (amber edge and !).</li></ul>`;
const options = `<p><b>The options</b> (images ${ref('W-04-01')} option 1, ${ref('W-04-06')} option 2, ${ref('W-04-00')} compares them):</p>
<ol><li><b>Quiet fill.</b> Cream primary pill (A-05 as drawn), secondary = surface pill with a hairline edge, text = no container.</li><li><b>Outline.</b> The same cream primary, but the secondary is an outlined pill with no fill.</li><li><b>Teal action.</b> Teal primary with 12 px corners; the accent then means do this, good and on at once.</li></ol>`;
const rec = `<h3>Recommendation</h3><p><b>Option 1.</b> It is the A-05 look, keeps teal exclusive to good, on and focus, and the filled secondary stays visible in light mode.</p>
<h3>Questions for you</h3><ol><li>Primary colour: cream (options 1 and 2) or teal (option 3)?</li><li>Secondary: a filled surface pill or an outlined pill?</li><li>Sizes: are L 48 / M 40 / S 32 right?</li></ol>`;

const meta = (n = 0) => `<div class="ph"><span class="sub-m">oct 2, 2026</span>${btag('widgets', true)}${sbadge('exploring', n)}<span class="sub-m">widget design agent</span></div>`;
const decision = (n = 0) => `<div class="dline" ${co(n)}><span class="lab-mono">decision</span><b>${DEC}</b></div>`;
const fig = (it, n = 0) => `<figure class="kimg" ${co(n)}><img src="${it.url}" alt=""><figcaption><b>${it.id}</b><span>${it.title}</span></figcaption></figure>`;
const tile = (it, sel = false) => `<figure class="c2 ${sel ? 'sel' : ''}"><img src="${it.url}" alt=""><span class="ck">✓</span><span class="id">${it.id}</span></figure>`;
const lineage = (n = 0) => `<div class="lin" ${co(n)}><div class="lab-mono">grew out of</div><a><i>oct 2</i>Widget inventory: every UI widget in the app</a><div class="lab-mono" style="margin-top:6px">led to</div><a><i>oct 2</i>W-17 Keycaps and the key bar</a><a><i>oct 2</i>System check: the approved widgets together</a></div>`;
const foot = `<div class="row wrap" style="gap:8px">${secondary('compare with parent', 0, 'btn--s')}${copyLink()}${textBtn('all posts on widgets', 0, 'btn--s')}</div>`;

export function post(opt, phone) {
  let body = '';
  const crumbs = '<div class="eyebrow">dev · gallery · <span style="color:var(--b-ink)">blog</span> / widgets-W-04-buttons</div>';
  if (opt === 1) {
    body = `${crumbs}
      <div style="display:grid;gap:16px;max-width:${phone ? 'none' : '760px'}">
        ${meta(2)}
        <h1 ${co(1)} style="font-size:${phone ? 24 : 34}px;line-height:1.15">${TITLE}</h1>
        ${decision(3)}
        <div class="md">${para(0)}${options}${fig(IM[0], 4)}${rec}</div>
        ${foot}
      </div>
      <div class="lab-mono" ${co(5)} style="margin-top:6px">${IM.length} images</div>
      <div class="grid2" style="grid-template-columns:repeat(${phone ? 3 : 6},minmax(0,1fr))">${IM.map((it, i) => tile(it, i === 2)).join('')}</div>
      <div style="max-width:760px;margin-top:6px">${lineage(6)}</div>`;
  } else if (opt === 2) {
    const rail = `<div style="display:grid;gap:16px;align-content:start;${phone ? '' : 'position:sticky;top:80px'}">
        ${meta()}${decision(2)}
        <div ${co(3)}>${lineage()}</div>
        <div ${co(4)}><div class="lab-mono" style="margin-bottom:8px">images</div><div class="nl">${IM.map((it, i) => `<div class="nr ${i === 2 ? 'on' : ''}" style="grid-template-columns:20px 1fr;height:30px"><i>${i + 1}</i><span>${it.id} ${it.title.replace('option 1: ', '')}</span></div>`).join('')}</div></div>
        <div class="row wrap" style="gap:8px">${primary('compare with parent', '', 5, 'btn--m')}${copyLink()}</div></div>`;
    const main = `<div style="display:grid;gap:16px;min-width:0">
        <h1 ${co(1)} style="font-size:${phone ? 24 : 34}px;line-height:1.15">${TITLE}</h1>
        <div class="md">${para(0)}${fig(IM[0], 6)}${options}${fig(IM[2])}${rec}${fig(IM[3])}</div></div>`;
    body = `${crumbs}${phone ? `${main}<div style="height:6px"></div>${rail}` : `<div style="display:grid;grid-template-columns:300px minmax(0,780px);gap:56px;align-items:start">${rail}${main}</div>`}`;
  } else {
    const hw = phone ? 354 : 860; const hh = Math.round(hw * 1010 / 1440);
    const hero = `<div ${co(2)} style="display:grid;gap:10px"><div class="stage" style="width:${hw}px;height:${hh}px"><img src="${IM[2].url}" alt="" style="object-fit:contain;background:var(--b-surface-2)"><span class="tagc" style="left:12px">${IM[2].id}</span></div>
        <div class="row" ${co(5)} style="gap:8px;overflow:hidden">${IM.map((it, i) => `<div style="flex:0 0 ${phone ? 84 : 130}px">${tile(it, i === 2)}</div>`).join('')}</div>
        <div class="row" style="justify-content:space-between"><span class="cap-m">${IM[2].id} · ${IM[2].title}</span><span class="cap-m">3 of ${IM.length} · ← →</span></div></div>`;
    const side = `<div style="display:grid;gap:16px;align-content:start">${decision(3)}<div ${co(4)}>${lineage()}</div>${foot}</div>`;
    body = `${crumbs}
      <div style="display:grid;gap:10px">${meta()}<h1 ${co(1)} style="font-size:${phone ? 24 : 34}px;line-height:1.15">${TITLE}</h1></div>
      ${phone ? `${hero}${side}<div class="md">${para(0)}${options}${rec}</div>` : `<div style="display:grid;grid-template-columns:860px minmax(0,1fr);gap:48px;align-items:start">${hero}${side}</div><div class="md" ${co(6)} style="max-width:860px">${para(0)}${options}${rec}</div>`}`;
  }
  void UI; void key;
  const t = phone ? '' : `<div class="abs" style="right:48px;top:842px;z-index:7">${toast('link copied', '', 7)}</div>`;
  return shell(phone, body, t);
}
