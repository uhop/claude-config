# Capturing a session

Part of the vault skill: the table in its `SKILL.md` says which file holds a section named here.

### /vault learn

Extract learnings from the current project/session.

1. Identify the current project from git remote, directory name, or ask
2. Read existing project notes if they exist (`projects/{name}/`). The dedup
   pass needs **full bodies**: `vault_resume_bundle({project, logs: 0,
   project_bodies: ["feedback", "learnings", "decisions", "stack", "queue"]})`
   on adapter 0.1.0+ — name `feedback` explicitly: named files bypass the
   bundle's 32 KiB budget, and a mature feedback body is budget-gated when
   unnamed (server ≥ 2026-08-04). On a pre-0.1.0 adapter the parameter is
   missing — stay on curl for this call:
   `vault-curl "/system/resume-bundle?project=<name>&logs=0&project_bodies=feedback,learnings,decisions,stack,queue" -X POST -s`.
3. Analyze recent work: git log, changed files, decisions made
4. Create or update `projects/{name}/learnings.md`, `decisions.md`, `stack.md`. A learnings note kept as a folder (`projects/{name}/learnings/`, its `_about.md` opening "Atomized from") follows its `_about.md`, so read it first: a folder `/vault-reorg` made (apodict's since its 2026-10-27 reorganization) takes a new lesson as one bullet in its subject's piece, and a folder `vault_split` made takes a new lesson appended to `learnings.md` as a `## ` section, which becomes a piece of its own (§ A split note). A note past its size bound is split losslessly with `vault_split`, and `/vault-reorg`, which drops dead lessons and costs millions of tokens, runs only on Eugene's word.
5. Extract cross-project patterns into `topics/` notes (e.g., "api-rate-limiting", "docker-networking"). Propose-then-write: before creating, check neighbours with `POST /vault/propose` (search-before-write); if an existing note already covers the concept, extend it, and if the new write would *replace* it wholesale, use `POST /vault/supersede` rather than minting a near-duplicate. When creating a new topic note here, enrich at capture per the `/vault ingest` step 5 procedure — write the `agent:` block in the same PUT, with `complexity` one of `prose` | `code-heavy` | `tabular` | `mixed` | `hub` | `log-entry`, never a judgment word.
6. **Promote this session's new durable local memories into the vault.** During the session the agent's auto-memory writes land in *per-machine* local memory (`~/.claude/projects/<hash>/memory/`), which is not fleet-shared. For each `feedback_*.md` / `project_*.md` written or materially updated this session, route it by the `projects/agent-workflow/decisions` D1 table — feedback rules → `projects/<name>/feedback.md`, project facts / deferred options → `decisions.md` / `queue.md` Backlog — **deduped and propose-then-confirm**, never a blind copy. Most candidates are already captured elsewhere: verify against `decisions.md` / `learnings.md` / global `CLAUDE.md` / existing `topics/` first (per `topics/project-feedback-md-convention`). The vault is the durable source of truth; where a local memory is promoted, leave a thin local pointer rather than a duplicate fact (double-writing the same rule to both stores reintroduces drift). This makes the local→vault migration continuous so per-machine memories stop accumulating. This is the **write path** that pairs with `/vault resume`'s read of `feedback.md`.

### /vault log {description}

Save a session log: its text in a data file of its own, and a `log` line in
the project's month file of session records that names it (vault-storage
10e-2, question 225). The server pairs the line with the session's `end` line,
which the SessionEnd hook appends, by the holder id, and the resume bundle
lists the line among the logs with the body's path as `data_path`.

1. **Write the body** to
   `projects/<project>/data/sessions/logs/YYYY-MM-DD-<session-prefix>-{description}.markdown`,
   `<session-prefix>` the first eight characters of the session id, so two
   sessions never share a file. Record what was done, decisions made, and key
   files touched, with a `## Open` of unresolved questions and pending items, one
   bullet each, and a `## Next` naming the upcoming task when one is set, since
   the next resume relays those two as written. Cite notes by their backticked
   paths: a data
   file is never parsed, so its links are not read, and a durable note cites
   this body's path the same way. Write it with `vault_data_write` (`op:
   "replace"`), or, until the adapter's next publish carries that tool,
   `vault-curl /data/<path> -X PUT -H 'Content-Type: text/plain; charset=utf-8'
   --data-binary @<file>` from a file in a `mktemp -d` folder.
2. **Then append the line** to `projects/<project>/data/sessions/<YYYY-MM>.jsonl`,
   the month of now, one JSON object ending with a newline, built with
   `jq -cn` so its quoting holds:
   `{"kind": "log", "at": "<now>", "holder": "<holder>", "title": "<project>: <what the session did> (<YYYY-MM-DD>)", "summary": "<two to four sentences: what was done and what is open>", "body": "<the body's path>"}`.
   `at` comes from the machine's clock, never a time you write yourself:
   `jq -cn --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" …`, the clock and format
   the SessionEnd hook stamps `ended` with, since the server pairs a wrap's
   line with its holder's first end at or after `at`, and a guessed time past
   the end pairs with none, so the session reads as unlogged and the next
   resume writes its log again. `holder` is this session's own as the session-start `[vault] lease:` line
   names it, `<hostname -s>/<session-prefix>`, the expression the SessionEnd
   hook builds its `end` line's holder with; a different one pairs with no
   session, and the session reads as unlogged. The line names no `ended`: the
   server pairs it with its holder's first `end` after it, so a session resumed
   after its wrap, which keeps its holder, owes a log for the work after. Append with `vault_data_write`
   (`op: "append"`) or `vault-curl /data/<path> -X POST -H 'Content-Type:
   text/plain; charset=utf-8' --data-binary @<file>`; a POST creates the
   month's file on its first line. The body goes first, so a log cut short
   leaves a body no line names, never a line naming no body. The `summary` is
   what the next resume reads in place of the body, as a log note's
   `agent.summary` was: no `agent:` block, tags, or edges, since a data file is
   never indexed.
