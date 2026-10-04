// Minimal, dependency-free parser for the orbit-v3 design SVGs. They are
// machine generated (one element per tag, no CDATA, no nested <text>), so a
// tokenising regex is exact for them. It records, for every drawable element,
// its attributes, text content and the stack of enclosing <g> attributes.
import fs from 'node:fs';

const ATTR = /([\w:-]+)="([^"]*)"/g;

export function parseAttrs(s) {
  const out = {};
  for (const m of s.matchAll(ATTR)) out[m[1]] = m[2];
  return out;
}

/** Parse an SVG file into { width, height, viewBox, gradients, elements[] }. */
export function parseSvg(file) {
  const src = fs.readFileSync(file, 'utf8');
  const root = parseAttrs(src.match(/<svg\b([^>]*)>/)[1]);
  const body = src.replace(/<style>[\s\S]*?<\/style>/, '');
  const elements = [];
  const stack = [];
  const gradients = {};
  const patterns = {};
  let grad = null;
  let pattern = null;
  const re = /<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>(?:([^<]*)<\/text>)?/g;
  let m;
  let z = 0;
  while ((m = re.exec(body))) {
    const [, close, tag, rawAttrs, selfClose, text] = m;
    if (tag === 'svg' || tag === 'style') continue;
    if (tag === 'defs') continue;
    if (close) {
      if (tag === 'g' || tag === 'clipPath') stack.pop();
      if (tag === 'radialGradient') grad = null;
      if (tag === 'pattern') pattern = null;
      continue;
    }
    const attrs = parseAttrs(rawAttrs);
    if (tag === 'pattern') { pattern = { ...attrs, children: [] }; patterns[attrs.id] = pattern; continue; }
    if (pattern) { pattern.children.push({ tag, attrs }); continue; }
    if (tag === 'radialGradient') { grad = { ...attrs, stops: [] }; gradients[attrs.id] = grad; continue; }
    if (tag === 'stop') { grad?.stops.push(attrs); continue; }
    if (tag === 'text') {
      // the regex consumed "<text ...>content</text>"; selfClose is '' here
      elements.push({ tag, attrs, text, groups: stack.map((g) => g.attrs), z: z++ });
      continue;
    }
    if (tag === 'g' || tag === 'clipPath') {
      if (!selfClose) stack.push({ tag, attrs });
      continue;
    }
    elements.push({ tag, attrs, groups: stack.map((g) => g.attrs), inClip: stack.some((g) => g.tag === 'clipPath'), z: z++ });
  }
  return {
    width: Number(root.width),
    height: Number(root.height),
    viewBox: root.viewBox,
    gradients,
    patterns,
    elements,
  };
}

/** Sum of translate() transforms of the enclosing groups. */
export function groupOffset(el) {
  let x = 0;
  let y = 0;
  for (const g of el.groups) {
    const t = g.transform?.match(/translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/);
    if (t) { x += Number(t[1]); y += Number(t[2]); }
  }
  return { x, y };
}

/** Product of the enclosing groups' opacity attributes (1 when none). */
export function groupOpacity(el) {
  let o = 1;
  for (const g of el.groups) if (g.opacity !== undefined) o *= Number(g.opacity);
  return o;
}

export function parseArc(d) {
  const m = d.match(/^M\s*([-\d.]+)[ ,]([-\d.]+)\s*A\s*([-\d.]+)[ ,]([-\d.]+)\s+([-\d.]+)\s+([01])[ ,]([01])\s+([-\d.]+)[ ,]([-\d.]+)\s*$/);
  if (!m) return null;
  const n = m.slice(1).map(Number);
  return { x1: n[0], y1: n[1], rx: n[2], ry: n[3], rot: n[4], large: n[5], sweep: n[6], x2: n[7], y2: n[8] };
}
