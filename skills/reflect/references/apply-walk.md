# The `--apply` walk

What `/reflect` step 8 reads when the run has `--apply`. Step numbers are `SKILL.md`'s.

Walk the high-confidence proposals **one per turn, each with its context in front of it** — never a
run of bare "Apply P1?" questions. Eugene, 2026-09-15: _"sometimes I don't recognize the context and
need it and more discussions/examples on it. Yet there is no way to 'hang a question' while working
on it. I need to answer, say, 4 questions in the row with a minimal context."_
([[projects/agent-workflow/feedback]] § A question carries its context and can be hung.) For each
proposal:

a. **Put the context in chat first**, in this order: the session named by its subject and day (from
`session_git[].first_turn`, never the id prefix), the exchange from
`~/.claude/skills/reflect/reflect-context.mjs --project=<dir> --session=<prefix> --at=<ts>` (his
words and the reply that followed, in human time), why it matters now, and one example of the rule
or change applied — a before/after, or the sentence the rule would have changed.

b. **A proposal that writes only to claude-config is applied and shown, with no question** (Eugene,
2026-11-03: he reviews those files at commit anyway). `Edit` the real file under
`~/Open/claude-config/`, put `git -C ~/Open/claude-config diff -- <file>` in chat under the context,
and go on to the next proposal without waiting. These files are live on this host through their
symlinks, so the edit takes effect before his review: when he objects, undo it, and when he wants to
discuss it first, undo it and park it as "Hang it" does. A proposal with any vault write, a long
form in a feedback note included, takes the question below, since that part never reaches a diff he
reads.

c. **Every other proposal gets the question**, with the proposed text in the option's `preview` so
the diff is read where the choice is made:

```
AskUserQuestion({
  question: "P1: {one sentence — what changes, where}?",
  header: "Apply P{N}",
  options: [
    {label: "Apply as proposed", description: "Write the artifact as shown.", preview: "{the proposed diff or body}"},
    {label: "Edit then apply", description: "Adjust the proposed text before writing."},
    {label: "Hang it", description: "Park it on the clarify queue with this context; pick it up with more discussion later."},
    {label: "Skip this one", description: "Move on without applying."},
  ],
  multiSelect: false,
})
```

d. **Route:** "Apply as proposed" → execute the write. For vault paths prefer the narrow op: a queue
item through `queue-items.mjs file <project>`; a rule or lesson through `vault_append` to its topic
piece when the note's folder is grouped (`vault_list_pieces` lists them), else to the note's path;
`vault_replace` for an edit; `vault_write_file` only when authoring a whole new note (fallback:
`vault-put --append/--replace`); for claude-config paths use `Edit` against the real file under
`~/Open/claude-config/`, never the `~/.claude/` symlink. "Edit then apply" → present the proposed
body, ask for tweaks, then write. "Hang it" → `clarify-queue.mjs file` (step 7) with the rendered
exchange as the `Context:`, the proposal as candidate 1, and "no rule / one-off" as a candidate, so
nothing is lost when he moves on; `/clarify` picks it up as a conversation. "Skip" → no-op.

e. **Then offer the mediums.** After the last high-confidence proposal, ask once, multi-select,
which medium proposals to walk, each named with its one-line proposal and a medium carried from the
previous report listed first, plus your pick. Each chosen one is walked like a high one (a–d); an
unchosen one stays in the report as proposed. (Origin: apodict `ecf4a29e`, 2026-10-07 — a side note:
"This run's two medium-priority proposals won't be shown in the apply walk"; Eugene: _"walk M1 and
M2"_. The previous run's M2 had been carried twice unwalked.)
