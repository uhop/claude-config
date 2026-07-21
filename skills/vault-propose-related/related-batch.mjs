#!/usr/bin/env node

// related-batch — mechanical layer for /vault-propose-related (skills-
// restructuring program, filed 2026-07-18). `prepare` enumerates unreviewed
// source notes (enrichable types read live from the server — never
// hardcoded), fetches + distance-caps + dedups similar-note candidates, and
// emits a worksheet; the agent judges each candidate; `review` writes the
// proposals note, `apply` adds accepted links through the server's atomic
// FM membership patch — no /meta reads, no body round-trips, so both
// documented data-loss classes (null-related wholesale replace, jq -r
// newline growth) are structurally gone.
//
//   related-batch prepare [--limit=N] [--k=15] [--out=FILE]
//   related-batch review --worksheet=FILE --decisions=FILE [--dry-run]
//   related-batch apply  --worksheet=FILE --decisions=FILE [--dry-run]
//
// Decisions file (bare map or {decisions: {...}}): per source path, a map
// of candidate path → verdict — "accept" needs a reason for the review
// note, the rest may be bare strings:
//   {"topics/a.md": {
//      "topics/b.md": {"verdict": "accept", "reason": "same subsystem"},
//      "topics/c.md": "skip",
//      "topics/d.md": {"verdict": "ambiguous", "reason": "borderline"},
//      "topics/e.md": {"verdict": "supersede-candidate", "reason": "stale twin"}}}
// Untouched candidates default to "skip"; a source may be null to skip whole.
//
// Exit 0 ok · 1 HTTP/partial failures · 2 usage · 3 decisions rejected
// before any write. Run solo or `|| true` in parallel Bash batches.

import {readFileSync, writeFileSync} from 'node:fs';
import process from 'node:process';

