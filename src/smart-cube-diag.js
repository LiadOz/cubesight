// Connection diagnostics for the smart-cube MAC/attach flow.
//
// The MAC resolution happens before the session is established, so the session's
// own event log never sees it. This module captures the steps the adapter
// takes (requestDevice, advertisement watching, each macAddressProvider
// attempt, the remembered-cache hit, the one-time dialog, the outcome) and
// exposes them to a UI. It is deliberately separate from the session so any
// trainer can show it, and so it works even when a connection fails.

const listeners = new Set();
const entries = [];
let sink = null;

/**
 * Every connection log line is also handed to the sink (the recorder), so one
 * saved recording tells the whole story of a failed attempt. The sink gets a
 * copy with names, addresses and storage keys already removed.
 */
export function setConnectionSink(fn) { sink = typeof fn === 'function' ? fn : null; }

/** Strip what identifies the user's cube or device from a diagnostic line. */
export function redactDiagnostic(text) {
  return String(text)
    .replace(/cubesight-smartcube-mac-name:[^\s,]+/g, 'saved-address-by-name')
    .replace(/smartcube-ble-mac:[^\s,]+/g, 'saved-address-by-device')
    .replace(/\b(device|to) "[^"]*"/g, '$1 "[cube]"')
    .replace(/"[^"]*"(?= \(id)/g, '"[cube]"')
    .replace(/(Connected|Reconnected): [^·]*/g, '$1: [cube] ')
    .replace(/\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi, 'XX:XX:XX:XX:XX:XX')
    .replace(/\b(id\s*[:=]?\s*)[A-Za-z0-9+/_-]{8,}={0,2}/g, '$1[redacted]')
    .replace(/\b(device id )\S+/g, '$1[redacted]')
    .replace(/(Origin )\S+/g, '$1[origin]');
}

export function logConnection(entry) {
  const record = typeof entry === 'string' ? { label: entry } : { ...entry };
  record.at = Date.now();
  entries.push(record);
  if (sink) { try { sink({ kind: record.kind || 'log', label: redactDiagnostic(record.label ?? '') }); } catch { /* the recorder must never break a connection */ } }
  if (entries.length > 2000) entries.shift();
  for (const listener of listeners) listener(entries.slice());
  try { console.log('[smart-cube]', record.label || record); } catch { /* console may be unavailable */ }
}

export function getConnectionLog() { return entries.slice(); }

export function subscribeConnection(listener) {
  listeners.add(listener);
  listener(entries.slice());
  return () => listeners.delete(listener);
}

export function clearConnectionLog() {
  entries.length = 0;
  for (const listener of listeners) listener(entries.slice());
}

// --- What this browser can do, and what went wrong, in words a person can act on ---

const text = (...parts) => parts.join(' ').trim();

/**
 * True when the person closed the device chooser. Chrome raises NotFoundError for
 * that with "User cancelled the requestDevice() chooser." A chooser that found
 * nothing stays open until the person closes it, so it ends the same way; the
 * only difference the platform offers is that message, and a missing adapter or
 * a failed scan carries a different one. That is a choice, not a failure.
 */
export function isChooserDismissal(error) {
  return error?.name === 'NotFoundError' && /cancel|dismiss/i.test(String(error?.message || ''));
}

/** Facts about the browser that decide whether a cube can connect at all. */
export function inspectBluetoothSupport(env = globalThis) {
  const nav = env.navigator || {};
  const ua = String(nav.userAgent || '');
  const platform = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) ? 'ios'
    : /Android/.test(ua) ? 'android' : /Windows|Macintosh|Linux|CrOS/.test(ua) ? 'desktop' : 'other';
  const bluetooth = nav.bluetooth;
  return {
    platform,
    secure: env.isSecureContext !== false,
    bluetooth: Boolean(bluetooth),
    requestDevice: typeof bluetooth?.requestDevice === 'function',
    getAvailability: typeof bluetooth?.getAvailability === 'function',
    getDevices: typeof bluetooth?.getDevices === 'function',
    watchAdvertisements: typeof env.BluetoothDevice !== 'undefined' && 'watchAdvertisements' in env.BluetoothDevice.prototype,
    installedApp: Boolean(env.matchMedia?.('(display-mode: standalone)')?.matches),
  };
}

/** Returns an Error to throw when this browser cannot connect a cube at all, or null. */
export function unsupportedReason(support) {
  const fail = (code, message) => Object.assign(new Error(message), { name: 'BluetoothUnsupported', code });
  if (!support.secure) return fail('insecure', 'Bluetooth only works on a secure page (https). Open cubesight from its https address.');
  if (support.bluetooth && support.requestDevice) return null;
  if (support.platform === 'ios') return fail('ios', 'iPhone and iPad browsers cannot connect to a Bluetooth cube. Use Chrome on an Android phone, or a computer.');
  return fail('no-bluetooth', 'This browser has no Bluetooth support. Use Chrome or Edge on Android or a computer.');
}

/**
 * The line a person sees for a failed connection. `stage` is where it stopped
 * (picker, advertisements, gatt, address, verify); `support` comes from
 * inspectBluetoothSupport. The raw error stays in the log and the recording.
 */
export function explainConnectionError(error, { stage = '', support = null } = {}) {
  const name = error?.name || '';
  const message = String(error?.message || error || '');
  if (name === 'BluetoothUnsupported') return { text: message, tone: 'error' };
  if (name === 'BluetoothTimeout') return { text: message, tone: 'error' };
  if (name === 'NotFoundError') {
    return { text: support?.platform === 'android'
      ? text('No cube chosen, or none was found.', 'Turn on Bluetooth and Location, turn the cube a few times to wake it, then connect again.')
      : text('No cube chosen, or none was found.', 'Turn on Bluetooth, turn the cube a few times to wake it, then connect again.'), tone: 'neutral' };
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return { text: support?.platform === 'android'
      ? text('The browser would not open Bluetooth.', 'Allow Nearby devices and Location for Chrome in the phone settings, then tap connect again.')
      : text('The browser would not open Bluetooth.', 'Allow Bluetooth for this site, then tap connect again.'), tone: 'error' };
  }
  if (name === 'NetworkError' || /GATT|disconnected|connection attempt failed/i.test(message)) {
    return { text: text(`Found the cube but could not connect${message ? ` (${message.replace(/[.\s]+$/, '')})` : ''}.`, 'Bring it close, close other apps connected to it, turn it a few times, then connect again.'), tone: 'error' };
  }
  if (/Unable to determine cube MAC|MAC address/i.test(message) && !/Timed out/i.test(message)) {
    return { text: text('Your cube did not share its address, so it could not be read.', 'Connect again and enter the address when asked.'), tone: 'error' };
  }
  if (/Timed out waiting for cube data/i.test(message)) {
    return { text: text('The cube connected but sent nothing readable.', 'The saved address may be wrong. Forget the saved cube, then connect again.'), tone: 'error' };
  }
  if (/doesn't match any registered smartcube protocol/i.test(message)) {
    return { text: 'That device is not a supported smart cube. Pick your cube from the list.', tone: 'error' };
  }
  return { text: `Could not connect${stage ? ` (${stage})` : ''}. ${message}`.trim(), tone: 'error' };
}
