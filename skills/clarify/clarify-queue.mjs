#!/usr/bin/env node

// clarify-queue — mechanical layer for /clarify (skills-restructuring
// program, filed 2026-07-18). Parses the pending queue, files a new item in
// the exact shape the parser reads, and executes the two-file archive move;
// the Q&A and routing judgment stay with the agent.
//
//   clarify-queue.mjs list                       # pending items as JSON
//   clarify-queue.mjs file --question="…?" --context=@ctx.md --candidates=@cands.md \
//                          --source="project `x`, session `y`, ts N; report [[…]]" [--created="…"] [--id=Q-…] [--dry-run]
//   clarify-queue.mjs file --body=@block.md      # a whole body (the lines after the ### Q-id heading)
//   clarify-queue.mjs archive Q-ID --resolution="text" [--rejected]
//
// `file` allocates the next `Q-YYYY-MM-DD-NNN`, validates the five lines the
// walk needs (Created, Source, Question ending in "?", Context, Candidates
// with at least two numbered readings), and appends the block under
// ## Pending — a hand-rolled heading with a title on the id line was
// silently unlisted on 2026-07-20, and a "hang it" from /reflect --apply
// must never lose the question (2026-09-15). The archive move writes the
// archive FIRST, then removes the block from the queue — a mid-move failure
// duplicates the item (visible, idempotent to re-run), never loses it. All
// writes ride If-Match; a concurrent edit surfaces as 412 (exit 2).
// Initializes clarify-queue-archive.md when absent.
// Exit 0 ok · 1 HTTP error · 2 usage/412/validation · 3 item not found.

import process from 'node:process';
import {readFileSync} from 'node:fs';
import {hostname} from 'node:os';

