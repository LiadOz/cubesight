// Brain v2 entry: createBrain(root, cubeSession) returns the stable handle
// main.js keeps for the page's lifetime ({ setActive, detach, reset }).
// "Rebuild view" tears the current controller down completely (subscriptions,
// live tracker, WebGL cube, listeners) and mounts a fresh one behind the handle.
//
// Style modules (styles/<id>/index.js) export a StyleModule as their default
// export; they load lazily, so only the chosen style's code and CSS ship.
//
// Dev gallery: /?brainGallery=1#/brain renders fixtures.js through the shell
// and a style, with no cube or controller, for building and screenshotting
// the styles.

import { createWakeLock } from '../wake-lock.js';
import { smartCube } from '../smart-cube-bluetooth.js';
import { mountBrainController } from './controller.js';
import { BRAIN_STYLES, DEFAULT_BRAIN_STYLE } from './types.js';

const STYLES = {
  orbit: () => import('./styles/orbit/index.js'),
  mono: () => import('./styles/mono/index.js'),
};

/** @returns {Promise<import('./types.js').StyleModule>} */
export async function loadStyle(id) {
  const mod = await (STYLES[id] ?? STYLES[DEFAULT_BRAIN_STYLE])();
  return mod.default ?? mod.style ?? mod;
}

async function loadShell() {
  const mod = await import('./shell.js');
  return mod.createShell;
}

export function createBrain(root, cubeSession = smartCube) {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('brainGallery')) return mountBrainGallery(root);
  let active = true;
  let view = null;
  let detached = false;
  let createShell = null;
  const wake = createWakeLock();   // the screen stays on while the solve page is the one in view
  const mount = () => {
    view?.detach();
    root.replaceChildren();   // drop main.js's "Loading Brain…" placeholder
    view = mountBrainController(root, cubeSession, { createShell, loadStyle, rebuild: mount });
    view.setActive(active);
  };
  const ready = loadShell().then(fn => { createShell = fn; if (!detached) mount(); }, error => {
    console.error('[brain] shell failed to load', error);
    root.textContent = 'Couldn’t load solve. Reload and try again.';
  });
  return {
    ready,
    setActive(value) { active = value; view?.setActive(value); if (value) wake.hold(); else wake.release(); },
    detach() { detached = true; wake.release(); view?.detach(); },
    reset() { if (createShell) mount(); return this; },
    /** The current view-model (tests and the dev console). */
    getViewModel: () => view?.getViewModel() ?? null,
    getCubeState: () => view?.getCubeState() ?? null,
    dispatch: action => view?.dispatch(action),
  };
}

/** Render fixtures through the shell without a cube: pick fixture, style and theme. */
export function mountBrainGallery(root) {
  let shell = null;
  let vm = null;
  let raf = 0;
  let anchor = 0;
  let fixtures = {};
  let styleId = new URLSearchParams(location.search).get('style') ?? DEFAULT_BRAIN_STYLE;
  let name = new URLSearchParams(location.search).get('fixture') ?? 'solving';
  const ready = (async () => {
    const [createShell, fixtureMod, viewModel] = await Promise.all([loadShell(), import('./fixtures.js'), import('./view-model.js')]);
    root.innerHTML = '<div class="brain-gallery-bar" style="display:flex;gap:.5rem;padding:.5rem;font:12px monospace"><select data-g="fixture"></select><select data-g="style"></select><select data-g="theme"><option>dark</option><option>light</option></select></div><div class="brain-gallery-stage"></div>';
    const stage = root.querySelector('.brain-gallery-stage');
    shell = createShell(stage, { dispatch: action => {
      console.info('[gallery] action', action);
      if (action.type === 'toggleSettings' && vm) {
        const next = { ...vm, settings: { ...vm.settings, open: !vm.settings.open } };
        shell.update(next, vm);
        vm = next;
      }
    } });
    const select = key => root.querySelector(`[data-g="${key}"]`);
    select('fixture').innerHTML = fixtureMod.FIXTURE_NAMES.map(n => `<option${n === name ? ' selected' : ''}>${n}</option>`).join('');
    select('style').innerHTML = BRAIN_STYLES.map(s => `<option${s === styleId ? ' selected' : ''}>${s}</option>`).join('');
    select('theme').value = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const show = async () => {
      name = select('fixture').value;
      styleId = select('style').value;
      document.documentElement.dataset.theme = select('theme').value;
      fixtures = fixtureMod.brainFixtures({ style: styleId, theme: select('theme').value });
      shell.setStyle(await loadStyle(styleId));
      const next = fixtures[name];
      shell.update(next, vm);
      vm = next;
      root.dataset.fixture = name;
      // Timing fixtures keep running from their frozen instant.
      anchor = performance.now();
      cancelAnimationFrame(raf);
      const tick = () => {
        if (!vm?.clock.running && !vm?.inspection) return;
        const base = vm.clock.startedAt != null ? vm.clock.startedAt + vm.clock.ms : vm.inspection.startedAt + vm.inspection.elapsedMs;
        shell.frame?.(viewModel.frameState(vm, base + (performance.now() - anchor)));
        raf = requestAnimationFrame(tick);
      };
      if (!new URLSearchParams(location.search).has('frozen')) raf = requestAnimationFrame(tick);
    };
    root.addEventListener('change', event => { if (event.target.closest('[data-g]')) void show(); });
    await show();
  })().catch(error => { console.error('[brain] gallery failed', error); root.textContent = `Gallery failed: ${error.message}`; });
  return {
    ready,
    setActive() {},
    detach() { cancelAnimationFrame(raf); shell?.destroy(); root.innerHTML = ''; },
    reset() { return this; },
    getViewModel: () => vm,
    dispatch: () => {},
  };
}
