// Deterministic JS-literal serializer: single quotes, 2-space indent, stable key order,
// short primitive arrays inline. Keys starting with "_" are internal and dropped.
const IDENT = /^[A-Za-z_$][\w$]*$/;
const str = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

const flat = (x) => x === null || typeof x !== 'object' || (Array.isArray(x) && x.every((y) => y === null || typeof y !== 'object'));

export function literal(v, indent = 0, width = 110) {
  const pad = '  '.repeat(indent);
  if (v === null) return 'null';
  if (typeof v === 'string') return str(v);
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  if (typeof v === 'boolean') return String(v);
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const inline = `[${v.map((x) => literal(x, 0, width)).join(', ')}]`;
    if (v.every((x) => x === null || typeof x !== 'object') && inline.length + pad.length <= width) return inline;
    if (v.every((x) => Array.isArray(x) && x.every((y) => typeof y !== 'object')) && inline.length + pad.length <= width) return inline;
    return `[\n${v.map((x) => `${pad}  ${literal(x, indent + 1, width)},`).join('\n')}\n${pad}]`;
  }
  const keys = Object.keys(v).filter((k) => !k.startsWith('_') && v[k] !== undefined);
  if (!keys.length) return '{}';
  const key = (k) => (IDENT.test(k) ? k : str(k));
  const inline = `{ ${keys.map((k) => `${key(k)}: ${literal(v[k], 0, width)}`).join(', ')} }`;
  if (keys.every((k) => flat(v[k])) && inline.length + pad.length <= width) return inline;
  return `{\n${keys.map((k) => `${pad}  ${key(k)}: ${literal(v[k], indent + 1, width)},`).join('\n')}\n${pad}}`;
}
