# Demo-link verification prototype

`verify-prototype.mjs` is the working proof of the verification described in
SPEC-FLEET F17: apply setup + alg to a solved cube, infer the claim from what the
setup left unsolved, compare before with after, and report precisely what was
fixed or broken.

    node docs/research/demo-verify/verify-prototype.mjs

It is run against the two F2L examples an AI gave the user on 2026-10-03 (both
fail: one fixes nothing, the other also breaks the FL slot) and one known-good
case (passes). The production version additionally needs the tolerances listed in
F17 step 4d (AUF, whole-cube rotation, pseudo D-offset, orientation-only OLL).
