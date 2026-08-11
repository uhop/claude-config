---
name: vault
description: "Read and write to the knowledge base vault. Use when the user says /vault, asks to remember/save knowledge, wants to recall/query stored knowledge, asks to extract learnings from a project, or wants to log a session. Also use proactively at session end to capture non-obvious learnings."
user_invocable: true
---

# Knowledge Base

Persistent knowledge base (vault-storage), reachable two ways: **MCP tools**
(`mcp__vault__*`, registered in `settings.json`) and the **REST API** via the
`vault-curl` wrapper. The LLM writes and maintains all content.

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
| One frontmatter array member (`related:`, `tags:`, `agent.tags_suggested`) | **`vault_patch_fm`** | `PATCH /sections/{record_id}/fm` via `vault-curl` |
| Whole-document create or rewrite | **`vault_write_file`** (`expected_etag` when the read might be stale) | `vault-put --fm/--body` |
| Replace a note, archiving the old one | **`vault_supersede`** | `POST /vault/supersede` via `vault-curl` |
| Rename preserving `record_id` | **`vault_move`** | `POST /vault/move` |
| Search-before-write | **`vault_propose`** | `POST /vault/propose` |
| Raw inbox, cleanup-lint, embed-pending, incremental-reindex, run-all | **`vault_raw_inbox` / `vault_cleanup_lint` / `vault_embed_pending` / `vault_incremental_reindex` / `vault_run_scans`** | `vault-curl /maintenance/…` |
| Repo leases — list/events, claim/renew/release/transfer | **`vault_lease_*`** (adapter ≥ 0.4.0; § Agent coordination below) | `vault-curl /leases[/events]` + `POST /leases/claim\|renew\|release\|transfer` |
| `/commit`, snapshots, `cleanup-tag-aliases`, `release-embedder`, `folder-listing`, individual `find-*` scans | **`vault-curl`** | — deliberately not exposed on MCP |

**Scripts cannot call MCP tools.** MCP is an agent-level surface, so
`enrich-batch.mjs`, `related-batch.mjs`, `vault-triage.mjs`,
`compact-batch.mjs`, `vault-sweep.mjs`, and `vault-put.mjs` stay on
`vault-curl` permanently. Parity changes what *you* call directly; it changes
nothing inside the batch harnesses.

**Prefer the narrow write over the whole-document one.** `vault_write_file`
and `vault_update_piece` replace an entire document, so a mistake costs the
whole document; `vault_append`, `vault_replace`, and `vault_patch_fm` are
atomic server-side ops whose blast radius is the thing being changed. Reach
for a whole-document write only when authoring a new note or genuinely
rewriting one.

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

**Never rewrite a whole document to change one frontmatter key.** That is the
single most common reason an agent reaches for a full-document write, and it is
the highest-risk way to do the lowest-risk edit. Use the atomic FM patch —
`vault_patch_fm({record_id, ops: [{op: "add", path: "/related", value:
"[[projects/x/queue-archive]]"}]})`, or on a pre-0.1.0 adapter:

```bash
vault-curl /sections/<record_id>/fm -X PATCH -H 'Content-Type: application/json' \
  --data-binary '{"ops": [{"op": "add", "path": "/related", "value": "[[projects/x/queue-archive]]"}]}'
```

One op per array member; `add` is idempotent on an existing member. The response
echoes the resulting array, so the effect is visible without a re-read. Get the
`record_id` from `vault_list_pieces({file_prefix: "<path>"})`. This is what
`/vault-propose-related` applies its accepted candidates with — see
`related-batch.mjs` (a script, so it stays on curl). Note the id is a *record*
id, not a path.

**Conditional writes from an MCP read** work as of adapter 0.1.0:
`vault_read_file({path, include_etag: true})` returns `{path, etag, composed,
content}`, and that `etag` goes straight back as `expected_etag` on
`vault_write_file` / `vault_update_piece` — the write lands only if nobody
else wrote in between, otherwise 412 `precondition_failed` with
`details.current_etag` to re-read and retry against. `composed: true` marks an
atomized-folder view with no single file behind it; edit its pieces instead.
On a pre-0.1.0 adapter the read carries no tag at all, so there is nothing to
seed a conditional write with — use `vault-put --replace`/`--append` there,
which performs its own atomic server-side op and never trusts your earlier
read. Either way, prefer `vault_append`/`vault_replace` over a
read-then-rewrite: they need no ETag because the server holds the document.

### Reads: the MCP tools

Registered as `mcp__vault__<name>`; fetch schemas with
`ToolSearch("select:mcp__vault__vault_read_file,…")` before the first call
(deferred tools are name-only until then).

| Need | Tool |
| --- | --- |
| Session-start bundle (reindex + lint + suggestions + workflow + logs + project) | `vault_resume_bundle` |
| Read a document (composes atomized folders from `<stem>.md`) | `vault_read_file` |
| Frontmatter only, no body | `vault_read_meta` |
| List a folder | `vault_list_folder` |
| Search | `vault_search` (`mode=lexical` default, `semantic` opt-in) |
| Integrity lint | `vault_lint` |
| Indexer/DB state | `vault_status` |
| Pending suggestions by kind | `vault_suggestions_summary` |
| Record listing with filters | `vault_list_pieces` |
| Graph | `vault_backlinks`, `vault_neighborhood`, `vault_similar` |
| Queue slices | `vault_queue_by_project`, `vault_queue_top`, `vault_queue_by_priority`, `vault_queue_by_section`, `vault_queue_project_archive` |
| Tags | `vault_list_tags`, `vault_tag_info`, `vault_records_by_tag` |
| Repo leases (who holds a repo; event transcript) | `vault_lease_list`, `vault_lease_events` (§ Agent coordination) |

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
`.bashrc`) — used by `vault-curl`, `vault-put`, and the MCP server alike:

- `VAULT_API_URL` — base URL of the vault REST API (vault-storage; e.g., `http://host:8123`)
- `VAULT_API_TOKEN` — bearer token for authentication

### Agent coordination — repo leases

The server carries a repo-lease registry answering "which agent may edit this
repo's working tree directly" (design:
[[projects/vault-storage/design/agent-coordination]] § Ownership protocol;
rulings D21/D23). Tools: `vault_lease_list` / `vault_lease_events` (reads),
`vault_lease_claim` / `vault_lease_renew` / `vault_lease_release` /
`vault_lease_transfer` (adapter ≥ 0.4.0; on an older adapter,
`vault-curl /leases` and `POST /leases/claim|renew|release|transfer`).

**Single-agent sessions: this whole section is a no-op.** Claim nothing;
check nothing for work in the session's own cwd repo; an empty registry is
the normal state and everything behaves exactly as it did before the
registry existed. The protocol engages only around cross-repo work and
multi-agent fleets:

