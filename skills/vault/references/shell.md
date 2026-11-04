# Reaching the vault from a shell

Part of the vault skill: the table in its `SKILL.md` says which file holds a section named here.

### `vault-put` — the shell-side document writer

Still the right tool from a **script**, from a pre-0.1.0 adapter, or when a
multi-pair all-or-nothing replace is wanted (the MCP `vault_replace` is one op
per call; `vault-put` batches pairs into a single round-trip). From the agent
on a parity adapter, prefer `vault_append` / `vault_replace` /
`vault_replace_section` / `vault_write_file` — same server ops, no scratch files.

`~/.claude/skills/vault/vault-put.mjs` replaces the hand-rolled jq/python
payload-assembly blocks (which failed 4× in one session — the 2026-07-10
reflect report). Three modes, all
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
  (weak ETag `W/"…"` + `X-Program-Clerk-Composed: true`, also sent as
  `X-Vault-Composed` until the switch to signed-in keys, vault-storage D151); vault-put refuses it up
  front, and the server 412s conditional / 409s (`shadow_conflict`)
  unconditional PUTs against it — a flat file there would shadow the
  folder (the 2026-07-14 blog incident). Edit the folder's *pieces*
  (`GET /vault/X/` lists them) instead; `?shadow=allow` exists for a
  deliberate de-atomization only.

Reach for raw `vault-curl` (below) for endpoints other than `/vault/{path}`
document writes — `supersede`, `move`, `propose`, `/maintenance/*` — and
anything `vault-put` doesn't cover. Reads go through the MCP tools (`tools.md`), not
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
  `vault_resume_bundle` at 79 KB and a queue slice at 145 KB, all
  three overflowed and had to be `jq`-ed off disk.
- **Verbatim relocation must be mechanical.** A queue kept as item notes
  moves whole notes; in any other note, moving an item means reproducing multi-KB paragraphs exactly.
  `vault_replace` takes `from`/`to` as strings, so that is you retyping them;
  `--replace-file` matches byte-for-byte against what `sed` cut. Retyping is
  the risk, not the round-trip. **From D35 (2026-09-06) the server does the
  move**: `vault_move_item({from_path, to_path, title, to_section, trail,
  create_section})` locates the item by its bold title exactly once (the
  `title` is the whole bold text, trailing period included — the same
  string without the period is a 409 `item_assert_failed`, hit 2026-09-07),
  inserts the **Shipped** trail after the title, creates a new date block on
  request, and writes the destination before the source — nothing is retyped
  and nothing round-trips. On an adapter before 0.7.0 the same call is
  `POST /vault/move-item` through `vault-curl` with that JSON body; the
  `sed` + `--replace-file` cut above is the fallback on a server before that
  date, not the recipe.
- **A whole section is a server-side span, not a retyped block.** `## Active`,
  a decisions entry: read it with
  `vault_read_section({path, heading: "## Active"})` and rewrite it with
  `vault_replace_section({path, heading, body})` (vault-storage D30,
  2026-09-06 — the heading is matched as a whole line, exactly once, with
  code fences masked; the span runs to the next heading of the same or
  higher level; the body is trimmed and framed; an absent or ambiguous
  heading is a 409 `section_assert_failed`). Nothing is retyped and nothing
  outside the span moves. It does **not** move a queue item: an item is a
  slice of a section, and rewriting the section would round-trip the whole
  Backlog through context — the item move stays on the file-based cut above.

The boundary: **short strings you can type without risk go through
`vault_replace` / `vault_patch_fm`, and a whole section through
`vault_replace_section`** — the atomic server-side ops with the small blast
radius. Drop to file-based reads and `vault-put --replace-file`
only when the block is too large to reproduce by hand or the document is too
large to pull into context. Reads you actually intend to *read* — a note you
are about to reason about, a folder listing, a search — stay on MCP always.
(Ruled 2026-08-04, blog session: the practice had been going off-book
silently, which is worse than either rule.)

### Use `vault-curl` — don't hand-roll `curl`

There is a `vault-curl` wrapper on `$PATH` (installed under `~/.local/bin/vault-curl`). **Prefer it over raw `curl`** — it prepends `$PROGRAM_CLERK_URL` and the `Authorization: Bearer $PROGRAM_CLERK_KEY` header (each falling back to its old name), checks the env vars, and forwards every remaining flag straight to `curl`.

Quick check before the first vault op in a session:

```bash
command -v vault-curl >/dev/null || { echo "vault-curl missing — falling back to curl"; }
```

`vault-curl` itself exits with a clear error if `PROGRAM_CLERK_URL` or `PROGRAM_CLERK_KEY` is unset and so is its old name, so no separate guard is required. Only fall back to raw `curl` if `vault-curl` isn't installed on the machine.

