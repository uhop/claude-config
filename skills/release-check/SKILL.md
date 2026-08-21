---
name: release-check
description: Read-only release-readiness assessment for AI-doc-style projects (the AGENTS.md / llms.txt convention) across the fleet. Answers "are we ready to publish?" — runs the bundled `release-digest.mjs`, judges whether anything here is worth releasing, picks the tier, and audits docs currency, then reports a verdict and stops. Writes nothing: no version bump, no release notes, no dep bumps, no lockfile. Use when the user asks whether a project is ready to ship, invokes /release-check, or wants to know what a release would involve. The mutating half is /release-prep; companion to /ai-docs-update.
---

# Release Check

Answers one question — **is this project ready to publish, and what would the
release be?** — for any project following the AGENTS.md / llms.txt convention.

**This skill writes nothing.** No version bump, no release notes, no dependency
edits, no lockfile regeneration, no index regeneration. It reads, judges, and
reports. Every problem it finds is reported as a finding, never fixed in place —
fixing is `/release-prep`'s job, and a question about readiness must never
mutate the tree it is asking about.

That is the whole point of the split: "are we ready?" is a question, and it has
to be safe to ask. If the user wants the release actually prepared, that is an
explicit, separate ask — hand off to `/release-prep`.

## Step 0 — Readiness: four questions, not one

[[topics/semver-and-release-cadence]] is canonical for all of this — read it
before answering, don't reconstruct it from memory. The four questions below
are what "are we ready to release?" actually asks.

### 0a — Is there enough material?

A release at any tier — even patch — needs **something the user can observe as
a benefit**: a bugfix, a perf improvement, new functionality, or a corrected
behavior. Pure internal changes (CI updates, repackaging, dev-dep bumps,
dependency syncs, fleet-conventions sweeps, internal refactors) accumulate
**without** triggering a release — downloading the new version would make no
difference to anyone. Internal-only ≠ patch; internal-only = **no release**.

The digest's `git.commits_since` block (step 1) is the change list. If no commit
is user-observable, the verdict is "nothing to release" — say so and stop; do
not reach for a patch to justify the run. The note's § Negative form is the
checklist for this.

### 0b — What tier?

Per the note's tier rule: patch = safe-to-downgrade fix; minor = additive
advertised API; major = "practically a new project". Ask **what the contract
requires**, not whether *an* argument exists for the higher tier — there always
is one, so that question ratchets upward every time. Reachability is not API.

### 0c — Is the work finished?

**An exhausted queue is the trigger.** Releasing mid-body-of-work is the thing
to avoid, so check the project's queue rather than assuming:

```
vault_queue_by_project({project: "<name>"})
```

- **Active must hold no actionable item.** One that is genuinely blocked or
  deferred pending an external trigger does not block the release — say which,
  and why, rather than reporting an empty check.
- **Sweep the Backlog for ride-alongs.** If small items could land in the same
  patch or minor, doing them first is better than a second release next week.
- **A multi-phase change ships whole.** Don't release between phase 1 and
  phase 2 unless phase 1 independently fixes something important and urgent on
  its own.
- **Two natural exceptions:** a "rewrite everything"-shaped Backlog item is a
  wall to release *against*, not a blocker; and a planned major is a hard wall
  — nothing rides along into it late.

### 0d — What else should ride along, and what would churn?

**Surface everything known-but-unqueued, now** — before the release, not after.
Anything this session turned up and didn't file, any defect *class* only
partially swept, any adjacent item you can see but nobody has written down:
name it here and propose queueing it. The agent sitting on unfiled work at the
moment the release decision is made is what manufactures a false "done", and
the follow-up release lands within the hour.

If you can see work that *should* exist but doesn't yet — a gap the release
makes obvious, a sibling of the thing just fixed — **suggest it now**. Waiting
until after the tag is what turns one release into three.

The goal behind 0c and 0d is **avoiding version and package churn**. Batching
beats a stream of releases; two releases of the same project in one day should
be an exception that was surfaced in advance, never a same-day repeat caused by
cutting the first one early.

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
dependency freshness (both `npm outdated`'s installed-behind class **and**
stale declared range floors, which `npm outdated` structurally cannot see —
each item carries `reason: "installed_behind" | "declared_floor_behind"` and
the `declared` range; see [[topics/dep-version-freshness]]),
lockfile-version sync, which test gates exist, and the
`npm pack --dry-run` tarball diff (required contents present, authoring-side
files absent — see [[topics/tarball-ai-docs-convention]] and
[[topics/full-path-imports-for-runtime-portability]] for the rules the
`pkg_files` / `pkg_exports` checks encode).

The digest is itself read-only — it probes and reports, so running it costs
nothing but time.

**Report every `action` as a finding**, with two judgment notes:

- `pkg_exports.flagged` entries may be documented project deviations — check
  `decisions.md` before calling one a problem.
- `bin_modes` is tidy, not load-bearing — npm sets the executable bit on
  install; a `npx` "command not found" is almost never a mode-bit problem
  (usual real cause: running `npx <pkg>@<version>` from inside the package's
  own repo — see [[topics/npx-command-not-found-from-own-repo]]).

