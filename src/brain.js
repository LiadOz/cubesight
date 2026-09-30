// Brain entry point used by main.js: the v2 Brain (src/brain/index.js).
//
// The first Brain UI stays reachable until the new one is signed off: set
// localStorage 'cubesight-brain-ui' to 'legacy' and reload. It loads lazily,
// because its global brain.css would otherwise restyle the v2 markup.

import { createBrain as createBrainV2 } from './brain/index.js';

export const LEGACY_UI_KEY = 'cubesight-brain-ui';

function wantsLegacy() {
  try { return globalThis.localStorage?.getItem(LEGACY_UI_KEY) === 'legacy'; } catch { return false; }
}

/** Same handle shape for both UIs: { ready, setActive, detach, reset }. */
export function createBrain(root, cubeSession) {
  if (!wantsLegacy()) return createBrainV2(root, cubeSession);
  let view = null;
  let active = true;
  let detached = false;
  const ready = import('./brain-legacy.js').then(({ createBrain: createLegacy }) => {
    if (detached) return;
    view = cubeSession ? createLegacy(root, cubeSession) : createLegacy(root);
    view.setActive(active);
  });
  return {
    ready,
    setActive(value) { active = value; view?.setActive(value); },
    detach() { detached = true; view?.detach?.(); },
    reset() { view?.reset?.(); return this; },
  };
}