3. Log notes under `logs/` are no longer written; the ones there expire at 90
   days (§ /vault lint's retention).
4. **Refresh the drift baseline.** Run
   `~/.claude/skills/vault-check-drift/check-drift.sh --update` from the project
   directory so the next `/vault resume` starts from a clean baseline (the
   session's commits / tags / `npm publish` are typically done by the time
   you're logging). Bootstraps `state.md` if the project has no baseline yet.
   Exit 2 means the baseline could not be read and nothing was written, so say
   so in the report: the session's commits show as drift at the next resume.
   Skip only when there's no project working directory in scope (rare —
   logging cross-project work, vault-only sessions).

### /vault wrap [optional log slug]

Close the session cleanly — symmetric counterpart to `/vault resume`. Bundles
learning extraction, session log, and drift baseline refresh into one step so
nothing the session produced gets lost.

1. Run the `/vault learn` workflow above — extract learnings into
   `projects/{name}/{learnings,decisions,stack}.md` and surface cross-project
   patterns into `topics/` notes.
2. Run the `/vault log` workflow above with the supplied slug (or derive one
   from the session's primary subject if the user didn't supply it). Step 4 of
   `/vault log` refreshes the drift baseline as its closing action — no
   separate `check-drift --update` invocation needed here.
3. Report a short summary of what was saved: project notes touched, the log's
   body path and month file, baseline refreshed.

Use this when ending a session that produced shipped work, decisions, or
cross-project learnings worth preserving. Skip when a session ends with
nothing worth preserving — don't write stub logs to be ceremonial.

**Cadence (ruled 2026-08-04):** wrap closes an *arc*, not a calendar day —
a long session with several shipped arcs may wrap more than once, each
continuation getting its own small log rather than an append (appending
re-stales the earlier log's summary). The mechanical bookkeeping (queue →
archive, decisions, stack) happens at ship time, not at wrap — wrap's
unreconstructable payload is the narrative: the log and the distilled
learnings, which only the hot session can write. When pairing with a sweep,
**wrap first**: wrap's writes are the sweep's intake (stale enrichment, new
FM tags, new wikilink edges). The sweep leg is optional per session — queues
accumulate safely (claims, hysteresis), sub-agents judge from the notes not
from session context, so sweep on queue pressure, not on schedule.

**Arc-closure is the user's call, not an inference from a pause
(2026-08-16).** The rule above answers *how often* to wrap; this one answers
*whether the arc is actually closed*. A lull, a `Pushed.`, or a finished
sub-task is not evidence of closure — an open design thread is still open,
and a discussion that paused is not a discussion that concluded. Propose a
wrap when work demonstrably shipped, or when the user says so; never because
the conversation reached a natural breath. (Origin: apodict 2026-08-16 —
repeated wrap prompts through a live pricing-model discussion; Eugene: *"why
do we wrap constantly?"*, then *"It is not the frequency, it is the why. For
example, 'a wrap closes an arc, not a day' — why do you think the arc is
closed? Why do you think we have finished discussing the pricing model?"*)

### /vault check [--update]

Run the drift check standalone. Typically used mid-session to re-sync
after a user-driven commit, push, or publish.

```bash
~/.claude/skills/vault-check-drift/check-drift.sh            # report only
~/.claude/skills/vault-check-drift/check-drift.sh --update   # report + refresh baseline
```

The skill file at `~/.claude/skills/vault-check-drift/SKILL.md` documents
the signal sources, baseline file format, and report shape.

In multi-writer setups (the host pulls vault-data from a remote that
another machine pushed to), follow the project drift check with an
incremental reindex so the local DB catches up to the new HEAD:

```bash
vault-curl /maintenance/incremental-reindex -X POST -s | jq
```

Skip when working solo or when no `git pull` has happened recently —
the watcher already kept the DB in sync with local edits. A no-op call
is fast (a few ms) but unnecessary. The endpoint reports
`{fromCommit, toCommit, changedFiles, imported, deleted, renamed,
fellBack, durationMs}`; surface anything non-zero, otherwise stay
quiet.
