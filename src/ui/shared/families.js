import { Orbit } from '../orbit/index.js';

let fieldId = 0;

const svgEl = (name, attrs = {}) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
  return el;
};

export function createCountPill(host, value, label = '') {
  const pill = document.createElement('span'); pill.className = 'ui-count-pill';
  pill.textContent = label ? `${value} ${label}` : String(value); host.append(pill); return pill;
}

export function createToastSlot(host, makeToast) {
  const slot = document.createElement('div'); slot.className = 'ui-toast-slot'; slot.setAttribute('aria-live', 'polite'); slot.setAttribute('aria-atomic', 'true'); host.append(slot);
  let timer = 0, current = null;
  const dismiss = () => { clearTimeout(timer); current?.remove(); current = null; };
  return {
    element: slot,
    show(options) {
      dismiss(); current = makeToast(slot, options);
      const persistent = options.tone === 'error';
      if (persistent && !options.action) { const close = document.createElement('button'); close.type = 'button'; close.className = 'act'; close.textContent = 'dismiss'; close.addEventListener('click', dismiss); current.append(close); current.classList.add('has-act'); }
      if (!persistent && Number(options.duration ?? 4200) > 0) timer = setTimeout(dismiss, Number(options.duration ?? 4200));
      return current;
    },
    dismiss,
    destroy() { dismiss(); slot.remove(); },
  };
}

export function createSection(host, { title = '', eyebrow = '', count = null, label = title } = {}) {
  const section = document.createElement('section'); section.className = 'ui-section';
  if (label) section.setAttribute('aria-label', label);
  if (title || eyebrow) {
    const head = document.createElement('header'); head.className = 'ui-section-head';
    if (eyebrow) { const eye = document.createElement('span'); eye.className = 'ui-eyebrow'; eye.textContent = eyebrow; head.append(eye); }
    if (title) { const heading = document.createElement('h2'); heading.className = 'ui-section-head__title'; heading.textContent = title; head.append(heading); }
    if (count != null) createCountPill(head, count);
    section.append(head);
  }
  host.append(section); return section;
}

export function createGroup(host, { label = '' } = {}) {
  const group = document.createElement('div'); group.className = 'ui-group';
  if (label) group.setAttribute('aria-label', label);
  host.append(group); return group;
}

export function createSearch(host, { placeholder = 'search', label = placeholder, name = '', value = '', count = null, onSearch = null } = {}) {
  const wrap = document.createElement('span'); wrap.className = 'ui-input-wrap';
  const input = document.createElement('input'); input.className = 'ui-input ui-input--search'; input.type = 'search'; input.name = name; input.placeholder = placeholder; input.setAttribute('aria-label', label); input.value = value;
  const icon = svgEl('svg', { class: 'ui-search-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' }); icon.append(svgEl('circle', { cx: 6.8, cy: 6.8, r: 4.6 }), svgEl('path', { d: 'm10.2 10.2 4 4' }));
  wrap.append(icon, input);
  let countEl = null;
  if (count != null) { countEl = document.createElement('output'); countEl.className = 'ui-search-count'; countEl.textContent = String(count); wrap.append(countEl); }
  input.addEventListener('input', () => onSearch?.(input.value));
  input.addEventListener('keydown', event => { if (event.key === 'Escape' && input.value) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); } });
  host.append(wrap);
  return { element: wrap, input, setCount(next) { if (countEl) countEl.value = String(next); }, clear() { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); } };
}

export function createSectionHeader(host, { title, eyebrow = '', count = null, searchPlaceholder = '', onSearch = null } = {}) {
  const head = document.createElement('header'); head.className = 'ui-section-head';
  if (eyebrow) { const eye = document.createElement('span'); eye.className = 'ui-eyebrow'; eye.textContent = eyebrow; head.append(eye); }
  if (title) { const heading = document.createElement('h2'); heading.className = 'ui-section-head__title'; heading.textContent = title; head.append(heading); }
  if (count != null) createCountPill(head, count);
  let search = null;
  if (searchPlaceholder) { const hostEl = document.createElement('span'); hostEl.className = 'ui-section-head__search'; head.append(hostEl); search = createSearch(hostEl, { placeholder: searchPlaceholder, onSearch }); }
  host.append(head); return { element: head, search };
}

