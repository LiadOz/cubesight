import { createRightDrawer } from '../ui/shared/index.js';
import './settings-drawer.css';

/** One settings surface for modes, pacing and round length across drills. */
export function createTrainerSettingsDrawer(host, onRoundClick) {
  const page = host.closest('.cs-page, .legacy-drill-view') || host.closest('[id$="-view"]');
  page.classList.add('drill-focus-page');
  const drawer = createRightDrawer(page, { title: 'drill settings' });
  drawer.element.classList.add('trainer-settings-drawer');
  // Settings keys belong to their controls, never to the case underneath.
  drawer.element.addEventListener('keydown', event => event.stopPropagation());
  const originals = [];
  for (const node of page.querySelectorAll(/* copy-ok: DOM selectors for the existing trainer controls */ '.training-settings, .pll-settings, .trainer-progress-details, .pll-progress-details')) {
    originals.push({ node, parent: node.parentNode, next: node.nextSibling });
    drawer.body.append(node);
  }
  const rounds = document.createElement('section');
  rounds.className = 'trainer-round-settings';
  rounds.innerHTML = '<h3>round</h3><div class="trainer-round-options"></div>';
  drawer.body.append(rounds);
  const options = rounds.lastElementChild;
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'trainer-settings-trigger';
  trigger.innerHTML = '<kbd class="key">tab</kbd><span>settings</span>';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  page.append(trigger);
  function open() {
    drawer.body.querySelectorAll(/* copy-ok: DOM selectors for the existing settings disclosures */ '.training-settings, .pll-settings').forEach(node => { node.open = true; });
    trigger.setAttribute('aria-expanded', 'true');
    drawer.open();
  }
  trigger.addEventListener('click', open);
  drawer.element.addEventListener('close', () => trigger.setAttribute('aria-expanded', 'false'));
  drawer.element.addEventListener('click', event => {
    if (!event.target.closest('[data-round]')) return;
    onRoundClick(event);
    drawer.close();
  });
  function onKey(event) {
    if (page.hidden || page.closest('[hidden]') || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const target = event.target;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    // Tab from the page opens settings; Tab on a control retains normal focus navigation.
    if ((event.key === 'Tab' && !event.shiftKey && !target?.closest('button, a, summary')) || event.key === ',') {
      event.preventDefault(); event.stopImmediatePropagation(); open();
    }
  }
  document.addEventListener('keydown', onKey, true);
  return {
    sync(content) {
      options.replaceChildren(...content.querySelectorAll(/* copy-ok: stored round preset identifiers */ '[data-round="2m"], [data-round="20"], [data-round="30s"]'));
      rounds.hidden = !options.childElementCount;
      content.querySelectorAll('.quick-round-presets, .quick-round-note').forEach(node => { node.hidden = true; });
    },
    setActive(active) { if (!active && drawer.element.open) drawer.close(); },
    destroy() {
      document.removeEventListener('keydown', onKey, true);
      for (const { node, parent, next } of originals) { parent.insertBefore(node, next?.parentNode === parent ? next : null); if (node.tagName === 'DETAILS') node.open = false; }
      drawer.destroy(); trigger.remove(); page.classList.remove('drill-focus-page');
    },
  };
}
