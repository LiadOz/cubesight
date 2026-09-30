// Headless replay: a recording through a fresh REAL session + REAL live
// tracker, re-applying the recorded user actions at their recorded times.
// Used by scripts/replay-recording.mjs and the recorder unit tests.

import { createSmartCubeSession } from './smart-cube-session.js';
import { createSolveLive } from './solve-live.js';
import { subscribeConnection } from './smart-cube-diag.js';
import { createReplayDriver } from './recording-replay.js';
import { parseRecording, fromJSONSafe } from './recorder.js';

const DEFAULT_ORIENTATION = { bottom: 'D', front: 'F' };

export async function replayHeadless(input, { speed = 0, onLine = () => {}, verbose = false } = {}) {
  const recording = parseRecording(input);
  const lines = [];
  const line = (t, text) => { const s = `${(t / 1000).toFixed(3).padStart(9)}s  ${text}`; lines.push(s); onLine(s); };
  const errors = [];
  const desyncs = [];
  const driver = createReplayDriver(recording, {
    speed,
    onTrace: entry => {
      if (entry.type === 'cube-event') {
        const ev = entry.event || {};
        if (ev.type === 'MOVE') line(entry.t, `cube  MOVE ${JSON.stringify(ev.move)} face=${ev.face ?? '-'} dir=${ev.direction ?? '-'} serial=${ev.serial ?? '-'} cubeTs=${ev.cubeTimestamp ?? '-'}`);
        else if (ev.type === 'FACELETS') line(entry.t, `cube  FACELETS ${ev.facelets}`);
        else line(entry.t, `cube  ${ev.type}`);
      } else if (entry.type === 'action') {
        const a = entry.action;
        line(entry.t, `user  ${a.kind} ${a.method ?? a.action ?? ''}${a.args?.length ? ' ' + JSON.stringify(a.args) : ''}${a.synthetic ? ' (synthetic)' : ''}`);
      } else if (entry.type === 'divergence') {
        line(entry.t, `!!    DIVERGENCE ${entry.message}`);
      } else if (entry.type === 'action-threw' || entry.type === 'action-rejected') {
        line(entry.t, `user  ${entry.type}: ${entry.error}`);
      } else if (verbose || ['connected', 'connect-error', 'cube-error', 'checkpoint', 'synthetic-connect', 'runtime-error'].includes(entry.type)) {
        line(entry.t, `${entry.type} ${JSON.stringify({ ...entry, t: undefined, type: undefined })}`);
      }
    },
  });

  const session = createSmartCubeSession(driver.connectDevice);
  const live = createSolveLive(session, { now: driver.now, getOrientation: () => driver.read('orientation', DEFAULT_ORIENTATION) });

  let seenInitial = false;
  const unsubDiag = subscribeConnection(entries => {
    if (!seenInitial) { seenInitial = true; return; }
    const entry = entries[entries.length - 1];
    if (entry?.kind === 'error') {
      errors.push(entry.label);
      line(driver.now(), `ERROR ${entry.label.split('\n')[0]}`);
    }
  });

  const sessionPhases = [];
  let lastSessionPhase = null; let lastMoves = null;
  session.subscribe(s => {
    if (s.phase !== lastSessionPhase) {
      lastSessionPhase = s.phase;
      sessionPhases.push(s.phase);
      line(driver.now(), `session phase=${s.phase} (${s.detail})`);
      if (s.phase === 'desynced') desyncs.push({ t: driver.now(), source: 'session', detail: s.detail });
    }
    const key = s.moves.join(' ');
    if (s.phase === 'tracking' && key !== lastMoves) {
      lastMoves = key;
      line(driver.now(), `        moves(${s.moves.length}) last=${s.lastMove ?? '-'}`);
    }
  });
  const livePhases = [];
  let lastLive = null;
  live.subscribe(s => {
    const label = `${s.phase}${s.progress?.phase ? '/' + s.progress.phase : ''}`;
    if (label !== lastLive) {
      lastLive = label;
      livePhases.push(s.phase);
      line(driver.now(), `live  ${label}${s.mode ? ` mode=${s.mode}` : ''}${s.phase === 'applying' ? ` step=${s.applyStep}/${s.applyTotal}` : ''}${s.record ? ` record: ${s.record.solveMs?.toFixed?.(0)}ms ${s.record.moveCount} moves` : ''}`);
      if (s.phase === 'desynced') desyncs.push({ t: driver.now(), source: 'live' });
    }
  });

  // Actions: session calls on the session, live calls on the tracker; UI-only
  // actions (view/coach toggles) do not affect session or tracker state.
  const onAction = action => {
    if (action.kind === 'session.call') return session[action.method]?.(...(action.args || []));
    if (action.kind === 'live.call') return live[action.method]?.(...(action.args || []));
    return undefined;
  };
  driver.setOnAction(onAction);

  let result;
  try { result = await driver.run(); }
  finally { unsubDiag(); live.detach(); }

  // Compare with what the app observed live.
  const recordedSessionPhases = recording.events.filter(e => e.kind === 'observe.session').map(e => e.data.phase);
  const finalRecorded = recording.final ? fromJSONSafe(recording.final) : null;
  const snapshot = session.getSnapshot();
  const mismatches = [];
  if (finalRecorded && !recording.dropped && finalRecorded.phase !== 'disconnected') {
    if (finalRecorded.phase !== snapshot.phase) mismatches.push(`final session phase ${snapshot.phase} != recorded ${finalRecorded.phase}`);
    if (finalRecorded.moves.join(' ') !== snapshot.moves.join(' ')) mismatches.push(`final moves differ: replay [${snapshot.moves.join(' ')}] vs recorded [${finalRecorded.moves.join(' ')}]`);
  }
  return {
    session: snapshot, live: live.getSnapshot(), lines, errors, desyncs, sessionPhases, livePhases,
    recordedSessionPhases, mismatches, divergences: result.divergences, actionErrors: result.actionErrors,
    ok: !errors.length && !desyncs.length && !mismatches.length,
  };
}
