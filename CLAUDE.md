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