export function createFilledInput(host, { label = '', value = '', placeholder = '', type = 'text', hint = '', error = '', disabled = false, onInput = null } = {}) {
  const field = document.createElement('div'); field.className = 'ui-field';
  const inputId = `field-control-${++fieldId}`, errorId = `field-error-${fieldId}`;
  if (label) { const caption = document.createElement('label'); caption.className = 'ui-field__label'; caption.htmlFor = inputId; caption.textContent = label; field.append(caption); }
  const input = document.createElement('input'); input.id = inputId; input.className = `ui-input${error ? ' is-error' : ''}`; input.type = type; input.value = value; input.placeholder = placeholder; input.disabled = disabled; input.setAttribute('aria-invalid', String(Boolean(error)));
  const describedBy = [];
  let errorNode = null;
  if (hint) input.setAttribute('aria-description', hint);
  input.addEventListener('input', () => onInput?.(input.value)); field.append(input);
  if (hint) { const help = document.createElement('span'); help.className = 'ui-field__hint'; help.textContent = hint; help.id = `field-hint-${++fieldId}`; describedBy.push(help.id); field.append(help); }
  if (error) { errorNode = document.createElement('span'); errorNode.className = 'ui-field__error'; errorNode.id = errorId; errorNode.textContent = error; describedBy.push(errorId); field.append(errorNode); }
  const syncDescription = () => { if (describedBy.length) input.setAttribute('aria-describedby', describedBy.join(' ')); else input.removeAttribute('aria-describedby'); };
  syncDescription(); host.append(field);
  return { element: field, input, setError(message = '') {
    input.classList.toggle('is-error', Boolean(message)); input.setAttribute('aria-invalid', String(Boolean(message)));
    if (message && !errorNode) { errorNode = document.createElement('span'); errorNode.className = 'ui-field__error'; errorNode.id = errorId; field.append(errorNode); describedBy.push(errorId); }
    if (errorNode) { errorNode.textContent = String(message); errorNode.hidden = !message; }
    if (!message && errorNode) { errorNode.remove(); errorNode = null; const index = describedBy.indexOf(errorId); if (index >= 0) describedBy.splice(index, 1); }
    syncDescription();
  } };
}

