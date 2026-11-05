# Vault structure and note format

Part of the vault skill: the table in its `SKILL.md` says which file holds a section named here.

## Vault structure

```
raw/               # unprocessed source material
topics/            # compiled wiki notes (1 concept = 1 note)
projects/          # per-project knowledge (subfolder per project)
  {project}/
    decisions.md   # architecture & design decisions
    learnings.md   # gotchas, patterns, what worked
    stack.md       # tech stack & dependencies
    queue/         # outstanding work, one note per item (queue.md reads it whole)
    queue-archive/ # closed items, one note each
    state.md       # baseline snapshot for vault-check-drift
queries/           # filed Q&A research outputs
logs/              # session logs until vault-storage 10e-2, expiring at 90 days; since, projects/<name>/data/sessions/
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
| Top items across the fleet | `queue-items.mjs fleet --limit N` |
| One project's open queue | `queue-items.mjs list <name>` |
| One project's archive | `vault_read_file` on its `queue-archive.md` |
| Everything at priority N (Backlog) | `queue-items.mjs fleet --section backlog --priority N` |
| Fleet-wide Active / Watching | `queue-items.mjs fleet --section <section>` |

For the shape, see [[topics/project-queue-convention]].

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
- A data file, or a folder of them, is linked by its full path,
  `[[projects/<name>/data/stalls/2026-10.jsonl]]` or
  `[[projects/<name>/data/stalls]]`: the note page links it to its data page,
  and the lints count it resolved while it is there (vault-storage 10h-2). A
  log's body file expires at 90 days, so cite it as a backticked path.
- 1 concept per topic note (atomicity)
- Minimum 2 wikilinks per note (dense linking)
- Every note starts with a 1-2 sentence summary paragraph
- **Tags come from the taxonomy; mint only when nothing fits** (vault-storage
  D82 and D83, 2026-09-28). The taxonomy holds about 1,600 tags, and a name
  typed freehand is the main way near-duplicates get minted (`competitor-survey`
  beside `survey`, `integrations` beside `integration`). Before a write that
  carries `tags:`, check the names: `vault_tag_nearest({tags: [...]})`, or
  `{text: <the summary>}` for a draft with no names yet, answers per name with
  an `exact` hit (a canonical tag, or an alias resolved to one: use the tag as
  returned) and the nearest existing tags, each with a `score` and how it
  matched (`exact`, `alias`, `name`, `embedding`); take an existing tag whose
  description covers the note. Then write with `strict_tags: true` on
  `vault_write_file`, `vault_update_piece`, or `vault_supersede`: a name still
  outside the taxonomy is a 409 `unknown_tags` carrying the same candidates in
  `details.unknown`, and nothing is written or filed, so fix the list and write
  again. Mint with `vault_tag_create` (a description saying what a note
  carrying the tag is about) only when no candidate fits, then write. A write
  without `strict_tags` still lands, but an unknown tag then files a `new_tag`
  suggestion for the sweep to triage and the answer carries `unknown_tags`:
  that is the slow path this rule exists to avoid. On an adapter without the
  tool, `vault-curl /tags/nearest -X POST` with `{"tags": [...]}` is the same
  lookup, and `strict_tags: true` goes in the JSON body of `PUT /vault/{path}`.
- **A project declares its trackers in its queue's frontmatter** (vault-storage
  D95, 2026-09-28): `trackers:` is a list of `{kind, ref, role, create, intake,
  write, url}`, `kind` one of `vault`, `github`, `linear`, `jira`; `ref` the
  tracker's own name for the project (`owner/repo`, a Linear team key, a Jira
  project key); `role` `primary` or `secondary` (one primary; the vault when
  none is declared; `mirror`, the name before 2026-09-30, is read as
  `secondary` and named in `problems`); `create` `here` or `none`, whether new
  work may be created there (a primary creates by default); `intake` how a
  secondary tracker's items reach the vault's queue (vault-storage D109,
  2026-09-30): `none`, `reflect` (as items with the thread's `source:` under
  `## Active`, fleet-status's shape and the default when nothing is declared),
  or `triage` (the same items under `## Inbox`, where you accept one into
  Backlog or Active with `queue-items.mjs move`, or archive it with
  `--reason rejected`; a primary outside the vault takes none, since the
  vault records only the item in flight); `write` the fields the vault may
  write back (empty means read-only); `url` where a person opens it (derived
  for GitHub).
  Declare it with `vault_patch_fm` on the queue, never by rewriting the note;
  `queue-items.mjs trackers <project>` and a resume read it back, validated
  by `trackers.mjs` with malformed entries named in `problems`, and the server
  reads only each entry's `kind`, `ref`, and `url` to resolve links
  (vault-storage 11d-2c).
