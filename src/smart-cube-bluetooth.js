import { connectSmartCube } from 'smartcube-web-bluetooth';
import { createSmartCubeSession } from './smart-cube-session.js';

// One physical connection and move history shared by every trainer. Protocol
// details stay behind this adapter; consumers only see canonical cube moves.
export const smartCube = createSmartCubeSession(options => {
  if (!window.isSecureContext || !navigator.bluetooth?.requestDevice) {
    throw new Error('Web Bluetooth needs HTTPS and a supported browser (Chrome or Edge on Android/desktop).');
  }
  return connectSmartCube({
    ...options,
    // GAN model names and advertisements vary; let the user choose the BLE
    // device, then identify its protocol from the services it exposes.
    deviceSelection: 'any',
    macAddressProvider: async (_device, finalAttempt) => finalAttempt
      ? window.prompt('Cube MAC address needed for decryption. Enter its 12 hexadecimal digits (from Cube Station or the cube label), or Cancel to stop:')
      : null,
  });
});
