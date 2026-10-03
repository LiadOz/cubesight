import { APP_NAME } from '../../copy/nav.js';

const ACTIONS = Object.freeze([
  ['connect', 'connect'],
  ['sync', 'sync solved cube'],
  ['recenter', 'recenter'],
  ['disconnect', 'disconnect'],
  ['forget', 'forget saved cube'],
  ['save-recording', 'save recording'],
  ['report-problem', 'report a problem'],
]);

function finite(value, fallback = null) {
  return Number.isFinite(value) ? value : fallback;
}

/** Pure JSON-safe state shared by the app header, connection menu, and recording view. */
export function buildSharedViewModel(input = {}) {
  const source = input.connection || {};
  const phase = source.phase || 'disconnected';
  const interrupted = phase === 'interrupted' || (phase === 'disconnected' && source.link?.status === 'lost');
  const connectionPhase = interrupted ? 'interrupted' : phase;
  const statusText = ({ disconnected: 'disconnected', connecting: 'connecting', 'awaiting-solved': 'syncing', tracking: 'connected', desynced: 'desynced', interrupted: 'interrupted' })[connectionPhase] || connectionPhase;
  const canSync = source.canSync ?? phase === 'tracking';
  const canDisconnect = source.canDisconnect ?? phase === 'tracking';
  const actions = ACTIONS.map(([id, label]) => ({
    id,
    label,
    enabled: id === 'connect' ? phase === 'disconnected' || (phase === 'interrupted' && !source.canDisconnect)
      : id === 'sync' ? Boolean(canSync)
        : id === 'recenter' || id === 'disconnect' ? Boolean(canDisconnect)
          : id === 'forget' ? Boolean(input.forgetAvailable)
            : true,
  }));
  const recordingSource = input.recording;
  const recording = recordingSource ? {
    state: 'recording',
    eventCount: Math.max(0, Math.trunc(finite(recordingSource.eventCount, recordingSource.events?.length || 0))),
    durationMs: Math.max(0, finite(recordingSource.durationMs, 0)),
    localBuffer: true,
    events: (Array.isArray(recordingSource.events) ? recordingSource.events : [])
      .slice(-12).reverse().map(event => ({ kind: String(event.kind || 'event'), elapsedMs: finite(event.t, 0) })),
  } : null;
  const battery = finite(source.battery);
  const protocol = typeof source.protocol === 'string' ? source.protocol : source.protocol?.name;
  const defaultName = protocol?.startsWith('GAN') ? 'GAN cube' : 'cube';
  return {
    route: String(input.route || '/'),
    theme: input.theme === 'light' ? 'light' : 'dark',
    header: {
      title: String(input.title || APP_NAME),
      activeRoute: String(input.activeRoute || ''),
      connection: {
        phase: connectionPhase,
        statusText,
        name: String(source.deviceName || defaultName),
        batteryPercent: battery == null ? null : Math.round(battery),
        canSync: Boolean(canSync),
        canDisconnect: Boolean(canDisconnect),
      },
    },
    connectionMenu: { open: Boolean(input.connectionMenuOpen), actions },
    developerDrawer: {
      available: Boolean(input.developerDrawerAvailable),
      open: Boolean(input.developerDrawerOpen),
      recordingBuffer: input.developerDrawerOpen ? { enabled: true } : null,
    },
    recording,
  };
}
