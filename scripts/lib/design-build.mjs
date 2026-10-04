// Assembles the analysed frames into the structures exported by src/ui/design-spec.js
// and documented in docs/design/orbit-v3/SPEC-A-EXACT.md.
import { analyse, fitCircle, clockAngle, r2, r3, FRAME_IDS } from './design-analyse.mjs';
import { ANCHOR_NAMES } from './design-roles.mjs';

const FONT_STACK = {
  mono: "'DM Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
  manrope: "'Manrope', 'Manrope Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
};

const DESKTOP = FRAME_IDS.filter((id) => !/phone/.test(id));
const PHONE = FRAME_IDS.filter((id) => /phone/.test(id));

const mainRing = (f) => f.rings.reduce((a, b) => (b.r > a.r ? b : a));

/** Least squares over every arc endpoint of every ring of the given radius in the given frames. */
function pooledCircle(a, ids, radius) {
  const pts = [];
  for (const id of ids) for (const ring of a.frames[id].rings) if (ring.r === radius) pts.push(...ring._pts);
  const fit = fitCircle(pts);
  const res = pts.map(([x, y]) => Math.hypot(x - fit.cx, y - fit.cy) - fit.r);
  const rms = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / res.length);
  return { cx: r3(fit.cx), cy: r3(fit.cy), r: r3(fit.r), rms: r3(rms), max: r3(Math.max(...res.map(Math.abs))), points: pts.length, frames: ids.length };
}

