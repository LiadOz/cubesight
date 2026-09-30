#!/usr/bin/env node
// Replay a CubeSight recording through the REAL smart-cube session and the
// REAL live tracker, re-applying the recorded user actions at their recorded
// times, and print a readable trace.
//
//   node scripts/replay-recording.mjs <recording.json> [--speed N] [--verbose] [--diag]
//
//   --speed N   replay with the original timing scaled by N (default: instant)
//   --verbose   also print handshake/device status/informational entries
//   --diag      also print the [smart-cube] debug log lines
//
// Exit status: 0 clean, 1 desync or errors (e.g. "[session] listener threw"),
// 2 the replay ended in a different state than the app recorded.

import fs from 'node:fs';
import { replayHeadless } from '../src/recording-harness.js';

const args = process.argv.slice(2);
const speedIndex = args.indexOf('--speed');
const file = args.find((a, i) => !a.startsWith('--') && !(speedIndex >= 0 && i === speedIndex + 1));
if (!file) {
  console.error('usage: node scripts/replay-recording.mjs <recording.json> [--speed N] [--verbose] [--diag]');
  process.exit(64);
}
const speed = speedIndex >= 0 ? Number(args[speedIndex + 1]) || 0 : 0;
const verbose = args.includes('--verbose');

const originalLog = console.log;
if (!args.includes('--diag')) {
  console.log = (...parts) => { if (typeof parts[0] === 'string' && parts[0].startsWith('[smart-cube]')) return; originalLog(...parts); };
}
const originalError = console.error;
console.error = (...parts) => { if (parts[0] === '[session] listener threw') return; originalError(...parts); };

const recording = JSON.parse(fs.readFileSync(file, 'utf8'));
const counts = {};
for (const e of recording.events || []) counts[e.kind] = (counts[e.kind] || 0) + 1;
originalLog(`Recording ${file}`);
originalLog(`  created ${recording.createdAt} · ${(recording.events || []).length} events · ${((recording.durationMs || 0) / 1000).toFixed(1)}s${recording.dropped ? ` · ${recording.dropped} older events dropped` : ''}`);
originalLog(`  ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
originalLog('');

const result = await replayHeadless(recording, { speed, verbose, onLine: line => originalLog(line) });

originalLog('');
originalLog('Summary');
originalLog(`  session: phase=${result.session.phase} moves(${result.session.moves.length})=[${result.session.moves.join(' ')}]`);
originalLog(`  live:    phase=${result.live.phase}${result.live.progress?.phase ? '/' + result.live.progress.phase : ''} mode=${result.live.mode ?? '-'}${result.live.record ? ` solved in ${result.live.record.solveMs?.toFixed(0)}ms, ${result.live.record.moveCount} moves` : ''}`);
originalLog(`  session phases replayed: ${result.sessionPhases.join(' > ')}`);
if (result.recordedSessionPhases.length) originalLog(`  session phases recorded: ${result.recordedSessionPhases.join(' > ')}`);
for (const d of result.desyncs) originalLog(`  DESYNC (${d.source}) at ${(d.t / 1000).toFixed(3)}s ${d.detail ?? ''}`);
for (const e of result.errors) originalLog(`  ERROR ${e.split('\n')[0]}`);
for (const a of result.actionErrors) originalLog(`  ACTION FAILED ${a.action.kind} ${a.action.method ?? ''}: ${a.error}`);
for (const d of result.divergences) originalLog(`  divergence at ${(d.t / 1000).toFixed(3)}s: ${d.message}`);
for (const m of result.mismatches) originalLog(`  MISMATCH ${m}`);

const failed = result.desyncs.length || result.errors.length;
originalLog(failed ? '\nFAIL: desync or errors during replay.' : result.mismatches.length ? '\nFAIL: replay did not reproduce the recorded final state.' : '\nOK');
process.exit(failed ? 1 : result.mismatches.length ? 2 : 0);