if (!import.meta.main)
  throw new Error(
    'clarify-queue.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const QUEUE = 'projects/agent-workflow/clarify-queue.md';
const ARCHIVE = 'projects/agent-workflow/clarify-queue-archive.md';
const USAGE =
  'Usage: clarify-queue.mjs list | clarify-queue.mjs file --question="…?" --context=@f --candidates=@f --source="…" [--created="…"] [--id=Q-…] [--dry-run] | clarify-queue.mjs file --body=@block.md [--dry-run] | clarify-queue.mjs archive Q-ID --resolution="text" [--rejected]';

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

const [command, ...rest] = process.argv.slice(2);
if (command === '--help' || command === '-h') {
  console.log(USAGE);
  process.exit(0);
}
if (!['list', 'file', 'archive'].includes(command)) fail(2, USAGE);

const opts = {};
const positional = [];
for (const arg of rest) {
  const m = arg.match(/^--([a-z-]+)(?:=([\s\S]*))?$/);
  if (m) opts[m[1]] = m[2] ?? true;
  else positional.push(arg);
}
// `@path` reads the value from a file, so multi-line context and candidates
// need no shell quoting.
const value = key => {
  const v = opts[key];
  if (typeof v !== 'string') return v;
  return v.startsWith('@') ? readFileSync(v.slice(1), 'utf8').replace(/\s+$/, '') : v;
};

const base = process.env.VAULT_API_URL?.replace(/\/+$/, ''),
  token = process.env.VAULT_API_TOKEN;
if (!base || !token) fail(2, 'VAULT_API_URL and VAULT_API_TOKEN must be set (see ~/.env)');

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

// Local date, the one reports and Q-ids are named by (a session that runs past
// midnight UTC is still "today" here).
const now = new Date();
const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

if (command === 'file') {
  let body = value('body');
  if (!body) {
    const question = value('question');
    const context = value('context');
    const candidates = value('candidates');
    const source = value('source');
    if (!question || !context || !candidates || !source)
      fail(2, 'file needs --body=@block.md, or --question, --context, --candidates and --source');
    const hhmm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const created = value('created') ?? `${stamp} (reflect, ${hostname()} ${hhmm})`;
    // candidates: numbered lines as given, or one reading per line, numbered here
    const candLines = candidates
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map((l, i) => (/^\d+\.\s/.test(l) ? `  ${l}` : `  ${i + 1}. ${l}`));
    body = [
      `- **Created:** ${created}`,
      `- **Source:** ${source}`,
      `- **Question:** ${question.trim()}`,
      `- **Context:** ${context.replace(/\s*\n\s*/g, ' ').trim()}`,
      `- **Candidates:**`,
      ...candLines
    ].join('\n');
  }
  body = body.replace(/\s+$/, '');
  // the five lines the walk reads, in the shape the parser and /clarify expect
  const problems = [];
  if (!/^- \*\*Created:\*\* \S/m.test(body)) problems.push('a "- **Created:** …" line');
  if (!/^- \*\*Source:\*\* \S/m.test(body)) problems.push('a "- **Source:** …" line');
  if (!/^- \*\*Question:\*\* .+\?\s*$/m.test(body))
    problems.push('a "- **Question:** …?" line ending with a question mark');
  if (!/^- \*\*Context:\*\* \S/m.test(body)) problems.push('a "- **Context:** …" line');
  const numbered = (body.match(/^\s+\d+\. \*\*.+\*\*/gm) ?? []).length;
  if (!/^- \*\*Candidates:\*\*/m.test(body) || numbered < 2)
    problems.push(
      'a "- **Candidates:**" line followed by at least two "  N. **label.** …" readings'
    );
  if (/^### /m.test(body))
    problems.push('no "### " heading inside the body (the id line is added here)');
  if (problems.length) fail(2, `file: the body lacks ${problems.join('; ')}`);

  let id = value('id');
  if (id) {
    if (!/^Q-\d{4}-\d{2}-\d{2}-\d{3}$/.test(id))
      fail(2, `--id must look like Q-YYYY-MM-DD-NNN: ${id}`);
  } else {
    const archive = await get(ARCHIVE, {optional: true});
    const used = new Set(
      [...`${queue.text}\n${archive?.text ?? ''}`.matchAll(/Q-(\d{4}-\d{2}-\d{2})-(\d{3})/g)]
        .filter(m => m[1] === stamp)
        .map(m => Number(m[2]))
    );
    let n = 1;
    while (used.has(n)) ++n;
    id = `Q-${stamp}-${String(n).padStart(3, '0')}`;
  }
  if (items.some(i => i.id === id) || unparsed.includes(id)) fail(2, `${id} is already pending`);

  const block = `### ${id}\n\n${body}\n`;
  if (opts['dry-run']) {
    console.log(block);
    process.exit(0);
  }
  // append at the end of ## Pending: replace "(empty)" when it is there, else
  // insert before the next "## " heading or at the end of the file
  const section = queue.text.match(/## Pending\n([\s\S]*?)(?=\n## |$)/);
  if (!section) fail(3, `${QUEUE} has no "## Pending" section`);
  let newQueue;
  if (/^\s*\(empty\)\s*$/.test(section[1])) {
    newQueue = queue.text.replace(section[0], `## Pending\n\n${block}`);
  } else {
    const end = section.index + section[0].length;
    newQueue = `${queue.text.slice(0, end).replace(/\s*$/, '\n\n')}${block}${queue.text.slice(end).replace(/^\n*/, '\n')}`;
  }
  await put(QUEUE, newQueue, queue.etag);
  console.log(`${id} filed under ## Pending in ${QUEUE}; ${items.length + 1} pending`);
  process.exit(0);
}

// archive
const id = positional[0];
const resolution = value('resolution');
const rejected = opts.rejected === true;
if (!id?.startsWith('Q-')) fail(2, 'archive needs a Q-ID');
if (!resolution) fail(2, 'archive needs --resolution="text"');
const item = items.find(entry => entry.id === id);
if (!item)
  fail(
    3,
    `${id} is not in ## Pending (${items.length} pending: ${items.map(i => i.id).join(', ') || 'none'})`
  );

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

// remove the block from the queue; leave "(empty)" only when it was the last
// one — `parsePending` returns {items, unparsed}, and a `.length` on that
// object was always undefined, so every archive wrote "(empty)" above the
// items that remained (found 2026-09-15).
let newQueue = queue.text.replace(item.block, '').replace(/\n{3,}/g, '\n\n');
if (!parsePending(newQueue).items.length)
  newQueue = newQueue.replace(/## Pending\n+/, '## Pending\n\n(empty)\n\n');
await put(QUEUE, newQueue, queue.etag);

console.log(
  `${id} → ${ARCHIVE} (${rejected ? 'rejected' : 'resolved'}); ${items.length - 1} still pending`
);
