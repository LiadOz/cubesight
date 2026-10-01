// Timer preferences. Only the hold-to-start delay is the timer's own (localStorage,
// cubesight-timer-v1). Inspection, focus, session gap and the Brain style are SHARED with the
// Brain: they are read from (and inspection changes are written to) the Brain settings
// (src/brain/settings.js), so the two screens always agree.

import { DEFAULT_HOLD_MS, normalizeHoldMs } from './machine.js';

export const TIMER_PREFS_KEY = 'cubesight-timer-v1';

export function loadTimerPrefs(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(TIMER_PREFS_KEY) || 'null');
    return { holdMs: normalizeHoldMs(parsed?.holdMs ?? DEFAULT_HOLD_MS), statsSource: parsed?.statsSource === 'all' ? 'all' : 'manual' };
  } catch {
    return { holdMs: DEFAULT_HOLD_MS, statsSource: 'manual' };
  }
}

export function saveTimerPrefs(storage, prefs) {
  try { storage?.setItem(TIMER_PREFS_KEY, JSON.stringify({ holdMs: normalizeHoldMs(prefs.holdMs), statsSource: prefs.statsSource === 'all' ? 'all' : 'manual' })); } catch { /* keep in memory */ }
  return prefs;
}