- **Before editing a repo outside the session's cwd** (the CLAUDE.md
  § Cross-repo work path), read the lease first:
  `vault_lease_list({resource: "repo:<normalized-remote-url>"})` — e.g.
  `repo:github.com/uhop/deep6`; a repo with no remote keys as
  `repo:<host>:<path>`. Empty `items` = not held → proceed exactly as
  before (disposable worktree, branch/patch handover to the user). Held by
  someone else → don't race it: name the holder to the user and route the
  work through them (the handoff queue automates this leg once it ships).
  Registry unreachable → proceed as before too: the worktree discipline is
  already collision-safe, so the check fails open, never blocks work.
- **Claim only with a reason** — the user directed coordination, another
  agent is known to be active on the fleet, or a long direct-edit arc
  should be reserved. A session whose cwd *is* the repo claims with
  `priority: "cwd"` (preempts an agent-held side lease; nothing preempts a
  human holder). A side claim requires **no current holder** and **a clean
  target checkout** — modified, staged, or untracked-unignored files are
  dirt (ignored files never count; stash entries: mention to the user,
  don't block); pass `attestation: "clean at <short-sha>"`. Dirty tree →
  do not claim: tell the user and use a worktree. The check is client-side
  by design — the server cannot see any host's working tree.
- **Holder id**: `<hostname>/<session-prefix>`, e.g. `nuke/59bd32b6` —
  unique per session, readable in `/ui/agents.html`. The operator holds as
  `kind: "human"` (no TTL, never preempted) and claims via the UI;
  `vault_lease_transfer` with `to_kind: "human"` is the "please review and
  commit" handover.
- **While holding**: re-claim at the start of each work burst (idempotent
  re-claim = renew, safe retry); after a long gap or any vault error,
  verify the lease still names you before the next mutating burst — losing
  a lease is demotion, not damage (D23): downgrade to worktree + handover.
  **Release at session end**; don't leave TTL expiry to say what an
  explicit release states. Leases are cleared on server restart by design —
  re-claim on the next burst if still needed.

### `vault-put` — the shell-side document writer

Still the right tool from a **script**, from a pre-0.1.0 adapter, or when a
multi-pair all-or-nothing replace is wanted (the MCP `vault_replace` is one op
per call; `vault-put` batches pairs into a single round-trip). From the agent
on a parity adapter, prefer `vault_append` / `vault_replace` / `vault_write_file`
— same server ops, no scratch files.

`~/.claude/skills/vault/vault-put.mjs` replaces the hand-rolled jq/python
payload-assembly blocks (which failed 4× in one session — reflect 2026-07-10;
report [[projects/agent-workflow/reports/2026-07-10-nuke]]). Three modes, all
printing the HTTP status + new ETag:

```bash
vault-put.mjs PATH --fm FM.json --body BODY.md    # full JSON write (create/replace); FM authored as JSON, body verbatim
vault-put.mjs PATH --append FRAGMENT.md           # GET → append to body, FM verbatim → round-trip PUT with automatic If-Match
vault-put.mjs PATH --replace OLD NEW [--all]      # GET → asserted body edits → round-trip PUT with automatic If-Match
                                                  # (--replace-file OLD.txt NEW.txt for multiline pairs)
```

Rules baked in, keep honoring them when a raw `vault-curl` write is still
needed:

- **Assert every string replacement.** `--replace` fails (exit 3, nothing
  written) when the target is missing or ambiguous — the curly-vs-straight
  apostrophe class of bug makes an unasserted `replace` a silent no-op.
- **`--replace-file` pairs match byte-for-byte — mind the trailing newline.**
  A heredoc-written OLD file ends with `\n`, so a target that sits mid-line
  (text continues after it on the same line) fails the assert. `truncate -s -1`
  both files (or write them with `printf '%s'`) when the target does not end
  at a line boundary. (Hit 2026-07-31: two mid-line queue edits failed clean
  on the first try.)
- **A `null`/empty document is never a write.** vault-put refuses (exit 1,
  nothing written) a body that is empty or the literal string `null`, and
  any null top-level frontmatter value — the 2026-06-18 wipe wrote a
  serialized JS `null` over the 59 KB stream-chain decisions note
  (restored 2026-07-18 from vault-data git history). Removing a document
  is `DELETE` (`vault-curl /vault/{path} -X DELETE`); hand-rolled JSON
  payloads follow the same rule — never `body: null`.
- **Never let scratch cleanup follow fallible steps unguarded** — chain
  `rm -rf "$WORK"` with `&&` (CLAUDE.md § Scratch files).
- Round-trip modes go through the server's atomic `POST /vault/edit` when it
  exists (server ≥ 2026-07-24): the read-modify-write happens server-side in
  one request — no GET, no scratch files, no If-Match dance, identical assert
  semantics. On a pre-edit server (405) they transparently fall back to the
  classic GET → edit → `If-Match` PUT, where a concurrent write surfaces as a
  clean 412 (exit 2), never a silent clobber. FM changes still require the
  JSON mode; `--append`/`--replace` keep the server-emitted YAML verbatim
  (the safe round-trip per the 2026-06-11 decision), and the
  indexer/enrichment pipeline handles `updated`/staleness downstream.
- **Composed folder views can't be round-trip-edited.** A GET of `X.md`
  where only the atomized folder `X/` exists returns a *composed* document
  (weak ETag `W/"…"` + `X-Vault-Composed: true`); vault-put refuses it up
  front, and the server 412s conditional / 409s (`shadow_conflict`)
  unconditional PUTs against it — a flat file there would shadow the
  folder (the 2026-07-14 blog incident). Edit the folder's *pieces*
  (`GET /vault/X/` lists them) instead; `?shadow=allow` exists for a
  deliberate de-atomization only.

Reach for raw `vault-curl` (below) for endpoints other than `/vault/{path}`
document writes — `supersede`, `move`, `propose`, `/maintenance/*` — and
anything `vault-put` doesn't cover. Reads go through the MCP tools above, not
through `vault-curl`; the exceptions are the parameter gaps listed there,
reads whose `ETag` you need, and **reads whose destination is a file rather
than your context** (below).

**Read to a file when the bytes are an input to a later step, not something
you need to know.** `vault-curl /vault/<path> -s > "$WORK/doc.md"` is the
right call when a large document is being *processed* rather than *read* —
`sed`-ing an exact line range out of it, diffing it, or feeding a verbatim
block to `vault-put --replace-file`. Two things make this a real exception
rather than a preference:

- **`vault_read_file` returns into context, and context is the scarce
  resource.** Pulling a 100 KB `queue.md` to extract three lines spends the
  whole 100 KB. Big results do not even arrive inline: past some size the
  harness persists the tool result to disk and hands you a path, so the read
  costs a round-trip and lands in a file regardless — which is where the curl
  put it directly. The exact cutoff is unmeasured; the observed points
  (2026-08-04) are `vault_read_file` on `schedule.md` at 52 KB,
  `vault_resume_bundle` at 79 KB and `vault_queue_by_project` at 145 KB, all
  three overflowed and had to be `jq`-ed off disk.
- **Verbatim relocation must be mechanical.** Moving a shipped queue item
  into `queue-archive.md` means reproducing multi-KB paragraphs exactly.
  `vault_replace` takes `from`/`to` as strings, so that is you retyping them;
  `--replace-file` matches byte-for-byte against what `sed` cut. Retyping is
  the risk, not the round-trip.

The boundary: **short strings you can type without risk go through
`vault_replace` / `vault_patch_fm`** — the atomic server-side ops with the
small blast radius. Drop to file-based reads and `vault-put --replace-file`
only when the block is too large to reproduce by hand or the document is too
large to pull into context. Reads you actually intend to *read* — a note you
are about to reason about, a folder listing, a search — stay on MCP always.
(Ruled 2026-08-04, blog session: the practice had been going off-book
silently, which is worse than either rule.)

### Use `vault-curl` — don't hand-roll `curl`

There is a `vault-curl` wrapper on `$PATH` (installed under `~/.local/bin/vault-curl`). **Prefer it over raw `curl`** — it prepends `$VAULT_API_URL` and the `Authorization: Bearer $VAULT_API_TOKEN` header, checks the env vars, and forwards every remaining flag straight to `curl`.

Quick check before the first vault op in a session:

```bash
command -v vault-curl >/dev/null || { echo "vault-curl missing — falling back to curl"; }
```

`vault-curl` itself exits with a clear error if `VAULT_API_URL` or `VAULT_API_TOKEN` is unset, so no separate guard is required. Only fall back to raw `curl` if `vault-curl` isn't installed on the machine.

**Never grep dotfiles for the credentials.** `vault-curl` resolves `VAULT_API_URL` / `VAULT_API_TOKEN` from the already-sourced env (`~/.env` via `.bashrc`). If a call fails for missing creds, report it — do **not** scan `~/.bashrc` / `~/.env` / other dotfiles to find them. The auto-mode classifier flags systematic dotfile credential-scanning as Credential Exploration and denies it (correctly).

API endpoints (invoked via `vault-curl <path> [curl-options...]`):

- **Read**: `vault-curl /vault/{path} -s` — *prefer `vault_read_file`*; use
  this when you need the response headers (`ETag` for a hand-rolled
  conditional write, `X-Vault-Composed` to detect a composed folder view),
  or when the bytes are headed for a file rather than your context —
  `-s > "$WORK/doc.md"` to `sed` a range out of a large document or to feed
  `vault-put --replace-file`. See the read-to-a-file exception above for the
  boundary; a note you intend to actually read stays on `vault_read_file`.
- **Write (JSON — THE write path)**: `vault-curl /vault/{path} -X PUT -H 'Content-Type: application/json' --data-binary @payload.json`
  - Body shape: `{"frontmatter": {...}, "body": "..."}` — the server takes the FM object directly, skips YAML parse, and serializes safely (auto-quoting colon-space, leading-special-char, hex/bool/date-shadow strings). Always use this when authoring or modifying frontmatter values.
  - Construct the payload with `jq` and `--rawfile` to safely embed a body that contains arbitrary characters — write scratch under a `WORK=$(mktemp -d)` dir, not a hardcoded `/tmp` name (CLAUDE.md § "Scratch files"): `jq --null-input --rawfile body "$WORK/body.md" '{frontmatter: {title: "X", ...}, body: $body}' > "$WORK/payload.json"`.
  - **Prose FM values (`title`, `agent.summary`) go via `--arg`, never as inline jq literals.** An apostrophe in an inline literal closes the single-quoted jq program (yields a bash `syntax error near unexpected token`). `--rawfile` already covers the body; `--arg name "$VALUE"` (apostrophe-safe inside double quotes, referenced as `$name` in the filter) covers FM strings the same way. Hit 2026-06-15 on a session-log `agent.summary` containing "JS's".
  - Same downstream FM merge / closed-enum validation / auto-managed-key rejection / `created`-`updated` indexer-override as the markdown mode.
  - **The FM merge is union-only — omitting a key keeps the stored value; to *remove* a top-level key, send the reserved value `"__unset__"`** (server ≥ 2026-07-23; idempotent on absent keys). Below top level it 400s (`nested_unset_sentinel`) — nested objects/arrays are replaced wholesale, so omit the key from the nested object instead. On an older server the sentinel is stored as a literal string — don't send it there.
- **Write (markdown — round-trip only)**: `vault-curl /vault/{path} -X PUT -H 'Content-Type: text/markdown' --data-binary @file.md`
  - **Never hand-author YAML through this mode** — that's the recurring quoting-trap failure class (colon-space, leading `@`/`*`/`-`/`?`, hex/bool/date shadows), and per the 2026-06-11 decision it is reserved for the UI editor and for verbatim round-trips: GET a server-emitted file, text-edit the *body only*, PUT it back. The YAML you re-send was machine-serialized, so it's safe. Any FM change → use the JSON path above.
  - Add `-o /dev/null -w "%{http_code}\n"` to confirm a 204 without flooding stdout (works for either Content-Type).
- **Conditional writes (`If-Match`, use for read-modify-write on shared docs)**: `GET /vault/{path}` returns an `ETag` header (sha256 of the served bytes); send it back as `-H 'If-Match: <etag>'` on the PUT (either Content-Type) and the write lands only if the document hasn't changed in between — otherwise **412** `precondition_failed` with `details.current_etag`, meaning another writer got there first: re-GET, re-apply your edit to the fresh copy, retry with the new tag. Adopt this for any flow that GETs a shared doc (queue.md, learnings.md, archives), modifies it, and PUTs it back — it converts silent last-writer-wins clobbering into a visible, retryable conflict. Capture the ETag with `-D-` or `-o /dev/null -D- | grep -i etag`; successful PUTs (204) return the new `ETag` so chained conditional edits don't need a re-GET. `If-Match` never creates files (412 on a missing path); plain unconditional PUT remains valid for docs only one session touches.
- **Edit (atomic server-side body op)**: `vault-curl /vault/edit -X POST -H 'Content-Type: application/json' --data-binary @op.json` with `{path, op: "append", text}` or `{path, op: "replace", from, to, all?}` — one op per call, server ≥ 2026-07-24. Replace is asserted (absent `from` → 409, ambiguous without `all` → 409 with the count — never a silent no-op); append joins after a single trailing newline; FM rides verbatim (`updated` re-stamped). Prefer `vault-put --append/--replace`, which calls this automatically with a round-trip fallback; reach for the raw endpoint only from contexts without vault-put.
- **FM patch (atomic single-key frontmatter op)**: `vault-curl /sections/{record_id}/fm -X PATCH -H 'Content-Type: application/json' --data-binary @ops.json` with `{ops: [{op: "add"|"remove", path: "/related"|"/tags", value: "..."}]}` — server-side membership edit on an FM array, no body round-trip and therefore no way to clobber the document. Returns `{changed, results: [{op, path, changed, array}]}` with the resulting array, so no re-read is needed to confirm. Prefer this over any full-document write whose only purpose is one FM key. `record_id` comes from `vault_list_pieces({file_prefix})`. Used by `/vault-propose-related` (`related-batch.mjs`) to apply accepted candidates.
- **Supersede (replace a note, archiving the old)**: `vault-curl /vault/supersede -X POST -H 'Content-Type: application/json' --data-binary @payload.json` with `{old_path, new_path?, frontmatter, body}` — the successor in the standard JSON write shape; `new_path` defaults to `old_path` (supersede-in-place: the successor takes over the path, so inbound wikilinks resolve to the replacement). Use this — never DELETE+PUT or a wholesale overwrite — whenever a write *replaces* a note rather than evolving it: the old note moves to `<dir>/archive/<YYYY>/<name>` with its record id intact (edges/embeddings/suggestions survive) and gets `status: superseded`; the successor's body is auto-appended a `> Supersedes [[<archived-path>]].` footer that backs the typed `supersedes` edge (don't add your own). Validation-first — a rejected request (bad FM, occupied `new_path`/archive slot) mutates nothing. Routine edits to an existing note stay plain PUTs; supersession is for replacement semantics.
- **List**: `vault-curl /vault/{path}/ -s` (trailing slash → `{"files": [...]}`) — *prefer `vault_list_folder`*.
- **Delete**: `vault-curl /vault/{path} -X DELETE` — for junk with zero history value; a note retired *in favor of other content* should be superseded (or moved to an archive folder), not deleted. (`vault_delete_file` exists on MCP; the same judgment applies — supersede beats delete.)
- **Search**: `vault-curl /search/simple/ -X POST -G --data-urlencode 'query=...'` — *prefer `vault_search`*.
  - The vault REST API expects `query` as a URL parameter on a POST; `-G --data-urlencode` produces the right form.

