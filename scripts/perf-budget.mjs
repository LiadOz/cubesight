export const requiredPerformanceMetrics = [
  'startup.desktopFirstMeaningfulMs',
  'startup.phoneFirstMeaningfulMs',
  'startup.routeScriptEncodedBytes',
  'smoothness.desktopIdleGyroFps',
  'smoothness.phoneIdleGyroFps',
  'smoothness.connectingRingDesktopFps',
  'smoothness.connectingRingPhoneFps',
  'smoothness.openFullOrbitMorphDesktopFps',
  'smoothness.openFullOrbitMorphPhoneFps',
  'smoothness.liveMoveDesktopFps',
  'smoothness.liveMovePhoneFps',
  'smoothness.solvePlaybackDesktopFps',
  'smoothness.solvePlaybackPhoneFps',
  'smoothness.algorithmPlaybackDesktopFps',
  'smoothness.algorithmPlaybackPhoneFps',
  'input.liveMoveDesktopToAnimationStartMs',
  'input.liveMovePhoneToAnimationStartMs',
  'input.keyboardVisualResponseMs',
  'input.keyboardVisualResponseDesktopMs',
  'analysis.resultRevealDesktopMs',
  'analysis.resultRevealPhoneMs',
  'analysis.workerDesktopConstructorToFirstReplyMs',
  'analysis.workerDesktopConstructorToResultMs',
  'analysis.workerPhoneConstructorToFirstReplyMs',
  'analysis.workerPhoneConstructorToResultMs',
  'memory.routeSwitchGrowthMb',
  'longTasks.maxDuringDesktopSolveMs',
  'longTasks.maxDuringPhoneSolveMs',
  'longTasks.maxDuringDesktopAnimationsMs',
  'longTasks.maxDuringPhoneAnimationsMs',
  'engine.pairSearchTableColdMs',
  'engine.pairSearchMedianMs',
  'engine.pairSearchP95Ms',
  'engine.pairSearchMaxMs',
];

export function comparePerformanceReport(report, budgets, requiredMetrics = requiredPerformanceMetrics) {
  const metrics = report?.metrics;
  if (!metrics || typeof metrics !== 'object') return [{ metric: '(report)', reason: 'missing metrics object' }];
  if (!budgets?.metrics || typeof budgets.metrics !== 'object' || !Object.keys(budgets.metrics).length) {
    return [{ metric: '(budgets)', reason: 'no measured metric budgets configured' }];
  }
  const failures = [];
  for (const name of requiredMetrics) {
    if (!Object.hasOwn(budgets.metrics, name)) failures.push({ metric: name, reason: 'required metric has no committed budget' });
  }
  for (const [name, budget] of Object.entries(budgets.metrics)) {
    const measured = metrics[name];
    if (!Number.isFinite(measured)) {
      failures.push({ metric: name, reason: 'measurement missing or not finite' });
      continue;
    }
    const direction = budget.direction;
    const limit = budget.limit;
    if (!['max', 'min'].includes(direction) || !Number.isFinite(limit)) {
      failures.push({ metric: name, reason: 'budget requires direction and finite limit' });
      continue;
    }
    const absoluteBreach = direction === 'max' ? measured > limit : measured < limit;
    const baseline = budget.regressionBaseline;
    const tolerance = budget.regressionTolerancePct ?? 0.15;
    const regressionBreach = Number.isFinite(baseline) && (direction === 'max'
      ? measured > baseline * (1 + tolerance)
      : measured < baseline * (1 - tolerance));
    if (absoluteBreach || regressionBreach) {
      failures.push({
        metric: name,
        measured,
        limit,
        ...(Number.isFinite(baseline) ? { regressionBaseline: baseline, regressionTolerancePct: tolerance } : {}),
        reason: absoluteBreach ? 'absolute budget exceeded' : 'regression tolerance exceeded',
      });
    }
  }
  return failures;
}
