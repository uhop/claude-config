---
name: vault-compact
description: "Compact an atomized folder of vault pieces by summarizing the oldest entries into a single summary file and archiving the originals to `<folder>/archive/<YYYY>/`. Mechanical work (inventory, selection, body + backlink gathering, the summary-note write, the record-id-preserving move loop) runs through the bundled `compact-batch.mjs`; the skill is the judgment layer — the summary prose. Use when the user says /vault-compact <folder>, asks to summarize a verbose project's logs/decisions, or wants to triage pending `compaction_candidate` suggestions. Originals are preserved (move not delete). Requires vault-storage (`:8123`)."
user_invocable: true
---

# Vault — compact a folder of pieces

Some folders accumulate pieces that no longer pull their weight individually
but still carry value as compressed history — `logs/` is the obvious case. A
compaction reads the oldest pieces, distills them into one summary file, and
moves the originals to `<folder>/archive/<YYYY>/` (by each piece's own
year). Originals stay reachable by direct read; default `/vault resume`
doesn't descend into `archive/`. Per design constraint C7.

## Surfacing candidates

The server files `compaction_candidate` suggestions for folders past the
piece-count threshold (`POST /maintenance/find-compaction-candidates`
refreshes; `/vault sweep`'s plan lists pending payloads). To decline one
(the folder's count is intentionally high): `POST /suggestions/{id}/reject`.
A completed compaction auto-resolves its suggestion on the next scan.

## Invocation

```
/vault-compact <folder>                        # summarize oldest 50% (≤ 20/pass)
/vault-compact <folder> --keep=N               # keep newest N; archive the rest
/vault-compact <folder> --before=YYYY-MM-DD    # archive everything created earlier
/vault-compact <folder> --dry-run              # plan + execute --dry-run
```

## Workflow

```bash
C=~/.claude/skills/vault-compact/compact-batch.mjs
W=$(mktemp -d)
"$C" plan <folder> [--keep=N | --before=DATE] --out="$W/plan.json"
# write the summary prose (§ Summary quality) to $W/summary.md; then:
"$C" execute --plan="$W/plan.json" --summary="$W/summary.md" [--related='[[a]],[[b]]'] [--dry-run]
```

`plan` inventories the folder (paginated, excludes `archive/` subpaths,
prior `_summary-*` files, `status: archived/superseded`, `type: state`),
selects per the mode (default oldest-50%, hard cap 20 per pass — repeated
passes beat one mega-summary; the plan flags truncation), fetches each
selected piece's body, gathers **external** inbound backlinks (linkers not
themselves being archived), suggests period groups (~5–10 pieces per
section: month → quarter → year), and names the summary path. `execute`
PUTs the summary note (FM built by the script; pass 1–2 current source
notes via `--related`) and moves each original via `POST /vault/move` —
**record_id preserved**, so edges, tags, embeddings, and the `agent:`
block survive; the old read+PUT+DELETE identity-loss pattern is dead. The
report itemizes every move (`from → to`) — feed that itemization into the
sweep/final summary verbatim, never bare counts. Exit 0 ok · 1 partial
failures · 3 rejected pre-write; run solo or `|| true` in parallel batches.

## Summary quality (the judgment)

One section per suggested group. Distill each group's pieces into a
cohesive paragraph or tight bullets. Surface: **what was done / decided /
discovered**; cross-references that still matter (link to *current* notes,
not archived ones); **concrete identifiers** — dates, commit shas, names,
numbers — the recall hooks; unresolved surprises (often the most valuable
trace in a noisy log). Drop: conversation paraphrase, progress narration,
context available elsewhere. The bar: a reader 6 months out learns each
archived piece's *outcome* without opening it.

Inbound wikilinks to archived pieces break on the next reindex — by design
([[topics/vault-hygiene-policy]]): the break is the signal to rewrite the
link, archive the linker, or accept it. The plan's `inbound_backlinks`
lists exactly which links will break; default to leave-broken unless the
user asked to rewrite.

## Sub-agent mode (deferred)

**Future model: Sonnet** — prose quality with concrete-identifier
preservation; cost-of-one-bad-output is high (a botched pass archives
originals out of the resume reading set). Currently main-session. A future
prompt must carry: the § Summary quality bar verbatim; conservative cut
(when in doubt, keep — re-run later beats over-compacting); don't rewrite
wikilinks unless authorized.

## When this is the right tool / not

Right: a folder past the C7 threshold; resume wasting tokens on stale
logs; "summarize and archive" asks. Not: `topics/` (every note stands
alone — compacting destroys the source-of-truth shape); folders too small
to bother; *deletion* intent (compaction is move-not-delete).

## Backend requirement

vault-storage on `:8123` (`VAULT_API_URL`/`VAULT_API_TOKEN` in `~/.env`);
`POST /vault/move` does the identity-preserving renames.
