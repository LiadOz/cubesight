import { arcPath, clusterMarkers, miniGlyphSize, placeLabels, polar, ringLayout } from './geometry.js';
import './orbit.css';

const NS = 'http://www.w3.org/2000/svg';
const SIZES = { XL: 520, L: 420, M: 300, S: 210, mini: 44 };
const COLORS = { track: '#494b47', future: '#777a74', current: '#52e0ca', done: '#e8e4da', skipped: '#a7c7b9', wrong: '#edae62', good: '#52e0ca', bad: '#ed8c70' };
const svg = (name, attrs = {}) => { const node = document.createElementNS(NS, name); for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, String(value)); return node; };
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const deltaText = value => {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return Math.abs(value) < 0.005 ? '' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
  if (/^[+-−]?0\.00$/.test(String(value).trim())) return '';
  return String(value);
};
const labelWidth = segment => Math.min(220, Math.max(42, String(segment.label || '').length * 8, String(segment.value ?? '').length * 7 + String(deltaText(segment.delta)).length * 6 + 12));

/** One accessible SVG Orbit. Instantiate once and call update() as its view changes. */
export class Orbit {
  constructor(host, options = {}) {
    if (!host) throw new Error('Orbit needs a host element.');
    this.host = host;
    this.options = { size: 'L', shape: 'open', gap: 70, start: 180, direction: 'clockwise', segments: [], ...options };
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.sequence = 0;
    this.expandedClusters = new Set();
    this.focusedKey = null;
    this.element = document.createElement('div');
    this.element.className = 'orbit';
    this.element.dataset.shape = this.options.shape;
    this.element.dataset.size = this.options.size;
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', this.options.label || 'orbit');
    this.onFocusIn = event => {
      const target = event.target.closest?.('[data-segment],[data-marker-cluster],[data-marker-expanded]');
      this.focusedKey = target?.dataset.segment || target?.dataset.markerCluster || target?.dataset.markerExpanded || this.focusedKey;
    };
    this.element.addEventListener('focusin', this.onFocusIn);
    this.host.append(this.element);
    this.update(this.options, { animate: false });
  }

  update(options = {}, { animate = true } = {}) {
    const previous = this.current;
    this.options = { ...this.options, ...options, segments: options.segments ?? options.segs ?? this.options.segments };
    this.current = this.normalize(this.options);
    this.element.dataset.shape = this.options.shape;
    this.element.dataset.size = this.options.size;
    if (!previous || !animate || this.reducedMotion.matches || this.options.animate === false) {
      this.sequence++;
      this.draw(this.current);
      return Promise.resolve();
    }
    return this.animateFrom(previous, this.current, this.duration());
  }

  normalize(options) {
    const mini = options.size === 'mini';
    const viewSize = 560;
    const cx = viewSize / 2, cy = viewSize / 2, radius = mini ? 190 : 190;
    const gap = options.shape === 'full' ? 0 : clamp(Number(options.gap) || 70, 0, 170);
    const sweep = 360 - gap;
    const direction = options.direction === 'counterclockwise' ? 'counterclockwise' : 'clockwise';
    const start = Number.isFinite(Number(options.start)) ? Number(options.start) : 180;
    const startAngle = start + (gap ? gap / 2 : 0) * (direction === 'counterclockwise' ? -1 : 1);
    const segments = Array.isArray(options.segments) ? options.segments : [];
    const layout = ringLayout(segments, { gapDeg: Number(options.segmentGap ?? 2.5), startDeg: startAngle, sweepDeg: sweep, direction, sections: options.sections || [] });
    const index = new Map(layout.map((item, at) => [item.key, at]));
    const markers = (options.markers || []).map(marker => {
      if (marker.angle != null) return marker;
      const at = index.get(marker.segment ?? marker.key);
      if (at == null) return null;
      const part = layout[at];
      const fill = clamp(Number(marker.position ?? marker.fill ?? .5), 0, 1);
      return { ...marker, angle: part.from + (part.to - part.from) * fill };
    }).filter(Boolean);
    const collision = new Map();
    const labelAnchors = segments.map((segment, at) => ({ key: layout[at].key, angle: layout[at].mid,
      width: labelWidth(segment), height: segment.detail ? 42 : 25, rank: segment.importance ?? 0 }));
    const labels = mini ? [] : placeLabels(labelAnchors, { cx, cy, radius, offset: 64, minGap: 28, top: 24, bottom: 536 });
    labels.forEach((label, at) => collision.set(label.key, label));
    return { cx, cy, radius, gap, sweep, startAngle, direction, segments, layout, labels: collision, markers, options };
  }

