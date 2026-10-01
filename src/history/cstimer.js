// csTimer's native JSON: sessionN entries hold [[penalty, milliseconds],
// scramble, comment, unixSeconds]. Penalty is 0, 2000, or -1 (DNF).
// Import validates the complete file before the caller changes local history.
import { cleanRecord } from '../solve-store.js';

export function parseCsTimer(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('Choose a csTimer JSON export.');
  const sessions = Object.entries(data).filter(([key, value]) => /^session\d+$/.test(key) && Array.isArray(value));
  if (!sessions.length) throw new Error('No csTimer sessions found.');
  const records = [];
  const used = new Set();
  for (const [name, entries] of sessions) {
    for (const entry of entries) {
      const clock = entry?.[0];
      if (!Array.isArray(clock) || ![0, 2000, -1].includes(clock[0]) || !Number.isFinite(clock[1]) || clock[1] < 0 || !Number.isFinite(entry[3]) || entry[3] < 0) {
        throw new Error(`Invalid solve in ${name}. No data was imported.`);
      }
      let at = Math.round(entry[3] * 1000);
      while (used.has(at)) at++;
      used.add(at);
      records.push(cleanRecord({ at, solveMs: clock[1], penalty: clock[0] === -1 ? 'DNF' : clock[0] === 2000 ? '+2' : null, scramble: typeof entry[1] === 'string' ? entry[1] : '', source: 'manual', focus: 'speed', sessionId: `cst-${name}-${entries[0]?.[3] ?? 0}`, solved: true }));
    }
  }
  return records.sort((a, b) => a.at - b.at);
}

export function exportCsTimer(records) {
  const sessions = new Map();
  for (const record of records) {
    if (!Number.isFinite(record.solveMs) || record.solveMs < 0) continue;
    const id = record.sessionId ?? 'history';
    if (!sessions.has(id)) sessions.set(id, []);
    sessions.get(id).push(record);
  }
  const result = { properties: {} };
  const metadata = {};
  let n = 0;
  for (const [id, solves] of sessions) {
    n++;
    metadata[n] = { name: id, rank: n, opt: { scrType: '333' } };
    result[`session${n}`] = solves.map(r => [[r.penalty === 'DNF' ? -1 : r.penalty === '+2' ? 2000 : 0, r.solveMs], r.scramble ?? '', '', r.at / 1000]);
  }
  // csTimer reads session names/options from a JSON string inside properties.
  result.properties.sessionData = JSON.stringify(metadata);
  return JSON.stringify(result, null, 2);
}

export function filterHistory(records, { query = '', focus = 'all', source = 'all', session = 'all' } = {}) {
  const wanted = query.trim().toLowerCase();
  return records.filter(r => (focus === 'all' || r.focus === focus)
    && (source === 'all' || (r.source ?? 'smart') === source)
    && (session === 'all' || r.sessionId === session)
    && (!wanted || `${r.scramble} ${r.ollCase ?? ''} ${r.pllCase ?? ''} ${r.solveMs == null ? '' : (r.solveMs / 1000).toFixed(2)} ${new Date(r.at).toLocaleDateString()}`.toLowerCase().includes(wanted)))
    .sort((a, b) => b.at - a.at);
}
