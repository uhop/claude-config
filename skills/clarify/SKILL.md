---
name: clarify
description: Drain the agent-workflow clarify-queue interactively — walk pending ambiguous findings from past `/reflect` runs and resolve each via Q&A. Use when the user invokes /clarify, asks to clean up pending agent-workflow clarifications, or wants to convert ambiguous signals into concrete rules. Backed by `projects/agent-workflow/clarify-queue.md` in the vault + `AskUserQuestion`. Companion to `/reflect`.
user_invocable: true
---

# /clarify — drain the agent-workflow clarification queue

Walks pending items in `projects/agent-workflow/clarify-queue.md` interactively, **one item per turn, as a conversation**. Each item carries a question, a source moment, and candidate interpretations filed by `/reflect` or hung from its `--apply` walk. The context comes first, the user can go deeper, ask for an example, or have it researched, and only then picks (or supplies an alternative); the chosen interpretation gets promoted to the right destination — or the item gets rejected as a false positive, or hung again. (Eugene, 2026-09-15: *"sometimes I don't recognize the context and need it and more discussions/examples on it"* — [[projects/agent-workflow/feedback]] § A question carries its context and can be hung.)

Resolved items move to `projects/agent-workflow/clarify-queue-archive.md` so the live queue stays focused on outstanding work.

## Invocation

```
/clarify                # walk up to 5 pending items
/clarify --limit=N      # walk up to N items
/clarify --id=Q-XXX     # walk one specific item
/clarify --all          # walk every pending item (no cap)
```

Manual cadence — no scheduling. One item per turn, so there is no minimum sitting; stop whenever.

The helper also files: `clarify-queue.mjs file --question="…?" --context=@ctx.md --candidates=@cands.md --source="…"` allocates the id and appends the block in the shape the parser reads (`--dry-run` to preview). `/reflect` step 7 and its "Hang it" option use it.

## Procedure

1. **List pending items** via the bundled helper:

   ```bash
   ~/.claude/skills/clarify/clarify-queue.mjs list   # {pending, items: [{id, body}]}
   ```

   Each item's body carries Created / Source / Question / Candidates lines.
   A GET 404 on the queue → the agent-workflow scaffolding is missing:
   stop and tell the user, don't auto-create. Iterate top-to-bottom
   (oldest first); `--id=Q-XXX` jumps to one; stop after `--limit=N`
   (default 5) unless `--all`.

2. **Walk each item as a conversation, one per turn.** For each item:

   a. **Context first, in chat.** The item's Question and Context lines, then the source moment rendered in human time: `~/.claude/skills/reflect/reflect-context.mjs --project=<dir> --session=<id prefix> --at=<ts>` from the Source line (his words and the reply that followed). For a vault-path source, `mcp__vault__vault_read_file` (fall back to `vault-curl /vault/<path> -s`). Name the session by its subject and day, never by its id.

   b. **Offer the moves in prose, and take them before any options form:** *go deeper* (widen `--before`/`--after`, re-explain in plain words what the agent did and what he said), *show an example* (a concrete before/after under each candidate), *research it* (a lookup, or a sub-agent for anything longer), or *hang it again* (leave it pending). Ask the form only when he asks for it or picks a candidate outright.

   c. **The form**, with each candidate's example in its `preview`:

      ```
      AskUserQuestion({
        question: "{the question from the Q entry}",
        header: "Clarify Q-{id}",
        options: [
          {label: "{candidate a}", description: "{what this means / where it routes}", preview: "{the example}"},
          {label: "{candidate b}", description: "{...}", preview: "{...}"},
          {label: "Reject as false positive", description: "Not a real pattern — discard."},
          {label: "Hang it", description: "Leave it pending; pick it up with more discussion later."},
        ],
        multiSelect: false,
      })
      ```

   d. **Route based on the answer:**

      | Answer | Action |
      | --- | --- |
      | A specific interpretation | Promote per the routing table below; write the artifact; archive the Q-item. |
      | Reject as false positive | Archive the Q-item with a `Rejected:` annotation. |
      | Hang it (Defer) | Skip — leave in `## Pending`; add a `- **Note:**` line to the block if the discussion produced one. |
      | Other (free-form) | Treat the user's text as the authoritative interpretation; ask a follow-up if needed for routing; then promote + archive. |

3. **Routing table** (same as `/reflect`):

   | Promoted as | Destination |
   | --- | --- |
   | Single-project feedback rule | vault `projects/<name>/feedback.md` (append section) |
   | Cross-project rule | claude-config `~/Open/claude-config/CLAUDE.md` (append section) |
   | Workflow improvement (skill / hook / queue item) | vault `projects/agent-workflow/queue.md` Backlog |
   | Vault topic note | vault `topics/<slug>.md` (new note, born-enriched per `/vault ingest` step 5) |
   | Code fix in a real project | that project's vault `queue.md` Backlog |

4. **Archive resolved items** — one helper call per settled item:

   ```bash
   ~/.claude/skills/clarify/clarify-queue.mjs archive Q-YYYY-MM-DD-NNN \
     --resolution="Promoted to <path> — <one line>"        # add --rejected for false positives
   ```

   The helper moves the block from `## Pending` to the archive's
   `## Resolved` with a dated annotation, initializes
   `clarify-queue-archive.md` on first use, writes archive-first (a
   mid-move failure duplicates, never loses), rides `If-Match` on both
   files (412 → re-run), and leaves `(empty)` when the last item goes.

5. **Summarize at the end.** Single block:

   ```
   Clarify session — YYYY-MM-DD
   Walked: N items
   Promoted: P (→ destinations)
   Rejected: R
   Deferred: D
   Pending after: P_remaining
   ```

## When NOT to use

- Queue is empty (`## Pending` has `(empty)` or no `### Q-` blocks). Just say so and stop.
- Mid-flight on another task — clarify deserves focus. Hand it off as "let's clarify-queue once we're done with X." One item per turn means there is no minimum sitting; stopping after one is fine.

## Limitations

- **Free-form "Other" answers require follow-up.** The user might supply a phrase the skill can't auto-route. In that case, ask one follow-up: "should this become a global rule, a project rule, or a queue item?"
- **No batch-route — each item is one decision.** This is intentional; the point of clarify is that the rules can't be auto-applied. Volume should stay low if `/reflect` is conservative about what it files here.
