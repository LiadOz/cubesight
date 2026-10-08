import { test, expect } from './helpers/coverage-test.js';

// Two user-reported F2L deduction defects:
//  1. the Orbit did nothing: it must hold one empty arc per pair to find and fill one as each is found;
//  2. choosing a pair re-tinted (dimmed) the stickers, which a real cube never does.

const segments = page => page.locator('#f2l-view .cube-stage .orbit__segment').evaluateAll(list => list.map(node => ({
  state: node.getAttribute('class').match(/is-(\w+)/)?.[1], filled: node.querySelector('.orbit__segment-fill') !== null })));
const looks = page => page.locator('#f2l-cube canvas').evaluate(canvas => JSON.parse(canvas.dataset.stickerLooks));

// The cube's own click handler: back pieces need a drag to reach, which says nothing about the Orbit or the colours.
const clickPiece = (page, piece) => page.evaluate(selected => window.__cubesightF2LCase.pick(selected), piece);

/** Pairs still to find, each as its [corner, edge] piece positions as the page sees them. */
const pairs = page => page.evaluate(() => {
  const found = window.__cubesightF2LCase();
  return found.targets.filter(id => !found.matched.includes(id)).map(id => Object.entries(found.pieces).filter(([, piece]) => piece.pairId === id).map(([name]) => name));
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cubesight-f2l-mode', 'deduction'));
  await page.goto('/#/drills/f2l');
  await expect(page.locator('#f2l-cube canvas')).toHaveAttribute('data-sticker-looks', /.+/);
  await expect.poll(() => page.evaluate(() => window.__cubesightF2LCase?.().targets.length)).toBeGreaterThan(0);
});

test('the Orbit starts with one empty arc per pair and fills one as each pair is found', async ({ page }) => {
  const total = await page.evaluate(() => window.__cubesightF2LCase().targets.length);
  expect(total).toBeGreaterThanOrEqual(1);
  expect(total).toBeLessThanOrEqual(4);
  await expect.poll(() => segments(page)).toEqual(Array.from({ length: total }, () => ({ state: 'future', filled: false })));
  for (let found = 1; found <= total; found++) {
    const [[first, second]] = await pairs(page);
    await clickPiece(page, first);
    // One click alone fills nothing.
    expect((await segments(page)).filter(segment => segment.filled)).toHaveLength(found - 1);
    await clickPiece(page, second);
    await expect.poll(() => segments(page)).toEqual(Array.from({ length: total }, (_, at) => at < found ? { state: 'good', filled: true } : { state: 'future', filled: false }));
    if (found < total) await expect(page.locator('#f2l-status')).toContainText('Find another pair', { timeout: 3_000 });
  }
  // The finished case starts a fresh, empty set.
  await expect.poll(() => page.evaluate(() => window.__cubesightF2LCase().matched.length), { timeout: 4_000 }).toBe(0);
  await expect.poll(async () => (await segments(page)).every(segment => !segment.filled && segment.state === 'future')).toBe(true);
});

test('choosing a pair does not change how any sticker looks', async ({ page }) => {
  const before = await looks(page);
  const [[first, second]] = await pairs(page);
  await clickPiece(page, first);
  await clickPiece(page, second);
  await expect(page.locator('#f2l-status')).toContainText('Pair found');
  const after = await looks(page);
  expect(after).toEqual(before);
  // Nothing is faded either: every sticker is drawn at full opacity.
  expect(Object.values(after).every(look => look.endsWith('@1'))).toBe(true);
});
