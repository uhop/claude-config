#!/usr/bin/env node

// vault-sweep — deterministic control plane for /vault sweep (skills-
// restructuring program, filed 2026-07-18). The script owns every count,
// baseline, stage-DAG step, pass loop, stuck floor, and convergence round —
// the failure surface of the old hand-run procedure (remembered counts,
// pagination-by-requested-limit, floors tracked in prose). The agent's loop
// is: `begin` → dispatch the sub-agents the plan names → `next` → repeat
// until {status: "done"}. Judgment lives inside the dispatched sub-agents.
//
//   vault-sweep begin --state=FILE [--include=k,k] [--exclude=k,k]
//                     [--max-passes=N] [--max-rounds=N] [--dry-run]
//   vault-sweep next  --state=FILE
//
// Stage DAG (data-flow constraints — see the /vault skill § Ordering):
//   0 one-shots: cleanup-lint ∥ embed-pending   (run by this script)
//   1 enrich_backfill ∥ enrich_stale
//   2 new_tag
//   3 tag_suggestion ∥ edge_type
//   4 duplicate
//   5 compaction_candidate
//
// Exit 0 (plans and done are both success) · 1 HTTP failure · 2 usage.

import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

if (!import.meta.main)
  throw new Error(
    'vault-sweep.mjs is a CLI entry point, not a module — run it, do not import it (importing executes it). To check it loads, use `node --check`.'
  );

const STAGES = [
  ['enrich_backfill', 'enrich_stale'],
  ['new_tag'],
  ['tag_suggestion', 'edge_type'],
  ['duplicate'],
  ['compaction_candidate']
];
const ALL_KINDS = STAGES.flat();
const ALIASES = {
  coverage: 'enrich_backfill',
  enrichment: 'enrich_backfill',
  agent_enrichment_stale: 'enrich_stale'
};
const SKILL_FOR = {
  enrich_backfill: 'vault-enrich-all',
  enrich_stale: 'vault-enrich-all',
  new_tag: 'vault-review-tags',
  tag_suggestion: 'vault-review-tags',
  edge_type: 'vault-review-edges',
  duplicate: 'vault-review-duplicates',
  compaction_candidate: 'vault-compact'
};

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

const base = process.env.VAULT_API_URL?.replace(/\/+$/, ''),
  token = process.env.VAULT_API_TOKEN;
if (!base || !token) fail(2, 'VAULT_API_URL and VAULT_API_TOKEN must be set (see ~/.env)');

const usage = `Usage:
  vault-sweep begin --state=FILE [--include=k,k] [--exclude=k,k] [--max-passes=N] [--max-rounds=N] [--dry-run]
  vault-sweep next  --state=FILE
kinds: ${ALL_KINDS.join(' | ')}`;

const [command, ...rest] = process.argv.slice(2);
if (!['begin', 'next'].includes(command))
  fail(command === '--help' || command === '-h' ? 0 : 2, usage);

const opts = {state: null, include: null, exclude: [], maxPasses: 5, maxRounds: 5, dryRun: false};
for (const arg of rest) {
  const [flag, value] = arg.includes('=')
    ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
    : [arg, null];
  const kinds = () => value.split(',').map(k => ALIASES[k.trim()] ?? k.trim());
  switch (flag) {
    case '--state':
      opts.state = value;
      break;
    case '--include':
      opts.include = kinds();
      break;
    case '--exclude':
      opts.exclude = kinds();
      break;
    case '--max-passes':
      opts.maxPasses = +value;
      break;
    case '--max-rounds':
      opts.maxRounds = +value;
      break;
    case '--dry-run':
      opts.dryRun = true;
      break;
    case '--include-destructive':
      break; // retired 2026-07-13 — accepted and ignored
    default:
      fail(2, `unknown option: ${arg}\n${usage}`);
  }
}
if (!opts.state && !opts.dryRun)
  fail(2, '--state=FILE is required (holds the sweep state machine)');
for (const k of [...(opts.include ?? []), ...opts.exclude])
  if (!ALL_KINDS.includes(k)) fail(2, `unknown kind: ${k}\n${usage}`);