  duration() { return clamp(Number(this.options.duration) || 360, 300, 450); }

  async animateFrom(from, to, duration) {
    const sequence = ++this.sequence;
    const started = performance.now();
    this.element.classList.add('is-morphing');
    return new Promise(resolve => {
      const finish = () => { if (sequence !== this.sequence) { resolve(); return; } this.draw(to); this.element.classList.remove('is-morphing'); resolve(); };
      const tick = now => {
        if (sequence !== this.sequence) { resolve(); return; }
        const raw = Math.min(1, (now - started) / duration);
        const t = 1 - Math.pow(1 - raw, 4);
        const fromWidth = from.options.size === 'mini' ? miniGlyphSize(from.options.glyphSize) : SIZES[from.options.size] || SIZES.L;
        const toWidth = to.options.size === 'mini' ? miniGlyphSize(to.options.glyphSize) : SIZES[to.options.size] || SIZES.L;
        this.draw({ ...to, interpolatedGap: from.gap + (to.gap - from.gap) * t, interpolatedWidth: fromWidth + (toWidth - fromWidth) * t });
        if (raw >= 1) finish(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  collapse() { return this.update({ size: 'mini', shape: 'full', gap: 0 }); }
  expand(size = 'L') { return this.update({ size, shape: 'open', gap: 70 }); }

  getMarkerElement(key) {
    const targetKey = String(key?.key ?? key?.id ?? key);
    return [...this.element.querySelectorAll('[data-marker-keys]')].find(node => {
      try { return JSON.parse(node.dataset.markerKeys).includes(targetKey); } catch { return false; }
    }) || null;
  }

  draw(model) {
    const { cx, cy, radius, segments, options } = model;
    const width = model.interpolatedWidth ?? (options.size === 'mini' ? miniGlyphSize(options.glyphSize) : SIZES[options.size] || SIZES.L);
    const gap = model.interpolatedGap ?? model.gap;
    const mini = options.size === 'mini';
    const hostBox = this.host.getBoundingClientRect();
    const fittedWidth = Math.min(width, hostBox.width || width, hostBox.height || width);
    this.element.style.width = `${fittedWidth}px`;
    this.element.style.height = `${fittedWidth}px`;
    this.element.style.maxWidth = '100%';
    this.element.style.maxHeight = '100%';
    const sideLabels = options.labelStyle === 'side';
    const currentFocus = this.element.querySelector('[data-segment]:focus,[data-marker-cluster]:focus,[data-marker-expanded]:focus');
    const focusKey = currentFocus?.dataset.segment
      || this.element.querySelector('[data-marker-cluster]:focus')?.dataset.markerCluster
      || this.element.querySelector('[data-marker-expanded]:focus')?.dataset.markerExpanded
      || this.focusedKey;
    if (currentFocus) this.focusedKey = currentFocus.dataset.segment || currentFocus.dataset.markerCluster || currentFocus.dataset.markerExpanded;
    const sweep = 360 - gap;
    const dir = model.direction === 'counterclockwise' ? -1 : 1;
    const startAngle = (Number(options.start) || 180) + (gap ? gap / 2 : 0) * (model.direction === 'counterclockwise' ? -1 : 1);
    const layout = ringLayout(segments, { gapDeg: Number(options.segmentGap ?? 2.5), startDeg: startAngle, sweepDeg: sweep, direction: model.direction, sections: options.sections || [] });
    const labelPositions = mini || sideLabels ? new Map() : new Map(placeLabels(segments.map((segment, index) => ({ key: String(segment.key ?? index), angle: layout[index].mid, width: labelWidth(segment), height: segment.detail ? 42 : 25, rank: segment.importance ?? 0 })), { cx, cy, radius, offset: 64, minGap: 28, top: 24, bottom: 536 }).map(label => [label.key, label]));
    const root = svg('svg', { class: `orbit__svg${mini ? ' orbit__svg--mini' : ''}`, viewBox: '0 0 560 560', role: 'list', 'aria-label': options.label || 'orbit segments', preserveAspectRatio: 'xMidYMid meet', focusable: 'false' });
    root.style.width = `${width}px`; root.style.height = `${width}px`;
    const track = svg('path', { class: 'orbit__track', d: arcPath(cx, cy, radius, startAngle, startAngle + dir * sweep, model.direction) });
    root.append(track);
    const parts = [];
    segments.forEach((segment, index) => {
      const key = String(segment.key ?? index), arc = layout[index];
      if (!arc) return;
      const state = segment.state || 'future', color = segment.fillColor || segment.color || COLORS[state] || COLORS.future;
      const group = svg('g', { class: `orbit__segment is-${state}`, 'data-key': key, role: 'listitem' });
      const trackPath = svg('path', { class: 'orbit__segment-track', d: arcPath(cx, cy, radius, arc.from, arc.to, model.direction) });
      const ratio = clamp(Number(segment.fill) || 0, 0, 1);
      const filledPath = ratio > 0 ? svg('path', { class: 'orbit__segment-fill', d: arcPath(cx, cy, radius, arc.from, arc.from + (arc.to - arc.from) * ratio, model.direction), stroke: color }) : null;
      group.append(trackPath); if (filledPath) group.append(filledPath);
      const hit = svg('path', { class: 'orbit__hit', d: arcPath(cx, cy, radius, arc.from, arc.to, model.direction), tabindex: '0', role: 'button', 'aria-label': segment.ariaLabel || [segment.label, segment.value, deltaText(segment.delta)].filter(Boolean).join(', ') || key, 'data-segment': key });
      hit.addEventListener('click', event => options.onSegment?.(segment, event));
      hit.addEventListener('pointerenter', event => options.onSegmentHover?.(segment, event));
      hit.addEventListener('pointerleave', event => options.onSegmentLeave?.(segment, event));
      hit.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); options.onSegment?.(segment, event); } });
      group.append(hit);
      if (state === 'current') {
        const end = arc.from + (arc.to - arc.from) * ratio, point = polar(cx, cy, radius, end);
        group.append(svg('circle', { class: 'orbit__current-dot', cx: point.x, cy: point.y, r: 5.5, fill: color }));
      }
      root.append(group); parts.push({ segment, arc });
      if (!mini && (segment.label || segment.value != null || segment.delta != null)) {
        const placement = labelPositions.get(key);
        const label = svg('g', { class: `orbit__label${sideLabels ? ' is-side' : ''}`, 'data-label-for': key,
          transform: sideLabels ? `translate(${cx + radius + 30} ${38 + index * 25})` : `translate(${placement?.x ?? cx} ${placement?.y ?? cy})`,
          'text-anchor': sideLabels ? 'start' : placement?.anchor || 'middle' });
        const title = svg('title'); title.textContent = segment.ariaLabel || [segment.label, segment.value, deltaText(segment.delta)].filter(Boolean).join(' · '); label.append(title);
        const text = (className, value, dy) => { if (value == null || value === '') return; const row = svg('text', { class: className, x: 0, dy }); row.textContent = value; label.append(row); };
        if (sideLabels) { text('orbit__label-name', segment.label || '', '-.35em'); text('orbit__label-value', [segment.value, deltaText(segment.delta)].filter(Boolean).join(' · '), '1.2em'); }
        else { text('orbit__label-name', segment.label || '', '-.35em'); text('orbit__label-value', segment.value ?? '', '1.25em'); text('orbit__label-delta', deltaText(segment.delta), '1.2em'); }
        root.append(label);
      }
    });
    if (options.caret != null && !mini) {
      const at = Number(options.caret), p = polar(cx, cy, radius, at), p1 = polar(cx, cy, radius + 10, at);
      root.append(svg('line', { class: 'orbit__caret', x1: p.x, y1: p.y, x2: p1.x, y2: p1.y }));
    }
    const markers = model.markers || [];
    for (const cluster of clusterMarkers(markers, Number(options.markerClusterDegrees) || 5)) {
      const p = polar(cx, cy, radius, cluster.angle);
      const group = svg('g', { class: `orbit__marker-cluster${cluster.count > 1 ? ' is-cluster' : ''}`, transform: `translate(${p.x} ${p.y})`, tabindex: '0', role: 'button', 'aria-label': cluster.count > 1 ? `${cluster.count} markers` : cluster.items[0].label || 'marker', 'data-marker-cluster': cluster.key, 'data-marker-keys': JSON.stringify(cluster.items.map(item => String(item.key ?? item.id ?? ''))) });
      const title = svg('title'); title.textContent = cluster.items.map(item => item.label).filter(Boolean).join(' · ') || `${cluster.count} markers`;
      group.append(title, svg('circle', { class: 'orbit__marker-ring', r: cluster.count > 1 ? 13 : 10, fill: cluster.items.some(item => item.type === 'bad' || item.tone === 'bad') ? COLORS.bad : COLORS.good }));
      if (cluster.count > 1) { const count = svg('text', { class: 'orbit__marker-count', x: 0, y: 4 }); count.textContent = String(cluster.count); group.append(count); }
      else { const mark = svg('text', { class: 'orbit__marker-mark', x: 0, y: 4 }); mark.textContent = cluster.items[0].type === 'bad' || cluster.items[0].tone === 'bad' ? '!' : '✦'; group.append(mark); }
      const expand = event => { event.stopPropagation(); this.expandedClusters.has(cluster.key) ? this.expandedClusters.delete(cluster.key) : this.expandedClusters.add(cluster.key); options.onMarkerCluster?.(cluster.items, event); if (cluster.count === 1) options.onMarker?.(cluster.items[0], event); else this.draw(this.current); };
      group.addEventListener('click', expand); group.addEventListener('pointerenter', event => { options.onMarkerHover?.(cluster.items, event); if (cluster.count > 1) { this.expandedClusters.add(cluster.key); this.draw(this.current); } }); group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); expand(event); } });
      root.append(group);
      if (this.expandedClusters.has(cluster.key) && cluster.count > 1) {
        cluster.items.forEach((marker, index) => { const rawOffset = (index - (cluster.count - 1) / 2) * 24, offset = clamp(rawOffset, 26 - p.x, 534 - p.x); const itemKey = String(marker.key ?? marker.id ?? index); const item = svg('g', { class: 'orbit__marker-expanded', transform: `translate(${p.x + offset} ${p.y - 24})`, tabindex: '0', role: 'button', 'aria-label': marker.label || `marker ${index + 1}`, 'data-marker-expanded': itemKey }); item.append(svg('circle', { r: 10 })); const mark = svg('text', { x: 0, y: 4 }); mark.textContent = marker.type === 'bad' || marker.tone === 'bad' ? '!' : '✦'; item.append(mark); const label = svg('text', { class: 'orbit__marker-expanded-label', x: offset >= 0 ? 13 : -13, y: 4, 'text-anchor': offset >= 0 ? 'start' : 'end' }); label.textContent = marker.label || marker.key || `marker ${index + 1}`; item.append(label); item.addEventListener('click', event => options.onMarker?.(marker, event)); item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); options.onMarker?.(marker, event); } }); root.append(item); });
      }
    }
    const sections = options.sections || [];
    sections.forEach(section => {
      const boundary = layout[section.start]; if (!boundary) return;
      const point = polar(cx, cy, radius, boundary.from - dir * 2);
      root.append(svg('circle', { class: 'orbit__section-dot', cx: point.x, cy: point.y, r: 2.1 }));
      if (section.label && !mini) { const labelPoint = polar(cx, cy, radius + 17, boundary.from); const text = svg('text', { class: 'orbit__section-label', x: labelPoint.x, y: labelPoint.y }); text.textContent = section.label; root.append(text); }
    });
    this.element.replaceChildren(root);
    this.element.style.setProperty('--orbit-accent', options.accent || COLORS.current);
    if (focusKey) {
      const focusTarget = this.element.querySelector(`[data-segment="${CSS.escape(focusKey)}"],[data-marker-cluster="${CSS.escape(focusKey)}"],[data-marker-expanded="${CSS.escape(focusKey)}"]`);
      if (focusTarget && !mini) { focusTarget.focus({ preventScroll: true }); this.focusedKey = focusKey; }
    }
    this.element.dispatchEvent(new CustomEvent('orbitchange', { detail: { orbit: this } }));
  }

  destroy() { this.sequence++; this.element.removeEventListener('focusin', this.onFocusIn); this.element.remove(); }
}

export const createOrbit = (host, options) => new Orbit(host, options);
export function createMiniOrbit(host, { label = '', value = '', size = 38, ...options } = {}) {
  const row = document.createElement('div'); row.className = 'orbit-mini-row';
  const glyphHost = document.createElement('span'); glyphHost.className = 'orbit-mini-row__glyph';
  const copy = document.createElement('span'); copy.className = 'orbit-mini-row__copy';
  const name = document.createElement('span'); name.className = 'orbit-mini-row__label'; name.textContent = label;
  const detail = document.createElement('span'); detail.className = 'orbit-mini-row__value'; detail.textContent = value;
  copy.append(name, detail); row.append(glyphHost, copy); host.append(row);
  const orbit = new Orbit(glyphHost, { ...options, size: 'mini', glyphSize: size, label: label || 'mini orbit' });
  return { element: row, orbit, update(next = {}) { if (next.label != null) name.textContent = next.label; if (next.value != null) detail.textContent = next.value; return orbit.update(next); }, destroy() { orbit.destroy(); row.remove(); } };
}
export { arcPath, clusterMarkers, MINI_GLYPH_RANGE, miniGlyphSize, placeLabels, polar, ringLayout } from './geometry.js';
