import { LAB_PROPOSALS, getProposal } from './registry.js';
import { downloadFeedback, readFeedback, saveFeedback } from './feedback.js';

const css = `
.lab { padding:20px clamp(14px,3vw,36px) 48px; color:var(--ink); }
.lab-head { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin:0 auto 20px; max-width:1600px; }
.lab-head h1 { margin:0; font-size:clamp(24px,4vw,40px); }
.lab-head p { max-width:680px; margin:8px 0 0; color:var(--muted); line-height:1.55; }
.lab-toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:end; max-width:1600px; margin:0 auto 16px; }
.lab-toolbar label { display:grid; gap:4px; color:var(--muted); font-size:12px; }
.lab-toolbar select,.lab-note { min-height:36px; padding:6px 9px; border:1px solid var(--line); border-radius:6px; background:var(--surface,#fff); color:var(--ink); font:inherit; }
.lab-proposals { display:grid; gap:24px; max-width:1600px; margin:auto; }
.lab-proposal { padding:16px; border:1px solid var(--line); border-radius:12px; background:var(--surface,#fff); }
.lab-proposal-head { display:flex; justify-content:space-between; gap:14px; align-items:start; }
.lab-proposal h2 { margin:0; font-size:20px; }
.lab-proposal p { max-width:760px; color:var(--muted); line-height:1.5; }
.lab-variants { display:grid; grid-template-columns:repeat(var(--lab-columns,2),minmax(260px,1fr)); gap:12px; align-items:start; }
.lab-variant { min-width:0; border:1px solid var(--line); border-radius:9px; overflow:hidden; }
.lab-variant-head { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:9px 11px; }
.lab-variant-head strong { font:12px var(--mono); }
.lab-variant-head span { color:var(--muted); font-size:12px; }
.lab-variant-switches { display:flex; gap:4px; }
.lab-variant-switches button { min-width:30px; min-height:30px; border:1px solid var(--line); border-radius:4px; background:transparent; color:var(--ink); font:12px var(--mono); cursor:pointer; }
.lab-variant-switches button[aria-pressed="true"] { border-color:var(--accent); background:color-mix(in srgb,var(--accent) 14%,transparent); }
.lab-frame-scroll { overflow:auto; background:#101820; padding:8px; }
.lab-frame { display:block; width:100%; height:560px; margin:auto; border:0; background:#f5f7fa; }
.lab-feedback { display:grid; grid-template-columns:auto auto minmax(100px,1fr); gap:6px; padding:8px; }
.lab-feedback button,.lab-toolbar button { min-height:34px; padding:6px 11px; border:1px solid var(--line); border-radius:6px; background:transparent; color:var(--ink); font:inherit; cursor:pointer; }
.lab-feedback button[aria-pressed="true"] { border-color:var(--accent); background:color-mix(in srgb,var(--accent) 14%,transparent); }
.lab-note { min-width:0; }
.lab-status { min-height:1.4em; margin:0; color:var(--muted); font:12px var(--mono); }
@media(max-width:760px) { .lab-head { align-items:start; flex-direction:column; } .lab-variants { grid-template-columns:minmax(0,1fr); } .lab-frame { height:620px; } }
`;

