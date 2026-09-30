// The drills the hub lists. `tool` is main.js's internal id for the trainer;
// `href` is its canonical route (src/routes.js). Words follow docs/design/VOICE.md.

/** cube: 'none' (no cube needed) | 'optional' (follows the cube when one is connected) | 'needed'. */
export const DRILLS = Object.freeze([
  {
    id: 'corners', tool: 'corner', key: 'c', href: '#/drills/corners',
    title: 'corner recognition', blurb: 'name the hidden sticker at a glance',
    modes: ['single', 'three', 'recall', 'glance'], cube: 'none',
  },
  {
    id: 'pll', tool: 'pll', key: 'p', href: '#/drills/pll',
    title: 'PLL recognition', blurb: 'call the PLL from two sides',
    modes: ['learn', 'mix', 'transfer', 'glance'], cube: 'none',
  },
  {
    id: 'f2l', tool: 'f2l', key: 'f', href: '#/drills/f2l',
    title: 'F2L deduction', blurb: 'spot pairs, then pick the best next one',
    modes: ['deduction', 'timed scan', 'best pair'], cube: 'none',
  },
  {
    id: 'scout', tool: 'scout', key: 'x', href: '#/drills/scout',
    title: 'Cross Scout', blurb: 'plan cross and x-cross from a scramble',
    modes: ['explore', 'retrieval practice'], cube: 'optional',
  },
]);

export const CUBE_LABELS = Object.freeze({
  none: 'no cube needed',
  optional: 'cube optional',
  needed: 'needs a cube',
});

export const LAST_DRILL_KEY = 'cubesight-last-drill-v1';

export const drillByTool = tool => DRILLS.find(drill => drill.tool === tool) ?? null;

/** Remember the drill (and its hash, query included) the user opened last. */
export function rememberDrill(storage, tool, hash, now = Date.now()) {
  const drill = drillByTool(tool);
  if (!drill) return;
  try { storage?.setItem(LAST_DRILL_KEY, JSON.stringify({ id: drill.id, hash, at: now })); } catch { /* optional */ }
}

/** The last drill opened, or null. */
export function lastDrill(storage) {
  try {
    const stored = JSON.parse(storage?.getItem(LAST_DRILL_KEY) ?? 'null');
    const drill = DRILLS.find(item => item.id === stored?.id);
    if (!drill) return null;
    const hash = typeof stored.hash === 'string' && stored.hash.startsWith(drill.href) ? stored.hash : drill.href;
    return { drill, hash, at: Number(stored.at) || 0 };
  } catch { return null; }
}

/** The settings worth showing next to "continue" (what the drill will start with). */
export function drillSettings(storage, drill) {
  const read = key => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
  if (drill.id === 'f2l') {
    const seconds = read('cubesight-f2l-scan-seconds');
    const pseudo = read('cubesight-f2l-scan-pseudo') === 'true';
    return [`timed scan · ${seconds ?? 30} s`, pseudo ? 'pseudo pairs' : null].filter(Boolean).join(' · ');
  }
  return drill.modes.slice(0, 3).join(' · ');
}

/** 'just now' | '5 min ago' | '3 h ago' | '4 days ago' */
export function agoLabel(at, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
