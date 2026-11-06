# Reading the scan

What `/reflect` step 2 reads before it uses `scan.json`: what each signal means and how the report
treats it. Step numbers are `SKILL.md`'s.

**Pass 4 — git correlation (`session_git`, `multi_release`).** Transcripts say what was asked; git
says what landed. The scanner joins them per session via the shared correlator
`skills/process-review/git-correlate.mjs`: the project dir maps to a repo path, the session's row
window selects the commits made inside it, and each commit is attributed to the user turn that
immediately preceded it. This is enrichment and **fails open** — no repo, no git, no
transcript-to-repo match means no correlation, never a failed scan.

Two things it buys: `correction_driven_commits` per session (a commit whose driving turn was
classified a correction is rework, so a high ratio is a direct measure of a session that needed
steering), and the session's releases, behind the `multi_release` signal below.

**A release comes from npm first, never from a commit subject** (Eugene, 2026-10-08). For every
`package.json` the repository tracks, a version npm published inside the session's window is a
release, and so is a commit that changes a `package.json`'s `"version"`; a private package has only
the second. Each release then looks for its tag, naked `X.Y.Z` at the root and `<pkg>-X.Y.Z` in a
subfolder. Subjects are the fallback for a repository with no `package.json`: the subject pattern
had missed every "New MCP version: X." release on record, two of them in one vault-storage session.
npm comes first because it survives what git does not: a publish from changes never pushed, on
another machine, leaves no commit here. Offline, `session_git[].npm` says `not checked` and the
bumps alone stand. `multi_release` is one signal per run of a package's releases less than 24 hours
apart, across the whole window: one session or several, each release naming its `session_id` and the
signal listing `sessions` (2026-10-22: tape-six's 1.17.0, 1.18.0, and 1.18.1 came from three
sessions in 20 hours, and the per-session count raised nothing). **`release_alerts` go to Eugene as
alerts, not proposals:** a release with no tag (`tag_expected` names what was looked for), or
`unrecorded: true`, a version npm has that no commit on any ref carries. List each in the report
with the package, version, and what is missing; reconciling it is his call. Note the first is only
as good as the correction classifier — a session whose corrections arrive as _"fix the trailer too"_
scored zero corrections and therefore zero correction-driven commits until 2026-08-18, when the
`scope_extension` cue below was added; the classifier is still the floor of what git correlation can
see.

**`scope_extension: true`** marks a correction fired by the short-turn scope-extension cue (`…too`,
`do the rest`, `finish X, then do Y`, `Did you fix … in …?` — turn ≤ 160 chars, after an assistant
turn). These carry no corrective vocabulary; they are the user appending the sibling the agent left
out. Read them as a _cluster_: several in one session on one defect class is the CLAUDE.md § Fix the
class signal ("sweep means fix, not file"), and one alone is usually just the next task. Precision ≈
75 % by the 2026-08-18 measurement — the misses are planning talk that happens to end in "too".

