// Solve analysis entry points. Everything here is pure: the solver is injected
// (see wasm-solver.js / node-solver.js), so the same code runs in node tests and
// inside a Web Worker. Nothing is fetched; all computation is local.
import { segmentSolve } from './segment.js';
import { evaluateCross, evaluateCrossAsync } from './cross-eval.js';
import { evaluatePairs, evaluatePairsAsync } from './pairs.js';
import { summarizeAnalysis } from './summary.js';
import { evaluateLastLayer } from './last-layer.js';

export { segmentSolve, STAGES, STAGE_GROUP, PAUSE_ALLOW_MS, findCancellations, ENGINE_VERSION } from './segment.js';
export { evaluateCross, evaluateCrossAsync } from './cross-eval.js';
export { createWasmSolver, cachedSolver } from './wasm-solver.js';
export { evaluatePairs, evaluatePairsAsync } from './pairs.js';
export { evaluateLastLayer } from './last-layer.js';
export { summarizeAnalysis, SUMMARY_VERSION } from './summary.js';
export { analysisInputFromRecord } from './record.js';
export { inferCrossFace, relabelMoves, unrelabelMoves, FACE_TO_D } from './normalize.js';

// Segmentation plus cross evaluation in one call (synchronous solver).
export function analyzeSolve(input, solver, { pairs: withPairs = false, ...options } = {}) {
  const segmentation = segmentSolve(input);
  const cross = solver ? evaluateCross({ segmentation, ...options }, solver) : null;
  return { segmentation, cross, ...(withPairs && solver ? { pairs: evaluatePairs(segmentation, solver) } : {}) };
}

// Same, for an async solver (e.g. a worker round trip). Supports AbortSignal.
export async function analyzeSolveAsync(input, solver, { signal, onProgress, pairs: withPairs = false, config = null, ...options } = {}) {
  const segmentation = segmentSolve(input);
  const cross = solver ? await evaluateCrossAsync({ segmentation, ...options }, solver, { signal }) : null;
  const pairs = withPairs && solver ? await evaluatePairsAsync(segmentation, solver, {
    ...options, signal, onProgress: progressPairs => onProgress?.({ segmentation, cross, pairs: progressPairs }),
  }) : null;
  let lastLayer = null;
  try { lastLayer = await evaluateLastLayer(segmentation, { config }); }
  catch (error) { if (signal?.aborted) throw error; }
  return { segmentation, cross, ...(pairs ? { pairs } : {}), ...(lastLayer ? { lastLayer } : {}) };
}

// Message handler for a Web Worker: post { type: 'analyze', id, input, options } and receive
// { type: 'result', id, result } or { type: 'error', id, message }. The segmentation and evaluation
// results are plain JSON (structured-clonable). With { summary: true } the result is the compact
// record summary (summary.js) instead of the full analysis; `solver` may be a function returning
// a fresh solver per request (so a per-analysis cache does not grow for the life of the worker).
export function createAnalysisHandler(solver, post) {
  return async function onMessage(data) {
    if (data?.type !== 'analyze') return;
    try {
      const onProgress = partial => post({ type: 'progress', id: data.id, result: data.summary ? summarizeAnalysis(partial) : partial });
      const result = await analyzeSolveAsync(data.input, typeof solver === 'function' ? solver() : solver, { ...data.options, onProgress });
      post({ type: 'result', id: data.id, result: data.summary ? summarizeAnalysis(result) : result });
    } catch (error) {
      post({ type: 'error', id: data.id, message: error?.message || String(error) });
    }
  };
}
