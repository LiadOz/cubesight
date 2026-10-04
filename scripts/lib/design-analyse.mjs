// Turns the thirteen orbit-v3 direction-A SVG frames into plain data.
// Everything numeric is measured from the SVG source; nothing is invented.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseSvg, parseArc, groupOffset, groupOpacity } from './svg-parse.mjs';
import { COLOR_ROLES, STICKER_FAMILIES, TYPE_ROLES, SEGMENT_ROLES, FRAME_TITLES, ANCHOR_NAMES } from './design-roles.mjs';

const RAD = Math.PI / 180;
export const r2 = (v) => { const x = Math.round(v * 100) / 100; return x === 0 ? 0 : x; };
export const r3 = (v) => { const x = Math.round(v * 1000) / 1000; return x === 0 ? 0 : x; };
const num = (v) => (v === undefined ? undefined : Number(v));

/** Clock angle in degrees: 0 = 12 o'clock, clockwise positive, range [0,360). */
export function clockAngle(x, y, cx, cy) {
  return (((Math.atan2(x - cx, -(y - cy)) / RAD) % 360) + 360) % 360;
}
const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);

/** Centre of an SVG circular arc (rx = ry, no rotation), W3C implementation notes F.6.5. */
export function arcCentre(a) {
  const dx = (a.x1 - a.x2) / 2;
  const dy = (a.y1 - a.y2) / 2;
  const r = a.rx;
  const k = Math.sqrt(Math.max(0, (r * r - dx * dx - dy * dy) / (dx * dx + dy * dy)));
  const sign = a.large === a.sweep ? -1 : 1;
  return { x: sign * k * dy + (a.x1 + a.x2) / 2, y: sign * k * -dx + (a.y1 + a.y2) / 2 };
}

/** Algebraic (Kasa) least-squares circle fit through points. */
export function fitCircle(pts) {
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  const M = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]];
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
    }
  }
  const a = M[0][3] / M[0][0];
  const b = M[1][3] / M[1][1];
  const c = M[2][3] / M[2][2];
  const cx = a / 2;
  const cy = b / 2;
  return { cx, cy, r: Math.sqrt(c + cx * cx + cy * cy) };
}

function residuals(pts, cx, cy, r) {
  const res = pts.map(([x, y]) => Math.hypot(x - cx, y - cy) - r);
  const rms = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / res.length);
  const max = Math.max(...res.map(Math.abs));
  return { rms: r3(rms), max: r3(max), n: pts.length };
}

export const FRAME_IDS = [
  'A-01-idle', 'A-02-scramble', 'A-02b-wrong-turn', 'A-03-inspection', 'A-04-solving', 'A-05-results',
  'A-06-review', 'A-07-history', 'A-08-drill', 'A-09-phone', 'A-10-past-solve', 'A-11-replay', 'A-12-phone-past',
];

const famOf = (ff) => (ff.startsWith("'DM Mono'") ? 'mono' : 'manrope');

/** Everything about one frame that later sections need. */
function loadFrame(dir, id) {
  const file = path.join(dir, `${id}.svg`);
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = parseSvg(file);
  const style = raw.match(/<style>([\s\S]*?)<\/style>/)[1];
  const fonts = [...style.matchAll(/@font-face\{font-family:'([^']+)';font-weight:([\d ]+);font-style:(\w+);src:url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g)]
    .map((m) => ({ family: m[1], weight: m[2], style: m[3], bytes: Math.floor(m[4].length * 3 / 4), sha1: crypto.createHash('sha1').update(m[4]).digest('hex').slice(0, 12) }));
  const css = style.replace(/@font-face\{[^}]*\}/g, '');
  return { id, parsed, fonts, css };
}

/* ---------------------------- palette ---------------------------- */

