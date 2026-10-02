/* global document */
import { q, mount, header, theme } from '../../_proto/common.js';
import { tl1, tl2, tl3, pageHead } from './timeline.js';
import { cards } from './cards.js';
import { post } from './post.js';
import { compare } from './compare.js';
import { UI, key, toast, co, sbadge, btag, copyLink, secondary, textBtn, ARROWS } from './kit.js';

const boardId = q.get('id') || 'DP';
const view = q.get('view') || 't1';
const afterMount = () => { document.getElementById('board').dataset.opt = '3'; };
const trio = (fn, labels) => `<div class="trio">${[0, 1, 2].map(i => `<div><div class="lab-mono">${labels[i]}</div>${fn(i + 1)}</div>`).join('')}</div>`;
const L = (...a) => a;
const M = (name, frame, legend, width, cols = 1) => mount({ id: boardId, name, frame, legend, width, cols });

/* ---------------------------------------------------------------- the small shared pieces of every dev page */
function shared() {
  const cell = (n, label, html) => `<div ${co(n)} style="display:grid;gap:12px;align-content:start;padding:18px 20px;border-radius:16px;box-shadow:inset 0 0 0 1px var(--b-hairline)"><span class="lab-mono">${label}</span>${html}</div>`;
  const frame = `<div class="frame tall" style="height:auto"><div style="position:relative;height:96px;overflow:hidden">${header({ active: '' })}</div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;padding:12px 48px 36px">
      ${cell(1, 'the A header, unchanged', '<div class="sub-m">wordmark + nav on the left, the cube chip and ? on the right. Dev pages are reached from the ? page and the ` drawer; no extra nav item.</div>')}
      ${cell(2, 'dev tabs (one level under the title)', `<div class="tabs"><span>folders</span><span class="on">blog</span><span>timeline</span></div><div class="sub-m">the A header nav pattern: ink text, a teal underline under the current tab</div>`)}
      ${cell(3, 'status badge: shape + word, flat', `<div class="row wrap" style="gap:8px">${['built', 'chosen', 'exploring', 'rejected', 'superseded'].map(s => sbadge(s)).join('')}</div><div class="sub-m">✦ built · ✓ chosen · ! rejected · dashed = superseded; never colour alone</div>`)}
      ${cell(4, 'branch tag', `<div class="row wrap" style="gap:14px">${btag('widgets', true)}${btag('design')}${btag('qa')}</div><div class="sub-m">a mono word with a dot; ink when the post is on the chosen path</div>`)}
      ${cell(5, 'ID + copy link (the thumbnail caption)', `<div class="row" style="gap:10px"><span class="mono" style="color:var(--b-accent-text);font-size:12px">SC-02</span><span style="font-size:13px">results (desktop)</span>${copyLink()}</div><div class="row" style="gap:10px">${toast('link copied · SC-02', '', 0)}</div>`)}
      ${cell(6, 'two things that are NOT approved yet', `<div class="row" style="gap:16px"><span class="field-ph" style="min-width:150px">filter this folder</span><span style="display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--b-ink);color:var(--b-bg)"><span style="width:22px;height:22px;display:block">${ARROWS.replace('<svg', '<svg style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;width:22px;height:22px"')}</span></span></div><div class="sub-m">a text field (the existing look) and the wipe handle: each needs its own proposal before any builder uses it</div>`)}
    </div></div>`;
  M('shared pieces of the dev pages', frame, L(
    '<b>The A header</b> is the header on every dev page, exactly as approved; the page title and the tabs sit under it (no separating line above the title).',
    '<b>Tabs</b> reuse the nav pattern one level down: no boxes, no pills, so they are never confused with the W-06 segmented control.',
    '<b>Status badge:</b> a flat pill, the glyph and the word together (✦ built, ✓ chosen, ! rejected, dashed superseded). Flat on purpose: only keyboard keys are bevelled.',
    '<b>Branch tag:</b> a dot and a mono word; ink when the post is on the chosen path, faint otherwise. One colour for every branch (the old 12 hues are gone).',
    '<b>Caption:</b> the ID in accent mono, the title, a W-04 text button for copy link, and the W-16 toast that confirms it.',
    '<b>Two widgets that are not in the registry:</b> the text field (search/filter) and the wipe handle. They are shown in their current/proposed look and must be approved separately.',
  ), 1440, 2);
}

/* ---------------------------------------------------------------- the light sheet: the recommended four, top screen of each */
function light() {
  const panel = (t, html, h = 450) => `<div><div class="lab-mono" style="margin-bottom:8px">${t}</div><div style="width:700px;height:${h}px;overflow:hidden;border-radius:12px;box-shadow:0 0 0 1px var(--b-hairline);position:relative"><div style="transform:scale(.486);transform-origin:top left;width:1440px">${html.replace(/ data-co(-side)?="[^"]*"/g, '')}</div></div></div>`;
  const frame = `<div style="display:grid;grid-template-columns:700px 700px;gap:24px 28px;padding:24px 20px 20px">${panel('W-32 option 3: the spine (top screen)', tl3(false), 437)}${panel('W-33 option 1: the image card (top screen)', cards(1, false), 437)}${panel('W-34 option 2: two columns (top screen)', post(2, false), 437)}${panel('W-35 option 3: wipe first (top screen)', compare('x3', false), 437)}</div>`;
  M('light sheet: the recommended option of each family', frame, L(
    '<b>W-32 ③ the spine</b> in light: the cream path arcs become ink; the teal live arc stays teal.',
    '<b>W-33 ① the card</b> in light: the picture sits on the surface-2 plate, the ID stays accent mono.',
    '<b>W-34 ② the two-column post:</b> the sticky rail keeps the decision and the lineage in view.',
    '<b>W-35 ③ wipe first:</b> the handle is ink in both themes; the images keep their own dark.',
  ), 1440, 2);
}


/* ---------------------------------------------------------------- the one decision image: every option side by side, Q1 to Q3 */
function decide() {
  const CIRC = ['①', '②', '③'];
  const prev = (html, label, pick) => `<div style="position:relative"><div style="width:440px;height:275px;overflow:hidden;border-radius:10px;box-shadow:0 0 0 1px var(--b-hairline);background:var(--b-bg)"><div style="transform:scale(.3055);transform-origin:top left;width:1440px;height:900px;overflow:hidden">${html.replace(/ data-co(-side)?="[^"]*"/g, '')}</div></div>
    <div style="position:absolute;left:50%;transform:translateX(-50%);bottom:10px;display:flex;gap:8px;align-items:center"><span style="display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--b-warn);color:#141311;font:700 17px var(--b-font-sans)">${label}</span>${pick ? '<span class="sb sb--built" style="height:24px">my pick</span>' : ''}</div></div>`;
  const row = (q, title, line, htmls, pick) => `<div style="display:grid;gap:10px"><div class="row" style="gap:14px;align-items:baseline">${q ? `<span style="display:inline-grid;place-items:center;min-width:44px;height:28px;padding:0 10px;border-radius:14px;background:var(--b-ink);color:var(--b-bg);font:600 14px var(--b-font-mono)">${q}</span>` : '<span class="sub-m" style="min-width:44px">no Q</span>'}<b style="font-size:19px">${title}</b><span class="sub-m">${line}</span></div>
    <div style="display:grid;grid-template-columns:repeat(3,440px);gap:20px">${htmls.map((h, i) => prev(h, CIRC[i], pick === i)).join('')}</div></div>`;
  const frame = `<div style="padding:26px 40px 30px;display:grid;gap:24px">
    ${row('Q1', 'timeline graph (W-32)', 'which one? ① git graph kept · ② branches as rings · ③ one spine ring, branches folded', [tl1(false), tl2(false), tl3(false)], 2)}
    ${row('Q2', 'thumbnail card (W-33)', 'which one? ① image card · ② contact tile · ③ row card', [cards(1, false), cards(2, false), cards(3, false)], 0)}
    ${row('Q3', 'compare view (W-35)', 'which one? ① two panes · ② stage + dock · ③ wipe first (all have side by side, overlay, wipe)', [compare('x1', false), compare('x2', false), compare('x3', false)], 2)}
    ${row('', 'blog post (W-34)', 'no question: I build ② two columns unless you object', [post(1, false), post(2, false), post(3, false)], 1)}</div>`;
  M('decide: pick ①②③ for Q1, Q2 and Q3', frame, [], 1440, 1);
}

const V = {
  decide,
  shared,
  light,
  t1: () => M('W-32 option 1: the git graph, kept (full page, 44 posts)', tl1(false), L(
    '<b>The git graph, kept:</b> one lane per branch (12), newest on top, all 44 posts on one page. Lanes are one neutral line; <b>the chosen path is the thick cream line</b>, so the eye follows what was chosen through the noise.',
    '<b>W-06 segmented:</b> all posts · chosen path · built. It filters the rows; the path stays drawn.',
    '<b>Status key:</b> five node shapes and the path line, in one quiet line under the filter (shape + colour, never colour alone).',
    '<b>The selected row opens in place:</b> W-33 tiles, the decision line, a W-04 secondary and text buttons. Everything else stays a one-line row.',
    '<b>Compare pick:</b> an ink ✓ square at the row end. Two picks enable the compare action.',
    '<b>W-16 toast</b> in the bottom-right slot carries the compare action once two rows are picked (shown at the viewport bottom, 900 px down the page).',
  ), 1440, 2),
  t2: () => M('W-32 option 2: every branch is a ring (the Orbit language)', tl2(false), L(
    '<b>Each branch is a ring</b>, the oldest inside; a post is a point on its ring; the angle is the order in time (clockwise from the top; day ticks outside). The branch names are stacked in the open gap at the bottom, like the Orbit slot.',
    '<b>The chosen path</b> is the thick cream line: it hugs a ring while the work stays on a branch and hops outward when it moved to another. Side edges are hairlines.',
    '<b>W-06 segmented</b> (all · chosen path · built) and the status key; no other control on the stage.',
    '<b>Selected post:</b> its thumbnail sits where the cube sits (centre of the Orbit); the card on the right has the decision, the lineage and the W-04 primary with a W-17 enter key.',
    '<b>Labels only for the 11 chosen-path posts,</b> outside the rings in two tiers, with the A-05 dotted connector. Labelling all 44 would not fit.',
    '<b>W-16 toast</b> for the compare picks.',
  ), 1440, 2),
  t3: () => M('W-32 option 3: one spine ring, side branches folded into badges', tl3(false), L(
    '<b>The ring is the chosen path:</b> 11 posts, drawn like the Orbit (cream done arcs, the newest arc live in teal, 2.5 degree gaps), labelled outside as name, date, status marker.',
    '<b>W-06 segmented:</b> path · all posts. "All posts" unfolds every badge at once (or falls back to the list of option 1).',
    '<b>An expanded cluster:</b> the 10 posts that hang from v2-themes are numbered points on an inner arc; the rail lists the same numbers.',
    '<b>W-16 toast</b> says what is expanded and offers collapse; one cluster is open at a time.',
    '<b>W-04 primary</b> "open post" with a bevelled W-17 enter key.',
    '<b>Folded side branches are cluster badges</b> (+7, +5 and so on, as in the crowded-Orbit rule): 33 of the 44 posts are folded and still one tap away.',
  ), 1440, 2),
  tp: () => M('W-32 on a phone (390 x 844), the three options', trio(i => [tl1, tl2, tl3][i - 1](true), ['option 1: git graph', 'option 2: rings', 'option 3: spine']), L(
    '<b>Option 1:</b> lanes squeeze to 8.5 px (12 lanes = 110 px); the title takes one line, the meta a second; the expanded row keeps two thumbnails and 40 px buttons.',
    '<b>Segmented control</b> full width, 40 px high, in all three.',
    '<b>Options 2 and 3:</b> the Orbit is the overview; the list below is the same path with numbers matching the points on the ring. At 158 px radius the 12 rings of option 2 are 10 px apart: readable as a picture, not as a target, so the rows are the way to pick.',
    '<b>Option 1:</b> the selected row opens in place with a W-04 secondary at 40 px; <b>option 3:</b> the open cluster is named under the list.',
    '<b>Option 1:</b> the ✓ pick; two picks show the W-16 toast above the bottom edge.',
    '<b>Phone verdict:</b> 1 is the most precise, 3 is the calmest and the one whose ring stays legible; 2 degrades the most.',
  ), 1290, 2),

  c1: () => M('W-33 option 1: the image card (grid, strip, history)', cards(1, false), L(
    '<b>Filter:</b> a text field (not yet approved: shown in its current look) and ink chips (W-05) for dark / light / phone.',
    '<b>The card:</b> the picture at 4:3 (tall phone shots crop to their top), the ID in accent mono, one-line title, a size/theme note, and a W-04 text button for copy link.',
    '<b>Hover:</b> an empty ✓ square appears top-left (the compare pick); the picture opens the lightbox.',
    '<b>Selected for compare:</b> a 2 px ink edge and a filled ✓; at most two.',
    '<b>W-16 toast</b> confirms copy link ("link copied · SC-02") in the bottom-right slot.',
    '<b>Same card in history and alg browsing:</b> the picture becomes the mini Orbit (W-02 glyph), the time in mono and one meta line; same edge, same hover and selected rules.',
  ), 1440, 2),
  c2: () => M('W-33 option 2: the contact tile (dense grid)', cards(2, false), L(
    '<b>Filter:</b> as in option 1.',
    '<b>The tile:</b> a 16:10 crop of the picture\'s top-left, only the ID as a small chip on the picture; no caption. Six per row, 24 visible: made for folders with 100+ images.',
    '<b>Hover (shown on A-09):</b> the ID chip grows into ID + title over a fade, and copy link appears top-right.',
    '<b>Selected:</b> a 2 px ink ring and a ✓ top-left.',
    '<b>W-16 toast</b> for copy link.',
    '<b>History and alg browsing:</b> twelve mini-Orbit tiles per row, the time under each.',
  ), 1440, 2),
  c3: () => M('W-33 option 3: the row card (picture + words)', cards(3, false), L(
    '<b>Filter:</b> as in option 1.',
    '<b>The row card:</b> a 148 px picture, then ID, theme/size, title (2 lines) and a 2-line caption from the manifest, with a W-04 secondary "open" and a text "copy link". Two per row; the caption is why you would choose this.',
    '<b>The strip in a blog post:</b> three cards 360 px wide in a marked horizontal scroller (the only sideways scroll, flagged for the layout tests).',
    '<b>Selected:</b> the same 2 px ink edge.',
    '<b>W-16 toast</b> for copy link.',
    '<b>History and alg browsing:</b> the row becomes glyph, time, one meta line and a text "open".',
  ), 1440, 2),
  cp: () => M('W-33 on a phone (390 x 844), the three options', trio(i => cards(i, true), ['option 1: image card, 2 per row', 'option 2: contact tile, 3 per row', 'option 3: row card, 1 per row']), L(
    '<b>Option 1</b> keeps the caption at 2 per row: the title truncates, the copy-link text button is 40 px on touch.',
    '<b>Option 2</b> shows 12 tiles at 3 per row with no text; the ID chip is the only label, so a tap is needed to read a title.',
    '<b>Option 3</b> reads best on a phone (one card per row, caption visible) but shows the fewest pictures per screen.',
    '<b>Selected edge</b> (2 px ink) and the ✓ are identical across the three.',
    '<b>W-16 toast</b> sits above the bottom edge on a phone.',
    '<b>History and alg browsing</b> follow the same grid: 2 per row, 4 per row, 1 per row.',
  ), 1290, 2),

  b1: () => M('W-34 option 1: one column, the article', post(1, false), L(
    '<b>Title</b> at 34 px in a 760 px column (about 80 characters a line: a comfortable measure). The meta row sits above it.',
    '<b>Meta:</b> date, branch tag, status badge, author. The status badge is flat, glyph + word.',
    '<b>Decision</b> as a framed line directly under the title: the one thing you came for.',
    '<b>Inline figure</b> with ID and title in mono; the picture opens the lightbox.',
    '<b>Image index:</b> every image of the post as contact tiles at the end, the one in view with the ink edge.',
    '<b>Lineage:</b> grew out of / led to as plain links.',
    '<b>W-16 toast</b> for copy link.',
  ), 1440, 2),
  b2: () => M('W-34 option 2: two columns, a sticky rail', post(2, false), L(
    '<b>Title</b> in the main column (780 px), first.',
    '<b>Meta + decision</b> pinned in a 300 px sticky rail: the decision stays in view while you read.',
    '<b>Lineage</b> in the rail: grew out of / led to, always one click away.',
    '<b>The numbered image list</b> in the rail is the contents of the pictures; the one on screen has the surface bar.',
    '<b>The one action:</b> a W-04 primary "compare with parent" plus a text "copy link".',
    '<b>Figures inline,</b> next to the paragraph that cites them (W-04-00 after the shared rules, W-04-02 after the options).',
    '<b>W-16 toast</b> for copy link.',
  ), 1440, 2),
  b3: () => M('W-34 option 3: pictures first, then the words', post(3, false), L(
    '<b>Title</b> on top.',
    '<b>Hero stage:</b> the post\'s picture large (860 px) with a tag for its ID, for posts where the images are the point.',
    '<b>Decision</b> beside the hero.',
    '<b>Lineage and actions</b> beside the hero as well (W-04 secondary and text buttons).',
    '<b>Filmstrip:</b> all the post\'s images; the selected one has the ink edge and the hero follows.',
    '<b>The text</b> comes under the pictures, 860 px wide.',
    '<b>W-16 toast</b> for copy link.',
  ), 1440, 2),
  bp: () => M('W-34 on a phone (390 x 844), the three options', trio(i => post(i, true), ['option 1: article', 'option 2: rail becomes a card at the end', 'option 3: hero first']), L(
    '<b>Option 1:</b> the same order as on a desktop; the image tiles are three per row.',
    '<b>Option 2:</b> on a phone the sticky rail cannot stay; the title and text come first and the rail (decision, lineage, image list, action) follows. The decision is then far from the title, so a phone needs the decision line under the title as in option 1.',
    '<b>Option 3:</b> the hero is a 354 px picture with a filmstrip, then the decision, the lineage and the text; the best way to look at screenshots one by one.',
    '<b>Inline figures</b> are full width and open the lightbox.',
    '<b>Touch targets</b> are 40 px for the buttons and tiles.',
    '<b>Verdict:</b> 1 and 3 degrade gracefully; 2 needs its decision line copied under the title.',
  ), 1290, 2),

  x1: () => M('W-35 option 1: toolbar on top, two panes (side by side)', compare('x1', false), L(
    '<b>Pickers:</b> one W-08 select per pane (post · image).',
    '<b>Modes:</b> a W-06 segmented control: side by side · overlay · wipe.',
    '<b>Zoom:</b> fit · 100% · 200% and an ink switch "sync zoom" (W-07), so both panes pan together.',
    '<b>Panes:</b> two cards of the same size and crop; the header carries the post status and date.',
    '<b>W-16 toast</b> for the swap, with undo.',
  ), 1440, 1),
  x2: () => M('W-35 option 2: an immersive stage with one dock (overlay, onion skin)', compare('x2', false), L(
    '<b>Pickers</b> on a single line above the stage: A beneath, B over.',
    '<b>The dock:</b> modes (W-06), opacity in five steps (W-06 again, instead of a new slider), a "difference" chip (W-05) and swap.',
    '<b>Side rail:</b> small A and B thumbnails with their IDs and a swap button; the stage gets the width.',
    '<b>W-16 toast</b> for the difference/opacity mode.',
  ), 1440, 1),
  x2d: () => M('W-35 option 2: the same dock with difference on', compare('x2d', false), L(
    '<b>Pickers</b> as before.',
    '<b>Difference on:</b> identical pixels go black, the changes light up; the dock keeps the opacity row for the onion skin.',
    '<b>Side rail</b> unchanged.',
    '<b>W-16 toast</b> says what is showing.',
  ), 1440, 1),
  x3: () => M('W-35 option 3: wipe first, a changes list and one component', compare('x3', false), L(
    '<b>Pickers</b> stacked in a right column: A left, B right.',
    '<b>Modes</b> as the same W-06 segmented control; wipe is the default.',
    '<b>The wipe stage:</b> an ink handle you drag (or move with the arrow keys). The handle is a new widget, not in the registry.',
    '<b>What differs</b>: a numbered list the author (or the design lab) writes; the same numbers can be callouts on the stage. This is the "yours vs better" explanation slot.',
  ), 1440, 1),
  xp: () => M('W-35 on a phone (390 x 844), the three options', trio(i => compare(['x1', 'x2', 'x3'][i - 1], true), ['option 1: two panes stacked', 'option 2: stage + dock', 'option 3: wipe + changes']), L(
    '<b>Option 1:</b> side by side becomes one pane above the other; each pane is 354 px wide.',
    '<b>W-06 segmented</b> full width, 40 px; pickers are selects with short names.',
    '<b>Option 2:</b> the dock wraps into a bottom card; the stage is full bleed.',
    '<b>Option 3:</b> the wipe handle is 44 px (a touch target); the list of changes is under the pickers.',
    '<b>W-16 toast</b> above the bottom edge.',
    '<b>Verdict:</b> 3 is the easiest on a phone: one stage, one gesture.',
  ), 1290, 2),
  xr: () => M('W-35 reused: design lab, yours vs better, history', compare('xr', false), L(
    '<b>Design lab (F10):</b> option 1 against option 2 of a widget, wiped, with the same handle and the same list of changes.',
    '<b>Yours vs better (review):</b> two Orbits side by side; the Orbit of the better path is the second pane (a ring in a ring stays reserved for comparison, per the earlier decision).',
    '<b>History:</b> a solve over the one before, as an overlay; the stage takes any two renderings, not only images.',
  ), 1440, 3),
};
(V[view] || V.t1)();
afterMount();
if (q.get('legend') === '0') document.querySelector('.legend')?.remove();
void theme; void key; void secondary; void textBtn; void UI; void pageHead;
