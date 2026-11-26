---
name: vault
description: "The fleet's rules for writing Program Clerk's notes outside a plugin command: narrow writes, the enrichment patch, the queue shim claude-config's scripts call, and the references on note format, the shell, and coordination. Use before writing or editing a vault note by hand, when the user asks to remember or save something, or when the user types a retired /vault or /vault-* command, to name the plugin command that replaced it."
user_invocable: true
---

# Knowledge Base

Persistent knowledge base (vault-storage), reachable two ways: **MCP tools**
(`mcp__program-clerk__*`) and the **REST API** via the `vault-curl` wrapper. The LLM
writes and maintains all content.

The MCP server is the server's own endpoint (vault-storage 7as), registered
once per host, in `~/.claude.json`, because `settings.json` cannot carry a
server definition (claude-config learnings, 2026-08-02):
`claude mcp add --scope user --transport http program-clerk https://api.programclerk.dev/mcp --header 'Authorization: Bearer ${PROGRAM_CLERK_KEY}'`.
The single quotes keep the reference, which Claude Code expands from the
shell's `PROGRAM_CLERK_KEY` when it connects, so the file holds no key; a
session loads the server only at start. When no `mcp__program-clerk__*` tool
is in the session, the host has no registration (`claude mcp list` says
which): use `vault-curl` for the session and give the user that command; the
next session has the tools.

## Where the rest is

This file holds the rules for the writes a session makes most, whose mistakes land with no
error. The rest is in files under `references/` in this skill's base directory. Before you do what
a row names, read its file; on a digest, read none of them. A section another note cites as "the
vault skill § X" is here or in the file its row lists; a section of the retired commands is the
plugin command's that replaced it.

| Before you | Read | Its sections |
| --- | --- | --- |
| Pick a vault tool the next section does not name, or split or join a note | `references/tools.md` | Surface split (with A split note, A decisions note), Reads: the MCP tools |
| Give a note frontmatter, tags, or edges, or declare trackers (a topic note's `type` is `permanent`: there is no `topic` type) | `references/notes.md` | Vault structure, Note format |
| Call `vault-curl` or `vault-put`, or page through a list | `references/shell.md` | `vault-put`, Use `vault-curl`, Pagination, Guard `jq` pipes, Fallback: raw `curl` |
| Edit another repository, or touch a lease, a handoff, or a pass's note leases | `references/coordination.md` | Note leases, Agent coordination |
| Take up a line of the digest | `references/resume-lines.md` | When a digest line is taken up, with Trackers |

## Writing to the vault

**Prefer the narrow write over the whole-document one.** `write_file`
and `update_piece` replace an entire document, so a mistake costs the
whole document; `append`, `replace`, `replace_section`, and
`patch_fm` are atomic server-side ops whose blast radius is the thing
being changed. Reach
for a whole-document write only when authoring a new note or genuinely
rewriting one.

**Keep the enrichment current in the same write** (server from 2026-09-27,
D74; adapter ≥ 0.11.0). `append`, `replace`,
`replace_section`, `remove_item`, and `insert_item` take an
optional `agent` patch, and `move_item` takes `from_agent` and
`to_agent`: the fields given are merged over the stored `agent:` block and
the block is stamped current for the new body, so the edit files no stale
suggestion of its own. The server's backstop still files one after ten body
writes under one summary text, or a week with one (vault-storage D284, kept
by question 276), and only the sweep's refresh, which reads the note, clears
it: a bulk edit over notes with old summaries sends them through the next
sweep. Pass `agent: {}` only when every statement in the
summary is still true after the edit, as on an append to a rolling note
(queue, archive, decisions, learnings, stack, feedback) of more entries of
the kind it describes; pass `agent: {summary: "…"}` when your text opens
something the summary does not cover. **A move or removal out of a note
always restates its summary** (`from_agent: {summary}` on `move_item`,
`agent: {summary}` on `remove_item`), since the item leaving is often
what the summary names as next, in flight, or open; the server refuses a
patch there without a new summary, the stored one sent back included, with a
400 `summary_required` (server from 2026-10-17, vault-storage D283), and
leaving the patch out marks the summary stale for the sweep instead. **For
several moves out of one note in a row, leave `from_agent` out on all but
the last and restate on the last:** the summary you would write at the first
move is often already true after the second, and the server refuses it sent
again, so writing it early leaves you nothing honest to send later (D287).
Recheck
a summary's dated and positional claims (`through D395`, `last swept`,
"next") on every write. **A rolling note's restated summary keeps the
rolling form** (vault-storage D378): what the note holds and its span, as
the Program Clerk plugin's `skills/sweep/references/enrich.md` § Field guide gives it, the span moved
and a subject added when the new entries open one, never a clause per
write. Every resume ships a project's summaries and every write rewrites
its note's, and two decision and learnings summaries that grew a clause an
arc reached 10,000 characters. `/system/lint` counts a summary past 3,000
characters as `oversized_summaries`; restate one you meet in the rolling
form on your next write to its note, and `/sweep` restates the ones
the lint lists. A patch without a summary over a summary that was
already stale before your edit leaves the block stale, and the answer carries
`agent_stale: true` (server from 2026-10-01, vault-storage D133): read that
summary, and restate it as `summary` if it holds or leave it for the sweep.
On a note without an `agent:` block, `agent: {}` acts as if left out and
the write lands (server from 2026-10-29, vault-storage D545). An older
server answers 409 `no_enrichment`, so send the write again without the
patch. A patch naming fields there needs a summary (409
`no_enrichment`). An older server refuses
the field with a 400 for an unknown body field; drop it there. An adapter
before 0.11.0 accepts `agent` and drops it without a word (it does not
declare it, and only 0.11.0 refuses undeclared arguments), so the note stays
stale: there, the same field goes in the `POST /vault/edit` or
`/vault/move-item` body through `vault-curl`.

