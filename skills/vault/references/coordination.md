# Claims, leases, and handoffs

Part of the vault skill: the table in its `SKILL.md` says which file holds a section named here.

### Work claims — a maintenance pass reserves its notes

A pass that processes notes (an ingest, an enrichment, a duplicate merge, a
compaction) claims them first (vault-storage D150), so a pass running
beside it leaves them alone. The claim is partial: `claimed` is what you
got, `held` lists each item another pass holds, with its holder, purpose,
and expiry; work on what you got and skip the rest. Keep the
`claim_token`, pass it to your own moves, supersedes, and deletes of those
notes, and release the claim when the pass ends; a crashed pass's claim
lapses at its TTL (30 minutes by default). The raw inbox's `ready` list and
lint's `unenriched_records` already leave claimed notes out, so read a
worklist before you claim, never after. `enrich-batch.mjs` and
`compact-batch.mjs` claim for you; `/vault ingest` and the duplicate merge
claim by hand (their procedures say where).

**A 409 `claimed_by_other` on a move, supersede, or delete** means another
pass holds that note, or, on a move or a supersede's archive slot, the path
the note would arrive at (server from 2026-10-21, vault-storage D396;
`details.item` names the claim's item). Leave the note, move it elsewhere,
or come back after the pass; edits and appends are never blocked, so
ordinary writes need no claim. **Never force a work-claim release**, even
when the claim looks stuck: a claim another holder left behind is the
operator's to end on the agents page (`/ui/agents.html`). From adapter
0.15.0 neither `vault_work_release` nor `vault_lease_release` offers
`force`; the REST route's `force` is a signed-in person's act, refused to
an agent's key.

**A call that fails with `code: "network"` says what happened** (adapter ≥
0.12.0; server from 2026-09-29, vault-storage D99). The usual cause is a
deploy: the server restarts briefly. From adapter 0.18.0 (vault-storage D457,
D459) a connection never made (refused, timed out, no route or name server)
is repeated whatever the method, the waits doubling from a quarter second to
16 s, for two minutes, and the hosted front's 503 `tenant_unavailable` and
`verification_unavailable`, which applied nothing, are waited out the same
way, so a restart, or a reboot of about a minute, passes unseen. From adapter
0.19.0 a `tenant_unavailable` whose `details.reason` is `database`, a request
that reached no database, is waited out for ten minutes, the time a resize of
the database takes (vault-storage D491). Once one
call has waited the two minutes out, later calls try once until the vault
answers again, their error naming since when in `details.unreachableSince`:
the vault is down, so do not repeat such a call at once. When the error still
arrives, read `details.cause`: a connection never made sent nothing, so
repeat the call once `vault_health` answers; a message that says the write
may have applied went out before the connection dropped, as did a 502
`tenant_dropped`, so read the document before sending it again, since an
`append`, or a `replace` whose `to` contains its `from`, applies twice. An
adapter before 0.18.0 repeats only a refused connection, every half second
for eight seconds, and one before 0.12.0 reports every case as `network
error: fetch failed`: treat a failed write there as possibly applied.

**A 400 `secret_detected` means the write carried something key-shaped**
(server from 2026-10-08, vault-storage D171): `details.found` names each find
as `{field, line, kind}`, never the value. `field` is a JSON pointer into the
body, `body` for a raw one, `path` for the note path or other path the request
names, or `?<name>` for a query value (server from 2026-10-09, vault-storage
D178), since a path becomes a file name and a query value can be stored. Take a real secret out of the text
and write again; it never belongs in the vault. **The override is
Eugene's call, never yours**, as `git commit --no-verify` is for the dotfiles
hook: an override you send on your own judgment stores a value you may have
misread as a fake. So stop, tell him which field, line, and kind were refused and
why you believe it is a fake, and send the override only on his word for
that write. On his word, pass `allow_secret: true` to that one call (adapter ≥
0.16.0, on every tool that sends a body). An older adapter refuses the argument
as undeclared, so there use the `POST /vault/edit` or `PUT /vault/{path}`
fallback through `vault-curl` with `-H 'X-Program-Clerk-Allow-Secret: 1'`.
**A 400 `unscannable_content`** (server from 2026-10-09, vault-storage D179)
is the same refusal for a handoff artifact the server cannot read, a bundle
or a patch's binary hunk (kinds `bundle`, `binary-hunk`), and the same rule
holds: send a text patch, or ask Eugene before `allow_secret`.

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

### Agent coordination — repo leases and handoffs

The server carries two coordination surfaces: a repo-lease registry answering
"which agent may edit this repo's working tree directly", and a handoff queue
answering "how does a non-owner get work done there" (design:
[[projects/vault-storage/design/agent-coordination]] § Ownership protocol;
rulings D21/D23). Lease tools: `vault_lease_list` / `vault_lease_events`
(reads), `vault_lease_claim` / `vault_lease_renew` / `vault_lease_release` /
`vault_lease_transfer` (adapter ≥ 0.4.0; on an older adapter,
`vault-curl /leases` and `POST /leases/claim|renew|release|transfer`).
Handoff tools: `vault_handoff_*` (adapter ≥ 0.5.0; on an older adapter,
`vault-curl /handoffs[/{id}]` and
`POST /handoffs[/claim|resolve|resubmit|note]`).

**This is enforced, not advisory** (leg 4, 2026-08-10): the `PreToolUse` hook
`hooks/vault-lease-gate.sh` resolves each `Edit`/`Write`/`NotebookEdit`
target to its repo and blocks the call when someone else holds that lease,
naming the holder and the worktree + handoff path. Since 2026-09-06 it gates
write-shaped **Bash** the same way (ruled option 1 of three, after a
measurement found 80 cross-repo Bash writes in 21 sessions over 30 days): it
parses the command for the repositories its write targets name —
redirections, `sed -i`, `tee`, `cp`/`mv`/`rsync` destinations, `rm`, `mkdir`,
`touch`, `prettier --write`, `npm install`, the working-tree-mutating `git`
verbs (never `worktree`, never `apply --check`), and a path-like value of
`--store`, `--out`, `--output` or `-o` after any command (2026-09-25) — with `cd` tracked and
heredoc bodies ignored, and blocks when any of those checkouts is held by
someone else. It follows a variable the command assigns. What it cannot parse it
allows (a write inside `python - <<EOF`, a path in a variable the command does
not assign, a relative path after a `cd` it cannot read), so it narrows the gap
rather than closing it.
**Linked worktrees are never blocked**, in any mode: they are the sanctioned
path, and their remote is the held checkout's. It **fails open** on every
unknown — no vault env, unreachable server, non-repo path, unclaimed repo —
so a blocked edit always means a real, current, someone-else lease, never
infrastructure trouble. It reconstructs your holder id as
`<hostname>/<session-prefix>`, so **claiming under a different string will
block your own edits**; the message prints both sides when that happens.

**Your own repo is claimed for you — mechanically (ruled 2026-08-18).**
`hooks/vault-lease-claim.sh` (SessionStart) claims the cwd repo with rank 10
and `takeover_after` 3600, what the hooks call `cwd` (the server knows only the
numbers, vault-storage D606), under the holder id below; `hooks/vault-lease-gate.sh`
renews it on activity — every edit through the PreToolUse gate, and every
tool call through the same script's `--touch` mode on PostToolUse
(2026-09-05, so a Bash-only or MCP-only session stays live) — and re-claims
after a TTL lapse when the repo is your own; `hooks/vault-lease-release.sh` (SessionEnd)
releases every lease this holder has whose claim token the hooks kept (the
cwd lease; since D67); TTL (4 h) covers a crash. Three
guards against a dead session's lease (vault-storage D63, 2026-09-19): the
server lets a cwd claim take a cwd lease unrenewed for an hour; the release
hook leaves a marker when it cannot finish, and the next session start on
the host releases what that holder still holds before claiming; and when the
gate's periodic check finds your own repo held by someone else, it tells you
once, in the context after a tool call, that you are subordinate now. An
idle session can lose its lease this way, so read that notice before any
direct edit, and treat a blocked edit the same way. Sub-agents
never claim — the parent owns the repo. All fail-open. The result arrives
as a `[vault] lease: …` line at session start, which is how you know your
standing: **held by you** (edit freely), **unclaimed** (the vault was
unreachable or the hook is not installed — behave as held-by-you, nothing
else changes), or **held by another cwd session** — then you are
**subordinate**: read and analyze freely, route every edit through a
worktree + a handoff to `repo:X` (below), and ping the holder with
`SendMessage` when `ListAgents` shows it reachable. **Address the doorbell
by repo, not by holder id**: `ListAgents` names a peer
`<cwd-basename>-<xx> [<ref>]` and neither part is the session prefix in the
holder id (verified 2026-08-19: holder `host1/36eb0a3e` was
`claude-config-ca [51bbb5]`) — send to the peer(s) named after the repo's
basename and put the resource + holder id in the text so a non-holder can
tell and ignore it. Record first, ring second. Taking the lease is the
operator's act, never yours, and it happens in the UI only (ruled
2026-09-19): he transfers, or force-releases in `/ui/agents.html`. When he
says *"take the lease"*, point him there; **never force a lease release**,
and never route a refused release through `vault-curl`. Adapter 0.15.0
dropped `force` from `vault_lease_release`, and an older adapter still
offers it: do not send it. The REST route refuses `force` to an agent's key,
and the auto-mode classifier refuses the call anyway. The same holds for a
work claim (§ Work claims).
Before that ruling the section said single-agent sessions claim nothing;
that left the registry unable to tell "nobody is there" from "nobody
claimed", which is why the claim moved into a hook.

