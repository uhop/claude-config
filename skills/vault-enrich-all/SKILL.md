---
name: vault-enrich-all
description: "Generate or refresh agent-derived frontmatter enrichment (summary, key_concepts, tags_suggested, related_proposed, edge_classifications, complexity) for vault notes. Writes a namespaced `agent:` block per note that the indexer / chunker / embedder consume for HyDE-style retrieval augmentation. Mechanical work (server-worklist pull, per-note context gather, validated JSON writes with If-Match + current-path resolution) runs through the bundled `enrich-batch.mjs`; the skill is the judgment layer — the enrichment content itself. Use when the user says /vault-enrich-all, asks to backfill summaries / concept tags, or wants to densify the agent-derived metadata layer. Per design `[[projects/vault-storage/design/agent-frontmatter-enrichment]]`."
user_invocable: true
---

# Vault — agent-driven frontmatter enrichment

For each vault note, generate a namespaced `agent:` block in the frontmatter:
a 1-2 sentence summary, 3-5 key concepts, tag/related-link proposals,
edge-type classifications for body wikilinks, and a complexity label.
Hash-gated invalidation keeps the block fresh on body changes. The block
lives in the source markdown (C4: file is source of truth) and is a
load-bearing index-time input — see § Server-side integration.

## Invocation

```
/vault-enrich-all                       # enrich the next 30 unenriched enrichable notes
/vault-enrich-all --limit=N             # custom batch (1..200)
/vault-enrich-all --stale               # refresh drifted blocks instead of backfilling new
/vault-enrich-all --type=permanent      # restrict to ONE record type (default: full enrichable set)
/vault-enrich-all --auto [--limit=N]    # Sonnet sub-agent for bulk
```

## Enrichable set

The canonical definition lives in **vault-storage, not here**: `ENRICHABLE_TYPES`
in the server's lint handler (currently `permanent`, `project`, `design`,
`research`, `query`), surfaced live by `GET /system/lint` →
`coverage.enrichment` with the authoritative `unenriched_records` worklist
(2026-07-09+). The harness reads it from the server; hand-rolled client-side
enumeration is what caused the 2026-06-30 scope gaps (an `archived_at` filter
let 177 archived notes through; a skill-side `type=permanent` scan diverged
from the server). On a pre-worklist server, the fallback enumeration +
reconciliation procedure lives in this file's git history.

## Workflow

```bash
E=~/.claude/skills/vault-enrich-all/enrich-batch.mjs
W=$(mktemp -d)

# 1. prepare — server worklist + per-note context → worksheet
"$E" prepare --limit=30 --out="$W/ws.json"          # missing blocks (add --type=T to narrow)
"$E" prepare --stale --out="$W/ws.json"             # drifted blocks (from the suggestions queue)
"$E" prepare --records="$W/chunk.txt" --out="$W/ws.json"   # explicit shard (paths or ids, one per line)

# 2. judge — write the enrichment content per note (see § Generate enrichment fields)
#    (start from .enrichments_template; null = skip)

# 3. apply — validates everything first, then JSON-PUTs each block
"$E" apply --worksheet="$W/ws.json" --enrichments="$W/enr.json"
```

Each worksheet item carries the note's `body`, `title`, `type`,
`existing_tags` / `existing_related`, the extracted `body_wikilinks` (the
exact keys `edge_classifications` may use), pre-filtered `related_candidates`
(embedding neighbours at distance ≤ 0.30, minus links the note already has),
and — in `--stale` mode — the `current_agent` block to refresh rather than
recreate. The worksheet header carries the full tag taxonomy (for
`tags_suggested` discipline) and the coverage counts; empty-body notes are
excluded and listed under `needs_a_body`.

`apply` rejects the whole file before any write (exit 3) on unknown paths,
short summaries, bad `complexity`, non-wikilink `edge_classifications` keys,
or invalid edge types. Writes go through the JSON path (the only sanctioned
FM write path — `agent.summary` colon-space prose breaks the markdown path's
YAML parser) with `derived_from_hash: "auto"` (the server stamps the body
hash + `derived_at`; the wrong-hash class is dead at the source), `If-Match`
round-trips with one 412 retry, and **current-path resolution** per record
(writing to a stale worksheet path resurrects ghost records — 2026-07-12).
Stale rows need no explicit resolution: the reindex settles their suggestion
as `resolved_by='hash-matched'`. Exit 0 ok · 1 partial failures. Run solo or
`|| true` in parallel Bash batches.

## Per-note `agent:` block shape

```yaml
agent:
  derived_at: 2026-04-30T22:00:00Z            # server-stamped
  derived_from_hash: "<body_hash>"            # server-stamped from the "auto" sentinel
  summary: "<1-2 sentences capturing the note's core claim and scope>"
  key_concepts: [concept-1, concept-2, concept-3]
  tags_suggested: [proposed-tag-1]            # candidates for top-level tags:
  related_proposed: ["[[other-note]]"]        # candidates for top-level related:
  edge_classifications:                       # body wikilinks → edge types
    "[[some-page]]": derived-from
  complexity: prose      # prose | code-heavy | tabular | mixed | hub | log-entry
```

