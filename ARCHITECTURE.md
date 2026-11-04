# Architecture

`claude-config` is the source of one person's Claude Code configuration. There is no build step:
`install.mjs` links the files into `~/.claude/`, and the harness reads them from there, so a change
here is live on the host at once and reaches the other fleet hosts through `git pull` and a rerun of
the installer.

## Project layout

```
CLAUDE.md             # Global rules, loaded by every session on every host
settings.json         # Harness settings: hooks, permissions, model, plugins
install.mjs           # Links the entries below into ~/.claude/; dry-run by default
agents/               # Sub-agent types (vault-sweep.md)
commands/             # Slash commands kept as plain prompts
hooks/                # Scripts the harness runs on tool and session events
├── lib/              # What the hooks share: the shell command parser, the lease token
└── test/             # Plain Bash tests, one file per hook or hook family
skills/               # One folder per skill: SKILL.md and its helper scripts and tests
.github/              # CI, Dependabot, funding, the Copilot pointer
```

## What gets installed

`install.mjs` links `CLAUDE.md` and `settings.json` directly, and every file under `agents/`,
`commands/`, `hooks/`, and `skills/` one by one, so a new file needs a rerun, and a rerun also
removes a link into this checkout whose target is gone. The rest of `~/.claude/` stays as it is, and
the root documents (`AGENTS.md`, this file, `README.md`) stay out of it.

## Hooks

`settings.json` wires them to these events:

- **PreToolUse:** `destructive-op-gate.sh` and `git-commit-gate.sh` gate commands;
  `vault-lease-gate.sh` blocks an edit in a repository another session holds.
- **PostToolUse:** `vault-lease-gate.sh --touch` renews the session's lease; `vault-notices.sh`
  relays the hosted vault's notices.
- **SessionStart:** `vault-lease-claim.sh` claims the repository; `vault-resume-brief.sh`,
  `vault-feedback-rules.sh`, and `vault-notices.sh` print the vault's digest;
  `vault-resume-prepare.sh` collects GitHub in the background for a later `/vault resume`; the
  `herdr-*` hooks label the terminal multiplexer's pane.
- **UserPromptSubmit:** `vault-resume-digest.sh`, on `/vault resume`, shows the user the digest,
  styled in a terminal, and puts it in the context.
- **SessionEnd:** `vault-lease-release.sh` releases the lease; `vault-session-record.sh` appends the
  session's record.
- **Stop:** `bg-shells-open.sh` names a background shell still running.

A vault hook fails open: without settings or a server it stays silent and allows the call.
`lib/shell_segments.py` is the parser the gates share.

## Skills

A skill's `SKILL.md` carries the judgment and its scripts carry the mechanical steps, each printing
a compact digest. The larger families:

- **The vault:** `vault` and the `vault-*` skills drive the knowledge base over its REST API.
  `skills/vault/vault-settings.mjs` resolves the server's settings, and
  `skills/vault/queue-items.mjs` owns a queue kept as one note per item. An agent reaches the same
  server through MCP tools; a script cannot call those. `/vault resume` loads a skill's whole
  `SKILL.md` into context, so the vault's holds that command and a table, and `references/` holds
  the rest, read on demand.
- **Fleet checks:** `fleet-fix`, `fleet-status`, `release-check`, `release-prep`, and
  `ai-docs-update` read and audit the other repositories.
- **Retrospectives:** `reflect`, `clarify`, `process-review`, and `transcript-profile` read session
  transcripts and git history.
- **Prose:** `writing-style` holds the house style; `docs-review`, `document-wiki-page`,
  `wiki-conventions`, `wiki-index`, and `wiki-organize` apply it to documentation and wikis.

State lives outside the repository. The vault holds the queue, decisions, learnings, and logs for
every project, including this one.
