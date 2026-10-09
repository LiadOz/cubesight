# The merge queue (F18)

The queue is the methodology for when a merge to trunk (`main`) happens. It is not a CI service; it is a script run locally. **Nothing lands on trunk unless `npm test` passes on the MERGED RESULT of the change and the current trunk.** A branch that is green alone but breaks in combination is rejected, and trunk stays untouched.

## For an agent: queue your work
1. Commit everything (uncommitted work is not queued). Update from trunk: `git merge main`, resolve, run `npm test`.
2. From **your own worktree**: `npm run queue -- <your-branch>` (no argument queues the branch you are on).
3. Read the result. `LANDED` means trunk advanced. `GREEN` means the gate passed but the queue deliberately did not move trunk (see below); tell the lead the printed tip. `REJECTED` means trunk is unchanged and a diagnosis file path is printed.

## For the lead: run the queue
`npm run queue -- <branch-a> <branch-b> <branch-c>` processes them in order. Each is merged onto the tip left by the previous one and gated there, so queued changes are validated in combination. A rejected branch does not block the ones after it; they are tested against the tip without it.

Trunk is checked out in the live checkout, and moving a checked-out branch ref would desync that working tree. So while any worktree has trunk checked out, the queue **validates but does not advance trunk**. It prints the green tip and the one command to take it, which you run in that checkout yourself: `git merge --ff-only <sha>` (the commit it names is a descendant of trunk, so it is a fast-forward and your working tree stays in sync). When trunk is not checked out anywhere (for example you work on another branch), the queue fast-forwards it itself with a compare-and-swap, and re-tests if trunk moved meanwhile.

`--validate-only` never advances trunk. `--no-explain` skips the extra "does it pass alone?" run on rejection. `--base <branch>` changes trunk.

When the user explicitly allows a longer run, `CUBESIGHT_TEST_TIMEOUT_MS=120000 npm run queue -- <branch>` gives the same selected tests longer to finish. Selection still uses the normal one-minute plan, no assertions are skipped, and the default timeout stays 60 seconds. The queue's outer timeout still applies.

## What a rejection looks like
```
REJECTED  cube-camera
          Gate test exited 1
          diagnosis: .agents/artifacts/merge-queue/<attempt>/diagnosis.md
```
`diagnosis.md` has: the base, candidate and merge-base commits; the reason; whether the candidate passes the gate **alone** (then it is a combination failure) ; files changed on both sides (or "none: the interaction is semantic", like the algs ring/cube drift where Orbit sizing and the cube camera each changed different files); the trunk commits the branch has not seen; and the last 60 lines of the gate log. `attempt.json` records branch, base, candidate and result commits, gate results and duration; `gate.log` is the full output. A textual conflict is rejected before the gate, naming the files.

## Recovery
- Update your branch from trunk (`git merge main`), fix, queue again. Do not edit the gate to get through.
- "Another queue run holds .../merge-queue.lock": runs are serialized. If no queue process is alive (`ps`), delete that file.
- Leftover scratch worktrees under `.agents/worktrees/merge-queue/` after a crash: `git worktree remove --force <path>; git worktree prune`. The merged result of every attempt stays reachable as `refs/merge-queue/<attempt>` until you delete it.
- "Dependencies are not installed for the merged result": the merged lockfile needs packages the shared `node_modules` lacks. The queue runs `npm ci` in the scratch worktree for that case; if that fails (offline, no cache) the change must not land until the dependency is installable. This is the failure that once broke the pre-commit hook on trunk.

## What is enforced in code (scripts/merge-queue.mjs) and what is not
Enforced: git/npm never run in the live checkout (any command whose cwd is inside it, other than under `.agents/`, throws; the live checkout is the repository's main worktree, or `CUBESIGHT_LIVE_CHECKOUT`); `--no-verify` and `git stash` are refused at the single spawn point; trunk is never advanced while any worktree has it checked out; trunk is advanced only by compare-and-swap after a green gate on the merged result; runs are serialized by a lock; the gate has a wall-clock timeout and its process group is killed; artifacts and scratch worktrees go to the host-backed `.agents/` (the "host" mount, or any disk with 100 GiB free), checked before running. Documented only: branch hygiene (small branches, update from trunk often), not editing the gate, and that agents never push.

## The gate
`chooseGate()` in `scripts/merge-queue.mjs` is the single place that names it: `npm test -- --base <trunk tip>` run in the merged result. There is exactly one suite and nothing behind it: `npm test` runs lint, every unit test, the build, the browser tests the merged diff reaches (smoke set as the floor) and then a rotation of the tests longest without a passing run, PWA offline specs included, all inside 60 s. A selected test that does not fit is recorded as owed and runs first in the next run's rotation (the record is shared by every worktree), so nothing is skipped for good and there is no later, longer stage. A rotation test that fails rejects the merge too, and the report says it was a rotation test and lists the commits since it last passed.

## Proof
`node scripts/merge-queue-demo.mjs` builds a throwaway repository with two branches that are each green alone and red together (modelled on the 15 px ring/cube drift), queues them, and shows the second rejected with trunk untouched. `tests/merge-queue-unit.test.mjs` covers the same plus the safety rules.
