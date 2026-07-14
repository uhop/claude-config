---
name: vault-review-tags
description: Triage pending tag-related suggestions — `new_tag` (an unknown tag is on FM, decide canonical/alias/typo) and `tag_suggestion` (agent thinks this record should also have tag X, decide accept/reject). Backed by `GET /suggestions?kind=new_tag|tag_suggestion` (or `POST /suggestions/claim` when running concurrently), `POST /tags/{taxonomy,aliases}`, `POST /suggestions/resolve-batch` (server-side tag realization + reject-side `agent.tags_suggested` strip), and the tag-membership primitive `DELETE /sections/{id}/tags/{tag}` for `new_tag` typo removal. Use when the user says /vault-review-tags, asks to clean up the tag taxonomy, or wants to chip away at either tag-review queue. Requires vault-storage (`:8123`).
user_invocable: true
---

# Vault — review tag suggestions

Two distinct suggestion kinds, both about tags, are triaged by this skill:

- **`new_tag`** — a tag is on a record's FM `tags:` but isn't in
  `tags_taxonomy` (or aliased to one that is). The taxonomy trigger rejects
  the link. Decision: per-tag (group by tag across records) — should this
  tag be canonical, an alias, or stripped as a typo?
- **`tag_suggestion`** — the agent's `agent.tags_suggested` includes a tag
  that isn't yet on the record's FM `tags:`. Decision: per-suggestion
  (record × tag) — should the user add the tag to FM, or reject the
  proposal?

The auto-resolve hooks differ: `new_tag` resolves when the tag is added
to the taxonomy (the canonical or alias path back-fills every affected
record); `tag_suggestion` resolves on the next import where the suggested
tag is now realized in the record's tag set (i.e., the user PUT the file
with the tag added).

## Invocation

```
/vault-review-tags                          # interactive: next 10 unique new_tag groups
/vault-review-tags --kind=tag_suggestion    # triage agent-judged additions instead
/vault-review-tags --limit=N                # custom batch (1..100)
/vault-review-tags --auto                   # Sonnet sub-agent for bulk
/vault-review-tags --auto --kind=tag_suggestion --limit=N
```

When `--kind` is omitted, `new_tag` is the default (older, larger queue).

## Procedure — `new_tag`

### 1. List pending new_tag suggestions

```bash
vault-curl "/suggestions?kind=new_tag&status=pending&limit=100&expand=context" -s
# expand=context (2026-07-09+) inlines context.records — briefs (title/type/status/agent.summary) for every payload-referenced record, null for deleted ones — and context.tag taxonomy info on tag kinds. Fetch full bodies only when a brief is not enough; drop the param on older servers.
```

Each item's `payload` is `{tag, record_id, file_path}`. **Group by `tag`** —
the same unknown tag often appears on N records, and the decision is per-tag,
not per-record. After grouping, take the first $LIMIT unique tags.

If empty, report "no pending new_tag suggestions" and stop.

### 2. For each unique tag: gather context

Show: the tag, the count of records that use it, and 1-3 sample contexts
(read each sample's frontmatter via `vault-curl /vault/<file_path>` — first
40 lines is enough to see title + tags + topic).

Look at the existing taxonomy for nearby names so you can decide
canonical-vs-alias:

```bash
vault-curl "/tags?prefix=$(echo "$TAG" | head -c 3)" -s | jq -r '.items[].tag'
```

(Adjust the prefix to whatever first 2-3 characters give a useful neighbour
list. For `machine-learning`, `ma` or `machine` works.)

### 3. Decide

| Action | When to choose | Effect |
|---|---|---|
| **Add to taxonomy** | The tag is genuinely new and worth being part of the canonical vocabulary. Distinct from any existing tag's meaning. | Future records can use it. Pending suggestions for this tag clear; affected records get the link. |
| **Add as alias** | The tag is a synonym, abbreviation, or alternate spelling of an existing canonical (`ml` → `machine-learning`, `frontend` → `front-end`). | Future records typing the alias auto-rewrite to canonical. Pending suggestions for this tag clear; records get the canonical link. |
| **Reject (typo)** | The tag is a typo, irrelevant, or oversharded ("misc-stuff", "todo-fixme"). | No taxonomy change. Each affected source's FM `tags:` array gets the tag removed. Suggestions marked rejected. |

Tag shape rules (taxonomy CHECK constraint): lowercase, alphanumeric + hyphens
only, no spaces or underscores. Aliases: lowercase only.