- **Relations are typed edges, declared at write time** (vault-storage D92,
  2026-09-28). The author knows the note's point best, so a write says what
  the note relates to and how, in the frontmatter's `edges:` map:
  `edges: {"topics/foo": "derived-from", "projects/x/decisions": "applies-to"}`,
  a wikilink target as the body would write it to one of the seven types plus
  the `basis-for` alias (the table in `/vault-review-edges` § Judgment, each
  defined by its established equivalent: `supersedes`, `revises`,
  `derived-from`, `basis-for`, `cites`, `applies-to`, `contradicts`,
  `related-to`; vault-storage D94 dropped `caused-by`, `fixed-by`, and
  `rejected-because`, which the server still accepts as `cites`). The server stores each entry as an edge whether or not the
  body links the target, so the map is the declaration, not only an override
  of a body link's default `cites`; `related:` stays for "related, no
  stronger claim". A type outside the vocabulary is a 400 `invalid_enum_value`
  naming the value, the target, and the vocabulary. Write with `strict_edges: true` beside
  `strict_tags: true`: a target that resolves to no note is then a 409
  `unresolved_edges` carrying `details.unresolved`, and nothing is written;
  without it the write lands and the answer carries `unresolved_edges`.
  Check a target with `vault_read_meta` or `/resolve?wikilink=` when unsure
  of its path.
- **A ticket is named by a short reference, and anything else outside the
  vault by its URL** (vault-storage D97, 2026-09-29). In a note under
  `projects/<name>/`, `#233` is issue or pull request 233 of the project's
  GitHub repository: the `github` entry of its `trackers:`, else the
  repository its stored baseline `projects/<name>/data/github.json` names. `owner/repo#233` names another repository,
  from any note. A key such as `ENG-123` is a Linear or Jira ticket when the
  project's `trackers:` declares that key with a `url`. The note page links
  each one, with the ticket's title as the link text when the stored GitHub
  baseline has it, so write the bare reference and never a markdown link
  around it. Reading a note, expand a reference the same way, from the
  `trackers` block of the resume bundle. A design, an error, or a chat thread
  goes in as a markdown link whose text says what it is; the per-tool notes
  under `projects/vault-storage/integrations/` say which of the vendor's
  tools reads it and what to record.
- **A Backlog plan is re-derived by supersession, and the new plan carries
  only what is open** (vault-storage D537, question 181, 2026-10-29). A
  project that works its Backlog from a plan note under
  `projects/<name>/plans/` re-clusters it at a cluster boundary, on a new
  direction, or when the user asks, and replaces it with `vault_supersede`,
  so every earlier order stays in the archive and links keep reaching the
  current plan (the plan's own rules name the archive slot). The new plan
  carries its rules for continuing and ordering, the rulings in force with
  what would reopen each, the postponed items, the clusters and the arcs not
  yet done, the open questions, and a state line for each live arc. It
  leaves in the superseded plan the answered questions, every done arc's
  account, and the state log, and names that plan once, beside the open
  questions. A question whose answer still governs carries forward as a
  ruling, one line with its number, and the question and its options stay
  behind.
  An arc is live until it is done: shipped, checked on the host where it
  deploys, and its items archived. Numbers and labels continue from the old
  plan, so question 181 or arc 3c names the same thing in both. Measured on
  vault-storage's plan, 2026-10-29: 148 answered questions held 157 KB of
  its 343, and the 2 open ones 3 KB.
