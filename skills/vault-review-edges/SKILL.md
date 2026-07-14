---
name: vault-review-edges
description: Triage pending `edge_type` suggestions in the vault — promote default `cites` body wikilinks to a more specific edge type (derived-from, applies-to, supersedes, etc.) by editing the source record's frontmatter `edges:` map, or confirm `cites` is correct and reject the suggestion. Backed by `GET /suggestions?kind=edge_type&status=pending` (or `POST /suggestions/claim` when running concurrently) and `POST /suggestions/resolve-batch`, which writes the FM `edges:` override server-side. Use when the user says /vault-review-edges, asks to triage / clean up the typed-edge graph, or wants to chip away at the classifier's review queue. Requires vault-storage (`:8123`) — the suggestion-filing logic is server-side.
user_invocable: true
---

# Vault — review edge_type suggestions

The body-wikilink classifier auto-promotes keyword-cued links to typed edges
("derived from [[X]]" → `derived-from`) and defaults the rest to `cites`. Each
default-cites edge is filed as a pending `edge_type` suggestion. This skill
triages the queue: promote `cites` to a more specific type by writing the
source record's frontmatter `edges:` map, or accept `cites` as correct.

The decision lives in the source `.md` file (constraint C4: markdown is
source of truth). Reindex picks up the FM override and pins the edge type.
Pending suggestions auto-resolve to `accepted` with `resolved_by='fm-override'`
when the indexer sees a freshly-applied override — clean closure even if the
user edits FM manually.

## Invocation

```
/vault-review-edges                    # review the next batch (default 10)
/vault-review-edges --limit=N          # custom batch size (1..100)
/vault-review-edges --auto             # spawn a Sonnet sub-agent to triage in bulk
/vault-review-edges --auto --limit=N   # bulk + cap
```

## Procedure

### 1. List pending suggestions

```bash
vault-curl "/suggestions?kind=edge_type&status=pending&limit=$LIMIT&expand=context" -s
# expand=context (2026-07-09+) inlines context.records — briefs (title/type/status/agent.summary) for every payload-referenced record, null for deleted ones — and context.tag taxonomy info on tag kinds. Fetch full bodies only when a brief is not enough; drop the param on older servers.
```

**Concurrent / sharded runs claim instead of listing** (2026-07-13+) — the
batch flips `pending → claimed` for your holder with a TTL, so parallel
same-kind agents and overlapping sweeps never triage the same items:

```bash
vault-curl "/suggestions/claim?expand=context" -X POST -H 'Content-Type: application/json' \
  --data-binary '{"kind": "edge_type", "holder": "'"$HOLDER"'", "limit": '"$LIMIT"'}' -s
# Same items shape + remaining_pending. Pass the SAME $HOLDER as resolved_by
# when resolving; expired claims lazily revert to pending (default TTL 30 min).
```

Response: `{items: [{id, subject_id, payload: {from_record, from_path, to_record, to_path, classifier_type, context}}, ...], total, ...}`.

If `items` is empty, report "no pending edge_type suggestions" and stop.
Otherwise tell the user: `<batch> of <total> pending. Reviewing now.`

### 2. For each suggestion: decide the type

Read the payload's `context` (~120 chars on each side of the wikilink). For
most cases that's enough to judge. When ambiguous, fetch source/target:

```bash
vault-curl "/sections/$FROM_RECORD" -s | jq -r '.body' | head -40
vault-curl "/sections/$TO_RECORD" -s | jq -r '.title, .body' | head -40
```

The 10 valid edge types (from `EDGE_TYPES` in the codebase):

| Type | When to choose |
|---|---|
| `cites` | Default; the source merely refers to the target. **No FM edit needed; just reject.** |
| `derived-from` | Source builds on / extends / is grounded in target. Strong intellectual debt. |
| `supersedes` | Source replaces / obsoletes / makes-obsolete the target. |
| `revises` | Source amends or refines target without replacing it. |
| `caused-by` | Source describes a state that target produced. |
| `fixed-by` | Source describes a problem that target resolves. |
| `rejected-because` | Source records a rejection whose reason is target. |
| `applies-to` | Source's content applies / is relevant to target's domain. |
| `contradicts` | Source disagrees with target. (Symmetric — auto-mirrors.) |
| `related-to` | Loose conceptual link. (Symmetric — auto-mirrors.) Prefer for the body wikilinks that don't fit anything more specific but are stronger than `cites`. |

Default-cites that fit nothing else: keep as cites (reject the suggestion).
Don't force a type just to clear the queue.

### 3. Resolve the whole batch — one call

`POST /suggestions/resolve-batch` (2026-07-13+) applies the decisions and
their FM side effects server-side. An accept **requires** `edge_type` (any
typed value — "cites is correct" is a reject); the server pins the source
record's FM `edges:` override itself (key = target path sans `.md`, resolver-
matched regardless of the body's slug form, existing entries preserved) and
the scoped edge pass settles the row as `resolved_by='fm-override'`. Rejects
flip status only. No body round-trip, so the byte-exact-body hazard class
(the 2026-06-11 stale-enrichment filings) is gone by construction.

```bash
D=$(mktemp -d)
cat > "$D/batch.json" <<'JSON'
{
  "resolved_by": "$HOLDER-or-review-label",
  "items": [
    {"id": "<id-1>", "decision": "accept", "edge_type": "derived-from"},
    {"id": "<id-2>", "decision": "accept", "edge_type": "applies-to"},
    {"id": "<id-3>", "decision": "reject"}
  ]
}
JSON
vault-curl "/suggestions/resolve-batch" -X POST -H 'Content-Type: application/json' \
  --data-binary @"$D/batch.json" -s | jq -c '{accepted, rejected, failed}' \
  && rm -rf "$D"
```

