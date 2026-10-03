// Orbit inspection: the ring becomes one countdown arc that drains
// anticlockwise back to 12 o'clock (360° = the limit). Past the limit an amber
// arc keeps growing anticlockwise over the +2 zone, then the dashed DNF
// sector. Callout ticks (8 s / 12 s) darken once passed. Unlimited counts up
// one lap per minute on a dotted ring. The big number, the callout echo and
// the overtime meter render into ctx.aside (the right column) when given.

import { arcPath, inspectionAngleAt, polar } from '../../charts/arc.js';
import { reconcileChildren, setAttr, setStyle, setText, svg, toggleClass } from '../../dom.js';
import { CX, CY, R, VIEWBOX } from './geometry.js';

const LAP_MS = 60000;
const OPEN_ZONE_FRACTION = 0.18;   // how far an open-ended (DNF) zone is drawn, as a share of the limit

/** @type {import('../../types.js').ComponentFactory} */
export function createInspectionRing(host, ctx = {}) {
  const root = svg('svg', { class: 'b-oinsp is-hidden', viewBox: VIEWBOX, 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMid meet' });
  const track = svg('circle', { class: 'b-oinsp-track', cx: CX, cy: CY, r: R });
  const zones = svg('g', { class: 'b-oinsp-zones' });
  const ticks = svg('g', { class: 'b-oinsp-ticks' });
  const remaining = svg('path', { class: 'b-oinsp-remaining' });
  const over = svg('path', { class: 'b-oinsp-over' });
  const startTick = svg('line', { class: 'b-oinsp-start', x1: CX, y1: CY - R - 14, x2: CX, y2: CY - R + 14 });
  const dot = svg('g', { class: 'b-oinsp-dot' });
  dot.append(svg('circle', { class: 'b-oinsp-dot-halo', r: 11 }), svg('circle', { class: 'b-oinsp-dot-core', r: 5.5 }));
  const offMark = svg('line', { class: 'b-oinsp-off', x1: CX - 14, y1: CY, x2: CX + 14, y2: CY });
  root.append(track, zones, remaining, over, ticks, startTick, offMark, dot);
  host.append(root);

  const aside = ctx.aside ? buildAside(ctx.aside) : null;

  let insp = null;          // last InspectionVM
  let structureKey = '';
  const tickEls = new Map();

  function buildStructure(i) {
    zones.replaceChildren();
    ticks.replaceChildren();
    tickEls.clear();
    const limit = i.limitMs;
    if (limit) {
      for (const z of i.zones || []) {
        if (z.kind === 'normal' || z.fromMs < limit) continue;
        const to = z.toMs ?? z.fromMs + limit * OPEN_ZONE_FRACTION;
        const a0 = inspectionAngleAt(to, limit), a1 = inspectionAngleAt(z.fromMs, limit);
        const g = svg('g', { class: `b-oinsp-zone is-${z.kind}` });
        g.append(svg('path', { class: 'b-oinsp-zone-arc', d: arcPath(CX, CY, R, a0, a1) }));
        const edge = polar(CX, CY, R, a1);
        const inner = polar(CX, CY, R - 13, a1), outer = polar(CX, CY, R + 13, a1);
        if (z.kind === 'dnf' || z.kind === 'plus2') g.append(svg('line', { class: 'b-oinsp-zone-edge', x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y, 'data-x': edge.x }));
        const mid = polar(CX, CY, R + 40, (a0 + a1) / 2);
        const anchor = (a0 + a1) / 2 > 180 ? 'end' : 'start';
        const label = svg('text', { class: 'b-oinsp-zone-label', x: mid.x, y: mid.y - 6, 'text-anchor': anchor });
        const title = z.kind === 'plus2' ? '+2 zone' : z.kind === 'dnf' ? 'DNF' : z.kind === 'grace' ? 'grace' : '';
        const sub = z.kind === 'dnf' ? `after ${z.fromMs / 1000} s` : z.toMs != null ? `${z.fromMs / 1000} – ${z.toMs / 1000} s` : '';
        label.append(svg('tspan', { x: mid.x, class: 'b-oinsp-zone-title' }), svg('tspan', { x: mid.x, dy: 16, class: 'b-oinsp-zone-sub' }));
        label.children[0].textContent = title;
        label.children[1].textContent = sub;
        if (title) g.append(label);
        zones.append(g);
      }
      for (const t of i.ticks || []) {
        if (t.kind === 'limit') continue;
        const a = inspectionAngleAt(t.atMs, limit);
        const len = t.kind === 'callout' ? 16 : 8;
        const p0 = polar(CX, CY, R - len, a), p1 = polar(CX, CY, R + len, a);
        const g = svg('g', { class: `b-oinsp-tick is-${t.kind}` });
        g.append(svg('line', { x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y }));
        if (t.label) {
          const lp = polar(CX, CY, R + (t.kind === 'callout' ? 38 : 26), a);
          const anchor = a > 200 && a < 340 ? 'end' : a > 20 && a < 160 ? 'start' : 'middle';
          const text = svg('text', { x: lp.x, y: lp.y + 5, 'text-anchor': anchor, class: 'b-oinsp-tick-label' });
          text.textContent = t.kind === 'callout' ? `“${t.label}”` : t.label;
          g.append(text);
        }
        ticks.append(g);
        tickEls.set(`${t.kind}:${t.atMs}`, g);
      }
    }
    // Scale ticks (every second) as faint minute marks.
    const scaleTicks = svg('g', { class: 'b-oinsp-scale' });
    const count = limit ? Math.round(limit / 1000) : 12;
    for (let k = 1; k < count; k++) {
      const a = (360 / count) * k;
      const p0 = polar(CX, CY, R - 18, a), p1 = polar(CX, CY, R - 13, a);
      scaleTicks.append(svg('line', { x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y }));
    }
    ticks.prepend(scaleTicks);
  }

  function paint(i, live) {
    const limit = i.limitMs;
    const elapsed = live?.elapsedMs ?? i.elapsedMs ?? 0;
    const overtimeMs = live?.overtimeMs ?? i.overtimeMs ?? 0;
    const unlimited = !limit && i.mode !== 'off';
    toggleClass(root, 'is-unlimited', unlimited);
    toggleClass(root, 'is-off', i.mode === 'off');
    const inOver = Boolean(limit) && overtimeMs > 0;
    toggleClass(root, 'is-over', inOver);
    toggleClass(root, 'is-penalty', Boolean(i.penalty) || live?.tone === 'error');
    toggleClass(root, 'is-dnf', i.penalty === 'DNF');
    for (const kind of ['wca', 'count', 'grace', 'autostart']) toggleClass(root, `is-overtime-${kind}`, i.overtime === kind);
    let dotAngle = null;
    if (i.mode === 'off') {
      setAttr(remaining, 'd', ''); setAttr(over, 'd', '');
    } else if (unlimited) {
      const lap = (elapsed % LAP_MS) / LAP_MS * 360;
      setAttr(remaining, 'd', arcPath(CX, CY, R, 0, Math.max(0.6, lap)));
      setAttr(over, 'd', '');
      dotAngle = lap;
    } else {
      const remDeg = Math.max(0, (limit - elapsed) / limit * 360);
      setAttr(remaining, 'd', remDeg > 0.3 ? arcPath(CX, CY, R, 0, remDeg) : '');
      if (inOver) {
        const overDeg = Math.min(359.4, overtimeMs / limit * 360);
        setAttr(over, 'd', arcPath(CX, CY, R, 360 - overDeg, 360));
        dotAngle = 360 - overDeg;
      } else {
        setAttr(over, 'd', '');
        dotAngle = remDeg;
      }
    }
    toggleClass(dot, 'is-hidden', dotAngle == null);
    if (dotAngle != null) {
      const p = polar(CX, CY, R, dotAngle);
      setAttr(dot, 'transform', `translate(${p.x} ${p.y})`);
    }
    for (const t of i.ticks || []) {
      const el = tickEls.get(`${t.kind}:${t.atMs}`);
      if (el) toggleClass(el, 'is-passed', elapsed >= t.atMs);
    }
    if (aside) paintAside(aside, i, live, { elapsed, overtimeMs, inOver });
  }

  return {
    update(vm) {
      const i = vm.screen === 'inspection' ? vm.inspection : null;
      toggleClass(root, 'is-hidden', !i);
      if (aside) toggleClass(aside.root, 'is-hidden', !i);
      if (!i) { insp = null; return; }
      const key = [i.mode, i.overtime, i.limitMs, i.scaleMs, JSON.stringify(i.zones), JSON.stringify((i.ticks || []).map(t => [t.kind, t.atMs, t.label]))].join('|');
      if (key !== structureKey) { buildStructure(i); structureKey = key; }
      insp = i;
      paint(i, null);
    },
    frame(f) {
      if (!insp || !f?.inspection) return;
      paint(insp, f.inspection);
    },
    destroy() { root.remove(); aside?.root.remove(); },
  };
}

function buildAside(parent) {
  const root = document.createElement('div');
  root.className = 'b-oinsp-aside is-hidden';
  root.innerHTML = `
    <p class="b-oinsp-eyebrow"></p>
    <p class="b-oinsp-sentence"></p>
    <p class="b-oinsp-best"></p>
    <p class="b-oinsp-big"><span class="b-oinsp-num"></span><span class="b-oinsp-unit"></span></p>
    <p class="b-oinsp-callout"><i aria-hidden="true"></i><span class="b-oinsp-callout-text"></span><span class="b-oinsp-callout-at"></span></p>
    <div class="b-oinsp-meter" hidden>
      <p class="b-oinsp-inspected"></p>
      <div class="b-oinsp-bar"><i class="b-oinsp-bar-fill"></i><i class="b-oinsp-bar-dnf"></i></div>
      <div class="b-oinsp-bar-labels"></div>
      <p class="b-oinsp-penalty-head">penalty if you start now</p>
      <p class="b-oinsp-penalty"><b class="b-oinsp-penalty-now"></b><span class="b-oinsp-penalty-next"></span></p>
      <p class="b-oinsp-rules"></p>
    </div>`;
  parent.append(root);
  const $ = sel => root.querySelector(sel);
  return {
    root,
    eyebrow: $('.b-oinsp-eyebrow'), sentence: $('.b-oinsp-sentence'), num: $('.b-oinsp-num'), unit: $('.b-oinsp-unit'),
    bestStart: $('.b-oinsp-best'),
    callout: $('.b-oinsp-callout'), calloutText: $('.b-oinsp-callout-text'), calloutAt: $('.b-oinsp-callout-at'),
    meter: $('.b-oinsp-meter'), inspected: $('.b-oinsp-inspected'), barFill: $('.b-oinsp-bar-fill'), barLabels: $('.b-oinsp-bar-labels'),
    penaltyNow: $('.b-oinsp-penalty-now'), penaltyNext: $('.b-oinsp-penalty-next'), rules: $('.b-oinsp-rules'),
  };
}

function paintAside(a, i, live, { elapsed, overtimeMs, inOver }) {
  const tone = live?.tone || i.tone || 'accent';
  const limit = i.limitMs;
  setText(a.eyebrow, inOver ? 'overtime' : i.mode === 'unlimited' ? 'inspection · unlimited' : 'inspection');
  a.eyebrow.className = `b-oinsp-eyebrow is-${inOver ? 'warn' : 'accent'}`;
  setText(a.sentence, (live?.consequence ?? i.consequence) || 'the solve clock starts on your first turn.');
  setText(a.bestStart, i.bestStart || '');
  toggleClass(a.bestStart, 'is-hidden', !i.bestStart);
  setText(a.num, live?.bigText ?? i.bigText);
  a.num.parentElement.className = `b-oinsp-big is-${tone}`;
  setText(a.unit, !inOver && limit && !/^[+−-]/.test(live?.bigText ?? i.bigText) ? 's left' : '');
  const called = i.callout ?? (i.ticks || []).filter(t => t.kind === 'callout' && elapsed >= t.atMs).map(t => Number.parseInt(t.label, 10)).pop() ?? null;
  toggleClass(a.callout, 'is-hidden', !called || inOver);
  setText(a.calloutText, called ? `“${called} seconds”` : '');
  setText(a.calloutAt, called ? `called at ${called.toFixed(2)}` : '');
  const plus2 = (i.zones || []).find(z => z.kind === 'plus2');
  const dnf = (i.zones || []).find(z => z.kind === 'dnf');
  const grace = (i.zones || []).find(z => z.kind === 'grace');
  const showMeter = inOver && limit;
  a.meter.hidden = !showMeter;
  if (!showMeter) return;
  setText(a.inspected, `${(elapsed / 1000).toFixed(1)} s inspected`);
  const end = (dnf?.fromMs ?? plus2?.toMs ?? grace?.toMs ?? limit + 2000);
  const span = Math.max(1, end - limit);
  setStyle(a.barFill, 'width', `${Math.min(1, overtimeMs / span) * 60}%`);   // the penalty zone is the first 60 % of the bar
  const labels = [
    { key: 'a', text: `${limit / 1000} s`, className: 'b-oinsp-bar-label' },
    { key: 'b', text: `${end / 1000} s`, className: 'b-oinsp-bar-label is-mid' },
    { key: 'c', text: dnf ? 'DNF' : '', className: 'b-oinsp-bar-label is-dnf' },
  ];
  reconcileChildren(a.barLabels, labels, 'span');
  const penalty = i.penalty ?? (plus2 && elapsed >= plus2.fromMs ? '+2' : null);
  setText(a.penaltyNow, penalty || (i.overtime === 'count' ? `+${Math.floor(overtimeMs / 1000)}` : 'none'));
  a.penaltyNow.className = `b-oinsp-penalty-now is-${penalty === 'DNF' ? 'dnf' : penalty ? 'warn' : 'muted'}`;
  const dnfIn = dnf ? Math.max(0, dnf.fromMs - elapsed) : null;
  setText(a.penaltyNext, dnfIn != null && penalty !== 'DNF' ? `DNF in ${(dnfIn / 1000).toFixed(1)} s` : '');
  setText(a.rules, i.overtime === 'wca' ? 'rules: WCA. change to count-only or grace in settings.'
    : i.overtime === 'count' ? 'count only: logged, never penalised.'
    : i.overtime === 'grace' ? 'grace period, then your chosen penalty.' : '');
}
