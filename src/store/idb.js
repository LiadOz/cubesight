// A small promise wrapper over IndexedDB, exposing the backend interface
// described in memory-backend.js. No dependencies. The IndexedDB factory is
// injected (default: the global one) so the wrapper can be exercised with any
// implementation; node tests use the in-memory backend instead.
//
// Database "cubesight-history":
//   solves  keyPath "at"   one object per solve record
//   meta    keyPath "key"  { key, value } (schema version, migration marker)
// The database version (DB_VERSION) only describes these object stores. The
// SCHEMA version of the records lives in meta and is migrated by history.js.

export const DB_NAME = 'cubesight-history';
export const DB_VERSION = 1;

const request = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
});

const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
});

/** Open (creating if needed) the history database. Rejects when IndexedDB is unavailable or blocked. */
export function openIdbBackend({ factory = globalThis.indexedDB, name = DB_NAME } = {}) {
  if (!factory) return Promise.reject(new Error('IndexedDB is not available'));
  return new Promise((resolve, reject) => {
    let opened;
    try { opened = factory.open(name, DB_VERSION); } catch (error) { reject(error); return; }
    opened.onupgradeneeded = () => {
      const db = opened.result;
      if (!db.objectStoreNames.contains('solves')) db.createObjectStore('solves', { keyPath: 'at' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    opened.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    opened.onerror = () => reject(opened.error ?? new Error('Could not open IndexedDB'));
    opened.onsuccess = () => {
      const db = opened.result;
      db.onversionchange = () => db.close();
      resolve({
        kind: 'indexeddb',
        async getAll() {
          const all = await request(db.transaction('solves').objectStore('solves').getAll());
          return all.sort((a, b) => a.at - b.at);
        },
        async getMeta(key) {
          const row = await request(db.transaction('meta').objectStore('meta').get(key));
          return row?.value;
        },
        async apply(batch = {}) {
          const tx = db.transaction(['solves', 'meta'], 'readwrite');
          const solves = tx.objectStore('solves');
          const meta = tx.objectStore('meta');
          if (batch.clear) solves.clear();
          for (const r of batch.put ?? []) solves.put(r);
          for (const at of batch.remove ?? []) solves.delete(at);
          for (const [key, value] of Object.entries(batch.meta ?? {})) meta.put({ key, value });
          await done(tx);
        },
        async close() { db.close(); },
      });
    };
  });
}