### 4a. Add to taxonomy

```bash
vault-curl "/tags/taxonomy" -X POST \
  -H 'Content-Type: application/json' \
  --data-binary '{"tag": "<tag>", "description": "<one-line>"}' \
  -s
```

Response: `{tag, description, linked, accepted}`. `linked` = records
auto-linked to the new tag; `accepted` = pending suggestions auto-resolved.
Both should match the per-tag rejection count. Description is optional but
recommended for non-obvious tags.

### 4b. Add as alias

```bash
vault-curl "/tags/aliases" -X POST \
  -H 'Content-Type: application/json' \
  --data-binary '{"alias": "<alias>", "canonical": "<existing-tag>"}' \
  -s
```

Response: `{alias, canonical, linked, accepted}`. Records get the
**canonical** tag in the `tags(record_id, tag)` mapping (not the alias) —
the alias map normalizes on every future import. `canonical` MUST already
exist in the taxonomy (404 otherwise — add it first via 4a).

### 4c. Reject (typo)

For each suggestion (looped over the group's records), remove the tag
via the server-side membership primitive — atomic on the server, no
client-side read-modify-write:

1. **Remove the tag from FM:**
   ```bash
   vault-curl "/sections/$RECORD_ID/tags/$BAD_TAG" -X DELETE -s
   ```
   Response: `200 {tags: [...]}` with the post-delete tag list.
   Idempotent: removing a tag that isn't present is a no-op success.
2. **Mark the suggestions rejected — batch the whole typo group** in one
   `POST /suggestions/resolve-batch` call (2026-07-13+): `{resolved_by:
   "<label-or-holder>", items: [{id, decision: "reject"}, …]}`. `new_tag`
   resolutions are status-only server-side (the FM removal in step 1 is
   the judgment-bearing half and stays with you). Per-id fallback on an
   older server:
   ```bash
   vault-curl "/suggestions/$SUG_ID/reject" -X POST -s -o /dev/null -w "%{http_code}\n"
   ```

The membership endpoint runs the whole read-modify-write transaction
server-side under the writer's lock, so concurrent edits to the same
file from a different writer can't be silently clobbered by a stale
local read. The next import (triggered by the write) auto-resolves any
matching pending suggestions.

### 5. Report summary

```
Reviewed N unique tags across M records:
  added to taxonomy: <count> (<tags>)
  added as aliases:  <count> (<alias → canonical pairs>)
  rejected as typos: <count>, <records edited>
<remaining> tags still pending — re-run /vault-review-tags for the next batch.
```

## Procedure — `tag_suggestion`

### 1. List pending tag_suggestion entries

```bash
vault-curl "/suggestions?kind=tag_suggestion&status=pending&limit=$LIMIT&expand=context" -s
# expand=context (2026-07-09+) inlines context.records — briefs (title/type/status/agent.summary) for every payload-referenced record, null for deleted ones — and context.tag taxonomy info on tag kinds. Fetch full bodies only when a brief is not enough; drop the param on older servers.
```

**Concurrent / sharded runs claim instead of listing** (2026-07-13+ — same
for `new_tag`): the batch flips `pending → claimed` for your holder with a
TTL, so parallel same-kind agents and overlapping sweeps never triage the
same items. Pass the SAME holder as `resolved_by` when resolving; expired
claims lazily revert to pending (default TTL 30 min); release skipped items
with `POST /suggestions/{id}/reopen`.

```bash
vault-curl "/suggestions/claim?expand=context" -X POST -H 'Content-Type: application/json' \
  --data-binary '{"kind": "tag_suggestion", "holder": "'"$HOLDER"'", "limit": '"$LIMIT"'}' -s
```

Each item's `payload` is `{tag, record_id, file_path}`. Decisions are
per-suggestion (a single record × tag pair) — no grouping. Resolution
happens automatically once the tag is added to FM and the file is
re-imported, so this skill's main job is the **judgment**: "should this
tag really be on this note?"

### 2. For each suggestion: gather context

Read the source's first 60 lines to see title + existing tags + topic:

```bash
vault-curl "/vault/$FILE_PATH" -s | head -60
```

Confirm the suggested tag is in the canonical taxonomy (or aliased to
one). If it's unknown, the accept path requires adding it first — and
the question shifts to "is this tag canonical-worthy?" Use the same
`/tags?prefix=` neighbour lookup as in the `new_tag` flow.

### 3. Decide

| Action | When to choose | Effect |
|---|---|---|
| **Accept** | The tag accurately describes the record's content and is consistent with how that tag is used elsewhere. | Batch-accept (§ 4) — the server realizes the tag on FM `tags:` and the row settles on contact (`resolved_by='tag-realized'`), including the already-on-record case. |
| **Reject** | The tag is too tangential, redundant with an existing one on the record, or misframes the content. | Batch-reject (§ 4) — the server flips the row and strips the candidate from `agent.tags_suggested`. |
| **Defer** | The tag would be valid but isn't yet in the taxonomy — and you don't want to commit to a canonical. | Skip; the suggestion stays pending. Optionally route through `/vault-review-tags --kind=new_tag` if the tag also appears on records. |

**Bias toward accept.** The agent's `tags_suggested` block was produced
under explicit instructions to suggest only confidently-relevant tags.
Reject only when the suggestion clearly misframes the record (genre
mismatch, scope mismatch, or duplication of an already-realized tag).

### 4. Resolve the whole batch — one call

`POST /suggestions/resolve-batch` (2026-07-13+) applies the decisions and
their FM side effects server-side. An **accept** realizes the tag on the
record's FM `tags:` — the re-import settles the row on contact as
`resolved_by='tag-realized'` when the tag is in the taxonomy, and a
status-guarded flip stamps your `resolved_by` otherwise. The
already-on-record no-op case is covered too (the server re-imports even on
a no-op add, so the row settles — the 2026-06-27 lingering-artifact class
is gone by construction). A **reject** flips the row and strips the
candidate from `agent.tags_suggested` server-side in the same item
(best-effort hygiene; the reject is durable regardless — `tag_suggestion`
rejects block re-filing across all statuses).

```bash
D=$(mktemp -d)
cat > "$D/batch.json" <<'JSON'
{
  "resolved_by": "$HOLDER-or-review-label",
  "items": [
    {"id": "<id-1>", "decision": "accept"},
    {"id": "<id-2>", "decision": "reject"}
  ]
}
JSON
vault-curl "/suggestions/resolve-batch" -X POST -H 'Content-Type: application/json' \
  --data-binary @"$D/batch.json" -s | jq -c '{accepted, rejected, failed}' \
  && rm -rf "$D"
```

**Taxonomy still comes first.** Batch-accepting a tag unknown to the
taxonomy writes it to FM anyway, and the import files a `new_tag`
suggestion for it — add the tag via `POST /tags/taxonomy` (or
`/tags/aliases`) *before* the batch call, or Defer the item instead.

≤ 100 items per call; always 200 — per-item failures land in
`results[].error` (`already_resolved`, `claimed_by_other`, …) and never
abort the batch; report any `failed > 0` in the summary. If you claimed
the batch, `resolved_by` must equal the claim's holder.

**Fallback (pre-2026-07-13 server, 404 on the endpoint):** per-id flow —
`POST /sections/{id}/tags` membership add + direct `/accept` for the
already-realized case, `POST /suggestions/{id}/reject` + the
`PATCH /sections/{id}/fm` candidate strip — lives in this file's git
history before the resolve-batch adoption.

### 5. Report summary

```
Reviewed N tag_suggestions:
  accepted (FM updated):  <count>
  rejected:               <count>
  deferred (taxonomy gap):<count>
<remaining> still pending — re-run /vault-review-tags --kind=tag_suggestion for the next batch.
```

## Sub-agent mode (`--auto`)

**Model: Sonnet** (bumped from Haiku 2026-05-01 — see
[[topics/sub-agent-model-selection-by-task-shape]] evaluation log).

Initial assignment was Haiku based on closed-enum decision shape. First
production run (limit=20 requested, 57 done — Haiku also overran) showed:

- 27 promotes — likely mostly OK, sample audit pending.
- 4 aliases — `indexer-design → indexing` was wrong (loses specificity).
- 8 rejects with FM tag-strip — **5 of 8 were wrong rejects of real
  concepts**, including the headline absurdity of stripping `cutover`
  (a real concept tagging migration logs). Other wrong rejects:
  `suggestions` (vault-storage feature), `design-pattern` (a
  meaningful category), `bug-fix`.
- 11 of 15 records had tags wrongly stripped from FM (~73%
  destructive-bias error rate).
- Limit instruction ignored (57 vs 20 requested) — same instruction-
  skim pattern Haiku exhibited on `/vault-review-edges`.

**Why Haiku fails this skill**: the cost-of-one-bad-output is asymmetric
— a wrong-promote is cheap to /reopen, but a wrong-reject **destructively
strips the tag from source records**. Haiku's noise on the reject
direction translates directly to data loss. Restoring 7 wrongly-stripped
tags + adding back to taxonomy ate ~15 minutes.

**Bias toward promote.** This skill's correct prior is to **promote when
in doubt** (the SKILL says so explicitly), not to reject. Haiku inverted
the bias — over-rejected. Sonnet's track record on `/vault-review-edges`
showed it correctly applies conservative-when-stated bias.

Same shape as `/vault-review-edges --auto`. Spawn a Sonnet sub-agent via
the Agent tool with this skill loaded.

### `--kind=new_tag` prompt

```
subagent_type: general-purpose
model: sonnet
description: Triage N unique new_tag suggestions
prompt: |
  Read ~/.claude/skills/vault-review-tags/SKILL.md and follow the
  Procedure — `new_tag` section for the next $LIMIT unique pending
  new_tag suggestions (group by tag). Claim your batch with holder
  "$HOLDER" (kind new_tag; see the tag_suggestion step 1 claim block)
  and batch the reject status-flips through /suggestions/resolve-batch
  with resolved_by "$HOLDER" (§ 4c); taxonomy/alias adds auto-accept
  their suggestions as before. Release skipped items with
  POST /suggestions/{id}/reopen.

  Decision bias: when in doubt between "add to taxonomy" and "reject as
  typo", PREFER "add to taxonomy" if the tag looks like a coherent concept
  (e.g., `web-fetch`, `library-design`). REJECT only when the tag is
  clearly a typo, joke, or single-use marker (e.g., `wip-fix-later`,
  `xxxxx`).

  Aliases: if the tag is obviously a short form / alternate spelling of an
  existing canonical (look it up via `/tags?prefix=`), prefer alias-add.

  Return: {added: [{tag, description}], aliased: [{alias, canonical}],
  rejected: [{tag, records_edited}], summary: "<one paragraph>"}
```

### `--kind=tag_suggestion` prompt

```
subagent_type: general-purpose
model: sonnet
description: Triage N tag_suggestion entries
prompt: |
  Read ~/.claude/skills/vault-review-tags/SKILL.md and follow the
  Procedure — `tag_suggestion` section for the next $LIMIT pending
  tag_suggestion entries (per-suggestion decisions, no grouping).
  Claim your batch with holder "$HOLDER" (step 1), judge every item,
  then resolve them in ONE /suggestions/resolve-batch call with
  resolved_by "$HOLDER" (§ 4) — never per-id accept/reject loops on a
  2026-07-13+ server. Release deferred items with
  POST /suggestions/{id}/reopen so they return to the pending pool.

  Decision bias: ACCEPT when the tag accurately describes the record's
  content; REJECT only on clear misframing (genre / scope mismatch,
  duplication, tangential topic). Defer rather than accept-with-taxonomy-
  add for tags not yet in the taxonomy — taxonomy expansion belongs in
  the new_tag flow, not here.

  Return: {accepted: [{record_id, tag}], rejected: [{record_id, tag}],
  deferred: [{record_id, tag, reason}], failed: F, summary: "<one paragraph>"}
```

Sonnet does the bulk; main session reviews the summary and only
intervenes on edge cases the sub-agent flags as ambiguous.

## When this is the right tool

- `/vault resume` shows a non-zero `new_tag` or `tag_suggestion` queue.
- The user adds a new tag to a note's FM and the indexer logs "rejected".
- The agent's `tags_suggested` block has accumulated proposals worth a
  triage pass.
- Periodic taxonomy curation pass (especially after a batch of new content).

## When NOT to use this

- The user wants to **rename an existing canonical** — that's a taxonomy
  migration, not a new_tag review (different operation).
- The user wants to **delete an existing canonical** from the taxonomy —
  also out of scope (manual SQL or a future `DELETE /tags/taxonomy/{tag}`
  endpoint).
- The user wants `/vault-review-edges` (different suggestion kind).

## Backend requirement

vault-storage on `:8123` only. The taxonomy mutation endpoints are
server-side. If `$VAULT_API_URL` points at `:8089`, the POSTs return 404.

## Dependencies

- `vault-curl` on `$PATH`.
- `jq` for response parsing.
