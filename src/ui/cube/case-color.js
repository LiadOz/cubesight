import { CASE_COLORS, normalizeCaseColorSetting } from './orientation.js';

export const CASE_COLOR_STORAGE_KEY = 'cubesight-case-color-v1';
export const CASE_COLOR_CHANGE_EVENT = 'cubesight-case-color-change';

export function readCaseColorSetting(storage) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { return 'yellow top'; } }
  try { return normalizeCaseColorSetting(storage?.getItem(CASE_COLOR_STORAGE_KEY)); }
  catch { return 'yellow top'; }
}

export function writeCaseColorSetting(value, storage) {
  const setting = normalizeCaseColorSetting(value);
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { return setting; } }
  try { storage?.setItem(CASE_COLOR_STORAGE_KEY, setting); } catch { /* Retain the current view if storage is unavailable. */ }
  const target = globalThis.window ?? globalThis;
  if (typeof target.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    target.dispatchEvent(new CustomEvent(CASE_COLOR_CHANGE_EVENT, { detail: { setting } }));
  }
  return setting;
}

export { CASE_COLORS };
