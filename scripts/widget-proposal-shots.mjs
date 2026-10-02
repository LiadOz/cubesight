/* global document */
// Renders the widget-proposal prototypes (gallery/widgets/<date>-<family>/proto/*.html) to numbered PNGs.
//   node scripts/widget-proposal-shots.mjs buttons|keycaps|status [--only=<a,b>] [--scale=1|2|3]
// --scale (default 2) is the device scale factor. At 2 or 3 the files are written NEW as <name>-hd.png / <name>-hd3.png
// next to the originals (never overwritten: an existing target is skipped). --scale=1 writes the original names.
// --only takes comma-separated substrings matched against the file name.
// It serves the repo root on a random local port (never 5173), loads each prototype view with Playwright,
// stitches dark + light where a view asks for both, and writes <ID>-<name>.png plus manifest.json (IDs, captions)
// into the post folder. Existing files are never overwritten.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };

const FAMILIES = {
  buttons: {
    dir: 'gallery/widgets/2026-10-02-buttons', page: 'buttons.html', prefix: 'W-04', label: 'W-04 buttons',
    views: [
      { key: 'states', both: true, title: 'states matrix, dark and light', caption: 'every emphasis x every state, then answer states, sizes and the phone touch sizes. Dark on top, light below.' },
      { key: 'results', title: 'results actions (A-05)', caption: 'next scramble · review · more… on the results frame.' },
      { key: 'settings', theme: 'light', title: 'settings drawer, light', caption: 'icon close, row-end secondary S, danger text, one primary.' },
      { key: 'drill', title: 'drill round answers (A-08)', caption: 'answer pills with number keys, skip, and the answered states.' },
      { key: 'phone', title: 'phone (A-09) touch sizes', caption: 'a drill and the results on a 390 px phone.' },
    ],
    compare: { key: 'compare', both: true, name: 'compare-options', title: 'the three options side by side', caption: 'dark above, light below.' },
  },
  keycaps: {
    dir: 'gallery/widgets/2026-10-02-keycaps', page: 'keycaps.html', prefix: 'W-17', label: 'W-17 keycaps',
    views: [
      { key: 'states', both: true, title: 'keycap states, dark and light', caption: 'default, pressed, held, unavailable; sizes; on primary, secondary and plain; the glyph set.' },
      { key: 'idle', title: 'key bar and start key on solve (A-01)', caption: 'start with the space key inside, the key bar bottom-left.' },
      { key: 'button', title: 'keycaps inside buttons (A-08)', caption: 'number keys on the answers, skip s, space on the primary.' },
      { key: 'results', title: 'key bar on results, a key held (A-05)', caption: 'the [ ] pair, one pressed, one resting.' },
    ],
    compare: { key: 'compare', both: true, name: 'compare-options', title: 'the three options side by side', caption: 'dark above, light below.' },
  },
  status: {
    dir: 'gallery/widgets/2026-10-02-status', page: 'status.html', prefix: 'W-16', label: 'W-16 status and toast',
    views: [
      { key: 'states', both: true, title: 'status line and toast states, dark and light', caption: 'tones, working, toast life cycle and the placement of each.' },
      { key: 'connecting', title: 'connecting (A-01, full orbit)', caption: 'the status while the full orbit spins.' },
      { key: 'error', title: 'an error (connect failed)', caption: 'the error line with its one recovery action.' },
      { key: 'toast', title: 'a saved toast over results (A-05)', caption: 'the toast next to the coach line, not on it.' },
      { key: 'phone', title: 'phone (A-09)', caption: 'status line and toast on a 390 px phone.' },
    ],
    compare: { key: 'compare', both: true, name: 'compare-options', title: 'the three options side by side', caption: 'dark above, light below.' },
  },
};

