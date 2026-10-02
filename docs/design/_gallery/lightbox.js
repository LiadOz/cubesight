/* Shared design-gallery lightbox. Dependency-free; plain <script defer>; works from file://. See ../GALLERY.md */
(function () {
  'use strict';
  if (window.__lightbox) return;
  var LOUPE = 2.5, MIN = 0.05, MAX = 16;
  var root, stage, img, loupe, titleEl, countEl, openLink, prevB, nextB, loupeB, closeB;
  var list = [], idx = -1, lastFocus = null, scope = null; // scope: optional element limiting browsing to the images inside it
  var natW = 0, natH = 0, scale = 1, tx = 0, ty = 0, fitScale = 1, loupeOn = false;
  var pointers = new Map(), pinch = null, panStart = null, swipe = null, moved = false;

  function el(tag, cls, attrs) {
    var e = document.createElement(tag); if (cls) e.className = cls;
    for (var k in (attrs || {})) e.setAttribute(k, attrs[k]);
    return e;
  }
  function isImgHref(h) { return /\.(svg|png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(h || ''); }

  function build() {
    root = el('div', 'lb-root', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Image viewer', 'aria-hidden': 'true' });
    var bar = el('div', 'lb-bar');
    titleEl = el('div', 'lb-title'); countEl = el('div', 'lb-count');
    var hint = el('div', 'lb-hint'); hint.textContent = '← → browse · L loupe · +/− zoom · Esc close';
    loupeB = el('button', 'lb-btn', { type: 'button', 'aria-pressed': 'false', 'aria-label': 'Magnifier (L)', title: 'Magnifier (L)' }); loupeB.textContent = '🔍';
    var zo = el('button', 'lb-btn', { type: 'button', 'aria-label': 'Zoom out', title: 'Zoom out (-)' }); zo.textContent = '−';
    var zi = el('button', 'lb-btn', { type: 'button', 'aria-label': 'Zoom in', title: 'Zoom in (+)' }); zi.textContent = '+';
    openLink = el('a', 'lb-btn', { target: '_blank', rel: 'noopener', title: 'Open original in a new tab' }); openLink.textContent = 'open';
    closeB = el('button', 'lb-btn', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)' }); closeB.textContent = '✕';
    [titleEl, hint, countEl, loupeB, zo, zi, openLink, closeB].forEach(function (n) { bar.appendChild(n); });
    stage = el('div', 'lb-stage');
    img = el('img', 'lb-img', { alt: '', draggable: 'false' });
    loupe = el('div', 'lb-loupe');
    prevB = el('button', 'lb-btn lb-nav lb-prev', { type: 'button', 'aria-label': 'Previous image' }); prevB.textContent = '‹';
    nextB = el('button', 'lb-btn lb-nav lb-next', { type: 'button', 'aria-label': 'Next image' }); nextB.textContent = '›';
    stage.appendChild(img); stage.appendChild(loupe); stage.appendChild(prevB); stage.appendChild(nextB);
    root.appendChild(bar); root.appendChild(stage);
    document.body.appendChild(root);

    closeB.onclick = close; prevB.onclick = function () { go(-1); }; nextB.onclick = function () { go(1); };
    loupeB.onclick = toggleLoupe;
    zo.onclick = function () { zoomAt(1 / 1.35); }; zi.onclick = function () { zoomAt(1.35); };
    img.addEventListener('load', function () { natW = img.naturalWidth || 800; natH = img.naturalHeight || 600; fit(); });
    img.addEventListener('error', function () { titleEl.textContent = 'Could not load image'; });
    root.addEventListener('click', function (e) {
      // pointer capture retargets every click to the stage: close only for a click outside the image itself
      var r = img.getBoundingClientRect(), onImg = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (e.target === stage && !moved && !onImg) close();
    });
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('dblclick', onDbl);
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') loupe.classList.remove('lb-loupe-show'); });
    window.addEventListener('resize', function () { if (isOpen()) fit(); });
  }

  function isOpen() { return root && root.classList.contains('lb-open'); }

  function collect() {
    return Array.prototype.filter.call(document.querySelectorAll('img'), function (i) { return (!root || !root.contains(i)) && (!scope || scope.contains(i)); });
  }
  function srcFor(i) {
    var a = i.closest('a[href]');
    if (a && isImgHref(a.getAttribute('href'))) return a.href;
    return i.currentSrc || i.src;
  }
  function hrefFor(i) { var a = i.closest('a[href]'); return a ? a.href : (i.currentSrc || i.src); }
  function captionFor(i) {
    if (i.alt && i.alt.trim()) return i.alt.trim();
    var f = i.closest('figure'), c = f && f.querySelector('figcaption');
    if (c && c.textContent.trim()) return c.textContent.trim();
    var h = null, n = i;
    while (n && n !== document.body) {
      var p = n.previousElementSibling;
      while (p) { if (/^H[1-6]$/.test(p.tagName)) { h = p; break; } var q = p.querySelector && p.querySelector('h1,h2,h3,h4,h5,h6'); if (q) { h = q; break; } p = p.previousElementSibling; }
      if (h) break; n = n.parentElement;
    }
    return h ? h.textContent.trim() : (i.title || i.getAttribute('src') || 'image');
  }

  function open(i) {
    if (!root) build();
    list = collect(); idx = list.indexOf(i); if (idx < 0) return;
    lastFocus = document.activeElement;
    root.classList.add('lb-open'); root.setAttribute('aria-hidden', 'false'); document.body.classList.add('lb-lock');
    show(); closeB.focus();
  }
  function show() {
    var i = list[idx]; if (!i) return;
    var src = srcFor(i);
    img.style.visibility = 'hidden'; natW = natH = 0;
    img.alt = i.alt || ''; img.src = src;
    if (img.complete && img.naturalWidth) { natW = img.naturalWidth; natH = img.naturalHeight; fit(); }
    var cap = captionFor(i);
    titleEl.textContent = cap; titleEl.title = cap;
    countEl.textContent = (idx + 1) + ' / ' + list.length;
    openLink.href = hrefFor(i);
    prevB.style.visibility = idx > 0 ? '' : 'hidden'; nextB.style.visibility = idx < list.length - 1 ? '' : 'hidden';
    root.setAttribute('aria-label', 'Image viewer: ' + cap);
    loupe.style.backgroundImage = 'url("' + src.replace(/"/g, '%22') + '")';
  }
  function close() {
    if (!isOpen()) return;
    root.classList.remove('lb-open'); root.setAttribute('aria-hidden', 'true'); document.body.classList.remove('lb-lock');
    img.removeAttribute('src'); setLoupe(false); pointers.clear(); pinch = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function go(d) {
    var n = idx + d; if (n < 0 || n >= list.length) return;
    idx = n; show();
  }

  function apply() {
    img.style.width = natW + 'px'; img.style.height = natH + 'px';
    img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
  }
  function clamp() {
    var r = stage.getBoundingClientRect(), w = natW * scale, h = natH * scale;
    tx = w <= r.width ? (r.width - w) / 2 : Math.min(0, Math.max(r.width - w, tx));
    ty = h <= r.height ? (r.height - h) / 2 : Math.min(0, Math.max(r.height - h, ty));
  }
  function fit() {
    if (!natW) return;
    var r = stage.getBoundingClientRect();
    fitScale = Math.min(r.width / natW, r.height / natH, 1) || 1;
    // small images fit at their natural size; large ones shrink to fit
    scale = fitScale; clamp(); apply(); img.style.visibility = '';
  }
  function zoomTo(ns, cx, cy) {
    var r = stage.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    ns = Math.min(MAX, Math.max(MIN, ns));
    tx = cx - (cx - tx) * (ns / scale); ty = cy - (cy - ty) * (ns / scale);
    scale = ns; clamp(); apply();
  }
  function zoomAt(f, cx, cy) { zoomTo(scale * f, cx, cy); }
  function local(e) { var r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function onWheel(e) {
    e.preventDefault(); var p = local(e);
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p[0], p[1]);
    updateLoupe(p[0], p[1]);
  }
  function onDbl(e) {
    var p = local(e), cur = scale, dpr = window.devicePixelRatio || 1;
    // fit -> 1 image pixel per device pixel (crisp HD images on a hi-dpi screen) -> 100% -> 200% -> fit
    var steps = [fitScale], cand = [1 / dpr, 1, 2];
    for (var k = 0; k < cand.length; k++) if (cand[k] > steps[steps.length - 1] * 1.02) steps.push(cand[k]);
    var next = steps[0];
    for (var j = 0; j < steps.length - 1; j++) if (Math.abs(cur - steps[j]) < 0.02 * steps[j] + 0.005) { next = steps[j + 1]; break; }
    if (steps.length === 1) next = 2;
    zoomTo(next, p[0], p[1]);
  }
  function onDown(e) {
    if (e.target.closest('.lb-btn')) return;
    moved = false; pointers.set(e.pointerId, [e.clientX, e.clientY]);
    try { stage.setPointerCapture(e.pointerId); } catch (x) {}
    if (pointers.size === 2) {
      var a = Array.from(pointers.values());
      pinch = { d: dist(a[0], a[1]), s: scale }; panStart = null; swipe = null;
    } else if (pointers.size === 1) {
      panStart = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
      swipe = { x: e.clientX, y: e.clientY, atFit: scale <= fitScale * 1.02 };
      stage.classList.add('lb-drag');
    }
  }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function onMove(e) {
    var p = local(e);
    if (e.pointerType === 'mouse' || loupeOn) updateLoupe(p[0], p[1]);
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pointers.size === 2) {
      var a = Array.from(pointers.values()), r = stage.getBoundingClientRect();
      zoomTo(pinch.s * dist(a[0], a[1]) / pinch.d, (a[0][0] + a[1][0]) / 2 - r.left, (a[0][1] + a[1][1]) / 2 - r.top);
      moved = true; return;
    }
    if (panStart && !loupeOn) {
      var dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      tx = panStart.tx + dx; ty = panStart.ty + dy; clamp(); apply();
    }
  }
  function onUp(e) {
    pointers.delete(e.pointerId); stage.classList.remove('lb-drag');
    if (pinch && pointers.size < 2) { pinch = null; panStart = null; swipe = null; return; }
    if (swipe && e.type === 'pointerup' && pointers.size === 0) {
      var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      if (swipe.atFit && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    }
    swipe = null; panStart = null;
    setTimeout(function () { moved = false; }, 0);
  }

  function setLoupe(on) {
    loupeOn = on; stage.classList.toggle('lb-loupe-on', on);
    loupeB.setAttribute('aria-pressed', String(on));
    if (!on) loupe.classList.remove('lb-loupe-show');
  }
  function toggleLoupe() { setLoupe(!loupeOn); if (loupeOn) { var r = stage.getBoundingClientRect(); updateLoupe(r.width / 2, r.height / 2); } }
  function updateLoupe(x, y) {
    if (!loupeOn || !natW) return;
    // point under cursor in image pixels, magnified LOUPE x relative to the displayed size
    var ix = (x - tx) / scale, iy = (y - ty) / scale;
    var inside = ix >= 0 && iy >= 0 && ix <= natW && iy <= natH;
    loupe.classList.toggle('lb-loupe-show', inside);
    if (!inside) return;
    var z = scale * LOUPE, half = loupe.offsetWidth / 2;
    loupe.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    loupe.style.backgroundSize = (natW * z) + 'px ' + (natH * z) + 'px';
    loupe.style.backgroundPosition = (half - ix * z) + 'px ' + (half - iy * z) + 'px';
  }

  function trap(e) {
    var f = Array.prototype.filter.call(root.querySelectorAll('button,a[href]'), function (n) { return n.offsetParent !== null && getComputedStyle(n).visibility !== 'hidden'; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!root.contains(a)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', function (e) {
    if (!isOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); close(); }
    else if (k === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (k === 'l' || k === 'L') { e.preventDefault(); toggleLoupe(); }
    else if (k === '+' || k === '=') { e.preventDefault(); zoomAt(1.35); }
    else if (k === '-' || k === '_') { e.preventDefault(); zoomAt(1 / 1.35); }
    else if (k === '0') { e.preventDefault(); fit(); }
    else if (k === 'Tab') trap(e);
  }, true);

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var t = e.target; if (!t.closest || (root && root.contains(t))) return;
    var i = t.closest('img');
    if (!i) {
      var a = t.closest('a[href]');
      i = a && a.querySelector('img');
      if (!i && a && a.querySelector('svg') && isImgHref(a.getAttribute('href'))) {
        // an <a> wrapping an inline svg: lightbox the linked file via a stand-in image
        i = document.createElement('img'); i.src = a.href; i.alt = a.getAttribute('aria-label') || a.textContent.trim();
        i.style.display = 'none'; a.appendChild(i);
      }
    }
    if (!i) return;
    e.preventDefault(); open(i);
  });

  window.__lightbox = { open: open, close: close, setScope: function (el) { scope = el || null; } };
})();
