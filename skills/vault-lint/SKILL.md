---
name: vault-lint
description: Lint the vault for hygiene problems — broken wikilinks, frontmatter integrity, topic-note density, per-type currency/retention, and duplicate folders/titles — against the thresholds in topics/vault-hygiene-policy.md. Read-only: reports findings, never fixes. Use when the user says /vault-lint, asks to check vault hygiene / health, find broken wikilinks, or audit frontmatter. Backed by `vault-lint.mjs` over vault-storage's `/sections`. Distinct from the server-side `/system/lint` integrity check.
user_invocable: true
---

# /vault-lint — vault hygiene linter

Scans every indexed vault record via vault-storage's `/sections` and reports
hygiene findings across five categories. **Read-only** — it surfaces a working
list; it never edits the vault. Backed by `vault-lint.mjs`.

This is the **hygiene** lint the policy note `topics/vault-hygiene-policy.md`
specced. It is *not* the server-side `/system/lint` (which checks **integrity** —
embeddings, orphans, temporal anomalies, tag aliases). The two are
complementary: integrity = "is the index self-consistent", hygiene = "is the
content well-kept".

## Invocation

```
/vault-lint                       full human-readable report (exit 1 if findings)
/vault-lint --quiet               tab-separated `category<TAB>path<TAB>detail` lines, no caps (pipe/grep)
/vault-lint --category=a,b        subset of: frontmatter, wikilinks, density, currency, duplicates
/vault-lint --max=N               per-category cap in the full report (default 40; --quiet is uncapped)
/vault-lint --no-fetch            skip the per-note raw fetch that confirms density (faster, may over-flag)
```

Run it from anywhere — it talks to the vault API through `vault-curl`, not the
filesystem. Exit `0` clean, `1` on any finding, `2` on API error / bad flag.

```bash
~/.claude/skills/vault-lint/vault-lint.mjs            # or via /vault-lint
~/.claude/skills/vault-lint/vault-lint.mjs --quiet | grep '^wikilinks'
```

## Categories (thresholds from the policy note)

- **FRONTMATTER** — each note has `title`, `type`, `status`, `created`,
  `updated`; `created` parses and is ≤ `updated`. `_index.md` / `_about.md` are
  exempt from the `type` requirement; `type: state` notes are skipped entirely
  (managed by `/vault check`).
- **WIKILINKS** — every body `[[target]]` resolves (path-qualified by path, bare
  by basename). Code fences and inline-code spans are stripped first, so literal
  `` `[[x]]` `` examples don't false-fire. Links to moved/archived logs surface
  here by design (the policy's "rewrite, re-archive, or accept the break"
  signal).
- **DENSITY** — `type: permanent` (topic) notes need ≥ 2 outbound wikilinks
  (body **and** frontmatter `related:` both count — a note under 2 body links is
  raw-fetched to confirm before flagging). `type: project` notes flag only when
  truly isolated (0 outbound **and** 0 inbound). `status: archived/archive/done`
  notes are skipped.
- **CURRENCY** — per-type retention: `log` > 90 d (→ archive), `query` > 90 d
  **and** 0 inbound (→ archive), `fleeting` > 30 d (→ ingest/retire), `project`
  > 180 d (→ verify), `permanent` > 365 d (→ verify still current). Types with
  no retention rule (`design`, `research`, `queue-item`, `idea`, `index`,
  `meta`, `state`) are skipped.
- **DUPLICATES** — `projects/` subfolders whose names are near-identical
  ignoring case/separators (catches `tape-six` ↔ `tapesix`-style splits without
  flagging legitimate sibling families like `stream-chain` ↔ `stream-json`);
  plus near-duplicate note titles within one folder (dated series and
  log/state/queue-item/meta notes excluded). Heuristic — flagged for human
  review, not auto-merged.

## v1 scope & limitations

- **Archived notes** (`**/archive/**`) generate no findings but remain valid
  link targets, so links *to* them resolve.
- **`tags` presence is not checked** — tags live in a separate membership table,
  not on `/sections`. The other five required FM keys are checked. (Backfill
  candidate if it proves worthwhile.)
- **Only body wikilinks are checked for broken-ness**, not frontmatter
  `related:` links (that would need a full raw-file scan of all ~1k notes).
  `related:` links *do* count toward density (via the bounded raw-fetch).
- **Duplicate detection is conservative** — it misses digit-vs-word folder
  splits (`tape6` ↔ `tape-six`), the policy's own hard case, to avoid flooding
  on sibling-prefix families. Tune empirically per the policy's open question.
- **Report-only** — no auto-fix, despite the policy listing some
  auto-fixable classes. Fixing is a deliberate follow-up action (FM backfill,
  link rewrite, archival move), not a side effect of linting.
- Operates on **indexed records**; a note not yet imported won't be linted. Run
  `/maintenance/incremental-reindex` first if the tree may be ahead of the DB
  (`/vault resume` already does this).

## When to run

Periodically, and per the policy's "active hygiene practice": each `/vault
learn` / `/vault wrap` should pay down ≥ 1 finding for the project in scope
until the steady state is "lint clean at session end". The broken-wikilink
category is the highest-value — it doubles as the broken-`[[...]]` detector the
fleet-wide wikilink → markdown conversion work relies on.