// W-21 moves: a hand-numbered job list (explicit IDs per option and view)
const MV = [['option', 'states', 'states, dark and light', 'every token state, the section forms and how the Orbit grows. Dark on top, light below.', true], ['option', 'solve', 'scramble on the Orbit and cube (desktop 1440 x 900)', 'mid scramble, move 13 of 20, as A-02.'], ['option', 'wrong', 'wrong turn, the Orbit grows (desktop)', 'the undo move is inserted and the ring gets a segment, as A-02b.'], ['option', 'phone', 'phone 390 x 844, scramble and wrong turn', 'the same two states on a phone.'], ['option', 'alg', 'alg playback with sections (T-perm), light', 'sections with an optional name; playing move 6 of 14.', false, 'light'], ['option', 'long', 'long sequence, rolling window (45 moves), light', 'what happens past the lookahead capacity.', false, 'light']];
const FAM_MOVES = { dir: 'gallery/widgets/2026-10-02-W-21-moves', page: 'moves.html', prefix: 'W-21', label: 'W-21 moves', jobs: [] };
FAM_MOVES.jobs.push({ id: 'W-21-01', file: 'W-21-01-overview.png', title: 'the three options side by side', caption: 'desktop mid scramble above, phone wrong turn below; dark above, light below.', both: true, params: { view: 'compare' } });
for (const o of [1, 2, 3]) MV.forEach(([, key, title, caption, both, th], i) => { const id = `W-21-${o}${i + 1}`; FAM_MOVES.jobs.push({ id, file: `${id}-option${o}-${key === 'solve' ? 'scramble-desktop' : key === 'wrong' ? 'wrong-turn-desktop' : key === 'phone' ? 'phone' : key === 'alg' ? 'alg-sections' : key === 'long' ? 'long-rolling' : key}.png`, title: `option ${o}: ${title}`, caption, both: !!both, theme: th || 'dark', params: { view: key, opt: String(o) } }); });
FAM_MOVES.jobs.push({ id: 'W-21-91', file: 'W-21-91-mini-form-lists.png', title: 'mini form in list rows, the three options', caption: 'history, alg, playing and review rows. Dark above, light below.', both: true, params: { view: 'mini' } });
FAMILIES.moves = FAM_MOVES;

// W-21 v2 (approved: desktop = labels on the Orbit, phone = wrapped sequence; sections = spacing only)
const V2 = [
  ['W-21v2-11', 'states-desktop', 'states', 'desktop: token states, sections as gaps, the Orbit grows', 'every token state, two sections as one wide gap between Orbit points, the undo group, and how the ring grows. Dark.'],
  ['W-21v2-12', 'scramble-desktop', 'solve', 'desktop: mid scramble on the Orbit (1440 x 900)', 'move 13 of 20, the A-02 look. Dark.'],
  ['W-21v2-13', 'wrong-turn-desktop', 'wrong', 'desktop: wrong turn, the undo move is a spaced section', 'one undo move inserted; the section is only the wider gaps either side.'],
  ['W-21v2-14', 'wrong-turn-two-undo-desktop', 'wrong2', 'desktop: two undo moves form one spaced section', 'a group of two amber points between two wide gaps.'],
  ['W-21v2-15', 'alg-triggers-desktop', 'alg', 'desktop: T-perm with its triggers as wide gaps', 'three runs, two gaps; no bracket above the curve.'],
  ['W-21v2-16', 'long-rolling-desktop', 'long', 'desktop: 45-move scramble, rolling window', 'the long scramble: 22 labels in a window, neighbours alternating between two radii.'],
  ['W-21v2-17', 'long-wrong-turn-desktop', 'long-wrong', 'desktop: long scramble with a wrong turn', 'the undo group as a spaced section inside the window.'],
  ['W-21v2-31', 'states-phone', 'p-states', 'phone: wrapped sequence, states and sections as space', 'tokens as words, sections as wider spaces, the undo group.'],
  ['W-21v2-34', 'scramble-wrong-phone', 'p-solve', 'phone 390 x 844: scramble and wrong turn', 'the wrapped sequence under the cube; the undo move is a spaced section.'],
  ['W-21v2-35', 'alg-undo-phone', 'p-alg', 'phone 390 x 844: T-perm and an undo group of two', 'sections as extra space, no parentheses.'],
  ['W-21v2-36', 'long-rolling-phone', 'p-long', 'phone 390 x 844: 45-move scramble, rolling lines', 'start, mid and a wrong turn on a long scramble.'],
  ['W-21v2-91', 'mini-form-lists', 'mini', 'mini form in list rows (sections = space)', 'history, long scramble, alg, playing and review rows. Dark.'],
  ['W-21v2-99', 'light-sheet', 'light', 'light sheet: the approved pair in the light theme', 'desktop above, phone below.', 'light'],
];
const FAM_MOVES2 = { dir: 'gallery/widgets/2026-10-02-W-21-moves-v2', page: 'moves.html', prefix: 'W-21v2', label: 'W-21 v2', jobs: V2.map(([id, name, view, title, caption, th]) => ({ id, file: `${id}-${name}.png`, title, caption, theme: th || 'dark', params: { view } })) };
FAMILIES.moves2 = FAM_MOVES2;

