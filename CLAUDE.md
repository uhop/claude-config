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

## This config is managed by ~/Open/claude-config

This `CLAUDE.md` is symlinked from `~/Open/claude-config/CLAUDE.md`.
Same for `~/.claude/{settings.json,commands,skills,hooks}` — all
symlinked from that repo. Install via `node install.mjs --apply`
(idempotent — safe to re-run).

- New skills / commands / hooks go in
  `~/Open/claude-config/{skills,commands,hooks}/`, then re-run the
  installer once to wire the symlink.
- Edits via the symlinks DO write back to the repo (same inode);
  `git status` / commit happen in `~/Open/claude-config/`.
- Per-host overrides: `~/.claude/settings.local.json` (untouched by
  installer).
- Fleet propagation: `claude-config-update` wrapper (`git pull
  --ff-only` + reinstall) is called by `playbash-{daily,weekly,clean}`.
- Repo: `uhop/claude-config`.
