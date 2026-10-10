import { test, expect } from './helpers/coverage-test.js';

test('coach connects to left, top and right markers without crossing the cube space or time, including after resize', async ({ page }) => {
  await page.route('**/connector-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/connector-fixture');
  await page.evaluate(async () => {
    const [{ Orbit }, { createCoachLine }] = await Promise.all([import('/src/ui/orbit/index.js'), import('/src/ui/shared/index.js')]);
    document.head.insertAdjacentHTML('beforeend', `<style>
      body { margin:0; } .fixture { position:relative; height:900px; }
      .stage { position:absolute; left:340px; top:60px; width:760px; height:760px; }
      .coach { position:absolute; left:48px; top:580px; width:250px; }
      .time { position:absolute; left:565px; top:700px; width:310px; height:100px; }
      .contents { display:contents; }
      @media(max-width:640px) { .fixture { height:844px; } .stage { left:5px; top:30px; width:380px; height:380px; } .coach { left:24px; top:580px; width:342px; } .time { left:100px; top:440px; width:190px; } }
    </style>`);
    document.body.innerHTML = '<main class="fixture"><div class="contents"><div class="stage"></div><div class="coach"></div><div class="time">33.22</div></div></main>';
    const orbit = new Orbit(document.querySelector('.stage'), { size: 'XL', fitHost: true, labelStyle: 'around', shape: 'open', markers: [{ key: 'left', angle: 250 }, { key: 'top', angle: 7 }, { key: 'right', angle: 75 }] });
    const coach = createCoachLine(document.querySelector('.coach'), { text: 'Pair 4 took 18 moves. The BR slot was 6 away: R′ U2 R B U B′. Worth checking the BR slot first.', marker: 'left', orbit, connectorHost: document.querySelector('.contents') });
    window.connectorFixture = { orbit, coach };
  });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const marker of ['left', 'top', 'right']) {
      await page.evaluate(key => window.connectorFixture.coach.link(key), marker);
      await expect(page.locator('.ui-coach-line__connector')).toHaveClass(/is-linked/);
      const metrics = await page.evaluate(key => {
        const { orbit } = window.connectorFixture;
        const root = orbit.element.querySelector('.orbit__svg'), matrix = root.getScreenCTM();
        const center = new DOMPoint(orbit.current.cx, orbit.current.cy).matrixTransform(matrix);
        const radius = orbit.current.radius * Math.hypot(matrix.a, matrix.b);
        const path = document.querySelector('.ui-coach-line__connector path'), transform = path.getScreenCTM();
        const length = path.getTotalLength(), time = document.querySelector('.time').getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(document.querySelector('.ui-coach-line__text'));
        const lines = [...range.getClientRects()];
        const otherLines = innerWidth <= 640 ? lines.slice(1) : lines.slice(0, -1);
        let crossesText = false, crossesTime = false, minimumRadius = Infinity, insideViewport = true;
        for (let index = 0; index <= 120; index++) {
          const p = path.getPointAtLength(length * index / 120);
          const screen = new DOMPoint(p.x, p.y).matrixTransform(transform);
          crossesText ||= otherLines.some(line => screen.x > line.left && screen.x < line.right && screen.y > line.top && screen.y < line.bottom);
          crossesTime ||= screen.x > time.left && screen.x < time.right && screen.y > time.top && screen.y < time.bottom;
          minimumRadius = Math.min(minimumRadius, Math.hypot(screen.x - center.x, screen.y - center.y) / radius);
          insideViewport &&= screen.x >= 0 && screen.x <= innerWidth && screen.y >= 0 && screen.y <= innerHeight;
        }
        const end = path.getPointAtLength(length), screenEnd = new DOMPoint(end.x, end.y).matrixTransform(transform);
        const target = orbit.getMarkerElement(key).getBoundingClientRect();
        return { crossesText, d: path.getAttribute('d'), crossesTime, minimumRadius, insideViewport, distance: Math.hypot(screenEnd.x - target.left - target.width / 2, screenEnd.y - target.top - target.height / 2) };
      }, marker);
      expect(metrics.crossesTime).toBe(false);
      expect(metrics.crossesText).toBe(false);
      expect(metrics.minimumRadius).toBeGreaterThan(.88);
      expect(metrics.insideViewport).toBe(true);
      expect(metrics.distance).toBeLessThan(.1);
      if (marker === 'left') expect(metrics.d).not.toContain(' A ');
      else expect(metrics.d).toContain(' A ');
    }
  }
});
