import { arcPath, clusterMarkers, fanMarkers, looksLikeMoves, miniGlyphSize, ORBIT_GEOMETRY, polar, ringLabels, ringLayout } from './geometry.js';
import { groupEndLabels } from './end-labels.js';
import { CANVAS, ORBIT } from '../design-spec.js';
import './orbit.css';
import { COMPLETION_DURATION, completionPlan, completionSegments, isCompleted, segmentKey } from './completion.js';

const NS = 'http://www.w3.org/2000/svg';
const SIZES = { XL: 520, L: 420, M: 300, S: 210, mini: 44 };
// Every number below is read from design-spec.js (extracted from the approved A-frames): the ring is r=300 on a
// 900 px canvas, so a square viewBox of VIEW units centred on the ring renders 1:1 at width VIEW. Smaller hosts
// scale the whole thing; strokes and type are divided by that scale so they stay at their specified pixel size.
const { view: VIEW, radius: RING_RADIUS, stageLabelRadius: STAGE_RADIUS, moveLabelRadius: MOVE_RADIUS, stroke: STROKE, gapDeg: SEGMENT_GAP_DEG, moveGapDeg: MOVE_GAP_DEG, moveWindow: MOVE_WINDOW } = ORBIT_GEOMETRY;
const MINI_VIEW = { view: 560, radius: 190 };
const COLORS = { current: ORBIT.stroke.active.stroke, done: ORBIT.stroke.done.stroke, quiet: ORBIT.stroke.doneQuiet.stroke, skipped: ORBIT.stroke.skip.stroke, wrong: ORBIT.stroke.activeWrong.stroke, good: ORBIT.stroke.doneGood.stroke, bad: ORBIT.stroke.doneWarn.stroke };
const svg = (name, attrs = {}) => { const node = document.createElementNS(NS, name); for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, String(value)); return node; };
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const deltaText = value => {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return Math.abs(value) < 0.005 ? '' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
  if (/^[+-−]?0\.00$/.test(String(value).trim())) return '';
  return String(value);
};
const round2 = value => Math.round(value * 100) / 100;
/** The stage label block (A-05): name 12 / value 16 / delta 12 / tag 12 (inset 16), baselines 0, 21, 38, 55 apart, scaled with the Orbit. */
function stageBlock(segment, group, scale = 1, compact = false) {
  const merged = group && group.keys.length > 1;
  const name = merged ? group.name : segment.short ?? segment.label;
  const value = merged ? group.value : segment.value;
  const delta = merged ? '' : deltaText(segment.delta);
  const tone = segment.deltaTone || (String(delta).startsWith('\u2212') || String(delta).startsWith('-') ? 'good' : 'neutral');
  const rows = []; let y = 10 * scale;
  const push = (cls, text, step, inset = 0) => { if (text == null || text === '') return; if (rows.length) y += step * scale; rows.push({ cls, text: String(text), y, inset }); };
  if (compact) {
    // Phone (A-09 / A-12): a stage label is one 11 px value, coloured by how the split went. Name, delta and tag stay off the small ring.
    push(`orbit__label-value tone-${tone}${merged && group.kind === 'skip' ? ' is-skip' : ''}`, value, 0);
    return { rows, height: y + 8 * scale, width: Math.max(0, ...rows.map(row => row.text.length * 11 * 0.7 * scale)) };
  }
  push('orbit__label-name', name, 0);
  push(`orbit__label-value${merged && group.kind === 'skip' ? ' is-skip' : ''}`, value, 21);
  push(`orbit__label-delta is-${tone}`, delta, value == null || value === '' ? 21 : 17);
  push(`orbit__label-tag is-${segment.tagTone || 'good'}`, segment.tag, rows.length > 1 ? 17 : 21, 16 * scale);
  const size = cls => (cls.includes('label-value') ? 16 : 12) * scale * 0.7;   // DM Mono advance, with a little slack
  return { rows, height: y + 8 * scale, width: Math.max(0, ...rows.map(row => row.text.length * size(row.cls) + row.inset)) };
}
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
    const previousTarget = this.current;
    this.options = { ...this.options, ...options, segments: options.segments ?? options.segs ?? this.options.segments };
    this.current = this.normalize(this.options);
    this.element.dataset.shape = this.options.shape;
    this.element.dataset.size = this.options.size;
    const geometryChanged = previousTarget && (
      ['size', 'shape', 'gap', 'start', 'direction'].some(key => previousTarget.options[key] !== this.current.options[key])
      || previousTarget.segments.map(segmentKey).join('|') !== this.current.segments.map(segmentKey).join('|')
      || previousTarget.layout.some((part, index) => part.from !== this.current.layout[index]?.from || part.to !== this.current.layout[index]?.to)
    );
    const motion = previous && !this.reducedMotion.matches && this.options.animate !== false;
    if (motion && !geometryChanged) {
      const pending = completionPlan(previousTarget?.segments || [], previous.segments, this.current.segments, this.completion?.plan);
      const newlyCompleted = pending.some(item => !this.completion?.plan.some(old => old.key === item.key));
      const resetPending = this.completion?.plan.some(item => !isCompleted(this.current.segments.find((segment, index) => segmentKey(segment, index) === item.key)));
      if (pending.length && (animate || this.completion)) {
        if (!this.completion || newlyCompleted || resetPending) {
          const waiters = this.completion?.waiters || [];
          this.completion = { plan: pending, started: performance.now(), progress: 0, waiters };
        }
        this.sequence++;
        this.element.classList.remove('is-morphing');
        this.draw(this.current);
        return this.runCompletion();
      }
    }
    this.stopCompletion();
    if (!motion || !animate) {
      this.sequence++;
      this.element.classList.remove('is-morphing');
      this.draw(this.current);
      return Promise.resolve();
    }
    return this.animateFrom(previous, this.current, this.duration());
  }

  runCompletion() {
    const promise = new Promise(resolve => this.completion.waiters.push(resolve));
    if (this.completionFrame) return promise;
    const tick = now => {
      this.completionFrame = null;
      if (!this.completion) return;
      if (this.reducedMotion.matches || this.options.animate === false) {
        this.stopCompletion(); this.draw(this.current); return;
      }
      const raw = Math.min(1, (now - this.completion.started) / COMPLETION_DURATION);
      this.completion.progress = 1 - Math.pow(1 - raw, 3);
      if (raw >= 1) this.stopCompletion();
      this.draw(this.current);
      if (this.completion) this.completionFrame = requestAnimationFrame(tick);
    };
    this.completionFrame = requestAnimationFrame(tick);
    return promise;
  }

  stopCompletion() {
    cancelAnimationFrame(this.completionFrame);
    this.completionFrame = null;
    const waiters = this.completion?.waiters || [];
    this.completion = null;
    waiters.forEach(resolve => resolve());
  }

  normalize(options) {
    const mini = options.size === 'mini';
    const viewSize = mini ? MINI_VIEW.view : VIEW;
    const cx = viewSize / 2, cy = viewSize / 2, radius = mini ? MINI_VIEW.radius : RING_RADIUS;
    const gap = options.shape === 'full' ? 0 : clamp(Number(options.gap) || 70, 0, 170);
    const sweep = 360 - gap;
    const direction = options.direction === 'counterclockwise' ? 'counterclockwise' : 'clockwise';
    const start = Number.isFinite(Number(options.start)) ? Number(options.start) : 180;
    const startAngle = start + (gap ? gap / 2 : 0) * (direction === 'counterclockwise' ? -1 : 1);
    const segments = Array.isArray(options.segments) ? options.segments : [];
    const moveGap = options.labelKind === 'move' || (options.labelKind == null && looksLikeMoves(segments)) ? MOVE_GAP_DEG : SEGMENT_GAP_DEG;
    const layout = ringLayout(segments, { gapDeg: Number(options.segmentGap ?? moveGap), startDeg: startAngle, sweepDeg: sweep, direction, sections: options.sections || [] });
    const index = new Map(layout.map((item, at) => [item.key, at]));
    const markers = (options.markers || []).map(marker => {
      if (marker.angle != null) return marker;
      const at = index.get(marker.segment ?? marker.key);
      if (at == null) return null;
      const part = layout[at];
      const fill = clamp(Number(marker.position ?? marker.fill ?? .5), 0, 1);
      return { ...marker, angle: part.from + (part.to - part.from) * fill };
    }).filter(Boolean);
    return { cx, cy, radius, viewSize, gap, sweep, startAngle, direction, segments, layout, markers, options };
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
    if (model === this.current && this.completion) model = { ...model, segments: completionSegments(model.segments, this.completion.plan, this.completion.progress) };
    const { cx, cy, radius, segments, options } = model;
    const markers = model.markers || [];
    const width = model.interpolatedWidth ?? (options.size === 'mini' ? miniGlyphSize(options.glyphSize) : SIZES[options.size] || SIZES.L);
    const gap = model.interpolatedGap ?? model.gap;
    const mini = options.size === 'mini';
    const hostBox = model.layoutBounds || this.host.getBoundingClientRect();
    // fitHost Orbits are sized from the canvas, not squeezed into whatever box the layout left: the frames put the
    // ring at r=300 on a 1440x900 canvas (r=150 on the 390 px phone), so the SVG is VIEW wide at canvas scale 1.
    const canvasSized = !mini && (options.canvasScale ?? (options.fitHost === true && options.labelStyle === 'around')) === true;
    // Phones scale the 390x844 phone frame; wider windows scale the 1440x900 desktop frame.
    const canvasUnit = window.innerWidth <= 640
      ? 0.5 * Math.min(1, window.innerWidth / CANVAS.phoneSheet.device.width, window.innerHeight / CANVAS.phoneSheet.device.height)
      : Math.min(1.25, window.innerWidth / CANVAS.desktop.width, window.innerHeight / CANVAS.desktop.height);
    // options.ringRadius: the ring radius (px at canvas scale 1) when a frame's ring is not the solve screen's r=300 (the history list, A-07: r=190).
    const ringScale = canvasSized && Number(options.ringRadius) > 0 ? Number(options.ringRadius) / RING_RADIUS : 1;
    // On a phone the stage (a smaller host on the review and history lists) is the limit: an Orbit wider than its host pokes out past the screen edge.
    const phoneHostCap = window.innerWidth <= 640 ? Math.min(hostBox.width || Infinity, hostBox.height || Infinity) : Infinity;
    const fittedWidth = canvasSized
      ? Math.round(Math.min(VIEW * canvasUnit * ringScale, phoneHostCap))
      : Math.min(options.fitHost && !mini ? Infinity : width, hostBox.width || width, hostBox.height || width);
    const renderWidth = fittedWidth;
    // Important, so a screen stylesheet that stretches the element to its slot cannot undo the canvas size.
    // min(.., 100vw): a viewport that shrinks before the next redraw (rotation, resize) cannot produce a horizontal scroll.
    const cssWidth = canvasSized ? `min(${fittedWidth}px, 100vw)` : `${fittedWidth}px`;
    this.element.style.setProperty('width', cssWidth, canvasSized ? 'important' : '');
    this.element.style.setProperty('height', cssWidth, canvasSized ? 'important' : '');
    this.element.style.maxWidth = canvasSized ? 'none' : '100%';
    this.element.style.maxHeight = canvasSized ? 'none' : '100%';
    this.element.style.flex = canvasSized ? 'none' : '';
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
    const layout = model.layout || ringLayout(segments, { gapDeg: Number(options.segmentGap ?? SEGMENT_GAP_DEG), startDeg: startAngle, sweepDeg: sweep, direction: model.direction, sections: options.sections || [] });
    const layoutByKey = new Map(layout.map(part => [String(part.key), part]));
    const view = model.viewSize ?? (mini ? MINI_VIEW.view : VIEW);
    const k = view / renderWidth;                       // viewBox units per rendered px
    const fontScale = Math.max(1, Math.min(2.2, k));
    const markerR = 11 * fontScale;
    const compactLabels = !mini && options.labelStyle === 'around' && window.innerWidth <= 640;   // the phone frames' one-value labels
    const fanned = options.markerFan !== false && !mini;
    // Every marker is its own hit target: 40+ px on a phone, 22 px (the badge itself) elsewhere. The fan spaces markers by that diameter.
    const hitPx = window.innerWidth <= 640 ? 41 : 22;   // 41, not 40: a sub-pixel round-off must never leave the target a hair under 40 px
    const hitRadius = fanned ? hitPx / 2 * k : Math.max(20.2, 20.2 * k);
    const root = svg('svg', { class: `orbit__svg${mini ? ' orbit__svg--mini' : ''}`, viewBox: `0 0 ${view} ${view}`, role: 'list', 'aria-label': options.label || 'orbit segments', preserveAspectRatio: 'xMidYMid meet', focusable: 'false' });
    // Fit the SVG and Orbit frame to constrained hosts so preserveAspectRatio
    // keeps the ring centered within the available slot.
    root.style.setProperty('width', cssWidth, canvasSized ? 'important' : ''); root.style.setProperty('height', cssWidth, canvasSized ? 'important' : '');
    // The stroke ladder (track 3, done 6, lit 8) is in rendered px, as in the frames: divide by the scale.
    const stroke = value => String(round2(value * Math.max(1, k)));
    const ladder = mini ? { track: 9, quiet: 9, done: 9, lit: 9, skip: 9 } : { track: STROKE.idle, quiet: STROKE.doneQuiet, done: STROKE.done, lit: STROKE.active, skip: STROKE.skip };
    for (const [name, width] of Object.entries(ladder)) this.element.style.setProperty(`--orbit-w-${name}`, mini ? String(width) : stroke(width));
    // The full-sweep track is NOT drawn under the segments: it filled the 2.5 degree gaps and turned the halo into one circle.
    // It only appears when there are no segments at all, in the template colour.
    if (!segments.length) root.append(svg('path', { class: 'orbit__track', d: arcPath(cx, cy, radius, startAngle, startAngle + dir * sweep, model.direction) }));
    const moveRing = !mini && !sideLabels && (options.labelKind === 'move' || (options.labelKind == null && looksLikeMoves(segments)));
    // Skipped / merged stages end together: one label between their arcs instead of one each.
    const groups = !mini && !sideLabels && !moveRing ? groupEndLabels(segments.map((segment, index) => ({ key: String(segment.key ?? index), state: segment.state, merged: segment.merged })), segment => { const original = segments.find((candidate, at) => String(candidate.key ?? at) === segment.key); return original?.short ?? original?.label ?? segment.key; }) : [];
    const groupOf = new Map(); groups.forEach(group => group.keys.forEach(key => groupOf.set(key, group)));
    const angleOf = key => layoutByKey.get(key)?.mid ?? 0;
    const hiddenLabel = segment => compactLabels && (segment.state === 'future' || segment.state === 'current');   // a phone labels only what is behind you (A-09 / A-12b)
    const labelItems = mini || sideLabels ? [] : segments.map((segment, index) => {
      if (hiddenLabel(segment)) return null;
      const key = String(segment.key ?? index);
      const group = groupOf.get(key);
      const spanAngle = group && group.keys.length > 1 ? group.keys.reduce((sum, member) => sum + angleOf(member), 0) / group.keys.length : angleOf(key);
      return { key, angle: spanAngle, kind: moveRing ? 'move' : 'stage', current: segment.state === 'current', height: stageBlock(segment, group, fontScale, compactLabels).height, width: stageBlock(segment, group, fontScale, compactLabels).width };
    }).filter(Boolean);
    // Room beside the drawing on a phone (the page margin), in view units, less a 4 px safety gap.
    const overhang = hostBox.width > 0 ? Math.max(0, Math.min(hostBox.left, window.innerWidth - hostBox.right) - 4) * k : 0;
    const placedLabels = ringLabels(labelItems, { cx, cy, stageRadius: STAGE_RADIUS, moveRadius: MOVE_RADIUS, pitch: 22 * fontScale / 1, windowSize: MOVE_WINDOW, ringStart: startAngle, ringSweep: sweep, view, clampToView: options.clampLabels ?? window.innerWidth <= 640, overhang });
    const labelPositions = new Map(placedLabels.labels.map(label => [label.key, label]));
    this.labelModel = placedLabels;
    const parts = [];
    segments.forEach((segment, index) => {
      const key = String(segment.key ?? index), arc = layoutByKey.get(key);
      if (!arc) return;
      const state = segment.state === 'done' && moveRing ? 'quiet' : segment.state || 'future', color = segment.fillColor || segment.color || COLORS[state] || COLORS.done;
      const group = svg('g', { class: `orbit__segment is-${state}${segment.completing ? ' is-completing' : ''}`, 'data-key': key, role: 'listitem', 'aria-label': [segment.label, segment.value, deltaText(segment.delta)].filter(Boolean).join(', ') || key });
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
      if ((state === 'current' || segment.completionLeading) && !moveRing) {
        const end = arc.from + (arc.to - arc.from) * (segment.caretPosition ?? Math.min(1, offset + ratio)), point = polar(cx, cy, radius, end);
        group.append(svg('circle', { class: 'orbit__current-dot', cx: point.x, cy: point.y, r: 5.5 * fontScale, fill: color }));
      }
      root.append(group); parts.push({ segment, arc });
      if (!mini && (segment.label || segment.value != null || segment.delta != null)) {
        const placement = labelPositions.get(key);
        if (!sideLabels && (placement?.hidden || hiddenLabel(segment))) return;
        // Merged groups draw one label, on their first member.
        const merge = groupOf.get(key);
        if (!sideLabels && merge && merge.keys.length > 1 && merge.keys[0] !== key) return;
        if (moveRing) {
          const label = svg('text', { class: `orbit__move-label is-${state}`, x: placement.x, y: placement.y, 'data-label-for': key, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
          label.textContent = segment.label; root.append(label);
          return;
        }
        const block = stageBlock(segment, merge, fontScale, compactLabels);
        const label = svg('g', { class: `orbit__label${sideLabels ? ' is-side' : ''}`, 'data-label-for': key,
          transform: sideLabels ? `translate(${cx + radius + 30} ${38 + index * 25})` : `translate(${placement?.x ?? cx} ${(placement?.y ?? cy) - block.height / 2})`,
          'text-anchor': sideLabels ? 'start' : placement?.anchor || 'middle' });
        const title = svg('title'); title.textContent = segment.ariaLabel || [segment.label, segment.value, deltaText(segment.delta)].filter(Boolean).join(' · '); label.append(title);
        if (sideLabels) {
          const text = (className, value, y) => { if (value == null || value === '') return; const row = svg('text', { class: className, x: 0, y }); row.textContent = value; label.append(row); };
          text('orbit__label-name', segment.label || '', -12); text('orbit__label-value', [segment.value, deltaText(segment.delta)].filter(Boolean).join(' · '), 8);
        } else {
          const sign = placement?.anchor === 'end' ? -1 : placement?.anchor === 'start' ? 1 : 0;
          for (const row of block.rows) { const node = svg('text', { class: row.cls, x: sign * row.inset, y: row.y }); node.textContent = row.text; label.append(node); }
        }
        root.append(label);
      }
    });
    if (moveRing && placedLabels.window.windowed) {
      const { before, after } = placedLabels.window;
      const near = (angle, text, anchor) => { const point = polar(cx, cy, MOVE_RADIUS + 14, angle); const node = svg('text', { class: 'orbit__window-count', x: point.x, y: point.y, 'text-anchor': anchor, 'dominant-baseline': 'central' }); node.textContent = text; root.append(node); };
      if (before) near(startAngle - dir * 12, `‹ ${before}`, 'end');
      if (after) near(startAngle + dir * (sweep + 12), `${after} ›`, 'start');
    }
    if (options.caret != null && !mini) {
      const at = Number(options.caret), p = polar(cx, cy, radius, at), p1 = polar(cx, cy, radius + 10, at);
      root.append(svg('line', { class: 'orbit__caret', x1: p.x, y1: p.y, x2: p1.x, y2: p1.y }));
    }
    const clusters = fanned
      ? fanMarkers(markers, { radius, pitch: Math.max(2 * markerR + 4, hitPx * k), maxLanes: 5 }).map(marker => ({ key: String(marker.key), items: [marker], count: 1, angle: marker.angle, radius: marker.radius, trueAngle: marker.trueAngle, lane: marker.lane }))
      : clusterMarkers(markers, Number(options.markerClusterDegrees) || 5);
    for (const cluster of clusters) {
      const p = polar(cx, cy, cluster.radius ?? radius, cluster.angle);
      if (fanned && (cluster.lane > 0 || Math.abs(cluster.angle - cluster.trueAngle) > 0.01)) {
        const origin = polar(cx, cy, radius, cluster.trueAngle);
        root.append(svg('line', { class: 'orbit__marker-leader', x1: origin.x, y1: origin.y, x2: p.x, y2: p.y }), svg('circle', { class: 'orbit__marker-origin', cx: origin.x, cy: origin.y, r: 2.5 * fontScale }));
      }
      const group = svg('g', { class: `orbit__marker-cluster${cluster.count > 1 ? ' is-cluster' : ''}`, transform: `translate(${p.x} ${p.y})`, tabindex: '0', role: 'button', 'aria-label': cluster.count > 1 ? `${cluster.count} markers; activate to inspect facts` : cluster.items[0].label || 'marker', 'data-marker-cluster': cluster.key, 'data-marker-keys': JSON.stringify(cluster.items.map(item => String(item.key ?? item.id ?? ''))) });
      const title = svg('title'); title.textContent = cluster.items.map(item => item.label).filter(Boolean).join(' · ') || `${cluster.count} markers`;
      group.append(title, svg('circle', { class: 'orbit__marker-hit', cx: 0, cy: 0, r: hitRadius }), svg('circle', { class: 'orbit__marker-ring', r: cluster.count > 1 ? markerR + 3 : markerR, fill: cluster.items.some(item => item.type === 'bad' || item.tone === 'bad') ? COLORS.bad : COLORS.good }));
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
    const activeCluster = clusters.find(cluster => this.expandedClusters.has(cluster.key) && cluster.count > 1);
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
      const ratio = rootBox.width / view;
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

  destroy() { this.stopCompletion(); this.resizeObserver?.disconnect(); this.sequence++; this.element.removeEventListener('focusin', this.onFocusIn); this.element.removeEventListener('keydown', this.onEscape); this.element.remove(); }
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
export { arcPath, clusterMarkers, fanMarkers, labelWindow, ORBIT_GEOMETRY, looksLikeMoves, MINI_GLYPH_RANGE, miniGlyphSize, placeLabels, polar, ringLabels, ringLayout } from './geometry.js';
