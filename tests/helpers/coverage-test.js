// Every browser spec imports `test` and `expect` from here. It used to collect V8
// coverage to choose which tests to run; `npm test` now simply runs them all, so this
// is a plain pass-through. `beginCoverage` is kept as a no-op that returns a no-op finish function, for the specs that call it.
export { test, expect } from 'playwright/test';
export async function beginCoverage() { return async () => {}; }
