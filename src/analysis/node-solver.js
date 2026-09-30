// Loads the real xcross WASM in node (tests, scripts). Browser code builds its
// own module (cross-solver-worker.js passes a locateFile) and calls
// createWasmSolver directly; this file is never bundled into the app.
import createXCross from '../xcross-wasm/xcross.js';
import { createWasmSolver } from './wasm-solver.js';

let solverPromise;
export function loadNodeSolver() {
  return solverPromise ||= createXCross({}).then(createWasmSolver);
}
