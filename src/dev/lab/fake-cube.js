export async function createLabCube() {
  const [{ smartCube, setReplayConnectDevice }, { createManualDevice }] = await Promise.all([
    import('../../smart-cube-bluetooth.js'), import('../../recording-replay.js'),
  ]);
  const device = createManualDevice({ deviceName: 'CubeSight lab cube', protocol: { id: 'lab', name: 'Lab fixture' } });
  setReplayConnectDevice(() => Promise.resolve(device.connection));
  let tick = 0;

  function emitTurn(raw) {
    const move = raw.replace('2', '');
    tick += 1000;
    device.move(move, tick);
    if (raw.endsWith('2')) { tick += 20; device.move(move, tick); }
  }
  async function emitTimed(moves, delay = 70) {
    for (const raw of moves.trim().split(/\s+/).filter(Boolean)) {
      await new Promise(resolve => setTimeout(resolve, delay));
      emitTurn(raw);
    }
  }
  return { session: smartCube, device, emitTurns: moves => moves.trim().split(/\s+/).filter(Boolean).forEach(emitTurn), emitTimed };
}

export async function runResultsFixture(root, labCube, { openReview = false, getViewModel = () => null } = {}) {
  const setup = root.querySelector('.brain-pill-setup > summary');
  setup?.click();
  root.querySelector('.brain-advanced-scramble > summary')?.click();
  const input = root.querySelector('#brain-scramble');
  if (!input) throw new Error('The solve setup is not ready.');
  input.value = "R U R' U'";
  input.dispatchEvent(new Event('input', { bubbles: true }));
  root.querySelector('#brain-start-custom')?.click();
  await new Promise(resolve => setTimeout(resolve, 80));
  labCube.emitTurns("R U R' U'");
  await new Promise(resolve => setTimeout(resolve, 80));
  await labCube.emitTimed("U R U' R'");
  if (openReview) {
    const deadline = Date.now() + 15_000;
    let vm = getViewModel();
    while (Date.now() < deadline && (vm?.screen !== 'results' || !vm.results?.review?.markers?.length)) {
      await new Promise(resolve => setTimeout(resolve, 100));
      vm = getViewModel();
    }
    const markerId = vm?.results?.review?.markers?.[0]?.id;
    if (!markerId) throw new Error('Review-detail fixture failed: the mounted solve model produced no markers.');
    let marker;
    const markerDeadline = Date.now() + 3000;
    while (Date.now() < markerDeadline && !marker) {
      marker = [...root.querySelectorAll('[data-marker-keys]')].find(node => {
        try { return JSON.parse(node.dataset.markerKeys).includes(markerId); } catch { return false; }
      });
      if (!marker) await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!marker) throw new Error(`Review-detail fixture failed: mounted Orbit has no marker ${markerId}.`);
    marker.click();
    await new Promise(resolve => setTimeout(resolve, 50));
    if (!vm.results.review.markers.some(item => item.id === markerId)) throw new Error(`Review-detail fixture failed: marker ${markerId} is not in the mounted model.`);
    const next = getViewModel();
    if (next?.results?.review?.detail?.kind !== 'marker') {
      const details = [...root.querySelectorAll('[data-marker-detail-key]')].find(node => node.dataset.markerDetailKey === markerId);
      if (details) details.click();
    }
    const selectedDeadline = Date.now() + 2000;
    let selected = getViewModel();
    while (Date.now() < selectedDeadline && selected?.results?.review?.detail?.kind !== 'marker') {
      await new Promise(resolve => setTimeout(resolve, 50));
      selected = getViewModel();
    }
    if (selected?.results?.review?.detail?.kind !== 'marker') throw new Error(`Review-detail fixture failed: selecting ${markerId} did not open marker detail.`);
  }
}
