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
   mkdir -p /tmp/reflect && \
     node ~/.claude/skills/reflect/reflect.mjs --out=/tmp/reflect/scan.json $ARGUMENTS
   ```

   The script writes JSON to stdout AND to the `--out` path. Use Read on `/tmp/reflect/scan.json` to consume. Output shape:

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

   If the candidate's rule overlaps an existing entry, mark it `already_covered` — it goes in the report's "Already covered" section, not the proposals.

4. **Classify by confidence.** For each non-covered candidate:
   - **high** — recurrence ≥ 2 sessions (any machine) OR singular but with decisive language ("never", "always", "we don't do that"). Per [[projects/agent-workflow/decisions]] D2 + D3.
   - **medium** — singular, plausible signal, language is neutral.
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

7. **File ambiguous items to clarify-queue.** For each low/ambiguous candidate, append a `### Q-{date}-{nn}` block to `projects/agent-workflow/clarify-queue.md` under `## Pending`. Include transcript refs, the question, and 2-3 candidate interpretations. Read the file first, append, PUT back.

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

9. **Update state.** After the report writes successfully, update both the local state cache AND the vault state file:

   ```bash
   mkdir -p ~/.cache/reflect && \
   jq --null-input --arg now "$(date -Is)" \
     '{last_run_iso: $now, last_run_ms: (now * 1000 | floor)}' \
     > ~/.cache/reflect/last-run.json
   ```

   Uses `jq`'s built-in `now` (UTC seconds, decimal) and converts to ms.
   Don't use `date +%s%3N` — GNU date's `%3` truncation directive is
   widely ignored, yielding `<seconds><nanoseconds>` (19 digits) which
   `new Date(...)` interprets as a far-future timestamp and crashes
   `reflect.mjs`'s window resolution. Also don't use
   `node -e 'console.log(Date.now())'` — on machines with colorized
   console output, the value comes back wrapped in ANSI escape codes
   that break `jq --argjson`.

   Then update `projects/agent-workflow/state.md`'s `last_run` block, which is a **map keyed by short hostname** (`hostname -s`) — one entry per machine, so each host's progress stays independently visible and concurrent machines don't overwrite each other (`/reflect` runs per-box; transcripts are local-only). Read `state.md` first, set **only** the current host's key — `last_run[<host>] = {last_run_iso, last_run_ms}` — leave every other host's entry intact, and PUT it back. The per-machine local cache (`~/.cache/reflect/last-run.json`, a single block) is the functional authority `--since=last-run` actually reads on this host; the vault map is a cross-machine mirror for visibility, not the read path.

   Legacy single-block `state.md` (a bare `last_run: {last_run_iso, last_run_ms}` from before this convention) → on first write under the new scheme, migrate it by moving the existing block under its originating host's key if known, otherwise drop it and start the map fresh with this host's entry.

## When NOT to run

- The first time on a fresh machine — `~/.claude/projects/` will be empty or sparse. Wait until you have ≥ 2 sessions worth of transcripts.
- Mid-conversation — `/reflect` reads completed sessions. The current session isn't fully in scope yet.
- Right after a `claude-config-update` pull on a non-primary machine — its transcripts are local-only, so cross-machine signals will be weak. Run on the host where most work happens.

## Limitations (first iteration)

- **Regex-based classification.** False positives are normal — the agent's dedupe + judgment step in the procedure is what makes the output useful. A candidate that looks like a correction may turn out to be benign in context.
- **No cross-machine transcript merging.** Each host sees only its own transcripts. Promotion to fleet store still happens; just based on single-host evidence.
- **Tool-input fingerprint is JSON-serialize-and-truncate.** Catches identical retries, misses semantically-equivalent ones with different whitespace / arg order.

These are deliberate first-cut tradeoffs; revisit once `/reflect` has produced enough output to know which are worth refining.