export function mountDesignLab(root) {
  let active = true;
  let selected = getProposal(proposalIdFromHash(location.hash));
  let viewport = 'desktop';
  let theme = 'dark';
  let fixture = selected.fixture;
  const frames = new Map();
  let activeFrame = null;
  const style = document.createElement('style');
  style.textContent = css;
  root.replaceChildren(style);
  root.className = 'lab';
  root.innerHTML += `
    <header class="lab-head"><div><p class="eyebrow">dev area · proposals</p><h1>Design lab</h1><p>Compare proposals in the real application with isolated fixture data. Each preview uses the shared app route, Orbit and Cube code, in a sandboxed storage area.</p></div><button type="button" data-lab-export>export feedback JSON</button></header>
    <div class="lab-toolbar">
      <label>Proposal<select data-lab-proposal></select></label>
      <label>Fixture state<select data-lab-fixture></select></label>
      <label>Viewport<select data-lab-viewport><option value="desktop">Desktop · 1280</option><option value="tablet">Tablet · 768</option><option value="phone">Phone · 390</option></select></label>
      <label>Orbit theme<select data-lab-theme><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <button type="button" data-lab-refresh>reload fixtures</button>
    </div>
    <main class="lab-proposals" data-lab-content></main>
    <p class="lab-status" role="status" aria-live="polite" data-lab-status></p>`;

  const $ = selector => root.querySelector(selector);
  const status = text => { $('[data-lab-status]').textContent = text; };
  async function postFeedback(entry) {
    try {
      const response = await fetch('/__lab-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
      const saved = await response.json();
      if (response.ok) status(`Saved locally and to ${saved.file}.`);
    } catch { status('Saved locally. Dev feedback endpoint is unavailable; export JSON to share it.'); }
  }
  $('[data-lab-proposal]').innerHTML = LAB_PROPOSALS.map(item => `<option value="${item.id}">${item.title}</option>`).join('');
  $('[data-lab-proposal]').value = selected.id;

  function buildPreviewUrl(variant) {
    const target = selected.fixture === 'history' ? '/history' : '/solve';
    const params = new URLSearchParams({ labPreview: '1', fixture: selected.fixture, state: fixture, theme, proposal: selected.id, variant: variant.id });
    return `/__lab-preview?${params.toString()}#${target}`;
  }

  function styleFrame(frame, variant) {
    try {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      const currentVariant = selected.variants.find(item => item.id === frame.dataset.labVariant) ?? variant;
      applyFrameVariant(frame, currentVariant);
      if (!doc.__cubesightLabKeys) {
        doc.__cubesightLabKeys = true;
        doc.addEventListener('keydown', event => {
          if (!['1', '2', '3'].includes(event.key) || event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
          const targetVariant = selected.variants[Number(event.key) - 1];
          if (targetVariant && frame.isConnected) { activeFrame = frame; applyFrameVariant(frame, targetVariant); }
        });
      }
      if (!frame.__labObserver && doc.body) {
        frame.__labObserver = new MutationObserver(() => {
          const currentVariant = selected.variants.find(item => item.id === frame.dataset.labVariant) ?? variant;
          applyFrameVariant(frame, currentVariant);
        });
        frame.__labObserver.observe(doc.body, { childList: true, subtree: true });
      }
    } catch { /* The preview route is same-origin; a transient navigation is expected. */ }
  }

  function applyFrameVariant(frame, variant) {
    frame.dataset.labVariant = variant.id;
    try {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      const target = selected.id === 'results-actions' ? doc.querySelector('.f1-results') : doc.documentElement;
      if (target) {
        target.dataset.labProposal = selected.id;
        target.dataset.labVariant = variant.id;
      }
      let injected = doc.querySelector('#cubesight-lab-variant');
      if (!injected) { injected = doc.createElement('style'); injected.id = 'cubesight-lab-variant'; doc.head.append(injected); }
      injected.textContent = variant.apply({ proposal: selected.id, variant: variant.id, state: fixture });
      const card = frame.closest('.lab-variant');
      if (card) {
        card.dataset.activeVariant = variant.id;
        const label = card.querySelector('[data-active-variant-label]');
        if (label) label.textContent = `${variant.id} · ${variant.label}`;
        const description = card.querySelector('[data-active-variant-description]');
        if (description) description.textContent = variant.description;
        card.querySelectorAll('[data-lab-variant-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.labVariantChoice === variant.id)));
        const key = `${selected.id}:${variant.id}`;
        const latest = readFeedback().filter(entry => entry.key === key).at(-1);
        card.querySelectorAll('[data-vote]').forEach(button => button.setAttribute('aria-pressed', String(latest?.vote === button.dataset.vote)));
        const note = card.querySelector('.lab-note');
        if (note) note.value = latest?.note ?? '';
      }
    } catch { /* The preview route is same-origin; a transient navigation is expected. */ }
  }

  function render() {
    frames.clear();
    activeFrame = null;
    const pane = $('[data-lab-content]');
    pane.replaceChildren();
    pane.style.setProperty('--lab-columns', selected.variants.length);
    const article = document.createElement('section');
    article.className = 'lab-proposal';
    article.innerHTML = `<div class="lab-proposal-head"><div><h2>${selected.title}</h2><p>${selected.why}</p><p><strong>Live route:</strong> ${selected.route} · <strong>Target:</strong> <code>${selected.component}</code></p></div><p>Keys <kbd>1</kbd>–<kbd>3</kbd> switch the focused preview instantly.</p></div><div class="lab-variants"></div>`;
    const variantsRoot = article.querySelector('.lab-variants');
    for (const variant of selected.variants) {
      const key = `${selected.id}:${variant.id}`;
      const old = readFeedback().filter(entry => entry.key === key).at(-1);
      const card = document.createElement('section');
      card.className = 'lab-variant';
      card.dataset.activeVariant = variant.id;
      card.innerHTML = `<div class="lab-variant-head"><div><strong data-active-variant-label>${variant.id} · ${variant.label}</strong><span data-active-variant-description>${variant.description}</span></div><div class="lab-variant-switches">${selected.variants.map(item => `<button type="button" data-lab-variant-choice="${item.id}" aria-pressed="${item.id === variant.id}" aria-label="Show variant ${item.id}">${item.id}</button>`).join('')}</div></div><div class="lab-frame-scroll"><iframe class="lab-frame" title="${selected.title}, variant ${variant.id}" loading="lazy"></iframe></div><div class="lab-feedback"><button type="button" data-vote="pick" aria-pressed="${old?.vote === 'pick'}">pick</button><button type="button" data-vote="reject" aria-pressed="${old?.vote === 'reject'}">reject</button><input class="lab-note" aria-label="Note for ${variant.id}" placeholder="Add a note" value="${escapeAttr(old?.note || '')}"></div>`;
      const frame = card.querySelector('iframe');
      frames.set(variant.id, frame);
      if (!activeFrame) activeFrame = frame;
      frame.style.width = viewport === 'desktop' ? '1280px' : viewport === 'tablet' ? '768px' : '390px';
      frame.addEventListener('pointerenter', () => { activeFrame = frame; });
      frame.addEventListener('focus', () => { activeFrame = frame; });
      frame.addEventListener('load', () => styleFrame(frame, selected.variants.find(item => item.id === frame.dataset.labVariant) ?? variant));
      frame.src = buildPreviewUrl(variant);
      card.querySelectorAll('[data-lab-variant-choice]').forEach(button => button.addEventListener('click', () => {
        activeFrame = frame;
        const targetVariant = selected.variants.find(item => item.id === button.dataset.labVariantChoice);
        if (targetVariant) applyFrameVariant(frame, targetVariant);
      }));
      card.querySelectorAll('[data-vote]').forEach(button => button.addEventListener('click', async () => {
        const activeVariant = selected.variants.find(item => item.id === card.dataset.activeVariant) ?? variant;
        const entry = { key: `${selected.id}:${activeVariant.id}`, proposal: selected.id, variant: activeVariant.id, vote: button.dataset.vote, note: card.querySelector('.lab-note').value, fixture: selected.fixture, route: selected.route, state: fixture, viewport, theme };
        const all = saveFeedback(entry);
        card.querySelectorAll('[data-vote]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
        status(`Saved ${entry.vote} for ${variant.id} locally (${all.length} decisions).`);
        await postFeedback(entry);
      }));
      card.querySelector('.lab-note').addEventListener('change', event => {
        const activeVariant = selected.variants.find(item => item.id === card.dataset.activeVariant) ?? variant;
        const feedbackKey = `${selected.id}:${activeVariant.id}`;
        const latest = readFeedback().filter(entry => entry.key === feedbackKey).at(-1);
        const entry = { key: feedbackKey, proposal: selected.id, variant: activeVariant.id, vote: latest?.vote ?? 'note', note: event.currentTarget.value, fixture: selected.fixture, route: selected.route, state: fixture, viewport, theme };
        saveFeedback(entry);
        void postFeedback(entry);
      });
      variantsRoot.append(card);
    }
    pane.append(article);
    status(`Showing ${selected.variants.length} real ${selected.page} variants.`);
  }

  $('[data-lab-proposal]').addEventListener('change', event => {
    selected = getProposal(event.currentTarget.value);
    fixture = selected.fixture;
    $('[data-lab-fixture]').innerHTML = selected.states.map(state => `<option value="${state}">${state}</option>`).join('');
    $('[data-lab-fixture]').value = fixture;
    render();
    const nextHash = `#/dev/lab/${encodeURIComponent(selected.id)}`;
    if (location.hash !== nextHash) location.hash = nextHash;
  });
  $('[data-lab-fixture]').innerHTML = selected.states.map(state => `<option value="${state}">${state}</option>`).join('');
  $('[data-lab-fixture]').addEventListener('change', event => { fixture = event.currentTarget.value; render(); });
  $('[data-lab-viewport]').addEventListener('change', event => { viewport = event.currentTarget.value; render(); });
  $('[data-lab-theme]').addEventListener('change', event => { theme = event.currentTarget.value; render(); });
  $('[data-lab-refresh]').addEventListener('click', render);
  $('[data-lab-export]').addEventListener('click', () => downloadFeedback());
  root.addEventListener('keydown', event => {
    if (!['1', '2', '3'].includes(event.key) || event.target.matches('input,textarea,select')) return;
    const variant = selected.variants[Number(event.key) - 1];
    if (!variant) return;
    const frame = activeFrame?.isConnected ? activeFrame : frames.values().next().value;
    if (frame) applyFrameVariant(frame, variant);
    status(`Switched the focused preview to variant ${variant.id}.`);
  });
  const onHashChange = () => {
    const routeProposal = getProposal(proposalIdFromHash(location.hash));
    if (routeProposal.id === selected.id) return;
    selected = routeProposal;
    fixture = selected.fixture;
    $('[data-lab-proposal]').value = selected.id;
    $('[data-lab-fixture]').innerHTML = selected.states.map(state => `<option value="${state}">${state}</option>`).join('');
    $('[data-lab-fixture]').value = fixture;
    render();
  };
  window.addEventListener('hashchange', onHashChange);
  render();
  return {
    setActive(value) {
      if (active === value) return;
      active = value;
      root.hidden = !value;
      if (value) render();
      else for (const frame of frames.values()) frame.src = 'about:blank';
    },
    destroy() { active = false; window.removeEventListener('hashchange', onHashChange); frames.clear(); root.replaceChildren(); },
    get active() { return active; },
  };
}

function escapeAttr(value) { return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'); }
function proposalIdFromHash(hash) {
  const match = /^#\/dev\/lab(?:\/([^/?]+))?/.exec(hash);
  if (!match?.[1]) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}
