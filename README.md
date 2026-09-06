# claude-config

Personal Claude Code configuration — commands, skills, hooks, settings, and `CLAUDE.md`.

## Install

```bash
git clone git@github.com:uhop/claude-config.git ~/Open/claude-config
cd ~/Open/claude-config
node install.mjs           # dry-run (default)
node install.mjs --apply   # symlink files into ~/.claude/
```

The installer is idempotent — safe to re-run after `git pull`.

### On chezmoi-managed machines

If you also use the [dotfiles](https://github.com/uhop/dotfiles) chezmoi repo, install claude-config **before** the first `chezmoi apply`. The dotfiles repo includes a Windsurf-side bridge script that requires `~/.claude/skills/` to exist — installing claude-config first lets it succeed on first apply. (If you do them in the other order, the bridge fails the first time with a clear message; just re-run `chezmoi apply` after this installer.)

Once both are bootstrapped, `playbash-{daily,weekly,clean}` (from dotfiles) will keep this repo refreshed via a `claude-config-update` wrapper that does `git pull --ff-only` + `node install.mjs --apply`.

## What gets installed

Top-level `CLAUDE.md`, `settings.json`, and the contents of `commands/`, `skills/`, and `hooks/` are symlinked into `~/.claude/`. Anything else in `~/.claude/` (per-host `settings.local.json`, runtime caches, `plugins/`, `projects/`, `sessions/`, etc.) is left untouched.

### `hooks/`

`PreToolUse` / `PostToolUse` scripts that gate or react to tool calls. Currently:

- `git-commit-gate.sh` — reinstates the old default-deny for `git commit`, but allows it in projects that opt in by creating `.claude/git-commit-allowed`. Wired in via `settings.json`'s `hooks.PreToolUse`. The script's header comment documents the why and the contract; the per-project marker is intended to be committed alongside the project so the opt-in travels with the code.
- `vault-lease-gate.sh` — enforces the agent-coordination repo lease on `Edit`/`Write`/`NotebookEdit` and on write-shaped `Bash`: resolves the edited file's repo (or, for Bash, every repository the command's write targets name: redirections, `sed -i`, `tee`, `cp`/`mv` destinations, `rm`, `mkdir`, mutating `git` verbs, `prettier --write`, `npm install`, with `cd` tracked and heredoc bodies ignored) to its normalized remote URL, asks vault-storage who holds that lease, and blocks the call when the holder is someone other than this session, pointing at the worktree + handoff path instead. Linked worktrees are never blocked, since they are that path. **Fails open on every unknown** — no vault env, no `jq`/`curl`, unreachable or slow server, non-repo path, unclaimed repo — because the worktree discipline was already collision-safe, so the hook may only redirect work, never deny it on infrastructure trouble. A 10-second per-repo cache keeps an edit burst to one request. Solo sessions with an empty lease registry never notice it. The same script runs as `vault-lease-gate.sh --touch` from `hooks.PostToolUse` on every tool call: it renews the session's own cwd lease (and re-claims it after a lapse) so a session that edits through Bash or works through MCP tools alone stays live; a fresh renew stamp costs a `stat`, and touch mode never blocks or prints.

## Uninstall

`rm` the symlinks under `~/.claude/`. The runtime files Claude Code creates (caches, sessions, plugins) are unaffected.