### Pagination — page by `items.length`, never by your requested `limit`

**Applies to the MCP list tools too** — `vault_list_pieces`, `vault_backlinks`,
`vault_list_suggestions` and friends take `limit`/`offset` and cap `limit` at
100 exactly as the REST endpoints do. Moving a read to MCP does not retire this
rule; it only removes the `jq` step in front of it.

Paginated reads (`/sections`, `/suggestions`) return an envelope
`{items, offset, limit, total}` that echoes the **effective** `offset`/`limit` —
the server caps `limit` (currently ≤ 100) and reports the value it actually
used, alongside `total`. So **advance by what you got, not what you asked
for**: step `offset += items.length` each page and stop when
`items.length === 0` (or `offset >= total`). Requesting `limit=200` returns
only 100; stepping `offset` by 200 then silently skips records 100–199 of every
page (the failure that under-counted a coverage scan 800/1513 and a suggestion
fetch 235/435). Never guess the page size — read the envelope, or just use the
returned array length. (Folder lists `/vault/{path}/` → `{files}` are **not**
paginated; they return everything in one shot.) Envelope-design rationale —
echo effective offset/limit, optional `total`, else a `last` flag or cursor:
`~/Open/articles/design/web-apps-client-server-api-design.md` § "Lists and
paging".

