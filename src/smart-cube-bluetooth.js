import { connectSmartCube } from 'smartcube-web-bluetooth';
import { createSmartCubeSession } from './smart-cube-session.js';
import { getRememberedMac, rememberMac, forgetRememberedMac } from './smart-cube-mac.js';
import { promptMacAddress } from './smart-cube-mac-dialog.js';

// One physical connection and move history shared by every trainer. Protocol
// details stay behind this adapter; consumers only see canonical cube moves.
export const smartCube = createSmartCubeSession(async options => {
  if (!window.isSecureContext || !navigator.bluetooth?.requestDevice) {
    throw new Error('Web Bluetooth needs HTTPS and a supported browser (Chrome or Edge on Android/desktop).');
  }
  let selectedDevice = null;
  let usedRememberedMac = false;
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
      macAddressProvider: async (device, finalAttempt) => {
        selectedDevice = device;
        // Returning null on the non-final attempt lets the library run its own
        // second advertisement watch (up to 5 s more) before we fall back to a
        // previously verified address, and only then to a one-time manual entry.
        if (!finalAttempt) return null;
        const remembered = getRememberedMac(device.name);
        if (remembered) {
          usedRememberedMac = true;
          return remembered;
        }
        // Advertising did not expose the address (Web Bluetooth hides it). Show a
        // self-contained one-time entry dialog — never send the user to another view.
        return promptMacAddress(device);
      },
    });
    // connectSmartCube returns only after it validates decrypted cube data.
    // Save that proven address as a fallback if the browser's device ID changes.
    if (connection.deviceMAC) rememberMac(connection.deviceName, connection.deviceMAC);
    return connection;
  } catch (error) {
    // Do not silently retry a stale address on the next connection attempt.
    if (usedRememberedMac) forgetRememberedMac(selectedDevice?.name);
    throw error;
  }
});
