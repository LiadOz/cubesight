// One reviewed moment, as frame A-06 draws it: the stage's moves on an outer ring (yours), the better line on an inner ring,
// the coach's sentence and the two things you can do with it. moment-model.js builds the view model (pure);
// createMomentView() draws it on the history review route: two shared Orbits (r 300 and r 262, move labels) plus the text.
// Every number is the spec's (design-spec.js ORBIT, extracted from A-06); nothing here is measured by eye.
import { createOrbit } from '../../ui/orbit/index.js';
import { ORBIT } from '../../ui/design-spec.js';
import { polar } from '../../ui/orbit/geometry.js';
import { buildMoment } from './moment-model.js';
import './moment.css';

const INNER_RADIUS = 262, OUTER_RADIUS = ORBIT.radius;
const MOVE_RING_GAP = 4;            // A-06: segment gap 4 deg on both rings
const OUTER_LABEL_RADIUS = ORBIT.labelRadius.currentMovePill;     // 330: labels and the current-move pill sit on this circle
const INNER_LABEL_RADIUS = 246;     // A-06: the inner labels, inside their ring (radius to glyph centre 245.8 .. 246.3)
const NS = 'http://www.w3.org/2000/svg';

const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
const svgNode = (name, attrs) => { const node = document.createElementNS(NS, name); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value)); return node; };

/** What the Orbit cannot draw: the amber pill behind the current move (outer) and the labels of the inner ring, on the spec's circles. */
function decorate(orbit, kind, model) {
  const svg = orbit.element.querySelector('svg.orbit__svg'), shown = orbit.displayed || orbit.current;
  if (!svg || !shown || svg.querySelector('[data-moment-decoration]')) return;
  const k = shown.viewSize / (svg.getBoundingClientRect().width || shown.viewSize);      // view units per rendered px
  const scale = Math.max(1, Math.min(2.2, k));
  const group = svgNode('g', { 'data-moment-decoration': '', 'aria-hidden': 'true', 'pointer-events': 'none' });
  const part = key => shown.layout.find(item => String(item.key) === key);
  if (kind === 'outer') {
    const index = model.outer.findIndex(move => move.state === 'current'), arc = index >= 0 ? part(`m${index}`) : null;
    if (arc) {
      const c = polar(shown.cx, shown.cy, OUTER_LABEL_RADIUS, arc.mid), w = 48 * scale, h = 32 * scale;
      group.append(svgNode('rect', { class: 'moment__pill', x: c.x - w / 2, y: c.y - h / 2, width: w, height: h, rx: h / 2, 'stroke-width': 1.5 * k }));
      const text = svgNode('text', { class: 'moment__pill-text', x: c.x, y: c.y + 20 * scale / 3, 'text-anchor': 'middle', 'font-size': 20 * scale });
      text.textContent = model.outer[index].text; group.append(text);
    }
  } else {
    const radius = INNER_LABEL_RADIUS * OUTER_RADIUS / INNER_RADIUS;           // this Orbit is drawn at 262 / 300 of the stage, so its units are 300 / 262 per frame px
    model.inner.forEach((move, index) => {
      const arc = part(`i${index}`); if (!arc) return;
      const c = polar(shown.cx, shown.cy, radius, arc.mid), size = 13 * scale;
      const text = svgNode('text', { class: `moment__inner-label is-${move.state}`, x: c.x, y: c.y + size / 3, 'text-anchor': 'middle', 'font-size': size });
      text.textContent = move.text; group.append(text);
    });
  }
  svg.append(group);
}

/**
 * Mounts onto the history page: the rings go into the stage (around the cube), the text columns onto the page itself.
 * @param {HTMLElement} page   the .history-page element (it already defines --u, --hdr, --stage)
 * @param {{stage:HTMLElement, onBetterLine?:()=>void}} options
 */
export { buildMoment };

