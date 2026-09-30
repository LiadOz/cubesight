// Theme the 3D cube's stickers from the Brain style tokens (--b-st-w … --b-st-o,
// see docs/design/brain-v2/tokens.md). toRenderData() emits the canonical
// COLOR_HEX values; themedRender() swaps them for the style's palette without
// touching cube-3d.js. Pure except readStickerPalette(), which reads CSS.

import { COLOR_HEX } from '../cross-cube.js';

export const STICKER_TOKENS = Object.freeze({ white: '--b-st-w', yellow: '--b-st-y', green: '--b-st-g', blue: '--b-st-b', red: '--b-st-r', orange: '--b-st-o' });

/** { canonicalHex: themedHex } from the element's computed --b-st-* tokens (empty when unset). */
export function readStickerPalette(el) {
  if (!el || typeof getComputedStyle !== 'function') return {};
  const style = getComputedStyle(el);
  const map = {};
  for (const [color, token] of Object.entries(STICKER_TOKENS)) {
    const value = style.getPropertyValue(token).trim();
    if (value) map[COLOR_HEX[color].toLowerCase()] = value;
  }
  return map;
}

const swap = (obj, map) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, map[String(v).toLowerCase()] ?? v]));

/** Render data with its sticker colours mapped through `map` (returned as-is when the map is empty). */
export function themedRender(data, map) {
  if (!data || !map || !Object.keys(map).length) return data;
  return { ...data, colors: swap(data.colors, map), cornerStickers: swap(data.cornerStickers, map), stickerColors: swap(data.stickerColors, map) };
}
