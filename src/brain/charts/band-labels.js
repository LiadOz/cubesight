// Band names above the TPS chart, chosen so neighbours never overlap. Pure (unit-tested in node).

// Approximate width of a band label in viewBox units (11 px mono text).
const textWidth = text => text.length * 6.8 + 6;

/**
 * Choose what to print above each band so neighbours never overlap: the full name when it fits
 * between the previous label and the next band edge, else the short name, else nothing (the band
 * keeps its title). Pure, unit-tested.
 * @param {{label:string, short?:string, from:number, to:number}[]} bands  x positions in viewBox units
 * @returns {(string|null)[]}
 */
export function fitBandLabels(bands, measure = textWidth) {
  let edge = -Infinity;
  return bands.map(band => {
    const mid = (band.from + band.to) / 2;
    for (const text of [band.label, band.short]) {
      if (!text) continue;
      const w = measure(text);
      if (mid - w / 2 >= edge && w <= Math.max(band.to - band.from, 0) + 10) { edge = mid + w / 2; return text; }
    }
    return null;
  });
}

