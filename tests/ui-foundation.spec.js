import { test, expect } from 'playwright/test';

test('Orbit morph interruption, collapse/expand, keyboard activation and dynamic growth preserve one focused segment', async ({ page }) => {
  await page.goto('/src/ui/gallery.html?flow=results&theme=dark');
  await expect(page.locator('.f0-cube canvas')).toHaveCount(1);
  const segment = page.locator('.f0-orbit [data-segment]').nth(3);
  const key = await segment.getAttribute('data-segment');
  await segment.focus();
  const result = await page.evaluate(async () => {
    const orbit = window.__f0Orbit;
    const current = orbit.options;
    const first = orbit.update({ ...current, shape: 'full', duration: 420 });
    const expanded = orbit.update({ ...current, shape: 'open', size: 'XL', duration: 420,
      segments: [...current.segments, { key: 'interrupted-growth', label: 'undo', weight: 1, state: 'wrong' }] });
    await Promise.all([first, expanded]);
    await orbit.collapse();
    await orbit.expand('L');
    return { shape: orbit.element.dataset.shape, size: orbit.element.dataset.size,
      focused: document.activeElement?.dataset.segment || null,
      oneCanvas: document.querySelectorAll('.f0-cube canvas').length };
  });
  expect(result).toEqual({ shape: 'open', size: 'L', focused: key, oneCanvas: 1 });
  const beforeGrowth = await page.locator('.f0-orbit [data-segment]').count();
  await page.getByRole('button', { name: 'add undo segment' }).click();
  await expect(page.locator('.f0-orbit [data-segment]')).toHaveCount(beforeGrowth + 1);
});

test('Orbit takes fresh host bounds when a resize interrupts a morph', async ({ page }) => {
  await page.goto('/src/ui/gallery.html?flow=results');
  const fitted = await page.evaluate(async () => {
    const orbit = window.__f0Orbit;
    const current = orbit.options;
    const interrupted = orbit.update({ ...current, shape: 'full', duration: 420 });
    await new Promise(resolve => setTimeout(resolve, 80));
    orbit.host.style.width = '280px';
    orbit.host.style.height = '280px';
    const resized = orbit.update({ ...current, shape: 'open', size: 'XL', duration: 420 });
    await Promise.all([interrupted, resized]);
    return {
      renderedWidth: Number.parseFloat(orbit.element.style.width),
      hostWidth: orbit.host.getBoundingClientRect().width,
      shape: orbit.element.dataset.shape,
    };
  });
  expect(fitted.shape).toBe('open');
  expect(fitted.hostWidth).toBe(280);
  expect(fitted.renderedWidth).toBeLessThanOrEqual(fitted.hostWidth);
});

test('crowded Orbit markers fan out onto their own badges and stay reachable by keyboard with exact marker lookup', async ({ page }) => {
  // Approved (W-20, TC-00 Q3 B): a crowded ring fans markers out instead of merging them into one count badge.
  await page.goto('/src/ui/gallery.html?flow=results');
  const total = await page.evaluate(() => window.__f0Orbit.current.markers.length);
  expect(total).toBeGreaterThan(2);
  await expect(page.locator('.f0-orbit [data-marker-cluster]')).toHaveCount(total);
  await expect(page.locator('.f0-orbit [data-marker-cluster].is-cluster')).toHaveCount(0);
  const key = await page.evaluate(() => window.__f0Orbit.current.markers.find(marker => marker.key === 'mark-1')?.key);
  expect(await page.evaluate(keyValue => window.__f0Orbit.getMarkerElement(keyValue)?.dataset.markerKeys, key)).toContain('mark-1');
  await page.locator('.f0-orbit [data-marker-cluster]').filter({ has: page.locator('title') }).first().waitFor();
  await page.evaluate(() => window.__f0Orbit.getMarkerElement('mark-1').focus());
  await page.keyboard.press('Space');
  await expect(page.locator('.f0-coach .ui-coach-line__text')).toContainText(/pause|efficient/);
});

