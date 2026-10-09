// TEST-ONLY stand-in for src/cube-3d.js: an empty box with the cube's API, all no-ops. When the
// app is served or built with VITE_CUBESIGHT_TEST_STUB=1 (only the tests do that), every import of
// cube-3d.js resolves here (vite.config.js), so no 3D cube code and no three.js ever load in a test.
// The cube comes from a library we do not test; tests check the page around it.
export function createCube3D(container, options = {}) {
  const box = document.createElement('canvas');
  box.dataset.cubePlaceholder = '1';
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', 'Interactive three-dimensional Rubik’s Cube.');
  box.style.cssText = 'display:block;width:100%;height:100%';
  container.replaceChildren(box);
  let mode = options.mode ?? 'scout';
  const none = () => {};
  return {
    update: none,
    animateMove: async () => {},
    setCue: () => 0,
    clearCue: none,
    getCueState: () => null,
    setTurnHint: none,
    queueLiveMove: none,
    setMode: next => { mode = next ?? mode; },
    setViewOffset: none,
    setOrientation: none,
    setGyroOrientation: none,
    recenterGyro: none,
    getHeldFaces: () => ({ bottom: 'D', front: 'F' }),
    setFullTouchRotation: none,
    resetView: none,
    destroy: () => container.replaceChildren(),
  };
}
