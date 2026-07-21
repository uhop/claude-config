#!/usr/bin/env node

// vault-triage — shared mechanical harness for the vault-review-{tags,edges,
// duplicates} skills (skills-restructuring program, filed 2026-07-18). The
// script does the paperwork — list/claim, context gather, stale-path guard,
// batch assembly, resolve, report — and emits a worksheet; the agent does
// only the judgment and hands back a decisions map.
//
//   vault-triage prepare <kind> [--limit=N] [--claim] [--holder=H] [--ttl=S]
//                        [--scan[=MAX_DIST]] [--out=FILE]
//     With --claim and no --out, the worksheet path defaults to a
//     holder-namespaced temp file (collision-proof for concurrent agents).
//   vault-triage resolve <kind> --worksheet=FILE --decisions=FILE
//                        [--label=L] [--dry-run]
//   vault-triage release <kind> --holder=H
//
// kinds: new_tag | tag_suggestion | edge_type | duplicate
//
// Decisions file (JSON; either the bare map or {decisions: {...}}):
//   new_tag        keyed by TAG:  {"action":"taxonomy","description"?} |
//                                 {"action":"alias","canonical":"..."} |
//                                 {"action":"reject"} | null
//   tag_suggestion keyed by id:   "accept" | "reject" | "defer" | null
//   edge_type      keyed by id:   "<edge-type>" | "reject" | "cites" | "skip" | null
//                                 ("cites" = the default is correct = reject)
//   duplicate      keyed by id:   "reject" | "related" | "merge-candidate" |
//                                 {"action":"contradiction","note":"..."} | "skip" | null
// null/skip/defer reopen the claim (when claimed) and leave the item pending.
//
// Exit codes: 0 ok · 1 HTTP/partial failures · 2 usage · 3 decisions rejected
// before any write (unknown id, unknown tag on accept, bad edge type).
// Exits non-zero — run solo or guard with `|| true` in parallel Bash batches.

import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import process from 'node:process';

