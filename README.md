# claude-config

Personal Claude Code configuration — commands, skills, settings, and `CLAUDE.md`.

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

Top-level `CLAUDE.md`, `settings.json`, and the contents of `commands/` and `skills/` are symlinked into `~/.claude/`. Anything else in `~/.claude/` (per-host `settings.local.json`, runtime caches, `plugins/`, `projects/`, `sessions/`, etc.) is left untouched.

## Uninstall

`rm` the symlinks under `~/.claude/`. The runtime files Claude Code creates (caches, sessions, plugins) are unaffected.
