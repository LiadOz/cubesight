// Brain training settings: one versioned object in localStorage
// (cubesight-brain-settings-v2, exported by data-port.js through its
// cubesight- prefix). Pure: storage is passed in, so node tests use a Map-backed
// fake. Every setting is also reachable from the monkeytype-style command line.

import { DEFAULT_INSPECTION, normalizeInspection } from '../solve-live.js';
import { BRAIN_STYLES, DEFAULT_BRAIN_STYLE } from './types.js';
import { DEFAULT_SESSION_GAP_MIN, normalizeGapMin } from '../store/sessions.js';
import { FOCI, DEFAULT_FOCUS, normalizeFocus, STATS_SOURCES, DEFAULT_STATS_SOURCE } from '../store/focus.js';

export const SETTINGS_KEY = 'cubesight-brain-settings-v2';
const LEGACY_KEYS = {
  method: 'cubesight-brain-method',
  pseudo: 'cubesight-brain-pseudo',
  inspection: 'cubesight-brain-inspection',
  toggles: 'cubesight-brain-toggles-v1',
};

// Coach lenses. Every coach affordance is a switch so it can be judged on its own.
export const DEFAULT_TOGGLES = Object.freeze({
  crossSuggest: true,      // suggest an optimal cross during inspection
  crossHindsight: true,    // “your cross was non-optimal”
  f2lHint: true,           // readiness hint for the next pair
  pllLens: true,           // identify the PLL case
  ollStage: true,          // 2-look OLL stage labels
  rotationFlag: true,      // flag excessive whole-cube rotations
  efficiencyScore: true,   // chess.com-style accuracy analogue
  autoCross: true,         // detect the cross face from the cube (first face solved)
});

// Enumerated settings: path -> allowed values (the first is the default unless
// DEFAULT_SETTINGS says otherwise).
const ENUMS = {
  style: BRAIN_STYLES,
  // Roux is hidden for now: solve-methods.js keeps its stages, but no picker
  // offers it and stored 'roux' normalises to 'cfop'.
  method: ['cfop'],
  f2l: ['standard', 'pseudo'],
  oll: ['2look', '1look'],
  pll: ['2look', '1look'],
  penalties: ['apply', 'ignore'],
  scramble: ['guided', 'paste', 'free'],
  coach: ['live', 'after', 'off'],
  crossHint: ['tab', 'always', 'off'],
  timer: ['visible', 'hide'],
  timeline: ['on', 'off'],
  compare: ['avg', 'pb', 'raw'],
};

export const DEFAULT_SETTINGS = Object.freeze({
  version: 2,
  style: DEFAULT_BRAIN_STYLE,
  method: 'cfop',
  f2l: 'standard',
  oll: '2look',
  pll: '2look',
  inspection: { ...DEFAULT_INSPECTION },
  voice: false,
  penalties: 'apply',
  scramble: 'guided',
  coach: 'live',
  crossHint: 'tab',
  timer: 'visible',
  timeline: 'on',
  compare: 'avg',
  // Automatic sessions (src/store): what you are training (a change starts a new session)
  // and the idle minutes between solves that start one.
  session: { focus: DEFAULT_FOCUS, gapMin: DEFAULT_SESSION_GAP_MIN },
  stats: { source: DEFAULT_STATS_SOURCE },
  toggles: { ...DEFAULT_TOGGLES },
});

// Presets for the command line and the settings panel.
export const PRESETS = {
  wca: { inspection: { ...DEFAULT_INSPECTION } },
  relaxed: { inspection: { mode: 'unlimited', overtime: 'count' } },
  drill: { inspection: { mode: 'off' } },
};

/** Validate any (possibly partial or stale) settings object into a full one. */
export function normalizeSettings(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULT_SETTINGS, toggles: { ...DEFAULT_TOGGLES }, inspection: { ...DEFAULT_INSPECTION }, session: { ...DEFAULT_SETTINGS.session }, stats: { ...DEFAULT_SETTINGS.stats } };
  for (const [key, allowed] of Object.entries(ENUMS)) if (allowed.includes(input[key])) out[key] = input[key];
  if (typeof input.voice === 'boolean') out.voice = input.voice;
  if (input.session && typeof input.session === 'object') {
    out.session = { focus: normalizeFocus(input.session.focus), gapMin: normalizeGapMin(input.session.gapMin ?? DEFAULT_SESSION_GAP_MIN) };
  }
  if (input.stats && typeof input.stats === 'object' && STATS_SOURCES.includes(input.stats.source)) out.stats = { source: input.stats.source };
  if (input.inspection && typeof input.inspection === 'object') out.inspection = normalizeInspection(input.inspection, DEFAULT_INSPECTION);
  if (input.toggles && typeof input.toggles === 'object') {
    for (const key of Object.keys(DEFAULT_TOGGLES)) if (typeof input.toggles[key] === 'boolean') out.toggles[key] = input.toggles[key];
  }
  return out;
}

