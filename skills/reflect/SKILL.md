---
name: reflect
description: Retrospectively scan Claude Code session transcripts for workflow-improvement signals (corrections, confirmations, stuck loops, repeated failures, surprises) and route findings to the right fleet-shared store. Use when the user invokes /reflect, asks "what should we improve about how I work with Claude", or wants to consolidate per-machine memory observations into vault / claude-config. Backed by `reflect.mjs` (transcript scanner) + the vault (`projects/agent-workflow/`) + claude-config edits. Manual cadence — no scheduling.
user_invocable: true
---

# /reflect — agent self-improvement retrospective

Scans `~/.claude/projects/*/` JSONL transcripts, classifies candidate signals via `reflect.mjs`, dedupes against existing memory + vault + claude-config rules, produces a review report in the vault, and (optionally) walks high-confidence proposals interactively via `AskUserQuestion`.

Companion skill: `/clarify` drains the ambiguous-findings parking lot. Design and decisions: `[[projects/agent-workflow/decisions]]`.

## Invocation

```
/reflect                              # default --since=last-run (falls back to 7d on first run)
/reflect --since=24h | 7d | 14d | YYYY-MM-DD
/reflect --project=NAME               # restrict scan to one project dir
/reflect --apply                      # walk high-confidence proposals via AskUserQuestion after the report
/reflect --include-sidechain          # include sub-agent (Task) transcripts in the scan
/reflect --include-automated          # analyze headless `claude -p` transcripts (entrypoint sdk-cli) too
```

The script itself is dry-run only — it scans, classifies, emits JSON. `--apply` is implemented in this SKILL.md by the agent walking the report after writing it.

## Storage model (where outputs land)

Three fleet-shared (or local) stores. `/reflect` routes each signal to one:

| Store | Scope | Fleet via | Holds |
| --- | --- | --- | --- |
| vault (`vault-data` repo) | cross-machine | git | `projects/agent-workflow/{queue,clarify-queue,reports}.md`, per-project `feedback.md` |
| claude-config (`~/Open/claude-config/`) | cross-machine | git | `CLAUDE.md` (global rules), `skills/`, `hooks/`, `settings.json` |
| per-project memory (`~/.claude/projects/<hash>/memory/`) | local | — | in-flight auto-memory writes only; NOT a `/reflect` write destination |

Read all three to dedupe; write only to vault + claude-config.

## Procedure

1. **Pre-flight.** Confirm the agent-workflow project exists in the vault:

   `mcp__vault__vault_read_file{path: "projects/agent-workflow/queue.md"}` — you need this file's content in step 3 anyway, so the read doubles as the check. Fallback if that tool is absent from your registry (pre-0.1.0 adapter, or a host that has not restarted since it published):

   ```bash
   vault-curl /vault/projects/agent-workflow/queue.md -s -o /dev/null -w "%{http_code}\n"
   ```

   `not_found` / 404 → the scaffolding is missing. Stop and tell the user to run the migration (`projects/agent-workflow/` scaffold) before retrying. Don't auto-create — the project carries decisions that should be authored deliberately.

