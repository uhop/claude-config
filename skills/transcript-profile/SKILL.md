---
name: transcript-profile
description: Profile agent tool-call patterns by parsing Claude Code session transcripts under `~/.claude/projects/`. Reports per-tool call counts, total wall-time, p50/p95/avg latencies from issue, each call's own cost (the gap from the previous result in its message), and result bytes (what each tool puts into context). Also splits each session into the agent working and the session waiting on the user, with each wait labeled by the kind of stop, and with `--sequences` finds repeated tool-call sequences and the values one call passes to the next. Use when the user asks "what are we doing most often", "what's the slowest tool", "which tool fills the context", "where should we optimize", or invokes /transcript-profile. Source data is the JSONL session logs Claude Code writes locally; no external service.
user_invocable: true
---

# Transcript profile — what the agent spends time on

Walks every `~/.claude/projects/*/*.jsonl` session transcript, pairs each `tool_use` with its `tool_result` by id, and reports aggregate counts, latencies, and result bytes per tool. Answers the user's "where should we optimize?" question with measured data instead of guessing.

## Invocation

```
/transcript-profile                   # all projects, all time, top 20
/transcript-profile --days N          # only sessions modified in last N days
/transcript-profile --project NAME    # filter to a project dir whose name contains NAME
/transcript-profile --top N           # cap report rows (default 20)
/transcript-profile --include-sidechain  # include sub-agent (Task) transcripts
/transcript-profile --json            # JSON output instead of markdown
/transcript-profile --sequences       # repeated call sequences, and values passed between calls
/transcript-profile --sequences --tools mcp__vault__   # one tool family, by name prefix
/transcript-profile --root DIR        # transcripts root (default ~/.claude/projects)
```

Combinable. `--days 7 --project vault-storage --top 10` is a common shape for "what did vault-storage work look like this week."

## Procedure

1. **Run the script** verbatim with the user's args:

   ```bash
   node ~/.claude/skills/transcript-profile/profile.mjs $ARGUMENTS
   ```

   Output is markdown by default. The script handles arg parsing internally; pass `$ARGUMENTS` through.

