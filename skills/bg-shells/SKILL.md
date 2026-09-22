---
name: bg-shells
description: List, peek, or kill background shells from the current Claude Code session. The "N shells" indicator in the Claude Code status line counts `Bash(run_in_background: true)` processes the harness has registered for the current session — they are NOT findable via `ps`. Use when the user mentions "N shells", "background shells", "kill the shell", "what's running", "1 shell running", or invokes /bg-shells. Backed by `bg-shells.mjs` (transcript walker, which also reads each shell's completion notification) + Claude Code's `TaskStop` tool and a Read of the shell's output file; `hooks/bg-shells-open.sh` (Stop) raises any shell still live before a turn ends.
user_invocable: true
---

# /bg-shells — list / inspect / kill background shells

The Claude Code status line's "N shells" count is the harness's registry of `Bash(run_in_background: true)` processes started in the current session. **They are not findable via `ps`** — the harness owns the PID↔shell_id binding internally. Running `ps` from this side of the harness will find none of them and prompt the agent to (wrongly) tell the user "no shells are running."

This skill enumerates them by walking the current session's JSONL transcript, where each background Bash call appears as a `tool_use`, its result carries the shell id (`toolUseResult.backgroundTaskId`), and its end arrives as a `<task-notification>` block naming the id and its status. A shell with a notification or a `TaskStop` is done; one with neither is **live**, and that is the only status a done-claim may not carry. Once enumerated, peeking and stopping use the harness tools directly.

## Invocation

```
/bg-shells                # list shells in the current session
/bg-shells --all-sessions # walk every session JSONL in the cwd's project dir
/bg-shells --json         # JSON output for downstream piping
/bg-shells --live         # only shells with no completion and no stop
```

Trigger phrases that should invoke this skill without `/bg-shells` being typed: "1 shell running", "what shells are running", "kill the shell", "list background shells", "the status line shows N shells", "shell count in status line".

## Procedure

1. **Run the lister.** No args needed for the common case:

   ```bash
   node ~/.claude/skills/bg-shells/bg-shells.mjs
   ```

   The script picks the most-recently-modified `.jsonl` in `~/.claude/projects/<cwd-hash>/` (where `<cwd-hash>` is `process.cwd()` with `/` → `-`). Falls back to the globally-newest session if the cwd's dir is missing.

   Output is markdown-shaped text listing each background Bash call with its `shell_id`, `description`, command preview, and status: `live` (no completion notification and no stop in the transcript), `done (<status>, exit N)` (from the harness's `<task-notification>` block), or `killed` (a `TaskStop` / `KillShell` on the id). `--live` filters to the first kind.

2. **If the user wants to peek at a shell's output:** Read the output file the launch result named (`…/tasks/<shell_id>.output`); it is the harness's sink for that shell and grows while the shell runs. On a harness that still has `BashOutput`, that tool returns the same bytes.

3. **If the user wants to terminate a shell:** call `TaskStop(task_id)` with the shell id. Returns whether the shell was stopped or already gone. Repeat per shell. **A watcher dies with its producer:** a shell that polls another shell's output file has no exit once that producer is stopped, so stop both (CLAUDE.md § Background shells).

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
- **Status is read at the moment of the walk.** A shell that exits after the lister ran still shows `live` until its notification lands in the transcript; `TaskStop` on a finished id answers "no task found", which is the same information.

## The Stop hook

`hooks/bg-shells-open.sh` runs at every Stop (registered in `settings.json`, 2026-09-22). It runs the lister with `--live` on the session's transcript and, when a live shell has not been raised before in this session, returns `decision: block` with `[bg-shells] N background shell(s) still live: <id> (<description>) …` as the reason, which sends the agent back to `TaskStop` each one it no longer needs or to say in one line which must keep running. The re-entry carries `stop_hook_active: true`, on which the hook exits silently, and the ids are recorded under `${XDG_CACHE_HOME:-~/.cache}/claude-bg-shells/<session_id>.reported`, so a deliberately long-running shell costs one extra turn in its lifetime. It fails open: no `jq`, no `node`, no transcript, or a sub-agent run all exit 0 with no output. Origin: reflect 2026-09-22 — the third time in two months "both registries are empty" was claimed with a shell still live.
