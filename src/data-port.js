// Export and import of the user's own local data.
//
// The app stores everything locally and sends nothing to a server. This module
// lets a user back up or move their own progress (training history, solve
// metrics, smart-cube MAC cache, trainer settings) as a single JSON blob, and
// restore it on another device or browser profile. It touches only localStorage
// keys the app owns (the `cubesight-` and `smartcube-ble-mac:` prefixes), so
// it never exports unrelated browser data.

const PREFIXES = ['cubesight-', 'smartcube-ble-mac:'];

function isOwnedKey(key) {
  return PREFIXES.some(prefix => String(key).startsWith(prefix));
}

/** Collect every owned localStorage entry into a plain object. */
export function exportAll(storage) {
  const data = {};
  const store = storage ?? globalThis.localStorage;
  if (!store) return data;
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && isOwnedKey(key)) data[key] = store.getItem(key);
  }
  return { version: 1, exportedAt: new Date().toISOString(), data };
}

/** Serialise the export for download. */
export function serializeExport(exportObject) {
  return JSON.stringify(exportObject, null, 2);
}

/** Parse and validate an imported blob. Returns {data} or throws. */
export function parseImport(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Not a valid CubeSight backup file.');
  }
  return parsed;
}

/**
 * Write imported entries back to localStorage. By default this merges
 * (overwrites only the keys present in the backup); pass {clearOwned:true} to
 * first remove every owned key, for a true “restore from backup”.
 */
export function importAll(storage, parsed, { clearOwned = false } = {}) {
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
    if (!isOwnedKey(key) || typeof value !== 'string') continue;
    try { store.setItem(key, value); } catch { /* quota / private mode: skip */ }
  }
}
