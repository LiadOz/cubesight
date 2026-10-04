// Orbit timeline: the solve as a ring around the cube. Each step is an arc
// proportional to your average for it (the pace map), with 3° gaps from
// 12 o'clock. Future arcs are hairlines, the current arc fills live with a
// leading dot, finished arcs turn ink and show "split ±delta" outside.
//
// Structure (arcs, labels) is rebuilt only when timeline.planKey changes;
// every other update only touches attributes, classes and text.

import { arcPath, fillAngle, placeLabels, polar, ringLayout } from '../../charts/arc.js';
import { reconcileChildren, setAttr, setText, svg, toggleClass } from '../../dom.js';
import { CX, CY, R, SPARK_PATH, VB_H, VB_W, VIEWBOX, ringName, secs } from './geometry.js';
import { groupEndLabels } from '../../../ui/orbit/end-labels.js';

const PSEUDO_R = R - 15;
const TICK = 14;

/** @type {import('../../types.js').ComponentFactory} */
export function createRingTimeline(host, ctx = {}) {
  const sequenceMode = ctx.mode === 'sequence';
  const root = svg('svg', { class: 'b-oring', viewBox: VIEWBOX, 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMid meet' });
  toggleClass(root, 'is-sequence', sequenceMode);
  const floor = buildFloor();
  const arcsLayer = svg('g', { class: 'b-oring-arcs' });
  const labelsLayer = svg('g', { class: 'b-oring-labels' });
  const markersLayer = svg('g', { class: 'b-oring-markers' });
  const startTick = svg('line', { class: 'b-oring-start', x1: CX, y1: CY - R - TICK, x2: CX, y2: CY - R + TICK });
  const dot = svg('g', { class: 'b-oring-dot' });
  dot.append(svg('circle', { class: 'b-oring-dot-halo', r: 11 }), svg('circle', { class: 'b-oring-dot-core', r: 5.5 }));
  // Connecting: a short arc sweeps the ring around the cube (static dots for reduced motion).
  const connecting = svg('g', { class: 'b-oring-connect' });
  connecting.append(svg('circle', { class: 'b-oring-connect-dots', cx: CX, cy: CY, r: R }), svg('circle', { class: 'b-oring-connect-sweep', cx: CX, cy: CY, r: R, pathLength: 100 }));
  root.append(floor, connecting, arcsLayer, startTick, labelsLayer, markersLayer, dot);
  host.append(root);

  // Optional right-column split list (the shell passes ctx.aside for Orbit).
  const aside = ctx.aside ? document.createElement('div') : null;
  if (aside) { aside.className = 'b-oring-aside'; ctx.aside.append(aside); }

  let planKey = null;
  let lastTimeline = null;
  let lastFont = 0;
  function labelFontUnits() {
    const width = root.getBoundingClientRect?.().width || VB_W;
    return Math.round(Math.min(30, Math.max(14, 12 * VB_W / width)));
  }
  // Rebuild the labels when the stage is resized enough to change their size.
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (!lastTimeline || labelFontUnits() === lastFont) return;
    const t = lastTimeline;
    planKey = null;
    lastTimeline = null;
    api.update({ screen: lastScreen, timeline: t }, null);
  }) : null;
  resize?.observe(root);
  let lastScreen = 'idle';
  /** @type {Map<string, any>} */
  let parts = new Map();
  let layout = [];
  let current = null;       // {part, seg}
  let wasVisible = false;
  let resultsOn = false;    // the finished ring: arcs and markers take clicks
  let shownReview = null;

  function build(timeline) {
    arcsLayer.replaceChildren();
    labelsLayer.replaceChildren();
    parts = new Map();
    layout = ringLayout(timeline.segments.map(s => ({ key: s.key, weight: s.weight })));
    // Labels keep a readable on-screen size (about 12 px) whatever the stage
    // width, so compute their size in viewBox units from the rendered width.
    // Their places are set in placeAllLabels (they depend on which stages ended together).
    const font = labelFontUnits();
    labelsLayer.style.fontSize = `${font}px`;
    layout.forEach((l, i) => {
      const seg = timeline.segments[i];
      const g = svg('g', { class: 'b-oring-seg', 'data-key': seg.key });
      const track = svg('path', { class: 'b-oring-track', d: arcPath(CX, CY, R, l.a0, l.a1), pathLength: 1 });
      const done = svg('path', { class: 'b-oring-done', d: arcPath(CX, CY, R, l.a0, l.a1) });
      const live = svg('path', { class: 'b-oring-live', d: '' });
      const pseudo = svg('path', { class: 'b-oring-pseudo', d: arcPath(CX, CY, PSEUDO_R, l.a0 + 2, l.a1 - 2) });
      const skipPos = polar(CX, CY, R, l.a0 + 1.5);
      const skip = svg('g', { class: 'b-oring-skip', transform: `translate(${skipPos.x} ${skipPos.y})` });
      const sparkPos = polar(CX, CY, R + 26, l.a0 + 7);
      // Sparks sit in positioned groups: the pop animation sets a CSS
      // transform, which would otherwise replace the translate attribute.
      const spark = (dx, dy, scale) => {
        const at = svg('g', { transform: `translate(${dx} ${dy}) scale(${scale})` });
        at.append(svg('path', { class: 'b-oring-spark', d: SPARK_PATH }));
        return at;
      };
      skip.append(
        svg('circle', { class: 'b-oring-skip-dot', r: 6.5 }),
        spark(sparkPos.x - skipPos.x, sparkPos.y - skipPos.y, 1.25),
        spark(sparkPos.x - skipPos.x + 15, sparkPos.y - skipPos.y + 12, 0.55),
      );
      g.append(track, done, pseudo, live, skip, svg('path', { class: 'b-oring-hit', d: arcPath(CX, CY, R, l.a0, l.a1) }));
      arcsLayer.append(g);

      const label = svg('text', { class: 'b-oring-label', x: 0, y: 0, dy: '-0.35em', 'text-anchor': 'middle' });
      const name = svg('tspan', { class: 'b-oring-name', x: 0 });
      const value = svg('tspan', { class: 'b-oring-value', x: 0, dy: '1.15em' });
      const valueText = svg('tspan', {});
      const delta = svg('tspan', { class: 'b-oring-delta' });
      value.append(valueText, delta);
      label.append(name, value);
      labelsLayer.append(label);
      parts.set(seg.key, { g, track, done, live, pseudo, skip, label, name, valueText, delta, layout: l });
      g.addEventListener('click', () => { if (resultsOn) ctx.dispatch?.({ type: 'openDetail', kind: 'stage', key: seg.key }); });
    });
    planKey = timeline.planKey;
    lastFont = font;
  }

  // Coach markers on the finished ring (results): at the moment they happened, inside their stage's arc.
  function renderMarkers(review) {
    markersLayer.replaceChildren();
    if (!review) return;
    const ordered = review.markers.slice().sort((a, b) => Number(a.prominent) - Number(b.prominent) || Number(a.selected) - Number(b.selected));
    for (const m of ordered) {
      const part = parts.get(m.seg);
      if (!part) continue;
      const angle = part.layout.a0 + (part.layout.a1 - part.layout.a0) * m.frac;
      const p = polar(CX, CY, R, angle);
      const g = svg('g', { class: `b-mk is-${m.tone} ${m.prominent ? 'is-prominent' : 'is-small'}${m.selected ? ' is-selected' : ''}`, transform: `translate(${p.x} ${p.y})`, role: 'button', tabindex: 0, 'aria-label': `${m.label}, ${m.stageLabel}`, 'data-marker': m.id });
      const title = svg('title');
      title.textContent = `${m.label} · ${m.stageLabel} · ${m.costText}`;
      g.append(title, svg('circle', { class: 'b-mk-hit', r: 15 }), svg('circle', { class: 'b-mk-dot', r: m.prominent ? 8 : 5 }));
      g.addEventListener('click', event => { event.stopPropagation(); ctx.dispatch?.({ type: 'selectMarker', id: m.id }); });
      g.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); ctx.dispatch?.({ type: 'selectMarker', id: m.id }); } });
      markersLayer.append(g);
    }
  }

  // Place every visible label outside the ring without overlaps. Stages that ended together share the
  // first one's label; the others hide (see end-labels.js). Runs after the segments are painted.
  function placeAllLabels(timeline) {
    const font = labelFontUnits();
    if (sequenceMode) {
      const anchors = [];
      for (const seg of timeline.segments) {
        const part = parts.get(seg.key);
        if (!part) continue;
        const name = seg.label || seg.short || '';
        setText(part.name, name);
        setText(part.valueText, '');
        setText(part.delta, '');
        anchors.push({ key: seg.key, angle: (part.layout.a0 + part.layout.a1) / 2, height: font * 1.3 });
      }
      const placed = placeLabels(anchors, { cx: CX, cy: CY, r: R, offset: 14 + font, minGap: font * 1.35, top: font * 1.4, bottom: VB_H - font * 1.2 });
      for (const p of placed) {
        const part = parts.get(p.key);
        part.label.setAttribute('x', p.x); part.label.setAttribute('y', p.y); part.label.setAttribute('text-anchor', p.anchor);
        part.name.setAttribute('x', p.x);
      }
      lastFont = font;
      return;
    }
    const groups = groupEndLabels(timeline.segments, ringName);
    const anchors = [];
    for (const group of groups) {
      const first = parts.get(group.keys[0]);
      const last = parts.get(group.keys[group.keys.length - 1]);
      if (!first || !last) continue;
      for (const key of group.keys.slice(1)) toggleClass(parts.get(key)?.label, 'is-grouped', true);
      toggleClass(first.label, 'is-grouped', false);
      toggleClass(first.label, 'is-group-lead', group.keys.length > 1);
      if (group.name) { setText(first.name, group.name); setText(first.valueText, group.value); setText(first.delta, ''); }
      anchors.push({ key: group.keys[0], angle: (first.layout.a0 + last.layout.a1) / 2, height: font * 2.3 });
    }
    const placed = placeLabels(anchors, { cx: CX, cy: CY, r: R, offset: 14 + font, minGap: font * 2.3, top: font * 1.4, bottom: VB_H - font * 1.2 });
    for (const p of placed) {
      const part = parts.get(p.key);
      part.label.setAttribute('x', p.x); part.label.setAttribute('y', p.y); part.label.setAttribute('text-anchor', p.anchor);
      part.name.setAttribute('x', p.x); part.valueText.parentNode.setAttribute('x', p.x);
    }
    lastFont = font;
  }

  function paintSegment(part, seg, ghost) {
    const state = ghost ? 'future' : seg.state;
    for (const s of ['future', 'current', 'done', 'skipped']) toggleClass(part.g, `is-${s}`, state === s);
    setAttr(part.g, 'data-state', seg.state);   // same hook as Mono's segments (the model's state, even as a ghost)
    toggleClass(part.g, 'is-pseudo', seg.tags?.includes('pseudo'));
    toggleClass(part.label, 'is-current', state === 'current');
    toggleClass(part.label, 'is-done', state === 'done');
    toggleClass(part.label, 'is-skipped', state === 'skipped');
    toggleClass(part.label, 'is-future', state === 'future');
    const pseudoTag = seg.tags?.includes('pseudo') ? ' · pseudo' : '';
    setText(part.name, sequenceMode ? (seg.label || seg.short || '') : state === 'skipped' ? `${ringName(seg)} skip` : seg.xcross ? seg.xcross : `${ringName(seg)}${pseudoTag}`);
    if (sequenceMode) {
      setText(part.valueText, '');
      setText(part.delta, '');
    } else if (state === 'future') {
      setText(part.valueText, `~${secs(seg.avgMs)}`);
      setText(part.delta, '');
    } else if (state === 'skipped') {
      setText(part.valueText, '0.00');
      setText(part.delta, '');
    } else {
      setText(part.valueText, seg.splitText || secs(seg.splitMs));
      setText(part.delta, state === 'done' && seg.delta ? ` ${seg.delta.text}` : '');
      setAttr(part.delta, 'class', `b-oring-delta is-${seg.delta?.tone || 'none'}`);
    }
    if (state === 'current') setLive(part, seg.fill);
    else setAttr(part.live, 'd', '');
    // Animate the skip spark once, on the emit it happened.
    if (state === 'skipped' && seg.skip?.fresh) {
      part.skip.classList.remove('is-fresh');
      void part.skip.getBoundingClientRect?.();
      part.skip.classList.add('is-fresh');
    }
  }

  function setLive(part, fill) {
    const { a0, a1 } = part.layout;
    const end = fillAngle(a0, a1, fill);
    setAttr(part.live, 'd', arcPath(CX, CY, R, a0, Math.max(end, a0 + 0.6)));
    const p = polar(CX, CY, R, end);
    setAttr(dot, 'transform', `translate(${p.x} ${p.y})`);
  }

  function renderAside(timeline) {
    if (!aside) return;
    const rows = timeline.segments.filter(s => s.state === 'done' || s.state === 'current' || s.state === 'skipped');
    const items = [];
    for (const s of rows) {
      const cls = `b-oring-row is-${s.state}`;
      const delta = s.state === 'done' && s.delta ? s.delta.text : s.state === 'current' ? '…' : '';
      items.push({ key: `${s.key}-l`, text: s.label, className: `${cls} b-oring-row-label` });
      items.push({ key: `${s.key}-v`, text: s.state === 'skipped' ? 'skip' : (s.splitText || secs(s.splitMs)), className: `${cls} b-oring-row-value` });
      items.push({ key: `${s.key}-d`, text: delta, className: `${cls} b-oring-row-delta is-${s.delta?.tone || 'none'}` });
    }
    reconcileChildren(aside, items, 'span');
  }

  const api = {
    update(vm, prev) {
      const timeline = vm.timeline;
      lastTimeline = timeline;
      lastScreen = vm.screen;
      // The finished ring stays on the results screen, around the live cube.
      const visible = Boolean(timeline?.visible) && vm.screen !== 'inspection';
      toggleClass(root, 'is-hidden', !visible);
      if (aside) toggleClass(aside, 'is-hidden', !visible);
      if (!timeline || !timeline.segments?.length) { wasVisible = false; return; }
      if (timeline.planKey !== planKey) build(timeline);
      const review = vm.screen === 'results' ? vm.results?.review ?? null : null;
      if (review !== shownReview) {
        shownReview = review;
        resultsOn = Boolean(review);
        toggleClass(root, 'is-results', resultsOn);
        renderMarkers(review);
      }
      if (visible && !wasVisible) {
        // Draw the ring in from 12 o'clock when it (re)appears.
        root.classList.remove('is-entering');
        void root.getBoundingClientRect?.();
        root.classList.add('is-entering');
      }
      wasVisible = visible;
      // Paint even while hidden (inspection shows the inspection ring instead) so
      // the segment states stay true and the ring is right the moment it returns.
      if (prev && prev.timeline === timeline && prev.screen === vm.screen) return;
      toggleClass(root, 'is-ghost', timeline.ghost);
      current = null;
      timeline.segments.forEach((seg, i) => {
        const part = parts.get(seg.key);
        if (!part) return;
        paintSegment(part, seg, timeline.ghost);
        if (!timeline.ghost && seg.state === 'current' && i === timeline.currentIndex) current = { part, seg };
      });
      toggleClass(dot, 'is-hidden', !current);
      placeAllLabels(timeline);
      renderAside(timeline);
    },
    frame(f) {
      if (sequenceMode || !current || !f) return;
      setLive(current.part, f.currentFill);
      if (f.currentSplitText) {
        setText(current.part.valueText, f.currentSplitText);
        if (aside) setText(aside.querySelector('.b-oring-row-value.is-current'), f.currentSplitText);
      }
      toggleClass(current.part.label, 'is-over', Boolean(f.currentOver));
    },
    destroy() { resize?.disconnect(); root.remove(); aside?.remove(); },
  };
  return api;
}

function buildFloor() {
  // Contact shadow + (dark mode) teal glow under the cube.
  const g = svg('g', { class: 'b-oring-floor' });
  const defs = svg('defs');
  const id = `b-oring-glow-${Math.random().toString(36).slice(2, 8)}`;
  const grad = svg('radialGradient', { id });
  grad.append(svg('stop', { offset: '0%', class: 'b-glow-0' }), svg('stop', { offset: '55%', class: 'b-glow-1' }), svg('stop', { offset: '100%', class: 'b-glow-2' }));
  defs.append(grad);
  g.append(defs,
    svg('ellipse', { class: 'b-oring-glow', cx: CX, cy: CY + 150, rx: 140, ry: 32, fill: `url(#${id})` }),
    svg('ellipse', { class: 'b-oring-shadow', cx: CX, cy: CY + 152, rx: 96, ry: 12 }));
  return g;
}
