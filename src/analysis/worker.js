// Web Worker entry for the solve analysis: loads the xcross WASM (like cross-solver-worker.js) and
// answers { type: 'analyze', id, input, options, summary } with the analysis handler.
// The synchronous WASM search runs here, never on the UI thread. Loaded lazily by client.js.
import createXCross from '../xcross-wasm/xcross.js';
import wasmUrl from '../xcross-wasm/xcross.wasm?url';
import { createAnalysisHandler } from './index.js';
import { cachedSolver, createWasmSolver } from './wasm-solver.js';

let modulePromise;
const load = () => modulePromise ||= createXCross({ locateFile: () => wasmUrl });
const jobs = new Map();

self.onmessage = ({ data }) => {
  if (data?.type === 'cancel') { jobs.get(data.id)?.abort(); return; }
  if (data?.type !== 'analyze') return;
  const abortController = new AbortController();
  jobs.set(data.id, abortController);
  void (async () => {
    try {
      const solver = createWasmSolver(await load());
      // A fresh memo per analysis: positions repeat inside one solve, not across solves.
      // Pair search yields through a macrotask between stages, so cancellation messages
      // can be delivered and acted on before its more expensive refinement pass.
      await createAnalysisHandler(() => cachedSolver(solver), message => self.postMessage(message))({
        ...data, options: { ...data.options, signal: abortController.signal },
      });
    } catch (error) {
      self.postMessage({ type: 'error', id: data.id, message: error?.message || String(error) });
    } finally {
      jobs.delete(data.id);
    }
  })();
};
