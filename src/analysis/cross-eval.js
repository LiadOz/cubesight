// Cross evaluation with the existing optimal cross solver (SPEC 4.1).
//
// For a position S_i = scramble + the first i moves and the cross face, d_i is
// the optimal number of moves left to finish that cross. The loss of move i is
// loss_i = 1 + d_i - d_(i-1), in {0, 1, 2}, and the losses add up to
// (moves played) - d_0 once the cross is done. Also reported: the exact set of
// first moves that stay on a shortest path, and the best continuation.
//
// Pseudo-aware: when the user's cross completed with the cross layer offset
// (k != 0), distance is the minimum over the four frames (appending the layer
// turn to the position), so a pseudo cross is not charged for the layer turn it
// deliberately leaves for later. `frames: 'plain'` forces the plain frame.
//
// The evaluation is written once as a generator that asks questions; evaluateCross
// answers them synchronously (node tests) and evaluateCrossAsync awaits them
// (Web Worker or any async solver), with cancellation between queries.

const TURNS = ['', "'", '2'];
const FACES = ['U', 'D', 'F', 'B', 'R', 'L'];
const ALL_MOVES = FACES.flatMap(face => TURNS.map(turn => face + turn));
const SHIFT_TURN = ['', '', '2', "'"];
const MAX_DEPTH = 8;
// WASM masks are relative to the queried cross face. These face-specific
// mappings take the pair slot from segmentSolve's canonical D frame to WASM.
// Calibrated against real WASM solutions and checked geometrically for all faces.
const SLOT_MASK_BY_FACE = Object.freeze({
  D: { FR: 1, FL: 2, BL: 4, BR: 8 }, U: { BR: 1, FR: 2, FL: 4, BL: 8 },
  F: { FR: 1, BR: 2, BL: 4, FL: 8 }, B: { BR: 1, BL: 2, FL: 4, FR: 8 },
  R: { FR: 1, BR: 2, BL: 4, FL: 8 }, L: { FL: 1, FR: 2, BR: 4, BL: 8 },
});
const MASK_SLOT_BY_FACE = Object.fromEntries(Object.entries(SLOT_MASK_BY_FACE).map(([face, slots]) => [
  face, Object.fromEntries(Object.entries(slots).map(([slot, mask]) => [mask, slot])),
]));
const TARGET_DEPTH = 10;

const join = (scramble, moves) => [scramble, ...moves].filter(Boolean).join(' ');

function* evaluationSteps({ scramble, moves, face, upTo, frames, firstMoves, faceLengths, startPlan, targetMask = 0 }) {
  const ask = (sequence, asFace, maxResults = 1, mask = targetMask, maxDepth = MAX_DEPTH, timeoutMs = 1500) => ({ scramble: sequence, face: asFace, mask, maxDepth, maxResults, timeoutMs });
  let complete = true;
  const shifts = frames === 'plain' ? [0] : [0, 1, 2, 3];
  const frameTurn = k => (k ? [`${face}${SHIFT_TURN[k]}`] : []);

  // Distance in the best frame; returns { d, k, best, proven }.
  function* distance(prefix) {
    let best = { d: Infinity, k: 0, best: [], proven: true };
    let allFramesProven = true;
    for (const k of shifts) {
      const reply = yield ask(join(scramble, [...prefix, ...frameTurn(k)]), face, 1, targetMask, targetMask ? TARGET_DEPTH : MAX_DEPTH);
      const found = reply?.results?.[0];
      if (reply?.status !== 0) { complete = false; allFramesProven = false; }
      if (found && found.moves.length < best.d) best = { d: found.moves.length, k, best: found.moves, proven: reply.status === 0 };
    }
    best.proven = allFramesProven && Number.isFinite(best.d);
    return best;
  }

  const positions = [];
  for (let i = 0; i <= upTo; i++) {
    const prefix = moves.slice(0, i);
    const here = yield* distance(prefix);
    const row = { i, d: here.d, k: here.k, best: here.best, proven: here.proven, firstMoves: [] };
    if (i > 0) {
      row.move = moves[i - 1];
      row.loss = Number.isFinite(here.d) && Number.isFinite(positions[i - 1].d) ? 1 + here.d - positions[i - 1].d : null;
    }
    if (firstMoves && here.d > 0 && Number.isFinite(here.d)) {
      for (const move of ALL_MOVES) {
        const next = yield* distance([...prefix, move]);
        if (next.d === here.d - 1) row.firstMoves.push(move);
      }
    }
    positions.push(row);
  }

  let lengths = null;
  let faceProven = null;
  let faceComplete = true;
  let xcrossFaces = null;
  if (faceLengths) {
    lengths = {};
    faceProven = {};
    if (startPlan) xcrossFaces = {};
    for (const other of FACES) {
      const reply = yield ask(scramble, other, 1, 0);
      if (reply?.status !== 0) faceComplete = false;
      lengths[other] = reply?.results?.[0]?.moves.length ?? null;
      faceProven[other] = reply?.status === 0 && Boolean(reply?.results?.[0]);
      if (startPlan) {
        const opportunities = [];
        let masksComplete = true;
        for (const mask of [1, 2, 4, 8]) {
          const xreply = yield ask(scramble, other, 1, mask, 10, 100);
          const found = xreply?.results?.[0];
          if (xreply?.status !== 0) { faceComplete = false; masksComplete = false; }
          opportunities.push({ slot: MASK_SLOT_BY_FACE[other][mask], mask, length: found?.moves?.length ?? null, moves: found?.moves ?? null, proven: xreply?.status === 0 && Boolean(found) });
        }
        const candidates = opportunities.filter(row => row.length != null).sort((a, b) => a.length - b.length);
        xcrossFaces[other] = { opportunities, best: candidates[0] ?? null, complete: masksComplete, proven: masksComplete && candidates.length > 0 };
      }
    }
  }
  return { positions, complete, faceLengths: lengths, faceProven, faceComplete, xcrossFaces };
}