// W-17 keycap pairs (the bevelled cap is approved; four ways to write a combined key)
const PAIRS = [
  ['W-17p-01', 'matrix-all-contexts', 'matrix', 'combined keys: the four ways in every context, dark and light', 'a pair, a range, arrows and a chord in the key bar, in buttons and pressed. Dark above, light below.', true],
  ['W-17p-11', 'a-one-cap', 'a', '(a) one cap holding both glyphs, in real contexts', 'results bottom, drill bottom, the help list and buttons.'],
  ['W-17p-12', 'b-two-caps', 'b', '(b) two caps side by side, in real contexts', 'the same four contexts.'],
  ['W-17p-13', 'c-joined', 'c', '(c) two caps joined by a connector, in real contexts', 'the same four contexts.'],
  ['W-17p-14', 'd-cap-dash-cap', 'd', '(d) cap + separator + cap, in real contexts', 'ranges with a dash, chords with a plus; pairs stay two caps.'],
  ['W-17p-21', 'not-keys-stay-flat', 'notkeys', 'what is not a keyboard key stays flat, dark and light', 'chips, badges, tags, buttons and the toast next to keycaps; right column shows the forbidden bevelled look. Dark above, light below.', true],
];
FAMILIES.pairs = { dir: 'gallery/widgets/2026-10-02-keycaps-pairs', page: 'pairs.html', prefix: 'W-17p', label: 'W-17 pairs', jobs: PAIRS.map(([id, name, view, title, caption, both]) => ({ id, file: `${id}-${name}.png`, title, caption, both: !!both, theme: 'dark', params: { view } })) };


// system check: the approved set together, on the same screens (dark above, light below in every image)
const SYS = [
  ['SC-01', 'solve-settings-desktop', 'd1', 'solve with a scramble ready and settings open (desktop)', 'W-21 labels on the Orbit, the W-04 primary with a bevelled key, ink chips, segmented, switches, a W-16 toast. Dark above, light below.'],
  ['SC-02', 'results-desktop', 'd2', 'results (desktop)', 'the primary and the ink chips on one screen, W-21 mini form, W-16 toast. Dark above, light below.'],
  ['SC-03', 'drill-round-desktop', 'd3', 'a drill round (desktop)', 'ink choices with bevelled number keys, segmented, toast. Dark above, light below.'],
  ['SC-04', 'history-filters-desktop', 'd4', 'history with filters (desktop)', 'ink chips, segmented, select, quiet buttons, W-21 mini form in every row. Dark above, light below.'],
  ['SC-05', 'alg-playback-desktop', 'd5', 'alg playback (desktop)', 'W-21 labels with trigger gaps, ink segmented next to the primary. Dark above, light below.'],
  ['SC-11', 'five-screens-phone', 'phones', 'the five screens on a phone', 'solve + settings, results, drill, history filters, alg playback at 390 x 844. Dark above, light below.'],
  ['SC-31', 'ink-chip-vs-cream-primary', 'confuse', 'selected ink chip against the cream primary, and four differentiators', 'side by side in three contexts, with the sizes. Dark above, light below.'],
  ['SC-41', 'in-progress-connecting', 'connect', 'in progress: connecting', 'the whole Orbit travels; no spinner. Dark above, light below.'],
  ['SC-42', 'in-progress-analysing', 'analyse', 'in progress: analysing a solve', 'the result Orbit fills in stage by stage. Dark above, light below.'],
  ['SC-43', 'in-progress-searching', 'search', 'in progress: searching for a better pair', 'one arc per candidate pairing. Dark above, light below.'],
];
FAMILIES.system = { dir: 'gallery/widgets/2026-10-02-system-check', page: 'sys.html', prefix: 'SC', label: 'system check', jobs: SYS.map(([id, name, view, title, caption]) => ({ id, file: `${id}-${name}.png`, title, caption, both: true, theme: 'dark', params: { view } })) };

