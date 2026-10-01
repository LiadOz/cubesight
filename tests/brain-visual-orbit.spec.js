// Orbit style visual checks through the real shell (src/brain/_gallery.html)
// with the Orbit dev fixtures; the inspection-variants grid uses the style's
// own harness (src/brain/styles/orbit/_dev.html). Structural assertions plus
// an attached screenshot per state, for Orbit dark and light, desktop and phone.
import { expect, test } from 'playwright/test';

const HARNESS = '/src/brain/styles/orbit/_dev.html';
const GALLERY = '/src/brain/_gallery.html';
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

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
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}

/** Pairs of visible ring labels whose on-screen boxes overlap. */
async function overlappingLabels(page, selector) {
  return page.evaluate(sel => {
    const boxes = [...document.querySelectorAll(sel)]
      .filter(el => el.closest('svg') && getComputedStyle(el.closest('svg')).display !== 'none')
      .map(el => ({ text: el.textContent, r: el.getBoundingClientRect() }))
      .filter(b => b.r.width > 0);
    const hits = boxes.length < 9 ? [`only ${boxes.length} labels measured`] : [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) hits.push(`${boxes[i].text} × ${boxes[j].text}`);
    }
    return hits;
  }, selector);
}

for (const theme of ['dark', 'light']) {
  test.describe(`orbit ${theme}`, () => {
    test('idle shows the ghost pace map with ~avg labels', async ({ page }, testInfo) => {
      const errors = await open(page, 'idle', theme);
      await expect(page.locator('.b-oring')).toHaveClass(/is-ghost/);
      await expect(page.locator('.b-oring-seg')).toHaveCount(9);
      await expect(page.locator('.b-oring-seg.is-current, .b-oring-seg.is-done')).toHaveCount(0);
      await expect(page.locator('.b-oring-label').first()).toContainText('~');
      expect(await overlappingLabels(page, '.b-oring-label')).toEqual([]);
      await attach(page, testInfo, `idle-${theme}`);
      expect(errors).toEqual([]);
    });

    test('solving fills the current arc with done arcs behind it', async ({ page }, testInfo) => {
      const errors = await open(page, 'solving', theme);
      await expect(page.locator('.b-oring-seg.is-done')).toHaveCount(3);
      await expect(page.locator('.b-oring-seg.is-current')).toHaveCount(1);
      await expect(page.locator('.b-oring-seg.is-current')).toHaveAttribute('data-key', 'pair3');
      expect(await page.locator('.b-oring-seg.is-current .b-oring-live').getAttribute('d')).toMatch(/^M /);
      await expect(page.locator('.b-oring-dot')).not.toHaveClass(/is-hidden/);
      await expect(page.locator('.b-oring-seg.is-pseudo')).toHaveCount(1);
      await expect(page.locator('.b-oring-label.is-done').first()).toContainText('2.08');
      await expect(page.locator('.b-oring-aside .b-oring-row-value.is-current')).toHaveText('1.16');
      expect(await overlappingLabels(page, '.b-oring-label')).toEqual([]);
      await attach(page, testInfo, `solving-${theme}`);
      expect(errors).toEqual([]);
    });

    test('a skipped step collapses to a spark', async ({ page }, testInfo) => {
      const errors = await open(page, 'skip', theme);
      await expect(page.locator('.b-oring-seg.is-skipped')).toHaveCount(1);
      await expect(page.locator('.b-oring-seg.is-skipped')).toHaveAttribute('data-key', 'eo');
      await expect(page.locator('.b-oring-label.is-skipped')).toContainText('eo skip');
      await attach(page, testInfo, `skip-${theme}`);
      expect(errors).toEqual([]);
    });

    test('inspection drains the ring with callout ticks', async ({ page }, testInfo) => {
      const errors = await open(page, 'inspection', theme);
      await expect(page.locator('.b-oinsp')).not.toHaveClass(/is-hidden/);
      await expect(page.locator('.b-oring')).toHaveClass(/is-hidden/);
      expect(await page.locator('.b-oinsp-remaining').getAttribute('d')).toMatch(/^M /);
      await expect(page.locator('.b-oinsp-tick.is-callout')).toHaveCount(2);
      await expect(page.locator('.b-oinsp-tick.is-callout.is-passed')).toHaveCount(1);
      await expect(page.locator('.b-oinsp-num')).toHaveText('7');
      await expect(page.locator('.b-oinsp-callout-text')).toHaveText('“8 seconds”');
      await attach(page, testInfo, `inspection-${theme}`);
      expect(errors).toEqual([]);
    });

    test('WCA overtime shows the +2 zone, the DNF sector and the meter', async ({ page }, testInfo) => {
      const errors = await open(page, 'overtime', theme);
      await expect(page.locator('.b-oinsp')).toHaveClass(/is-over/);
      expect(await page.locator('.b-oinsp-over').getAttribute('d')).toMatch(/^M /);
      expect(await page.locator('.b-oinsp-zone.is-plus2 .b-oinsp-zone-arc').getAttribute('d')).toMatch(/^M /);
      await expect(page.locator('.b-oinsp-zone.is-dnf')).toHaveCount(1);
      await expect(page.locator('.b-oinsp-num')).toHaveText('+1');
      await expect(page.locator('.b-oinsp-penalty-now')).toHaveText('+2');
      await expect(page.locator('.b-oinsp-penalty-next')).toHaveText('DNF in 1.2 s');
      // The +2 zone label sits by 12 o'clock (top half), not at the bottom.
      const label = await page.locator('.b-oinsp-zone.is-plus2 .b-oinsp-zone-label').boundingBox();
      const ring = await page.locator('.b-oinsp').boundingBox();
      expect(label.y).toBeLessThan(ring.y + ring.height / 2);
      await attach(page, testInfo, `overtime-${theme}`);
      expect(errors).toEqual([]);
    });

    test('every inspection variant renders', async ({ page }, testInfo) => {
      const errors = await open(page, 'variants', theme);
      await expect(page.locator('.h-variants')).toBeVisible();
      await expect(page.locator('.h-variant')).toHaveCount(8);
      await expect(page.locator('.b-oinsp.is-unlimited')).toHaveCount(1);
      await expect(page.locator('.b-oinsp.is-off')).toHaveCount(1);
      await expect(page.locator('.b-oinsp-tick.is-count')).toHaveCount(3);
      await expect(page.locator('.b-oinsp-zone.is-grace')).toHaveCount(1);
      await attach(page, testInfo, `variants-${theme}`);
      expect(errors).toEqual([]);
    });

    test('results keep the cube inside its finished ring beside the time, chart, splits and session', async ({ page }, testInfo) => {
      const errors = await open(page, 'results', theme);
      await expect(page.locator('.b-ores')).not.toHaveClass(/is-hidden/);
      await expect(page.locator('.b-ores-num')).toHaveText('14.07');
      expect(await page.locator('.b-ch-tps .b-ch-line').getAttribute('d')).toMatch(/^M /);
      // The stage stays: one live cube inside the finished ring (the donut), left of the stats.
      await expect(page.locator('.b-oring')).not.toHaveClass(/is-hidden/);
      await expect(page.locator('.b-oring-seg.is-done')).toHaveCount(8);
      await expect(page.locator('.b-oring-seg.is-skipped')).toHaveCount(1);
      await expect(page.locator('canvas')).toHaveCount(1);
      const [cube, stats] = await Promise.all([page.locator('#brain-cube').boundingBox(), page.locator('.b-ores').boundingBox()]);
      expect(cube.width, 'the cube keeps a real size').toBeGreaterThan(200);
      expect(cube.x + cube.width).toBeLessThanOrEqual(stats.x + 1);
      await expect(page.locator('.b-ch-split')).toHaveCount(9);
      await expect(page.locator('.b-ores-recent-item')).toHaveCount(7);
      // The coach is one card with the selected marker's note, and the markers sit on the ring and the chart.
      await expect(page.locator('.b-rev-note')).toHaveCount(1);
      await expect(page.locator('.b-rev-chip')).toHaveCount(5);
      await expect(page.locator('.b-oring-markers .b-mk')).toHaveCount(5);
      await expect(page.locator('.b-ch-markers .b-mk')).toHaveCount(5);
      await attach(page, testInfo, `results-${theme}`);
      expect(errors).toEqual([]);
    });

    test('phone layout keeps ring labels apart and fits the width', async ({ page }, testInfo) => {
      for (const state of ['solving', 'inspection', 'results']) {
        const errors = await open(page, state, theme, 'phone');
        if (state === 'solving') expect(await overlappingLabels(page, '.b-oring-label')).toEqual([]);
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

test('results layout matrix: cube stays below the header on desktop and stacks on phones', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const fs = await import('node:fs');
  const path = await import('node:path');
  const out = 'test-results/r4-results-layout';
  fs.mkdirSync(out, { recursive: true });
  for (const style of ['orbit', 'mono']) for (const theme of ['dark', 'light']) for (const size of ['desktop', 'phone']) {
    const errors = await open(page, `${style}:results`, theme, size);
    const suffix = size === 'phone' ? '390' : '1280';
    const name = `${style}-${theme}-${suffix}`;
    await expect(page.locator('canvas')).toHaveCount(1);
    if (size === 'phone') {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, `${name} has no horizontal overflow`).toBeLessThanOrEqual(1);
      const position = await page.locator(style === 'orbit' ? '.brain-body' : '.b-cube-wrap').evaluate(el => getComputedStyle(el).position);
      expect(position, `${name} uses a non-sticky stacked cube`).not.toBe('sticky');
    } else {
      const stageSelector = style === 'orbit' ? '.brain-stage' : '.b-cube-wrap';
      const stage = page.locator(stageSelector);
      await expect(page.locator(style === 'orbit' ? '.brain-body' : '.b-cube-wrap')).toHaveCSS('position', 'sticky');
      await page.evaluate(() => window.scrollTo(0, 280));
      const box = await stage.boundingBox();
      expect(box.y, `${name} stays below the page header`).toBeGreaterThanOrEqual(55);
      const centeredTop = await page.evaluate(brainStyle => {
        const availableHeight = innerHeight - 56;
        const objectHeight = brainStyle === 'orbit' ? Math.min(500, innerHeight - 230) : 240;
        return 56 + (availableHeight - objectHeight) / 2;
      }, style);
      expect(Math.abs(box.y - centeredTop), `${name} remains vertically centered as stats scroll`).toBeLessThan(24);
    }
    const screenshot = path.join(out, `${name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(name, { path: screenshot, contentType: 'image/png' });
    expect(errors, `${name} browser errors`).toEqual([]);
  }
});

// The split list shares the cube's sticky column: it must never slide behind it.
test('Orbit results keep the cross and pair list below the cube throughout scrolling', async ({ page }) => {
  for (const height of [900, 650]) {
    await open(page, 'orbit:results', 'dark');
    await page.setViewportSize({ width: 1280, height });
    for (const scroll of [0, 280, 500, 800, 2000]) {
      await page.evaluate(y => window.scrollTo(0, y), scroll);
      const [cube, list] = await Promise.all([
        page.locator('.brain-stage').boundingBox(),
        page.locator('[data-slot="timeline-aside"]').boundingBox(),
      ]);
      expect(list.y - (cube.y + cube.height), `list follows cube at height ${height}, scroll ${scroll}`).toBeGreaterThanOrEqual(7);
      expect(list.y - (cube.y + cube.height)).toBeLessThanOrEqual(9);
    }
    const list = await page.locator('[data-slot="timeline-aside"]').boundingBox();
    expect(list.y + list.height, 'the last split remains reachable').toBeLessThanOrEqual(height);
    await expect(page.locator('canvas')).toHaveCount(1);
  }
});
