# Algorithm database and smart-cube algorithm drills

Status: design and technical spec (no code yet). Decisions 11 and 12 in `docs/ideas/FEATURES.md`.
Mockups: `A-01` ... `A-06` and `A-mono-02` in this folder (Orbit dark first; one Mono dark, one phone, one review-to-drill entry). Sample data in the mockups is invented and marked as such.

The idea in one paragraph: one **algorithm database** is the common core of every alg-learning feature. Every module asks it the same three questions: *which algs exist for this case*, *which one is mine*, *how fast am I with it*. On top of it sits a **smart-cube alg drill** that repeats one algorithm, times every move, and "repaints" the last layer virtually so you never have to re-set-up the cube.

## 0. Hard constraints

1. **Fully offline, installed PWA. No backend, no runtime calls to any external service or API.** Everything in this spec runs in airplane mode.
   - The database ships **inside the app bundle** (seed data as ES modules, so the existing `workbox.globPatterns` `**/*.js` rule already precaches it; if a builder prefers `.json` seed files, add `json` to `globPatterns` in `vite.config.js`). The service worker precaches it; nothing is fetched at runtime.
   - **Sources and YouTube videos are plain outbound links.** No embeds, no thumbnails, no favicons, no oEmbed/title lookups, no timestamp resolution. Titles, authors and video timecodes are typed by the user or written into the seed by hand. Each link carries a small "needs internet" chip (shown always; greyed and inert-looking when `navigator.onLine === false`), opens with `target="_blank" rel="noopener noreferrer"`, and never fires from the page on its own.
   - **Reconstructions and "used by top cubers" come only from** (a) text or files the user pastes or imports (alg.cubing.net URLs are parsed locally, since setup and alg live in the query string; pasting a URL never fetches it), or (b) a curated dataset bundled with the app **only if** the source has granted permission (section 2).
   - No scraping, no fetching, no account, no sync service. Backup and moving devices is export/import of a file (section 3).
2. **No bulk copying of third-party content** without permission (section 2).
3. Local-first storage: IndexedDB (decision 3), with export/import through `src/data-port.js`.
4. Nothing here edits `src/` yet. The module layout in section 8 is a recommendation for the builders.

## 1. Data model

Conventions: ids are stable strings; timestamps are epoch ms; the JSDoc-style typedefs below are the contract (they would live in `src/algs/types.js`, like `src/brain/types.js`).

### 1.1 Case

A **case** is a situation on the cube that an algorithm solves: one OLL, one PLL, and later COLL, ZBLL, F2L cases or user-defined sets.

```js
/** @typedef {Object} AlgCase
 * @property {string} id        'pll/Jb' | 'oll/21' | 'oll2/sune' | 'f2l/07' | 'user/<uuid>'  (same shape as the URL: #/algs/<set>/<name>)
 * @property {string} set       'pll' | 'oll' | 'oll2' (2-look OLL steps) | 'pll2' | 'coll' | 'zbll' | 'f2l' | 'user'
 * @property {string} name      'Jb', 'OLL 21', 'Sune'
 * @property {string[]} aliases ['J-perm b', 'Jb perm']
 * @property {string} group     'J' | 'cross' | 'dot' | 'T-shape' ... (grid sections, recognition families)
 * @property {{cue:string, features:Object<string,string|number>, tags:string[]}} recognition
 *   cue = the one-line text already in pll-logic.js ("One adjacent pair of headlights..."), features = machine-readable
 *   (headlights:1, edgeOrientation:'line', cornersOriented:2 ...) used by the recognition drills and filters.
 * @property {{kind:'pll'|'oll'|'coll'|'zbll'|'f2l', sig:string}} key   canonical case key (1.5)
 * @property {string} refAlgId  alg used to build the canonical state: state = applyMoves(solved, invert(ref)) (as pll-logic.js does)
 * @property {number} prob      probability of meeting the case in an LL (1/72 ... ; symmetry-aware) for weighting drills
 * @property {{inverse?:string, mirror?:string, mirrorInverse?:string}} related   other case ids ('pll/ja' mirror of 'pll/jb')
 */
```

The canonical state of a case is **derived, not stored**: apply the inverse of `refAlgId` to a solved cube. That is what `generatePllCase` already does. Only `key.sig` is cached and unit-tested against the derived state.

### 1.2 Algorithm

```js
/** @typedef {Object} Alg
 * @property {string} id           's.pll.Jb.1' for seed algs (stable across app versions), 'u.<uuid>' for user/imported. Only [A-Za-z0-9.-], so it is safe in a URL query
 * @property {string} caseId
 * @property {string} notation     exactly as written and displayed: "R U R' F' R U R' U' R' F R2 U' R' U'"
 * @property {Normalized} norm     derived, cached (1.4)
 * @property {{htm:number, stm:number, etm:number, qtm:number}} counts   derived from norm, see 1.4
 * @property {string} grip         'R' (right-hand front) | 'L' | 'both'  (who can execute it without rotations)
 * @property {string} fingertricks free text: "Start with a right-index push on the F', wrist on R2."
 * @property {number[]} regrips    0-based move indices (of norm.moves) where a regrip / rotation happens; the drill and move guide mark them
 * @property {{pre:string[], post:string[]}} auf   AUFs the written notation includes or typically needs ("U'" ...). Stripped from norm.
 * @property {string[]} tags       '2-gen' | 'OH-friendly' | 'no-rotation' | 'm-slice' | 'wide' | 'lefty' | 'sledge-free' ...
 * @property {Source[]} sources    attribution, 1.3. Never empty: seed algs with no known origin carry a 'standard' source.
 * @property {'seed'|'user'|'import'} origin
 * @property {number} addedAt
 * @property {string|null} verifiedWith   engine version that verified solve-effect == case (null = unverified -> hidden from drills)
 */
```

### 1.3 Source (the attribution record)

```js
/** @typedef {Object} Source
 * @property {'site'|'video'|'book'|'reconstruction'|'personal'|'standard'} type
 *   'standard' = widely published notation with no single identifiable origin (the existing pll-logic.js algs)
 * @property {string} name       "J Perm: PLL video"  (typed by hand or by the user; never fetched)
 * @property {string} [author]   "J Perm" — the creator/teacher
 * @property {string} [url]      outbound link only. https URL, stored verbatim
 * @property {number} [timestampSec]  for videos: the moment the alg is shown; the link is rebuilt as `?t=<n>` (youtu.be / youtube.com only)
 * @property {string} [cuber]    reconstruction: the solver (may differ from the author)
 * @property {string} [event]    reconstruction: "WCA 3x3 final, 2024" (free text)
 * @property {string} [date]     ISO date of the solve or the video
 * @property {'link-only'|'user-own'|'permission-granted'|'open-license'} rights
 *   what we are allowed to do with it: link-only (default for anything third-party), user-own (the user's own
 *   alg/notes), permission-granted (fill in `permission`), open-license (fill in `license`)
 * @property {string} [permission] "Email from X, 2026-10-12, allows shipping PLL list with attribution" (the audit trail)
 * @property {string} [license]
 * @property {string} [note]     the user's note ("J Perm's preferred Jb; he says to start with the trigger")
 */
```