### Guard `jq` pipes in parallel Bash batches

Mostly retired for reads by the MCP surface — an MCP tool call is not a shell
command, so it has no exit code to cancel a sibling with, and a surprising
response shape is visible in the result instead of vanishing into an empty
`jq` output. The rule still binds wherever a `vault-curl … | jq …` pipe
survives: `/vault ingest`, `/vault sweep`, the `/maintenance/*` calls, and any
gap-driven curl read.

When you fire several calls as parallel Bash tool calls in one message, never
let a `vault-curl … | jq …` pipe exit non-zero. If the API returns an unexpected
shape, `jq` exits non-zero → the Bash call exits non-zero → the harness
**cancels its in-flight parallel siblings** (the classic casualty is
`check-drift.sh` sharing a batch with these reads). Append `|| true` to any
such pipe (or guard it as `if vault-curl …; then jq …; fi`) so a malformed
response degrades to empty output instead of taking down the whole batch.
Bare `vault-curl … -s` reads with no `jq` stage are already safe and need no
guard.

**`check-drift.sh` is also a *canceller*, not just a casualty.** It exits `1`
whenever it detects drift — the common case, not an error. Co-batched as a
parallel Bash sibling, that exit-1 cancels the *other* calls (reindex, lint,
suggestions, agent-workflow reads). Run `check-drift.sh` in its **own** Bash
invocation, sequentially, before the parallel read batch — never inside it.
Read the drift report from stdout; the exit code is not the signal.

### Fallback: raw `curl`

If `vault-curl` is unavailable, verify env vars explicitly:

```bash
[[ -z "${VAULT_API_URL:-}" || -z "${VAULT_API_TOKEN:-}" ]] && { echo "Error: VAULT_API_URL and VAULT_API_TOKEN must be set in ~/.env"; exit 1; }
```

Then use `curl -H "Authorization: Bearer $VAULT_API_TOKEN" "$VAULT_API_URL/<path>"` with the same endpoints listed above.

## Vault structure

```
raw/               # unprocessed source material
topics/            # compiled wiki notes (1 concept = 1 note)
projects/          # per-project knowledge (subfolder per project)
  {project}/
    decisions.md   # architecture & design decisions
    learnings.md   # gotchas, patterns, what worked
    stack.md       # tech stack & dependencies
    queue.md       # outstanding work
    state.md       # baseline snapshot for vault-check-drift
queries/           # filed Q&A research outputs
logs/              # session logs
_index.md          # archived 2026-04-29 — kept for inbound wikilinks; do not update
```

Discovery is dynamic via the live API, not via a curated index file. The tool
names below are the MCP tools — real, registered, and callable as
`mcp__vault__<name>` once their schemas are fetched (see § Reads: the MCP
tools). They were aspirational until 2026-08-02, when registering the apodict
MCP server surfaced that `mcpServers` had never been a recognized
`settings.json` key and the vault MCP had been silently inert.

| Question | Tool |
| --- | --- |
| What topics exist? | `vault_list_folder("topics/")` |
| What projects? | `vault_list_folder("projects/")` |
| Recent logs / queries | `vault_list_pieces(type=log, updated_since=…)` |
| Find a note about X | `vault_search(X, mode=semantic)` |
| What links to / from X? | `vault_backlinks(X)` / `vault_neighborhood(X)` |
| Tag taxonomy | `vault_list_tags`, `vault_records_by_tag` |
| Top items across the fleet | `vault_queue_top(limit=N)` |
| One project's open queue | `vault_queue_by_project(name)` |
| One project's archive | `vault_queue_project_archive(name)` |
| Everything at priority N (Backlog) | `vault_queue_by_priority(n)` |
| Fleet-wide Active / Watching | `vault_queue_by_section(section)` |

