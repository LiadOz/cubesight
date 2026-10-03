import { openHistory } from '../store/history.js';
import { algDatabase } from '../algs/runtime.js';
import { exportAll, serializeExport, parseImport, importAll, historyFromImport, pinsFromImport, algorithmsFromImport } from '../data-port.js';
import { SOLVE_STORE_KEY } from '../solve-metrics.js';

export async function createBackup({ storage = globalThis.localStorage, openHistoryStore = openHistory, algorithmDatabase = algDatabase } = {}) {
  const history = await openHistoryStore();
  await history.flush(); await history.pins.flush();
  return serializeExport(exportAll(storage, history.records, history.pins.list, await algorithmDatabase.exportPersonalData()));
}

export async function restoreBackup(text, { storage = globalThis.localStorage, openHistoryStore = openHistory, algorithmDatabase = algDatabase } = {}) {
  const parsed = parseImport(text);
  const history = await openHistoryStore();
  if (history.readOnly) throw new Error(history.warning || 'History is read-only. Update CubeSight and reload.');
  const algorithms = algorithmsFromImport(parsed);
  if (algorithms) await algorithmDatabase.importPersonalData(algorithms);
  importAll(storage, parsed, { skipKeys: [SOLVE_STORE_KEY] });
  const count = history.importRecords(historyFromImport(parsed));
  history.pins.importPins(pinsFromImport(parsed));
  await history.flush(); await history.pins.flush();
  return { count };
}
