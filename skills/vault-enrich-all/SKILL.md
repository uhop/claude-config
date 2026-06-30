---
name: vault-enrich-all
description: "Generate or refresh agent-derived frontmatter enrichment (summary, key_concepts, tags_suggested, related_proposed, edge_classifications, complexity) for vault notes. Writes a namespaced `agent:` block per note that the indexer / chunker / embedder will consume for HyDE-style retrieval augmentation. Use when the user says /vault-enrich-all, asks to backfill summaries / concept tags, or wants to densify the agent-derived metadata layer. Per design `[[projects/vault-storage/design/agent-frontmatter-enrichment]]` — refines C12 by separating user-authored top-level frontmatter from agent-authored enrichment."
user_invocable: true
---

# Vault — agent-driven frontmatter enrichment

For each vault note, generate a namespaced `agent:` block in the
frontmatter that captures LLM-derived enrichment: a 1-2 sentence summary,
3-5 key concepts, tag/related-link proposals, edge-type classifications
for body wikilinks, and a complexity label. Hash-gated invalidation
ensures the block stays fresh on body changes.

The block lives in the source markdown file (constraint C4: file is
source of truth). It survives DB rebuilds, is git-tracked, and is
human-visible. The indexer / chunker / embedder consume `agent.summary`
as a HyDE-style prefix at index time per
`[[projects/vault-storage/design/embedding-model]]`.

## Invocation

```
/vault-enrich-all                       # default: review & enrich next 30 unenriched enrichable notes
/vault-enrich-all --limit=N             # custom batch (1..200)
/vault-enrich-all --stale               # refresh stale blocks (hash mismatch) instead of new
/vault-enrich-all --type=permanent      # restrict to ONE record type (default: the full enrichable set — see below)
/vault-enrich-all --auto                # spawn a Sonnet sub-agent for bulk
/vault-enrich-all --auto --limit=N      # bulk + cap
```

## Per-note `agent:` block shape

```yaml
agent:
  derived_at: 2026-04-30T22:00:00Z
  derived_from_hash: "<body_hash, hex — quoted!>"
  summary: "<1-2 sentences capturing the note's core claim and scope>"
  key_concepts: [concept-1, concept-2, concept-3]
  tags_suggested: [proposed-tag-1, proposed-tag-2]   # candidates for top-level tags:
  related_proposed: ["[[other-note]]"]               # candidates for top-level related:
  edge_classifications:                              # body wikilinks → edge types
    "[[some-page]]": derived-from
    "[[other-page]]": applies-to
  complexity: prose      # one of: prose | code-heavy | tabular | mixed | hub | log-entry
```

Top-level user-authored frontmatter (`title`, `tags`, `related`, `status`,
`type`, `priority`, `edges`) is **not touched** — the agent only writes
inside its `agent:` namespace.

## Procedure

### 1. Pick the batch

**Enrichable set — the canonical definition lives in `vault-storage`, NOT here.** It is `ENRICHABLE_TYPES` in `vault-storage/src/server/handlers/lint.ts` (currently `permanent`, `project`, `design`, `research`, `query`), surfaced live by `GET /system/lint` → `coverage.enrichment`. **Read it from the server; do not hand-roll a second copy** — that duplication is exactly what caused the 2026-06-30 scope gap (a skill-side `type=permanent` scan diverged from the server, reporting "427/427" while 7 `project`/`design`/`query` notes sat unenriched). `--type=X` narrows to one type on purpose; the **default does not narrow**.

```bash
# Source of truth — the headline backlog count AND the authoritative type allowlist:
COV=$(vault-curl /system/lint -s | jq -c '.coverage.enrichment')
echo "$COV" | jq -c '{total, enriched, unenriched, enrichable_types}'
# The headline {total,enriched,unenriched} already excludes operational types
# (log/meta/queue-item/state/index), empty-body stubs, and archived notes.
```

