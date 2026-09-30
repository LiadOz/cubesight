// Number and result formatting for the Brain. Pure; shared by the view-model,
// the fixtures and the tests so every screen formats times the same way.

import { PLUS_TWO_MS } from '../solve-metrics.js';

/** 14.07, 1:02.34; '—' for no time, 'DNF' for a DNF (Infinity). */
export function fmtTime(ms, digits = 2) {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (!Number.isFinite(ms)) return 'DNF';
  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(ms) / 1000;
  const factor = 10 ** digits;
  const rounded = Math.floor(abs * factor + 1e-6) / factor;   // a running clock never shows a time it hasn't reached
  if (rounded < 60) return `${sign}${rounded.toFixed(digits)}`;
  const minutes = Math.floor(rounded / 60);
  const seconds = (rounded - minutes * 60).toFixed(digits).padStart(digits ? digits + 3 : 2, '0');
  return `${sign}${minutes}:${seconds}`;
}

/** The legacy Brain seconds format ('14.07s'), kept for the compat phase strings. */
export function fmtSeconds(ms) {
  if (ms == null) return '—';
  if (!Number.isFinite(ms)) return 'DNF';
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Split delta vs a reference: '-0.33' / '+0.04' / '±0.00'. */
export function fmtDelta(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  const value = Math.abs(ms) / 1000;
  const text = value.toFixed(2);
  if (text === '0.00') return '±0.00';
  return `${ms < 0 ? '-' : '+'}${text}`;
}

/** 'faster' | 'slower' | 'even' for a delta in ms (±20 ms counts as even). */
export function deltaTone(ms, evenWithinMs = 20) {
  if (ms == null || !Number.isFinite(ms)) return 'none';
  if (ms < -evenWithinMs) return 'faster';
  if (ms > evenWithinMs) return 'slower';
  return 'even';
}

export function fmtTps(tps) {
  return Number.isFinite(tps) ? tps.toFixed(2) : '—';
}

/**
 * A solve result with its penalty, as the history shows it.
 *   short: '14.97+'     (+2 included in the time), 'DNF(13.20)'
 *   long:  '12.97 +2'   (raw time and tag),         'DNF(13.20)'
 */
export function fmtResult(record, style = 'short') {
  if (!record) return '—';
  const raw = record.solveMs;
  if (record.penalty === 'DNF') return `DNF(${fmtTime(raw)})`;
  if (record.penalty === '+2') return style === 'long' ? `${fmtTime(raw)} +2` : `${fmtTime(raw + PLUS_TWO_MS)}+`;
  return fmtTime(raw);
}

/** '+2' / 'dnf' tag for history lists, or ''. */
export function penaltyTag(record) {
  return record?.penalty === '+2' ? '+2' : record?.penalty === 'DNF' ? 'dnf' : '';
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Moves for display: `R U R'` -> `R U R′` (docs/design/VOICE.md 4.4). Storage stays ASCII. */
export const fmtMoves = text => String(text ?? '').replace(/'/g, '′');
