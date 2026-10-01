// Offline algorithm store. Seed data is immutable bundle data; user edits,
// picks, practice and imported reconstructions live in IndexedDB.
import { verifyAlgorithm } from './verify.js';
const DB_NAME = 'cubesight-algs';
const DB_VERSION = 1;
const STORES = ['algs', 'sources', 'picks', 'attempts', 'daily', 'recons'];
const isHttpUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:'; }
  catch { return false; }
};

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Algorithm storage failed.'));
  });
}

export function openAlgDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) return Promise.reject(new Error('IndexedDB is unavailable.'));
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, DB_VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error ?? new Error('Algorithm storage failed to open.'));
    opening.onblocked = () => reject(new Error('Algorithm storage upgrade is blocked by another tab.'));
  });
}

export function createAlgDatabase({ indexedDB = globalThis.indexedDB, seedAlgs = [], seedCases = [] } = {}) {
  const memory = Object.fromEntries(STORES.map(name => [name, new Map()]));
  const seedById = new Map(seedAlgs.map(alg => [alg.id, Object.freeze({ ...alg, sources: Object.freeze([...(alg.sources ?? [])]) })]));
  const CASES_FOR_DB = new Set(seedCases.map(row => row.id));
  const caseById = new Map(seedCases.map(row => [row.id, row]));
  let dbPromise = null;
  let readyPromise = null;
  const db = () => (dbPromise ??= openAlgDatabase(indexedDB));

  async function transaction(names, mode, action) {
    let connection;
    try { connection = await db(); }
    catch {
      return action(Object.fromEntries(names.map(name => [name, {
        get: id => Promise.resolve(memory[name].get(id) ?? null),
        put: value => { memory[name].set(value.id, structuredClone(value)); return Promise.resolve(value.id); },
        delete: id => { memory[name].delete(id); return Promise.resolve(); },
        all: () => Promise.resolve([...memory[name].values()].map(value => structuredClone(value))),
      }])), true);
    }
    return new Promise((resolve, reject) => {
      const tx = connection.transaction(names, mode);
      let result;
      let actionFinished = false;
      let transactionFinished = false;
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        reject(error ?? new Error('Algorithm storage transaction failed.'));
      };
      const finish = () => {
        if (!settled && actionFinished && transactionFinished) { settled = true; resolve(result); }
      };
      const stores = Object.fromEntries(names.map(name => [name, {
        get: id => request(tx.objectStore(name).get(id)),
        put: value => request(tx.objectStore(name).put(value)),
        delete: id => request(tx.objectStore(name).delete(id)),
        all: () => request(tx.objectStore(name).getAll()),
      }]));
      tx.oncomplete = () => { transactionFinished = true; finish(); };
      tx.onabort = () => fail(tx.error ?? new Error('Algorithm storage transaction aborted.'));
      tx.onerror = () => fail(tx.error ?? new Error('Algorithm storage transaction failed.'));
      Promise.resolve().then(() => action(stores, false)).then(value => {
        result = value; actionFinished = true; finish();
      }, error => { try { tx.abort(); } catch {} fail(error); });
    });
  }

  async function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      for (const item of seedAlgs) memory.algs.set(item.id, item);
      try {
        const connection = await db();
        const tx = connection.transaction(['algs'], 'readwrite');
        const store = tx.objectStore('algs');
        // Seed rows are immutable bundle data. Re-putting is idempotent and
        // personal edits live in separate rows, so no read/await is needed in
        // the transaction (which could auto-close on older IndexedDB engines).
        for (const item of seedAlgs) store.put(item);
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
        });
      } catch { /* the in-memory seed and personal practice still work */ }
      return true;
    })();
    return readyPromise;
  }

  return {
    ready,
    getCases(set = null) { return seedCases.filter(item => !set || item.set === set).map(item => ({ ...item })); },
    async listAlgs(caseId) {
      await ready();
      return transaction(['algs'], 'readonly', async stores => {
        const rows = await stores.algs.all();
        return rows.filter(item => item.caseId === caseId).sort((a, b) => Number(Boolean(a.seed)) - Number(Boolean(b.seed)) || (a.rank ?? 999) - (b.rank ?? 999));
      });
    },
    async getAlg(id) {
      await ready();
      if (seedById.has(id)) return seedById.get(id);
      return transaction(['algs'], 'readonly', stores => stores.algs.get(id));
    },
    async setPick(caseId, algId, since = Date.now()) {
      await ready();
      const alg = seedById.get(algId) ?? await transaction(['algs'], 'readonly', stores => stores.algs.get(algId));
      if (!CASES_FOR_DB.has(caseId) || !alg || alg.caseId !== caseId || alg.verified !== true) throw new Error('Choose a verified algorithm from this case.');
      const pick = { id: caseId, caseId, algId, since };
      return transaction(['picks'], 'readwrite', async stores => { await stores.picks.put(pick); return pick; });
    },
    async getPick(caseId) {
      await ready();
      return transaction(['picks'], 'readonly', stores => stores.picks.get(caseId));
    },
    async addAlg(alg) {
      await ready();
      if (!alg?.id || !alg?.caseId || !alg?.moves || alg.seed) throw new Error('A user algorithm needs an id, case, and moves.');
      if (seedById.has(alg.id)) throw new Error('That ID belongs to a bundled algorithm.');
      const caseData = caseById.get(alg.caseId);
      if (!caseData) throw new Error('Choose a known case first.');
      const result = await verifyAlgorithm(alg.moves, caseData);
      if (!result.verified) throw new Error(result.reason ?? 'This algorithm did not pass case verification.');
      const value = { ...alg, moves: result.moves, verified: true, seed: false, createdAt: alg.createdAt ?? Date.now() };
      await transaction(['algs'], 'readwrite', stores => stores.algs.put(value));
      return value;
    },
    async addSource(algId, source) {
      await ready();
      if (!algId || !isHttpUrl(source?.url)) throw new Error('A source needs an HTTP or HTTPS URL.');
      const id = `source:${algId}:${source.id ?? source.url}`;
      const value = { id, algId, source: { ...source } };
      await transaction(['sources'], 'readwrite', stores => stores.sources.put(value));
      return value;
    },
    async sourcesFor(algId) {
      await ready();
      return transaction(['sources'], 'readonly', async stores => (await stores.sources.all()).filter(row => row.algId === algId).map(row => row.source));
    },
    async recordAttempt(attempt) {
      await ready();
      const value = { ...attempt, id: attempt.id ?? crypto.randomUUID(), createdAt: attempt.createdAt ?? Date.now() };
      await transaction(['attempts'], 'readwrite', stores => stores.attempts.put(value));
      return value;
    },
    async attemptsFor(algId, limit = 200) {
      await ready();
      return transaction(['attempts'], 'readonly', async stores => (await stores.attempts.all()).filter(item => item.algId === algId)
        .sort((a, b) => b.createdAt - a.createdAt).slice(0, limit));
    },
    async addReconstruction(record) {
      await ready();
      const value = { ...record, id: record.id ?? crypto.randomUUID(), imported: true, createdAt: record.createdAt ?? Date.now() };
      await transaction(['recons'], 'readwrite', stores => stores.recons.put(value));
      return value;
    },
    async usageFor(caseId) {
      await ready();
      return transaction(['recons'], 'readonly', async stores => {
        const counts = new Map();
        for (const recon of await stores.recons.all()) {
          // Locally recorded practice is intentionally excluded. Usage means
          // only reconstructions the user explicitly imported.
          if (!recon.imported || recon.caseId !== caseId) continue;
          const key = recon.algId || recon.normKey || 'case-only';
          const row = counts.get(key) ?? { algId: recon.algId ?? null, normKey: recon.normKey ?? null, total: 0, byCuber: {} };
          row.total++; if (recon.cuber) row.byCuber[recon.cuber] = (row.byCuber[recon.cuber] ?? 0) + 1;
          counts.set(key, row);
        }
        const total = [...counts.values()].reduce((sum, row) => sum + row.total, 0);
        return [...counts.values()].map(row => ({ ...row, share: total ? row.total / total : 0 })).sort((a, b) => b.total - a.total);
      });
    },
    async exportPersonalData() {
      await ready();
      return transaction(['algs', 'sources', 'picks', 'attempts', 'daily', 'recons'], 'readonly', async stores => ({
        algs: (await stores.algs.all()).filter(item => !item.seed), sources: await stores.sources.all(),
        picks: await stores.picks.all(), attempts: await stores.attempts.all(), daily: await stores.daily.all(), recons: await stores.recons.all(),
      }));
    },
    async getDaily(id) {
      await ready();
      return transaction(['daily'], 'readonly', stores => stores.daily.get(id));
    },
    async setDaily(value) {
      await ready();
      if (!value?.id) throw new Error('A daily record needs an id.');
      return transaction(['daily'], 'readwrite', stores => stores.daily.put(value));
    },
    async importPersonalData(payload) {
      await ready();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Algorithm backup must be an object.');
      const limits = { algs: 2000, sources: 4000, picks: 1000, attempts: 100000, daily: 10000, recons: 100000 };
      const rows = {};
      for (const [name, limit] of Object.entries(limits)) {
        const value = payload[name] ?? [];
        if (!Array.isArray(value) || value.length > limit) throw new Error(`Invalid ${name} backup data.`);
        rows[name] = value.filter(row => row && typeof row === 'object' && typeof row.id === 'string' && row.id.length <= 300);
      }
      const verifiedAlgs = [];
      for (const row of rows.algs) {
        if (!row.caseId || !CASES_FOR_DB.has(row.caseId) || typeof row.moves !== 'string' || row.moves.length > 2000 || row.seed || seedById.has(row.id)) continue;
        const result = await verifyAlgorithm(row.moves, caseById.get(row.caseId));
        // Never trust a backup's `verified` flag. A custom algorithm is only
        // eligible for matching after independent replay and F2L checks.
        verifiedAlgs.push({ ...row, moves: result.moves ?? row.moves, seed: false, verified: Boolean(result.verified), verificationReason: result.reason ?? null });
      }
      const allowedAlgIds = new Set([...seedById.keys(), ...verifiedAlgs.filter(row => row.verified).map(row => row.id)]);
      const historicalAlgIds = new Set([...seedById.keys(), ...verifiedAlgs.map(row => row.id)]);
      const algById = new Map([...seedById, ...verifiedAlgs.map(row => [row.id, row])]);
      rows.picks = rows.picks.filter(row => {
        const alg = algById.get(row.algId);
        return row.id === row.caseId && CASES_FOR_DB.has(row.caseId) && allowedAlgIds.has(row.algId) && alg?.caseId === row.caseId && Number.isFinite(row.since);
      });
      rows.sources = rows.sources.filter(row => historicalAlgIds.has(row.algId) && row.source && isHttpUrl(row.source.url));
      rows.attempts = rows.attempts.filter(row => {
        const alg = algById.get(row.algId);
        const moveTimesValid = row.moveTimes == null || (Array.isArray(row.moveTimes) && row.moveTimes.length <= 200 && row.moveTimes.every(value => Number.isFinite(value) && value >= 0 && value <= 3_600_000));
        const moveCount = row.moveCount ?? row.moveTimes?.length ?? 0;
        return alg?.verified === true && row.caseId === alg.caseId && Number.isFinite(row.executionMs) && row.executionMs >= 0 && row.executionMs <= 3_600_000
          && Number.isFinite(row.createdAt) && typeof row.clean === 'boolean' && Number.isFinite(moveCount) && moveCount >= 0 && moveCount <= 200 && moveTimesValid;
      });
      rows.recons = rows.recons.filter(row => CASES_FOR_DB.has(row.caseId) && (!row.algId || historicalAlgIds.has(row.algId)));
      // Merge by id so importing a backup is repeatable and never erases
      // practice added on this device. Seed rows remain bundle-owned.
      return transaction(Object.keys(limits), 'readwrite', async stores => {
        const counts = {};
        for (const name of Object.keys(limits)) {
          const incoming = name === 'algs' ? verifiedAlgs : rows[name];
          const accepted = incoming.filter(row => !(name === 'algs' && seedById.has(row.id))).map(row => name === 'recons' ? { ...row, imported: true } : row);
          await Promise.all(accepted.map(row => stores[name].put(row)));
          counts[name] = accepted.length;
        }
        return counts;
      });
    },
    async progressFor(caseId = null, { learningData = null, now = Date.now() } = {}) {
      await ready();
      return transaction(['attempts', 'picks'], 'readonly', async stores => {
        const [attempts, picks] = await Promise.all([stores.attempts.all(), stores.picks.all()]);
        const relevant = attempts.filter(row => !caseId || row.caseId === caseId);
        const clean = relevant.filter(row => row.clean && Number.isFinite(row.executionMs));
        const byAlg = {};
        for (const row of relevant) {
          const value = byAlg[row.algId] ??= { algId: row.algId, caseId: row.caseId, attempts: 0, correct: 0, clean: 0, pbMs: null, latestMs: null, times: [], activity: [] };
          value.attempts++;
          if (Number.isFinite(row.createdAt)) value.activity.push(row.createdAt);
          if (row.clean && Number.isFinite(row.executionMs)) {
            value.clean++; value.correct++; value.times.push(row.executionMs);
            value.pbMs = value.pbMs == null ? row.executionMs : Math.min(value.pbMs, row.executionMs);
            if (value.latestMs == null || value.latestAt == null || row.createdAt > value.latestAt) {
              value.latestMs = row.executionMs; value.latestAt = row.createdAt;
            }
          }
        }
        for (const row of Object.values(byAlg)) {
          const schedule = learningData?.items?.[`alg|${row.algId}`];
          row.due = Boolean(row.attempts && schedule && (schedule.due <= now || (schedule.dueTrial <= (learningData.trial ?? 0))));
        }
        const byCase = {};
        for (const row of Object.values(byAlg)) {
          const value = byCase[row.caseId] ??= { caseId: row.caseId, attempts: 0, correct: 0, pbMs: null, due: 0, times: [], activity: [] };
          value.attempts += row.attempts; value.correct += row.correct; value.due += Number(row.due);
          value.times.push(...row.times); value.activity.push(...row.activity);
          if (row.pbMs != null) value.pbMs = value.pbMs == null ? row.pbMs : Math.min(value.pbMs, row.pbMs);
        }
        const items = Object.values(byCase);
        return {
          caseId,
          attempts: relevant.length,
          clean: clean.length,
          pbMs: clean.length ? Math.min(...clean.map(row => row.executionMs)) : null,
          byAlg, items, activity: Object.values(byAlg).flatMap(row => row.activity),
          picks: picks.filter(row => !caseId || row.caseId === caseId),
        };
      });
    },
    async close() { try { (await db()).close(); } catch {} dbPromise = null; readyPromise = null; },
  };
}

export const ALG_DB_NAME = DB_NAME;
export const ALG_DB_VERSION = DB_VERSION;
