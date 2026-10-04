import { arcPath, clusterMarkers, miniGlyphSize, placeLabels, polar, ringLayout } from './geometry.js';
import './orbit.css';

const NS = 'http://www.w3.org/2000/svg';
const SIZES = { XL: 520, L: 420, M: 300, S: 210, mini: 44 };
const COLORS = { track: '#494b47', future: '#777a74', current: '#52e0ca', done: '#e8e4da', skipped: '#a7c7b9', wrong: '#edae62', good: '#52e0ca', bad: '#ed8c70' };
const cubeLabelSafeArea = (cx, cy, clearance = 112) => [{ left: cx - clearance, right: cx + clearance, top: cy - clearance, bottom: cy + clearance }];
const markerSafeAreas = (cx, cy, radius, markers, hitRadius = 20) => clusterMarkers(markers, 5).map(cluster => {
  const point = polar(cx, cy, radius, cluster.angle), padding = Math.max(hitRadius, cluster.count > 1 ? 17 : 13);
  return { left: point.x - padding, right: point.x + padding, top: point.y - padding, bottom: point.y + padding };
});
const svg = (name, attrs = {}) => { const node = document.createElementNS(NS, name); for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, String(value)); return node; };
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const deltaText = value => {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return Math.abs(value) < 0.005 ? '' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
  if (/^[+-−]?0\.00$/.test(String(value).trim())) return '';
  return String(value);
};
const labelWidth = segment => Math.min(260, Math.max(52, String(segment.label || '').length * 7.5, String(segment.value ?? '').length * 9, String(deltaText(segment.delta)).length * 7.2) + 16);
const labelHeight = segment => segment.delta != null && deltaText(segment.delta) ? 64 : segment.value != null ? 44 : 24;
/** One accessible SVG Orbit. Instantiate once and call update() as its view changes. */
export class Orbit {
  constructor(host, options = {}) {
    if (!host) throw new Error('Orbit needs a host element.');
    this.host = host;
    this.options = { size: 'L', shape: 'open', gap: 70, start: 180, direction: 'clockwise', segments: [], ...options };
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.sequence = 0;
    this.displayed = null;
    this.expandedClusters = new Set();
    this.focusedKey = null;
    this.markerDetailsScrollTop = 0;
    this.element = document.createElement('div');
    this.element.className = 'orbit';
    this.element.dataset.shape = this.options.shape;
    this.element.dataset.size = this.options.size;
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', this.options.label || 'orbit');
    this.onFocusIn = event => {
      const target = event.target.closest?.('[data-segment],[data-marker-cluster],[data-marker-expanded],[data-marker-detail-key]');
      this.focusedKey = target?.dataset.segment || target?.dataset.markerCluster || target?.dataset.markerExpanded || target?.dataset.markerDetailKey || this.focusedKey;
    };
    this.element.addEventListener('focusin', this.onFocusIn);
    this.onEscape = event => {
      if (event.key !== 'Escape' || !this.expandedClusters.size) return;
      const key = [...this.expandedClusters][0];
      event.preventDefault(); this.expandedClusters.clear(); this.draw(this.current);
      this.element.querySelector(`[data-marker-cluster="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
    };
    this.element.addEventListener('keydown', this.onEscape);
    this.host.append(this.element);
    this.update(this.options, { animate: false });
    // Label placement must follow the host when a viewport or layout changes,
    // even when the underlying solve state has not emitted another update.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.current && !this.element.classList.contains('is-morphing')) this.draw(this.current);
    });
    this.resizeObserver.observe(this.host);
  }

  update(options = {}, { animate = true } = {}) {
    const previous = this.displayed || this.current;
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
    const renderWidth = Math.min(mini ? miniGlyphSize(options.glyphSize) : options.fitHost ? Infinity : SIZES[options.size] || SIZES.L,
      this.host.clientWidth || SIZES.L, this.host.clientHeight || SIZES.L);
    const fontScale = Math.max(1, Math.min(2.2, 560 / renderWidth));
    const labelAnchors = segments.map((segment, at) => ({ key: layout[at].key, angle: layout[at].mid,
      width: labelWidth(segment) * fontScale, height: labelHeight(segment) * fontScale,
      rank: Math.max(Number(segment.importance) || 0, segment.selected ? 1000 : 0, segment.state === 'current' ? 500 : 0) }));
    const labels = mini ? [] : placeLabels(labelAnchors, { cx, cy, radius, offset: 82, minGap: 24, top: 18, bottom: 542, obstacles: [...cubeLabelSafeArea(cx, cy, options.centerClearance), ...markerSafeAreas(cx, cy, radius, markers)] });
    labels.forEach((label, at) => collision.set(label.key, label));
    return { cx, cy, radius, gap, sweep, startAngle, direction, segments, layout, labels: collision, markers, options };
  }

  duration() { return clamp(Number(this.options.duration) || 360, 300, 450); }

  async animateFrom(from, to, duration) {
    const sequence = ++this.sequence;
    const started = performance.now();
    // The host box is stable for this transition. Carry one measurement into
    // draw() so each animation frame can update SVG without forcing layout.
    const layoutBounds = this.host.getBoundingClientRect();
    this.element.classList.add('is-morphing');
    return new Promise(resolve => {
      const finish = () => { if (sequence !== this.sequence) { resolve(); return; } this.draw(to); this.element.classList.remove('is-morphing'); resolve(); };
      const tick = now => {
        if (sequence !== this.sequence) { resolve(); return; }
        const raw = Math.min(1, (now - started) / duration);
        const t = 1 - Math.pow(1 - raw, 4);
        const fromWidth = from.interpolatedWidth ?? (from.options.size === 'mini' ? miniGlyphSize(from.options.glyphSize) : SIZES[from.options.size] || SIZES.L);
        const toWidth = to.options.size === 'mini' ? miniGlyphSize(to.options.glyphSize) : SIZES[to.options.size] || SIZES.L;
        const oldLayout = new Map((from.layout || []).map(part => [part.key, part]));
        const newLayout = new Map(to.layout.map(part => [part.key, part]));
        const keys = [...new Set([...oldLayout.keys(), ...newLayout.keys()])];
        const lerpAngle = (a, b) => {
          let delta = b - a;
          while (delta > 180) delta -= 360;
          while (delta < -180) delta += 360;
          return a + delta * t;
        };
        const layout = keys.map(key => {
          const a = oldLayout.get(key) || newLayout.get(key), b = newLayout.get(key) || oldLayout.get(key);
          const a0 = oldLayout.has(key) ? a.from : a.mid, a1 = oldLayout.has(key) ? a.to : a.mid;
          const b0 = newLayout.has(key) ? b.from : b.mid, b1 = newLayout.has(key) ? b.to : b.mid;
          const start = lerpAngle(a0, b0), end = lerpAngle(a1, b1);
          return { key, from: start, to: end, mid: (start + end) / 2, direction: to.direction };
        });
        const oldMarkers = new Map((from.markers || []).map(marker => [String(marker.key ?? marker.id), marker]));
        const newMarkers = new Map(to.markers.map(marker => [String(marker.key ?? marker.id), marker]));
        const markers = [...new Set([...oldMarkers.keys(), ...newMarkers.keys()])].map(key => {
          const a = oldMarkers.get(key) || newMarkers.get(key), b = newMarkers.get(key) || oldMarkers.get(key);
          return { ...b, angle: lerpAngle(a.angle, b.angle) };
        });
        const fromGap = from.interpolatedGap ?? from.gap;
        this.draw({ ...to, layout, markers, interpolatedGap: fromGap + (to.gap - fromGap) * t, interpolatedWidth: fromWidth + (toWidth - fromWidth) * t, layoutBounds });
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
    const markers = model.markers || [];
    const width = model.interpolatedWidth ?? (options.size === 'mini' ? miniGlyphSize(options.glyphSize) : SIZES[options.size] || SIZES.L);
    const gap = model.interpolatedGap ?? model.gap;
    const mini = options.size === 'mini';
    const hostBox = model.layoutBounds || this.host.getBoundingClientRect();
    const fittedWidth = Math.min(options.fitHost && !mini ? Infinity : width, hostBox.width || width, hostBox.height || width);
    const renderWidth = fittedWidth;
    this.element.style.width = `${fittedWidth}px`;
    this.element.style.height = `${fittedWidth}px`;
    this.element.style.maxWidth = '100%';
    this.element.style.maxHeight = '100%';
    const sideLabels = options.labelStyle === 'side';
    const currentFocus = this.element.querySelector('[data-segment]:focus,[data-marker-cluster]:focus,[data-marker-expanded]:focus,[data-marker-detail-key]:focus,.orbit__marker-details-close:focus');
    const focusKey = currentFocus?.dataset.segment
      || currentFocus?.dataset.markerCluster
      || this.element.querySelector('[data-marker-cluster]:focus')?.dataset.markerCluster
      || this.element.querySelector('[data-marker-expanded]:focus')?.dataset.markerExpanded
      || this.element.querySelector('[data-marker-detail-key]:focus')?.dataset.markerDetailKey
      || this.element.querySelector('.orbit__marker-details-close:focus')?.dataset.markerDetailKey
      || this.focusedKey;
    const previousList = this.element.querySelector('.orbit__marker-details-list');
    if (previousList) this.markerDetailsScrollTop = previousList.scrollTop;
    if (currentFocus) this.focusedKey = currentFocus.dataset.segment || currentFocus.dataset.markerCluster || currentFocus.dataset.markerExpanded || currentFocus.dataset.markerDetailKey;
    const sweep = 360 - gap;
    const dir = model.direction === 'counterclockwise' ? -1 : 1;
    const startAngle = (Number(options.start) || 180) + (gap ? gap / 2 : 0) * (model.direction === 'counterclockwise' ? -1 : 1);
    const layout = model.layout || ringLayout(segments, { gapDeg: Number(options.segmentGap ?? 2.5), startDeg: startAngle, sweepDeg: sweep, direction: model.direction, sections: options.sections || [] });
    const layoutByKey = new Map(layout.map(part => [String(part.key), part]));
    const activeKey = focusKey;
    const fontScale = Math.max(1, Math.min(2.2, 560 / renderWidth));
    const hitRadius = Math.max(20.2, 20.2 * 560 / renderWidth);
    const labelObstacles = [...cubeLabelSafeArea(cx, cy, options.centerClearance), ...markerSafeAreas(cx, cy, radius, markers, hitRadius)];
    const labelPositions = mini || sideLabels ? new Map() : new Map(placeLabels(segments.map((segment, index) => ({ key: String(segment.key ?? index), angle: layoutByKey.get(String(segment.key ?? index))?.mid ?? layout[index].mid, width: labelWidth(segment) * fontScale + 6, height: labelHeight(segment) * fontScale + 6, rank: Math.max(Number(segment.importance) || 0, segment.selected ? 1000 : 0, segment.state === 'current' ? 500 : 0, String(segment.key ?? index) === activeKey ? 2000 : 0) })), { cx, cy, radius, offset: 82, minGap: 24, top: 18, bottom: 542, obstacles: labelObstacles }).map(label => [label.key, label]));
    const root = svg('svg', { class: `orbit__svg${mini ? ' orbit__svg--mini' : ''}`, viewBox: '0 0 560 560', role: 'list', 'aria-label': options.label || 'orbit segments', preserveAspectRatio: 'xMidYMid meet', focusable: 'false' });
    // Fit the SVG and Orbit frame to constrained hosts so preserveAspectRatio
    // keeps the ring centered within the available slot.
    root.style.width = `${renderWidth}px`; root.style.height = `${renderWidth}px`;
    const track = svg('path', { class: 'orbit__track', d: arcPath(cx, cy, radius, startAngle, startAngle + dir * sweep, model.direction) });
    root.append(track);
    const parts = [];
    segments.forEach((segment, index) => {
      const key = String(segment.key ?? index), arc = layoutByKey.get(key);
      if (!arc) return;
      const state = segment.state || 'future', color = segment.fillColor || segment.color || COLORS[state] || COLORS.future;
      const group = svg('g', { class: `orbit__segment is-${state}`, 'data-key': key, role: 'listitem', 'aria-label': [segment.label, segment.value, deltaText(segment.delta)].filter(Boolean).join(', ') || key });
      const trackPath = svg('path', { class: 'orbit__segment-track', d: arcPath(cx, cy, radius, arc.from, arc.to, model.direction) });
      const ratio = clamp(Number(segment.fill) || 0, 0, 1);
      const offset = clamp(Number(segment.fillOffset) || 0, 0, 1);
      const filledPath = ratio > 0 ? svg('path', { class: 'orbit__segment-fill', d: arcPath(cx, cy, radius, arc.from + (arc.to - arc.from) * offset, arc.from + (arc.to - arc.from) * Math.min(1, offset + ratio), model.direction), stroke: color }) : null;
      group.append(trackPath); if (filledPath) group.append(filledPath);
      const hit = svg('path', { class: 'orbit__hit', d: arcPath(cx, cy, radius, arc.from, arc.to, model.direction), tabindex: '0', role: 'button', 'aria-label': segment.ariaLabel || [segment.label, segment.value, deltaText(segment.delta)].filter(Boolean).join(', ') || key, 'data-segment': key });
      hit.addEventListener('click', event => options.onSegment?.(segment, event));
      hit.addEventListener('pointerenter', event => options.onSegmentHover?.(segment, event));
      hit.addEventListener('pointerleave', event => options.onSegmentLeave?.(segment, event));
      hit.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); options.onSegment?.(segment, event); } });
      group.append(hit);
      if (state === 'current') {
        const end = arc.from + (arc.to - arc.from) * (segment.caretPosition ?? Math.min(1, offset + ratio)), point = polar(cx, cy, radius, end);
        group.append(svg('circle', { class: 'orbit__current-dot', cx: point.x, cy: point.y, r: 5.5, fill: color }));
      }
      root.append(group); parts.push({ segment, arc });
      if (!mini && (segment.label || segment.value != null || segment.delta != null)) {
        const placement = labelPositions.get(key);
        if (!sideLabels && placement?.hidden) return;
        const label = svg('g', { class: `orbit__label${sideLabels ? ' is-side' : ''}`, 'data-label-for': key,
          transform: sideLabels ? `translate(${cx + radius + 30} ${38 + index * 25})` : `translate(${placement?.x ?? cx} ${placement?.y ?? cy})`,
          'text-anchor': sideLabels ? 'start' : placement?.anchor || 'middle' });
        if (!sideLabels) {
          const width = labelWidth(segment) * fontScale, height = labelHeight(segment) * fontScale;
          const x = placement?.anchor === 'start' ? -3 : placement?.anchor === 'end' ? -width - 3 : -width / 2 - 3;
          label.append(svg('rect', { class: 'orbit__label-bg', x, y: -height / 2 - 3, width: width + 6, height: height + 6, rx: 4 }));
        }
        const title = svg('title'); title.textContent = segment.ariaLabel || [segment.label, segment.value, deltaText(segment.delta)].filter(Boolean).join(' · '); label.append(title);
        const text = (className, value, y) => { if (value == null || value === '') return; const row = svg('text', { class: className, x: 0, y }); row.textContent = value; label.append(row); };
        if (sideLabels) { text('orbit__label-name', segment.label || '', -12); text('orbit__label-value', [segment.value, deltaText(segment.delta)].filter(Boolean).join(' · '), 8); }
        else {
          const hasDetails = segment.value != null || Boolean(deltaText(segment.delta));
          text('orbit__label-name', segment.label || '', hasDetails ? -14 : 4);
          text('orbit__label-value', segment.value ?? '', 10);
          text('orbit__label-delta', deltaText(segment.delta), 31);
        }
        root.append(label);
      }
    });
    if (options.caret != null && !mini) {
      const at = Number(options.caret), p = polar(cx, cy, radius, at), p1 = polar(cx, cy, radius + 10, at);
      root.append(svg('line', { class: 'orbit__caret', x1: p.x, y1: p.y, x2: p1.x, y2: p1.y }));
    }
    for (const cluster of clusterMarkers(markers, Number(options.markerClusterDegrees) || 5)) {
      const p = polar(cx, cy, radius, cluster.angle);
      const group = svg('g', { class: `orbit__marker-cluster${cluster.count > 1 ? ' is-cluster' : ''}`, transform: `translate(${p.x} ${p.y})`, tabindex: '0', role: 'button', 'aria-label': cluster.count > 1 ? `${cluster.count} markers; activate to inspect facts` : cluster.items[0].label || 'marker', 'data-marker-cluster': cluster.key, 'data-marker-keys': JSON.stringify(cluster.items.map(item => String(item.key ?? item.id ?? ''))) });
      const title = svg('title'); title.textContent = cluster.items.map(item => item.label).filter(Boolean).join(' · ') || `${cluster.count} markers`;
      group.append(title, svg('circle', { class: 'orbit__marker-hit', cx: 0, cy: 0, r: hitRadius }), svg('circle', { class: 'orbit__marker-ring', r: cluster.count > 1 ? 13 : 10, fill: cluster.items.some(item => item.type === 'bad' || item.tone === 'bad') ? COLORS.bad : COLORS.good }));
      if (cluster.count > 1) { const count = svg('text', { class: 'orbit__marker-count', x: 0, y: 4 }); count.textContent = String(cluster.count); group.append(count); }
      else { const mark = svg('text', { class: 'orbit__marker-mark', x: 0, y: 4 }); mark.textContent = cluster.items[0].type === 'bad' || cluster.items[0].tone === 'bad' ? '!' : '✦'; group.append(mark); }
      const expand = event => {
        event.stopPropagation();
        if (this.expandedClusters.has(cluster.key)) this.expandedClusters.delete(cluster.key);
        else { this.expandedClusters.clear(); this.expandedClusters.add(cluster.key); }
        options.onMarkerCluster?.(cluster.items, event);
        if (cluster.count === 1) options.onMarker?.(cluster.items[0], event);
        else {
          this.draw(this.current);
          if (event.type === 'keydown') this.element.querySelector('.orbit__marker-details button:not(.orbit__marker-details-close)')?.focus({ preventScroll: true });
        }
      };
      group.addEventListener('click', expand); group.addEventListener('pointerenter', event => { options.onMarkerHover?.(cluster.items, event); if (cluster.count > 1) { this.expandedClusters.add(cluster.key); this.draw(this.current); } }); group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); expand(event); } });
      root.append(group);
    }
    const sections = options.sections || [];
    sections.forEach(section => {
      const boundary = layout[section.start]; if (!boundary) return;
      const point = polar(cx, cy, radius, boundary.from - dir * 2);
      root.append(svg('circle', { class: 'orbit__section-dot', cx: point.x, cy: point.y, r: 2.1 }));
      if (section.label && !mini) { const labelPoint = polar(cx, cy, radius + 17, boundary.from); const text = svg('text', { class: 'orbit__section-label', x: labelPoint.x, y: labelPoint.y }); text.textContent = section.label; root.append(text); }
    });
    this.element.replaceChildren(root);
    const activeCluster = clusterMarkers(markers, Number(options.markerClusterDegrees) || 5).find(cluster => this.expandedClusters.has(cluster.key) && cluster.count > 1);
    if (activeCluster) {
      const details = document.createElement('section');
      details.className = 'orbit__marker-details';
      details.setAttribute('role', 'region');
      details.setAttribute('aria-label', `${activeCluster.count} marker details`);
      const heading = document.createElement('div');
      heading.className = 'orbit__marker-details-heading';
      heading.textContent = `${activeCluster.count} marker facts`;
      const close = document.createElement('button');
      close.className = 'orbit__marker-details-close';
      close.type = 'button'; close.textContent = 'Close'; close.setAttribute('aria-label', 'Close marker details');
      close.dataset.markerCluster = activeCluster.key;
      const dismiss = () => { this.expandedClusters.delete(activeCluster.key); this.draw(this.current); this.element.querySelector(`[data-marker-cluster="${CSS.escape(activeCluster.key)}"]`)?.focus({ preventScroll: true }); };
      close.addEventListener('click', dismiss);
      details.append(heading, close);
      const list = document.createElement('div'); list.className = 'orbit__marker-details-list'; list.setAttribute('role', 'list');
      activeCluster.items.forEach((marker, index) => {
        const row = document.createElement('div'); row.setAttribute('role', 'listitem');
        const button = document.createElement('button');
        button.className = 'orbit__marker-details-item'; button.type = 'button'; button.dataset.markerDetailKey = String(marker.key ?? marker.id ?? index + 1); button.dataset.markerExpanded = button.dataset.markerDetailKey;
        const key = String(marker.key ?? marker.id ?? index + 1);
        const facts = [marker.label, marker.time, marker.timeMs, marker.atMs, marker.timestamp, marker.durationMs,
          marker.moveIndex == null ? null : `move ${marker.moveIndex}`, marker.segment, marker.value, marker.delta]
          .filter(value => value != null && value !== '').map(String);
        button.textContent = `${key} · ${facts.length ? facts.join(' · ') : 'marker fact'}`;
        button.title = JSON.stringify(marker);
        button.setAttribute('aria-label', `${key}: ${facts.join(', ') || 'marker fact'}`);
        button.addEventListener('click', event => options.onMarker?.(marker, event));
        row.append(button); list.append(row);
      });
      details.append(list);
      list.addEventListener('scroll', () => { this.markerDetailsScrollTop = list.scrollTop; }, { passive: true });
      this.element.append(details);
      const anchor = root.querySelector(`[data-marker-cluster="${CSS.escape(activeCluster.key)}"]`);
      const rootBox = root.getBoundingClientRect(), orbitBox = this.element.getBoundingClientRect(), anchorBox = anchor?.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 24, Math.max(180, orbitBox.width - 16));
      details.style.width = `${width}px`;
      const left = Math.max(8, Math.min(Math.max(8, orbitBox.width - width - 8), (anchorBox?.left ?? rootBox.left) - orbitBox.left + (anchorBox?.width ?? 0) / 2 - width / 2));
      const top = Math.max(8, Math.min(orbitBox.height - 180, (anchorBox?.bottom ?? rootBox.top) - orbitBox.top + 10));
      details.style.left = `${left}px`; details.style.top = `${top}px`;
      const ratio = rootBox.width / 560;
      root.append(svg('line', { class: 'orbit__marker-detail-connector', x1: (anchorBox.left + anchorBox.width / 2 - rootBox.left) / ratio, y1: (anchorBox.top + anchorBox.height / 2 - rootBox.top) / ratio, x2: (orbitBox.left + left + width / 2 - rootBox.left) / ratio, y2: (orbitBox.top + top - rootBox.top) / ratio }));
      details.addEventListener('pointerdown', event => event.stopPropagation());
    }
    this.displayed = model;
    this.element.style.setProperty('--orbit-accent', options.accent || COLORS.current);
    this.element.style.setProperty('--orbit-label-scale', String(fontScale));
    if (focusKey) {
      const escapedFocusKey = CSS.escape(focusKey);
      const focusTarget = this.element.querySelector(`[data-marker-detail-key="${escapedFocusKey}"]`)
        || this.element.querySelector(`[data-segment="${escapedFocusKey}"]`)
        || this.element.querySelector(`[data-marker-cluster="${escapedFocusKey}"]`)
        || this.element.querySelector(`[data-marker-expanded="${escapedFocusKey}"]`);
      if (focusTarget && !mini) { focusTarget.focus({ preventScroll: true }); this.focusedKey = focusKey; }
    }
    const detailList = this.element.querySelector('.orbit__marker-details-list');
    if (detailList) detailList.scrollTop = this.markerDetailsScrollTop;
    this.element.dispatchEvent(new CustomEvent('orbitchange', { detail: { orbit: this } }));
  }

  destroy() { this.resizeObserver?.disconnect(); this.sequence++; this.element.removeEventListener('focusin', this.onFocusIn); this.element.removeEventListener('keydown', this.onEscape); this.element.remove(); }
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