// containers (W-10 / W-14 / W-15 / W-29 as one system): the ladder, the side-by-side, then 8 contexts per option
const CV = [['kit', 'kit-five-containers', 'the five containers (section, group/panel, disclosure, drawer, dialog)', 'each container with its one-line rule.'], ['settings', 'settings-drawer', 'the settings drawer over solve (desktop)', 'sections, a group, disclosures, the drawer, a toast.'], ['debug', 'debug-drawer', 'the debug drawer (the ` key)', 'key/value group, event log panel, disclosures.'], ['help', 'help-page', 'the help page', 'sections, a key list, build info, disclosures.'], ['review', 'review-detail', 'the review detail panel on results', 'the detail next to the Orbit.'], ['confirm', 'confirm-dialog-delete', 'confirm dialog: delete a solve', 'one decision, safe default.'], ['import', 'import-sheet', 'import sheet (desktop)', 'a few fields in one dialog.'], ['phone', 'phone-sheets', 'phone: settings sheet, confirm dialog, import sheet', 'three phones at 390 x 844.']];
const CJOBS = [
  { id: 'C-00', file: 'C-00-ladder-which-container-when.png', title: 'the ladder: which container when', caption: 'section, group, panel, disclosure, drawer, dialog: when and the rules.', both: false, theme: 'dark', params: { view: 'rules' } },
  { id: 'C-01', file: 'C-01-compare-settings-drawer.png', title: 'the settings drawer in the three options', caption: 'frameless, soft panels, hairline rules. Dark above, light below.', both: true, theme: 'dark', params: { view: 'compare' } },
];
for (const o of [1, 2, 3]) CV.forEach(([view, name, title, caption], i) => { const id = `C-${o}${i + 1}`; CJOBS.push({ id, file: `${id}-option${o}-${name}.png`, title: `option ${o}: ${title}`, caption: `${caption} Dark above, light below.`, both: true, theme: 'dark', params: { view, opt: String(o) } }); });
FAMILIES.containers = { dir: 'gallery/widgets/2026-10-02-containers', page: 'containers.html', prefix: 'C', label: 'containers', jobs: CJOBS };

// lists and data (W-11 rows + mini Orbit glyph, W-19 stats, W-18 badges, W-25 empty states, W-30 eyebrows): six contexts + the kit per option
const LV = [['kit', 'kit-five-parts', 'the five list parts (row, glyph, stat, badge/tag, head + empty)', 'each part with its states.'], ['history', 'history-sessions-solves', 'history: sessions and solves (desktop)', 'the A-07 screen: session ring, stats, rows with the mini Orbit.'], ['algs', 'algs-case-list', 'algs: the case list (desktop)', 'glyph = the alg, with trigger gaps.'], ['drill', 'drill-case-list', 'a drill: stats and the case list (desktop)', 'glyph = the last 8 answers.'], ['progress', 'progress-stats', 'progress: stat blocks and two lists (desktop)', 'numbers and glyphs only, no bars.'], ['empty', 'empty-states', 'empty states: history, pins, due cases (desktop)', 'one sentence, one action, three sizes.'], ['phone', 'phone-lists', 'phone: history, algs, empty pins', 'three phones at 390 x 844.']];
const LJOBS = [{ id: 'L-00', file: 'L-00-compare-parts.png', title: 'the list parts in the three options', caption: 'rows, glyphs, stats, tags and an empty state side by side. Dark above, light below.', both: true, theme: 'dark', params: { view: 'compare' } }];
for (const o of [1, 2, 3]) LV.forEach(([view, name, title, caption], i) => { const id = `L-${o}${i + 1}`; LJOBS.push({ id, file: `${id}-option${o}-${name}.png`, title: `option ${o}: ${title}`, caption: `${caption} Dark above, light below.`, both: true, theme: 'dark', params: { view, opt: String(o) } }); });
LJOBS.push({ id: 'L-12b', file: 'L-12b-option1-history-sessions-solves-callout-fixed.png', title: 'option 1: history, callout 3 moved off the ao12 figure', caption: 'same as L-12; the numbered callout 3 now sits left of the session head instead of covering ao12 15.03. Dark above, light below.', both: true, theme: 'dark', params: { view: 'history', opt: '1' } });
FAMILIES.lists = { dir: 'gallery/widgets/2026-10-02-lists-data', page: 'lists.html', prefix: 'L', label: 'lists and data', jobs: LJOBS };


