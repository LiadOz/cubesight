#!/usr/bin/env node
// Where did an agent's time go? Reads Claude Code agent transcripts (JSONL) and
// splits wall time into: each tool call's duration, grouped by what it was doing,
// and the model's own time between a result and its next action.
//
//   node scripts/agent-time.mjs <transcript.jsonl> [more.jsonl ...]
//
// Objective by construction: every line in a transcript is timestamped, so this
// does not depend on an agent describing its own work accurately.
import { readFileSync } from 'node:fs';
import path from 'node:path';

// A gap longer than this with no transcript activity means the session itself was
// paused (closed laptop, usage limit, waiting for the user) -- not the agent working.
const SUSPEND_MS = 15 * 60 * 1000;

const CATEGORIES = [
  ['waiting on lock', /\bflock\b/],
  // `sleep 119; tail log` is how agents wait for a suite they started in the background.
  ['waiting on a background test run', /\bsleep \d+[^\n]*\b(tail|cat|wc|grep|ls)\b/],
  ['browser tests', /playwright|npm (run )?test\b|test:(layout|snapshots|pwa|affected)|tier[12]\b|npm run review|design:diff|test:merge|test:regression|queue\b/],
  ['unit tests', /node --test|test:unit/],
  ['build / check', /npm run (build|check|lint)|vite build|npm run -s (build|lint)|eslint/],
  ['install', /npm (ci|install)\b/],
  ['sleep / wait', /^\s*sleep\b|waitForTimeout/],
  ['git', /^\s*git\b|git -C/],
  ['dev server', /\bvite\b.*--port|curl .*127\.0\.0\.1/],
];

function categorise(name, input) {
  if (name !== 'Bash') return name === 'Agent' || name === 'Task' ? 'sub-agent' : ['Read', 'Grep', 'Glob'].includes(name) ? 'reading code' : ['Edit', 'Write', 'NotebookEdit'].includes(name) ? 'editing code' : name;
  const command = String(input?.command ?? '');
  for (const [label, pattern] of CATEGORIES) if (pattern.test(command)) return label;
  return 'other shell';
}

const fmt = ms => {
  const s = Math.round(ms / 1000);
  return s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}m` : s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};

function analyse(file) {
  const entries = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch { /* partial line while the agent is still writing */ }
  }
  const at = entry => Date.parse(entry.timestamp);
  const calls = new Map();
  const totals = new Map();
  let modelMs = 0, lastResultAt = null, first = null, last = null;
  for (const entry of entries) {
    const t = at(entry);
    if (Number.isNaN(t)) continue;
    first ??= t; last = t;
    const content = Array.isArray(entry.message?.content) ? entry.message.content : [];
    if (entry.type === 'assistant') {
      if (lastResultAt != null) { modelMs += Math.max(0, t - lastResultAt); lastResultAt = null; }
      for (const block of content) if (block.type === 'tool_use') calls.set(block.id, { name: block.name, input: block.input, start: t });
    } else if (entry.type === 'user') {
      for (const block of content) {
        if (block.type !== 'tool_result' || !calls.has(block.tool_use_id)) continue;
        const call = calls.get(block.tool_use_id);
        call.ms = t - call.start;
        call.category = categorise(call.name, call.input);
        totals.set(call.category, (totals.get(call.category) ?? 0) + call.ms);
        lastResultAt = t;
      }
    }
  }
  // Find the session's suspensions, then remove them from whatever interval they fell in.
  const stamps = entries.map(at).filter(t => !Number.isNaN(t)).sort((a, b) => a - b);
  const suspensions = [];
  for (let i = 1; i < stamps.length; i++) if (stamps[i] - stamps[i - 1] > SUSPEND_MS) suspensions.push([stamps[i - 1], stamps[i]]);
  const overlap = (start, end) => suspensions.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(end, b) - Math.max(start, a)), 0);
  const suspendedMs = suspensions.reduce((sum, [a, b]) => sum + (b - a), 0);
  totals.clear(); modelMs = 0;
  { let prev = null;
    for (const entry of entries) {
      const t = at(entry); if (Number.isNaN(t)) continue;
      if (entry.type === 'assistant' && prev != null) { modelMs += Math.max(0, t - prev - overlap(prev, t)); prev = null; }
      if (entry.type === 'user' && (entry.message?.content ?? []).some?.(b => b.type === 'tool_result')) prev = t;
    } }
  for (const call of calls.values()) if (call.ms != null) { call.ms -= overlap(call.start, call.start + call.ms); totals.set(call.category, (totals.get(call.category) ?? 0) + call.ms); }
  const finished = [...calls.values()].filter(call => call.ms != null);
  const running = [...calls.values()].filter(call => call.ms == null);
  const elapsed = (last ?? 0) - (first ?? 0), wall = elapsed - suspendedMs;
  console.log(`\n== ${path.basename(file)}`);
  console.log(`started ${new Date(first).toISOString().slice(11, 19)}Z, last activity ${new Date(last).toISOString().slice(11, 19)}Z, elapsed ${fmt(elapsed)}, ${finished.length} tool calls`);
  if (suspendedMs) console.log(`session paused ${fmt(suspendedMs)} (${suspensions.map(([a, b]) => `${new Date(a).toISOString().slice(11, 16)}-${new Date(b).toISOString().slice(11, 16)}Z`).join(', ')}) -> ${fmt(wall)} of real working time`);
  console.log('  share of working time (parallel background waits can exceed 100%):');
  const rows = [...totals.entries(), ['model thinking / writing', modelMs]].sort((a, b) => b[1] - a[1]);
  for (const [label, ms] of rows) console.log(`  ${fmt(ms).padStart(7)}  ${String(Math.round(100 * ms / Math.max(1, wall))).padStart(3)}%  ${label}`);
  console.log('  slowest single calls:');
  for (const call of finished.sort((a, b) => b.ms - a.ms).slice(0, 5)) {
    const what = call.name === 'Bash' ? String(call.input?.command ?? '').replace(/\s+/g, ' ') : call.name;
    console.log(`    ${fmt(call.ms).padStart(7)}  ${what.slice(0, 96)}`);
  }
  for (const call of running) {
    const what = call.name === 'Bash' ? String(call.input?.command ?? '').replace(/\s+/g, ' ') : call.name;
    console.log(`  RUNNING NOW for ${fmt(Date.now() - call.start)}: ${what.slice(0, 90)}`);
  }
}

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/agent-time.mjs <transcript.jsonl> [...]'); process.exit(2); }
for (const file of files) analyse(file);
