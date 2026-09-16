#!/usr/bin/env node
// reflect-context — a moment in a session transcript, rendered for a human:
// the rows around a timestamp with ISO times and roles, the user's words and
// the assistant's reply, tool calls one line each. A question the agent asks
// quotes this instead of an epoch and a session prefix (agent-workflow
// feedback § A question carries its context and can be hung, 2026-09-15).
//
//   reflect-context.mjs --project=<dir substring> --session=<id prefix> --at=<epoch ms | ISO>
//                       [--before=2] [--after=3] [--max-chars=1500] [--json]
//
// Prints a header (project, session prefix, first human turn, start time)
// and the exchange. Exit 0 ok · 2 usage · 3 no such transcript, or several.

import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {firstLine, isHumanUserRow, renderExchange, stripSyntheticBlocks} from './reflect-lib.mjs';

if (!import.meta.main)
  throw new Error(
    'reflect-context.mjs is a CLI entry point, not a module — run it, do not import it. To check it loads, use `node --check`.'
  );

const opts = {};
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([a-z-]+)(?:=(.*))?$/);
  if (!m) usage(`unknown argument: ${arg}`);
  opts[m[1]] = m[2] ?? true;
}
function usage(message) {
  if (message) console.error(message);
  console.error(
    'Usage: reflect-context.mjs --project=<dir substring> --session=<id prefix> --at=<epoch ms | ISO> [--before=2] [--after=3] [--max-chars=1500] [--json]'
  );
  process.exit(message ? 2 : 0);
}
if (opts.help || opts.h) usage();
if (!opts.project || !opts.session || !opts.at) usage('--project, --session and --at are required');

const atMs = /^\d+$/.test(opts.at) ? Number(opts.at) : Date.parse(opts.at);
if (!Number.isFinite(atMs))
  usage(`--at is neither an epoch in milliseconds nor an ISO time: ${opts.at}`);
const before = Number(opts.before ?? 2);
const after = Number(opts.after ?? 3);
const maxChars = Number(opts['max-chars'] ?? 1500);

const ROOT = join(homedir(), '.claude', 'projects');
const matches = [];
for (const dir of readdirSync(ROOT)) {
  if (!dir.includes(opts.project)) continue;
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    continue;
  }
  for (const entry of entries) {
    if (entry.endsWith('.jsonl') && entry.startsWith(opts.session)) matches.push({dir, entry});
  }
}
if (matches.length !== 1) {
  console.error(
    matches.length === 0
      ? `no transcript under ${ROOT} matches project "${opts.project}" and session "${opts.session}"`
      : `${matches.length} transcripts match; narrow --project or --session:\n` +
          matches.map(m => `  ${m.dir}/${m.entry}`).join('\n')
  );
  process.exit(3);
}

const {dir, entry} = matches[0];
const rows = readFileSync(join(ROOT, dir, entry), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const rendered = renderExchange(rows, atMs, {before, after, maxChars});
if (!rendered) {
  console.error(`${dir}/${entry}: no human or assistant rows with timestamps`);
  process.exit(3);
}
const first = rendered.first;
// the first human words, with the harness's command envelope and skill body
// stripped the way the scanner strips them, so "/vault resume" reads as such
const firstText = stripSyntheticBlocks(
  first && typeof first.message?.content === 'string'
    ? first.message.content
    : ((first?.message?.content ?? []).find?.(b => b?.type === 'text')?.text ?? '')
);
const started =
  rows.find(r => r?.timestamp && (r.type === 'assistant' || isHumanUserRow(r)))?.timestamp ?? '';
const header = {
  project: dir.replace(/^-home-[^-]+-(?:Open-)?/, ''),
  session: entry.replace(/\.jsonl$/, '').slice(0, 8),
  started: started.replace(/\.\d+Z$/, 'Z'),
  first_turn: firstLine(firstText, 120),
  at: new Date(atMs).toISOString().replace(/\.\d+Z$/, 'Z')
};

if (opts.json) {
  console.log(JSON.stringify({...header, exchange: rendered.text}, null, 2));
} else {
  console.log(
    `${header.project} · session ${header.session} · started ${header.started} · first turn: "${header.first_turn}"\n` +
      `moment: ${header.at}\n\n${rendered.text}`
  );
}
