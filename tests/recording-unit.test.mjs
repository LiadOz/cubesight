import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSmartCubeSession } from '../src/smart-cube-session.js';
import { createSolveLive } from '../src/solve-live.js';
import {
  recordingConnectDevice, recordSessionCalls, recordLiveCalls, recordRead, setCheckpointProvider,
  resetRecording, clearRecording, serializeRecording, parseRecording, now as recorderNow, toJSONSafe, fromJSONSafe,
} from '../src/recorder.js';
import { createManualDevice, replayIntoSession } from '../src/recording-replay.js';
import { replayHeadless } from '../src/recording-harness.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const flush = () => new Promise(resolve => setImmediate(resolve));
const quiet = () => { const log = console.log; console.log = (...a) => { if (!String(a[0]).startsWith('[smart-cube]')) log(...a); }; return () => { console.log = log; }; };

// The app's wiring, as in smart-cube-bluetooth.js + brain.js, around a fake GAN cube.
function recordedApp() {
  const device = createManualDevice({ deviceName: 'GAN test cube', protocol: { id: 'gan-gen4', name: 'GAN Gen4' }, capabilities: { gyroscope: true, battery: true, facelets: true, hardware: false, reset: false } });
  const session = recordSessionCalls(createSmartCubeSession(recordingConnectDevice(device.connectDevice)));
  setCheckpointProvider(() => session.getSnapshot());
  let orientation = { bottom: 'D', front: 'F' };
  const live = recordLiveCalls(createSolveLive(session, {
    now: recorderNow,
    getOrientation: () => recordRead('orientation', () => ({ ...orientation })),
  }));
  return { device, session, live, setOrientation: o => { orientation = o; } };
}

function pickRecord(record) {
  if (!record) return record;
  const { at, ...rest } = record;   // `at` is wall-clock metadata, not behaviour
  return rest;
}

test('toJSONSafe/fromJSONSafe keep every field', () => {
  const error = new Error('boom'); error.name = 'NotFoundError'; error.code = 8;
  const value = { a: NaN, b: Infinity, c: undefined, d: [1, undefined, -Infinity], e: error, f: new Uint8Array([1, 2, 255]), g: { x: 0.1, y: -0.2 }, s: "R'" };
  const back = fromJSONSafe(JSON.parse(JSON.stringify(toJSONSafe(value))));
  assert.ok(Number.isNaN(back.a));
  assert.equal(back.b, Infinity);
  assert.ok('c' in back && back.c === undefined);
  assert.deepEqual(back.d, [1, undefined, -Infinity]);
  assert.ok(back.e instanceof Error);
  assert.equal(back.e.name, 'NotFoundError');
  assert.equal(back.e.message, 'boom');
  assert.equal(back.e.code, 8);
  assert.deepEqual(Array.from(back.f), [1, 2, 255]);
  assert.deepEqual(back.g, { x: 0.1, y: -0.2 });
  assert.equal(back.s, "R'");
});

test('a recorded guided solve replays to the identical session and live state', async () => {
  const restore = quiet();
  resetRecording();
  const app = recordedApp();
  await app.session.connect();
  await flush();
  app.device.emit({ type: 'BATTERY', batteryLevel: 87, timestamp: 1 });
  await app.session.syncSolved();
  app.live.setInspection({ enabled: false });
  const scramble = "R U R' F2 D";
  app.live.startGuided(scramble);
  let ts = 1000;
  for (const move of scramble.split(' ')) {
    if (move.endsWith('2')) { app.device.move(move[0], ts); app.device.move(move[0], ts + 12); }   // a GAN double = two quarters
    else app.device.move(move, ts);
    ts += 300;
    app.device.emit({ type: 'GYRO', quaternion: { x: 0.01, y: 0.2, z: -0.3, w: 0.93 }, velocity: { x: 1, y: 0, z: 0 }, timestamp: ts });
    await sleep(2);
  }
  assert.equal(app.live.getSnapshot().phase, 'inspecting');
  // Solve: the inverse, holding the cube differently part-way (rotation count).
  const solve = ["D'", 'F', 'F', 'R', "U'", "R'"];
  for (const [i, move] of solve.entries()) {
    if (i === 3) app.setOrientation({ bottom: 'F', front: 'U' });
    app.device.move(move, ts);
    ts += 400;
    await sleep(3);
  }
  const liveSnap = app.live.getSnapshot();
  const sessionSnap = app.session.getSnapshot();
  assert.equal(liveSnap.phase, 'done', 'the recorded solve completed');
  const json = serializeRecording();
  await app.session.disconnect();
  app.live.detach();

  const recording = parseRecording(JSON.parse(json));
  assert.ok(recording.events.some(e => e.kind === 'cube-event' && e.data.event.type === 'MOVE' && e.data.event.serial != null && e.data.event.face != null));
  assert.ok(recording.events.some(e => e.kind === 'live.call' && e.data.method === 'startGuided' && e.data.args[0] === scramble), 'the exact scramble is recorded');
  assert.ok(recording.events.some(e => e.kind === 'command' && e.data.command.type === 'REQUEST_FACELETS'));
  assert.ok(recording.events.some(e => e.kind === 'connected' && e.data.protocol.name === 'GAN Gen4'));

  const result = await replayHeadless(recording);
  restore();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.desyncs, []);
  assert.deepEqual(result.divergences, []);
  assert.deepEqual(result.session.moves, sessionSnap.moves);
  assert.equal(result.session.phase, sessionSnap.phase);
  assert.equal(result.session.battery, 87);
  assert.deepEqual(result.sessionPhases, result.recordedSessionPhases);
  assert.equal(result.live.phase, 'done');
  assert.deepEqual(pickRecord(result.live.record), pickRecord(liveSnap.record), 'same solve record (times, moves, cross, rotations)');
  assert.ok(result.live.record.solveMs > 0);
  assert.equal(result.live.record.rotations, liveSnap.record.rotations);
  assert.ok(result.ok);
});

