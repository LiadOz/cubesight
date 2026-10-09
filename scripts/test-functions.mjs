// Function-level view of a JavaScript module, shared by the coverage collector
// (which records which functions a browser test executed) and the selector
// (which maps a diff onto the functions it touches).
//
// A function is identified by a stable KEY, not by a line number, so a key
// recorded from one version of a file still names the same function after edits
// elsewhere in it: `renderAnswers`, `createWakeLock>hold`, `Cls.method`, or for
// an anonymous callback `init>cb:addEventListener(click)#2`.
import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const MODULE = '$module';

const sha = (text) => createHash('sha1').update(text).digest('hex').slice(0, 16);

function propertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier' || node.type === 'PrivateIdentifier') return node.name;
  if (node.type === 'Literal') return String(node.value);
  return null;
}

function calleeText(callee, source) {
  return source.slice(callee.start, callee.end).replace(/\s+/gu, '').slice(0, 40) || 'call';
}

/** Parse a module. Throws on syntax acorn cannot read; callers decide the fallback. */
export function parseModule(source) {
  const comments = [];
  const ast = parse(source, {
    ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowAwaitOutsideFunction: true,
    onComment: (_block, _text, start, end) => comments.push([start, end]),
  });
  return { ast, comments };
}

// Source text with comments blanked and nested ranges elided, whitespace collapsed,
// so formatting, comments and edits to a nested function never change its parent's hash.
function normalisedText(source, [start, end], blank) {
  let out = '';
  let cursor = start;
  for (const [from, to] of blank) {
    if (to <= cursor || from >= end) continue;
    out += source.slice(cursor, Math.max(from, cursor));
    out += ' ƒ ';
    cursor = Math.min(to, end);
  }
  out += source.slice(cursor, end);
  return out.replace(/\s+/gu, ' ').trim();
}

function maskComments(source, comments) {
  if (!comments.length) return source;
  let out = '';
  let cursor = 0;
  for (const [from, to] of comments) { out += source.slice(cursor, from) + ' '.repeat(to - from); cursor = to; } // same length: offsets stay valid
  return out + source.slice(cursor);
}

// Identifiers a node uses as names (not as property labels), optionally without
// descending into nested functions. Conservative: it may include a few extras
// (shadowed names), which only ever widens a selection.
function collectRefs(root, { skipNestedFunctions = false, into = new Set() } = {}) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current.type !== 'string') continue;
    if (skipNestedFunctions && current !== root && FN.has(current.type)) continue;
    if (current.type === 'Identifier' || current.type === 'PrivateIdentifier') into.add(current.name);
    for (const key of Object.keys(current)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      if (key === 'property' && current.type === 'MemberExpression' && !current.computed) continue;
      if (key === 'key' && (current.type === 'Property' || current.type === 'MethodDefinition' || current.type === 'PropertyDefinition')
        && !current.computed && !(current.type === 'Property' && current.shorthand)) continue;
      const value = current[key];
      if (Array.isArray(value)) for (const child of value) stack.push(child);
      else if (value && typeof value.type === 'string') stack.push(value);
    }
  }
  return into;
}

// Names a function calls directly (not inside nested functions): `f()` gives f, `a.b()` gives b.
function collectCalls(root) {
  const calls = new Set();
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current.type !== 'string') continue;
    if (current !== root && FN.has(current.type)) continue;
    if ((current.type === 'CallExpression' || current.type === 'NewExpression')) {
      const callee = current.callee;
      if (callee.type === 'Identifier') calls.add(callee.name);
      else if (callee.type === 'MemberExpression' && !callee.computed && callee.property.name) calls.add(callee.property.name);
    }
    for (const key of Object.keys(current)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const value = current[key];
      if (Array.isArray(value)) for (const child of value) stack.push(child);
      else if (value && typeof value.type === 'string') stack.push(value);
    }
  }
  return calls;
}

