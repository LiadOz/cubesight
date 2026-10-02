/* global window, document, URLSearchParams */
/* Builders and the keyboard behaviour for the selection controls. One DOM for all three options. */
(function () {
  const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
  const CHEV = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>';
  const cls = (...a) => a.filter(Boolean).join(' ');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const UI = {
    chip(label, o = {}) {
      return `<button type="button" class="${cls('chip', o.cls)}" aria-pressed="${!!o.sel}"${o.dis ? ' disabled' : ''}>`
        + (o.dot ? '<span class="chip__dot"></span>' : '') + `<span>${esc(label)}</span>`
        + (o.n != null ? `<span class="chip__n">${o.n}</span>` : '') + '</button>';
    },
    seg(label, opts, i, o = {}) {
      return `<div class="${cls('seg', o.mono && 'seg--mono', o.cls)}" role="radiogroup" aria-label="${esc(label)}" style="--n:${opts.length};--i:${i}"${o.dis ? ' aria-disabled="true"' : ''}>`
        + '<span class="seg__thumb"></span>'
        + opts.map((t, k) => `<button type="button" role="radio" class="${cls('seg__o', o.states && o.states[k])}" aria-checked="${k === i}" tabindex="${k === i ? 0 : -1}"${o.dis ? ' disabled' : ''}>${esc(t)}</button>`).join('')
        + '</div>';
    },
    sw(label, on, o = {}) {
      return `<button type="button" role="switch" class="${cls('sw', o.row && 'sw--row', o.cls)}" aria-checked="${!!on}"${o.dis ? ' disabled' : ''}>`
        + `<span class="sw__txt"><span>${esc(label)}</span>${o.sub ? `<span class="sw__sub">${esc(o.sub)}</span>` : ''}</span>`
        + `<span class="sw__track"><span class="sw__thumb">${CHECK}</span></span></button>`;
    },
    cb(label, on, o = {}) {
      return `<button type="button" role="checkbox" class="${cls('cb', o.cls)}" aria-checked="${!!on}"${o.dis ? ' disabled' : ''}>`
        + `<span class="cb__box">${CHECK}</span><span>${esc(label)}</span></button>`;
    },
    sel(label, items, i, o = {}) {
      return `<span class="${cls('sel', o.open && 'is-open', o.cls)}" data-sel>`
        + `<button type="button" class="sel__btn" aria-haspopup="listbox" aria-expanded="${!!o.open}" aria-label="${esc(label)}"${o.dis ? ' disabled' : ''}><span>${esc(items[i])}</span>${CHEV}</button>`
        + `<ul class="sel__list" role="listbox" aria-label="${esc(label)}">`
        + items.map((t, k) => `<li role="option" class="${cls('sel__opt', o.active === k && 'is-active', o.disabledItems && o.disabledItems.includes(k) && 'is-disabled')}" aria-selected="${k === i}"><span>${esc(t)}</span>${CHECK}</li>`).join('')
        + '</ul></span>';
    },
    field(label, html) { return `<div class="field"><span class="field__l">${esc(label)}</span>${html}</div>`; },
    choice(label, o = {}) {
      const mark = o.mark ? `<span class="choice__mark">${o.mark}</span>` : '';
      const sw = o.swatch ? `<span class="choice__sw" style="background:var(--b-st-${o.swatch})"></span>` : '';
      return `<button type="button" class="${cls('choice', o.cls)}"${o.sel ? ' aria-pressed="true"' : ''}${o.dis ? ' disabled' : ''}>`
        + (o.key ? `<span class="choice__key">${o.key}</span>` : '') + sw + `<span>${esc(label)}</span>` + mark + '</button>';
    },
    co(n, style) { return `<b class="co" style="${style}">${'①②③④⑤⑥⑦⑧⑨'[n - 1]}</b>`; },
  };

  /* Behaviour: segmented (roving focus, arrows, Home/End), switch/checkbox/chip toggles, select (listbox keys). */
  function wire(root) {
    root.querySelectorAll('.seg').forEach((seg) => {
      const opts = [...seg.querySelectorAll('.seg__o')];
      const pick = (k) => {
        opts.forEach((b, j) => { b.setAttribute('aria-checked', String(j === k)); b.tabIndex = j === k ? 0 : -1; });
        seg.style.setProperty('--i', k);
        opts[k].focus();
      };
      opts.forEach((b, k) => {
        b.addEventListener('click', () => pick(k));
        b.addEventListener('keydown', (e) => {
          const map = { ArrowRight: k + 1, ArrowDown: k + 1, ArrowLeft: k - 1, ArrowUp: k - 1, Home: 0, End: opts.length - 1 };
          if (!(e.key in map)) return;
          e.preventDefault();
          pick((map[e.key] + opts.length) % opts.length);
        });
      });
    });
    root.querySelectorAll('.sw, .cb').forEach((b) => b.addEventListener('click', () => b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true'))));
    root.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'))));
    root.querySelectorAll('[data-sel]').forEach((s) => {
      const btn = s.querySelector('.sel__btn');
      const items = [...s.querySelectorAll('.sel__opt')];
      let active = Math.max(0, items.findIndex((x) => x.getAttribute('aria-selected') === 'true'));
      const paint = () => items.forEach((x, k) => x.classList.toggle('is-active', k === active));
      const open = (v) => { s.classList.toggle('is-open', v); btn.setAttribute('aria-expanded', String(v)); if (v) paint(); };
      const choose = (k) => {
        items.forEach((x, j) => x.setAttribute('aria-selected', String(j === k)));
        btn.firstElementChild.textContent = items[k].firstElementChild.textContent;
        active = k; open(false);
      };
      btn.addEventListener('click', () => open(!s.classList.contains('is-open')));
      btn.addEventListener('keydown', (e) => {
        const isOpen = s.classList.contains('is-open');
        if (!isOpen && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open(true); return; }
        if (!isOpen) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
        else if (e.key === 'Home') { e.preventDefault(); active = 0; paint(); }
        else if (e.key === 'End') { e.preventDefault(); active = items.length - 1; paint(); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
        else if (e.key === 'Escape') { e.preventDefault(); open(false); }
        else if (e.key.length === 1) { const k = items.findIndex((x) => x.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase())); if (k >= 0) { active = k; paint(); } }
      });
      items.forEach((x, k) => x.addEventListener('click', () => choose(k)));
    });
  }

  function boot() {
    const q = new URLSearchParams(window.location.search);
    const opt = q.get('opt') || '1';
    const theme = q.get('theme') || 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.background = theme === 'dark' ? '#141311' : '#f3f0e8';
    const root = document.querySelector('.brain');
    root.dataset.opt = opt;
    return { opt, theme, scene: q.get('scene') || 'states', root };
  }

  window.UI = UI;
  window.UIWire = wire;
  window.UIBoot = boot;
})();