function summarize(base, { positions, complete, faceLengths, faceProven, faceComplete, xcrossFaces }, frames) {
  const d0 = positions[0].d;
  const last = positions[positions.length - 1];
  const totalLoss = positions.slice(1).reduce((sum, row) => sum + (row.loss ?? 0), 0);
  return {
    face: base.face, frames, targetMask: base.targetMask, targetSlots: base.targetSlots, shift: last.k, userMoves: base.upTo, d0,
    finished: last.d === 0, extraMoves: last.d === 0 ? base.upTo - d0 : null, totalLoss,
    bestContinuation: positions[0].best, positions, faceLengths, xcrossFaces, complete,
    startProven: positions[0].proven, faceProven, faceComplete,
  };
}

// Decide the frame mode and the number of moves to evaluate from a segmentation.
function prepare(request) {
  const { segmentation } = request;
  const scramble = request.scramble ?? segmentation?.scramble;
  const moves = request.moves ?? segmentation?.moves;
  const face = request.face ?? segmentation?.crossFace ?? 'D';
  const crossIdx = request.crossIdx ?? segmentation?.marks?.crossIdx;
  const upTo = request.upTo ?? (crossIdx == null ? Math.min(moves.length, 12) : crossIdx + 1);
  const crossFrame = segmentation?.frames?.[crossIdx]?.k ?? segmentation?.initial?.k;
  const frames = request.frames ?? (crossFrame ? 'any' : 'plain');
  const targetSlots = request.targetSlots ?? (segmentation?.xcross?.kind === 'cross' ? [] : segmentation?.xcross?.slots ?? []);
  const targetMask = request.targetMask ?? targetSlots.reduce((mask, slot) => mask | (SLOT_MASK_BY_FACE[face]?.[slot] ?? 0), 0);
  return { scramble, moves, face, upTo, frames, targetMask, targetSlots, startPlan: request.startPlan === true, firstMoves: request.firstMoves ?? true, faceLengths: request.faceLengths ?? true };
}

export function evaluateCross(request, solver) {
  const base = prepare(request);
  const steps = evaluationSteps(base);
  let step = steps.next();
  while (!step.done) step = steps.next(solver.search(step.value));
  return summarize(base, step.value, base.frames);
}

export async function evaluateCrossAsync(request, solver, { signal } = {}) {
  const base = prepare(request);
  const steps = evaluationSteps(base);
  let step = steps.next();
  while (!step.done) {
    if (signal?.aborted) { const error = new Error(/* copy-ok: AbortError is an internal worker contract */ 'Analysis cancelled'); error.name = 'AbortError'; throw error; }
    step = steps.next(await solver.search(step.value));
  }
  return summarize(base, step.value, base.frames);
}
