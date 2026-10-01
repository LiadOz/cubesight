const median = values => {
  if (!values.length) return null;
  const rows = [...values].sort((a, b) => a - b);
  const mid = rows.length >> 1;
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2;
};

/** Per-turn gaps, attempt execution time, TPS and pauses over the user's threshold. */
export function attemptMetrics({ moveTimes = [], startedAt = null, moveCount = moveTimes.length, thresholdMs = null } = {}) {
  const times = moveTimes.filter(Number.isFinite).map(Number);
  if (!times.length) return { executionMs: null, tps: null, moveTimes: [], hotspots: [], medianGapMs: null };
  const origin = Number.isFinite(startedAt) ? startedAt : times[0];
  const relative = times.map(time => Math.max(0, Math.round(time - origin)));
  const gaps = relative.map((time, i) => i === 0 ? time : time - relative[i - 1]);
  const valid = gaps.slice(1).filter(n => n >= 0);
  const middle = median(valid);
  const pauseThreshold = thresholdMs ?? Math.max(500, middle == null ? 500 : middle * 2.5);
  const executionMs = relative.at(-1);
  return {
    executionMs: Math.round(executionMs),
    tps: executionMs > 0 ? Math.round((moveCount * 1000 / executionMs) * 100) / 100 : null,
    moveTimes: relative,
    gaps,
    medianGapMs: middle == null ? null : Math.round(middle),
    hotspots: gaps.map((ms, index) => ({ index, ms: Math.round(ms) })).filter(row => row.ms > pauseThreshold),
  };
}

export function personalBest(attempts = [], current = null) {
  const values = [...attempts.map(row => row.executionMs), current].filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}