Queue endpoints are backed by `queue_items`, a derivative the watcher keeps in
sync with each project's `queue.md` and `queue-archive.md`. Markdown stays
source of truth — see [[topics/project-queue-convention]] for the shape and
[[projects/vault-storage/design/queue-items-table]] for schema + identity
model. Call `vault_queue_reindex` after a multi-machine pull to repopulate
slices the watcher didn't witness.

## Note format

Every note MUST have YAML frontmatter:

```yaml
---
title: Note Title
tags: [topic1, topic2]
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: active
type: permanent | fleeting | project | query | log
related: ["[[other-note]]"]
---
```

Rules:
- Filenames in kebab-case: `auth-flow.md`
- Use wikilinks: `[[note-name]]` (not markdown links) for internal references
- Exception — never wikilink into `logs/` from durable notes: logs are
  transient (deleted at 90 days), so cite them as backticked plain paths
  (`` `logs/2026-05-19-…` ``) instead; the linter strips inline-code spans, so
  citations never dangle. Outbound links *from* a log are fine — they die with
  the log. (Ruled 2026-07-31.)
- 1 concept per topic note (atomicity)
- Minimum 2 wikilinks per note (dense linking)
- Every note starts with a 1-2 sentence summary paragraph

## Commands

### /vault ingest

Compile **ready** raw notes into the wiki. Drafts (no `ready: true`)
are skipped — the user is still iterating on them.

1. **Pull the ready list.** `vault_raw_inbox` (pre-0.1.0 adapter:
   `vault-curl /maintenance/raw-inbox -s | jq`) returns
   `{ready: [{path, title, updated}], drafts: [...]}`. Process only `ready`. If
   that array is empty, report "no ready notes; N drafts waiting" and
   stop. (The user flips `ready: true` in FM when a note is ripe.)
2. For each ready note, read the content with `vault_read_file`.
3. Extract concepts — create or update topic notes in `topics/`,
   project notes in `projects/<name>/`, or queue items in
   `projects/<name>/queue.md` per the content's nature. When a
   compilation *replaces* an existing topic outright (the old note is
   being retired, not extended), use `vault_supersede` instead of
   overwriting in place — the predecessor is archived with its record id
   and a typed `supersedes` edge instead of silently vanishing into a
   PUT.
4. Add wikilinks, backlinks, and tags on the derived notes.
5. **Enrich at capture.** When creating a new topic note (or materially
   rewriting an existing one), write the `agent:` block in the same PUT
   — born-enriched is cheaper than a later backfill pass through
   `/vault-enrich-all`. Field shape and quality guidance:
   `~/.claude/skills/vault-enrich-all/SKILL.md` § "Per-note `agent:`
   block shape" + § "Generate enrichment fields". Set
   `derived_from_hash: "auto"` — the server stamps the hash of the body
   it writes plus `derived_at` (2026-07-09; on an older server compute
   `sha256(body)` locally). **Use
   the JSON write path** (`Content-Type: application/json` with
   `{frontmatter: {...}, body: "..."}`); `agent.summary` regularly
   contains colon-space prose that 500s through the markdown path's
   YAML parser, and JSON sidesteps that whole class of authoring trap
   (the hash value also doesn't need explicit quoting under JSON — the
   value is a string in the JSON object, and the server's
   `yaml.stringify` emits the right YAML for it). The indexer picks
   the block up on import and folds the summary into the chunk-prefix
   at embed time.
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
     `raw/archive/<YYYY-MM-DD>-<name>.md` so the inbox surfaces only
     pending material.
   Process notes one-at-a-time end-to-end: derived note created →
   source updated → moved to archive. A failure mid-ingest leaves
   earlier notes archived and the rest still pending — safe to retry
   `/vault ingest` to resume.

### /vault learn

Extract learnings from the current project/session.

1. Identify the current project from git remote, directory name, or ask
2. Read existing project notes if they exist (`projects/{name}/`). The dedup
   pass needs **full bodies**: `vault_resume_bundle({project, logs: 0,
   project_bodies: ["feedback", "learnings", "decisions", "stack", "queue"]})`
   on adapter 0.1.0+ — name `feedback` explicitly: named files bypass the
   bundle's 32 KiB budget, and a mature feedback body is budget-gated when
   unnamed (server ≥ 2026-08-04). On a pre-0.1.0 adapter the parameter is
   missing — stay on curl for this call:
   `vault-curl "/system/resume-bundle?project=<name>&logs=0&project_bodies=feedback,learnings,decisions,stack,queue" -X POST -s`.
3. Analyze recent work: git log, changed files, decisions made
4. Create or update `projects/{name}/learnings.md`, `decisions.md`, `stack.md`
5. Extract cross-project patterns into `topics/` notes (e.g., "api-rate-limiting", "docker-networking"). Propose-then-write: before creating, check neighbours with `POST /vault/propose` (search-before-write); if an existing note already covers the concept, extend it, and if the new write would *replace* it wholesale, use `POST /vault/supersede` rather than minting a near-duplicate. When creating a new topic note here, enrich at capture per the `/vault ingest` step 5 procedure — write the `agent:` block in the same PUT.
6. **Promote this session's new durable local memories into the vault.** During the session the agent's auto-memory writes land in *per-machine* local memory (`~/.claude/projects/<hash>/memory/`), which is not fleet-shared. For each `feedback_*.md` / `project_*.md` written or materially updated this session, route it by the `projects/agent-workflow/decisions` D1 table — feedback rules → `projects/<name>/feedback.md`, project facts / deferred options → `decisions.md` / `queue.md` Backlog — **deduped and propose-then-confirm**, never a blind copy. Most candidates are already captured elsewhere: verify against `decisions.md` / `learnings.md` / global `CLAUDE.md` / existing `topics/` first (per `topics/project-feedback-md-convention`). The vault is the durable source of truth; where a local memory is promoted, leave a thin local pointer rather than a duplicate fact (double-writing the same rule to both stores reintroduces drift). This makes the local→vault migration continuous so per-machine memories stop accumulating. This is the **write path** that pairs with `/vault resume`'s read of `feedback.md`.

### /vault query {question}

Research a question against the vault.

1. Use `vault_search` to find candidate notes — `mode=semantic` for conceptual queries, `mode=lexical` (the default) for verbatim phrases.
2. Read the most relevant notes with `vault_read_file` (or `vault_read_meta` when frontmatter answers it); use `vault_neighborhood` / `vault_backlinks` / `vault_similar` to expand context if a single note isn't enough.
3. Synthesize an answer.
4. Optionally file the answer into `queries/YYYY-MM-DD-{slug}.md` if substantive — wikilinks back to the source notes used.

### /vault lint

