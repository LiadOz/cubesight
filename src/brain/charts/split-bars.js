// Per-step split bars against your average. Text-heavy, so it's HTML (a CSS
// grid) rather than SVG; bars are divs sized by ratio with an average tick.
//   layout 'rows' (Orbit): label · bar · split · delta, one row per step.
//   layout 'columns' (Mono): one column per step, split big, delta + moves, bar below.
import '../css/charts.css';
import { reconcileChildren } from '../dom.js';

export function createSplitBars(host, { layout = 'rows', onSelect = null } = {}) {
  const root = document.createElement('div');
  root.className = `b-ch-splits is-${layout}`;
  root.setAttribute('role', 'table');
  root.setAttribute('aria-label', 'Split times per step');
  host.append(root);
  // A row (a stage) opens its detail: click anywhere on it, or Enter on its label.
  root.addEventListener('click', event => {
    const row = /** @type {HTMLElement} */ (event.target).closest('.b-ch-split');
    if (row && root.contains(row) && onSelect) onSelect(row.dataset.key);
  });

  return {
    /** @param {import('../types.js').SplitRow[]} rows */
    update(rows = []) {
      const items = rows.map(r => ({ key: r.key, text: '', className: `b-ch-split is-${r.skipped ? 'skip' : r.tone}${r.pseudo ? ' is-pseudo' : ''}${r.merged ? ' is-merged' : ''}` }));
      reconcileChildren(root, items, 'div');
      rows.forEach((r, i) => fillRow(root.children[i], r, layout, Boolean(onSelect)));
    },
    destroy() { root.remove(); },
  };
}

function fillRow(el, r, layout, linked) {
  // Rebuilt per results change only (once per solve), never per move.
  el.setAttribute('role', 'row');
  const pct = v => `${Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)) * 100}%`;
  const label = `${r.label}${r.pseudo ? '*' : ''}`;
  const value = r.skipped ? 'skip' : r.text;
  const bar = document.createElement('span');
  bar.className = 'b-ch-bar';
  const fill = document.createElement('i');
  fill.className = 'b-ch-bar-fill';
  fill.style.width = r.skipped ? '0%' : pct(r.ratio);
  const tick = document.createElement('i');
  tick.className = 'b-ch-bar-avg';
  tick.style.left = pct(r.avgRatio);
  bar.append(fill, tick);
  if (r.skipped) {
    const spark = document.createElement('i');
    spark.className = 'b-ch-bar-spark';
    spark.textContent = '✦';
    bar.append(spark);
  }
  const cell = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; s.setAttribute('role', 'cell'); return s; };
  // The label is a real button when rows open a detail (keyboard and screen readers).
  const labelCell = text => {
    if (!linked) return cell('b-ch-split-label', text);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'b-ch-split-label is-link'; b.textContent = text;
    b.setAttribute('aria-label', `${r.label} detail`);
    return b;
  };
  if (linked) el.classList.add('is-link');
  if (layout === 'columns') {
    const meta = cell('b-ch-split-meta', '');
    const delta = cell(`b-ch-split-delta is-${r.tone}`, r.skipped ? (r.avgMs != null ? `avg ${(r.avgMs / 1000).toFixed(2)}` : '') : r.deltaText);
    const moves = cell('b-ch-split-moves', r.moves != null && !r.skipped ? `${r.moves} mv` : '');
    meta.append(delta, moves);
    el.replaceChildren(labelCell(label), cell('b-ch-split-value', r.skipped ? '✦ skip' : value), meta, bar);
  } else {
    el.replaceChildren(labelCell(label), bar, cell('b-ch-split-value', value), cell(`b-ch-split-delta is-${r.tone}`, r.deltaText));
  }
}
