// Mono timeline: one lane per step, each as wide as your average for it,
// grouped (f2l · oll · pll) under hairline headers. The current segment's fill
// and caret follow the clock every frame; finished segments show split and
// delta. On phones the lane compresses and a split list appears below it.

import { setAttr, setStyle, setText, toggleClass } from '../../dom.js';

/** @typedef {import('../../types.js').BrainVM} BrainVM */
/** @typedef {import('../../types.js').SegmentVM} SegmentVM */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function buildSegment(seg) {
  const node = el('div', 'm-seg');
  node.dataset.key = seg.key;
  const label = el('p', 'm-seg-label');
  label.append(el('span', 'm-seg-name'), el('span', 'm-seg-tags'));
  const track = el('div', 'm-seg-track');
  track.append(el('i', 'm-seg-fill'), el('b', 'm-seg-caret'), el('span', 'm-seg-spark', '✦'));
  node.append(label, track, el('p', 'm-seg-split'), el('p', 'm-seg-delta'));
  return node;
}

function buildRow(seg) {
  const row = el('li', 'm-row');
  row.dataset.key = seg.key;
  const name = el('span', 'm-row-name');
  name.append(el('span'), el('span', 'm-row-tags'));
  row.append(name, el('span', 'm-row-delta'), el('span', 'm-row-split'));
  return row;
}

/** @type {import('../../types.js').ComponentFactory} */
export function createLinearTimeline(host) {
  const root = el('div', 'm-tl');
  const insp = el('p', 'm-tl-insp');
  const cols = el('div', 'm-tl-cols');
  const list = el('ol', 'm-tl-list');
  const foot = el('p', 'm-tl-foot', 'ghost segments = your average pace per step');
  root.append(insp, cols, list, foot);
  host.append(root);

  let planKey = null;
  /** @type {Map<string, HTMLElement>} */
  let segEls = new Map();
  /** @type {Map<string, HTMLElement>} */
  let rowEls = new Map();
  /** @type {Map<string, HTMLElement>} */
  let colEls = new Map();
  let currentKey = null;

  function rebuild(timeline) {
    cols.replaceChildren();
    list.replaceChildren();
    segEls = new Map();
    rowEls = new Map();
    colEls = new Map();
    const inGroup = new Map();
    for (const group of timeline.groups) for (let i = group.from; i <= group.to; i++) inGroup.set(i, group);
    timeline.segments.forEach((seg, i) => {
      const group = inGroup.get(i);
      let col;
      if (group && colEls.has(group.id)) col = colEls.get(group.id);
      else {
        col = el('div', group ? 'm-col m-group' : 'm-col');
        const head = el('p', 'm-col-head');
        if (group) head.append(el('span', 'm-col-title', group.label), ...(group.sub ? [el('span', 'm-col-dot', '·'), el('span', 'm-col-sub', group.sub)] : []), el('i', 'm-col-rule'));
        col.append(head, el('div', 'm-col-segs'));
        cols.append(col);
        colEls.set(group ? group.id : `solo-${seg.key}`, col);
      }
      const node = buildSegment(seg);
      col.querySelector('.m-col-segs').append(node);
      segEls.set(seg.key, node);
      const row = buildRow(seg);
      list.append(row);
      rowEls.set(seg.key, row);
    });
    planKey = timeline.planKey;
  }

  /** Apply a fill (0..1) to a segment's bar and caret. */
  function setFill(node, fill) {
    const f = Math.max(0, Math.min(1, fill));
    setStyle(node, '--fill', f.toFixed(4));
  }

  /** @param {BrainVM} vm @param {BrainVM|null} prev */
  function update(vm, prev) {
    const timeline = vm.timeline;
    if (timeline === prev?.timeline && planKey === timeline.planKey) return;
    if (timeline.planKey !== planKey) rebuild(timeline);
    toggleClass(root, 'is-ghost', timeline.ghost);
    toggleClass(root, 'is-results', vm.screen === 'results');
    setText(insp, timeline.insp?.text ?? '');
    insp.hidden = !timeline.insp;
    foot.hidden = !timeline.ghost;
    currentKey = timeline.segments[timeline.currentIndex]?.key ?? null;
    // Column widths follow the average split of their steps.
    for (const col of colEls.values()) {
      const weight = [...col.querySelectorAll('.m-seg')].reduce((sum, node) => sum + (timeline.segments.find(s => s.key === node.dataset.key)?.weight ?? 0), 0);
      setStyle(col, 'flex-grow', (weight * 100).toFixed(3));   // weights sum to 1; flex-grow below 1 would not fill
    }
    for (const seg of timeline.segments) {
      const node = segEls.get(seg.key);
      if (!node) continue;
      setStyle(node, 'flex-grow', (seg.weight * 100).toFixed(3));
      node.dataset.state = seg.state;
      toggleClass(node, 'is-over', seg.over);
      toggleClass(node, 'is-fresh-skip', Boolean(seg.skip?.fresh));
      setText(node.querySelector('.m-seg-name'), seg.label);
      setText(node.querySelector('.m-seg-tags'), seg.tags.join(' · '));
      setFill(node, seg.state === 'done' ? 1 : seg.fill);
      setText(node.querySelector('.m-seg-split'), seg.splitText);
      const delta = node.querySelector('.m-seg-delta');
      setText(delta, seg.state === 'skipped' ? '' : seg.delta?.text ?? '');
      delta.dataset.tone = seg.delta?.tone ?? 'none';
      setAttr(node, 'title', seg.skip?.label ?? (seg.avgSource === 'default' ? `${seg.label} · ~avg` : `${seg.label} · avg ${(seg.avgMs / 1000).toFixed(2)}`));
      const row = rowEls.get(seg.key);
      row.dataset.state = seg.state;
      setText(row.querySelector('.m-row-name > span'), seg.label);
      setText(row.querySelector('.m-row-tags'), seg.tags.join(' · '));
      setText(row.querySelector('.m-row-delta'), seg.state === 'done' ? seg.delta?.text ?? '' : seg.state === 'skipped' ? '✦' : '');
      row.querySelector('.m-row-delta').dataset.tone = seg.delta?.tone ?? 'none';
      setText(row.querySelector('.m-row-split'), seg.splitText || (seg.state === 'future' ? '—' : ''));
    }
  }

  /** @param {import('../../types.js').FrameVM} f */
  function frame(f) {
    if (!currentKey) return;
    const node = segEls.get(currentKey);
    if (!node || node.dataset.state !== 'current') return;
    setFill(node, f.currentFill);
    setText(node.querySelector('.m-seg-split'), f.currentSplitText);
    toggleClass(node, 'is-over', f.currentOver);
    const row = rowEls.get(currentKey);
    if (row) setText(row.querySelector('.m-row-split'), f.currentSplitText);
  }

  return { update, frame, destroy() { root.remove(); } };
}
