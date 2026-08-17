---
name: process-review
description: Analyze one repo's git history for process signals — the same change reaching sibling files weeks apart, lines added-removed-re-added, many small commits where one belonged, version bumps clustered too close together. Use when the user invokes /process-review, asks "what can we learn from this project's history", or wants to find workflow inefficiencies that show up in how work landed rather than in the code. Report-only; findings route to the vault like /reflect's. Backed by `process-review.mjs` over `git log`.
user_invocable: true
---

# /process-review — learn the process from the commit history

Sibling to `/reflect`. Same spine — scan, dedupe, classify, report, route — but a
different input and a different question:

| | `/reflect` | `/process-review` |
| --- | --- | --- |
| Reads | session transcripts (`~/.claude/projects/**/*.jsonl`) | one repo's `git log` |
| Answers | how did the collaboration go? | how did the work *land*? |
| Scope | per-machine, local-only | per-repo, fleet-visible (git is shared) |
| Sees | what was said | what survived into history |

**Report-only.** Findings are candidates for judgment, never auto-applied — see
§ What it cannot see. Ruled 2026-08-17 (Eugene: on-demand per repo, report only).

## Invocation

```
/process-review                          # current repo, last 300 commits
/process-review <repo>                   # another repo by path
/process-review --since=2026-06-01       # window by date instead of count
/process-review --limit=500              # deeper history
/process-review --min-gap=7              # only lags >= 7 days (default 3)
/process-review --top=15                 # findings per category (default 8)
/process-review --with-transcripts       # annotate commits with the session + turn that drove them
```

The script exits `1` when anything was found, `0` on a clean repo — so run it in
its **own** Bash call, never co-batched (CLAUDE.md § Tools: a non-zero sibling
cancels the batch).

## The four detectors

All structural, all over `git log -U0`. Generated and vendored paths
(lockfiles, `dist/`, `search-index.json`, `*.min.*`, snapshots) are excluded
everywhere — identical boilerplate lines there recur across unrelated contexts
and match meaninglessly.

### `split_change` — the same change reached sibling files late

The highest-value signal, and the one that maps to a rule we already carry.
Added-line content from one commit reappearing in a *different* file in a later
commit — ≥ 2 shared lines, ≥ 50% Jaccard overlap, ≥ `--min-gap` days apart.

This is [[topics/touched-is-not-current]] and CLAUDE.md § Fix the class, not the
instance, detected **after the fact from history alone** — no transcript needed.
A hit means: someone fixed N call sites, shipped, and found the N+1th weeks
later.

Findings group by **commit pair**, not file pair: four ports fixed in one commit
and the fifth caught a month later is *one* lag, not four rows.

### `release_cluster` — version bumps close together

Commits whose subject matches a version-bump pattern, clustered within 3 days.
Maps to [[topics/semver-and-release-cadence]] § Release timing: two releases of
one project in a day should signal a critical bug, not an early cut. A cluster
of three or four is the shape that rule exists to prevent.

### `burst` — many small commits where one belonged

≥ 4 touches of one file inside 3 days averaging ≤ 40 lines each. Often benign
(an active feature under construction); interesting when the subjects read as
successive corrections of one idea rather than steps in a plan.

### `churn` — a line added, removed, and re-added

Oscillation across **separate** commits. Lines both added and removed inside one
commit are moves or reindents, not churn, and are excluded — without that filter
the detector reports every refactor. Also filtered: lines appearing in more than
three files (boilerplate, not a decision).

The noisiest of the four. Read the subjects before believing a hit: legitimate
design iteration looks identical to thrash in the diff.

## Procedure

1. **Run the scanner** in its own Bash call:

   ```bash
   WORK=$(mktemp -d) && node ~/.claude/skills/process-review/process-review.mjs <repo> --out="$WORK/scan.json"
   ```

2. **Read every finding against the actual commits before believing it.** The
   detectors are structural; only `git show <sha>` tells you whether a `churn`
   hit was thrash or a design that legitimately changed its mind twice. This is
   the same discipline `/reflect` step 7 carries: do not write a finding up from
   the scan excerpt.

3. **Dedupe against what is already written.** A `split_change` hit whose lag is
   already recorded in the project's `queue.md` or `decisions.md` is history, not
   news. Read the project's vault notes and `CLAUDE.md` before proposing
   anything.

4. **Route what survives**, using `/reflect`'s table:

   | Finding shape | Destination |
   | --- | --- |
   | A lag that a rule would have prevented, cutting across projects | claude-config `CLAUDE.md` |
   | A lag specific to one project's layout (N ports, N docs) | vault `projects/<name>/feedback.md` |
   | A concrete missed change still un-applied | that project's vault `queue.md` Backlog |
   | A repeated shape worth a named pattern | vault `topics/<slug>.md` |
   | Ambiguous — thrash or legitimate iteration? | `projects/agent-workflow/clarify-queue.md` |

5. **Report.** No standing report path — this is on-demand, so summarize in the
   session unless the run produced something worth filing, in which case write it
   under `projects/agent-workflow/reports/` like `/reflect` does.

## Transcript enrichment (`--with-transcripts`)

Git says a release cluster happened; the transcript says **why**. With the flag,
every commit inside a finding is annotated with the session it was made in and
the user turn that immediately preceded it — so a `release_cluster` reads:

```
2026-07-23  5dac30bb  New version: 1.16.1.
    driven by: `getErrorChain` is an internal function not used/visible by
    users. It is used only buy sister projects we control. I suggest 1.16.1.
```

That is the difference between "you released twice" and "here is the reasoning,
judge it". Backed by the shared correlator `git-correlate.mjs`, which this skill
owns and `/reflect` imports (same shape as `vault/vault-triage.mjs` serving the
`vault-review-*` skills).

**Coverage is deliberately sparse and the flag is off by default.** Transcripts
are per-machine and shallow — on this fleet they reach back about a month, while
git reaches back years. Measured on tape-six: **5 of 57** finding-commits
attributed over a 120-commit window, but **10 of 10** when the window is confined
to the transcript era. So a missing annotation means "no transcript", never "no
cause", and the enrichment must never be used as a filter. The correlation runs
the other way round in `/reflect`, where transcripts are primary and git coverage
is near-total — that is where the join earns most of its value.

## What it cannot see

**Git shows what landed, never what was discussed.** A `churn` hit cannot
distinguish an agent thrashing from a design that legitimately reversed twice
after new information. A `burst` cannot tell exploratory work from indecision. A
`split_change` cannot tell a missed sweep from a deliberate staged rollout.

That is why this is report-only and why step 2 is not optional. The detector
finds *shapes*; only the commits, and sometimes only the person, supply the
meaning. Treating a structural hit as a verdict is the failure this skill would
otherwise cause.

Two more limits worth stating:

- **Squashed or rewritten history hides the signal.** A repo whose branches land
  as single squashed commits shows no bursts and no churn by construction.
- **Renames break content matching.** `git log --follow` is per-path and does not
  compose with the whole-history diff walk, so a file renamed mid-window reads as
  two files.

## Related

- `/reflect` — the transcript-side sibling; same routing, same clarify-queue. It
  imports this skill's `git-correlate.mjs` for its Pass 4, and raises a
  `multi_release` signal (two releases in one session) at **high** confidence.
- [[topics/touched-is-not-current]] — the pattern `split_change` detects.
- [[topics/semver-and-release-cadence]] — the rule `release_cluster` checks.
- CLAUDE.md § Fix the class, not the instance.
