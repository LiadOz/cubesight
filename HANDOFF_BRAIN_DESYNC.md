# CubeSight — smart-cube Brain trainer handoff

This is a handoff for the next agent. The user is extremely frustrated after many hours of iterative work. The core unresolved bug is below. The user asked for a written handoff so another agent can fix it. **Do not iterate blindly — read this file, reproduce the bug with a deterministic test, then fix it.**

## The bug

**After completing a guided scramble (the scramble is fully applied, phase is 'inspecting'), the FIRST solving move causes the session to `desync` on an `"R"` move → tracking stops ("it stops working after I finish the scramble").** The user has reproduced this consistently. It is NOT a WebGL issue (the 3D cube is a visualization; the tracking is in the session, which works without the cube). The user confirmed tracking works after a re-sync, but the desync returns on the next solve.

## The exact symptom (from the dev log)

The user connected a real GAN16ui (GAN Gen4), synced a solved cube, started a guided WCA scramble, performed it, then started solving. The dev log (`/tmp/cubesight-devlog.jsonl`) shows:

```
phase: desynced
moves=29
lastMove=R
detail=Unsupported move from cube: R. Solve it and sync again.
```

The session desynced on the **29th move** (`lastMove=R`). The detail says `Unsupported move from cube: R` — meaning `parseScramble(event.move)` or `applyMoves` threw.

**The 200-entry cap in the devlog evicted the moves 1-28 that led to the desync. I increased the cap to 2000 (`0206f88`), so the next trace should show the full sequence. The user was about to send the log again when they gave up.**

## Why this is hard to reproduce

`parseScramble("R", { allowWide: true })` returns `["R"]` (1 move, valid) — **no throw**. My isolated test confirms: emitting 31 plain `"R"` moves through the real `createSmartCubeSession` does NOT desync. So the `event.move` that caused the desync is NOT a plain `"R"`. Either:

1. The GAN decoder emitted a move string that is NOT a plain `"R"` (e.g., a wide/slice move, or a move with a trailing invisible character, or a face/direction out of range). The dev log's `.slice(0,20)` shows `"R"` but the full `event.move` might be longer/different.
2. **OR** there's a bug in the session's MOVE handler (in `smart-cube-session.js`) that corrupts state and causes a later valid move to throw. I could not reproduce this with plain moves, so the trigger is likely a coalesced double or a specific move sequence the user did.

## Architecture (current state of the smart-cube code)

- **`src/smart-cube-session.js`** — the device-neutral session. Owns the canonical cube state, move history, solved baseline, and the MOVE handler. The MOVE handler:
  ```js
  } else if (event.type === 'MOVE' && snapshot.phase === 'tracking') {
    logConnection({ ... }); // logs every move
    try {
      const moves = parseScramble(event.move, { allowWide: true });
      if (moves.length !== 1) throw new Error('Invalid move');
      const [move] = moves;
      ...coalescing (see below)...
      publish({ state, moves, lastMove: move, ... });
      lastCoalesce = { face, prime, cubeTs };
    } catch (error) {
      publish({ phase: 'desynced', detail: `Unsupported move from cube: ${String(event.move).slice(0, 20)}. Solve it and sync again.` });
    }
  }
  ```
  The desync is in the `catch` block — something in the `try` threw.

