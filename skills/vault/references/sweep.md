# The sweep

Part of the vault skill: the table in its `SKILL.md` says which file holds a section named here.

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
| **`type: log` records past 90 days** — settled policy, not a judgment ([[topics/vault-hygiene-policy]], ruled 2026-07-31). Their own `archive_candidate` suggestions are always skipped (below), so this one-shot is the only thing that drains them. Called optionally: a server predating the route answers 404 and the sweep records `{skipped: "route_absent"}` rather than aborting, since the vault server is a singleton that any host's sweep may be newer than. | `POST /maintenance/expire-logs` (deletes from disk + DB; `dry_run=1` previews) |
| **coverage**: enrichable knowledge notes with **no `agent:` block** — canonical source is `vault-storage`'s `GET /system/lint` → `coverage.enrichment` (`ENRICHABLE_TYPES` = `permanent`/`project`/`design`/`research`/`query`; the headline already excludes operational types, empty bodies, and archived). Read the count there; `/vault-enrich-all` § Enrichable set drives the enumeration. *Not* a suggestion kind, so invisible to `/suggestions/summary`. | `/vault-enrich-all --auto --limit=100` (backfill missing) |
| `suggestions.agent_enrichment_stale` | `/vault-enrich-all --auto --stale --limit=100` (refresh drifted) |
| `lint.oversized_summaries` — a summary past the lint's bound reads current, so the stale pass never sees it; the lint lists the ten longest a read (filed 2026-10-28) | `/vault-enrich-all --auto --refresh --outline --records=<file>` (restate in the rolling form from the note's headings, never its megabytes of body) |
| `suggestions.new_tag` | `/vault-review-tags --auto --limit=100` |
| `suggestions.tag_suggestion` | `/vault-review-tags --auto --kind=tag_suggestion --limit=100` |
| `suggestions.edge_type` — only reopened rows since vault-storage D76: a default-cites link is filed already rejected as `default-cites`, so this stage is normally empty | `/vault-review-edges --auto --limit=100` |
| `suggestions.duplicate` | `/vault-review-duplicates --auto --limit=100` (merges via supersede — archival, never delete) |
| `suggestions.compaction_candidate` | `/vault-compact <folder>` per candidate (originals archived) |
| `suggestions.inefficiency_detected` + `infrastructure_upgrade` | `/vault-review-reports --auto` (verify against live data → reject-by-design / accept + queue item; migrate-tier left pending for the user) |

#### Always skipped

- `raw_inbox.ready` — `/vault ingest` is a separate workflow; the user
  flips `ready: true` when a draft is finished, not the sweep.
- `suggestions.archive_candidate` — per-record retention judgment.
  **Logs are the exception, and they are handled elsewhere**: the same
  kind carries two policies, "a human decides about this query or raw
  note" and "the 2026-07-31 ruling already decided about this log". The
  skip is right for the first and wrong for the second, so log expiry
  moved to the `expire-logs` one-shot above rather than into this queue —
  a suggestion is a request for a decision, and that one is made. Leaving
  it here is what gave the queue a permanent pending floor (measured
  2026-09-01: five pending, four of them logs).
- **What a split cannot cut, and `/vault-reorg`.** Lint's advisory
  `size_bound` lists every note past its bound with its role and remedy
  (vault-storage 3k), the list the dashboard and `reorg-batch measure` show
  too. The sweep splits and regroups what `vault_split` can cut (§ Procedure,
  step 0). The rest is a person's: a single section past the bound, a piece
  with no `##` heading, and a record's piece, whose remedy says "by hand"; and
  `/vault-reorg`, which curates lessons at millions of agent tokens and runs on
  Eugene's word (2026-10-27, Eugene: _"a big size should trigger a reorg"_;
  `measure` prices it). The done report lists each note still under
  `size_bound`: name them in the summary.

#### Ordering constraints

Some kinds mutate state that other kinds read. Process them in declared
order; never dispatch two ordered kinds as parallel sub-agents.

- **Enrichment before the tag and edge passes.** The enrichment passes
  (the missing-block backfill `/vault-enrich-all --auto --limit=100`, the
  `--stale` refresh, and the `--refresh` of oversized summaries) write `agent:`
  blocks, and a freshly written block makes
  the server file new `tag_suggestion` (from `agent.tags_suggested`),
  sometimes `new_tag` (an unknown suggested tag), and can feed `edge_type`
  (from `agent.edge_classifications`). Run **the enrichment passes first**,
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

