# Cross-project rules

## Git / npm gates

`git commit`, `git push`, `git tag`, `npm publish` — only on the **literal verb** in the current turn. Reject synonyms (`land`, `ship`, `go`, `proceed`). Stop at staged diff and wait. Full: [[topics/agent-stops-at-staged-diff]].

No verb in the turn → act silently; never *offer* to commit/push/tag/publish or ask permission to do them — absence of the word is the answer, not an invitation. The user commits and pushes himself, after his own review.

Asking is also useless because of the gate itself: `hooks/git-commit-gate.sh` blocks `git commit` unless `.claude/git-commit-allowed` exists at or above the cwd (a per-project opt-in marker — only a couple of repos carry it; `find ~/Open -path '*/.claude/git-commit-allowed'` answers *which*, don't hardcode the list). `push` / `tag` / `publish` are in `settings.json`'s absolute `permissions.deny` — a hook can't reopen a deny, so they're impossible **everywhere, on every repo, always**; `npm publish` also needs interactive 2FA the agent doesn't have. So: on the verb, in a marked repo, just commit; otherwise the action can't happen — don't narrate the gate, don't ask.

Read-only / local-only `git` / `gh` / `aws` run freely; outward-facing or irrecoverable ops are the user's (his legal responsibility, not a fleeting agent's). `hooks/destructive-op-gate.sh` enforces it: blocks `gh` GitHub-state mutations (issue/pr/release create·edit·merge·comment·delete, `gh api` non-GET), destructive `aws` (create/put/delete/…, `s3 rm` + uploads), and `git clean -f` (untracked files have no reflog) — while allowing reads, `gh` clone/checkout/download, `s3` downloads, and git-recoverable ops (`reset --hard`, `git rm`, `branch -D`). The hook is the source of truth for exact coverage — don't reproduce the verb list here. Driver: an agent once filed a public `gh issue create` for an internal vault queue item.

Git is the system of record — don't keep a prose ledger of it. Run `git status` / `git log` the moment a decision needs the state, use the answer, discard it; never carry "N ahead/behind, commit X landed" across turns or re-confirm what git already tracks. A `/vault wrap`-style session log written once from `git log` is fine; a running tally babysat mid-session is not.

Pushed history is immutable: no `--amend`, `rebase`, force-push, or moving published tags. Fix forward with a new commit.

## Shell

Many basics (`cp`, `mv`, `rm`, `ls`, `cat`, `grep`, `du`, `mkdir`, `cd`) are aliased on this machine — bypass with `command cmd`. Full table: skill `shell-env`.

## Scratch files

Don't hardcode `/tmp/<name>` for scratch — collides with stale files from prior/parallel sessions (`Write` refuses a stale same-name file: "File has not been read yet"; `Read` hits another session's leftover). `WORK=$(mktemp -d)` once, use `$WORK/<name>`. Shell state doesn't persist between Bash calls — capture the printed dir and reuse its **literal** path across calls, don't re-`mktemp` (or keep the whole read-modify-write in one Bash call). Best-effort `rm -rf "$WORK"` when done (uniqueness prevents collisions; cleanup is hygiene, not correctness — don't fail the task on it). Reference impl: `skills/vault-check-drift/check-drift.sh`. Full: [[topics/scratch-file-mktemp-not-hardcoded-tmp]].

## Code

- Prefer prefix `++i` / `--i` when the result is unused.
- Measure perf with `nano-bench` (`~/Open/nano-bench/`). No ad-hoc timing.

## Ambiguity

When an instruction or referent is ambiguous — not just unknown jargon, but *what 'it' points at* or *how far a request reaches* (which file, which scope, how much to change) — ask rather than guess and run. A wrong guess on scope costs more round-trips than the question. Fixing an obvious typo silently is still fine; this is about genuine ambiguity of intent. (Origin: an "apply it to the post" instruction guessed as a narrow cross-link when it meant a whole thread; reflect 2026-06-09.)

## Tools

- **Re-Read after mutating Bash.** Any Bash that may rewrite a file (`prettier --write`, `npm run lint:fix`, a formatting/codemod script, a pre-commit hook) invalidates the harness's file-tracking. Read the file again before the next `Edit` on it. Otherwise `Edit` 400s with "File has been modified since read" and the retry hits the same error.
- **Don't speculatively `Read` paths.** Before `Read`, if the path was inferred from a listing or another output, confirm the path actually appears in that output. `Read` is cheap but failed reads inflate context and signal sloppy exploration. Use `Bash test -f`, `Glob`, or the original listing's exact strings rather than guessing variants.
- **Trust the foreground result; don't chase display lag.** A foreground `Bash` result is authoritative even when it renders late or looks empty — the value is already captured. Don't re-run it as a background task, don't spawn noop "flush"/"nudge" commands to force a redraw, and don't `Read` a background task's `tasks/<id>.output` before its `<task-notification>` arrives (the file doesn't exist yet — the `Read` errors). Each adds cancelled-sibling and failed-`Read` noise without recovering anything. Reserve `run_in_background: true` for genuinely long work (servers, watchers, multi-minute builds), not perceived lag.
- **A fallible parallel Bash sibling cancels the batch.** When you fire multiple Bash calls in one message, one that exits non-zero *or* is permission-denied cancels all in-flight siblings (`Cancelled: parallel tool call … errored`). Don't co-batch a command that legitimately returns non-zero or trips a permission gate — drift checks (`check-drift.sh` exits 1 on drift), `git tag` / `git describe` (non-zero when absent; often gated), or `$(…)`-substitution / compound snippets — with other independent calls. Run such a command in its own invocation, or guard the pipe with `|| true`. Generalizes the vault skill's "check-drift is a canceller" rule from vault commands to git + shell.

## Fleet standards

For "fleet standards" (or any synonym), read [[topics/fleet-conventions-bundle]] first — sisters may themselves be behind; don't infer from them.

## Background shells

The Claude Code status line's "N shells" counts `Bash(run_in_background: true)` processes the harness registered this session. Use `BashOutput(shell_id)` to peek, `KillShell(shell_id)` to terminate. Shell IDs (e.g. `bash_1`) are in the original Bash result — scan prior tool calls; **never run `ps`**. Skill: `/bg-shells` enumerates them.

## REST API probes

Probing or sniffing an HTTP API uses safe verbs only — `GET`, `HEAD`, `OPTIONS`. Mutating verbs (`PUT`, `POST`, `DELETE`, `PATCH`) may have side effects even on paths that don't exist (auto-create, idempotent overwrite, audit-log entries). For existence checks: prefer `OPTIONS` or `GET`. For shape discovery: `OPTIONS`.

## Config repo

This file + `~/.claude/{settings.json,commands,skills,hooks}` are symlinks from `~/Open/claude-config/` (repo `uhop/claude-config`) — edits via either path land in the repo. Shell edits, that is — the harness's Edit/Write tools **refuse symlinked paths** ("Refusing to write through symlink"). For tool edits address the real file under `~/Open/claude-config/...` directly (`readlink -f` when unsure); treat `~/.claude/...` as read-only aliases. New artifacts go there; `node install.mjs --apply` wires new symlinks. Per-host overrides: `~/.claude/settings.local.json`. Fleet propagation: `claude-config-update` (in `playbash-{daily,weekly,clean}`).
