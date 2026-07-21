#!/usr/bin/env node

// vault-put — assemble-and-PUT for vault-storage documents, replacing the
// hand-rolled jq/python payload blocks that kept failing (agent-workflow
// queue, filed 2026-07-10). Three modes:
//   vault-put PATH --fm FM.json --body BODY.md      # full JSON write (create/replace)
//   vault-put PATH --append FRAGMENT.md             # round-trip body append, FM verbatim
//   vault-put PATH --replace OLD NEW [...]          # asserted round-trip body edits
// Round-trip modes GET first and send If-Match automatically; a concurrent
// write surfaces as 412 (exit 2), and a composed folder view (weak ETag /
// X-Vault-Composed — no on-disk file) is refused up front instead of
// materializing a shadowing flat file. Replace asserts exactly one
// occurrence unless --all (missing or ambiguous → exit 3, nothing written).
// Null/empty documents are refused on every mode — removal is DELETE.

import {readFileSync} from 'node:fs';
import process from 'node:process';

if (!import.meta.main)
  throw new Error(
    'vault-put.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const usage = `Usage:
  vault-put PATH --fm FM.json --body BODY.md [--if-match ETAG] [--dry-run]
  vault-put PATH --append FRAGMENT.md [--dry-run]
  vault-put PATH [--replace OLD NEW]... [--replace-file OLD.txt NEW.txt]... [--all] [--dry-run]

Exit codes: 0 ok · 1 usage/HTTP error · 2 If-Match conflict (412) · 3 failed replace assert`;

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

const base = process.env.VAULT_API_URL,
  token = process.env.VAULT_API_TOKEN;
if (!base || !token) fail(1, 'VAULT_API_URL and VAULT_API_TOKEN must be set (see ~/.env)');

const args = process.argv.slice(2);
let path = null,
  fmFile = null,
  bodyFile = null,
  appendFile = null,
  ifMatch = null,
  all = false,
  dryRun = false;
const replaces = [];

for (let i = 0; i < args.length; ++i) {
  const arg = args[i];
  switch (arg) {
    case '--fm':
      fmFile = args[++i];
      break;
    case '--body':
      bodyFile = args[++i];
      break;
    case '--append':
      appendFile = args[++i];
      break;
    case '--replace':
      replaces.push({old: args[++i], new: args[++i]});
      break;
    case '--replace-file':
      replaces.push({old: readFileSync(args[++i], 'utf8'), new: readFileSync(args[++i], 'utf8')});
      break;
    case '--if-match':
      ifMatch = args[++i];
      break;
    case '--all':
      all = true;
      break;
    case '--dry-run':
      dryRun = true;
      break;
    case '--help':
    case '-h':
      console.log(usage);
      process.exit(0);
    default:
      if (arg.startsWith('--')) fail(1, `unknown option: ${arg}\n${usage}`);
      if (path) fail(1, `unexpected argument: ${arg}\n${usage}`);
      path = arg;
  }
}

if (!path) fail(1, usage);
const modes = [fmFile || bodyFile, appendFile, replaces.length].filter(Boolean).length;
if (modes !== 1) fail(1, `exactly one mode required (json write | --append | --replace)\n${usage}`);
if ((fmFile && !bodyFile) || (bodyFile && !fmFile))
  fail(1, 'the JSON write mode needs both --fm and --body');

const url = `${base.replace(/\/+$/, '')}/vault/${path}`;
const headers = {Authorization: `Bearer ${token}`};

const put = async (contentType, payload, etag) => {
  if (dryRun) {
    console.log(`DRY RUN — would PUT ${path} (${contentType}${etag ? `, If-Match ${etag}` : ''})`);
    console.log(
      payload.length > 2000 ? payload.slice(0, 2000) + `\n… [${payload.length} bytes]` : payload
    );
    return;
  }
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': contentType,
      ...(etag ? {'If-Match': etag} : {})
    },
    body: payload
  });
  if (response.status === 412) {
    // Surface the server's own diagnostic — a 412 is not always a concurrent
    // write (e.g. a composed-view target), and masking the message sent the
    // 2026-07-14 blog session chasing a phantom concurrency bug.
    let detail = 'the document changed since it was read; re-run to retry on the fresh copy';
    try {
      const err = JSON.parse(await response.text());
      if (err.error) detail = err.error;
      if (err.details?.current_etag) detail += ` (current etag "${err.details.current_etag}")`;
    } catch {}
    fail(2, `412 precondition failed — ${detail}`);
  }
  if (!response.ok) {
    fail(1, `${response.status} ${response.statusText} — ${(await response.text()).slice(0, 500)}`);
  }
  console.log(`${response.status} ${path} etag=${response.headers.get('etag') ?? ''}`);
};

const getDoc = async () => {
  const response = await fetch(url, {headers});
  if (!response.ok) fail(1, `GET ${path}: ${response.status} ${response.statusText}`);
  const text = await response.text(),
    etag = response.headers.get('etag');
  if (response.headers.get('x-vault-composed') === 'true' || etag?.startsWith('W/')) {
    fail(
      1,
      `GET ${path}: composed view of the atomized folder ${path.replace(/\.md$/, '')}/ — no single file exists, and a round-trip write would create a shadowing flat file. Edit the folder's pieces instead.`
    );
  }
  if (!text.startsWith('---\n'))
    fail(1, `GET ${path}: no frontmatter block — refusing a round-trip edit`);
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) fail(1, `GET ${path}: unterminated frontmatter block`);
  return {head: text.slice(0, end + 5), body: text.slice(end + 5), etag};
};

