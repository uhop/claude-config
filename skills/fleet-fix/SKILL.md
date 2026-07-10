---
name: fleet-fix
description: Audit the current project against the fleet standards (topics/fleet-conventions-bundle in the vault) and fix deviations in the same session unless a documented project-level override, an absent precondition, or a user-side boundary excepts them. Use when the user invokes /fleet-fix, asks for a fleet-standards audit / conformance check, or says "bring X to the fleet standard". Fixes are local working-tree edits only; GitHub-state and npm mutations are reported for the user. Companion to /release-check and /ai-docs-update.
user_invocable: true
---

# /fleet-fix — fleet-standards conformance audit + fix

One project, one session: read the standard from the vault, audit the current
project against it, fix what deviates, record the result. This skill is the
**procedure**; the **standard** lives in the vault and is read fresh every
run. Never hardcode slice content here — a checklist copied into this file
would drift from the bundle the first time the bundle changes.

## Sources of truth

- **`topics/fleet-conventions-bundle`** — the umbrella note: numbered slices,
  the compliance checklist (inventory order), the application-cadence rule,
  the deviation policy, the project list, adoption snapshots. Read it FIRST:
  `vault-curl /vault/topics/fleet-conventions-bundle.md -s`. Sister repos may
  themselves be behind — never infer the standard from a sister; when a
  sister is the sanctioned copy source for a config file, the bundle says so.
- **`projects/<name>/decisions.md`** — the audited project's documented
  overrides and prior audit records. Read it BEFORE flagging anything: the
  bundle's rule is "be on the standard *or* document why you're not", so a
  recorded rejection is compliance, and an undocumented gap is a violation.
- Follow the slice links (`topics/<slice-note>`) only when the one-line rule
  plus checklist entry leave real ambiguity for a finding you are acting on.

## Procedure

1. **Identify the project** — cwd, `git remote`, `package.json#author`. The
   audit scopes to this project only; never sweep sibling repos unbidden.
2. **Read the bundle, then the project's vault notes** (`decisions.md`;
   `queue.md` for context). Collect the documented overrides into a skip list
   before the first check.
3. **Honor the bundle's list-maintenance rule** — if the project qualifies
   for the fleet list (Eugene-authored; `uhop` org — ask before adding other
   namespaces) and is missing, backfill it in the same session. Body-only
   edits to the bundle note go as a markdown round-trip (GET, edit body only,
   PUT back with `If-Match`); verify each substitution pattern matches
   exactly once before applying.
4. **Inventory** the repo against the bundle's compliance checklist, in its
   order, every applicable item. Batch the read-only probes in parallel Bash
   calls, but guard every fallible sibling with `|| true` — `gh api` 404s
   (code scanning not enabled, no license) and `grep` misses cancel co-batched
   calls otherwise. `gh` reads are fine; `gh` mutations are gated and are not
   part of an audit anyway.
5. **Classify every finding, then act** (the cadence rule: a standards event
   applies every applicable slice in-session; fixing findings is itself a
   standards event — nothing gets queued to the backlog):
   - **Fix now** — local file edits, config backfills, rebuilds (e.g. a stale
     generated index). Apply immediately.
   - **Documented override** — cite the `decisions.md` entry and move on.
   - **Precondition absent / nothing to act on** — e.g. no wiki, not
     published to npm, no tags yet. Skip; if the skip is durable and not yet
     on record, document it in `decisions.md` as part of this audit's record.
   - **User-side** — anything mutating GitHub state (enabling CodeQL /
     code scanning, repo settings, releases, issues) or npm. Report the exact
     gap and the enabling action; never attempt it.
6. **Verify** with the project's own gate (the AGENTS.md "gate before
   shipping"), scaled to what was touched: config/docs-only fixes → lint;
   source changes → the full gate (lint + type checks + tests on every
   runtime the project claims).
7. **Record the audit** in `projects/<name>/decisions.md` — one bullet:
   date, compliant/fixed/skipped-with-reason, user-side residue. Use the
   vault's JSON write path with `If-Match` and refresh the note's `agent:`
   block in the same PUT. Update the bundle note's adoption snapshots where
   its checklist carries them for a slice you touched.
8. **Report** in four buckets: fixed, user-side (yours), documented overrides
   honored, cleared non-findings. Leave all changes in the working tree.

## Triage precedent — recurring non-findings

Judgment calls that have come up before; the bundle wins on any conflict, and
entries the bundle later absorbs should be pruned from this list.

- Inline `/** @type {...} */` casts in `.js` are js-check boundary plumbing,
  not the banned JSDoc-in-`.js` — the slice-7 rule is about types + docs
  living solely in `.d.ts`, not about cast expressions.
- Unpublished-to-npm projects: npm shields present ahead of first publish or
  absent per the skip — either is compliant.
- `.claude/settings.local.json` is workflow-dependent (interactive sessions
  carry it, auto-mode projects deliberately don't) — absence is not a gap.
- "no analysis found" from the code-scanning API means scanning is not
  enabled: the alert review is vacuous, and enabling CodeQL is the user's
  op — report it, don't chase the missing scope hint in the gh error.

## Boundaries

- Vault writes follow the vault skill's rules (JSON write path for anything
  touching frontmatter, `--arg`/`--rawfile` for prose, `If-Match` on shared
  docs, scratch under `mktemp -d`).
- No `git commit` / `push` / `tag` / `npm publish` — the audit ends at a
  verified working tree and the report.