Tagging rule: the same alg can have many sources. A video source on an existing alg is the typical way the user records "I learned this from J Perm". Sources are merged on dedupe (1.6). Only the link, the name, and the attribution text are stored. The video's *content* (frames, transcripts, fingertrick descriptions copied from a page) is never copied. The user's own paraphrased fingertrick notes are theirs.

### 1.4 Normalisation and move counts

`normalize(notation)` produces the **rotation-free outer-face stream**, the same shape a centre-fixed smart cube reports:

1. Tokenise: `URFDLB`, wide (`Rw`, `r`), slices (`M E S`), rotations (`x y z`), suffix `2`, `'`, and the sloppy `2'` / `'2` (both mean `2`). Whole-alg parentheses and `*` are stripped.
2. **Absorb rotations and wide/slice moves** into outer faces: `r = L x`, `M = R L' x'`, `E = U D' y'`, `S = F' B z`, etc. Keep a running frame; every later move is relabelled through it; the net rotation is recorded in `norm.netRotation` and otherwise ignored. A centre-fixed cube never senses rotations or centre motion, so this is exactly its language.
3. **Canonical order**: merge adjacent same-face turns (`U U` = `U2`, `R R'` cancels); opposite faces commute, so sort each maximal same-axis run (`L' R` -> `R L'`), then merge again until stable.
4. **Strip AUF**: leading and trailing `U`-face turns (only those) move to `auf.pre` / `auf.post`. All comparison and all timing use the stripped stream.
5. `norm = { moves: ['R','U',...], frame: 0, netRotation: 'x2'|null, key: '...' }` where `key` is the lexicographic minimum over the four `y` conjugates (frame-canonical), so "F U F'" and "R U R'" (same alg, other grip) share a key.

Move counts, all computed from the **written** notation with rotations counting as stated:

| metric | rule |
|---|---|
| HTM | face or wide turn = 1 (`R2` = 1); slice turn = 2 (`M2` = 2); rotations = 0 |
| STM | face, wide and slice turn = 1; rotations = 0 |
| ETM | every turn including rotations = 1 |
| QTM | quarter turns; a half turn = 2; slice = 2 |

The drill's TPS uses the **stripped normalised stream** length (`norm.moves.length`), because that is what the cube reports (a cube reports `M2` as `R2 L2`, for instance).

### 1.5 Case keys and equivalence detection

Two kinds of equality are needed and they are not the same thing.

- **Function equality** ("do they do the same thing to the cube"): the *effect* of an alg is the piece permutation/orientation you get by applying it to a solved cube, re-expressed relative to the centres (`centreFrame(state)`: rotate the whole state so the centres are home; this removes rotations and makes `M2` and `R2 L2` equal).
- **Notation equality** ("is it the same move sequence"): equality of `norm.key`.

Crucial consequence: **all algs for one PLL case are the same function up to AUF** (the PLL state has every LL piece distinguishable, and any two algs that solve the same state are the same group element up to the final U turn). So for PLL, "which alg is this" is purely a token-level question; only `norm.key` tells Jb variant #1 from #2. For OLL, different algs of one case generally differ as functions (they leave a different LL permutation), so the **effect** does identify them.

Equivalence levels the database computes (each is an indexed column, used for dedupe, "same alg, other grip" and the review link):

| level | means | test |
|---|---|---|
| E1 notation | same alg written differently: rotations, wide/slice forms, `U2'`, commuting order, cancellations | `norm.key` equal |
| E2 AUF | same alg, different AUF | keys of the stripped streams (already in `norm.key`) |
| E3 grip | same alg executed from another y-frame | `norm.key` is min over y-conjugates |
| E4 function | same effect up to AUF/frame (different move sequence, same result) | `effectKey` = min over `U^a . effect . U^b` and y-conjugates of `hash(centreFrame(effect))` |
| E5 mirror | left-right mirror: `R<->L`, `r<->l`, **invert** every face/wide turn (`R -> L'`), `M` unchanged, `E`,`S` inverted | `mirrorKey(alg) = norm.key(mirror(alg))`; linked via `Case.related.mirror` |
| E6 inverse | the inverse alg, which solves the inverse case (Aa <-> Ab style pairs) | `norm.key(invert(alg))`; linked via `Case.related.inverse` |

Case membership key (`Case.key.sig`): take the canonical state of the case and minimise over the pre/post AUF double coset:

- **PLL**: `min over a,b in 0..3 of sig(U^a . state . U^b)`, with `sig` = today's `topSignature` (piece ids and stickers of the 8 LL pieces). `canonicalPllSignature` already does the one-sided half; the double coset also absorbs post-AUF and y conjugation. (Today `identifyPllCase` returns `null` for the state `inverse("R U R' F' R U R' U' R' F R2 U' R'")`, the Jb alg written without its last `U'`, which is exactly why the drill and the review need the two-sided key.) Unit test: exactly 21 distinct keys from the 21 seed algs, and `identifyPllCase(state)` keeps working.
- **OLL**: orientation only: the 8 LL piece orientations (corner twist 0/1/2, edge flip 0/1) read around the layer, minimised over the four U rotations. Exactly 57 non-solved keys (and the 7 "all edges ok" OCLLs are just members). Permutation is ignored.
- **COLL/ZBLL/F2L** (later): COLL adds corner permutation, ZBLL adds LL edge permutation, F2L is keyed per slot with the pair's relative position; same minimisation idea.

**Verification at load**: every alg is verified once (and on `engineVersion` change): apply `inverse(alg)` to a solved cube, compute its case key, compare with `alg.caseId`'s key. A mismatch marks the alg unverified; unverified algs are shown with a warning and never offered to drills. This is how typos in hand-entered or user-added algs are caught, and it makes user-added algs safe: the user pastes an alg, the app tells them which case it solves ("this is Jb") or "this does not solve an F2L-preserving LL case".

### 1.6 Dedupe and merge

On add/import: compute `norm.key`. Same key in the same case => **merge**: union the `sources`, keep the older `id`, keep the notation the user already has. Same `effectKey` but a different key => add as a separate alg flagged "same effect as #n" (common for PLL: different fingertricks of the same function). Near-duplicates (edit distance <= 2 on the normalised streams) are suggested as "looks like #n, merge?" but never merged silently.