- **Before editing a repo outside the session's cwd** (the CLAUDE.md
  § Cross-repo work path), read the lease and the tree:
  `vault_lease_list({resource: "repo:<normalized-remote-url>"})` — e.g.
  `repo:github.com/uhop/deep6`; a repo with no remote keys as
  `repo:<host>:<path>` — then `git -C <repo> status --porcelain`.
  - **Unclaimed and clean → side-claim, edit directly, release, tell the
    user.** `vault_lease_claim({resource, holder, attestation: "clean at
    <short-sha>"})`, which names no rank and so is what the hooks call a side
    claim; a `cwd` session takes it at once. Keep the `claim_token` it
    returns, edit the working tree, run that repo's gates,
    `vault_lease_release({resource, holder, claim_token})`, then report "mods done in
    `<repo>` — review, commit, push". No worktree, no branch — the daily
    no-other-agents case, ruled 2026-08-18. Clean = no modified, staged, or
    untracked-unignored files (ignored never count; stash entries: mention,
    don't block). The check is client-side by design — the server cannot
    see any host's working tree — and the attestation goes in the event log.
  - **Held by someone else → don't race it**: name the holder to the user,
    work in a disposable worktree, commit there, file the result as a
    handoff (below) with the patch, doorbell via `SendMessage` if the holder
    is reachable. Keep the branch until it resolves.
  - **Unclaimed but dirty → do not claim**: someone's in-flight state is
    present (possibly the user's); worktree + handover, and say so. One
    exception: the dirt is this session's own earlier side-claimed burst,
    verified three ways — the dirty paths are exactly that burst's files,
    `git -C <repo> diff --stat` matches what you left, and your own
    sentences are in the diff. Then side-claim again with an attestation
    naming the earlier burst and edit directly; a second burst on your own
    uncommitted first one is one review unit. Dirt you cannot account for
    is someone's (2026-09-06).
  - **Registry unreachable → assume held**: worktree + handover, as before.
    An outage costs throughput, never correctness.
- **Holder id**: `<hostname>/<session-prefix>`, e.g. `host1/59bd32b6` —
  unique per session, readable in `/ui/agents.html`. **The holder id is a
  label, not a fence** (server ≥ 2026-09-27, vault-storage D67): every agent
  claim, a lease's or a handoff's, answers with a `claim_token`, once, and
  renew, release, transfer, and resolve need it (409
  `claim_token_mismatch` without it). Keep it in context for the burst; a
  lost token leaves the claim to lapse at its TTL. The lease hooks keep the
  cwd lease's token on disk themselves; a side lease the agent forgets is
  not released at SessionEnd, since the hooks do not have its token. The
  operator holds as
  `kind: "human"` (no TTL, never preempted) and claims via the UI, since an
  agent's key gets a 403 there (vault-storage D606);
  `vault_lease_transfer` with `to_kind: "human"` is the "please review and
  commit" handover.
- **While holding a side lease**: it is yours for the burst — release it
  when the burst is done, with its `claim_token`. SessionEnd does not
  release it (the hooks never saw its token): a forgotten side lease holds
  until its TTL, though any cwd claim preempts it. After a long gap or any vault error, verify the
  lease still names you before the next mutating burst — losing a lease is
  demotion, not damage (D23): downgrade to worktree + handover. Leases are
  cleared on server restart by design — the gate re-claims your own repo on
  the next edit; re-claim a side lease yourself if still needed.

**Handoffs — asking another agent to do the work.** A handoff is addressed to
a **role** (`to: "repo:<normalized-remote-url>"`), never a session, so it
survives its requester and is picked up by whoever holds that repo's lease,
including an agent that starts tomorrow. Handoffs are durable across server
restarts (the server keeps a spool of self-describing files); resolved ones
archive into a data file each, `projects/<project>/data/handoffs/<id>.json`,
which `vault_data_read` reads by the id once `vault_handoff_get` no longer
finds it (server from vault-storage 10f; before it, the project's
`handoff-archive.md`). Same no-op rule as
leases: a single-agent session that owns its cwd repo never files one.

- **Filing one** (you are not the owner): work in a disposable worktree,
  then `vault_handoff_create({idempotency_key, project, to, kind, ref, from,
  body})`. The server reads neither `kind` nor `ref` (vault-storage D605), so
  these are this skill's own: `kind` is `review-branch`, `apply-patch`,
  `answer-question`, or `run-check`; `ref` is `{type, value}`, the type
  `worktree`, `branch`, or `url` for a pull request, never `spool`, which the
  server sets on an upload. Omit `ref` for a pure question. **The idempotency key is mandatory and must be yours to
  regenerate**: a failed create is ambiguous, and retrying with the same key
  returns the original (`status: "existing"`) instead of filing twice. `from`
  is `{host, session, repo?}`, provenance save one use: `repo`, your project's
  repository as `github.com/<owner>/<name>`, lists the handoff in your
  project's resume once it is returned (server ≥ 2026-10-22, vault-storage
  D403), so pass it. **Keep
  your branch/worktree until the handoff resolves**; it is the backup copy.
  **Declare what the work changes** in `touches: [{kind, key, operation}]`
  (`kind`: `file` | `symbol` | `schema` | `config` | `api`; `operation`:
  `add` | `extend` | `modify` | `replace` | `remove` | `rename`; server ≥
  2026-09-06, D34) — said, never inferred from the prose: the owner's inbox
  reports `overlaps` with the other in-flight handoffs to the same role from
  exactly this list, and a handoff without it overlaps nothing.
- **Attaching the work**: for anything the owner should *apply*, follow the
  create with `vault_handoff_put_artifact({id, content})` — a patch from
  `git format-patch --base=$(git merge-base main HEAD) main..HEAD --stdout`
  (`format-patch` over a plain diff because it carries the commit message,
  author and date, and `--base` records what it applies to). This is what
  makes a handoff work across hosts, since agents cannot `git push` and the
  singleton server's spool is the shared storage. 10 MB cap — past that,
  reference a branch instead of shipping a blob; `ext: "bundle"` with
  `encoding: "base64"` is the escape hatch for binary or multi-branch work,
  and the server refuses it, as it does a patch with a binary hunk, with 400
  `unscannable_content` (server from 2026-10-09, vault-storage D179): it cannot
  read either for secrets, so one goes through only with `allow_secret` on
  Eugene's word, as below. Prefer a text patch.
  The upload sets `ref` to `{type: "spool"}` itself, and reads the patch's
  `base-commit:` trailer into `base_sha`. The artifact is captured at submit
  time, so it no longer depends on your worktree surviving. **Then record the
  gates you ran** with `vault_handoff_verify({id, check, sha, exit, by})`, one
  call per check, `sha` being the head commit your gates ran on (the owner
  passes the applied commit after `git am`). The record also carries the
  artifact's sha256 at that moment, and every read shows it `stale` once the
  artifact is replaced (server ≥ 2026-09-16, vault-storage D51; before that
  the sha was compared with the base commit, which no gate runs on, so every
  real verification read stale), so a pass on an older patch is shown, never
  trusted.
- **Applying one** (you are the owner): read the inbox item's `overlaps`
  and each verification's `stale` first — an overlap is another in-flight
  handoff on the same file or symbol, a stale pass is a gate that ran on a
  patch that has since changed. Then stream the artifact to a file rather
  than into your context — `vault-curl /handoffs/<id>/artifact -s >
  work.patch` — and **validation-first**: `git apply --check work.patch`, and
  only then `git am --3way < work.patch`. After your own gates pass on the
  applied result, `vault_handoff_verify` with the applied sha, so the record
  carries both sides' checks. A patch that will not apply is a `rejected`
  resolution with the failure in `result`, never a silent drop; the submitter
  wakes on the status, rebases, and resubmits the same handoff.
- **Waiting on one**: poll `vault_handoff_get({id})` and watch `status`. When
  actively blocked, a `Bash(run_in_background: true)` `until` loop over the
  status is the wake mechanism — the harness re-invokes you when it exits.
  When not blocked, don't poll: the result reaches you at the next
  `/vault resume`, since it is attached to the repo rather than to your
  session.
- **Receiving them** (you hold the lease): `/vault resume`'s project block
  carries the inbox — claiming a repo means inheriting it. Between resumes,
  read it with `vault_handoff_list({project: "<name>", status: "open"})`, never
  by the role, which goes stale when a repository moves (2026-11-01: a handoff
  to a moved repository's old remote read as an empty inbox). Claim before
  reviewing (`vault_handoff_claim({id, holder})`, same holder id as the
  lease, keeping the `claim_token` it returns), then resolve exactly once,
  passing that token: `done` (you applied it — you own any
  merge conflicts), `rejected`, or `returned` for rework. **`returned`
  requires a `note`** — the critique is what makes the rework possible, and a
  return without one is a silent drop. Claims expire lazily (~30 min), so an
  abandoned review reopens rather than wedging the work.
- **Reworking**: a returned handoff comes back to *you*. Fix it, then
  `vault_handoff_resubmit({id, ref?, body?, touches?})` — same record, same
  id, so the discussion and history stay in one place; `touches` is replaced
  whole when given, so restate the full list. Never file a fresh handoff for a
  second attempt.
- **Discussion** rides `vault_handoff_note({id, author, text})`, append-only
  and attached to the work; refused once the handoff is done/rejected.
- **Never auto-resolve someone else's handoff.** Handoffs are deliberately
  not a suggestion kind — `/vault sweep` cannot see or drain them, and no
  `--auto` pass should ever settle one. A cross-agent work request is
  human-or-owner judgment.
