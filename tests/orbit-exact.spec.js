// DOM checks for the exact Orbit: results states are coloured, the ring is r 300 with open gaps, labels stay on their
// segment, a crowded ring fans markers out, and the coach connector is one short curve from the end of the text.
import { test, expect } from 'playwright/test';

const mount = async (page, script, arg) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/src/ui/gallery.html?flow=results&theme=dark');
  return page.evaluate(script, arg);
};

test('Orbit renders good / bad results states in teal and amber and keeps the stroke ladder', async ({ page }) => {
  const result = await mount(page, async () => {
    const { Orbit } = await import('/src/ui/orbit/index.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:800px'; document.body.append(host);
    const orbit = new Orbit(host, { size: 'XL', fitHost: true, labelStyle: 'around', animate: false, segments: [
      { key: 'a', label: 'cross', value: '2.08', delta: '−0.33', weight: 1, state: 'good', fill: 1 },
      { key: 'b', label: 'p1', value: '1.96', delta: '+0.27', weight: 1, state: 'bad', fill: 1 },
      { key: 'c', label: 'p2', weight: 1, state: 'done', fill: 1 },
      { key: 'd', label: 'p3', weight: 1, state: 'future' },
    ] });
    await new Promise(resolve => requestAnimationFrame(resolve));
    const style = key => { const node = host.querySelector(`[data-key="${key}"] .orbit__segment-track`); const css = getComputedStyle(node); return { stroke: css.stroke, width: Number.parseFloat(css.strokeWidth), cap: css.strokeLinecap }; };
    const svg = host.querySelector('.orbit__svg').getBoundingClientRect();
    return { good: style('a'), bad: style('b'), done: style('c'), future: style('d'), svgWidth: Math.round(svg.width), track: host.querySelectorAll('.orbit__track').length };
  });
  expect(result.good.stroke).toBe('rgb(61, 191, 173)');
  expect(result.bad.stroke).toBe('rgb(230, 166, 66)');
  expect(result.done.stroke).not.toBe(result.future.stroke);
  expect([result.good.width, result.bad.width, result.done.width]).toEqual([6, 6, 6]);
  expect(result.future.width).toBe(3);
  expect(result.good.cap).toBe('round');
  expect(result.svgWidth).toBe(760);
  expect(result.track, 'no full-sweep track under the segments').toBe(0);
});

test('a fit-host Orbit is r 300 at 1440x900 with nine separate dashes', async ({ page }) => {
  const result = await mount(page, async () => {
    const { Orbit } = await import('/src/ui/orbit/index.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:700px;height:700px'; document.body.append(host);
    const keys = ['cross', 'p1', 'p2', 'p3', 'p4', 'eo', 'co', 'cp', 'ep'];
    new Orbit(host, { size: 'XL', fitHost: true, labelStyle: 'around', animate: false, segments: keys.map((key, at) => ({ key, label: key, weight: [41, 32, 33, 33, 35, 17, 26, 28, 25][at], state: 'future' })) });
    await new Promise(resolve => requestAnimationFrame(resolve));
    const paths = [...host.querySelectorAll('.orbit__segment-track')];
    const point = path => { const length = path.getTotalLength(); const a = path.getPointAtLength(0), b = path.getPointAtLength(length / 2); return [a, b]; };
    const svg = host.querySelector('.orbit__svg'), box = svg.getBoundingClientRect(), scale = box.width / 760;
    const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const radii = paths.map(path => { const [, mid] = point(path); const m = path.getScreenCTM(); const screen = new DOMPoint(mid.x, mid.y).matrixTransform(m); return Math.hypot(screen.x - centre.x, screen.y - centre.y); });
    return { dashes: paths.length, radius: radii.reduce((sum, value) => sum + value, 0) / radii.length, scale };
  });
  expect(result.dashes).toBe(9);
  expect(Math.abs(result.radius - 300)).toBeLessThan(2);
});

test('45 scramble moves keep every label on its segment and none hidden; 20 markers are all hittable', async ({ page }) => {
  const result = await mount(page, async () => {
    const { Orbit } = await import('/src/ui/orbit/index.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:800px'; document.body.append(host);
    const faces = ['R', 'U', 'F', 'D', 'L', 'B'], suffix = ['', '′', '2'];
    const segments = Array.from({ length: 45 }, (_, at) => ({ key: `m${at}`, label: faces[at % 6] + suffix[at % 3], weight: 1, state: at < 20 ? 'done' : at === 20 ? 'current' : 'future' }));
    const markers = Array.from({ length: 20 }, (_, at) => ({ key: `k${at}`, segment: 'm10', position: 0.1 + at * 0.04, label: `marker ${at}`, tone: at % 2 ? 'bad' : 'good' }));
    const orbit = new Orbit(host, { size: 'XL', fitHost: true, labelStyle: 'around', animate: false, segments, markers });
    await new Promise(resolve => requestAnimationFrame(resolve));
    const svg = host.querySelector('.orbit__svg'), box = svg.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const labels = [...host.querySelectorAll('.orbit__move-label')].map(node => { const b = node.getBoundingClientRect(); return { key: node.dataset.labelFor, x: b.left + b.width / 2 - cx, y: b.top + b.height / 2 - cy }; });
    const mids = new Map(orbit.current.layout.map(part => [part.key, part.mid]));
    const worst = Math.max(...labels.map(label => { const seen = (Math.atan2(label.x, -label.y) * 180 / Math.PI + 360) % 360, want = ((mids.get(label.key) % 360) + 360) % 360; return Math.abs(((seen - want + 540) % 360) - 180); }));
    const badges = [...host.querySelectorAll('[data-marker-cluster]')];
    const centres = badges.map(node => { const b = node.querySelector('.orbit__marker-hit').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 }; });
    let overlap = 0;
    for (let a = 0; a < centres.length; a++) for (let b = a + 1; b < centres.length; b++) if (Math.hypot(centres[a].x - centres[b].x, centres[a].y - centres[b].y) < centres[a].r + centres[b].r - 0.5) overlap++;
    const hit = centres.filter(point => { const top = document.elementFromPoint(point.x, point.y); return top?.closest('[data-marker-cluster]') != null; }).length;
    const unique = new Set(centres.map(point => `${Math.round(point.x)}:${Math.round(point.y)}`)).size;
    return { labels: labels.length, worst, badges: badges.length, overlap, hit, unique, clusters: host.querySelectorAll('.is-cluster').length };
  });
  expect(result.labels).toBe(45);
  expect(result.worst).toBeLessThan(6);
  expect(result.badges).toBe(20);
  expect(result.clusters).toBe(0);
  expect(result.overlap).toBe(0);
  expect(result.unique).toBe(20);
  expect(result.hit).toBe(20);
});

test('the coach connector starts at the end of the sentence text and there is only one', async ({ page }) => {
  const result = await mount(page, async () => {
    const { createCoachLine } = await import('/src/ui/shared/index.js');
    const { Orbit } = await import('/src/ui/orbit/index.js');
    const stage = document.createElement('div'); stage.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:800px'; document.body.append(stage);
    const ringHost = document.createElement('div'); ringHost.style.cssText = 'position:absolute;left:300px;top:0;width:700px;height:700px'; stage.append(ringHost);
    const rail = document.createElement('div'); rail.style.cssText = 'position:absolute;left:20px;top:300px;width:260px'; stage.append(rail);
    const orbit = new Orbit(ringHost, { size: 'XL', fitHost: true, labelStyle: 'around', animate: false, segments: [{ key: 'a', weight: 1, label: 'a' }, { key: 'b', weight: 1, label: 'b' }], markers: [{ key: 'mk', segment: 'b', position: .5, label: 'x' }] });
    await new Promise(resolve => requestAnimationFrame(resolve));
    for (let at = 0; at < 3; at++) createCoachLine(rail, { text: 'Pair 3 saved about three moves.', marker: 'mk', orbit, connectorHost: stage });
    await new Promise(resolve => setTimeout(resolve, 200));
    const sentence = stage.querySelector('.ui-coach-line__text'), range = document.createRange(); range.selectNodeContents(sentence);
    const textRight = range.getBoundingClientRect().right;
    const path = stage.querySelector('.ui-coach-line__connector path'), start = path.getPointAtLength(0), m = path.getScreenCTM();
    const startScreen = new DOMPoint(start.x, start.y).matrixTransform(m);
    return { connectors: stage.querySelectorAll('.ui-coach-line__connector').length, lines: stage.querySelectorAll('.ui-coach-line').length, startX: startScreen.x, textRight, length: path.getTotalLength() };
  });
  expect(result.connectors).toBe(1);
  expect(result.lines).toBe(1);
  expect(Math.abs(result.startX - result.textRight)).toBeLessThan(3);
  expect(result.length).toBeLessThan(900);
});