export function createFilledSelect(host, { label = '', name = '', options = [], value = options[0]?.value, disabled = false, onChange = null } = {}) {
  const field = document.createElement('div'); field.className = 'ui-field';
  if (label) { const caption = document.createElement('span'); caption.className = 'ui-field__label'; caption.textContent = label; field.append(caption); }
  const wrap = document.createElement('span'); wrap.className = 'sel sel--full';
  const select = document.createElement('button'); select.type = 'button'; select.className = 'sel__btn'; select.setAttribute('role', 'combobox'); select.setAttribute('aria-haspopup', 'listbox'); select.setAttribute('aria-expanded', 'false'); select.setAttribute('aria-label', label || 'Choose an option'); select.disabled = disabled || options.length === 0;
  const formValue = document.createElement('input'); formValue.type = 'hidden'; formValue.name = name; formValue.disabled = disabled;
  const selected = document.createElement('span'); selected.className = 'sel__value';
  const arrow = svgEl('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true' }); arrow.append(svgEl('path', { d: 'm3 5 4 4 4-4' })); select.append(selected, arrow);
  const listId = `select-options-${++fieldId}`; select.setAttribute('aria-controls', listId);
  const list = document.createElement('ul'); list.id = listId; list.className = 'sel__list'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label || 'Options');
  const firstEnabled = options.findIndex(option => !option.disabled);
  let lastEnabled = -1; options.forEach((option, index) => { if (!option.disabled) lastEnabled = index; });
  let selectedIndex = options.findIndex(option => String(option.value) === String(value));
  if (selectedIndex < 0 || options[selectedIndex]?.disabled) selectedIndex = Math.max(0, firstEnabled);
  let activeIndex = selectedIndex;
  const items = options.map((option, index) => {
    const item = document.createElement('li'); const choice = document.createElement('button'); choice.type = 'button'; choice.className = 'sel__opt'; choice.id = `${listId}-${index}`; choice.setAttribute('role', 'option'); choice.dataset.value = option.value;
    const optionLabel = document.createElement('span'); optionLabel.textContent = option.label;
    const check = svgEl('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true' }); check.append(svgEl('path', { d: 'm2 7 3.3 3.1L12 3.5' })); choice.append(optionLabel, check);
    if (option.disabled) { choice.disabled = true; choice.classList.add('is-disabled'); }
    choice.addEventListener('click', () => choose(index)); item.append(choice); list.append(item); return choice;
  });
  const sync = () => {
    selected.textContent = options[selectedIndex]?.label ?? '';
    select.dataset.value = String(options[selectedIndex]?.value ?? '');
    select.setAttribute('aria-activedescendant', items[activeIndex]?.id || '');
    items.forEach((item, index) => { item.setAttribute('aria-selected', String(index === selectedIndex)); item.classList.toggle('is-active', index === activeIndex); });
  };
  const nextEnabled = (start, direction) => {
    for (let step = 1; step <= items.length; step += 1) {
      const index = (start + direction * step + items.length * 2) % items.length;
      if (!options[index]?.disabled) return index;
    }
    return start;
  };
  const close = (restoreFocus = false) => { wrap.classList.remove('is-open'); select.setAttribute('aria-expanded', 'false'); if (restoreFocus) select.focus(); };
  const open = () => { if (select.disabled) return; wrap.classList.add('is-open'); select.setAttribute('aria-expanded', 'true'); activeIndex = selectedIndex; sync(); items[activeIndex]?.focus(); };
  const choose = index => { if (!options[index] || options[index].disabled) return; selectedIndex = index; activeIndex = index; formValue.value = String(options[index].value); sync(); close(); formValue.dispatchEvent(new Event('change', { bubbles: true })); onChange?.(String(options[index].value)); select.focus(); };
  select.addEventListener('click', () => wrap.classList.contains('is-open') ? close() : open());
  select.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!wrap.classList.contains('is-open')) { open(); return; } activeIndex = nextEnabled(activeIndex, event.key === 'ArrowDown' ? 1 : -1); sync(); items[activeIndex]?.focus(); }
    else if (event.key === 'Escape' && wrap.classList.contains('is-open')) close(true);
    else if ((event.key === 'Enter' || event.key === ' ') && wrap.classList.contains('is-open')) { event.preventDefault(); choose(activeIndex); }
  });
  list.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); activeIndex = nextEnabled(activeIndex, event.key === 'ArrowDown' ? 1 : -1); sync(); items[activeIndex]?.focus(); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); activeIndex = event.key === 'Home' ? firstEnabled : lastEnabled; if (activeIndex < 0) activeIndex = selectedIndex; sync(); items[activeIndex]?.focus(); }
  });
  const outside = event => { if (!wrap.contains(event.target)) close(); };
  document.addEventListener('pointerdown', outside); wrap.append(select, list); field.append(wrap, formValue); host.append(field); formValue.value = String(options[selectedIndex]?.value ?? ''); sync();
  return { element: field, select, input: formValue, open, close, value: () => formValue.value, setValue(next) { const index = options.findIndex(option => String(option.value) === String(next) && !option.disabled); if (index >= 0) { selectedIndex = index; activeIndex = index; formValue.value = String(options[index].value); sync(); } }, destroy() { document.removeEventListener('pointerdown', outside); field.remove(); } };
}

export function createTextarea(host, { label = '', value = '', placeholder = '', hint = '', rows = 4, disabled = false, onInput = null } = {}) {
  const field = document.createElement('div'); field.className = 'ui-field'; const id = `field-control-${++fieldId}`;
  if (label) { const caption = document.createElement('label'); caption.className = 'ui-field__label'; caption.htmlFor = id; caption.textContent = label; field.append(caption); }
  const area = document.createElement('textarea'); area.id = id; area.className = 'ui-input ui-textarea'; area.value = value; area.placeholder = placeholder; area.rows = rows; area.disabled = disabled; area.addEventListener('input', () => onInput?.(area.value)); field.append(area);
  if (hint) { const help = document.createElement('span'); help.className = 'ui-field__hint'; help.textContent = hint; help.id = `field-hint-${++fieldId}`; area.setAttribute('aria-describedby', help.id); field.append(help); }
  host.append(field); return { element: field, textarea: area };
}

