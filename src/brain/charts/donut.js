// Solve donut: each step's share of the actual solve time, coloured by
// whether it was faster (accent) or slower (ink) than your average. A skipped
// step is a spark on the ring. The centre shows a headline number.
import '../css/charts.css';
import { arcPath, placeLabels, polar, ringLayout } from './arc.js';
import { svg } from '../dom.js';

const S = 300, C = S / 2, R = 92;

export function createDonut(host) {
  const wrap = document.createElement('div');
  wrap.className = 'b-ch-donut';
  const root = svg('svg', { viewBox: `0 0 ${S} ${S}`, role: 'img' });
  const legend = document.createElement('p');
  legend.className = 'b-ch-donut-legend';
  legend.innerHTML = '<span class="is-faster">faster</span><span class="is-slower">slower</span>';
  wrap.append(root, legend);
  host.append(wrap);

  return {
    element: wrap,
    update(donut) {
      root.replaceChildren();
      if (!donut) return;
      const arcs = donut.arcs || [];
      const layout = ringLayout(arcs.map(a => ({ key: a.key, weight: a.tone === 'skip' ? 0.004 : a.fraction })), { gapDeg: 4 });
      root.setAttribute('aria-label', `${donut.centerValue} ${donut.centerLabel}; ${arcs.map(a => a.label).join(', ')}`);
      root.append(svg('circle', { class: 'b-ch-donut-track', cx: C, cy: C, r: R }));
      layout.forEach((l, i) => {
        const a = arcs[i];
        if (a.tone === 'skip') {
          const p = polar(C, C, R, l.mid);
          const g = svg('g', { class: 'b-ch-donut-skip', transform: `translate(${p.x} ${p.y})` });
          g.append(svg('path', { d: 'M0 -6 C1 -2 2 -1 6 0 C2 1 1 2 0 6 C-1 2 -2 1 -6 0 C-2 -1 -1 -2 0 -6 Z' }));
          root.append(g);
        } else {
          root.append(svg('path', { class: `b-ch-donut-arc is-${a.tone}`, d: arcPath(C, C, R, l.a0, l.a1) }));
        }
      });
      const labels = placeLabels(layout.map(l => ({ key: l.key, angle: l.mid })), { cx: C, cy: C, r: R, offset: 22, minGap: 15, top: 10, bottom: S - 6 });
      labels.forEach((p, i) => {
        const t = svg('text', { class: 'b-ch-donut-label', x: p.x, y: p.y + 4, 'text-anchor': p.anchor });
        t.textContent = arcs[i].label;
        root.append(t);
      });
      const value = svg('text', { class: 'b-ch-donut-value', x: C, y: C + 6, 'text-anchor': 'middle' });
      value.textContent = donut.centerValue;
      const label = svg('text', { class: 'b-ch-donut-center-label', x: C, y: C + 28, 'text-anchor': 'middle' });
      label.textContent = donut.centerLabel;
      root.append(value, label);
    },
    destroy() { wrap.remove(); },
  };
}
