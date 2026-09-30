import { connectSmartCube, getRegisteredProtocols, getCachedMacForDevice } from 'smartcube-web-bluetooth';
import { createSmartCubeSession, APP_SESSION_OPTIONS } from './smart-cube-session.js';
import { getRememberedMac, rememberMac, forgetRememberedMac } from './smart-cube-mac.js';
import { promptMacAddress } from './smart-cube-mac-dialog.js';
import { logConnection } from './smart-cube-diag.js';
import { recordingConnectDevice, recordSessionCalls, setCheckpointProvider, now as recorderNow } from './recorder.js';

// A replay (src/recording-replay.js) can take the place of the Bluetooth
// adapter; the session itself stays the real one.
let replayConnectDevice = null;
export function setReplayConnectDevice(connectDevice) { replayConnectDevice = connectDevice || null; }
export function isReplayAdapterInstalled() { return Boolean(replayConnectDevice); }

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

// Record the facts that decide whether the cube connects without a manual MAC:
// the page origin (browser storage and Bluetooth permissions are per origin, so
// localhost:5173 and localhost:5174 do not share them), the cached addresses,
// advertisement-watching support and the devices this origin may already use.
// Synchronous, so requestDevice keeps the click's user activation.
function logConnectionEnvironment() {
  const storage = globalThis.localStorage;
  const cached = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith('cubesight-smartcube-mac-name:') || k?.startsWith('smartcube-ble-mac:')) cached.push(k);
    }
  } catch { /* storage unavailable */ }
  const watch = typeof globalThis.BluetoothDevice !== 'undefined' && 'watchAdvertisements' in BluetoothDevice.prototype;
  logConnection({ kind: 'env', label: `Origin ${location.origin} · secure=${window.isSecureContext} · watchAdvertisements=${watch ? 'yes' : 'NO (enable chrome://flags/#enable-experimental-web-platform-features)'} · cached addresses: ${cached.length ? cached.join(', ') : 'none for this origin'}` });
  if (navigator.bluetooth?.getDevices) {
    navigator.bluetooth.getDevices()
      .then(devices => logConnection({ kind: 'env', label: `Devices already permitted for this origin: ${devices.length ? devices.map(d => `"${d.name ?? '?'}" (id ${d.id})`).join(', ') : 'none'}` }))
      .catch(error => logConnection({ kind: 'env', label: `getDevices failed: ${error?.message || error}` }));
  } else logConnection({ kind: 'env', label: 'navigator.bluetooth.getDevices unavailable (enable chrome://flags/#enable-web-bluetooth-new-permissions-backend) — the address cannot be re-derived from a remembered device.' });
}

// The cube that last connected, so a dropped link can be re-established.
let lastCubeName = null;
const RECONNECT_ADVERTISEMENT_WAIT_MS = 12000;
const needsTap = message => Object.assign(new Error(message), { needsGesture: true });

// Wait until the cube is advertising again (it is back in range and awake).
function waitForAdvertisement(device, timeoutMs) {
  if (typeof device.watchAdvertisements !== 'function') return Promise.resolve(false);
  return new Promise(resolve => {
    const abort = new AbortController();
    let timer = null;
    const finish = seen => { clearTimeout(timer); device.removeEventListener('advertisementreceived', onAdvertisement); abort.abort(); resolve(seen); };
    const onAdvertisement = () => finish(true);
    device.addEventListener('advertisementreceived', onAdvertisement);
    timer = setTimeout(() => finish(false), timeoutMs);
    device.watchAdvertisements({ signal: abort.signal }).catch(() => finish(false));
  });
}

// Re-establish the link to the cube that dropped WITHOUT a user gesture:
// getDevices() returns the cube this origin was already granted, and
// watchAdvertisements() tells us when it is reachable again. Anything that
// needs the picker throws needsGesture so the session shows a one-tap Reconnect.
async function reconnectSilently(options) {
  if (!navigator.bluetooth?.getDevices) throw needsTap('This browser cannot reconnect on its own (enable chrome://flags/#enable-web-bluetooth-new-permissions-backend). Tap Reconnect.');
  const devices = await navigator.bluetooth.getDevices();
  const device = devices.find(d => d.name && d.name === lastCubeName);
  if (!device) throw needsTap('The cube is not remembered by this page. Tap Reconnect.');
  options.onStatus?.('Looking for your cube…');
  logConnection({ kind: 'start', label: `Silent reconnect to "${device.name}"…` });
  if (!await waitForAdvertisement(device, RECONNECT_ADVERTISEMENT_WAIT_MS)) throw new Error('The cube is not in range or is asleep.');
  const protocol = getRegisteredProtocols().find(candidate => candidate.matchesDevice(device));
  if (!protocol) throw needsTap('This cube model cannot reconnect on its own. Tap Reconnect.');
  options.onStatus?.('Reconnecting…');
  const mac = getCachedMacForDevice(device) || getRememberedMac(device.name);
  const connection = await protocol.connect(device, async () => mac, { serviceUuids: new Set(), enableAddressSearch: false, onStatus: detail => logConnection({ label: String(detail), kind: 'status' }) });
  logConnection({ label: `Reconnected: ${connection.deviceName} · ${connection.protocol?.name ?? ''}`, kind: 'ok' });
  return connection;
}

function reconnectBluetooth(options) {
  // A user tap may show the device picker (the normal connect path); automatic
  // retries must stay silent.
  if (options.gesture) return connectBluetooth(options);
  return reconnectSilently(options);
}

// Web Bluetooth adapter. Protocol details stay behind it; consumers only see
// canonical cube moves.
async function connectBluetooth(options) {
  if (!window.isSecureContext || !navigator.bluetooth?.requestDevice) {
    throw new Error('Web Bluetooth needs HTTPS and a supported browser (Chrome or Edge on Android/desktop).');
  }
  let selectedDevice = null;
  let usedRememberedMac = false;
  logConnection({ label: 'Starting connection…', kind: 'start' });
  logConnectionEnvironment();
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
      onStatus: detail => { logConnection({ label: String(detail), kind: 'status' }); options.onDeviceStatus?.(detail); },
      macAddressProvider: async (device, finalAttempt) => {
        selectedDevice = device;
        let libraryCached = false;
        try { libraryCached = Boolean(globalThis.localStorage?.getItem(`smartcube-ble-mac:${device?.id}`)); } catch { /* storage unavailable */ }
        logConnection({ kind: 'env', label: `Library address cache for device id ${device?.id ?? '?'}: ${libraryCached ? 'present' : 'missing'} · remembered by name: ${getRememberedMac(device?.name) ? 'present' : 'missing'}` });
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
    lastCubeName = connection.deviceName || null;
    return connection;
  } catch (error) {
    logConnection({ label: `Connection failed: ${error?.message || error}`, kind: 'error' });
    // Do not silently retry a stale address on the next connection attempt.
    if (usedRememberedMac) forgetRememberedMac(selectedDevice?.name);
    throw error;
  }
}

// One physical connection and move history shared by every trainer. Every
// raw input (handshake, cube events, commands, connect/sync/disconnect calls)
// is recorded at this seam — always on — so any bug can be replayed.
export const smartCube = recordSessionCalls(createSmartCubeSession(recordingConnectDevice(
  options => (replayConnectDevice ? replayConnectDevice(options) : options.reconnect ? reconnectBluetooth(options) : connectBluetooth(options))),
{ ...APP_SESSION_OPTIONS, now: recorderNow }));
setCheckpointProvider(() => smartCube.getSnapshot());
