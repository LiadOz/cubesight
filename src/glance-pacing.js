/**
 * Pure pacing policy for glance mode.
 * Adaptive evidence is deliberately accumulated outside the UI so it can be
 * tested without a browser and so a triple case can count as one outcome.
 */
export const GLANCE_PACING = Object.freeze({
  MIN_MS: 25,
  MAX_MS: 1500,
  DEFAULT_MS: 600,
  BATCH_SIZE: 10,
  FASTER_STEP_MS: 50,
  SLOWER_STEP_MS: 100,
});

const clamp = (ms) => Math.min(GLANCE_PACING.MAX_MS, Math.max(GLANCE_PACING.MIN_MS, Math.round(ms)));

// Use broad steps when there is plenty of exposure time, then finer steps as
// the policy approaches the browser/display floor. This reaches MIN_MS
// exactly and remains there instead of stepping below it.
const fasterStep = (ms) => {
  if (ms > 150) return 50;
  if (ms > 100) return 25;
  if (ms > 50) return 10;
  return 5;
};

export function createGlancePacing({ mode = 'adaptive', exposureMs = GLANCE_PACING.DEFAULT_MS } = {}) {
  let pacingMode = mode === 'fixed' ? 'fixed' : 'adaptive';
  let currentMs = clamp(exposureMs);
  let evidence = [];

  const snapshot = () => ({
    mode: pacingMode,
    exposureMs: currentMs,
    evidence: [...evidence],
    progress: evidence.length,
    batchSize: GLANCE_PACING.BATCH_SIZE,
  });

  return {
    get mode() { return pacingMode; },
    get exposureMs() { return currentMs; },
    get progress() { return evidence.length; },
    snapshot,
    reset() { evidence = []; return snapshot(); },
    setMode(mode) {
      pacingMode = mode === 'fixed' ? 'fixed' : 'adaptive';
      evidence = [];
      return snapshot();
    },
    setExposure(ms) {
      currentMs = clamp(Number(ms) || GLANCE_PACING.DEFAULT_MS);
      evidence = [];
      return snapshot();
    },
    record(correct, eligible = true) {
      if (pacingMode !== 'adaptive' || !eligible) return { changed: false, ...snapshot() };
      evidence.push(Boolean(correct));
      if (evidence.length < GLANCE_PACING.BATCH_SIZE) return { changed: false, ...snapshot() };
      const accuracy = evidence.filter(Boolean).length / evidence.length;
      const before = currentMs;
      if (accuracy >= 0.9) currentMs = clamp(currentMs - fasterStep(currentMs));
      else if (accuracy <= 0.7) currentMs = clamp(currentMs + GLANCE_PACING.SLOWER_STEP_MS);
      evidence = [];
      return { changed: currentMs !== before, accuracy, ...snapshot() };
    },
  };
}
