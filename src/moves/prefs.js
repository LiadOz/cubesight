// Move-guide preferences. Kept in their own key so the guide works in any host.
const KEY = 'cubesight-move-guide';
const DEFAULTS = { fingertricks: true, ghost: true };

export function readGuidePrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

export function writeGuidePref(name, value) {
  const next = { ...readGuidePrefs(), [name]: value };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* session-only */ }
  return next;
}
