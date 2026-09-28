// Replay / testing harness for the live solve pipeline.
//
// Records or scripts a sequence of session snapshots (scramble + moves, including
// double turns) and replays them through a mock session on a timer, so the onSession
// mirror, the live tracker, the coach and the timeline all react to the exact same sequence — deterministically, no physical cube needed.
//
// This exists so the live-rendering bugs (face tracking stops, timeline doesn't appear) can be reproduced
// and fixed without needing the real cube each time, and so regression tests can assert the expected behaviour at each step.

import { createSolvedState, applyMoves, sameCubeState } from './cross-cube.js';

const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

/**
 * A scripted replay: a scramble followed by a sequence of turns to solve it.
 * `moveDelays` (ms) lets a fast replay slow down for watching.
 */
export function createReplayScript({ scramble = 'R U R\' F2', solve = null, moveDelays = {} } = {}) {
  const scrambleMoves = scramble.trim().split(/\s+/).filter(Boolean);
  // Default solve = the inverse of the scramble (a trivial solve so the cube returns to solved).
  const solveMoves = solve ? solve.trim().split(/\s+/).filter(Boolean)
    : scrambleMoves.slice().reverse().map(m => m.endsWith('2') ? m : m.endsWith("'") ? m[0] : m + "'");
  return { scrambleMoves, solveMoves, moveDelays };
}

/**
 * Build a mock smart-cube session that replays a scripted scramble + solve.
 * It has the same surface as a real session: subscribe(listener), getSnapshot(),
 * and a start() that emits the scripted MOVE/FACELETS/GYRO snapshots on a timer.
 *
 * The replay applies the scramble moves (as if the user performed them), then the solve moves,
 * tracking the canonical state exactly like the real session does — including the U2 coalescing, since that happens in the real
 * session adapter, not here. To test the coalescing path, pass solve moves that include a U2 as two U events.
 */
export function createReplaySession(script, { speed = 1, sessionFactory } = {}) {
  const { scrambleMoves, solveMoves, moveDelays } = script;
  // Realistic cube timestamps: scramble moves spaced ~100 ticks, then a gap before the solve;
  // solve moves spaced ~100 ticks apart (so two consecutive same-face solve moves don't coalesce, but a U2's two quarters,
  // done as two separate MOVE events within one physical flick, would arrive even closer in reality —
  // the replay approximates by giving solve moves 100-tick gaps).
  const tsFor = (i) => i < scrambleMoves.length ? i * 100 : 1000 + (i - scrambleMoves.length) * 100;
  let state = createSolvedState();
  let moves = [];
  let lastMove = null;
  let lastCoalesce = null;   // separate from lastMove: tracks cubeTimestamp for coalescing (like the real session)
  const DOUBLE_WINDOW = 50;
  let phase = 'disconnected';
  const listeners = new Set();
  // Facelets: solved at start; the replayed cube is solved until the scramble is applied.
  let facelets = SOLVED_FACELETS;

  const snap = () => ({ phase, state, moves: [...moves], lastMove, facelets, gyro: null, battery: null, deviceName: 'Replay cube', protocol: 'GAN Gen4' });

  function publish(changes) {
    const s = { ...snap(), ...changes };
    state = s.state; moves = s.moves; lastMove = s.lastMove; phase = s.phase; facelets = s.facelets ?? facelets;
    for (const l of listeners) l(s);
  }
  function emit(event) {
    if (event.type === 'FACELETS') { publish({ facelets: event.facelets }); return; }
    if (event.type === 'GYRO') { publish({ gyro: event.quaternion }); return; }
    if (event.type !== 'MOVE') return;
    // Apply the move exactly like the real session (smart-cube-session), including
    // double-turn coalescing: two same-face same-direction quarters within the window become one U2.
    const move = event.move;
    const face = move[0];
    const prime = move.includes("'");
    const cubeTs = Number.isFinite(event.cubeTimestamp) ? event.cubeTimestamp : lastCoalesce ? lastCoalesce.cubeTs + 10 : 0;
    const prev = moves[moves.length - 1];
    const coalesce = prev && prev[0] === face && (prev.includes("'") === prime)
      && Math.abs(cubeTs - (lastCoalesce?.cubeTs ?? 0)) <= DOUBLE_WINDOW;
    if (coalesce) {
      moves = [...moves.slice(0, -1), `${face}2${prime ? "'" : ''}`];
      // state already advanced by the first quarter; the second quarter completes the double
      state = applyMoves(state, [move]);
    } else {
      state = applyMoves(state, [move]);
      moves = [...moves, move];
    }
    lastCoalesce = { face, prime, cubeTs };
    lastMove = move;
    const solved = sameCubeState(state, createSolvedState());
    publish({ phase: 'tracking', lastMove: moves[moves.length - 1], detail: solved ? 'Solved' : 'Live cube updated.', state, moves: solved ? [] : moves });
  }

  // A no-op connection adapter for the replay (no real BLE).
  async function connect() { publish({ phase: 'awaiting-solved', detail: 'Replay cube connected.' }); }
  async function syncSolved() {
    if (facelets === SOLVED_FACELETS) { phase = 'tracking'; publish({ phase: 'tracking', detail: 'Solved baseline synced.' }); }
    else publish({ detail: 'Not solved.' });
  }
  async function disconnect() { phase = 'disconnected'; publish({ phase: 'disconnected' }); }

  let stepIndex = 0;
  const allMoves = [...scrambleMoves, ...solveMoves];

  function step(cubeTimestamp) {
    if (stepIndex >= allMoves.length) return null;
    const m = allMoves[stepIndex++];
    emit({ type: 'MOVE', move: m, cubeTimestamp: Number.isFinite(cubeTimestamp) ? cubeTimestamp : tsFor(stepIndex - 1) });
    return snap();
  }

  return {
    connect, syncSolved, disconnect,
    subscribe(listener) { listeners.add(listener); listener(snap()); return () => listeners.delete(listener); },
    getSnapshot: snap,
    step,
    start() { stepIndex = 0; state = createSolvedState(); moves = []; phase = 'disconnected'; publish({ phase: 'disconnected' }); connect(); },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
  };
}
