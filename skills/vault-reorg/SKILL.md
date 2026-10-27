---
name: vault-reorg
description: "Reorganize a vault rolling note of lessons that passed its size bound: read-only triage agents classify every bullet against the places a session reads, the live and half-saved lessons become a folder of subject pieces (the current view), and the whole old note is superseded into the archive with its record id kept. Also re-triages one folder piece past its bound. Mechanical work (measuring sizes, cutting shards, the brief, the reference snapshot, merging the agents' results, building and writing the pieces, the claim, the supersede, verification) runs through the bundled `reorg-batch.mjs`; the skill is the judgment layer: the dispatch, the plan, and the summaries. Use when the user says /vault-reorg <path>, when `reorg-batch measure` lists a note over its bound, or when a note's size comes up. Asks before dispatching, since a first reorganization costs millions of agent tokens."
user_invocable: true
---

# Vault — reorganize a note past its size bound

No vault note grows without bound. Eugene, 2026-10-27: _"We should not have unbounded documents in the vault --- we should always have a policy of how to keep it manageable. An document with a million points is useless to us --- it is absolutely unactionable."_ and, the same evening, _"IMHO, a big size should trigger a reorg."_ The bound itself is older: vault-storage's design constraint C7 (2026-04-27) says no append-only file grows without bound. This skill is the reorganization, built from the first run: apodict's 709 KB `learnings.md` became twelve subject pieces of 222 lessons, 98 KB, with the old note archived whole ([[projects/vault-storage/queue]] § Bound the rolling notes holds the numbers).

A reorganization keeps what a session needs and archives the rest:

- **Current view:** a folder `projects/<name>/<note>/` of subject pieces, each a bullet list of lessons still live, each lesson citing its source in the archive. The piece listing with its summaries is the table of contents, and a session reads only the piece its work needs.
- **Archive:** the whole old note, superseded to `projects/<name>/archive/<YYYY>/<note>.md`, read-only, record id kept, still searchable.

## When to run

- **`reorg-batch measure`** lists every live project note over C7's 50 KB and every folder piece over 20 KB. A note of lessons (a `learnings` note or a piece of one) gets a token estimate; any other note is marked "not lessons, not handled" (§ Scope). It is the size trigger until the server files one.
- **On request**, `/vault-reorg <path>`.
- **Not from `/vault sweep` yet.** The server files no size suggestion today (the item on [[projects/vault-storage/queue]] § Bound the rolling notes proposes it). Once it does, the sweep surfaces the suggestion and this skill runs on Eugene's word, never by itself (§ Cost).

## Scope

- **Notes of lessons:** `learnings.md` and notes like it, where each bullet is a reusable lesson. That is what the brief's classes judge.
- **Not handled: records.** A decision log, a queue archive, or a handoff archive is a record of what happened. Its live part is the rulings in force, and judging that needs other classes (in force, superseded by a later decision, history). Name such a note in the report when `measure` lists it; do not run this skill on it.
- **Two modes**, which `prepare` picks itself: **note mode** turns a flat note into a folder; **piece mode** re-triages one piece of such a folder past its bound and supersedes it in place. Piece mode is written and unit-tested but has not run on a real piece yet: read its output closely the first time.

## Cost — ask before dispatching

Measured on 2026-10-27: six agents spent about 2.3M tokens and 27 minutes of wall time on 697 KB of bullets, about 3.3K tokens per KB. One shard of about 110 KB costs 350K to 450K tokens and about 25 minutes, and the shards run in parallel. So a first reorganization of a large note costs millions of tokens, while a 20 KB piece's re-triage costs about 65K.

`prepare` prints the estimate. Put it to Eugene, with the note and its size, in the message before the dispatch, and dispatch on his word. A size suggestion never starts the agents by itself, and a sweep never runs this without that word. Report the cost afterwards against the estimate, a regression as its number.

## Procedure

```bash
R=~/.claude/skills/vault-reorg/reorg-batch.mjs
"$R" measure                         # what is over its bound
"$R" prepare projects/<name>/learnings.md   # prints dir, shards, estimate; --full for exact shares
```