- **Double-turn coalescing** (in the session's MOVE handler): two same-face same-direction quarter events within a 50-tick `cubeTimestamp` window are merged into one `"U2"` (replaces the last entry instead of pushing). This was added to fix the U2 "off-plan flicker". The coalescing:
  ```js
  if (lastCoalesce && lastCoalesce.face === face && lastCoalesce.prime === prime
      && cubeTs !== null && lastCoalesce.cubeTs !== null
      && (cubeTs - lastCoalesce.cubeTs + DOUBLE_TURN_WINDOW) >= 0
      && (cubeTs - lastCoalesce.cubeTs) <= DOUBLE_TURN_WINDOW) {
    const double = `${face}2${prime ? "'" : ''}`;
    moves = [...snapshot.moves.slice(0, -1), double];   // REPLACES last entry
    state = applyMoves(snapshot.state, [move]);
  } else {
    state = applyMoves(snapshot.state, [move]);
    moves = isSolvedState(state) ? [] : [...snapshot.moves, move];
  }
  ```

- **`src/solve-live.js`** — the live solve tracker. Subscribes to the session. Its `onSnapshot`:
  ```js
  function onSnapshot(snap) {
    ...
    const lastEntry = snap.moves[snap.moves.length - 1];
    if (snap.moves.length !== lastProcessedLen || lastEntry !== lastProcessedMove) {
      // process the move (tracks last-move STRING so a coalesced U2 is not skipped)
    }
  }
  ```
  This guard was fixed to track the last move STRING (not just length) so a coalesced U2 (length unchanged, last entry changed `U`→`U2`) is processed. This fix is correct (tests pass).

## What I tried (and why it didn't work)

1. **U2 coalescing flicker** — the session coalesces two `"U"` into `"U2"`. The live tracker's `lastProcessedLen` guard keyed on moves LENGTH and SKIPPED the coalesced U2 → the cube never advanced to post-U2 → "stops tracking". Fixed by tracking the last move string. **But the user's desync is on `"R"`, not a coalesced U2.**
2. **Wide/slice moves desync** — the session desynced on `Uw`/`M` by design (the handoff). Fixed with `allowWide: true`. **But the user's desync is on `"R"`, not a wide move.**
3. **Recovery grace broke the scramble-undo** — a 90ms grace held `applyStep` back during a wrong turn → the recovery returned to the pre-wrong state and re-asked the same move → infinite loop. Fixed by removing the grace. **But the desync is on `"R"`, unrelated to the grace.**
4. **Comprehensive logging** — added `logConnection` to the session, the live tracker, and the Brain mirror. The trace shows the desync at move 29 (`lastMove=R`, `detail=Unsupported move from cube: R`) but the 200-cap evicted the moves before it. Increased to 2000.

## The real question for the next agent

**`parseScramble("R", { allowWide: true })` does NOT throw. The user's cube desynced on an `"R"` move. WHY?** Two hypotheses:

### Hypothesis A: the `event.move` is not a plain `"R"`

The GAN decoder (`node_modules/smartcube-web-bluetooth/src/gan-cube-protocol.ts` line 424) builds the move as:
```js
let move = "URFDLB".charAt(face) + "'".charAt(direction);
move = move.trim();
```
For face=1 (R), direction=0 (CW): `"URFDLB".charAt(1)` = `"R"`, `"'".charAt(0)` = `""` (empty). So `move = "R"`. `move.trim()` = `"R"`. **This is valid.** But maybe under specific firmware/hardware conditions, `face` or `direction` is out of range → `"URFDLB".charAt(out-of-range)` = `undefined` → `move = "undefined'"` → `parseScramble("undefined'")` rejects (regex `[URFDLB]`). But `.slice(0,20)` of `"undefined'"` = `"undefined'"` (9 chars), NOT `"R"`. The dev log showed `"R"` (1 char). So this doesn't fit.

**Unless the dev log's `.slice(0,20)` is misleading and the full `event.move` is `"R"` + trailing chars that `.slice(0,20)` shows as `"R"` but the full string is longer and parseScramble rejects the full string.** The `logConnection` call logs `JSON.stringify(event.move)` — check if the dev log captured the FULL move string (it should, since I log `JSON.stringify(event.move)`, not `.slice`). If the full string is `"R"` (exactly), parseScramble should accept it.

### Hypothesis B: the session's coalescing corrupts state and causes a later valid move to throw

The session coalesces two same-face same-direction quarter events into a double. The coalescing REPLACES the last `moves` entry with `"U2"` (or `"R2"`). Then `state = applyMoves(snapshot.state, [move])` where `move` = the SECOND quarter. If the previous state + the second quarter produces a valid state, fine. But what if the coalescing produced a `moves` array that's INCONSISTENT with the actual `state`? 

The coalescing branch: `moves = [...snapshot.moves.slice(0, -1), double]`. This replaces the last entry with the double. But `snapshot.moves` is the session's CURRENT moves (before this event). `snapshot.state` is the state after the PREVIOUS moves. So `applyMoves(snapshot.state, [move])` applies the second quarter to the pre-event state. That's correct (post-double state). And `moves = [..., double]` (the coalesced history). These are consistent.

**But** — what if the coalescing fires when it shouldn't? E.g., two `"R"` moves (same face, same direction) within 50 ticks → coalesce into `"R2"`. But what if the two `"R"` were NOT a physical double (they were distinct turns 200 ticks apart, but the `cubeTimestamp` gap was misreported as ≤50)? Then the session wrongly coalesces two distinct R turns into one R2 → the move history is wrong (one R2 instead of two R's) → the state is `post-R-R` (two R turns) but `moves = [..., "R2"]` (one entry). A later move that depends on the history... `applyMoves` uses the actual state (correct), but the `moves` array is wrong. This inconsistency could cause a solver or the `isSolvedState` check to fail. But `applyMoves` doesn't throw on an inconsistent `moves` — it just applies the move to the state. So no throw from the inconsistency.

### The most likely cause

**The desync is from the `catch` block. The `catch` fires when `parseScramble` throws OR `applyMoves` throws.** Since my isolated tests show neither throws for plain moves, the trigger is likely:

