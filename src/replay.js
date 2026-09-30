// Scripted replay harness for the live solve pipeline.
//
// A scramble + solve script is fed, move by move, as raw GAN-shaped MOVE
// events into the REAL createSmartCubeSession (through a hand-driven device
// from recording-replay.js), so the onSession mirror, the live tracker, the
// coach and the timeline react to exactly what the real session publishes —
// including its double-turn coalescing. Nothing about the session is
// re-implemented here, so a test built on this cannot pass while the real
// session fails.
//
// For replaying what a physical cube actually sent, record it (always on, see
// src/recorder.js) and use src/recording-replay.js / scripts/replay-recording.mjs.

import { createSmartCubeSession } from './smart-cube-session.js';
import { createManualDevice } from './recording-replay.js';

const invert = m => m.endsWith('2') ? m : m.endsWith("'") ? m.slice(0, -1) : `${m}'`;

/**
 * A scripted replay: a scramble followed by a sequence of turns to solve it.
 * `moveDelays` (ms) lets a fast replay slow down for watching.
 */
export function createReplayScript({ scramble = 'R U R\' F2', solve = null, moveDelays = {} } = {}) {
  const scrambleMoves = scramble.trim().split(/\s+/).filter(Boolean);
  // Default solve = the inverse of the scramble (a trivial solve so the cube returns to solved).
  const solveMoves = solve ? solve.trim().split(/\s+/).filter(Boolean) : scrambleMoves.slice().reverse().map(invert);
  return { scrambleMoves, solveMoves, moveDelays };
}

/**
 * A real smart-cube session driven by the script. Same surface as the session
 * (subscribe, getSnapshot, connect, syncSolved, disconnect) plus step(), which
 * emits the next scripted turn as one raw MOVE event and returns the session
 * snapshot. Default cube timestamps are 100 ticks apart (scramble from 0,
 * solve from 1000), i.e. never inside the double-turn window; pass explicit
 * close timestamps to exercise coalescing (two quarters -> one double).
 */
export function createReplaySession(script, { deviceName = 'Replay cube', protocol = 'GAN Gen4' } = {}) {
  const { scrambleMoves, solveMoves } = script;
  const allMoves = [...scrambleMoves, ...solveMoves];
  const tsFor = i => i < scrambleMoves.length ? i * 100 : 1000 + (i - scrambleMoves.length) * 100;
  const device = createManualDevice({ deviceName, protocol: { id: 'replay', name: protocol } });
  const session = createSmartCubeSession(device.connectDevice);
  let stepIndex = 0;

  async function connect() {
    await session.connect();
    // Let the session's REQUEST_FACELETS answer land (establishes the solved baseline).
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  function step(cubeTimestamp) {
    if (stepIndex >= allMoves.length) return null;
    const index = stepIndex++;
    device.move(allMoves[index], Number.isFinite(cubeTimestamp) ? cubeTimestamp : tsFor(index));
    return session.getSnapshot();
  }

  return {
    connect,
    syncSolved: () => session.syncSolved(),
    disconnect: () => session.disconnect(),
    subscribe: listener => session.subscribe(listener),
    subscribeEvents: listener => session.subscribeEvents(listener),
    getSnapshot: () => session.getSnapshot(),
    step,
    device,
    session,
    async start() { stepIndex = 0; await session.disconnect(); await connect(); },
    stop() { /* step() is driven by the caller; there is no timer to stop */ },
  };
}
