import { expect } from 'playwright/test';

async function openSettings(page, id) {
  const settings = page.locator('details').filter({ has: page.locator(`#${id}`) }).first();
  if (!await settings.evaluate(node => node.open)) await settings.locator(':scope > summary').click();
}

export async function chooseTrainerSetting(page, id, value) {
  await openSettings(page, id);
  const host = page.locator(`#${id} + .trainer-settings-control`);
  await host.getByRole('combobox').click();
  await host.locator(`[role="option"][data-value="${value}"]`).click();
  await expect(page.locator(`#${id}`)).toHaveValue(String(value));
}

export async function enableTrainerSetting(page, id) {
  await openSettings(page, id);
  const toggle = page.locator(`#${id} + .trainer-settings-control`).getByRole('switch');
  if (await toggle.getAttribute('aria-checked') !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator(`#${id}`)).toBeChecked();
}