function read(storage, key) { try { return storage?.getItem(key) ?? null; } catch { return null; } }

/** Load v2 settings, or migrate the v1 per-setting keys the first time. */
export function loadSettings(storage) {
  const stored = read(storage, SETTINGS_KEY);
  if (stored) {
    try { return normalizeSettings(JSON.parse(stored)); } catch { /* fall through to migration */ }
  }
  const legacy = {};
  const method = read(storage, LEGACY_KEYS.method);
  if (method) legacy.method = method;
  if (read(storage, LEGACY_KEYS.pseudo) === 'true') legacy.f2l = 'pseudo';
  if (read(storage, LEGACY_KEYS.inspection) === 'false') legacy.inspection = normalizeInspection({ enabled: false });
  const toggles = read(storage, LEGACY_KEYS.toggles);
  if (toggles) { try { legacy.toggles = JSON.parse(toggles); } catch { /* ignore */ } }
  return normalizeSettings(legacy);
}

export function saveSettings(storage, settings) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* keep in memory */ }
  return settings;
}

/**
 * Set one setting by path ('oll', 'inspection', 'inspection.seconds',
 * 'toggles.crossSuggest', 'preset'). Inspection values go through the live
 * tracker's normalizeInspection, so the legacy {enabled} shape works too.
 * Returns a new normalized settings object.
 */
export function setSetting(settings, path, value) {
  const [head, sub] = String(path).split('.');
  if (head === 'preset') {
    const preset = PRESETS[value];
    return preset ? normalizeSettings({ ...settings, ...preset, inspection: normalizeInspection(preset.inspection, DEFAULT_INSPECTION) }) : settings;
  }
  if (head === 'inspection') {
    const patch = sub ? { [sub]: value } : value;
    return normalizeSettings({ ...settings, inspection: normalizeInspection(patch && typeof patch === 'object' ? patch : {}, settings.inspection) });
  }
  if (head === 'toggles' && sub) return normalizeSettings({ ...settings, toggles: { ...settings.toggles, [sub]: Boolean(value) } });
  if (head === 'session' && sub) return normalizeSettings({ ...settings, session: { ...settings.session, [sub]: value } });
  if (head === 'stats' && sub) return normalizeSettings({ ...settings, stats: { ...settings.stats, [sub]: value } });
  if (head === 'voice') return normalizeSettings({ ...settings, voice: Boolean(value) });
  return normalizeSettings({ ...settings, [head]: value });
}

/** Read a setting by path. */
export function getSetting(settings, path) {
  return String(path).split('.').reduce((obj, key) => obj?.[key], settings);
}

// --- Panel and config bar ---------------------------------------------------

const LABELS = {
  style: { orbit: 'orbit', mono: 'mono' },
  theme: { light: 'light', dark: 'dark', system: 'system' },
  method: { cfop: 'cfop', roux: 'roux' },
  f2l: { standard: 'standard', pseudo: 'pseudo pairs' },
  oll: { '2look': 'oll 2-look', '1look': 'oll 1-look' },
  pll: { '2look': 'pll 2-look', '1look': 'pll 1-look' },
  penalties: { apply: 'wca penalties', ignore: 'no penalties' },
  scramble: { guided: 'guided', paste: 'paste', free: 'free' },
  coach: { live: 'live', after: 'after solve', off: 'off' },
  crossHint: { tab: 'on tab', always: 'always', off: 'off' },
  timer: { visible: 'visible', hide: 'hide while solving' },
  timeline: { on: 'on', off: 'off' },
  compare: { avg: 'vs avg', pb: 'vs PB', raw: 'raw' },
  'inspection.mode': { wca: 'WCA 15 s', custom: 'custom', unlimited: 'unlimited', off: 'off' },
  'inspection.overtime': { wca: 'WCA +2 / DNF', count: 'count only', grace: 'grace', autostart: 'auto-start' },
  'inspection.gracePenalty': { plus2: '+2', dnf: 'DNF', none: 'none' },
  'stats.source': { smart: 'smart cube', manual: 'manual timer', all: 'all' },
  'inspection.callouts': { true: '8 s + 12 s', false: 'off' },
  voice: { true: 'on', false: 'off' },
};

