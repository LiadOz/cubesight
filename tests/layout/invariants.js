export async function inspectLayout(page, cell) {
  // The Cube mounts after a lazy chunk; wait for it (bounded) so a slow load is not a missing Cube.
  // A Cube that never appears still fails the canvas-count check.
  if ((cell.expectedCanvasCount ?? 1) > 0) await page.waitForFunction(count => document.querySelectorAll("canvas").length >= count, cell.expectedCanvasCount ?? 1, { timeout: 5000 }).catch(() => {});
  const result = await page.evaluate(async ({ width, height, routeId, routeFamily, routePath, expectedView, expectedBrainStyle, expectDebugDrawer, expectSettingsDrawer, expectConnectionMenu, expectedCanvasCount = 1, driverFailure, state, theme }) => {
    const { polygonIntersectsRect } = await import('/src/ui/cube/bounds.js');
    const errors = [];
    if (driverFailure) {
      const r = document.body?.getBoundingClientRect();
      errors.push({ kind: 'state-driver-failed', selector: 'body', box: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null, detail: driverFailure });
    }
    const selectorFor = node => {
      if (!node) return 'document';
      if (node.id) return `#${CSS.escape(node.id)}`;
      const parts = [];
      let current = node;
      while (current && current !== document.body && parts.length < 5) {
        const data = [...current.attributes].find(attr => attr.name.startsWith('data-') && attr.value);
        let part = current.tagName.toLowerCase();
        if (data) part += `[${data.name}="${CSS.escape(data.value)}"]`;
        else if (current.classList?.length) part += `.${[...current.classList].slice(0, 2).map(CSS.escape).join('.')}`;
        const parent = current.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter(item => item.tagName === current.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
        if (current?.id) { parts.unshift(`#${CSS.escape(current.id)}`); break; }
      }
      return parts.join(' > ') || node.tagName.toLowerCase();
    };
    const add = (kind, node, detail) => {
      const r = node?.getBoundingClientRect?.();
      errors.push({
        kind,
        selector: selectorFor(node),
        box: r ? { x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) } : null,
        detail,
      });
    };
    const scrolling = document.scrollingElement;
    if (scrolling.scrollWidth > innerWidth + 1) add('horizontal-scroll', scrolling, `scrollWidth ${scrolling.scrollWidth} > ${innerWidth}`);
    scrollBy(500, 0);
    if (scrollX !== 0) add('horizontal-scroll-position', scrolling, `scrollX became ${scrollX}`);
    scrollTo(0, 0);

    const isVisible = el => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (el.closest('.sr-only,.visually-hidden,.b-sr,.mg-sr')) return false;
      for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) {
        const parentStyle = getComputedStyle(ancestor);
        if (parentStyle.display === 'none' || (ancestor !== el && +parentStyle.opacity === 0)) return false;
        if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
          const summary = ancestor.querySelector(':scope > summary');
          if (ancestor !== el && !summary?.contains(el)) return false;
        }
      }
      if (el.matches('[data-hit-area]')) return style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      return style.visibility !== 'hidden' && +style.opacity !== 0 && r.width > 0 && r.height > 0;
    };
    if (expectedView && !isVisible(document.querySelector(expectedView))) add('route-view-missing', document.querySelector('main'), `expected visible ${expectedView} for ${routePath}`);
    if (document.documentElement.dataset.theme !== theme.split('-')[0]) add('theme-mismatch', document.documentElement, `expected ${theme.split('-')[0]}, observed ${document.documentElement.dataset.theme || '(unset)'}`);
    if (expectedBrainStyle && document.querySelector('#brain-view .brain')?.dataset.brainStyle !== expectedBrainStyle) add('brain-style-mismatch', document.querySelector('#brain-view .brain') || document.querySelector('#brain-view'), `expected ${expectedBrainStyle} Orbit skin`);
    if (document.querySelector('footer, .site-footer, [data-site-footer]')) add('site-footer-present', document.querySelector('footer, .site-footer, [data-site-footer]'), 'the site has no footer');
    if (expectDebugDrawer && ![...document.querySelectorAll('[data-global-dev-drawer], #brain-debug, [role="dialog"][aria-label*="dev" i]')].some(isVisible)) add('debug-drawer-shortcut', document.querySelector('.site-header'), 'backtick must open the shared dev drawer on every page');
    const openDrawer = [...document.querySelectorAll('[data-global-dev-drawer], #brain-debug, [role="dialog"][aria-label*="dev" i]')].find(isVisible);
    if (expectDebugDrawer && openDrawer && !/save recording/i.test(openDrawer.textContent || '')) add('dev-drawer-recording-action', openDrawer, 'dev drawer needs save recording');
    if (expectSettingsDrawer && ![...document.querySelectorAll('.b-settings[open], [data-settings-drawer][open], [role="dialog"][aria-label*="settings" i]')].some(isVisible)) add('settings-drawer-closed', document.querySelector('#brain-view'), 'settings state did not open the settings drawer');
    if (expectConnectionMenu) {
      const menu = [...document.querySelectorAll('[data-global-cube-menu], [role="menu"], [role="dialog"][aria-label*="cube" i]')].find(isVisible);
      if (!menu) add('connection-menu-closed', document.querySelector('header'), 'global cube control did not open its menu');
      else for (const action of ['connect', 'sync', 'recenter', 'disconnect', 'forget', 'save recording', 'report a problem']) {
        if (!menu.textContent.toLowerCase().includes(action)) add('connection-menu-action-missing', menu, `missing ${action} action`);
      }
    }
    const header = document.querySelector('.site-header');
    if (!header) add('header-missing', document.querySelector('main'), 'shared site header is missing');
    else {
      const border = getComputedStyle(header);
      const before = getComputedStyle(header, '::before');
      const after = getComputedStyle(header, '::after');
      const pseudoLine = [before, after].some(pseudo => pseudo.content !== 'none' && pseudo.content !== 'normal' && parseFloat(pseudo.height) <= 2 && pseudo.position !== 'static');
      if ((border.borderBottomStyle !== 'none' && parseFloat(border.borderBottomWidth) > 0) || pseudoLine) add('header-separator', header, 'a line separates the header and page');
      if (!header.querySelector('[data-global-cube-control], [aria-label*="cube" i], [aria-label*="GAN" i]')) add('global-cube-control-missing', header, 'header needs the global cube connection chip/menu');
    }
    for (const el of document.querySelectorAll('body *')) {
      if (!isVisible(el)) continue;
      const allowedScroller = el.closest('[data-scroll-x]');
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > innerWidth + 1) {
        if (!allowedScroller) add('offscreen-x', el, `bounds [${r.left.toFixed(1)}, ${r.right.toFixed(1)}] outside [0, ${innerWidth}]`);
        else {
          const sr = allowedScroller.getBoundingClientRect();
          if (sr.left < -1 || sr.right > innerWidth + 1) add('scroller-offscreen', allowedScroller, 'horizontal scroller itself must fit viewport');
          if (getComputedStyle(allowedScroller).overflowX === 'visible' && allowedScroller.scrollWidth > allowedScroller.clientWidth + 1) add('scroller-not-scrollable', allowedScroller, 'data-scroll-x requires overflow-x auto/scroll');
        }
      }
      if (el.matches('button,a,[role="button"],input,select,summary,[data-hit-area]') && width <= 390) {
        const hit = el.closest('[data-hit-area]') || el.closest('button,a,[role="button"],input,select,summary') || el;
        const hitRect = hit.getBoundingClientRect();
        let hitWidth = hitRect.width, hitHeight = hitRect.height;
        if (el instanceof SVGGraphicsElement && hit === el) {
          const style = getComputedStyle(el);
          const matrix = el.getScreenCTM();
          const scale = style.vectorEffect === 'non-scaling-stroke' ? 1 : Math.min(Math.hypot(matrix?.a ?? 1, matrix?.b ?? 0), Math.hypot(matrix?.c ?? 0, matrix?.d ?? 1));
          const stroke = (parseFloat(style.strokeWidth) || 0) * scale;
          hitWidth = Math.max(hitWidth, stroke); hitHeight = Math.max(hitHeight, stroke);
        }
        if (hitWidth < 40 || hitHeight < 40) add('small-touch-target', hit, `${hitWidth.toFixed(1)}×${hitHeight.toFixed(1)}; minimum 40×40 including hit padding/stroke`);
      }
      if (el.matches('p,span,label,button,a,h1,h2,h3,li,td,th') && el.textContent.trim() && r.width > 2 && r.height > 2 /* a 1px sr-only box is clipped on purpose */ && el.scrollWidth > el.clientWidth + 1) {
        const style = getComputedStyle(el);
        if (style.display === 'inline' || (style.overflowX !== 'hidden' && style.overflowX !== 'clip' && style.whiteSpace !== 'nowrap' && !style.webkitLineClamp)) continue;
        const full = el.getAttribute('title') || el.getAttribute('aria-label');
        if (!(style.textOverflow === 'ellipsis' && full)) add('clipped-text', el, `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}; no labelled ellipsis`);
      }
    }

    const visible = selector => [...document.querySelectorAll(selector)].filter(isVisible).map(el => ({ el, r: el.getBoundingClientRect() }));
    const intersects = (a, b) => a.r.left < b.r.right - 1 && a.r.right > b.r.left + 1 && a.r.top < b.r.bottom - 1 && a.r.bottom > b.r.top + 1;
    for (const drawer of document.querySelectorAll('.b-settings-body')) {
      if (!isVisible(drawer)) continue;
      const rows = [...drawer.children].filter(isVisible).map(el => ({ el, r: el.getBoundingClientRect() }));
      for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
        if (intersects(rows[i], rows[j])) add('settings-content-overlap', rows[j].el, `overlaps ${selectorFor(rows[i].el)}`);
      }
    }
    const keyGroups = [
      ['header', '.site-header, .ui-header, [data-shared-header]'], ['cube', '#brain-cube canvas, .cube-stage canvas, .tm-preview canvas, .history-cube canvas, .progress-cube-mount canvas, [data-cube] canvas, .shared-cube canvas'],
      ['rail', '.b-aside, [data-ui-rail]'], ['actions', '.b-results-actions, .ui-actions, [data-ui-actions]'], ['key-bar', '.b-keybar, .b-keys, .ui-key-bar, [data-key-bar]'],
    ];
    const boxes = keyGroups.map(([name, selector]) => [name, visible(selector)]).filter(([, nodes]) => nodes.length);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      for (const a of boxes[i][1]) for (const b of boxes[j][1]) if (intersects(a, b)) add('key-ui-overlap', a.el, `${boxes[i][0]} overlaps ${boxes[j][0]}`);
    }
    const labels = visible('[data-orbit-label], .orbit-label, .orbit__label, .o-label, .ui-orbit-label, .shared-orbit [data-label], .tm-orbit-label, #brain-timeline .m-label, #brain-timeline .b-oring-label');
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (intersects(labels[i], labels[j])) add('orbit-label-overlap', labels[i].el, `overlaps ${labels[j].el.className || labels[j].el.tagName}`);
    const labelObstacles = keyGroups.filter(([name]) => name !== 'header').flatMap(([name, selector]) => visible(selector).map(box => ({ name, ...box,
      r: name === 'cube' && typeof box.el.getRenderedCubeBounds === 'function' ? box.el.getRenderedCubeBounds() || box.r : box.r,
    })));
    for (const label of labels) for (const obstacle of labelObstacles) {
      const overlaps = obstacle.r.points ? polygonIntersectsRect(obstacle.r.points, label.r) : intersects(label, obstacle);
      if (overlaps) add('orbit-label-key-overlap', label.el, `orbit label overlaps ${obstacle.name}`);
    }

    const canvases = [...document.querySelectorAll('canvas')];
    if (canvases.length !== expectedCanvasCount) add('canvas-count', canvases[0] || document.querySelector('main'), `expected ${expectedCanvasCount} page canvas(es), found ${canvases.length} (${canvases.filter(isVisible).length} visible)`);
    const coreNoScroll = ['solve', 'drills', 'algs', 'timer', 'demo'].includes(routeFamily);
    if (coreNoScroll && width >= 1280 && height >= 720 && scrolling.scrollHeight > innerHeight + 2) {
      add('vertical-scroll-main-page', scrolling, `scrollHeight ${scrolling.scrollHeight} > ${innerHeight} + 2`);
    }
    const focused = document.activeElement;
    if (focused?.matches(':focus-visible') && focused !== document.body && focused !== document.documentElement) {
      const style = getComputedStyle(focused);
      if ((style.outlineStyle === 'none' || parseFloat(style.outlineWidth) === 0) && style.boxShadow === 'none') add('focus-outline-missing', focused, 'focused control has no outline or focus shadow');
    }
    for (const scroller of document.querySelectorAll('[data-scroll-x]')) {
      if (!isVisible(scroller)) continue;
      const style = getComputedStyle(scroller);
      const box = scroller.getBoundingClientRect();
      if (box.left < -1 || box.right > innerWidth + 1) add('scroller-offscreen', scroller, `scroller bounds [${box.left.toFixed(1)}, ${box.right.toFixed(1)}] outside viewport`);
      if (!['auto', 'scroll'].includes(style.overflowX) && scroller.scrollWidth > scroller.clientWidth + 1) add('scroller-not-scrollable', scroller, 'data-scroll-x requires overflow-x auto/scroll');
      if (scroller.tabIndex < 0 && !scroller.querySelector('a,button,input,select,[tabindex="0"]')) add('scroller-not-keyboard-accessible', scroller, 'horizontal scroller needs keyboard focus or a focusable descendant');
    }
    const shifts = window.__layoutShiftSamples || [];
    const newShifts = shifts.slice(window.__layoutShiftCheckpoint || 0);
    const shift = newShifts.reduce((max, item) => Math.max(max, item), 0);
    if (shift > 4) add('layout-shift', document.querySelector('main'), `lazy/layout movement reached ${shift.toFixed(1)} px (maximum 4 px)`);
    window.__layoutShiftCheckpoint = shifts.length;
    return {
      errors,
      scrollers: [...document.querySelectorAll('[data-scroll-x]')].filter(isVisible).map(selectorFor),
      scroll: { x: scrollX, width: scrolling.scrollWidth, height: scrolling.scrollHeight },
      cell: { width, height, route: routeId, state, theme },
    };
  }, cell);

  for (const selector of result.scrollers) {
    const scroller = page.locator(selector).first();
    // A scroller that re-renders between sampling and probing (a move guide
    // replaced by a new scramble) is not a layout fault; skip it.
    if (!await scroller.waitFor({ state: 'attached', timeout: 1500 }).then(() => true, () => false)) continue;
    // An open modal dialog makes everything behind it inert; keyboard probing
    // is meaningful only for scrollers inside the dialog (or with none open).
    if (await scroller.evaluate(el => { const modal = [...document.querySelectorAll('dialog:modal')].at(-1); return Boolean(modal && !modal.contains(el)); }, undefined, { timeout: 3000 }).catch(() => false)) continue;
    const probe = { timeout: 3000 };
    try {
      const before = await scroller.evaluate(el => {
        const original = el.scrollLeft;
        el.scrollLeft = 0;
        window.__layoutPreviousFocus = document.activeElement;
        window.__layoutPageScroll = { x: scrollX, y: scrollY };
        return { left: el.scrollLeft, max: el.scrollWidth - el.clientWidth, original };
      }, undefined, probe);
      const restore = () => scroller.evaluate((el, original) => { el.scrollLeft = original; window.__layoutPreviousFocus?.focus?.({ preventScroll: true }); window.scrollTo(window.__layoutPageScroll?.x ?? 0, window.__layoutPageScroll?.y ?? 0); delete window.__layoutPreviousFocus; delete window.__layoutPageScroll; }, before.original, probe);
      if (before.max <= 1) { await restore(); continue; }
      let after = 0;
      try {
        // A scroller with its own tab stop is driven with End. One without (a rail of
        // links) is driven the way a keyboard user does it: Tab to the last link, and the
        // browser scrolls the focused link into view.
        const ownStop = await scroller.evaluate(el => el.tabIndex >= 0, undefined, probe);
        if (ownStop) {
          await scroller.evaluate(el => el.focus({ preventScroll: true }), undefined, probe);
          await scroller.press('End', probe);
        } else {
          await scroller.evaluate(el => { const stops = [...el.querySelectorAll('a[href],button,input,select,[tabindex="0"]')]; stops.at(-1)?.focus(); }, undefined, probe);
        }
        // Scrollers may use CSS smooth scrolling; give the animation time to land.
        for (let i = 0; i < 20 && after <= before.left; i++) {
          after = await scroller.evaluate(el => el.scrollLeft, undefined, probe);
          if (after <= before.left) await page.waitForTimeout(50);
        }
      } finally { await restore().catch(() => {}); }
      if (after <= before.left) {
        const box = await scroller.boundingBox();
        result.errors.push({ kind: 'scroller-not-keyboard-scrollable', selector, box, detail: 'End did not move the horizontal scroller' });
      }
    } catch (error) {
      if (!/Timeout/.test(String(error))) throw error;
    }
  }

  const sticky = await page.evaluate(async ({ routeFamily }) => {
    if (!['scroll', 'results', 'history', 'progress'].includes(routeFamily)) return [];
    const root = document.scrollingElement;
    const positions = [0, Math.max(0, (root.scrollHeight - innerHeight) / 2), Math.max(0, root.scrollHeight - innerHeight)];
    const found = [];
    for (const top of positions) {
      scrollTo(0, top);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const header = document.querySelector('.site-header')?.getBoundingClientRect();
      for (const el of document.querySelectorAll('body *')) {
        const pos = getComputedStyle(el).position;
        if (pos !== 'sticky' && pos !== 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const box = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) };
        if ((r.top < -1 || r.bottom > innerHeight + 1)) found.push({ selector: el.id ? `#${el.id}` : el.className ? `${el.tagName.toLowerCase()}.${String(el.className).replaceAll(' ', '.')}` : el.tagName.toLowerCase(), box, detail: `sticky element outside viewport at scrollY=${top}` });
        if (header && !el.matches('dialog[open]:modal') && el !== document.querySelector('.site-header') && r.top < header.bottom - 1 && r.bottom > header.top + 1) found.push({ selector: el.id ? `#${el.id}` : el.tagName.toLowerCase(), box, detail: 'sticky element covers the header' });
      }
      if (['results', 'history', 'progress'].includes(routeFamily)) {
        for (const [name, selector] of [['cube', '#brain-cube canvas, .tm-preview canvas, .history-stage__cube canvas, .history-cube canvas, .progress-cube-mount canvas, [data-cube] canvas'], ['orbit', '.history-stage__orbit, #brain-timeline, [data-orbit], .orbit, .tm-orbit, .tm-ring']]) {
          // Selectors are in priority order: the focal cube/orbit of the page, not a list-row mini ring.
          const target = selector.split(', ').flatMap(one => [...document.querySelectorAll(one)]).find(el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
          });
          if (target) {
            const r = target.getBoundingClientRect();
            if (r.top < -1 || r.bottom > innerHeight + 1) found.push({ selector: target.id ? `#${target.id}` : selector, box: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) }, detail: `${name} leaves the viewport at scrollY=${top}` });
          } else if (routeFamily !== 'scroll') found.push({ selector, box: null, detail: `scrolling ${routeFamily} screen has no visible ${name}` });
        }
      }
    }
    scrollTo(0, 0);
    return found;
  }, { routeFamily: cell.routeFamily });
  result.errors.push(...sticky.map(item => ({ kind: 'sticky-scroll', selector: item.selector, box: item.box, detail: item.detail })));
  const counts = {};
  for (const error of result.errors) counts[error.kind] = (counts[error.kind] || 0) + 1;
  result.totalErrors = result.errors.length;
  result.counts = counts;
  result.errors = result.errors.slice(0, 80);
  return result;
}

