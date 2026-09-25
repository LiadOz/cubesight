const PREFIX = 'cubesight-smartcube-mac-name:';
const VALID_MAC = /^(?:[\da-f]{2}[:-]?){5}[\da-f]{2}$/i;

function key(name) {
  const normalized = String(name || '').trim();
  return normalized ? PREFIX + normalized : null;
}

// A fallback for browsers that assign a different Bluetooth device ID to a
// previously paired cube. The library's per-ID cache remains the first choice.
export function getRememberedMac(name, storage) {
  const storageKey = key(name);
  if (!storageKey) return null;
  try {
    const mac = (storage ?? globalThis.localStorage).getItem(storageKey);
    return VALID_MAC.test(mac || '') ? mac : null;
  } catch { return null; }
}

export function rememberMac(name, mac, storage) {
  const storageKey = key(name);
  if (!storageKey || !VALID_MAC.test(mac || '')) return;
  try { (storage ?? globalThis.localStorage).setItem(storageKey, mac); } catch { /* Storage may be unavailable. */ }
}

export function forgetRememberedMac(name, storage) {
  const storageKey = key(name);
  if (!storageKey) return;
  try { (storage ?? globalThis.localStorage).removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
}