const FOCUS_LABELS = { speed: 'speed', flow: 'flow', learning: 'learning' };

const HELP = {
  style: 'Orbit: ring timeline around the cube. Mono: compact lanes.',
  theme: 'Light or dark for the whole site. System follows your device.',
  method: 'The timeline stages follow the method.',
  f2l: 'Pseudo pairs count pairs solved with a D offset.',
  oll: '2-look splits OLL into edges (EO) then corners (CO).',
  pll: '2-look splits PLL into corners (CP) then edges (EP).',
  'inspection.mode': 'WCA gives 15 s. Off starts the clock on your first turn.',
  'inspection.seconds': 'Custom inspection length in seconds.',
  'inspection.overtime': 'What happens when inspection runs over.',
  'stats.source': 'Choose which solve sources appear in comparisons and stats.',
  'inspection.graceSeconds': 'Extra seconds before the grace penalty applies.',
  'inspection.gracePenalty': 'Penalty after the grace period.',
  'inspection.callouts': 'Judge calls at 8 s and 12 s.',
  voice: 'Speak the callouts.',
  penalties: 'Count +2 and DNF in averages.',
  scramble: 'Guided cues each move. Paste uses your scramble. Free starts from your scramble.',
  coach: 'When coach insights appear.',
  crossHint: 'Show a suggested cross during inspection.',
  timer: 'Hide the running clock to focus on the cube.',
  timeline: 'Show the stage timeline.',
  compare: 'What split deltas compare against.',
};

const ROW_LABELS = {
  style: 'style', theme: 'mode', method: 'method', f2l: 'F2L pairs', oll: 'OLL', pll: 'PLL',
  'inspection.mode': 'inspection', 'inspection.seconds': 'seconds', 'inspection.overtime': 'overtime',
  'inspection.graceSeconds': 'grace', 'inspection.gracePenalty': 'then', 'inspection.callouts': 'callouts', voice: 'voice',
  penalties: 'penalties', scramble: 'scramble', coach: 'coach', crossHint: 'cross hint', timer: 'timer',
  timeline: 'timeline', compare: 'split compare', 'stats.source': 'stats source',
};

const SECTIONS = [
  { id: 'look', label: 'look', rows: ['style', 'theme'] },
  { id: 'method', label: 'method', rows: ['method', 'f2l', 'oll', 'pll'] },
  { id: 'inspection', label: 'inspection', rows: ['inspection.mode', 'inspection.seconds', 'inspection.overtime', 'inspection.graceSeconds', 'inspection.gracePenalty', 'inspection.callouts', 'voice', 'penalties'] },
  { id: 'solve', label: 'solve', rows: ['scramble', 'coach', 'crossHint', 'timer', 'timeline', 'compare'] },
  { id: 'stats', label: 'stats', rows: ['stats.source'] },
];

// The site appearance lives in src/theme.js, not in the Brain settings; the panel shows it as one more row.
export const THEME_MODES = ['light', 'dark', 'system'];
const valuesFor = path => {
  if (path === 'theme') return THEME_MODES;
  if (ENUMS[path]) return ENUMS[path];
  if (path === 'inspection.mode') return ['wca', 'custom', 'unlimited', 'off'];
  if (path === 'inspection.overtime') return ['wca', 'count', 'grace', 'autostart'];
  if (path === 'inspection.gracePenalty') return ['plus2', 'dnf', 'none'];
  if (path === 'inspection.callouts' || path === 'voice') return [true, false];
  if (path === 'stats.source') return STATS_SOURCES;
  return [];
};

function rowVisible(settings, path) {
  const insp = settings.inspection;
  if (path === 'method') return ENUMS.method.length > 1;
  if (path === 'inspection.seconds') return insp.mode === 'custom';
  if (path === 'inspection.graceSeconds' || path === 'inspection.gracePenalty') return insp.mode !== 'off' && insp.mode !== 'unlimited' && insp.overtime === 'grace';
  if (path === 'inspection.overtime' || path === 'inspection.callouts' || path === 'voice') return insp.mode === 'wca' || insp.mode === 'custom';
  if (path === 'f2l' || path === 'oll' || path === 'pll') return settings.method === 'cfop';
  return true;
}

