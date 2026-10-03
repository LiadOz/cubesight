import assert from 'node:assert/strict';
import test from 'node:test';
import { comparePerformanceReport, requiredPerformanceMetrics } from '../scripts/perf-budget.mjs';

test('performance budgets enforce absolute limits and optional measured-regression bounds', () => {
  const budgets = { metrics: {
    'startup.desktopMs': { direction: 'max', limit: 1000, regressionBaseline: 700, regressionTolerancePct: 0.15 },
    'frame.phoneFps': { direction: 'min', limit: 50 },
  } };
  assert.deepEqual(comparePerformanceReport({ metrics: { 'startup.desktopMs': 800, 'frame.phoneFps': 55 } }, budgets, []), []);
  assert.deepEqual(comparePerformanceReport({ metrics: { 'startup.desktopMs': 900, 'frame.phoneFps': 49 } }, budgets, []), [
    { metric: 'startup.desktopMs', measured: 900, limit: 1000, regressionBaseline: 700, regressionTolerancePct: 0.15, reason: 'regression tolerance exceeded' },
    { metric: 'frame.phoneFps', measured: 49, limit: 50, reason: 'absolute budget exceeded' },
  ]);
});

test('performance budgets reject absent measurements and empty budgets', () => {
  assert.deepEqual(comparePerformanceReport({ metrics: {} }, { metrics: { 'memory.growthMb': { direction: 'max', limit: 5 } } }, []), [
    { metric: 'memory.growthMb', reason: 'measurement missing or not finite' },
  ]);
  assert.deepEqual(comparePerformanceReport({}, { metrics: {} }, []), [
    { metric: '(report)', reason: 'missing metrics object' },
  ]);
});

test('the performance gate requires budgets for every required scenario and engine metric', () => {
  const budgets = { metrics: Object.fromEntries(requiredPerformanceMetrics.map((name) => [name, { direction: 'max', limit: 100 }])) };
  delete budgets.metrics['startup.routeScriptEncodedBytes'];
  const failures = comparePerformanceReport({ metrics: {} }, budgets);
  assert.ok(failures.some(({ metric, reason }) => metric === 'startup.routeScriptEncodedBytes' && reason === 'required metric has no committed budget'));
});

test('performance budgets reject negative input latency measurements', () => {
  assert.deepEqual(comparePerformanceReport({ metrics: { 'input.keyboardVisualResponseMs': -4.1 } }, {
    metrics: { 'input.keyboardVisualResponseMs': { direction: 'max', limit: 50 } },
  }, []), [
    { metric: 'input.keyboardVisualResponseMs', measured: -4.1, reason: 'negative input latency is invalid' },
  ]);
});