`coverage.enrichment` returns counts, not paths. To get the actual notes to enrich, enumerate `/sections` filtered to the server's `enrichable_types` (**read live, never hardcoded**) + non-empty body + not archived + missing `agent_summary` (exposed flat per record; empty ⇒ no `agent:` block). Page by `items.length`, never the requested limit:

```bash
TYPES=$(echo "$COV" | jq -r '.enrichable_types | join(" ")')
offset=0
while :; do
  page=$(vault-curl "/sections?limit=100&offset=$offset" -s)
  n=$(echo "$page" | jq '.items | length'); [ "${n:-0}" -eq 0 ] && break
  echo "$page" | jq -r --arg types "$TYPES" '
    ($types | split(" ")) as $enrich
    | .items[]
    | select((.agent_summary // "") == "")          # missing block (for --stale: .agent_derived_from_hash != .body_hash)
    | select(.type as $t | $enrich | index($t))      # type IS in the server allowlist
    | select(.archived_at == null)                   # not archived
    | select((.body | length) > 0)                   # non-empty (matches the server headline)
    | "\(.record_id)\t\(.type)\t\(.file_path)"'
  offset=$((offset + n))
done
# --type=X → keep only that type out of $TYPES;  --stale → flip the first select to the hash-mismatch test.
```

For each candidate, fetch the file:

```bash
WORK=$(mktemp -d)   # scratch dir; reuse this literal path across the steps below (CLAUDE.md § "Scratch files"), rm -rf "$WORK" when done
vault-curl "/vault/$FILE_PATH" -s -o "$WORK/note.md"
```

Parse the FM. If `agent.derived_from_hash` matches the record's current
`body_hash` (look it up via `/sections/{id}` or `vault_read_meta`), the
block is fresh — skip unless `--stale` is set.

**Use `body_hash`, not `content_hash`.** The API exposes both. `body_hash`
is `sha256(body)` — pure body content, stable across enrichment cycles.
`content_hash` is the embedding-input hash; once `agent.summary` is set,
it includes the summary, so it diverges from body-only and would file
spurious `agent_enrichment_stale` suggestions on every refresh. For
unenriched records the two are equal; for enriched ones they differ.

**Fallback when `body_hash` is missing** (server predates the field):
compute it yourself by hashing the body bytes. The body is whatever
follows the closing `---\n` of the FM block — preserve trailing newlines
verbatim.

```bash
BODY_HASH=$(awk '/^---$/{n++; next} n==2{print}' "$WORK/note.md" | sha256sum | cut -d' ' -f1)
# or in Python: hashlib.sha256(body.encode("utf-8")).hexdigest()
```

### 2. Generate enrichment fields

Read the body. Reason about:

- **`summary`**: 1-2 sentences, ~40-80 words. Lead with the note's core
  claim or scope. Avoid restating the title verbatim.
  **Mention the concrete name AND the abstract pattern**, not just one.
  The 2026-05-01 query-document A/B
  ([[projects/vault-storage/design/embedding-baseline-summary-query-ab]])
  surfaced one outlier where the summary abstracted "shared header on two
  notes that aren't duplicates" into "two aggregations: chunk-min vs
  whole-doc" — retrieval rank crashed from 20 (body) to 47 (with summary)
  on a query asking about the concrete failure-mode. Fix: keep both
  layers in the same sentence — "Two aggregations (chunk-min vs whole-
  doc); shared boilerplate causes chunk-min false positives that whole-
  doc drowns" preserves the abstract pattern AND the concrete failure
  signature the query was asking about.
- **`key_concepts`**: 3-5 noun-phrases that the note hangs on. Lowercase,
  hyphen-separated. These are *concepts*, not necessarily tags — they may
  overlap with `tags_suggested` but serve a different purpose (retrieval
  anchors / dedup probes vs. taxonomy membership).
- **`tags_suggested`**: tags the agent thinks should join the top-level
  `tags:` array. Cross-reference the existing taxonomy:
  ```bash
  vault-curl "/tags?prefix=$(echo $CONCEPT | head -c 3)" -s
  ```
  Only suggest tags that already exist in the taxonomy OR are clearly
  worth adding. Don't propose freeform tags that would just become typos.
