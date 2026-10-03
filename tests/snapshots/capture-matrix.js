// Default product routes captured by the F9 route matrix. State captures are
// derived from the complete F8 registration in tests/layout/matrix.js.
export const SNAPSHOT_ROUTES = Object.freeze([
  'solve', 'drills', 'algs', 'demo', 'demo-format', 'history', 'past-solve',
  'replay', 'review-detail', 'progress', 'timer', 'recording',
]);

export const SNAPSHOT_VIEWPORTS = Object.freeze([
  { id: 'phone390', width: 390, height: 844 },
  { id: 'desktop1280', width: 1280, height: 720 },
]);

export const SNAPSHOT_THEMES = Object.freeze(['dark', 'light']);

export const SNAPSHOT_STATES = Object.freeze([
  'idle', 'connecting', 'guided-scramble', 'wrong-turn', 'inspection', 'inspection-overtime', 'solving', 'results',
  'review-detail', 'replay-midway', 'drill-midround', 'alg-playback-midway', 'crowded-markers',
  'timer-inspection', 'timer-running', 'timer-results', 'case-colour-yellow-top',
  'case-colour-white-top', 'case-colour-dual', 'case-colour-neutral', 'case-colour-fixed',
  'goal-unset', 'goal-insufficient', 'goal-progress', 'goal-reached',
  'settings-open', 'debug-open', 'connection-menu-open',
  'f1-idle', 'f1-connecting-full', 'f1-guided-scramble-current-progress', 'f1-wrong-turn-undo',
  'f1-inspection-normal', 'f1-inspection-plus2', 'f1-inspection-dnf-ticks', 'f1-solving-fill',
  'f1-live-results', 'f1-case-choices', 'f1-staged-detail-comparison', 'f1-marker-detail',
  'f1-settings-open', 'f1-past-results-review-deeplink', 'demo-playback-midway',
]);
