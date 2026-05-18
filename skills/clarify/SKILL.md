---
name: clarify
description: Drain the agent-workflow clarify-queue interactively — walk pending ambiguous findings from past `/reflect` runs and resolve each via Q&A. Use when the user invokes /clarify, asks to clean up pending agent-workflow clarifications, or wants to convert ambiguous signals into concrete rules. Backed by `projects/agent-workflow/clarify-queue.md` in the vault + `AskUserQuestion`. Companion to `/reflect`.
user_invocable: true
---

# /clarify — drain the agent-workflow clarification queue

Walks pending items in `projects/agent-workflow/clarify-queue.md` interactively. Each item carries a question, transcript refs, and candidate interpretations filed by `/reflect`. The user picks (or supplies an alternative), and the chosen interpretation gets promoted to the right destination — or the item gets rejected as a false positive.

Resolved items move to `projects/agent-workflow/clarify-queue-archive.md` so the live queue stays focused on outstanding work.

## Invocation

```
/clarify                # walk up to 5 pending items
/clarify --limit=N      # walk up to N items
/clarify --id=Q-XXX     # walk one specific item
/clarify --all          # walk every pending item (no cap)
```

Manual cadence — no scheduling. Run when there's 10–15 minutes of focus available.

## Procedure

1. **Read the queue.** Fetch via vault-curl:

   ```bash
   vault-curl /vault/projects/agent-workflow/clarify-queue.md -s
   ```

   404 → the agent-workflow scaffolding is missing. Stop and tell the user. Don't auto-create.

2. **Parse pending items.** Each item under `## Pending` has the shape:

   ```markdown
   ### Q-YYYY-MM-DD-NNN
   - **Created:** YYYY-MM-DD
   - **Source:** {transcript ref}
   - **Question:** {the open question}
   - **Candidates:** a) ..., b) ..., c) ...
   ```

   Iterate top-to-bottom (oldest first). If `--id=Q-XXX`, jump to that one. Stop after `--limit=N` items (default 5) unless `--all`.

3. **Walk each item interactively.** For each item:

   a. Surface the question, source ref, and any transcript excerpt the source ref points to (use Read or vault-curl as needed).

   b. Use `AskUserQuestion` with the candidate interpretations as options, plus "Reject as false positive" and "Defer" — let the user pick (or supply "Other" with a free-form interpretation).

      ```
      AskUserQuestion({
        question: "{the question from the Q entry}",
        header: "Clarify Q-{id}",
        options: [
          {label: "{candidate a}", description: "{what this means / where it routes}"},
          {label: "{candidate b}", description: "{...}"},
          {label: "Reject as false positive", description: "Not a real pattern — discard."},
          {label: "Defer", description: "Leave in queue for next session."},
        ],
        multiSelect: false,
      })
      ```

   c. **Route based on the answer:**

      | Answer | Action |
      | --- | --- |
      | A specific interpretation | Promote per the routing table below; write the artifact; archive the Q-item. |
      | Reject as false positive | Archive the Q-item with a `Rejected:` annotation. |
      | Defer | Skip — leave in `## Pending`. |
      | Other (free-form) | Treat the user's text as the authoritative interpretation; ask a follow-up if needed for routing; then promote + archive. |

4. **Routing table** (same as `/reflect`):

   | Promoted as | Destination |
   | --- | --- |
   | Single-project feedback rule | vault `projects/<name>/feedback.md` (append section) |
   | Cross-project rule | claude-config `~/Open/claude-config/CLAUDE.md` (append section) |
   | Workflow improvement (skill / hook / queue item) | vault `projects/agent-workflow/queue.md` Backlog |
   | Vault topic note | vault `topics/<slug>.md` (new note, born-enriched per `/vault ingest` step 5) |
   | Code fix in a real project | that project's vault `queue.md` Backlog |

5. **Archive resolved items.** After promotion (or rejection), move the Q-item from `## Pending` in `clarify-queue.md` to `## Resolved` in `clarify-queue-archive.md`. Append an annotation:

   ```markdown
   ### Q-YYYY-MM-DD-NNN
   - **Resolved:** YYYY-MM-DD via /clarify
   - **Outcome:** {Promoted to <path> | Rejected: <reason>}
   - **Question:** {original question}
   ```

   Workflow:
   - Read `clarify-queue.md`.
   - Remove the item block.
   - PUT updated `clarify-queue.md`.
   - Read `clarify-queue-archive.md` (or initialize if not present — see step 6).
   - Append the annotated block under `## Resolved`.
   - PUT updated `clarify-queue-archive.md`.

   Batch all moves to one PUT per file if multiple items are resolved in the same session.

6. **Initialize `clarify-queue-archive.md` on first archive.** If the file doesn't exist:

   ```yaml
   ---
   title: agent-workflow — Clarification queue archive
   tags: [agent, workflow, claude-code, clarify, archive]
   created: YYYY-MM-DD
   updated: YYYY-MM-DD
   status: archive
   type: project
   related:
     - "[[projects/agent-workflow/clarify-queue]]"
   ---
   ```

   Body starts with `## Resolved` and grows append-only.

7. **Summarize at the end.** Single block:

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
- Less than 10 min available — `AskUserQuestion` per item adds up. Don't start unless there's time to finish at least 3 items.
- Mid-flight on another task — clarify deserves focus. Hand it off as "let's clarify-queue once we're done with X."

## Limitations

- **Free-form "Other" answers require follow-up.** The user might supply a phrase the skill can't auto-route. In that case, ask one follow-up: "should this become a global rule, a project rule, or a queue item?"
- **No batch-route — each item is one decision.** This is intentional; the point of clarify is that the rules can't be auto-applied. Volume should stay low if `/reflect` is conservative about what it files here.