test('phone Orbit markers each expose their own 40px target and stay in the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/src/ui/gallery.html?flow=results');
  await page.waitForTimeout(420);
  const badges = page.locator('.f0-orbit [data-marker-cluster]');
  const count = await badges.count();
  expect(count).toBeGreaterThan(2);
  const targets = await badges.evaluateAll(nodes => nodes.map(node => { const rect = node.querySelector('.orbit__marker-hit').getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height }; }));
  for (const target of targets) { expect(target.width).toBeGreaterThanOrEqual(40 - 0.5); expect(target.height).toBeGreaterThanOrEqual(40 - 0.5); }
  for (let a = 0; a < targets.length; a++) for (let b = a + 1; b < targets.length; b++) expect(Math.hypot(targets[a].x - targets[b].x, targets[a].y - targets[b].y)).toBeGreaterThanOrEqual(39.5);
  await badges.first().focus();
  await expect(badges.first()).toBeFocused();
});

test('phone flow scroller is keyboard focusable and keeps the selected scenario fully visible without moving the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/src/ui/gallery.html?flow=results');
  await page.waitForTimeout(100);
  const initiallySelected = await page.evaluate(() => {
    const nav = document.querySelector('.f0-tabs'), active = nav.querySelector('[aria-pressed="true"]');
    const n = nav.getBoundingClientRect(), a = active.getBoundingClientRect();
    return { left: a.left >= n.left - 1, right: a.right <= n.right + 1 };
  });
  expect(initiallySelected).toEqual({ left: true, right: true });
  await page.goto('/src/ui/gallery.html?flow=scramble');
  const nav = page.locator('.f0-tabs');
  await expect(nav).toHaveAttribute('data-scroll-x', 'true');
  await expect(nav).toHaveAttribute('tabindex', '0');
  const scrollY = await page.evaluate(() => window.scrollY);
  await nav.getByRole('button', { name: 'history' }).click();
  const state = await page.evaluate(() => {
    const navElement = document.querySelector('.f0-tabs'), selected = navElement.querySelector('[aria-pressed="true"]');
    const n = navElement.getBoundingClientRect(), s = selected.getBoundingClientRect();
    return { overflow: navElement.scrollWidth > navElement.clientWidth, left: s.left >= n.left - 1, right: s.right <= n.right + 1, pageY: window.scrollY };
  });
  expect(state).toEqual({ overflow: true, left: true, right: true, pageY: scrollY });
  await nav.focus();
  await page.keyboard.press('End');
  expect(await nav.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  const lastTab = await nav.getByRole('button', { name: 'progress' }).boundingBox();
  const navBox = await nav.boundingBox();
  expect(lastTab.x).toBeGreaterThanOrEqual(navBox.x);
  expect(lastTab.x + lastTab.width).toBeLessThanOrEqual(navBox.x + navBox.width);
});

