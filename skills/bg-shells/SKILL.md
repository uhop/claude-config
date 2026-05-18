---
name: bg-shells
description: List, peek, or kill background shells from the current Claude Code session. The "N shells" indicator in the Claude Code status line counts `Bash(run_in_background: true)` processes the harness has registered for the current session — they are NOT findable via `ps`. Use when the user mentions "N shells", "background shells", "kill the shell", "what's running", "1 shell running", or invokes /bg-shells. Backed by `bg-shells.mjs` (transcript walker) + Claude Code's `BashOutput` / `KillShell` tools.
user_invocable: true
---

# /bg-shells — list / inspect / kill background shells

The Claude Code status line's "N shells" count is the harness's registry of `Bash(run_in_background: true)` processes started in the current session. **They are not findable via `ps`** — the harness owns the PID↔shell_id binding internally. Running `ps` from this side of the harness will find none of them and prompt the agent to (wrongly) tell the user "no shells are running."

This skill enumerates them by walking the current session's JSONL transcript, where each background Bash call appears as a `tool_use` and its result (containing `shell_id: bash_<n>`) appears as the matching `tool_result`. Once enumerated, peeking and killing use the harness tools directly.

## Invocation

```
/bg-shells                # list shells in the current session
/bg-shells --all-sessions # walk every session JSONL in the cwd's project dir
/bg-shells --json         # JSON output for downstream piping
```

Trigger phrases that should invoke this skill without `/bg-shells` being typed: "1 shell running", "what shells are running", "kill the shell", "list background shells", "the status line shows N shells", "shell count in status line".

## Procedure

1. **Run the lister.** No args needed for the common case:

   ```bash
   node ~/.claude/skills/bg-shells/bg-shells.mjs
   ```

   The script picks the most-recently-modified `.jsonl` in `~/.claude/projects/<cwd-hash>/` (where `<cwd-hash>` is `process.cwd()` with `/` → `-`). Falls back to the globally-newest session if the cwd's dir is missing.

   Output is markdown-shaped text listing each background Bash call with its `shell_id`, `description`, command preview, and last-known status (`started` / `killed` / `unknown`).

2. **If the user wants to peek at a shell's output:** call `BashOutput(shell_id)`. Returns any pending stdout/stderr that the harness has buffered since the last read. Common shapes:
   - Empty output + `status: completed` → the shell exited quietly. Worth a `KillShell` if it's still in the registry (defensive cleanup).
   - Output present + `status: running` → still doing work. Decide whether to wait or kill.
   - Output preview + non-zero exit → already finished; nothing to kill.

3. **If the user wants to terminate a shell:** call `KillShell(shell_id)`. Returns whether the shell was killed or already gone. Repeat per-shell or use `--kill-all` semantics (loop in the agent).

4. **Always report what was done.** Single block, e.g.:

   ```
   bg-shells:
   - bash_1 (vault watcher) — killed
   - bash_2 (hugo serve)    — still running, output: <…last 200 chars…>
   ```

## When `/bg-shells` reports zero but the status line shows non-zero

Three real causes, in decreasing order of likelihood:

- **The script picked the wrong session JSONL.** Claude Code may split sessions on `/clear` or context compaction. Try `--all-sessions` — walks every transcript in the cwd's project dir.
- **The Bash call started the shell with `run_in_background: true` but the tool_result text did not contain a `bash_<n>` token** (shape varies by Claude Code version). The script's regex (`/\b(bash_\d+)\b/i`) misses unconventional shapes. Inspect the raw JSONL near the start time the user mentions:

  ```bash
  grep '"run_in_background":true' ~/.claude/projects/$(pwd | tr / -)/*.jsonl | wc -l
  ```

  Non-zero count → there ARE background calls in the transcript; the shell_id extraction needs investigation.
- **A previous session left a stray shell in the registry.** Rare but possible. `--all-sessions` would surface it.

## When NOT to use `ps`

**Never** run `ps` to "verify" the shell count the user reports. The status-line count is authoritative — the harness publishes it. `ps` will mislead you because:

- The agent process and any sub-processes show up as normal shells / Node processes, indistinguishable from the harness-registered ones to an outside view.
- A backgrounded `bash -c "long-running"` lives under the harness's bash process tree; the harness tracks it by a registry id (`bash_<n>`), not by PID exposure.

Trust the status line. Use `/bg-shells` to enumerate.

## Limitations

- **Session detection by mtime.** When two Claude sessions are open simultaneously in the same cwd, the newer's JSONL is what `/bg-shells` walks by default. `--all-sessions` is the escape hatch.
- **`shell_id` extraction is regex-based** on the tool_result body. Future Claude Code versions might phrase the result differently; the script will miss the id and report `(not captured)`. Update the regex when that happens.
- **No exit-status detection.** The script only sees what's in the JSONL up to read time; subsequent BashOutput results would refine `status`. The `BashOutput` tool gives current truth.
