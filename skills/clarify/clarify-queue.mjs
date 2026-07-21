#!/usr/bin/env node

// clarify-queue — mechanical layer for /clarify (skills-restructuring
// program, filed 2026-07-18). Parses the pending queue and executes the
// two-file archive move; the Q&A and routing judgment stay with the agent.
//
//   clarify-queue.mjs list                       # pending items as JSON
//   clarify-queue.mjs archive Q-ID --resolution="text" [--rejected]
//
// The move writes the archive FIRST, then removes the block from the
// queue — a mid-move failure duplicates the item (visible, idempotent to
// re-run), never loses it. Both writes ride If-Match; a concurrent edit
// surfaces as 412 (exit 2). Initializes clarify-queue-archive.md when
// absent. Exit 0 ok · 1 HTTP error · 2 usage/412 · 3 item not found.

import process from 'node:process';

if (!import.meta.main)
  throw new Error(
    'clarify-queue.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const QUEUE = 'projects/agent-workflow/clarify-queue.md';
const ARCHIVE = 'projects/agent-workflow/clarify-queue-archive.md';

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

const base = process.env.VAULT_API_URL?.replace(/\/+$/, ''),
  token = process.env.VAULT_API_TOKEN;
if (!base || !token) fail(2, 'VAULT_API_URL and VAULT_API_TOKEN must be set (see ~/.env)');

const [command, id, ...rest] = process.argv.slice(2);
let resolution = null,
  rejected = false;
for (const arg of rest) {
  if (arg.startsWith('--resolution=')) resolution = arg.slice(13);
  else if (arg === '--rejected') rejected = true;
  else fail(2, `unknown option: ${arg}`);
}
if (!['list', 'archive'].includes(command))
  fail(
    command === '--help' || command === '-h' ? 0 : 2,
    'Usage: clarify-queue.mjs list | clarify-queue.mjs archive Q-ID --resolution="text" [--rejected]'
  );

const headers = {Authorization: `Bearer ${token}`};
const get = async (path, {optional = false} = {}) => {
  const response = await fetch(`${base}/vault/${path}`, {headers});
  if (response.status === 404 && optional) return null;
  if (!response.ok) fail(1, `GET ${path}: ${response.status} ${response.statusText}`);
  return {text: await response.text(), etag: response.headers.get('etag')};
};
const put = async (path, body, etag, contentType = 'text/markdown') => {
  const response = await fetch(`${base}/vault/${path}`, {
    method: 'PUT',
    headers: {...headers, 'Content-Type': contentType, ...(etag ? {'If-Match': etag} : {})},
    body
  });
  if (response.status === 412) fail(2, `412 on ${path} — changed concurrently; re-run`);
  if (!response.ok)
    fail(1, `PUT ${path}: ${response.status} — ${(await response.text()).slice(0, 300)}`);
};

// blocks are "### Q-..." headings under "## Pending", ending at the next ### / ## / EOF
const parsePending = text => {
  const pending = text.match(/## Pending\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? '';
  const items = [...pending.matchAll(/### (Q-[\w-]+)\n([\s\S]*?)(?=\n### |$)/g)].map(m => ({
    id: m[1],
    block: `### ${m[1]}\n${m[2]}`.trimEnd(),
    body: m[2].trim()
  }));
  // A heading the block regex rejects — a title on the ID line, a malformed id —
  // otherwise vanishes: the file looks right and `list` returns a clean
  // {pending: 0} indistinguishable from an empty queue, so the item sits
  // invisible until someone remembers filing it. Report the headings that
  // exist but did not parse. (Origin: /reflect 2026-07-20 filed
  // "### Q-2026-07-20-001 — is there a durable rule…"; the regex requires a
  // newline straight after the id, so the entry was silently unlisted.)
  const parsed = new Set(items.map(i => i.id));
  const unparsed = [...pending.matchAll(/^### (.+)$/gm)]
    .map(m => m[1].trim())
    .filter(h => !parsed.has(h));
  return {items, unparsed};
};

const queue = await get(QUEUE);
const {items, unparsed} = parsePending(queue.text);

if (unparsed.length) {
  process.stderr.write(
    `warning: ${unparsed.length} heading(s) under ## Pending did not parse as Q-items ` +
      `and are NOT listed below — expected "### Q-<id>" alone on its line:\n` +
      unparsed.map(h => `  ### ${h}\n`).join('')
  );
}

if (command === 'list') {
  console.log(
    JSON.stringify(
      {pending: items.length, items: items.map(({id, body}) => ({id, body})), unparsed},
      null,
      2
    )
  );
  // Exit 0 even with unparsed headings: `list` is a read, and a non-zero exit
  // would cancel in-flight siblings if it ever shares a parallel Bash batch
  // (CLAUDE.md § Tools). The stderr warning and the `unparsed` field carry the
  // signal.
  process.exit(0);
}

if (!id?.startsWith('Q-')) fail(2, 'archive needs a Q-ID');
if (!resolution) fail(2, 'archive needs --resolution="text"');
const item = items.find(entry => entry.id === id);
if (!item)
  fail(
    3,
    `${id} is not in ## Pending (${items.length} pending: ${items.map(i => i.id).join(', ') || 'none'})`
  );

const stamp = new Date().toISOString().slice(0, 10);
const annotated = `${item.block}\n\n**${rejected ? 'Rejected' : 'Resolved'}** (${stamp}): ${resolution}\n`;

let archive = await get(ARCHIVE, {optional: true});
if (archive === null) {
  const fm = {
    frontmatter: {
      title: 'agent-workflow — Clarification queue archive',
      tags: ['agent', 'workflow', 'claude-code', 'clarify', 'archive'],
      created: stamp,
      updated: stamp,
      status: 'archived',
      type: 'project'
    },
    body: `Resolved / rejected clarification items moved out of [[projects/agent-workflow/clarify-queue]]. Append-only.\n\n## Resolved\n\n${annotated}`
  };
  await put(ARCHIVE, JSON.stringify(fm), null, 'application/json');
} else {
  await put(ARCHIVE, archive.text.replace(/\s*$/, '\n\n') + annotated, archive.etag);
}

// remove the block from the queue; leave "(empty)" when it was the last one
let newQueue = queue.text.replace(item.block, '').replace(/\n{3,}/g, '\n\n');
if (!parsePending(newQueue).length)
  newQueue = newQueue.replace(/## Pending\n+/, '## Pending\n\n(empty)\n\n');
await put(QUEUE, newQueue, queue.etag);

console.log(
  `${id} → ${ARCHIVE} (${rejected ? 'rejected' : 'resolved'}); ${items.length - 1} still pending`
);
