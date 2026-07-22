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

   ```bash
   vault-curl /vault/projects/agent-workflow/queue.md -s -o /dev/null -w "%{http_code}\n"
   ```

   404 → the scaffolding is missing. Stop and tell the user to run the migration (`projects/agent-workflow/` scaffold) before retrying. Don't auto-create — the project carries decisions that should be authored deliberately.

2. **Scan.** Run the scanner with the user's args:

   ```bash
   WORK=$(mktemp -d) && \
     node ~/.claude/skills/reflect/reflect.mjs --out="$WORK/scan.json" $ARGUMENTS && \
     echo "scan written: $WORK/scan.json"
   ```

   The script writes JSON to stdout AND to the `--out` path. `Read` that path — captured from the `scan written: …` line above (CLAUDE.md § "Scratch files": reuse the literal `mktemp -d` dir across calls, don't re-`mktemp`) — to consume. Output shape:

   ```json
   {
     "scan_window": {"since": "...", "start_iso": "...", "end_iso": "..."},
     "totals": {"corrections": N, "confirmations": N, "stuck_loops": N, "repeated_failures": N, "surprises": N},
     "sessions_scanned": N,
     "transcripts_seen": N,
     "signals": {
       "corrections":       [{kind, project, session_id, ts, excerpt}, ...],
       "confirmations":     [{...}],
       "stuck_loops":       [{kind, project, session_id, tool, repetitions, excerpt}],
       "repeated_failures": [{kind, occurrences, tool, project, session_id, excerpt}],
       "surprises":         [{...}]
     }
   }
   ```

3. **Dedupe against existing memory.** For each candidate signal, check whether the rule is already captured. Read in parallel:
   - `~/Open/claude-config/CLAUDE.md` (global rules)
   - `~/.claude/projects/<hash>/memory/*.md` for the relevant project hash
   - The relevant project's vault `feedback.md`, `learnings.md`, `decisions.md` (if any)
   - `projects/agent-workflow/queue.md` (already-queued improvements)
   - **Recent other-host reports** — list `projects/agent-workflow/reports/` and read those from the last ~60 days whose `-<host>` filename suffix is *not* this machine. This is the **cross-machine recurrence input** for step 4: transcripts are local-only, so another host's report is the only fleet-visible evidence that the same signal also fired there. (Dedupe / `already_covered` still comes from the rules stores above — a report only *proposes*; the rule isn't "covered" until it lands in `CLAUDE.md` / `feedback.md` / `decisions.md` / `queue.md`.)

   If the candidate's rule overlaps an existing entry, mark it `already_covered` — it goes in the report's "Already covered" section, not the proposals.

4. **Classify by confidence.** For each non-covered candidate:
   - **high** — recurrence, OR singular but with decisive language ("never", "always", "we don't do that"). Per [[projects/agent-workflow/decisions]] D2 + D3. Recurrence is met when **either** (a) the signal fired in ≥ 2 sessions in *this* scan, **or** (b) it fired once here and a matching signal appears in another host's recent report from step 3 — that cross-machine hit counts as the second occurrence. Without (b) a once-per-machine signal never crosses the bar on either host, since each run sees only local transcripts. Matching is semantic (same underlying rule / behaviour), not string-identical; when the match is uncertain, treat it as medium, not high.
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

6. **Write the report.** Path: `projects/agent-workflow/reports/YYYY-MM-DD-<host>.md`, where `<host>` is the short hostname (`hostname -s`). The `-<host>` suffix disambiguates the per-machine runs done on each box — transcripts are local-only, so each host's run is distinct content, not a redundant overwrite. If that exact path already exists (a same-host re-run on the same day), append `-HHMM` → `YYYY-MM-DD-<host>-HHMM.md` rather than clobbering the earlier run. Use `vault-curl` JSON-PUT path (FM has dates and could shadow). Body shape:

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

7. **File ambiguous items to clarify-queue.** For each low/ambiguous candidate, append a block under `## Pending` in `projects/agent-workflow/clarify-queue.md`. Read the file first, append, PUT back.

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

   On "Apply as proposed" → execute the write (vault-curl PUT for vault paths, Edit for claude-config paths). On "Edit then apply" → present the proposed body, ask for tweaks, then write. On "Skip" → no-op. On "Move to clarify-queue" → file a Q-entry.

9. **Update state.** After the report writes successfully:

   ```bash
   ~/.claude/skills/reflect/reflect-state.mjs --sessions=N --signals="<one line>" --report="[[projects/agent-workflow/reports/<name>]]"
   ```

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
