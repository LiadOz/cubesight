// Keep file selection identical for the default and bounded CPU profiles.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const dir = new URL('../tests/', import.meta.url);
const files = readdirSync(dir).filter(name => name.endsWith('-unit.test.mjs')).sort()
  .map(name => fileURLToPath(new URL(name, dir)));
const workers = process.env.UNIT_WORKERS || (process.env.CUBESIGHT_TEST_LOW_CPU === '1' ? '6' : '');
if (workers && !/^[1-9]\d*$/.test(workers)) throw new Error('UNIT_WORKERS must be a positive integer');
const child = spawn(process.execPath, ['--test', ...(workers ? [`--test-concurrency=${workers}`] : []), ...files, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
