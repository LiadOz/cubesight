import './shared.css';
import './approved-widgets.css';
import './families.css';
import { APP_NAME } from '../../copy/nav.js';
import { createToastSlot as mountToastSlot } from './families.js';
import { buildSharedViewModel } from './snapshot-model.js';
export { createBreadcrumbs, createCountPill, createDialog, createDisclosure, createFileInput, createFilledInput, createFilledSelect, createGroup, createLineChart, createListRow, createMoveDisplay, createNavigationRail, createPanel, createRangeInput, createRightDrawer, createSection, createSectionHeader, createSearch, createTextarea, createTimerReadout, createWipeComparison } from './families.js';

export function createHeader(host, { title = APP_NAME, sections = ['solve', 'drills', 'algs', 'progress', 'history'], active = 'solve', compass = null, session = null, actions = {}, help = null, themeToggle = true, showDevDrawer = true } = {}) {
  const header = document.createElement('header'); header.className = 'site-header ui-header';
  const brand = document.createElement('a'); brand.className = 'brand ui-header__brand'; brand.href = '#/'; brand.textContent = title.toLowerCase(); brand.setAttribute('aria-label', `${title} home`);
  const nav = document.createElement('nav'); nav.className = 'main-nav'; nav.setAttribute('aria-label', 'Main');
  nav.dataset.scrollX = 'true'; nav.tabIndex = 0;
  nav.addEventListener('keydown', event => {
    if (event.target !== nav || !['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Home') nav.scrollLeft = 0;
    else if (event.key === 'End') nav.scrollLeft = nav.scrollWidth - nav.clientWidth;
    else nav.scrollLeft += event.key === 'ArrowLeft' ? -80 : 80;
  });
  sections.forEach((section, index) => {
    const item = typeof section === 'string' ? { id: section, href: `#/${section === 'solve' ? '' : section}`, label: section } : section;
    const link = document.createElement('a'); link.className = 'nav-link'; link.dataset.nav = item.id; link.href = item.href; link.textContent = item.label;
    if (item.id === active) { link.classList.add('active'); link.setAttribute('aria-current', 'page'); }
    if (index) nav.append(' '); nav.append(link);
  });
  const controls = document.createElement('div'); controls.className = 'header-actions ui-header__actions';
  const themeButton = document.createElement('button'); themeButton.id = 'theme-toggle'; themeButton.type = 'button'; themeButton.className = 'header-button theme-button'; themeButton.setAttribute('aria-label', 'theme'); themeButton.innerHTML = '<svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg><svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><span class="theme-label" aria-hidden="true">dark</span>';
  if (themeToggle) controls.append(themeButton);
  const cubeMenu = document.createElement('div'); cubeMenu.className = 'ui-cube-menu';
  const summary = document.createElement('button'); summary.type = 'button'; summary.className = 'ui-cube-chip'; summary.setAttribute('aria-label', 'cube connection and recording');
  const dot = document.createElement('i'); dot.className = 'ui-cube-chip__dot'; const description = document.createElement('span'); description.className = 'ui-cube-chip__name'; const battery = document.createElement('span'); battery.className = 'ui-cube-chip__battery';
  summary.append(dot, description, battery, document.createTextNode('⌄'));
  const menu = document.createElement('dialog'); menu.className = 'ui-cube-menu__drawer'; menu.setAttribute('aria-label', 'Cube and recording actions');
  const menuHead = document.createElement('div'); menuHead.className = 'ui-cube-menu__head';
  const menuTitle = document.createElement('h2'); menuTitle.textContent = 'cube and recording';
  const menuClose = document.createElement('button'); menuClose.type = 'button'; menuClose.className = 'ui-cube-menu__close'; menuClose.textContent = 'close'; menuClose.addEventListener('click', () => menu.close());
  menuHead.append(menuTitle, menuClose);
  const menuItems = document.createElement('div'); menuItems.className = 'ui-cube-menu__items'; menuItems.setAttribute('role', 'menu');
  menu.addEventListener('click', event => { if (event.target === menu) menu.close(); });
  const actionsForMenu = [['connect', 'connect'], ['sync', 'sync solved cube'], ['recenter', 'recenter'], ['disconnect', 'disconnect'], ['forget', 'forget saved cube'], ['save-recording', 'save recording'], ['report-problem', 'report a problem']];
  actionsForMenu.forEach(([id, label]) => { const button = document.createElement('button'); button.type = 'button'; button.dataset.cubeAction = id; button.textContent = label; button.setAttribute('role', 'menuitem'); button.addEventListener('click', () => { menu.close(); actions[id]?.(); }); menuItems.append(button); });
  menu.append(menuHead, menuItems);
  summary.addEventListener('click', () => { if (!menu.open) menu.showModal(); });
  cubeMenu.append(summary); controls.append(cubeMenu); document.body.append(menu);
  const helpButton = document.createElement('button'); helpButton.type = 'button'; helpButton.className = 'header-button help-button'; helpButton.dataset.action = 'open-help'; helpButton.setAttribute('aria-label', 'help'); helpButton.textContent = '?'; helpButton.addEventListener('click', () => help?.()); controls.append(helpButton);
  let drawer = null;
  const openDrawer = () => { if (!showDevDrawer) return; if (!drawer) {
    drawer = document.createElement('dialog'); drawer.className = 'ui-dev-drawer'; drawer.dataset.globalDevDrawer = 'true'; drawer.setAttribute('aria-label', 'developer drawer');
    const heading = document.createElement('h2'); heading.textContent = 'developer drawer'; const close = document.createElement('button'); close.type = 'button'; close.className = 'ui-dev-drawer__close'; close.textContent = 'close'; close.addEventListener('click', () => drawer.close());
    const save = document.createElement('button'); save.type = 'button'; save.textContent = 'save recording'; save.addEventListener('click', () => actions['save-recording']?.());
    const status = document.createElement('p'); status.className = 'ui-dev-drawer__status'; status.textContent = 'The local recording buffer is always on.';
    drawer.append(close, heading, status, save); document.body.append(drawer);
  } if (!drawer.open) drawer.showModal(); };
  if (showDevDrawer) {
    const onDevKey = event => { if (event.key === '`' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) { event.preventDefault(); openDrawer(); } };
    document.addEventListener('keydown', onDevKey);
    header.addEventListener('cube-header-destroy', () => document.removeEventListener('keydown', onDevKey), { once: true });
  }
  header.append(brand, nav, controls); if (compass) header.querySelector('.ui-header__brand').after(compass);
  // Phone (A-09 / A-12): the header is ONE row, the wordmark and the cube pill. Going across is the nav drawer, opened by the
  // wordmark; it reuses the cube menu's drawer. The real nav (and the theme / help buttons) move into it, so there is one of each.
  const navDrawer = document.createElement('dialog'); navDrawer.className = 'ui-nav-drawer'; navDrawer.setAttribute('aria-label', 'Navigation');
  const navHead = document.createElement('div'); navHead.className = 'ui-nav-drawer__head';
  const navTitle = document.createElement('h2'); navTitle.textContent = title.toLowerCase();
  const navClose = document.createElement('button'); navClose.type = 'button'; navClose.className = 'ui-nav-drawer__close'; navClose.textContent = 'close'; navClose.addEventListener('click', () => navDrawer.close());
  navHead.append(navTitle, navClose);
  const navItems = document.createElement('div'); navItems.className = 'ui-nav-drawer__items';
  navDrawer.append(navHead, navItems);
  navDrawer.addEventListener('click', event => { if (event.target === navDrawer || event.target.closest('a, button:not(.ui-nav-drawer__close)')) navDrawer.close(); });
  document.body.append(navDrawer);
  const phoneQuery = window.matchMedia('(max-width: 720px)');
  const placeNavigation = () => {
    if (phoneQuery.matches) navItems.append(nav, ...(themeToggle ? [themeButton] : []), helpButton);
    else { controls.before(nav); if (themeToggle) controls.prepend(themeButton); controls.append(helpButton); if (navDrawer.open) navDrawer.close(); }
    brand.setAttribute('aria-label', phoneQuery.matches ? `${title} menu` : `${title} home`);
    if (phoneQuery.matches) brand.setAttribute('aria-haspopup', 'dialog'); else brand.removeAttribute('aria-haspopup');
  };
  placeNavigation(); phoneQuery.addEventListener('change', placeNavigation);
  brand.addEventListener('click', event => { if (!phoneQuery.matches) return; event.preventDefault(); if (!navDrawer.open) navDrawer.showModal(); });
  header.addEventListener('cube-header-destroy', () => phoneQuery.removeEventListener('change', placeNavigation), { once: true });
  host.append(header);
  if (host.id === 'site-header' || host.matches('[data-site-header]')) {
    const syncHeaderHeight = () => document.documentElement.style.setProperty('--site-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    syncHeaderHeight();
    const headerResizeObserver = new ResizeObserver(syncHeaderHeight);
    headerResizeObserver.observe(header);
    header.addEventListener('cube-header-destroy', () => headerResizeObserver.disconnect(), { once: true });
  }
  const applySnapshot = snapshot => {
    const model = buildSharedViewModel({ connection: snapshot, theme: document.documentElement.dataset.theme,
      activeRoute: nav.querySelector('[aria-current="page"]')?.dataset.nav, connectionMenuOpen: cubeMenu.open,
      developerDrawerAvailable: showDevDrawer, developerDrawerOpen: Boolean(drawer?.open), forgetAvailable: actions.forgetAvailable?.() });
    const connection = model.header.connection;
    description.textContent = connection.name; description.title = connection.statusText; battery.textContent = connection.batteryPercent == null ? '' : `${connection.batteryPercent}%`; cubeMenu.dataset.phase = connection.phase;
    summary.setAttribute('aria-label', `${connection.name}, ${connection.statusText}${connection.batteryPercent == null ? '' : `, battery ${connection.batteryPercent}%`}; open cube and recording actions`);
    dot.className = `ui-cube-chip__dot is-${connection.phase}`;
    for (const button of menu.querySelectorAll('[data-cube-action]')) button.disabled = !model.connectionMenu.actions.find(item => item.id === button.dataset.cubeAction)?.enabled;
    const setupName = themeButton.querySelector('.theme-label'); if (setupName) setupName.textContent = document.documentElement.dataset.theme || 'dark';
  };
  const unsubscribe = session?.subscribe?.(applySnapshot);
  const themeObserver = new MutationObserver(() => applySnapshot(session?.getSnapshot?.() || {}));
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  header.destroy = () => { header.dispatchEvent(new Event('cube-header-destroy')); unsubscribe?.(); themeObserver.disconnect(); drawer?.remove(); menu.remove(); navDrawer.remove(); header.remove(); };
  header.openDeveloperDrawer = openDrawer;
  header.getViewModel = ({ route = '/', recording = null } = {}) => buildSharedViewModel({
    route, title, activeRoute: nav.querySelector('[aria-current="page"]')?.dataset.nav,
    theme: document.documentElement.dataset.theme, connection: session?.getSnapshot?.() || {},
    connectionMenuOpen: cubeMenu.open, developerDrawerAvailable: showDevDrawer,
    developerDrawerOpen: Boolean(drawer?.open), forgetAvailable: actions.forgetAvailable?.(), recording,
  });
  return header;
}

export function createKeyBar(host, keys = []) {
  const bar = document.createElement('div'); bar.className = 'ui-key-bar'; bar.setAttribute('aria-label', 'keyboard shortcuts');
  keys.slice(0, 3).forEach(({ key, label }) => {
    const item = document.createElement('span');
    const pair = Array.isArray(key) ? key : (typeof key === 'string' && key.includes('–') ? key.split('–').map(part => part.trim()) : key === '[ ]' ? ['[', ']'] : null);
    const kbd = document.createElement('kbd'); kbd.className = `key${pair?.length === 2 ? ' key--pair' : ''}`;
    if (pair?.length === 2) pair.forEach((part, index) => { if (index) kbd.append(document.createTextNode('–')); const cap = document.createElement('i'); cap.textContent = part; kbd.append(cap); });
    else kbd.textContent = String(key);
    const text = document.createElement('span'); text.textContent = label; item.append(kbd, text); bar.append(item);
  });
  host.append(bar); return bar;
}

const coachLines = new WeakMap();
/** Where the sentence's own text ends: the last line box of its text, not the right edge of the (full width) paragraph. */
function textEnd(sentence) {
  const range = document.createRange(); range.selectNodeContents(sentence);
  const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
  range.detach?.();
  const last = rects.at(-1);
  if (last) return { x: last.right, y: last.top + last.height / 2 };
  const box = sentence.getBoundingClientRect();
  return { x: box.left, y: box.top + box.height / 2 };
}

/**
 * Coach sentence with the A-05 dotted connector to a selected Orbit marker (W-20: one sentence in the rail and a
 * dotted curve to its marker). The curve leaves the end of the sentence's text and is always the short Bezier.
 * Exactly one coach line (and one connector) exists per connector host: creating another replaces the old one.
 */
export function createCoachLine(host, { text = '', marker = null, orbit = null, connectorHost = host } = {}) {
  coachLines.get(connectorHost)?.destroy();
  const wrap = document.createElement('div'); wrap.className = 'ui-coach-line';
  const sentence = document.createElement('p'); sentence.className = 'ui-coach-line__text'; sentence.textContent = text;
  // The connector SVG only exists while there is something to connect: an unlinked line has no dead connector.
  let connector = null, path = null;
  wrap.append(sentence); host.append(wrap);
  const restorePosition = connectorHost.style.position;
  let positioned = false;
  const ensureConnector = () => {
    if (connector) return;
    connector = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); connector.classList.add('ui-coach-line__connector'); connector.setAttribute('aria-hidden', 'true');
    path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); connector.append(path);
    if (getComputedStyle(connectorHost).position === 'static') { connectorHost.style.position = 'relative'; positioned = true; }
    connectorHost.prepend(connector);
    api.connector = connector;
  };
  let timer;
  const unlink = () => { connector?.classList.remove('is-linked'); wrap.classList.remove('is-linked'); clearTimeout(timer); };
  let destroyed = false;
  const repaint = () => {
    if (destroyed || !marker || !orbit) return;
    unlink();
    const target = orbit.getMarkerElement?.(marker);
    if (!target) return;
    ensureConnector();
    const targetBox = target.getBoundingClientRect(), box = connectorHost.getBoundingClientRect(), start = textEnd(sentence);
    const x1 = Math.max(0, start.x - box.left), y1 = start.y - box.top;
    const x2 = targetBox.left + targetBox.width / 2 - box.left, y2 = targetBox.top + targetBox.height / 2 - box.top;
    connector.setAttribute('viewBox', `0 0 ${Math.max(1, box.width)} ${Math.max(1, box.height)}`); connector.setAttribute('width', String(Math.max(1, box.width))); connector.setAttribute('height', String(Math.max(1, box.height)));
    // Still the approved curve: if it would cut through the Cube, its control points bow over (or under) the cube
    // instead of the old orthogonal detour.
    let d = null;
    const c1 = [x1 + (x2 - x1) * .32, y1], c2 = [x1 + (x2 - x1) * .68, y2];
    const cube = orbit.element.closest('.f0-stage')?.querySelector('.f0-cube canvas') || document.querySelector('.shared-cube canvas');
    const cubeBox = cube?.getBoundingClientRect();
    if (cubeBox) {
      const left = cubeBox.left - box.left, right = cubeBox.right - box.left, top = cubeBox.top - box.top, bottom = cubeBox.bottom - box.top;
      let blocked = false;
      for (let step = 0; step <= 40 && !blocked; step++) {
        const t = step / 40, u = 1 - t, x = u ** 3 * x1 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * x2, y = u ** 3 * y1 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * y2;
        blocked = x > left && x < right && y > top && y < bottom;
      }
      if (blocked) {
        // Only when the Cube is in the way: pass over (or under) it with rounded corners and come straight in to the marker.
        const lane = top - 24 > 8 ? top - 24 : bottom + 24, vertical = Math.sign(y2 - lane) || 1, horizontal = Math.sign(x2 - x1) || 1;
        const corner = Math.max(4, Math.min(36, Math.abs(y2 - lane) / 2, Math.abs(x2 - x1) / 2));
        d = `M ${x1} ${y1} C ${x1 + horizontal * 24} ${y1}, ${x1 + horizontal * 24} ${lane}, ${x1 + horizontal * 48} ${lane} L ${x2 - horizontal * corner} ${lane} C ${x2} ${lane}, ${x2} ${lane}, ${x2} ${lane + vertical * corner} L ${x2} ${y2}`;
      }
    }
    path.setAttribute('d', d ?? `M ${x1} ${y1} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${x2} ${y2}`);
    timer = setTimeout(() => { connector.classList.add('is-linked'); wrap.classList.add('is-linked'); }, 30);
  };
  const link = (nextMarker, nextOrbit = orbit) => {
    marker = nextMarker; orbit = nextOrbit; unlink();
    if (!marker || !orbit) return;
    requestAnimationFrame(repaint);
  };
  const follow = () => requestAnimationFrame(repaint);
  window.addEventListener('resize', follow); window.addEventListener('scroll', follow, true);
  const subscribe = orbit?.element;
  subscribe?.addEventListener('orbitchange', follow);
  if (marker) requestAnimationFrame(() => link(marker, orbit));
  const api = { element: wrap, sentence, connector: null, link, update({ text: nextText, marker: nextMarker, orbit: nextOrbit } = {}) { if (nextText != null) sentence.textContent = nextText; if (nextMarker !== undefined) link(nextMarker, nextOrbit ?? orbit); else follow(); },
    destroy() { destroyed = true; clearTimeout(timer); window.removeEventListener('resize', follow); window.removeEventListener('scroll', follow, true); subscribe?.removeEventListener('orbitchange', follow); connector?.remove(); wrap.remove(); if (positioned) connectorHost.style.position = restorePosition; if (coachLines.get(connectorHost) === api) coachLines.delete(connectorHost); } };
  coachLines.set(connectorHost, api);
  return api;
}

