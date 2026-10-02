// F16: groups the crawler's raw catalogue into widget families and variants, and writes the registry.
// Used by `node scripts/widget-inventory.mjs build`. Pure audit tooling: it reads /tmp/widget-inventory-raw
// and writes gallery/widgets/<date>-inventory/ and docs/design/WIDGETS.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATE = '2026-10-02';
/** The first inventory folder. A re-run never writes into a folder that already holds images (see pickPostDir). */
export const FIRST_POST_DIR = `gallery/widgets/${DATE}-inventory`;
export let POST_DIR = FIRST_POST_DIR;

/**
 * "Keep every image forever": a re-run of `build` never deletes, renames or overwrites. If the first
 * folder already holds generated files, the run goes to a NEW dated folder (`<today>-inventory-v2`, `-v3`, ...).
 * Returns { dir, id, parent, fresh }; fresh = nothing was there before (the original behaviour).
 */
export function pickPostDir(root, today = new Date().toISOString().slice(0, 10)) {
  const used = d => fs.existsSync(path.join(root, d)) && fs.readdirSync(path.join(root, d)).some(f => /^W-.*\.png$/.test(f) || f === 'inventory.json');
  if (!used(FIRST_POST_DIR)) return { dir: FIRST_POST_DIR, id: 'widget-inventory', parent: null, fresh: true };
  let n = 2;
  let prev = { dir: FIRST_POST_DIR, id: 'widget-inventory' };
  for (;; n++) {
    const dir = `gallery/widgets/${today}-inventory-v${n}`;
    if (!used(dir)) return { dir, id: `widget-inventory-v${n}`, parent: prev.id, fresh: false };
    prev = { dir, id: `widget-inventory-v${n}` };
  }
}

/**
 * The families. `status` follows SPEC-FLEET feedback #19: only the Header, the Orbit and the Cube are
 * approved; the cube chip/menu is pending; everything else is proposed (or to-remove).
 */
