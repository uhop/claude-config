# Cross-project rules

## Git / npm gates

`git commit`, `git push`, `git tag`, `npm publish` — only on the **literal verb** in the current turn. Reject synonyms (`land`, `ship`, `go`, `proceed`). Stop at staged diff and wait. Full: [[topics/agent-stops-at-staged-diff]].

Pushed history is immutable: no `--amend`, `rebase`, force-push, or moving published tags. Fix forward with a new commit.

## Shell

Many basics (`cp`, `mv`, `rm`, `ls`, `cat`, `grep`, `du`, `mkdir`, `cd`) are aliased on this machine — bypass with `command cmd`. Full table: skill `shell-env`.

## Code

- Prefer prefix `++i` / `--i` when the result is unused.
- Measure perf with `nano-bench` (`~/Open/nano-bench/`). No ad-hoc timing.

## Tools

- **Re-Read after mutating Bash.** Any Bash that may rewrite a file (`prettier --write`, `npm run lint:fix`, a formatting/codemod script, a pre-commit hook) invalidates the harness's file-tracking. Read the file again before the next `Edit` on it. Otherwise `Edit` 400s with "File has been modified since read" and the retry hits the same error.
- **Don't speculatively `Read` paths.** Before `Read`, if the path was inferred from a listing or another output, confirm the path actually appears in that output. `Read` is cheap but failed reads inflate context and signal sloppy exploration. Use `Bash test -f`, `Glob`, or the original listing's exact strings rather than guessing variants.

## Fleet standards

For "fleet standards" (or any synonym), read [[topics/fleet-conventions-bundle]] first — sisters may themselves be behind; don't infer from them.

## Background shells

The Claude Code status line's "N shells" counts `Bash(run_in_background: true)` processes the harness registered this session. Use `BashOutput(shell_id)` to peek, `KillShell(shell_id)` to terminate. Shell IDs (e.g. `bash_1`) are in the original Bash result — scan prior tool calls; **never run `ps`**. Skill: `/bg-shells` enumerates them.

## REST API probes

Probing or sniffing an HTTP API uses safe verbs only — `GET`, `HEAD`, `OPTIONS`. Mutating verbs (`PUT`, `POST`, `DELETE`, `PATCH`) may have side effects even on paths that don't exist (auto-create, idempotent overwrite, audit-log entries). For existence checks: prefer `OPTIONS` or `GET`. For shape discovery: `OPTIONS`.

## Config repo

This file + `~/.claude/{settings.json,commands,skills,hooks}` are symlinks from `~/Open/claude-config/` (repo `uhop/claude-config`) — edits via either path land in the repo. New artifacts go there; `node install.mjs --apply` wires new symlinks. Per-host overrides: `~/.claude/settings.local.json`. Fleet propagation: `claude-config-update` (in `playbash-{daily,weekly,clean}`).
