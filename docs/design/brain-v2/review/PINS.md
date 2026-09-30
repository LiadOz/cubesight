# Pinned moments: data model for the trainers phase

A pin is one position of one solve that the user wants to come back to. The results review writes
pins; the trainers (later) read them and open at exactly that position. Code: `src/store/pins.js`
(validation, `createPinStore`), reached through `history.pins` (`src/store/history.js`).

Storage: object store `pins` (keyPath `id`) in the IndexedDB database `cubesight-history`
(DB version 2; upgrading from 1 only adds the store). Local only.

```
Pin {
  id         `${at}:${stage}:${moveIdx}`   one pin per moment; pinning again is a toggle
  at         record.at of the solve (the pin is self-contained and survives deleting the solve)
  moveIdx    solve moves applied at the pinned position (0 = the scrambled cube); position = scramble + movesUpTo
  stage      cross | pair1..pair4 | eo co oll | cp ep pll
  kind       detour | extra-move | better-pair | better-cross | pause | rotation | cancel | x-cross | skip | free-pair | pseudo | stage
  trainer    cross | f2l | oll | pll | lookahead
  scramble   the solve's scramble; the cube starts solved, turns in the cube's own frame
  crossFace  U D F B R L or null
  movesUpTo  solve moves played before the position (length === moveIdx)
  yours      what the user played from there to the end of the stage or window (max 60)
  better     the shorter solution from the same position, or null ("no suggestion yet")
  note       one line of coach text
  createdAt  ms
}
```

Trainer mapping (FEATURES 23): `cross` opens the cross drill with `scramble = scramble + movesUpTo`
and `face = crossFace`; `f2l` opens the pair planner at that position (`setup=`), `better` being the
model answer; `oll` / `pll` open that case's alg or recognition drill; `lookahead` (pauses,
rotations) opens the lookahead drill. A trainer rebuilds the position with
`stateFromScramble([...scramble, ...movesUpTo].join(' '))`. Drills may randomise whatever the
solution does not depend on (FEATURES 24). `history.pins.byTrainer(t)` is the queue for trainer `t`.

Not done yet: the trainers do not read pins; pins are not in the data export/import (`data-port.js`).
