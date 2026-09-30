// Stand-ins for the shared charts (src/brain/charts/*, built separately) so the
// Mono results can be built and screenshotted now. Same API as types.js:
//   createTpsLine(host, {variant}) -> {update(series, {drawIn}), destroy}
//   createSplitBars(host, {layout}) -> {update(rows), destroy}
//   createSparkline(host) -> {update(spark), destroy}
// When the real charts land, change the import in results-mono.js and delete
// this file.

import { svg } from '../../dom.js';

const W = 820;
const H = 290;
const PAD = { l: 36, r: 4, t: 18, b: 30 };

function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function createTpsLine(host, { variant = 'mono' } = {}) {
  const root = svg('svg', { class: `c-tps c-tps-${variant}`, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Turns per second over the solve' });
  host.append(root);
  return {
    update(series) {
      root.replaceChildren();
      const x = t => PAD.l + (t / series.durationMs) * (W - PAD.l - PAD.r);
      const y = v => PAD.t + (1 - v / series.maxTps) * (H - PAD.t - PAD.b);
      series.bands.forEach((band, i) => {
        root.append(svg('rect', { class: i % 2 ? 'c-band c-band-alt' : 'c-band', x: x(band.fromMs), y: PAD.t, width: Math.max(0, x(band.toMs) - x(band.fromMs)), height: H - PAD.t - PAD.b }));
        const label = svg('text', { class: 'c-axis-label', x: (x(band.fromMs) + x(band.toMs)) / 2, y: H - 8, 'text-anchor': 'middle' });
        label.textContent = band.label;
        root.append(label);
      });
      for (let v = 0; v <= series.maxTps; v += 2) {
        root.append(svg('line', { class: 'c-grid', x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v) }));
        const t = svg('text', { class: 'c-axis-label', x: PAD.l - 10, y: y(v) + 4, 'text-anchor': 'end' });
        t.textContent = String(v);
        root.append(t);
      }
      const avg = series.avg.map(a => `M${x(a.fromMs)},${y(a.tps)} H${x(a.toMs)}`).join(' ');
      const pts = series.points.map(p => [x(p.tMs), y(p.tps)]);
      const line = smoothPath(pts);
      root.append(svg('path', { class: 'c-area', d: `${line} L${pts.at(-1)[0]},${y(0)} L${pts[0][0]},${y(0)} Z` }));
      root.append(svg('path', { class: 'c-avg', d: avg }));
      root.append(svg('path', { class: 'c-line', d: line }));
      for (const mark of series.marks) {
        if (mark.kind === 'pause') {
          const near = series.points.reduce((a, b) => (Math.abs(b.tMs - mark.tMs) < Math.abs(a.tMs - mark.tMs) ? b : a));
          root.append(svg('circle', { class: 'c-pause', cx: x(near.tMs), cy: y(near.tps), r: 4.5 }));
          const t = svg('text', { class: 'c-pause-label', x: x(near.tMs), y: y(near.tps) + 26, 'text-anchor': 'middle' });
          t.textContent = mark.label;
          root.append(t);
        } else {
          const t = svg('text', { class: 'c-skip', x: x(mark.tMs), y: H - 8, 'text-anchor': 'middle' });
          t.textContent = '✦';
          root.append(t);
        }
      }
    },
    destroy() { root.remove(); },
  };
}

export function createSplitBars(host, { layout = 'columns' } = {}) {
  const root = document.createElement('div');
  root.className = `c-splits c-splits-${layout}`;
  host.append(root);
  return {
    update(rows) {
      root.replaceChildren(...rows.map(row => {
        const item = document.createElement('div');
        item.className = 'c-split';
        item.dataset.tone = row.tone;
        toggle(item, 'is-skipped', row.skipped);
        toggle(item, 'is-pseudo', row.pseudo);
        const bar = `<span class="c-split-bar"><i style="width:${Math.min(100, row.ratio * 100).toFixed(1)}%"></i><b style="left:${Math.min(100, row.avgRatio * 100).toFixed(1)}%"></b></span>`;
        item.innerHTML = layout === 'columns'
          ? `<span class="c-split-label"></span><span class="c-split-value"></span><span class="c-split-meta"><span class="c-split-delta"></span><span class="c-split-moves"></span></span>${row.skipped ? '' : bar}`
          : `<span class="c-split-label"></span>${row.skipped ? '<span class="c-split-bar c-split-skip">✦ skip</span>' : bar}<span class="c-split-value"></span>`;
        item.querySelector('.c-split-label').textContent = row.label;
        item.querySelector('.c-split-value').textContent = row.skipped && layout === 'columns' ? '✦ skip' : row.skipped ? '' : row.text;
        if (layout === 'columns') {
          item.querySelector('.c-split-delta').textContent = row.deltaText;
          item.querySelector('.c-split-moves').textContent = row.moves ? `${row.moves} mv` : '';
        }
        return item;
      }));
    },
    destroy() { root.remove(); },
  };
}

function toggle(node, name, on) { node.classList.toggle(name, Boolean(on)); }

export function createSparkline(host) {
  const root = svg('svg', { class: 'c-spark', viewBox: '0 0 440 80', role: 'img', 'aria-label': 'Recent solves' });
  host.append(root);
  return {
    update(spark) {
      root.replaceChildren();
      const n = spark.points.length;
      const x = i => 4 + (i / Math.max(1, n - 1)) * 432;
      const y = ms => 6 + (1 - (ms - spark.min) / (spark.max - spark.min)) * 60;
      const timed = spark.points.filter(p => p.ms != null);
      root.append(svg('polyline', { class: 'c-spark-line', points: timed.map(p => `${x(p.i).toFixed(1)},${y(p.ms).toFixed(1)}`).join(' ') }));
      for (const p of spark.points) {
        if (p.kind === 'dnf') {
          const t = svg('text', { class: 'c-spark-dnf', x: x(p.i), y: 72, 'text-anchor': 'middle' });
          t.textContent = '×';
          root.append(t);
        } else if (p.kind !== 'normal') {
          root.append(svg('circle', { class: `c-spark-dot c-spark-${p.kind}`, cx: x(p.i), cy: y(p.ms), r: p.kind === 'current' ? 4 : 3.5 }));
        }
      }
    },
    destroy() { root.remove(); },
  };
}
