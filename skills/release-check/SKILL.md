---
name: release-check
description: Pre-release verification checklist for AI-doc-style projects (the AGENTS.md / llms.txt convention) across the fleet. Use before publishing a new version, when the user invokes /release-check, or asks whether a project is ready to ship. Covers the release-or-not decision, docs sync, package.json + tarball hygiene, dependency sweep, lockfile regen, cross-runtime tests, and the version-tier choice. Companion to /ai-docs-update.
---

# Release Check

Run through this checklist before publishing a new version of any project that
follows the AGENTS.md / llms.txt convention. The skill verifies and reports;
it never commits, tags, or publishes on its own (see the final step).

## Step 0 — Decide whether to release at all

A release at any tier — even patch — needs **something the user can observe as
a benefit**: a bugfix, a perf improvement, new functionality, or a corrected
behavior. Pure internal changes (CI updates, repackaging, dev-dep bumps,
dependency syncs that don't change behavior, fleet-conventions sweeps, internal
refactors) accumulate **without** triggering a release — they get bundled into
the next release that has a user-facing reason to ship. Internal-only ≠ patch;
internal-only = **no release**.

1. List the changes since the last released tag: `git log <last-tag>..HEAD`.
2. For each, ask: is it user-observable as a benefit?
3. If **none** are: don't propose a release — say so and stop. The accumulated
   work waits for something that is.
4. If at least one is: continue, and pick the version tier per the rule at
   [[topics/semver-and-release-cadence]] (patch = safe-to-downgrade fix;
   minor = additive API; major = "practically a new project"). The full tier +
   cadence rationale and worked examples live in that vault note — it is the
   canonical release-decision reference.

## Steps

1. **Type sidecars (JS + `.d.ts` projects).** Every public `.js` file in `src/`
   has a corresponding `.d.ts` sidecar, and each `.js` that has a sidecar
   carries the `// @ts-self-types="./<file>.d.ts"` directive at the top
   (internal-only files with no `.d.ts` are correctly exempt). Skip for
   TS-source or single-file projects.
2. Check that `ARCHITECTURE.md` reflects any structural changes (if present).
3. Check that `AGENTS.md` is up to date with any rule or workflow changes.
4. Check that the retired mirror files (`.windsurfrules`, `.clinerules`,
   `.cursorrules`) are **absent** — remove them if found; never recreate them
   (mirrors retired fleet-wide 2026-07-04, `AGENTS.md` is the single
   cross-tool source). Same for an uppercase `.github/COPILOT-INSTRUCTIONS.md`
   (the lowercase `copilot-instructions.md` pointer is the read path).
5. Check that `llms.txt` and `llms-full.txt` are up to date with any API changes
   (run `/ai-docs-update` if not). If the project has a wiki, confirm
   `wiki/Home.md` links to all relevant wiki pages.
6. Verify `package.json`:
   - `files` array **includes** the source artifact (e.g. `src`) plus the
     consumer-facing AI-docs `llms.txt` and `llms-full.txt` — the
     machine-readable API reference an AI in a downstream project reads
     straight from `node_modules`, no network round-trip required. See
     [[topics/tarball-ai-docs-convention]] in the vault for the rationale.
   - `files` array **does not** include authoring-side docs or
     tool-local files — `AGENTS.md` / `ARCHITECTURE.md` (build/test/edit
     instructions and internal layout; useful only while *editing* this
     project, not while consuming it — no tool reads them from
     `node_modules`), `CLAUDE.md` (pointer to AGENTS.md), `.cursorrules` /
     `.windsurfrules` / `.clinerules` (byte-identical to AGENTS.md),
     `.claude/`, `.windsurf/`, `.github/`, `CODEBASE.md`.
   - `exports` map is correct (no transforming wildcards; see
     [[topics/full-path-imports-for-runtime-portability]]).
   - `description` and `keywords` are current.
   - **Executable `bin` (tidy, not load-bearing).** If `package.json` has a
     `bin`, shipping each bin target as git mode `100755` rather than `100644`
     is a small hygiene nicety (inspect with `git ls-files -s <bin>`; set with
     `chmod +x <bin>` then `git update-index --chmod=+x <bin>`). It is **not** a
     release blocker: npm sets the executable bit on bin targets when it
     installs a package and links them into `.bin`, so a committed `100644` bin
     still runs fine under `npx <pkg>` and global install. A `npx` "command not
     found" is almost never a mode-bit problem — the usual real cause is running
     `npx <pkg>@<version>` from **inside the package's own repo** at the version
     matching the local `package.json`, which makes `npm exec` resolve to the
     local, uninstalled package (no `.bin`) and exit 127. See
     [[topics/npx-command-not-found-from-own-repo]].
7. Check that the copyright year in `LICENSE` includes the current year
   (e.g. `2005-2024` → `2005-2026`).
8. Bump `version` in `package.json` per the tier picked in step 0
   ([[topics/semver-and-release-cadence]]).
