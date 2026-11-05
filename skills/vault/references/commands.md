# Other commands

Part of the vault skill: the table in its `SKILL.md` says which file holds a section named here.

### /vault ingest

Compile **ready** raw notes into the wiki. Drafts (no `ready: true`)
are skipped — the user is still iterating on them.

1. **Pull the ready list.** `vault_raw_inbox` (pre-0.1.0 adapter:
   `vault-curl /maintenance/raw-inbox -s | jq`) returns
   `{ready: [{path, title, updated}], drafts: [...]}`. Process only `ready`. If
   that array is empty, report "no ready notes; N drafts waiting" and
   stop. (The user flips `ready: true` in FM when a note is ripe.) A note
   another pass holds is listed under `held`, not `ready`.
2. **Lease the ready notes** (§ Note leases) as one batch, always with a
   `ttl_seconds` sized to the run, since a batch with none holds for four
   hours (1800 covers a few notes): `vault-curl /leases/claim -X POST -H
   'Content-Type: application/json' --data-binary '{"holder":
   "<host>/<session>", "resources": ["note:<ready path>", …],
   "ttl_seconds": 1800}'`; renew with `POST /leases/renew` and `{holder,
   claim_token, ttl_seconds}` when a run outlasts it. A note in `held` is
   being compiled by another session: skip it. Keep the `claim_token`.
   Then, for each leased note, read the content with `vault_read_file`.
3. Extract concepts — create or update topic notes in `topics/`,
   project notes in `projects/<name>/`, or queue items with
   `queue-items.mjs file <name>` per the content's nature. Before extending
   or superseding an existing topic note, lease it too (a second batch, its
   own token, the same short TTL), so a duplicate merge cannot archive
   it under you; when `held` names it, write a new note instead, or leave
   that point for the next run. When a
   compilation *replaces* an existing topic outright (the old note is
   being retired, not extended), use `vault_supersede` instead of
   overwriting in place — the predecessor is archived with its record id
   and a typed `supersedes` edge instead of silently vanishing into a
   PUT.
4. Add wikilinks, backlinks, and tags on the derived notes. Tags per
   § Note format: check the names with `vault_tag_nearest`, write with
   `strict_tags: true`, mint only when nothing fits; declare the note's
   relations in `edges:` and write with `strict_edges: true`.
5. **Enrich at capture.** When creating a new topic note (or materially
   rewriting an existing one), write the `agent:` block in the same PUT
   — born-enriched is cheaper than a later backfill pass through
   `/vault-enrich-all`. Field shape and quality guidance:
   `~/.claude/skills/vault-enrich-all/SKILL.md` § "Per-note `agent:`
   block shape" + § "Generate enrichment fields". Set
   `derived_from_hash: "auto"` — the server stamps the hash of the body
   it writes plus `derived_at` (2026-07-09; on an older server compute
   `sha256(body)` locally). `complexity` is a closed enum —
   `prose` | `code-heavy` | `tabular` | `mixed` | `hub` | `log-entry`; a
   judgment word such as `moderate` is a 400 `invalid_enum_value` (16
   sessions in three weeks, reflect 2026-09-22). **Use
   the JSON write path** (`Content-Type: application/json` with
   `{frontmatter: {...}, body: "..."}`); `agent.summary` regularly
   contains colon-space prose that 500s through the markdown path's
   YAML parser, and JSON sidesteps that whole class of authoring trap
   (the hash value also doesn't need explicit quoting under JSON — the
   value is a string in the JSON object, and the server's
   `yaml.stringify` emits the right YAML for it). The indexer picks
   the block up on import and embeds the summary as its own vector;
   search scores a note by the better of its best chunk and its summary
   (vault-storage D45; an older server prefixes it to every chunk).
