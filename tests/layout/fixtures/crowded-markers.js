// Stress data for the focus Orbit. The four opening markers are all within 5°.
// `angle` is clockwise from the top; labels preserve the time/key fact so a
// cluster implementation must retain it on expansion and in its badge.
export const CROWDED_MARKERS = [
  [100, 'cross · 1.42 s · R'], [101.2, 'pause · 0.84 s · U'],
  [102.7, 'detour · 2 moves · F'], [104.8, 'pair 1 · +0.31 s · L'],
  [128, 'pair 2 · 1.18 s · U'], [151, 'pair 3 · 1.32 s · R'],
  [177, 'pair 4 · 1.51 s · F'], [204, 'pair 5 · 1.44 s · D'],
  [232, 'OLL · 1.20 s · U'], [258, 'PLL · 1.72 s · R'],
  [284, 'AUF · 0.22 s · U'], [310, 'recognition · 0.63 s · L'],
  [336, 'rotation · 0.41 s · y'], [42, 'clean cross · 6 moves'],
  [72, 'best pair · slot FR'],
].map(([angle, label], index) => ({ key: `crowded-${index + 1}`, angle, label, marker: index < 4 ? 'bad' : index % 2 ? 'good' : 'bad' }));

export function validateCrowdedMarkerFixture(markers = CROWDED_MARKERS) {
  if (markers.length < 12) throw new Error(`crowded marker fixture needs 12+ markers, got ${markers.length}`);
  const closePairs = [];
  for (let i = 0; i < markers.length; i++) for (let j = i + 1; j < markers.length; j++) {
    const raw = Math.abs(markers[i].angle - markers[j].angle);
    const distance = Math.min(raw, 360 - raw);
    if (distance < 5) closePairs.push([markers[i].key, markers[j].key, distance]);
  }
  if (closePairs.length < 3) throw new Error(`fixture needs several markers within 5°, got ${closePairs.length} close pairs`);
  if (markers.some(marker => !marker.label || !marker.key)) throw new Error('each crowded marker must preserve key and label information');
  return { count: markers.length, closePairs };
}
