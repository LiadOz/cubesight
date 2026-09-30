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

export function logConnection(entry) {
  const record = typeof entry === 'string' ? { label: entry } : { ...entry };
  record.at = Date.now();
  entries.push(record);
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
