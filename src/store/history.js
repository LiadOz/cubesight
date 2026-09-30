// The solve history: every solve the user has done, kept in IndexedDB with no
// cap. The store keeps the full list in memory (a synchronous `records` array
// for the view-model) and writes every change through to a storage backend
// (src/store/idb.js in the browser, src/store/memory-backend.js in node tests
// and as a fallback), one serialised write at a time.
//
// Schema and migrations
// - `meta.schema` holds the schema version of the stored records
//   (SCHEMA_VERSION). Explicit migrations ({from, to, migrate(records)}) run in
//   order in ONE atomic write that also bumps the version.
// - A version mismatch never empties the history. A failed migration keeps the
//   database untouched and opens it read-only with a warning; a database from a
//   newer app (version > SCHEMA_VERSION) is read leniently, read-only, with a
//   warning, so an older tab can never overwrite newer data.
// - First load on a fresh database copies the old localStorage history
//   ('cubesight-solves-v1', 1000-solve blob), derives sessionIds, verifies the
//   copy read back from the database, and only then records the schema. The
//   localStorage key is left untouched as a backup; it can be removed in the
//   next release once this migration has shipped for a version.

import { cleanRecord, readStoredBlob } from '../solve-store.js';
import { SOLVE_STORE_KEY } from '../solve-metrics.js';
import { DEFAULT_SESSION_GAP_MIN, nextSessionId, deriveSessionIds, normalizeGapMin } from './sessions.js';
import { normalizeFocus } from './focus.js';
import { openIdbBackend } from './idb.js';
import { createMemoryBackend } from './memory-backend.js';

/**
 * Schema 1: records as cleaned by solve-store.js including sessionId.
 * Schema 2: every record has a `focus` (speed | flow | learning).
 */
export const SCHEMA_VERSION = 2;
/** Ordered upgrades between schema versions: { from, to, migrate(records) -> records }. */
export const MIGRATIONS = [
  { from: 1, to: 2, migrate: records => records.map(r => ({ ...r, focus: normalizeFocus(r.focus) })) },
];

const PENALTIES = new Set(['+2', 'DNF']);

const sortByAt = list => list.sort((a, b) => a.at - b.at);
const cleanAll = list => list.map(cleanRecord).filter(Boolean);

/**
 * @param {{backend:Object, legacyStorage?:Storage|null, legacyKey?:string, schemaVersion?:number,
 *   migrations?:Object[], sessionGapMin?:number, warning?:string}} options
 */
