# claude-config

Personal Claude Code configuration — commands, skills, hooks, settings, and `CLAUDE.md`.

## Install

```bash
git clone https://github.com/uhop/claude-config.git ~/Open/claude-config
cd ~/Open/claude-config
node install.mjs           # dry-run (default)
node install.mjs --apply   # symlink files into ~/.claude/
```

The installer is idempotent — safe to re-run after `git pull`. It also removes a link into this
checkout whose target is gone, such as a skill that was renamed, and leaves everything else in
`~/.claude/` alone.

The TypeScript language server is a plugin pinned in `settings.json`, and its install is one step
per machine. Start any Claude Code session once so it registers the pinned marketplace (one whose
login has expired still does), then run:

```bash
claude plugin install typescript-native-lsp@uhop-pinned
```

### On chezmoi-managed machines

If you also use the [dotfiles](https://github.com/uhop/dotfiles) chezmoi repo, install claude-config
**before** the first `chezmoi apply`. The dotfiles repo includes a Windsurf-side bridge script that
requires `~/.claude/skills/` to exist — installing claude-config first lets it succeed on first
apply. (If you do them in the other order, the bridge fails the first time with a clear message;
just re-run `chezmoi apply` after this installer.)

Once both are bootstrapped, `playbash-{daily,weekly,clean}` (from dotfiles) will keep this repo
refreshed via a `claude-config-update` wrapper that does `git pull --ff-only` +
`node install.mjs --apply`.

## What gets installed

Top-level `CLAUDE.md`, `settings.json`, and the contents of `commands/`, `skills/`, `hooks/`, and
`agents/` are symlinked into `~/.claude/`, except the files git ignores, such as Python's bytecode
and a script's local state. The installer removes a link into the checkout whose file is gone or
ignored. Anything else in `~/.claude/` (per-host `settings.local.json`, runtime caches, `plugins/`,
`projects/`, `sessions/`, etc.) is left untouched.

### `agents/`

- `vault-sweep.md` — the sub-agent type `/vault sweep` dispatches for its enrichment, tag, edge, and
  duplicate passes: Sonnet at `medium` effort with `omitClaudeMd`, told not to call the advisor and
  to report in five lines at most. A `general-purpose` sub-agent inherits the session's
  `effortLevel` and advisor instead.
- `design-reader.md` — reads one design note with no session context, before the note's questions go
  to the user, and reports what it proposes and what it commits the work to that the author's
  message does not show: Sonnet at `medium` effort with `omitClaudeMd`, read-only. A running session
  sees a new agent type from a later message, not in the turn that installs it.

### `hooks/`

`PreToolUse` / `PostToolUse` scripts that gate or react to tool calls. Currently:

- `code-rules-gate.sh` — refuses an `Edit` or a `Write` that introduces a code rule a program can
  check, and tells the agent the rule and its reason: a split on `'\n'`, a regex lookbehind, a bare
  `Symbol()`, a raw NUL. The rules live in `hooks/lib/code_rules.py`, not in the global `CLAUDE.md`,
  so a session reads one only when it breaks it. Only what the edit adds counts, so a file's older
  breaks never block an edit. An exception is a line holding `code-rules: allow <id>`: one the edit
  adds brings up the person's permission prompt, and one already in the file stays approved. A write
  through Bash is not read.
- `git-commit-gate.sh` — reinstates the old default-deny for `git commit` and the other verbs that
  make a commit (`am`, `merge`, `cherry-pick`, `revert`, `rebase`, a `pull` that may merge; their
  `--ff-only`, `--squash`, `--no-commit`, and `--abort` forms make none), but allows it in projects
  that opt in by creating `.claude/git-commit-allowed`, which it refuses an agent's write to outside
  the temp and cache directories. Wired in via `settings.json`'s `hooks.PreToolUse`. A free
  substring pre-filter, then the shared parser (`hooks/lib/shell_segments.py`, the lease gate's)
  decides whether the verb is executed — heading a segment, behind a shell keyword, `xargs`,
  `parallel`, `watch`, or `find -exec`, inside `$(...)`, in a `bash -c` string, in a heredoc a shell
  receives — or is data: a heredoc body `cat` receives, a quoted string, a `git log --grep` argument
  (2026-09-06). With the parser unavailable the substring verdict stands, since this gate defaults
  to deny. It follows a variable the command assigns, denies a site that stays unknown, and needs no
  marker for a scratch repository under the temp or cache directory or for a linked worktree
  (2026-11-02). The script's header comment documents the why and the contract; the per-project
  marker is intended to be committed alongside the project so the opt-in travels with the code.
- `handed-command-check.sh` — a `Stop` hook: a `<word>` placeholder or a scratch path in a command
  block of the turn's closing message sends the agent back once, since a command he runs carries no
  placeholder the session can fill and the scratchpad is no delivery location.
- `vault-lease-gate.sh` — enforces the agent-coordination repo lease on
  `Edit`/`Write`/`NotebookEdit` and on write-shaped `Bash`: resolves the edited file's repo (or, for
  Bash, every repository the command's write targets name: redirections, `sed -i`, `tee`, `cp`/`mv`
  destinations, `rm`, `mkdir`, mutating `git` verbs, `prettier --write`, `npm install`, with `cd`
  tracked and heredoc bodies ignored) to its normalized remote URL, asks vault-storage who holds
  that lease, and blocks the call when the holder is someone other than this session, pointing at
  the worktree + handoff path instead. Linked worktrees are never blocked, since they are that path.
  **Fails open on every unknown** — no vault env, no `jq`/`curl`, unreachable or slow server,
  non-repo path, unclaimed repo — because the worktree discipline was already collision-safe, so the
  hook may only redirect work, never deny it on infrastructure trouble. A 10-second per-repo cache
  keeps an edit burst to one request. Solo sessions with an empty lease registry never notice it.
  The same script runs as `vault-lease-gate.sh --touch` from `hooks.PostToolUse` on every tool call:
  it renews the session's own cwd lease (and re-claims it after a lapse) so a session that edits
  through Bash or works through MCP tools alone stays live; a fresh renew stamp costs a `stat`, and
  touch mode never blocks or prints. The command reader is `hooks/lib/shell_segments.py`, shared
  with the commit gate (2026-09-06).
- `vault-notices.sh` — the hosted vault's notices (vault-storage 7q-4): what still interrupts the
  service, from `GET /system/notices`, which the front answers. As
  `vault-notices.sh --session-start` in `hooks.SessionStart` it lists every notice as
  `[vault] notice:` lines beside the brief; from `hooks.PostToolUse` it asks at most once a minute
  and puts each notice the session has not seen into the agent's context once, with a reminder to
  tell the user and start no sweep or long batch inside its window. The ids seen are kept per
  session under `~/.cache/claude-vault-notices/`, a week long. Sub-agents are skipped. **Fails
  open**, like the other vault hooks: no env, no `jq`/`curl`, an unreachable server, or one without
  the route is silence.
- `vault-resume-prepare.sh` and `vault-resume-digest.sh` — make `/vault resume` a digest on the
  screen and a line or two of reply, with no call (vault-storage 12d, D594). The first, an async
  `hooks.SessionStart` entry with the `startup` matcher, collects GitHub in the background into
  `~/.cache/vault-resume/<session id>.json`. It only reads GitHub, so a session that never resumes
  files nothing and advances no baseline. The second, in `hooks.UserPromptSubmit`, leaves every
  other prompt at its first test. On `/vault resume` it waits for a collection still running, then
  runs `skills/vault/resume.mjs`, which files new threads and CVEs, advances the baseline, and
  prints the digest with its control bytes removed. The hook shows the user the digest, in ANSI
  styling when `CLAUDE_CODE_ENTRYPOINT` is `cli` (D595), since a terminal is the one surface known
  to draw it. It puts the plain text in the agent's context, inside a random tag and labeled as
  data, since hook output otherwise reads as the user's words and a digest quotes strangers. A
  collection older than five minutes, or none, is collected afresh. **Fails open**: with no digest
  printed, the skill runs the script itself.

## Uninstall

`rm` the symlinks under `~/.claude/`. The runtime files Claude Code creates (caches, sessions,
plugins) are unaffected.
