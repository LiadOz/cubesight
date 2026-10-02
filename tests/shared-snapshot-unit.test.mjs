import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_NAME } from '../src/copy/nav.js';
import { buildSharedViewModel } from '../src/ui/shared/snapshot-model.js';

test('shared snapshot serializes the same header/menu state without live objects or callbacks', () => {
  const input = {
    route: '/progress', activeRoute: 'progress', theme: 'light', forgetAvailable: true,
    connectionMenuOpen: true, developerDrawerAvailable: true, developerDrawerOpen: false,
    connection: { phase: 'tracking', deviceName: 'GAN test cube', battery: 83.6, canSync: true, canDisconnect: true },
    recording: { eventCount: 14, durationMs: 9123, events: [{ kind: 'old', t: 1 }, { kind: 'navigation', t: 240 }] },
  };
  const before = structuredClone(input);
  const model = buildSharedViewModel(input);
  assert.deepEqual(input, before);
  assert.deepEqual(model, {
    route: '/progress', theme: 'light',
    header: { title: APP_NAME, activeRoute: 'progress', connection: { phase: 'tracking', statusText: 'connected', name: 'GAN test cube', batteryPercent: 84, canSync: true, canDisconnect: true } },
    connectionMenu: { open: true, actions: [
      { id: 'connect', label: 'connect', enabled: false }, { id: 'sync', label: 'sync solved cube', enabled: true },
      { id: 'recenter', label: 'recenter', enabled: true }, { id: 'disconnect', label: 'disconnect', enabled: true },
      { id: 'forget', label: 'forget saved cube', enabled: true }, { id: 'save-recording', label: 'save recording', enabled: true },
      { id: 'report-problem', label: 'report a problem', enabled: true },
    ] },
    developerDrawer: { available: true, open: false, recordingBuffer: null },
    recording: { state: 'recording', eventCount: 14, durationMs: 9123, localBuffer: true, events: [{ kind: 'navigation', elapsedMs: 240 }, { kind: 'old', elapsedMs: 1 }] },
  });
  assert.doesNotThrow(() => JSON.stringify(model));
});

test('shared snapshot records interruption, limits visible recorder events, and omits absent recorder state', () => {
  const events = Array.from({ length: 14 }, (_, index) => ({ kind: `event-${index}`, t: index * 10 }));
  const model = buildSharedViewModel({ connection: { phase: 'disconnected', link: { status: 'lost' } }, recording: { durationMs: 200, events } });
  assert.equal(model.header.connection.phase, 'interrupted');
  assert.equal(model.header.connection.name, 'cube');
  assert.deepEqual(model.connectionMenu.actions[0], { id: 'connect', label: 'connect', enabled: true });
  assert.equal(model.recording.eventCount, 14);
  assert.deepEqual(model.recording.events.map(event => event.kind), ['event-13', 'event-12', 'event-11', 'event-10', 'event-9', 'event-8', 'event-7', 'event-6', 'event-5', 'event-4', 'event-3', 'event-2']);
  assert.equal(buildSharedViewModel().recording, null);
});