export const FAMILIES = [
  { id: 'W-01', key: 'header', name: 'Header', status: 'approved', purpose: 'Site header: wordmark, main nav, theme and help buttons (the approved design is the orbit-v3 A header; the current implementation is the legacy `.site-header`, to be replaced by the F0 header).',
    rec: 'Keep: the approved A-frame header, built once by F0. The legacy `.site-header` (styles.css) is replaced, not restyled. The brain page\'s in-page tab bar (W-13) duplicates its nav and goes.' },
  { id: 'W-02', key: 'orbit', name: 'Orbit', status: 'approved', purpose: 'The ring: segments, markers, labels, caret, mini glyph, the aside rows beside it.',
    rec: 'Keep: approved. Everything that shows progress, a timeline or a split must be the Orbit (see W-12, W-23). The legacy `.b-oring*` markup is the starting point for `src/ui/orbit`.' },
  { id: 'W-03', key: 'cube', name: 'Cube', status: 'approved', purpose: 'The 3D cube canvas and its stage/frame containers.',
    rec: 'Keep: approved. One canvas per page. The six different stage/frame containers around it (hero-stage, cube-stage, studio-stage, ...) become one Cube size/frame API.' },
  { id: 'W-04', key: 'buttons', name: 'Buttons', status: 'proposed', purpose: 'Actions: primary, secondary, text/ghost, icon, dismiss.',
    rec: 'Merge into one button with three emphases (primary, secondary, text) and an icon/close form; at most 3 actions per screen (ground rule 3). The classless buttons (reset, start, round presets) are the biggest source of drift.' },
  { id: 'W-05', key: 'chips', name: 'Chips and pills', status: 'proposed', purpose: 'Small pill-shaped selectable or tappable tokens (filters, markers, quick actions).',
    rec: 'Merge into one chip (the review marker chip `b-rev-chip` is closest to the A frames), selected/unselected states only.' },
  { id: 'W-06', key: 'segmented', name: 'Segmented controls', status: 'proposed', purpose: 'Pick one of 2-6 options in place.',
    rec: 'Merge into one segmented control (legacy `.segmented`, PLL `.pll-segmented`, brain `.b-opt`, timer `.tm-opt` all do the same job with 4 different looks).' },
  { id: 'W-07', key: 'toggles', name: 'Toggles and checkboxes', status: 'proposed', purpose: 'On/off settings: native checkboxes, labelled toggles, text-toggle chips.',
    rec: 'Merge into one switch (a pill switch with a label) and drop the native checkbox look and the `b-cfg` text toggles.' },
  { id: 'W-08', key: 'selects', name: 'Selects', status: 'proposed', purpose: 'Dropdown choice of one value.',
    rec: 'Merge into one select; replace short fixed lists (the 0.5x/1x/2x/4x speed select alone appears in four different styles) with the segmented control (W-06).' },
  { id: 'W-09', key: 'inputs', name: 'Text inputs', status: 'proposed', purpose: 'Free text, search, file, range and textarea fields.',
    rec: 'Merge into one text field (+ textarea, + file picker, + range); the input look differs on every page that has one.' },
  { id: 'W-10', key: 'cards', name: 'Cards and panels', status: 'proposed', purpose: 'Framed containers that group content.',
    rec: 'Merge into one panel (the Orbit look is mostly frameless: keep frames for lists and settings only). Alg case cards, gallery cards and progress cards are different looks for one idea.' },
  { id: 'W-11', key: 'rows', name: 'List rows', status: 'proposed', purpose: 'One item per line: drill hub rows, history rows, settings rows, case rows.',
    rec: 'Merge into one list row with an optional mini Orbit glyph at the left (feedback #2: browsing lists use the mini ring).' },
  { id: 'W-12', key: 'tables', name: 'Tables', status: 'proposed', purpose: 'Split tables, case tables and their heads.',
    rec: 'Remove the split table beside the Orbit (the Orbit labels carry it, feedback #1/#2); keep at most one plain table for case stats, built as list rows (W-11).' },
  { id: 'W-13', key: 'tabs', name: 'Tabs and sub-nav', status: 'proposed', purpose: 'Switch between views of one page; section sub-navigation.',
    rec: 'Merge into one sub-nav (underline tabs). Remove the brain page tab bar (it repeats the header nav).' },
  { id: 'W-14', key: 'drawers', name: 'Drawers and side panels', status: 'proposed', purpose: 'Slide-in panels (the debug drawer; the review detail panel).',
    rec: 'Keep one drawer (right side on desktop, bottom sheet on phone) shared by debug, settings and the review detail.' },
  { id: 'W-15', key: 'dialogs', name: 'Dialogs and sheets', status: 'proposed', purpose: 'Modal overlays: help dialog, lightbox.',
    rec: 'Merge into one dialog. The help dialog becomes the help page (feedback #12); the lightbox is dev-only.' },
  { id: 'W-16', key: 'status', name: 'Toasts and status lines', status: 'proposed', purpose: 'One-line feedback and hints: status text, hint lines, captions.',
    rec: 'Merge into one status line (and a toast for transient messages). There are about a dozen one-off hint/caption paragraphs.' },
  { id: 'W-17', key: 'keys', name: 'Key hints and keycaps', status: 'proposed', purpose: 'Keyboard shortcut hints.',
    rec: 'Merge into one keycap (kbd) and the one key bar from F0; the `kbd` looks differ in size, colour and radius per page.' },
  { id: 'W-18', key: 'badges', name: 'Badges and tags', status: 'proposed', purpose: 'Small non-interactive labels: status, tag, counts.',
    rec: 'Merge into one badge; separate from chips (W-05) by being non-interactive.' },
  { id: 'W-19', key: 'stats', name: 'Stat blocks and counters', status: 'proposed', purpose: 'A number with a label: metrics, counters, recent times, deltas.',
    rec: 'Merge into one stat block (value + label + optional delta).' },
  { id: 'W-20', key: 'coach', name: 'Coach line', status: 'proposed', purpose: 'The sentence that explains what happened, with the A-05 connector to its marker.',
    rec: 'Keep one coach line (A-05) and delete the card-style `b-rev-card`, `b-rev-note` and `b-coach` boxes.' },
  { id: 'W-21', key: 'moves', name: 'Scramble and move display', status: 'proposed', purpose: 'Move sequences: scramble, alg, recovery, move chips and counters.',
    rec: 'Merge into the one move strip (`mg-strip`, move-guide) used by the Orbit lookahead (feedback #4); remove the separate move chip rows.' },
  { id: 'W-22', key: 'timer', name: 'Timer display', status: 'proposed', purpose: 'Big running/stopped time readouts.',
    rec: 'Merge into one timer readout in three sizes (XL solve, L drill, M inline).' },
  { id: 'W-23', key: 'rounds', name: 'Round and progress panels', status: 'proposed', purpose: 'Round selection, in-round answer stages, progress bars and lines.',
    rec: 'Progress bars/lines are to-remove (feedback #1): the Orbit shows progress. Keep one round panel (quick-round) and one answer stage; the rest merge.' },
  { id: 'W-24', key: 'charts', name: 'Charts', status: 'proposed', purpose: 'SVG charts: TPS line, trend, graphs, sparkline.',
    rec: 'Keep at most the shared Orbit-style trend/line chart from F5; all one-off SVG charts are replaced.' },
  { id: 'W-25', key: 'empty', name: 'Empty states', status: 'proposed', purpose: 'What a list/chart/page shows with no data.',
    rec: 'Merge into one empty state (one sentence + one action).' },
  { id: 'W-26', key: 'links', name: 'Links and crumbs', status: 'proposed', purpose: 'Text links, back links, "see more >" links, breadcrumbs.',
    rec: 'Merge into one link style plus one back link; the eyebrow breadcrumbs (`drills / OLL`) become the header nav.' },
  { id: 'W-27', key: 'device', name: 'Device chip and menu', status: 'pending', purpose: 'The cube chip (name, battery, state) with its menu, and connect buttons.',
    rec: 'Keep one: the header cube chip with its menu (feedback #14). Remove every per-page connect button (the brain "connect cube", `b-connect`, the studio button).' },
  { id: 'W-28', key: 'choices', name: 'Answer and choice buttons', status: 'proposed', purpose: 'Pick the answer in a drill: colours, PLL cases, faces, move chips.',
    rec: 'Merge into one choice button (large pill with a keycap hint); colour, PLL and face pickers differ only by content.' },
  { id: 'W-29', key: 'disclosure', name: 'Disclosures (details/summary)', status: 'proposed', purpose: 'Collapsible sections: settings, data, advanced options.',
    rec: 'Merge into one disclosure row; most settings move to the drawer (W-14).' },
  { id: 'W-30', key: 'labels', name: 'Eyebrows, captions and section heads', status: 'proposed', purpose: 'Small uppercase labels and page/section head blocks.',
    rec: 'Merge into one eyebrow and one section head; there are at least 8 different eyebrow classes.' },
  { id: 'W-31', key: 'footer', name: 'Footer', status: 'to-remove', purpose: 'The site footer and build badge.',
    rec: 'Remove (feedback #12); the build badge, "stays on this device" and links move to the help page.' },
  { id: 'W-99', key: 'other', name: 'Unclassified', status: 'proposed', purpose: 'Elements the crawler found that fit no family; review by hand.',
    rec: 'Review each: either fold into a family above or ignore as layout.' },
];