export function buildSpec(dir) {
  const a = analyse(dir);
  const f = a.frames;
  const idle = f['A-01-idle'];
  const idleRing = mainRing(idle);

  // ---- canvas
  const phoneFrame = f['A-09-phone'];
  const CANVAS = {
    desktop: { width: idle.width, height: idle.height, background: idle.backgrounds[0], frames: DESKTOP },
    phoneSheet: {
      width: phoneFrame.width, height: phoneFrame.height, background: phoneFrame.backgrounds, frames: PHONE,
      devices: phoneFrame.devices.map((d, i) => ({ id: i === 0 ? 'left' : 'right', translate: d.offset })),
      device: { width: phoneFrame.devices[0].width, height: phoneFrame.devices[0].height, rx: phoneFrame.devices[0].rx, fill: phoneFrame.devices[0].fill, stroke: phoneFrame.devices[0].stroke, strokeWidth: phoneFrame.devices[0].strokeWidth },
    },
    frames: Object.fromEntries(FRAME_IDS.map((id) => [id, { width: f[id].width, height: f[id].height, title: f[id].title }])),
  };

  // ---- colours
  const tokens = {};
  const byHex = {};
  for (const c of a.colors) {
    tokens[c.token] = { hex: c.hex, role: c.role, uses: c.uses, fill: c.fill, stroke: c.stroke, stopColor: c.stopColor, frames: c.frames };
    byHex[c.hex] = c.token;
  }
  const opac = new Map();
  const noteOp = (v, what, id) => {
    const k = `${v}|${what}`;
    const e = opac.get(k) ?? { value: v, on: what, frames: new Set() };
    e.frames.add(id);
    opac.set(k, e);
  };
  for (const id of FRAME_IDS) {
    for (const c of f[id].chrome) {
      if (c.opacity !== undefined && c.opacity !== null) noteOp(c.opacity, c.k, id);
      if (c.groupOpacity !== undefined) noteOp(c.groupOpacity, `${c.k} (via <g opacity>)`, id);
    }
    for (const ring of f[id].rings) for (const s of ring.segments) if (s.opacity !== null) noteOp(s.opacity, `arc ${s.stroke}`, id);
  }
  const opacity = [...opac.values()].map((e) => ({ value: e.value, on: e.on, frames: [...e.frames].map((x) => x.replace(/^(A-\d+b?)-.*/, '$1')) }))
    .sort((p, q) => p.value - q.value || (p.on < q.on ? -1 : 1));
  const glowStops = f['A-01-idle'].glow.stops.map((s) => ({ offset: Number(s.offset), color: s['stop-color'], opacity: Number(s['stop-opacity']) }));
  const COLORS = { tokens, byHex, stickers: a.faces, stickerShade: shadeRatios(a.faces), opacity, cssHighlight: a.fonts.css.replace(/\s+/g, ' ').trim(), cssHighlightByFrame: a.cssByFrame, glowStops, hatch: idleHatch(a) };

  // ---- type
  const TYPE = {
    families: FONT_STACK,
    numeric: 'font-variant-numeric:tabular-nums',
    fonts: a.fonts.files.map((x) => ({ family: x.family, weight: x.weight, bytes: x.bytes, sha1: x.sha1 })),
    fontsIdenticalAcrossFrames: a.fonts.identicalAcrossFrames,
    styles: a.type,
  };

  // ---- orbit
  const desktopFit = pooledCircle(a, DESKTOP, 300);
  const phoneFit = pooledCircle(a, PHONE, 150);
  const strokes = {};
  for (const id of FRAME_IDS) {
    for (const ring of f[id].rings) {
      for (const s of ring.segments) {
        const role = s.role;
        const e = strokes[role] ?? { stroke: s.stroke, strokeToken: tokens[byHex[s.stroke]] ? byHex[s.stroke] : s.stroke, width: s.strokeWidth, opacity: s.opacity, linecap: s.linecap, note: s._note ?? null, radii: new Set(), frames: new Set() };
        e.radii.add(ring.r);
        e.frames.add(id.replace(/^(A-\d+b?)-.*/, '$1'));
        strokes[role] = e;
      }
    }
  }
  for (const e of Object.values(strokes)) { e.radii = [...e.radii].sort((x, y) => x - y); e.frames = [...e.frames].sort(); }
  const idleTicks = idle.placement[0].items.filter((i) => i.k === 'line').map((i) => ({ from: i.from, to: i.to, stroke: i.stroke, strokeWidth: i.strokeWidth, linecap: i.strokeLinecap }));
  const base = idleRing.segments.filter((s) => !s.overlay);
  const spans = (fr) => { const ring = mainRing(f[fr]); return ring.gaps.filter((_g, i, arr) => i < arr.length - 1).map((g) => g.spanDeg); };
  const gapStats = Object.fromEntries(FRAME_IDS.filter((id) => f[id].rings.length && mainRing(f[id]).r >= 150 && id !== 'A-07-history' && id !== 'A-03-inspection').map((id) => {
    const sp = spans(id);
    return [id, sp.length ? { min: Math.min(...sp), max: Math.max(...sp), n: sp.length } : null];
  }));
  const byFrame = {};
  for (const id of FRAME_IDS) {
    for (const p of f[id].placement) {
      byFrame[`${id}@${p.offset[0]},${p.offset[1]}`] = { ring: p.ring, stageBlocks: p.stageLabelFit, centredLabels: p.centredLabelFit };
    }
  }
  const pick = (id, k, i = 0) => f[id].placement[i][k];
  const marker = f['A-05-results'].placement[0].items.find((i) => i.k === 'circle' && i.r === 10);
  const pillItem = f['A-02-scramble'].placement[0].items.find((i) => i.k === 'rect');
  const labelRadius = {
    sideOfRing: 'outside: every label radius is larger than the ring radius (markers sit on the ring)',
    stageIdle: pick('A-01-idle', 'stageLabelFit').radius,
    stageSolving: pick('A-04-solving', 'stageLabelFit').radius,
    stageResults: pick('A-05-results', 'stageLabelFit').radius,
    stageReplay: pick('A-11-replay', 'stageLabelFit').radius,
    scrambleMoves: pick('A-02-scramble', 'centredLabelFit').radius,
    reviewMoves: pick('A-06-review', 'centredLabelFit').radius,
    drillNumbers: pick('A-08-drill', 'centredLabelFit').radius,
    currentMovePill: pillItem.radius,
    marker: marker.radius,
    phoneStage: pick('A-09-phone', 'stageLabelFit', 1).radius,
    note: 'stage* = x-model of the label block anchor, scramble/review/drill = glyph centre (baseline minus size/3); see SPEC-A-EXACT.md 4.5',
    byFrame,
  };
  const ORBIT = {
    centre: { x: r2(desktopFit.cx), y: r2(desktopFit.cy) },
    radius: idleRing.r,
    fit: { desktop: desktopFit, phone: phoneFit, method: 'Kasa algebraic least squares over every arc endpoint (SVG path coordinates are rounded to 0.01)' },
    startDeg: idleRing.originDeg,
    endDeg: base[base.length - 1].endDeg,
    sweepDeg: r2(360 - idleRing.gaps[idleRing.gaps.length - 1].spanDeg),
    bottomGap: { fromDeg: idleRing.gaps[idleRing.gaps.length - 1].fromDeg, toDeg: idleRing.gaps[idleRing.gaps.length - 1].toDeg, spanDeg: idleRing.gaps[idleRing.gaps.length - 1].spanDeg },
    ticks: idleTicks,
    stroke: strokes,
    segments: idleRing.segments,
    gaps: idleRing.gaps,
    gapSpanByFrame: gapStats,
    labelRadius,
    phone: { centre: { x: r2(phoneFit.cx), y: r2(phoneFit.cy) }, radius: mainRing(f['A-09-phone']).r, translate: CANVAS.phoneSheet.devices.map((d) => d.translate) },
    frames: Object.fromEntries(FRAME_IDS.map((id) => [id, {
      rings: f[id].rings.map((r) => ({ radius: r.r, offset: r.offset, centre: r.centre, centreMethod: r.centreMethod, residual: r.residual, startDeg: r.originDeg, segments: r.segments, gaps: r.gaps })),
      // polar placement only; the elements themselves are in ANCHORS.frames[id] (same order)
      placement: f[id].placement.map((p) => ({
        ring: p.ring, offset: p.offset, stageLabelFit: p.stageLabelFit, centredLabelFit: p.centredLabelFit,
        labels: p.labels.map((l) => ({ text: l.text, anchor: l.anchor, angleDeg: l.angleDeg, radius: l.radius, radiusCentred: l.radiusCentred, segment: l.segment, offsetDeg: l.offsetDeg })),
        items: p.items.map((i) => (i.k === 'line' ? { k: i.k, from: i.from, to: i.to } : { k: i.k, centre: [i.centreX, i.centreY], angleDeg: i.angleDeg, radius: i.radius })),
      })),
    }])),
  };

  // ---- cube
  const cube = (id, idx = 0) => f[id].cubes[idx];
  const cubeInfo = (id, idx, canvasH, ring) => {
    const c = cube(id, idx);
    const H = c.bbox.h;
    const ell = f[id].chrome.filter((e) => e.k === 'ellipse' && e.offset[0] === c.offset[0] && e.offset[1] === c.offset[1]);
    const shadow = ell.find((e) => e.fill === '#000');
    const glow = ell.find((e) => e.fill && e.fill.startsWith('url('));
    const rel = (e) => ({ cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry, fill: e.fill, opacity: e.opacity ?? null, centreOffsetFromCube: [r2(e.cx - c.centre[0]), r2(e.cy - c.centre[1])], inUnitsOfHeight: { dy: r3((e.cy - c.centre[1]) / H), rx: r3(e.rx / H), ry: r3(e.ry / H) } });
    return {
      frame: id, offset: c.offset, bbox: c.bbox, centre: c.centre, width: c.bbox.w, height: H,
      sizeFraction: r3(H / canvasH), sizeFractionOfRingRadius: ring ? r3(H / ring.r) : null,
      centreOffsetFromOrbit: ring ? [r2(c.centre[0] - ring.centre[0]), r2(c.centre[1] - ring.centre[1])] : null,
      hexStroke: c.hexStroke, hexStrokeUnits: r3(c.hexStroke / H), stickerStroke: r3(c.stickerStroke), stickerStrokeUnits: r3(c.stickerStroke / H),
      shadow: shadow ? rel(shadow) : null, glow: glow ? rel(glow) : null,
    };
  };
  const desk = cubeInfo('A-01-idle', 0, idle.height, idleRing);
  const geometry = cube('A-01-idle').sig;
  const sameGeometry = Object.fromEntries(FRAME_IDS.map((id) => [id, f[id].cubes.map((c) => c.sig === geometry ? 'identical to A-01' : `${c.bbox.h}px high (scaled copy: ${isScaledCopy(c.sig, geometry, c.bbox.h / desk.height)})`)]));
  const A01 = cube('A-01-idle');
  const CUBE = {
    desktop: desk,
    phone: cubeInfo('A-09-phone', 0, phoneFrame.devices[0].height, mainRing(f['A-09-phone'])),
    history: cubeInfo('A-07-history', 0, f['A-07-history'].height, f['A-07-history'].rings.find((r) => r.r === 190)),
    sizeFraction: desk.sizeFraction,
    centerOffset: desk.centreOffsetFromOrbit,
    shadow: desk.shadow,
    glow: { ...desk.glow, gradient: { id: 'glow', cx: '50%', cy: '50%', r: '50%', stops: glowStops } },
    zOrder: 'orbit arcs, glow ellipse, shadow ellipse, cube group (hexagon then 27 stickers), then text',
    hexagon: { vertices: A01.sig ? JSON.parse(A01.sig)[0] : null, fill: A01.hexFill, strokeLinejoin: 'round', note: 'regular isometric hexagon about (0,0): half-width = height * sqrt(3)/4' },
    stickers: stickerGeometry(A01.sig, A01.stickers),
    highlight: 'class "hl" on a sticker: stroke #3dbfad width 3.2 paint-order stroke; class "hlw": stroke #e6a642 width 3.2 (see COLORS.cssHighlight)',
    geometryAcrossFrames: sameGeometry,
  };

  // ---- anchors
  const ANCHORS = { 'A-01-idle': nameAnchors(idle.chrome), frames: Object.fromEntries(FRAME_IDS.map((id) => [id, f[id].chrome])) };

  return { CANVAS, COLORS, TYPE, ORBIT, CUBE, ANCHORS, FRAMES: Object.fromEntries(FRAME_IDS.map((id) => [id, { title: f[id].title, width: f[id].width, height: f[id].height }])), _analysis: a };
}

