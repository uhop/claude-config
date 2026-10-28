#!/usr/bin/env node

// enrich-batch — mechanical layer for /vault-enrich-all (skills-restructuring
// program, filed 2026-07-18). `prepare` pulls the server's authoritative
// worklist (coverage.enrichment.unenriched_records — never a client-side
// re-derivation, the 2026-06-30 scope-gap lesson), gathers per-note context
// (body, existing FM, body wikilinks, similar-note candidates, the tag
// taxonomy), and emits a worksheet; the agent writes only the enrichment
// content; `apply` validates it all before any write and PUTs each block
// through the JSON path with If-Match + current-path resolution.
//
//   enrich-batch prepare [--limit=N] [--stale | --refresh [--outline]] [--full-threshold=F] [--type=T] [--records=FILE] [--holder=H] [--out=FILE]
//   enrich-batch apply --worksheet=FILE --enrichments=FILE [--dry-run]
//   enrich-batch release --worksheet=FILE
//
// `prepare` takes a work claim (purpose enrich, vault-storage D150) on its
// worklist and keeps only what it got, so a parallel sweep leaves those notes
// alone; `apply` releases it after its writes, and `release` gives it back
// without writing. A server without /claims is run unclaimed.
//
// A --stale item whose body changed by at most F (default 0.4) of its chunk
// bytes since its last enrichment carries `delta` (the added chunks) instead
// of `body`; the rest carry the whole body (vault-storage enrichment-delta).
// --records narrows either worklist to the paths or ids listed (the sweep's
// shards, disjoint by construction). --refresh takes the --records list as
// given instead, each note with its current agent: block and its whole body:
// summaries whose hash reads current but whose text no longer describes the
// note (vault-storage D284). --outline gives each refresh item the note's size
// and its headings to level 2 in place of its body, for restating a summary
// past the lint's bound, which the long rolling notes carry (/vault sweep).
//
// An atomized folder (vault-storage 0ah-2) keeps its summary on its `_about.md`,
// judged against the note its folder composes: the full lint lists each folder
// with that note's hash, a folder without a summary joins the missing worklist
// and a stale one the --stale worklist, its item reads the composed note (or,
// stale with a summary, `changed_pieces`, the pieces written since the summary,
// under the same threshold), and apply writes the summary onto `_about.md` with
// the folder's hash as its `derived_from_hash`; a summary that still holds is
// written again with that hash, since summary-checked judges `_about.md`'s own
// body.
//
// Enrichments file (JSON; bare map or {enrichments: {...}}), keyed by
// file_path exactly as in the worksheet; null = skip:
//   {"topics/x.md": {"summary": "...", "key_concepts": ["..."],
//     "tags_suggested": [...], "related_proposed": ["[[...]]"],
//     "edge_classifications": {"[[target]]": "derived-from"},
//     "complexity": "prose"}}
// An item with current_agent (--stale, --refresh) may answer {"summary_holds": true}
// instead: `apply` confirms its summary for the body read (vault-storage D289).
//
// Exit 0 ok · 1 HTTP/partial failures · 2 usage · 3 enrichments rejected
// before any write. Exits non-zero — run solo or `|| true` in parallel
// Bash batches.

import {randomBytes} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {hostname} from 'node:os';
import process from 'node:process';
import {vaultSettings} from '../vault/vault-settings.mjs';