test('Orbit morph interpolates segment and marker geometry and lays out dense marker facts without overlap', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/src/ui/gallery.html?flow=results');
  const mid = await page.evaluate(async () => {
    const orbit = window.__f0Orbit;
    const beforeLayout = new Map(orbit.displayed.layout.map(part => [part.key, part.mid]));
    const update = orbit.update({ ...orbit.options, shape: 'full', duration: 420 });
    const targetLayout = new Map(orbit.current.layout.map(part => [part.key, part.mid]));
    const key = [...targetLayout.keys()].sort((a, b) => Math.abs(targetLayout.get(b) - beforeLayout.get(b)) - Math.abs(targetLayout.get(a) - beforeLayout.get(a)))[0];
    await new Promise(resolve => setTimeout(resolve, 100));
    const before = beforeLayout.get(key), during = orbit.displayed.layout.find(part => part.key === key).mid, target = targetLayout.get(key);
    await update;
    const markers = Array.from({ length: 12 }, (_, index) => ({ key: `stress-${index}`, segment: 'pair 3', position: .48 + index * .001,
      label: `coach fact ${index + 1} with detail`, tone: index % 2 ? 'good' : 'bad' }));
    await orbit.update({ ...orbit.options, markers, animate: false });
    const badges = [...orbit.element.querySelectorAll('[data-marker-cluster]')];
    const points = badges.map(node => { const rect = node.querySelector('.orbit__marker-hit').getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, r: rect.width / 2 }; });
    const overlaps = points.some((p, i) => points.slice(i + 1).some(q => Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r - 0.5));
    const reachable = points.filter(p => document.elementFromPoint(p.x, p.y)?.closest('[data-marker-cluster]')).length;
    await orbit.update({ ...orbit.options, accent: '#52e0ca', animate: false });
    return { before, during, target, badges: badges.length, overlaps, reachable, clusters: orbit.element.querySelectorAll('.is-cluster').length, details: orbit.element.querySelectorAll('.orbit__marker-details').length };
  });
  expect(mid.during).not.toBeCloseTo(mid.before, 1);
  expect(mid.during).not.toBeCloseTo(mid.target, 1);
  // Twelve markers within a few degrees fan out: twelve badges, none merged, none overlapping, all hittable.
  expect(mid.badges).toBe(12);
  expect(mid.clusters).toBe(0);
  expect(mid.details).toBe(0);
  expect(mid.overlaps).toBe(false);
  expect(mid.reachable).toBe(12);
});

test('stage labels keep names, values and deltas on separate collision-free rows around the centered Cube', async ({ page }) => {
  for (const flow of ['results', 'progress']) {
    await page.goto(`/src/ui/gallery.html?flow=${flow}`);
    const layout = await page.evaluate(() => {
      const box = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom }; };
      const labels = [...document.querySelectorAll('.orbit__label')].flatMap(group => [...group.querySelectorAll(':scope > text')].filter(text => text.textContent.trim()).map(text => ({ text:text.textContent.trim(), box:box(text) })));
      const markers = [...document.querySelectorAll('[data-marker-cluster]')].map(box);
      const cube = box(document.querySelector('.f0-cube canvas'));
      const ring = box(document.querySelector('.f0-orbit .orbit__svg'));
      return { labels, markers, cube, ring,
        expectedKeys: window.__f0Orbit.options.segments.map(segment => String(segment.key)),
        visibleKeys: [...document.querySelectorAll('.orbit__label')].map(label => label.dataset.labelFor),
        labelKnockouts: document.querySelectorAll('.orbit__label-bg').length };
    });
    expect(Math.abs((layout.cube.left + layout.cube.right - layout.ring.left - layout.ring.right) / 2)).toBeLessThan(1);
    expect(Math.abs((layout.cube.top + layout.cube.bottom - layout.ring.top - layout.ring.bottom) / 2)).toBeLessThan(1);
    expect(layout.visibleKeys.sort()).toEqual(layout.expectedKeys.sort());
    // The approved labels sit 20 px outside the ring on the plain background: no knockout rectangle is drawn behind them.
    expect(layout.labelKnockouts).toBe(0);
    for (let i = 0; i < layout.labels.length; i++) for (let j = i + 1; j < layout.labels.length; j++) {
      const a = layout.labels[i].box, b = layout.labels[j].box;
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
        `${flow}: ${layout.labels[i].text} must not overlap ${layout.labels[j].text}`).toBe(true);
    }
    for (const label of layout.labels) {
      const a = label.box, b = layout.cube;
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
        `${flow}: ${label.text} must stay outside the Cube`).toBe(true);
      for (const marker of layout.markers) expect(a.right <= marker.left || marker.right <= a.left || a.bottom <= marker.top || marker.bottom <= a.top,
        `${flow}: ${label.text} must not cover a marker`).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/src/ui/gallery.html?flow=progress');
  const phone = await page.evaluate(() => ({
    expected: window.__f0Orbit.options.segments.map(segment => String(segment.key)).sort(),
    visible: [...document.querySelectorAll('.orbit__label')].map(label => label.dataset.labelFor).sort(),
    readableKnockouts: document.querySelectorAll('.orbit__label-bg').length,
  }));
  expect(phone.visible).toEqual(phone.expected);
  expect(phone.readableKnockouts).toBe(0);
});