2. **Scan.** Run the scanner with the user's args:

   ```bash
   WORK=$(mktemp -d) && \
     node ~/.claude/skills/reflect/reflect.mjs --out="$WORK/scan.json" $ARGUMENTS && \
     echo "scan written: $WORK/scan.json"
   ```

   `state_watermark_iso` is what step 9 records as the last run — **not** the scan time. It equals `end_iso` on a clean run, but clamps back to the earliest row of any live session the scanner skipped. Pass it through verbatim; see step 9.

   The script writes JSON to stdout AND to the `--out` path. `Read` that path — captured from the `scan written: …` line above (CLAUDE.md § "Scratch files": reuse the literal `mktemp -d` dir across calls, don't re-`mktemp`) — to consume. Output shape:

   ```json
   {
     "scan_window": {"since": "...", "start_iso": "...", "end_iso": "..."},
     "totals": {"corrections": N, "confirmations": N, "stuck_loops": N, "repeated_failures": N, "surprises": N, "multi_release": N},
     "sessions_scanned": N,
     "automated": {"count": N, "included": false, "sessions": [{project, session_id, entrypoint, rows, first_turn}]},
     "transcripts_seen": N,
     "prior_report": "[[projects/agent-workflow/reports/<name>]] — this host's previous report, null on a first run or a pre-2026-08-09 cache",
     "live_sessions": [{project, session_id, path, mtime_iso, age_seconds, first_row_iso}],
     "state_watermark_iso": "...",
     "session_git": [{project, session_id, start_iso, end_iso, repo, commits, correction_driven_commits, shas}],
     "user_turns": [{project, session_id, ts, first_line, chars, adjacent?, correction?}],
     "signals": {
       "corrections":       [{kind, project, session_id, ts, matched_text, excerpt, unlanded?, scope_extension?}, ...],
       "confirmations":     [{...}],
       "stuck_loops":       [{kind, project, session_id, tool, repetitions, excerpt}],
       "repeated_failures": [{kind, occurrences, tool, project, session_id, excerpt}],
       "surprises":         [{...}],
       "multi_release":     [{kind, project, session_id, repo, count, span_min, releases: [{sha, subject, driver}], note}]
     }
   }
   ```

   **Pass 4 — git correlation (`session_git`, `multi_release`).** Transcripts say
   what was asked; git says what landed. The scanner joins them per session via
   the shared correlator `skills/process-review/git-correlate.mjs`: the project
   dir maps to a repo path, the session's row window selects the commits made
   inside it, and each commit is attributed to the user turn that immediately
   preceded it. This is enrichment and **fails open** — no repo, no git, no
   transcript-to-repo match means no correlation, never a failed scan.

   Two things it buys: `correction_driven_commits` per session (a commit whose
   driving turn was classified a correction is rework, so a high ratio is a
   direct measure of a session that needed steering), and the `multi_release`
   signal below. Note the first is only as good as the correction classifier —
   a session whose corrections arrive as *"fix the trailer too"* scored zero
   corrections and therefore zero correction-driven commits until 2026-08-18,
   when the `scope_extension` cue below was added; the classifier is still the
   floor of what git correlation can see.

   **`scope_extension: true`** marks a correction fired by the short-turn
   scope-extension cue (`…too`, `do the rest`, `finish X, then do Y`, `Did you
   fix … in …?` — turn ≤ 160 chars, after an assistant turn). These carry no
   corrective vocabulary; they are the user appending the sibling the agent
   left out. Read them as a *cluster*: several in one session on one defect
   class is the CLAUDE.md § Fix the class signal ("sweep means fix, not file"),
   and one alone is usually just the next task. Precision ≈ 75 % by the
   2026-08-18 measurement — the misses are planning talk that happens to end in
   "too".

   **Read `matched_text`, not `excerpt`, to see what fired.** `excerpt` is the
   preceding context (mostly the assistant's tool output); the user turn that
   tripped the classifier is `matched_text`. Then read the transcript rows
   around `ts` for the reply — the 2026-08-18 run first read `excerpt` alone
   and saw nothing but tool results.

   **Two populations: `sessions_scanned` and `automated`.** `sessions_scanned`
   counts human sessions only. A headless `claude -p` transcript carries
   `entrypoint: "sdk-cli"` on every row (an interactive one carries `"cli"`;
   measured 2026-09-05 over 140 transcripts, no third value), and apodict's
   study arms and one-turn probes made 14 of a window's 16 "sessions" on
   2026-08-30. They are listed under `automated.sessions` with their first
   turn, and analyzed only with `--include-automated` — their "user" turns are
   a launcher's prompt, and Pass 4 would otherwise attribute the launcher's
   commits to them. Report the `automated.count` in the stats line beside
   `sessions_scanned`, never fold it in.

   **`user_turns` is the reading pass.** Every human-authored turn of every
   analyzed session, by its first line (capped at 220 characters; the turn is
   never hidden, so a one-line ruling is truncated and a short ask over a long
   paste keeps its line), with `correction: true` where the classifier fired
   and `adjacent: true` where the turn came one assistant reply after the
   previous human turn. Read every unmarked turn: in five consecutive windows
   (2026-08-25 → 09-01) this pass carried proposals the regexes missed, and it
   replaces the ad hoc `jq` listing those runs built by hand. A run of
   `adjacent` turns is the fix-the-class cluster shape; a short `first_line`
   over a large `chars` is a short ask carrying a paste, the shape most worth
   opening.

3. **Dedupe against existing memory.** For each candidate signal, check whether the rule is already captured. Read in parallel:
   - `~/Open/claude-config/CLAUDE.md` (global rules)
   - `~/.claude/projects/<hash>/memory/*.md` for the relevant project hash
   - The relevant project's vault `feedback.md`, `learnings.md`, `decisions.md` (if any)
   - `projects/agent-workflow/queue.md` (already-queued improvements)
   - **Recent other-host reports** — list `projects/agent-workflow/reports/` and read those from the last ~60 days whose `-<host>` filename suffix is *not* this machine. This is the **cross-machine recurrence input** for step 4: transcripts are local-only, so another host's report is the only fleet-visible evidence that the same signal also fired there. (Dedupe / `already_covered` still comes from the rules stores above — a report only *proposes*; the rule isn't "covered" until it lands in `CLAUDE.md` / `feedback.md` / `decisions.md` / `queue.md`.)
   - **This host's previous report** — `prior_report` from scan.json (null on a first run or a pre-carry cache: fall back to the newest `-<host>` report in the listing). Read its `## Carried forward` section **and any ad-hoc deferral prose** (older reports used trailing "## Note — current session out of scope" paragraphs). Every item found there MUST be resolved in this run's report under `## Carried forward` (step 6): **covered** (the rule landed — cite where), **re-proposed** (as one of this run's P-entries), or **dropped** (with the reason stated). A deferral that is neither resolved nor re-carried is the write-only-report defect this step exists to close (2026-08-09: one deferral silently dropped, one accidentally re-derived seven weeks late).

   If the candidate's rule overlaps an existing entry, mark it `already_covered` — it goes in the report's "Already covered" section, not the proposals.

4. **Classify by confidence.** For each non-covered candidate:
   - **high** — recurrence, OR singular but with decisive language ("never", "always", "we don't do that"). Per [[projects/agent-workflow/decisions]] D2 + D3. Recurrence is met when **either** (a) the signal fired in ≥ 2 sessions in *this* scan, **or** (b) it fired once here and a matching signal appears in another host's recent report from step 3 — that cross-machine hit counts as the second occurrence. Without (b) a once-per-machine signal never crosses the bar on either host, since each run sees only local transcripts. Matching is semantic (same underlying rule / behaviour), not string-identical; when the match is uncertain, treat it as medium, not high. **(c) `unlanded: true` on the signal counts as recurrence by itself** — the scanner sets it when the user's own words say the correction has not landed ("you still…", "why do you still…", "I still see…"), which makes that turn the second occurrence whether or not the first one was captured. Verify the antecedent before promoting: read back far enough to confirm what was corrected earlier, since a "still" turn is unintelligible on its own. **(d) A cluster of `scope_extension: true` turns — ≥ 2 in one session on one defect class — is recurrence** for the fix-the-class family (each turn is the user re-asking for a sibling the agent left out); a single one is not, and the cluster still wants the transcript read to name the class.
   - **`multi_release` is always high.** Ruled 2026-08-17: more than one release
     of a project in a single session is a signal that something went wrong, and
     it needs no recurrence to qualify. Eugene: *"it is possible to have more
     than 1 release per day, but it should be an exception, not a rule. I don't
     want to churn versions needlessly and bother users."* The known-legitimate
     case — publishing to debug a dependent repo (`tape-six` → `tape-six-*`) —
     is itself a process gap, so the proposal there is **not** "stop releasing"
     but "link the package locally (`npm link` or a file: install) and debug
     without publishing". A second known-legitimate case (2026-09-04,
     [[projects/agent-workflow/reports/2026-09-04-nuke]] P1): a private,
     unpublished repository whose contract pins recorded answers to the version
     (apodict, contract § 7), where each release is an explicit ask closing an
     answer-changing arc — the report names the case, cites the project's
     `feedback.md`, and proposes nothing. Read the `driver` on each release
     before proposing: it usually says outright why the second one happened.
   - **medium** — singular, plausible signal, neutral language, no cross-machine corroboration.
   - **low / ambiguous** — multiple plausible interpretations, or possibly a one-off.

5. **Route each high/medium candidate.** Pick the destination from the table below. Low/ambiguous items go to `clarify-queue.md` regardless.

   | Signal shape | Destination |
   | --- | --- |
   | Single-project correction (recurring or decisive) | vault `projects/<name>/feedback.md` (append section) |
   | Cross-project correction (cuts across ≥ 2 projects) | claude-config `~/Open/claude-config/CLAUDE.md` (append section) |
   | Repeated tool failure → fixable in a real codebase | that project's vault `queue.md` Backlog |
   | Repeated tool failure → fixable via skill / hook / settings | claude-config (`skills/`, `hooks/`, `settings.json` — delegate to `update-config` if a settings change; delegate to `fewer-permission-prompts` if it's permission noise) |
   | Stuck loop pattern (recurring across sessions) | `projects/agent-workflow/queue.md` Backlog with proposed mitigation |
   | Surprise / discovery worth preserving | vault `topics/<topic-name>.md` (new note) or extend an existing topic |
   | Confirmation of non-obvious approach | same destinations as corrections — captures "do this" rather than "don't do that" |
   | `multi_release` — two releases, one session | vault `projects/<name>/feedback.md` when the fix is project-shaped (local-link workflow for its satellites); `CLAUDE.md` / [[topics/semver-and-release-cadence]] when it is a cadence rule |

6. **Write the report.** Path: `projects/agent-workflow/reports/YYYY-MM-DD-<host>.md`, where `<host>` is the short hostname (`hostname -s`). The `-<host>` suffix disambiguates the per-machine runs done on each box — transcripts are local-only, so each host's run is distinct content, not a redundant overwrite. If that exact path already exists (a same-host re-run on the same day), append `-HHMM` → `YYYY-MM-DD-<host>-HHMM.md` rather than clobbering the earlier run. Write it with `mcp__vault__vault_write_file{path, frontmatter, body}` — it takes frontmatter as a JSON object and serializes the YAML server-side, which is what keeps the date fields from shadowing (fallback: the `vault-curl` JSON-PUT path, same reason). Body shape:

   ```markdown
   # Reflect — {date} · {host} (since {window_start_iso})

   ## Stats
   - Sessions scanned: N
   - Signals: C corrections, F confirmations, L stuck loops, R repeated failures, S surprises
   - Already covered (cross-referenced existing rules): K

   ## High-confidence proposals
   ### P1: {short description}
   **Kind:** {kind} · **Destination:** {route} · **Recurrence:** {N sessions}
   **Evidence:** project={...}, session={...}, ts={...}
   ```excerpt
   {excerpt from scan.json}
   ```
   **Proposed action:** {concrete diff or file body to write}

   ## Medium-confidence proposals
   {same shape}

   ## Needs clarification (queued)
   {same shape, but written to clarify-queue.md, not applied}

   ## Already covered
   - {signal} → existing rule at {file:line}

   ## Carried forward
   {resolution of the prior report's carried items, then this run's new deferrals.
   Prior items: "- {item} → covered by {rule} | re-proposed as P{N} | dropped — {reason}".
   New deferrals — findings unreadable or unactionable this run (live session,
   missing evidence): "- {item} — carried because {reason}; next run: {what resolves it}".
   Write "None." rather than omitting the section — absence must be visible,
   not ambiguous.}
   ```

   FM:

   ```yaml
   ---
   title: Reflect — YYYY-MM-DD (<host>)
   tags: [agent-workflow, reflect, report]
   type: query
   created: YYYY-MM-DD
   updated: YYYY-MM-DD
   related:
     - "[[projects/agent-workflow/queue]]"
     - "[[projects/agent-workflow/clarify-queue]]"
   ---
   ```

7. **File ambiguous items to clarify-queue.** For each low/ambiguous candidate, append a block under `## Pending` in `projects/agent-workflow/clarify-queue.md`. Use `mcp__vault__vault_replace` anchored on the text you are inserting after — an atomic server-side edit whose blast radius is the block, not the document (fallback: `vault-put --replace`). Don't read-modify-PUT the whole file for an append.

   **Read the source exchange before filing — never write the entry from the scan excerpt.** `Read` the transcript rows around the signal's `ts` (the user turn *and* the assistant reply that followed it) and write the `Context:` and `Candidates:` from what is actually there. The scan excerpt is a truncated, regex-selected window: it routinely omits the reply that already answered the question, and a candidate built on a guessed mechanism is unbuildable at `/clarify` time. Filing is cheap; filing *wrong* costs the clarify walk, because the user is then choosing between options that cannot be implemented. If reading the source dissolves the ambiguity, don't file the item at all — resolve it in the report's "Already covered" or "False positives" section instead. (Origin: 2026-08-16 — `Q-2026-08-16-001` asked whether sub-agent progress labels should be descriptive, on the stated premise that "labels are agent-authored per dispatch". Two of its three candidates proposed a rule over those labels. The assistant reply four rows below the source turn already said the strings were the *harness's* per-tool-call activity glosses, which the agent does not author — so the item was rejected at `/clarify` as unbuildable, and one `Read` at filing time would have prevented it being filed.)

   **Read every store a candidate would route to before filing — "nothing there speaks to it" is a read, not an assumption.** Each `Candidates:` line names a destination (`projects/<name>/feedback.md`, `CLAUDE.md` § …); open each one and search it for the rule before writing the `Context:` claim that it is absent. Step 3 lists these files as dedupe inputs, but a broad step-3 skim does not test the specific rule a Q proposes — the check has to be per candidate, at filing time. (Origin: 2026-08-18 — `Q-2026-08-18-001` asked whether third-party names in negative anecdotes should be anonymized, stating that neither `projects/blog/feedback.md` nor `projects/articles/feedback.md` spoke to it; both carried the exact ruling, written the day before. It was archived at `/clarify` as already covered — a filing that cost a walk to un-file.)

   **The heading must be `### Q-YYYY-MM-DD-NNN` and nothing else on that line.** `/clarify`'s parser matches `/### (Q-[\w-]+)\n/`, so a title after the id — `### Q-2026-07-20-001 — is there a rule for…` — fails to match and the item is **silently unlisted**: the file looks correct and `clarify-queue.mjs list` returns a clean `{"pending": 0}`, indistinguishable from an empty queue. (That happened on 2026-07-20; the helper now also reports an `unparsed` array and a stderr warning, but the format is still the thing to get right.) Copy this shape exactly:

   ```markdown
   ### Q-2026-07-20-001

   - **Created:** YYYY-MM-DD (reflect, <host> <HHMM>)
   - **Source:** project `<dir>`, session `<id>`, ts <epoch_ms>; report [[projects/agent-workflow/reports/<name>]]
   - **Question:** <one sentence, ends with a question mark>
   - **Context:** <what happened, and why the reading is ambiguous — enough that a reader months later needs no transcript>
   - **Candidates:**
     1. **<short label>.** <what this interpretation claims and where it would route>
     2. **<short label>.** <…>
     3. **<short label>.** <…>
   ```

   Two or three candidates; they must be genuinely distinct readings, not degrees of the same one. Include "no rule / one-off" whenever it is live — `/clarify` resolutions frequently land there, and omitting it biases the walk toward filing a rule.

8. **Apply (if `--apply`).** Walk the high-confidence proposals one at a time:

   ```
   AskUserQuestion({
     question: "Apply P1: {description}?",
     header: "Apply P{N}",
     options: [
       {label: "Apply as proposed", description: "Write the artifact as shown."},
       {label: "Edit then apply", description: "Adjust the proposed text before writing."},
       {label: "Skip this one", description: "Move on without applying."},
       {label: "Move to clarify-queue", description: "Defer for a /clarify session."},
     ],
     multiSelect: false,
   })
   ```

   On "Apply as proposed" → execute the write. For vault paths prefer the narrow op — `mcp__vault__vault_append` / `vault_replace` to extend a `feedback.md` or `queue.md`, `vault_write_file` only when authoring a whole new note (fallback: `vault-put --append/--replace`); for claude-config paths use `Edit` against the real file under `~/Open/claude-config/`, never the `~/.claude/` symlink. On "Edit then apply" → present the proposed body, ask for tweaks, then write. On "Skip" → no-op. On "Move to clarify-queue" → file a Q-entry.

9. **Update state.** After the report writes successfully:

   ```bash
   ~/.claude/skills/reflect/reflect-state.mjs --sessions=N --signals="<one line>" --report="[[projects/agent-workflow/reports/<name>]]" --watermark="<state_watermark_iso from scan.json>"
   ```

   **Always pass `--watermark` from `scan.json`, never let it default to wall-clock.** The scanner filters rows by timestamp against the window start, so a watermark set past a session it skipped as live puts that session's already-written rows *before* the next window and drops them — the live-session warning gets emitted and then immediately invalidated by the state write. `state_watermark_iso` is already clamped to the earliest row of any skipped session, so passing it is the whole fix. (Filed 2026-07-28 from the nuke run: advancing on wall-clock would have discarded 680 rows of a substantive session; four prior runs on this host had skipped live sessions and advanced past them regardless.) **Take it from the scan the report was written from**, not from a later validation re-run in the same session: a session that was live at the first scan can close before the second, and the second scan will then include it — but the report never reviewed it, so its rows must stay inside the next window. (2026-08-18: node-re2 `b1624cc4` was live at scan 1, closed by the P2 validation re-scan; the correct watermark was scan 1's clamp.)

   One in-process run writes both stores: the local cache
   `~/.cache/reflect/last-run.json` (the functional authority
   `--since=last-run` reads on this host) and this host's entry in
   `projects/agent-workflow/state.md`'s per-host map (the cross-machine
   visibility mirror) — other hosts' entries preserved, legacy
   single-block maps migrated, If-Match round-trip (412 → re-run). The
   script exists because the shell version failed twice on record (GNU
   `date +%s%3N` truncation; ANSI-wrapped `node -e` output breaking
   `jq --argjson`) — don't hand-roll the timestamps again.

