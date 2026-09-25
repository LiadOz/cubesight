import { connectSmartCube } from 'smartcube-web-bluetooth';
import { createSmartCubeSession } from './smart-cube-session.js';
import { getRememberedMac, rememberMac, forgetRememberedMac } from './smart-cube-mac.js';

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
      macAddressProvider: async (device, finalAttempt) => {
        selectedDevice = device;
        if (!finalAttempt) {
          const remembered = getRememberedMac(device.name);
          if (remembered) {
            usedRememberedMac = true;
            return remembered;
          }
          return null;
        }
        return window.prompt('Cube MAC address needed for decryption. Enter its 12 hexadecimal digits (from Cube Station or the cube label), or Cancel to stop:');
      },
    });
    // connectSmartCube returns only after it validates decrypted cube data.
    // Save that proven address as a fallback if the browser's device ID changes.
    if (selectedDevice) rememberMac(selectedDevice.name, connection.deviceMAC);
    return connection;
  } catch (error) {
    // Do not silently retry a stale address on the next connection attempt.
    if (usedRememberedMac) forgetRememberedMac(selectedDevice?.name);
    throw error;
  }
});
