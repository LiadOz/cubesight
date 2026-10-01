// A styled "coming soon" page for routes that exist before their content does
// (#/algs now, #/progress until phase 2 fills it). Same frame as the drills hub.

import './page.css';
import './placeholder.css';
import { loadSettings } from '../brain/settings.js';
import { syncPageTokens } from './tokens.js';

/**
 * @param {HTMLElement} root
 * @param {{ title: string, blurb: string, next?: { label: string, href: string } }} copy
 */
export function createPlaceholderPage(root, copy, storage = globalThis.localStorage) {
  function render() {
    const page = document.createElement('section');
    page.className = 'brain cs-page cs-soon';
    page.dataset.brainStyle = loadSettings(storage).style;
    const head = document.createElement('header');
    head.className = 'cs-head';
    const title = document.createElement('h1');
    title.textContent = copy.title;
    const blurb = document.createElement('p');
    blurb.className = 'cs-sub';
    blurb.textContent = copy.blurb;
    head.append(title, blurb);
    const note = document.createElement('p');
    note.className = 'cs-soon-note';
    note.textContent = 'coming soon';
    page.append(head, note);
    if (copy.next) {
      const link = document.createElement('a');
      link.className = 'cs-soon-link';
      link.href = copy.next.href;
      link.textContent = copy.next.label;
      page.append(link);
    }
    root.replaceChildren(page);
    syncPageTokens(page);
  }
  render();
  return {
    setActive(value) { if (value) render(); },
    detach() { root.replaceChildren(); },
  };
}