export function createRangeInput(host, { label = '', min = 0, max = 100, step = 1, value = min, unit = '', disabled = false, onInput = null } = {}) {
  const field = document.createElement('label'); field.className = 'ui-field';
  if (label) { const caption = document.createElement('span'); caption.className = 'ui-field__label'; caption.textContent = label; field.append(caption); }
  const row = document.createElement('span'); row.className = 'ui-range'; const input = document.createElement('input'); input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value); input.disabled = disabled;
  const output = document.createElement('output'); output.textContent = `${value}${unit}`; input.addEventListener('input', () => { output.textContent = `${input.value}${unit}`; onInput?.(Number(input.value)); }); row.append(input, output); field.append(row); host.append(field); return { element: field, input, output };
}

export function createFileInput(host, { label = '', accept = '', onChange = null } = {}) {
  const field = document.createElement('div'); field.className = 'ui-field';
  if (label) { const caption = document.createElement('span'); caption.className = 'ui-field__label'; caption.textContent = label; field.append(caption); }
  const row = document.createElement('label'); row.className = 'ui-file'; const button = document.createElement('span'); button.className = 'btn btn--secondary btn--s'; button.textContent = 'choose file…';
  const input = document.createElement('input'); input.type = 'file'; input.accept = accept; const name = document.createElement('span'); name.className = 'ui-field__hint'; name.textContent = 'no file chosen'; input.addEventListener('change', () => { name.textContent = input.files?.[0]?.name || 'no file chosen'; onChange?.(input.files?.[0] || null); }); row.append(button, input, name); field.append(row); host.append(field); return { element: field, input };
}

export function createDisclosure(host, { title, detail = '', open = false } = {}) {
  const disclosure = document.createElement('details'); disclosure.className = 'ui-disclosure'; disclosure.open = open;
  const summary = document.createElement('summary'); summary.append(document.createTextNode(title));
  if (detail) { const hint = document.createElement('small'); hint.textContent = detail; summary.append(hint); }
  const body = document.createElement('div'); body.className = 'ui-disclosure__body'; disclosure.append(summary, body); host.append(disclosure);
  return { element: disclosure, body, open: value => { disclosure.open = Boolean(value); } };
}

export function createPanel(host, { kind = 'list', label = '' } = {}) {
  if (!['list', 'log'].includes(kind)) throw new TypeError('Approved panels are reserved for lists and logs.');
  const panel = document.createElement('div'); panel.className = 'ui-panel'; panel.dataset.kind = kind;
  if (label) panel.setAttribute('aria-label', label);
  host.append(panel); return panel;
}

export function createRightDrawer(host, { title = '', subtitle = '', onClose = null } = {}) {
  const drawer = document.createElement('dialog'); drawer.className = 'ui-cube-menu__drawer'; drawer.setAttribute('aria-label', title || 'Details');
  const head = document.createElement('div'); head.className = 'ui-cube-menu__head'; const heading = document.createElement('h2'); heading.textContent = title;
  const close = document.createElement('button'); close.type = 'button'; close.className = 'ui-cube-menu__close'; close.textContent = 'close'; close.addEventListener('click', () => drawer.close());
  head.append(heading, close); drawer.append(head);
  if (subtitle) { const sub = document.createElement('p'); sub.className = 'ui-header-status'; sub.textContent = subtitle; drawer.append(sub); }
  drawer.addEventListener('click', event => {
    if (event.target !== drawer) return;
    const box = drawer.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) drawer.close();
  });
  drawer.addEventListener('close', () => onClose?.()); host.append(drawer);
  return { element: drawer, body: drawer, open() { if (!drawer.open) drawer.showModal(); }, close() { drawer.close(); }, destroy() { drawer.close(); drawer.remove(); } };
}

