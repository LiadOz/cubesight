import { test, expect } from 'playwright/test';
import { analysisStateFromScramble } from '../src/analysis/long-replay.js';
import { unrelabelMoves } from '../src/analysis/normalize.js';
import { renderCubeMarkup } from '../src/cube-renderer.js';
import { toRenderData } from '../src/cross-cube.js';
import { generatePllCase, identifyPllCaseDetails } from '../src/pll-logic.js';
import { generatePinVariations } from '../src/drills/pin-variations.js';

async function installAndGoOffline(page, context) {
  await page.goto('/#/drills');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Service worker did not take control')), 10_000);
        navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(); }, { once: true });
      });
    }
  });
  await context.setOffline(true);
}

function stickerMap(markup) {
  return [...markup.matchAll(/<polygon class="cube-sticker(?: [^"]*)?"[^>]*>/g)].map(([tag]) => ({
    face: /data-face="([^"]+)"/.exec(tag)?.[1],
    row: /data-row="([^"]+)"/.exec(tag)?.[1],
    column: /data-column="([^"]+)"/.exec(tag)?.[1],
    piece: /data-piece="([^"]+)"/.exec(tag)?.[1],
    fill: /fill="([^"]+)"/.exec(tag)?.[1],
  }));
}

async function seedPin(page, pin) {
  await page.evaluate(async (savedPin) => {
    const request = indexedDB.open('cubesight-history', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('solves')) db.createObjectStore('solves', { keyPath: 'at' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('pins')) db.createObjectStore('pins', { keyPath: 'id' });
    };
    await new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('pins', 'readwrite');
        tx.objectStore('pins').put(savedPin);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, pin);
}

test('saved non-D PLL pin starts exact, then advances to a verified same-case different-AUF variation', async ({ page, context }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await installAndGoOffline(page, context);
  const trial = generatePllCase('T', { auf: 'U' });
  const canonicalSetup = [...trial.setup, 'U'];
  const physicalSetup = unrelabelMoves(canonicalSetup, 'F');
  const at = 1_800_000_000_000;
  const pin = {
    id: `${at}:pll:0`, at, moveIdx: 0, stage: 'pll', kind: 'stage', trainer: 'pll',
    scramble: physicalSetup.join(' '), crossFace: 'F', movesUpTo: [], yours: [], better: null,
    note: 'Saved PLL setup', createdAt: at,
  };
  await seedPin(page, pin);

  const canonicalText = canonicalSetup.join(' ');
  const expectedStart = renderCubeMarkup(trial.renderData, {
    title: 'PLL recognition cube',
    description: 'Top, front, and right stickers for the current PLL case.',
  });
  const expectedStartMap = stickerMap(expectedStart);
  expect(identifyPllCaseDetails(analysisStateFromScramble(canonicalText))?.auf).toBe('U');

  const normalizedPin = { ...pin, scramble: canonicalText, crossFace: 'D' };
  const variants = await generatePinVariations(normalizedPin, { count: 3 });
  expect(variants.length).toBe(3);
  const expectedVariantMaps = variants.map((variant) => {
    const detail = identifyPllCaseDetails(analysisStateFromScramble(variant.scramble));
    expect(detail?.case.name).toBe('T');
    expect(detail?.auf).not.toBe('U');
    return stickerMap(renderCubeMarkup(toRenderData(variant.state), {
      title: 'PLL recognition cube',
      description: 'Top, front, and right stickers for the current PLL case.',
    }));
  });

  await page.goto(`/#/drills/pll?setup=review:${at}:0&from=review:${at}:0`);
  await expect(page.locator('#pll-view')).toHaveAttribute('data-pll-case', 'T');
  await expect(page.locator('#pll-cube svg')).toBeVisible();
  const firstMap = await page.locator('#pll-cube svg').evaluate((svg) => [...svg.querySelectorAll('polygon.cube-sticker')].map((sticker) => ({
    face: sticker.dataset.face, row: sticker.dataset.row, column: sticker.dataset.column,
    piece: sticker.dataset.piece, fill: sticker.getAttribute('fill'),
  })));
  expect(firstMap).toEqual(expectedStartMap);

  await page.locator('[data-pll-answer="T"]').click();
  await expect(page.locator('#pll-next')).toBeVisible();
  await page.locator('#pll-next').click();
  await expect(page.locator('#pll-view')).toHaveAttribute('data-pll-case', 'T');
  await expect.poll(async () => page.locator('#pll-cube svg').evaluate((svg) => [...svg.querySelectorAll('polygon.cube-sticker')].map((sticker) => ({
    face: sticker.dataset.face, row: sticker.dataset.row, column: sticker.dataset.column,
    piece: sticker.dataset.piece, fill: sticker.getAttribute('fill'),
  })))).not.toEqual(expectedStartMap);
  const nextMap = await page.locator('#pll-cube svg').evaluate((svg) => [...svg.querySelectorAll('polygon.cube-sticker')].map((sticker) => ({
    face: sticker.dataset.face, row: sticker.dataset.row, column: sticker.dataset.column,
    piece: sticker.dataset.piece, fill: sticker.getAttribute('fill'),
  })));
  expect(expectedVariantMaps).toContainEqual(nextMap);
  expect(nextMap).not.toEqual(firstMap);
});

test('saved unsolved D-cross pin loads and replans a distinct variation offline', async ({ page, context }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__workerPosts = [];
    window.Worker = class TracedWorker extends NativeWorker {
      postMessage(...args) {
        try { window.__workerPosts.push(structuredClone(args[0])); } catch { /* Keep the worker call intact. */ }
        return super.postMessage(...args);
      }
    };
  });
  await installAndGoOffline(page, context);
  const at = 1_800_000_000_001;
  const pin = {
    id: `${at}:cross:0`, at, moveIdx: 0, stage: 'cross', kind: 'detour', trainer: 'cross',
    scramble: 'F', crossFace: 'D', movesUpTo: [], yours: ["F'"], better: ["F'"],
    note: 'Finish the D cross', createdAt: at,
  };
  await seedPin(page, pin);
  await page.goto(`/#/drills/scout?setup=review:${at}:0&face=D`);
  await expect(page.locator('#cp-faces [data-face="D"]')).toBeEnabled({ timeout: 30_000 });
  const firstRequests = await page.evaluate(() => window.__workerPosts.filter(item => item.type === 'solve' && item.kind === 'cross'));
  expect(firstRequests.some(item => item.scramble === 'F' && item.face === 'D')).toBe(true);

  await page.locator('#cp-faces [data-face="D"]').click();
  await expect(page.locator('#cp-reveal')).toContainText('Yellow cross');
  await expect(page.locator('#cp-next')).toBeVisible();
  await page.locator('#cp-next').click();
  await expect(page.locator('#cp-case')).toHaveText('case 2');
  await expect(page.locator('#cp-faces [data-face="D"]')).toBeEnabled({ timeout: 30_000 });
  const replans = await page.evaluate(() => window.__workerPosts.filter(item => item.type === 'solve' && item.kind === 'cross'));
  expect(replans.some(item => item.scramble && item.scramble !== 'F' && item.face === 'D')).toBe(true);
  await page.locator('#cp-faces [data-face="D"]').click();
  await expect(page.locator('#cp-reveal')).toContainText('Yellow cross');
});