- **`related_proposed`**: wikilinks to other notes the agent thinks should
  join `related:`. Use `/sections/{id}/similar?k=15` for candidates;
  filter to those at distance ≤ 0.30; judge each.
- **`edge_classifications`**: for each `[[wikilink]]` in the body, propose
  an edge type from the canonical 10 (`derived-from`, `applies-to`,
  `cites`, etc.). The classifier's heuristic default is `cites`; this
  field is the agent's better classification. **The body-wikilink
  classifier and FM `edges:` map are still the runtime source of truth**
  (per `/vault-review-edges`); `edge_classifications` is a hint that the
  edge-review skill can leverage.
- **`complexity`**: one of `prose`, `code-heavy`, `tabular`, `mixed`,
  `hub` (a note that's mostly wikilinks to other notes), `log-entry`.

### 3. Write the block

Use the **JSON write path** (`Content-Type: application/json`) — the
recommended path for this skill. `agent.summary` regularly contains
colon-space prose ("The principle generalizes: any operator-visible…")
that 500s through the markdown path's YAML parser. JSON sidesteps the
whole authoring-trap class (colon-space, leading `@`/`*`/`-`/`?`,
hex/bool/date-shadow strings, multi-line plain scalars) — the server
takes the FM object directly and `yaml.stringify` produces correctly
quoted YAML on the way to disk.

Compose the FM object with the same fields you'd write into the YAML
block:

```json
{
  "frontmatter": {
    "agent": {
      "derived_at": "2026-04-30T22:00:00Z",
      "derived_from_hash": "<body_hash, hex>",
      "summary": "...",
      "key_concepts": ["..."],
      "tags_suggested": ["..."],
      "related_proposed": ["..."],
      "edge_classifications": {
        "[[some-target]]": "derived-from"
      },
      "complexity": "prose"
    }
  },
  "body": "<unchanged body>"
}
```

The writer merges `frontmatter` into the on-disk FM (shallow, key-by-key),
so you only need to send keys you want to update — top-level
`title`/`tags`/`status`/`type`/`related`/`edges` are preserved unchanged
when you omit them. **The `agent` map itself is replaced wholesale on each
write**, though, so include all the fields you want preserved inside
`agent`.

Look up `body_hash` via `/sections/{id}` (or `vault_read_meta`) to populate
`derived_from_hash` — **not `content_hash`**. The two diverge once a
summary is set: `content_hash` becomes `embedInputHash(body, summary)`,
while `body_hash` stays at `sha256(body)`. Using `content_hash` from a
post-enrichment record produces silent staleness suggestions on every
refresh because the recorded value will never match what the importer
recomputes from the body alone. (Note: under the JSON write path the hash
value is just a JSON string and doesn't need explicit double-quoting —
`yaml.stringify` quotes it correctly when emitting YAML to disk.)

Use the current ISO 8601 UTC timestamp for `derived_at`.

Construct the payload safely with `jq` (handles arbitrary body content
and special characters in `summary`):

```bash
jq --null-input \
  --rawfile body "$WORK/note-body.md" \
  --arg hash "$BODY_HASH" \
  --arg summary "$SUMMARY" \
  --arg derived_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{frontmatter: {agent: {derived_at: $derived_at, derived_from_hash: $hash, summary: $summary, key_concepts: ["..."], complexity: "prose"}}, body: $body}' \
  > "$WORK/payload.json"

vault-curl "/vault/$FILE_PATH" -X PUT \
  -H 'Content-Type: application/json' \
  --data-binary @"$WORK/payload.json" \
  -o /dev/null -w "%{http_code}\n"
rm -rf "$WORK"   # best-effort cleanup
```

Expect `204`.

The JSON path is the only sanctioned way to write FM (2026-06-11
decision). Never hand-author the `---\n<FM>\n---\n<body>` markdown
blob for enrichment writes — `agent.summary` regularly contains
colon-space prose and `derived_from_hash` is an all-digit-prone string,
both classic YAML quoting traps the JSON path eliminates. The markdown
PUT mode is reserved for the UI editor and verbatim round-trips of
server-emitted files.

### 4. Report summary

```
Enriched N notes:
  new blocks:           <count>
  refreshed (stale):    <count>
  skipped (fresh):      <count>
  errors:               <count>
<remaining> still needing enrichment — re-run /vault-enrich-all for the next batch.
```

## Sub-agent mode (`--auto`)

**Model: Sonnet.** Per
[[topics/sub-agent-model-selection-by-task-shape]] this skill outputs
structured YAML at scale and requires multi-step reasoning per note
(read body → judge claim → produce summary → inventory wikilinks →
classify each → assemble). The 2026-05-01 wave-1 Haiku run was 33%
malformed-YAML and 100% wrong-hash on the corrective `body_hash`
instruction; I had to fix all 30 records by hand. Sonnet's incremental
cost (~5× Haiku) is dwarfed by the cleanup cost when output is wrong.

Per-note enrichment is the canonical sub-agent task: each note is
independent, the work is textual reasoning over a single source, and
quality is consistent at Sonnet scale.

```
subagent_type: general-purpose
model: sonnet
description: Enrich N vault notes with agent: blocks
prompt: |
  Read ~/.claude/skills/vault-enrich-all/SKILL.md and follow the procedure
  for the next $LIMIT notes (the full ENRICHABLE set per the SKILL's
  canonical definition — NOT just permanent; skip notes with fresh
  `agent:` blocks unless --stale was passed).

  Critical:
  - Use `body_hash` for `derived_from_hash`, NOT `content_hash`.
  - Always double-quote the hash value in the YAML.
  - Use block-style YAML for lists (`-` prefix, one per line). Inline
    flow style (`[a, b, c]`) breaks on values containing commas/colons.

  Quality bar:
  - summary: lead with the claim, not the title rephrased
  - key_concepts: real noun-phrases, not generic words
  - tags_suggested: only existing taxonomy tags, or genuinely new ones;
    skip if uncertain
  - related_proposed: distance ≤ 0.30 only; conservative on ambiguous
  - edge_classifications: only when keyword cues are present; skip otherwise

  Return: {enriched: N, skipped_fresh: M, errors: K, summary: "..."}
```

Per-note cost (~1500 in / 300 out tokens at Sonnet rates) is a few cents
cent. Backfilling all enrichable notes is a few-dollar one-shot pass.

## When this is the right tool

- Backfilling enrichment after vault-storage deploy (one-shot).
- Refreshing notes after material body edits (`--stale`).
- Periodic densification of recent ingest output.

## Server-side integration (shipped)

As of vault-storage schema 5/6, the indexer fully consumes the `agent:`
block:

- **Schema**: `records.agent_summary` and `records.agent_derived_from_hash`
  columns store the parsed block. `JsonRecord` surfaces them in
  `/sections/{id}` responses.
- **Importer**: parses `agent.summary` and `agent.derived_from_hash` from
  FM. The hash is wrapped into `embedInputHash` so summary changes
  invalidate the chunk set the same way body edits do.
- **Chunker**: when `agent.summary` is set, prepends `${summary}\n\n` to
  every emitted chunk as a HyDE-style retrieval anchor.
- **`embedPending`**: joins `agent_summary` into the pending query and
  passes it to the chunker.
- **Staleness**: when `agent.derived_from_hash` diverges from the body's
  current hash, an `agent_enrichment_stale` suggestion is filed. Auto-
  resolves with `resolved_by='hash-matched'` when this skill's next pass
  refreshes the block.

So writing the `agent:` block here is a fully load-bearing index-time
input — not just durable FM the indexer treats as inert.

## Backend requirement

vault-storage on `:8123` is sufficient — it provides the structured
suggestion / similar / record_id endpoints that the procedure relies on for
candidate generation.

## Dependencies

- `vault-curl` on `$PATH`.
- `jq` for response parsing.
