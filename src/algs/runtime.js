import { CASES, SEED_ALGS } from './seed/cases.js';
import { createAlgDatabase } from './db.js';

/** A shared database instance for the browser, progress view, and backup port. */
export const algDatabase = createAlgDatabase({ seedCases: CASES, seedAlgs: SEED_ALGS });
export { CASES as ALG_CASES, SEED_ALGS };