/** Variants that break a binding rule from SPEC-FLEET (matched on the variant's primary class). */
export const VIOLATIONS = [
  { re: /^(b-ch-bar|b-ch-bar-fill|b-ch-bar-spark|pll-mini-track|progress-day|progress-track|progress-fill|b-progress)$/, rule: '#1', text: 'a progress bar/line: progress is only shown with the Orbit' },
  { re: /^(footer(@.*)?|footer-dot|build-badge)$/, rule: '#12', text: 'the site footer / build badge: no footer; its content moves to the help page' },
  { re: /^(b-oring-aside|b-oring-row|b-ch-splits)$/, rule: '#1/#2', text: 'a split table beside/duplicating the Orbit: the Orbit labels carry the splits' },
  { re: /^(b-start-alt|b-connect|connect-cube)$/, rule: '#14', text: 'a per-page connect button: the header cube chip is the one connection control' },
  { re: /^(b-top|b-tabs|b-tab|b-tab-brain|b-tab-timer|b-tab-history)$/, rule: '#17', text: 'an in-page nav duplicating the header nav' },
  { re: /^(b-oinsp)$/, rule: '#1/#7', text: 'a one-off ring (inspection dial): rings are the Orbit' },
  { re: /^(b-ch-tps)$/, rule: 'rule 3', text: 'a one-off chart: charts come from the shared chart (F5)' },
  { re: /^(tm-pad)$/, rule: 'rule 3', text: 'a one-off timer pad panel with its own progress dial and zones' },
];

const STATE_CLASS = /^(is-|active$|current$|done$|wrong$|danger$|color-|has-|lb-nav$|lb-prev$|lb-next$|g-status-|selected$|open$|disabled$|loading$)/;
const IGNORE = /^(brain|brain-test|cs-host|cs-page|lookahead-page|progress-page|tm|answer-grid|g-chips|cp-faces|pll-answer-grid|hub-page-links|not-found-links|b-settings-sections|training-settings-body|f2l-footer-actions|cs-head-actions)$/;

