---
name: vault-review-tags
description: Triage pending tag-related suggestions — `new_tag` (an unknown tag is on FM, decide canonical/alias/typo) and `tag_suggestion` (agent thinks this record should also have tag X, decide accept/reject). All mechanical work (list/claim, context + taxonomy gathering, FM tag strips, batch resolve, reporting) runs through the shared harness `~/.claude/skills/vault/vault-triage.mjs`; this skill is the judgment layer. Use when the user says /vault-review-tags, asks to clean up the tag taxonomy, or wants to chip away at either tag-review queue. Requires vault-storage (`:8123`).
user_invocable: true
---

# Vault — review tag suggestions

Two distinct suggestion kinds, both about tags:

- **`new_tag`** — a tag is on a record's FM `tags:` but isn't in the taxonomy
  (or aliased to one that is). Decision **per unique tag** (the worksheet
  groups records for you): canonical, alias, or typo.
- **`tag_suggestion`** — the agent's `agent.tags_suggested` includes a tag
  not yet on the record's FM `tags:`. Decision **per suggestion**
  (record × tag): accept or reject.

## Invocation

```
/vault-review-tags                          # interactive: next batch of new_tag groups
/vault-review-tags --kind=tag_suggestion    # triage agent-judged additions instead
/vault-review-tags --limit=N                # custom batch (1..100)
/vault-review-tags --auto [--kind=…] [--limit=N]   # Sonnet sub-agent for bulk
```

When `--kind` is omitted, `new_tag` is the default (older, larger queue).

## Workflow

The shared harness does everything except the judgment:

```bash
V=~/.claude/skills/vault/vault-triage.mjs
W=$(mktemp -d)

# 1. prepare — list (solo) or claim (concurrent/sweep) a batch → worksheet
"$V" prepare new_tag --limit=25 --out="$W/ws.json"
"$V" prepare new_tag --claim --holder="$HOLDER" --limit=100 --out="$W/ws.json"

# 2. judge — read the worksheet, write the decisions map
#    (start from .decisions_template; null = skip / leave pending)

# 3. resolve — validates first (nothing written on a bad file), then executes
"$V" resolve new_tag --worksheet="$W/ws.json" --decisions="$W/dec.json"
```

The worksheet carries what judgment needs: per-tag record briefs +
`taxonomy` status + `neighbors` (nearby canonical tags) for `new_tag`;
per-item `in_taxonomy` / `canonical` for `tag_suggestion`; `path_moved`
flags where a record relocated since filing. `resolve` performs the
taxonomy/alias POSTs, the per-record FM tag strips (server-side membership
primitive — no client read-modify-write), one `resolve-batch`, and reopens
claimed-but-skipped items; it prints a JSON report. Exit 0 ok · 1 partial
failures (`failures[]` in the report) · 3 decisions file rejected before
any write. Run it solo or guard with `|| true` in parallel Bash batches.

Decisions shapes:

```json
{"coherent-concept": {"action": "taxonomy", "description": "one-line"},
 "ml":               {"action": "alias", "canonical": "machine-learning"},
 "wip-fix-later":    {"action": "reject"}}
```

```json
{"<suggestion-id>": "accept", "<other-id>": "reject", "<third-id>": "defer"}
```

## Judgment — `new_tag` (per unique tag)

| Action | When to choose | Effect |
|---|---|---|
| **taxonomy** | Genuinely new concept worth canonical vocabulary; distinct from every existing tag's meaning. | Tag minted; affected records auto-link; pending suggestions auto-accept. |
| **alias** | Synonym / abbreviation / alternate spelling of an existing canonical (`ml` → `machine-learning`). The canonical must already exist. | Future uses auto-rewrite to canonical; records get the canonical link. |
| **reject** | Typo, joke, single-use marker, oversharded ("misc-stuff"). | The tag is stripped from every affected record's FM; suggestions rejected. |

Tag shape rules (taxonomy CHECK constraint): lowercase, alphanumeric +
hyphens only. Aliases: lowercase only. Use the worksheet's `neighbors`
list to spot the alias-vs-new call; check both meanings before aliasing —
an alias that loses specificity (`indexer-design` → `indexing`) is wrong.

**Bias: prefer taxonomy-add when in doubt** for coherent concepts; reject
only clear typos/markers. A wrong reject destructively strips tags from
records (the recorded Haiku failure mode — § Sub-agent mode).

## Judgment — `tag_suggestion` (per record × tag)

| Action | When to choose | Effect |
|---|---|---|
| **accept** | The tag accurately describes the record and matches how the tag is used elsewhere. | Server realizes it on FM `tags:`; row settles as `tag-realized`. |
| **reject** | Tangential, redundant with an existing tag on the record, or misframes the content. | Row flips; candidate stripped from `agent.tags_suggested`. |
| **defer** | Valid tag but not yet in the taxonomy, and you don't want to mint a canonical here. | Left pending (claim released); taxonomy expansion belongs in the `new_tag` flow. |

**Bias toward accept** — `tags_suggested` was produced under
suggest-only-confidently-relevant instructions. Reject only on clear
misframing. The harness **enforces taxonomy-first**: accepting a tag that
is neither canonical nor aliased is refused before any write (exit 3) —
mint it via a `new_tag` decision first, or defer.

## Sub-agent mode (`--auto`)

**Model: Sonnet** (bumped from Haiku 2026-05-01 — see
[[topics/sub-agent-model-selection-by-task-shape]]). Haiku's production run
inverted the accept-bias and wrongly stripped tags from 11 of 15 records
(~73% destructive-error rate on rejects) while ignoring the batch limit;
wrong-rejects are data loss (FM strip), so the cheap model is unsafe here.

```
subagent_type: general-purpose
model: sonnet
description: Triage N tag suggestions
prompt: |
  Read ~/.claude/skills/vault-review-tags/SKILL.md. Using the vault-triage
  harness exactly as its Workflow section shows: prepare kind $KIND with
  --claim --holder "$HOLDER" --limit $LIMIT, judge every worksheet item per
  the skill's Judgment section (its stated biases are binding), write the
  decisions file, resolve. Use "defer"/null rather than forcing a decision
  on genuinely ambiguous items — the harness reopens them.
  Return: the harness's JSON report plus a one-paragraph summary noting any
  ambiguous items you skipped.
```

## When this is the right tool

- `/vault resume` or `/vault sweep` shows a non-zero `new_tag` /
  `tag_suggestion` queue.
- The user adds a tag and the indexer logs "rejected".
- Periodic taxonomy curation.

## When NOT to use this

- Renaming or deleting an existing canonical — taxonomy migration, out of
  scope.
- Other suggestion kinds — `/vault-review-edges`, `/vault-review-duplicates`.

## Backend requirement

vault-storage on `:8123` (`VAULT_API_URL`/`VAULT_API_TOKEN` in `~/.env`).
The harness needs the 2026-07-13+ claim/resolve-batch endpoints; on an
older server fall back to this file's git history (pre-harness procedure).
