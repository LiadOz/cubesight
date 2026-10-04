import { expect } from 'playwright/test';

export async function selectOrbitMarker(brain, id) {
  const clusters = brain.locator('[data-marker-keys]');
  const entries = await clusters.evaluateAll(nodes => nodes.map(node => JSON.parse(node.dataset.markerKeys)));
  const index = entries.findIndex(keys => keys.includes(id));
  expect(index, `Orbit exposes marker ${id}`).toBeGreaterThanOrEqual(0);
  await clusters.nth(index).press('Enter');
  if (entries[index].length > 1) await brain.locator(`[data-marker-detail-key="${id}"]`).press('Enter');
}

