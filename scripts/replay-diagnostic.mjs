// Diagnostic replay: runs scenarios through the replay harness and prints exactly what the
// session/tracker/mirror do at each step, so we can see why tracking stops.
import { createReplaySession, createReplayScript } from '../src/replay.js';
import { createSolveLive } from '../src/solve-live.js';

function trace(label, session, solveLive) {
  let lastMove = null, lastLen = 0;
  const history = [];
  function onSession(s) {
    const lastEntry = s.moves?.[s.moves.length - 1];
    const mirror = s.moves?.length !== lastLen || lastEntry !== lastMove;
    if (mirror) { lastLen = s.moves?.length ?? 0; lastMove = lastEntry; }
    history.push({ phase: s.phase, moves: s.moves?.length ?? 0, lastMove: lastEntry ?? null, mirror });
  }
  session.subscribe(onSession);
  return history;
}

async function run(scenario) {
  console.log('\n=== ' + scenario.name + ' ===');
  const session = createReplaySession(scenario.script);
  const solveLive = createSolveLive(session, { getOrientation: () => ({ bottom: 'D', front: 'F' }), now: () => 0 });
  const history = trace(scenario.name, session, solveLive);
  await session.connect();
  await session.syncSolved();
  if (scenario.startGuided) solveLive.startGuided(scenario.script.scrambleMoves.join(' '));
  else solveLive.startFree();
  for (const move of scenario.script.allMoves) {
    const snap = session.step();
    const last = history.at(-1);
    console.log(`  ${move.padEnd(4)} | phase=${(snap?.phase ?? '-').padEnd(12)} moves=${String(snap?.moves?.length ?? '-').padEnd(3)} last=${snap?.lastMove ?? '-'} | mirror=${last?.mirror ?? '-'}`);
  }
  const final = history.at(-1);
  console.log('  => final phase:', final?.phase, '| moves:', final?.moves, '| desynced:', final?.phase === 'desynced');
}

// Scenario 1: a normal solve (scramble + inverse) — should track every move and reach solved.
const normalSolve = {
  name: 'normal solve',
  startGuided: true,
  script: createReplayScript({ scramble: "R U R' F2" }),
};
// attach allMoves for the run() loop
normalSolve.script.allMoves = [...normalSolve.script.scrambleMoves, ...normalSolve.script.solveMoves];

// Scenario 2: a solve whose first solving move is a WIDE turn (Uw) — the GAN decoder emits this as
// an unsupported label; the session should handle it (currently desyncs).
const wideMoveSolve = {
  name: 'wide move (Uw) mid-solve',
  startGuided: true,
  script: createReplayScript({ scramble: "R U" }),
};
wideMoveSolve.script.allMoves = [...wideMoveSolve.script.scrambleMoves, 'Uw', "U' R'"];

// Scenario 3: a solve whose first solving move is a SLICE (M) — also unsupported.
const sliceMoveSolve = {
  name: 'slice move (M) mid-solve',
  startGuided: true,
  script: createReplayScript({ scramble: "R U" }),
};
sliceMoveSolve.script.allMoves = [...sliceMoveSolve.script.scrambleMoves, 'M', "U' R'"];

await run(normalSolve);
await run(wideMoveSolve);
await run(sliceMoveSolve);
