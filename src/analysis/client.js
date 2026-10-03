// Main-thread client of the analysis worker. The worker (and the WASM tables it builds, about
// 0.5 to 0.8 s once) loads on first use, runs one analysis at a time, and is dropped after a short
// idle spell. Results are cached per record `at` (and per engine version), so reopening a solve is
// free. Everything stays on this device.
import { analysisInputFromRecord } from './record.js';
import { SUMMARY_VERSION } from './summary.js';
import { ENGINE_VERSION } from './segment.js';

const IDLE_MS = 30_000;
const TIMEOUT_MS = 45_000;

/**
 * @param {{createWorker?:()=>Worker, idleMs?:number, timeoutMs?:number}} [options]  createWorker is injectable for tests
 */
export function createAnalysisClient({
  createWorker = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }),
  idleMs = IDLE_MS, timeoutMs = TIMEOUT_MS,
} = {}) {
  let worker = null;
  let idleTimer = 0;
  let nextId = 0;
  let chain = Promise.resolve();
  const pending = new Map();
  const cache = new Map();   // `${at}` -> Promise<summary|null>

  function drop(error) {
    clearTimeout(idleTimer);
    worker?.terminate();
    worker = null;
    for (const item of pending.values()) { clearTimeout(item.timer); item.cleanup?.(); item.reject(error ?? new Error(/* copy-ok: worker error consumed by the review adapter */ 'Analysis worker stopped')); }
    pending.clear();
  }

  function ensure() {
    if (worker) return worker;
    worker = createWorker();
    worker.onmessage = ({ data }) => {
      const item = pending.get(data?.id);
      if (!item) return;
      if (data.type === 'progress') {
        if (item.signal?.aborted) return;
        try { item.onProgress?.(data.result); } catch { /* a view observer cannot break worker delivery */ }
        return;
      }
      pending.delete(data.id);
      clearTimeout(item.timer);
      item.cleanup?.();
      if (data.type === 'result') item.resolve(data.result); else item.reject(new Error(data.message || /* copy-ok: worker error consumed by the review adapter */ 'Analysis failed'));
    };
    worker.onerror = event => drop(new Error(event?.message || /* copy-ok: worker error consumed by the review adapter */ 'The analysis worker failed to load'));
    return worker;
  }

  function run(input, onProgress, signal) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      clearTimeout(idleTimer);
      const w = ensure();
      const timer = setTimeout(() => drop(new Error(/* copy-ok: worker error consumed by the review adapter */ 'Analysis timed out')), timeoutMs);
      const cancel = () => w.postMessage({ type: 'cancel', id });
      if (signal?.aborted) { clearTimeout(timer); resolve(null); return; }
      signal?.addEventListener('abort', cancel, { once: true });
      pending.set(id, { resolve, reject, timer, onProgress, signal, cleanup: () => signal?.removeEventListener('abort', cancel) });
      w.postMessage({ type: 'analyze', id, input, summary: true, options: { pairs: true, startPlan: true } });
    }).finally(() => {
      if (!pending.size) { clearTimeout(idleTimer); idleTimer = setTimeout(() => drop(), idleMs); }
    });
  }

  return {
    /**
     * The compact summary (summary.js) for a record, or null when the record cannot be analysed
     * (free solve, missing scramble/moves, inconsistent move count) or the analysis failed. Never rejects.
     */
    analyze(record, { onProgress, signal } = {}) {
      const stored = record?.analysis;
      const upgradePending = stored?.pairs?.some(pair => pair.pendingUpgrade);
      if (stored && stored.v === SUMMARY_VERSION && stored.engine === ENGINE_VERSION && !upgradePending) return Promise.resolve(stored);
      const { input } = analysisInputFromRecord(record);
      if (!input) return Promise.resolve(null);
      const key = String(record.at);
      if (cache.has(key)) return cache.get(key);
      const job = (chain = chain.then(() => run(input, onProgress, signal), () => run(input, onProgress, signal)))
        .then(result => { if (result === null) cache.delete(key); return result; })
        .catch(() => { cache.delete(key); return null; });
      cache.set(key, job);
      return job;
    },
    /** Drop the worker now (tests, detach). */
    destroy() { drop(); },
    get cached() { return cache.size; },
  };
}

let shared = null;
/** The page-wide client (lazy: nothing loads until the first analysis). */
export function analysisClient() { return shared ??= createAnalysisClient(); }
