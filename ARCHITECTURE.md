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
agents/               # Sub-agent types (vault-sweep.md, design-reader.md)
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
  `vault-lease-gate.sh` blocks a Bash write into a repository another session holds.
- **SessionStart:** `fleet-brief.sh` prints the brief's fleet-only lines; the `herdr-*` hooks label
  the terminal multiplexer's pane.
- **Stop:** `bg-shells-open.sh` names a background shell still running.

The Program Clerk plugin (`apodictum/program-clerk`) runs the session's lease, brief, notices,
feedback rules, and session record since vault-storage D761, and the `/pickup` digest, which
replaced `/vault resume`, since D763 and D764: its hooks collect GitHub at a fresh session's start
and show the digest on `/pickup`. A vault hook fails open: without settings or a server it stays
silent and allows the call. `lib/shell_segments.py` is the parser the gates share.

## Skills

A skill's `SKILL.md` carries the judgment and its scripts carry the mechanical steps, each printing
a compact digest. The larger families:

- **The vault:** `vault` and the `vault-*` skills drive the knowledge base over its REST API.
  `skills/vault/vault-settings.mjs` resolves the server's settings, every script calls the API
  through `skills/vault/vault-fetch.mjs`, which waits out a 429 that names its `Retry-After` for
  five minutes at most and an outage for 90 s from its first failure, whose time a file shares so
  every call that meets the outage waits until then and tries once after (questions 430 and 431)
  (vault-storage D751: a connection never made or a 503 that applied nothing for any method, a 502,
  503, or 504 for a read), and `skills/vault/queue-items.mjs` owns a queue kept as one note per
  item. The hooks call `curl` through `hooks/lib/vault-retry.sh`, with their one- or two-second caps
  and two more tries after 1 and 2 s by the same rules, and fail open; the lease gate says a lookup
  the server refused. An agent reaches the same server through MCP tools; a script cannot call
  those. A `/vault` command loads the skill's whole `SKILL.md` into context, so the vault's holds
  the rules a session needs most and a table, and `references/` holds the rest, read on demand.
- **Fleet checks:** `fleet-fix`, `fleet-status`, `release-check`, `release-prep`, and
  `ai-docs-update` read and audit the other repositories.
- **Retrospectives:** `reflect`, `clarify`, `process-review`, and `transcript-profile` read session
  transcripts and git history.
- **Prose:** `writing-style` holds the house style; `docs-review`, `document-wiki-page`,
  `wiki-conventions`, `wiki-index`, and `wiki-organize` apply it to documentation and wikis.

State lives outside the repository. The vault holds the queue, decisions, learnings, and logs for
every project, including this one.
