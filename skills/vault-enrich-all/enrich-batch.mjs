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
//   enrich-batch prepare [--limit=N] [--stale] [--type=T] [--records=FILE] [--out=FILE]
//   enrich-batch apply --worksheet=FILE --enrichments=FILE [--dry-run]
//
// Enrichments file (JSON; bare map or {enrichments: {...}}), keyed by
// file_path exactly as in the worksheet; null = skip:
//   {"topics/x.md": {"summary": "...", "key_concepts": ["..."],
//     "tags_suggested": [...], "related_proposed": ["[[...]]"],
//     "edge_classifications": {"[[target]]": "derived-from"},
//     "complexity": "prose"}}
//
// Exit 0 ok · 1 HTTP/partial failures · 2 usage · 3 enrichments rejected
// before any write. Exits non-zero — run solo or `|| true` in parallel
// Bash batches.

import {readFileSync, writeFileSync} from 'node:fs';
import process from 'node:process';

const COMPLEXITY = ['prose', 'code-heavy', 'tabular', 'mixed', 'hub', 'log-entry'];
const EDGE_TYPES = ['cites', 'supersedes', 'revises', 'derived-from', 'caused-by',
  'fixed-by', 'rejected-because', 'applies-to', 'contradicts', 'related-to'];

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

const base = process.env.VAULT_API_URL?.replace(/\/+$/, ''),
  token = process.env.VAULT_API_TOKEN;
if (!base || !token) fail(2, 'VAULT_API_URL and VAULT_API_TOKEN must be set (see ~/.env)');

const usage = `Usage:
  enrich-batch prepare [--limit=N] [--stale] [--type=T] [--records=FILE] [--out=FILE]
  enrich-batch apply --worksheet=FILE --enrichments=FILE [--dry-run]`;

const [command, ...rest] = process.argv.slice(2);
if (!['prepare', 'apply'].includes(command)) fail(command === '--help' || command === '-h' ? 0 : 2, usage);

const opts = {limit: 30, stale: false, type: null, records: null, out: null,
  worksheet: null, enrichments: null, dryRun: false};
for (const arg of rest) {
  const [flag, value] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, null];
  switch (flag) {
    case '--limit': opts.limit = +value; break;
    case '--stale': opts.stale = true; break;
    case '--type': opts.type = value; break;
    case '--records': opts.records = value; break;
    case '--out': opts.out = value; break;
    case '--worksheet': opts.worksheet = value; break;
    case '--enrichments': opts.enrichments = value; break;
    case '--dry-run': opts.dryRun = true; break;
    default: fail(2, `unknown option: ${arg}\n${usage}`);
  }
}
if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 200) fail(2, '--limit must be 1..200');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const api = async (method, path, body, headers = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {Authorization: `Bearer ${token}`,
      ...(body !== undefined ? {'Content-Type': 'application/json'} : {}), ...headers},
    ...(body !== undefined ? {body: JSON.stringify(body)} : {})
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!response.ok) {
    throw new ApiError(response.status, json?.code ?? 'http_error',
      json?.error ?? `${response.status} ${response.statusText} on ${method} ${path}`);
  }
  return {data: json ?? text, etag: response.headers.get('etag'), composed: response.headers.get('x-vault-composed') === 'true'};
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

const wikilinks = body => [...new Set([...body.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => `[[${m[1]}]]`))];

// --- prepare -----------------------------------------------------------------

const prepare = async () => {
  const {data: lint} = await api('GET', '/system/lint');
  const coverage = lint.coverage?.enrichment;
  if (!coverage) fail(1, 'server has no coverage.enrichment — pre-2026-07-09 vault-storage; use the SKILL.md fallback enumeration');

  let candidates;
  if (opts.records) {
    const wanted = new Set(readFileSync(opts.records, 'utf8').split('\n').map(l => l.trim()).filter(Boolean));
    candidates = (coverage.unenriched_records ?? []).filter(r => wanted.has(r.file_path) || wanted.has(r.record_id));
    if (opts.stale) fail(2, '--records applies to the missing-block worklist, not --stale');
  } else if (opts.stale) {
    candidates = [];
    let offset = 0;
    while (candidates.length < opts.limit) {
      const {data: page} = await api('GET', `/suggestions?kind=agent_enrichment_stale&status=pending&limit=100&offset=${offset}`);
      if (!page.items.length) break;
      for (const item of page.items)
        candidates.push({record_id: item.payload.record_id, file_path: item.payload.file_path, suggestion_id: item.id});
      offset += page.items.length;
    }
  } else {
    candidates = coverage.unenriched_records ?? [];
    if (opts.type) candidates = candidates.filter(r => r.type === opts.type);
  }
  candidates = candidates.slice(0, opts.limit);

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

  const needsBody = [], items = [];
  await pool(candidates.map(candidate => async () => {
    const {data: record} = await api('GET', `/sections/${candidate.record_id}`);
    const {data: fm} = await api('GET', `/sections/${candidate.record_id}/fm?exclude=body`);
    if (emptyBody(record.body ?? '')) {
      needsBody.push(record.file_path);
      return;
    }
    const links = wikilinks(record.body);
    let similar = [];
    try {
      const {data} = await api('GET', `/sections/${candidate.record_id}/similar?k=15`);
      const rows = Array.isArray(data) ? data : data.items ?? [];
      const known = new Set([...(fm.frontmatter.related ?? []).map(r => r.replace(/^\[\[|\]\]$/g, '')),
        ...links.map(l => l.replace(/^\[\[|\]\]$/g, ''))]);
      similar = rows
        .filter(row => (row.distance ?? 1) <= 0.3)
        .filter(row => !known.has((row.file_path ?? '').replace(/\.md$/, '')))
        .map(row => ({file_path: row.file_path, title: row.title, distance: row.distance}));
    } catch {}
    items.push({
      record_id: candidate.record_id,
      file_path: record.file_path,
      ...(candidate.file_path && candidate.file_path !== record.file_path
        ? {path_moved: {from: candidate.file_path, to: record.file_path}} : {}),
      type: record.type, title: record.title,
      existing_tags: fm.frontmatter.tags ?? [],
      existing_related: fm.frontmatter.related ?? [],
      ...(opts.stale ? {current_agent: fm.frontmatter.agent ?? null, suggestion_id: candidate.suggestion_id} : {}),
      body_wikilinks: links,
      related_candidates: similar,
      body: record.body
    });
  }));
  items.sort((a, b) => a.file_path.localeCompare(b.file_path));

  const worksheet = {
    mode: opts.stale ? 'stale' : 'missing',
    generated_at: new Date().toISOString(),
    coverage: {total: coverage.total, enriched: coverage.enriched, unenriched: coverage.unenriched,
      worklist_truncated: (coverage.unenriched_records?.length ?? 0) < coverage.unenriched},
    taxonomy, needs_a_body: needsBody, items,
    enrichments_template: Object.fromEntries(items.map(item => [item.file_path, null]))
  };
  const output = JSON.stringify(worksheet, null, 2);
  if (opts.out) {
    writeFileSync(opts.out, output + '\n');
    console.log(`worksheet: ${opts.out} — ${items.length} item(s) (${worksheet.mode}), ${coverage.unenriched} unenriched total${needsBody.length ? `, ${needsBody.length} need a body` : ''}`);
  } else console.log(output);
};