6. **Archive the source.** After successful ingestion of a single raw
   note, in this order:
   - PUT the source with `ready: "__unset__"` and `processed: true`
     (and a `> Ingested YYYY-MM-DD → [[derived/note]]` footer pointing
     at the primary derived target if there is one). `"__unset__"` is
     the server's FM key-removal sentinel (2026-07-23) — FM is
     union-merged on write, so *omitting* a key never deletes it. On an
     older server the sentinel is stored as a literal string; use
     `ready: false` there instead.
   - `vault_move` from `raw/<name>.md` to
     `raw/archive/<YYYY-MM-DD>-<name>.md`, with the batch's
     `claim_token`, so the inbox surfaces only pending material. (Before
     adapter 0.15.0, `vault_move` refuses the token: use `vault-curl
     /vault/move -X POST` with `{from, to, claim_token}`.) A `vault_supersede`
     of a leased topic note carries that note's token the same way.
   Process notes one-at-a-time end-to-end: derived note created →
   source updated → moved to archive. A failure mid-ingest leaves
   earlier notes archived and the rest still pending — safe to retry
   `/vault ingest` to resume.
7. **Release every batch you took** with `POST /leases/release` and
   `{holder, claim_token}`, on a failure too. A retry's batch sees your own
   unreleased one as `held`, since any live lease counts, yours included:
   release it first when you still have the token, or let it lapse.

### /vault query {question}

Research a question against the vault.

1. Use `vault_search` to find candidate notes — `mode=semantic` for conceptual queries, `mode=lexical` (the default) for verbatim phrases.
2. Read the most relevant notes with `vault_read_file` (or `vault_read_meta` when frontmatter answers it); use `vault_neighborhood` / `vault_backlinks` / `vault_similar` to expand context if a single note isn't enough.
3. Synthesize an answer.
4. Optionally file the answer into `queries/YYYY-MM-DD-{slug}.md` if substantive — wikilinks back to the source notes used.

### /vault lint

The **hygiene** lint, implemented as its own skill — `/vault-lint`
(`~/.claude/skills/vault-lint/vault-lint.mjs`). It reads every indexed record
via `/sections` and reports seven categories — `FRONTMATTER` (required keys, date
sanity), `BODY` (empty/`null` bodies; newline-collapsed bodies), `WIKILINKS`
(broken body targets), `DENSITY` (topic notes < 2 outbound; isolated project
notes), `CURRENCY` (per-type retention), `DUPLICATES`
(near-identical folders / titles), `QUEUE` (item notes with an
unknown section or the wrong type, completion markers in open titles, a real
`queue.md`) — against the thresholds in
`topics/vault-hygiene-policy.md`. Exit `0` clean, `1` on findings. Read-only:
it reports, never fixes. Full docs + flags + v1 limitations:
`~/.claude/skills/vault-lint/SKILL.md`.

```bash
~/.claude/skills/vault-lint/vault-lint.mjs           # full report
~/.claude/skills/vault-lint/vault-lint.mjs --quiet   # tab-separated data lines (pipe/grep)
```

Do not confuse it with the server-side **integrity** lint, which is a different
tool (embeddings / orphans / temporal anomalies / tag aliases — *not* hygiene).
Call `vault_lint` for it; the curl form below is the fallback. `vault_lint`
does return the `coverage.enrichment` block (`by_type` breakdown +
`unenriched_records` worklist) that `/vault sweep` reads — verified
2026-08-03, and named in the tool description since `b1882f7`):

```bash
vault-curl /system/lint -s   # integrity, NOT hygiene
```