// dev pages: timeline graph (W-32), thumbnail card (W-33), blog post (W-34), compare view (W-35)
const DPJ = [
  ['DP-00', 'decide', 'decide', 'decide: pick ①②③ for Q1, Q2 and Q3', 'every option side by side; my pick is marked; the blog post needs no answer.'],
  ...[['q1', 'timeline-', ['git-graph', 'rings', 'spine']], ['q2', 'card-', ['image-card', 'contact-tile', 'row-card']], ['q3', 'compare-', ['two-panes', 'stage-dock', 'wipe-first']], ['b1', 'post-', ['article', 'two-columns', 'pictures-first']]]
    .flatMap(([q, label, names]) => names.map((n, i) => ["DP-00", `${q}-option${i + 1}-${label}${n}`, `${q}o${i + 1}`, `decision ${q === 'b1' ? '(blog post, no question)' : q.toUpperCase()}, option ${'①②③'[i]} at full size`, 'the 1440 x 900 top screen of this option, unscaled; the same screen as in DP-00.'])),
  ['DP-01', 'shared-pieces', 'shared', 'the shared pieces of every dev page', 'header, tabs, status badge, branch tag, caption, and the two widgets that are not approved yet. Dark above, light below.', true],
  ['DP-11', 'timeline-1-git-graph', 't1', 'W-32 option 1: the git graph, kept (full page)', 'lanes in one neutral line, the chosen path thick, 44 posts on one page.'],
  ['DP-12', 'timeline-2-rings', 't2', 'W-32 option 2: every branch is a ring', 'branches as concentric rings, posts as points, the chosen path emphasized.'],
  ['DP-13', 'timeline-3-spine', 't3', 'W-32 option 3: one spine ring, folded badges', 'the chosen path as the ring; side branches folded into count badges, one cluster expanded.'],
  ['DP-14', 'timeline-phone', 'tp', 'W-32 on a phone, the three options', 'three 390 px phones side by side.'],
  ['DP-21', 'card-1-image-card', 'c1', 'W-33 option 1: the image card', 'grid, blog strip and history/alg browsing.'],
  ['DP-22', 'card-2-contact-tile', 'c2', 'W-33 option 2: the contact tile', 'dense grid, hover and selected states.'],
  ['DP-23', 'card-3-row-card', 'c3', 'W-33 option 3: the row card', 'picture + words, two per row.'],
  ['DP-24', 'card-phone', 'cp', 'W-33 on a phone, the three options', 'two, three and one per row.'],
  ['DP-31', 'post-1-article', 'b1', 'W-34 option 1: one column article', 'meta, title, decision, text, figures, image index, lineage.'],
  ['DP-32', 'post-2-two-columns', 'b2', 'W-34 option 2: two columns with a sticky rail', 'decision, lineage and image list in the rail; figures inline.'],
  ['DP-33', 'post-3-pictures-first', 'b3', 'W-34 option 3: pictures first', 'hero stage and filmstrip, then the words.'],
  ['DP-34', 'post-phone', 'bp', 'W-34 on a phone, the three options', 'three 390 px phones side by side.'],
  ['DP-41', 'compare-1-side-by-side', 'x1', 'W-35 option 1: toolbar on top, two panes', 'side by side, selects, modes, zoom.'],
  ['DP-42', 'compare-2-overlay', 'x2', 'W-35 option 2: immersive stage with a dock (overlay)', 'onion skin at 50%.'],
  ['DP-43', 'compare-2-difference', 'x2d', 'W-35 option 2: difference on', 'identical pixels go black.'],
  ['DP-44', 'compare-3-wipe', 'x3', 'W-35 option 3: wipe first with a list of changes', 'the wipe handle and the changes list.'],
  ['DP-45', 'compare-phone', 'xp', 'W-35 on a phone, the three options', 'three 390 px phones side by side.'],
  ['DP-46', 'compare-reuse', 'xr', 'W-35 reused: design lab, yours vs better, history', 'one stage, three uses.'],
  ['DP-91', 'light-sheet', 'light', 'light sheet: the recommended option of each family', 'the top screen of W-32 3, W-33 1, W-34 2 and W-35 3 in the light theme.', false, 'light'],
];
FAMILIES.devpages = { dir: 'gallery/widgets/2026-10-02-dev-pages', page: 'dev.html', prefix: 'DP', label: 'dev pages', jobs: DPJ.map(([id, name, view, title, caption, both, th]) => ({ id, file: `${id}-${name}.png`, title, caption, both: !!both, theme: th || 'dark', params: { view } })) };