// Null-wipe guard (2026-06-18: a serialized JS null replaced the 59 KB
// stream-chain decisions note): a null/empty document is never a write —
// removal is DELETE.
const assertDoc = (frontmatter, body) => {
  if (frontmatter !== undefined) {
    if (frontmatter === null || typeof frontmatter !== 'object' || Array.isArray(frontmatter))
      fail(1, 'refusing write: frontmatter must be a JSON object');
    const nulls = Object.keys(frontmatter).filter(key => frontmatter[key] === null);
    if (nulls.length)
      fail(
        1,
        `refusing write: null frontmatter value for ${nulls.join(', ')} — omit the key instead`
      );
  }
  const stripped = body.trim();
  if (!stripped || stripped === 'null')
    fail(
      1,
      `refusing write: body is ${stripped ? 'the literal string "null"' : 'empty'} — to remove a document use DELETE (vault-curl /vault/${path} -X DELETE)`
    );
};

if (fmFile) {
  const frontmatter = JSON.parse(readFileSync(fmFile, 'utf8')),
    body = readFileSync(bodyFile, 'utf8');
  assertDoc(frontmatter, body);
  await put('application/json', JSON.stringify({frontmatter, body}), ifMatch);
} else if (appendFile) {
  const {head, body, etag} = await getDoc(),
    fragment = readFileSync(appendFile, 'utf8'),
    merged = body.replace(/\s*$/, '\n') + fragment;
  assertDoc(undefined, merged);
  await put('text/markdown', head + merged, etag);
} else {
  const {head, body, etag} = await getDoc();
  let edited = body;
  for (const {old, new: replacement} of replaces) {
    const count = edited.split(old).length - 1;
    if (count === 0) fail(3, `replace assert failed — not found:\n${old.slice(0, 200)}`);
    if (count > 1 && !all)
      fail(3, `replace assert failed — ${count} occurrences (use --all):\n${old.slice(0, 200)}`);
    // function replacer: a string replacement would interpret $-patterns ($`, $$, $&)
    edited = all ? edited.split(old).join(replacement) : edited.replace(old, () => replacement);
  }
  assertDoc(undefined, edited);
  await put('text/markdown', head + edited, etag);
}
