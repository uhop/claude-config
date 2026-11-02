# AGENTS.md — claude-config

> Eugene Lazutkin's personal Claude Code configuration: the global `CLAUDE.md`, `settings.json`,
> skills, hooks, commands, and sub-agents, symlinked into `~/.claude/` on each fleet host. It is a
> public repository, has no `package.json`, and is not published to npm.

For the layout see [ARCHITECTURE.md](./ARCHITECTURE.md). For installing see
[README.md](./README.md).

## `CLAUDE.md` here is the global rule file

In a fleet project `CLAUDE.md` is a one-line pointer to `AGENTS.md`. Here it is the file every
Claude Code session on every fleet host loads, so it stays a whole document, and its rules bind work
in this repository too. This file holds only what is particular to the repository.

## Setup

```bash
git clone https://github.com/uhop/claude-config.git ~/Open/claude-config
cd ~/Open/claude-config
node install.mjs           # dry-run
node install.mjs --apply   # symlink into ~/.claude/
```

## Critical rules

- **Edit the real file in this checkout.** The harness's Edit and Write tools refuse a path under
  `~/.claude/`, which is a symlink.
- **Edits are live at once.** A symlinked file takes effect as soon as it changes, so a worktree
  copy of `CLAUDE.md`, `settings.json`, or a skill tests nothing.
- **Run `node install.mjs --apply` in the session that adds a file under `skills/`, `hooks/`,
  `commands/`, or `agents/`.** The installer links file by file, and a reference in `settings.json`
  goes live before the file it names is linked.
- **This repository is public.** Secrets, keys, host names, addresses, and inventories stay out of
  it, in code, comments, and prose. Public text says "the fleet", and an example uses a stand-in
  such as `host1`.
- **A skill's mechanical steps are scripts.** A step whose outcome its inputs determine belongs in a
  helper script shipped with the skill, and `SKILL.md` starts where judgment starts.
- **A gate's edit goes through a scratch copy.** The auto-mode classifier refuses edits to
  `hooks/destructive-op-gate.sh` and `hooks/git-commit-gate.sh` as self-modification. Build the
  change on a copy of `hooks/`, and hand Eugene a patch, checked with `git apply --check`, with the
  pass count to expect.
- **Read a script before you import or run it.** Check that one parses with `node --check` or
  `bash -n`. The CLI scripts throw on import (`import.meta.main`).

## Gates

Run these after the last edit, and read each command's exit status instead of filtering its output:

```bash
npx prettier --check .
node --test $(git ls-files '*.test.mjs')
for t in hooks/test/*.test.sh; do bash "$t" || echo "FAILED: $t"; done
```

The hook tests are plain Bash with no framework. `vault-resume-brief.test.sh` reads the scripts
installed under `~/.claude/`, and `vault-session-record.test.sh` makes commits, so a clean machine
needs the installer's `--apply` and a git identity first; `.github/workflows/tests.yml` sets up
both. Several tests have a live half that reaches the real vault when `PROGRAM_CLERK_URL` and
`PROGRAM_CLERK_KEY` are set; unset those to run the offline half alone.

## Code style

- **No comments that narrate the code.** A comment is a short _why_ marker: a decision or
  constraint, an algorithm reference, or requested JSDoc. It says why, and leaves what to the code.
- ESM `.mjs` and Bash, without a build step or npm dependencies. Node's built-ins, `jq`, `gh`,
  `curl`, and `python3` are what the scripts call.
- Formatting comes from `.editorconfig` and `.prettierrc`. An override there keeps
  `proseWrap: preserve` for `word-list.md`, which agents grep, so each entry stays on one line, and
  for `agents/*.md`, whose `description:` stays on one line, like the one in a `SKILL.md`.
  `.prettierignore` holds what must keep its exact text, and its comments say why.
- The rest of the house style is in `CLAUDE.md` § Code.

## Third-party plugins

A plugin from outside this repository runs in every session on every fleet host, so `settings.json`
pins it to a commit that was read, and an update means reading the new commit first. Auto-update off
holds an installed copy, and only the pin holds a later install to the same code.

## Where the work is tracked

The queue, decisions, and learnings live in the vault under `projects/claude-config/`, and the same
project's `feedback.md` holds the rules for working here.
