// Ring labels that would pile up: stages that end at the same moment (every skipped stage ends
// where the one before it ended; a pair built together with the cross ends with the cross) get ONE
// label between their arcs ("eo·co·cp·ep skip") instead of one each. Pure (unit-tested in node).

/**
 * @param {{key:string, state:string, merged?:boolean}[]} segments  in ring order
 * @param {(segment:object)=>string} nameOf  the short ring name of a stage ('eo', 'p2')
 * @returns {{keys:string[], kind:'single'|'skip'|'merged', name:string|null, value:string|null}[]}  in ring order; `name`/`value` replace
 *   the two lines of the first stage's label (null keeps its own); keys[0] is the label that stays visible
 */
export function groupEndLabels(segments, nameOf) {
  const kindOf = seg => (seg.state === 'skipped' ? 'skip' : seg.merged && seg.state === 'done' ? 'merged' : 'single');
  const groups = [];
  for (const seg of segments) {
    const kind = kindOf(seg);
    const last = groups[groups.length - 1];
    if (kind !== 'single' && last && last.kind === kind) { last.keys.push(seg.key); last.names.push(nameOf(seg)); }
    else groups.push({ keys: [seg.key], kind, names: [nameOf(seg)] });
  }
  return groups.map(g => ({
    keys: g.keys, kind: g.kind,
    name: g.kind === 'single' || g.keys.length === 1 ? null : g.names.join('·'),
    value: g.kind === 'single' || g.keys.length === 1 ? null : g.kind === 'skip' ? 'skip' : 'with cross',
  }));
}
