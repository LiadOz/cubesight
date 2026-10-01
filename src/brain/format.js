// Number and result formatting for the Brain. Pure; shared by the view-model,
// the fixtures and the tests so every screen formats times the same way.

import { fmt } from '../copy/terms.js';

/** 14.07, 1:02.34; '—' for no time, 'DNF' for a DNF (Infinity). */
export function fmtTime(ms, digits = 2) {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (!Number.isFinite(ms)) return 'DNF';
  if (digits !== 2) return `${(Math.max(0, ms) / 1000).toFixed(digits)}`;
  // The live clock truncates to hundredths so it never displays time ahead of the cube.
  return fmt.time(Math.floor(ms / 10) * 10);
}

/** A time in prose or a label, with the unit separated by one space. */
export function fmtSeconds(ms) {
  if (ms == null) return '—';
  if (!Number.isFinite(ms)) return 'DNF';
  return fmt.time(ms, { unit: true });
}

/** Split delta vs a reference: '-0.33' / '+0.04' / '±0.00'. */
export function fmtDelta(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  return fmt.delta(ms);
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
  if (record.penalty === 'DNF') return fmt.penalty(record);
  if (record.penalty === '+2') return style === 'long' ? `${fmtTime(raw)} +2` : fmt.penalty(record);
  return fmtTime(raw);
}

/** '+2' / 'dnf' tag for history lists, or ''. */
export function penaltyTag(record) {
  return record?.penalty === '+2' ? '+2' : record?.penalty === 'DNF' ? 'dnf' : '';
}

export const plural = (n, word) => fmt.count(n, word);

/** Moves for display: `R U R'` -> `R U R′` (docs/design/VOICE.md 4.4). Storage stays ASCII. */
export const fmtMoves = text => fmt.moves(text);