/**
 * SettingsPanelVM for the expanded settings panel.
 * `themePreference` is the site mode ('light' | 'dark' | 'system') from src/theme.js.
 */
export function buildSettingsPanel(settings, open = false, themePreference = 'system') {
  return {
    open,
    sections: SECTIONS.map(section => ({
      id: section.id,
      label: section.label,
      rows: section.rows.filter(path => rowVisible(settings, path)).map(path => {
        const value = path === 'theme' ? themePreference : getSetting(settings, path);
        if (path === 'inspection.seconds' || path === 'inspection.graceSeconds') {
          const def = getSetting(DEFAULT_SETTINGS, path);
          return { id: path, label: ROW_LABELS[path], help: HELP[path] || '', control: 'number', options: [], value, isDefault: value === def };
        }
        const def = path === 'theme' ? 'system' : getSetting(DEFAULT_SETTINGS, path);
        return {
          id: path, label: ROW_LABELS[path], help: HELP[path] || '', control: 'segmented',
          options: valuesFor(path).map(v => ({ value: String(v), label: LABELS[path]?.[String(v)] ?? String(v), active: v === value, isDefault: v === def })),
        };
      }),
    })).filter(section => section.rows.length),
  };
}

/** A short text for the inspection setting, e.g. 'insp 15s', 'insp 10s', 'insp ∞', 'insp off'. */
export function inspectionLabel(inspection) {
  if (inspection.mode === 'off') return 'insp off';
  if (inspection.mode === 'unlimited') return 'insp ∞';
  return `insp ${inspection.mode === 'custom' ? inspection.seconds : 15}s`;
}

/**
 * ConfigBarVM: the one-line monkeytype-style bar. Clicking an option
 * dispatches setSetting(item.id, option.value): segmented items list every
 * value; single-option toggles (pseudo pairs, penalties) carry the value
 * they switch to.
 */
export function buildConfigBar(settings) {
  const seg = (id, values, current, labels = LABELS[id], label) => ({
    id, ...(label ? { label } : {}),
    options: values.map(v => ({ value: v, label: labels?.[v] ?? v, active: v === current })),
  });
  const look = { '2look': '2-look', '1look': '1-look' };
  // A choice of one is not a choice: the method item appears once there are two.
  const items = ENUMS.method.length > 1 ? [seg('method', ENUMS.method, settings.method)] : [];
  if (settings.method === 'cfop') {
    items.push({ id: 'f2l', options: [{ value: settings.f2l === 'pseudo' ? 'standard' : 'pseudo', label: 'pseudo pairs', active: settings.f2l === 'pseudo' }] });
    items.push(seg('oll', ['1look', '2look'], settings.oll, look, 'oll'));
    items.push(seg('pll', ['1look', '2look'], settings.pll, look, 'pll'));
  }
  const insp = settings.inspection;
  items.push(seg('inspection.mode', ['wca', 'custom', 'unlimited', 'off'], insp.mode, { wca: '15s', custom: `${insp.seconds}s`, unlimited: '∞', off: 'off' }, 'insp'));
  items.push({ id: 'penalties', options: [{ value: settings.penalties === 'apply' ? 'ignore' : 'apply', label: 'wca penalties', active: settings.penalties === 'apply' }] });
  items.push(seg('session.focus', FOCI, settings.session.focus, FOCUS_LABELS, 'focus'));
  items.push(seg('stats.source', STATS_SOURCES, settings.stats.source, LABELS['stats.source'], 'stats'));
  return { items };
}

// --- Command line --------------------------------------------------------------

const ON = ['on', 'true', 'yes', '1', 'show'];
const OFF = ['off', 'false', 'no', '0', 'hide'];

/**
 * Parse a command-line entry into { path, value }, or null.
 *   insp 10 | insp wca | insp off | insp unlimited | insp inf
 *   overtime count | grace 3 | grace dnf | callouts off | voice on
 *   oll 1 | pll 2-look | method cfop | pseudo on
 *   style orbit | mode dark | light | system | timer hide | coach after | timeline off | compare pb
 *   scramble paste | penalties off | preset relaxed | session 45 (idle minutes that start a new session)
 *   focus speed | flow | learning (also: speed / flow / learning)
 */