export function createMomentView(page, { stage, onBetterLine = () => {} }) {
  const rings = el('div', 'moment__rings');
  const outerHost = el('div', 'moment__outer'), innerHost = el('div', 'moment__inner');
  rings.append(outerHost, innerHost);
  stage.append(rings);
  const side = el('div', 'moment__side');
  const badge = el('p', 'moment__badge'); const mark = el('i'); const badgeText = el('span');
  badge.append(mark, badgeText);
  const prose = el('p', 'moment__prose');
  const legend = el('ul', 'moment__legend'); legend.setAttribute('aria-label', 'rings');
  const outerLegend = el('li'); outerLegend.dataset.ring = 'outer'; outerLegend.append(el('i'), el('span'));
  const innerLegend = el('li'); innerLegend.dataset.ring = 'inner'; innerLegend.append(el('i'), el('span'));
  legend.append(outerLegend, innerLegend);
  const back = el('a', 'moment__back');
  side.append(badge, prose, legend, back);
  const center = el('div', 'moment__center');
  const count = el('p', 'moment__count'); count.setAttribute('aria-live', 'polite'); const why = el('p', 'moment__why');
  const actions = el('div', 'moment__actions');
  const better = el('button', 'moment__better', 'better line'); better.type = 'button';
  const retry = el('a', 'moment__retry', 'retry this moment');
  actions.append(better, retry);
  center.append(count, why, actions);
  page.append(side, center);
  better.addEventListener('click', () => onBetterLine());
  const common = { size: 'XL', shape: 'open', gap: ORBIT.bottomGap.spanDeg, direction: 'clockwise', segmentGap: MOVE_RING_GAP, centerClearance: 150, animate: false };
  const outer = createOrbit(outerHost, { ...common, fitHost: true, labelStyle: 'around', labelKind: 'move', label: 'your moves', segments: [] });
  const inner = createOrbit(innerHost, { ...common, fitHost: true, label: 'the better line', segments: [] });
  let model = null;
  // The inner ring is the outer one at 262 / 300: size its host from the outer Orbit's rendered width (the Orbit sizes itself from the canvas).
  const fitInner = () => {
    const width = outer.element.querySelector('svg.orbit__svg')?.getBoundingClientRect().width;
    if (width) { innerHost.style.width = innerHost.style.height = `${width * INNER_RADIUS / OUTER_RADIUS}px`; }
  };
  outer.element.addEventListener('orbitchange', () => { fitInner(); if (model) decorate(outer, 'outer', model); });
  inner.element.addEventListener('orbitchange', () => model && decorate(inner, 'inner', model));
  const state = { done: 'quiet', current: 'wrong', later: 'future' };
  return {
    update(next) {
      model = next;
      page.classList.add('has-moment');
      page.dataset.moment = next.tone;
      mark.textContent = next.tone === 'warn' ? '!' : '✦'; badgeText.textContent = next.badge;
      prose.textContent = next.prose;
      outerLegend.lastChild.textContent = next.outerLegend;
      innerLegend.hidden = !next.innerLegend; if (next.innerLegend) innerLegend.lastChild.textContent = next.innerLegend;
      back.textContent = next.backLabel; back.href = next.backHref;
      count.textContent = next.count; why.textContent = next.why;
      better.hidden = !next.canPlayBetter;
      retry.hidden = !next.retryHref; if (next.retryHref) retry.href = next.retryHref;
      innerHost.hidden = !next.inner.length;
      outer.update({ segments: next.outer.map((move, index) => ({ key: `m${index}`, weight: 1, label: move.text, state: state[move.state], ariaLabel: `move ${index + 1}: ${move.text}` })) }, { animate: false });
      inner.update({ segments: next.inner.map((move, index) => ({ key: `i${index}`, weight: 1, state: move.state === 'before' ? 'quiet' : 'good', ariaLabel: `${move.state === 'before' ? 'before' : 'better'}: ${move.text}` })) }, { animate: false });
    },
    destroy() {
      page.classList.remove('has-moment'); delete page.dataset.moment;
      outer.destroy(); inner.destroy(); rings.remove(); side.remove(); center.remove();
    },
    elements: { rings, side, center },
  };
}