≤ 100 items per call; always 200 — per-item failures land in
`results[].error` (`already_resolved`, `claimed_by_other`,
`record_not_found`, `invalid_edge_type`, …) and never abort the batch.
Report any `failed > 0` items in the summary. If you claimed the batch,
`resolved_by` must equal the claim's holder. Rejected rows sit in `rejected`
forever; the filer's idempotency check skips re-filing on the next reindex.

**Fallback (pre-2026-07-13 server, 404 on the endpoint):** per-id
`POST /suggestions/{id}/accept|reject` plus a client-side FM `edges:` write
through the JSON PUT path — the full ceremony (byte-exact `jq -j` body
round-trip, merged edges map) lives in this file's git history before the
resolve-batch adoption.

### 4. Report summary

```
Reviewed N suggestions: A promoted, R rejected, S still ambiguous (skipped).
M still pending in the queue — re-run /vault-review-edges for the next batch.
```

## Sub-agent mode (`--auto`)

**Model: Sonnet** (bumped from Haiku 2026-05-01 — see
[[topics/sub-agent-model-selection-by-task-shape]] evaluation log).

Initial assignment was Haiku based on a 10-decision cherry-picked sample
(2026-04-30 — 8 promoted / 2 rejected, decisions cogent). At
production scale (limit=100, 2026-05-01) Haiku quality dropped sharply:
direction was right (79% reject, matching expected distribution) but
**type choice on accepts was 14% precision (3 of 21 fully right)**.
Failure modes:

- Picked `revises` where `derived-from` was right (this-note-builds-on-
  that vs this-note-replaces-that conflated).
- Picked `caused-by` for plain citations (eval result didn't *cause*
  the note; the note cites the result).
- Picked `fixed-by` for parent-constraint relationships
  (this-pattern-derives-from-c12, not this-pattern-was-fixed-by-c12).
- **Ignored prior `agent.edge_classifications`** advisory in the FM —
  the SKILL says "the edge-review skill can leverage this hint" and
  Haiku didn't.
- 3 of 21 accepts were silent-divergence — accepted without writing
  the corresponding FM `edges:` entry.

Per-decision cost at Sonnet rates is ~5× Haiku's; with this skill the
break-even is far below that — re-fixing 18 of 21 decisions ate ~30
minutes of main-session time, which dwarfs the token-cost differential.

**When reading suggestions, also fetch the source's
`agent.edge_classifications` block (if present) — it's an authoritative
prior advisory written by `/vault-enrich-all`.** Don't override it
without strong context cues; if the agent advisory and your reading
disagree, prefer the advisory.

For bulk triage of an accumulated backlog, spawn a Sonnet sub-agent via
the Agent tool. Pattern:

```
subagent_type: general-purpose
model: sonnet
description: Triage N edge_type suggestions
prompt: |
  You are running /vault-review-edges in autonomous mode. Read
  ~/.claude/skills/vault-review-edges/SKILL.md and follow the procedure for
  the next $LIMIT pending suggestions. Claim your batch with holder
  "$HOLDER" (procedure step 1), judge every item, then resolve them in ONE
  /suggestions/resolve-batch call with resolved_by "$HOLDER" (step 3) —
  never per-id accept/reject loops on a 2026-07-13+ server. Default to
  `cites` (reject) when in doubt — don't force a more specific type without
  solid evidence in the payload context. Release skipped/ambiguous items
  with POST /suggestions/{id}/reopen so they return to the pending pool.

  Return: {accepted: N, rejected: M, skipped: K, failed: F, summary: "<one paragraph>"}
```

The sub-agent runs on Sonnet (not the session model); the main session sees
only the summary. This keeps token costs proportional to the *judgment*
work, not the *paperwork*.

For obvious-cites links (the majority), the sub-agent rejects without
further context. Genuine candidates it isn't sure about surface as
`skipped` for the main session to decide — pass `skip_uncertain: true` in
the prompt to enable this.

## When this is the right tool

- The vault has accumulated default-cites edges that should be more specific.
- A `/vault resume` summary shows pending `edge_type` suggestions.
- The user asks to "clean up" or "triage" the typed-edge graph.

## When NOT to use this

- The user wants to **add** an edge that doesn't exist yet — that's done by
  editing the body to add a wikilink, not via this skill.
- The user wants to **remove** an edge — delete the wikilink from the body
  (or remove the FM `edges:` entry if it pinned a type).
- The user wants to triage *other* suggestion kinds (`tag_suggestion`,
  `duplicate`, etc.) — separate skills handle those (queued).

## Backend requirement

vault-storage on `:8123` only. Filing logic is server-side.

## Dependencies

- `vault-curl` on `$PATH`.
- `jq` for response parsing.
- The standard FM writer (`PUT /vault/{path}`) — handles merge semantics.

## Caution — stale paths resurrect records (2026-07-12)

A suggestion's `payload.file_path` is captured at filing time. If the record
was **moved or archived since** (consolidations, supersessions), a
`PUT /vault/<old-path>` silently **creates a new record at the dead path** —
observed 2026-07-12: an edge write to pre-consolidation
`projects/chezmoi/stack.md` resurrected a ghost that then surfaced as an
unenriched record and re-filed suggestions. Before any FM write, resolve the
record's **current** path (`GET /sections/{record_id}` or verify the GET on
the payload path returns the same `record_id`); if the record moved, apply
the edit at the current path and resolve the suggestion against it — never
write to the payload path unverified.