The **hygiene** lint, implemented as its own skill — `/vault-lint`
(`~/.claude/skills/vault-lint/vault-lint.mjs`). It reads every indexed record
via `/sections` and reports six categories — `FRONTMATTER` (required keys, date
sanity), `BODY` (empty/`null` bodies; newline-collapsed bodies), `WIKILINKS`
(broken body targets), `DENSITY` (topic notes < 2 outbound; isolated project
notes), `CURRENCY` (per-type retention), `DUPLICATES`
(near-identical folders / titles) — against the thresholds in
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

### /vault log {description}

Save a session log.

1. Create `logs/YYYY-MM-DD-{description}.md`
2. Record: what was done, decisions made, pending items, key files touched
3. Add wikilinks to relevant topic/project notes (outbound-only rule: links
   *from* a log die with it; durable notes referencing this log must cite its
   backticked path, never `[[logs/...]]`)
4. **Enrich at capture.** Write the `agent:` block in the **same** PUT that
   creates the log — born-enriched, so the log is searchable-sharp while it's
   hot (the `agent.summary` becomes a HyDE prefix at embed time), with no later
   backfill. Logs are append-only, so the block never re-stales. Use the JSON
   write path (`{frontmatter: {agent: {...}}, body: "..."}`); set
   `complexity: log-entry`; set `derived_from_hash: "auto"` — the server
   replaces the sentinel with the hash of the body it writes and stamps
   `derived_at` too (2026-07-09; on an older server compute `sha256(body)`
   locally).
   Field shape + quality guidance:
   `~/.claude/skills/vault-enrich-all/SKILL.md`. **Don't backfill *old* logs** —
   enrichment value is largest at capture: a log is already self-describing
   (dated title + sections), so a retroactive summary adds little, and logs are
   deleted at 90d. Born-enrich the new one; leave the old ones.
5. **Refresh the drift baseline.** Run
   `~/.claude/skills/vault-check-drift/check-drift.sh --update` from the project
   directory so the next `/vault resume` starts from a clean baseline (the
   session's commits / tags / `npm publish` are typically done by the time
   you're logging). Bootstraps `state.md` if the project has no baseline yet.
   Skip only when there's no project working directory in scope (rare —
   logging cross-project work, vault-only sessions).

### /vault resume

Rebuild context from the vault. Note: a SessionStart hook
(`hooks/vault-resume-brief.sh`, 2026-07-23) already injects a few `[vault]`
digest lines at session start via `GET /system/resume-brief` — lint state,
pending-suggestion count, the project's Active titles + ready/blocked counts,
a feedback.md pointer, and the latest log title. The digest is a *trigger*,
never a substitute: it carries no bodies, so feedback rules, logs, and the
drift check still come from this workflow. On a pre-brief server (404) the
hook injects nothing, silently.

This workflow is **MCP-native** — steps 2 and 4 are tool calls, not shell. The
only Bash is `check-drift.sh`, which runs alone anyway (step 1), so the
parallel-batch `jq`-guard hazard does not arise here at all.

1. **Drift check first.** Run `~/.claude/skills/vault-check-drift/check-drift.sh`
   from the current project directory (see the `vault-check-drift` skill for
   details) as its **own** Bash call. It exits `1` whenever it detects drift
   (the common case), which would cancel any co-batched sibling; read the
   report from stdout. If drift is detected, surface it at the top of the
   resume output before reading logs — the vault's view of the project may be
   stale, and the recorded logs reflect that stale view.
2. **One-shot bundle** — call `vault_resume_bundle({project: "<name>", logs: 3})`
   with `<name>` = the current project (from git remote or directory
   name). The server runs the incremental reindex first, then packages
   what used to be five separate reads. Do **not** hand-roll this as
   `vault-curl … | jq` into a scratch file — the MCP call returns the whole
   structure directly. Surface each block per the old rules:
   - `reindex` — quiet on a no-op (`changedFiles: 0`); report counts when
     something got reindexed; mention `fellBack: true` (the full-reindex
     path — history loss or first run).
   - `lint` — pre-filtered to non-zero checks. If `ok=false`, surface the
     categories with counts and first samples at the top of the resume
     output. These are bug indicators — report, don't auto-fix.
   - `suggestions` — `{total, by_kind}` of pendings. If `total > 0`, one
     summary line; the dedicated review skills handle decisions.
   - `workflow` — `active` is the agent-workflow Active section: surface
     verbatim under a `Workflow:` heading when non-null. If
     `clarify_pending > 0`, one line like
     `Clarify queue: N pending (/clarify to drain)`. Nulls mean the
     surface isn't scaffolded — omit silently.
   - `logs` — the most recent session logs as their `agent.summary`
     lines. Skim the summaries; fetch a full body (`vault_read_file`)
     only when a summary is missing or the session directly continues
     that log's work.
   - `project` — `feedback.md` normally arrives with its full body:
     surface its rules near the top of the resume output (this is the
     read path for fleet-shared project feedback — the vault is
     pull-only, not auto-loaded like local memory; see
     `topics/project-feedback-md-convention`). When it instead carries
     `body_omitted: {reason: "bundle_budget"}` (server ≥ 2026-08-04: the
     body would push the bundle past 32 KiB), the `headings` index shows
     what rules exist — fetch the body with `vault_read_file` (or
     read-to-a-file when `body_bytes` says it is huge) and still surface
     the rules; don't skip them because the bundle didn't inline them.
     The other files (queue/decisions/learnings/stack) come as
     `summary` + `body_bytes`; fetch bodies with `vault_read_file` only
     as needed. A `null` entry means the file doesn't exist — not every
     project has a `feedback.md`.
3. **Fallback (pre-bundle server).** A 404 / missing-tool error from the
   bundle means an older server — run the individual reads instead:
   `vault_lint`, `vault_suggestions_summary`, the two agent-workflow file
   reads (`projects/agent-workflow/queue.md` § Active, `clarify-queue.md`
   pending count), the 3 most recent `logs/` entries, and the project's
   notes including `feedback.md` — all via `vault_read_file` /
   `vault_list_pieces`. The incremental reindex is `vault_incremental_reindex`
   on adapter 0.1.0+; on an older one it stays
   `vault-curl /maintenance/incremental-reindex -X POST -s` — guard its `jq`
   pipe with `|| true` if you batch it with anything.
4. Summarize current state and what's left to do. If `check-drift` flagged
   new commits / tags / publishes that aren't reflected in `projects/<name>`
   notes, update those notes to match (or at minimum flag the divergence in
   the summary).
5. After syncing, run `check-drift --update` so the baseline captures the
   refreshed view and the next resume starts from a clean slate.

### /vault wrap [optional log slug]

Close the session cleanly — symmetric counterpart to `/vault resume`. Bundles
learning extraction, session log, and drift baseline refresh into one step so
nothing the session produced gets lost.

1. Run the `/vault learn` workflow above — extract learnings into
   `projects/{name}/{learnings,decisions,stack}.md` and surface cross-project
   patterns into `topics/` notes.