### 1.7 User data

```js
/** @typedef {Object} AlgPick      // my chosen alg per case
 * { caseId, algId, since, previous: {algId, from, to}[] }   // tiny; mirrored in localStorage 'cubesight-alg-picks' so the existing data-port v1 already backs it up
 *
 * @typedef {Object} AlgPractice   // derived per alg, rebuilt from attempts; never the source of truth
 * { algId, attempts, cleanAttempts, pbExecMs, pbTps, pbAt, pbMoveMs: number[],   // pbMoveMs = cumulative per-move times of the PB run (ghost)
 *   medianExecMs, ao12ExecMs, hotspots: {i:number, score:number}[], lastAt, srs: {interval,due,streak} }
 *
 * @typedef {Object} DrillAttempt   // the source of truth, one row per rep, section 5.5
 * { id, algId, caseId, at, mode, frame, preAuf, postAuf, variantAlgId|null, clean, mistakes,
 *   latencyMs|null, executionMs, aufMs, totalMs, moves, tps, tokens: {m, t, dt}[] }
 */
```

Retention: keep the last 1000 full attempts per alg; older attempts are rolled into per-day aggregates `{algId, day, n, cleanN, bestExecMs, medianExecMs}` so a year of drilling stays small (~300 bytes per attempt).

### 1.8 Reconstructions and usage stats

```js
/** @typedef {Object} Reconstruction       // user-imported only (section 2)
 * { id, source: Source (type 'reconstruction'), cuber, event, date, time: number|null,
 *   scramble, moves: string,              // solution text as pasted, AUF and rotations included
 *   importedAt, importedFrom: 'paste'|'file'|'url-parse'|'pack',
 *   analysis: {f2lDoneAt:number|null, oll: LlUse|null, pll: LlUse|null, oneLook: LlUse|null} }
 *
 * @typedef {Object} LlUse                 // one LL alg found in one reconstruction
 * { reconstructionId, cuber, caseId|null, algId|null, normKey, moves: string[], preAuf, postAuf,
 *   matchLevel: 'E1'|'E4'|'case-only'|'none', lookIndex: 'oll'|'pll'|'1look' }
 */
```

**Usage stats are derived** (recomputed from `LlUse` rows, never hand-edited): `usage(caseId) = [{algId|normKey, total, byCuber: {cuber: n}, share}]`, sorted by total. Unknown algs (`algId = null`, `matchLevel = 'case-only'`) are listed by `normKey` with an "add to my algs" action (origin `import`, with a `reconstruction` source that links to the original post). "Top cubers" means **the cubers present in the reconstructions the user imported**, nothing more; the UI says so ("from the 41 reconstructions you imported").

**Identification** (`identifyLl(scramble, moves)`, shared with the solve review):

