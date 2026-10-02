// F16 widget inventory crawler. Audit only: it never changes the app.
//
//   node scripts/widget-inventory.mjs crawl [baseUrl]   crawl every route x state x viewport (Orbit dark)
//   node scripts/widget-inventory.mjs build             classify, assign W-ids, write the gallery + WIDGETS.md
//
// `crawl` needs a running dev server (default http://127.0.0.1:5172) and writes the raw catalogue and
// one element screenshot per distinct visual variant into WIDGET_RAW (default /tmp/widget-inventory-raw).
// `build` reads that, groups the variants into families (scripts/widget-families.mjs), names the images
// with their variant ids, and writes gallery/widgets/<date>-inventory/{inventory.json,*.png} and
// docs/design/WIDGETS.md. Re-run `build` after tuning the families; no need to crawl again.
//
// Candidates: buttons, links, inputs/selects/checkboxes, ARIA widgets, details/summary/dialog, kbd, svg
// and canvas, plus any element whose class name suggests a widget (chip, pill, card, panel, row, ...).
// A visual variant is the pair (tag + class list, style signature); the first instance is screenshotted.
/* global document, window, getComputedStyle, CSSStyleRule, CSSGroupingRule, CSSImportRule */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { GOLD } from '../tests/analysis-golden.mjs';
import { mountTestBrain } from '../tests/helpers/fake-brain.js';

const root = fileURLToPath(new URL('..', import.meta.url));
export const RAW = process.env.WIDGET_RAW || '/tmp/widget-inventory-raw';
const VIEWPORTS = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }];