function shadeRatios(families) {
  const out = { left: [], right: [] };
  for (const v of Object.values(families)) { out.left.push(v.leftRatio); out.right.push(v.rightRatio); }
  const mean = (xs) => r3(xs.reduce((s, x) => s + x, 0) / xs.length);
  return { left: { mean: mean(out.left), min: Math.min(...out.left), max: Math.max(...out.left) }, right: { mean: mean(out.right), min: Math.min(...out.right), max: Math.max(...out.right) }, note: 'side-face shade = top-face colour * ratio, measured per sticker colour' };
}

function idleHatch(a) {
  const h = a.frames['A-03-inspection'].hatch?.hatch;
  return h ? { width: Number(h.width), height: Number(h.height), transform: h.patternTransform, stripe: h.children.map((c) => ({ tag: c.tag, ...c.attrs })) } : null;
}

function isScaledCopy(sig, ref, k) {
  const a = JSON.parse(sig);
  const b = JSON.parse(ref);
  if (a.length !== b.length) return false;
  let worst = 0;
  a.forEach((poly, i) => poly.forEach((p, j) => { worst = Math.max(worst, Math.abs(p[0] - b[i][j][0] * k), Math.abs(p[1] - b[i][j][1] * k)); }));
  return worst < 0.2 ? `all vertices within ${r2(worst)}px of ${r3(k)}x` : `not a pure scale, worst ${r2(worst)}px`;
}