if (!import.meta.main)
  throw new Error(
    'enrich-batch.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const COMPLEXITY = ['prose', 'code-heavy', 'tabular', 'mixed', 'hub', 'log-entry'];
const EDGE_TYPES = [
  'cites',
  'supersedes',
  'revises',
  'derived-from',
  'basis-for', // declaration alias: stored as derived-from with the edge flipped
  'applies-to',
  'contradicts',
  'related-to'
];

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

const {base, token, problem} = vaultSettings();
if (problem) fail(2, problem);

const usage = `Usage:
  enrich-batch prepare [--limit=N] [--stale | --refresh [--outline]] [--full-threshold=F] [--type=T] [--records=FILE] [--holder=H] [--out=FILE]
  enrich-batch apply --worksheet=FILE --enrichments=FILE [--dry-run]
  enrich-batch release --worksheet=FILE`;

const [command, ...rest] = process.argv.slice(2);
if (!['prepare', 'apply', 'release'].includes(command))
  fail(command === '--help' || command === '-h' ? 0 : 2, usage);

const opts = {
  limit: 30,
  stale: false,
  refresh: false,
  outline: false,
  fullThreshold: 0.4,
  type: null,
  records: null,
  holder: null,
  out: null,
  worksheet: null,
  enrichments: null,
  dryRun: false
};
for (const arg of rest) {
  const [flag, value] = arg.includes('=')
    ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
    : [arg, null];
  switch (flag) {
    case '--limit':
      opts.limit = +value;
      break;
    case '--stale':
      opts.stale = true;
      break;
    case '--refresh':
      opts.refresh = true;
      break;
    case '--outline':
      opts.outline = true;
      break;
    case '--full-threshold':
      opts.fullThreshold = +value;
      break;
    case '--type':
      opts.type = value;
      break;
    case '--records':
      opts.records = value;
      break;
    case '--holder':
      opts.holder = value;
      break;
    case '--out':
      opts.out = value;
      break;
    case '--worksheet':
      opts.worksheet = value;
      break;
    case '--enrichments':
      opts.enrichments = value;
      break;
    case '--dry-run':
      opts.dryRun = true;
      break;
    default:
      fail(2, `unknown option: ${arg}\n${usage}`);
  }
}
if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 200)
  fail(2, '--limit must be 1..200');
if (!(opts.fullThreshold >= 0 && opts.fullThreshold <= 1)) fail(2, '--full-threshold must be 0..1');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// GETs retry network-level failures (ECONNRESET & friends) with backoff
// (2026-07-18/23). Non-GETs stay fail-fast: a write's socket death is not
// provably un-applied.
const RETRY_DELAYS_MS = [300, 1200, 4800];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url, init) => {
  for (let attempt = 0; ; ++attempt) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (init.method !== 'GET' || attempt >= RETRY_DELAYS_MS.length) throw error;
      await sleep(RETRY_DELAYS_MS[attempt] * (0.75 + Math.random() * 0.5));
    }
  }
};

const api = async (method, path, body, headers = {}) => {
  const response = await fetchWithRetry(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
      ...headers
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
      json?.error ?? `${response.status} ${response.statusText} on ${method} ${path}`
    );
  }
  return {
    data: json ?? text,
    etag: response.headers.get('etag'),
    composed:
      (response.headers.get('x-program-clerk-composed') ??
        response.headers.get('x-vault-composed')) === 'true'
  };
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

const splitDoc = text => {
  if (typeof text !== 'string' || !text.startsWith('---\n')) return {body: String(text)};
  const end = text.indexOf('\n---\n', 4);
  return end < 0 ? {body: text} : {body: text.slice(end + 5)};
};

const emptyBody = body => {
  const stripped = body.replace(/\s/g, '').toLowerCase();
  return stripped.length === 0 || stripped === 'null';
};

