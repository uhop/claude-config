# Cross-project rules

## Git / npm gates

`git commit`, `git push`, `git tag`, `npm publish` — only on the **literal verb** in the current turn. Reject synonyms (`land`, `ship`, `go`, `proceed`). Stop at staged diff and wait. Full: [[topics/agent-stops-at-staged-diff]].

Pushed history is immutable: no `--amend`, `rebase`, force-push, or moving published tags. Fix forward with a new commit.

## Shell

Many basics (`cp`, `mv`, `rm`, `ls`, `cat`, `grep`, `du`, `mkdir`, `cd`) are aliased on this machine — bypass with `command cmd`. Full table: skill `shell-env`.

## Code

- Prefer prefix `++i` / `--i` when the result is unused.
- Measure perf with `nano-bench` (`~/Open/nano-bench/`). No ad-hoc timing.

## Fleet standards

For "fleet standards" (or any synonym), read [[topics/fleet-conventions-bundle]] first — sisters may themselves be behind; don't infer from them.

## Background shells

The Claude Code status line's "N shells" counts `Bash(run_in_background: true)` processes the harness registered this session. Use `BashOutput(shell_id)` to peek, `KillShell(shell_id)` to terminate. Shell IDs (e.g. `bash_1`) are in the original Bash result — scan prior tool calls; **never run `ps`**. Skill: `/bg-shells` enumerates them.

## Config repo

This file + `~/.claude/{settings.json,commands,skills,hooks}` are symlinks from `~/Open/claude-config/` (repo `uhop/claude-config`) — edits via either path land in the repo. New artifacts go there; `node install.mjs --apply` wires new symlinks. Per-host overrides: `~/.claude/settings.local.json`. Fleet propagation: `claude-config-update` (in `playbash-{daily,weekly,clean}`).
