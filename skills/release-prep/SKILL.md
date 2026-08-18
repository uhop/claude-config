---
name: release-prep
description: Prepare a release for AI-doc-style projects (the AGENTS.md / llms.txt convention) across the fleet — version bump, two-tier release notes, dependency sweep, lockfile regeneration, wiki search index, and the full test matrix, ending in a clean digest. Mutates the working tree, so it runs only on an explicit ask to prepare or cut a release; a question about readiness is /release-check instead. Never commits, tags, or publishes. Use when the user says to prepare/cut a release or invokes /release-prep. Companion to /release-check and /ai-docs-update.
---

# Release Prep

Takes a project from "the check says we're ready" to "everything is staged for
the user to review, commit, tag, and publish."

**This skill writes.** Version bump, release notes, dependency edits, lockfile,
wiki search index. That is why its precondition is stricter than
`/release-check`'s, and why the two are separate skills at all.

## Step 0 — Precondition: an explicit ask to prepare a release

The user must have asked, in this turn, for the release to be **prepared or
cut** — "prepare the release", "cut 1.8.0", "let's release this",
`/release-prep`. That is the ask; nothing else is.

What is **not** the ask, and must route to `/release-check` instead:

- "are we ready to publish?" / "can we ship this?" / "is this releasable?" —
  questions about state. Answering a question by changing state is the exact
  failure this split exists to prevent.
- an unreleased changeset on `main`, however tempting.
- a docket or task list saying a release is pending — including one the agent
  wrote itself.
- a generic "deal with it" / "finish up" / "what's next".

The release decision *and its timing* are the user's; he may deliberately batch
more work before cutting a version. When the ask isn't explicit, run
`/release-check`, report, and stop. (Origin: 2026-07-08 — an agent-authored
"housekeeping" docket label turned "deal with both housekeeping items" into an
unrequested 1.2.0 prep. Reinforced 2026-08-18 — "are we ready to publish?" was
read as a release ask and produced a full unrequested prep.)

## Step 1 — Run `/release-check` first

Run the read-only assessment end to end and take its output as this skill's
input: the tier, the digest `action` list, the docs-currency findings, and any
blockers. If the check's verdict is "nothing user-observable — no release",
stop and report that; do not manufacture a patch to justify the run.

A blocker the check flagged (failing gate, private-dependency pointer,
undecided design question, an unfinished phase of a multi-phase change) is
resolved before anything below, or reported and the prep abandoned. Do not prep
on top of a known blocker.

The check's queue and ride-along findings (its 0c/0d) are decisions for the
user, not for this skill to overrule: if it surfaced actionable Backlog items
that could ride along, confirm the release is still wanted *now* before
bumping. Releasing past them is what causes the same-day second release.

## Step 2 — Version bump

Bump `version` in `package.json` per the tier the check picked.

## Step 3 — Release history (two-tier) + version-tied docs

Check **both** locations and update each one that exists — they serve
different audiences ([[topics/two-tier-release-notes]]):

- `README.md` — **cliff-notes**: the 1–2–3 most memorable items for users,
  comma-separated. Optional `Thx [Contributor](https://github.com/handle)`
  credit. No internal changes, devDep bumps, test counts, or CI moves. **One
  footer line at the bottom of the section** (after the bullet list, blank
  line before it, once per section) linking the wiki release notes — omit the
  footer entirely when no wiki Release-notes page exists.
- `wiki/Release-notes.md` — the canonical longer-form history: a paragraph per
  substantive release with **bold** feature names, internal changes,
  calibration notes, credits; per-release date in the heading (dates from
  `git for-each-ref --sort=-creatordate --format='%(refname:short)
  %(creatordate:short)' refs/tags`). The wiki submodule gets its own commit +
  parent-pointer bump. If the page doesn't exist yet, create it starting with
  the *current* release, reproduce older README entries under "Earlier
  releases" (don't backfill detail you don't have), then trim the README entry
  to cliff-notes density. Never update only the README.

Fix the docs-currency findings the check reported here too — the falsified
absolutes and the under-reporting enumerations. They are release-blocking in
the sense that they ship wrong the moment the tag lands.

**Version-tied user docs default to docs-lead**: if any change in this release
inverts a claim in other published-version-tied docs (wiki API/guide pages,
migration guides, perf claims), update those ahead of the tag too — a claim
wrong about the *direction* of a change misleads worse than a dated one.
Avoid version-specific numbers when the bump isn't final. Docs-follow is the
exception (release uncertain/far-off, or the lead would actively mislead
published-version users). See [[topics/docs-lead-vs-follow-release]].

## Step 4 — Dependency sweep (hand-edit, then regen)

For every `deps_outdated` item, **hand-edit `package.json`** to the latest —
majors included, in-range patches included (leaving them ships stale deps and
the next release-check sees the same diff). Land these edits alongside step 2's
version bump as one reviewable batch. Do **not** use `npm install <pkg>@latest
--save*` — it interleaves a `package.json` rewrite with an implicit lockfile
regen; the hand-edit-then-regen order is the pipeline this skill assumes. Full
rationale: [[dep-version-freshness]].

## Step 5 — Regenerate the lockfile (unconditional)

After all `package.json` edits: `npm install` (or `--package-lock-only`).
Unconditional even with nothing bumped — the lockfile records the package
version at root + self entries, and step 2 alone made those stale. Verify the
diff is minimal when no deps changed. Then re-run `npm run lint` — toolchain
patches occasionally introduce new style rules; `npm run lint:fix` and review.

## Step 6 — Run the test matrix

Run every gate the digest's `test_matrix.gates` lists: `npm test` is the
floor; `test:bun`, `test:deno`, `test:browser`, `ts-check`, `js-check` where
present ([[topics/js-runtime-matrix]]). Skip a runner only on a documented
project deviation (note it in the report).

## Step 7 — Regenerate the wiki search index, last

After every wiki edit **and after the formatter has run over them**, from the
wiki dir: `npx wiki-search-index --wiki . --repo OWNER/REPO`. Order matters —
regenerating before `prettier --write` touches a wiki page re-stales the index
immediately, and the digest's `wiki_search_index` check will flag it on the
re-run. (Hit 2026-08-18.)

## Step 8 — Re-run the digest

After all edits, the digest must come back clean (`summary.clean: true`) —
this re-verifies the tarball against the bumped version and the regenerated
lockfile in one shot.

## Step 9 — Project-specific release steps

If the digest flags `agents_releasing_section` or `release_check_local`,
perform those steps too — they extend this checklist rather than replacing it
(the project carries only its delta; no fork to drift). Example: a
native-addon project verifying its tag-triggered CI binary build.

## Step 10 — Stop and report

Report the digest summary, gates run, notes written, and the full list of
uncommitted paths in every repo touched (parent + wiki submodule, wiki commit
before the parent pointer bump). Do **not** commit, tag, or publish — the user
commits, tags, and publishes after their own review.
