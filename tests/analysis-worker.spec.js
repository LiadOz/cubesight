import { test, expect } from 'playwright/test';

const INPUT = {
  scramble: "F R U' R' U R U R2 F' R U R U' R' R U2 R' U' R U' R' F U R U' R' F' U L U' L' U R' U' R U' L' U L U R U' R' D R' D B' D' F' D F",
  moves: "F' D' F D B D' R D' R U R' U' L' U' L U R' U R U' L U L' U' F R U R' U' F' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F'".split(' '),
  crossFace: 'D',
};

test('analysis worker streams, cancels between passes, and persists validated optional tables', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const result = await page.evaluate(async input => {
    const startWorker = () => new Worker(new URL('/src/analysis/worker.js', location.href), { type: 'module' });
    const runToEnd = () => new Promise((resolve, reject) => {
      const worker = startWorker(), messages = [];
      const timeout = setTimeout(() => { worker.terminate(); reject(new Error('worker analysis timed out')); }, 30_000);
      worker.onmessage = ({ data }) => {
        messages.push(data);
        if (data.type === 'result' || data.type === 'error') {
          clearTimeout(timeout); worker.terminate();
          data.type === 'result' ? resolve(messages) : reject(new Error(data.message));
        }
      };
      worker.onerror = event => { clearTimeout(timeout); worker.terminate(); reject(new Error(event.message)); };
      worker.postMessage({ type: 'analyze', id: 1, input, summary: true, options: { pairs: true } });
    });
    const runAndCancel = () => new Promise((resolve, reject) => {
      const worker = startWorker(); let requested = false;
      const timeout = setTimeout(() => { worker.terminate(); reject(new Error('worker cancellation timed out')); }, 30_000);
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress' && !requested) {
          requested = true;
          worker.postMessage({ type: 'cancel', id: 2 });
        } else if (data.type === 'error') {
          clearTimeout(timeout); worker.terminate(); resolve({ requested, message: data.message });
        } else if (data.type === 'result') {
          clearTimeout(timeout); worker.terminate(); reject(new Error('cancelled worker unexpectedly completed'));
        }
      };
      worker.onerror = event => { clearTimeout(timeout); worker.terminate(); reject(new Error(event.message)); };
      worker.postMessage({ type: 'analyze', id: 2, input, summary: true, options: { pairs: true } });
    });
    const readCachedTables = () => new Promise(resolve => {
      const request = indexedDB.open('cubesight-analysis-search-v1', 1);
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('pdb')) { db.close(); resolve(null); return; }
        const tx = db.transaction('pdb', 'readonly');
        const get = tx.objectStore('pdb').get('pair-cross-v1');
        get.onsuccess = () => resolve(get.result ?? null);
        get.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
      };
    });
    const messages = await runToEnd();
    const cacheModule = await import('/src/analysis/pair-table-cache.js');
    const cacheLoaded = await cacheModule.preparePairCrossTables();
    const engineModule = await import('/src/analysis/pair-completion.js');
    const cancelled = await runAndCancel();
    const cache = await readCachedTables();
    return {
      progress: messages.filter(message => message.type === 'progress').map(message => message.result),
      final: messages.at(-1), cancelled,
      cacheLoaded, restoredTableCount: engineModule.tableStats().pairCross,
      cached: cache && { version: cache.version, bytes: cache.bytes, tables: cache.tables?.map(table => ({ isUint8Array: table instanceof Uint8Array, length: table.byteLength })) },
    };
  }, INPUT);

  expect(result.progress.length).toBeGreaterThan(0);
  expect(result.progress.some(summary => summary.pairs.some(pair => pair.pendingUpgrade))).toBe(true);
  expect(result.final.type).toBe('result');
  expect(result.final.result.pairs.every(pair => !pair.pendingUpgrade)).toBe(true);
  expect(result.cancelled).toEqual({ requested: true, message: 'Analysis cancelled' });
  expect(result.cacheLoaded).toBe(true);
  expect(result.restoredTableCount).toBe(4);
  expect(result.cached.version).toBe(1);
  expect(result.cached.bytes).toBe(4 * 24 ** 4);
  expect(result.cached.tables).toHaveLength(4);
  expect(result.cached.tables.every(table => table.isUint8Array && table.length === 24 ** 4)).toBe(true);
});
