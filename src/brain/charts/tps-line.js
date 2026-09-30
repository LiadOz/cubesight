// Turns-per-second over the solve, with your average as a reference line and
// the solve's steps as alternating bands. SVG, coloured only through CSS
// classes (charts.css), so a theme switch needs no redraw.
//   variant 'orbit': filled area, flat dashed average, step names on top, time axis.
//   variant 'mono':  line only, stepped average per step, step names below.
import '../css/charts.css';
import { svg } from '../dom.js';
import { fitBandLabels } from './band-labels.js';

const BASE_W = 560, BASE_H = 250;
const PAD = { l: 30, r: 8, t: 26, b: 26 };

/** Smooth path through points (Catmull-Rom to cubic Bézier), y clamped to the plot. */
export function smoothPath(pts, yMin, yMax) {
  if (!pts.length) return '';
  const c = v => Math.min(yMax, Math.max(yMin, v));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: c(p1.y + (p2.y - p0.y) / 6) };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: c(p2.y - (p3.y - p1.y) / 6) };
    d += ` C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function createTpsLine(host, { variant = 'orbit', onSelect = null } = {}) {
  // Mono gives the chart a full-width slot (A-08); Orbit a middle column (C-08).
  const W = variant === 'mono' ? 860 : BASE_W, H = variant === 'mono' ? 290 : BASE_H;
  const root = svg('svg', { class: `b-ch-tps is-${variant}`, viewBox: `0 0 ${W} ${H}`, role: 'img' });
  host.append(root);

  return {
    /** @param {import('../types.js').TpsSeries} series */
    update(series, { drawIn = false, markers = [] } = {}) {
      root.replaceChildren();
      if (!series || !series.durationMs) return;
      const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
      const maxTps = Math.max(2, Math.ceil((series.maxTps || 0) / 2) * 2);
      const x = t => PAD.l + (t / series.durationMs) * plotW;
      const y = v => PAD.t + plotH - (Math.max(0, v) / maxTps) * plotH;
      const label = `Turns per second over ${(series.durationMs / 1000).toFixed(2)} s`;
      root.setAttribute('aria-label', label);

      const bands = svg('g', { class: 'b-ch-bands' });
      const bandList = series.bands || [];
      const names = fitBandLabels(bandList.map(b => ({ label: b.label, short: b.short, from: x(b.fromMs), to: x(b.toMs) })));
      bandList.forEach((b, i) => {
        const rect = svg('rect', { class: `b-ch-band${i % 2 ? ' is-alt' : ''}`, x: x(b.fromMs), y: PAD.t, width: Math.max(0, x(b.toMs) - x(b.fromMs)), height: plotH, 'data-key': b.key });
        const title = svg('title');
        title.textContent = b.label;
        rect.append(title);
        if (onSelect) { rect.classList.add('is-link'); rect.addEventListener('click', () => onSelect('stage', b.key)); }
        bands.append(rect);
        if (!names[i]) return;
        const t = svg('text', { class: 'b-ch-band-label', x: (x(b.fromMs) + x(b.toMs)) / 2, y: variant === 'orbit' ? PAD.t - 9 : H - 7, 'text-anchor': 'middle' });
        t.textContent = names[i];
        bands.append(t);
      });
      root.append(bands);

      const grid = svg('g', { class: 'b-ch-grid' });
      for (let v = 0; v <= maxTps; v += 2) {
        grid.append(svg('line', { x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v) }));
        const t = svg('text', { class: 'b-ch-axis', x: PAD.l - 8, y: y(v) + 4, 'text-anchor': 'end' });
        t.textContent = String(v);
        grid.append(t);
      }
      if (variant === 'orbit') {
        const step = series.durationMs > 20000 ? 5000 : 2000;
        for (let t = 0; t <= series.durationMs + 1; t += step) {
          const tx = svg('text', { class: 'b-ch-axis', x: x(t), y: H - 7, 'text-anchor': 'middle' });
          tx.textContent = `${Math.round(t / 1000)}s`;
          grid.append(tx);
        }
      }
      root.append(grid);

      // Your average: flat dashed (orbit) or stepped per step (mono).
      if (variant === 'orbit' && series.avgFlat != null) {
        root.append(svg('line', { class: 'b-ch-avg', x1: PAD.l, x2: W - PAD.r, y1: y(series.avgFlat), y2: y(series.avgFlat) }));
      } else if ((series.avg || []).length) {
        // Skip empty steps (a skipped stage has no duration) so the line doesn't drop to 0.
        const steps = series.avg.filter(s => s.toMs > s.fromMs && Number.isFinite(s.tps) && s.tps > 0);
        let d = '';
        steps.forEach((s, i) => { d += `${i ? ' L' : 'M'} ${x(s.fromMs).toFixed(1)} ${y(s.tps).toFixed(1)} L ${x(s.toMs).toFixed(1)} ${y(s.tps).toFixed(1)}`; });
        root.append(svg('path', { class: 'b-ch-avg', d }));
      }

      const pts = (series.points || []).map(p => ({ x: x(p.tMs), y: y(p.tps) }));
      const line = smoothPath(pts, PAD.t, PAD.t + plotH);
      if (line && variant === 'orbit') {
        const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${y(0)} L ${pts[0].x.toFixed(1)} ${y(0)} Z`;
        root.append(svg('path', { class: 'b-ch-area', d: area }));
      }
      if (line) root.append(svg('path', { class: `b-ch-line${drawIn ? ' is-drawing' : ''}`, d: line, pathLength: 1 }));

      const useMarkers = markers.length > 0;
      for (const m of useMarkers ? [] : series.marks || []) {
        const g = svg('g', { class: `b-ch-mark is-${m.kind}` });
        if (m.kind === 'pause') {
          const p = nearest(series.points, m.tMs);
          const cy = p ? y(p.tps) : y(0);
          g.append(svg('circle', { cx: x(m.tMs), cy, r: 4.5 }));
          const t = svg('text', { x: x(m.tMs), y: cy + 22, 'text-anchor': 'middle' });
          t.textContent = m.label;
          g.append(t);
        } else {
          g.append(svg('path', { d: 'M0 -6 C1 -2 2 -1 6 0 C2 1 1 2 0 6 C-1 2 -2 1 -6 0 C-2 -1 -1 -2 0 -6 Z', transform: `translate(${x(m.tMs)} ${variant === 'orbit' ? PAD.t - 13 : H - 11})` }));
        }
        root.append(g);
      }
      // Coach markers (the review): a dot on the line at the moment, big when it matters, small otherwise.
      const layer = svg('g', { class: 'b-ch-markers' });
      for (const m of markers.slice().sort((a, b) => Number(a.prominent) - Number(b.prominent) || Number(a.selected) - Number(b.selected))) {
        const p = nearest(series.points, m.tMs);
        const g = svg('g', { class: `b-mk is-${m.tone} ${m.prominent ? 'is-prominent' : 'is-small'}${m.selected ? ' is-selected' : ''}`, transform: `translate(${x(m.tMs)} ${p ? y(p.tps) : y(0)})`, role: 'button', tabindex: 0, 'aria-label': `${m.label}, ${m.stageLabel}`, 'data-marker': m.id });
        const title = svg('title');
        title.textContent = `${m.label} · ${m.stageLabel} · ${m.costText}`;
        g.append(title, svg('circle', { class: 'b-mk-hit', r: 11 }), svg('circle', { class: 'b-mk-dot', r: m.prominent ? 6 : 3.8 }));
        g.addEventListener('click', () => onSelect?.('marker', m.id));
        g.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.('marker', m.id); } });
        layer.append(g);
      }
      root.append(layer);
    },
    destroy() { root.remove(); },
  };
}

function nearest(points = [], t) {
  let best = null;
  for (const p of points) if (!best || Math.abs(p.tMs - t) < Math.abs(best.tMs - t)) best = p;
  return best;
}
