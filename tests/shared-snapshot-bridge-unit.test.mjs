import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotBridge } from '../src/ui/shared/snapshot-bridge.js';

test('snapshot bridge returns the active mounted owner and combines the shared shell', () => {
  const bridge = createSnapshotBridge();
  let model = { screen: 'solving', moveIndex: 4 };
  const unmount = bridge.mount({ owner: 'F1', route: '/solve', handle: { getViewModel: () => model } });
  const shared = { header: { activeRoute: 'solve' } };
  assert.deepEqual(bridge.getViewModel(shared), {
    schemaVersion: 1, owner: 'F1', dataOwner: 'F1', route: '/solve', state: 'solving', viewModel: model, shared,
  });
  const captured = bridge.getViewModel(shared);
  captured.viewModel.moveIndex = -1;
  assert.equal(model.moveIndex, 4);
  model = { screen: 'results', moveIndex: 20 };
  assert.deepEqual(bridge.getViewModel(shared).viewModel, model);
  unmount();
  assert.equal(bridge.getViewModel(shared), null);
});

test('snapshot bridge never invents a missing page model and stale unmounts cannot clear a newer route', () => {
  const bridge = createSnapshotBridge();
  bridge.mount({ owner: 'F2', route: '/history', handle: {} });
  assert.equal(bridge.getViewModel({ header: {} }), null);
  const oldUnmount = bridge.mount({ owner: 'F1', route: '/solve', handle: { getViewModel: () => ({ state: 'active' }) } });
  bridge.mount({ owner: 'F5', dataOwner: 'F6', route: '/progress', handle: { getViewModel: () => ({ state: 'goal-progress' }) } });
  oldUnmount();
  assert.equal(bridge.getViewModel().route, '/progress');
  bridge.clear();
  assert.equal(bridge.getViewModel(), null);
});

test('snapshot bridge rejects non-JSON owner state instead of silently dropping it', () => {
  const bridge = createSnapshotBridge();
  bridge.mount({ owner: 'F1', route: '/solve', handle: { getViewModel: () => ({ state: 'active', action() {} }) } });
  assert.throws(() => bridge.getViewModel(), /JSON-safe/);
});