Top-level user-authored frontmatter (`title`, `tags`, `related`, `status`,
`type`, `priority`, `edges`) is never touched — the agent writes only inside
its `agent:` namespace (the harness sends only that key; the server's
shallow merge preserves the rest; the `agent` map itself is replaced
wholesale per write).

## Generate enrichment fields

- **`summary`**: 1-2 sentences, ~40-80 words. Lead with the note's core
  claim or scope; don't restate the title. **Mention the concrete name AND
  the abstract pattern** — the 2026-05-01 A/B
  ([[projects/vault-storage/design/embedding-baseline-summary-query-ab]])
  showed a summary that abstracted away the concrete failure signature
  crashed retrieval rank from 20 to 47; keep both layers in one sentence.
- **`key_concepts`**: 3-5 lowercase hyphen-separated noun-phrases the note
  hangs on — retrieval anchors, not necessarily taxonomy tags.
- **`tags_suggested`**: only tags already in the worksheet's `taxonomy`
  list OR clearly worth adding; skip when uncertain — freeform proposals
  just become typo queue-items.
- **`related_proposed`**: judge each entry of the worksheet's
  `related_candidates`; propose only genuine semantic kin (conservative on
  ambiguous).
- **`edge_classifications`**: classify only the worksheet's
  `body_wikilinks`, and only where keyword cues support a type; the
  classifier's runtime default is `cites`, and this field is an advisory
  prior for `/vault-review-edges`, not the runtime truth.
- **`complexity`**: `prose`, `code-heavy`, `tabular`, `mixed`, `hub` (a
  note that's mostly wikilinks), or `log-entry`.

**Empty bodies are reported, never enriched** — the harness excludes them
(`needs_a_body`); the 2026-06-20 campaign wrote meaningless blocks on 7
stubs and every one had to be stripped. Whether to write content or leave
the scaffold empty is the user's call.

## Report summary

```
Enriched N notes: <new> new, <stale> refreshed, <skipped> skipped,
  needs a body: <paths>, errors: <count>
<remaining> still unenriched — re-run /vault-enrich-all for the next batch.
```

(`written` / `needs_a_body` / `failures` come straight from the apply
report; `remaining` from the next prepare's coverage line.)

## Sub-agent mode (`--auto`)

**Model: Sonnet.** Per [[topics/sub-agent-model-selection-by-task-shape]]:
the 2026-05-01 wave-1 Haiku run was 33% malformed output and 100% wrong-hash
on the corrective instruction; the harness has since removed the YAML and
hash surfaces entirely, but per-note summary quality still needs multi-step
reasoning — the quality bar above is the judgment that remains.

```
subagent_type: general-purpose
model: sonnet
description: Enrich N vault notes with agent: blocks
prompt: |
  Read ~/.claude/skills/vault-enrich-all/SKILL.md. Using the enrich-batch
  harness exactly as its Workflow section shows: prepare (add --stale if
  requested; --limit $LIMIT), write the enrichment content for every
  worksheet item per § Generate enrichment fields (its quality bar and
  biases are binding; null = skip only for notes you cannot judge), apply.
  The harness prints the worksheet to stdout — don't redirect it to a fixed
  scratchpad filename; if you must write it to a file, namespace the name
  uniquely (sibling agents share one scratchpad).
  Return: the apply report plus a one-paragraph summary.
```

### Sharded dispatch (used by `/vault sweep`)

For large backfills run ≤4 concurrent sub-agents on **disjoint** chunks:
split the worksheet-independent worklist (`prepare`'s coverage or the
`unenriched_records` list) into ~50-record chunks, write each chunk's
`file_path` list to a file, and give each agent `prepare
--records=<chunk-file>` — the explicit shard replaces self-enumeration, so
two agents can never claim the same records. `--stale` stays a single agent
(its worklist comes from the shared suggestions queue head). Concurrent
writers are server-safe (atomic writes + `If-Match`, 2026-06-11).

## When this is the right tool

- Backfilling enrichment after a vault-storage deploy (one-shot).
- Refreshing notes after material body edits (`--stale`).
- Periodic densification of recent ingest output. (New notes should be
  **born enriched** instead — `/vault ingest` step 5 and `/vault log`
  write the block in the same PUT, using this file's § Per-note `agent:`
  block shape + § Generate enrichment fields.)

## Server-side integration (shipped)

As of vault-storage schema 5/6 the indexer fully consumes the block:
`records.agent_summary` / `agent_derived_from_hash` columns; the hash wraps
into `embedInputHash` so summary changes invalidate chunks like body edits;
the chunker prepends `${summary}\n\n` to every chunk as a HyDE-style
anchor; hash drift files `agent_enrichment_stale`, auto-resolved
`hash-matched` on the next refresh.

## Backend requirement

vault-storage on `:8123` (`VAULT_API_URL`/`VAULT_API_TOKEN` in `~/.env`).
The harness needs `coverage.enrichment.unenriched_records` (2026-07-09+);
older-server fallback enumeration lives in this file's git history.
