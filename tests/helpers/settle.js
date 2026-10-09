/**
 * Wait for the page to go quiet instead of sleeping a fixed time: resolves once no DOM mutation has happened for
 * `quietMs` (a route has rendered and its async pieces have landed), capped at `maxMs`. Returns the widest
 * horizontal overflow (scrollWidth - innerWidth, px) seen at any moment of the wait, so a layout that overflows
 * only transiently is still caught; a fixed sleep only ever looked at its last instant.
 */
export async function settleAndMeasureOverflow(page, { quietMs = 100, maxMs = 1500 } = {}) {
  return page.evaluate(({ quietMs, maxMs }) => new Promise(resolve => {
    const overflow = () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
    let widest = overflow(), quiet, done = false;
    const finish = () => { if (done) return; done = true; observer.disconnect(); clearTimeout(cap); resolve(Math.max(widest, overflow())); };
    const bump = () => { widest = Math.max(widest, overflow()); clearTimeout(quiet); quiet = setTimeout(finish, quietMs); };
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    const cap = setTimeout(finish, maxMs);
    bump();
  }), { quietMs, maxMs });
}