**Never grep dotfiles for the credentials.** `vault-curl` resolves `PROGRAM_CLERK_URL` and `PROGRAM_CLERK_KEY` (or the old names) from the already-sourced env (`~/.env` via `.bashrc`). If a call fails for missing creds, report it — do **not** scan `~/.bashrc` / `~/.env` / other dotfiles to find them. The auto-mode classifier flags systematic dotfile credential-scanning as Credential Exploration and denies it (correctly).

API endpoints (invoked via `vault-curl <path> [curl-options...]`):

- **Read**: `vault-curl /vault/{path} -s` — *prefer `vault_read_file`*; use
  this when you need the response headers (`ETag` for a hand-rolled
  conditional write, `X-Program-Clerk-Composed` to detect a composed folder view),
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
- **Conditional writes (`If-Match`, use for read-modify-write on shared docs)**: `GET /vault/{path}` returns an `ETag` header (sha256 of the document's bytes, with `-gzip`, `-br`, or `-zstd` inside the quotes when the response was compressed; the server accepts either form back, vault-storage D70); send it back as `-H 'If-Match: <etag>'` on the PUT (either Content-Type) and the write lands only if the document hasn't changed in between — otherwise **412** `precondition_failed` with `details.current_etag`, meaning another writer got there first: re-GET, re-apply your edit to the fresh copy, retry with the new tag. Adopt this for any flow that GETs a shared doc (queue.md, learnings.md, archives), modifies it, and PUTs it back — it converts silent last-writer-wins clobbering into a visible, retryable conflict. Capture the ETag with `-D-` or `-o /dev/null -D- | grep -i etag`; successful PUTs (204) return the new `ETag` so chained conditional edits don't need a re-GET. `If-Match` never creates files (412 on a missing path); plain unconditional PUT remains valid for docs only one session touches.
- **Edit (atomic server-side body op)**: `vault-curl /vault/edit -X POST -H 'Content-Type: application/json' --data-binary @op.json` with `{path, op: "append", text}` or `{path, op: "replace", from, to, all?}` — one op per call, server ≥ 2026-07-24. Replace is asserted (absent `from` → 409, ambiguous without `all` → 409 with the count — never a silent no-op); append joins after a single trailing newline; FM rides verbatim (`updated` re-stamped) except for an optional `agent` patch, which is merged over the stored `agent:` block and stamped current (D74, § Keep the enrichment current in the same write). Prefer `vault-put --append/--replace`, which calls this automatically with a round-trip fallback; reach for the raw endpoint only from contexts without vault-put.
- **FM patch (atomic single-key frontmatter op)**: `vault-curl /sections/{record_id}/fm -X PATCH -H 'Content-Type: application/json' --data-binary @ops.json` with `{ops: [{op: "add"|"remove", path: "/related", value: "..."}]}` (not `/tags`: a 400 `protected_field`; tags go through `POST /sections/{id}/tags` with `{"tag": …}` and `DELETE /sections/{id}/tags/{tag}`, each returning the resulting `tags` array) — server-side membership edit on an FM array, no body round-trip and therefore no way to clobber the document. Returns `{changed, results: [{op, path, changed, array}]}` with the resulting array, so no re-read is needed to confirm. Prefer this over any full-document write whose only purpose is one FM key. `record_id` comes from `vault_list_pieces({file_prefix})`. Used by `/vault-propose-related` (`related-batch.mjs`) to apply accepted candidates.
- **Supersede (replace a note, archiving the old)**: `vault-curl /vault/supersede -X POST -H 'Content-Type: application/json' --data-binary @payload.json` with `{old_path, new_path?, frontmatter, body}` — the successor in the standard JSON write shape; `new_path` defaults to `old_path` (supersede-in-place: the successor takes over the path, so inbound wikilinks resolve to the replacement). Use this — never DELETE+PUT or a wholesale overwrite — whenever a write *replaces* a note rather than evolving it: the old note moves to `<dir>/archive/<YYYY>/<name>` with its record id intact (edges/embeddings/suggestions survive) and gets `status: superseded`; the successor's body is auto-appended a `> Supersedes [[<archived-path>]].` footer that backs the typed `supersedes` edge (don't add your own). Validation-first — a rejected request (bad FM, occupied `new_path`) mutates nothing; a taken archive slot gives way to `<stem>-<YYYY-MM-DD>.md` (server from 2026-11-01, vault-storage D574). Routine edits to an existing note stay plain PUTs; supersession is for replacement semantics.
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
url=${PROGRAM_CLERK_URL:-${VAULT_API_URL:-}} key=${PROGRAM_CLERK_KEY:-${VAULT_API_TOKEN:-}}
[[ -z $url || -z $key ]] && { echo "Error: set PROGRAM_CLERK_URL and PROGRAM_CLERK_KEY (or the old VAULT_API_URL and VAULT_API_TOKEN) in ~/.env"; exit 1; }
```

Then use `curl -H "Authorization: Bearer $key" "$url/<path>"` with the same endpoints listed above.
