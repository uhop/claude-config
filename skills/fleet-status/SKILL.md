---
name: fleet-status
description: Collect the GitHub-side state of fleet repositories — security advisories (a CVE landing on a known GHSA), issues, PRs, discussions and the movement on them (comments, reactions), forks with the forker's login, star and watcher counts, releases, Dependabot and code-scanning alert counts, the last CI conclusion — diff it against the per-project baseline in the vault, file review-the-change items on each project's queue, and advance the baseline. Use when the user invokes /fleet-status (the fleet sweep), /fleet-status OWNER/NAME (one repository), or /fleet-status show (the dashboard in chat: the stored state and movement of one repository or the fleet, no GitHub access), or as the GitHub step of /vault resume for the current repository. Backed by `fleet-status.mjs` (read-only `gh api`; github.com only; public repositories only).
user_invocable: true
---

# Fleet status — GitHub changes across the fleet

Answers one question for the fleet, or for the repository you are in: **what changed on
GitHub since the last look?** The script collects and diffs; you read the events, write the
pre-reviews, and decide what deserves attention. Analysis only: no replies, no repository
changes (`projects/agent-workflow/feedback` 2026-08-27). Eugene posts and decides.

Design record: the `/fleet-status` item in `projects/agent-workflow/queue.md` (filed and ruled
2026-08-28). Origin: stream-json 3.6.0, where issue #216 and two private advisories were only
found by opening the repository by hand.

## What it tracks

Per repository, all read-only through `gh api`:

- **Security advisories** — `state`, `cve_id`, `severity`, `published_at`. GitHub exposes no
  "CVE requested" flag; the trackable event is `cve_id` flipping from `null` on a known GHSA.
- **Issues, PRs, discussions, and movement on them** — new items, state changes (open, closed,
  merged), comments (with who commented last), reactions on the item and on its comments. Bot
  authors (`dependabot[bot]`) are flagged, not dropped.
- **Forks, with the forker's login** — one sorted call; removed forks show as removals.
- **Stars and watchers** — counts and deltas. `--star-logins` fetches the stargazer set (paged,
  100 per page) for per-login events; count-only is the floor, ruled 2026-08-28.
- **Releases** — the GitHub release object (new, draft published), not tags: tags and npm
  publishes are the drift check's.
- **Alerts and checks** — open Dependabot and code-scanning alert counts by severity, and the
  conclusion of the default branch's newest workflow run that isn't Dependabot's updater (those
  run as `event: dynamic` and are often the newest run). A repository with the feature turned
  off reports `unavailable`, not an error.

Not tracked, by ruling: commits and pushes (`git` and `check-drift.sh` cover them), private
repositories, and dependents ("Used by" — no REST or GraphQL surface exists, and scraping the
page was ruled out).

## Invocation

Three forms, all through the same script:

```bash
S=~/.claude/skills/fleet-status/fleet-status.mjs
WORK=$(mktemp -d)
"$S" collect --cwd --out "$WORK/github.json"                  # the repository you are in
"$S" collect --repo OWNER/NAME --out "$WORK/github.json"      # one repository by name
"$S" collect --fleet --out "$WORK/github.json"                # every public repository
```

- `--cwd` resolves the repository from `origin`, and the vault project from `--project`, a
  `.claude/vault-project` file at the repository root, or the directory name — the same order
  `check-drift.sh` uses. **Safety gate:** a remote that isn't github.com, no remote, or a private
  repository (read from the repository metadata; `--fleet` filters those at enumeration) writes
  `{skipped: true, reason}` and exits `0`. Say nothing about it in a resume.
- `--fleet` enumerates `gh repo list` for the authenticated account (`--owner` to override):
  public, not archived, not a fork; 51 repositories on 2026-08-28. The project name is the
  repository name; 15 of the 51 had no `projects/<name>/` folder that day, and the first
  `commit` creates their `state.md`.
