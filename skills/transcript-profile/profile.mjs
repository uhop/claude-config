#!/usr/bin/env node
// Tool-call profiler: walks Claude Code session transcripts under
// ~/.claude/projects/**/*.jsonl, pairs tool_use with tool_result by id,
// and reports aggregate counts, latencies, and result bytes per tool name.
//
// Usage:
//   profile.mjs                    # all projects, all time
//   profile.mjs --days 7           # only sessions modified in last 7 days
//   profile.mjs --project NAME     # only the project dir matching NAME (basename)
//   profile.mjs --include-sidechain  # include sub-agent (Task) transcripts
//   profile.mjs --top N            # cap report rows (default 20)
//   profile.mjs --json             # emit JSON instead of markdown
//   profile.mjs --root DIR         # transcripts root (default ~/.claude/projects)

import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';

if (!import.meta.main)
  throw new Error(
    'profile.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const args = process.argv.slice(2);
const flag = name => args.indexOf(name) !== -1;
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const DAYS = opt('--days') ? Number(opt('--days')) : null;
const PROJECT_FILTER = opt('--project') ?? null;
const INCLUDE_SIDECHAIN = flag('--include-sidechain');
const TOP = opt('--top') ? Number(opt('--top')) : 20;
const AS_JSON = flag('--json');

const ROOT = opt('--root', join(homedir(), '.claude', 'projects'));
const cutoffMs = DAYS != null ? Date.now() - DAYS * 86400 * 1000 : 0;

const transcriptFiles = [];
let projectDirs;
try {
  projectDirs = readdirSync(ROOT);
} catch (e) {
  console.error(`profile.mjs: cannot read ${ROOT}: ${e.message}`);
  process.exit(2);
}
for (const projectDir of projectDirs) {
  if (PROJECT_FILTER && !projectDir.includes(PROJECT_FILTER)) continue;
  const projectPath = join(ROOT, projectDir);
  let entries;
  try {
    entries = readdirSync(projectPath);
  } catch {
    continue;
  }
  const add = (fp, sidechain) => {
    const stat = statSync(fp);
    if (cutoffMs && stat.mtimeMs < cutoffMs) return;
    transcriptFiles.push({path: fp, project: projectDir, mtime: stat.mtimeMs, sidechain});
  };
  for (const entry of entries) {
    const fp = join(projectPath, entry);
    if (entry.endsWith('.jsonl')) {
      add(fp, false);
      continue;
    }
    // Sub-agent transcripts: <session>/subagents/agent-*.jsonl; older sessions
    // marked such rows isSidechain inside the session file instead.
    if (!INCLUDE_SIDECHAIN) continue;
    let subEntries;
    try {
      subEntries = readdirSync(join(fp, 'subagents'));
    } catch {
      continue;
    }
    for (const sub of subEntries) {
      if (sub.endsWith('.jsonl')) add(join(fp, 'subagents', sub), true);
    }
  }
}

// Pair tool_use → tool_result by id. tool_use timestamps come from the
// assistant message line; tool_result timestamps from the user message line.
const stats = new Map(); // tool_name → {count, latencies[], owns[], batched, sizes[], bytes, unmatched}
const ensure = name => {
  let s = stats.get(name);
  if (!s) {
    s = {count: 0, latencies: [], owns: [], batched: 0, sizes: [], bytes: 0, unmatched: 0};
    stats.set(name, s);
  }
  return s;
};

let sessionsAnalyzed = 0;
let subagentsAnalyzed = 0;
let totalUseEvents = 0;
let totalResultEvents = 0;
let totalResultBytes = 0;

// A result the harness spilled to disk is stored as its short path, so a very
// large result is under-counted, never over.
const resultBytes = block => {
  const c = block.content;
  if (typeof c === 'string') return Buffer.byteLength(c);
  if (!Array.isArray(c)) return 0;
  let n = 0;
  for (const part of c) if (typeof part?.text === 'string') n += Buffer.byteLength(part.text);
  return n;
};

for (const {path: fp, sidechain} of transcriptFiles) {
  const content = readFileSync(fp, 'utf8');
  // toolUseId → {name, t_start, msg}
  const pending = new Map();
  // One assistant message can issue several tool calls, which run in turn: a
  // call's own cost is the gap from the previous result in its message.
  const lastResult = new Map(); // msg → timestamp of its latest tool_result
  const callsInMsg = new Map(); // msg → tool_use count
  const matched = []; // {name, msg} per matched result, for the batched count
  let sessionTouched = false;

  for (const line of content.split('\n')) {
    if (line.length === 0) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }

    if (!INCLUDE_SIDECHAIN && row.isSidechain === true) continue;

    const ts = row.timestamp ? Date.parse(row.timestamp) : null;
    if (cutoffMs && ts && ts < cutoffMs) continue;

    if (row.type === 'assistant' && row.message?.content) {
      for (const block of row.message.content) {
        if (block.type === 'tool_use' && block.id && block.name) {
          const msg = row.message.id ?? row.requestId ?? row.uuid ?? block.id;
          pending.set(block.id, {name: block.name, t_start: ts, msg});
          callsInMsg.set(msg, (callsInMsg.get(msg) ?? 0) + 1);
          totalUseEvents++;
          sessionTouched = true;
        }
      }
    } else if (row.type === 'user' && row.message?.content) {
      const content = row.message.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          totalResultEvents++;
          const entry = pending.get(block.tool_use_id);
          if (entry) {
            const s = ensure(entry.name);
            s.count++;
            if (entry.t_start != null && ts != null) {
              s.latencies.push(ts - entry.t_start);
              const prev = lastResult.get(entry.msg);
              s.owns.push(ts - (prev == null ? entry.t_start : Math.max(prev, entry.t_start)));
              lastResult.set(entry.msg, ts);
            }
            matched.push({name: entry.name, msg: entry.msg});
            const bytes = resultBytes(block);
            s.bytes += bytes;
            s.sizes.push(bytes);
            totalResultBytes += bytes;
            pending.delete(block.tool_use_id);
          }
        }
      }
    }
  }

  for (const {name, msg} of matched) {
    if ((callsInMsg.get(msg) ?? 0) > 1) ensure(name).batched++;
  }

  // Anything still pending = call in flight at session end (interrupted /
  // crashed / still running). Count as unmatched per tool.
  for (const {name} of pending.values()) {
    ensure(name).unmatched++;
  }
  if (sessionTouched) {
    if (sidechain) subagentsAnalyzed++;
    else sessionsAnalyzed++;
  }
}

