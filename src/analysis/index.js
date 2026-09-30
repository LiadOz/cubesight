// Solve analysis entry points. Everything here is pure: the solver is injected
// (see wasm-solver.js / node-solver.js), so the same code runs in node tests and
// inside a Web Worker. Nothing is fetched; all computation is local.
import { segmentSolve } from './segment.js';
import { evaluateCross, evaluateCrossAsync } from './cross-eval.js';

export { segmentSolve, STAGES, STAGE_GROUP, PAUSE_ALLOW_MS, findCancellations, ENGINE_VERSION } from './segment.js';
export { evaluateCross, evaluateCrossAsync } from './cross-eval.js';
export { createWasmSolver, cachedSolver } from './wasm-solver.js';
export { inferCrossFace, relabelMoves, unrelabelMoves, FACE_TO_D } from './normalize.js';

// Segmentation plus cross evaluation in one call (synchronous solver).
export function analyzeSolve(input, solver, options = {}) {
  const segmentation = segmentSolve(input);
  const cross = solver ? evaluateCross({ segmentation, ...options }, solver) : null;
  return { segmentation, cross };
}

// Same, for an async solver (e.g. a worker round trip). Supports AbortSignal.
export async function analyzeSolveAsync(input, solver, { signal, ...options } = {}) {
  const segmentation = segmentSolve(input);
  const cross = solver ? await evaluateCrossAsync({ segmentation, ...options }, solver, { signal }) : null;
  return { segmentation, cross };
}

// Message handler for a Web Worker: post { type: 'analyze', id, input, options }
// and receive { type: 'result', id, result } or { type: 'error', id, message }.
// The segmentation and evaluation results are plain JSON (structured-clonable).
export function createAnalysisHandler(solver, post) {
  return async function onMessage(data) {
    if (data?.type !== 'analyze') return;
    try {
      post({ type: 'result', id: data.id, result: await analyzeSolveAsync(data.input, solver, data.options) });
    } catch (error) {
      post({ type: 'error', id: data.id, message: error?.message || String(error) });
    }
  };
}
