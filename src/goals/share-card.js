import { APP_NAME } from '../copy/nav.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const seconds = value => Number.isFinite(value) ? (value / 1000).toFixed(2) : value === Infinity ? 'DNF' : '—';

export function solveOrbitOptions(solve) {
  const splits = Array.isArray(solve?.splits) ? solve.splits.filter(row => Number.isFinite(row.ms) && row.ms >= 0) : [];
  const stages = splits.length ? splits : [{ key: 'solve', ms: Number.isFinite(solve?.solveMs) ? solve.solveMs : 1 }];
  return {
    shape: 'full', size: 'L', label: 'solve Orbit', segmentGap: 5,
    segments: stages.map((row, index) => ({
      key: row.key ?? String(index), label: row.label ?? row.key ?? `stage ${index + 1}`,
      value: seconds(row.ms), weight: Math.max(1, row.ms), state: 'done',
    })),
  };
}

/** Embed a clone of the shared Orbit SVG; no second ring geometry is maintained here. */
export function shareCardSvg(solve, orbitContent) {
  if (typeof orbitContent !== 'string') throw new TypeError('A rendered Orbit SVG is required to make a share card.');
  const splits = Array.isArray(solve?.splits) ? solve.splits.filter(row => Number.isFinite(row.ms) && row.ms >= 0) : [];
  const at = Number.isFinite(solve?.at) ? new Date(solve.at).toLocaleDateString() : '';
  const labels = splits.map(row => `${esc(row.label ?? row.key)} ${seconds(row.ms)} s`).join('  ·  ');
  const time = seconds(solve?.penalty === 'DNF' ? Infinity : solve?.penalty === '+2' ? (solve.solveMs ?? NaN) + 2000 : solve?.solveMs);
  const penalty = solve?.penalty === '+2' ? '+2 included' : solve?.penalty === 'DNF' ? 'DNF' : 'solve time';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" rx="28" fill="#111816"/><text x="70" y="82" fill="#a8b8b2" font-family="sans-serif" font-size="24">${esc(APP_NAME)} · ${esc(at)}</text><g transform="translate(390 72) scale(.75)">${orbitContent}</g><text x="600" y="310" text-anchor="middle" fill="#f2f6f4" font-family="sans-serif" font-size="76" font-weight="700">${time}</text><text x="600" y="354" text-anchor="middle" fill="#a8b8b2" font-family="sans-serif" font-size="22">${penalty}</text><text x="600" y="568" text-anchor="middle" fill="#f2f6f4" font-family="sans-serif" font-size="20">${labels}</text></svg>`;
}

function inlineOrbitStyles(sourceSvg, computedStyle = globalThis.getComputedStyle) {
  const clone = sourceSvg.cloneNode(true);
  const originalNodes = [sourceSvg, ...sourceSvg.querySelectorAll('*')];
  const cloneNodes = [clone, ...clone.querySelectorAll('*')];
  const props = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor'];
  for (let index = 0; index < originalNodes.length; index++) {
    const computed = computedStyle(originalNodes[index]);
    for (const prop of props) {
      const value = computed.getPropertyValue(prop);
      if (value) cloneNodes[index].style.setProperty(prop, value);
    }
  }
  return clone.innerHTML;
}

export async function createShareCardPng(solve, { documentRef = globalThis.document, ImageCtor = globalThis.Image, URLRef = globalThis.URL, getComputedStyleRef = globalThis.getComputedStyle } = {}) {
  if (!documentRef?.createElement || !ImageCtor || !URLRef?.createObjectURL) throw new Error('PNG export is unavailable in this browser.');
  if (!getComputedStyleRef) throw new Error('PNG export needs the browser style engine.');
  const { Orbit } = await import('../ui/orbit/index.js');
  const host = documentRef.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:420px;height:420px;overflow:hidden;--orbit-bg:#100f0d;--orbit-ink:#f2eee4;--orbit-muted:#a8a69d;--orbit-track:#45443e;--orbit-accent:#52e0ca';
  documentRef.body.append(host);
  let orbit;
  let orbitContent;
  try {
    orbit = new Orbit(host, solveOrbitOptions(solve));
    const svg = orbit.element.querySelector('svg');
    if (!svg) throw new Error('Could not render the solve Orbit.');
    orbitContent = inlineOrbitStyles(svg, getComputedStyleRef);
  } finally { orbit?.destroy(); host.remove(); }

  const blob = new Blob([shareCardSvg(solve, orbitContent)], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URLRef.createObjectURL(blob);
  try {
    const image = new ImageCtor();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = objectUrl; });
    const canvas = documentRef.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG export is unavailable in this browser.');
    context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG export failed.')), 'image/png'));
  } finally { URLRef.revokeObjectURL(objectUrl); }
}