On findings, decide (the linter won't):
- Fix legitimate issues directly (frontmatter backfill, broken-link rewrites).
- Per-type retention actions: `log` findings (> 90 days) are **deleted** —
  logs are transient by policy (2026-07-31); durable notes cite logs as
  backticked paths, never wikilinks, so deletion breaks nothing. Other types
  keep archival semantics (move — e.g. stale zero-inbound queries — to an
  `archive/` folder rather than delete).
- For duplicate-folder candidates, decide canonical and bulk-rewrite inbound
  wikilinks (the 2026-04-27 `tape6/` → `tape-six/` dedup is the procedural
  template — see `projects/tape-six/decisions.md` § Project name).

### /vault trackers [project]

Declare or change where a project's work is tracked: the `trackers:` list in
the project's `queue/_about.md` frontmatter (vault-storage D95). A setting that
needs decisions and credentials is set from the agent (Eugene, 2026-09-29), and
the project page names this command. GitHub first; Linear and Jira when he has subscriptions.

1. **Read what stands:** `queue-items.mjs trackers <project> --json`; report
   `primary`, the list, and any `problems`.
2. **Ask** with `AskUserQuestion`, one tracker at a time: `kind` (`github`,
   `linear`, `jira`; the vault itself needs no entry), `ref` (`owner/repo` for
   GitHub, read from `git remote get-url origin` before asking; a Linear team
   key; a Jira project key), `role` (`primary`, or `secondary` when the vault
   queue stays primary), `create` (`here` when new work may be created there;
   a primary creates by default), `intake` for a secondary (`reflect`, its
   threads as review items under Active; `triage`, the same under `## Inbox`
   until accepted or rejected; `none`, no items), and `write` (the fields the
   vault may write back; empty is read-only).
3. **Check the access before writing:** for GitHub, `gh auth status` on this
   host and whether the repository is public, since the collector reads
   public github.com repositories only; for Linear or Jira, the vendor's MCP
   tools in this session's tool list. Missing access is reported beside the
   declaration, never a reason to skip it.
4. **Write** with `vault_patch_fm({record_id, ops: [{op: "add", path:
   "/trackers", value: {kind, ref, role, create, intake, write}}]})` on the queue's
   folder note (`vault_list_pieces({file_prefix:
   "projects/<name>/queue/_about.md"})` gives the id); an object member is accepted (checked 2026-09-29), and
   `remove` with the same value drops an entry. Never rewrite the note for it.
5. **Read it back** with `queue-items.mjs trackers <project> --json` and report
   the validated view; a non-empty `problems` list is a malformed entry, fixed
   in the same turn.

What a note records about each tracker's objects, and which of the vendor's
tools reads them, is in the per-tool notes under
`projects/vault-storage/integrations/` (`github` first). How a session
records the ticket it works on when the primary is outside the vault, one
Active item with `source:`, is under **Trackers** in `/vault resume`, § When a digest line is taken up.

### /vault verify [project] [--all] [--unchecked]

Check the project's vault notes against its repository — the map against
the territory. `/vault check` asks whether the repository moved since the
baseline; this asks whether the repository supports what the notes say.
Implemented as its own skill, `/vault-verify`
(`~/.claude/skills/vault-verify/vault-verify.mjs`): run from the project
directory, it reads `projects/<name>/` from `/sections` and verifies every
backticked path with a slash (exists; gone since; a line reference within
the file), every 7- or 40-hex commit (here or in a sibling checkout; dated
as the sentence says), every version beside a release verb (a tag, or a
package.json version ever declared), and every `N files in \`dir/\`` or
`\`file\` (N lines)`. A date pairs with a claim only in one-statement
shapes. corpus/, research/ and archives are skipped unless `--all`;
`--unchecked` lists the counts nothing can verify, for the agent's
spot-check. Report-only, `--quiet` TSV, exit 1 on findings. Calibrated
2026-09-06 (claude-config D17); rules, residue classes and limitations in
`~/.claude/skills/vault-verify/SKILL.md`.

```bash
~/.claude/skills/vault-verify/vault-verify.mjs               # current project
~/.claude/skills/vault-verify/vault-verify.mjs --unchecked   # plus the spot-check list
```

Run it at wrap or after a documentation pass, and read each finding's line:
a path from another codebase the note analyzes is "never existed in this
repository", and correct.

### /vault (no subcommand)

Show vault status: note counts per folder, recently updated notes, any lint
warnings. All reads: `vault_status` (records / edges / pending suggestions /
last indexed commit), `vault_list_folder` per folder, `vault_list_pieces`
(`sort: "updated"`) for recency, `vault_lint` for warnings.