export function createActions(host, actions = []) {
  const row = document.createElement('div'); row.className = 'ui-actions';
  actions.slice(0, 3).forEach(({ label, onClick, href, primary = false }) => { const control = href ? document.createElement('a') : document.createElement('button'); control.className = `btn ${primary ? 'btn--primary' : 'btn--text'}`; control.textContent = label; if (href) control.href = href; else { control.type = 'button'; control.addEventListener('click', onClick); } row.append(control); });
  host.append(row); return row;
}

export function createButton(host, { label, variant = 'primary', size = '', disabled = false, loading = false, key = null, onClick = null, href = null } = {}) {
  const control = href ? document.createElement('a') : document.createElement('button');
  control.className = `btn btn--${variant}${size ? ` btn--${size}` : ''}${loading ? ' is-loading' : ''}`;
  control.textContent = label;
  if (href) control.href = href;
  else { control.type = 'button'; if (onClick) control.addEventListener('click', onClick); }
  if (disabled || loading) {
    control.setAttribute('aria-disabled', 'true');
    if (control instanceof HTMLButtonElement) control.disabled = true;
    else { control.tabIndex = -1; control.addEventListener('click', event => event.preventDefault()); }
  }
  if (loading) { const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ring.classList.add('btn-ring'); ring.setAttribute('viewBox', '0 0 20 20'); ring.setAttribute('aria-hidden', 'true'); ring.innerHTML = '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="22 22" />'; control.prepend(ring); control.setAttribute('aria-busy', 'true'); }
  if (key) { const cap = document.createElement('kbd'); cap.className = 'key'; cap.textContent = key; control.append(cap); }
  host.append(control); return control;
}

