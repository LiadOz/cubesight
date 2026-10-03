import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export function flattenTests(node, suite = '') {
  if (!node || typeof node !== 'object') return [];
  const ownName = typeof node.title === 'string' ? node.title : typeof node.name === 'string' ? node.name : '';
  const fullName = [suite, ownName].filter(Boolean).join(' › ');
  const duration = Number(node.duration ?? node.duration_ms ?? node.durationMs);
  const isCase = node.type === 'test' || node.expectedStatus || node.status === 'passed' || node.status === 'failed';
  const children = [node.tests, node.suites, node.specs, node.results].flatMap((value) => Array.isArray(value) ? value : []);
  const childCases = children.flatMap((child) => flattenTests(child, fullName));
  return [...(isCase && Number.isFinite(duration) ? [{ name: fullName, durationMs: Math.round(duration), status: node.status ?? 'unknown' }] : []), ...childCases];
}

export function findPlaywrightFailureCandidates(report) {
  const candidates = [];
  function visit(node, parent = []) {
    if (!node || typeof node !== 'object') return;
    const parts = node.title ? [...parent, node.title] : parent;
    if (node.expectedStatus && Array.isArray(node.results)) {
      for (const result of node.results) {
        if (!['failed', 'timedOut', 'interrupted'].includes(result.status) || result.status === node.expectedStatus) continue;
        candidates.push({ title: parts.join(' › '), status: result.status, durationMs: Math.round(result.duration ?? 0) });
      }
      return;
    }
    for (const key of ['suites', 'specs', 'tests']) {
      if (Array.isArray(node[key])) for (const child of node[key]) visit(child, parts);
    }
  }
  for (const suite of report?.suites ?? []) visit(suite);
  return candidates;
}

export async function loadPlaywrightShards(directory, expectedCount, now = Date.now(), expectedCommit = process.env.GITHUB_SHA ?? null) {
  const names = (await readdir(directory).catch(() => []))
    .filter((name) => /^\d+-of-\d+\.json$/u.test(name)).sort();
  const errors = [];
  if (!names.length) {
    return { shards: [], tests: [], errors: ['No shard reports found. Run all Playwright shards before test health.'], wallTimeMs: 0, sumShardWallTimeMs: 0 };
  }
  const shards = [];
  for (const name of names) {
    try { shards.push(JSON.parse(await readFile(path.join(directory, name), 'utf8'))); }
    catch { errors.push(`Shard report ${name} is not valid JSON.`); }
  }
  if (!shards.length) return { shards: [], tests: [], errors, wallTimeMs: 0 };
  const total = shards[0].totalShards;
  const indexes = new Set(shards.map((shard) => shard.shard));
  if (total !== expectedCount) errors.push(`Shard set declares ${total} shards; expected ${expectedCount}.`);
  if (names.length !== expectedCount || indexes.size !== expectedCount) errors.push(`Expected ${expectedCount} distinct shard reports, found ${names.length}.`);
  for (const shard of shards) {
    if (shard.totalShards !== total) errors.push(`Shard ${shard.shard} reports total ${shard.totalShards}, expected ${total}.`);
    if (shard.shard < 1 || shard.shard > expectedCount) errors.push(`Invalid shard index ${shard.shard}.`);
    if (!shard.playwright) errors.push(`Shard ${shard.shard} has no parsed Playwright JSON report.`);
    if (shard.playwright && flattenTests(shard.playwright).length === 0) errors.push(`Shard ${shard.shard} contains no per-test timings.`);
    if (!Number.isFinite(shard.wallTimeMs) || shard.wallTimeMs < 0) errors.push(`Shard ${shard.shard} has no valid wall-clock duration.`);
    if (shard.exitCode !== 0) errors.push(`Shard ${shard.shard} exited ${shard.exitCode}.`);
    if (expectedCommit && shard.commit !== expectedCommit) errors.push(`Shard ${shard.shard} belongs to ${shard.commit ?? 'an unknown commit'}, expected ${expectedCommit}.`);
    const generatedMs = Date.parse(shard.generatedAt ?? '');
    if (!Number.isFinite(generatedMs) || generatedMs > now || now - generatedMs > 24 * 60 * 60 * 1000) {
      errors.push(`Shard ${shard.shard} report is missing a fresh generation timestamp.`);
    }
  }
  return {
    shards: shards.map(({ shard, totalShards, generatedAt, wallTimeMs, exitCode }) => ({ shard, totalShards, generatedAt, wallTimeMs, exitCode })),
    tests: shards.flatMap((shard) => flattenTests(shard.playwright)),
    errors,
    wallTimeMs: Math.max(0, ...shards.map((shard) => shard.wallTimeMs ?? 0)),
  };
}
