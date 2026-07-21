#!/usr/bin/env node

// compact-batch — mechanical layer for /vault-compact (skills-restructuring
// program, filed 2026-07-18). `plan` inventories the folder, selects the
// archive set (default oldest-50% capped at 20 per pass), gathers bodies +
// inbound backlinks, groups by period, and emits a worksheet; the agent
// writes only the summary prose; `execute` PUTs the summary note and moves
// the originals via POST /vault/move (record_id preserved — edges, tags,
// embeddings survive; the read+PUT+DELETE identity-loss pattern is dead).
//
//   compact-batch plan <folder> [--keep=N | --before=YYYY-MM-DD] [--out=FILE]
//   compact-batch execute --plan=FILE --summary=BODY.md [--related=[[a]],[[b]]] [--dry-run]
//
// Exit 0 ok · 1 HTTP/partial failures · 2 usage · 3 plan/summary rejected
// before any write. Run solo or `|| true` in parallel Bash batches.

import {readFileSync, writeFileSync} from 'node:fs';
import process from 'node:process';

const PASS_CAP = 20; // per-pass archive cap — repeated passes beat one mega-summary

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

const base = process.env.VAULT_API_URL?.replace(/\/+$/, ''),
  token = process.env.VAULT_API_TOKEN;
if (!base || !token) fail(2, 'VAULT_API_URL and VAULT_API_TOKEN must be set (see ~/.env)');

const usage = `Usage:
  compact-batch plan <folder> [--keep=N | --before=YYYY-MM-DD] [--out=FILE]
  compact-batch execute --plan=FILE --summary=BODY.md [--related=[[a]],[[b]]] [--dry-run]`;

const [command, ...rest] = process.argv.slice(2);
if (!['plan', 'execute'].includes(command))
  fail(command === '--help' || command === '-h' ? 0 : 2, usage);

