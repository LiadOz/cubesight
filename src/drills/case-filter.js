/** Resolve a portable `cases=` list against a drill's canonical identifiers. */
export function parseCaseFilter(values, allowedValues) {
  const allowed = [...allowedValues].map(value => String(value));
  const byFoldedName = new Map(allowed.map(value => [value.toLocaleUpperCase('en-US'), value]));
  const requested = Array.isArray(values) ? values.map(value => String(value).trim()).filter(Boolean) : [];
  const resolved = [];
  const invalid = [];
  for (const value of requested) {
    const canonical = byFoldedName.get(value.toLocaleUpperCase('en-US'));
    if (canonical == null) invalid.push(value);
    else if (!resolved.includes(canonical)) resolved.push(canonical);
  }
  return {
    requested: requested.length > 0,
    valid: invalid.length === 0,
    values: resolved,
    invalid,
  };
}
