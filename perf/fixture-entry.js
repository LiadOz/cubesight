import '@fontsource-variable/manrope';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import '../src/styles.css';
import '../src/pages/page.css';
import '../src/brain/css/tokens-orbit.css';
import '../src/brain/css/tokens-mono.css';
import '../src/legacy-reskin.css';
import { setupTheme } from '../src/theme.js';

// Track callbacks owned by this isolated document. Teardown assertions in the
// perf harness catch detached Brain/Cube RAF loops, not just leftover canvases.
const pendingFrames = new Set();
const requestFrame = window.requestAnimationFrame.bind(window);
const cancelFrame = window.cancelAnimationFrame.bind(window);
window.requestAnimationFrame = callback => {
  let id;
  id = requestFrame(time => {
    pendingFrames.delete(id);
    callback(time);
  });
  pendingFrames.add(id);
  return id;
};
window.cancelAnimationFrame = id => {
  pendingFrames.delete(id);
  cancelFrame(id);
};
window.__f11PendingAnimationFrames = () => pendingFrames.size;

setupTheme();
