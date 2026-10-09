// The impact map: which browser tests executed which modules and functions.
//
// Two files, one model:
//   tests/impact-map.json                    committed seed, refreshed by a full run (Tier 2 / scheduled)
//   test-results/impact-map/live.json        per-worktree overlay, updated by every gate run
// The overlay starts as a copy of the seed and is discarded when the seed changes,
// so a pulled seed is never shadowed by older local knowledge. Nothing in the
// gate path ever triggers a full capture.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MAP_VERSION = 4;
export const SEED_PATH = 'tests/impact-map.json';
export const LIVE_PATH = 'test-results/impact-map/live.json';

export const emptyModel = () => ({
  version: MAP_VERSION, commit: null, generatedAt: null, updatedAt: null, seedHash: null,
  tests: new Map(), // id -> { spec, grepTitle, titlePath, durationMs }
  modules: new Map(), // file -> Set(id)
  functions: new Map(), // file -> Map(key -> Set(id))
  specHashes: {}, // spec -> content hash at capture
});

const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

// ------------------------------------------------------------- (de)serialising
// Test ids are written once as an ordered list and referenced by index. A set
// holding more than half the tests is written as its complement: {"n":[...]}.
export function serialize(model) {
  const order = [...model.tests.keys()].sort();
  const index = new Map(order.map((id, i) => [id, i]));
  const encode = (set) => {
    const ints = [...set].filter((id) => index.has(id)).map((id) => index.get(id)).sort((a, b) => a - b);
    if (ints.length * 2 <= order.length) return ints;
    const present = new Set(ints);
    return { n: order.map((_, i) => i).filter((i) => !present.has(i)) };
  };
  const modules = {};
  for (const [file, set] of [...model.modules].sort(([a], [b]) => a.localeCompare(b))) modules[file] = encode(set);
  const functions = {};
  for (const [file, byKey] of [...model.functions].sort(([a], [b]) => a.localeCompare(b))) {
    functions[file] = {};
    for (const [key, set] of [...byKey].sort(([a], [b]) => a.localeCompare(b))) functions[file][key] = encode(set);
  }
  return {
    version: MAP_VERSION, commit: model.commit, generatedAt: model.generatedAt, updatedAt: model.updatedAt, seedHash: model.seedHash,
    specHashes: model.specHashes,
    testOrder: order,
    tests: Object.fromEntries(order.map((id) => [id, model.tests.get(id)])),
    modules, functions,
  };
}

export function deserialize(json) {
  if (json?.version !== MAP_VERSION) return null;
  const model = emptyModel();
  Object.assign(model, { commit: json.commit, generatedAt: json.generatedAt, updatedAt: json.updatedAt, seedHash: json.seedHash ?? null });
  model.specHashes = json.specHashes ?? {};
  const order = json.testOrder ?? [];
  for (const id of order) model.tests.set(id, json.tests[id]);
  const decode = (value) => {
    if (Array.isArray(value)) return new Set(value.map((i) => order[i]));
    const skip = new Set(value.n);
    return new Set(order.filter((_, i) => !skip.has(i)));
  };
  for (const [file, value] of Object.entries(json.modules ?? {})) model.modules.set(file, decode(value));
  for (const [file, byKey] of Object.entries(json.functions ?? {})) {
    model.functions.set(file, new Map(Object.entries(byKey).map(([key, value]) => [key, decode(value)])));
  }
  return model;
}

// --------------------------------------------------------------------- loading
export async function loadModel(root, { live = true } = {}) {
  let seedText = null;
  try { seedText = await readFile(path.join(root, SEED_PATH), 'utf8'); } catch { /* no seed yet */ }
  const seed = seedText ? (() => { try { return deserialize(JSON.parse(seedText)); } catch { return null; } })() : null;
  const seedHash = seedText ? sha(seedText) : null;
  if (live) {
    try {
      const overlay = deserialize(JSON.parse(await readFile(path.join(root, LIVE_PATH), 'utf8')));
      if (overlay && overlay.seedHash === seedHash) return { model: overlay, source: 'live overlay', seedHash };
    } catch { /* no overlay, or unreadable: fall back to the seed */ }
  }
  if (seed) return { model: Object.assign(seed, { seedHash }), source: 'committed seed', seedHash };
  return { model: Object.assign(emptyModel(), { seedHash }), source: 'none', seedHash };
}

