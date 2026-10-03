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

window.__f11Workers = [];
const NativeWorker = window.Worker;
window.Worker = class extends NativeWorker {
  constructor(url, options) {
    const createdAt = performance.now();
    super(url, options);
    const sample = { url: String(url), createdAt, firstReplyAt: null, resultAt: null, errorAt: null, errorMessage: null, terminatedAt: null };
    window.__f11Workers.push(sample);
    this.addEventListener('message', event => {
      const time = performance.now();
      sample.firstReplyAt ??= time;
      if (event.data?.type === 'result') sample.resultAt ??= time;
      if (event.data?.type === 'error') { sample.errorAt ??= time; sample.errorMessage ??= event.data.message ?? 'worker error reply'; }
    });
    this.addEventListener('error', event => { sample.errorAt ??= performance.now(); sample.errorMessage ??= event.message || 'worker error event'; });
    const terminate = this.terminate.bind(this);
    this.terminate = () => { sample.terminatedAt = performance.now(); terminate(); };
  }
};

setupTheme();
