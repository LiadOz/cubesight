import { rm } from 'node:fs/promises';
import path from 'node:path';

// Failure reports accumulate across runs and feed the index page; start clean
// so a green run cannot be mistaken for the leftovers of an older failing one.
export default async function globalSetup() {
  await rm(path.resolve('test-results/layout'), { recursive: true, force: true });
}