- `--show` prints the full text view after collecting: one block per repository — stars, forks,
  watchers, open counts, CI; alert counts; every advisory with its CVE or `no CVE`; open issues,
  PRs, and discussions with author, comments, reactions, and the last commenter; the latest
  release; then `changes since <baseline time>` as event lines, or `none`. `--brief` prints the
  brief (§ The brief). Without `--out` either replaces the JSON on stdout, so
  `fleet-status.mjs collect --cwd --brief` is the one-command look at a repository.
  `fleet-status.mjs show FILE [--brief]` renders a collected file the same way, with no GitHub
  or vault access.
- **Stored views, no GitHub access.** `fleet-status.mjs show --cwd` (or `--repo OWNER/NAME`, or
  `--project NAME`) renders the stored baseline — the state as of the last commit, marked
  `stored baseline as collected <time>` — followed by that repository's movement from the stored
  runs (§ Baseline storage), and says so when a project has no baseline yet.
  `fleet-status.mjs show --fleet` renders the brief over every stored run in the window, and
  `show --fleet --table` a Markdown table of standing counts per repository from every baseline:
  open issues, PRs, and discussions, stars, forks, published advisories (and how many lack a
  CVE), open alert counts, the last CI conclusion, and when it was collected. `--since WHEN` (an
  ISO date or time, or days back such as `7d`; default `7d` for the fleet, `30d` for one
  repository) or `--runs N` picks the runs.
- The dotfiles shim `fleet-status` (`private_dot_local/bin/executable_fleet-status`) runs the
  same script from any shell on a host with claude-config installed.
- `--since-days N` (default 30) sets the window for closed items on a first run; afterwards the
  window is the baseline's `collected_at`. Open items are read in full every run, because a
  reaction doesn't bump `updated_at`.
- Exit `3` means `gh` has no valid login on this host: the JSON carries `error: "gh_auth"` and
  the message names the fix (`gh auth login`). **Tell the operator**; never treat it as "no
  changes". Exit `2` is a missing tool (`gh`, `git`).

Run `collect` as its own Bash call — it exits non-zero on the auth and usage paths, and a
non-zero sibling cancels a parallel batch.

## The brief

The executive view: what moved, at a glance. One line per repository with movement, the
action-worthy events only, ordered by weight — advisories; then new issues, PRs, and discussions
by a person; then comments by someone else, state changes, releases, CI regressions, and alert
counts that rose — and one `counters` line for the rest: stars, forks with the forker's login,
watchers, reactions, bot items, and alert counts that fell. Then `first run`, `errors`, and
`quiet: N repositories`. Your own single comment on a thread and plain edits stay in the JSON.
Titles are quoted; a new item and a comment carry an excerpt — the first meaningful line of the
body, at most 120 characters (80 in the brief) — so a line reads as a summary without a click.
The output is similar to the following:

```
Fleet movement since 2026-08-28 20:42 — 51 repositories, 3 with movement
- node-re2: advisory GHSA-aaaa-bbbb-cccc got CVE-2026-1234; new issue #1346 by alice "Add a prebuilt for musl arm64" — Alpine containers on Graviton fall back to a source build, which takes 11…; issue #1345 "Segfault on Node 26 with unicode classes when…" +1 comment by bob: "Confirmed on arm64 too, trace attached. It goes away with…"
- stream-chain: new PR #88 by carol "Add AbortSignal support"; release 3.2.0 published
- deep6: CI Node.js CI: success → failure
- counters: stars +3 (node-re2 +3); forks +1 (stream-chain +1: dave); reactions +2 (stream-chain#88 +2); bots: PR deep6#41 by dependabot[bot]
- quiet: 47 repositories
```

The brief is the sweep's last word: `/fleet-status` ends the reply with it verbatim, after the
events and the review items. It is also what `commit` writes into the fleet digest, and what the
stored views render.

## Procedure

1. Collect, as shown in the preceding section. Progress goes to stderr (one line per repository,
   then a total), the digest to `--out`.
2. Read the digest **without the snapshots** — they are the baseline material, not something you
   need to know:

   ```bash
   jq '{totals, repos: [.repos[] | {repo, project, first_run, summary, errors, events}]}' "$WORK/github.json"
   ```

   A repository with `error` set could not be read at all (renamed, deleted, or unreachable);
   `errors` lists partial failures inside an otherwise good read (one endpoint, one item's
   comments). Report both.