const api = async (method, apiPath) => {
  const response = await fetch(`${base}${apiPath}`, {
    method,
    headers: {Authorization: `Bearer ${token}`}
  });
  const text = await response.text();
  if (!response.ok) fail(1, `${response.status} on ${method} ${apiPath} — ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// MANDATORY live reads — never a remembered count (2026-07-12 ghost lesson)
const measure = async () => {
  const [lint, summary] = await Promise.all([
    api('GET', '/system/lint'),
    api('GET', '/suggestions/summary')
  ]);
  const by = summary.by_kind ?? {};
  return {
    counts: {
      enrich_backfill: lint.coverage?.enrichment?.unenriched ?? 0,
      enrich_stale: by.agent_enrichment_stale ?? 0,
      new_tag: by.new_tag ?? 0,
      tag_suggestion: by.tag_suggestion ?? 0,
      edge_type: by.edge_type ?? 0,
      duplicate: by.duplicate ?? 0,
      compaction_candidate: by.compaction_candidate ?? 0
    },
    worklist: lint.coverage?.enrichment?.unenriched_records ?? []
  };
};

const actionSet = () => {
  const set = opts.include ?? ALL_KINDS;
  return set.filter(k => !opts.exclude.includes(k));
};

const holderFor = (state, kind, i) =>
  `sweep-${state.started.slice(0, 10)}-${kind}-r${state.round}p${state.passes[kind]}${i > 0 ? `-${i}` : ''}`;

const buildDispatch = async (state, kind, count, worklist) => {
  ++state.passes[kind] || (state.passes[kind] = 1);
  const entry = {kind, count, skill: SKILL_FOR[kind], agents: []};
  if (kind === 'enrich_backfill') {
    if (count > 100 && worklist.length) {
      const chunkSize = 50,
        maxAgents = 4;
      const chunks = [];
      for (let i = 0; i < worklist.length && chunks.length < maxAgents; i += chunkSize)
        chunks.push(worklist.slice(i, i + chunkSize));
      const dir = path.dirname(path.resolve(state.file));
      chunks.forEach((chunk, i) => {
        const file = path.join(dir, `sweep-chunk-r${state.round}p${state.passes[kind]}-${i}.txt`);
        writeFileSync(file, chunk.map(r => r.file_path).join('\n') + '\n');
        entry.agents.push({mode: 'backfill', records_file: file, records: chunk.length});
      });
    } else entry.agents.push({mode: 'backfill', limit: 100});
  } else if (kind === 'enrich_stale') {
    entry.agents.push({mode: 'stale', limit: 100});
  } else if (kind === 'compaction_candidate') {
    const pending = await api(
      'GET',
      '/suggestions?kind=compaction_candidate&status=pending&limit=100'
    );
    entry.candidates = pending.items.map(item => item.payload);
  } else {
    const shards = Math.min(4, Math.ceil(count / 100));
    for (let i = 0; i < shards; ++i)
      entry.agents.push({triage_kind: kind, holder: holderFor(state, kind, i), limit: 100});
  }
  return entry;
};

const drainable = (state, counts) =>
  actionSet().filter(
    kind => counts[kind] > 0 && (!(kind in state.floors) || counts[kind] > state.floors[kind])
  );

const emit = value => console.log(JSON.stringify(value, null, 2));
const saveState = state => writeFileSync(state.file, JSON.stringify(state, null, 2) + '\n');

// advance through stages; returns a plan, or null when the round is complete
const plan = async (state, counts, worklist) => {
  while (state.stage < STAGES.length) {
    const active = [];
    for (const kind of STAGES[state.stage]) {
      if (!actionSet().includes(kind) || counts[kind] === 0) continue;
      if (kind in state.floors && counts[kind] <= state.floors[kind]) continue;
      if ((state.passes[kind] ?? 0) >= state.maxPasses) continue;
      active.push(kind);
    }
    if (active.length) {
      const dispatch = [];
      for (const kind of active)
        dispatch.push(await buildDispatch(state, kind, counts[kind], worklist));
      state.pending = active;
      return {status: 'dispatch', round: state.round, stage: state.stage + 1, dispatch};
    }
    ++state.stage;
  }
  return null;
};

const endOfRound = (state, counts) => {
  const round = state.trail[state.trail.length - 1];
  round.after = {...counts};
  const noChange = ALL_KINDS.every(k => round.before[k] === round.after[k]);
  const residue = drainable(state, counts);
  if (!residue.length || state.round >= state.maxRounds || noChange) {
    return {
      status: 'done',
      reason: !residue.length ? 'converged' : noChange ? 'no_change_round' : 'max_rounds',
      rounds: state.trail,
      floors: state.floors,
      residue: Object.fromEntries(ALL_KINDS.filter(k => counts[k] > 0).map(k => [k, counts[k]])),
      one_shots: state.one_shots
    };
  }
  ++state.round;
  state.stage = 0;
  state.passes = {};
  state.trail.push({round: state.round, before: {...counts}});
  return null;
};

if (command === 'begin') {
  const {counts, worklist} = await measure();
  if (opts.dryRun) {
    emit({
      dry_run: true,
      action_set: actionSet(),
      counts,
      would_run: actionSet().filter(k => counts[k] > 0)
    });
    process.exit(0);
  }
  const oneShots = {};
  [oneShots.cleanup_lint, oneShots.embed_pending] = await Promise.all([
    api('POST', '/maintenance/cleanup-lint'),
    api('POST', '/maintenance/embed-pending')
  ]);
  const state = {
    file: opts.state,
    started: new Date().toISOString(),
    include: opts.include,
    exclude: opts.exclude,
    maxPasses: opts.maxPasses,
    maxRounds: opts.maxRounds,
    round: 1,
    stage: 0,
    passes: {},
    floors: {},
    pending: [],
    one_shots: oneShots,
    trail: [{round: 1, before: {...counts}}]
  };
  const result =
    (await plan(state, counts, worklist)) ??
    endOfRound(state, counts) ??
    (await plan(state, (await measure()).counts, worklist));
  saveState(state);
  emit(result);
} else {
  const state = JSON.parse(readFileSync(opts.state, 'utf8'));
  opts.include = state.include;
  opts.exclude = state.exclude;
  const {counts, worklist} = await measure();
  // progress evaluation for the kinds the last plan dispatched: a count that
  // stopped dropping is a stuck floor; a later count above it reopens the kind
  for (const kind of state.pending ?? []) {
    const before = state.trail[state.trail.length - 1].before[kind];
    const last = state.lastCounts?.[kind] ?? before;
    if (counts[kind] > 0 && counts[kind] >= last) state.floors[kind] = counts[kind];
    else if (kind in state.floors && counts[kind] > state.floors[kind]) delete state.floors[kind];
  }
  state.lastCounts = {...counts};
  state.pending = [];
  let result = await plan(state, counts, worklist);
  if (!result) {
    result = endOfRound(state, counts);
    if (!result) result = await plan(state, counts, worklist);
    if (!result) result = endOfRound(state, counts); // next round had nothing dispatchable
  }
  saveState(state);
  emit(result);
}