export async function saveModel(root, model, target = LIVE_PATH) {
  const file = path.join(root, target);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(serialize(model))}\n`);
  return file;
}

// ------------------------------------------------------------------- ingesting
/** Every spec file a Playwright report ran, as repo-relative paths. */
export const reportSpecs = (report, root) => [...new Set([...reportResults(report, root).values()].map((entry) => entry.spec))];

/** Final result of every test in a Playwright JSON report, keyed by test id. */
export function reportResults(report, root = process.cwd()) {
  const results = new Map();
  const rootDir = report?.config?.rootDir;
  const visit = (suite, titles) => {
    const here = suite.title ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      const attempts = (spec.tests ?? []).flatMap((entry) => entry.results ?? []);
      if (!attempts.length) continue;
      const last = attempts[attempts.length - 1];
      const file = rootDir ? path.relative(root, path.join(rootDir, spec.file)).replaceAll('\\', '/') : spec.file;
      const titlePath = [...here, spec.title];
      results.set(spec.id, { status: last.status, durationMs: Math.round(last.duration ?? 0), spec: file, titlePath, grepTitle: titlePath.join(' ') });
    }
    for (const child of suite.suites ?? []) visit(child, here);
  };
  for (const suite of report?.suites ?? []) visit(suite, []);
  return results;
}

async function readRaw(rawDir) {
  let names = [];
  try { names = (await readdir(rawDir)).filter((name) => name.endsWith('.json')).sort(); } catch { return []; }
  const latest = new Map();
  for (const name of names) {
    let data;
    try { data = JSON.parse(await readFile(path.join(rawDir, name), 'utf8')); } catch { continue; }
    if (typeof data.testId !== 'string' || !Array.isArray(data.files)) continue;
    const held = latest.get(data.testId);
    if (!held || (data.retry ?? 0) >= (held.retry ?? 0)) latest.set(data.testId, data); // last retry wins
  }
  return [...latest.values()];
}

// Timings taken on a busy machine only ever overstate a test, so a faster run replaces the
// estimate at once while a slower one nudges it up gently.
export function smoothDuration(previous, observed) {
  if (!observed) return previous ?? 0;
  if (!previous) return observed;
  return Math.round(observed < previous ? observed : previous * 0.8 + observed * 0.2);
}

function forget(model, id) {
  for (const set of model.modules.values()) set.delete(id);
  for (const byKey of model.functions.values()) for (const set of byKey.values()) set.delete(id);
}

function prune(model) {
  for (const [file, set] of model.modules) if (!set.size) model.modules.delete(file);
  for (const [file, byKey] of model.functions) {
    for (const [key, set] of byKey) if (!set.size) byKey.delete(key);
    if (!byKey.size) model.functions.delete(file);
  }
}

/**
 * Fold one run's coverage into the model. Only tests that PASSED replace their
 * old entry (a failing test's coverage is partial and must not erase history).
 * `wholeSpecs` maps spec -> content hash for specs that ran in full: tests of
 * those specs that no longer exist are dropped, and the hash is recorded.
 */
export async function ingestRun(model, { rawDir, report = null, wholeSpecs = {}, commit = null }) {
  const raw = await readRaw(rawDir);
  const results = report ? reportResults(report, process.cwd()) : new Map();
  let updated = 0;
  let skippedFailing = 0;
  for (const data of raw) {
    const result = results.get(data.testId);
    if (result && result.status !== 'passed') { skippedFailing += 1; continue; }
    forget(model, data.testId);
    const previous = model.tests.get(data.testId)?.durationMs;
    model.tests.set(data.testId, {
      spec: data.spec, grepTitle: data.grepTitle, titlePath: data.titlePath,
      durationMs: smoothDuration(previous, result?.durationMs),
    });
    for (const file of data.files) {
      if (!model.modules.has(file)) model.modules.set(file, new Set());
      model.modules.get(file).add(data.testId);
    }
    for (const [file, keys] of Object.entries(data.functions ?? {})) {
      if (!model.functions.has(file)) model.functions.set(file, new Map());
      const byKey = model.functions.get(file);
      for (const key of keys) {
        if (!byKey.has(key)) byKey.set(key, new Set());
        byKey.get(key).add(data.testId);
      }
    }
    updated += 1;
  }
  if (report && Object.keys(wholeSpecs).length) {
    for (const [id, info] of [...model.tests]) {
      if (wholeSpecs[info.spec] !== undefined && !results.has(id)) { forget(model, id); model.tests.delete(id); }
    }
    for (const [spec, hash] of Object.entries(wholeSpecs)) model.specHashes[spec] = hash;
  }
  // Tests that ran but never touched the coverage fixture: known (for timing and name matching), never selectable by function.
  for (const [id, result] of results) {
    if (result.status === 'skipped') continue;
    const info = model.tests.get(id);
    if (info) { if (result.status === 'passed') info.durationMs = smoothDuration(info.durationMs, result.durationMs); continue; }
    model.tests.set(id, { spec: result.spec, grepTitle: result.grepTitle, titlePath: result.titlePath, durationMs: result.durationMs, uncovered: true });
  }
  prune(model);
  model.updatedAt = new Date().toISOString();
  model.generatedAt ??= model.updatedAt;
  if (commit) model.commit = commit;
  return { updated, skippedFailing, observed: raw.length };
}

export async function hashSpecs(root, specs) {
  const hashes = {};
  for (const spec of specs) {
    try { hashes[spec] = sha(await readFile(path.join(root, spec))); } catch { /* removed spec */ }
  }
  return hashes;
}