3. For a `first_run: true` repository, report the snapshot summary in one line — open items,
   stars, forks, published advisories without a CVE — and file nothing. The baseline is the
   deliverable of a first run.
4. For every other repository, surface **every** event with full detail (an `/vault resume`
   prints them under a `GitHub:` heading), write the review items per § Review items, and end
   the reply with the brief, verbatim: `"$S" show "$WORK/github.json" --brief`.
5. Commit, after the items exist, so the baseline advances only for changes that have been
   filed:

   ```bash
   "$S" commit "$WORK/github.json"
   ```

   `commit` also prepends the run to the fleet digest `projects/agent-workflow/fleet-status.md`
   whenever it carried events, and always for a fleet run: one section per run — the brief, then
   a `json` block of the events — the last 30 kept. That block is what the stored views read
   back, so the events a resume consumed are still there for the next fleet look. Add
   `--dry-run` to see the writes without making them.

## The dashboard in chat

`/fleet-status show …` is a read, never a sweep: it advances no baseline and files nothing. Run
the form and put its output in the reply verbatim — the terminal shows the user only a few lines
of a tool's output, so the paste is the deliverable.

| Ask | Command |
| --- | --- |
| `/fleet-status show` | `"$S" show --cwd` — the repository you are in: stored baseline, then its stored movement |
| `/fleet-status show OWNER/NAME` | `"$S" show --repo OWNER/NAME` — the same for one repository |
| `/fleet-status show --fleet` | `"$S" show --fleet` — the brief over the stored runs of the last 7 days; `--since WHEN` or `--runs N` widens or narrows it |
| `/fleet-status show --fleet --table` | `"$S" show --fleet --table` — standing counts per repository |
| `/fleet-status show --live` | `"$S" collect --cwd --brief` (`--show` for the full view) — a fresh read of GitHub that is not committed, so the next sweep still sees the events |

A quiet repository in a `/vault resume` prints nothing (ruled 2026-08-29, less fluff); the
one-line summary is `show --cwd`'s job.

## Review items

A review item is a queue item meant to review one change; it goes under `## Active` on the
project's own `queue.md`, created in the convention's shape when the project has none. The script
does the placement; you write the body:

```bash
"$S" file --project NAME --title 'GitHub: OWNER/NAME#123 — Title of the issue' --body-file "$WORK/item.md"
```

- **Same title, updated in place.** An item that is still under Active when the next sweep or
  resume finds more movement is replaced, never duplicated (ruled 2026-08-28). The title is
  therefore the key: `GitHub: <repo>#<number> — <title>` for an issue or PR,
  `GitHub: <repo> discussion #<number> — <title>` for a discussion,
  `GitHub: <repo> <GHSA-id> — <summary>` for an advisory. Keep it stable across runs.
- **Which events earn an item:** a new issue, PR, or discussion by a person; a comment by
  someone other than Eugene; reactions on an open item; any advisory event; a CI run that
  stopped succeeding; an alert count that rose. Counters (stars, forks, watchers) and bot
  traffic go to the digest and the resume output only — that boundary is a proposal, trim it
  with Eugene.
- **Body = the pre-review**, in this order: what changed (the event lines, with URLs); how
  meaningful it is; your opinion; proposed actions; and, when a reply is warranted, a paste-ready
  draft response in its own fenced block per `topics/paste-ready-markdown-for-markdown-systems`.
  End with `Last seen: <collected_at>`. Preserve the prose on an update — the item accrues.
- An item closes when Eugene archives it (`queue-archive.md`) or the thread closes upstream; a
  closed thread's item is not refiled.

## Baseline storage