1. **Prepare.** `prepare` reads the note, cuts it into units (each `##` section and the block before the first; in piece mode each bullet), cuts the units into shards of about 110 KB, writes `brief.md` from this skill's template, and mirrors the notes a session reads (`topics/`, the project's notes, agent-workflow's feedback; never the target, never an archive) into `<dir>/ref/` for the agents to grep. Check that the reference snapshot's `written` equals its `planned`. The pass is **light** by default: every bullet is read and only the kept ones get evidence. Use `--full` when the report needs exact class shares.
2. **Ask** with the estimate, as above.
3. **Dispatch** one `general-purpose` agent per shard, all in one message, each with this prompt (fill the bracketed values from `prepare`'s output):

   ```
   Read the brief at <dir>/brief.md and follow it exactly.
   Your shard: <dir>/shards/<name>.md (<units> <unit>s, <range>, <kb> KB). Shard name: <name>.
   Output file: <dir>/out/<name>.json. Pass: <light | full>.
   ```

   Say the estimate and the elapsed time in the dispatching message. The agents write nothing outside their scratch and their output file. When all are back, probe the agent registry (`TaskStop` with id `x`) before going on.

4. **Merge.** `"$R" merge --dir=<dir>` checks every result (the counts sum to the bullets, each kept item has a class, a subject, and a text of at most 600 characters), prints the class table, the kept items by subject, and the defects the agents reported, and writes `keep-read.txt`. A shard's prose is a claim; its JSON is the evidence.
5. **Plan.** Read `keep-read.txt` whole, then write `plan.json`:
   - **Merge duplicates** across shards: `merges: [{"drop": 20, "into": 19}]`; the dropped item's source joins its partner's citation. `texts: {"3": "…"}` rewrites an item, as when a merge needs both halves of a lesson.
   - **One piece per subject.** Move a stray `other` item to its nearest subject; split a subject past 20 KB in two by what a session would look for (the first run split measurement into setup and reading results).
   - **Each piece:** `name` (kebab-case, the file name), `title`, `tags` (checked with `vault_tag_nearest`; the write refuses an unknown tag), `summary` (the rolling form of `/vault-enrich-all` § Generate enrichment fields: what the piece holds and its span, under 3,000 characters), `key_concepts` (three to five), and `items` (the ids).
   - **Note mode's `about`:** `title`, `tags`, `related`, `summary`, `key_concepts`, and `body_file`, a Markdown file in `<dir>` for the folder's `_about.md`. Its body opens with ``Atomized from `<path>` on <date>``, which is how the server knows the folder composes a note; it says how to read the folder (`vault_list_pieces({file_prefix: "<folder>/", fields: "file_path,agent_summary"})`), states the bound (a piece past about 20 KB is triaged again; a new lesson goes into its subject's piece; a promoted or obsolete lesson leaves it), and records how the old note sorted. It never carries a `> Supersedes` footer: the server appends one.

   ```json
   {
     "about": {"title": "x — Learnings", "tags": ["x", "learnings"], "related": ["[[projects/x/decisions]]"],
               "summary": "…", "key_concepts": ["…"], "body_file": "about.md"},
     "pieces": [{"name": "harvester", "title": "x learnings: Harvester", "tags": ["x", "learnings", "harvester"],
                 "summary": "…", "key_concepts": ["…"], "items": [6, 7, 17]}],
     "merges": [{"drop": 20, "into": 19}],
     "texts": {"3": "…"}
   }
   ```

6. **Build.** `"$R" build --dir=<dir> --plan=<dir>/plan.json` refuses an item placed twice or nowhere and prints each piece's size; read the pieces in `<dir>/pieces/` before writing.
7. **Write.** First check that no other session of the project is about to append to the note (its `sessions.md` and `ListAgents`; a work claim stops another pass, never an append). Then `"$R" write --dir=<dir> --plan=<dir>/plan.json --holder=<host>/<session-prefix> --dry-run`, then without `--dry-run`. It claims the note (purpose `compact`), supersedes it (note mode: by the folder's `_about.md`; piece mode: in place), writes the pieces with `strict_tags`, confirms the folder summary against the composed note through `enrich-batch` (note mode; in piece mode the sweep refreshes it), releases the claim, and prints a verification: the composed view, the record count, the summaries, the wikilink's resolution, and lint. A lint finding of `records_without_embeddings` is the embedder catching up and clears in a minute. If `write` fails after the supersede, the old note is already archived and its path is gone, so never run `write` again: its message names what landed, put each missing piece by hand (`vault-put.mjs <path> --fm <name>.fm.json --body <name>.md` from `<dir>/pieces/`), then confirm the folder summary and verify as `write` would.
8. **Report and file.** The class table, the sizes before and after, and the cost against the estimate. File the defects the agents reported on the queues they belong to, and the half-saved and unsure lessons as one promotion item on the project's queue: a half-saved lesson stays in the view until it is promoted to `AGENTS.md`, a skill, a topic, or `feedback.md`.

## What to know

- **A date cut is not safe.** The first run's 40-section sample suggested the old sections held almost nothing live; the full read found a sixth of their bytes live. Read bullet by bullet.
- **The composed view carries `_about.md`'s frontmatter, never its body,** and composes only the pieces directly inside the folder, by `sequence_key` and then file name (vault-storage `src/records/compose.ts`, and `src/store/postgres.ts` for the hosted engine). A piece archived under `<folder>/archive/` stays out of the view, and a session reads the policy in `_about.md` itself.
- **`/vault learn` writes a new lesson to its subject piece** of a folder note (the vault skill, step 4); an append to the composed `learnings.md` is refused.
- **Piece mode** keeps each kept bullet's own citation and drops its old half-saved or unsure note for the new one; the plan must name a piece with the old piece's name, which takes the old path.