export function createChip(host, { label, value = null, pressed = null, disabled = false, onClick = null } = {}) {
  const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'chip'; chip.textContent = value == null ? label : `${label} · ${value}`;
  if (pressed != null) chip.setAttribute('aria-pressed', String(pressed)); chip.disabled = disabled; if (onClick) chip.addEventListener('click', onClick); host.append(chip); return chip;
}

export function createSegmented(host, { label, options = [], value = options[0]?.value, onChange = null } = {}) {
  const group = document.createElement('div'); group.className = 'seg'; group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', label);
  group.style.setProperty('--n', String(options.length));
  const thumb = document.createElement('span'); thumb.className = 'seg__thumb'; thumb.setAttribute('aria-hidden', 'true'); group.append(thumb);
  const controls = options.map((option, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'seg__o'; button.setAttribute('role', 'radio'); button.dataset.value = String(option.value); button.textContent = option.label;
    button.disabled = Boolean(option.disabled); button.addEventListener('click', () => choose(index)); group.append(button); return button;
  });
  let selected = options.findIndex(option => option.value === value && !option.disabled);
  if (selected < 0) selected = options.findIndex(option => !option.disabled);
  const choose = (index, notify = true) => {
    if (!options[index] || options[index].disabled) return;
    selected = index; group.style.setProperty('--i', String(index));
    controls.forEach((button, position) => { button.setAttribute('aria-checked', String(position === selected)); button.tabIndex = position === selected ? 0 : -1; });
    if (notify) onChange?.(options[index].value);
  };
  group.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
    if (!enabled.length) return;
    const position = enabled.indexOf(selected);
    const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : enabled[(Math.max(0, position) + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
    choose(next); controls[next]?.focus();
  });
  if (selected >= 0) choose(selected, false);
  host.append(group); return { element: group, value: () => options[selected]?.value, setValue(next) { const index = options.findIndex(option => option.value === next && !option.disabled); if (index >= 0) choose(index); } };
}