if (!import.meta.main)
  throw new Error(
    'vault-triage.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const KINDS = ['new_tag', 'tag_suggestion', 'edge_type', 'duplicate'];
const EDGE_TYPES = [
  'supersedes',
  'revises',
  'derived-from',
  'caused-by',
  'fixed-by',
  'rejected-because',
  'applies-to',
  'contradicts',
  'related-to'
];

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

const base = process.env.VAULT_API_URL?.replace(/\/+$/, ''),
  token = process.env.VAULT_API_TOKEN;
if (!base || !token) fail(2, 'VAULT_API_URL and VAULT_API_TOKEN must be set (see ~/.env)');

const usage = `Usage:
  vault-triage prepare <kind> [--limit=N] [--claim] [--holder=H] [--ttl=S] [--scan[=DIST]] [--out=FILE]
  vault-triage resolve <kind> --worksheet=FILE --decisions=FILE [--label=L] [--dry-run]
  vault-triage release <kind> --holder=H
kinds: ${KINDS.join(' | ')}`;

const [command, kind, ...rest] = process.argv.slice(2);
if (command === '--help' || command === '-h' || !command) {
  console.log(usage);
  process.exit(command ? 0 : 2);
}
if (!['prepare', 'resolve', 'release'].includes(command))
  fail(2, `unknown command: ${command}\n${usage}`);
if (!KINDS.includes(kind)) fail(2, `kind must be one of ${KINDS.join(', ')}\n${usage}`);

const opts = {
  limit: 25,
  claim: false,
  holder: null,
  ttl: null,
  scan: null,
  out: null,
  worksheet: null,
  decisions: null,
  label: null,
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
    case '--claim':
      opts.claim = true;
      break;
    case '--holder':
      opts.holder = value;
      break;
    case '--ttl':
      opts.ttl = +value;
      break;
    case '--scan':
      opts.scan = value ? +value : 0.1;
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
    case '--label':
      opts.label = value;
      break;
    case '--dry-run':
      opts.dryRun = true;
      break;
    default:
      fail(2, `unknown option: ${arg}\n${usage}`);
  }
}
if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 100)
  fail(2, '--limit must be 1..100');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const api = async (method, path, body) => {
  const response = await fetch(`${base}${path}`, {
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
      json?.error ?? `${response.status} ${response.statusText} on ${method} ${path}`
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

const brief = (context, id) => {
  const record = context?.records?.[id];
  if (!record) return {record_id: id, record_missing: true};
  return {
    record_id: id,
    file_path: record.file_path,
    title: record.title,
    type: record.type,
    status: record.status,
    updated: record.updated,
    summary: record.summary
  };
};

// payload paths are captured at filing time; a mismatch vs the live brief is
// the 2026-07-12 ghost-resurrection hazard — writes must use the current path
const moved = (payloadPath, briefRecord) =>
  briefRecord.file_path && payloadPath !== briefRecord.file_path
    ? {from: payloadPath, to: briefRecord.file_path}
    : undefined;

const bodyHead = async path => {
  try {
    const text = await api('GET', `/vault/${path}`);
    const start =
      typeof text === 'string' && text.startsWith('---\n') ? text.indexOf('\n---\n', 4) + 5 : 0;
    const head = String(text).slice(start).trimStart();
    const lines = head.split('\n').slice(0, 30).join('\n');
    return lines.length > 1500 ? lines.slice(0, 1500) + '…' : lines;
  } catch (err) {
    return `<unreadable: ${err.message}>`;
  }
};

const stripWikilink = s => s.replace(/^\[\[/, '').replace(/\]\]$/, '');
const pathKey = p => p.replace(/\.md$/, '');

// --- prepare -----------------------------------------------------------------

const prepare = async () => {
  if (opts.scan !== null) {
    if (kind !== 'duplicate') fail(2, '--scan only applies to duplicate');
    const scan = await api('POST', `/maintenance/find-duplicates?max_distance=${opts.scan}`);
    console.error(`scan: ${JSON.stringify(scan)}`);
  }

  let items,
    holder = null,
    claimed = false,
    totalPending;
  if (opts.claim) {
    holder =
      opts.holder ??
      `triage-${kind}-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`;
    const response = await api('POST', '/suggestions/claim?expand=context', {
      kind,
      holder,
      limit: opts.limit,
      ...(opts.ttl ? {ttl_seconds: opts.ttl} : {})
    });
    items = response.items;
    claimed = response.claimed > 0;
    totalPending = response.remaining_pending + response.claimed;
  } else {
    const response = await api(
      'GET',
      `/suggestions?kind=${kind}&status=pending&limit=${opts.limit}&expand=context`
    );
    items = response.items;
    totalPending = response.total;
  }

  // With --claim, default the worksheet path to a holder-namespaced temp file so
  // concurrent sub-agents can't clobber each other: the harness pushes every
  // sibling to one shared session scratchpad, so any fixed filename collides by
  // construction, while the holder is unique per agent (CLAUDE.md § Scratch files).
  if (opts.claim && !opts.out && holder) {
    const safe = holder.replace(/[^a-zA-Z0-9._-]/g, '_');
    opts.out = join(tmpdir(), `vault-triage-${safe}.json`);
  }

  const worksheet = {
    kind,
    generated_at: new Date().toISOString(),
    claimed,
    holder: claimed ? holder : null,
    total_pending: totalPending,
    items: [],
    decisions_template: {}
  };

  if (kind === 'new_tag') {
    const groups = new Map();
    for (const item of items) {
      const tag = item.payload.tag;
      if (!groups.has(tag))
        groups.set(tag, {tag, taxonomy: item.context?.tag ?? null, records: []});
      const record = brief(item.context, item.payload.record_id);
      groups.get(tag).records.push({
        suggestion_id: item.id,
        ...record,
        ...(record.file_path ? {path_moved: moved(item.payload.file_path, record)} : {})
      });
    }
    const neighborJobs = [...groups.values()].map(group => async () => {
      const prefix = encodeURIComponent(group.tag.slice(0, 3));
      const response = await api('GET', `/tags?prefix=${prefix}&limit=10`);
      group.neighbors = response.items;
      group.count = group.records.length;
    });
    await pool(neighborJobs);
    worksheet.items = [...groups.values()];
    for (const group of worksheet.items) worksheet.decisions_template[group.tag] = null;
  } else if (kind === 'tag_suggestion') {
    worksheet.items = items.map(item => {
      const record = brief(item.context, item.payload.record_id);
      return {
        id: item.id,
        tag: item.payload.tag,
        in_taxonomy: item.context?.tag?.in_taxonomy ?? null,
        canonical: item.context?.tag?.canonical,
        tag_description: item.context?.tag?.description,
        record: {
          ...record,
          ...(record.file_path ? {path_moved: moved(item.payload.file_path, record)} : {})
        }
      };
    });
    for (const item of worksheet.items) worksheet.decisions_template[item.id] = null;
  } else if (kind === 'edge_type') {
    worksheet.items = items.map(item => {
      const from = brief(item.context, item.payload.from_record);
      const to = brief(item.context, item.payload.to_record);
      return {
        id: item.id,
        snippet: item.payload.context,
        from: {
          ...from,
          ...(from.file_path ? {path_moved: moved(item.payload.from_path, from)} : {})
        },
        to: {...to, ...(to.file_path ? {path_moved: moved(item.payload.to_path, to)} : {})},
        to_path: item.payload.to_path
      };
    });
    // agent.edge_classifications is an authoritative prior (vault-review-edges,
    // 2026-05-01 eval) — fetch once per source record and match the target
    const sources = [
      ...new Set(worksheet.items.filter(i => !i.from.record_missing).map(i => i.from.record_id))
    ];
    const fmMaps = new Map();
    await pool(
      sources.map(id => async () => {
        try {
          const response = await api('GET', `/sections/${id}/fm?exclude=body`);
          fmMaps.set(id, response.frontmatter?.agent?.edge_classifications ?? {});
        } catch {
          fmMaps.set(id, {});
        }
      })
    );
    for (const item of worksheet.items) {
      const classifications = fmMaps.get(item.from.record_id) ?? {};
      const want = pathKey(item.to_path);
      for (const [key, type] of Object.entries(classifications)) {
        const got = pathKey(stripWikilink(key));
        if (got === want || got.split('/').pop() === want.split('/').pop()) {
          item.prior = type;
          break;
        }
      }
      worksheet.decisions_template[item.id] = null;
    }
  } else {
    worksheet.items = await pool(
      items.map(item => async () => {
        const a = brief(item.context, item.payload.a_record);
        const b = brief(item.context, item.payload.b_record);
        return {
          id: item.id,
          distance: item.payload.distance,
          a: {
            ...a,
            ...(a.file_path
              ? {path_moved: moved(item.payload.a_path, a), body_head: await bodyHead(a.file_path)}
              : {})
          },
          b: {
            ...b,
            ...(b.file_path
              ? {path_moved: moved(item.payload.b_path, b), body_head: await bodyHead(b.file_path)}
              : {})
          }
        };
      })
    );
    for (const item of worksheet.items) worksheet.decisions_template[item.id] = null;
  }

  const output = JSON.stringify(worksheet, null, 2);
  if (opts.out) {
    writeFileSync(opts.out, output + '\n');
    console.log(
      `worksheet: ${opts.out} — ${worksheet.items.length} item(s), ${totalPending} pending total${claimed ? `, claimed by ${holder}` : ''}`
    );
  } else console.log(output);
};

// --- resolve -----------------------------------------------------------------

const readDecisions = () => {
  const raw = JSON.parse(readFileSync(opts.decisions, 'utf8'));
  return raw && typeof raw === 'object' && !Array.isArray(raw) && raw.decisions
    ? raw.decisions
    : raw;
};

const isSkip = decision =>
  decision === null || decision === undefined || decision === 'skip' || decision === 'defer';

const resolve = async () => {
  if (!opts.worksheet || !opts.decisions) fail(2, 'resolve needs --worksheet and --decisions');
  const worksheet = JSON.parse(readFileSync(opts.worksheet, 'utf8'));
  if (worksheet.kind !== kind) fail(3, `worksheet is for kind ${worksheet.kind}, not ${kind}`);
  const decisions = readDecisions();
  const label =
    worksheet.holder ?? opts.label ?? `vault-triage-${new Date().toISOString().slice(0, 10)}`;

  const keys =
    kind === 'new_tag'
      ? new Map(worksheet.items.map(item => [item.tag, item]))
      : new Map(worksheet.items.map(item => [item.id, item]));
  const unknown = Object.keys(decisions).filter(key => !keys.has(key));
  if (unknown.length)
    fail(3, `decisions reference keys not in the worksheet: ${unknown.join(', ')}`);

  // validate everything before the first write — a rejected decisions file
  // must leave the queue untouched
  const plan = {
    batch: [],
    reopen: [],
    tagOps: [],
    fmPatches: [],
    report: {
      kind,
      resolved_by: label,
      accepted: 0,
      rejected: 0,
      skipped: 0,
      failures: [],
      taxonomy_added: [],
      aliased: [],
      tags_stripped: [],
      related_added: [],
      merge_candidates: [],
      contradictions: []
    }
  };

  const skipItem = item => {
    ++plan.report.skipped;
    if (worksheet.claimed)
      plan.reopen.push(
        ...(kind === 'new_tag' ? item.records.map(r => r.suggestion_id) : [item.id])
      );
  };

  if (kind === 'new_tag') {
    for (const [tag, item] of keys) {
      const decision = decisions[tag];
      if (isSkip(decision)) {
        skipItem(item);
        continue;
      }
      const action = decision.action;
      if (action === 'taxonomy')
        plan.tagOps.push({kind: 'taxonomy', tag, description: decision.description, item});
      else if (action === 'alias') {
        if (!decision.canonical) fail(3, `alias decision for "${tag}" needs a canonical`);
        plan.tagOps.push({kind: 'alias', tag, canonical: decision.canonical, item});
      } else if (action === 'reject') plan.tagOps.push({kind: 'reject', tag, item});
      else fail(3, `unknown action "${action}" for tag "${tag}"`);
    }
  } else if (kind === 'tag_suggestion') {
    const blocked = [];
    for (const [id, item] of keys) {
      const decision = decisions[id];
      if (isSkip(decision)) {
        skipItem(item);
        continue;
      }
      if (decision === 'accept') {
        if (item.in_taxonomy === false && !item.canonical) blocked.push(`${id} (${item.tag})`);
        plan.batch.push({id, decision: 'accept'});
      } else if (decision === 'reject') plan.batch.push({id, decision: 'reject'});
      else fail(3, `unknown decision "${decision}" for ${id}`);
    }
    if (blocked.length)
      fail(
        3,
        `accepting tags not in the taxonomy — add via the new_tag flow first, or defer:\n  ${blocked.join('\n  ')}`
      );
  } else if (kind === 'edge_type') {
    for (const [id, item] of keys) {
      const decision = decisions[id];
      if (isSkip(decision)) {
        skipItem(item);
        continue;
      }
      if (decision === 'reject' || decision === 'cites') plan.batch.push({id, decision: 'reject'});
      else if (EDGE_TYPES.includes(decision))
        plan.batch.push({id, decision: 'accept', edge_type: decision});
      else
        fail(
          3,
          `unknown edge decision "${decision}" for ${id} (valid: ${EDGE_TYPES.join(', ')}, reject, cites, skip)`
        );
    }
  } else {
    for (const [id, item] of keys) {
      const decision = decisions[id];
      if (isSkip(decision)) {
        skipItem(item);
        continue;
      }
      if (decision === 'merge-candidate') {
        plan.report.merge_candidates.push({
          id,
          a: item.a.file_path,
          b: item.b.file_path,
          distance: item.distance
        });
        skipItem(item);
        --plan.report.skipped;
      } else if (decision === 'reject') plan.batch.push({id, decision: 'reject'});
      else if (decision === 'related') {
        if (item.a.record_missing || item.b.record_missing)
          fail(3, `related decision for ${id}: a record no longer exists`);
        plan.fmPatches.push({
          record: item.a.record_id,
          value: `[[${pathKey(item.b.file_path)}]]`,
          id
        });
        plan.fmPatches.push({
          record: item.b.record_id,
          value: `[[${pathKey(item.a.file_path)}]]`,
          id
        });
        plan.batch.push({id, decision: 'accept'});
        plan.report.related_added.push({a: item.a.file_path, b: item.b.file_path});
      } else if (decision?.action === 'contradiction') {
        plan.batch.push({id, decision: 'reject'});
        plan.report.contradictions.push({
          id,
          a: item.a.file_path,
          b: item.b.file_path,
          note: decision.note ?? ''
        });
      } else fail(3, `unknown decision ${JSON.stringify(decision)} for ${id}`);
    }
  }

  if (opts.dryRun) {
    console.log(JSON.stringify({dry_run: true, ...plan, report: undefined}, null, 2));
    return;
  }

  const failure = (where, err) =>
    plan.report.failures.push({where, status: err.status, code: err.code, message: err.message});

  for (const op of plan.tagOps) {
    const ids = op.item.records.map(r => r.suggestion_id);
    try {
      if (op.kind === 'taxonomy' || op.kind === 'alias') {
        try {
          const response =
            op.kind === 'taxonomy'
              ? await api('POST', '/tags/taxonomy', {
                  tag: op.tag,
                  ...(op.description ? {description: op.description} : {})
                })
              : await api('POST', '/tags/aliases', {alias: op.tag, canonical: op.canonical});
          (op.kind === 'taxonomy' ? plan.report.taxonomy_added : plan.report.aliased).push({
            tag: op.tag,
            ...(op.canonical ? {canonical: op.canonical} : {}),
            linked: response.linked,
            auto_accepted: response.accepted
          });
          plan.report.accepted += response.accepted;
        } catch (err) {
          if (err.code !== 'conflict') throw err;
          // already in the taxonomy — the add auto-accept won't fire, settle explicitly
          plan.batch.push(...ids.map(id => ({id, decision: 'accept'})));
        }
      } else {
        for (const record of op.item.records) {
          if (record.record_missing) continue;
          const response = await api(
            'DELETE',
            `/sections/${record.record_id}/tags/${encodeURIComponent(op.tag)}`
          );
          plan.report.tags_stripped.push({
            tag: op.tag,
            record: record.file_path,
            remaining: response.tags
          });
        }
        plan.batch.push(...ids.map(id => ({id, decision: 'reject'})));
      }
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      failure(`${op.kind}:${op.tag}`, err);
    }
  }

  for (const patch of plan.fmPatches) {
    try {
      await api('PATCH', `/sections/${patch.record}/fm`, {
        ops: [{op: 'add', path: '/related', value: patch.value}]
      });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      failure(`related:${patch.id}`, err);
      plan.batch = plan.batch.filter(entry => entry.id !== patch.id);
      ++plan.report.skipped;
    }
  }

  for (let i = 0; i < plan.batch.length; i += 100) {
    const items = plan.batch.slice(i, i + 100);
    try {
      const response = await api('POST', '/suggestions/resolve-batch', {resolved_by: label, items});
      plan.report.accepted += response.accepted;
      plan.report.rejected += response.rejected;
      for (const result of response.results)
        if (result.error) failure(`resolve:${result.id}`, {status: 200, ...result.error});
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      failure('resolve-batch', err);
    }
  }

  for (const id of plan.reopen) {
    try {
      await api('POST', `/suggestions/${id}/reopen`);
    } catch (err) {
      if (!(err instanceof ApiError) || err.code === 'already_pending') continue;
      failure(`reopen:${id}`, err);
    }
  }

  console.log(JSON.stringify(plan.report, null, 2));
  if (plan.report.failures.length) process.exit(1);
};

// --- release -----------------------------------------------------------------

const release = async () => {
  if (!opts.holder) fail(2, 'release needs --holder');
  const response = await api('GET', `/suggestions?kind=${kind}&status=claimed&limit=100`);
  const mine = response.items.filter(item => item.claimed_by === opts.holder);
  let released = 0;
  for (const item of mine) {
    try {
      await api('POST', `/suggestions/${item.id}/reopen`);
      ++released;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
  }
  console.log(`released ${released} of ${mine.length} claimed by ${opts.holder}`);
};

try {
  if (command === 'prepare') await prepare();
  else if (command === 'resolve') await resolve();
  else await release();
} catch (err) {
  if (err instanceof ApiError) fail(1, `${err.status} ${err.code} — ${err.message}`);
  throw err;
}