function buildColors(frames) {
  const uses = new Map();
  const bump = (hex, kind, frameId) => {
    const e = uses.get(hex) ?? { fill: 0, stroke: 0, stop: 0, frames: new Set() };
    e[kind]++;
    e.frames.add(frameId);
    uses.set(hex, e);
  };
  for (const f of frames) {
    const consider = (attrs) => {
      for (const [k, kind] of [['fill', 'fill'], ['stroke', 'stroke'], ['stop-color', 'stop']]) {
        const v = attrs[k];
        if (v && v !== 'none' && v[0] === '#') bump(v, kind, f.id);
      }
    };
    for (const e of f.parsed.elements) consider(e.attrs);
    for (const g of Object.values(f.parsed.gradients)) for (const s of g.stops) consider(s);
    for (const p of Object.values(f.parsed.patterns)) for (const c of p.children) consider(c.attrs);
    for (const m of f.css.matchAll(/stroke:(#[0-9a-f]+)/g)) bump(m[1], 'stroke', f.id);
  }
  // sticker shades: classify by face below; here only name known tokens
  const faces = stickerShades(frames);
  const tokens = [];
  for (const [hex, u] of [...uses].sort((a, b) => b[1].fill + b[1].stroke + b[1].stop - (a[1].fill + a[1].stroke + a[1].stop) || (a[0] < b[0] ? -1 : 1))) {
    let token = null;
    let role = null;
    if (COLOR_ROLES[hex]) [token, role] = COLOR_ROLES[hex];
    else if (faces.byHex[hex]) {
      const f = faces.byHex[hex];
      token = `sticker-${f.family}-${f.face}`;
      role = `cube sticker, ${f.family}, ${f.face} face`;
    }
    tokens.push({
      hex, token: token ?? 'unlabelled', role: role ?? 'unlabelled',
      uses: u.fill + u.stroke + u.stop, fill: u.fill, stroke: u.stroke, stopColor: u.stop, frames: u.frames.size,
    });
  }
  return { tokens, faces };
}

/* ------------------------------ cube ------------------------------ */

function polyPoints(s) {
  return s.trim().split(/\s+/).map((p) => p.split(',').map(Number));
}

/** Split the polygon stream of a frame into cubes of 1 hexagon + 27 stickers. */
function cubesOf(frame) {
  const polys = frame.parsed.elements.filter((e) => e.tag === 'polygon');
  const cubes = [];
  for (let i = 0; i < polys.length; i += 28) cubes.push(polys.slice(i, i + 28));
  return cubes;
}

function faceOf(pts, cx) {
  // sides have a vertical edge (two points share x); the top rhombus does not.
  const sx = new Set(pts.map((p) => p[0].toFixed(1)));
  if (sx.size > 2) return 'top';
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  return mx < cx ? 'left' : 'right';
}

function stickerShades(frames) {
  const byHex = {};
  const pairs = new Map(); // family -> face -> Set(hex)
  for (const f of frames) {
    for (const cube of cubesOf(f)) {
      const hex = polyPoints(cube[0].attrs.points);
      const cx = (Math.min(...hex.map((p) => p[0])) + Math.max(...hex.map((p) => p[0]))) / 2;
      for (const p of cube.slice(1)) {
        const face = faceOf(polyPoints(p.attrs.points), cx);
        const fill = p.attrs.fill;
        const e = pairs.get(fill) ?? new Set();
        e.add(face);
        pairs.set(fill, e);
      }
    }
  }
  const families = {};
  for (const [hex, set] of pairs) {
    if (COLOR_ROLES[hex]) continue;
    const faces = [...set];
    byHex[hex] = { face: faces.join('+'), faces };
  }
  // top-face hexes name the family; pair left/right by nearest hue ratio.
  const tops = Object.entries(byHex).filter(([, v]) => v.faces.includes('top')).map(([h]) => h);
  const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  for (const top of tops) {
    const name = STICKER_FAMILIES[top];
    if (!name) continue;
    const t = lum(top);
    const others = Object.keys(byHex).filter((h) => !byHex[h].faces.includes('top'));
    // a side shade of the same family is a uniform scale of the top shade: compare channel ratios
    const scaled = others.map((h) => {
      const c = lum(h);
      const ratios = c.map((v, i) => (t[i] ? v / t[i] : 0));
      const spread = Math.max(...ratios) - Math.min(...ratios);
      return { h, spread, ratio: ratios.reduce((s, v) => s + v, 0) / 3 };
    }).filter((x) => x.spread < 0.04).sort((a, b) => b.ratio - a.ratio);
    families[name] = { top, left: null, right: null, leftRatio: null, rightRatio: null };
    for (const s of scaled) {
      const face = byHex[s.h].faces[0];
      if (!families[name][face]) { families[name][face] = s.h; families[name][`${face}Ratio`] = r3(s.ratio); }
    }
  }
  for (const [name, f] of Object.entries(families)) {
    byHex[f.top] = { family: name, face: 'top', faces: ['top'] };
    if (f.left) byHex[f.left] = { family: name, face: 'left', faces: ['left'] };
    if (f.right) byHex[f.right] = { family: name, face: 'right', faces: ['right'] };
  }
  return { byHex, families };
}

function analyseCubes(frames) {
  const out = {};
  let reference = null;
  for (const f of frames) {
    const list = [];
    for (const cube of cubesOf(f)) {
      const off = groupOffset(cube[0]);
      const hexPts = polyPoints(cube[0].attrs.points);
      const xs = hexPts.map((p) => p[0]);
      const ys = hexPts.map((p) => p[1]);
      const bbox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      const cx = bbox.x + bbox.w / 2;
      const cy = bbox.y + bbox.h / 2;
      const norm = cube.map((p) => polyPoints(p.attrs.points).map(([x, y]) => [r2(x - cx), r2(y - cy)]));
      const sig = JSON.stringify(norm);
      const stickers = cube.slice(1).map((p) => {
        const pts = polyPoints(p.attrs.points);
        return { face: faceOf(pts, cx), fill: p.attrs.fill, cls: p.attrs.class ?? null, stroke: p.attrs.stroke };
      });
      const entry = {
        offset: [off.x, off.y], centre: [r2(cx), r2(cy)], bbox: { x: r2(bbox.x), y: r2(bbox.y), w: r2(bbox.w), h: r2(bbox.h) },
        hexStroke: num(cube[0].attrs['stroke-width']), hexFill: cube[0].attrs.fill,
        stickerStroke: num(cube[1].attrs['stroke-width']), sig, stickers,
      };
      list.push(entry);
    }
    out[f.id] = list;
    if (!reference) reference = list[0];
  }
  return out;
}

/* ------------------------------ rings ------------------------------ */

const ORIGIN = 215;

function clusterArcs(frame) {
  const clusters = [];
  for (const el of frame.parsed.elements) {
    if (el.tag !== 'path') continue;
    const a = parseArc(el.attrs.d);
    if (!a) continue;
    const off = groupOffset(el);
    const c = arcCentre(a);
    let cl = clusters.find((k) => k.r === a.rx && k.off.x === off.x && k.off.y === off.y && Math.hypot(k.cx - c.x, k.cy - c.y) < 0.08);
    if (!cl) {
      cl = { r: a.rx, off, cx: c.x, cy: c.y, arcs: [] };
      clusters.push(cl);
    }
    cl.arcs.push({ a, c, el });
  }
  // short arcs have an ill-conditioned analytic centre: attach them to a ring whose circle they lie on
  const big = clusters.filter((k) => k.arcs.length > 2 || k.arcs.some((x) => spanOf(clockAngle(x.a.x1, x.a.y1, k.cx, k.cy), clockAngle(x.a.x2, x.a.y2, k.cx, k.cy)) > 20));
  const merged = [...big];
  for (const k of clusters) {
    if (big.includes(k)) continue;
    const host = big.find((b) => b.r === k.r && b.off.x === k.off.x && b.off.y === k.off.y
      && k.arcs.every(({ a }) => Math.abs(dist(a.x1, a.y1, b.cx, b.cy) - b.r) < 0.05 && Math.abs(dist(a.x2, a.y2, b.cx, b.cy) - b.r) < 0.05));
    if (host) host.arcs.push(...k.arcs); else merged.push(k);
  }
  return merged;
}

const spanOf = (s, e) => { const d = (((e - s) % 360) + 360) % 360; return d === 0 ? 360 : d; };
// +0.05 keeps an angle that rounds to 214.99999 on the same side as 215 (wrap tolerance)
const relTo = (deg, origin) => ((((deg - origin + 0.05) % 360) + 360) % 360) - 0.05;

function ringOf(cl) {
  const pts = cl.arcs.flatMap(({ a }) => [[a.x1, a.y1], [a.x2, a.y2]]);
  // centre: least-squares over all endpoints when they surround the centre, else mean of per-arc centres
  const mean = { x: cl.arcs.reduce((s, k) => s + k.c.x, 0) / cl.arcs.length, y: cl.arcs.reduce((s, k) => s + k.c.y, 0) / cl.arcs.length };
  let cx = mean.x;
  let cy = mean.y;
  let method = 'mean of per-arc analytic centres';
  if (pts.length >= 8) {
    const fit = fitCircle(pts);
    if (Math.abs(fit.r - cl.r) < 0.05) { cx = fit.cx; cy = fit.cy; method = 'Kasa least squares over all arc endpoints'; }
  }
  const res = residuals(pts, cx, cy, cl.r);
  const segs = cl.arcs.map(({ a, el }) => {
    const start = clockAngle(a.x1, a.y1, cx, cy);
    const end = clockAngle(a.x2, a.y2, cx, cy);
    const sw = num(el.attrs['stroke-width']);
    const op = el.attrs.opacity ?? '';
    const key = `${el.attrs.stroke}|${sw}|${op}`;
    return {
      startDeg: r2(start), endDeg: r2(end), spanDeg: r2(spanOf(start, end)),
      stroke: el.attrs.stroke, strokeWidth: sw, opacity: op === '' ? null : Number(op), linecap: el.attrs['stroke-linecap'] ?? null,
      role: SEGMENT_ROLES[key] ?? 'unlabelled', _s: start, _e: end,
    };
  });
  // overlays: an arc wholly inside another arc of the same ring
  for (const s of segs) {
    s.overlay = segs.some((o) => o !== s && o._s !== undefined && o.spanDeg >= s.spanDeg && o.stroke !== s.stroke
      && relTo(s._s, o._s) <= o.spanDeg + 0.06 && relTo(s._e, o._s) <= o.spanDeg + 0.06 && relTo(s._s, o._s) <= relTo(s._e, o._s) + 0.06);
  }
  const hasOrigin = segs.some((s) => Math.abs(relTo(s._s, ORIGIN)) < 0.06 || relTo(s._s, ORIGIN) > 359.94);
  const origin = hasOrigin ? ORIGIN : Math.min(...segs.map((s) => s._s));
  segs.sort((p, q) => relTo(p._s, origin) - relTo(q._s, origin) || p.strokeWidth - q.strokeWidth);
  const base = segs.filter((s) => !s.overlay);
  const gaps = base.map((s, i) => {
    const n = base[(i + 1) % base.length];
    return { fromDeg: s.endDeg, toDeg: n.startDeg, spanDeg: r2(spanOf(s._e, n._s)) };
  });
  const out = segs.map(({ _s, _e, ...rest }) => rest);
  return {
    r: cl.r, offset: [cl.off.x, cl.off.y], centre: [r2(cx), r2(cy)], centreMethod: method, residual: res,
    originDeg: r2(origin), segments: out, gaps,
  };
}

/* ---------------------------- text / type ---------------------------- */

const colorToken = (hex, tokenOf) => tokenOf[hex] ?? hex;

function textRec(el) {
  const a = el.attrs;
  const fam = famOf(a['font-family']);
  const off = groupOffset(el);
  return {
    k: 'text', text: el.text, x: Number(a.x), y: Number(a.y), anchor: a['text-anchor'], family: fam, size: Number(a['font-size']),
    weight: Number(a['font-weight']), fill: a.fill, ls: a['letter-spacing'] === undefined ? null : Number(a['letter-spacing']),
    opacity: a.opacity === undefined ? null : Number(a.opacity), groupOpacity: groupOpacity(el), offset: [off.x, off.y],
  };
}

function typeKey(t) { return [t.family, t.size, t.weight, t.fill, t.ls ?? '', t.anchor].join('|'); }

function buildType(frames, tokenOf) {
  const m = new Map();
  for (const f of frames) {
    for (const e of f.parsed.elements) {
      if (e.tag !== 'text') continue;
      const t = textRec(e);
      const k = typeKey(t);
      const v = m.get(k) ?? { ...t, uses: 0, frames: new Set(), samples: [] };
      v.uses++;
      v.frames.add(f.id.slice(0, 4).replace('A-', ''));
      if (v.samples.length < 3 && !v.samples.includes(t.text)) v.samples.push(t.text);
      m.set(k, v);
    }
  }
  const styles = [...m.values()].sort((a, b) => (typeKey(a) < typeKey(b) ? -1 : 1)).map((v, i) => {
    const roleKey = `${v.family}|${v.size}|${v.weight}|${v.fill}`;
    return {
      id: `T${String(i + 1).padStart(2, '0')}`, family: v.family, size: v.size, weight: v.weight, fill: v.fill, fillToken: colorToken(v.fill, tokenOf),
      letterSpacing: v.ls, anchor: v.anchor, uses: v.uses, frames: [...v.frames].sort(), role: TYPE_ROLES[roleKey] ?? 'unlabelled', samples: v.samples,
    };
  });
  return styles;
}

/* ---------------------------- chrome / deltas ---------------------------- */

function attrsOf(el, keys) {
  const o = {};
  for (const k of keys) {
    if (el.attrs[k] === undefined) continue;
    const v = el.attrs[k];
    o[k.replace(/-(\w)/g, (_m, c) => c.toUpperCase())] = isNaN(Number(v)) || /^#/.test(v) ? v : Number(v);
  }
  return o;
}

/** All non-ring, non-cube elements of a frame as compact records. */
function chromeOf(frame, styleOf) {
  const out = [];
  for (const e of frame.parsed.elements) {
    if (e.inClip) continue;
    const gop = groupOpacity(e);
    const off = groupOffset(e);
    const base = { offset: [off.x, off.y], ...(gop !== 1 ? { groupOpacity: gop } : {}) };
    if (e.tag === 'text') {
      const t = textRec(e);
      out.push({ k: 'text', text: t.text, x: t.x, y: t.y, anchor: t.anchor, style: styleOf(t), ...(t.opacity !== null ? { opacity: t.opacity } : {}), ...base });
    } else if (e.tag === 'rect') {
      if (e.attrs.x === undefined && Number(e.attrs.width) === frame.parsed.width) continue; // full-canvas background handled in canvas
      out.push({ k: 'rect', ...attrsOf(e, ['x', 'y', 'width', 'height', 'rx', 'fill', 'stroke', 'stroke-width']), ...base });
    } else if (e.tag === 'circle') {
      out.push({ k: 'circle', ...attrsOf(e, ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'opacity']), ...base });
    } else if (e.tag === 'line') {
      out.push({ k: 'line', ...attrsOf(e, ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap']), ...base });
    } else if (e.tag === 'ellipse') {
      out.push({ k: 'ellipse', ...attrsOf(e, ['cx', 'cy', 'rx', 'ry', 'fill', 'opacity']), ...base });
    } else if (e.tag === 'path' && !parseArc(e.attrs.d)) {
      // four-point sparkle: M top, then Q control points that all pass through the centre
      const q = e.attrs.d.match(/^M([-\d.]+) ([-\d.]+)Q([-\d.]+) ([-\d.]+)/);
      out.push({ k: q ? 'sparkle' : 'path', ...(q ? { x: Number(q[3]), y: Number(q[4]), arm: r2(Number(q[4]) - Number(q[2])) } : { d: e.attrs.d }), ...attrsOf(e, ['fill', 'stroke', 'stroke-width', 'stroke-dasharray']), ...base });
    }
  }
  return out;
}

const sig = (rec) => JSON.stringify(rec, (_k, v) => (typeof v === 'number' ? r2(v) : v));


/* ---------------------- ring-relative placement ---------------------- */

const BAND_IN = 60;
const BAND_OUT = 75;
const CENTRE_COLUMN = [160, 200]; // clock-angle window of the stacked centre column (timer, buttons)

/** Where every element near the main ring sits, in polar coordinates about its centre. */
function placement(ring, chrome, styles) {
  const [cx, cy] = ring.centre;
  const base = ring.segments.filter((s) => !s.overlay);
  const mids = base.map((s) => (s.startDeg + (s.endDeg < s.startDeg ? s.endDeg + 360 : s.endDeg)) / 2 % 360);
  const near = (x, y) => {
    const rr = dist(x, y, cx, cy);
    const th = clockAngle(x, y, cx, cy);
    return { rr, th, ok: rr >= ring.r - BAND_IN && rr <= ring.r + BAND_OUT && !(th > CENTRE_COLUMN[0] && th < CENTRE_COLUMN[1]) };
  };
  const labels = [];
  const items = [];
  const styleById = Object.fromEntries(styles.map((t) => [t.id, t]));
  for (const c of chrome) {
    if (c.offset[0] !== ring.offset[0] || c.offset[1] !== ring.offset[1]) continue;
    if (c.k === 'text') {
      const n = near(c.x, c.y);
      if (!n.ok) continue;
      const st = styleById[c.style];
      let best = -1;
      let bd = 1e9;
      mids.forEach((m, i) => { const dd = Math.abs(((n.th - m + 540) % 360) - 180); if (dd < bd) { bd = dd; best = i; } });
      const yc = c.y - st.size / 3;
      labels.push({
        text: c.text, style: c.style, x: c.x, y: c.y, anchor: c.anchor, angleDeg: r2(n.th), radius: r2(n.rr),
        radiusCentred: r2(dist(c.x, yc, cx, cy)), angleCentredDeg: r2(clockAngle(c.x, yc, cx, cy)),
        segment: best, segmentMidDeg: best < 0 ? null : r2(mids[best]), offsetDeg: best < 0 ? null : r2(bd),
      });
    } else if (c.k === 'circle' || c.k === 'sparkle' || c.k === 'rect') {
      const px = c.k === 'circle' ? c.cx : c.k === 'rect' ? c.x + c.width / 2 : c.x;
      const py = c.k === 'circle' ? c.cy : c.k === 'rect' ? c.y + c.height / 2 : c.y;
      const n = near(px, py);
      if (!n.ok) continue;
      items.push({ ...c, centreX: r2(px), centreY: r2(py), angleDeg: r2(n.th), radius: r2(n.rr) });
    } else if (c.k === 'line') {
      const a = near(c.x1, c.y1);
      const b = near(c.x2, c.y2);
      if (!a.ok && !b.ok) continue;
      items.push({ ...c, from: { radius: r2(a.rr), angleDeg: r2(a.th) }, to: { radius: r2(b.rr), angleDeg: r2(b.th) } });
    }
  }
  // x-model of stage-label blocks: x = cx + R sin(theta_segment) for side-anchored labels
  const side = labels.filter((l) => l.segment >= 0 && l.offsetDeg < 10 && l.anchor !== 'middle' && Math.abs(Math.sin(l.segmentMidDeg * RAD)) > 0.5);
  let fit = null;
  if (side.length >= 4) {
    const sn = side.map((l) => Math.sin(l.segmentMidDeg * RAD));
    const dx = side.map((l) => l.x - cx);
    const R = dx.reduce((a, v, i) => a + v * sn[i], 0) / sn.reduce((a, v) => a + v * v, 0);
    const rms = Math.sqrt(dx.reduce((a, v, i) => a + (v - R * sn[i]) ** 2, 0) / dx.length);
    fit = { radius: r2(R), rmsPx: r2(rms), n: side.length };
  }
  const centred = labels.filter((l) => l.anchor === 'middle' && l.offsetDeg !== null && l.offsetDeg < 2);
  let moveFit = null;
  if (centred.length >= 4) {
    const rs = centred.map((l) => l.radiusCentred);
    const m = rs.reduce((a, v) => a + v, 0) / rs.length;
    moveFit = { radius: r2(m), minPx: r2(Math.min(...rs)), maxPx: r2(Math.max(...rs)), n: rs.length };
  }
  return { labels, items, stageLabelFit: fit, centredLabelFit: moveFit };
}

/* ---------------------------- frame analysis ---------------------------- */

export function analyse(dir) {
  const frames = FRAME_IDS.map((id) => loadFrame(dir, id));
  const { tokens, faces } = buildColors(frames);
  const tokenOf = Object.fromEntries(tokens.map((t) => [t.hex, t.token]));
  const styles = buildType(frames, tokenOf);
  const styleIdByKey = new Map(styles.map((s) => [[s.family, s.size, s.weight, s.fill, s.letterSpacing ?? '', s.anchor].join('|'), s]));
  const styleOf = (t) => {
    const s = styleIdByKey.get(typeKey(t));
    return s.id;
  };
  const cubes = analyseCubes(frames);

  const out = { frames: {}, colors: tokens, faces: faces.families, type: styles, cubes: {} };
  const fontHashes = new Set(frames.flatMap((f) => f.fonts.map((x) => `${x.family}|${x.weight}|${x.sha1}`)));
  out.fonts = { files: frames[0].fonts, identicalAcrossFrames: fontHashes.size === frames[0].fonts.length, css: frames[0].css, cssIdentical: frames.every((f) => f.css === frames[0].css) };
  out.cssByFrame = Object.fromEntries(frames.filter((f) => f.css !== frames[0].css).map((f) => [f.id, f.css]));

  for (const f of frames) {
    const p = f.parsed;
    const clusters = clusterArcs(f);
    const rings = clusters.map(ringOf).sort((a, b) => b.r - a.r || a.offset[0] - b.offset[0] || a.centre[0] - b.centre[0] || a.centre[1] - b.centre[1]);
    const chrome = chromeOf(f, styleOf);
    const backgrounds = p.elements.filter((e) => e.tag === 'rect' && e.attrs.x === undefined && !e.inClip && Number(e.attrs.width) === p.width).map((e) => e.attrs.fill);
    const devices = p.elements.filter((e) => e.tag === 'rect' && e.attrs.width === '390' && !e.inClip && e.attrs.stroke).map((e) => ({ offset: [groupOffset(e).x, groupOffset(e).y], ...attrsOf(e, ['width', 'height', 'rx', 'fill', 'stroke', 'stroke-width']) }));
    const clip = p.elements.find((e) => e.inClip);
    out.frames[f.id] = {
      title: FRAME_TITLES[f.id] ?? '', width: p.width, height: p.height, backgrounds, devices,
      clip: clip ? attrsOf(clip, ['width', 'height', 'rx']) : null,
      rings, chrome, cubes: cubes[f.id],
      placement: rings.filter((r) => r.r >= 150 && !rings.some((o) => o !== r && o.r > r.r && o.offset[0] === r.offset[0] && o.offset[1] === r.offset[1] && o.centre[0] === r.centre[0] && o.centre[1] === r.centre[1]) && r.r !== 190).map((r) => ({ ring: r.r, offset: r.offset, ...placement(r, chrome, styles) })),
      hatch: Object.keys(p.patterns).length ? p.patterns : null,
      glow: p.gradients.glow,
    };
  }
  out.sigOf = sig;
  out.ANCHOR_NAMES = ANCHOR_NAMES;
  return out;
}

export { dist, parseSvg, groupOffset, FRAME_IDS as _FRAME_IDS };
