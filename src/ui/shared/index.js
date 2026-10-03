import './shared.css';
import { APP_NAME } from '../../copy/nav.js';

export function createHeader(host, { title = APP_NAME, sections = ['solve', 'drills', 'algs', 'progress', 'history'], active = 'solve', compass = null, session = null, actions = {}, help = null, themeToggle = true, showDevDrawer = true } = {}) {
  const header = document.createElement('header'); header.className = 'site-header ui-header';
  const brand = document.createElement('a'); brand.className = 'brand ui-header__brand'; brand.href = '#/'; brand.textContent = title.toLowerCase(); brand.setAttribute('aria-label', `${title} home`);
  const nav = document.createElement('nav'); nav.className = 'main-nav'; nav.setAttribute('aria-label', 'Main');
  nav.dataset.scrollX = 'true'; nav.tabIndex = 0;
  sections.forEach((section, index) => {
    const item = typeof section === 'string' ? { id: section, href: `#/${section === 'solve' ? '' : section}`, label: section } : section;
    const link = document.createElement('a'); link.className = 'nav-link'; link.dataset.nav = item.id; link.href = item.href; link.textContent = item.label;
    if (item.id === active) { link.classList.add('active'); link.setAttribute('aria-current', 'page'); }
    if (index) nav.append(' '); nav.append(link);
  });
  const controls = document.createElement('div'); controls.className = 'header-actions ui-header__actions';
  const themeButton = document.createElement('button'); themeButton.id = 'theme-toggle'; themeButton.type = 'button'; themeButton.className = 'header-button theme-button'; themeButton.setAttribute('aria-label', 'theme'); themeButton.innerHTML = '<svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg><svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><span class="theme-label" aria-hidden="true">dark</span>';
  if (themeToggle) controls.append(themeButton);
  const cubeMenu = document.createElement('details'); cubeMenu.className = 'ui-cube-menu';
  const summary = document.createElement('summary'); summary.className = 'ui-cube-chip'; summary.setAttribute('aria-label', 'cube connection and recording');
  const dot = document.createElement('i'); dot.className = 'ui-cube-chip__dot'; const description = document.createElement('span'); description.className = 'ui-cube-chip__name'; const battery = document.createElement('span'); battery.className = 'ui-cube-chip__battery';
  summary.append(dot, description, battery, document.createTextNode('⌄'));
  const menu = document.createElement('div'); menu.className = 'ui-cube-menu__items'; menu.setAttribute('role', 'menu');
  const actionsForMenu = [['connect', 'connect'], ['sync', 'sync solved cube'], ['recenter', 'recenter'], ['disconnect', 'disconnect'], ['forget', 'forget saved cube'], ['save-recording', 'save recording'], ['report-problem', 'report a problem']];
  actionsForMenu.forEach(([id, label]) => { const button = document.createElement('button'); button.type = 'button'; button.dataset.cubeAction = id; button.textContent = label; button.setAttribute('role', 'menuitem'); button.addEventListener('click', () => { cubeMenu.open = false; actions[id]?.(); }); menu.append(button); });
  cubeMenu.append(summary, menu); controls.append(cubeMenu);
  const helpButton = document.createElement('button'); helpButton.type = 'button'; helpButton.className = 'header-button help-button'; helpButton.dataset.action = 'open-help'; helpButton.setAttribute('aria-label', 'help'); helpButton.textContent = '?'; helpButton.addEventListener('click', () => help?.()); controls.append(helpButton);
  let drawer = null;
  const openDrawer = () => { if (!showDevDrawer) return; if (!drawer) {
    drawer = document.createElement('dialog'); drawer.className = 'ui-dev-drawer'; drawer.setAttribute('aria-label', 'developer drawer');
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
  host.append(header);
  const applySnapshot = snapshot => {
    const phase = snapshot?.phase || 'disconnected';
    const names = { disconnected: 'disconnected', connecting: 'connecting', 'awaiting-solved': 'syncing', tracking: 'connected', desynced: 'desynced', interrupted: 'interrupted' };
    const interrupted = phase === 'interrupted' || (phase === 'disconnected' && snapshot?.link?.status === 'lost');
    const statusPhase = interrupted ? 'interrupted' : phase;
    const text = names[statusPhase] || statusPhase;
    const name = snapshot?.deviceName || (snapshot?.protocol?.startsWith('GAN') ? 'GAN cube' : 'cube');
    const batteryText = Number.isFinite(snapshot?.battery) ? `${Math.round(snapshot.battery)}%` : '';
    description.textContent = name; description.title = text; battery.textContent = batteryText; cubeMenu.dataset.phase = statusPhase;
    summary.setAttribute('aria-label', `${name}, ${text}${batteryText ? `, battery ${batteryText}` : ''}; open cube and recording actions`);
    dot.className = `ui-cube-chip__dot is-${statusPhase}`;
    const canSync = snapshot?.canSync ?? phase === 'tracking';
    const canDisconnect = snapshot?.canDisconnect ?? phase === 'tracking';
    for (const button of menu.querySelectorAll('[data-cube-action]')) {
      const id = button.dataset.cubeAction;
      button.disabled = id === 'connect' ? !(phase === 'disconnected' || (phase === 'interrupted' && !snapshot?.canDisconnect))
        : id === 'sync' ? !canSync
          : id === 'recenter' || id === 'disconnect' ? !canDisconnect
            : id === 'forget' ? !actions.forgetAvailable?.() : false;
    }
    const setupName = themeButton.querySelector('.theme-label'); if (setupName) setupName.textContent = document.documentElement.dataset.theme || 'dark';
  };
  const unsubscribe = session?.subscribe?.(applySnapshot);
  const themeObserver = new MutationObserver(() => applySnapshot(session?.getSnapshot?.() || {}));
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  header.destroy = () => { header.dispatchEvent(new Event('cube-header-destroy')); unsubscribe?.(); themeObserver.disconnect(); drawer?.remove(); header.remove(); };
  header.openDeveloperDrawer = openDrawer;
  return header;
}

export function createKeyBar(host, keys = []) {
  const bar = document.createElement('div'); bar.className = 'ui-key-bar'; bar.setAttribute('aria-label', 'keyboard shortcuts');
  keys.slice(0, 3).forEach(({ key, label }) => { const item = document.createElement('span'); const kbd = document.createElement('kbd'); kbd.textContent = key; const text = document.createElement('span'); text.textContent = label; item.append(kbd, text); bar.append(item); });
  host.append(bar); return bar;
}

/** Coach sentence with the A-05 dotted connector to a selected Orbit marker. */
export function createCoachLine(host, { text = '', marker = null, orbit = null } = {}) {
  const wrap = document.createElement('div'); wrap.className = 'ui-coach-line';
  const sentence = document.createElement('p'); sentence.className = 'ui-coach-line__text'; sentence.textContent = text;
  const connector = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); connector.classList.add('ui-coach-line__connector'); connector.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); connector.append(path); wrap.append(connector, sentence); host.append(wrap);
  let timer;
  const repaint = () => {
    if (!marker || !orbit) return;
    wrap.classList.remove('is-linked'); clearTimeout(timer);
    const target = orbit.getMarkerElement?.(marker);
    if (!target) return;
    const sentenceBox = sentence.getBoundingClientRect(), targetBox = target.getBoundingClientRect(), box = wrap.getBoundingClientRect();
    const x1 = Math.max(0, sentenceBox.right - box.left), y1 = sentenceBox.top + sentenceBox.height / 2 - box.top;
    const x2 = targetBox.left + targetBox.width / 2 - box.left, y2 = targetBox.top + targetBox.height / 2 - box.top;
    connector.setAttribute('viewBox', `0 0 ${Math.max(1, box.width)} ${Math.max(1, box.height)}`);
    const cube = orbit.element.closest('.f0-stage')?.querySelector('.f0-cube canvas') || document.querySelector('.shared-cube canvas');
    const cubeBox = cube?.getBoundingClientRect();
    const minX = Math.min(sentenceBox.right, targetBox.left), maxX = Math.max(sentenceBox.right, targetBox.left);
    const minY = Math.min(sentenceBox.top + sentenceBox.height / 2, targetBox.top + targetBox.height / 2);
    const maxY = Math.max(sentenceBox.top + sentenceBox.height / 2, targetBox.top + targetBox.height / 2);
    const crossesCube = cubeBox && minX < cubeBox.right && maxX > cubeBox.left && minY < cubeBox.bottom && maxY > cubeBox.top;
    if (crossesCube) {
      const topRoute = cubeBox.top - box.top - 12, bottomRoute = cubeBox.bottom - box.top + 12;
      const routeY = topRoute > 8 && (topRoute < box.height - 8 || bottomRoute > box.height - 8) ? topRoute : bottomRoute;
      path.setAttribute('d', `M ${x1} ${y1} L ${x1} ${routeY} L ${x2} ${routeY} L ${x2} ${y2}`);
    } else path.setAttribute('d', `M ${x1} ${y1} C ${x1 + (x2 - x1) * .32} ${y1}, ${x1 + (x2 - x1) * .68} ${y2}, ${x2} ${y2}`);
    timer = setTimeout(() => wrap.classList.add('is-linked'), 30);
  };
  const link = (nextMarker, nextOrbit = orbit) => {
    marker = nextMarker; orbit = nextOrbit; wrap.classList.remove('is-linked'); clearTimeout(timer);
    if (!marker || !orbit) return;
    requestAnimationFrame(repaint);
  };
  const follow = () => requestAnimationFrame(repaint);
  window.addEventListener('resize', follow); window.addEventListener('scroll', follow, true);
  const subscribe = orbit?.element;
  subscribe?.addEventListener('orbitchange', follow);
  if (marker) requestAnimationFrame(() => link(marker, orbit));
  return { element: wrap, sentence, link, update({ text: nextText, marker: nextMarker, orbit: nextOrbit } = {}) { if (nextText != null) sentence.textContent = nextText; if (nextMarker !== undefined) link(nextMarker, nextOrbit ?? orbit); else follow(); }, destroy() { clearTimeout(timer); window.removeEventListener('resize', follow); window.removeEventListener('scroll', follow, true); subscribe?.removeEventListener('orbitchange', follow); wrap.remove(); } };
}

export function createActions(host, actions = []) {
  const row = document.createElement('div'); row.className = 'ui-actions';
  actions.slice(0, 3).forEach(({ label, onClick, href, primary = false }) => { const control = href ? document.createElement('a') : document.createElement('button'); control.className = `ui-action${primary ? ' is-primary' : ''}`; control.textContent = label; if (href) control.href = href; else { control.type = 'button'; control.addEventListener('click', onClick); } row.append(control); });
  host.append(row); return row;
}

export function createChip(host, { label, value = null, pressed = null, onClick = null } = {}) {
  const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'ui-chip'; chip.textContent = value == null ? label : `${label} · ${value}`;
  if (pressed != null) chip.setAttribute('aria-pressed', String(pressed)); if (onClick) chip.addEventListener('click', onClick); host.append(chip); return chip;
}
