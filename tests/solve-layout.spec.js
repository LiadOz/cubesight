import sharp from 'sharp';
import { test, expect } from './helpers/coverage-test.js';
import { mountTestBrain } from './helpers/fake-brain.js';
import { ANCHORS, CANVAS, COLORS, CUBE, ORBIT, TYPE } from '../src/ui/design-spec.js';

// The solve screen is the approved frames' canvas (docs/design/orbit-v3/SPEC-A-EXACT.md), scaled by one unit. These are the
// acceptance numbers of the one-to-one review: header x, Orbit centre, cube box, timer ladder, no horizontal overflow.

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '390x844 phone', width: 390, height: 844, phone: true },
];

/** One canvas px in CSS px, the same unit the Orbit and the layout use (ui/orbit/index.js canvasUnit; the phone is 1:1 with the device). */
const unit = ({ width, height, phone }) => (phone ? 1 : Math.min(1.25, width / CANVAS.desktop.width, height / CANVAS.desktop.height));

/** Bounding box of the pixels within `tolerance` (sum of channel deltas) of `hex` inside a clip. */
async function colourBox(png, hex, clip, tolerance = 60) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const target = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  for (let y = Math.max(0, Math.floor(clip.y)); y < Math.min(info.height, Math.ceil(clip.y + clip.height)); y++) {
    for (let x = Math.max(0, Math.floor(clip.x)); x < Math.min(info.width, Math.ceil(clip.x + clip.width)); x++) {
      const at = (y * info.width + x) * 3;
      if (Math.abs(data[at] - target[0]) + Math.abs(data[at + 1] - target[1]) + Math.abs(data[at + 2] - target[2]) < tolerance) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

/** The solved cube's sticker extents in the approved frame (all 27 stickers plus half their stroke), relative to the cube centre. */
function specStickerBox() {
  const half = CUBE.desktop.stickerStroke / 2;
  const points = CUBE.stickers.flatMap(sticker => sticker.points);
  return {
    minX: Math.min(...points.map(p => p[0])) - half, maxX: Math.max(...points.map(p => p[0])) + half,
    minY: Math.min(...points.map(p => p[1])) - half, maxY: Math.max(...points.map(p => p[1])) + half,
  };
}

for (const viewport of VIEWPORTS) {
  test(`solve screen lands on the frames' anchors at ${viewport.name}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await mountTestBrain(page, 'orbit', { route: true });
    await page.waitForFunction(() => window.testBrain?.handle && document.querySelector('#brain-view .orbit__svg'));
    await expect(page.locator('#brain-view .brain')).toHaveAttribute('data-screen', 'idle');
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    const u = unit(viewport);
    const near = (actual, expected, tolerance, what) => expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);

    // No horizontal overflow, and the page does not scroll.
    const scroll = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }));
    expect(scroll.x, 'no horizontal overflow').toBeLessThanOrEqual(0);
    expect(scroll.y, 'the solve screen fits one screen').toBeLessThanOrEqual(0);

    // Item 1: the wordmark belongs at x=48 (x=24 on the phone, A-09); the page content does not inherit a column offset.
    const brand = await page.locator('.ui-header__brand').boundingBox();
    const wordmark = viewport.phone ? ANCHORS.frames['A-09-phone'].find(item => item.text === 'cubesight') : ANCHORS['A-01-idle']['header.wordmark'];
    near(brand.x, wordmark.x, 1, 'wordmark x');

    // Item 1: the Orbit centre lands on (720, 440) of the canvas (phone: (195, 300) of the device).
    const ring = await page.locator('#brain-view .orbit__svg').boundingBox();
    const centre = viewport.phone
      ? { x: viewport.width / 2, y: ORBIT.phone.centre.y }
      : { x: (viewport.width - CANVAS.desktop.width * u) / 2 + ORBIT.centre.x * u, y: (viewport.height - CANVAS.desktop.height * u) / 2 + ORBIT.centre.y * u };
    near(ring.x + ring.width / 2, centre.x, 3, 'Orbit centre x');
    near(ring.y + ring.height / 2, centre.y, 3, 'Orbit centre y');

    // Item 5: the cube is centred on the ring, and its stickers span the frames' stickers within 2 %.
    const cubeWrap = await page.locator('#brain-view .b-cube-wrap').boundingBox();
    near(cubeWrap.x + cubeWrap.width / 2, centre.x, 1, 'cube centre x');
    near(cubeWrap.y + cubeWrap.height / 2, centre.y, 1, 'cube centre y');
    const cubeScale = viewport.phone ? CUBE.phone.height / CUBE.desktop.height : 1;
    const png = await page.screenshot();
    const dpr = await page.evaluate(() => devicePixelRatio);
    const around = { x: (centre.x - 260 * u * cubeScale) * dpr, y: (centre.y - 260 * u * cubeScale) * dpr, width: 520 * u * cubeScale * dpr, height: 520 * u * cubeScale * dpr };
    const boxes = await Promise.all([['#f4f4f0', 80], ['#138c40', 60], ['#a5231f', 60]].map(([hex, tol]) => colourBox(png, hex, around, tol)));
    const measured = { minX: Math.min(...boxes.map(b => b.minX)), maxX: Math.max(...boxes.map(b => b.maxX)), minY: Math.min(...boxes.map(b => b.minY)), maxY: Math.max(...boxes.map(b => b.maxY)) };
    const spec = specStickerBox();
    const scale = u * cubeScale * dpr;
    const width = (spec.maxX - spec.minX) * scale, height = (spec.maxY - spec.minY) * scale;
    test.info().annotations.push({ type: 'cube stickers (px)', description: `measured ${measured.maxX - measured.minX} x ${measured.maxY - measured.minY}, spec ${width.toFixed(1)} x ${height.toFixed(1)}; ring centre ${(ring.x + ring.width / 2).toFixed(1)}, ${(ring.y + ring.height / 2).toFixed(1)} (spec ${centre.x.toFixed(1)}, ${centre.y.toFixed(1)})` });
    near(measured.maxX - measured.minX, width, width * 0.02 + 2, 'cube sticker width');
    near(measured.maxY - measured.minY, height, height * 0.02 + 2, 'cube sticker height');
    near((measured.minX + measured.maxX) / 2, centre.x * dpr + (spec.minX + spec.maxX) / 2 * scale, 3, 'cube sticker centre x');

    // The timer ladder (user decision): 120 px idle at weight 300 with the specced letter spacing.
    const timer = await page.locator('#brain-view .b-clock').evaluate(el => { const cs = getComputedStyle(el); return { size: parseFloat(cs.fontSize), weight: cs.fontWeight, spacing: parseFloat(cs.letterSpacing) }; });
    const idle = TYPE.styles.find(style => style.id === (viewport.phone ? 'T49' : 'T03'));   // phone: the live timer (A-09)
    near(timer.size, idle.size * u, 0.5, 'idle timer size');
    expect(timer.weight).toBe('300');
  });
}

test('the dark palette bridge is the approved palette', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../src/ui/shared/shared.css', import.meta.url), 'utf8');
  const dark = css.match(/:root\[data-theme='dark'\]\s*\{[^}]*\}/)[0];
  const token = name => COLORS.tokens[name].hex;
  for (const [variable, hex] of [['--orbit-bg', token('bg')], ['--orbit-ink', token('text-primary')], ['--orbit-muted', token('text-dim')], ['--orbit-track', token('ring-idle')],
    ['--orbit-key', token('keycap')], ['--orbit-accent', token('teal')], ['--orbit-bad', token('coral')]]) {
    expect(dark, `${variable} is ${hex}`).toContain(`${variable}:${hex}`);
  }
});