## Cadence — when to run

`/reflect` is a **cross-session, per-machine** sweep, not a per-session step — it looks *back* over recent **closed** sessions for patterns in how the collaboration went. That is a different axis from `/vault wrap` (which closes *one* session's content) and unrelated to `/vault sweep` (vault hygiene). Two properties fix the timing:

- **It needs accumulation.** A signal reaches **high** confidence only on recurrence — ≥ 2 sessions or a cross-machine match (step 4). Per-session it mostly sees single instances; it is built to sweep a window, not a session.
- **It reads only completed transcripts.** The live session's tail isn't on disk yet — `reflect.mjs` flags it, skips it, and warns (§ When NOT to run).

**Best practice:** run it at the **start** of a fresh session — recent sessions are then closed and on disk — then `/clarify` to drain what it filed. The default `--since=last-run` auto-scopes the window to everything since your last reflect on this box. Rhythm ≈ weekly, or after a cluster of substantive sessions — enough closed sessions that patterns emerge.

**Not** chained after `/vault wrap`: wrap runs *inside* the session it closes, so that session is still live and reflect would skip the very work you just wrapped. **Not** after `/vault sweep`: orthogonal — reflect's drain path is `projects/agent-workflow/queue.md` + `/clarify`, not the vault maintenance queues. And **per-machine** — transcripts are local-only (§ Limitations), so run it on each box you work on; a box that never reflects contributes no cross-machine evidence.

## When NOT to run

- The first time on a fresh machine — `~/.claude/projects/` will be empty or sparse. Wait until you have ≥ 2 sessions worth of transcripts.
- Mid-conversation — `/reflect` reads completed sessions; the current one's tail isn't on disk. `reflect.mjs` flags any transcript modified within `--live-window-secs` (default 120) of the scan as a live session, excludes it from `sessions_scanned`, and warns on stderr — so a mid-session run is *visible*, not silently lossy, but it still skips today's work. Reflect from a later session instead.
- Right after a `claude-config-update` pull on a non-primary machine — its transcripts are local-only, so cross-machine signals will be weak. Run on the host where most work happens.

## Limitations (first iteration)

- **Regex-based classification.** False positives are normal — the agent's dedupe + judgment step in the procedure is what makes the output useful. A candidate that looks like a correction may turn out to be benign in context.
- **No cross-machine transcript *merging*.** Each host still scans only its own transcripts. Cross-machine *recurrence* is recovered indirectly: step 3 reads other hosts' recent reports and step 4 counts a match there as a second occurrence, so a once-per-machine signal can still reach high confidence. The catch: this only works if the other host has actually run `/reflect` and committed its report — an un-run host contributes no evidence — and the match is semantic, not exact.
- **Tool-input fingerprint is JSON-serialize-and-truncate.** Catches identical retries, misses semantically-equivalent ones with different whitespace / arg order.

These are deliberate first-cut tradeoffs; revisit once `/reflect` has produced enough output to know which are worth refining.
