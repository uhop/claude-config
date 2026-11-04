# Taking up a digest line

Part of the vault skill: the table in its `SKILL.md` says which file holds a section named here.

#### When a digest line is taken up

Each of these waits for the user or for the work to reach it. *"The deep work is
for the session we want to start."* (Eugene, 2026-10-26.)

- A session with no log ended without a wrap. Write its log, from
  its record's commits and notes, the drift check, the queue and
  decisions as they stand, and, on the host that ran it, the transcript
  (`~/.claude/projects/<cwd with / as ->/<session id>.jsonl`), as
  `/vault log` writes one: the body file, then a `log` line whose
  `holder` and `ended` are the session's, as the digest names them, so it
  pairs with that end alone, a resumed session's other ends included, and
  is not written twice. Append the line to the session's month file
  (`projects/<name>/data/sessions/<YYYY-MM>.jsonl`), or, when its `file` in
  `vault_resume_bundle` is the sessions note (`projects/<name>/sessions.md`,
  until the server takes it in), to the month file of now: a line pairs
  with a note's session by holder too.
- `handoff` — another agent waits on this session: read the request
  with `vault_handoff_get` before acting (§ Agent coordination —
  handoffs). `rework` — your own submission came back: surface it.
- `upstream` — the item, by its slug, mirrors a ticket: read the ticket,
  and when it is closed or merged upstream, close the item
  with `queue-items.mjs archive`, `--reason shipped` when the work was
  yours and `--reason parked` with a trail saying it closed upstream
  otherwise.
- `triage` — an Inbox item a secondary tracker took in: read it with
  its `source` and accept it (`queue-items.mjs move … --section backlog`
  or `active`) or reject it (`queue-items.mjs archive … --reason
  rejected`, with a trail saying why). Say what you decided;
  leave an item you cannot judge and name it.
- `place` — the item entered the Backlog since the last session, or
  during it where the project keeps a plan under `plans/` (vault-storage
  D525, D527), since a wrap files what
  arrives after it: place it by the project's plan, or say that the
  plan already places it. In a project with no plan, filing the item
  in its Backlog section placed it: confirm the section.
- `fix-trackers` — the queue's `trackers:` declaration is malformed:
  fix it with `vault_patch_fm` on the queue, and keep going on the
  answer as given.
- `file-stalls` — the server does not file its loop stalls, so this
  resume files what is not filed yet, since the server is shared: find
  the newest `Loop stalls recorded through <at>.` title among
  vault-storage's open and archived items (the open one is
  `queue/loop-stalls.md`, the rest
  in `queue-archive/`), which marks where filing stopped; read every stall record since it
  with `vault-curl '/system/events?log=stalls&since=<that at>&limit=1000' -f`,
  following `next` while it is not null and leaving out the record at
  exactly that `at`. `-f` makes an HTTP error stop the step, since
  `vault-curl` exits 0 on one otherwise. **One open stall item at a
  time** (Eugene, 2026-10-09): when the newest item is still open, add
  the records to it with one `vault_replace`, its title's time moved to
  the latest record's `at` and the new records first, its `from`
  running from the title line through the newest existing record line,
  so another resume's filing refuses it whole; a 409 means another
  resume filed first: read the item and stop. When it is archived, or
  there is none, put them into one new Backlog item titled
  `Loop stalls recorded through <the latest record's at>.`. Each record
  is one line: `at`, `lagMs`, CPU against the lag (near it is
  computing, `gcMs` the collector's share; far below it is waiting, on
  storage when `fsReads` or `majorFaults` moved), and `before`. Filing
  is the whole step: the cause is looked for when Eugene schedules it.

**Trackers.** **When `primary.kind` is not `vault`, new work is
filed there** (through that tracker's own MCP server, or as a
paste-ready ticket handed to the user when you cannot write to it), and
a queue item that mirrors an outside ticket carries `source:` with the
tracker and its id; the vault keeps context, notes, edges, and
handoffs either way. **The item in flight is one Active item with
`source:`** (vault-storage D108): when you start on a ticket,
`queue-items.mjs file <name> --section active --source "github
owner/repo#15"` (or `linear ENG-123`, `jira VS-7`) with your notes as
the body — the script replaces the open item that already carries that
source instead of filing a second (D107), so the call is safe to
repeat; the Backlog stays empty in that configuration, since the tracker
holds the list; when the ticket closes, `queue-items.mjs archive …
--reason shipped`, or `--reason parked` when the work moves off you.
Before
starting on a ticket, read what the vault holds about it:
`vault_links({key: "<the source>"})` (or `{url}` for any link) lists
the notes and queue items that mention it (vault-storage D112).
`vault_project_trackers({project})` reads the same view outside the
resume flow.

`vault_resume_bundle` still answers the raw blocks, for `/vault learn` and for a
reader that needs them; its tool description names each one. Before relaying a
summary it marks stale, read the note, one over 64 KB (its `body_bytes`) by the
sections you need, and restate the summary in your next write to it.
`vault_project_changes` answers what changed since any time or commit.
