/** Runtime bridge for the mounted page owner; clearing it prevents stale route state. */
function cloneJsonSafe(value, path = 'snapshot', seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    return { $number: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity' };
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError(`${path} cannot contain cycles`);
    seen.add(value);
    const copy = value.map((item, index) => cloneJsonSafe(item, `${path}[${index}]`, seen));
    seen.delete(value);
    return copy;
  }
  if (typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${path} must contain only JSON-safe values`);
  }
  if (seen.has(value)) throw new TypeError(`${path} cannot contain cycles`);
  seen.add(value);
  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) copy[key] = cloneJsonSafe(item, `${path}.${key}`, seen);
  }
  seen.delete(value);
  return copy;
}

export function createSnapshotBridge() {
  let active = null;
  return {
    mount({ owner, dataOwner = owner, route, handle } = {}) {
      const page = { owner, dataOwner, route, handle };
      active = page;
      return () => { if (active === page) active = null; };
    },
    clear() { active = null; },
    getViewModel(shared = null) {
      if (!active || typeof active.handle?.getViewModel !== 'function') return null;
      const viewModel = active.handle.getViewModel();
      if (!viewModel || typeof viewModel !== 'object') return null;
      return cloneJsonSafe({
        schemaVersion: 1,
        owner: active.owner,
        dataOwner: active.dataOwner,
        route: active.route,
        state: typeof viewModel.screen === 'string' ? viewModel.screen
          : typeof viewModel.state === 'string' ? viewModel.state
            : typeof viewModel.phase === 'string' ? viewModel.phase : 'active',
        viewModel,
        shared,
      });
    },
  };
}