/** Parent context for classless elements, from the crawler's selector path. */
function parentOf(rec) {
  const parts = rec.path.split(' > ');
  const parent = parts.length > 1 ? parts[parts.length - 2] : '';
  const m = parent.match(/\.([a-z0-9_-]+)/i);
  return m ? m[1] : parent.replace(/#/, '') || rec.view;
}

export function primary(rec) {
  const c = rec.classes.find(x => !STATE_CLASS.test(x));
  if (c) return c;
  return `${rec.tag}@${parentOf(rec)}`;
}

/** Ordered family rules; first match wins. */
export function classify(rec) {
  const p = primary(rec);
  const cls = rec.classes;
  const has = re => cls.some(c => re.test(c));
  const tag = rec.tag;
  const isBtn = tag === 'button' || rec.role === 'button';
  const text = rec.text.toLowerCase();
  const border = parseFloat(rec.style.borderTopWidth) > 0;
  const filled = rec.style.backgroundColor !== 'rgba(0, 0, 0, 0)';

  if (IGNORE.test(p)) return 'ignore';
  if (has(/^b-oring|^b-slot|^b-mk$/) || (tag === 'svg' && has(/^b-oring/))) return has(/^b-oring-(aside|row)/) ? 'tables' : 'orbit';
  if (tag === 'canvas' || has(/(^|-)cube(-|$)|hero-stage|cube-stage|studio-stage|^sr-cube$/) && !has(/caption/)) return 'cube';
  if (has(/^(site-header|brand|main-nav|nav-link|header-button|header-actions|theme-moon|theme-sun|help-button|theme-button)$/)) return 'header';
  if (tag === 'footer' || has(/^(footer|footer-dot|build-badge)$/)) return 'footer';
  if (has(/^b-debug$/)) return 'drawers';
  if (tag === 'dialog' || rec.role === 'dialog' || has(/^(help-dialog|dialog-close|lb-root|lb-btn|lb-hint)$/)) return 'dialogs';
  if (has(/^b-device|^brain-connect-chip$/) || (isBtn && /^(connect|connecting|retry connection|sync)\b/.test(text) && !has(/segment/)) || has(/^(b-connect|b-start-alt)$/)) return 'device';
  if (tag === 'kbd' || has(/^(hub-key|lb-hint|b-key)$/)) return 'keys';
  if (rec.role === 'tablist' || rec.role === 'tab' || has(/^(b-tabs?|b-tab-.*|b-top|g-tabs|alg-set-tabs|studio-tabs)$/) || (/alg-set-tabs/.test(rec.path) && tag === 'a')) return 'tabs';
  if (has(/^(segmented|segment|pll-segmented|pll-segment|b-opt|tm-opt)$/)) return 'segmented';
  if ((tag === 'input' && ['checkbox', 'radio'].includes(rec.type)) || has(/^(learning-toggle|brain-toggle|b-check|sr-toggle|pll-check|planner-shift|g-cmp|b-cfg|b-configbar.*|scan-duration)$/)) return 'toggles';
  if (tag === 'select' || has(/^(exposure-picker|pll-select-label|pll-control-group|b-results-source)$/)) return 'selects';
  if (tag === 'input' || tag === 'textarea' || has(/^(g-search|history-file)$/) || (tag === 'label' && /^(piece|solve source|type)/.test(text))) return 'inputs';
  if (has(/^(b-ch-split-label|b-ch-splits)$/)) return 'tables';
  if (has(/^b-oinsp-eyebrow$/)) return 'labels';
  if (has(/^(b-ch-bar.*|pll-mini-track|progress-day|progress-track|progress-fill|b-oinsp$|quick-round|round-panel|lookahead-session|answer-stage|pll-answer-stage|pll-feedback-row|pll-settings-card)$/)) return 'rounds';
  if (has(/^b-rev-chip/)) return 'chips';
  if (has(/^alg-case-card/)) return 'cards';
  if (has(/^(g-copy|g-refresh)$/)) return 'buttons';
  if (has(/^sr-position-note$/)) return 'status';
  if (!cls.length && isBtn && /^[UDLRFBMESxyz][′'2]?$/.test(rec.text)) return 'choices';
  if (tag === 'label' && /^speed/.test(text)) return 'selects';
  if (tag === 'label') return /link|^type/.test(text) ? 'inputs' : 'selects';
  if (has(/^(timer|pll-timer|alg-drill__timer|timer-label|pll-timer-label|tm-pad|tm-consequence)$/)) return 'timer';
  if (has(/^(mg-.*|b-moves|b-recovery-moves|history-scramble|history-move|sr-scramble|b-rev-dmoves|b-scramble-head|b-rev-mv|sr-moment|b-recovery-cue)$/) || (tag === 'i' && rec.role === 'listitem') || (rec.role === 'status' && /^\d+ \/ \d+$/.test(rec.text))) return 'moves';
  if (has(/^(b-coach.*|b-rev-note|b-rev-card|b-rev-dcmp.*|b-rev-detail|b-rev-dtitle)$/)) return has(/^b-rev-detail$/) ? 'drawers' : 'coach';
  if (tag === 'svg' || rec.role === 'img' && tag !== 'div' || has(/^(trend-chart|rp-trend-chart|sr-graph|g-graph|rp-trend|b-ch-tps|trend-card)$/)) return 'charts';
  if (has(/empty|^not-found/)) return 'empty';
  if (has(/^history-detail$/) && /select a solve/i.test(rec.text)) return 'empty';
  if (rec.role === 'status' || has(/^(history-status|sr-retry-status|b-idle-status|b-settings-caption|g-note|timing-note|cube-caption|rp-note|rp-trend-note|rp-trend-readout|progress-caption|cp-hint|oll-hint|lookahead-hint|lookahead-prompt)$/)) return 'status';
  if (has(/^(g-status|b-rev-tag|b-rev-chip-cost|b-rev-chip-label|engine-badge|alg-case-card__count|alg-case-card__id|progress-due|g-tthumbs)$/)) return 'badges';
  if (has(/^(metric-card|retention-panel|progress-card|b-ores-moves|b-ores-recent-item|b-ores-vs-head|tm-stat-empty|b-ores-eyebrow)$/) || (tag === 'dd')) return 'stats';
  if (has(/^(b-rev-chip|b-rev-open|b-rev-pin|b-rev-variant|b-rev-close|sr-label|g-chip|g-copy|g-refresh|rp-entry-toggle)$/)) return 'chips';
  if (has(/^(answer-button|pll-answer|cp-face)$/)) return 'choices';
  if (has(/^(hub-row|hub-link|hub-list-head|pll-case-row|rp-row|pll-case-head|case-table-head|case-table-card|b-row-label|b-row-help|history-list|progress-drill-name)$/) || (isBtn && /history-list/.test(rec.path))) return /table/.test(p) || /case-head|case-row/.test(p) ? 'tables' : 'rows';
  if (has(/^(alg-case-card.*|g-group|g-card|g-thumb|hub-continue|pll-case-card|studio-panel|sr-moves|history-detail|alg-add-own|selected-piece-card)$/)) return has(/^alg-add-own$/) ? 'disclosure' : 'cards';
  if (tag === 'details' || tag === 'summary' || has(/^(training-settings|pll-settings|brain-pill-setup|brain-advanced-scramble|history-data|rp-time-breakdown)$/)) return 'disclosure';
  if (has(/^(alg-eyebrow|cs-eyebrow|g-eyebrow|hub-eyebrow|eyebrow|b-oinsp-eyebrow|b-rev-eyebrow|b-rev-head|cs-head.*|alg-browser__head|alg-detail__head|sr-head|alg-browser__scope|b-rev-head|case-meta)$/) || (tag === 'header' && !has(/site-header/)) || tag === 'h1' || tag === 'h2') return 'labels';
  if (tag === 'a') {
    if (has(/^(sr-back|progress-link|progress-drill-name)$/) || (!border && !filled)) return 'links';
    return 'buttons';
  }
  if (isBtn || has(/^(primary-button|text-button|b-textbtn|b-btn|b-start|skip-button|pll-skip|pll-text-button|new-case-button|tm-textbtn|sr-primary|sr-secondary)$/)) return 'buttons';
  if (has(/^(b-key)$/)) return 'keys';
  return 'other';
}

const letters = n => { let s = ''; n += 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(97 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const isDev = route => route.startsWith('#/dev/');
const baseRoute = route => route.replace(/\?.*$/, '');

export async function build({ root, RAW, slug }) {
  const data = JSON.parse(fs.readFileSync(`${RAW}/instances.json`, 'utf8'));
  // 1. signatures
  const sigs = new Map();
  for (const i of data.instances) {
    let s = sigs.get(i.sig);
    if (!s) { s = { sig: i.sig, rec: i, count: 0, routes: new Set(), states: new Map(), viewports: new Set(), shot: '' }; sigs.set(i.sig, s); }
    s.count += i.count;
    s.routes.add(baseRoute(i.route)); s.viewports.add(i.viewport);
    const where = `${baseRoute(i.route)} [${i.state}]`;
    s.states.set(where, (s.states.get(where) || 0) + i.count);
    if (i.shot && !s.shot) s.shot = i.shot;
  }
  // 2. classify, group into variants
  const variants = new Map();
  let ignored = 0;
  for (const s of sigs.values()) {
    const fam = classify(s.rec);
    if (fam === 'ignore') { ignored++; continue; }
    const prim = primary(s.rec);
    const key = `${fam}::${prim}`;
    let v = variants.get(key);
    if (!v) { v = { family: fam, primary: prim, sigs: [], count: 0, routes: new Set(), states: new Map(), sources: new Map(), texts: new Set(), tag: s.rec.tag, role: s.rec.role, viewports: new Set() }; variants.set(key, v); }
    v.sigs.push(s);
    v.count += s.count;
    s.routes.forEach(r => v.routes.add(r));
    s.viewports.forEach(x => v.viewports.add(x));
    for (const [w, n] of s.states) v.states.set(w, (v.states.get(w) || 0) + n);
    s.rec.sources.slice(0, 4).forEach((f, idx) => v.sources.set(f, (v.sources.get(f) || 0) + 4 - idx));
    for (const t of s.rec.samples.slice(0, 2)) if (v.texts.size < 3) v.texts.add(t);
  }
  // 2b. fold sub-parts into their component: `X-part` / `X__part` / `tag@X` merge into `X` when X is a variant of the same family
  const byFamily = new Map();
  for (const v of variants.values()) { if (!byFamily.has(v.family)) byFamily.set(v.family, new Map()); byFamily.get(v.family).set(v.primary, v); }
  for (const [, prims] of byFamily) {
    const names = [...prims.keys()].sort((a, b) => b.length - a.length);
    for (const name of names) {
      const v = prims.get(name);
      if (!v) continue;
      const parent = name.includes('@') ? name.split('@')[1] : null;
      let target = parent && prims.has(parent) && parent !== name ? parent : null;
      if (!target) {
        const cands = [...prims.keys()].filter(q => q !== name && !q.includes('@') && (name.startsWith(`${q}-`) || name.startsWith(`${q}__`)));
        cands.sort((a, b) => b.length - a.length);
        target = cands[0] || null;
      }
      if (!target) continue;
      const t = prims.get(target);
      t.sigs.push(...v.sigs); t.count += v.count;
      v.routes.forEach(r => t.routes.add(r)); v.viewports.forEach(x => t.viewports.add(x));
      for (const [w, n] of v.states) t.states.set(w, (t.states.get(w) || 0) + n);
      for (const [f, n] of v.sources) t.sources.set(f, (t.sources.get(f) || 0) + n);
      v.texts.forEach(x => t.texts.add(x));
      (t.parts ??= new Set()).add(name);
      v.parts?.forEach(x => t.parts.add(x));
      prims.delete(name);
      variants.delete(`${v.family}::${name}`);
    }
  }
  // 3. ids
  const picked = pickPostDir(root);
  POST_DIR = picked.dir;
  const outDir = path.join(root, POST_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  // Never delete or overwrite anything: a re-run lands in a new dated folder (see pickPostDir).
  const fams = FAMILIES.map(f => ({ ...f, variants: [] }));
  const famByKey = Object.fromEntries(fams.map(f => [f.key, f]));
  for (const v of variants.values()) famByKey[v.family].variants.push(v);
  const seenHash = new Map();
  let shotsWritten = 0;
  const copyShot = (s, name) => {
    if (!s.shot) return '';
    const from = `${RAW}/${s.shot}`;
    if (!fs.existsSync(from)) return '';
    const buf = fs.readFileSync(from);
    const h = crypto.createHash('sha1').update(buf).digest('hex');
    if (seenHash.has(h)) return seenHash.get(h);   // identical pixels: point at the first copy
    seenHash.set(h, name);
    fs.writeFileSync(path.join(outDir, name), buf);
    shotsWritten++;
    return name;
  };
  for (const f of fams) {
    f.variants.sort((a, b) => b.routes.size - a.routes.size || b.count - a.count || a.primary.localeCompare(b.primary));
    f.variants.forEach((v, idx) => {
      v.id = `${f.id}${letters(idx)}`;
      const allClasses = new Set(v.sigs.flatMap(x => x.rec.classes));
      v.violation = (f.key === 'device' && !/^(b-device|b-btn$)/.test(v.primary)) ? VIOLATIONS.find(x => x.rule === '#14') : VIOLATIONS.find(x => [...allClasses, v.primary, ...(v.parts || [])].some(c => x.re.test(c))) || null;
      const famSlug = f.key;
      const base = `${v.id}-${famSlug}-${slug(v.primary.replace('@', '-in-'))}`.slice(0, 80);
      const own = v.sigs.filter(x => primary(x.rec) === v.primary);
      const sorted = [...(own.length ? own : v.sigs)].sort((a, b) => (b.viewports.has('desktop') - a.viewports.has('desktop')) || b.count - a.count);
      const main = sorted.find(s => s.shot) || sorted[0];
      v.images = [];
      const img0 = copyShot(main, `${base}.png`);
      if (img0) v.images.push(img0);
      // extra shots: the most different style signatures (states, phone sizes)
      const look = s => [s.rec.style.backgroundColor, s.rec.style.color, s.rec.style.borderTopColor, s.rec.style.fontSize].join('|');
      const used = new Set([look(main)]);
      let extra = 0;
      for (const s of sorted) {
        if (extra >= 2 || s === main || !s.shot) continue;
        if (used.has(look(s))) continue;
        used.add(look(s));
        const n = copyShot(s, `${base}-${extra + 2}.png`);
        if (n && !v.images.includes(n)) { v.images.push(n); extra++; }
      }
      const main0 = main.rec;
      v.style = main0.style;
      v.rect = main0.rect;
      v.example = main0.text;
      v.selector = main0.path;
      v.styleVariants = v.sigs.length;
      v.partList = [...(v.parts || [])].sort();
    });
  }
  // 4. stats
  const appRoutes = new Set(), devRoutes = new Set();
  for (const s of sigs.values()) s.routes.forEach(r => (isDev(r) ? devRoutes : appRoutes).add(r));
  const stat = fams.map(f => {
    const routes = new Set(); const app = new Set();
    f.variants.forEach(v => v.routes.forEach(r => { routes.add(r); if (!isDev(r)) app.add(r); }));
    const flagged = f.variants.filter(v => v.violation).length;
    const dup = f.variants.length >= 2;
    return { id: f.id, name: f.name, status: f.status, variants: f.variants.length, pages: routes.size, appPages: app.size, instances: f.variants.reduce((a, v) => a + v.count, 0), flagged, duplicate: dup };
  });
  const summary = {
    crawledAt: data.crawledAt, viewports: data.viewports.map(v => `${v.width}x${v.height}`), appRoutes: [...appRoutes].sort(), devRoutes: [...devRoutes].sort(),
    distinctStyleSignatures: sigs.size, ignoredLayoutSignatures: ignored,
    families: stat.filter(s => s.id !== 'W-99' || s.variants).length, variants: variants.size,
    duplicateFamilies: stat.filter(s => s.duplicate && !['W-01', 'W-02', 'W-03'].includes(s.id)).length,
    redundantVariants: stat.filter(s => !['W-01', 'W-02', 'W-03', 'W-99'].includes(s.id)).reduce((a, s) => a + Math.max(0, s.variants - 1), 0),
    ruleViolationVariants: stat.reduce((a, s) => a + s.flagged, 0), screenshots: shotsWritten,
  };
  fs.writeFileSync(path.join(outDir, 'inventory.json'), JSON.stringify({
    summary, families: stat,
    variants: fams.flatMap(f => f.variants.map(v => ({
      id: v.id, family: f.id, primary: v.primary, tag: v.tag, role: v.role, instances: v.count, pages: [...v.routes].sort(), where: [...v.states].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w, n]) => `${w} x${n}`),
      includes: v.partList, sources: [...v.sources].sort((a, b) => b[1] - a[1]).map(([x]) => x), styleSignatures: v.styleVariants, selector: v.selector, example: v.example, style: v.style, size: v.rect, violation: v.violation, images: v.images,
    }))),
    crawlNotes: data.log,
  }, null, 1));
  // The first run writes the registry. A re-run writes a sibling file and a new post, and leaves
  // docs/design/WIDGETS.md (which carries hand-made status decisions) and every old image untouched.
  const registryFile = picked.fresh ? 'docs/design/WIDGETS.md' : `docs/design/WIDGETS-${path.basename(POST_DIR)}.md`;
  fs.writeFileSync(path.join(root, registryFile), registryMarkdown(fams, stat, summary));
  if (!picked.fresh && !fs.existsSync(path.join(outDir, 'post.md'))) {
    fs.writeFileSync(path.join(outDir, 'post.md'), [
      '---', `id: ${picked.id}`, `title: Widget inventory re-run (${path.basename(POST_DIR)})`, `date: ${new Date().toISOString().slice(0, 10)}`,
      'branch: widgets', `parent: ${picked.parent}`, 'status: exploring', 'author: widget-inventory script', 'decision: Generated by a re-run; compare with the parent post.', '---',
      `A re-run of the widget crawler: ${summary.families} families, ${summary.variants} variants. Earlier folders are untouched; the registry for this run is \`${registryFile}\`.`, ''].join('\n'));
  }
  console.log(JSON.stringify(summary, null, 1));
  console.table(stat.map(s => ({ id: s.id, name: s.name.slice(0, 30), variants: s.variants, pages: s.pages, flagged: s.flagged, instances: s.instances })));
}

const px = v => `${Math.round(parseFloat(v))}`;
function styleLine(s, rect) {
  const rad = parseFloat(s.borderTopLeftRadius);
  const border = parseFloat(s.borderTopWidth) > 0 ? `${px(s.borderTopWidth)}px ${s.borderTopStyle} ${s.borderTopColor.replace(/rgba?\((.*)\)/, '($1)')}` : 'none';
  return `${s.fontFamily} ${px(s.fontSize)}/${s.fontWeight}; text ${s.color}; bg ${s.backgroundColor === 'rgba(0, 0, 0, 0)' ? 'none' : s.backgroundColor}; border ${border}; radius ${rad > 40 ? 'pill' : px(rad)}; pad ${[s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(px).join(' ')}; ${rect.w}x${rect.h}`;
}
const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function registryMarkdown(fams, stat, summary) {
  const L = [];
  L.push('# Widget registry');
  L.push('');
  L.push(`Generated by \`node scripts/widget-inventory.mjs build\` from a crawl on ${summary.crawledAt.slice(0, 10)} of the running app: ${summary.appRoutes.length} app routes and ${summary.devRoutes.length} dev routes (plus their key states via the fake-cube harness), at 1440x900 and 390x844, Orbit dark. Source of truth for SPEC-FLEET feedback #19 (**only approved widgets**): builders use only \`approved\` widgets; anything else needs a proposal post (\`gallery/widgets/<date>-<name>/\`) and a marked placeholder until approved.`);
  L.push('');
  L.push(`Gallery post with every image: \`${POST_DIR}\` (http://localhost:5173/#/dev/gallery/${POST_DIR}). Raw data (selectors, computed styles, CSS sources, counts): \`${POST_DIR}/inventory.json\`.`);
  L.push('');
  L.push('Status values: `approved` (the user approved it), `pending` (partly approved), `proposed` (a consolidated design is still to be proposed, then approved), `to-remove` (breaks a binding rule; delete once its replacement exists). Individual variants that break a binding rule are flagged `to-remove` in their family table even when the family itself is `proposed`. **Only W-01 Header, W-02 Orbit and W-03 Cube are approved**; W-27 (the cube menu) is pending. The current implementation of every other family stays unchanged until its consolidated design is approved (no ad-hoc restyling).');
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push(`${summary.families} families, ${summary.variants} variants (by class and look), ${summary.distinctStyleSignatures} distinct style signatures seen, ${summary.redundantVariants} redundant variants (variants beyond the first in each non-approved family), ${summary.ruleViolationVariants} variants that violate a binding rule. "Pages" counts distinct routes the family appeared on (app routes; dev-only routes in brackets); ${summary.appRoutes.length} app routes were crawled.`);
  L.push('');
  L.push('| ID | Family | Status | Variants | Pages | Instances | Rule violations | Recommendation |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const s of stat) {
    if (s.id === 'W-99' && !s.variants) continue;
    const f = fams.find(x => x.id === s.id);
    const devOnly = s.pages - s.appPages;
    L.push(`| ${s.id} | ${esc(s.name)} | ${s.status} | ${s.variants} | ${s.appPages}${devOnly ? ` (+${devOnly} dev)` : ''} | ${s.instances} | ${s.flagged} | ${esc(f.rec.split('. ')[0].replace(/\.$/, ''))} |`);
  }
  L.push('');
  L.push('## How to read the variants');
  L.push('');
  L.push('A variant is one class (state classes such as `is-active` folded in; classless elements are keyed by tag and parent). "Looks" is how many distinct computed-style signatures it has across states and the two viewports. Sources are the CSS files whose rules match the element, most specific first. Images are named `<variant id>-<family>-<class>.png`; `-2`, `-3` are other states or sizes of the same variant. Flagged variants list the binding rule they break (numbers refer to the user feedback list in `docs/ideas/SPEC-FLEET.md`).');
  L.push('');
  for (const f of fams) {
    if (f.id === 'W-99' && !f.variants.length) continue;
    const s = stat.find(x => x.id === f.id);
    L.push(`## ${f.id} ${f.name}`);
    L.push('');
    L.push(`- **Status:** ${f.status}`);
    L.push(`- **Purpose:** ${f.purpose}`);
    L.push(`- **Found:** ${f.variants.length} variants, ${s.instances} instances, ${s.appPages} app pages${s.pages - s.appPages ? ` (+${s.pages - s.appPages} dev)` : ''}`);
    const lead = f.variants[0];
    L.push(`- **Recommendation:** ${f.rec}${f.variants.length > 1 && !['approved'].includes(f.status) ? ` Starting point: ${lead.id} (\`${lead.primary}\`, the most widely used).` : ''}`);
    L.push('');
    if (!f.variants.length) { L.push('_Nothing found._'); L.push(''); continue; }
    L.push('| Variant | Class / tag | Instances | Pages | Used in (route [state] x count) | Source CSS | Looks | Style | Flag | Images |');
    L.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const v of f.variants) {
      const where = [...v.states].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w, n]) => `${w} x${n}`).join('; ') + (v.states.size > 3 ? ` +${v.states.size - 3} more` : '');
      const src = [...v.sources].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([x]) => x.replace(/^src\//, '')).join(', ');
      const pages = [...v.routes].filter(r => !isDev(r)).length;
      const dev = v.routes.size - pages;
      const label = `${v.tag}${v.role ? `[${v.role}]` : ''} \`${v.primary}\`${v.example ? ` "${esc(v.example.slice(0, 28))}"` : ''}${v.partList.length ? ` (+ parts: ${v.partList.map(x => `\`${x}\``).join(' ')})` : ''}`;
      const flag = v.violation ? `**to-remove**, breaks ${v.violation.rule}: ${v.violation.text}` : '';
      L.push(`| ${v.id} | ${esc(label)} | ${v.count} | ${pages}${dev ? ` (+${dev} dev)` : ''} | ${esc(where)} | ${esc(src)} | ${v.styleVariants} | ${esc(styleLine(v.style, v.rect))} | ${esc(flag)} | ${v.images.map(i => `\`${i.replace(/\.png$/, '')}\``).join(' ')} |`);
    }
    L.push('');
  }
  L.push('## Crawl coverage');
  L.push('');
  L.push(`App routes: ${summary.appRoutes.map(r => `\`${r}\``).join(', ')}.`);
  L.push('');
  L.push(`Dev routes: ${summary.devRoutes.map(r => `\`${r}\``).join(', ')}.`);
  L.push('');
  L.push('States visited via the fake cube harness on `#/solve`: disconnected, connecting, connect failed, connected idle, device menu open, settings open, guided scramble (start, progress, wrong turn and its undo), inspection, solving, results, review detail, debug drawer (the `` ` `` key); help dialog on the main pages; timer idle/running/stopped; drills started and answered where a start control exists; history list, a selected past solve, a replay step and the data panel; the review page and its retry.');
  L.push('');
  return L.join('\n');
}