The baseline lives beside the drift check's, in `projects/<name>/state.md`, as a `## GitHub`
section holding one fenced `json` block (the collected snapshot: metadata counts, advisories,
open and recently updated items, discussions, fork logins, releases, alert counts, the last CI
run, and `collected_at`). `commit` replaces the block in place (`POST /vault/edit`, asserted),
appends the section to a `state.md` that lacks it, or creates the document with the drift
check's frontmatter. `check-drift.sh --update` preserves the section when it rewrites its own
block (patched 2026-08-28) — an older copy of that script on another host drops it, and the only
cost is that the next collection there reads as a first run.

Fleet-shared by construction: Eugene works from seven hosts, and a resume on one host makes
what it saw not-new to the next sweep anywhere. That is the intended meaning of a shared
baseline.

The fleet digest `projects/agent-workflow/fleet-status.md` is the second store, written by
`commit` for every run that carried events (and every fleet run): one section per run, newest
first, the last 30 kept — the brief, then a `json` block
`{collected_at, mode, gh_user, totals, repos: [{repo, project, first_run, since, events, summary, errors}]}`,
events only, no snapshots. `show --fleet` and `show --repo` merge the blocks in the window into
one brief; sections written before 2026-08-29 have no block and are skipped. A baseline answers
"what is the state", the digest answers "what moved since when" — which is what lets collection
move to a schedule without consuming what a later look needs.

## Output shape

The digest is `{collected_at, mode, gh_user, repos, totals}`; each entry in `repos` is
`{repo, project, first_run, collected_at, events, summary, errors, snapshot}` or, when the
repository could not be read, `{repo, project, error, events: [], summary}`. Event kinds:

| Kind | Meaning |
| --- | --- |
| `advisory.new`, `advisory.cve_assigned`, `advisory.state`, `advisory.updated` | An advisory appeared, got its CVE, changed state, or changed otherwise |
| `issue.*`, `pr.*`, `discussion.*` with `.new`, `.state`, `.comments`, `.reactions`, `.updated` | An item appeared, changed state, gained comments (`delta`, `last_comment`), gained or lost reactions, or changed in another way (labels, edits) |
| `fork.new`, `fork.removed`, `forks.count` | A fork by `login`; the count alone when the list could not be read |
| `stars.count`, `star.new`, `star.removed`, `watchers.count` | Count deltas; per-login events only with `--star-logins` |
| `release.new`, `release.published` | A release object appeared or left draft |
| `alerts.dependabot`, `alerts.code_scanning` | The open alert count moved |
| `ci.conclusion` | The default branch's last run conclusion changed |

Every event carries `kind` and `repo`; item events carry `number`, `title`, `author`, `bot`, and
`url`. An item that is not in the baseline but predates it comes as `.updated` with
`note: "not in baseline"`, not as `.new`. `.new` and those `.updated` events carry `excerpt` — the
first meaningful line of the body, Markdown links reduced to their text, HTML comments dropped,
at most 120 characters — and `.comments` events carry `last_comment: {author, at, excerpt}`;
snapshot items and discussions store the same two fields.

## Limits worth knowing

- Comments are scanned per item for the 60 items with the most comments per run
  (`summary.comment_scan` is `capped` past that); reactions on comments of the rest are not
  compared that run.
- A reaction on a closed item older than the window is invisible until something else bumps the
  item.
- Discussions are read 100 per page, five pages at most, newest-updated first.
- Alert lists are one 100-item read each (the Dependabot endpoint rejects page numbers); past
  100 open alerts the count carries `truncated: true` and is a floor.
- Reading 51 repositories costs a few hundred REST calls plus one GraphQL call per repository
  with discussions (nine on 2026-08-28) — well inside the 5,000-per-hour limit, and `--star-logins`
  adds one call per 100 stars.
- The digest page and every `state.md` carry `type: state`, so the enrichment and review sweeps
  leave them alone.

## Dependencies

- `gh` — authenticated as the fleet's account on the host (`gh auth status`); `repo` scope
  covers advisories and both alert endpoints (verified 2026-08-28).
- `git` — remote resolution for `--cwd`.
- `VAULT_API_URL` / `VAULT_API_TOKEN` — the baseline, the queue items, and the digest (server
  ≥ 2026-07-24 for `POST /vault/edit`).
- `jq` — reading the digest in the procedure; the script itself doesn't need it.