export function createDialog(host, { title = '', description = '', actions = [] } = {}) {
  const dialog = document.createElement('dialog'); dialog.className = 'ui-modal-dialog'; dialog.setAttribute('aria-label', title || 'Dialog');
  const close = document.createElement('button'); close.type = 'button'; close.className = 'ui-dev-drawer__close'; close.textContent = 'close'; close.addEventListener('click', () => dialog.close());
  const heading = document.createElement('h2'); heading.textContent = title; dialog.append(close, heading);
  if (description) { const text = document.createElement('p'); text.textContent = description; dialog.append(text); }
  actions.slice(0, 3).forEach(action => {
    const button = document.createElement('button'); button.type = 'button'; button.className = action.primary ? 'btn btn--primary' : 'btn btn--text'; button.textContent = action.label;
    button.addEventListener('click', () => { action.onClick?.(); if (action.close !== false) dialog.close(); }); dialog.append(button);
  });
  host.append(dialog); return { element: dialog, open: () => dialog.showModal(), close: () => dialog.close(), destroy: () => dialog.remove() };
}

export function createListRow(host, { title, detail = '', value = '', selected = false, href = null, onClick = null, interactive = false, ariaPressed = null, tags = [], orbit = {} } = {}) {
  const row = document.createElement(href ? 'a' : onClick || interactive ? 'button' : 'div'); row.className = `ui-list-row${selected ? ' is-selected' : ''}`;
  if (row instanceof HTMLButtonElement) { row.type = 'button'; if (onClick) row.addEventListener('click', onClick); }
  if (href) row.href = href;
  if (selected) row.setAttribute('aria-current', 'true');
  if (ariaPressed != null) row.setAttribute('aria-pressed', String(ariaPressed));
  const glyphHost = document.createElement('span'); glyphHost.className = 'ui-mini-orbit'; row.append(glyphHost);
  const main = document.createElement('span'); main.className = 'ui-list-row__main';
  const name = document.createElement('span'); name.className = 'ui-list-row__title'; name.textContent = title; main.append(name);
  if (detail) { const sub = document.createElement('span'); sub.className = 'ui-list-row__detail'; sub.textContent = detail; main.append(sub); }
  if (tags.length) { const tagsHost = document.createElement('span'); tagsHost.className = 'ui-list-row__tags'; tags.forEach(tag => { const item = document.createElement('span'); item.className = 'ui-text-tag'; item.textContent = tag; tagsHost.append(item); }); main.append(tagsHost); }
  row.append(main);
  if (value !== '') { const number = document.createElement('span'); number.className = 'ui-list-row__value'; number.textContent = value; row.append(number); }
  host.append(row);
  let mini = null, observer = null;
  const mountMini = () => { if (!mini && row.isConnected) mini = new Orbit(glyphHost, { size: 'mini', glyphSize: 38, label: `${title} Orbit`, ...orbit }); };
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      mountMini(); observer?.disconnect(); observer = null;
    }, { root: host.closest('.history-list') || null, rootMargin: '80px' });
    observer.observe(glyphHost);
  } else mountMini();
  row.destroy = () => { observer?.disconnect(); mini?.destroy(); row.remove(); };
  return row;
}

export function createNavigationRail(host, { items = [], active = '' } = {}) {
  const rail = document.createElement('nav'); rail.className = 'ui-nav-rail'; rail.setAttribute('aria-label', 'Section navigation');
  items.forEach(item => { const link = document.createElement('a'); link.href = item.href; link.textContent = item.label; if (item.id === active) link.setAttribute('aria-current', 'page'); rail.append(link); });
  host.append(rail); return rail;
}

export function createBreadcrumbs(host, items = []) {
  const nav = document.createElement('nav'); nav.className = 'ui-crumbs'; nav.setAttribute('aria-label', 'Breadcrumbs');
  items.forEach((item, index) => { const link = document.createElement('a'); link.href = item.href; link.textContent = item.label; if (index === items.length - 1) link.setAttribute('aria-current', 'page'); nav.append(link); });
  host.append(nav); return nav;
}