test('activating a stage preserves its full label, value and delta in the visible slot detail', async ({ page }) => {
  await page.goto('/src/ui/gallery.html?flow=results');
  await expect(page.locator('.f0-orbit .orbit')).not.toHaveClass(/is-morphing/);
  const segment = page.locator('.f0-orbit [data-segment="pair 3"]');
  await expect(segment).toBeVisible();
  await segment.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.f0-slot')).toContainText('pair 3 · 1.52 · -0.33');
});

test('coach connector routes around the Cube canvas', async ({ page }) => {
  await page.goto('/src/ui/gallery.html?flow=results');
  await expect(page.locator('.ui-coach-line.is-linked')).toBeVisible();
  const intersects = await page.evaluate(() => {
    const path = document.querySelector('.ui-coach-line__connector path');
    const cube = document.querySelector('.f0-cube canvas').getBoundingClientRect();
    if (!path || !path.getTotalLength()) return false;
    const matrix = path.getScreenCTM();
    for (let step = 0; step <= 60; step++) {
      const point = path.getPointAtLength(path.getTotalLength() * step / 60);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      if (screen.x > cube.left && screen.x < cube.right && screen.y > cube.top && screen.y < cube.bottom) return true;
    }
    return false;
  });
  expect(intersects).toBe(false);
});

test('coach connector stays inside the viewport when its host has no box of its own (display: contents)', async ({ page }) => {
  await page.goto('/src/ui/gallery.html?flow=results');
  await expect(page.locator('.ui-coach-line.is-linked')).toBeVisible();
  // The Brain results screen hosts the connector in `.b-stage`, which is display: contents there: no rect, so the
  // connector is sized by a further ancestor. Measuring against the host's 0x0 rect scaled every coordinate by ~1000x.
  await page.evaluate(() => { document.querySelector('.f0-coach').style.display = 'contents'; window.dispatchEvent(new Event('resize')); });
  await expect.poll(() => page.evaluate(() => {
    const path = document.querySelector('.ui-coach-line__connector.is-linked path');
    if (!path) return 'unlinked';
    const box = path.getBoundingClientRect();
    const inside = box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1 && box.width > 0;
    return inside ? 'inside' : `outside ${JSON.stringify(box.toJSON())}`;
  })).toBe('inside');
});

