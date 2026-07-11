#!/usr/bin/env node

// vault-put — assemble-and-PUT for vault-storage documents, replacing the
// hand-rolled jq/python payload blocks that kept failing (agent-workflow
// queue, filed 2026-07-10). Three modes:
//   vault-put PATH --fm FM.json --body BODY.md      # full JSON write (create/replace)
//   vault-put PATH --append FRAGMENT.md             # round-trip body append, FM verbatim
//   vault-put PATH --replace OLD NEW [...]          # asserted round-trip body edits
// Round-trip modes GET first and send If-Match automatically; a concurrent
// write surfaces as 412 (exit 2). Replace asserts exactly one occurrence
// unless --all (missing or ambiguous → exit 3, nothing written).

import {readFileSync} from 'node:fs';
import process from 'node:process';

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
    console.log(payload.length > 2000 ? payload.slice(0, 2000) + `\n… [${payload.length} bytes]` : payload);
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
    fail(2, `412 precondition failed — the document changed since it was read; re-run to retry on the fresh copy`);
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
  if (!text.startsWith('---\n')) fail(1, `GET ${path}: no frontmatter block — refusing a round-trip edit`);
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) fail(1, `GET ${path}: unterminated frontmatter block`);
  return {head: text.slice(0, end + 5), body: text.slice(end + 5), etag};
};

if (fmFile) {
  const frontmatter = JSON.parse(readFileSync(fmFile, 'utf8')),
    body = readFileSync(bodyFile, 'utf8');
  await put('application/json', JSON.stringify({frontmatter, body}), ifMatch);
} else if (appendFile) {
  const {head, body, etag} = await getDoc(),
    fragment = readFileSync(appendFile, 'utf8');
  await put('text/markdown', head + body.replace(/\s*$/, '\n') + fragment, etag);
} else {
  const {head, body, etag} = await getDoc();
  let edited = body;
  for (const {old, new: replacement} of replaces) {
    const count = edited.split(old).length - 1;
    if (count === 0) fail(3, `replace assert failed — not found:\n${old.slice(0, 200)}`);
    if (count > 1 && !all) fail(3, `replace assert failed — ${count} occurrences (use --all):\n${old.slice(0, 200)}`);
    edited = all ? edited.split(old).join(replacement) : edited.replace(old, replacement);
  }
  await put('text/markdown', head + edited, etag);
}