**Read `matched_text`, not `excerpt`, to see what fired.** `excerpt` is the preceding context
(mostly the assistant's tool output); the user turn that tripped the classifier is `matched_text`.
Then render the moment with
`~/.claude/skills/reflect/reflect-context.mjs --project=<dir> --session=<prefix> --at=<ts>` for the
reply, in human time — the 2026-08-18 run first read `excerpt` alone and saw nothing but tool
results.

**Two populations: `sessions_scanned` and `automated`.** `sessions_scanned` counts human sessions
only. A headless `claude -p` transcript carries `entrypoint: "sdk-cli"` on every row (an interactive
one carries `"cli"`; measured 2026-09-05 over 140 transcripts, no third value), and apodict's study
arms and one-turn probes made 14 of a window's 16 "sessions" on 2026-08-30. They are listed under
`automated.sessions` with their first turn, and analyzed only with `--include-automated` — their
"user" turns are a launcher's prompt, and Pass 4 would otherwise attribute the launcher's commits to
them. Report the `automated.count` in the stats line beside `sessions_scanned`, never fold it in.

**`user_turns` is the reading pass.** Every human-authored turn of every analyzed session, by its
first line (capped at 220 characters; the turn is never hidden, so a one-line ruling is truncated
and a short ask over a long paste keeps its line), with `correction: true` where the classifier
fired and `adjacent: true` where the turn came one assistant reply after the previous human turn.
Read every unmarked turn: in five consecutive windows (2026-08-25 → 09-01) this pass carried
proposals the regexes missed, and it replaces the ad hoc `jq` listing those runs built by hand. A
run of `adjacent` turns is the fix-the-class cluster shape; a short `first_line` over a large
`chars` is a short ask carrying a paste, the shape most worth opening. Two more markers:
`withheld: true` (2026-11-03) is an ask for what the report should have held: a name, a commit
subject, a pick, a step's detail, or _"What is 4f?"_ after a bare locator. Over 60 days about three
in four marked turns were in class, and a domain question or a fresh request reads the same, so say
which rule each one broke. A bare _"Did you …?"_ carries no mark: it is a request to confirm, never
a correction (Eugene, 2026-11-03); `after_api_error: true` means the reply before the turn was the
harness's `API Error:` row, so a run of such turns is an outage, not a cluster. `queued: true`
(2026-09-17) marks a message typed while the agent was working: Claude Code stores it as an
`attachment` row of type `queued_command`, not a `user` row, and every scan before this marker
dropped it, 224 messages on one fleet host from 2026-08-18. These are the turns typed while watching
the work, so they carry the densest steering; read them first.

**`side_notes` are the side agent's findings, relayed by Eugene.** The built-in
`cc-plugin-you-should-know` plugin (enabled 2026-10-03) watches a session and writes a heads-up; a
turn that opens _"Here is a note offered by a side agent:"_ is one he passed to the main agent. The
scanner lists it here by its bold `title`, keeps it out of `corrections`, marks its `user_turns`
entry `side_note: true`, and classifies only his own words after the note (`addendum`) as his turn.
On 2026-10-06, 11 of 22 notes caught a rule on record being broken, the unread residue four times,
and the previous report had filed four as false positives (the 2026-10-06 report, P1). Read each one
against the transcript with `reflect-context.mjs`, since a note is a claim and one that day
overstated its case. In the report, give each a row: the session, the note's title, the rule on
record it shows broken (or "none": a consequence or a review), and how the main agent answered. Read
`addendum` as Eugene's turn in the reading pass.

**Reader agents are asked for, with an estimate.** When the reading pass and the side notes are more
than the main session reads, say how many readers you would dispatch, the tokens (about 15K per side
note read against its transcript: 1.44M for 95 on 2026-10-30), and the wall time, and ask before
dispatching. Offer the cheaper path beside it: the main session reads the side notes and turns that
fired a cue or show a rule broken, and lists the rest by title; or a Jev `rule` rank orders the
reading first. (The 2026-10-30 report, P8, from a side note on that run; the same ask `/vault-reorg`
makes for a dispatch of millions of tokens.)

**Jev is on demand here, never a step** (Eugene, 2026-09-22: _"Let's run without Jev for now, keep
it on demand. But you can suggest when to use it."_). The arm in `skills/reflect/jev-marker/`
measured it on 902 turns (the public repositories, plus the private ones its local list allows): on
corrections alone the model loses to the cues above; a `rule` criterion, the engineer stating how
the agent should work in general, finds the standing preferences no cue can name, 22 of its 25
strongest flags real; `withheld` separates the "what is the name of arc N" ask at 0.7 with about
1.3% of turns flagged; `sibling` ranks the "…too" turns beside the `scope_extension` cue. Numbers
and hand reads: vault `projects/claude-config/measurements/2026-09-22-jev-reflect-marker`. Suggest a
run, one line in the report, when the window is large (over about 400 turns, where a two-cent rank
beats reading in scan order); when the prior report's headline came from this reading pass rather
than the cues, twice running; when a queue item asks for a read of one turn class over weeks, the
way the withheld item did; or when a feedback sweep is wanted, since a `rule` pass over a month
lists the preferences stated in-session and captured nowhere. The run is `build --scan <scan.json>`,
`ask --arm rule --all`, `score --arm rule`, then read `top_rule` and `top_withheld`; a flag orders
the reading and never hides a turn. A queued turn counts as a reply to the agent for the correction
and `withheld` gates, and the same mark appears on its signals.

**`repeated_failures` aggregates across sessions and project directories; `sessions` says how
many.** "4 occurrences" was read as an over-count on 2026-09-11 when it was one failure in each of
four sessions, some under directories other than `~/Open`. The signature is the tool's own error
line — ANSI stripped, `/tmp/tmp.*` and the session scratchpad normalized, the harness's
`Exit code N` line and stack frames dropped — so an agent's `echo` lines and a `mktemp` path no
longer split one failure into five (2026-09-13 P1). A result that is only `Exit code N` has no
signature and is not counted.

**The window under-sizes a stable signature.** A repeated failure with a fixed error line recurs
outside the window too: on 2026-09-22 the scan showed 3 and 4 occurrences of two signatures, and one
`grep -l` over every transcript on the host showed 21 and 16 sessions. Before sizing such a failure
in the report, count its sessions across the host's transcripts and report both numbers: match
`tool_result` rows with `is_error`, read their `tool_use` input, and leave out the running session's
transcript, since a search writes its own pattern there and the count runs one session high.

**`gate_gaps` watches the gate spellings that wait until a session writes one (8w).** Eugene ruled
that some spellings the gates leave unread wait for a real use before anyone fixes them:
claude-config 8l, 8m, and 8u, and the four spellings D52 left unread. A gate passes them without a
word, so this list is the only place a use shows up. `gate-gaps.py` reads each analyzed session's
Bash commands with the gates' own parser (`hooks/lib/shell_segments.py`), and each hit names its
`item`, the queue title in `title`, the `shape` it matched, and the `command`. Read each command
before acting on it. A gate test, a fixture that makes commits in a temporary repository, or code
that only names a command is listed in the report and dismissed. A real use ends the item's wait by
his ruling: say so as an alert, and place the item in claude-config's plan. `gate_gap_scan` says how
many commands the watcher read; a non-null `error` means it did not run, which the report says.