// navigation (W-13 tabs, W-26 links + crumbs + back link, W-27 the header cube chip and menu): 7 images per option + a compare sheet
const NV = [['chips', 'cube-chip-six-states', 'the cube chip: six states and the menu', 'disconnected, connecting, syncing, connected, desynced, interrupted; the menu or drawer when out of sync.', true], ['menu', 'cube-menu-on-solve', 'the cube menu on solve (desktop)', 'the chip open on the solve page; the menu form of this option.'], ['connect', 'connecting-full-orbit', 'connecting: the full Orbit sweeps (desktop)', 'the current uniform sweep is kept; the chip and the status are working.'], ['tabs', 'tabs-on-algs', 'tabs on the algs page (desktop)', 'the algs sets as tabs, with the list under them.', true], ['tabkit', 'tabs-contexts-states', 'tabs: four contexts and the states', 'algs sets, dev gallery, settings sections, a drawer; states.', true], ['links', 'links-back-crumbs', 'links, crumbs and the back link on a case page (desktop)', 'back to where you came from, inline and deep links, an external link.'], ['phone', 'phone-menu-tabs-back', 'phone: the cube menu, tabs and the back link', 'three phones at 390 x 844.', true]];
const NJOBS = [{ id: 'N-01', file: 'N-01-compare-parts.png', title: 'the navigation parts in the three options', caption: 'chips, tabs, links and the back link side by side. Dark above, light below.', both: true, theme: 'dark', params: { view: 'compare' } }];
for (const o of [1, 2, 3]) NV.forEach(([view, name, title, caption, both], i) => { const id = `N-${o}${i + 1}`; NJOBS.push({ id, file: `${id}-option${o}-${name}.png`, title: `option ${o}: ${title}`, caption: both ? `${caption} Dark above, light below.` : caption, both: !!both, theme: 'dark', params: { view, opt: String(o) } }); });
FAMILIES.navigation = { dir: 'gallery/widgets/2026-10-02-navigation', page: 'nav.html', prefix: 'N', label: 'navigation', jobs: NJOBS };

// inputs (W-09 text inputs, W-36 the search field): 5 images per option + a compare sheet
const IV = [['kit', 'input-parts-states', 'the input parts and their states', 'text, number, textarea, file picker, range and the search field, with errors and the empty/no-result states.', true], ['settings', 'settings-drawer-fields', 'the settings drawer: number, textarea, text, range (desktop)', 'custom inspection seconds, a pasted scramble, a cube name and a speed range.'], ['import', 'import-page-fields', 'import: link, textarea in error, file picker (desktop)', 'a pasted reconstruction with one error line, and a file to open.'], ['search', 'search-in-algs', 'search in the algs list (desktop)', 'the search field placed as this option does, with a count and the filtered list.'], ['phone', 'phone-settings-import-search', 'phone: settings sheet, import and search', 'three phones at 390 x 844.', true]];
const IJOBS = [{ id: 'I-01', file: 'I-01-compare-parts.png', title: 'the input parts in the three options', caption: 'text, number, textarea, file, range and search side by side. Dark above, light below.', both: true, theme: 'dark', params: { view: 'compare' } }];
for (const o of [1, 2, 3]) IV.forEach(([view, name, title, caption, both], i) => { const id = `I-${o}${i + 1}`; IJOBS.push({ id, file: `${id}-option${o}-${name}.png`, title: `option ${o}: ${title}`, caption: both ? `${caption} Dark above, light below.` : caption, both: !!both, theme: 'dark', params: { view, opt: String(o) } }); });
FAMILIES.inputs = { dir: 'gallery/widgets/2026-10-02-inputs', page: 'inputs.html', prefix: 'I', label: 'inputs', jobs: IJOBS };