1. enrichment backfill ∥ `--stale` refresh ∥ oversized `--refresh`
   (backfill is disjoint from the others by definition, no `agent:` block;
   a note both stale and oversized goes to whichever agent claims it first,
   and the other skips it as held)
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
`POST /suggestions/resolve-batch` with the `claim_token` the claim
returned — the reservation makes the batches disjoint by construction,
and it also de-conflicts overlapping sweeps from separate sessions.
Skipped items are released with `reopen`, passing the same token, since
the server refuses a release from anyone else (or they lapse at the
claim TTL, default 30 min). `vault-triage.mjs` keeps the token in its
worksheet; the holder name settles nothing (vault-storage D67). On a pre-claim server the old rule stands: never two
same-kind triage agents — they pull the same queue head and duplicate
or contradict each other's decisions. Enrichment shards by explicit
worklist chunks instead, and each agent's `enrich-batch prepare` takes a
batch of note leases on its chunk under the plan's `holder` (§ Note leases), so a
second sweep or an ingest running beside this one leaves those notes
alone. Label every concurrent dispatch with its kind so a failed pass
attributes cleanly.

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

0. **Split and regroup, before `begin`** (vault-storage questions 178 and
   270 to 274, D622, D624), so the sweep's enrichment covers the pieces this
   step writes. Read lint's two advisory lists:
   `vault-curl /system/lint -s | jq '{size_bound: .checks.size_bound.samples, ungrouped_pieces: .checks.ungrouped_pieces.samples}'`.
   The work, one `vault-sweep` agent per note, in parallel:
   - **A whole note past its bound** (`remedy` exactly `vault_split`): read
     its `##` headings with their sizes, name topics, and split it with
     `topics`. A `decisions.md` splits with no topics, one note per decision.
   - **A piece past its bound** (`remedy` `vault_split with topics and pieces
     ["<name>"] on <note>`): read that piece alone, name two or more topics
     covering its sections, and regroup the note with `topics` and that
     `pieces` list.
   - **Appended pieces** (`ungrouped_pieces`, its `names` the appended
     pieces; lint leaves out a record's folder): read each appended piece and
     the topic pieces' titles (`vault_list_pieces` with `file_prefix` the
     folder and `exclude: "body"`), pick the topic each joins, or a new topic
     where none fits, read those topic pieces' `##` headings, and regroup with
     `topics` naming each topic's own sections plus the ones joining it, and
     `pieces` naming the appended pieces and those topic pieces. Never list
     the folder's other pieces: they stay as they are.

   The brief for every agent:
   - Topics group whole sections a session reads together, each under 20 KB,
     every section of the pieces named once, by its number from 0 where
     headings repeat. Keep each existing topic's name: a topic keeps the piece
     holding most of its text whatever its name, so a new name changes only
     the title.
   - Read the note's composed view with `vault_read_file` and `include_etag`
     for the etag, and send `vault_split` with `expected_etag`. An adapter
     without the tool (0.19.0 and before) takes the route instead:
     `vault-curl /vault/split -X POST -H 'Content-Type: application/json' -H 'If-Match: <etag>' --data-binary '{"path": "<note>", "topics": [...], "pieces": [...]}'`.
     On a 412 the note changed: read it again and retry once. Never
     `vault_join` a note to regroup it: a join deletes every piece, with its
     record, history, and summary (vault-storage question 272).
   - Report the answer's `pieces`, `removed`, and `oversized`. A section
     past 20 KB by itself stays in `oversized`, for a person.

   In the final summary, name each note split or regrouped and each piece a
   regroup removed, since a removed piece's own summary went with it.
1. **`begin`** computes the action set, runs the one-shot endpoints
   itself (`cleanup-lint` ∥ `embed-pending` ∥ `expire-logs` ∥ `gc-tags`,
   the last deleting taxonomy tags no note carries unless `manual`,
   vault-storage D77; then `check-edges`, which reads every note, compares
   its stored links and the edges they back with its file, and rebuilds the
   links when they differ, vault-storage D247), and prints
   the first dispatch plan. `begin --dry-run` prints the action set with
   live per-kind counts and stops (no writes, no state) — the one-shots
   do not run there either, so nothing is deleted on a dry run.