1. Replay to the state after each move; `f2lDoneAt` = first index where `analyze(state, crossFace).f2lDone` (or `f2lDonePseudo` when the review's pseudo-slotting detection says so).
2. Strip a leading/trailing AUF; `ollDoneAt` = first index after `f2lDoneAt` where `ollSolved`. Segments: `[f2lDoneAt, ollDoneAt)` = OLL look, `[ollDoneAt, end)` = PLL look, or one 1-look segment if the orientation completes only when the state is solved.
3. Case of the segment = `caseKeyOf(stateAtSegmentStart)`.
4. Alg of the segment: `norm.key` of the segment's moves against the case's algs (E1/E3); fallback for OLL `effectKey` (E4); else `case-only`. The last F2L move often cancels into the alg's first move, so also try the boundary shifted by up to 2 moves, matching on `norm.key` after cancellation.
5. No per-move timing exists in a pasted reconstruction, so no pause/TPS is ever attributed to it.

## 2. Seed data and licensing

This section is a design position, not legal advice. The stance is deliberately conservative: if in doubt, **link, do not copy**.

### 2.1 What ships in the app

| content | origin | rights |
|---|---|---|
| The 21 PLL algs already in `src/pll-logic.js` (incl. `cue` text, which is our own wording) | existing code; they are standard, widely published notation | `standard` source (they are already part of the repo). Attribute nothing to a named person we cannot verify; the user may add a video source on top. |
| A small 2-look OLL set (corner orientation: Sune, Antisune, H, Pi, U, T, L; edge orientation: line, L-shape, dot; the dot case with the two-step sequence) | hand-entered by the maintainer from the standard shared notation, then **verified by the engine** (1.5) | `standard` source |
| Each seed alg's **case data** (recognition features, cues, groups) | written by us | ours |
| **Links** per case to public pages/videos (J Perm's algorithm pages or videos, SpeedCubeDB case pages, CubeSkills, alg.cubing.net) | hand-written URL + our own label + author name | link-only; no content copied |

What is deliberately *not* in the seed: full OLL (57) / F2L (41) / COLL / ZBLL lists lifted from any single site or video, per-alg fingertrick text copied from a page or transcribed from a video, thumbnails or images from those sites, any reconstruction dataset.

A single alg (a short move sequence) is a fact about the cube, and most published algs have been shared freely for years. But **a curated collection** (selection, ordering, fingertrick text, images, rankings) can carry database rights or site terms, and a video is a copyrighted work. So we ship only a small hand-curated set we are comfortable standing behind, everything else comes from the user or from a source that said yes.

### 2.2 How the user adds data (all local, all offline)

- **Add my alg**: paste notation -> the app normalises it, tells the user which case it solves, shows move counts, dedupes (1.6) and stores it with `origin: 'user'`, `rights: 'user-own'`.
- **Tag a source**: on any alg, "add source": type, name, author, URL, video timecode (seconds or `m:ss`), a note. "I learned this from J Perm" = one source of type `video`, author `J Perm`, a URL the user pasted. The user can pick their own alg (`AlgPick`) independently of where it came from.
- **Import a reconstruction**: paste text (`scramble` + `solution`), a whole-line "scramble / moves" block, or an alg.cubing.net URL (parsed locally; nothing fetched), plus optional cuber, event, date and the URL of the original post (stored as a link only). Import from a **file** the user exported from another tool (`cubesight-recons` JSON, or plain text with several solves separated by blank lines).
- **Packs**: the user can export their own algs and reconstructions as a `cubesight-alg-pack` JSON (with their sources). A pack a friend sends is the same thing: it carries `rights` per item and is imported through the same dedupe path. This is the legitimate path to "someone else curated a list": *they* share it.

### 2.3 What needs permission, and how to ask

| wanted | needs | ask |
|---|---|---|
| Bulk-import J Perm's algorithm pages/lists (jperm.net) or his fingertrick notes | the author's written permission | email/message J Perm |
| Bulk-import SpeedCubeDB case/alg lists, or their "used by top cubers" data | the site owner's written permission (and confirmation of the license of their data) | contact the SpeedCubeDB maintainer |
| CubeSkills / other commercial course material | publisher permission; almost certainly link-only | link only unless they agree |
| Shipping a dataset of pro reconstructions | each reconstructor's and the hosting site's permission | ask both (who wrote the reconstruction, who hosts it) |
| WCA results/scrambles | published under the WCA's public data terms; it has no solutions, so it does not feed alg stats | read the current WCA export terms before use |
| Anything from a video (fingertrick text, frames) | creator permission | link only |

Draft request (for the user to send, edit freely):

> Hi <name>, I am building a free, fully offline cubing-practice web app (no ads, no servers, nothing is sent anywhere) that helps people learn algorithms and drill them with a GAN smart cube. I would love to include <what exactly: e.g. your PLL algorithm list with your fingertrick notes / your alg pages as links>. If you agree, I would ship it <bundled in the app / as an optional downloadable pack>, always credited to you with a link back to <page/video>. I would not modify or sell it, and I will remove anything you ask me to remove. Which of these are you comfortable with: (1) links to your videos/pages only, (2) the alg list with credit, (3) also your notes/fingertricks? Thanks!

Audit trail: when permission arrives, it is stored on the source (`rights: 'permission-granted'`, `permission: '<who, when, what>'`) and kept in `docs/` with the message. Until then the source stays link-only. A "sources and rights" screen lists every bundled source with its rights so nothing slips in.

### 2.4 Reconstruction data policy

User-imported only, unless a source grants permission. The app ships no reconstruction data by default. Credit always names **both** the solver and the reconstructor/site when known, and always links back. Stats that depend on imported reconstructions say so in the UI. If a curated dataset is ever bundled (permission granted), it is an ordinary precached module, tagged per item as `permission-granted`, and removable.

## 3. Storage, offline and sync

- **Seed** (cases, seed algs, seed sources): ES modules under `src/algs/seed/`, part of the bundle and of the service-worker precache. Loaded in memory at startup; nothing seed-related is written to IndexedDB except *references* (the picks and attempts point at `s.` ids). An app update can correct a seed alg without migrating user data. Airplane-mode test: load the app, go offline, open the algorithm browser, add an alg, run a drill, export a backup; everything works (Playwright `context.setOffline(true)` test in section 9).
- **IndexedDB** `cubesight-algs` (version 1). The same small `idb` wrapper the solve-history move (decision 3) needs; do not build two.

| store | key | content |
|---|---|---|
| `algs` | `id` | user and imported algs (not seed) |
| `sources` | `id` | user-added sources for **seed** algs: `{algId, source}` (seed files stay immutable) |
| `attempts` | `id` (uuid), index `algId+at` | drill attempts |
| `daily` | `algId+day` | rolled-up old attempts |
| `recons` | `id` | reconstructions |
| `llUses` | `id`, index `caseId`, `cuber` | derived, rebuildable, **not exported** |
| `meta` | `key` | `schemaVersion`, `engineVersion`, `seedVersion` |

- **Picks** are tiny and precious: `AlgPick[]` is also mirrored in localStorage `cubesight-alg-picks`, so the existing data-port v1 already backs them up before the IndexedDB export exists. Practice stats are derived and never stored as truth.
- **Backup**: `data-port` gets `version: 2`: `{version:2, exportedAt, data:{...localStorage}, idb:{'cubesight-algs': {algs, sources, attempts, daily, recons}}}`. `exportAll` becomes async (IndexedDB reads). `parseImport` keeps accepting version 1. Merge rules: picks newest `since` wins; algs/recons union by `id` then by `norm.key` (merge sources); attempts union by `id`; derived stores are rebuilt after import. `clearOwned` also clears the IndexedDB database. Quota failure is best-effort like `solve-store.js` (practice keeps working in memory).
- **Sync** between devices = export file + import file (phone <-> desktop via AirDrop, email, cloud drive the user chooses). A later optional "share via QR/clipboard" of picks only is out of scope. No server, ever.

## 4. Where the database is used (integration)

| consumer | uses | what it gets |
|---|---|---|
| **Recognition drills** (`#/drills/pll`, reserved `#/drills/oll`; case pages at `#/algs/...`) | `Case`, `refAlgId` state, `features`, `prob` | The case data now lives here; `pll-logic.js` keeps the state maths but reads `CASE_DATA` from the seed. The drill's "answer" text can show **my** alg. |
| **Future OLL trainer, "pick your algorithm"** | `AlgPick`, alternatives per case with counts and usage | Case detail page (A-01/A-04): alternatives side by side, "used by" shares, "set as mine". |
| **Move/algorithm guide** (`docs/design/brain-v2/moves/`) | `Alg.norm`, `regrips`, `fingertricks` | `renderAlg(algId, {done, current, mode})` returns the tokens with regrip marks; the guide shows my alg by default. The guide and the drill use the **same component**. |
| **Solve review** (`review/`) | `identifyLl()`, `caseKeyOf()`, practice | "You used **Jb alg #2** (J Perm video) - 1.12 s; your drilled PB 0.98 s" with a link to the entry and **drill it**. Imported reconstructions run the same identification (no timing). |
| **Brain coach** | practice + identification | `coach[]` line: "Jb alg #2 took 1.12 s (your drill PB 0.98 s). Drill it?" `d` opens `#/algs/pll/Jb/drill?alg=s.pll.Jb.2&from=brain:<solve-at>`. Coach picks the drill candidate from *slowest vs own PB* and *never drilled*. |
| **Phone drills** | `Case` + `AlgPick` | Recognition/quick rounds use case data; the "self-timed alg drill" of 5.9 runs on the phone without a smart cube. |
| **Progress** (`#/progress`) | `AlgPractice` | The alg row in the drill table: level, trend, due; one review queue with the other drills. |

### 4.1 Routes

Every case and every alg has a **stable, local, shareable-by-typing route**. Routes are hash routes handled by the small `#/<area>/<page>?<query>` parser that `trainers/README.md` section 4 already asks for; nothing is fetched to resolve them. The area is **`algs`**: it is a knowledge area that belongs to *drills* (the top bar keeps `drills` highlighted and shows a crumb `/ algs / Jb`), not a fourth nav tab. The drills hub gets an "algorithms" row that opens `#/algs`.

| route | page | query |
|---|---|---|
| `#/algs` | algorithm browser (A-01): set tabs, case grid, filters | `set=pll\|oll\|oll2\|f2l`, `filter=mine\|unlearned\|slowest\|due`, `q=<text>` |
| `#/algs/<set>` | the same, on that set | as above |
| `#/algs/<set>/<case>` | **case page**: algs, sources, usage, my pick (A-01 right pane, A-04) | `alg=<algId>` selects one alg; `from=` |
| `#/algs/<set>/<case>/drill` | **smart-cube alg drill** (A-02, A-06); without a cube it opens the self-timed drill (5.9) | `alg=<algId>` (default: my pick, else the first verified alg), `mode=repeat\|mix\|self`, `reps=10`, `auf=random\|none`, `strict=1`, `from=` |
| `#/algs/<set>/<case>/results` | last block's results (A-03) | `block=<id>`, `from=` |
| `#/algs/<set>/<case>/usage` | "used in top solves" (A-04) | `from=` |
| `#/algs/add` | add my alg / add a source | `case=<set>/<name>` prefill, `from=` |
| `#/algs/import` | import reconstructions (paste, file, local URL parse) | `from=` |
| `#/drills/pll` | PLL **recognition** drill (existing) | `cases=Aa,Ab`, `family=G`, `mode=`, `round=`, `from=` |
| `#/drills/oll` | OLL recognition (reserved slot) | `cases=21,22`, same as above |

Case names in the URL are the display names with their case (`Jb`, `Aa`, `Ua`, OLL `21`); a lookup is case-insensitive and redirects to the canonical spelling with `replaceState`. `#/drills/algs/...` is accepted and redirected to `#/algs/...`. Unknown set/case -> the browser with a toast "no case Xx in pll". A valid route never depends on IndexedDB contents: a seed case always resolves, a user alg id that no longer exists falls back to the case's pick.

### 4.2 Links from results and review, and the return path

Anywhere the app *mentions* a case or an alg it renders it as a **link chip**, and the chip goes to the matching route. This is one shared component (`caseLink(caseId, {algId, from})`) so Brain results, the solve review, the coach lines, the move guide and the progress page all behave the same.

| where it is mentioned | chip | target |
|---|---|---|
| Brain results / coach: "G perms cost you most" | `Ga` `Gb` ... | `#/algs/pll/Ga?from=brain:<solve-at>`; the coach's `f` key: `#/drills/pll?cases=Ga,Gb,Gc&from=brain:<solve-at>` (recognition) |
| Solve review, LL step: "You used Jb alg #2 (J Perm video) - 1.12 s" | `Jb` | case page `#/algs/pll/Jb?alg=s.pll.Jb.2&from=review:<solve-at>` |
|  | `alg #2` | the same case page with the alg selected |
|  | `drill it` (key `d`) | **`#/algs/pll/Jb/drill?alg=s.pll.Jb.2&from=review:<solve-at>`** (A-06) |
| Review of an imported reconstruction: "Max used alg #1" | `alg #1` | `...&from=review:<reconstruction-id>` |
| Move/algorithm guide | the alg tokens / case name | case page, `from=guide:<ref>` |
| Progress: a due alg row | the alg | drill, `from=progress` |

`from=<kind>:<id>` (kinds: `brain`, `review`, `guide`, `progress`, `hub`) does three things, exactly as `trainers/README.md` defines for drills:

1. shows the **back pill** in the top bar, `<- review · solve 23`, with the `b` key (A-06);
2. makes the page's results offer "back to review" as the primary action, with the before/after number ("Jb alg #2: 1.12 s in review, 1.04 s in drill, pb 0.98");
3. sends the return: `b` -> the route the kind maps to (`brain` -> `#/brain` results of that solve; `review` -> the review of that solve or reconstruction, route owned by the review spec; `guide` -> the guide entry). An explicit `ret=<urlencoded hash route>` overrides the mapping so the review can return to the exact scroll position it links from.

`from` is carried through every hop inside the algs area (case page -> drill -> results), so `b` always returns to where the user came from, and never to "the previous page in the algs area". The browser's own Back also works because each hop pushes a hash.

Deep links are plain text in the hash, work offline, are bookmarkable and can be pasted between devices. The phone drills and the desktop use the same routes.

The drill is in the **drills** area but is cube-required only for the smart-cube mode; the hub's device glyphs follow `trainers/README.md` (hollow = no cube, half = optional, solid = smart cube): the alg drill is a half glyph.

## 5. Alg drills on a smart cube

### 5.1 Inputs, and what the session has to give us

The drill subscribes to `createSmartCubeSession().subscribe(snapshot)` and reads `snapshot.moveEvent = {seq, move, turn, replaces}` plus `snapshot.state` (the **physical** state, centres fixed).

- Key on `seq`, never on `moves.length` (as `smart-cube-session.js` already says). Every event is a physical quarter turn. `turn` is the quarter just applied; `move` is what the cube "now shows" (a coalesced `U2` replaces the previous `U`, `replaces: true`).
- **Needed small change** (additive, backwards compatible): put `cubeTimestamp` and `serial` on `moveEvent` (today they only exist on the raw `subscribeEvents` observation), and `localTimestamp` = `performance.now()` at arrival. Without this the drill cannot time moves from **cube** time (decision 1: timing source = hardware timestamps). Fallback when the cube has no timestamps: local arrival times, flagged `timeSource:'local'` and marked lower confidence in the UI.
- Double coalescing (`DOUBLE_TURN_WINDOW` = 50 cube ticks): a double arrives as a quarter, then the same face again with `replaces: true`. The drill's **state** logic ignores `replaces` (it applies `turn` every time); only its **move log** honours it: `replaces` pops the last logged move and pushes the merged one, keeping the first quarter's time as `startTs` and the second's as `doneTs`.
- **Session baseline** (`awaiting-solved`): the session only starts tracking from a verified solved cube. That suits drills, because a solved cube has F2L intact, and the virtual repaint turns it into the drilled case immediately. "Drill from a cube you are currently solving" (F2L done, LL not) needs a facelets-to-state sync; that is a later request to the session, not needed for the drill.

### 5.2 Two states: physical and virtual

```
P  physical state  = snapshot.state (centres fixed). Truth about the real cube. Never modified by the drill.
V  virtual state   = the drilled cube shown on screen. V starts as the case, every incoming `turn` is applied to both P and V.
```

`P` and `V` differ **only in the last layer's pieces**: the F2L pieces are identical and stay identical, because the same turns move both. After a rep, `V` is **repainted**: replaced by a fresh case state. `P` keeps what it is. The app never pretends `P` is something else; it says which one it is showing (5.6).

### 5.3 The accepted language

For a drill on alg `A` (a normalised stream, LL on `U` in the drill's canonical frame), the accepted executions are

```
   U^a . conj_k(A) . U^b        a,b in {0,1,2,3}, k in {0,1,2,3} (y conjugation = which face the user holds as front)
```

`conj_k` relabels faces around `y`; `U^a`/`U^b` are net AUFs. Mirror, inverse and other algs of the case are **not** accepted unless the drill is in *any alg of this case* mode, in which case every alg of the case (every verified alg, with each alg's own frames) is a candidate; the matched one becomes `variantAlgId`.

The matcher never compares **tokens**. It compares **states**, which makes every equivalent notation correct for free: `U2` vs `U' U'` vs `U U`, `R L'` vs `L' R`, `M2` vs `R2 L2` on a cube that reports slices as faces, `r` vs `L x`, and a wrist flick the alg did not mention.

**Precompute once per drill start** (16 candidates x ~16 prefix states, a few ms):

```
for each candidate c = (alg, k, a):
   S[c][0]   = V0 . U^a
   S[c][i+1] = S[c][i] . conj_k(A)[i]            (i = 0..n-1)
   end states E[c][b] = S[c][n] . U^b            (b = 0..3)
hash = H(centreFrame(state))                     (string of 26 cubie ids/positions/stickers)
index: Map<hash, [(c, i, 'prefix'|'pre-auf'|'end', b)]>
```

### 5.4 Incremental matching (the algorithm)

State kept by the matcher: `alive` (set of candidates consistent so far), `lastGood` (hash, index, time), `detour` (moves since `lastGood` if off-path), `log` (moves with times).

On each snapshot with a new `seq`:

```
apply event.turn to V; log the move (honouring replaces)
h = H(centreFrame(V))
hit = index.get(h) restricted to `alive`

if hit:
    alive = candidates in hit; lastGood = (h, idx); detour = []
    phase: 'pre-auf' (idx 0, only U^a so far) | 'in-alg' | 'end'
    if phase == 'end' and first time -> completion (5.7)
else if detour is empty or same-axis tail:
    # One- or two-move lookahead on the tail's axis: is V one (or two) same-axis quarter turns away from an
    # indexed state? That is a half of a double, or one of a commuting pair (R done, L' to go): wait, not wrong.
    if lookahead(V, tailAxis, depth<=2) hits index: status = 'partial'  (UI: next token stays highlighted)
    else: deviation
else: deviation

deviation:
    detour = appendDetour(detour, event.move)      // merges same-layer moves, cancels opposites (smart-cube-guidance.js)
    status = 'mistake'; mistakes++ (once per detour)
    recovery = recoveryMoves(detour)               // the inverse path, displayed in the drill's guide row
    // the detour ends when h returns to an indexed state (lastGood or any other alive candidate)
```

Properties:

- **Candidates narrow themselves**: the first non-`U` move kills the frames that cannot produce it; while several are alive the guide shows the alg as stored, after the first move it shows the alg in the user's frame ("held y" chip).
- **Going back** (the user undoes a wrong or a right move): the state equals an earlier prefix; `idx` decreases; fine, no mistake beyond the one already counted.
- **Wide/slice/rotation handling**: rotations are absorbed in normalisation (5.3 operates on the rotation-free stream), slice moves and `M`-form events are centre-normalised by `centreFrame`, so `H`/`Z` (M2-based) match whether the adapter emits `M2` or `R2 L2`. Open point 1 (a hardware fixture recording) decides whether the GAN adapter emits slices at all.
- **Tolerated equivalents**: `U2` vs `U2'` (both parse to `U2`), a quarter-quarter double that was not coalesced (slower than 50 ticks), an AUF done before, after or as a `y`. Every tolerated deviation is recorded (`variant`, `aufStyle`) but does not count as a mistake.
- **What counts as a mistake**: a state that is not indexed and not a lookahead partial. The attempt is marked `clean: false`, the timer keeps running, and the recovery path is shown. Setting `strict` aborts the rep on the first mistake (and restarts from repaint). Unclean attempts never become PBs but are kept and shown (grey) in the history.
- **Cost**: one `applyMoves` per event, one hash, one map lookup; lookahead <= 18 + 18x18 applies in the rare partial case. Negligible against the ~100 ms spacing between moves.

### 5.5 F2L intact

Checked on `P`, the physical cube, with the existing tracker:

- **At rep start** (repaint time): `analyze(P, crossFace).f2lDone` and centres at home (`centreFrame(P)` = identity). If false, the drill does not start the rep: "F2L is not intact: pair 3 (DFR) is open" (the pair ids come from `f2lPairSlots`/`pairSolved`), with the recovery if it was just caused by the last rep.
- **At completion**: the matched end state implies F2L intact in `V`, hence in `P` (same pieces). The drill still re-checks `analyze(P).f2lDone`; a mismatch means `P` and `V` diverged (a missed event): it aborts the rep as "cube and screen disagree, press r", because the virtual layer is no longer trustworthy. A `seq` gap (`seq != last + 1`) triggers the same abort.
- **During the alg** F2L pieces are legitimately displaced; nothing is checked mid-alg beyond the prefix match.

Colour-neutral / other cross faces: the drill's canonical frame is taken from `crossFace` like `canonicalizeForRecognition` (LL face = opposite the cross face); the matcher sees moves already relabelled into that frame (`movesForInspection`).

### 5.6 Virtual repaint

After a rep completes (and the AUF settle window below), the drill replaces `V` with the next case:

```
V_next = caseState(case)  . U^r          // r = random displayed AUF (option: fixed 0 | random); case state = applyMoves(solved, invert(refAlg))
```

Requirements: `analyze(P).f2lDone` and centres home (checked at rep start as above). The LL of `P` is **never inspected**: after a PLL alg it is solved, after an OLL alg it is some oriented permutation, after an asymmetric alg it may show a different case than the drilled one. The screen shows `V`. Visible indicators (A-02, A-05):

- a **"virtual LL"** chip on the cube ("repainted - ignoring your top"), with a small **physical LL** inset on demand (key `p`): the real top as the cube reports it, so the user can confirm the physical cube is sane;
- a repaint pulse (the top layer's stickers fade to the new case; the F2L and cube body do not change) and a counter "rep 7 - repainted 6x".

**AUF settle window**: if the end state is `E[c][b]` with `b != 0` (the user stopped before the last AUF), the rep is already complete (execution time stops at that instant) but `V` is not replaced for `settleMs` (default 600 ms, or until the next non-`U` move). Any `U` turns in this window are the post-AUF, recorded as `aufMs` and applied to `V`; after the window, repaint. A stray late `U` after the repaint is applied to the new `V` as its pre-AUF (the language allows any `a`).

Modes that follow from the same mechanism (no re-setup in any):

| mode | what happens at repaint |
|---|---|
| **repeat** | the same case again (random displayed AUF) |
| **mix** | next case from a weighted queue (spaced repetition, prob, weakest); recognition is on screen, execution on the cube |
| **physical** | no repaint; instead the drill shows the inverse alg to put the real cube back (for people who want the real LL): the UI shows "reset: <inverse>" and the matcher accepts it as a free move block |

Asymmetric algs (every alg that is not its own inverse, essentially all of them): physical LL != drilled case after the rep. The UI always states which it shows ("drilled case", not "your top"), with the inset one key away. Symmetric cases (H perm, Z perm, N perms under U2/y moves) repeat physically with no repaint visible, which is fine.

### 5.7 Attempt timeline and metrics

A rep goes through `armed -> shown -> running -> completed -> settle -> repaint` (5.6 and 5.8).

- `shownAt`: local time when the case appears (only meaningful when the case is on screen: repeat with a visible case, mix). **First-move latency** = `firstMove.localTs - shownAt` for recognition reps (BLE jitter is tens of ms, so it is a *recognition* number, not an execution one, and is shown with one decimal). In "same case, already known" repeat mode the latency is reported but is not a recognition result.
- `t0` = the first move of the alg proper (the first move after the pre-AUF, cube timestamp). Execution clock starts on it (no button), matches the Brain convention.
- `t_end` = the cube timestamp of the event that first lands on an end state `E[c][b]`. **`executionMs = t_end - t0`**, AUF excluded, which makes it comparable with the DB alg's stripped move count. `aufMs` = time from `t_end` to the last U (0 if none or if the end state is exactly `b = 0` at `t_end`). `totalMs = t_final - shownAt` for recognition reps.
- **Per-move timing**: each alg token `i` gets `t_i` (cube timestamp of the event that completed it) and `dt_i = t_i - t_{i-1}` (`dt_0` = 0; the first move has no duration you can measure from the cube). A token spans multiple events (a coalesced double: `t_i` = second quarter; `startTs` = first quarter). Token boundaries come from the matcher's prefix index changes (so a wrong-but-recovered detour is attributed to the token that follows it, flagged).
- **TPS** = `(n - 1) / (executionMs / 1000)`, n = `norm.moves.length`. Intervals, not moves: the first move's duration is not observable. It is the same number Brain's TPS shows for the same span except for that off-by-one; the label says "tps".
- **Pause points (hesitation)** for token `i` in an attempt: `dt_i > max(2 x median(dt of this attempt), 150 ms)` *and*, when there are >= 5 prior clean attempts, `dt_i > baseline_i + 2 x MAD_i` (baseline = per-token median over the last 20 clean attempts). Tokens flagged as `regrips` get a higher floor (the regrip is expected to cost time; it is shown but not flagged unless it exceeds the regrip baseline).
- **Hotspots** (across attempts): per token, the share of the last 20 clean attempts in which it was a pause point, plus its mean excess over the attempt median. The top 3 are listed on the results screen and are shown as **heat under the move guide** (A-02/A-03). This finds the *persistent* hesitation (a particular transition), not one-off slips.
- **Clean** = `mistakes == 0`, F2L intact, matched end state. Variant use is clean but stamped.

Comparison: live bars compare each token's cumulative time against the **PB run** (`pbMoveMs`, the ghost) and the personal median; the headline shows `-0.06 s` vs PB, vs ao12 and vs median of the last block. PB = best clean `executionMs` for the alg (separate PB for TPS). A new PB pulses the record and stores the run's `moveMs` as the new ghost.

### 5.8 Session shape, spaced repetition, and block structure

- **Block**: default 10 reps of the same alg; results per block (A-03). Inter-rep gap is the repaint time (about 0.6 s after completion, or "space to go" for slow practice).
- **Spaced repetition across algs**: each *picked* alg is an item in `src/learning.js` terms (`itemKey('alg', algId)`), `review(data, key, {correct: clean, ms: executionMs, responseThresholdMs: target})`. `target` = the user's own median execution time x 1.15 (or a manual target). A block counts as one review: correct if >= 80% clean and median <= target; it feeds `due`. The hub's "for you" row and the progress review queue show due algs. `chooseDue` picks a mix block from due algs when the user says "train what is due" (interleaving 2-4 algs, a repaint between every rep, so no re-setup even across algs).
- **Brain hand-off**: the coach's "drill Jb alg #2" opens a block pre-filled (`from=brain:solve-23`); `b` returns to Brain.

### 5.9 Drills without a smart cube

Two variants, both fully offline and usable on the phone:

1. **Self-timed recognition + execution** (keyboard `space`/tap): the case is shown on screen and the clock starts (shown time). Press/tap **`space` (I know it)** -> that is the *recognition time* and starts the *execution clock*; do the alg on a physical cube; press/tap **`space` again** when done -> *execution time*. Then rate in one key: **`1` clean, `2` hesitated, `3` mistake** (feeds the SRS). No per-move timing exists here (no data), no TPS except `moves/execution`, marked "manual". The UI says so.
2. **Alg + inverse loop** for people with a physical cube but no smart cube and no setup: the screen alternates `A` (timed) and `A'` (the reset; untimed, pressing space ends it). One alg drilled repeatedly with zero scrambling: each `A` from the solved-LL state, each `A'` returning to it. Optional: show the inverse as the "reset" line.

Both write `DrillAttempt` rows with `mode: 'self-timed'`, `timeSource: 'manual'` and never produce hotspots. PBs from manual timing are kept apart from smart-cube PBs ("manual" chip).

## 6. UI summary

| frame | content |
|---|---|
| **A-01 browser** (Orbit dark) | set tabs, case grid with LL thumbnails and status dots, filter chips, case detail: algs (move count, PB, source links with "needs internet" chips), my pick |
| **A-02 drill live** (Orbit dark) | drilled case cube with "virtual LL" chip, the alg as move-guide tokens (done / current / next), live match panel, execution clock, per-move timing bars with PB ghost and pause colouring |
| **A-mono-02 drill live** (Mono dark) | the same screen in the Mono style |
| **A-03 results** (Orbit dark) | attempt history chart with PB line, per-move medians with hesitation hotspots, vs PB / vs ao12 / clean, hotspot cards |
| **A-04 top solves** (Orbit dark) | per-case usage from imported reconstructions: share per alg, by cuber, unmatched algs, "for you" |
| **A-05 phone** (Orbit dark) | browser, case page, self-timed drill (no cube) |
| **A-06 from review** (Orbit dark) | entry point: a review line with link chips, the route, and the drill arriving with the back pill `<- review · solve 23` |

## 7. Phased plan

Each phase is shippable on its own.

| phase | scope | depends on |
|---|---|---|
| **0. Engine** | `notation.js` (parse/normalise/invert/mirror/count), `effect.js` (`centreFrame`, `effectKey`, `caseKey`), verification of the 21 PLL algs, `moveEvent` gets `cubeTimestamp`/`serial`/`localTimestamp`, a hardware fixture recording (an `M2` alg and a coalesced double) to decide the slice question | nothing |
| **1. Database + browser** | seed modules (PLL + 2-look OLL, hand-verified), `Case`/`Alg`/`Source`, IndexedDB store, picks (localStorage mirror), add-my-alg, tag a source (with video timecode), browser UI, sources/rights screen, precache + offline test, `pll-logic.js` reads the seed | 0 |
| **2. Smart-cube drill** | matcher (5.3-5.4), virtual state + repaint (5.6), F2L checks (5.5), attempt metrics (5.7), repeat mode, results screen, PB/ghost, attempts store | 0, 1 |
| **3. Integrations** | move guide renders `renderAlg`; solve review shows the LL alg + link + PB; Brain coach line and `f`; recognition drills use the database; SRS across algs; progress alg row | 1, 2, review + guide modules |
| **4. Reconstructions and stats** | paste/file/URL-parse import, `identifyLl`, usage stats, "used by" on the case page, unmatched -> add, export/import packs | 1 (and review's analysis) |
| **5. Extras** | self-timed/phone drills (5.9), mix mode, strict mode, physical-LL inset, COLL/ZBLL/F2L sets, mirror/inverse navigation, bundled permitted dataset (if any) | as available |

Phases 2 and 4 are independent and can be built in parallel after 1.

## 8. Module layout (recommended)

```
src/algs/types.js           typedefs above
src/algs/notation.js        parse, normalise, invert, mirror, conj, counts (pure)
src/algs/effect.js          centreFrame, effectKey, caseKey per set (pure; uses cross-cube.js)
src/algs/seed/cases.js      Case data (from pll-logic CASE_DATA + OLL 2-look)
src/algs/seed/algs.js       seed algs + link-only sources
src/algs/db.js              in-memory merge of seed + IndexedDB, dedupe, picks, add/merge (idb wrapper shared with solve store)
src/algs/identify.js        identifyLl(scramble, moves), caseKeyOf(state)   (shared with review)
src/algs/stats.js           usage aggregation from LlUse (derived)
src/algs/drill/matcher.js   candidates, prefix index, incremental match (pure, fed turns + times)
src/algs/drill/session.js   P/V states, repaint, settle window, attempts; subscribes to the smart-cube session
src/algs/drill/metrics.js   execution, TPS, pauses, hotspots, PB (pure)
src/algs/ui/*               browser, case detail, drill, results (Brain tokens: var(--b-*))
```

## 9. Test strategy

1. **Notation**: table tests for tokenising (`U2'`, `Rw`, `r`, `M`, parentheses), rotation absorption, commuting order, cancellation, AUF strip, counts (HTM/STM/ETM/QTM on the 21 PLL algs incl. M-slice H and Z), mirror/inverse involution (`mirror(mirror(x)) == x`, `invert(invert(x)) == x`).
2. **Case keys**: 21 distinct PLL keys, 57 distinct OLL keys, every seed alg's `caseKey(inverse(alg)) == case.key`; `identifyPllCase` (existing unit tests in `tests/pll-unit.test.mjs`) still passes against the seed. Equivalence fixtures: same alg with cancellations/rotations/slices -> equal `norm.key`; two real alternative algs of one PLL -> equal `effectKey`, different `norm.key`.
3. **Matcher** (pure, fed synthetic event streams shaped like `moveEvent`): exact alg; every AUF a,b; every frame k; `U2` as `U U`, as `U' U'`, coalesced (`replaces:true`) and uncoalesced; `R L'` order swap; `M2` vs `R2 L2`; a mid-alg mistake + recovery (clean=false, recovery path correct, then resumes); an undo; an extra trailing AUF; a seq gap aborts; half-double lookahead; a non-F2L-preserving finish is not a completion.
4. **Repaint**: after each PLL/OLL seed alg from a solved cube: `P` LL != case (asymmetric) but `V` == next case; `analyze(P).f2lDone`; 100 consecutive reps with random AUF and frames keep `V` and `P` F2L consistent; stray late `U` after settle.
5. **Metrics**: golden attempts with known cube timestamps: execution, TPS (n-1 intervals), pause flags, hotspot stability, PB ghost; wrap-around of the 16-bit cube timestamp (check the GAN protocol tick width in the adapter).
6. **Recordings**: add recordings (`src/recording-replay.js`, `tests/replay-*`) of a drill: replay into the session with the drill attached (the harness in `tests/brain-replay.spec.js` shows the pattern); one with a double-turn and one with an M2 alg.
7. **Identification**: reconstructions with known LL algs, with the last F2L move cancelling into the alg, with pseudo-slotting, AUF before and after, an unknown alg (-> `case-only`), 1-look LL.
8. **Data/offline**: Playwright `context.setOffline(true)` through browser -> add alg -> drill (replayed cube) -> export; assert no network requests were attempted (`page.on('request')` records zero non-local); data-port v1 file still imports; v2 round trip; merge/dedupe rules.
9. **Licensing guard**: a unit test that every bundled source has `rights` and every `permission-granted` source has a non-empty `permission`; a lint that seed modules contain no URL that is not `https://` and that the UI renders every external link with `rel="noopener noreferrer"` and never as an `<img>`/`<iframe>`/`<script>`.
10. **Visual**: Playwright screenshots of A-01..A-06 equivalents against the design frames in the same way as the Brain frames.

## 10. Open questions

1. Does the GAN adapter ever emit slice (`M`) moves, or only the six outer faces? A recording of `M2 U' M2 U2 M2 U' M2` (H perm) settles it; the spec is written to handle both.
2. Which source for the seed links does the user want first (J Perm's videos, SpeedCubeDB case pages, alg.cubing.net)? Only links; no content copied.
3. Does the user want to contact J Perm / SpeedCubeDB for bulk data, and do they want the draft message adapted?
4. Drill default: stop the clock at the last alg move (this spec), or at the fully solved cube including AUF?
5. The execution target for SRS: 115% of own median by default. Acceptable, or a fixed TPS goal?
6. Do we ever need "drill from the cube I am holding" (F2L done, LL unsolved) before facelet sync exists? If yes, it needs a session change.
