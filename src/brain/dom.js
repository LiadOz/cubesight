// In-place DOM updates for the Brain. Update paths never rebuild markup, so
// static text doesn't flicker and entry animations play only for new nodes.

/** Reconcile a container's children with keyed items ({key, text, className, title}). */
export function reconcileChildren(container, items, tag = 'p') {
  const byKey = new Map();
  for (const el of container.children) if (el.dataset.key != null && !byKey.has(el.dataset.key)) byKey.set(el.dataset.key, el);
  const wanted = items.map(item => {
    let el = byKey.get(item.key);
    if (!el) { el = document.createElement(tag); el.dataset.key = item.key; }
    byKey.delete(item.key);   // a duplicate key gets its own element
    return el;
  });
  const keep = new Set(wanted);
  for (const el of [...container.children]) if (!keep.has(el)) el.remove();
  let cursor = container.firstElementChild;
  items.forEach((item, i) => {
    const el = wanted[i];
    if (el.className !== (item.className ?? '')) el.className = item.className ?? '';
    if (el.textContent !== item.text) el.textContent = item.text;
    const title = item.title ?? '';
    if ((el.getAttribute('title') ?? '') !== title) { if (title) el.setAttribute('title', title); else el.removeAttribute('title'); }
    if (el === cursor) cursor = cursor.nextElementSibling;
    else container.insertBefore(el, cursor);
  });
}

export function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

export function setAttr(el, name, value) {
  if (!el) return;
  if (value == null || value === false) { if (el.hasAttribute(name)) el.removeAttribute(name); return; }
  const v = value === true ? '' : String(value);
  if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}

export function setStyle(el, prop, value) {
  if (!el) return;
  const v = value == null ? '' : String(value);
  if (el.style.getPropertyValue(prop) !== v) el.style.setProperty(prop, v);
}

export function toggleClass(el, name, on) { if (el && el.classList.contains(name) !== Boolean(on)) el.classList.toggle(name, Boolean(on)); }

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Create an SVG element with attributes. */
export function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  return el;
}
