---
name: release-check
description: Pre-release verification checklist for AI-doc-style projects (the AGENTS.md / llms.txt convention) across the fleet. Mechanical checks (sidecars, retired artifacts, package.json + tarball hygiene, LICENSE year, dep freshness, lockfile sync, test-matrix detection) run through the bundled `release-digest.mjs`; the skill covers the judgment — release-or-not, version tier, docs currency, release notes, and running the gates. Use before publishing a new version, when the user invokes /release-check, or asks whether a project is ready to ship. Companion to /ai-docs-update.
---

# Release Check

Run through this checklist before publishing a new version of any project that
follows the AGENTS.md / llms.txt convention. The skill verifies and reports;
it never commits, tags, or publishes on its own (see the final step).

## Step 0 — Decide whether to release at all

**Precondition: the user explicitly asked for a release (or invoked
/release-check themselves).** An unreleased changeset on `main` is never, by
itself, a reason to start release prep — the release decision (and its timing)
is the user's; he may deliberately batch more work before cutting a version.
If the ask isn't explicit, stop here and surface the unreleased state as
information instead.

A release at any tier — even patch — needs **something the user can observe as
a benefit**: a bugfix, a perf improvement, new functionality, or a corrected
behavior. Pure internal changes (CI updates, repackaging, dev-dep bumps,
dependency syncs, fleet-conventions sweeps, internal refactors) accumulate
**without** triggering a release. Internal-only ≠ patch; internal-only =
**no release**.

The digest's `git.commits_since` block (below) is the change list. For each
commit ask: is it user-observable as a benefit? If **none** are, don't propose
a release — say so and stop. If at least one is, pick the tier per
[[topics/semver-and-release-cadence]] (patch = safe-to-downgrade fix; minor =
additive API; major = "practically a new project") — that note is the
canonical tier + cadence reference.

## Step 1 — Run the digest

```bash
~/.claude/skills/release-check/release-digest.mjs        # from the project root
```

One JSON report, 16 checks, each `ok | action | skip | error`; exit 1 when
anything needs attention (run it solo or `|| true` in parallel Bash batches).
`--no-network` skips the `npm outdated` registry call. It probes: last tag +
commits since (step 0's input), `.d.ts` sidecar pairing + `@ts-self-types`
directives, the retired-artifact removable set (mirrors, uppercase COPILOT,
`.windsurf/`, promoted-skill `.claude/commands/` copies), AI-docs presence,
`package.json` `files` / `exports` / `description` / `keywords` / `bin` modes,
LICENSE year, release-notes surfaces, wiki search-index staleness,
`npm outdated`, lockfile-version sync, which test gates exist, and the
`npm pack --dry-run` tarball diff (required contents present, authoring-side
files absent — see [[topics/tarball-ai-docs-convention]] and
[[topics/full-path-imports-for-runtime-portability]] for the rules the
`pkg_files` / `pkg_exports` checks encode).

**Fix every `action` before proceeding**, with two judgment notes:

- `pkg_exports.flagged` entries may be documented project deviations — check
  `decisions.md` before "fixing" one.
- `bin_modes` is tidy, not load-bearing — npm sets the executable bit on
  install; a `npx` "command not found" is almost never a mode-bit problem
  (usual real cause: running `npx <pkg>@<version>` from inside the package's
  own repo — see [[topics/npx-command-not-found-from-own-repo]]).

## Step 2 — Docs currency (judgment the digest can't do)

- `ARCHITECTURE.md` reflects structural changes; `AGENTS.md` reflects rule /
  workflow changes.
- `llms.txt` / `llms-full.txt` are current with the API (run `/ai-docs-update`
  if not). If the project has a wiki, `wiki/Home.md` links all relevant pages.
- `description` / `keywords` in `package.json` still describe the project
  (the digest only checks presence).

## Step 3 — Version bump

Bump `version` in `package.json` per the tier picked in step 0.

## Step 4 — Release history (two-tier) + version-tied docs

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

**Version-tied user docs default to docs-lead**: if any change in this release
inverts a claim in other published-version-tied docs (wiki API/guide pages,
migration guides, perf claims), update those ahead of the tag too — a claim
wrong about the *direction* of a change misleads worse than a dated one.
Avoid version-specific numbers when the bump isn't final. Docs-follow is the
exception (release uncertain/far-off, or the lead would actively mislead
published-version users). See [[topics/docs-lead-vs-follow-release]].

**Regenerate the wiki search index** after wiki edits (the digest's
`wiki_search_index` check flags staleness): from the wiki dir,
`npx wiki-search-index --wiki . --repo OWNER/REPO`.

## Step 5 — Dependency sweep (hand-edit, then regen)

For every `deps_outdated` item, **hand-edit `package.json`** to the latest —
majors included, in-range patches included (leaving them ships stale deps and
the next release-check sees the same diff). Land these edits alongside step
3's version bump as one reviewable batch. Do **not** use `npm install
<pkg>@latest --save*` — it interleaves a `package.json` rewrite with an
implicit lockfile regen; the hand-edit-then-regen order is the pipeline this
skill assumes. Full rationale: [[dep-version-freshness]].

## Step 6 — Regenerate the lockfile (unconditional)

After all `package.json` edits: `npm install` (or `--package-lock-only`).
Unconditional even with nothing bumped — the lockfile records the package
version at root + self entries, and step 3 alone made those stale. Verify the
diff is minimal when no deps changed. Then re-run `npm run lint` — toolchain
patches occasionally introduce new style rules; `npm run lint:fix` and review.

## Step 7 — Run the test matrix

Run every gate the digest's `test_matrix.gates` lists: `npm test` is the
floor; `test:bun`, `test:deno`, `test:browser`, `ts-check`, `js-check` where
present ([[topics/js-runtime-matrix]]). Skip a runner only on a documented
project deviation (note it in the report).

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

Report the digest summary, gates run, and notes written. Do **not** commit,
tag, or publish — the user commits, tags, and publishes after their own
review.