2. Run the `/vault log` workflow above with the supplied slug (or derive one
   from the session's primary subject if the user didn't supply it). Step 4 of
   `/vault log` refreshes the drift baseline as its closing action — no
   separate `check-drift --update` invocation needed here.
3. Report a short summary of what was saved: project notes touched, log file
   path, baseline refreshed.

Use this when ending a session that produced shipped work, decisions, or
cross-project learnings worth preserving. Skip when a session ends with
nothing worth preserving — don't write stub logs to be ceremonial.

**Cadence (ruled 2026-08-04):** wrap closes an *arc*, not a calendar day —
a long session with several shipped arcs may wrap more than once, each
continuation getting its own small log rather than an append (appending
re-stales the earlier log's summary). The mechanical bookkeeping (queue →
archive, decisions, stack) happens at ship time, not at wrap — wrap's
unreconstructable payload is the narrative: the log and the distilled
learnings, which only the hot session can write. When pairing with a sweep,
**wrap first**: wrap's writes are the sweep's intake (stale enrichment, new
FM tags, new wikilink edges). The sweep leg is optional per session — queues
accumulate safely (claims, hysteresis), sub-agents judge from the notes not
from session context, so sweep on queue pressure, not on schedule.

### /vault check [--update]

Run the drift check standalone. Typically used mid-session to re-sync
after a user-driven commit, push, or publish.

```bash
~/.claude/skills/vault-check-drift/check-drift.sh            # report only
~/.claude/skills/vault-check-drift/check-drift.sh --update   # report + refresh baseline
```

The skill file at `~/.claude/skills/vault-check-drift/SKILL.md` documents
the signal sources, baseline file format, and report shape.

In multi-writer setups (the host pulls vault-data from a remote that
another machine pushed to), follow the project drift check with an
incremental reindex so the local DB catches up to the new HEAD:

```bash
vault-curl /maintenance/incremental-reindex -X POST -s | jq
```

Skip when working solo or when no `git pull` has happened recently —
the watcher already kept the DB in sync with local edits. A no-op call
is fast (a few ms) but unnecessary. The endpoint reports
`{fromCommit, toCommit, changedFiles, imported, deleted, renamed,
fellBack, durationMs}`; surface anything non-zero, otherwise stay
quiet.

### /vault sweep [options]

Drain every safely-automatable maintenance queue. The deterministic
control flow — baselines, stage DAG, per-kind pass loops, stuck floors,
convergence rounds — lives in `vault-sweep.mjs` (§ Procedure); the agent
dispatches the sub-agents each plan names and loops `next` until done.

```
/vault sweep                         # full default set (incl. duplicate review + compaction)
/vault sweep --dry-run               # report what would run; no writes
/vault sweep --include=edge_type,new_tag
/vault sweep --exclude=duplicate,compaction_candidate   # cautious run: FM-only triage
/vault sweep --max-passes=N          # loop cap per kind within a round (default 5)
/vault sweep --max-rounds=N          # cap on whole-pass convergence rounds (default 5)
```

`--include-destructive` is retired (2026-07-13): its two kinds are in the
default set now — every recorded sweep had passed the flag anyway, 91% of
duplicate triage is safe rejections, and neither pass can lose data
(merges supersede-archive with record id intact; compaction archives
originals; vault-data is git-backed). Accept and ignore the flag if the
user still types it; the pre-commitment gate is replaced by itemized
post-hoc reporting (§ Procedure step 6) and the `--exclude` opt-out.

#### Default set

Listed in dependency order (see § Ordering constraints — kinds in the
same stage run as parallel sub-agents):

| Source | Action |
| --- | --- |
| `lint.orphan_embeddings` + `lint.orphan_doc_embeddings` | `POST /maintenance/cleanup-lint` |
| `lint.records_without_embeddings` + `lint.embedding_hash_drift` | `POST /maintenance/embed-pending` |
| **coverage**: enrichable knowledge notes with **no `agent:` block** — canonical source is `vault-storage`'s `GET /system/lint` → `coverage.enrichment` (`ENRICHABLE_TYPES` = `permanent`/`project`/`design`/`research`/`query`; the headline already excludes operational types, empty bodies, and archived). Read the count there; `/vault-enrich-all` § Enrichable set drives the enumeration. *Not* a suggestion kind, so invisible to `/suggestions/summary`. | `/vault-enrich-all --auto --limit=100` (backfill missing) |
| `suggestions.agent_enrichment_stale` | `/vault-enrich-all --auto --stale --limit=100` (refresh drifted) |
| `suggestions.new_tag` | `/vault-review-tags --auto --limit=100` |
| `suggestions.tag_suggestion` | `/vault-review-tags --auto --kind=tag_suggestion --limit=100` |
| `suggestions.edge_type` | `/vault-review-edges --auto --limit=100` |
| `suggestions.duplicate` | `/vault-review-duplicates --auto --limit=100` (merges via supersede — archival, never delete) |
| `suggestions.compaction_candidate` | `/vault-compact <folder>` per candidate (originals archived) |
| `suggestions.inefficiency_detected` + `infrastructure_upgrade` | `/vault-review-reports --auto` (verify against live data → reject-by-design / accept + queue item; migrate-tier left pending for the user) |

#### Always skipped

- `raw_inbox.ready` — `/vault ingest` is a separate workflow; the user
  flips `ready: true` when a draft is finished, not the sweep.
- `suggestions.archive_candidate` — per-record retention judgment.

#### Ordering constraints

Some kinds mutate state that other kinds read. Process them in declared
order; never dispatch two ordered kinds as parallel sub-agents.

- **Enrichment before the tag and edge passes.** Both enrichment passes
  (the missing-block backfill `/vault-enrich-all --auto --limit=100` and the
  `--stale` refresh) write `agent:` blocks, and a freshly written block makes
  the server file new `tag_suggestion` (from `agent.tags_suggested`),
  sometimes `new_tag` (an unknown suggested tag), and can feed `edge_type`
  (from `agent.edge_classifications`). Run **both enrichment passes first**,
  then `new_tag`, then `tag_suggestion` ∥ `edge_type`, so the suggestions
  enrichment generates drain in the *same* sweep instead of surfacing as
  residue. (Before this ordering enrichment ran last, and the `tag_suggestion`
  items it filed were always left for the next sweep — observed 2026-06-21.)
- **`new_tag` before `tag_suggestion`.** `new_tag` mints canonical tags
  and aliases into the taxonomy; `tag_suggestion`'s accept/reject logic
  reads the canonical-taxonomy state at decision time. Parallel
  dispatch races — a `tag_suggestion` agent can reject a suggestion
  whose tag the concurrent `new_tag` agent is about to canonicalize.
  Drain `new_tag` to zero (or to a stuck pass) before starting
  `tag_suggestion`. The 2026-05-13 instance was harmless (the tag was
  already on the record's FM, so the rejection didn't drop intent),
  but the failure mode generalizes.