**A write refused 403 `storage_full`** (vault-storage D270): the account's notes
are at its limit on stored text, and nothing was written. Tell your person the
`usedBytes` and `limitBytes` its `details` carry; never delete or shrink notes to
make room. Writes that add no text, deletes, and reads still work.

**A queue is the plugin's `queue` skill**: one note an item under `projects/<name>/queue/`, filed,
moved, and archived with its script. claude-config's scripts call
`~/.claude/skills/vault/queue-items.mjs`, a shim over the plugin's queue module and script with the
same commands, where `fleet` is the plugin's `all` (vault-storage D765).

## Retired commands

The Program Clerk plugin's commands replaced this skill's and the `vault-*` skills' (vault-storage
D763 to D768). When the user types a retired one, say in one line which command it is now, and stop:

| Typed | Now |
| --- | --- |
| `/vault resume` | `/pickup` |
| `/vault wrap`, `/vault log`, `/vault learn` | `/wrap` |
| `/vault check`, `/vault-check-drift` | `/pc check` |
| `/vault sweep`, `/vault-enrich-all`, `/vault-compact`, `/vault-review-*` | `/sweep`, or `/sweep <pass>` |
| `/vault ingest` | `/ingest` |
| `/vault query`, `/vault lint`, `/vault-lint`, `/vault trackers`, `/vault` | `/pc query`, `/pc lint`, `/pc trackers`, `/pc` |
| `/vault-search`, `/vault-similar`, `/vault-graph` | the `search`, `similar`, and `neighborhood` tools |
| `/vault verify`, `/vault-propose-related` | none: retired with no replacement |

Each plugin command also answers as `/program-clerk:<name>`, which works even when Claude Code adds a
command of the same name. A `/pickup` digest past a hook's 10,000 characters arrives as a file path
and a preview: read the file before replying.

## Saving between wraps

When the user says "remember this", or the session finds a lesson worth keeping, put it where
`/wrap`'s step 1 puts one, with a narrow write. When in doubt, ask: "Want me to save this to the
vault?"

A learnings note kept as a folder (`projects/<name>/learnings/`, its `_about.md` opening "Atomized
from") follows its `_about.md`, so read it first. A folder `/vault-reorg` made takes a new lesson as
one bullet in its subject's piece; a folder `split` made takes one appended to `learnings.md` as a
`## ` section, which becomes a piece of its own.

When a session runs both, `/wrap` comes before `/sweep`: the wrap's writes are the sweep's intake.