const opts = {
  folder: null,
  keep: null,
  before: null,
  out: null,
  plan: null,
  summary: null,
  related: [],
  dryRun: false
};
for (const arg of rest) {
  const [flag, value] = arg.includes('=')
    ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
    : [arg, null];
  switch (flag) {
    case '--keep':
      opts.keep = +value;
      break;
    case '--before':
      opts.before = value;
      break;
    case '--out':
      opts.out = value;
      break;
    case '--plan':
      opts.plan = value;
      break;
    case '--summary':
      opts.summary = value;
      break;
    case '--related':
      opts.related = value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      break;
    case '--dry-run':
      opts.dryRun = true;
      break;
    default:
      if (flag.startsWith('--')) fail(2, `unknown option: ${arg}\n${usage}`);
      if (opts.folder) fail(2, `unexpected argument: ${arg}\n${usage}`);
      opts.folder = arg.replace(/\/+$/, '');
  }
}
if (opts.keep !== null && opts.before !== null)
  fail(2, '--keep and --before are mutually exclusive');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const api = async (method, apiPath, body) => {
  const response = await fetch(`${base}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? {'Content-Type': 'application/json'} : {})
    },
    ...(body !== undefined ? {body: JSON.stringify(body)} : {})
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!response.ok) {
    throw new ApiError(
      response.status,
      json?.code ?? 'http_error',
      json?.error ?? `${response.status} ${response.statusText} on ${method} ${apiPath}`
    );
  }
  return json ?? text;
};

const pool = async (jobs, width = 6) => {
  const results = new Array(jobs.length);
  let next = 0;
  const run = async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
    }
  };
  await Promise.all(Array.from({length: Math.min(width, jobs.length)}, run));
  return results;
};

const today = () => new Date().toISOString().slice(0, 10);

// --- plan --------------------------------------------------------------------

const plan = async () => {
  if (!opts.folder) fail(2, `plan needs a folder\n${usage}`);
  const prefix = `${opts.folder}/`;

  const pieces = [];
  let offset = 0;
  for (;;) {
    const page = await api(
      'GET',
      `/sections?file_prefix=${encodeURIComponent(prefix)}&limit=100&offset=${offset}&exclude=body&sort=created`
    );
    if (!page.items.length) break;
    for (const record of page.items) {
      const relative = record.file_path.slice(prefix.length);
      if (relative.includes('/')) continue; // subfolder piece (incl. archive/)
      if (relative.startsWith('_summary-')) continue; // a prior compaction summary
      if (record.status === 'archived' || record.status === 'superseded') continue;
      if (record.type === 'state') continue; // managed by /vault check
      pieces.push({
        record_id: record.record_id,
        file_path: record.file_path,
        title: record.title,
        type: record.type,
        created: record.created
      });
    }
    offset += page.items.length;
  }
  pieces.sort((a, b) => String(a.created).localeCompare(String(b.created)));

  let selected;
  if (opts.before !== null) selected = pieces.filter(p => String(p.created) < opts.before);
  else if (opts.keep !== null) selected = pieces.slice(0, Math.max(0, pieces.length - opts.keep));
  else selected = pieces.slice(0, Math.floor(pieces.length / 2));
  const truncated = selected.length > PASS_CAP;
  selected = selected.slice(0, PASS_CAP);
  if (!selected.length)
    fail(3, `nothing to archive in ${opts.folder} (${pieces.length} pieces, selection empty)`);

  const selectedIds = new Set(selected.map(p => p.record_id));
  const backlinks = [];
  await pool(
    selected.map(piece => async () => {
      const doc = await api('GET', `/vault/${piece.file_path}`);
      const start =
        typeof doc === 'string' && doc.startsWith('---\n') ? doc.indexOf('\n---\n', 4) + 5 : 0;
      piece.body = String(doc).slice(start);
      try {
        const back = await api('GET', `/sections/${piece.record_id}/backlinks`);
        for (const row of back.items ?? [])
          if (row.from_record && !selectedIds.has(row.from_record.record_id))
            backlinks.push({
              archived: piece.file_path,
              from: row.from_record.file_path,
              title: row.from_record.title,
              edge_type: row.edge?.type
            });
      } catch {}
    })
  );

  // group by month; widen to quarter/year until sections hold ~5-10 pieces
  const monthOf = p => String(p.created).slice(0, 7);
  const quarterOf = p =>
    `${String(p.created).slice(0, 4)}-Q${Math.ceil(+String(p.created).slice(5, 7) / 3)}`;
  const yearOf = p => String(p.created).slice(0, 4);
  let keyFn = monthOf;
  if (new Set(selected.map(monthOf)).size > Math.ceil(selected.length / 5)) keyFn = quarterOf;
  if (new Set(selected.map(keyFn)).size > Math.ceil(selected.length / 5)) keyFn = yearOf;
  const groups = {};
  for (const piece of selected) (groups[keyFn(piece)] ??= []).push(piece.file_path);

  const range = `${String(selected[0].created).slice(0, 10)}-to-${String(selected[selected.length - 1].created).slice(0, 10)}`;
  const worksheet = {
    folder: opts.folder,
    mode: opts.before
      ? `before ${opts.before}`
      : opts.keep !== null
        ? `keep ${opts.keep}`
        : 'oldest half',
    generated_at: new Date().toISOString(),
    total_pieces: pieces.length,
    selected_count: selected.length,
    remaining_after: pieces.length - selected.length,
    truncated_to_cap: truncated,
    summary_path: `${opts.folder}/_summary-${range}.md`,
    suggested_groups: groups,
    inbound_backlinks: backlinks,
    selected
  };
  const output = JSON.stringify(worksheet, null, 2);
  if (opts.out) {
    writeFileSync(opts.out, output + '\n');
    console.log(
      `plan: ${opts.out} — archive ${selected.length} of ${pieces.length} pieces (${range})${truncated ? ' [capped at 20 — re-run after this pass]' : ''}, ${backlinks.length} external inbound link(s)`
    );
  } else console.log(output);
};

// --- execute -------------------------------------------------------------------

const execute = async () => {
  if (!opts.plan || !opts.summary) fail(2, 'execute needs --plan and --summary');
  const sheet = JSON.parse(readFileSync(opts.plan, 'utf8'));
  const body = readFileSync(opts.summary, 'utf8');
  if (body.trim().length < 100)
    fail(3, 'summary body is suspiciously short (< 100 chars) — nothing written');
  const folderTag = sheet.folder.split('/').pop();
  const range = sheet.summary_path.match(/_summary-(.+)\.md$/)[1].replace('-to-', ' to ');

  const moves = sheet.selected.map(piece => ({
    from: piece.file_path,
    to: `${sheet.folder}/archive/${String(piece.created).slice(0, 4)}/${piece.file_path.split('/').pop()}`
  }));
  if (opts.dryRun) {
    console.log(
      JSON.stringify({dry_run: true, would_write: sheet.summary_path, would_move: moves}, null, 2)
    );
    return;
  }

  await api('PUT', `/vault/${sheet.summary_path}`, {
    frontmatter: {
      title: `${folderTag} — summary ${range}`,
      tags: ['summary', folderTag, 'archived-history'],
      created: today(),
      updated: today(),
      status: 'active',
      type: 'meta',
      ...(opts.related.length ? {related: opts.related} : {})
    },
    body
  });

  const report = {
    summary_written: sheet.summary_path,
    archived: [],
    failures: [],
    remaining_in_folder: sheet.remaining_after,
    inbound_links_now_broken: sheet.inbound_backlinks
  };
  for (const move of moves) {
    try {
      await api('POST', '/vault/move', move);
      report.archived.push(`${move.from} → ${move.to}`);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      report.failures.push({...move, status: err.status, code: err.code, message: err.message});
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length) process.exit(1);
};

try {
  if (command === 'plan') await plan();
  else await execute();
} catch (err) {
  if (err instanceof ApiError) fail(1, `${err.status} ${err.code} — ${err.message}`);
  throw err;
}
