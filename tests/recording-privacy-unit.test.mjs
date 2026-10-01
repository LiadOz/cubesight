import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonymizeRecording } from '../src/recorder.js';

const sample = () => ({
  format: 'cubesight-recording', version: 2,
  env: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36', href: 'http://localhost:5173/#/solve' },
  final: { deviceName: 'GAN16ui_B704', protocol: 'gan-gen4' },
  diagnostics: [
    { label: 'MAC provider called (attempt final, device "GAN16ui_B704", id Zm9vYmFyYmF6cXV4MTIz==).' },
    { label: 'Using remembered address from cache: AB:CD:EF:12:34:56' },
    { label: 'Connected: GAN16ui_B704 · GAN Gen4 · MAC ab-cd-ef-12-34-56' },
  ],
  events: [
    { seq: 1, t: 1, kind: 'connected', data: { deviceName: 'GAN16ui_B704', deviceMAC: 'XX:XX:XX:XX:XX:04', protocol: { id: 'gan-gen4' } } },
    { seq: 2, t: 2, kind: 'cube-event', data: { event: { type: 'MOVE', move: 'R', cubeTimestamp: 100 } } },
  ],
});

test('saved recordings never contain the cube name, MAC addresses or device ids', () => {
  const out = JSON.stringify(anonymizeRecording(sample()));
  assert.ok(!out.includes('B704'), 'device name scrubbed');
  assert.ok(!/(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i.test(out.replace(/XX:XX:XX:XX:XX:XX/g, '')), 'no MAC address left');
  assert.ok(!out.includes('Zm9vYmFy'), 'Web Bluetooth device id redacted');
  assert.ok(out.includes('GAN cube'), 'stable generic alias used');
});

test('anonymizing keeps what replay needs and coarsens the browser', () => {
  const rec = anonymizeRecording(sample());
  assert.equal(rec.events[1].data.event.move, 'R');
  assert.equal(rec.events[1].data.event.cubeTimestamp, 100);
  assert.equal(rec.events[0].data.protocol.id, 'gan-gen4');
  assert.equal(rec.events[0].data.deviceName, rec.final.deviceName, 'the same alias everywhere');
  assert.equal(rec.env.userAgent, 'Chrome/154 · Linux');
  assert.equal(rec.privacy.anonymized, true);
});