9. Update release history. Check **both** locations and update each one that
   exists. They serve different audiences and carry different densities — see
   the cross-project rule at [[topics/two-tier-release-notes]] in the vault.
   - `README.md` — **cliff-notes**: the 1–2–3 most memorable items for users,
     comma-separated. Optional `Thx [Contributor](https://github.com/handle)`
     credit when the release responds to a specific issue or PR. No internal
     changes, no devDep bumps, no test counts, no CI moves. **One footer line
     at the bottom of the section, after the bullet list** (separated by a
     blank line, once per section, not per release). Exact wording is flexible
     (`The full release notes are in the wiki: [Release notes](...)`,
     `For more info consult full [release notes](...)`, etc. — all in use
     across the fleet); the placement is the rule. **If the project has no
     wiki Release-notes page, omit the footer line entirely** — don't link
     to something that doesn't exist.
   - `wiki/Release-notes.md` — the canonical longer-form history. A paragraph
     per substantive release with **bold** feature names; cover internal
     changes, calibration notes, related wiki / repo updates, and credits.
     Per-release date in the heading (use `git for-each-ref --sort=-creatordate
     --format='%(refname:short) %(creatordate:short)' refs/tags`).
     The wiki is usually a git submodule — it gets its own commit + parent-pointer bump.
   If the project doesn't yet have a wiki Release-notes page, create one,
   start the long-form convention with the *current* release, and reproduce
   the older README entries as-is in an "Earlier releases" section at the
   bottom (don't backfill detail you don't have). Then trim the README's
   current entry to cliff-notes density and add the section footer link.
   Don't update only the README — readers who follow the "for more info"
   link land on a stale page if you do.

   **Beyond the changelog — version-tied user docs default to docs-lead.** If
   any change in this release inverts or contradicts a claim in *other*
   version-tied user-facing docs (hosted wiki API/guide pages, migration
   guides, perf claims), **update those ahead of the tag too** — don't wait
   for the release. This is the fleet default: a claim that's now wrong about
   the *direction* of a change (e.g. a perf caveat the fix reverses) misleads
   worse than a merely-dated one. Avoid version-specific numbers if the bump
   isn't final — describe behavior qualitatively. (In-repo source/architecture
   docs from steps 2–5 describe HEAD and are corrected unconditionally anyway;
   this is specifically about the *published-version-tied* docs.) Docs-follow —
   leaving the claim until release — is the exception, taken only when the
   release is uncertain/far-off or published-version users would be actively
   misled by the lead. See [[topics/docs-lead-vs-follow-release]] in the vault.

   **Regenerate the wiki search index, if the wiki has one.** A
   `wiki-search` index (a committed `wiki/search-index.json`, as the
   stream-\* wikis carry) goes stale the moment you edit any wiki page
   above. Regenerate it before the wiki submodule is committed: from the
   wiki dir, `npx wiki-search-index --wiki . --repo OWNER/REPO` (the
   `--repo` is required when the submodule's SSH origin lacks the `.git`
   suffix the builder infers). The index is deterministic, so a
   committed-index diff-gate, where one exists, stays honest. Skip when
   the wiki has no `search-index.json`.
10. **Sweep dependencies to current — edit `package.json` directly.** Run
    `npm outdated` to identify what's behind, then **hand-edit `package.json`**
    to bump the version range for each reported line to the latest (e.g.,
    `"prettier": "^3.8.1"` → `"^3.8.3"`). Make these edits alongside step 8's
    version bump so all `package.json` changes land as one cohesive batch.
    **Bump everything `npm outdated` reports**, including in-range patches
    where `current < wanted` — leaving in-range patches alone ships stale
    deps and the next release-check sees the same diff again.

    Do **not** use `npm install <pkg>@latest --save-dev` (or `--save`) — it
    interleaves a `package.json` rewrite with an implicit lockfile regen and
    breaks the "edit `package.json` first, regenerate the lockfile after"
    pipeline this skill assumes. The hand-edit + step-11 regen is the
    intended order; that keeps every `package.json` change human-authored
    and reviewable as a single batch.

    For libraries the sweep is non-negotiable: stale ranges generate user
    complaints when consumers run a different version of the same dep. See
    [[dep-version-freshness]] in the vault for the full rationale and the
    "when adding" half of the rule.
11. **Regenerate `package-lock.json` — unconditional, after all `package.json`
    edits land.** Run `npm install` (or `npm install --package-lock-only`).
    Unconditional even when step 10 had nothing to bump: the lockfile records
    `version` at the root entry and the self-package entry, and step 8's
    version bump alone makes those stale. Skipping ships a tarball whose
    lockfile contradicts `package.json`. Diff should be minimal (root +
    self-entry `version`) when no deps were bumped — verify it's clean and
    move on.

    After the regen, re-run `npm run lint` (or whichever style check the
    project uses) — toolchain patches occasionally introduce new style rules
    (e.g., a Prettier patch can flag previously-clean files). Auto-apply via
    `npm run lint:fix` and review the diff before continuing.
12. **Run the test suite across the runtimes the project supports.** `npm test`
    (Node) is the floor; also run `npm run test:bun`, `npm run test:deno`,
    `npm run test:browser`, and the type checks `npm run ts-check` /
    `npm run js-check` **where those scripts exist** in `package.json`. The
    fleet supports all non-EOL Node + latest Bun + latest Deno
    ([[topics/js-runtime-matrix]]); a release verifies the matrix the project
    actually ships. Skip a runner only when a documented project deviation
    quarantines it (note it in the report).
13. Dry-run publish to verify package contents: `npm pack --dry-run`. Confirm
    the file list matches step 6 (source + `llms*.txt` + `LICENSE` + `README.md`,
    nothing authoring-side).
14. **Project-specific release steps.** If the repo's `AGENTS.md` has a
    "Releasing" section (or a `.claude/release-check.local.md` exists), perform
    those too — they extend this generic checklist rather than replacing it, so
    the project carries only its delta and this skill stays its single source
    (no fork to drift). Example: a native-addon project that ships a tagged
    GitHub release with CI-built binaries should verify the version tag
    triggered the binary build, the release exists, and the binary matrix is
    complete — recovering by re-running failed jobs (a transient/system
    failure) or deleting the release and its tag, fixing, then re-tagging to
    trigger a fresh build (a real failure).
15. Stop and report — do **not** commit, tag, or publish without explicit
    confirmation from the user. The user commits, tags, and publishes after
    their own review.