export function createTimerReadout(host, { value = '0.00', subtitle = '', hidden = false, tone = '' } = {}) {
  let currentValue = String(value);
  const readout = document.createElement('div'); readout.className = `ui-timer${hidden ? ' is-hidden' : ''}${tone ? ` is-${tone}` : ''}`; readout.setAttribute('role', 'timer');
  const digits = document.createElement('span'); digits.className = 'ui-timer__value'; digits.textContent = hidden ? 'hidden' : currentValue; readout.append(digits);
  if (subtitle) { const sub = document.createElement('span'); sub.className = 'ui-timer__sub'; sub.textContent = subtitle; readout.append(sub); }
  host.append(readout); return { element: readout, setValue(next) { currentValue = String(next); digits.textContent = hidden ? 'hidden' : currentValue; }, setHidden(next) { hidden = Boolean(next); readout.classList.toggle('is-hidden', hidden); digits.textContent = hidden ? 'hidden' : currentValue; }, setSubtitle(next) { if (!readout.querySelector('.ui-timer__sub')) { const sub = document.createElement('span'); sub.className = 'ui-timer__sub'; readout.append(sub); } readout.querySelector('.ui-timer__sub').textContent = next; } };
}

export function createMoveDisplay(host, { moves = [], current = -1, sections = [], wrong = null, undo = [], onMove = null } = {}) {
  const root = document.createElement('div'); root.className = 'ui-move-display';
  const overflow = document.createElement('div'); overflow.className = 'ui-move-overflow';
  const beforeCount = document.createElement('span'); const afterCount = document.createElement('span'); overflow.append(beforeCount, afterCount);
  const orbitHost = document.createElement('div'); orbitHost.className = 'ui-move-display__orbit';
  const phoneWindow = document.createElement('div'); phoneWindow.className = 'ui-move-display__phone-window';
  const phone = document.createElement('div'); phone.className = 'ui-move-display__phone'; phoneWindow.append(phone);
  let currentWrong = wrong, undoMoves = [...undo];
  const sectionDefs = sections.map(section => typeof section === 'number' ? { sourceStart: section } : { ...section, sourceStart: Number(section.start ?? section.from) }).filter(section => Number.isFinite(section.sourceStart));
  const sectionStarts = new Set(sectionDefs.map(section => section.sourceStart));
  const buildItems = () => {
    const result = [];
    moves.forEach((move, index) => {
      if (index === current && undoMoves.length) {
        if (currentWrong) result.push({ move: currentWrong, index, kind: 'wrong', count: false });
        undoMoves.forEach((undoMove, undoIndex) => result.push({ move: undoMove, index, kind: undoIndex === 0 ? 'undo-current' : 'undo', count: true }));
      }
      result.push({ move, index, kind: index === current && !undoMoves.length ? 'current' : index < current ? 'done' : 'future', count: true });
    });
    return result;
  };
  let items = buildItems();
  const ringItems = () => items.map((item, index) => ({ item, index })).filter(entry => entry.item.kind !== 'wrong');
  const activeAt = () => { const ring = ringItems(), found = ring.findIndex(({ item }) => item.kind === 'current' || item.kind === 'undo-current'); return found < 0 ? Math.max(0, ring.findIndex(({ item }) => item.index >= current)) : found; };
  const tokenState = item => item.kind === 'done' ? 'done' : item.kind === 'current' ? 'current' : item.kind === 'wrong' || item.kind.startsWith('undo') ? 'wrong' : 'future';
  const sectionStartFor = item => item.kind.startsWith('undo') || item.kind === 'wrong' ? `undo-${item.index}` : [...sectionStarts].filter(start => start <= item.index).at(-1) ?? -1;
  const ringSections = () => {
    const ring = ringItems();
    const starts = sectionDefs.map(section => ring.findIndex(({ item }) => item.index >= section.sourceStart && !item.kind.startsWith('undo'))).filter(index => index >= 0);
    const undoStart = ring.findIndex(({ item }) => item.kind === 'undo-current');
    if (undoStart >= 0) starts.push(undoStart);
    return [...new Set(starts)].sort((a, b) => a - b).map(start => ({ start }));
  };
  const buildSegments = () => {
    const ring = ringItems(), active = activeAt(), left = Math.max(0, Math.min(active - 7, ring.length - 22)), right = Math.min(ring.length, left + 22);
    beforeCount.textContent = left ? `‹ ${left}` : '';
    afterCount.textContent = ring.length > right ? `${ring.length - right} ›` : '';
    return ring.map(({ item, index }, ringIndex) => {
      const visible = ringIndex >= left && ringIndex < right;
      return { key: `move-${index}`, label: visible ? item.move : '', ariaLabel: `Move ${item.index + 1}: ${item.move}, ${item.kind}`, weight: 1, state: tokenState(item), fill: item.kind === 'done' ? 1 : 0, section: sectionStartFor(item) };
    });
  };
  const segments = buildSegments();
  const orbit = new Orbit(orbitHost, { size: 'L', shape: 'open', gap: 70, segments, sections: ringSections(), label: 'Move sequence', onSegment: segment => { const item = items[Number(segment.key.slice(5))]; if (item) onMove?.(item.move, item.index); } });
  let phoneItems = [];
  const renderPhone = () => {
    phone.replaceChildren(); phoneItems = [];
    items.forEach(item => {
      if (sectionStarts.has(item.index) && item.kind !== 'wrong' && !item.kind.startsWith('undo')) { const spacer = document.createElement('span'); spacer.className = 'ui-move-section'; spacer.setAttribute('aria-hidden', 'true'); phone.append(spacer); }
      if (item.kind === 'undo-current' || item.kind === 'undo') { const spacer = document.createElement('span'); spacer.className = 'ui-move-section'; spacer.setAttribute('aria-hidden', 'true'); phone.append(spacer); }
      const control = document.createElement('button'); control.type = 'button'; control.className = `ui-move is-${item.kind}`; control.textContent = item.move;
      control.setAttribute('aria-label', `Move ${item.index + 1}: ${item.move}${item.kind === 'current' || item.kind === 'undo-current' ? ', current move' : item.kind === 'wrong' ? ', wrong turn' : item.kind.startsWith('undo') ? ', undo move' : ''}`);
      if (item.kind === 'current' || item.kind === 'undo-current') control.setAttribute('aria-current', 'step');
      control.addEventListener('click', () => onMove?.(item.move, item.index)); phone.append(control); phoneItems.push(control);
    });
  };
  renderPhone(); root.append(overflow, orbitHost, phoneWindow); host.append(root);
  const phoneActiveAt = () => { const found = items.findIndex(item => item.kind === 'current' || item.kind === 'undo-current'); return found < 0 ? Math.max(0, current) : found; };
  const rollPhone = () => {
    const active = phoneItems[phoneActiveAt()];
    if (active) phoneWindow.scrollTop = Math.max(0, active.offsetTop - phoneWindow.offsetTop - 36);
  };
  rollPhone();
  return { element: root, orbit, setCurrent(index, state = {}) {
    const nextCurrent = Math.max(-1, Math.min(moves.length - 1, Number(index)));
    if (Object.hasOwn(state, 'wrong')) currentWrong = state.wrong;
    else if (nextCurrent !== current) currentWrong = null;
    if (Object.hasOwn(state, 'undo')) undoMoves = [...state.undo];
    else if (nextCurrent !== current) undoMoves = [];
    current = nextCurrent; items = buildItems();
    const next = buildSegments(); void orbit.update({ segments: next, sections: ringSections() });
    renderPhone(); rollPhone();
  }, destroy() { orbit.destroy(); root.remove(); } };
}

