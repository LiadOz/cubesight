/* global document, location, URLSearchParams, requestAnimationFrame */
// Shared helpers for the widget proposal prototypes (no app code, no dependencies).
export const q = new URLSearchParams(location.search);
export const theme = q.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.lang = 'en';

const stickerVar = c => `var(--b-st-${c})`;

/** Isometric cube like the A frames (white top, green front-left, red right). cx, cy = centre; s = edge. */
export function cubeSVG(cx, cy, s, { top = 'w', left = 'g', right = 'r', dim = 1 } = {}) {
  const c30 = Math.cos(Math.PI / 6), s30 = 0.5;
  const L = [-c30 * s, -s30 * s], Rv = [c30 * s, -s30 * s], D = [0, s];
  const P0 = [cx, cy];
  const add = (...v) => v.reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);
  const mul = (v, m) => [v[0] * m, v[1] * m];
  const P = p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const pt = {
    U: (a, b) => add(P0, mul(L, 1 - a), mul(Rv, b)),
    F: (a, d) => add(P0, mul(L, 1 - a), mul(D, d)),
    R: (a, d) => add(P0, mul(Rv, a), mul(D, d)),
  };
  const hex = [add(P0, L), add(P0, L, Rv), add(P0, Rv), add(P0, Rv, D), add(P0, D), add(P0, L, D)];
  const col = { U: top, F: left, R: right };
  const shade = { U: 0, F: 0.16, R: 0.32 };
  let out = `<g opacity="${dim}"><ellipse cx="${cx}" cy="${cy + s * 0.95}" rx="${s * 1.05}" ry="${s * 0.16}" fill="var(--b-cube-shadow)"/>`;
  out += `<polygon points="${hex.map(P).join(' ')}" fill="var(--b-cube-body)" stroke="var(--b-cube-body)" stroke-width="${s * 0.03}" stroke-linejoin="round"/>`;
  const g = 0.09 / 3;
  for (const f of ['U', 'F', 'R']) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      let quad;
      if (f === 'U') {
        const b0 = (2 - r) / 3, b1 = (3 - r) / 3, a0 = c / 3, a1 = (c + 1) / 3;
        quad = [pt.U(a0 + g, b0 + g), pt.U(a1 - g, b0 + g), pt.U(a1 - g, b1 - g), pt.U(a0 + g, b1 - g)];
      } else {
        const a0 = c / 3, a1 = (c + 1) / 3, d0 = r / 3, d1 = (r + 1) / 3;
        quad = [pt[f](a0 + g, d0 + g), pt[f](a1 - g, d0 + g), pt[f](a1 - g, d1 - g), pt[f](a0 + g, d1 - g)];
      }
      const pts = quad.map(P).join(' ');
      out += `<polygon points="${pts}" fill="${stickerVar(col[f])}" stroke="${stickerVar(col[f])}" stroke-width="${s * 0.018}" stroke-linejoin="round"/>`;
      if (shade[f]) out += `<polygon points="${pts}" fill="#000" fill-opacity="${shade[f]}"/>`;
    }
  }
  return out + '</g>';
}

const rad = d => (d - 90) * Math.PI / 180;
export const polar = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
export function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** A simplified open orbit (gap at the bottom). segs = [{a0,a1,tone}] in degrees (0 = top). */
export function orbitSVG({ cx = 720, cy = 440, r = 300, segs = [], markers = [], full = false, spin = false, w = 1440, h = 900, extra = '' }) {
  const stroke = { done: ['var(--b-fill)', 6], good: ['var(--b-good)', 6], warn: ['var(--b-warn)', 6], future: ['var(--b-track)', 3], live: ['var(--b-fill-live)', 8] };
  let body = '';
  if (full) {
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--b-track)" stroke-width="3"/>`;
    if (spin) body += `<path d="${arcPath(cx, cy, r, -40, 80)}" fill="none" stroke="var(--b-fill-live)" stroke-width="8" stroke-linecap="round"/>`;
  } else {
    for (const s of segs) {
      const [c, wd] = stroke[s.tone] || stroke.future;
      body += `<path d="${arcPath(cx, cy, r, s.a0, s.a1)}" fill="none" stroke="${c}" stroke-width="${wd}" stroke-linecap="round"/>`;
    }
    for (const m of markers) {
      const [x, y] = polar(cx, cy, r, m.a);
      const col = m.tone === 'warn' ? 'var(--b-warn)' : 'var(--b-good)';
      body += `<circle cx="${x}" cy="${y}" r="10" fill="var(--b-bg)" stroke="${col}" stroke-width="2.5"/>`;
      body += m.tone === 'warn'
        ? `<text x="${x}" y="${y + 4}" text-anchor="middle" font-family="var(--b-font-mono)" font-size="12" font-weight="500" fill="${col}">!</text>`
        : `<path d="M${x} ${y - 5}L${x + 1.6} ${y - 1.6}L${x + 5} ${y}L${x + 1.6} ${y + 1.6}L${x} ${y + 5}L${x - 1.6} ${y + 1.6}L${x - 5} ${y}L${x - 1.6} ${y - 1.6}Z" fill="${col}"/>`;
    }
  }
  return `<svg class="stage-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}${extra}</svg>`;
}