function declaredNames(statement) {
  const names = new Set();
  const declaration = statement.declaration ?? statement;
  if (statement.type === 'ImportDeclaration') for (const spec of statement.specifiers) names.add(spec.local.name);
  else if (declaration.type === 'VariableDeclaration') for (const declarator of declaration.declarations) collectRefs(declarator.id, { into: names });
  else if ((declaration.type === 'ClassDeclaration' || declaration.type === 'FunctionDeclaration') && declaration.id) names.add(declaration.id.name);
  else if (statement.type === 'ExportNamedDeclaration' && !statement.declaration) for (const spec of statement.specifiers ?? []) names.add(spec.local?.name ?? spec.exported?.name);
  return names;
}

/**
 * Build the function table of a module.
 *   functions: Map key -> { key, parent, start, end, bodyStart, hash, refs:Set, anonymous }
 *   scope:     Map key -> { key, hash, declares:Set, refs:Set, pure, kind } (module-scope statements)
 */
export function buildFunctionTable(source) {
  const { ast, comments } = parseModule(source);
  const masked = maskComments(source, comments);
  const functions = new Map();
  const fnRanges = [];

  const nameFor = (node, parent) => {
    if (node.id?.name) return node.id.name;
    if (parent?.type === 'VariableDeclarator' && parent.init === node) return propertyName(parent.id);
    if (parent?.type === 'MethodDefinition' || parent?.type === 'PropertyDefinition' || parent?.type === 'Property') {
      const key = propertyName(parent.key);
      if (key) return parent.kind === 'get' || parent.kind === 'set' ? `${parent.kind} ${key}` : key;
    }
    if (parent?.type === 'AssignmentExpression' && parent.right === node) {
      if (parent.left.type === 'MemberExpression') return propertyName(parent.left.property);
      if (parent.left.type === 'Identifier') return parent.left.name;
    }
    if (parent?.type === 'CallExpression' && parent.arguments.includes(node)) {
      const literal = parent.arguments.find((argument) => argument.type === 'Literal' && typeof argument.value === 'string');
      return `cb:${calleeText(parent.callee, source)}${literal ? `(${literal.value.slice(0, 24)})` : ''}`;
    }
    if (parent?.type === 'NewExpression' && parent.arguments.includes(node)) return `cb:new ${calleeText(parent.callee, source)}`;
    if (parent?.type === 'ReturnStatement') return 'returned';
    return 'anon';
  };

  const taken = new Map();
  const visit = (node, parentNode, parentKey, classStack) => {
    if (!node || typeof node.type !== 'string') return;
    let childParentKey = parentKey;
    let childClass = classStack;
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') childClass = node.id?.name ?? classStack;
    if (FN.has(node.type)) {
      let name = nameFor(node, parentNode);
      if ((parentNode?.type === 'MethodDefinition' || parentNode?.type === 'PropertyDefinition') && classStack) name = `${classStack}.${name}`;
      let key = parentKey ? `${parentKey}>${name}` : name;
      const count = (taken.get(key) ?? 0) + 1;
      taken.set(key, count);
      if (count > 1) key = `${key}#${count}`;
      functions.set(key, {
        key, parent: parentKey || null, start: node.start, end: node.end, bodyStart: node.body.start,
        anonymous: /(?:^|>)(?:anon|cb:|returned)/u.test(name),
      });
      fnRanges.push({ key, start: node.start, end: node.end, node });
      childParentKey = key;
    }
    for (const field of Object.keys(node)) {
      if (field === 'type' || field === 'start' || field === 'end') continue;
      const value = node[field];
      if (Array.isArray(value)) for (const child of value) visit(child, node, childParentKey, childClass);
      else if (value && typeof value.type === 'string') visit(value, node, childParentKey, childClass);
    }
  };
  visit(ast, null, '', '');

  // Direct nested ranges of each function (for own-text hashing and own refs).
  const children = new Map();
  for (const entry of fnRanges) {
    const fn = functions.get(entry.key);
    if (!children.has(fn.parent ?? '')) children.set(fn.parent ?? '', []);
    children.get(fn.parent ?? '').push([entry.start, entry.end]);
  }
  for (const entry of fnRanges) {
    const fn = functions.get(entry.key);
    const nested = (children.get(entry.key) ?? []).sort((a, b) => a[0] - b[0]);
    fn.hash = sha(normalisedText(masked, [fn.start, fn.end], nested));
    // Own references exclude nested functions' bodies; nested functions are their own keys.
    fn.refs = collectRefs(entry.node, { skipNestedFunctions: true });
    fn.calls = collectCalls(entry.node);
  }

  // Module scope: every top-level statement is a unit with nested functions elided.
  const scope = new Map();
  const topLevelRanges = (children.get('') ?? []).sort((a, b) => a[0] - b[0]);
  const used = new Map();
  for (const statement of ast.body) {
    const declares = declaredNames(statement);
    const inner = topLevelRanges.filter(([from, to]) => from >= statement.start && to <= statement.end);
    const pureFunctionDeclaration = (statement.type === 'FunctionDeclaration')
      || (statement.declaration?.type === 'FunctionDeclaration');
    if (pureFunctionDeclaration) continue; // its text is its function; the table above covers it
    let label = declares.size ? [...declares].sort().join(',') : `${statement.type}`;
    if (statement.type === 'ImportDeclaration') label = `import ${statement.source.value}`;
    const base = `${MODULE}:${label}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const key = n > 1 ? `${base}#${n}` : base;
    const kind = statement.type === 'ImportDeclaration' ? 'import'
      : (declares.size && (statement.declaration ?? statement).type !== 'ExpressionStatement' ? 'declaration' : 'effect');
    const refs = collectRefs(statement, { skipNestedFunctions: true });
    scope.set(key, {
      key, kind, declares, refs, start: statement.start, end: statement.end,
      hash: sha(normalisedText(masked, [statement.start, statement.end], inner)),
    });
  }
  return { functions, scope };
}