// ---------------------------------------------------------------- in-page collector
/** Runs in the page. Returns grouped candidates; tags the first element of each unseen variant. */
function collectInPage({ known, step }) {
  const TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'DIALOG', 'DETAILS', 'TABLE', 'KBD', 'PROGRESS', 'METER', 'CANVAS', 'LABEL', 'A', 'FOOTER', 'HEADER', 'NAV', 'TH']);
  const ROLES = new Set(['tab', 'tablist', 'switch', 'dialog', 'menu', 'menuitem', 'tooltip', 'status', 'button', 'checkbox', 'radio', 'listbox', 'option', 'alert', 'progressbar', 'group', 'radiogroup', 'img', 'table', 'row', 'list', 'listitem']);
  const CLASS_RE = /(chip|pill|badge|card|panel|row|list|table|drawer|sheet|toast|kbd|key|hint|stat|counter|coach|scramble|timer|round|progress|chart|empty|tag|seg|toggle|tab|menu|dialog|status|metric|crumb|banner|note|btn|button|nav|brand|footer|header|ring|glyph|marker|\bmk\b|caret|lane|track|fill|answer|swatch|sparkline|trend|sequence|move|bar|field|picker|input|select|link|cta|action|eyebrow|summary|detail|caption|legend|grid|tile|cell|item|section|head)/i;
  const STYLE_KEYS = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'color', 'backgroundColor', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderBottomWidth', 'borderBottomColor', 'borderTopLeftRadius', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'height', 'width', 'boxShadow', 'display', 'cursor'];
  const CONTROL = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'A', 'KBD']);

  const seenRoots = new Set();
  const out = new Map();
  let nextShot = 0;
  const tagged = [];

  const rect = el => el.getBoundingClientRect();
  const visible = el => {
    const r = rect(el);
    if (r.width < 4 || r.height < 4) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.display === 'none' || ps.visibility === 'hidden') return false;
      if (p.tagName === 'DETAILS' && !p.open && !(el.tagName === 'SUMMARY' && el.parentElement === p)) return false;
    }
    return true;
  };
  const classes = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
  const pathOf = el => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4 && n !== document.body; n = n.parentElement) {
      if (n.id) { parts.unshift(`#${n.id}`); break; }
      const c = classes(n).slice(0, 2).map(x => `.${x}`).join('');
      parts.unshift(`${n.tagName.toLowerCase()}${c}`);
    }
    return parts.join(' > ');
  };
  const viewOf = el => {
    const v = el.closest('[id$="-view"], .brain, .site-header, footer, dialog, .history-page, .solve-review-page, .alg-page');
    if (!v) return 'page';
    return v.id || (v.tagName === 'DIALOG' ? `dialog#${v.id}` : classes(v)[0] || v.tagName.toLowerCase());
  };

  // Flatten every style rule once, with the file it came from.
  const rules = [];
  const fileOf = sheet => {
    const n = sheet.ownerNode;
    const id = n?.getAttribute?.('data-vite-dev-id') || sheet.href || '';
    return id.replace(/^.*\/(src\/|node_modules\/)/, '$1').replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*$/, '');
  };
  const walk = (list, file) => {
    for (const r of list) {
      if (r instanceof CSSStyleRule) rules.push({ sel: r.selectorText, file });
      else if (r instanceof CSSImportRule) { try { walk(r.styleSheet.cssRules, fileOf(r.styleSheet) || file); } catch { /* cross-origin */ } }
      else if (r instanceof CSSGroupingRule) walk(r.cssRules, file);
    }
  };
  let rulesBuilt = false;
  const sourcesOf = el => {
    if (!rulesBuilt) {
      rulesBuilt = true;
      for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, fileOf(sheet)); } catch { /* ignore */ } }
    }
    const files = {};
    for (const r of rules) {
      const sel = r.sel.replace(/::?[a-z-]+(\([^)]*\))?/gi, m => (/^:(hover|focus|active|disabled|checked|focus-visible|not|is|where|has|first-child|last-child|nth-child|root)/.test(m) ? m : ''));
      try { if (el.matches(sel)) files[r.file || 'inline'] = (files[r.file || 'inline'] || 0) + 1; } catch { /* unsupported selector */ }
    }
    return Object.entries(files).sort((a, b) => b[1] - a[1]).map(([f]) => f);
  };

  const all = document.body.querySelectorAll('*');
  for (const el of all) {
    const tag = el.tagName;
    if (el.closest('svg') && tag !== 'svg') continue;   // an svg is one widget (chart, ring, glyph, icon)
    if (el.parentElement && el.parentElement.closest('canvas')) continue;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META' || tag === 'TITLE' || tag === 'HEAD') continue;
    const role = el.getAttribute('role') || '';
    const cls = classes(el);
    const clsHit = cls.some(c => CLASS_RE.test(c));
    const isCand = TAGS.has(tag) || tag === 'svg' || ROLES.has(role) || clsHit || el.hasAttribute('data-action');
    if (!isCand) continue;
    if (seenRoots.has(el)) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const r = rect(el);
    // A plain wrapper with no visual identity (no background, border, shadow, nor control tag) is layout, not a widget.
    const hasBox = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || ['borderTopWidth', 'borderBottomWidth', 'borderLeftWidth'].some(k => parseFloat(cs[k]) > 0) || cs.boxShadow !== 'none';
    const semantic = TAGS.has(tag) || tag === 'svg' || ROLES.has(role) || el.hasAttribute('data-action');
    const textual = el.children.length === 0 && el.textContent.trim().length > 0;
    if (!semantic && !hasBox && !textual) continue;
    if (tag === 'svg' && r.width < 4) continue;

    const style = {};
    for (const k of STYLE_KEYS) style[k] = cs[k];
    const ff = style.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const rnd = v => Math.round(parseFloat(v) / 2) * 2;
    const ctl = CONTROL.has(tag) || role === 'button' || role === 'tab';
    const sigParts = [tag, role, cls.join('.'), ff, rnd(style.fontSize), style.fontWeight, style.textTransform, style.color, style.backgroundColor,
      `${rnd(style.borderTopWidth)}${style.borderTopStyle}${style.borderTopColor}`, rnd(style.borderTopLeftRadius) > 40 ? 'pill' : rnd(style.borderTopLeftRadius),
      [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(rnd).join('/'), ctl ? rnd(style.height) : '', style.boxShadow === 'none' ? '' : 'sh'];
    const sig = sigParts.join('|');
    let rec = out.get(sig);
    const text = (el.getAttribute('aria-label') && !el.textContent.trim() ? `[aria] ${el.getAttribute('aria-label')}` : el.textContent.replace(/\s+/g, ' ').trim()).slice(0, 70);
    if (rec) {
      rec.count += 1;
      if (rec.samples.length < 4 && text && !rec.samples.includes(text)) rec.samples.push(text);
      continue;
    }
    rec = {
      sig, step, tag: tag.toLowerCase(), role, type: el.getAttribute('type') || '', classes: cls, text, samples: text ? [text] : [],
      path: pathOf(el), view: viewOf(el), count: 1, style: { ...style, fontFamily: ff },
      rect: { w: Math.round(r.width), h: Math.round(r.height) },
      attrs: { action: el.getAttribute('data-action') || '', expanded: el.getAttribute('aria-expanded') || '', pressed: el.getAttribute('aria-pressed') || '', disabled: el.disabled ? '1' : '', childCount: el.children.length },
      isNew: !known.includes(sig), shot: -1, sources: [],
    };
    if (rec.isNew) {
      rec.sources = sourcesOf(el);
      if (r.width <= 1400 && r.height <= 1400) { rec.shot = nextShot++; el.setAttribute('data-wi-shot', String(rec.shot)); tagged.push(el); }
    }
    out.set(sig, rec);
  }
  return { recs: [...out.values()], shots: nextShot, url: window.location.hash, tagged: tagged.length };
}

