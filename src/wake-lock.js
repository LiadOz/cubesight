// Screen Wake Lock, kept out of the way: a page asks to `hold()` while it wants the
// screen awake and to `release()` when it no longer does. Everything is best effort.
//
// Sharp edges handled here:
//  - request() rejects (hidden page, insecure context, low battery, refusal): swallowed.
//  - The browser drops the lock whenever the page is hidden and never gives it back,
//    so we re-request on visibilitychange once the page is visible again.
//  - Feature-detected with `'wakeLock' in navigator`; unsupported browsers do nothing.
//  - Hidden pages hold nothing; release() frees the lock immediately.

export function createWakeLock({ nav = globalThis.navigator, doc = globalThis.document } = {}) {
  const supported = !!nav && 'wakeLock' in nav && !!doc;
  let wanted = false;
  let sentinel = null;
  let pending = false;

  async function acquire() {
    if (!supported || !wanted || sentinel || pending || doc.visibilityState === 'hidden') return;
    pending = true;
    try {
      const lock = await nav.wakeLock.request('screen');
      if (!wanted) { lock.release?.().catch?.(() => {}); return; }
      sentinel = lock;
      lock.addEventListener?.('release', () => { if (sentinel === lock) sentinel = null; });
    } catch { /* best effort: not worth telling the user */ }
    finally { pending = false; }
  }

  function onVisibility() {
    if (doc.visibilityState === 'visible') acquire();
  }

  return {
    supported,
    hold() {
      if (!supported || wanted) return;
      wanted = true;
      doc.addEventListener('visibilitychange', onVisibility);
      
      acquire();
    },
    release() {
      if (!wanted) return;
      wanted = false;
      doc.removeEventListener('visibilitychange', onVisibility);
      const lock = sentinel;
      sentinel = null;
      try { lock?.release?.().catch?.(() => {}); } catch { /* already released */ }
    },
  };
}