Kinds with no declared ordering have no inter-kind dependency and
**may run as concurrent sub-agents**. Storage is not the constraint:
since 2026-06-11 the server supports concurrent writers — every
write/patch is an atomic synchronous read-merge-write inside one
event-loop turn (no torn writes; the DB import is sync `node:sqlite`),
and cross-call read-modify-write is guarded by `If-Match` (clean 412,
never a silent clobber). The orderings above are *data-flow*
constraints — enrichment feeds the queues; `tag_suggestion` reads the
taxonomy `new_tag` mutates — and stand regardless of writer safety.
The resulting stage DAG:

1. enrichment backfill ∥ `--stale` refresh (disjoint sets by
   definition: no `agent:` block vs drifted block)
2. `new_tag` alone (two concurrent minters could canonicalize
   conflicting tags/aliases)
3. `tag_suggestion` ∥ `edge_type` (independent queues; when both hit
   the same record they write different FM surfaces —
   tags/`agent.tags_suggested` vs `edges:` — and the server's atomic
   top-level-key merge preserves both)
4. `duplicate`, then `compaction_candidate` — the structural stage,
   sequential within itself. Merges rewrite inbound wikilinks
   across many records and archive the loser, so running them after
   the FM-triage stages means no tag/edge agent ever patches a record
   mid-archival; a merge landing inside a folder being compacted would
   race the compactor's multi-step move, hence duplicate before
   compaction, not parallel.
5. `report` (`inefficiency_detected` + `infrastructure_upgrade`, sweep
   alias `report`) — last, after every drain, so a `review_backlog_high`
   report is verified against the post-sweep queue rather than the
   pre-drain spike. Triage per `/vault-review-reports`: resolution
   acknowledges the observed level (server-side hysteresis, 2026-07-31 —
   the signal re-files only when the metric grows ~25% past it), so
   reject-by-design sticks. Migrate-tier `infrastructure_upgrade` items
   are never auto-resolved — left pending and surfaced in the summary.

**Same-kind triage agents run concurrently only via claims**
(2026-07-13+ server): each agent reserves its own batch with
`POST /suggestions/claim` under a unique holder (e.g.
`sweep-<date>-<kind>-<n>`) and resolves through
`POST /suggestions/resolve-batch` with `resolved_by` = that holder —
the reservation makes the batches disjoint by construction, and it
also de-conflicts overlapping sweeps from separate sessions. Skipped
items are released with `reopen` (or lapse at the claim TTL, default
30 min). On a pre-claim server the old rule stands: never two
same-kind triage agents — they pull the same queue head and duplicate
or contradict each other's decisions. Enrichment backfill shards by
explicit worklist chunks instead (§ Procedure step 4) — coverage is
not a suggestion kind, so there is nothing to claim. Label every
concurrent dispatch with its kind so a failed pass attributes cleanly.

#### Procedure

The control plane is `~/.claude/skills/vault/vault-sweep.mjs` — it owns
every baseline read, count, stage advance, pass loop, stuck floor, and
convergence round, persisted in a state file. Every measurement is a
fresh live read of `/system/lint` (`.coverage.enrichment`, nested) +
`/suggestions/summary` — never a remembered count (2026-07-12: a ghost
record sat invisible through a second sweep because both baselines
skipped the live coverage read). The agent's loop:

```bash
S=~/.claude/skills/vault/vault-sweep.mjs
W=$(mktemp -d)
"$S" begin --state="$W/state.json" [--include=…] [--exclude=…] [--max-passes=N] [--max-rounds=N]
# … dispatch the plan's sub-agents, then:
"$S" next --state="$W/state.json"
# repeat dispatch → next until {status: "done"}
```

1. **`begin`** computes the action set, runs the one-shot endpoints
   itself (`cleanup-lint` ∥ `embed-pending`), and prints the first
   dispatch plan. `begin --dry-run` prints the action set with live
   per-kind counts and stops (no writes, no state).
2. **Dispatch** every entry in the plan's `dispatch` array as parallel
   sub-agents — one Agent call per agent entry, fired in the same
   message, labeled with the kind:
   - `vault-enrich-all` entries: its § Sub-agent mode prompt; pass
     `--records=<records_file>` when the plan sharded the worklist,
     else `--limit=<limit>`; `mode: "stale"` → `--stale`.
   - Triage entries (`vault-review-tags` / `-edges` / `-duplicates`):
     the skill's § Sub-agent mode prompt with the plan's `holder` and
     `limit` — the generated holders make concurrent claims disjoint
     by construction.
   - `compaction_candidate`: run `/vault-compact <folder>` per entry
     in the plan's `candidates` list.
3. **`next`** after all dispatched agents return. The script
   re-measures live, records progress (a count that stopped dropping
   becomes that kind's **stuck floor**; a later count above the floor
   reopens it), advances the § Ordering constraints stage DAG, rolls
   convergence rounds, and prints either the next dispatch plan or the
   final `{status: "done"}` report. Two rounds is the normal fixpoint;
   `--max-rounds` is a runaway cap, not a target.
4. **Final summary** from the done report — `rounds` is the per-round
   before/after convergence trail; `floors` and `residue` name what
   survived and why (`reason`: converged / no_change_round /
   max_rounds); `one_shots` carries the cleanup/embed results — **plus
   the itemized structural mutations collected from the sub-agent
   reports**: each merge as `archived path → survivor`, each compacted
   folder by name, never bare counts. This post-hoc itemization is
   what replaced the retired `--include-destructive` pre-commitment
   gate.

A stuck kind isn't a failure — some suggestions legitimately need user
input, and the sub-agent's `--auto` mode is conservative on ambiguity.
The summary surfaces the residue so the user can decide whether to
hand-triage or leave it for the next sweep.

The action set is recomputed from a fresh baseline at each round, so
suggestions minted mid-sweep (stage-3/4 reindex cascades, compaction
summaries becoming enrichable notes) drain in the next round instead of
waiting for the next manual sweep. The invocation stays bounded by two
independent caps (`--max-passes` within a kind, `--max-rounds` across
the whole pass) plus the stuck-floor exclusion — what legitimately
survives the loop is residue the `--auto` agents deferred for human
judgment, and the summary surfaces exactly that.

### /vault (no subcommand)

Show vault status: note counts per folder, recently updated notes, any lint
warnings. All reads: `vault_status` (records / edges / pending suggestions /
last indexed commit), `vault_list_folder` per folder, `vault_list_pieces`
(`sort: "updated"`) for recency, `vault_lint` for warnings.

## Proactive behavior

This skill should be used proactively when:
- The user discovers a non-obvious pattern, gotcha, or decision worth preserving
- A debugging session reveals something that would save time in the future
- Cross-project knowledge is generated (e.g., "this Docker networking trick works everywhere")
- The user says "remember this", "save this", "note this down"

When in doubt, ask: "Want me to save this to the vault?"
