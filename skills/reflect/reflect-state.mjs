#!/usr/bin/env node

// reflect-state — the /reflect step-9 state writer (skills-restructuring
// program, filed 2026-07-18). One in-process run replaces the shell
// date/jq choreography that failed twice on record (GNU `date +%s%3N`
// truncation → 19-digit far-future timestamps; ANSI-wrapped `node -e`
// output breaking `jq --argjson`):
//   1. writes the local cache ~/.cache/reflect/last-run.json — the
//      functional authority `--since=last-run` reads on this host;
//   2. merges THIS host's entry into the per-host map in
//      projects/agent-workflow/state.md (fenced JSON block in the body),
//      leaving other hosts' entries intact; a legacy single-block map is
//      migrated to {<host>: entry}. If-Match round-trip — a concurrent
//      writer surfaces as a clean 412 (exit 2), never a clobber.
//
//   reflect-state.mjs [--sessions=N] [--signals=TEXT] [--report=[[wikilink]]]
//
// Exit 0 ok · 1 HTTP error · 2 usage/412.

import {mkdirSync, writeFileSync} from 'node:fs';
import {homedir, hostname} from 'node:os';
import path from 'node:path';
import process from 'node:process';

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

const base = process.env.VAULT_API_URL?.replace(/\/+$/, ''),
  token = process.env.VAULT_API_TOKEN;
if (!base || !token) fail(2, 'VAULT_API_URL and VAULT_API_TOKEN must be set (see ~/.env)');

const extras = {};
for (const arg of process.argv.slice(2)) {
  const [flag, value] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, null];
  switch (flag) {
    case '--sessions': extras.sessions_scanned = +value; break;
    case '--signals': extras.signals = value; break;
    case '--report': extras.report = value; break;
    case '--help': case '-h':
      console.log('Usage: reflect-state.mjs [--sessions=N] [--signals=TEXT] [--report=[[wikilink]]]');
      process.exit(0);
    default: fail(2, `unknown option: ${arg}`);
  }
}

const now = new Date();
const entry = {last_run_iso: now.toISOString(), last_run_ms: now.getTime(), ...extras};

const cacheDir = path.join(homedir(), '.cache', 'reflect');
mkdirSync(cacheDir, {recursive: true});
writeFileSync(path.join(cacheDir, 'last-run.json'),
  JSON.stringify({last_run_iso: entry.last_run_iso, last_run_ms: entry.last_run_ms}, null, 2) + '\n');

const STATE = 'projects/agent-workflow/state.md';
const url = `${base}/vault/${STATE}`;
const headers = {Authorization: `Bearer ${token}`};

const get = await fetch(url, {headers});
if (!get.ok) fail(1, `GET ${STATE}: ${get.status} ${get.statusText}`);
const etag = get.headers.get('etag');
const text = await get.text();

const fence = text.match(/```json\n([\s\S]*?)\n```/);
if (!fence) fail(1, `${STATE}: no \`\`\`json fence found — layout changed, update this script`);
let map;
try {
  map = JSON.parse(fence[1]);
} catch (err) {
  fail(1, `${STATE}: fenced JSON does not parse (${err.message})`);
}
// legacy single-block (pre-2026-06-13): a bare entry, not a host map
if ('last_run_iso' in map) map = {};
const host = hostname().split('.')[0];
map[host] = entry;

const edited = text.replace(fence[0], '```json\n' + JSON.stringify(map, null, 2) + '\n```');
const put = await fetch(url, {
  method: 'PUT',
  headers: {...headers, 'Content-Type': 'text/markdown', 'If-Match': etag},
  body: edited
});
if (put.status === 412) fail(2, '412 — state.md changed concurrently; re-run to retry on the fresh copy');
if (!put.ok) fail(1, `PUT ${STATE}: ${put.status} — ${(await put.text()).slice(0, 300)}`);
console.log(`local cache + ${STATE} updated for host "${host}" (${entry.last_run_iso})`);
