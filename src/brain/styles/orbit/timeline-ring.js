// Orbit timeline: the solve as a ring around the cube. Each step is an arc
// proportional to your average for it (the pace map), with 3° gaps from
// 12 o'clock. Future arcs are hairlines, the current arc fills live with a
// leading dot, finished arcs turn ink and show "split ±delta" outside.
//
// Structure (arcs, labels) is rebuilt only when timeline.planKey changes;
// every other update only touches attributes, classes and text.

import { arcPath, fillAngle, placeLabels, polar, ringLayout } from '../../charts/arc.js';
import { reconcileChildren, setAttr, setText, svg, toggleClass } from '../../dom.js';
import { CX, CY, R, SPARK_PATH, VB_H, VB_W, VIEWBOX, ringHandoff, ringName, secs } from './geometry.js';

const PSEUDO_R = R - 15;
const TICK = 14;

/** @type {import('../../types.js').ComponentFactory} */
export function createRingTimeline(host, ctx = {}) {
  const root = svg('svg', { class: 'b-oring', viewBox: VIEWBOX, 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMid meet' });
  const floor = buildFloor();
  const arcsLayer = svg('g', { class: 'b-oring-arcs' });
  const labelsLayer = svg('g', { class: 'b-oring-labels' });
  const startTick = svg('line', { class: 'b-oring-start', x1: CX, y1: CY - R - TICK, x2: CX, y2: CY - R + TICK });
  const dot = svg('g', { class: 'b-oring-dot' });
  dot.append(svg('circle', { class: 'b-oring-dot-halo', r: 11 }), svg('circle', { class: 'b-oring-dot-core', r: 5.5 }));
  root.append(floor, arcsLayer, startTick, labelsLayer, dot);
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

  function build(timeline) {
    arcsLayer.replaceChildren();
    labelsLayer.replaceChildren();
    parts = new Map();
    layout = ringLayout(timeline.segments.map(s => ({ key: s.key, weight: s.weight })));
    // Labels keep a readable on-screen size (about 12 px) whatever the stage
    // width, so compute their size in viewBox units from the rendered width.
    const font = labelFontUnits();
    labelsLayer.style.fontSize = `${font}px`;
    const labelPos = placeLabels(layout.map(l => ({ key: l.key, angle: l.mid, height: font * 2.3 })), {
      cx: CX, cy: CY, r: R, offset: 14 + font, minGap: font * 2.3, top: font * 1.4, bottom: VB_H - font * 1.2,
    });
    const posByKey = new Map(labelPos.map(p => [p.key, p]));
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
      g.append(track, done, pseudo, live, skip);
      arcsLayer.append(g);

      const p = posByKey.get(seg.key);
      const label = svg('text', { class: 'b-oring-label', x: p.x, y: p.y, dy: '-0.35em', 'text-anchor': p.anchor });
      const name = svg('tspan', { class: 'b-oring-name', x: p.x });
      const value = svg('tspan', { class: 'b-oring-value', x: p.x, dy: '1.15em' });
      const valueText = svg('tspan', {});
      const delta = svg('tspan', { class: 'b-oring-delta' });
      value.append(valueText, delta);
      label.append(name, value);
      labelsLayer.append(label);
      parts.set(seg.key, { g, track, done, live, pseudo, skip, label, name, valueText, delta, layout: l });
    });
    planKey = timeline.planKey;
    lastFont = font;
  }

  function paintSegment(part, seg, ghost) {
    const state = ghost ? 'future' : seg.state;
    for (const s of ['future', 'current', 'done', 'skipped']) toggleClass(part.g, `is-${s}`, state === s);
    toggleClass(part.g, 'is-pseudo', seg.tags?.includes('pseudo'));
    toggleClass(part.label, 'is-current', state === 'current');
    toggleClass(part.label, 'is-done', state === 'done');
    toggleClass(part.label, 'is-skipped', state === 'skipped');
    toggleClass(part.label, 'is-future', state === 'future');
    const pseudoTag = seg.tags?.includes('pseudo') ? ' · pseudo' : '';
    setText(part.name, state === 'skipped' ? `${ringName(seg)} skip` : `${ringName(seg)}${pseudoTag}`);
    if (state === 'future') {
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
      const onResults = vm.screen === 'results';
      const visible = Boolean(timeline?.visible) && vm.screen !== 'inspection' && !onResults;
      if (onResults && wasVisible) {
        // Hand the ring's box to the results donut before it fades out.
        const rect = root.getBoundingClientRect?.();
        if (rect && rect.width) { ringHandoff.rect = rect; ringHandoff.at = Date.now(); }
      }
      toggleClass(root, 'is-hidden', !visible);
      toggleClass(root, 'is-leaving', onResults);
      if (aside) toggleClass(aside, 'is-hidden', !visible);
      if (!timeline || !timeline.segments?.length) { wasVisible = false; return; }
      if (timeline.planKey !== planKey) build(timeline);
      if (visible && !wasVisible) {
        // Draw the ring in from 12 o'clock when it (re)appears.
        root.classList.remove('is-entering');
        void root.getBoundingClientRect?.();
        root.classList.add('is-entering');
      }
      wasVisible = visible;
      if (!visible) return;
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
      renderAside(timeline);
    },
    frame(f) {
      if (!current || !f) return;
      setLive(current.part, f.currentFill);
      if (f.currentSplitText) setText(current.part.valueText, f.currentSplitText);
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
    svg('ellipse', { class: 'b-oring-glow', cx: CX, cy: CY + 148, rx: 150, ry: 34, fill: `url(#${id})` }),
    svg('ellipse', { class: 'b-oring-shadow', cx: CX, cy: CY + 150, rx: 100, ry: 12 }));
  return g;
}