if (!import.meta.main)
  throw new Error(
    'related-batch.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const VERDICTS = ['accept', 'skip', 'ambiguous', 'supersede-candidate'];
const DISTANCE_CAP = 0.3; // 99%-recall operating point (embedding baseline)
const band = distance =>
  distance <= 0.2
    ? 'accept-by-default'
    : distance <= 0.25
      ? 'accept-on-subject-overlap'
      : 'selective';

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

const base = process.env.VAULT_API_URL?.replace(/\/+$/, ''),
  token = process.env.VAULT_API_TOKEN;
if (!base || !token) fail(2, 'VAULT_API_URL and VAULT_API_TOKEN must be set (see ~/.env)');

const usage = `Usage:
  related-batch prepare [--limit=N] [--k=15] [--out=FILE]
  related-batch review --worksheet=FILE --decisions=FILE [--dry-run]
  related-batch apply  --worksheet=FILE --decisions=FILE [--dry-run]`;

const [command, ...rest] = process.argv.slice(2);
if (!['prepare', 'review', 'apply'].includes(command))
  fail(command === '--help' || command === '-h' ? 0 : 2, usage);

const opts = {limit: 30, k: 15, out: null, worksheet: null, decisions: null, dryRun: false};
for (const arg of rest) {
  const [flag, value] = arg.includes('=')
    ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
    : [arg, null];
  switch (flag) {
    case '--limit':
      opts.limit = +value;
      break;
    case '--k':
      opts.k = +value;
      break;
    case '--out':
      opts.out = value;
      break;
    case '--worksheet':
      opts.worksheet = value;
      break;
    case '--decisions':
      opts.decisions = value;
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

const pathKey = p => p.replace(/\.md$/, '');
const today = () => new Date().toISOString().slice(0, 10);

// --- prepare -----------------------------------------------------------------

const reviewedSources = async () => {
  const reviewed = new Set();
  let files = [];
  try {
    files = (await api('GET', '/vault/queries/')).files ?? [];
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  const names = files
    .map(f => (typeof f === 'string' ? f : (f.name ?? f.path ?? '')))
    .filter(n => n.includes('related-proposals'));
  await pool(
    names.map(name => async () => {
      const text = await api('GET', `/vault/queries/${name.replace(/^queries\//, '')}`);
      for (const m of String(text).matchAll(/^##\s+`?([^`\n]+?)`?\s*$/gm)) reviewed.add(m[1]);
    })
  );
  return {reviewed, proposalFiles: names};
};

const prepare = async () => {
  const lint = await api('GET', '/system/lint');
  const types = lint.coverage?.enrichment?.enrichable_types;
  if (!types)
    fail(1, 'server has no coverage.enrichment.enrichable_types — pre-2026-07-09 vault-storage');
  const enrichable = new Set(types);

  const {reviewed, proposalFiles} = await reviewedSources();

  // client-side enumeration by necessity (no server worklist for this pass);
  // filters mirror the server's documented exclusions — path-based archive
  // check, NOT archived_at (2026-06-30 lesson)
  const sources = [];
  let offset = 0;
  for (;;) {
    const page = await api('GET', `/sections?limit=100&offset=${offset}&exclude=body`);
    if (!page.items.length) break;
    for (const record of page.items) {
      if (!enrichable.has(record.type)) continue;
      if (record.file_path.includes('/archive/')) continue;
      if (record.file_path.includes('related-proposals')) continue; // this skill's own output notes
      if (record.status === 'superseded' || record.status === 'archived') continue;
      if (reviewed.has(record.file_path)) continue;
      sources.push({record_id: record.record_id, file_path: record.file_path, title: record.title});
    }
    offset += page.items.length;
  }
  sources.sort((a, b) => a.file_path.localeCompare(b.file_path));
  const batch = sources.slice(0, opts.limit);

  const items = [];
  await pool(
    batch.map(source => async () => {
      const fm = await api('GET', `/sections/${source.record_id}/fm`);
      const related = fm.frontmatter.related ?? [];
      const links = [...String(fm.body ?? '').matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);
      const known = new Set([
        ...related.map(r => pathKey(r.replace(/^\[\[|\]\]$/g, ''))),
        ...links.map(pathKey)
      ]);
      let similar;
      try {
        similar = await api('GET', `/sections/${source.record_id}/similar?k=${opts.k}`);
      } catch (err) {
        if (err.status === 404) return; // unembedded record — nothing to propose
        throw err;
      }
      const candidates = (similar.items ?? [])
        .filter(row => (row.distance ?? 1) <= DISTANCE_CAP)
        .filter(
          row =>
            !row.file_path.includes('/archive/') &&
            row.status !== 'superseded' &&
            row.status !== 'archived'
        )
        .filter(row => !known.has(pathKey(row.file_path)))
        .map(row => ({
          file_path: row.file_path,
          title: row.title,
          type: row.type,
          distance: Math.round(row.distance * 1000) / 1000,
          band: band(row.distance),
          ...(row.agent_summary ? {summary: row.agent_summary} : {})
        }));
      if (candidates.length) items.push({...source, existing_related: related, candidates});
    })
  );
  items.sort((a, b) => a.file_path.localeCompare(b.file_path));

  const worksheet = {
    generated_at: new Date().toISOString(),
    distance_cap: DISTANCE_CAP,
    sources_scanned: batch.length,
    sources_with_candidates: items.length,
    unreviewed_remaining: sources.length - batch.length,
    prior_proposal_notes: proposalFiles,
    items,
    decisions_template: Object.fromEntries(
      items.map(item => [
        item.file_path,
        Object.fromEntries(item.candidates.map(c => [c.file_path, null]))
      ])
    )
  };
  const output = JSON.stringify(worksheet, null, 2);
  if (opts.out) {
    writeFileSync(opts.out, output + '\n');
    console.log(
      `worksheet: ${opts.out} — ${items.length} of ${batch.length} scanned sources have candidates; ${worksheet.unreviewed_remaining} sources still unscanned`
    );
  } else console.log(output);
};

// --- shared decision reading -------------------------------------------------

const readDecisions = worksheet => {
  const raw = JSON.parse(readFileSync(opts.decisions, 'utf8'));
  const decisions = raw && typeof raw === 'object' && raw.decisions ? raw.decisions : raw;
  const bySource = new Map(worksheet.items.map(item => [item.file_path, item]));
  const unknown = Object.keys(decisions).filter(key => !bySource.has(key));
  if (unknown.length)
    fail(3, `decisions reference sources not in the worksheet: ${unknown.join(', ')}`);
  const resolved = [];
  for (const [sourcePath, verdictMap] of Object.entries(decisions)) {
    if (verdictMap === null) continue;
    const item = bySource.get(sourcePath);
    const knownCandidates = new Set(item.candidates.map(c => c.file_path));
    const perSource = {item, accept: [], ambiguous: [], supersede: []};
    for (const [candidate, rawVerdict] of Object.entries(verdictMap)) {
      if (!knownCandidates.has(candidate))
        fail(3, `${sourcePath}: candidate ${candidate} is not in the worksheet`);
      if (rawVerdict === null) continue;
      const verdict = typeof rawVerdict === 'string' ? {verdict: rawVerdict} : rawVerdict;
      if (!VERDICTS.includes(verdict.verdict))
        fail(
          3,
          `${sourcePath} → ${candidate}: unknown verdict "${verdict.verdict}" (valid: ${VERDICTS.join(', ')})`
        );
      const entry = {candidate, reason: verdict.reason ?? ''};
      if (verdict.verdict === 'accept') perSource.accept.push(entry);
      else if (verdict.verdict === 'ambiguous') perSource.ambiguous.push(entry);
      else if (verdict.verdict === 'supersede-candidate') perSource.supersede.push(entry);
    }
    if (perSource.accept.length || perSource.ambiguous.length || perSource.supersede.length)
      resolved.push(perSource);
  }
  return resolved;
};

// --- review: write the proposals note ---------------------------------------

const review = async worksheet => {
  const resolved = readDecisions(worksheet);
  if (!resolved.length) fail(3, 'no accept/ambiguous/supersede verdicts — nothing to write');

  let files = [];
  try {
    files = (await api('GET', '/vault/queries/')).files ?? [];
  } catch {}
  const names = new Set(
    files.map(f => (typeof f === 'string' ? f : (f.name ?? f.path ?? '')).replace(/^queries\//, ''))
  );
  const stem = `${today()}-related-proposals`;
  let name = `${stem}.md`,
    batchN = 1;
  while (names.has(name)) name = `${stem}-${++batchN}.md`;

  const sections = resolved.map(({item, accept, ambiguous, supersede}) => {
    const lines = [`## \`${item.file_path}\``, ''];
    if (accept.length) {
      lines.push('**Add to `related:`**:', '');
      for (const {candidate, reason} of accept)
        lines.push(`- \`[[${pathKey(candidate)}]]\`${reason ? ` — ${reason}` : ''}`);
      lines.push('');
    }
    if (ambiguous.length) {
      lines.push('**Ambiguous (human verdict needed)**:', '');
      for (const {candidate, reason} of ambiguous)
        lines.push(`- \`[[${pathKey(candidate)}]]\`${reason ? ` — ${reason}` : ''}`);
      lines.push('');
    }
    if (supersede.length) {
      lines.push("**Supersession candidates (retire, don't relate)**:", '');
      for (const {candidate, reason} of supersede)
        lines.push(`- \`[[${pathKey(candidate)}]]\`${reason ? ` — ${reason}` : ''}`);
      lines.push('');
    }
    return lines.join('\n');
  });
  const body = `Semantic-NN \`related:\` proposals — reviewed batch of ${worksheet.sources_scanned} sources (distance cap ${worksheet.distance_cap}). Accepts are ready to apply; ambiguous entries need a human verdict; supersession candidates want retirement via supersede semantics, not a related link.\n\n${sections.join('\n')}`;

  const counts = {
    sources: resolved.length,
    accepted: resolved.reduce((n, r) => n + r.accept.length, 0),
    ambiguous: resolved.reduce((n, r) => n + r.ambiguous.length, 0),
    supersession_candidates: resolved.reduce((n, r) => n + r.supersede.length, 0)
  };
  if (opts.dryRun) {
    console.log(
      JSON.stringify({dry_run: true, would_write: `queries/${name}`, ...counts}, null, 2)
    );
    return;
  }
  await api('PUT', `/vault/queries/${name}`, {
    frontmatter: {
      title: `Related-edge proposals — ${today()}${batchN > 1 ? ` batch ${batchN}` : ''}`,
      tags: ['vault', 'related-proposals', 'query'],
      created: today(),
      updated: today(),
      status: 'draft',
      type: 'query', // draft = pending human review ('pending-review' is not in the server's status enum)
      related: [
        '[[projects/vault-storage/queue]]',
        '[[projects/vault-storage/design/embedding-baseline]]'
      ]
    },
    body
  });
  console.log(JSON.stringify({written: `queries/${name}`, ...counts}, null, 2));
};

// --- apply: atomic FM membership patches ------------------------------------

const apply = async worksheet => {
  const resolved = readDecisions(worksheet);
  const patches = resolved.filter(r => r.accept.length);
  if (opts.dryRun) {
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          would_patch: patches.map(({item, accept}) => ({
            source: item.file_path,
            add: accept.map(a => `[[${pathKey(a.candidate)}]]`)
          }))
        },
        null,
        2
      )
    );
    return;
  }
  const report = {applied: [], ambiguous: [], supersession_candidates: [], failures: []};
  for (const {item, ambiguous, supersede} of resolved) {
    for (const {candidate, reason} of ambiguous)
      report.ambiguous.push({source: item.file_path, candidate, reason});
    for (const {candidate, reason} of supersede)
      report.supersession_candidates.push({source: item.file_path, candidate, reason});
  }
  await pool(
    patches.map(({item, accept}) => async () => {
      try {
        await api('PATCH', `/sections/${item.record_id}/fm`, {
          ops: accept.map(({candidate}) => ({
            op: 'add',
            path: '/related',
            value: `[[${pathKey(candidate)}]]`
          }))
        });
        report.applied.push({
          source: item.file_path,
          added: accept.map(a => `[[${pathKey(a.candidate)}]]`)
        });
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        report.failures.push({
          source: item.file_path,
          status: err.status,
          code: err.code,
          message: err.message
        });
      }
    }),
    4
  );
  report.applied.sort((a, b) => a.source.localeCompare(b.source));
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length) process.exit(1);
};

try {
  if (command === 'prepare') await prepare();
  else {
    if (!opts.worksheet || !opts.decisions) fail(2, `${command} needs --worksheet and --decisions`);
    const worksheet = JSON.parse(readFileSync(opts.worksheet, 'utf8'));
    if (command === 'review') await review(worksheet);
    else await apply(worksheet);
  }
} catch (err) {
  if (err instanceof ApiError) fail(1, `${err.status} ${err.code} — ${err.message}`);
  throw err;
}
