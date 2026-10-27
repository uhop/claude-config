# Triage brief: one shard of `{{NOTE}}`

Read-only research task. Write nothing to the vault, to any repository, or anywhere except (a) your own scratch directory, made with `mktemp -d` (never a fixed name in a shared scratchpad, never `cd` into it), and (b) the one output file your prompt names.

## Why

`{{NOTE}}` ({{SIZE_KB}} KB, {{COUNT}} {{UNIT}}s, mode `{{MODE}}`) is being reorganized because it passed its size bound: no vault note may grow without bound (Eugene, 2026-10-27). The lessons still live become a small **current view**, one piece per subject, and everything else is archived whole, read-only and still searchable. Your shard decides what the current view keeps. A live lesson you miss drops out of every session's reading; a dead one you keep bloats the view. When torn, keep it as E.

## Classes, one per bullet (a {{UNIT}}'s prose paragraphs count as bullets)

- **A, promoted:** the lesson lives in a place a session reads (the first list below). Cite the file and the heading or line.
- **A_weak, half-promoted:** its only other home is in the second list below. Keep it, and name that home.
- **B, obsolete:** the code, tool version, setup, or state it describes no longer holds (file gone, function rewritten, bug fixed, timings on an old setup). Cite the evidence: a `git log` line, a missing path, the current code.
- **C, narrative:** what a session did, whose reusable content is already in its decision entry, or no reusable lesson at all. In piece mode, a lesson another piece of the same folder already carries is also C: name that piece.
- **D, live:** still true today and recorded nowhere in the first or second list. Before calling a bullet D, run `mcp__vault__vault_search` in `semantic` mode with its gist (load it with ToolSearch `select:mcp__vault__vault_search`) and grep the snapshot; a hit that carries the lesson makes it A or A_weak.
- **E, unsure:** you cannot tell within reasonable effort. Say what would settle it, starting "Settle by …" or "Settled when …".

## Where a lesson counts as saved

1. **Read by sessions (A):** the project's `AGENTS.md` and the guides it points at, the project's skills (`{{REPO}}/skills/`), the vault's `projects/{{PROJECT}}/feedback.md`, the global `~/Open/claude-config/CLAUDE.md`, a skill under `~/Open/claude-config/skills/`, a skill a dependency ships (`node_modules/<pkg>/skills/`), a vault `topics/` note, and `projects/agent-workflow/feedback.md`.
2. **Half-saved (A_weak):** a vault corpus note (`projects/{{PROJECT}}/corpus/`), a dated measurement report (`dev-docs/measurements/*`), a code comment, or a test name.
3. **Not a home at all:** the project's `decisions.md`, its `queue.md` and `queue-archive.md`, plan notes, research notes, reflect reports, any other learnings note, and `{{NOTE}}` itself (the snapshot leaves it out). A lesson whose only copies are here is C when its decision entry tells it, else D.

## Where to look (all reads)

- The snapshot of the notes above, taken when the shards were cut: `{{REF}}/` (`topics/`, `projects/{{PROJECT}}/`, `projects/agent-workflow/feedback.md`). Grep it; it is shared, so never write into it.
- The repository: `{{REPO}}` (exclude `node_modules` except its `skills/`, and large generated JSON); `git -C {{REPO}} log`.
- `~/Open/claude-config/CLAUDE.md` and `~/Open/claude-config/skills/`.
- Live vault reads through `mcp__vault__*` when the snapshot may be stale; `decisions.md` by search or section, never whole.

Spend about the same effort on each {{UNIT}}, more on a candidate D, never more than a few minutes on one.

## Pass

Your prompt says **light** or **full**. Both read every bullet. A light pass cites evidence only for the bullets it keeps (D, A_weak, E) and estimates the other classes' bytes; a full pass cites evidence for every bullet and measures every class's bytes exactly.

## Output: one JSON file, exactly this shape

```json
{
  "shard": "<name>",
  "sections": 0,
  "bullets": 0,
  "counts": {"A": 0, "A_weak": 0, "B": 0, "C": 0, "D": 0, "E": 0},
  "bytes": {"A": 0, "A_weak": 0, "B": 0, "C": 0, "D": 0, "E": 0},
  "keep": [
    {
      "n": 0,
      "date": "YYYY-MM-DD",
      "class": "D | A_weak | E",
      "subject": "<kebab-case subject>",
      "text": "<the lesson in one tight paragraph, at most 600 characters, concrete identifiers kept>",
      "evidence": "<D: the search you ran and found nothing, the code that still behaves so; A_weak: \"Only home: <where>\"; E: what would settle it>"
    }
  ],
  "defects": ["<a defect in code or docs you noticed, with file:line, report only>"]
}
```

- `sections` is the number of {{UNIT}}s in your shard; `n` is the number in its `=== {{UNIT}} n ===` header (one keep item per lesson; bullets teaching the same lesson share one item, the others named in `evidence`).
- `subject` names what a session working on that part of the project would look for; reuse the subjects you have already used, and keep them few (about a dozen across the whole note). Examples from the first run: `measurement-method`, `harvester`, `gate-and-ledger`, `tooling-and-shell`, `analysis-and-review`.
- Write `text` in plain present-tense English, as a rule a later session can act on.
- Validate the file with `node -e "JSON.parse(require('fs').readFileSync(process.argv[1]))" <file>` before you finish, and check that `counts` sum to `bullets`.

Your final reply: the output path, the counts line, the number of `keep` items, and at most three lines on anything you could not do. Mark each claim checked (with where) or guessed.