test('a desync is reproduced by the replay and fails the CLI', async () => {
  const restore = quiet();
  resetRecording();
  const app = recordedApp();
  await app.session.connect();
  await flush();
  app.device.move('F', 10);                 // the user scrambles, then starts a free solve
  app.live.startFree();
  app.device.move('R', 100);
  app.device.emit({ type: 'MOVE', move: 'Q', face: 9, direction: 0, serial: 7, cubeTimestamp: 400, localTimestamp: 401 });
  assert.equal(app.session.getSnapshot().phase, 'desynced');
  const json = serializeRecording();
  await app.session.disconnect();
  app.live.detach();

  const result = await replayHeadless(JSON.parse(json));
  restore();
  assert.equal(result.ok, false);
  assert.ok(result.desyncs.some(d => d.source === 'session'));
  assert.ok(result.errors.some(e => e.includes('MOVE DESYNC move="Q"')));

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cubesight-rec-')), 'desync.json');
  fs.writeFileSync(file, json);
  const cli = spawnSync(process.execPath, [path.join(root, 'scripts/replay-recording.mjs'), file], { encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /MOVE "Q"/);
  assert.match(cli.stdout, /DESYNC/);
});

test('a fresh recording started mid-session replays from its checkpoint', async () => {
  const restore = quiet();
  resetRecording();
  const app = recordedApp();
  await app.session.connect();
  await flush();
  for (const [i, move] of ['R', 'U', "F'"].entries()) app.device.move(move, i * 500);
  clearRecording();                        // "Start fresh recording"
  app.device.move('L', 5000);
  app.device.move('L', 5010);              // coalesces to L2
  const expected = app.session.getSnapshot().moves;
  assert.deepEqual(expected, ['R', 'U', "F'", 'L2']);
  const json = serializeRecording();
  await app.session.disconnect();
  app.live.detach();

  const result = await replayHeadless(JSON.parse(json));
  restore();
  assert.deepEqual(result.session.moves, expected);
  assert.deepEqual(result.mismatches, []);
  assert.deepEqual(result.desyncs, []);
});

test('replayIntoSession drives an existing real session through its device seam', async () => {
  const restore = quiet();
  resetRecording();
  const app = recordedApp();
  await app.session.connect();
  await flush();
  app.device.move('B', 1);
  app.live.startFree();
  for (const [i, move] of ['R', 'U', 'U', "R'"].entries()) app.device.move(move, 100 + i * 20);   // U U coalesce
  const expected = app.session.getSnapshot().moves;
  const json = serializeRecording();
  await app.session.disconnect();
  app.live.detach();

  // A second "app": real session with a routable adapter, as smart-cube-bluetooth.js builds it.
  let routed = null;
  const session = createSmartCubeSession(options => routed ? routed(options) : Promise.reject(new Error('no bluetooth in tests')));
  const live = createSolveLive(session, { now: recorderNow });
  const actions = [];
  await replayIntoSession(JSON.parse(json), {
    session, speed: 0, setConnectDevice: fn => { routed = fn; },
    onAction: action => { actions.push(action); if (action.kind === 'live.call') return live[action.method](...action.args); },
  });
  restore();
  assert.deepEqual(session.getSnapshot().moves, expected);
  assert.ok(actions.some(a => a.kind === 'live.call' && a.method === 'startFree'));
  assert.equal(live.getSnapshot().phase, 'solving');
  live.detach();
});
