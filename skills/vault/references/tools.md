# Choosing a vault tool

Part of the vault skill: the table in its `SKILL.md` says which file holds a section named here.

## Connection

### Surface split — MCP first, `vault-curl` for what MCP still lacks

**Adapter ≥ 0.1.0 reached parity with the REST API** (`@uhop/vault-storage-mcp`,
2026-08-03). Before that it was reads-only-plus-one-dangerous-write, and the
table below read very differently. The gate is self-resolving: your registered
tool list is in context, so *if the tool named below is present, use it*; if it
is not, this adapter predates parity — fall back to the `vault-curl` form given
in the same row.

| Operation | Use | Fallback on a pre-0.1.0 adapter |
| --- | --- | --- |
| Reads — document, folder, search, lint, status, suggestions, queue slices, graph | **MCP tools** | (always existed) |
| Body edits — append, replace-a-string | **`vault_append` / `vault_replace`** | `vault-put --append/--replace` |
| One `## Heading` section — read it, or replace its content leaving every other byte alone | **`vault_read_section` / `vault_replace_section`** (adapter ≥ 0.7.0; server ≥ 2026-09-06) | `vault-curl '/vault/<path>?section=<heading line>'` + `POST /vault/edit` with `{path, op: "replace-section", heading, body}` |
| One span — a section by its heading's leading text (a heading cited without its date) or under a parent, one queue item by its bold title, or one table row by its first cell — read whole or cut to its tail or head, or a `replace` whose `from` need be unique only inside it | **`vault_read_span`**, and **`vault_replace`** with `within` (and `count`, the number it asserts), `prefix` on `vault_replace_section` and the item tools (adapter ≥ 0.18.0; server ≥ 2026-10-26, vault-storage 4h) | `vault-curl '/vault/<path>?item=<title>&section=<heading>&tail=<bytes>'` (or `section` with `prefix=true`, or `row`) + `POST /vault/edit` with `{path, op: "replace", from, to, within: {item: "<title>"}}` |
| A note's tail or head with no span — the newest entries of a rolling note, the last decision's number in a decisions note still whole (§ A split note for one split) | **`vault_read_span`** with only `tail` or `max_bytes` (adapter ≥ 0.19.0; server ≥ 2026-10-28, vault-storage D514): the body, frontmatter left out, no `hash`; a composed folder note is a 409 `composed_view` naming its pieces, since their order is not its newest (D515). Any cut keeps whole lines while they fill half of it and otherwise fills the rest from the line past them | `vault-curl '/vault/<path>?tail=<bytes>'` |
| An item in a note that is no queue (§ A queue kept one item to a note) — remove it, insert it, or move it between documents with a trail after its title | **`vault_remove_item` / `vault_insert_item` / `vault_move_item`** (adapter ≥ 0.7.0; server ≥ 2026-09-06, D35) | `POST /vault/edit` with `{op: "remove-item" \| "insert-item", …}` + `POST /vault/move-item` |
| One frontmatter array member (`related:`, `agent.tags_suggested`) | **`vault_patch_fm`** | `PATCH /sections/{record_id}/fm` via `vault-curl` |
| One `tags:` member — the server refuses `/tags` in an FM patch (400 `protected_field`, since tags are taxonomy-validated) | **`vault_tag_add` / `vault_tag_remove`** (adapter ≥ 0.9.0) | `vault-curl /sections/{record_id}/tags -X POST` with `{"tag": "<tag>"}`, and `vault-curl /sections/{record_id}/tags/<tag> -X DELETE` |
| The nearest existing tags for proposed names or a draft's text, before minting (§ Note format) | **`vault_tag_nearest`** (adapter ≥ 0.12.0; server ≥ 2026-09-28, vault-storage D82) | `vault-curl /tags/nearest -X POST -H 'Content-Type: application/json' --data-binary '{"tags": ["<name>", …]}'` |
| Whole-document create or rewrite | **`vault_write_file`** (`expected_etag` when the read might be stale; `strict_tags: true` when the note carries `tags:`, `strict_edges: true` when it carries `edges:`, both adapter ≥ 0.12.0, § Note format) | `vault-put --fm/--body` |
| Replace a note, archiving the old one | **`vault_supersede`** | `POST /vault/supersede` via `vault-curl` |
| Split a note past its size bound into a folder of pieces, one per `##` section, the note archived with its `record_id` (§ A split note below) | **`vault_split`** (adapter after 0.19.0; server ≥ 2026-11-01, vault-storage D573) | `vault-curl /vault/split -X POST -H 'Content-Type: application/json' --data-binary '{"path": "<path>"}'` |
| Join a split note back into one note, the archived note restored with the folder's text (§ A split note below) | **`vault_join`** (adapter after 0.19.0; server ≥ 2026-11-01, vault-storage D574) | `vault-curl /vault/join -X POST -H 'Content-Type: application/json' --data-binary '{"path": "<path>"}'` |
| The notes directly in a folder whose frontmatter contains given fields, sorted by a field and paged, no bodies: the read under a folder of item notes (a skill's queue, decisions, a board) | **`vault_query`** (adapter after 0.19.0; server ≥ 2026-11-01, vault-storage D578; Postgres alone, a SQLite server answers 501) | `vault-curl /notes/query -X POST -H 'Content-Type: application/json' --data-binary '{"folder": "<folder>", "match": {"status": "active"}, "sort": "<field>"}'` |
| Restore a note to one of its versions; content not yet committed is committed first, so it stays a version | **`vault_restore`** (adapter ≥ 0.13.0; server ≥ 2026-09-30, vault-storage D115) | `vault-curl /vault/restore -X POST -H 'Content-Type: application/json' --data-binary '{"path": "<path>", "sha": "<sha>"}'`, with `from_path` when a rename came between |
| Rename preserving `record_id` | **`vault_move`** | `POST /vault/move` |
| Search-before-write | **`vault_propose`** | `POST /vault/propose` |
| Raw inbox, cleanup-lint, embed-pending, incremental-reindex, run-all | **`vault_raw_inbox` / `vault_cleanup_lint` / `vault_embed_pending` / `vault_incremental_reindex` / `vault_run_scans`** | `vault-curl /maintenance/…` |
| Repo leases — list/events, claim/renew/release/transfer | **`vault_lease_*`** (adapter ≥ 0.4.0; § Agent coordination in `coordination.md`). A server from D67 (2026-09-27) on wants the claim's `claim_token` on renew/release/transfer; an adapter without that parameter cannot send it, so use the fallback with `claim_token` in the JSON body | `vault-curl /leases[/events]` + `POST /leases/claim\|renew\|release\|transfer` |
| Note leases — reserve the notes a maintenance pass processes, renew, release, list (§ Note leases in `coordination.md`) | None until the adapter release after vault-storage 11e-5: `vault_lease_claim` takes one `resource`, and the `vault_work_*` tools reach the work claims the leases replace. Adapter ≥ 0.15.0 takes `claim_token` on `vault_move`, `vault_supersede`, and `vault_delete_file`; an older one refuses it as an undeclared argument, so use the fallback for a move that carries a token | `vault-curl /leases/claim -X POST -H 'Content-Type: application/json' --data-binary '{"holder": "…", "resources": ["note:<path>", "note:<folder>/"], "ttl_seconds": 1800}'`, `POST /leases/renew\|release` with `{holder, claim_token}`, `GET /leases?prefix=note:`; `POST /vault/move` and `/vault/supersede` with `claim_token` in the body, `DELETE /vault/<path>?claim_token=…` |
| Handoffs — create/list/get/events, claim/resolve/resubmit/note/verify | **`vault_handoff_*`** (adapter ≥ 0.5.0; `vault_handoff_verify` and `touches` ≥ 0.7.0; § Agent coordination in `coordination.md`). From D67, resolve wants the claim's `claim_token`; on an adapter without it, use the fallback | `vault-curl /handoffs[/{id}\|/events]` + `POST /handoffs[/claim\|resolve\|resubmit\|note\|verify]` |
| Handoff artifact — the git patch being handed over | **`vault_handoff_put_artifact`** (adapter ≥ 0.6.0); **read it to a file**, not into context: `vault-curl /handoffs/{id}/artifact -s > work.patch` | `vault-curl /handoffs/{id}/artifact -X PUT --data-binary @work.patch` |
| A data file — opaque text under `projects/<project>/data/` (never `.md`), kept apart from the notes and never parsed, indexed, or searched: logs, dated runs, tables | **`vault_data_read`** (one file, `include_etag` for its etag, or the files under `prefix`; on Postgres `versions` lists the texts a replace or a delete overwrote, kept 30 days, and `version` reads one, which a replace writes back to undo the overwrite) / **`vault_data_write`** (`op` `replace`, `append`, or `delete`, `expected_etag` sent as `If-Match`) (the adapter release after 0.19.0; server ≥ 2026-10-30, vault-storage D547, 10c; the versions from 2026-10-31, 10k) | `vault-curl '/data?prefix=<p>'`, `vault-curl /data/<path>` (the text, its `ETag`), `'/data/<path>?versions=1'` and `'?version=<id>'`, and `-X PUT` / `-X POST` (append) / `-X DELETE` on `/data/<path>` with the text as the body and `-H 'If-Match: <etag>'` to fence |
| `/commit`, snapshots, `cleanup-tag-aliases`, `release-embedder`, `folder-listing`, individual `find-*` scans, `summary-checked` (enrich-batch's confirmation, D289) | **`vault-curl`** | — deliberately not exposed on MCP |

**A split note** (vault-storage D573): `vault_split` cuts a note at its
`##` headings into the folder its stem names, a piece per section with
the text before the first heading in `_lead.md`, and archives the note
with its `record_id`. The path still reads whole, a wikilink to it
resolves to the folder's `_about.md`, and `vault_append` to the path
files each `## ` section of its text as a new piece after the last, so a
new feedback rule or lesson appended as a section lands as before.
`vault_replace` and `vault_replace_section` on the path reach the piece
holding their text or section, and `vault_read_span` reads a section,
item, or row from the composed view (server from 2026-11-01,
vault-storage D577). Text appended before a first heading and the item
tools on the path are a 409 `composed_view` naming the folder: find the
piece with `vault_list_pieces({file_prefix: "<folder>/"})` and edit it.
The server refuses a record other than decisions (a queue archive,
`sessions.md`) and `state.md`, which tools read by their path. `vault_join` undoes a
split (D574): the archived note returns to the path with its
`record_id` and the folder's current text, sections appended since
included, and the folder's notes are deleted; a subfolder, such as a
compaction's `archive/`, stays where it is (D577).

**A decisions note splits into one note per decision** (vault-storage 11c-1,
server from 2026-11-01), `projects/<name>/decisions/<heading's slug>.md`,
with no topics and without the note's tags. Nothing a session does at the
path changes: `vault_append` of one `## D<n>. Title (date)` section with
`agent: {}` files the next item, `vault_replace` and `vault_replace_section`
reach the item holding their text, and a span read of `## D45` with `prefix`
reads it. Two things do change. A tail read of the path is a 409
`composed_view`, so the next number comes from the newest item:
`vault_query({folder: "projects/<name>/decisions", sort: "sequence_key",
order: "desc", limit: 1})`, or its `vault-curl /notes/query` form, and its
title. An append with no `##` heading is a 409 too, so a one-line record goes
in as a section of its own. `vault_list_pieces({file_prefix:
"projects/<name>/decisions/d45-"})` finds an item's path.

**Split by topic** (vault-storage D576): pass `topics` to `vault_split`,
each `{name, title?, sections}` with `sections` the headings of whole
`##` sections, so a folder holds a few topic pieces in place of one per
section. Read the note's headings first (a `vault_read_file`, or the
pieces of a split folder), group sections a session would read together,
and keep each topic under about 20 KB; every section must be claimed
exactly once, a repeated heading taking the next occurrence, or the
server answers 400 `invalid_topics` naming the headings left over; name
a section by its number from 0 in place of its heading where like
headings repeat ("What shipped"), so each lands in the topic meant
(D577). To
regroup a note already split one piece per section, `vault_join` it and
split it again with `topics`. A topic piece is marked `grouped: true`
and carries its sections under their own headings. **In a grouped
folder, append a new section to the topic piece it belongs to**
(`vault_append` to that piece's path; `vault_list_pieces` lists the
topics), so the folder stays a few topics; an append to the note's path
still lands, as a piece of its own; gathering such pieces into their
topics is a sweep step still planned (vault-storage's plan, 3g's rest).

**Scripts cannot call MCP tools.** MCP is an agent-level surface, so
`enrich-batch.mjs`, `related-batch.mjs`, `vault-triage.mjs`,
`compact-batch.mjs`, `vault-sweep.mjs`, and `vault-put.mjs` stay on
`vault-curl` permanently. Parity changes what *you* call directly; it changes
nothing inside the batch harnesses.

The three data-loss guards that used to justify routing every write through
`vault-put` are **server-side as of 2026-08-03** (`46f6bf7`): an empty body
(400 `empty_body`), a literal-`"null"`/`"undefined"` body (400 `null_body`),
and a null top-level FM value (400 `null_frontmatter_value`) are refused on
`PUT /vault/{path}` and `PUT /sections/{id}` no matter which client sends
them. `vault-put`'s own checks are now a fast-fail convenience, not the only
line of defence — which is what makes an MCP write safe at all. (The
`empty_body` rule exempts a document whose *stored* body is already empty, so
an FM-only op that round-trips the body is never bricked.) Removal is
`vault_delete_file`; replacement-in-favour-of-other-content is
`vault_supersede`, never a delete.

### Reads: the MCP tools

Registered as `mcp__vault__<name>`; fetch schemas with
`ToolSearch("select:mcp__vault__vault_read_file,…")` before the first call
(deferred tools are name-only until then).

| Need | Tool |
| --- | --- |
| Session-start bundle (reindex + lint + suggestions + workflow + logs + project) | `vault_resume_bundle` |
| Read a document (composes atomized folders from `<stem>.md`) | `vault_read_file` |
| One section of a document, with the document's etag | `vault_read_section` (adapter ≥ 0.7.0) |
| Frontmatter only, no body | `vault_read_meta` |
| A note's committed versions, and the note as it was at one | `vault_history`, then `vault_read_file` with `at` and the version's own `path` (adapter ≥ 0.13.0; server ≥ 2026-09-30, vault-storage D115); before that adapter, `vault-curl /history -G --data-urlencode 'path=<path>'` and `vault-curl '/vault/<path>?at=<sha>'` |
| Where a project's work is tracked and which tracker is primary | `queue-items.mjs trackers <project>` (`--json` for the whole view; § Note format on declaring it) |
| What changed in a project's notes and queue since a time or a commit | `vault_project_changes` (adapter ≥ 0.13.0; server ≥ 2026-09-30, vault-storage D117); before that adapter, `vault-curl '/projects/<name>/changes?since=<ISO\|Nd\|sha>'` |
| List a folder | `vault_list_folder` |
| Search | `vault_search` (`mode=lexical` default, `semantic` opt-in); each match carries `at`, its headings and its queue item, which `vault_read_span` and `vault_replace`'s `within` take as they stand, so an edit follows a search with no read (adapter ≥ 0.18.0) |
| Integrity lint | `vault_lint` |
| Indexer/DB state | `vault_status` |
| Pending suggestions by kind | `vault_suggestions_summary` |
| Record listing with filters | `vault_list_pieces` |
| Graph | `vault_backlinks`, `vault_neighborhood`, `vault_similar` |
| Queue slices | `queue-items.mjs` (§ A queue kept one item to a note), or `vault_query` on `projects/<name>/queue` |
| Tags | `vault_list_tags`, `vault_tag_info`, `vault_records_by_tag` |
| Repo leases (who holds a repo; event transcript) | `vault_lease_list`, `vault_lease_events` (§ Agent coordination) |
| Handoffs (inbox for a role; one item; transcript) | `vault_handoff_list`, `vault_handoff_get`, `vault_handoff_events` (§ Agent coordination) |

Every tool description names the response shape it returns, including which of
the **three list shapes** it uses — audited against live responses 2026-08-03
(`b1882f7`), so trust the description rather than probing:

- the paginated envelope `{items, offset, limit, total}` (`vault_list_pieces`,
  `vault_backlinks`, `vault_list_tags`, `vault_records_by_tag`,
  `vault_list_suggestions`) — **page by `items.length`, never by the `limit`
  you asked for**; the server caps `limit` at 100 and echoes what it used;
- flat `{count, items}` for the queue slices — unpaginated, so a short result
  means raise the limit, not fetch a second page;
- genuinely unpaginated reads (`vault_list_folder`, `vault_neighborhood`,
  `vault_similar`) — everything comes back at once.

Conditional keys exist and are documented per tool: `requested` on a
`vault_tag_info` alias lookup, `alias_for` + `requested` on
`vault_records_by_tag`, the `project` echo and per-ref `target`/`matches` on
the queue dependency views. They are absent unless you hit that case, so their
absence is not evidence of anything.

`vault_resume_bundle` takes `{project, logs, project_bodies}` as of adapter
0.1.0 — `project_bodies: ["feedback", "learnings", "decisions"]` delivers
those files with full bodies for the `/vault learn` dedup pass. Files named
there bypass the bundle's size budget; the `feedback` body is otherwise
included by default **only while the whole bundle fits 32 KiB** (server ≥
2026-08-04) — above it feedback arrives as `summary` + `body_bytes` +
`headings` with `body_omitted: {reason: "bundle_budget", budget_bytes}`; on
an older server it always ships. On a pre-0.1.0 adapter the parameter is
missing; fall back to
`vault-curl "/system/resume-bundle?project=<name>&logs=0&project_bodies=feedback,learnings,decisions" -X POST -s`.

Requires two environment variables (set in `~/.env`, which is sourced by
`.bashrc`) — used by `vault-curl`, `vault-put`, the skill scripts, the session
hooks, and the MCP server alike:

- `PROGRAM_CLERK_URL` — base URL of the vault REST API (vault-storage; for example, `http://host:8123`)
- `PROGRAM_CLERK_KEY` — bearer token for authentication

Each falls back to its old name, `VAULT_API_URL` and `VAULT_API_TOKEN` (vault-storage
D141, D206; the skill scripts read both through `vault-settings.mjs`). From adapter
0.17.0 every client reads the new pair first, so a host that sets it reaches one
server through all of them. `vault-curl`'s only home is the dotfiles, where chezmoi
installs it as `~/.local/bin/vault-curl`; it reads the new names from 2026-10-14 on.
Never copy another version over it, since chezmoi then refuses to overwrite the
changed file and the daily update fails (2026-10-14).
