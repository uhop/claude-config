# claude-config

Personal Claude Code configuration — commands, skills, settings, and `CLAUDE.md`.

## Install

```bash
git clone <this-repo> ~/Open/claude-config
cd ~/Open/claude-config
node install.mjs           # dry-run (default)
node install.mjs --apply   # symlink files into ~/.claude/
```

The installer is idempotent — safe to re-run after `git pull`.

## What gets installed

Top-level `CLAUDE.md`, `settings.json`, and the contents of `commands/` and `skills/` are symlinked into `~/.claude/`. Anything else in `~/.claude/` (per-host `settings.local.json`, runtime caches, `plugins/`, `projects/`, `sessions/`, etc.) is left untouched.

## Uninstall

`rm` the symlinks under `~/.claude/`. The runtime files Claude Code creates (caches, sessions, plugins) are unaffected.
