# Speedsolve reconstruction sources: licensing and sourcing plan

Research date: 2026-09-30. Nothing was downloaded; only terms pages and public descriptions were read.
Caveat: pages were read through a summarising fetcher, and several sites (cubesolv.es, parts of speedcubedb) were unreachable or
exposed no terms. "No terms found" means "no licence granted", not "free to use". Items marked (unverified) need a human check.

## 1. Comparison table

| Source | Data | Count (approx.) | How obtained | Licence / terms | Bundle in app? | Who to ask |
|---|---|---|---|---|---|---|
| **WCA results export** | Results, persons, competitions, **scrambles table** (official scrambles, no solutions) | Whole history; export ~361 MB TSV / 374 MB SQL | Public dump, https://www.worldcubeassociation.org/export/results (TSV/SQL, v2.0.2, weekly-ish) | "The information in this file may be re-published, in whole or in part, as long as users are clearly notified of the following: This information is based on competition results owned and maintained by the World Cube Assocation, published at https://worldcubeassociation.org/results as of [export date]." (sic, "Assocation" as on the page) | **Yes**, with the attribution notice and export date. Gives scrambles and times only, no solutions. | WCA (contact via site / WRT) only if we want more than the notice allows |
| **SpeedCubeDB** (speedcubedb.com) | Reconstructions by top solvers (solver, time, event, method, scramble, move list with comments, stage splits, STM/TPS) | ~4,000+ solves per ReconStats article (2023); more now | Scraping only (no dump or API found). Reconstructions section reportedly removed from the old location and possibly moved to reco.nz (unverified) | No terms of use or copyright page found. The only policy page is a privacy policy (https://www.speedcubedb.com/privacy). Owner publicly complained in 2023 about uncredited reuse of his scrambles/reconstructions (see J Perm dispute, https://youtube.fandom.com/wiki/J_Perm, fan wiki, treat with caution). Site has gone offline before. | **No** without permission. A scraper exists (https://github.com/QuantumQream/SpeedCubeDB-WebScraper), which shows the site rate-limits around 1000 URLs; do not use it. | Gil Zussman, gil@speedcubedb.com (creator). Also the reconstructors (below), who own the analysis. |
| **reco.nz** | Reconstructions by Stewy, yomie and others; per-solve page with cross/F2L/LL/PLL splits, STM/ETM/TPS, alg.cubing.net link; filterable by event, method | Unknown (solve IDs reach >6000) | Scraping only; no API or export found | No licence/terms/contact visible in the excerpt read (unverified; check the About/FAQ pages) | **No** without permission | Site maintainer (identify via its About page); Stuart "Stewy" Clark for the content |
| **cubesolv.es** / github.com/justinj/reconstruction-database | User-submitted reconstructions (solver, time, scramble, solution with stage comments) | ~3,100-4,000 solves (forum figures, circa 2014-15) | Code on GitHub; README offers a **database dump dated 2014-02-25**. The live site was unreachable during this research (connection refused) | Code is **MIT** ("The MIT License (MIT) Copyright (c) 2013 Justin Jaffray"), https://github.com/justinj/reconstruction-database. The MIT licence covers the software; it is unclear whether it covers the submitted solve data. Wiki says site is not actively maintained. | **Code yes. Data: probably fine to ask, not certain.** The 2014 dump is old and small, and dump content rights are not stated. | Justin Jaffray (GitHub: justinj) |
| **Lucas Garron archive** (alg.garron.us/solves/) | ~35 solves 2005-2010 (time, solver, event, move list) | ~35 | Hand-browsable HTML | No licence stated | Tiny and historic; ask before using | Lucas Garron |
| **alg.cubing.net links** in spreadsheets/forums | Link = setup + alg + title in URL parameters (`alg=`, `setup=`, `type=`, `title=`). It is an encoding, not a dataset | n/a | Parse URLs we are given | alg.cubing.net is frozen and deprecated (successor Twizzle in cubing.js, dual GPL/MPL code). Licence applies to the viewer code, not to the solves inside links | We may **parse** the link format in a user-import feature (no legal issue); the solves in the links belong to their authors | n/a |
| **Community reconstruction spreadsheets** (e.g. Stuart Clark's analysis sheet, https://docs.google.com/spreadsheets/d/1DWXJU9gm7IZJovdTJxz8aV3vcf2GTVlswiGP7qbQtAQ, listed on the speedsolving wiki) | Mostly a tool/template, plus personal collections | Small | Manual export | No licence stated; default copyright | **No**, but the format is a good import target | Sheet owner |
| **Speedsolving forum "Reconstruction Thread"**, r/Stewy_, r/econstructions, r/rouxles | Free-text posts, high quality, inconsistent format | Thousands | Scraping only | Forum/Reddit ToS plus authors' copyright; no open licence | **No** | Individual authors (Stewy, Antonio Kam Ho Tung, etc.) |
| **YouTube reconstruction channels** (J Perm, CubeSkills, etc.) | Video plus description text | n/a | Not a dataset | YouTube ToS and creator copyright | **No** | Creators |
| **GitHub datasets** | Only ad-hoc scrapes found (e.g. QuantumQream scraper plus `solves.csv`, no licence shown). spencerchubb/algdb is algorithms, not reconstructions (the URL returned 404 when checked) | ~1000 solves max | Direct | Scrapes of SpeedCubeDB inherit its unclear rights | **No** | n/a |
| **cubing.js (Twizzle)** | Library and alg/solve link format | n/a | npm | Dual GPL/MPL | Use for parsing/visualisation only, not data | n/a |
| **TNoodle** (scramble generator) | Generates scrambles | infinite | Source | AGPL-3.0 | Not needed; take scrambles from WCA export | n/a |

No open dataset with an explicit open licence (CC, ODbL, etc.) for speedsolve reconstructions was found.

## 2. What is legal today

- **WCA export**: yes, with the quoted notice (scrambles, results, persons, competitions). This gives official scrambles and times, which lets us identify record solves, but not solutions.
- **cubesolv.es code**: MIT, reusable. Its data: unclear, needs a one-line answer from Justin Jaffray.
- **Everything else**: no grant found. Facts such as a move sequence are arguably not copyrightable, but the databases as compiled collections, the comments/stage annotations, and the reconstructors' labour are; in the EU the sui generis database right also applies. Separately from the legal point, the community is sensitive about credit (2023 dispute). This is not legal advice; ask permission rather than rely on the fact/expression argument.

## 3. Recommended sourcing plan

1. **Bundle what is openly licensed now.** WCA scrambles plus result metadata (attribution screen in the app, "as of" date shown). Use them to ship: a scramble library, record-holder listings, and per-competitor context. Do not ship the whole 360 MB export: filter at build time (see section 5).
2. **Ask for permission** for reconstruction content, in this order of likelihood and value:
   1. Stuart "Stewy" Clark plus Brest (they created the majority of top-solver reconstructions, hundreds per month; the author of a reconstruction is the most legitimate grantor). Ask for a permissive grant (e.g. CC BY 4.0 or "bundle with attribution").
   2. Gil Zussman (gil@speedcubedb.com) for SpeedCubeDB's compiled database and any dump/API.
   3. reco.nz maintainer.
   4. Justin Jaffray for cubesolv.es data (and the 2014 dump).
   Keep each grant in writing (email) and store it in `docs/research/permissions/` with the date and scope.
3. **User import** for everything else: paste a reconstruction (plain text with `// comments` stage markers, alg.cubing.net URL, Twizzle URL, SpeedCubeDB/reco.nz text export) or import a JSON file. Stored locally in IndexedDB. No network, no redistribution, so no licence problem. This also works as the fallback if no permission is granted.
4. **Ship a tiny seed set** that is unquestionably ours: our own reconstructions, or ones whose authors explicitly consented, so the review features work out of the box.

Also: the algorithm-popularity analysis ("which alg do top cubers use") can be shipped as **derived statistics** (case to alg to counts) rather than the raw solves; still ask permission, since it is derived from their work, but it is a lower-risk ask.

### Draft permission request (edit the name and site)

> Subject: Permission to bundle reconstructions in an offline cubing trainer (with credit)
>
> Hi <Name>,
>
> I'm building CubeSight, a free, offline-first speedcubing training app (PWA, no backend, no tracking, no ads). One feature lets users review top solves (cross choice, F2L pairs, LL alg choice) and see which algorithms top cubers use per case. To make that work offline, I'd like to bundle <a subset of / your> reconstructions inside the app.
>
> I'd only use: scramble, solution with stage notes, solver, time, competition/date, and a link back to the original page; every solve would show "Reconstruction by <name>, via <site>" with that link. I would not scrape your site, and I'm happy to limit the set (for example, only sub-X solves or only the solves you choose), to use an export you prefer, or to refresh only when you say so. If you'd rather I didn't, that is completely fine and I'll rely on user-imported data instead.
>
> Would you be OK with this, and if so under what terms (e.g. CC BY 4.0 with attribution)? A short reply by email is enough for me to keep on record.
>
> Thanks for all the work the community gets from your reconstructions,
> Loz

## 4. Data format (normalised JSON)

One file per event (3x3 first), plus a manifest.

```json
{
  "id": "src-stewy-2021-0042",
  "event": "333",
  "solver": { "name": "Tymon Kolasinski", "wcaId": "2015KOLA01" },
  "time": 4.54,
  "competition": "Monkey League Season 4",
  "date": "2021-07-22",
  "method": "CFOP",
  "scramble": "R U2 F' ...",
  "solution": "x2 // inspection\nR' U' F ... // cross\n...",
  "stages": [
    { "name": "cross", "from": 0, "to": 9 },
    { "name": "f2l1", "from": 9, "to": 14 },
    { "name": "oll", "from": 40, "to": 47 },
    { "name": "pll", "from": 47, "to": 58 }
  ],
  "reconstructedBy": "Stewy",
  "source": { "name": "reco.nz", "url": "https://reco.nz/solve/6370" },
  "license": { "id": "CC-BY-4.0", "grant": "permissions/stewy-2026-xx-xx.eml", "attribution": "Reconstruction by Stewy, via reco.nz" },
  "verified": { "scrambleMatchesWca": true, "solvesScramble": true }
}
```

- `stages` are move-index ranges into the parsed solution, so the same data drives cross-optimality, F2L-pair and LL-alg analysis.
- Build-time check: apply scramble plus solution with cubing.js and reject any record that does not end solved. Match scramble/time/competition against the WCA export where possible (the WCA export also gives the verified official scramble and competition date).
- Every record carries its own `license` and `attribution`, so records from different grantors can coexist and any source can be removed on request.
- Store `data/recon/manifest.json` listing source, licence, grant file, export date, and record count. Show an in-app "Credits and data sources" page generated from it.

### Size estimate

About 600 bytes per record (scramble ~80 B, annotated solution ~300 B, metadata ~200 B). 5,000 records is about 3 MB raw JSON and roughly 0.6-0.8 MB gzipped. Even 20,000 records is about 12 MB raw and under 3 MB gzipped. Offline PWA precache budget is not a problem. WCA subset: scrambles for record-relevant rounds only (e.g. a few hundred thousand 3x3 rows is about 20 MB; ship a sampled or top-N subset, well below 5 MB gzipped).

## 5. Updating the bundle at release time (build-time, not runtime)

A script `scripts/build-recon-data.ts` (run manually or in release CI, never in the app):

1. Read curated inputs from `data-src/recon/*.jsonl` (files granted by maintainers, committed or fetched from a private location) and optional user-provided dumps.
2. For WCA data: download the TSV export once per release (the script fetches it; the app never does), filter to the needed rows, and stamp the "as of" date from the export filename (`WCA_export_v2_<n>_<timestamp>`).
3. Validate every record (schema, solves scramble, stage ranges contiguous), normalise, deduplicate (by scramble+solver+time), attach licence/attribution from a per-source config, and refuse to include any source with no `grant` entry.
4. Emit `public/data/recon/*.json` plus `manifest.json` and the credits page data; fail the build on any validation failure.

## 6. Risks

- **Legal/ethical**: scraping SpeedCubeDB/reco.nz without consent risks takedown, reputational harm and the kind of attribution dispute seen in 2023. Do not scrape, even "just once".
- **Shipped data cannot be recalled** once installed (offline PWA), so only bundle what has a durable written grant; include a removal path (manifest drop plus next release).
- **Licence ambiguity**: MIT on cubesolv.es code does not clearly cover the data; get explicit confirmation.
- **Multiple claimants**: reconstructions have an original solver, a reconstructor and a host site; ask the reconstructor and the host. A host's grant may not cover the reconstructor.
- **Source volatility**: speedcubedb has gone offline before and the location of its reconstructions has changed; reco.nz and cubesolv.es may also change. Keep our own copy of granted data.
- **Bias**: the data is top-solver heavy and skewed to CFOP/3x3, so "what top cubers use" reflects the elite and recent period (mostly Stewy/Brest's selections).
- **Data quality**: reconstructions contain errors (rotations, inverted or missing moves); the solves-the-scramble check catches most.
- **WCA notice**: must show the exact attribution text with the export date; the WCA page may update the wording, so re-read it each release.
- **Unverified points**: SpeedCubeDB terms beyond the privacy page, reco.nz About/terms, current state of cubesolv.es, licence text of alg.cubing.net's repo. Re-check before relying on them.

## Sources

- WCA export and terms: https://www.worldcubeassociation.org/export/results
- justinj/reconstruction-database (MIT): https://github.com/justinj/reconstruction-database
- SpeedCubeDB: https://www.speedcubedb.com/ and https://www.speedcubedb.com/privacy
- Forum: https://www.speedsolving.com/threads/speedcubedb-com-and-cubedb-net-are-back-up.90908/ and https://www.speedsolving.com/threads/lets-make-alternatives-to-speedcubedb-and-cubedb.89654/
- Speedsolving wiki reconstruction list: https://www.speedsolving.com/wiki/index.php?title=Reconstruction
- reco.nz: https://reco.nz/solve/6370
- ReconStats: https://basilio.dev/cubing/recons/
- Garron archive: https://alg.garron.us/solves/
- alg.cubing.net repo: https://github.com/cubing/alg.cubing.net ; cubing.js: https://github.com/cubing/cubing.js
- TNoodle (AGPL-3.0): https://github.com/thewca/tnoodle
- SpeedCubeDB scraper (example only, not to be used): https://github.com/QuantumQream/SpeedCubeDB-WebScraper