export function createHistoryStore({
  backend, legacyStorage = null, legacyKey = SOLVE_STORE_KEY,
  schemaVersion = SCHEMA_VERSION, migrations = MIGRATIONS, sessionGapMin = DEFAULT_SESSION_GAP_MIN, warning = '',
} = {}) {
  let cache = [];
  let readOnly = false;
  let warnings = warning ? [warning] : [];
  let loaded = false;
  let migratedFromLocal = 0;
  let queue = Promise.resolve();
  let gapMin = normalizeGapMin(sessionGapMin);
  let ephemeralSnapshot = null;

  const warn = text => { if (!warnings.includes(text)) warnings = [...warnings, text]; };

  // Serialise writes; a failed write is reported, never thrown into the UI.
  function persist(batch) {
    if (ephemeralSnapshot || readOnly) return queue;
    queue = queue.then(() => backend.apply(batch)).catch(error => {
      warn(`Could not save your history (${error?.message || error}). Export a backup soon.`);
    });
    return queue;
  }

  async function migrateLocal() {
    const legacy = readStoredBlob(legacyStorage, legacyKey);
    if (!legacy || !legacy.records.length) return { records: [], copied: 0 };
    const records = deriveSessionIds(legacy.records, gapMin);
    await backend.apply({ put: records, meta: { schema: schemaVersion, migratedFromLocal: { key: legacyKey, count: records.length, at: Date.now() } } });
    // Verify what was written, read back from the database, before trusting it.
    const back = await backend.getAll();
    const ok = back.length === records.length && records.every((r, i) => back[i].at === r.at && back[i].solveMs === r.solveMs && back[i].penalty === r.penalty);
    if (!ok) {
      await backend.apply({ clear: true, meta: { schema: null, migratedFromLocal: null } }).catch(() => {});
      readOnly = true;
      warn('Your history could not be copied to the new storage, so it is shown read-only. Export a backup and reload.');
      return { records, copied: 0 };
    }
    return { records: cleanAll(back), copied: records.length };
  }

  async function runMigrations(version, records) {
    let current = version;
    let next = records;
    while (current < schemaVersion) {
      const step = migrations.find(m => m.from === current);
      if (!step) throw new Error(`no migration from schema ${current}`);
      next = cleanAll(step.migrate(next));
      current = step.to;
    }
    await backend.apply({ clear: true, put: next, meta: { schema: current } });
    return next;
  }

  const store = {
    /** Open the store: run migrations, read everything. Safe to call once. */
    async load() {
      if (loaded) return store;
      loaded = true;
      try {
        const version = await backend.getMeta('schema');
        if (version == null) {
          const existing = cleanAll(await backend.getAll());
          if (existing.length) {
            cache = deriveSessionIds(existing, gapMin);
            await backend.apply({ put: cache, meta: { schema: schemaVersion } });
          } else {
            const { records, copied } = await migrateLocal();
            cache = records;
            migratedFromLocal = copied;
            if (!copied && !readOnly) await backend.apply({ meta: { schema: schemaVersion } });
          }
        } else if (version > schemaVersion) {
          cache = deriveSessionIds(cleanAll(await backend.getAll()), gapMin);
          readOnly = true;
          warn('This history was saved by a newer version of CubeSight. It is shown read-only here; reload after the app updates.');
        } else {
          const stored = cleanAll(await backend.getAll());
          if (version < schemaVersion) {
            try {
              cache = deriveSessionIds(await runMigrations(version, stored), gapMin);
            } catch (error) {
              cache = deriveSessionIds(stored, gapMin);
              readOnly = true;
              warn(`Your history could not be upgraded (${error?.message || error}), so it is shown read-only.`);
            }
          } else {
            cache = stored;
            // Records written without a session (e.g. by an import) get one now.
            if (cache.some(r => !r.sessionId)) {
              const derived = deriveSessionIds(cache, gapMin);
              const changed = derived.filter((r, i) => r !== cache[i]);
              cache = derived;
              await backend.apply({ put: changed });
            }
          }
        }
      } catch (error) {
        // The database misbehaved. Keep whatever was read; never pretend the history is empty
        // without saying so, and do not write.
        readOnly = true;
        warn(`Your history could not be read (${error?.message || error}).`);
      }
      return store;
    },

    get records() { return cache; },
    get readOnly() { return readOnly; },
    get warning() { return warnings.join(' '); },
    get migratedFromLocal() { return migratedFromLocal; },
    get sessionGapMin() { return gapMin; },
    get kind() { return backend.kind; },

    /** Resolves when every queued write has reached the backend. */
    flush() { return queue; },

    /** Change the idle gap that starts a new session (minutes). Applies to new solves. */
    setSessionGapMin(value) { gapMin = normalizeGapMin(value); return gapMin; },

    /** Re-derive every solve's session with the current gap (after the setting changed). */
    regroupSessions() {
      if (readOnly) return cache;
      const stripped = cache.map(r => ({ ...r, sessionId: null }));
      const derived = deriveSessionIds(stripped, gapMin);
      const changed = derived.filter((r, i) => r.sessionId !== cache[i].sessionId);
      cache = derived;
      if (changed.length) void persist({ put: changed });
      return cache;
    },

    /** Append a finished solve (or replace the one with the same timestamp). Returns the stored record. */
    append(raw) {
      const cleaned = cleanRecord(raw);
      if (!cleaned || readOnly) return null;
      const before = cache.filter(r => r.at < cleaned.at);
      const record = { ...cleaned, sessionId: cleaned.sessionId ?? nextSessionId(before, cleaned.at, gapMin, cleaned.focus) };
      cache = sortByAt([...cache.filter(r => r.at !== record.at), record]);
      void persist({ put: [record] });
      return record;
    },

    /** Delete a solve. Returns the removed record (keep it to offer undo), or null. */
    remove(at) {
      const record = cache.find(r => r.at === at);
      if (!record || readOnly) return null;
      cache = cache.filter(r => r.at !== at);
      void persist({ remove: [at] });
      return record;
    },

    /** Put a previously removed record back (undo). */
    restore(record) { return store.append(record); },

    /** Patch one solve by timestamp. Returns the new record, or null. */
    update(at, patch) {
      const index = cache.findIndex(r => r.at === at);
      if (index < 0 || readOnly) return null;
      const next = cleanRecord({ ...cache[index], ...patch, at });
      if (!next) return null;
      cache = [...cache.slice(0, index), next, ...cache.slice(index + 1)];
      void persist({ put: [next] });
      return next;
    },

    /** Set a solve's penalty: null / 'none' / '+2' / 'DNF'. */
    setPenalty(at, penalty) {
      const value = penalty === 'none' || penalty == null ? null : penalty;
      if (value !== null && !PENALTIES.has(value)) return null;
      return store.update(at, { penalty: value });
    },

    /** Merge (or with {replace:true} replace by) records from a backup. Returns how many were imported. */
    importRecords(list, { replace = false } = {}) {
      if (readOnly) return 0;
      const incoming = cleanAll(Array.isArray(list) ? list : []);
      const merged = new Map(replace ? [] : cache.map(r => [r.at, r]));
      for (const r of incoming) merged.set(r.at, r);
      const derived = deriveSessionIds([...merged.values()], gapMin);
      const byAt = new Map(derived.map(r => [r.at, r]));
      cache = derived;
      void persist(replace
        ? { clear: true, put: derived }
        : { put: incoming.map(r => byAt.get(r.at)) });
      return incoming.length;
    },

    /** Stop persisting and keep changes in memory only (a recording replay). */
    beginEphemeral() { ephemeralSnapshot ??= cache; },
    /** Drop every in-memory change made since beginEphemeral(). */
    endEphemeral() { if (ephemeralSnapshot) { cache = ephemeralSnapshot; ephemeralSnapshot = null; } },
    get ephemeral() { return Boolean(ephemeralSnapshot); },

    /** Re-read everything from the backend (after an import written elsewhere). */
    async reload() {
      await queue;
      if (!readOnly) cache = deriveSessionIds(cleanAll(await backend.getAll()), gapMin);
      return cache;
    },
  };
  return store;
}

// Ask the browser not to evict our data under storage pressure. Best effort.
export async function requestPersistence(storage = globalThis.navigator?.storage) {
  try { return Boolean(await storage?.persist?.()); } catch { return false; }
}

/**
 * The browser entry point: open IndexedDB, load (migrating from localStorage on
 * the first run) and ask for persistent storage. When IndexedDB is unavailable
 * the history lives in memory for this page with a warning, seeded from the
 * localStorage history so the user still sees their solves.
 */
export async function openHistory({
  factory = globalThis.indexedDB, legacyStorage = globalThis.localStorage, sessionGapMin = DEFAULT_SESSION_GAP_MIN,
  persistence = globalThis.navigator?.storage,
} = {}) {
  let backend;
  let warning = '';
  try {
    backend = await openIdbBackend({ factory });
  } catch (error) {
    backend = createMemoryBackend();
    warning = `This browser will not keep your history (${error?.message || error}). Export a backup to keep it.`;
  }
  const store = createHistoryStore({ backend, legacyStorage, sessionGapMin, warning });
  await store.load();
  void requestPersistence(persistence);
  return store;
}