// time and coach: W-22 timer display and W-20 coach line, three options each
const TCV = [
  ['timer-solve', 'timer-solving-desktop', 'W-22: solving, the XL readout in the dial slot (A-04)', 'the running readout with the stage line; the slot never moves.'],
  ['timer-inspect', 'timer-inspection-overtime', 'W-22: inspection countdown, overtime +1 +2 and DNF (A-03)', 'three moments of the same readout and dial.'],
  ['timer-states', 'timer-states-three-sizes', 'W-22: every state in XL, L and M', 'ready, running, stopped, +2, DNF, inspection, overtime, hidden.'],
  ['timer-drill', 'timer-drill-L-and-M', 'W-22: a drill with the L readout and the M inline form (A-08)', 'case time in the rail, the foot line inline.'],
  ['timer-phone', 'timer-phone', 'W-22: phone 390 x 844, running, overtime, +2 result (A-09)', 'the readout at 76 px in the dial slot.'],
  ['coach-results', 'coach-results-desktop', 'W-20: results with the coach line and its connector (A-05)', 'the cross detour selected; +2 result in the slot.'],
  ['coach-tones', 'coach-praise-and-fix', 'W-20: praise and fix, left and right, the connector in time', 'four selections and the fade in, held, out.'],
  ['coach-crowded', 'coach-crowded-ring', 'W-20: a crowded ring, 14 markers in four clusters', 'cluster handling per option (feedback 8).'],
  ['coach-phone', 'coach-phone', 'W-20: phone 390 x 844, fix, praise and a crowded cluster', 'the sentence under the time, the connector per option.'],
];
const TCJOBS = [];
for (const o of [1, 2, 3]) TCV.forEach(([view, name, title, caption], i) => { const id = `TC-${o}${i + 1}`; TCJOBS.push({ id, file: `${id}-option${o}-${name}.png`, title: `option ${o}: ${title}`, caption, theme: 'dark', params: { view, opt: String(o) } }); });
TCJOBS.push({ id: 'TC-91', file: 'TC-91-light-sheet.png', title: 'light sheet: the timer and the coach line in the three options', caption: 'running readout, coach line with connector and the +2 readout, light theme.', theme: 'light', params: { view: 'light' } });
FAMILIES.timecoach = { dir: 'gallery/widgets/2026-10-02-time-and-coach', page: 'tc.html', prefix: 'TC', label: 'time and coach', jobs: TCJOBS };

// progress and charts: W-23 round/progress panels, W-24 charts (3 options) and W-37 the compare wipe handle (3 forms)
const PCJOBS = [
  { id: 'PC-01', file: 'PC-01-what-replaces-what.png', title: 'W-23 / W-24: what every bar, panel and chart becomes', caption: 'inventory image on the left, the Orbit form on the right.', theme: 'dark', params: { view: 'replace' } },
  { id: 'PC-02', file: 'PC-02-drill-round-orbit.png', title: 'W-23: a drill round in progress (A-08), shared by all options', caption: 'the Orbit is the round panel and the progress track.', theme: 'dark', params: { view: 'drill-round' } },
];
const PCV = [['drill-end', 'end-of-round', 'end of a drill round (A-08)', 'the round as re-weighted Orbit arcs and the recent-rounds element.'], ['progress', 'progress-page', 'the progress page', 'the stage-average Orbit and the long-term trend.'], ['phone', 'phone', 'phone 390 x 844: the round, the end of the round and progress', 'the same elements on a phone.']];
for (const o of [1, 2, 3]) PCV.forEach(([view, name, title, caption], i) => { const id = `PC-${o}${i + 1}`; PCJOBS.push({ id, file: `${id}-option${o}-${name}.png`, title: `option ${o} (${['Orbit only', 'Orbit + tick dial', 'Orbit + one trend line'][o - 1]}): ${title}`, caption, theme: 'dark', params: { view, opt: String(o) } }); });
PCJOBS.push({ id: 'PC-41', file: 'PC-41-W-37-handles-in-five-states.png', title: 'W-37: the three wipe handles in five states', caption: 'rest, hover, dragging, keyboard focus, locked.', theme: 'dark', params: { view: 'wipe-states' } });
for (const o of [1, 2, 3]) PCJOBS.push({ id: `PC-4${o + 1}`, file: `PC-4${o + 1}-W-37-handle-${'abc'[o - 1]}-compare-stage.png`, title: `W-37 handle ${'ABC'[o - 1]}: ${['ink knob', 'hairline + bottom grabber', 'the Orbit caret'][o - 1]} on the compare stage`, caption: 'the dev compare page at 1440 x 900, wipe mode.', theme: 'dark', params: { view: 'wipe-stage', opt: String(o) } });
PCJOBS.push({ id: 'PC-45', file: 'PC-45-W-37-handles-phone.png', title: 'W-37 on a phone: the 44 px touch target', caption: 'three 390 px phones, dragging at 46 %.', theme: 'dark', params: { view: 'wipe-phone' } });
PCJOBS.push({ id: 'PC-91', file: 'PC-91-light-sheet.png', title: 'light sheet: the trend forms and the three wipe handles', caption: 'progress trend (top) and handles at rest (bottom).', theme: 'light', params: { view: 'light' } });
FAMILIES.progresscharts = { dir: 'gallery/widgets/2026-10-02-progress-and-charts', page: 'pc.html', prefix: 'PC', label: 'progress and charts', jobs: PCJOBS };

