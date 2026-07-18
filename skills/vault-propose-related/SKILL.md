---
name: vault-propose-related
description: "Propose missing `related:` entries for vault notes by reviewing semantic-NN candidates. Mechanical work (source enumeration with reviewed-tracking, `/similar` fetch, distance cap, dedup against existing related: + body wikilinks, the review-note write, and the apply path via the server's atomic FM membership patch) runs through the bundled `related-batch.mjs`; the skill is the judgment layer — the per-candidate verdicts. Use when the user says /vault propose-related, asks to densify cross-references, or wants to expand `related:` arrays without reading every note manually."
user_invocable: true
---

# Propose missing `related:` entries

The vault's hand-curated `related:` arrays are sparse — typically 1–3 entries
while many notes have 8–15 genuinely related neighbours. This skill densifies
the graph: vault-storage's BGE index surfaces candidates cheaply; the agent
judges which are *meaningful* relationships.

Default mode is **suggestion-only** — proposals land in a review note
(`queries/YYYY-MM-DD-related-proposals[-N].md`, `status: draft`) for human
review. `--apply` writes accepted links directly into source FM.

## Invocation

```
/vault-propose-related                  # propose for the next 30 unreviewed sources → review note
/vault-propose-related --limit=N        # custom batch (1..200)
/vault-propose-related --apply          # accepted links written straight to source FM
/vault-propose-related --auto [...]     # sub-agent for bulk (model per § Sub-agent mode)
```

## Workflow

```bash
R=~/.claude/skills/vault-propose-related/related-batch.mjs
W=$(mktemp -d)
"$R" prepare --limit=30 --out="$W/ws.json"
# judge each candidate → decisions file (verdicts per § Judgment); then ONE of:
"$R" review --worksheet="$W/ws.json" --decisions="$W/dec.json"   # default: proposals note
"$R" apply  --worksheet="$W/ws.json" --decisions="$W/dec.json"   # direct FM writes
```

`prepare` enumerates source notes — the enrichable set, with
`enrichable_types` read live from `GET /system/lint` (client-side
enumeration by necessity here: there is no server worklist for this pass;
the filters mirror the server's documented exclusions — path-based
`/archive/` check, superseded/archived status, this skill's own proposals
notes excluded) — skips sources already covered by prior
`queries/*-related-proposals*` notes (parsed from their `## path`
headings), and advances through the unreviewed frontier in path order. Per
source it fetches `/similar?k=15`, applies the 0.30 distance cap, drops
archived/superseded candidates, and dedups against the source's existing
`related:` + body wikilinks. Worksheet candidates carry title, type,
distance, the disposition `band`, and the target's `agent.summary` when
set — usually enough to judge without fetching bodies.

Decisions file — per source, candidate path → verdict (`accept` wants a
one-line reason; it becomes the review-note rationale):

```json
{"topics/a.md": {
   "topics/b.md": {"verdict": "accept", "reason": "same subsystem, schema side"},
   "topics/c.md": "skip",
   "topics/d.md": {"verdict": "ambiguous", "reason": "borderline overlap"},
   "topics/e.md": {"verdict": "supersede-candidate", "reason": "stale twin"}}}
```

Both finishing modes validate everything before any write (unknown
sources/candidates/verdicts → exit 3, nothing written). `review` writes the
proposals note (filename collision-proof per day; `status: draft` — the
server's status enum has no `pending-review`). `apply` adds each accepted
link via `PATCH /sections/{id}/fm` — the server's **atomic value-based
array-membership op**: no `/meta` read, no body round-trip, idempotent
set-semantics. The two documented data-loss classes of the old hand-rolled
recipe (`/meta` null-`related` wholesale delete; `jq -r` trailing-newline
body growth) are structurally impossible now; the old recipe lives in this
file's git history. Ambiguous and supersession entries always surface in
the report (apply mode never executes retirements). Exit 0 ok · 1 partial
failures · 3 rejected pre-write; run solo or `|| true` in parallel batches.

## Judgment — per candidate

Distance bands (cosine distance; the 0.30 cap is the 99%-recall operating
point on the curated set — false negatives are unbounded cost, checking a
false positive is bounded):

| Band | Distance | Disposition |
|---|---|---|
| `accept-by-default` | ≤ 0.20 | Accept unless clearly homonymous or topically off. |
| `accept-on-subject-overlap` | 0.20–0.25 | Accept on subject overlap; skip if only superficially similar. |
| `selective` | 0.25–0.30 | Accept only with strong topical justification. |

Heuristics: same project / same major topic area → almost certainly
related; same problem from a different angle → related; tangentially
similar (both technical, no direct connection) → skip; same title word,
different meaning → skip. **Don't guess** — `ambiguous` flags a candidate
for human verdict, and a wrong accept costs more than either. **Be
conservative**: better to under-suggest and run another batch than to
flood `related:` with weak edges.

**`supersede-candidate`** is for pairs that aren't *related* but
*successive* — one note reads as a stale predecessor the other replaced.
Don't add `related:` (that cements the stale note into the graph); the
verdict routes the pair to the review note's retirement section
(supersede semantics — archive the predecessor, typed edge from the
survivor). Never executed by the harness; main session + user decide.

## Sub-agent mode (`--auto`)

**Model: Haiku** (default mode) **/ Sonnet** (`--apply`). Per
[[topics/sub-agent-model-selection-by-task-shape]]: review-note mode is
low-stakes textual judgment behind a human gate — Haiku fits; `--apply`
writes FM directly, so the cost of one bad output rises — Sonnet. Only use
`--auto --apply` when the user explicitly authorized direct apply.

```
subagent_type: general-purpose
model: haiku            # sonnet when --apply
description: Propose related: entries for N source notes
prompt: |
  Read ~/.claude/skills/vault-propose-related/SKILL.md. Using the
  related-batch harness exactly as its Workflow section shows: prepare
  --limit $LIMIT, judge every candidate per § Judgment (its bands and
  conservative bias are binding; flag anything you're <80% sure about as
  "ambiguous" rather than accepting), then run `review` (or `apply` only
  if explicitly requested). Return: the harness's JSON report plus a
  one-paragraph summary.
```

## When NOT to use this skill

- **Per-query semantic search** — that's `/vault-search` / `vault_similar`
  at runtime; this is an offline curation pass (weekly / on-demand).
- **Typed-edge classification** (`supersedes`, `caused-by`, …) — that's
  `/vault-review-edges`. This skill produces `related-to` only — the
  loosest, symmetric, auto-mirrored edge.

## Backend requirement

vault-storage on `:8123` (`VAULT_API_URL`/`VAULT_API_TOKEN` in `~/.env`);
`/sections/{id}/similar` needs the BGE embedding index, and `apply` needs
the FM membership-patch endpoint.

## Background

BGE retrieval (chunked, CLS-pooled — [[projects/vault-storage/design/embedding-model]])
achieves ~24× lift over random for R@10 on the live vault. Absolute
precision is depressed by sparse curation — many "false positives" at high
cosine are real matches nobody wrote into FM. This skill captures them;
the curated set densifies; retrieval evals improve.