test('case playback keeps a stable color-neutral frame, final state, highlights and a single canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/src/ui/gallery.html?flow=alg');
  const result = await page.evaluate(async () => {
    const [{ Cube }, { stateFromScramble, applyMoves }] = await Promise.all([
      import('/src/ui/cube/index.js'), import('/src/cross-cube.js'),
    ]);
    const host = document.createElement('div'); document.body.append(host);
    const initial = stateFromScramble("R U R' U' F2");
    const cube = new Cube(host, { mode: 'case', size: 'M', state: initial, caseColorSetting: 'any colour', caseSeed: 'f0-case-stable' });
    const canvas = cube.element.querySelector('canvas');
    let recenterCalls = 0;
    cube.cube.recenterGyro = () => { recenterCalls++; };
    document.dispatchEvent(new Event('cubesight-recenter'));
    const chosenTop = cube.displayState.cubies.find(piece => piece.position[1] === 1 && piece.id.length === 1).stickers.U;
    cube.highlight({ slot: 'pair:FR', dimOthers: true });
    const highlighted = Number(canvas.dataset.highlightedStickers);
    const dimmed = Number(canvas.dataset.dimmedStickers);
    const moves = ['R', 'U', "R'", "U'", 'F2'];
    const expected = applyMoves(initial, moves);
    await cube.play(moves, { fullTurns: true, speed: 1000 });
    const afterPlay = cube.displayState.cubies.find(piece => piece.position[1] === 1 && piece.id.length === 1).stickers.U;
    document.dispatchEvent(new Event('cubesight-theme'));
    const afterTheme = cube.displayState.cubies.find(piece => piece.position[1] === 1 && piece.id.length === 1).stickers.U;
    const matches = JSON.stringify(cube.state) === JSON.stringify(expected);
    const sameCanvas = cube.element.querySelector('canvas') === canvas;
    const mode = cube.mode;
    cube.destroy(); host.remove();
    return { chosenTop, afterPlay, afterTheme, matches, sameCanvas, mode, highlighted, dimmed, recenterCalls };
  });
  expect(result.afterPlay).toBe(result.chosenTop);
  expect(result.afterTheme).toBe(result.chosenTop);
  expect(result.matches).toBe(true);
  expect(result.sameCanvas).toBe(true);
  expect(result.mode).toBe('case');
  expect(result.highlighted).toBeGreaterThan(0);
  expect(result.dimmed).toBeGreaterThan(0);
  expect(result.recenterCalls).toBe(1);
});

test('gallery algorithm flow shows the actual PLL case with its requested red top', async ({ page }) => {
  await page.goto('/src/ui/gallery.html?flow=alg');
  const result = await page.evaluate(async () => {
    const { createSolvedState } = await import('/src/cross-cube.js');
    const cube = window.__f0Cube;
    const topLayer = cube.displayState.cubies.filter(piece => piece.position[1] === 1);
    const frontTop = cube.displayState.cubies.filter(piece => piece.position[1] === 1 && piece.stickers.F).map(piece => piece.stickers.F);
    return {
      topCenter: cube.displayState.cubies.find(piece => piece.id === 'U').stickers.U,
      topColorCount: new Set(topLayer.map(piece => piece.stickers.U)).size,
      hasPLLPattern: new Set(frontTop).size > 1,
      logicalCaseIsUnsolved: JSON.stringify(cube.state) !== JSON.stringify(createSolvedState()),
      oneCanvas: document.querySelectorAll('.f0-cube canvas').length,
    };
  });
  expect(result.topCenter).toBe('red');
  expect(result.topColorCount).toBe(1);
  expect(result.hasPLLPattern).toBe(true);
  expect(result.logicalCaseIsUnsolved).toBe(true);
  expect(result.oneCanvas).toBe(1);
});

test('Cube seek cancels an in-flight turn and mount, mode changes and session binding preserve its canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/src/ui/gallery.html');
  const result = await page.evaluate(async () => {
    const [{ Cube }, { createSolvedState, stateFromScramble }] = await Promise.all([
      import('/src/ui/cube/index.js'), import('/src/cross-cube.js'),
    ]);
    const host = document.createElement('div'), nextHost = document.createElement('div');
    document.body.append(host, nextHost);
    const base = createSolvedState();
    const cube = new Cube(host, { mode: 'case', state: base, size: 'M' });
    const canvas = cube.element.querySelector('canvas');
    const stalePlayback = cube.play(['R', 'U', 'F'], { startState: base, speed: .25 });
    await new Promise(resolve => setTimeout(resolve, 60));
    const expectedAfterSeek = cube.seek(1, ['R', 'U', 'F'], { startState: base });
    await stalePlayback;
    const seekStayedCurrent = JSON.stringify(cube.state) === JSON.stringify(expectedAfterSeek);
    cube.mount(nextHost);
    cube.setMode('replay'); cube.setMode('case');
    let gyroApplied = false;
    cube.cube.setGyroOrientation = () => { gyroApplied = true; };
    const unsubscribe = cube.bindSession({ subscribe(listener) { listener({ state: stateFromScramble('R'), gyro: { x: 0, y: 0, z: 0, w: 1 } }); return () => {}; } });
    const sessionApplied = cube.mode === 'live' && JSON.stringify(cube.state) === JSON.stringify(stateFromScramble('R')) && gyroApplied;
    const sameCanvas = canvas === nextHost.querySelector('canvas');
    unsubscribe(); cube.destroy(); host.remove(); nextHost.remove();
    return { seekStayedCurrent, sessionApplied, sameCanvas };
  });
  expect(result).toEqual({ seekStayedCurrent: true, sessionApplied: true, sameCanvas: true });
});