2. **Highlight what stands out** in 2–4 bullets after the table:

   - Which tool dominates total time? (Usually Bash, by a wide margin — long-running tests/builds/installs.)
   - Which tool has the worst p95 vs p50 ratio? (Outliers — often web fetches or long Bash commands.)
   - Are MCP tools (`mcp__*`) showing high per-call latency? Network/round-trip overhead is worth flagging.
   - Are there tools the user might not realize are being called heavily?
   - Is the tool slow, or the batch? p50/p95/Avg run from the call's issue, so a call issued with siblings in one message carries the batch's wait and the siblings' execution; since Claude Code 2.1.275 a batch's mutating calls start only after the message finishes streaming (Edit's first-in-batch p50 went from 0.17 s to 3.2 s while a single Edit stayed at 0.18 s, measured 2026-09-28). Own p50/p95 is the gap from the previous result in the same message and answers "is this tool slow"; the Batched column says how much of the tool's traffic that distinction applies to.
   - Which tool puts the most bytes into context? The bytes table is the ceiling on any saving from a read gate or a cheaper-model delegation: a class of reads that is 9% of result bytes saves at most 9%, whatever a per-read benchmark claims. (Measured 2026-09-28 on one fleet host, 30 days: whole reads of files over 350 lines were 9.3% of result bytes, and the largest single consumer was one skill file read whole in 27 sessions.)

3. **Don't read into the "pending" count** unless it's a large fraction. A small pending tail is normal — the most recent in-flight session shows up as unmatched, and very long-context sessions can lose tool_use/result pairs across a compaction boundary. The counts stay correct; the latency stats are computed from matched pairs only, so they're not skewed by pending.

4. **Read the bytes as a lower bound.** They are result bytes as stored in the transcript, not tokens (divide by about four for a token estimate). A result the harness spilled to disk shows up as its short path, so a very large result is under-counted, never over.

## Data shape (for reference)

Each transcript line is one of: a session-meta record (permission mode, snapshot), a user message (with `tool_result` blocks in `message.content`), or an assistant message (with `tool_use` blocks). Top-level `timestamp` is when the line was written; pairing `assistant.tool_use.id` with `user.message.content[].tool_use_id` recovers latency.

`tool_result.content` is a string or an array of blocks; the byte count sums the text blocks.

The block rows of one assistant message share `message.id`; the own cost and the batched count group tool calls by it. A row without one counts as its own message, which never over-attributes batching.

Sub-agent transcripts live beside the session file as `<session>/subagents/agent-*.jsonl`; older sessions marked such rows `isSidechain: true` inside the session file instead, and both forms are honoured. Excluded by default — they double-count work that the parent's `Agent` call already includes in its own latency. Add `--include-sidechain` to drill into sub-agent breakdowns; the header then reports the sub-agent transcript count beside the session count. (Before 2026-09-28 the flag read only the `isSidechain` rows, so on the current layout it found nothing.)

## Working and waiting

`waits.mjs` divides each main session. A wait runs from the last agent row, a tool result included, to the prompt that answers it; the rest of the span is working, so a message queued during a run counts as working. A slash command ends a wait; `[Request interrupted` and `Stop hook feedback:` do not, since the harness writes those. A wait of 30 minutes or more is often work in another session, so the report gives both sides. Each wait is labeled by the message before it, and a stop can carry more than one:

- `command`: a fenced block starting with `!`.
- `question`: the closing paragraph holds a `?`. A stop states its question and then its pick, so it rarely ends on one.
- `commit`: the message ends on a fenced one-line subject.
- `report`: none of these.

The labels read the wording, so a question asked earlier in a stop reads as `report`: about 4 of 14 `report` stops in one read, against 14 of 14 `question` stops right, so `question` undercounts. They were set against 30 days of real stops (claude-config D67).

## Repeated sequences

`--sequences` answers whether a repeated sequence should be an operation of its own. It prints two things, each ranked by how many transcripts show it, in place of the tool tables.

- **Sequences:** runs of 2, 3, and 4 consecutive calls in the family, a repeat of one call collapsed.
- **Values:** a string of 8 or more characters in a call's input, found in one of the previous 12 results and absent from that call's own input. A step outside the family gets `Through`, the family's call before it, so a `sed` over a downloaded note is credited to the read. A string match bounds causation from above, so read the calls before believing a row.

`--tools` matches a name prefix, so a call that reaches the family through `Bash` counts only as `Bash` and appears only under `From`. For vault work that is a real share: the note `queries/2026-10-25-vault-operation-sequences`, which this mode comes from, normalized `vault-curl` commands by hand. Its scripts remain the way to count those.

## When the report is useful

- After a long stretch of work, asking "what should we optimize?" — the dominant total-time tool is the answer 90% of the time.
- Comparing pre/post a change to see if it actually saved wall time.
- Spotting drift in tool latency — if a previously-fast tool starts averaging 5× higher, something regressed.
- Validating that a new tool (e.g., a fresh MCP integration) has acceptable per-call overhead.
- Before building a read gate or delegating reads to a cheaper model: the byte share of the reads in question bounds the saving.

## Tests

`node --test ~/Open/claude-config/skills/transcript-profile/` runs `profile.test.mjs`: it builds a transcript tree in a temp dir and drives the script through `--root`, pinning the byte and latency arithmetic, the own cost and batched count on a three-call message, the sub-agent walk, the `--days` / `--project` filters, and the markdown table.

## When it's NOT the right tool

- Per-call args / specific commands run — the script aggregates by tool name only, not args. (Future: add `--by-args` for Bash subcommand bucketing.)
- Server-side latency in tools that hit external services. The "tool wall time" includes network + remote work; you can't separate them from this data alone.
