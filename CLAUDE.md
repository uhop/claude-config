# Cross-project user preferences

Rules across every project on this machine. Project-specific guidance
is in `~/.claude/projects/<hash>/memory/`.

## Git / npm gates

Never run `git commit`, `git push`, `git tag`, or `npm publish` without
the **literal verb** authorizing it in the current turn. Reject all
synonyms (`land`, `ship`, `go`, `proceed`, etc.). Stop at staged-diff
and wait. Full: `[[topics/agent-stops-at-staged-diff]]`.

## Shell aliases

Many standard commands (`cp`, `mv`, `rm`, `ls`, `cat`, `grep`, `du`,
`mkdir`, etc.) are aliased on this machine — bypass with
`command cmd`. Full table: skill `shell-env`.

## Pushed git history

Once pushed, history is immutable — fix with a follow-up commit (and
a new tag if release-shaped). Never `--amend`, `rebase`, force-push,
or move a published tag.

## Prefix `++` when incrementing

Prefer prefix `++i` / `--i`.

## Performance

Measure with `nano-bench` (`~/Open/nano-bench/`). No ad-hoc timing.

## Fleet standards

When asked to bring a uhop project to "fleet standards" (or any
synonym), read the vault topic `topics/fleet-conventions-bundle`
first — the canonical checklist with a per-slice compliance
matrix. Don't infer from a sister project; sisters may themselves be
partly behind.

## Session start hook

`~/.claude/hooks/vault-resume-hook.sh` runs on `SessionStart` (matcher
`startup|resume`) and pre-warms vault context into the first turn.

- Always: project-agnostic vault bits (incremental reindex, integrity
  lint, pending-suggestions summary). Emits only when there is something
  to surface.
- In a Claude-configured git project (repo root ≠ `$HOME` AND root has
  `CLAUDE.md` or `.claude/`): adds drift check + 5 most recent log
  filenames. Agent reads logs on demand if the user asks "where were we?".

If context appears pre-loaded without prompting, the hook fired. Disable
by removing the `SessionStart` entry in `~/.claude/settings.json` (or set
its matcher to a no-match string).