test('global header keeps sync and disconnect available through recovery phases', async ({ page }) => {
  await page.goto('/src/ui/gallery.html');
  const enabled = await page.evaluate(async () => {
    const { createHeader } = await import('/src/ui/shared/index.js');
    const host = document.createElement('div'); document.body.append(host);
    let listener;
    let snapshot = { phase: 'connecting', canSync: false, canDisconnect: true };
    const session = { getSnapshot: () => snapshot, subscribe(callback) { listener = callback; callback(snapshot); return () => {}; } };
    const header = createHeader(host, { session, showDevDrawer: false });
    const menus = document.querySelectorAll('.ui-cube-menu__drawer');
    const menu = menus[menus.length - 1];
    const summary = header.querySelector('.ui-cube-chip');
    const result = {};
    for (const phase of ['connecting', 'awaiting-solved', 'desynced', 'interrupted']) {
      snapshot = { phase, canSync: phase !== 'connecting', canDisconnect: true };
      listener(snapshot);
      result[phase] = Object.fromEntries(['connect', 'sync', 'recenter', 'disconnect'].map(action => [action, !menu.querySelector(`[data-cube-action="${action}"]`).disabled]));
    }
    snapshot = { phase: 'disconnected', link: { status: 'lost' }, canSync: false, canDisconnect: false };
    listener(snapshot);
    result.lostLink = {
      status: summary.getAttribute('aria-label'),
      phase: header.querySelector('.ui-cube-menu').dataset.phase,
      connect: !menu.querySelector('[data-cube-action="connect"]').disabled,
    };
    header.destroy(); host.remove(); return result;
  });
  expect(enabled.connecting).toEqual({ connect: false, sync: false, recenter: true, disconnect: true });
  for (const phase of ['awaiting-solved', 'desynced', 'interrupted']) expect(enabled[phase]).toEqual({ connect: false, sync: true, recenter: true, disconnect: true });
  expect(enabled.lostLink).toEqual({ status: 'cube, interrupted; open cube and recording actions', phase: 'interrupted', connect: true });
});

test('the shared header tracks history and solve routes and opens the dev drawer globally', async ({ page }) => {
  for (const [route, active] of [['/history', 'history'], ['/timer', 'solve']]) {
    await page.goto(`/#${route}`);
    await expect(page.locator(`.site-header [data-nav="${active}"]`)).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Backquote');
    await expect(page.locator('.ui-dev-drawer')).toBeVisible();
    await page.locator('.ui-dev-drawer__close').click();
  }
  await page.goto('/#/recording');
  await expect(page.locator('#recording-view canvas')).toHaveCount(1);
  await expect(page.locator('#recording-count')).toContainText('recording duration');
});

