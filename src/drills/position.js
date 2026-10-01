import { openHistory } from '../store/history.js';

/** Resolve a portable scramble or the exact locally saved position behind a pin link. */
export async function resolveDrillPosition(start, trainer, { historyStore = null } = {}) {
  if (!start?.review) return { moves: start?.moves ?? [], source: start?.from ?? null };
  const store = historyStore ?? await openHistory();
  const pin = store.pins.list.find(item => item.at === start.review.at && item.moveIdx === start.review.moveIdx && item.trainer === trainer);
  if (pin) return {
    moves: [...pin.scramble.split(/\s+/).filter(Boolean), ...pin.movesUpTo],
    pin,
    source: `review:${pin.at}:${pin.moveIdx}`,
  };
  const record = store.records.find(item => item.at === start.review.at);
  if (!record || !Array.isArray(record.solveMoves)) return { moves: [], source: null, missing: true };
  return {
    moves: [...record.scramble.split(/\s+/).filter(Boolean), ...record.solveMoves.slice(0, start.review.moveIdx)],
    record,
    source: `review:${record.at}:${start.review.moveIdx}`,
  };
}
