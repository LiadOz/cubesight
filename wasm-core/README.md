# Corner recognition WASM core

This crate contains the deterministic, browser-safe training logic for the
corner-recognition UI. It models all 24 canonical corner position/orientation
cases, includes solved centers and edges for a renderer that hides corner
cubies, and keeps per-case timing/accuracy data for weak-case practice.

The exported functions use JSON strings so they are easy to call from any
frontend:

- `case_count()` → `24`
- `case_catalog()` → array of all cases
- `generate_case(index)` → one case (`index` wraps)
- `random_case(seed)` → reproducible pseudo-random case
- `score_attempt(caseId, elapsedMs, correct, historyJson)` → updated history
- `weak_cases(historyJson, limit)` → cases ranked for practice weighting
- `f2l_case(seed, bottomFaceOrNeutral)` → a legal full-cube F2L state. Use
  `"U"`, `"D"`, `"F"`, `"B"`, `"R"`, or `"L"` for a fixed bottom face, or
  `"neutral"`/`""` to choose one deterministically from the seed. The result
  includes all cubie identities, positions, orientations, pair metadata,
  cross metadata, centers, and 54 facelets.

Build the WebAssembly package with:

```sh
rustup target add wasm32-unknown-unknown
wasm-pack build --target web
```

Native tests can be run without a WASM target:

```sh
cargo test
```
