// Orbit style visual checks through the real shell (src/brain/_gallery.html)
// with the Orbit dev fixtures; the inspection-variants grid uses the style's
// own harness (src/brain/styles/orbit/_dev.html). Structural assertions plus
// an attached screenshot per state, for Orbit dark and light, desktop and phone.
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from './helpers/coverage-test.js';

const HARNESS = '/src/brain/styles/orbit/_dev.html';
const GALLERY = '/src/brain/_gallery.html';
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

/** Bounding boxes of several selectors once every one is laid out (the page re-renders pieces as the cube settles). */
async function boxes(page, ...selectors) {
  let found = [];
  await expect.poll(async () => {
    found = await Promise.all(selectors.map(selector => page.locator(selector).boundingBox()));
    return found.every(Boolean);
  }, { message: `${selectors.join(', ')} are laid out` }).toBe(true);
  return found;
}

async function open(page, state, theme, size = 'desktop') {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize(SIZES[size]);
  if (state === 'variants') {
    await page.goto(`${HARNESS}?state=${state}&theme=${theme}`);
    await page.waitForFunction(() => document.documentElement.dataset.harness === 'ready');
  } else {
    const [style, fx] = state.includes(':') ? state.split(':') : ['orbit', state];
    await page.goto(`${GALLERY}?style=${style}&fx=${fx}&theme=${theme}`);
    await page.waitForSelector('html[data-gallery-ready]');
  }
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

async function attach(page, testInfo, name) {
  const body = await page.screenshot({ fullPage: true });
  if (name.startsWith('variants-')) { mkdirSync('test-results/orbit-variants', { recursive: true }); writeFileSync(`test-results/orbit-variants/${name}.png`, body); }
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

/** Pairs of visible ring labels whose on-screen boxes overlap. */
async function overlappingLabels(page, selector) {
  return page.evaluate(sel => {
    const boxes = [...document.querySelectorAll(sel)]
      .filter(el => el.closest('svg') && getComputedStyle(el.closest('svg')).display !== 'none')
      .map(el => ({ text: el.textContent, r: el.getBoundingClientRect() }))
      .filter(b => b.r.width > 0);
    const hits = boxes.length === 0 ? ['no visible labels measured'] : [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) hits.push(`${boxes[i].text} × ${boxes[j].text}`);
    }
    return hits;
  }, selector);
}

for (const theme of ['dark', 'light']) {
  test.describe(`orbit ${theme}`, () => {
    test('idle keeps all nine pace-weighted stages on the minimal Orbit', async ({ page }, testInfo) => {
      const errors = await open(page, 'idle', theme);
      await expect(page.locator('.orbit__segment')).toHaveCount(9);
      await expect(page.locator('.orbit__segment.is-current, .orbit__segment.is-done')).toHaveCount(0);
      const pace = await page.evaluate(() => window.gallery.vm.timeline.segments.map(segment => ({ weight: segment.weight, avg: segment.avgMs })));
      expect(pace.every(segment => segment.weight > 0 && segment.avg > 0)).toBe(true);
      expect(await overlappingLabels(page, '.orbit__label')).toEqual([]);
      await attach(page, testInfo, `idle-${theme}`);
      expect(errors).toEqual([]);
    });

    test('solving fills the current arc with done arcs behind it', async ({ page }, testInfo) => {
      const errors = await open(page, 'solving', theme);
      await expect(page.locator('.orbit__segment.is-done')).toHaveCount(3);
      await expect(page.locator('.orbit__segment.is-current')).toHaveCount(1);
      await expect(page.locator('.orbit__segment.is-current')).toHaveAttribute('data-key', 'pair3');
      expect(await page.locator('.orbit__segment.is-current .orbit__segment-fill').getAttribute('d')).toMatch(/^M /);
      await expect(page.locator('.orbit__current-dot')).toBeVisible();
      await expect(page.locator('.b-steptags')).toContainText('pseudo');
      await expect(page.locator('.orbit__label[data-label-for="cross"]')).toContainText('2.08');
      // The secondary split list was removed by F1; retain its live-time assertion on the VM.
      expect(await page.evaluate(async () => { const { frameState } = await import('/src/brain/view-model.js'); const vm = window.gallery.vm; return frameState(vm, vm.clock.startedAt + vm.clock.ms).currentSplitText; })).toBe('1.16');
      expect(await overlappingLabels(page, '.orbit__label')).toEqual([]);
      await attach(page, testInfo, `solving-${theme}`);
      expect(errors).toEqual([]);
    });

    test('a skipped step collapses to a spark', async ({ page }, testInfo) => {
      const errors = await open(page, 'skip', theme);
      await expect(page.locator('.orbit__segment.is-skipped')).toHaveCount(1);
      await expect(page.locator('.orbit__segment.is-skipped')).toHaveAttribute('data-key', 'eo');
      await expect(page.locator('.orbit__segment.is-skipped')).toHaveAttribute('aria-label', /eo.*skip/i);
      await attach(page, testInfo, `skip-${theme}`);
      expect(errors).toEqual([]);
    });

    test('inspection drains the shared ring with callout ticks', async ({ page }, testInfo) => {
      const errors = await open(page, 'inspection', theme);
      await expect(page.locator('.orbit__svg')).toHaveCount(1);
      expect(await page.locator('.orbit__segment[data-key="inspection"] .orbit__segment-fill').getAttribute('d')).toMatch(/^M /);
      const callouts = await page.evaluate(() => window.gallery.vm.inspection.ticks.filter(tick => tick.kind === 'callout'));
      expect(callouts).toHaveLength(2);
      expect(callouts.filter(tick => tick.passed)).toHaveLength(1);
      await expect(page.locator('.b-clock')).toContainText('7');
      await expect(page.locator('[data-marker-keys]')).not.toHaveCount(0);
      await attach(page, testInfo, `inspection-${theme}`);
      expect(errors).toEqual([]);
    });

    test('WCA overtime keeps the +2 and DNF sectors on the same ring', async ({ page }, testInfo) => {
      const errors = await open(page, 'overtime', theme);
      expect(await page.locator('.orbit__segment[data-key="plus2"] .orbit__segment-fill').getAttribute('d')).toMatch(/^M /);
      await expect(page.locator('.orbit__segment[data-key="plus2"]')).toHaveClass(/is-wrong/);
      await expect(page.locator('.orbit__segment[data-key="dnf"]')).toHaveCount(1);
      await expect(page.locator('.b-clock')).toContainText('+1');
      const inspection = await page.evaluate(() => window.gallery.vm.inspection);
      expect(inspection.penalty).toBe('+2');
      expect(inspection.limitMs + 2000 - inspection.elapsedMs).toBe(1200);
      await expect(page.locator('.orbit__label[data-label-for="plus2"]')).toContainText('+2');
      await attach(page, testInfo, `overtime-${theme}`);
      expect(errors).toEqual([]);
    });

    test('every inspection variant renders', async ({ page }, testInfo) => {
      const errors = await open(page, 'variants', theme);
      await expect(page.locator('.h-variants')).toBeVisible();
      await expect(page.locator('.h-variant')).toHaveCount(8);
      await expect(page.locator('.h-variant .orbit__svg')).toHaveCount(8);
      await expect(page.locator('.h-variant[data-mode="unlimited"] [data-key="elapsed"]')).toHaveCount(1);
      await expect(page.locator('.h-variant[data-mode="off"] [data-key="elapsed"]')).toHaveCount(1);
      await expect(page.locator('.h-variant[data-overtime="count"] [data-key="count"]')).toHaveCount(1);
      const countTicks = await page.locator('.h-variant[data-overtime="count"] [data-marker-keys]').evaluateAll(nodes => nodes.flatMap(node => JSON.parse(node.dataset.markerKeys)).filter(key => key.includes('-count-')));
      expect(countTicks).toHaveLength(3);
      await expect(page.locator('.h-variant [data-key="grace"]')).toHaveCount(1);
      await attach(page, testInfo, `variants-${theme}`);
      expect(errors).toEqual([]);
    });

    test('results keep one cube and all review moments inside the finished Orbit', async ({ page }, testInfo) => {
      const errors = await open(page, 'results', theme);
      await expect(page.locator('.f1-results')).toBeVisible();
      await expect(page.locator('.f1-results__number')).toHaveText('14.07');
      await expect(page.locator('.orbit__segment:is(.is-done, .is-good, .is-bad)')).toHaveCount(8);   // coloured by the plan delta on the results
      await expect(page.locator('.orbit__segment.is-skipped')).toHaveCount(1);
      await expect(page.locator('canvas')).toHaveCount(1);
      const [cube, ring] = await boxes(page, '#brain-cube', '.orbit__svg');
      expect(cube.width, 'the cube keeps a real size').toBeGreaterThan(200);
      expect(cube.x + cube.width / 2).toBeCloseTo(ring.x + ring.width / 2, 0);
      await expect(page.locator('.f1-results__coach .ui-coach-line__text')).toHaveCount(1);
      const keys = await page.locator('[data-marker-keys]').evaluateAll(nodes => nodes.flatMap(node => JSON.parse(node.dataset.markerKeys)).sort());
      const results = await page.evaluate(() => window.gallery.vm.results);
      expect(keys).toEqual(results.review.markers.map(marker => marker.id).sort());
      expect(results.splits).toHaveLength(9);
      expect(results.recent).toHaveLength(7);
      // F1 explicitly removes the duplicate TPS/splits/session widgets from this screen.
      await expect(page.locator('.b-ch-tps, .b-ch-split, .b-ores-recent-item')).toHaveCount(0);
      await attach(page, testInfo, `results-${theme}`);
      expect(errors).toEqual([]);
    });

    test('phone layout keeps ring labels apart and fits the width', async ({ page }, testInfo) => {
      for (const state of ['solving', 'inspection', 'results']) {
        const errors = await open(page, state, theme, 'phone');
        if (state === 'solving') expect(await overlappingLabels(page, '.orbit__label')).toEqual([]);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${state} fits a 390 px screen`).toBeLessThanOrEqual(1);
        await attach(page, testInfo, `phone-${state}-${theme}`);
        expect(errors).toEqual([]);
      }
    });
  });
}

test('the two modes resolve different tokens', async ({ page }) => {
  const bg = {};
  for (const theme of ['dark', 'light']) {
    await open(page, 'idle', theme);
    bg[theme] = await page.locator('.brain').evaluate(el => getComputedStyle(el).backgroundColor);
  }
  expect(bg.dark).toBe('rgb(20, 19, 17)');
  expect(bg.light).toBe('rgb(243, 240, 232)');
});

test('the shared charts render in their Mono variants, with a small cube beside them', async ({ page }) => {
  const errors = await open(page, 'mono:results', 'dark');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.b-slot-timeline')).toBeVisible();
  await expect(page.locator('.m-mk')).toHaveCount(5);
  const [cube, stats] = await Promise.all([page.locator('#brain-cube').boundingBox(), page.locator('.m-res').boundingBox()]);
  expect(cube.width).toBeGreaterThan(150);
  expect(cube.x + cube.width).toBeLessThanOrEqual(stats.x + 1);
  await expect(page.locator('.b-ch-tps.is-mono .b-ch-line')).toHaveCount(1);
  await expect(page.locator('.b-ch-tps.is-mono .b-ch-area')).toHaveCount(0);
  await expect(page.locator('.b-ch-splits.is-columns .b-ch-split')).toHaveCount(9);
  await expect(page.locator('.m-tl-review-hint')).toHaveText('Select a marker to read its note');
  expect(errors).toEqual([]);
});

// One test per style x theme x size cell (they were one 8-cell loop): the cells are independent, so they run in parallel.
for (const style of ['orbit', 'mono']) for (const theme of ['dark', 'light']) for (const size of ['desktop', 'phone']) {
  test(`results layout matrix: cube stays below the header on desktop and stacks on phones: ${style} / ${theme} / ${size}`, async ({ page }, testInfo) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const out = 'test-results/r4-results-layout';
    fs.mkdirSync(out, { recursive: true });
    const errors = await open(page, `${style}:results`, theme, size);
    const suffix = size === 'phone' ? '390' : '1280';
    const name = `${style}-${theme}-${suffix}`;
    await expect(page.locator('canvas')).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, `${name} has no horizontal overflow`).toBeLessThanOrEqual(1);
    // The Orbit style's wrappers are display: contents (everything is placed on the frames' canvas), so the cube wrap is the box.
    const stage = page.locator('.b-cube-wrap');
    const [initial] = await boxes(page, '.b-cube-wrap');
    expect(initial.y, `${name} starts below the top of the page`).toBeGreaterThanOrEqual(0);
    if (style === 'orbit') {
      await expect(page.locator('.orbit__segment')).toHaveCount(9);
      // The cube is centred on the Orbit, and the stage ends inside the screen.
      const [cube, ring] = await boxes(page, '#brain-cube', '.orbit__svg');
      expect(cube.x + cube.width / 2).toBeCloseTo(ring.x + ring.width / 2, 0);
      expect(cube.y + cube.height / 2).toBeCloseTo(ring.y + ring.height / 2, 0);
      expect(initial.y + initial.height).toBeLessThanOrEqual(SIZES[size].height + 1);
    } else if (size === 'phone') {
      expect(await stage.evaluate(el => getComputedStyle(el).position)).not.toBe('sticky');
    } else {
      await expect(stage).toHaveCSS('position', 'sticky');
      await page.evaluate(() => window.scrollTo(0, 280));
      const box = await stage.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(55);
      expect(Math.abs(box.y - (56 + (SIZES[size].height - 56 - 240) / 2))).toBeLessThan(24);
    }
    const screenshot = path.join(out, `${name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(name, { path: screenshot, contentType: 'image/png' });
    expect(errors, `${name} browser errors`).toEqual([]);
  });
}

// F1 removes the duplicate split list; the Orbit must keep every stage reachable.
test('Orbit results retain all stage summaries at both desktop heights', async ({ page }) => {
  for (const height of [900, 650]) {
    await open(page, 'orbit:results', 'dark');
    await page.setViewportSize({ width: 1280, height });
    for (const scroll of [0, 280, 500, 800, 2000]) {
      await page.evaluate(y => window.scrollTo(0, y), scroll);
      await expect(page.locator('[data-segment]')).toHaveCount(9);
      await expect(page.locator('.f1-results__time')).toBeVisible();
      const cube = await page.locator('#brain-cube').boundingBox();
      expect(cube.y).toBeGreaterThanOrEqual(-1);
      expect(cube.y + cube.height).toBeLessThanOrEqual(height + 1);
    }
    await expect(page.locator('[data-slot="timeline-aside"]')).toBeHidden();
    await expect(page.locator('canvas')).toHaveCount(1);
  }
});