## Step 2 — Docs currency (judgment the digest can't do)

Read and report; do not edit. A stale doc found here is a line item in the
verdict, and `/release-prep` fixes it.

- `ARCHITECTURE.md` reflects structural changes; `AGENTS.md` reflects rule /
  workflow changes.
- `llms.txt` / `llms-full.txt` are current with the API (`/ai-docs-update`
  refreshes them). If the project has a wiki, `wiki/Home.md` links all relevant
  pages.
- `description` / `keywords` in `package.json` still describe the project
  (the digest only checks presence).
- **Grep the docs for absolutes this release's features falsified.** Presence
  is not currency: adding a capability and documenting it *somewhere* leaves
  every sentence written when the old behaviour was the only behaviour, and
  those sentences are now wrong. For each feature in the change list, name the
  claim it contradicts and grep the whole doc set for it — leads, taglines,
  blockquote summaries, and the wiki Home paragraph, which are exactly the
  prose nobody re-reads because it was right for years. (Origin: 2026-08-08 —
  `double-meh-bundler` added a streamed `+jsonl` framing, and "returns all
  responses in **a single compressed envelope**" survived a 16/16 clean run in
  six files: README, `llms.txt`, `llms-full.txt`, `AGENTS.md`,
  `ARCHITECTURE.md`, `wiki/Home.md`. The streaming section had been added to
  all of them; only the openings stayed false.) The tell is an absolute —
  *all*, *every*, *a single*, *always*, *never* — next to a behaviour that just
  became conditional.
- **The mirror case: enumerated lists under-report when a guarantee _widens_.**
  The rule above catches prose that over-claims after a behaviour narrowed;
  the same currency gap runs the other way, and it hides better, because
  nothing in the docs has become false. A doc that lists what degrades, what
  is retried, what is contained — "bundler trouble, missing parts, and absent
  features" — silently under-promises the moment a release adds a member, and
  the reader never learns about the guarantee they would most want to rely on.
  The tell is an *enumeration* standing next to a behaviour this release
  extended, so grep for the list rather than for an absolute, and ask of each:
  is this set still complete? (Origin: 2026-08-08 — `double-meh-sw` 1.0.0
  contained cache-tier failures, so a quota error can no longer fail a
  response the network already delivered; six files enumerated the degradation
  set and not one of them named the tier. Caught only on the *second*
  /release-check of that session, because the fix landed between the two runs
  — a first run that is clean before the last commit proves nothing about the
  docs after it.) A second instance, 2026-08-18: `install-artifact-from-github`
  narrowed the mirror exemption so a mirror pointed back at the release
  location keeps its integrity check, and three files still enumerated "a
  custom mirror ⇒ not checked" — one of them directly above a paragraph that
  said the opposite.
- **Read every runnable snippet as someone pasting it, not as someone
  proofreading it.** Ask what the reader gets if they copy it verbatim: does it
  mount where they expect, is every identifier either defined or obviously a
  placeholder, does the happy path actually work? Snippet review defaults to
  scanning for *staleness* against the current API, which a snippet that was
  never right passes forever. (Same origin: `createServer(toNodeHandler(…))
  .listen(3000)` mounts the bundler on **every** path, so a copy-pasted server
  answers `GET /` with 405. It was wrong from the first commit, sat in README
  and `llms.txt`, and survived every prior review — the wiki carried the routed
  form the whole time.) Cross-check snippets that appear in more than one file
  against each other; a divergence usually means one of them is the wrong one.
- **No pointers into private or unpublished projects.** A package about to go
  public must carry no `dependencies` / `devDependencies` entry on a package
  that is not on npm, and no README / docs / example naming a private repo or a
  local filesystem path (`~/Open/<proj>`). Each breaks a different consumer:
  `npm i` fails on the first, the reader hits a 404 on the second. Load the
  private one dynamically (guarded `await import()`) and refer to it by name
  only. (Origin: 2026-08-06/07 — `invariants-sidecar` reached a release check
  still dev-depending on the private `apodict` **and** with a README pointing at
  its local path; both were caught by eye, not by this checklist.)

## Step 3 — Verdict, then stop

Report:

- **Ready or not**, in the first line.
- **Recommended tier** and the one-line reason, or "nothing user-observable —
  no release" when 0a came up empty.
- **Queue state** (0c): what is Active, what in the Backlog is actionable, and
  for each item left behind, why it does not block — never a bare "queue is
  clean".
- **Ride-alongs and unqueued work** (0d): what could land in this release
  instead of the next one, and anything known-but-unfiled, stated as a proposal
  to queue.
- **What `/release-prep` would do**: the version it would land on, the digest
  `action` items it would clear, the docs it would fix, the deps it would bump.
- **Blockers** that `/release-prep` cannot clear on its own (failing gates, a
  private-dependency pointer, an undecided design question, an unfinished phase).

Then **stop**. Do not bump the version, write release notes, touch
dependencies, regenerate the lockfile or the wiki index, or run the gates as a
side effect. If the report makes the release look obviously right, say so and
name `/release-prep` — the decision is still the user's to make out loud.
