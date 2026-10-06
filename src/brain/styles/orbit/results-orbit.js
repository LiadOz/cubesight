import { createActions, createCoachLine, createKeyBar } from '../../../ui/shared/index.js';
import { setText, toggleClass } from '../../dom.js';
import { createReviewPanel } from '../../review/panel.js';
import { stateAfter } from '../../../review/replay.js';
import { presentResultsOrbit } from './solve-orbit.js';
import { resolvePastReviewHref } from './results-navigation.js';
import '../../css/results-orbit.css';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const hrefWith = (path, params) => `${path}?${new URLSearchParams(params)}`;

function caseForStage(results, detail) {
  const stage = detail?.stage ?? detail?.stageKey ?? detail?.key;
  if (!stage) return null;
  const links = results?.caseLinks ?? {};
  const direct = links[stage];
  if (direct) return direct;
  const timelineCase = results?.timeline?.segments?.find(segment => segment.key === stage)?.caseKey;
  if (timelineCase && links[timelineCase]) return links[timelineCase];
  if (stage === 'oll' || stage === 'co') return links.oll ?? null;
  if (stage === 'pll' || stage === 'ep') return links.pll ?? null;
  return null;
}

/** The shared solve result rail used by live results and history past solves. */
export function createOrbitResults(host, ctx = {}) {
  const root = el('section', 'f1-results is-hidden');
  root.setAttribute('aria-label', 'Solve results');
  const historyNav = el('nav', 'f1-results__history-nav');
  const time = el('div', 'f1-results__time');
  time.append(el('span', 'f1-results__eyebrow', 'time'), el('strong', 'f1-results__number'), el('p', 'f1-results__compare'));
  const coachHost = el('div', 'f1-results__coach');
  const coachTag = el('p', 'f1-results__coach-tag'); coachTag.append(el('i'), document.createTextNode('coach'));
  const casePrompt = el('button', 'ui-action f1-results__case-prompt', 'open case');
  casePrompt.type = 'button'; casePrompt.hidden = true; casePrompt.dataset.action = 'case';
  const detailHost = el('div', 'f1-results__detail-host');
  const caseMenu = el('div', 'f1-results__case-menu');
  caseMenu.hidden = true;
  const caseTitle = el('p', 'f1-results__case-title');
  const caseLinks = el('div', 'f1-results__case-links');
  caseMenu.append(caseTitle, caseLinks);
  const actions = el('div', 'f1-results__actions');
  const actionRow = createActions(actions, [
    { label: 'next scramble', primary: true, onClick: () => mode === 'past' ? ctx.onReplay?.() : ctx.dispatch?.({ type: 'next' }) },
    { label: 'review', href: '#/review' },
    { label: 'more…', onClick: () => { more.open = !more.open; } },
  ]);
  const [next, reviewLink] = [...actionRow.children];
  next.dataset.action = 'next';
  const more = document.createElement('details'); more.className = 'f1-results__more';
  const moreBody = el('div', 'f1-results__more-body');
  const coachDemo = el('button', 'ui-action f1-results__coach-demo', 'copy coach demo link'); coachDemo.type = 'button'; coachDemo.dataset.action = 'coach-demo'; coachDemo.hidden = true;
  const penalty = el('button', 'ui-action', 'edit +2 / DNF'); penalty.type = 'button'; penalty.dataset.action = 'penalty';
  const retry = el('button', 'ui-action', 'retry scramble'); retry.type = 'button'; retry.dataset.action = 'retry';
  moreBody.append(coachDemo, penalty, retry); const moreSummary = document.createElement('summary'); moreSummary.hidden = true; moreSummary.textContent = 'more actions'; more.append(moreSummary, moreBody);
  actions.append(more);
  const keysHost = el('div', 'f1-results__keys');
  root.append(historyNav, time, coachTag, coachHost, casePrompt, caseMenu, detailHost, actions, keysHost);
  host.append(root);

  const coach = createCoachLine(coachHost, { orbit: ctx.resultsOrbit, connectorHost: host.closest('.b-stage') ?? coachHost });
  const review = createReviewPanel(detailHost, { dispatch: action => ctx.dispatch?.(action), compact: true });
  let keyBar = createKeyBar(keysHost, []);
  let key = null;
  let currentRecord = null;
  let mode = ctx.mode ?? 'live';
  let pastNavigation = ctx.pastNavigation ?? null;
  let externalCube = ctx.resultsCube ?? null;
  let selectedCase = null;

  function currentPath() { return location.hash || '#/solve'; }
  function caseHref(info, algs) {
    const from = currentPath();
    const fields = { from };
    if (info.usedAlg) fields.usedAlg = info.usedAlg;
    for (const field of ['recognitionMs', 'executionMs']) if (Number.isFinite(info[field]) && info[field] >= 0) fields[field] = String(info[field]);
    if (algs) return hrefWith(`#/algs/${info.kind}/${encodeURIComponent(info.id)}`, fields);
    const cases = info.kind === 'pll' ? info.name : info.id;
    return hrefWith(`#/drills/${info.kind}`, { cases, ...fields });
  }
  function showCase(info) {
    if (!info) return;
    caseTitle.textContent = `${info.kind.toUpperCase()} · ${info.name}`;
    caseLinks.replaceChildren();
    const algorithms = el('a', 'ui-action', `${info.name} algorithms`);
    algorithms.href = caseHref(info, true);
    const drill = el('a', 'ui-action', `drill ${info.name}`);
    drill.href = caseHref(info, false);
    caseLinks.append(algorithms, drill);
    caseMenu.hidden = false;
  }
  root.addEventListener('click', event => {
    const button = event.target.closest?.('[data-action]');
    if (!button || !root.contains(button)) return;
    if (button.dataset.action === 'retry') ctx.dispatch?.({ type: 'retry' });
    if (button.dataset.action === 'penalty') ctx.dispatch?.({ type: 'togglePenalty', penalty: currentRecord?.penalty === '+2' ? null : '+2' });
    if (button.dataset.action === 'coach-demo') review.copyCoachDemo(button);
    if (button.dataset.action === 'case' && selectedCase) showCase(selectedCase);
  });
  root.addEventListener('keydown', event => { if (event.key === 'Escape' && !caseMenu.hidden) caseMenu.hidden = true; });

  function update(result, previous = null) {
    mode = ctx.mode ?? mode;
    root.dataset.mode = mode;
    pastNavigation = ctx.pastNavigation ?? pastNavigation;
    const page = result?.screen ? result : null;
    const model = page ? page.results : result;
    const r = model?.vm ? { ...model.vm, record: model.record ?? model.vm.record, key: model.key ?? model.vm.key } : model;
    toggleClass(root, 'is-hidden', !r);
    if (!r) { key = null; currentRecord = null; return; }
    if (previous && previous.results === result?.vm && key === r.key) return;
    key = r.key;
    currentRecord = r.record;
    historyNav.replaceChildren();
    if (mode === 'past' && pastNavigation) {
      const back = el('a', 'f1-results__crumb');
      back.append(el('span', 'crumb-chevron', '‹'), ` ${pastNavigation.back?.label ?? 'history'}`);   // the chevron is drawn on a phone (A-12), the text stays the accessible name
      back.href = pastNavigation.back?.href ?? '#/history';
      const neighbors = el('span', 'f1-results__neighbors');
      for (const direction of ['previous', 'next']) {
        const nav = pastNavigation[direction];
        if (!nav?.href) continue;
        const link = el('a', '', direction === 'previous' ? '‹' : '›'); link.href = nav.href; link.title = nav.label ?? `${direction} solve`; link.setAttribute('aria-label', link.title); neighbors.append(link);
      }
      historyNav.append(back, neighbors);
    }
    setText(root.querySelector('.f1-results__number'), r.time.resultText ?? r.time.text);
    const compare = [r.vsAo12?.text && `${r.vsAo12.text} vs ao12`, r.session?.ao5 && `ao5 ${r.session.ao5}`, r.session?.pb && `PB ${r.session.pb}`].filter(Boolean).join(' · ');
    setText(root.querySelector('.f1-results__compare'), compare);
    root.querySelector('.f1-results__time').dataset.tone = r.time.tone;
    coach.update({ text: r.review.coach.text, marker: r.review.selectedId, orbit: ctx.resultsOrbit });
    review.update(r.review);
    coachDemo.hidden = mode === 'past' || !r.review.coach.markerId;
    if (mode === 'past') {
      presentResultsOrbit(ctx.resultsOrbit, r, { dispatch: action => ctx.dispatch?.(action) });
      if (r.review.detail?.replayable && r.review.detail.variant !== 'better' && typeof externalCube?.setState === 'function') {
        externalCube.setState(stateAfter(r.record, r.review.detail.cursor ?? r.review.detail.start ?? 0));
      }
    }
    const fallbackReview = `#/review/${encodeURIComponent(r.record?.at ?? '')}`;
    const firstMarker = r.review.markers?.[0]?.id ?? r.review.markers?.[0]?.key ?? null;
    const fullReview = mode === 'past'
      ? resolvePastReviewHref(pastNavigation, r.review.selectedId ?? firstMarker, fallbackReview)
      : fallbackReview;
    reviewLink.href = fullReview;
    next.hidden = mode === 'past';
    if (mode === 'past' && ctx.onReplay) {
      next.hidden = false; next.textContent = 'replay';
    } else next.textContent = 'next scramble';
    more.hidden = mode === 'past';
    keyBar.remove();
    const liveKeys = mode === 'past' ? [{ key: '[ ]', label: 'markers' }] : [{ key: 'space', label: 'next scramble' }, { key: '[ ]', label: 'markers' }];
    keyBar = createKeyBar(keysHost, liveKeys);
    caseMenu.hidden = true;
    selectedCase = page?.caseChoice ? (r.caseLinks?.[page.caseChoice] ?? null) : caseForStage(r, r.review.detail);
    casePrompt.hidden = !selectedCase;
    if (selectedCase) casePrompt.textContent = `open ${selectedCase.name} case`;
    const detail = r.review.detail;
    if (!selectedCase && detail?.caseId) {
      selectedCase = r.caseLinks?.[detail.stage] ?? (detail.stage?.includes('pll') ? r.caseLinks?.pll : r.caseLinks?.oll) ?? null;
      casePrompt.hidden = !selectedCase;
      if (selectedCase) casePrompt.textContent = `open ${selectedCase.name} case`;
    }
  }

  return {
    update,
    setCube(cube) { externalCube = cube; root.dataset.hasCube = String(Boolean(externalCube)); },
    openCase(info) { showCase(info); },
    destroy() { coach.destroy(); review.destroy(); root.remove(); },
  };
}
