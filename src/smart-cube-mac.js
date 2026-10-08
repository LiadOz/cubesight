const PREFIX = 'cubesight-smartcube-mac-name:';
const VALID_MAC = /^(?:[\da-f]{2}[:-]?){5}[\da-f]{2}$/i;

/**
 * Canonical `AA:BB:CC:DD:EE:FF` for anything the person might type.
 *
 * The dialog used to do `.replace(/[-\s]/g, ':').replace(/(..)(?!$)/g, '$1:')`,
 * which inserts a colon after every two CHARACTERS -- including the colons that
 * were already there. `AA:BB:CC:DD:EE:FF` became `AA::B:B::CC::D:D::EE::F:F`,
 * and the cube library rejected it with "GAN gen2-4 requires a valid 6-byte
 * Bluetooth MAC". Only the separator-less form survived, while the placeholder
 * and the error text both asked for the colon form. Strip every separator
 * first, then group.
 */
export function normaliseMac(mac) {
  const hex = String(mac ?? '').replace(/[^\da-f]/gi, '').toUpperCase();
  return hex.length === 12 ? hex.replace(/(..)(?!$)/g, '$1:') : '';
}

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