test('header themes stay readable and recorder survives a fast full-page reload with anonymized export', async ({ page }) => {
  await page.goto('/#/solve');
  const header = page.locator('.site-header.ui-header');
  await expect(header).toBeVisible();
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  const light = await header.locator('.ui-cube-chip').evaluate(element => getComputedStyle(element).color);
  await page.locator('#theme-toggle').click();
  const changedTheme = await page.locator('html').getAttribute('data-theme');
  expect(changedTheme).not.toBe(initialTheme);
  const dark = await header.locator('.ui-cube-chip').evaluate(element => getComputedStyle(element).color);
  expect(light).not.toBe(dark);
  await page.evaluate(async () => {
    const recorder = await import('/src/recorder.js');
    await recorder.enableRecordingPersistence();
    recorder.resetRecording();
    recorder.record('f0-fast-reload', { deviceName: 'GAN 356 i3', deviceMAC: 'AA:BB:CC:DD:EE:FF', detail: 'device id: device-id-secret-92345' });
  });
  await page.reload();
  await expect.poll(() => page.evaluate(async () => {
    const { getRecording } = await import('/src/recorder.js');
    const recording = getRecording();
    return recording.events.some(event => event.kind === 'f0-fast-reload') && recording.events.some(event => event.kind === 'reload');
  })).toBe(true);
  const exported = await page.evaluate(async () => {
    const { getRecording } = await import('/src/recorder.js');
    return JSON.stringify(getRecording());
  });
  expect(exported).toContain('GAN cube');
  expect(exported).toContain('XX:XX:XX:XX:XX:XX');
  expect(exported).not.toContain('GAN 356 i3');
  expect(exported).not.toContain('AA:BB:CC:DD:EE:FF');
  expect(exported).not.toContain('device-id-secret-92345');
  await page.locator('.ui-cube-chip').click();
  await page.locator('[data-cube-action="report-problem"]').click();
  await expect(page).toHaveURL(/#\/recording$/);
  await expect(page.locator('#recording-view')).toBeVisible();
  await expect(page.locator('#recording-count')).toContainText('local buffer');
  await page.evaluate(async () => {
    const recorder = await import('/src/recorder.js');
    recorder.clearRecording();
    recorder.record('f0-after-clear', {});
  });
  await page.reload();
  await expect.poll(() => page.evaluate(async () => {
    const { getRecording } = await import('/src/recorder.js');
    return getRecording().events.some(event => event.kind === 'f0-after-clear')
      && getRecording().events.some(event => event.kind === 'reload');
  })).toBe(true);
  const afterClear = await page.evaluate(async () => (await import('/src/recorder.js')).getRecording().events.map(event => event.kind));
  expect(afterClear).not.toContain('f0-fast-reload');
});

// Connecting a cube reaches navigator.bluetooth.requestDevice(), which only works
// while the click still carries transient user activation. Closing the modal cube
// drawer before running the action spends that activation, and mobile browsers
// enforce it strictly, so connecting from a phone failed with no visible error.
test('the cube drawer runs its action before closing, so connect keeps the click activation', async ({ page }) => {
  await page.goto('/src/ui/gallery.html');
  const observed = await page.evaluate(async () => {
    const { createHeader } = await import('/src/ui/shared/index.js');
    const host = document.createElement('div'); document.body.append(host);
    const snapshot = { phase: 'idle', canSync: true, canDisconnect: false };
    const session = { getSnapshot: () => snapshot, subscribe(callback) { callback(snapshot); return () => {}; } };
    const seen = [];
    createHeader(host, {
      title: 'cubesight', sections: [], session,
      // The gallery page mounts its own header, so always take the last drawer:
      // createHeader appends its dialog to document.body.
      actions: { connect: () => seen.push({ action: 'connect', drawerOpenDuringAction: [...document.querySelectorAll('.ui-cube-menu__drawer')].pop().open }) },
    });
    host.querySelector('.ui-cube-chip').click();
    const drawer = [...document.querySelectorAll('.ui-cube-menu__drawer')].pop();
    const openedBefore = drawer.open;
    // The enable rules are covered by the recovery-phases test above; this one is
    // only about the order of close() versus the action, so force it clickable.
    const connect = drawer.querySelector('[data-cube-action="connect"]');
    connect.disabled = false;
    connect.click();
    return { openedBefore, seen, closedAfter: !drawer.open };
  });
  expect(observed.openedBefore).toBe(true);
  expect(observed.seen).toEqual([{ action: 'connect', drawerOpenDuringAction: true }]);
  expect(observed.closedAfter).toBe(true);
});