/** The A-05 results orbit: stage arcs with good and warn markers (labels reduced to the few that matter). */
export const resultsSegs = [
  { a0: -145, a1: -125, tone: 'warn' }, { a0: -121, a1: -92, tone: 'good' }, { a0: -88, a1: -58, tone: 'done' },
  { a0: -54, a1: -30, tone: 'done' }, { a0: -26, a1: 0, tone: 'done' }, { a0: 4, a1: 36, tone: 'done' },
  { a0: 40, a1: 84, tone: 'good' }, { a0: 88, a1: 116, tone: 'done' }, { a0: 120, a1: 145, tone: 'done' },
];
export const resultsMarkers = [{ a: -135, tone: 'warn' }, { a: -106, tone: 'good' }, { a: 80, tone: 'good' }];
export const idleSegs = Array.from({ length: 8 }, (_, i) => ({ a0: -145 + i * 36.5, a1: -145 + i * 36.5 + 33, tone: 'future' }));

export function header({ active = 'solve', chip = 'GAN 356 i3 · 84%', dot = '' } = {}) {
  const nav = ['solve', 'drills', 'algs', 'progress', 'history'].map(n => `<span class="${n === active ? 'on' : ''}">${n}</span>`).join('');
  return `<div class="hdr"><span class="word">cubesight</span><nav>${nav}</nav><span class="chip-cube" data-chip><i class="dot ${dot}"></i>${chip}</span></div>`;
}

/** Mount an artboard in the .brain scope with a title strip and a numbered legend. */
export function mount({ id, name, frame, legend = [], cols = 2, width }) {
  const items = legend.map((t, i) => `<div><span class="n">${i + 1}</span>${t}</div>`).join('');
  document.body.innerHTML = `<div class="brain" data-brain-style="orbit" id="board" style="width:${width || 1440}px">
    <div class="board-title"><span class="board-id">${id}</span><span class="board-name">${name}</span><span class="board-theme">orbit ${theme}</span></div>
    ${frame}
    ${legend.length && q.get('legend') !== '0' ? `<div class="legend" style="--legend-cols:${cols}">${items}</div>` : ''}
  </div>`;
  document.fonts.ready.then(() => requestAnimationFrame(() => { placeCallouts(); document.body.dataset.ready = '1'; }));
}

/** Put a numbered badge on every [data-co="n"] element (top-right corner unless data-co-side says otherwise). */
export function placeCallouts() {
  const board = document.getElementById('board');
  const base = board.getBoundingClientRect();
  document.querySelectorAll('[data-co]').forEach(el => {
    for (const n of el.dataset.co.split(',')) {
      const r = el.getBoundingClientRect();
      const b = document.createElement('span');
      b.className = 'co';
      b.textContent = n;
      const side = el.dataset.coSide || 'tr';
      const small = r.width < 70 && r.height < 40;   // tiny targets (keycaps): keep the badge clear of them
      const left = side.includes('l');
      const x = left ? r.left - base.left - 30 : r.right - base.left - (small ? 4 : 12);
      const y = left ? r.top - base.top + r.height / 2 - 11 : side.includes('b') ? r.bottom - base.top - 12 : r.top - base.top - (small ? 26 : 10);
      b.style.left = `${x}px`; b.style.top = `${y}px`;
      board.appendChild(b);
    }
  });
}