export function parseCommand(text) {
  const [cmdRaw, ...rest] = String(text || '').trim().toLowerCase().split(/\s+/);
  const cmd = cmdRaw || '';
  const arg = rest.join(' ');
  const num = Number.parseFloat(arg);
  switch (cmd) {
    case 'insp': case 'inspection': {
      if (Number.isFinite(num)) return { path: 'inspection', value: { mode: 'custom', seconds: num } };
      if (arg === 'wca' || arg === '15') return { path: 'inspection', value: { mode: 'wca' } };
      if (OFF.includes(arg)) return { path: 'inspection', value: { mode: 'off' } };
      if (['unlimited', 'inf', '∞', 'infinite'].includes(arg)) return { path: 'inspection', value: { mode: 'unlimited' } };
      return null;
    }
    case 'overtime': return ['wca', 'count', 'grace', 'autostart'].includes(arg) ? { path: 'inspection.overtime', value: arg }
      : arg === 'auto' ? { path: 'inspection.overtime', value: 'autostart' } : null;
    case 'grace': {
      if (Number.isFinite(num)) return { path: 'inspection', value: { overtime: 'grace', graceSeconds: num } };
      const penalty = { '+2': 'plus2', plus2: 'plus2', dnf: 'dnf', none: 'none' }[arg];
      return penalty ? { path: 'inspection', value: { overtime: 'grace', gracePenalty: penalty } } : null;
    }
    case 'callouts': return ON.includes(arg) ? { path: 'inspection.callouts', value: true } : OFF.includes(arg) ? { path: 'inspection.callouts', value: false } : null;
    case 'voice': return ON.includes(arg) ? { path: 'voice', value: true } : OFF.includes(arg) ? { path: 'voice', value: false } : null;
    case 'oll': case 'pll': {
      const look = arg.startsWith('1') ? '1look' : arg.startsWith('2') ? '2look' : null;
      return look ? { path: cmd, value: look } : null;
    }
    case 'method': return ENUMS.method.includes(arg) ? { path: 'method', value: arg } : null;
    case 'cfop': case 'roux': return ENUMS.method.includes(cmd) ? { path: 'method', value: cmd } : null;
    case 'pseudo': return ON.includes(arg) || arg === '' ? { path: 'f2l', value: 'pseudo' } : OFF.includes(arg) ? { path: 'f2l', value: 'standard' } : null;
    case 'style': return BRAIN_STYLES.includes(arg) ? { path: 'style', value: arg } : null;
    case 'mode': case 'theme': return THEME_MODES.includes(arg) ? { path: 'theme', value: arg } : BRAIN_STYLES.includes(arg) ? { path: 'style', value: arg } : null;
    case 'light': case 'dark': case 'system': return { path: 'theme', value: cmd };
    case 'orbit': case 'mono': return { path: 'style', value: cmd };
    case 'timer': return ON.includes(arg) || arg === 'visible' ? { path: 'timer', value: 'visible' } : OFF.includes(arg) ? { path: 'timer', value: 'hide' } : null;
    case 'coach': return ENUMS.coach.includes(arg) ? { path: 'coach', value: arg } : ON.includes(arg) ? { path: 'coach', value: 'live' } : null;
    case 'hint': case 'crosshint': return ENUMS.crossHint.includes(arg) ? { path: 'crossHint', value: arg } : null;
    case 'timeline': return ON.includes(arg) ? { path: 'timeline', value: 'on' } : OFF.includes(arg) ? { path: 'timeline', value: 'off' } : null;
    case 'compare': return { avg: 'avg', average: 'avg', pb: 'pb', raw: 'raw', off: 'raw' }[arg] ? { path: 'compare', value: { avg: 'avg', average: 'avg', pb: 'pb', raw: 'raw', off: 'raw' }[arg] } : null;
    case 'scramble': return ENUMS.scramble.includes(arg) ? { path: 'scramble', value: arg } : null;
    case 'penalties': return ON.includes(arg) || arg === 'apply' ? { path: 'penalties', value: 'apply' } : OFF.includes(arg) || arg === 'ignore' ? { path: 'penalties', value: 'ignore' } : null;
    case 'session': case 'sessiongap': return Number.isFinite(num) && num > 0 ? { path: 'session.gapMin', value: num } : null;
    case 'focus': return FOCI.includes(arg) ? { path: 'session.focus', value: arg } : null;
    case 'speed': case 'flow': case 'learning': return { path: 'session.focus', value: cmd };
    case 'preset': return PRESETS[arg] ? { path: 'preset', value: arg } : null;
    default: return null;
  }
}