// --- apply -------------------------------------------------------------------

const validate = (worksheet, enrichments) => {
  const byPath = new Map(worksheet.items.map(item => [item.file_path, item]));
  const unknown = Object.keys(enrichments).filter(key => !byPath.has(key));
  if (unknown.length) fail(3, `enrichments reference paths not in the worksheet: ${unknown.join(', ')}`);
  const jobs = [];
  for (const [path, enrichment] of Object.entries(enrichments)) {
    if (enrichment === null) continue;
    const item = byPath.get(path);
    const err = message => fail(3, `${path}: ${message} — nothing written`);
    if (typeof enrichment !== 'object') err('enrichment must be an object or null');
    if (typeof enrichment.summary !== 'string' || enrichment.summary.trim().length < 10) err('summary must be a string (≥ 10 chars)');
    if (!Array.isArray(enrichment.key_concepts) || !enrichment.key_concepts.length || enrichment.key_concepts.some(c => typeof c !== 'string'))
      err('key_concepts must be a non-empty string array');
    if (!COMPLEXITY.includes(enrichment.complexity)) err(`complexity must be one of ${COMPLEXITY.join(', ')}`);
    for (const field of ['tags_suggested', 'related_proposed'])
      if (enrichment[field] !== undefined && (!Array.isArray(enrichment[field]) || enrichment[field].some(v => typeof v !== 'string')))
        err(`${field} must be a string array`);
    if (enrichment.edge_classifications !== undefined) {
      const links = new Set(item.body_wikilinks);
      for (const [key, type] of Object.entries(enrichment.edge_classifications)) {
        if (!links.has(key)) err(`edge_classifications key ${key} is not a body wikilink of this note`);
        if (!EDGE_TYPES.includes(type)) err(`edge type "${type}" invalid (valid: ${EDGE_TYPES.join(', ')})`);
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
  const report = {mode: worksheet.mode, written: [], skipped: Object.values(enrichments).filter(e => e === null).length,
    needs_a_body: [], failures: []};

  if (opts.dryRun) {
    console.log(JSON.stringify({dry_run: true, would_write: jobs.map(j => j.item.file_path), skipped: report.skipped}, null, 2));
    return;
  }

  const writeOne = async ({item, enrichment}) => {
    // resolve the CURRENT path first — writing to a stale worksheet path
    // resurrects ghost records (2026-07-12)
    const {data: record} = await api('GET', `/sections/${item.record_id}`);
    const put = async () => {
      const doc = await api('GET', `/vault/${record.file_path}`);
      if (doc.composed || doc.etag?.startsWith('W/')) throw new ApiError(409, 'composed_view', `${record.file_path} is a composed folder view`);
      const {body} = splitDoc(doc.data);
      if (emptyBody(body)) {
        report.needs_a_body.push(record.file_path);
        return false;
      }
      const agent = {derived_from_hash: 'auto', summary: enrichment.summary.trim(),
        key_concepts: enrichment.key_concepts,
        tags_suggested: enrichment.tags_suggested ?? [],
        related_proposed: enrichment.related_proposed ?? [],
        edge_classifications: enrichment.edge_classifications ?? {},
        complexity: enrichment.complexity};
      await api('PUT', `/vault/${record.file_path}`, {frontmatter: {agent}, body}, {'If-Match': doc.etag});
      return true;
    };
    try {
      if (await put()) report.written.push(record.file_path);
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) {
        try {
          if (await put()) report.written.push(record.file_path);
          return;
        } catch (retryErr) {
          err = retryErr;
        }
      }
      if (!(err instanceof ApiError)) throw err;
      report.failures.push({file_path: item.file_path, status: err.status, code: err.code, message: err.message});
    }
  };
  await pool(jobs.map(job => () => writeOne(job)), 4);

  report.written.sort();
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length) process.exit(1);
};

try {
  if (command === 'prepare') await prepare();
  else await apply();
} catch (err) {
  if (err instanceof ApiError) fail(1, `${err.status} ${err.code} — ${err.message}`);
  throw err;
}