const fam = FAMILIES[process.argv[2]];
if (!fam) { console.error(`usage: widget-proposal-shots.mjs ${Object.keys(FAMILIES).join('|')} [--only=text]`); process.exit(2); }
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const scale = Number((process.argv.find(a => a.startsWith('--scale=')) || '--scale=2').slice(8));
if (![1, 2, 3].includes(scale)) { console.error('--scale must be 1, 2 or 3'); process.exit(2); }
const hdSuffix = scale === 1 ? '' : scale === 2 ? '-hd' : `-hd${scale}`;

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/${fam.dir}/proto/${fam.page}`;
const outDir = path.join(root, fam.dir);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1480, height: 1000 }, deviceScaleFactor: scale });
const page = await ctx.newPage();
page.on('pageerror', e => console.error('page error:', e.message));

async function shot(params) {
  await page.goto(`${base}?${new URLSearchParams(params)}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
  await page.waitForTimeout(150);
  return page.locator('#board').screenshot({ animations: 'disabled' });
}
const pngWidth = buf => buf.readUInt32BE(16);
async function stitch(a, b) {
  const p = await ctx.newPage();
  const w = Math.round(pngWidth(a) / scale);   // CSS px, so the 2x pixels are kept 1:1
  await p.setContent(`<body style="margin:0;background:#888"><div id="wrap" style="width:max-content"><img id="a" src="data:image/png;base64,${a.toString('base64')}" style="display:block;width:${w}px"><img id="b" src="data:image/png;base64,${b.toString('base64')}" style="display:block;width:${w}px"></div></body>`);
  await p.waitForFunction(() => [...document.images].every(i => i.complete));
  const buf = await p.locator('#wrap').screenshot();
  await p.close();
  return buf;
}

const manifest = fs.existsSync(path.join(outDir, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8')) : {};
const pad = n => String(n).padStart(2, '0');
const jobs = fam.jobs ? [...fam.jobs] : [];
let n = 0;
if (!fam.jobs) jobs.push({ ...fam.compare, id: `${fam.prefix}-${pad(n)}`, file: `${fam.prefix}-${pad(n)}-${fam.compare.name}.png`, params: { view: 'compare' } });
for (const opt of fam.jobs ? [] : [1, 2, 3]) {
  for (const v of fam.views) {
    n++;
    const id = `${fam.prefix}-${pad(n)}`;
    jobs.push({ ...v, id, opt, file: `${id}-option${opt}-${v.key}.png`, params: { view: v.key, opt: String(opt) }, title: `option ${opt}: ${v.title}` });
  }
}
for (const j of jobs) {
  if (only.length && !only.some(o => j.file.includes(o))) continue;
  const outFile = j.file.replace(/\.png$/, `${hdSuffix}.png`);
  if (fs.existsSync(path.join(outDir, outFile))) { console.log('exists, skipped', outFile); continue; }
  const common = { ...j.params, id: j.id };
  let buf;
  if (j.both) {
    const dark = await shot({ ...common, theme: 'dark' });
    const light = await shot({ ...common, theme: 'light', legend: '0', id: `${j.id} (light)` });
    buf = await stitch(dark, light);
  } else {
    buf = await shot({ ...common, theme: j.theme || 'dark' });
  }
  fs.writeFileSync(path.join(outDir, outFile), buf);
  manifest[outFile] = { id: j.id, title: hdSuffix ? `${j.title} (HD ${scale}x)` : j.title, caption: j.caption };
  console.log('wrote', outFile);
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await browser.close();
server.close();