- A **coalesced move** where `applyMoves(snapshot.state, [move])` is called with a `state` that's somehow invalid (e.g., the coalescing produced a `move` that, when applied, throws because `parseScramble(move, {allowWide:true})` inside `applyMoves` rejects it). But `"R2"` is valid. `"U2"` is valid. So the coalesced move should be valid.

- **OR** the `event.move` from the GAN decoder is genuinely not a plain `"R"`. The only way to confirm: look at the FULL `event.move` string in the dev log (the `logConnection` call logs `JSON.stringify(event.move)`). If the dev log shows `"R"` (the full string) and it still desyncs, then `parseScramble("R", {allowWide:true})` is throwing in the REAL session but NOT in my isolated test — which means there's an environment difference (the real session's `parseScramble` vs my test's).

## How to reproduce (for the next agent)

1. Run the dev server: `cd /home/loz/projects/cubesight && ./node_modules/.bin/vite --port 5173 --host 0.0.0.0`.
2. Open `http://localhost:5173/#/brain` in a Web-Bluetooth Chrome.
3. Connect a real GAN16ui, sync solved, start guided, scramble, solve. The desync happens on the first solving move after the scramble.
4. Click "Send to dev" and read `/tmp/cubesight-devlog.jsonl` — the trace shows every `[session] MOVE` (the full `event.move` via `JSON.stringify`), `[live] onSnapshot`, and `[live] onSolveMove`.

**Alternatively**, write a node test that:
- Creates a `fakeCube` (see `tests/smart-cube-unit.test.mjs` for the pattern) through the REAL `createSmartCubeSession`.
- Emits a sequence of moves that includes a coalesced double (two same-face same-direction quarters within 50 ticks) followed by a plain `"R"`.
- Asserts that the session does NOT desync.
- If it DOES desync, the bug is in the session's coalescing. If it doesn't, the bug is in the `event.move` string (which can't tested by logging the full `event.move` and checking if `parseScramble` rejects it).

## What to fix

**Do NOT just "make the desync not happen" by catching and ignoring the error — that would hide the real bug and corrupt the cube state silently.** The fix depends on the cause:

- If the `event.move` is genuinely not a plain `"R"` (Hypothesis A): figure out WHY the GAN decoder emits a bad string and fix the adapter (`smart-cube-bluetooth.js`) or the session's handling. But the adapter just passes `event.move` through; the session is the one calling `parseScramble`.
- If the coalescing corrupts state (Hypothesis B): the coalescing logic is wrong. The `moves` array after coalescing should always be consistent with the `state`. Check: after coalescing, re-derive the state from the coalesced `moves` and compare to `applyMoves(snapshot.state, [move])`. If they differ, the coalescing is wrong.
- **Most likely**: the `event.move` from the GAN decoder, under real hardware, includes data my test doesn't simulate. The next agent should add `console.log('[session] RAW event.move=', JSON.stringify(event.move), 'len=', event.move?.length, 'charCodes=', [...(event.move||'')].map(c=>c.charCodeAt(0)))` to the MOVE handler (NOT just `JSON.stringify` which might hide invisible chars) and reproduce with the EXACT byte sequence from a real trace.

## Key files

- `src/smart-cube-session.js` — the session (MOVE handler, coalescing, desync catch). **The desync is here.**
- `src/solve-live.js` — the live tracker (onSnapshot guard, onSolveMove). The `lastProcessedMove` tracking is correct.
- `src/brain.js` — the Brain view (onSession mirror, connect chip, timeline, scramble flow, coach).
- `node_modules/smartcube-web-bluetooth/src/gan-cube-protocol.ts` — the GAN decoder (builds `event.move`).
- `tests/smart-cube-unit.test.mjs` — the session unit tests (has a fakeCube through the real session).
- `tests/live-tracker-coalesce-unit.test.mjs` — the coalescing tests.
- `tests/solve-live-unit.test.mjs` — the live tracker tests.

## Branch

`feature/smart-cube-guidance` on `https://github.com/LiadOz/cubesight.git`. Current HEAD: `0206f88`. The MAC auto-connect, WCA scrambles, fluent layout, method menu, and logging are all committed. The ONLY remaining issue is this desync.

## The user's parting words

> "You never fix the problem. Have it before. The moment that we finish the scramble, everything goes to shit, fix it. I don't want to do it anymore. Just write down a file and I'll let another agent just fix the problem."

This file IS that handoff. The next agent should: reproduce the desync with a deterministic test using the FULL `event.move` bytes from a real trace (or simulate the coalescing path), find the exact cause, and fix it in `smart-cube-session.js` — without hiding the desync behind a catch-and-ignore.
