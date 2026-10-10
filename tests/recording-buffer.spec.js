import { test, expect } from 'playwright/test';

test('recording persistence migrates legacy history, saves small chunks and restores after reload', async ({ page }) => {
  // A blank same-origin document exercises actual IndexedDB without a renderer.
  await page.goto('/version.json');
  await page.clock.install();
  await page.evaluate(async () => {
    const recorder = await import('/src/recorder.js');
    const history = Array.from({ length: 1600 }, (_, i) => ({ seq: i + 1, t: i, kind: 'cube-event', data: { event: { type: 'GYRO', quaternion: { x: 0, y: 0, z: 0, w: 1 } } } }));
    const header = { seq: 0, t: 0, kind: 'connected', data: { conn: 1, deviceName: 'GAN private test name' } };
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open('recording-chunk-test', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('buffer', { keyPath: 'key' });
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
    });
    const tx = db.transaction('buffer', 'readwrite');
    tx.objectStore('buffer').put({ key: 'active', cap: 100000, header: [header], recording: {
      format: recorder.RECORDING_FORMAT, version: recorder.RECORDING_VERSION, events: [header, ...history], dropped: 7,
    } });
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
    window.chunkWrites = [];
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) { window.chunkWrites.push({ key: value.key, count: value.events?.length || 0 }); return originalPut.call(this, value, ...args); };
    const result = await recorder.enableRecordingPersistence({ name: 'recording-chunk-test' });
    if (!result.restored) throw new Error('Legacy history was not restored');
    window.readChunks = async () => {
      const open = indexedDB.open('recording-chunk-test', 1);
      const connection = await new Promise(resolve => { open.onsuccess = () => resolve(open.result); });
      const read = connection.transaction('buffer').objectStore('buffer').getAll();
      const rows = await new Promise(resolve => { read.onsuccess = () => resolve(read.result); }); connection.close(); return rows;
    };
  });
  await page.clock.fastForward(901);
  await expect.poll(() => page.evaluate(async () => (await window.readChunks()).find(row => row.key === 'active')?.chunked)).toBe(true);
  await page.evaluate(async () => {
    window.chunkWrites = [];
    const recorder = await import('/src/recorder.js');
    for (let i = 0; i < 10; i++) recorder.record('cube-event', { event: { type: 'GYRO', timestamp: 9000 + i } });
  });
  await page.clock.fastForward(901);
  await expect.poll(() => page.evaluate(() => window.chunkWrites.some(row => row.key.startsWith('events:')))).toBe(true);
  const writes = await page.evaluate(() => window.chunkWrites);
  expect(writes.filter(row => row.key.startsWith('events:'))).toHaveLength(1);
  expect(writes.reduce((sum, row) => sum + row.count, 0)).toBeLessThanOrEqual(512);
  const before = await page.evaluate(async () => {
    const recorder = await import('/src/recorder.js');
    const rows = await window.readChunks();
    if (JSON.stringify(rows).includes('private test name')) throw new Error('Stored recording exposes the cube name');
    recorder.record('fast-reload-marker', { detail: 'unflushed input' });
    return recorder.getRecording();
  });
  await page.reload();
  const after = await page.evaluate(async () => {
    const recorder = await import('/src/recorder.js');
    await recorder.enableRecordingPersistence({ name: 'recording-chunk-test' });
    return recorder.getRecording();
  });
  expect(after.events.slice(0, before.events.length)).toEqual(before.events);
  expect(after.dropped).toBe(7);
  await page.evaluate(async () => { const recorder = await import('/src/recorder.js'); recorder.clearRecording(); });
  await page.clock.fastForward(901);
  const cleared = await page.evaluate(async () => {
    const open = indexedDB.open('recording-chunk-test', 1);
    const db = await new Promise(resolve => { open.onsuccess = () => resolve(open.result); });
    const read = db.transaction('buffer').objectStore('buffer').getAll();
    const rows = await new Promise(resolve => { read.onsuccess = () => resolve(read.result); }); db.close(); return rows;
  });
  expect(cleared.flatMap(row => row.events || []).filter(event => event.kind === 'cube-event')).toHaveLength(0);
});