// ---------------------------------------------------------------- crawl
const slug = s => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

async function crawl(base) {
  fs.rmSync(RAW, { recursive: true, force: true });
  fs.mkdirSync(`${RAW}/shots`, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const known = new Set();
  const instances = [];     // one entry per (step, viewport, variant)
  const log = [];
  const t0 = Date.now();

  const records = [
    { at: 1700000000000, scramble: 'R U', solveMs: 12340, penalty: null, focus: 'speed', source: 'smart', solved: true, solveMoves: ["U'", "R'"], moveCount: 2 },
    { at: 1700000300000, scramble: 'F2', solveMs: 15000, penalty: '+2', focus: 'flow', source: 'manual', solved: true, solveMoves: [] },
    { at: 1700090000000, scramble: "R U R'", solveMs: 9800, penalty: null, focus: 'speed', source: 'smart', solved: true, solveMoves: ['R', "U'", "R'"], moveCount: 3 },
    { at: Date.now() - 4000, scramble: "L' U", solveMs: 11200, penalty: null, focus: 'speed', source: 'smart', solved: true, solveMoves: ['U', 'L'], moveCount: 2 },
  ];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, baseURL: base, reducedMotion: 'reduce' });
    await context.addInitScript(({ records }) => {
      if (!localStorage.getItem('wi-seeded')) {
        localStorage.setItem('wi-seeded', '1');
        localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records }));
        localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: 'orbit' }));
        localStorage.setItem('cubesight-theme', 'dark');
        localStorage.setItem('cubesight-progress-v2', JSON.stringify({ attempts: 42, correct: 31, history: [] }));
      }
    }, { records });

    /** Collect the page as it is now, screenshot each new variant. */
    const snap = async (page, route, state) => {
      await page.waitForTimeout(450);
      const step = `${route} · ${state}`;
      let res;
      try { res = await page.evaluate(collectInPage, { known: [...known], step }); } catch (e) { log.push(`collect failed at ${step} ${vp.name}: ${e.message}`); return; }
      for (const rec of res.recs) {
        let file = '';
        if (rec.isNew && rec.shot >= 0) {
          file = `shots/${hash(rec.sig)}.png`;
          const target = page.locator(`[data-wi-shot="${rec.shot}"]`).first();
          try { await target.screenshot({ path: `${RAW}/${file}`, timeout: 4000, animations: 'disabled' }); } catch {
            // Continuously animating elements never settle (Playwright waits for a stable box): clip the page instead.
            try {
              const box = await target.boundingBox({ timeout: 1500 });
              const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
              await page.screenshot({ path: `${RAW}/${file}`, fullPage: true, animations: 'allow', timeout: 6000, clip: { x: box.x + scroll.x, y: box.y + scroll.y, width: Math.min(box.width, 1400), height: Math.min(box.height, 1400) } });
            } catch (e) { file = ''; log.push(`shot failed ${step} ${rec.path}: ${e.message.split('\n')[0]}`); }
          }
        }
        if (rec.isNew) known.add(rec.sig);
        instances.push({ route, state, viewport: vp.name, ...rec, shot: file, firstSeen: rec.isNew });
      }
      await page.evaluate(() => document.querySelectorAll('[data-wi-shot]').forEach(n => n.removeAttribute('data-wi-shot')));
      console.log(`${vp.name} ${step}: ${res.recs.length} variants (${known.size} distinct so far)`);
    };

    /** Run one step on a fresh page; failures are logged, never fatal. */
    const step = async (name, fn) => {
      const page = await context.newPage();
      page.on('pageerror', e => log.push(`pageerror at ${name} ${vp.name}: ${e.message}`));
      try { await fn(page); } catch (e) { log.push(`step failed ${name} ${vp.name}: ${e.message.split('\n')[0]}`); }
      await page.close();
    };
    const visit = async (page, hashRoute, wait = 600) => { await page.goto(`/${hashRoute}`); await page.waitForTimeout(wait); };
    const tryClick = async (page, selector, opts = {}) => { try { await page.locator(selector).first().click({ timeout: 2500, ...opts }); await page.waitForTimeout(250); return true; } catch { return false; } };

    // ---- plain routes ----
    const plain = ['#/solve', '#/drills', '#/drills/corners', '#/drills/pll', '#/drills/f2l', '#/drills/scout', '#/drills/oll', '#/drills/lookahead',
      '#/algs', '#/algs/pll', '#/algs/oll', '#/algs/f2l', '#/timer', '#/progress', '#/history', '#/review/import', '#/dev/studio', '#/dev/gallery', '#/dev/gallery/blog',
      '#/dev/gallery/timeline', '#/dev/gallery/post/orbit-v3', '#/dev/gallery/docs/design/orbit-v3?img=A-05-results.png', '#/no-such-page'];
    for (const route of plain) {
      await step(route, async page => {
        await visit(page, route);
        await snap(page, route, 'default');
        // Generic second state: the first start-like control, to see the in-round panels.
        if (/drills\//.test(route) || route === '#/timer') {
          if (await tryClick(page, 'button:has-text("start"), button:has-text("Start"), [data-action="start-scan"]')) await snap(page, route, 'started');
          if (await tryClick(page, '.answer-button, [data-answer], #answers button')) { await snap(page, route, 'answered'); }
          if (route === '#/timer') {
            await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space'); await page.waitForTimeout(500);
            await snap(page, route, 'running');
            await page.keyboard.press('Space'); await page.waitForTimeout(500);
            await snap(page, route, 'stopped');
          }
        }
        if (route === '#/drills') { /* hub only */ }
        if (route === '#/solve') {
          await page.keyboard.press('`'); await page.waitForTimeout(500);
          await snap(page, route, 'debug-drawer-open');
        }
        // help dialog from the header "?" on every main page
        if (['#/drills/corners', '#/drills', '#/algs', '#/progress', '#/history', '#/timer', '#/solve'].includes(route)) {
          await page.keyboard.press('Escape');
          if (await tryClick(page, '[data-action="open-help"], button[aria-label="help"]')) { await snap(page, route, 'help-open'); }
        }
      });
    }

    // ---- algs case pages and the alg drill ----
    for (const route of ['#/algs/pll/T', '#/algs/oll/1', '#/algs/pll/Jb/drill', '#/algs/oll/2/drill']) {
      await step(route, async page => {
        await visit(page, route);
        await snap(page, route, 'default');
        if (route.endsWith('/drill')) {
          if (await tryClick(page, 'button:has-text("Start")')) { await snap(page, route, 'drill-started'); await page.waitForTimeout(300); if (await tryClick(page, 'button:has-text("Done")')) await snap(page, route, 'drill-result'); }
        }
      });
    }
    await step('#/algs/f2l (first case)', async page => {
      await visit(page, '#/algs/f2l');
      if (await tryClick(page, '.alg-case-card, [data-case], a[href*="#/algs/f2l/"]')) await snap(page, '#/algs/f2l/<case>', 'default');
    });

    // ---- history: a past solve, replay, review ----
    await step('#/history (detail)', async page => {
      await visit(page, '#/history');
      if (await tryClick(page, '.history-list button')) {
        await snap(page, '#/history', 'solve-selected');
        await tryClick(page, 'button[aria-label="Next move"], button:has-text("Next move")');
        await snap(page, '#/history', 'replay-step');
        await tryClick(page, '.history-data summary');
        await snap(page, '#/history', 'data-panel-open');
      }
    });
    await step('#/review/<at>', async page => {
      await visit(page, `#/review/${records[0].at}`, 1200);
      await snap(page, '#/review/<at>', 'default');
    });
    await step('#/review/<at>/retry', async page => {
      await visit(page, `#/review/${records[0].at}/retry`, 1000);
      await snap(page, '#/review/<at>/retry', 'default');
    });

    // ---- solve flow through the fake cube harness ----
    await step('#/solve connecting', async page => {
      await page.goto('/#/solve');
      await page.waitForSelector('#brain-view .brain', { state: 'attached' });
      await page.evaluate(async () => {
        const { createBrain } = await import('/src/brain.js');
        const { createSmartCubeSession } = await import('/src/smart-cube-session.js');
        const { logConnection } = await import('/src/smart-cube-diag.js');
        const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
        let observer;
        const connection = {
          deviceName: 'GAN test cube', protocol: { name: 'GAN Gen4' }, capabilities: { facelets: true },
          events$: { subscribe(value) { observer = value; return { unsubscribe() { observer = null; } }; } },
          async sendCommand() { queueMicrotask(() => observer?.next({ type: 'FACELETS', facelets: solved })); },
          async disconnect() {},
        };
        const control = { failNext: false, release: null };
        const gate = () => new Promise(resolve => { control.release = resolve; });
        const session = createSmartCubeSession(async ({ onStatus }) => {
          logConnection({ label: 'Starting connection…', kind: 'start' });
          await gate();
          onStatus('Watching for the cube’s advertisements…');
          await gate();
          logConnection({ label: 'Advertising did not expose the address — asking for one-time manual entry.', kind: 'fallback' });
          await gate();
          if (control.failNext) { control.failNext = false; throw new Error('GATT server busy'); }
          return connection;
        });
        window.testBrain = { session, control };
        const rootEl = document.querySelector('#brain-view');
        rootEl.replaceChildren();
        await createBrain(rootEl, session).ready;
      });
      await snap(page, '#/solve', 'disconnected-harness');
      await page.evaluate(() => { window.testBrain.control.failNext = true; });
      await tryClick(page, '#brain-view .b-start-alt');
      await snap(page, '#/solve', 'connecting');
      for (let i = 0; i < 3; i++) { await page.evaluate(() => window.testBrain.control.release?.()); await page.waitForTimeout(250); }
      await page.waitForTimeout(400);
      await snap(page, '#/solve', 'connect-failed');
    });

    await step('#/solve cube flow', async page => {
      const g = GOLD.normal;
      const brain = '#brain-view';
      await mountTestBrain(page, 'orbit', { route: true });
      await snap(page, '#/solve', 'connected-idle');
      // header chip menu, settings
      if (await tryClick(page, `${brain} .b-device-toggle`)) { await snap(page, '#/solve', 'device-menu-open'); await tryClick(page, `${brain} .b-device-toggle`); }
      if (await tryClick(page, `${brain} .brain-pill-setup > summary`)) {
        await page.evaluate(() => document.querySelectorAll('#brain-view .b-settings details').forEach(d => { d.open = true; }));
        await snap(page, '#/solve', 'settings-open');
        await page.fill('#brain-scramble', g.scramble).catch(() => {});
        await snap(page, '#/solve', 'settings-scramble-box');
        await tryClick(page, '#brain-start-custom');
      }
      await snap(page, '#/solve', 'scramble-start');
      const turns = moves => page.evaluate(s => window.testBrain.emitTurns(s), moves);
      const first = g.scramble.split(' ');
      await turns(first.slice(0, 6).join(' '));
      await snap(page, '#/solve', 'scramble-progress');
      await turns('L');                           // a wrong turn
      await snap(page, '#/solve', 'scramble-wrong-turn');
      await turns("L'");
      await turns(first.slice(6).join(' '));
      await page.locator(`${brain} #brain-phase-label`).filter({ hasText: 'inspection' }).waitFor({ timeout: 15000 });
      await snap(page, '#/solve', 'inspection');
      const mv = g.moves.split(' ');
      await page.evaluate(([s]) => window.testBrain.emitTimed(s, () => 90), [mv.slice(0, 14).join(' ')]);
      await snap(page, '#/solve', 'solving');
      await page.evaluate(([s]) => window.testBrain.emitTimed(s, i => (i === 3 ? 1500 : 70)), [mv.slice(14).join(' ')]);
      await page.locator(`${brain} #brain-phase-label`).filter({ hasText: 'solved' }).waitFor({ timeout: 30000 });
      await page.locator(`${brain} .b-rev-chip`).first().waitFor({ timeout: 30000 }).catch(() => {});
      await snap(page, '#/solve', 'results');
      if (await tryClick(page, `${brain} .b-rev-chip`)) { await snap(page, '#/solve', 'review-detail'); await page.keyboard.press('Escape'); }
      await page.keyboard.press('`'); await page.waitForTimeout(500);
      await snap(page, '#/solve', 'results+debug-drawer');
    });

    // ---- drills with the fake cube connected (drill pages react to the shared session) ----
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(`${RAW}/instances.json`, JSON.stringify({ crawledAt: new Date().toISOString(), base, viewports: VIEWPORTS, instances, log }, null, 1));
  console.log(`crawl done in ${Math.round((Date.now() - t0) / 1000)}s: ${instances.length} (step, viewport, variant) rows, ${known.size} distinct variants`);
  if (log.length) console.log(`${log.length} notes:\n${log.slice(0, 40).join('\n')}`);
}

const [,, cmd = 'crawl', arg] = process.argv;
if (cmd === 'crawl') await crawl(arg || 'http://127.0.0.1:5172');
else if (cmd === 'build') { const { build } = await import('./widget-families.mjs'); await build({ root, RAW, slug }); }
else { console.error('usage: widget-inventory.mjs crawl [baseUrl] | build'); process.exit(2); }