function stickerGeometry(sig, stickers) {
  const polys = JSON.parse(sig);
  return polys.slice(1).map((pts, i) => ({ face: stickers[i].face, points: pts, stroke: 'same as fill' }));
}

function nameAnchors(chrome) {
  const out = {};
  const used = new Set();
  const stages = ['cross', 'p1', 'p2', 'p3', 'p4', 'eo', 'co', 'cp', 'ep'];
  let keycaps = 0;
  let lastStage = null;
  for (const c of chrome) {
    let name = null;
    if (c.k === 'text') {
      name = ANCHOR_NAMES[`text:${c.text}`];
      if (!name && stages.includes(c.text)) { lastStage = c.text; name = `orbit.stage.${c.text}.label`; }
      else if (!name && /^~/.test(c.text) && lastStage) name = `orbit.stage.${lastStage}.estimate`;
    } else if (c.k === 'rect') {
      if (c.width === 42 && c.height === 2) name = 'header.navUnderline';
      else if (c.width === 204) name = 'startPill.rect';
      else if (c.width === 51 && c.height === 22) name = 'startPill.keycap';
      else if (c.height === 20) name = `keys.${keycaps++ === 0 ? 'settings' : 'command'}.keycap`;
    } else if (c.k === 'circle' && c.r === 4) name = 'header.statusDot';
    else if (c.k === 'line') name = c.x1 < 720 ? 'orbit.tick.startOfRing' : 'orbit.tick.endOfRing';
    else if (c.k === 'ellipse') name = c.opacity ? 'cube.shadow' : 'cube.glow';
    if (!name) name = `unnamed.${c.k}.${Object.values(c).slice(1, 3).join(',')}`;
    if (used.has(name)) name = `${name}#2`;
    used.add(name);
    out[name] = c;
  }
  return out;
}

export { clockAngle };