// Mask code regions first (mirrors vault-storage src/markdown/wikilinks.ts) — a stray
// `[[` inside inline code must not swallow body text up to the next real link.
const maskCode = text =>
  text
    .replace(/(^|\n)([ \t]*)(```|~~~)[^\n]*\n[\s\S]*?\n\2\3[ \t]*(?=\n|$)/g, s =>
      s.replace(/[^\n]/g, ' ')
    )
    .replace(/`+[^`\n]+?`+/g, s => s.replace(/[^\n]/g, ' '));

const WIKILINK_RE = /\[\[([^\]\n|[]+?)(?:\|[^\]]*)?\]\]/g;

const wikilinks = body => [
  ...new Set([...maskCode(body).matchAll(WIKILINK_RE)].map(m => `[[${m[1].trim()}]]`))
];

// --- work claims (D150) -------------------------------------------------------

const CLAIM_TTL = {base: 600, perItem: 120, min: 1800, max: 14400};

// Partial by design: what another claim covers comes back `held` and is left
// out. A 404 is a server older than /claims, so the batch runs unclaimed.
const claimWork = async (holder, paths) => {
  if (!paths.length) return {claim: null, claimed: new Set(), held: []};
  const ttl = Math.min(
    CLAIM_TTL.max,
    Math.max(CLAIM_TTL.min, CLAIM_TTL.base + paths.length * CLAIM_TTL.perItem)
  );
  try {
    const {data} = await api('POST', '/claims', {
      holder,
      purpose: 'enrich',
      items: paths,
      ttl_seconds: ttl
    });
    return {
      claim: data.claim_token
        ? {holder, claim_token: data.claim_token, expires_at: data.expires_at}
        : null,
      claimed: new Set(data.claimed),
      held: data.held
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404)
      return {claim: null, claimed: null, held: [], unclaimed: 'route_absent'};
    throw err;
  }
};

// A lapsed claim (404) is already free; anything else is reported, never thrown.
const releaseWork = async claim => {
  try {
    await api('POST', '/claims/release', {
      holder: claim.holder,
      claim_token: claim.claim_token
    });
    return 'released';
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    return err.status === 404
      ? 'lapsed'
      : {status: err.status, code: err.code, message: err.message};
  }
};

// --- atomized folders (vault-storage 0ah-2) -----------------------------------

/** The pieces directly in a folder written on or after `since` (a date): its new entries. */
const changedPieces = async (folder, since) => {
  const dir = folder.folder.slice(0, -'.md'.length) + '/';
  const pieces = [];
  for (let offset = 0; ;) {
    const {data: page} = await api(
      'GET',
      `/sections?file_prefix=${encodeURIComponent(dir)}&updated_since=${since}&sort=file_path_asc&limit=100&offset=${offset}`
    );
    for (const row of page.items) {
      const name = row.file_path.slice(dir.length);
      if (name.includes('/') || name === '_about.md') continue;
      pieces.push({
        file_path: row.file_path,
        title: row.title,
        updated: row.updated,
        body: row.body
      });
    }
    offset += page.items.length;
    if (!page.items.length || offset >= page.total) return pieces;
  }
};

// a note's shape without its text, for restating a summary it has outgrown: the notes whose
// summaries pass the lint's bound are the long rolling notes, megabytes of body (2026-10-28)
const outlineOf = body => ({
  body_bytes: Buffer.byteLength(body, 'utf8'),
  headings: body
    .split('\n')
    .filter(line => /^#{1,2} /.test(line))
    .map(line => line.slice(0, 160))
});

/**
 * A folder's worksheet item: its `_about.md` record with the composed note's body, or, for a stale
 * summary, the pieces written since it when they are at most the threshold of the note.
 */
const folderItem = async (folder, record, frontmatter, candidate) => {
  const {body} = splitDoc((await api('GET', `/vault/${folder.folder}`)).data);
  const agent = frontmatter.agent ?? null;
  let pieces = null;
  if (opts.stale && agent?.summary && typeof agent.derived_at === 'string') {
    pieces = await changedPieces(folder, agent.derived_at.slice(0, 10));
    const bytes = pieces.reduce(
      (sum, piece) => sum + Buffer.byteLength(piece.body ?? '', 'utf8'),
      0
    );
    if (bytes > opts.fullThreshold * Buffer.byteLength(body, 'utf8')) pieces = null;
  }
  return {
    record_id: candidate.record_id,
    file_path: record.file_path,
    folder: folder.folder,
    folder_hash: folder.hash,
    pieces: folder.pieces,
    type: record.type,
    title: record.title,
    body_hash: record.body_hash,
    existing_tags: frontmatter.tags ?? [],
    existing_related: frontmatter.related ?? [],
    ...(opts.stale || opts.refresh ? {current_agent: agent} : {}),
    body_wikilinks: wikilinks(record.body ?? ''),
    related_candidates: [],
    ...(pieces
      ? {read: 'folder-delta', changed_pieces: pieces}
      : opts.outline
        ? {read: 'outline', outline: outlineOf(body)}
        : {read: 'full', body})
  };
};

// --- prepare -----------------------------------------------------------------

const prepare = async () => {
  const {data: lint} = await api('GET', '/system/lint');
  const coverage = lint.coverage?.enrichment;
  if (!coverage)
    fail(
      1,
      'server has no coverage.enrichment — pre-2026-07-09 vault-storage; use the SKILL.md fallback enumeration'
    );

  const wanted = opts.records
    ? new Set(
        readFileSync(opts.records, 'utf8')
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean)
      )
    : null;
  const listed = r =>
    wanted.has(r.file_path) || wanted.has(r.record_id) || (r.folder && wanted.has(r.folder));
  const folders = new Map((coverage.folders ?? []).map(f => [f.record_id, f]));
  const folderCandidates = keep =>
    [...folders.values()]
      .filter(f => keep(f) && (!wanted || listed(f)))
      .map(f => ({record_id: f.record_id, file_path: f.file_path}));

  if (opts.refresh && (!wanted || opts.stale))
    fail(2, '--refresh takes its notes from --records, and not with --stale');
  if (opts.outline && !opts.refresh) fail(2, '--outline goes with --refresh');
  let candidates;
  if (opts.refresh) {
    candidates = [];
    const missing = [];
    for (const entry of wanted) {
      if (!entry.endsWith('.md')) {
        candidates.push({record_id: entry});
        continue;
      }
      const folder = [...folders.values()].find(f => f.folder === entry);
      if (folder) {
        candidates.push({record_id: folder.record_id, file_path: folder.file_path});
        continue;
      }
      const {data} = await api(
        'GET',
        `/sections?file_path=${encodeURIComponent(entry)}&fields=record_id,file_path`
      );
      const row = data.items?.[0];
      if (row) candidates.push({record_id: row.record_id, file_path: row.file_path});
      else missing.push(entry);
    }
    if (missing.length) fail(1, `no note at: ${missing.join(', ')}`);
  } else if (opts.stale) {
    candidates = [];
    let offset = 0;
    while (candidates.length < opts.limit) {
      const {data: page} = await api(
        'GET',
        `/suggestions?kind=agent_enrichment_stale&status=pending&limit=100&offset=${offset}`
      );
      if (!page.items.length) break;
      for (const item of page.items) {
        const candidate = {
          record_id: item.payload.record_id,
          file_path: item.payload.file_path,
          suggestion_id: item.id,
          ...(item.payload.reason ? {reason: item.payload.reason} : {})
        };
        if (!wanted || listed(candidate)) candidates.push(candidate);
      }
      offset += page.items.length;
    }
    candidates.push(...folderCandidates(f => f.stale));
  } else if (wanted) {
    candidates = (coverage.unenriched_records ?? []).filter(listed);
    candidates.push(...folderCandidates(f => !f.summary));
  } else {
    candidates = coverage.unenriched_records ?? [];
    if (opts.type) candidates = candidates.filter(r => r.type === opts.type);
    if (!opts.type || opts.type === 'meta') candidates.push(...folderCandidates(f => !f.summary));
  }
  candidates = candidates.slice(0, opts.limit);

  // Claim each note's current path: a payload's path predates a rename made on disk.
  const records = new Map();
  await pool(
    candidates.map(candidate => async () => {
      const {data} = await api('GET', `/sections/${candidate.record_id}`);
      records.set(candidate.record_id, data);
    })
  );
  const holder = opts.holder ?? `enrich-${hostname()}-${randomBytes(3).toString('hex')}`;
  const work = await claimWork(holder, [...new Set([...records.values()].map(r => r.file_path))]);
  const unclaimed = [];

  const taxonomy = [];
  {
    let offset = 0;
    for (;;) {
      const {data: page} = await api('GET', `/tags?limit=100&offset=${offset}`);
      if (!page.items.length) break;
      taxonomy.push(...page.items.map(t => t.tag));
      offset += page.items.length;
    }
  }

  const needsBody = [],
    items = [];
  await pool(
    candidates.map(candidate => async () => {
      const record = records.get(candidate.record_id);
      if (work.claimed && !work.claimed.has(record.file_path)) {
        unclaimed.push(record.file_path);
        return;
      }
      const {data: fm} = await api('GET', `/sections/${candidate.record_id}/fm?exclude=body`);
      const folder = folders.get(candidate.record_id);
      if (folder) {
        items.push(await folderItem(folder, record, fm.frontmatter, candidate));
        return;
      }
      if (emptyBody(record.body ?? '')) {
        needsBody.push(record.file_path);
        return;
      }
      const links = wikilinks(record.body);
      let delta = null;
      if (opts.stale && fm.frontmatter.agent?.summary) {
        try {
          const {data} = await api('GET', `/sections/${candidate.record_id}/enrichment-delta`);
          if (data.baseline && data.changed_fraction <= opts.fullThreshold) delta = data;
        } catch {}
      }
      // A delta keeps current_agent.related_proposed, which saves the /similar call (2026-09-27).
      let similar = [];
      if (!delta) {
        try {
          const {data} = await api('GET', `/sections/${candidate.record_id}/similar?k=15`);
          const rows = Array.isArray(data) ? data : (data.items ?? []);
          const known = new Set([
            ...(fm.frontmatter.related ?? []).map(r => r.replace(/^\[\[|\]\]$/g, '')),
            ...links.map(l => l.replace(/^\[\[|\]\]$/g, ''))
          ]);
          similar = rows
            .filter(row => (row.distance ?? 1) <= 0.3)
            .filter(row => !known.has((row.file_path ?? '').replace(/\.md$/, '')))
            .map(row => ({file_path: row.file_path, title: row.title, distance: row.distance}));
        } catch {}
      }
      items.push({
        record_id: candidate.record_id,
        file_path: record.file_path,
        ...(candidate.file_path && candidate.file_path !== record.file_path
          ? {path_moved: {from: candidate.file_path, to: record.file_path}}
          : {}),
        type: record.type,
        title: record.title,
        body_hash: record.body_hash,
        existing_tags: fm.frontmatter.tags ?? [],
        existing_related: fm.frontmatter.related ?? [],
        ...(opts.stale || opts.refresh
          ? {
              current_agent: fm.frontmatter.agent ?? null,
              suggestion_id: candidate.suggestion_id,
              ...(candidate.reason ? {reason: candidate.reason} : {})
            }
          : {}),
        body_wikilinks: links,
        related_candidates: similar,
        ...(delta
          ? {
              read: 'delta',
              delta: {
                body_bytes: delta.body_bytes,
                chunks: delta.chunks,
                added_bytes: delta.added_bytes,
                removed_bytes: delta.removed_bytes,
                changed_fraction: delta.changed_fraction,
                added_chunks: delta.added_chunks
              }
            }
          : opts.outline
            ? {read: 'outline', outline: outlineOf(record.body)}
            : {read: 'full', body: record.body})
      });
    })
  );
  items.sort((a, b) => a.file_path.localeCompare(b.file_path));
  const deltas = items.filter(item => item.read !== 'full').length;

  const worksheet = {
    mode: opts.refresh ? 'refresh' : opts.stale ? 'stale' : 'missing',
    generated_at: new Date().toISOString(),
    coverage: {
      total: coverage.total,
      enriched: coverage.enriched,
      unenriched: coverage.unenriched,
      worklist_truncated: (coverage.unenriched_records?.length ?? 0) < coverage.unenriched
    },
    ...(opts.stale
      ? {reads: {delta: deltas, full: items.length - deltas, full_threshold: opts.fullThreshold}}
      : {}),
    claim: work.claim,
    ...(work.unclaimed ? {unclaimed_reason: work.unclaimed} : {}),
    held: work.held,
    unclaimed: unclaimed.sort(),
    taxonomy,
    needs_a_body: needsBody,
    items,
    enrichments_template: Object.fromEntries(items.map(item => [item.file_path, null]))
  };
  const output = JSON.stringify(worksheet, null, 2);
  if (opts.out) {
    writeFileSync(opts.out, output + '\n');
    console.log(
      `worksheet: ${opts.out} — ${items.length} item(s) (${worksheet.mode}${opts.stale ? `, ${deltas} read as a delta` : ''}), ${coverage.unenriched} unenriched total${needsBody.length ? `, ${needsBody.length} need a body` : ''}${unclaimed.length ? `, ${unclaimed.length} not claimed` : ''}${worksheet.claim ? `; claimed as ${holder}` : ''}`
    );
  } else console.log(output);
};

// --- apply -------------------------------------------------------------------

const validate = (worksheet, enrichments) => {
  const byPath = new Map(worksheet.items.map(item => [item.file_path, item]));
  const unknown = Object.keys(enrichments).filter(key => !byPath.has(key));
  if (unknown.length)
    fail(3, `enrichments reference paths not in the worksheet: ${unknown.join(', ')}`);
  const jobs = [];
  for (const [path, enrichment] of Object.entries(enrichments)) {
    if (enrichment === null) continue;
    const item = byPath.get(path);
    const err = message => fail(3, `${path}: ${message} — nothing written`);
    if (typeof enrichment !== 'object') err('enrichment must be an object or null');
    if (enrichment.summary_holds === true) {
      if (!item.current_agent)
        err('summary_holds needs an item with current_agent (--stale, --refresh)');
      jobs.push({item, confirm: true});
      continue;
    }
    if (typeof enrichment.summary !== 'string' || enrichment.summary.trim().length < 10)
      err('summary must be a string (≥ 10 chars)');
    if (
      !Array.isArray(enrichment.key_concepts) ||
      !enrichment.key_concepts.length ||
      enrichment.key_concepts.some(c => typeof c !== 'string')
    )
      err('key_concepts must be a non-empty string array');
    if (!COMPLEXITY.includes(enrichment.complexity))
      err(`complexity must be one of ${COMPLEXITY.join(', ')}`);
    // The three optional keys: `null` is absent, the same as the `?? []` /
    // `?? {}` the write applies — a sub-agent writing JSON reaches for null on
    // a field it has nothing for, and `Object.entries(null)` threw past the
    // harness's clean fail(3) (apodict sweep, 2026-09-15).
    for (const field of ['tags_suggested', 'related_proposed'])
      if (
        enrichment[field] != null &&
        (!Array.isArray(enrichment[field]) || enrichment[field].some(v => typeof v !== 'string'))
      )
        err(`${field} must be a string array`);
    if (enrichment.edge_classifications != null) {
      if (
        typeof enrichment.edge_classifications !== 'object' ||
        Array.isArray(enrichment.edge_classifications)
      )
        err('edge_classifications must be an object of wikilink → edge type');
      const links = new Set(item.body_wikilinks);
      for (const [key, type] of Object.entries(enrichment.edge_classifications)) {
        if (!links.has(key))
          err(`edge_classifications key ${key} is not a body wikilink of this note`);
        if (!EDGE_TYPES.includes(type))
          err(`edge type "${type}" invalid (valid: ${EDGE_TYPES.join(', ')})`);
      }
    }
    jobs.push({item, enrichment});
  }
  return jobs;
};

const apply = async () => {
  if (!opts.worksheet || !opts.enrichments) fail(2, 'apply needs --worksheet and --enrichments');
  const worksheet = JSON.parse(readFileSync(opts.worksheet, 'utf8'));
  const raw = JSON.parse(readFileSync(opts.enrichments, 'utf8'));
  const enrichments = raw && typeof raw === 'object' && raw.enrichments ? raw.enrichments : raw;
  const jobs = validate(worksheet, enrichments);
  const report = {
    mode: worksheet.mode,
    written: [],
    confirmed: [],
    skipped: Object.values(enrichments).filter(e => e === null).length,
    needs_a_body: [],
    failures: []
  };

  if (opts.dryRun) {
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          would_write: jobs.filter(j => !j.confirm).map(j => j.item.file_path),
          would_confirm: jobs.filter(j => j.confirm).map(j => j.item.file_path),
          skipped: report.skipped
        },
        null,
        2
      )
    );
    return;
  }

  const confirmOne = async item => {
    try {
      await api('POST', `/sections/${item.record_id}/summary-checked`, {body_hash: item.body_hash});
      report.confirmed.push(item.file_path);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      report.failures.push({
        file_path: item.file_path,
        status: err.status,
        code: err.code,
        message: err.message
      });
    }
  };

  const writeOne = async ({item, enrichment, confirmed = false}) => {
    // resolve the CURRENT path first — writing to a stale worksheet path
    // resurrects ghost records (2026-07-12)
    const {data: record} = await api('GET', `/sections/${item.record_id}`);
    const put = async () => {
      const doc = await api('GET', `/vault/${record.file_path}`);
      if (doc.composed || doc.etag?.startsWith('W/'))
        throw new ApiError(409, 'composed_view', `${record.file_path} is a composed folder view`);
      const {body} = splitDoc(doc.data);
      if (emptyBody(body)) {
        report.needs_a_body.push(record.file_path);
        return false;
      }
      const agent = {
        derived_from_hash: item.folder_hash ?? 'auto',
        // Stamped by the writer; a folder's next stale read takes the pieces written since.
        derived_at: 'auto',
        summary: enrichment.summary.trim(),
        key_concepts: enrichment.key_concepts,
        tags_suggested: enrichment.tags_suggested ?? [],
        related_proposed: enrichment.related_proposed ?? [],
        edge_classifications: enrichment.edge_classifications ?? {},
        complexity: enrichment.complexity
      };
      await api(
        'PUT',
        `/vault/${record.file_path}`,
        {frontmatter: {agent}, body},
        {'If-Match': doc.etag}
      );
      return true;
    };
    const done = report[confirmed ? 'confirmed' : 'written'];
    try {
      if (await put()) done.push(record.file_path);
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) {
        try {
          if (await put()) done.push(record.file_path);
          return;
        } catch (retryErr) {
          err = retryErr;
        }
      }
      if (!(err instanceof ApiError)) throw err;
      report.failures.push({
        file_path: item.file_path,
        status: err.status,
        code: err.code,
        message: err.message
      });
    }
  };
  await pool(
    jobs.map(job => () => {
      if (!job.confirm) return writeOne(job);
      // A folder's summary holds for the composed note it was read from, whose hash summary-checked never sees.
      if (job.item.folder)
        return writeOne({item: job.item, enrichment: job.item.current_agent, confirmed: true});
      return confirmOne(job.item);
    }),
    4
  );

  report.written.sort();
  report.confirmed.sort();
  if (worksheet.claim) report.claim = await releaseWork(worksheet.claim);
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length) process.exit(1);
};

const release = async () => {
  if (!opts.worksheet) fail(2, 'release needs --worksheet');
  const {claim} = JSON.parse(readFileSync(opts.worksheet, 'utf8'));
  console.log(JSON.stringify({claim: claim ? await releaseWork(claim) : 'none'}, null, 2));
};

try {
  if (command === 'prepare') await prepare();
  else if (command === 'apply') await apply();
  else await release();
} catch (err) {
  if (err instanceof ApiError) fail(1, `${err.status} ${err.code} — ${err.message}`);
  throw err;
}
