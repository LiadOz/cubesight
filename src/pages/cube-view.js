import { toRenderData } from '../cross-cube.js';
import { readStickerPalette, themedRender } from '../brain/cube-theme.js';
import './cube-view.css';

/** The existing solve cube, loaded on demand and painted with the page tokens. */
export async function createPageCube(host, { state = null, mode = 'corner', signal } = {}) {
  if (!host) throw new Error('A cube mount is required.');
  const { createCube3D } = await import('../cube-3d.js');
  if (signal?.aborted) throw new DOMException('Cube mount was cancelled.', 'AbortError');
  host.classList.add('cs-cube');
  const cube = createCube3D(host, { mode });
  let lastData = null, destroyed = false;
  const paint = data => themedRender(data, readStickerPalette(host));
  const update = data => {
    if (destroyed || !data) return;
    lastData = data;
    cube.update(paint(data));
  };
  const retheme = () => { if (lastData && !destroyed) cube.update(paint(lastData)); };
  document.addEventListener('cubesight-theme', retheme);
  const page = host.closest('.brain');
  const observer = new MutationObserver(retheme);
  if (page) observer.observe(page, { attributes: true, attributeFilter: ['data-brain-style'] });
  if (state) update(toRenderData(state));
  return {
    ...cube,
    host,
    update,
    animateMove(move, data, duration) {
      if (destroyed) return Promise.resolve();
      if (data) lastData = data;
      return cube.animateMove(move, data ? paint(data) : data, duration);
    },
    queueLiveMove(move, data, options) {
      if (destroyed) return;
      if (data) lastData = data;
      cube.queueLiveMove(move, data ? paint(data) : data, options);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      document.removeEventListener('cubesight-theme', retheme);
      cube.destroy();
      host.classList.remove('cs-cube');
    },
  };
}