const pct = (sorted, p) => {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100));
  return sorted[idx];
};

const fmt = ms => {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
};

const fmtBytes = n => {
  if (n == null) return '—';
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)} KB`;
  return `${(n / 1_000_000).toFixed(1)} MB`;
};

const rows = [];
for (const [name, s] of stats) {
  const sorted = [...s.latencies].sort((a, b) => a - b);
  const total = s.latencies.reduce((sum, x) => sum + x, 0);
  const sizes = [...s.sizes].sort((a, b) => a - b);
  const owns = [...s.owns].sort((a, b) => a - b);
  rows.push({
    name,
    count: s.count,
    unmatched: s.unmatched,
    total_ms: total,
    p50_ms: pct(sorted, 50),
    p95_ms: pct(sorted, 95),
    avg_ms: s.latencies.length === 0 ? null : Math.round(total / s.latencies.length),
    own_p50_ms: pct(owns, 50),
    own_p95_ms: pct(owns, 95),
    own_avg_ms:
      owns.length === 0 ? null : Math.round(owns.reduce((sum, x) => sum + x, 0) / owns.length),
    batched: s.batched,
    bytes: s.bytes,
    p50_bytes: pct(sizes, 50),
    p95_bytes: pct(sizes, 95),
    avg_bytes: s.count === 0 ? null : Math.round(s.bytes / s.count)
  });
}

const grandTotal = rows.reduce((sum, r) => sum + r.total_ms, 0);
const grandCount = rows.reduce((sum, r) => sum + r.count, 0);

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        sessions_analyzed: sessionsAnalyzed,
        subagent_transcripts: subagentsAnalyzed,
        total_use_events: totalUseEvents,
        total_result_events: totalResultEvents,
        total_calls: grandCount,
        total_wall_time_ms: grandTotal,
        total_result_bytes: totalResultBytes,
        rows
      },
      null,
      2
    )
  );
} else {
  const sortedByTotal = [...rows].sort((a, b) => b.total_ms - a.total_ms);
  const sortedByCount = [...rows].sort((a, b) => b.count - a.count);
  const sortedByBytes = [...rows].sort((a, b) => b.bytes - a.bytes);

  const filterDesc =
    (DAYS != null ? `last ${DAYS} days` : 'all time') +
    (PROJECT_FILTER ? `, project=${PROJECT_FILTER}` : '') +
    (INCLUDE_SIDECHAIN ? ', incl. sidechains' : ', main only');

  console.log(`# Tool-call profile (${filterDesc})`);
  console.log();
  console.log(`Sessions analyzed: **${sessionsAnalyzed}**`);
  if (INCLUDE_SIDECHAIN) console.log(`Sub-agent transcripts: **${subagentsAnalyzed}**`);
  console.log(`Total tool calls: **${grandCount}** (across ${rows.length} distinct tools)`);
  console.log(`Wall-clock total: **${fmt(grandTotal)}**`);
  console.log(`Result bytes: **${fmtBytes(totalResultBytes)}** (what the tools put into context)`);
  console.log(
    "p50/p95/Avg run from the call's issue and carry a batch's wait; Own p50/p95 is the gap from the previous result in the same message; Batched is the share of calls issued with siblings."
  );
  console.log();

  const renderTable = list => {
    console.log('| Tool | Calls | Batched | Total | p50 | p95 | Avg | Own p50 | Own p95 |');
    console.log('| ---- | ----- | ------- | ----- | --- | --- | --- | ------- | ------- |');
    for (const r of list.slice(0, TOP)) {
      const batched = r.count === 0 ? '—' : `${Math.round((100 * r.batched) / r.count)}%`;
      console.log(
        `| ${r.name} | ${r.count}${r.unmatched > 0 ? ` (+${r.unmatched} pending)` : ''} | ${batched} | ${fmt(r.total_ms)} | ${fmt(r.p50_ms)} | ${fmt(r.p95_ms)} | ${fmt(r.avg_ms)} | ${fmt(r.own_p50_ms)} | ${fmt(r.own_p95_ms)} |`
      );
    }
  };

  console.log(`## By total wall time (top ${TOP})`);
  console.log();
  renderTable(sortedByTotal);
  console.log();
  console.log(`## By call count (top ${TOP})`);
  console.log();
  renderTable(sortedByCount);
  console.log();
  console.log(`## By result bytes (top ${TOP})`);
  console.log();
  console.log('| Tool | Calls | Bytes | Share | Avg | p50 | p95 |');
  console.log('| ---- | ----- | ----- | ----- | --- | --- | --- |');
  for (const r of sortedByBytes.slice(0, TOP)) {
    const share =
      totalResultBytes === 0 ? '—' : `${((100 * r.bytes) / totalResultBytes).toFixed(1)}%`;
    console.log(
      `| ${r.name} | ${r.count} | ${fmtBytes(r.bytes)} | ${share} | ${fmtBytes(r.avg_bytes)} | ${fmtBytes(r.p50_bytes)} | ${fmtBytes(r.p95_bytes)} |`
    );
  }
}