/** Which table functions executed, given V8 precise-coverage ranges for the same text. */
export function executedFunctionKeys(table, v8Functions) {
  const ranges = v8Functions.flatMap((fn) => fn.ranges ?? [])
    .filter((range) => Number.isInteger(range.startOffset) && range.endOffset > range.startOffset);
  const executed = [];
  for (const fn of table.functions.values()) {
    let innermost = null;
    for (const range of ranges) {
      if (range.startOffset > fn.bodyStart || range.endOffset <= fn.bodyStart) continue;
      if (!innermost || range.endOffset - range.startOffset < innermost.endOffset - innermost.startOffset) innermost = range;
    }
    if (innermost && innermost.count > 0) executed.push(fn.key);
  }
  return executed.sort();
}

/**
 * Diff two versions of a module at function granularity.
 * Returns changed (present in new, new or different), removed (only in old),
 * and the module-scope statements that changed or appeared / disappeared.
 */
export function diffTables(oldTable, newTable) {
  const changed = [];
  const added = [];
  const removed = [];
  for (const [key, fn] of newTable.functions) {
    const before = oldTable?.functions.get(key);
    if (!before) added.push(key);
    else if (before.hash !== fn.hash) changed.push(key);
  }
  for (const key of oldTable?.functions.keys() ?? []) if (!newTable.functions.has(key)) removed.push(key);
  const scopeChanged = [];
  const scopeRemoved = [];
  for (const [key, item] of newTable.scope) {
    const before = oldTable?.scope.get(key);
    if (!before || before.hash !== item.hash) scopeChanged.push(key);
  }
  for (const key of oldTable?.scope.keys() ?? []) if (!newTable.scope.has(key)) scopeRemoved.push(key);
  return { changed, added, removed, scopeChanged, scopeRemoved };
}

export { MODULE as MODULE_SCOPE };
