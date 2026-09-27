import { connectSmartCube } from 'smartcube-web-bluetooth';
import { createSmartCubeSession } from './smart-cube-session.js';
import { getRememberedMac, rememberMac, forgetRememberedMac } from './smart-cube-mac.js';
import { promptMacAddress } from './smart-cube-mac-dialog.js';
import { logConnection } from './smart-cube-diag.js';

// Forget every cached cube address (our per-name cache and the library's
// per-device.id cache) so the next connection derives the MAC from scratch.
export function clearSavedCubeData() {
  const storage = globalThis.localStorage;
  if (!storage) return;
  const toRemove = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && (key.startsWith('cubesight-smartcube-mac-name:') || key.startsWith('smartcube-ble-mac:'))) toRemove.push(key);
  }
  toRemove.forEach(key => { try { storage.removeItem(key); } catch { /* keep going */ } });
  logConnection({ label: 'Cleared saved cube address cache.', kind: 'clear' });
}

// One physical connection and move history shared by every trainer. Protocol
// details stay behind this adapter; consumers only see canonical cube moves.
export const smartCube = createSmartCubeSession(async options => {
  if (!window.isSecureContext || !navigator.bluetooth?.requestDevice) {
    throw new Error('Web Bluetooth needs HTTPS and a supported browser (Chrome or Edge on Android/desktop).');
  }
  let selectedDevice = null;
  let usedRememberedMac = false;
  logConnection({ label: 'Starting connection…', kind: 'start' });
  try {
    const connection = await connectSmartCube({
      ...options,
      // GAN model names and advertisements vary; let the user choose the BLE
      // device, then identify its protocol from the services it exposes.
      deviceSelection: 'any',
      // Give the cube up to 8 s of advertisement watching up front so the
      // library can derive the MAC straight from the BLE manufacturer data —
      // the same source native apps use. This makes the manual prompt a rare
      // last resort rather than the normal path.
      enableAddressSearch: true,
      onStatus: detail => { logConnection({ label: String(detail), kind: 'status' }); },
      macAddressProvider: async (device, finalAttempt) => {
        selectedDevice = device;
        logConnection({ label: `MAC provider called (attempt ${finalAttempt ? 'final' : '1'}, device "${device?.name ?? '?'}", id ${device?.id ?? '?'}).`, kind: 'provider' });
        // Returning null on the non-final attempt lets the library run its own
        // second advertisement watch (up to 5 s more) before we fall back to a
        // previously verified address, and only then to a one-time manual entry.
        if (!finalAttempt) { logConnection({ label: 'Returning null — letting the library watch advertisements again.', kind: 'provider' }); return null; }
        const remembered = getRememberedMac(device.name);
        if (remembered) {
          usedRememberedMac = true;
          logConnection({ label: `Using remembered address from cache: ${remembered}`, kind: 'cache' });
          return remembered;
        }
        // Advertising did not expose the address (Web Bluetooth hides it). Show a
        // self-contained one-time entry dialog — never send the user to another view.
        logConnection({ label: 'Advertising did not expose the address — asking for one-time manual entry.', kind: 'fallback' });
        const entered = await promptMacAddress(device);
        logConnection({ label: entered ? `Manual address entered: ${entered}` : 'Manual entry cancelled.', kind: entered ? 'manual' : 'cancel' });
        return entered;
      },
    });
    // connectSmartCube returns only after it validates decrypted cube data.
    logConnection({ label: `Connected: ${connection.deviceName} · ${connection.protocol?.name ?? ''} · MAC ${connection.deviceMAC || '(none)'}`, kind: 'ok' });
    // Save that proven address as a fallback if the browser's device ID changes.
    if (connection.deviceMAC) rememberMac(connection.deviceName, connection.deviceMAC);
    return connection;
  } catch (error) {
    logConnection({ label: `Connection failed: ${error?.message || error}`, kind: 'error' });
    // Do not silently retry a stale address on the next connection attempt.
    if (usedRememberedMac) forgetRememberedMac(selectedDevice?.name);
    throw error;
  }
});
