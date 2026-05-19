#!/usr/bin/env node
// bg-shells.mjs — list background shells started in the current Claude Code
// session by walking the session's JSONL transcript. The "N shells" count in
// the Claude Code status line maps to `Bash(run_in_background: true)` calls
// from this session; their shell_ids are returned in the corresponding
// tool_result. This script enumerates them so the agent doesn't have to run
// `ps` (which won't find them — they live in the harness's registry).
//
// Background signal sources (in priority order):
//   1) `row.toolUseResult.backgroundTaskId` — modern Claude Code (≥ 2.1.x).
//      The shell-id is alphanumeric (`bc4hsi1fy`), not `bash_<n>`. The
//      tool_use input no longer carries `run_in_background` (the harness
//      strips it on persist).
//   2) `"Command running in background with ID: <id>"` in the result body —
//      same modern shape, text form.
//   3) `bash_<n>` token in the result body — legacy Claude Code.
//
// Kill detection accepts both `TaskStop(task_id|shell_id)` (modern) and
// `KillShell(shell_id)` (legacy).
//
// Usage:
//   bg-shells.mjs                       # list as text
//   bg-shells.mjs --json                # JSON output
//   bg-shells.mjs --session=<path>      # override session JSONL path
//   bg-shells.mjs --all-sessions        # walk every session in the cwd's project dir
//                                       # (use when the current session split or
//                                       # a previous session left strays)

import {readdirSync, readFileSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  for (const a of args) {
    if (a === name) return true;
    if (a.startsWith(name + '=')) return a.slice(name.length + 1);
  }
  return fallback;
};

const SESSION_OVERRIDE = opt('--session', null);
const AS_JSON = opt('--json', false) === true;
const ALL_SESSIONS = opt('--all-sessions', false) === true;

