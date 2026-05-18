#!/usr/bin/env node
// bg-shells.mjs — list background shells started in the current Claude Code
// session by walking the session's JSONL transcript. The "N shells" count in
// the Claude Code status line maps to `Bash(run_in_background: true)` calls
// from this session; their shell_ids are returned in the corresponding
// tool_result. This script enumerates them so the agent doesn't have to run
// `ps` (which won't find them — they live in the harness's registry).
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
  const shells = [];
  const killedIds = new Set();
  // tool_use_id → shell entry index (so the matching tool_result can fill shell_id)
  const useIdToShell = new Map();

  for (const line of content.split('\n')) {
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!Array.isArray(row.message?.content)) continue;

    if (row.type === 'assistant') {
      for (const b of row.message.content) {
        if (b?.type !== 'tool_use') continue;
        if (b.name === 'Bash' && b.input?.run_in_background === true) {
          const entry = {
            tool_use_id: b.id,
            command: b.input.command ?? '',
            description: b.input.description ?? '',
            started_iso: row.timestamp ?? null,
            shell_id: null
          };
          shells.push(entry);
          useIdToShell.set(b.id, shells.length - 1);
        } else if (b.name === 'KillShell' && b.input?.shell_id) {
          killedIds.add(b.input.shell_id);
        }
      }
    } else if (row.type === 'user') {
      for (const b of row.message.content) {
        if (b?.type !== 'tool_result' || !b.tool_use_id) continue;
        const idx = useIdToShell.get(b.tool_use_id);
        if (idx === undefined) continue;
        const body =
          typeof b.content === 'string'
            ? b.content
            : Array.isArray(b.content)
              ? b.content.map(s => s?.text ?? '').join('\n')
              : '';
        const m = /\b(bash_\d+)\b/i.exec(body);
        if (m) shells[idx].shell_id = m[1];
      }
    }
  }

  for (const sh of shells) {
    if (!sh.shell_id) sh.status = 'unknown (shell_id not captured)';
    else if (killedIds.has(sh.shell_id)) sh.status = 'killed';
    else sh.status = 'started (run/exit state unknown — check via BashOutput)';
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
  console.log('Use BashOutput(shell_id) to peek pending output; KillShell(shell_id) to terminate.');
}
