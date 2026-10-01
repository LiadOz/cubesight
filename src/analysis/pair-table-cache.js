// Optional pair/cross pruning tables are a small, on-demand worker cache. The
// compact 332 KB PDB remains the synchronous default; this cache adds four
// exact 24^4 byte projections only when memory allows and a pair refinement
// actually runs.
import {
  PAIR_CROSS_TABLE_BYTES, PAIR_CROSS_TABLE_VERSION, buildPairCrossTables,
  installPairCrossTables, tableStats,
} from './pair-completion.js';

const DB_NAME = 'cubesight-analysis-search-v1';
const STORE = 'pdb';
const CACHE_KEY = `pair-cross-v${PAIR_CROSS_TABLE_VERSION}`;
const MEMORY_BUDGET_BYTES = 2 * 1024 * 1024;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    let request;
    try { request = indexedDB.open(DB_NAME, 1); }
    catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => resolve(null);
  });
}

async function readCachedTables() {
  const db = await openDb();
  if (!db) return null;
  try {
    const result = await new Promise(resolve => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(CACHE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
    return result;
  } catch { return null; }
  finally { db.close(); }
}

async function writeCachedTables(tables) {
  const db = await openDb();
  if (!db) return false;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ version: PAIR_CROSS_TABLE_VERSION, bytes: PAIR_CROSS_TABLE_BYTES, tables }, CACHE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Pair table cache write failed'));
    });
    return true;
  } catch { return false; }
  finally { db.close(); }
}

export function installCachedPairCrossTables(row) {
  if (!row || row.version !== PAIR_CROSS_TABLE_VERSION || row.bytes !== PAIR_CROSS_TABLE_BYTES || !Array.isArray(row.tables) || row.tables.length !== 4) return null;
  const tables = row.tables.map(table => table instanceof Uint8Array ? table : table instanceof ArrayBuffer ? new Uint8Array(table) : null);
  return tables.every(Boolean) && installPairCrossTables(tables);
}

/** Load a validated cached table set or build/store it once. Returns false when
 * the optional 1.27 MiB set exceeds the configured memory budget/device tier. */
export async function preparePairCrossTables({ signal, memoryBudgetBytes = MEMORY_BUDGET_BYTES } = {}) {
  if (tableStats().pairCross === 4) return true;
  const deviceMemoryGiB = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
  if (PAIR_CROSS_TABLE_BYTES > memoryBudgetBytes || (Number.isFinite(deviceMemoryGiB) && deviceMemoryGiB <= 1)) return false;
  if (installCachedPairCrossTables(await readCachedTables())) return true;
  if (signal?.aborted) return false;
  const tables = buildPairCrossTables();
  // The tables are generated from fixed primitive transitions and validated
  // at install time. Storage is a best-effort acceleration, never a dependency.
  await writeCachedTables(tables);
  return true;
}

export const pairTableCacheLimits = Object.freeze({ bytes: PAIR_CROSS_TABLE_BYTES, memoryBudgetBytes: MEMORY_BUDGET_BYTES, version: PAIR_CROSS_TABLE_VERSION });