const cwdToProjectDir = cwd => cwd.replace(/\//g, '-');

const findSessionFiles = () => {
  if (SESSION_OVERRIDE) return [SESSION_OVERRIDE];
  const root = join(homedir(), '.claude', 'projects');
  const cwdHash = cwdToProjectDir(process.cwd());
  let dir = join(root, cwdHash);
  let entries;
  try {
    entries = readdirSync(dir, {withFileTypes: true});
  } catch {
    // Fallback: pick newest .jsonl across ALL project dirs (when launched
    // from a path Claude Code hashed differently).
    let projects;
    try {
      projects = readdirSync(root);
    } catch {
      return [];
    }
    let bestDir = null;
    let bestMtime = 0;
    for (const p of projects) {
      const full = join(root, p);
      try {
        const es = readdirSync(full, {withFileTypes: true});
        for (const e of es) {
          if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
          const fp = join(full, e.name);
          const stat = statSync(fp);
          if (stat.mtimeMs > bestMtime) {
            bestMtime = stat.mtimeMs;
            bestDir = full;
          }
        }
      } catch {
        continue;
      }
    }
    if (!bestDir) return [];
    dir = bestDir;
    entries = readdirSync(dir, {withFileTypes: true});
  }
  const jsonl = entries
    .filter(e => e.isFile() && e.name.endsWith('.jsonl'))
    .map(e => ({path: join(dir, e.name), mtime: statSync(join(dir, e.name)).mtimeMs}))
    .sort((a, b) => b.mtime - a.mtime);
  if (jsonl.length === 0) return [];
  return ALL_SESSIONS ? jsonl.map(j => j.path) : [jsonl[0].path];
};

const sessionPaths = findSessionFiles();
if (sessionPaths.length === 0) {
  console.error('No session transcript found.');
  process.exit(1);
}

const shellsBySession = [];

for (const sessionPath of sessionPaths) {
  const content = readFileSync(sessionPath, 'utf8');
  const killedIds = new Set();
  // tool_use_id → tentative bash entry. Every Bash tool_use lands here; only
  // entries that pick up a shell_id (from the corresponding tool_result) are
  // confirmed as background and emitted.
  const bashByUseId = new Map();

  for (const line of content.split('\n')) {
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }

    // Assistant rows carry tool_use entries.
    if (row.type === 'assistant' && Array.isArray(row.message?.content)) {
      for (const b of row.message.content) {
        if (b?.type !== 'tool_use') continue;
        if (b.name === 'Bash') {
          bashByUseId.set(b.id, {
            tool_use_id: b.id,
            command: b.input?.command ?? '',
            description: b.input?.description ?? '',
            started_iso: row.timestamp ?? null,
            shell_id: null
          });
        } else if (
          (b.name === 'TaskStop' || b.name === 'KillShell') &&
          (b.input?.task_id || b.input?.shell_id)
        ) {
          killedIds.add(b.input.task_id ?? b.input.shell_id);
        }
      }
      continue;
    }

    // User rows carry tool_results. Two signals identify background:
    //   1) Modern: `row.toolUseResult.backgroundTaskId` (sibling of `message`).
    //   2) Legacy: the result body text contains "Command running in
    //      background with ID: <id>" or a bare `bash_<n>` token.
    if (row.type !== 'user') continue;
    const blocks = Array.isArray(row.message?.content) ? row.message.content : [];
    const trBlock = blocks.find(b => b?.type === 'tool_result' && b.tool_use_id);
    if (!trBlock) continue;
    const entry = bashByUseId.get(trBlock.tool_use_id);
    if (!entry) continue;

    const bgId = row.toolUseResult?.backgroundTaskId;
    if (bgId) {
      entry.shell_id = bgId;
      continue;
    }

    // Legacy fallback: only when `toolUseResult` is absent ENTIRELY. On
    // modern data toolUseResult is always present, and the lack of
    // `backgroundTaskId` means the call was foreground — falling back to
    // text-pattern matching here is a false-positive trap (any fg bash
    // output that mentions a bash_<n> token or the "Command running in
    // background" string would otherwise get misclassified as bg).
    if (row.toolUseResult) continue;

    const body =
      typeof trBlock.content === 'string'
        ? trBlock.content
        : Array.isArray(trBlock.content)
          ? trBlock.content.map(s => s?.text ?? '').join('\n')
          : '';
    // Anchored to start of body — the harness emits this line first when
    // backgrounding. Embedded matches risk misclassifying a foreground call
    // whose output happens to mention a shell-id-shaped token.
    const m = /^Command running in background with ID:\s*([A-Za-z0-9_-]+)/.exec(body);
    if (m) entry.shell_id = m[1];
  }

  const shells = [...bashByUseId.values()].filter(e => e.shell_id);
  for (const sh of shells) {
    sh.status = killedIds.has(sh.shell_id)
      ? 'killed'
      : 'started (run/exit state unknown — check via TaskOutput)';
  }

  shellsBySession.push({session: sessionPath, shells});
}

if (AS_JSON) {
  console.log(JSON.stringify(shellsBySession, null, 2));
} else {
  for (const {session, shells} of shellsBySession) {
    console.log(`Session: ${session}`);
    if (shells.length === 0) {
      console.log('  No background shells found in this transcript.\n');
      continue;
    }
    console.log(`  Found ${shells.length} background Bash call(s):\n`);
    for (const sh of shells) {
      const cmd = sh.command.replace(/\s+/g, ' ');
      const cmdPreview = cmd.length > 120 ? cmd.slice(0, 119) + '…' : cmd;
      console.log(`  - shell_id: ${sh.shell_id ?? '(not captured)'}    status: ${sh.status}`);
      if (sh.started_iso) console.log(`    started:  ${sh.started_iso}`);
      if (sh.description) console.log(`    desc:     ${sh.description}`);
      console.log(`    cmd:      ${cmdPreview}`);
      console.log();
    }
  }
  console.log('Use TaskOutput(task_id) to peek pending output; TaskStop(task_id) to terminate.');
}