export async function saveFailure(page, report, filePath, frameId = 'F8') {
  const selector = report.errors[0]?.selector;
  let diagnosticStyle = null;
  if (selector) {
    await page.evaluate(({ sel, frameId }) => {
      document.querySelectorAll('[data-layout-failure], [data-layout-frame]').forEach(el => { el.removeAttribute('data-layout-failure'); el.removeAttribute('data-layout-frame'); });
      try {
        const target = document.querySelector(sel);
        target?.setAttribute('data-layout-failure', 'true');
        target?.setAttribute('data-layout-frame', frameId);
      } catch { /* diagnostic selector only */ }
    }, { sel: selector, frameId });
    diagnosticStyle = await page.addStyleTag({ content: '[data-layout-failure="true"]{outline:3px solid #ff3355!important;outline-offset:2px!important;background-color:#ff335533!important;position:relative}[data-layout-failure="true"]::before{content:attr(data-layout-frame) " ①";position:absolute;left:0;top:0;z-index:99999;background:#ff3355;color:white;font:700 14px/1.4 sans-serif;padding:0 5px}' }).catch(() => null);
  }
  try { await page.screenshot({ path: filePath, fullPage: false }).catch(() => {}); }
  finally {
    await diagnosticStyle?.evaluate(style => style.remove()).catch(() => {});
    await page.evaluate(() => document.querySelectorAll('[data-layout-failure], [data-layout-frame]').forEach(el => { el.removeAttribute('data-layout-failure'); el.removeAttribute('data-layout-frame'); })).catch(() => {});
  }
}
