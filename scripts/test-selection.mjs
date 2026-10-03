import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function fingerprintTestInputs(root) {
  const files = [];
  async function walk(relative) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true }).catch(() => [])) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (/^tests\/.*\.spec\.js$/u.test(child) || /^tests\/helpers\/.*\.[cm]?js$/u.test(child)
        || /^playwright(?:\.[^/]+)?\.config\.[cm]?js$/u.test(child)) files.push(child);
    }
  }
  await walk('tests');
  files.push(...['playwright.config.js', 'playwright.pwa.config.js']);
  const fingerprints = {};
  for (const file of [...new Set(files)].sort()) {
    try {
      fingerprints[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    } catch {
      // Missing optional config files are omitted; tests/spec/helper inputs are validated at run time.
    }
  }
  return fingerprints;
}

export function changedTestInputs(previous, current) {
  if (!previous || typeof previous !== 'object') return ['(no saved test-input fingerprints)'];
  const files = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return [...files].filter((file) => previous[file] !== current[file]).sort();
}

export function buildPlaywrightSelection({ wholeSpecs = [], coverageEntries = [], testCases = {} }) {
  const allSpecs = new Set(wholeSpecs);
  const casesBySpec = new Map();
  let unresolvedCoverage = false;
  for (const entry of coverageEntries) {
    const id = typeof entry === 'string' && testCases[entry] ? entry : entry?.id;
    if (typeof entry === 'string' && !id) {
      if (entry.startsWith('tests/') && entry.endsWith('.spec.js')) allSpecs.add(entry);
      else unresolvedCoverage = true;
      continue;
    }
    const testCase = testCases[id];
    if (!testCase || typeof testCase.spec !== 'string' || typeof testCase.grepTitle !== 'string' || !testCase.grepTitle) {
      unresolvedCoverage = true;
      continue;
    }
    if (!casesBySpec.has(testCase.spec)) casesBySpec.set(testCase.spec, new Map());
    casesBySpec.get(testCase.spec).set(id, testCase);
  }
  for (const spec of allSpecs) casesBySpec.delete(spec);
  return { wholeSpecs: [...allSpecs].sort(), casesBySpec, unresolvedCoverage };
}

export function grepPatternForCases(cases) {
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const patterns = [...new Set(cases.map(({ grepTitle }) => grepTitle))].map(escape);
  // Playwright applies --grep to the full title path (including the file and
  // suite titles). Keep exact title-path matches while allowing its separator
  // and tags around the selected path.
  return patterns.length ? `(?:^|\\s)(?:${patterns.join('|')})(?:$|\\s|@)` : '';
}