export function createToggle(host, { label, description = '', checked = false, disabled = false, onChange = null } = {}) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'sw'; button.setAttribute('role', 'switch'); button.setAttribute('aria-checked', String(checked));
  const text = document.createElement('span'); text.className = 'sw__txt'; const title = document.createElement('span'); title.textContent = label; text.append(title);
  if (description) { const sub = document.createElement('span'); sub.className = 'sw__sub'; sub.textContent = description; text.append(sub); }
  const track = document.createElement('span'); track.className = 'sw__track'; const thumb = document.createElement('span'); thumb.className = 'sw__thumb';
  thumb.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 6 2.4 2.4L10 3"/></svg>'; track.append(thumb); button.append(text, track);
  button.disabled = disabled; button.addEventListener('click', () => { if (disabled) return; checked = !checked; button.setAttribute('aria-checked', String(checked)); onChange?.(checked); }); host.append(button); return button;
}

export function createStatus(host, { text, tone = 'default', detail = '' } = {}) {
  const status = document.createElement('span'); status.className = `st${tone === 'default' ? '' : ` st--${tone}`}`;
  const dot = document.createElement('i'); dot.className = `g-dot${tone === 'default' ? '' : ` is-${tone}`}`; dot.setAttribute('aria-hidden', 'true');
  status.append(dot);
  if (detail) { const strong = document.createElement('b'); strong.textContent = detail; status.append(strong); }
  status.append(document.createTextNode(text)); host.append(status); return status;
}

export function createToast(host, { text, detail = '', action = null, tone = 'default' } = {}) {
  const toast = document.createElement('div'); toast.className = `toast${action ? ' has-act' : ''}${tone === 'default' ? '' : ` is-${tone}`}`; toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  const dot = document.createElement('i'); dot.className = `g-dot${tone === 'default' ? '' : ` is-${tone}`}`; dot.setAttribute('aria-hidden', 'true'); toast.append(dot);
  toast.append(document.createTextNode(detail ? `${detail} · ${text}` : text));
  if (action) { const button = document.createElement('button'); button.type = 'button'; button.className = 'act'; button.textContent = action.label; button.addEventListener('click', action.onClick); toast.append(button); }
  host.append(toast); return toast;
}

export function createToastSlot(host = document.body) { return mountToastSlot(host, createToast); }
