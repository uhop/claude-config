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
/reflect --apply                      # walk high-confidence proposals after the report: claude-config edits applied and shown, the rest asked
/reflect --include-sidechain          # include sub-agent (Task) transcripts — <session>/subagents/agent-*.jsonl — in the scan (gate_gaps reads them either way)
/reflect --include-automated          # analyze headless `claude -p` transcripts (entrypoint sdk-cli) too (gate_gaps reads them either way)
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
     "scan_window": {"since": "...", "start_iso": "...", "end_iso": "...", "earliest_row_iso": "..."},
     "totals": {"corrections": N, "confirmations": N, "stuck_loops": N, "repeated_failures": N, "surprises": N, "multi_release": N, "release_alerts": N, "side_notes": N, "gate_gaps": N},
     "sessions_scanned": N,
     "automated": {"count": N, "included": false, "sessions": [{project, session_id, entrypoint, rows, first_turn}]},
     "transcripts_seen": N,
     "prior_report": "[[projects/agent-workflow/reports/<name>]] — this host's previous report, null on a first run or a pre-2026-08-09 cache",
     "live_sessions": [{project, session_id, path, mtime_iso, age_seconds, first_row_iso}],
     "state_watermark_iso": "...",
     "session_git": [{project, session_id, start_iso, end_iso, first_turn, repo, commits, correction_driven_commits, shas, releases: [{package, version, ts_iso, sha, tag}], npm: {<package>: "ok" | "unpublished" | "not checked"}}],
     "user_turns": [{project, session_id, ts, ts_iso, first_line, chars, side_note?, addendum?, queued?, adjacent?, correction?, withheld?, after_api_error?}],
     "gate_gap_scan": {"commands": N, "error": null},
     "signals": {
       "corrections":       [{kind, project, session_id, ts, ts_iso, matched_text, excerpt, unlanded?, scope_extension?}, ...],
       "confirmations":     [{...}],
       "stuck_loops":       [{kind, project, session_id, ts, ts_iso, tool, repetitions, excerpt}],
       "repeated_failures": [{kind, occurrences, sessions, tool, project, session_id, ts, ts_iso, error_text, excerpt}],
       "surprises":         [{...}],
       "multi_release":     [{kind, project, session_id, sessions, repo, package, count, span_min, releases: [{version, session_id, sha, subject, npm_iso, tag, driver}], note}],
       "release_alerts":    [{kind, project, session_id, repo, package, version, ts, ts_iso, tag_expected?, unrecorded?}],
       "side_notes":        [{kind, project, session_id, ts, ts_iso, title, heads_up, note, addendum?, queued?}],
       "gate_gaps":         [{kind, item, title, shape, project, session_id, ts, ts_iso, matched, command}]
     }
   }
   ```

   **Read `references/scan-fields.md` before using the scan:** what each signal means and how the report treats it, from the git correlation and `release_alerts` through `user_turns`, `side_notes`, reader agents, Jev, and `repeated_failures`. What it must not lose: read `matched_text`, not `excerpt`, to see what fired; read every turn in `user_turns`, the `queued: true` ones first; give each side note a row in the report; list each of `release_alerts` as an alert, not a proposal; and count a repeated failure's sessions across the host before sizing it.

3. **Dedupe against existing memory.** For each candidate signal, check whether the rule is already captured. Read in parallel:
   - `~/Open/claude-config/CLAUDE.md` (global rules)
   - `~/.claude/projects/<hash>/memory/*.md` for the relevant project hash
   - The relevant project's vault `feedback.md`, `learnings.md`, `decisions.md` (if any)
   - `projects/agent-workflow/queue.md` (already-queued improvements)
   - **Recent other-host reports** — list `projects/agent-workflow/reports/` and read those from the last ~60 days written on another machine: the title's `(<host>)` and the frontmatter's `host:` say which, or, for a report named before 2026-10-14, its `-<host>` filename suffix. This is the **cross-machine recurrence input** for step 4: transcripts are local-only, so another host's report is the only fleet-visible evidence that the same signal also fired there. (Dedupe / `already_covered` still comes from the rules stores above — a report only *proposes*; the rule isn't "covered" until it lands in `CLAUDE.md` / `feedback.md` / `decisions.md` / `queue.md`.)
   - **This host's previous report** — `prior_report` from scan.json (null on a first run or a pre-carry cache: fall back to this machine's newest report in the listing, found by its title, or an older one's `-<host>` suffix). Read its `## Carried forward` section **and any ad-hoc deferral prose** (older reports used trailing "## Note — current session out of scope" paragraphs). Every item found there MUST be resolved in this run's report under `## Carried forward` (step 6): **covered** (the rule landed — cite where), **re-proposed** (as one of this run's P-entries), or **dropped** (with the reason stated). A deferral that is neither resolved nor re-carried is the write-only-report defect this step exists to close (2026-08-09: one deferral silently dropped, one accidentally re-derived seven weeks late).

   If the candidate's rule overlaps an existing entry, mark it `already_covered` — it goes in the report's "Already covered" section, not the proposals.

4. **Classify by confidence.** For each non-covered candidate:
   - **high** — recurrence, OR singular but with decisive language ("never", "always", "we don't do that"). Per [[projects/agent-workflow/decisions]] D2 + D3. Recurrence is met when **either** (a) the signal fired in ≥ 2 sessions in *this* scan, **or** (b) it fired once here and a matching signal appears in another host's recent report from step 3 — that cross-machine hit counts as the second occurrence. Without (b) a once-per-machine signal never crosses the bar on either host, since each run sees only local transcripts. Matching is semantic (same underlying rule / behaviour), not string-identical; when the match is uncertain, treat it as medium, not high. **(c) `unlanded: true` on the signal counts as recurrence by itself** — the scanner sets it when the user's own words say the correction has not landed ("you still…", "why do you still…", "I still see…"), which makes that turn the second occurrence whether or not the first one was captured. Verify the antecedent before promoting: read back far enough to confirm what was corrected earlier, since a "still" turn is unintelligible on its own. **(d) A cluster of `scope_extension: true` turns — ≥ 2 in one session on one defect class — is recurrence** for the fix-the-class family (each turn is the user re-asking for a sibling the agent left out); a single one is not, and the cluster still wants the transcript read to name the class. **(e) A side note that shows a rule on record broken is an occurrence of that rule**, after the transcript confirms it; two such notes in different sessions, or one plus a correction elsewhere, meet (a).
   - **`multi_release` is always high.** Ruled 2026-08-17: more than one release
     of a project in a single session is a signal that something went wrong, and
     it needs no recurrence to qualify. Eugene: *"it is possible to have more
     than 1 release per day, but it should be an exception, not a rule. I don't
     want to churn versions needlessly and bother users."* The known-legitimate
     case — publishing to debug a dependent repo (`tape-six` → `tape-six-*`) —
     is itself a process gap, so the proposal there is **not** "stop releasing"
     but "link the package locally (`npm link` or a file: install) and debug
     without publishing". A second known-legitimate case (the 2026-09-04
     report, P1): a repository whose contract pins recorded answers to the
     version, where each release is an explicit ask closing an
     answer-changing arc — the report names the case, cites the project's
     `feedback.md`, and proposes nothing. Read the `driver` on each release
     before proposing: it usually says outright why the second one happened.
   - **medium** — singular, plausible signal, neutral language, no cross-machine corroboration.
   - **low / ambiguous** — multiple plausible interpretations, or possibly a one-off.

5. **Route each high/medium candidate.** Pick the destination from the table below. Low/ambiguous items go to `clarify-queue.md` regardless.

   | Signal shape | Destination |
   | --- | --- |
   | Single-project correction (recurring or decisive) about a fact of that repository | vault `projects/<name>/feedback.md` (append section) |
   | Cross-project correction, or a coding or process practice stated in one project — fleet-wide by default unless he scoped it (CLAUDE.md § Ambiguity, 2026-09-22) | claude-config `~/Open/claude-config/CLAUDE.md` (append section) |
   | Repeated tool failure → fixable in a real codebase | that project's vault queue, Backlog (`queue-items.mjs file <name>`) |
   | Repeated tool failure → fixable via skill / hook / settings | claude-config (`skills/`, `hooks/`, `settings.json` — delegate to `update-config` if a settings change; delegate to `fewer-permission-prompts` if it's permission noise) |
   | A rule already on record, broken again | a gate when a decidable predicate, its operand at the point of action, and a place to run it (a hook, a CI step, a server refusal) all exist: a hook in claude-config `hooks/`, or a check filed on that project's `queue.md`. Otherwise the rule's own destination above, checking first that the actor holds its operand ([[topics/gates-not-promises]]) |
   | Stuck loop pattern (recurring across sessions) | agent-workflow's vault queue, Backlog, with proposed mitigation |
   | Surprise / discovery worth preserving | vault `topics/<topic-name>.md` (new note) or extend an existing topic |
   | Confirmation of non-obvious approach | same destinations as corrections — captures "do this" rather than "don't do that" |
   | `gate_gaps` — a session wrote a gate spelling that waits on one | an alert naming the item: a real use ends its wait, so place the item in its project's plan; a gate test or a fixture is listed and dismissed (`references/scan-fields.md`) |
   | `multi_release` — two releases within 24 hours | vault `projects/<name>/feedback.md` when the fix is project-shaped (local-link workflow for its satellites); `CLAUDE.md` / [[topics/semver-and-release-cadence]] when it is a cadence rule |

   A write to a `feedback.md` follows [[topics/project-feedback-md-convention]] § When to create or extend: a new rule is its own section, and a change to a rule goes in its heading or first sentence, the parts the session-start digest shows, checked against the digest's `omitted` count.

6. **Write the report.** Path: `projects/agent-workflow/reports/YYYY-MM-DD.md`. If that exact path already exists (another machine's run, or a re-run, on the same day), append `-HHMM` → `YYYY-MM-DD-HHMM.md` rather than clobbering the earlier run: transcripts are local-only, so each host's run is distinct content, not a redundant overwrite. The machine, the short hostname (`hostname -s`), goes in the title and in the frontmatter as `host:`, never in the path, since report names reach public code as citations (Eugene, 2026-10-14). Reports named before that day keep their `-<host>` names. Write it with `mcp__vault__vault_write_file{path, frontmatter, body}` — it takes frontmatter as a JSON object and serializes the YAML server-side, which is what keeps the date fields from shadowing (fallback: the `vault-curl` JSON-PUT path, same reason). Body shape:

   ```markdown
   # Reflect — {date} · {host} (since {window_start_iso})

   ## Stats
   - Sessions scanned: N — name each by its subject and day, e.g. "apodict, arc 3 (2026-09-15)";
     `session_git[].first_turn` is the starting point. Those names are the ones every
     Evidence line below uses.
   - Signals: C corrections, F confirmations, L stuck loops, R repeated failures, S surprises
   - Already covered (cross-referenced existing rules): K

   ## High-confidence proposals
   ### P1: {short description}
   **Kind:** {kind} · **Destination:** {route} · **Recurrence:** {N sessions}
   **Evidence:** {project}, {session subject} (`{session prefix}`), {ts_iso} — the human coordinates first; the epoch stays in a trailing code span for the transcript lookup: (`ts={epoch}`)
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
   host: <host>
   tags: [agent-workflow, reflect, report]
   type: query
   created: YYYY-MM-DD
   updated: YYYY-MM-DD
   related:
     - "[[projects/agent-workflow/queue]]"
     - "[[projects/agent-workflow/clarify-queue]]"
   ---
   ```

7. **File ambiguous items to clarify-queue.** For each low/ambiguous candidate, file it with the clarify helper, which allocates the next `Q-YYYY-MM-DD-NNN`, validates the five lines the walk reads, and appends the block under `## Pending` with `If-Match` (2026-09-15):

   ```bash
   ~/.claude/skills/clarify/clarify-queue.mjs file \
     --question="<one sentence, ends with a question mark>" \
     --context=@"$WORK/ctx.md" --candidates=@"$WORK/cands.md" \
     --source="project \`<dir>\`, session \`<id>\`, ts <epoch_ms>; report [[projects/agent-workflow/reports/<name>]]"
   ```

   `@path` reads a value from a file, so the context and the candidates need no shell quoting; one candidate per line, numbered by the helper; `--dry-run` prints the block without writing. Never hand-roll the block: the heading shape below is what the parser reads, and a title on the id line unlisted an item on 2026-07-20.

   Before filing, read `references/clarify-filing.md`: read the source exchange and every store a candidate routes to first, then give two or three distinct candidates, "no rule / one-off" among them whenever it is live, in the block's exact shape.

8. **Apply (if `--apply`).** Read `references/apply-walk.md`, then walk the high-confidence proposals one per turn, each with its context in front of it. A proposal that writes only to claude-config is applied and shown; every other proposal gets the question. Then offer the mediums.

9. **Update state.** After the report writes successfully:

   ```bash
   ~/.claude/skills/reflect/reflect-state.mjs --sessions=N --signals="<one line>" --report="[[projects/agent-workflow/reports/<name>]]" --watermark="<state_watermark_iso from scan.json>"
   ```

   **Always pass `--watermark` from `scan.json`, never let it default to wall-clock.** The scanner filters rows by timestamp against the window start, so a watermark set past a session it skipped as live puts that session's already-written rows *before* the next window and drops them — the live-session warning gets emitted and then immediately invalidated by the state write. `state_watermark_iso` is already clamped to the earliest row of any skipped session, so passing it is the whole fix. (Filed 2026-07-28 from one host's run: advancing on wall-clock would have discarded 680 rows of a substantive session; four prior runs on this host had skipped live sessions and advanced past them regardless.) **Take it from the scan the report was written from**, not from a later validation re-run in the same session: a session that was live at the first scan can close before the second, and the second scan will then include it — but the report never reviewed it, so its rows must stay inside the next window. (2026-08-18: node-re2 `b1624cc4` was live at scan 1, closed by the P2 validation re-scan; the correct watermark was scan 1's clamp.)

   One in-process run writes both stores: the local cache
   `~/.cache/reflect/last-run.json` (the functional authority
   `--since=last-run` reads on this host) and this host's entry in
   `projects/agent-workflow/state.md`'s per-host map (the cross-machine
   visibility mirror) — other hosts' entries preserved, legacy
   single-block maps migrated, If-Match round-trip (412 → re-run). The
   script exists because the shell version failed twice on record (GNU
   `date +%s%3N` truncation; ANSI-wrapped `node -e` output breaking
   `jq --argjson`) — don't hand-roll the timestamps again.

## Cadence and limits

Run it at the start of a fresh session, about weekly, on each machine you work on, and never chained after `/vault wrap`. Why, and what the scanner cannot see: `references/cadence-and-limits.md`.

## When NOT to run

- The first time on a fresh machine — `~/.claude/projects/` will be empty or sparse. Wait until you have ≥ 2 sessions worth of transcripts.
- Mid-conversation — `/reflect` reads completed sessions; the current one's tail isn't on disk. `reflect.mjs` flags any transcript modified within `--live-window-secs` (default 120) of the scan as a live session, excludes it from `sessions_scanned`, and warns on stderr — so a mid-session run is *visible*, not silently lossy, but it still skips today's work. Reflect from a later session instead.
- Right after a `claude-config-update` pull on a non-primary machine — its transcripts are local-only, so cross-machine signals will be weak. Run on the host where most work happens.
