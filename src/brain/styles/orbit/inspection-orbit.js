// Pure inspection zones and ticks for the shared solve Orbit.
export function inspectionSegments(inspection) {
  const limit = inspection.limitMs;
  const elapsed = inspection.elapsedMs ?? 0;
  if (!limit) return [{ key: 'elapsed', label: 'inspection', weight: 1, fill: inspection.caret ?? elapsed / 60000, state: 'current', importance: 100 }];
  const zones = inspection.zones?.length ? inspection.zones : [{ kind: 'normal', fromMs: 0, toMs: limit }];
  // Custom grace periods can extend past the default WCA scale. Open-ended
  // overtime needs room for both its elapsed portion and the next count tick.
  const finiteEnd = Math.max(limit, ...zones.map(zone => zone.toMs ?? zone.fromMs));
  const scale = Math.max(inspection.scaleMs ?? limit, finiteEnd + (zones.some(zone => zone.toMs == null) ? 2000 : 0), elapsed + (inspection.overtime === 'count' ? 1000 : 0));
  return zones.map(zone => {
    const from = zone.fromMs ?? 0;
    const end = zone.toMs ?? scale;
    const fill = Math.min(1, Math.max(0, (elapsed - from) / Math.max(1, end - from)));
    const active = elapsed >= from;
    const label = { normal: `${limit / 1000} s`, plus2: '+2', dnf: 'DNF', grace: 'grace', count: 'overtime' }[zone.kind];
    const state = !active ? 'future' : zone.kind === 'dnf' ? 'bad'
      : zone.toMs != null && elapsed >= end ? (zone.kind === 'plus2' ? 'bad' : 'done')
      : zone.kind === 'plus2' ? 'wrong' : 'current';
    return { key: zone.kind === 'normal' ? 'inspection' : zone.kind, fromMs: from, toMs: end, label, weight: Math.max(.04, (end - from) / scale), fill, state, importance: zone.kind === 'normal' ? 100 : 90 };
  });
}

export function inspectionMarkers(inspection) {
  const segments = inspectionSegments(inspection);
  return (inspection.ticks ?? []).map(tick => {
    const zone = inspection.zones?.find(item => tick.atMs >= (item.fromMs ?? 0) && (item.toMs == null || tick.atMs < item.toMs));
    const key = !zone || zone.kind === 'normal' ? 'inspection' : zone.kind;
    const segment = segments.find(item => item.key === key);
    const from = segment?.fromMs ?? 0;
    const duration = (segment?.toMs ?? inspection.limitMs) - from;
    return { key: `inspection-${tick.kind}-${tick.atMs}`, segment: key, position: Math.min(1, Math.max(0, (tick.atMs - from) / Math.max(1, duration))), label: tick.label, tone: 'good', type: 'tick' };
  });
}

