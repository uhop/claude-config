---
name: vault-review-edges
description: Triage pending `edge_type` suggestions in the vault — promote default `cites` body wikilinks to a more specific edge type (derived-from, applies-to, supersedes, etc.), or confirm `cites` is correct and reject. All mechanical work (list/claim, context briefs, the `agent.edge_classifications` prior fetch, batch resolve with server-side FM `edges:` writes, reporting) runs through the shared harness `~/.claude/skills/vault/vault-triage.mjs`; this skill is the judgment layer. Use when the user says /vault-review-edges, asks to triage / clean up the typed-edge graph, or wants to chip away at the classifier's review queue. Requires vault-storage (`:8123`).
user_invocable: true
---

# Vault — review edge_type suggestions

The body-wikilink classifier auto-promotes keyword-cued links to typed edges
("derived from [[X]]" → `derived-from`) and defaults the rest to `cites`,
filing each default as a pending `edge_type` suggestion. This skill triages
the queue: pick a more specific type, or accept that `cites` is right.

The decision lands in the source record's FM `edges:` map (markdown stays
source of truth) — written **server-side** by resolve-batch, keyed by the
record id, so the 2026-07-12 stale-path ghost-resurrection hazard doesn't
apply; the worksheet still flags `path_moved` records for awareness.

## Invocation

```
/vault-review-edges                    # review the next batch (default 10)
/vault-review-edges --limit=N          # custom batch (1..100)
/vault-review-edges --auto [--limit=N] # Sonnet sub-agent for bulk
```

## Workflow

```bash
V=~/.claude/skills/vault/vault-triage.mjs
W=$(mktemp -d)
"$V" prepare edge_type --limit=25 --out="$W/ws.json"                      # solo
"$V" prepare edge_type --claim --holder="$HOLDER" --limit=100 --out="$W/ws.json"  # concurrent/sweep
# judge each item → decisions map; then:
"$V" resolve edge_type --worksheet="$W/ws.json" --decisions="$W/dec.json"
```

Each worksheet item carries the wikilink `snippet` (~120 chars each side),
`from`/`to` record briefs (title + agent summary), and — when the source's
`agent.edge_classifications` advisory covers this target — a `prior` field.
When the snippet + briefs aren't enough, fetch the bodies:
`vault-curl "/sections/$RECORD_ID" -s | jq -r .body | head -40`.

Decisions map — one value per item id:

```json
{"<id>": "derived-from", "<id-2>": "reject", "<id-3>": "cites", "<id-4>": "skip"}
```

A typed value = accept with that type; `"reject"` and `"cites"` both mean
"the default cites is correct" (reject); `"skip"`/null leaves the item
pending (claim reopened). `resolve` validates the whole file before any
write (exit 3 on an unknown id or type), sends one resolve-batch — the
server pins FM `edges:` per accept and settles rows as `fm-override` — and
prints a JSON report. Exit 0 ok · 1 partial failures · 3 rejected pre-write.
Run solo or `|| true` in parallel Bash batches.

## Judgment — the 10 types

| Type | When to choose |
|---|---|
| `cites` | Default; the source merely refers to the target. **Decision value `reject` or `cites`.** |
| `derived-from` | Source builds on / extends / is grounded in target. Strong intellectual debt. |
| `supersedes` | Source replaces / obsoletes the target. |
| `revises` | Source amends or refines target without replacing it. |
| `caused-by` | Source describes a state that target produced. |
| `fixed-by` | Source describes a problem that target resolves. |
| `rejected-because` | Source records a rejection whose reason is target. |
| `applies-to` | Source's content applies / is relevant to target's domain. |
| `contradicts` | Source disagrees with target. (Symmetric — auto-mirrors.) |
| `related-to` | Loose conceptual link, stronger than `cites` but nothing specific fits. (Symmetric.) |

Don't force a type just to clear the queue — default-cites that fit nothing
else stay cites (reject). **When the worksheet shows a `prior`, treat it as
authoritative** (it's `/vault-enrich-all`'s advisory, written with full-note
context): don't override it without strong cues in the snippet.

## Sub-agent mode (`--auto`)

**Model: Sonnet** (bumped from Haiku 2026-05-01 — see
[[topics/sub-agent-model-selection-by-task-shape]]). At production scale
Haiku's type choice on accepts hit 14% precision (`revises` vs
`derived-from` conflation, `caused-by` for plain citations, priors ignored,
silent-divergence accepts); re-fixing 18 of 21 decisions cost more than the
token differential ever saved.

```
subagent_type: general-purpose
model: sonnet
description: Triage N edge_type suggestions
prompt: |
  Read ~/.claude/skills/vault-review-edges/SKILL.md. Using the vault-triage
  harness exactly as its Workflow section shows: prepare edge_type with
  --claim --holder "$HOLDER" --limit $LIMIT, judge every worksheet item per
  the skill's type table, write the decisions file, resolve. Default to
  "reject" (cites is correct) when in doubt — don't force a type; honor any
  `prior` field. Use "skip" for items you genuinely can't judge.
  Return: the harness's JSON report plus a one-paragraph summary noting
  skipped items.
```

## When this is the right tool

- Accumulated default-cites edges that should be more specific; a
  `/vault resume` or `/vault sweep` shows pending `edge_type` suggestions.

## When NOT to use this

- **Adding** an edge — edit the body to add a wikilink.
- **Removing** an edge — delete the wikilink (or the FM `edges:` entry).
- Other suggestion kinds — `/vault-review-tags`, `/vault-review-duplicates`.

## Backend requirement

vault-storage on `:8123` (`VAULT_API_URL`/`VAULT_API_TOKEN` in `~/.env`).
The harness needs the 2026-07-13+ claim/resolve-batch endpoints; on an
older server fall back to this file's git history (pre-harness procedure).