export function createLineChart(host, { series = [], label = 'Trend chart', width = 560, height = 220 } = {}) {
  const all = series.flatMap(item => item.values || []).filter(Number.isFinite);
  if (!all.length) { const empty = document.createElement('p'); empty.className = 'ui-field__hint'; empty.textContent = `${label}: no data yet`; host.append(empty); return empty; }
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const pad = { left: 36, right: 12, top: 12, bottom: 28 }, innerW = width - pad.left - pad.right, innerH = height - pad.top - pad.bottom;
  const chart = svgEl('svg', { class: 'ui-chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label });
  const title = svgEl('title'); title.textContent = label; chart.append(title);
  for (let tick = 0; tick <= 4; tick++) {
    const y = pad.top + innerH * tick / 4; chart.append(svgEl('line', { class: 'ui-chart__grid', x1: pad.left, y1: y, x2: width - pad.right, y2: y }));
  }
  series.forEach((item, seriesIndex) => {
    const values = (item.values || []).filter(Number.isFinite); if (!values.length) return;
    const points = values.map((value, index) => `${pad.left + (values.length < 2 ? innerW / 2 : innerW * index / (values.length - 1))},${pad.top + innerH * (max - value) / span}`).join(' ');
    const group = svgEl('g', { 'aria-label': item.name || `series ${seriesIndex + 1}` });
    group.append(svgEl('polyline', { class: 'ui-chart__line', points, style: `color:${item.color || 'var(--b-accent)'}` }));
    values.forEach((value, index) => { const [cx, cy] = points.split(' ')[index].split(','); group.append(svgEl('circle', { class: 'ui-chart__point', cx, cy, r: 2.5 })); });
    chart.append(group);
  });
  host.append(chart); return chart;
}

export function createWipeComparison(host, { before, after, value = 50, mode = 'wipe', locked = false, label = 'Compare before and after' } = {}) {
  const stage = document.createElement('div'); stage.className = 'ui-wipe'; stage.setAttribute('aria-label', label);
  const afterSide = document.createElement('div'); afterSide.className = 'ui-wipe__side ui-wipe__side--after';
  const beforeSide = document.createElement('div'); beforeSide.className = 'ui-wipe__side ui-wipe__side--before';
  const appendContent = (target, content) => { if (content instanceof Node) target.append(content); else target.textContent = String(content ?? ''); };
  appendContent(afterSide, after); appendContent(beforeSide, before);
  const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'ui-wipe__handle'; handle.setAttribute('role', 'slider'); handle.setAttribute('aria-label', label); handle.setAttribute('aria-orientation', 'horizontal'); handle.setAttribute('aria-valuemin', '0'); handle.setAttribute('aria-valuemax', '100'); handle.disabled = locked;
  const grip = document.createElement('span'); grip.className = 'ui-wipe__grip'; grip.setAttribute('aria-hidden', 'true'); grip.textContent = '↔';
  const output = document.createElement('span'); output.className = 'ui-wipe__value'; output.setAttribute('aria-hidden', 'true'); handle.append(grip, output);
  let dragging = false;
  const update = next => { value = Math.max(0, Math.min(100, Math.round(next))); beforeSide.style.width = `${value}%`; handle.style.left = `${value}%`; handle.setAttribute('aria-valuenow', String(value)); handle.setAttribute('aria-valuetext', `${value} percent`); output.textContent = `${value}%`; };
  const setMode = next => {
    mode = ['wipe', 'side-by-side', 'overlay'].includes(next) ? next : 'wipe'; stage.dataset.mode = mode; handle.hidden = mode !== 'wipe';
    if (mode === 'wipe') update(value);
    else beforeSide.style.width = mode === 'side-by-side' ? 'auto' : '100%';
  };
  const fromPointer = event => { const bounds = stage.getBoundingClientRect(); update((event.clientX - bounds.left) / bounds.width * 100); };
  handle.addEventListener('pointerdown', event => { if (locked) return; dragging = true; handle.classList.add('is-dragging'); handle.setPointerCapture(event.pointerId); fromPointer(event); });
  handle.addEventListener('pointermove', event => { if (dragging) fromPointer(event); });
  const end = () => { dragging = false; handle.classList.remove('is-dragging'); };
  handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || locked) return; event.preventDefault(); update(event.key === 'Home' ? 0 : event.key === 'End' ? 100 : value + (event.shiftKey ? 10 : 1) * (event.key === 'ArrowRight' ? 1 : -1)); });
  stage.append(afterSide, beforeSide, handle); host.append(stage); update(value); setMode(mode);
  return { element: stage, handle, setValue: update, setMode, destroy() { stage.remove(); } };
}
