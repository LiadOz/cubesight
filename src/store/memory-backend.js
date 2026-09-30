// In-memory storage backend with the same interface as the IndexedDB backend
// (src/store/idb.js). Used by node tests (dependency injection, no fake
// IndexedDB needed) and as the fallback when IndexedDB is unavailable.
//
// Backend interface (all async):
//   getAll()              -> every solve record, sorted by `at`
//   getMeta(key)          -> a stored meta value or undefined
//   apply(batch)          -> one atomic write: { clear?, put?: record[], remove?: at[], meta?: {key: value} }
//   getPins()             -> every pinned moment, oldest first (src/store/pins.js)
//   applyPins(batch)      -> one atomic write: { clear?, put?: pin[], remove?: id[] }
//   close()

export function createMemoryBackend({ records = [], meta = {}, pins = [], failWrites = false } = {}) {
  const pinMap = new Map(pins.map(p => [p.id, structuredClone(p)]));
  const solves = new Map(records.map(r => [r.at, structuredClone(r)]));
  const metaMap = new Map(Object.entries(meta).map(([k, v]) => [k, structuredClone(v)]));
  const backend = {
    kind: 'memory',
    /** test hook: make writes reject, like a full disk */
    failWrites,
    async getAll() { return [...solves.values()].map(r => structuredClone(r)).sort((a, b) => a.at - b.at); },
    async getMeta(key) { return metaMap.has(key) ? structuredClone(metaMap.get(key)) : undefined; },
    async apply(batch = {}) {
      if (backend.failWrites) throw new Error('write failed');
      if (batch.clear) solves.clear();
      for (const r of batch.put ?? []) solves.set(r.at, structuredClone(r));
      for (const at of batch.remove ?? []) solves.delete(at);
      for (const [k, v] of Object.entries(batch.meta ?? {})) metaMap.set(k, structuredClone(v));
    },
    async getPins() { return [...pinMap.values()].map(p => structuredClone(p)).sort((a, b) => a.createdAt - b.createdAt); },
    async applyPins(batch = {}) {
      if (backend.failWrites) throw new Error('write failed');
      if (batch.clear) pinMap.clear();
      for (const p of batch.put ?? []) pinMap.set(p.id, structuredClone(p));
      for (const id of batch.remove ?? []) pinMap.delete(id);
    },
    async close() {},
  };
  return backend;
}
