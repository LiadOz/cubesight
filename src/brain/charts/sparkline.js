// Recent-history sparkline: one point per solve. +2 is an amber dot, a DNF a
// red cross at the top, the personal best a hollow ring, the current solve a
// filled accent dot. A small legend explains the marks.
import '../css/charts.css';
import { svg } from '../dom.js';

const W = 220, H = 64, PAD = 8;

export function createSparkline(host) {
  const wrap = document.createElement('div');
  wrap.className = 'b-ch-spark';
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  const legend = document.createElement('p');
  legend.className = 'b-ch-spark-legend';
  wrap.append(root, legend);
  host.append(wrap);

  return {
    update(spark) {
      root.replaceChildren();
      const points = spark?.points || [];
      if (!points.length) { legend.textContent = ''; return; }
      const timed = points.filter(p => p.ms != null && Number.isFinite(p.ms));
      const min = spark.min ?? Math.min(...timed.map(p => p.ms));
      const max = spark.max ?? Math.max(...timed.map(p => p.ms));
      const n = points.length;
      const x = i => PAD + (n > 1 ? i / (n - 1) : 0.5) * (W - 2 * PAD);
      const y = ms => (max > min ? PAD + (1 - (ms - min) / (max - min)) * (H - 2 * PAD) : H / 2);
      const line = points.map((p, i) => (p.ms != null && Number.isFinite(p.ms) && p.kind !== 'dnf' ? `${x(i).toFixed(1)},${y(p.ms).toFixed(1)}` : null)).filter(Boolean);
      root.setAttribute('aria-label', `Last ${n} solves`);
      root.append(svg('polyline', { class: 'b-ch-spark-line', points: line.join(' ') }));
      points.forEach((p, i) => {
        if (p.kind === 'dnf') {
          const cx = x(i), cy = PAD + 2;
          const g = svg('g', { class: 'b-ch-spark-dnf' });
          g.append(svg('line', { x1: cx - 4, y1: cy - 4, x2: cx + 4, y2: cy + 4 }), svg('line', { x1: cx - 4, y1: cy + 4, x2: cx + 4, y2: cy - 4 }));
          root.append(g);
        } else if (p.kind !== 'normal' && p.ms != null) {
          root.append(svg('circle', { class: `b-ch-spark-dot is-${p.kind}`, cx: x(i), cy: y(p.ms), r: p.kind === 'current' ? 4 : 3.2 }));
        }
      });
      legend.replaceChildren();
      const add = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; legend.append(s); };
      add('b-ch-spark-n', `last ${n}`);
      if (points.some(p => p.kind === 'pb')) add('is-pb', 'pb');
      if (points.some(p => p.kind === 'plus2')) add('is-plus2', '+2');
      if (points.some(p => p.kind === 'dnf')) add('is-dnf', 'dnf');
    },
    destroy() { wrap.remove(); },
  };
}
