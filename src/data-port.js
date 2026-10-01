// Export and import of the user's own local data.
//
// The app stores everything locally and sends nothing to a server. This module
// lets a user back up or move their own progress (training history, solve
// metrics, smart-cube MAC cache, trainer settings) as a single JSON blob, and
// restore it on another device or browser profile. It touches only localStorage
// keys the app owns (the `cubesight-` and `smartcube-ble-mac:` prefixes), so
// it never exports unrelated browser data.
//
// File format. Version 1 (old): { version, exportedAt, data } where `data` maps
// localStorage keys to strings; the solve history was one of them
// ('cubesight-solves-v1'). Version 2 adds `history: { schema, records }` (schema =
// the history schema version, see store/history.js), the
// IndexedDB solve history (uncapped), and leaves the legacy solves key out of
// `data`. Version 1 files still import: their legacy solves blob is read into
// the history (see historyFromImport).

import { cleanRecord, readStoredBlob } from './solve-store.js';
import { SOLVE_STORE_KEY } from './solve-metrics.js';
import { SCHEMA_VERSION } from './store/history.js';
import { cleanPin } from './store/pins.js';

export const EXPORT_VERSION = 2;

const PREFIXES = ['cubesight-', 'smartcube-ble-mac:'];

function isOwnedKey(key) {
  return PREFIXES.some(prefix => String(key).startsWith(prefix));
}

/**
 * Collect every owned localStorage entry into a plain object. Pass the history
 * records (history store `.records`) to write a version 2 export that includes
 * the IndexedDB history; without them the export is the version 1 shape.
 */
export function exportAll(storage, historyRecords = null, pins = null) {
  const data = {};
  const store = storage ?? globalThis.localStorage;
  if (store) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && isOwnedKey(key) && !(historyRecords && key === SOLVE_STORE_KEY)) data[key] = store.getItem(key);
    }
  }
  if (!historyRecords) return store ? { version: 1, exportedAt: new Date().toISOString(), data } : data;
  return { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), data, history: { schema: SCHEMA_VERSION, records: historyRecords }, ...(pins ? { pins: pins.map(cleanPin).filter(Boolean) } : {}) };
}

/** Serialise the export for download. */
export function serializeExport(exportObject) {
  return JSON.stringify(exportObject, null, 2);
}

/** Parse and validate an imported blob. Returns {data} or throws. */
export function parseImport(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || ![1, EXPORT_VERSION].includes(parsed.version) || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Not a valid CubeSight backup file.');
  }
  if (parsed.history !== undefined && !(parsed.history && Array.isArray(parsed.history.records))) {
    throw new Error('Not a valid CubeSight backup file.');
  }
  if (parsed.history && parsed.history.schema > SCHEMA_VERSION) {
    throw new Error('This backup was made by a newer version of CubeSight. Update the app first.');
  }
  if (parsed.pins !== undefined && !Array.isArray(parsed.pins)) throw new Error('Not a valid CubeSight backup file.');
  return parsed;
}

/**
 * Write imported entries back to localStorage. By default this merges
 * (overwrites only the keys present in the backup); pass {clearOwned:true} to
 * first remove every owned key, for a true “restore from backup”.
 */
export function importAll(storage, parsed, { clearOwned = false, skipKeys = [] } = {}) {
  const store = storage ?? globalThis.localStorage;
  if (!store) return;
  if (clearOwned) {
    const toRemove = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && isOwnedKey(key)) toRemove.push(key);
    }
    toRemove.forEach(key => { try { store.removeItem(key); } catch { /* keep going */ } });
  }
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!isOwnedKey(key) || typeof value !== 'string' || skipKeys.includes(key)) continue;
    try { store.setItem(key, value); } catch { /* quota / private mode: skip */ }
  }
}

/**
 * The solve records in a parsed backup: the version 2 `history`, or the legacy
 * solves blob of a version 1 file. Always a cleaned array (possibly empty).
 * Merge them into the history store with importRecords(); pass
 * `skipKeys: [SOLVE_STORE_KEY]` to importAll so the legacy key is not rewritten.
 */
export function historyFromImport(parsed) {
  if (parsed?.history && Array.isArray(parsed.history.records)) return parsed.history.records.map(cleanRecord).filter(Boolean);
  const blob = parsed?.data?.[SOLVE_STORE_KEY];
  if (typeof blob !== 'string') return [];
  return readStoredBlob({ getItem: () => blob })?.records ?? [];
}

/** Pins remain self-contained even when the original solve has been deleted. */
export const pinsFromImport = parsed => (parsed?.pins ?? []).map(cleanPin).filter(Boolean);