2. **Dispatch** every entry in the plan's `dispatch` array as parallel
   sub-agents — one Agent call per agent entry, fired in the same
   message, labeled with the kind, with `subagent_type: "vault-sweep"`
   (`agents/vault-sweep.md`: Sonnet at `medium` effort, no global
   `CLAUDE.md`, no advisor call, a report of five lines at most; a
   `general-purpose` agent inherits the session's `xhigh` effort and the
   advisor, which measured 85–161 s per call on 2026-09-27):
   - `vault-enrich-all` entries: its § Sub-agent mode prompt; pass
     `--records=<records_file>` when the plan sharded the worklist,
     else `--limit=<limit>`; `mode: "stale"` → `--stale`; `mode: "refresh"`
     → `--refresh`, and `outline: true` → `--outline`; and always
     `--holder=<holder>`, the name its note leases go under. The stale
     worklist is always sharded (at most four notes an agent) and frozen at
     `begin`: a note that goes stale mid-sweep waits for the next sweep.
     An `enrich_oversized` entry restates each listed summary from the
     note's outline (`/vault-enrich-all` § Outline items), one note an
     agent: the notes past the lint's bound are the long rolling notes, and
     their bodies run to megabytes (apodict's decisions: 2.48 MB, a 93 KB
     outline).
   - Say the plan's `estimate_s` and the running `elapsed_s` in the message
     that dispatches it.
   - Triage entries (`vault-review-tags` / `-edges` / `-duplicates`):
     the skill's § Sub-agent mode prompt with the plan's `holder` and
     `limit` — the generated holders make concurrent claims disjoint
     by construction.
   - `compaction_candidate`: run `/vault-compact <folder>` per entry
     in the plan's `candidates` list. A `plan` that exits 3 because
     another pass holds a selected piece is a skip, not a failure: name
     the folder and the holder in the summary.
3. **`next`** after all dispatched agents return. The script
   re-measures live, records progress (a count that stopped dropping
   becomes that kind's **stuck floor**; a later count above the floor
   reopens it), advances the § Ordering constraints stage DAG, rolls
   convergence rounds, and prints either the next dispatch plan or the
   final `{status: "done"}` report. A kind whose whole pending set is
   what the last pass released back — skips, defers, merge candidates —
   is floored at once, not after a second dispatch: the triage harness
   leaves a per-holder report naming its `reopened` ids, `next` compares
   them with the kind's pending list, and prints those items under
   `skipped` for the main session to hand-triage (2026-09-06; a second
   pass still runs when the count fell and unskipped items remain). Two
   rounds is the normal fixpoint; `--max-rounds` is a runaway cap, not a
   target.
4. **Final summary** from the done report — `rounds` is the per-round
   before/after convergence trail; `floors`, `residue`, and `skipped`
   (the items a pass declined to judge, by id and payload) name what
   survived and why (`reason`: converged / no_change_round /
   max_rounds); `one_shots` carries the cleanup/embed/expire results —
   **plus the itemized structural mutations collected from the sub-agent
   reports**: each merge as `archived path → survivor`, each compacted
   folder by name, never bare counts. `one_shots.expire_logs` is itemized
   the same way: report every deleted log by path and age, from its
   `logs` array, since a deletion the summary states only as a count is
   the one mutation nobody can reconstruct afterwards. `one_shots.gc_tags`
   likewise: every deleted tag by name from its `tags` array, with its
   origin and aliases. `one_shots.check_edges` likewise when it reports
   `repaired: true`: every note from its `samples` with its `kind`, and the
   `after` counts, which should read zero. This post-hoc itemization is
   what replaced the retired `--include-destructive` pre-commitment
   gate. `lint` is the integrity lint read fresh at the end: when its `ok`
   is false, name every check in `failing` with its count and samples, and
   say the sweep does not drain it, since a converged sweep can leave a
   check that no stage covers (filed 2026-10-28: a sweep converged while
   `oversized_summaries` read 1). An advisory check (`size_bound`, the
   notes past their size bound; `ungrouped_pieces`, the notes with appended
   pieces outside their topics) counts toward neither `ok` nor `failing`;
   the report's own `size_bound` and `ungrouped_pieces` lists name every one,
   what step 0 left. A third advisory list, `small_splits`, names the split
   lessons and current views whose pieces add up to under half their bound:
   name them in the summary, and join none, since whether to `vault_join` one
   is Eugene's call (vault-storage question 273, D623). `begin --dry-run`
   prints the same verdict and lists.

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
