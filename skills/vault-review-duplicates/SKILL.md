---
name: vault-review-duplicates
description: "Triage pending `duplicate` suggestions filed by vault-storage's pairwise vector-similarity scan. Decide per pair: reject as a false positive, accept as related-but-distinct (cross-referenced `related:` entries), flag as contradiction, mark as a merge candidate for human-confirmed execution, or (main session, high confidence) merge with archival supersession. The safe paths run through the shared harness `~/.claude/skills/vault/vault-triage.mjs`; only the merge recipe is manual. Use when the user says /vault-review-duplicates, asks to triage near-duplicate notes, or wants to clean up the topical graph. Requires vault-storage (`:8123`)."
user_invocable: true
---

# Vault — review duplicate suggestions

vault-storage's `POST /maintenance/find-duplicates` scans embedded records
for high cosine similarity (default ≥ 0.90) and files a pending `duplicate`
suggestion per pair. Outcomes are nuanced: genuinely redundant (merge),
distinct-but-related (cross-reference), contradicting (flag), or an
embedding false positive (reject). **Default to non-destructive
resolutions** — merge only with high confidence and user authorization.

## Invocation

```
/vault-review-duplicates                    # interactive: next batch (default 10)
/vault-review-duplicates --limit=N          # custom batch (1..100)
/vault-review-duplicates --auto [--limit=N] # Sonnet sub-agent (never merges)
/vault-review-duplicates --scan[=0.05]      # fresh similarity scan first
```

## Workflow

```bash
V=~/.claude/skills/vault/vault-triage.mjs
W=$(mktemp -d)
"$V" prepare duplicate --limit=10 --out="$W/ws.json"          # add --scan[=DIST] to refresh the queue first
"$V" prepare duplicate --claim --holder="$HOLDER" --limit=100 --out="$W/ws.json"
# judge each pair → decisions map; then:
"$V" resolve duplicate --worksheet="$W/ws.json" --decisions="$W/dec.json"
```

Each worksheet item carries the pair's `distance` plus both records'
briefs — title, type, status, dates, agent summary, and the first ~30
body lines (`body_head`) — usually enough to judge; fetch full bodies via
`vault-curl /vault/<path>` only when it isn't. `path_moved` flags mark
records relocated since filing; writes use current paths.

Decisions map — one value per item id:

```json
{"<id>": "reject",
 "<id-2>": "related",
 "<id-3>": {"action": "contradiction", "note": "one says X, the other not-X"},
 "<id-4>": "merge-candidate",
 "<id-5>": "skip"}
```

What `resolve` does per value: `reject` → batch-reject (false positive;
idempotent scans won't refile). `related` → adds each note to the other's
FM `related:` via the server's atomic array-membership patch (no body
round-trip — the 2026-05-01 double-FM corruption class is structurally
gone), then batch-accepts; the reindex mirrors `related-to` edges.
`contradiction` → batch-reject + the note surfaces in the report (no
server-side contradiction surface yet). `merge-candidate` → left pending
(claim reopened) and listed in the report for the main session.
`skip`/null → left pending. Validation is all-before-any-write (exit 3);
exit 0 ok · 1 partial failures. Run solo or `|| true` in parallel batches.

## Judgment — per pair

Distance is cosine: 0 = identical, 0.10 = strong match, 0.15 = topical
neighbour, > 0.30 = unrelated.

| Decision | When |
|---|---|
| **reject** | Distinct topics despite high cosine; vocabulary overlap; different lifecycles (`log` vs `permanent` vs `query` usually aren't duplicates even when topically close). |
| **related** | Same topic, distinct enough that both should exist (different angle or audience — tutorial vs reference). |
| **contradiction** | Both cover the same ground but reach different conclusions ("always X" vs "never X"). |
| **merge-candidate** | True duplicate — one note canonical, the other redundant. Never executed by the harness; § Merge below, main session only. |

Bias: **reject or related** when in doubt. Watch `status` (already
`superseded` → likely reject) and `created` dates (a much older note may
be the superseded one).

## Merge (destructive — main session, high confidence, user-confirmed)

The only content-altering path; stays manual. Get explicit confirmation,
then:

1. **Choose canonical**: more recent `updated:`, more inbound wikilinks
   (`vault-curl /sections/$ID/backlinks`), better structure; when in doubt
   prefer the older note and absorb the newer's unique content.
2. **Write merged content** into the canonical (union tags; lose nothing
   from either note), ending with a supersession footer pointing at the
   *archived* path (extension-less): `> Supersedes
   [[<dir>/archive/<YYYY>/<name>]].` — the classifier types that phrasing
   `supersedes`. (`POST /vault/supersede` doesn't fit here: the successor
   already exists.)
3. **Redirect inbound wikilinks**: for each backlink source, edit its body
   to point at the canonical (`vault-put --replace` per site).
4. **Archive the redundant note** (record id, embeddings, history survive):
   `POST /vault/move` to `<dir>/archive/<YYYY>/<name>.md`, then stamp
   `{frontmatter: {status: "superseded"}}` via a JSON PUT. `DELETE` is
   reserved for zero-history junk.
5. **Accept the suggestion**: `vault-curl /suggestions/$ID/accept -X POST`.

## Sub-agent mode (`--auto`)

**Model: Sonnet** (bumped from Haiku 2026-05-01 — see
[[topics/sub-agent-model-selection-by-task-shape]]). Haiku's pair decisions
were passable but its hand-rolled FM writes corrupted 15 files (double-FM
payloads); the harness has since removed hand-rolled writes entirely, but
the cost-asymmetry record stands.

```
subagent_type: general-purpose
model: sonnet
description: Triage N duplicate suggestions
prompt: |
  Read ~/.claude/skills/vault-review-duplicates/SKILL.md. Using the
  vault-triage harness exactly as its Workflow section shows: prepare
  duplicate with --claim --holder "$HOLDER" --limit $LIMIT, judge every
  pair per the skill's Judgment table, write the decisions file, resolve.
  NEVER merge: mark true duplicates "merge-candidate" for the main
  session. When in doubt between "related" and "reject", prefer "reject" —
  cross-references must reflect real kinship, not embedding coincidence.
  Return: the harness's JSON report plus a one-paragraph summary.
```

The main session reviews `merge_candidates` from the report and executes
any actual merges per § Merge with user confirmation.

## When this is the right tool

- The duplicate scan has populated the queue (`/vault resume` / `/vault
  sweep` shows pending `duplicate` suggestions); the user wants redundant
  notes cleaned up. To find duplicates *now*, use `--scan`.

## When NOT to use

- Other suggestion kinds — `/vault-review-edges`, `/vault-review-tags`.

## Backend requirement

vault-storage on `:8123` (`VAULT_API_URL`/`VAULT_API_TOKEN` in `~/.env`).
The harness needs the 2026-07-13+ claim/resolve-batch endpoints; on an
older server fall back to this file's git history (pre-harness procedure).
