# Filing to the clarify queue

What `/reflect` step 7 reads before it files an item. Step numbers are `SKILL.md`'s.

**Read the source exchange before filing — never write the entry from the scan excerpt.** Run
`~/.claude/skills/reflect/reflect-context.mjs --project=<dir> --session=<id prefix> --at=<ts>` — the
rows around the moment in human time, the user turn _and_ the assistant reply that followed it — and
write the `Context:` and `Candidates:` from what is actually there. The scan excerpt is a truncated,
regex-selected window: it routinely omits the reply that already answered the question, and a
candidate built on a guessed mechanism is unbuildable at `/clarify` time. Filing is cheap; filing
_wrong_ costs the clarify walk, because the user is then choosing between options that cannot be
implemented. If reading the source dissolves the ambiguity, don't file the item at all — resolve it
in the report's "Already covered" or "False positives" section instead. (Origin: 2026-08-16 —
`Q-2026-08-16-001` asked whether sub-agent progress labels should be descriptive, on the stated
premise that "labels are agent-authored per dispatch". Two of its three candidates proposed a rule
over those labels. The assistant reply four rows below the source turn already said the strings were
the _harness's_ per-tool-call activity glosses, which the agent does not author — so the item was
rejected at `/clarify` as unbuildable, and one `Read` at filing time would have prevented it being
filed.)

**Read every store a candidate would route to before filing — "nothing there speaks to it" is a
read, not an assumption.** Each `Candidates:` line names a destination
(`projects/<name>/feedback.md`, `CLAUDE.md` § …); open each one and search it for the rule before
writing the `Context:` claim that it is absent. Step 3 lists these files as dedupe inputs, but a
broad step-3 skim does not test the specific rule a Q proposes — the check has to be per candidate,
at filing time. (Origin: 2026-08-18 — `Q-2026-08-18-001` asked whether third-party names in negative
anecdotes should be anonymized, stating that neither `projects/blog/feedback.md` nor
`projects/articles/feedback.md` spoke to it; both carried the exact ruling, written the day before.
It was archived at `/clarify` as already covered — a filing that cost a walk to un-file.)

**The heading must be `### Q-YYYY-MM-DD-NNN` and nothing else on that line.** `/clarify`'s parser
matches `/### (Q-[\w-]+)\n/`, so a title after the id —
`### Q-2026-07-20-001 — is there a rule for…` — fails to match and the item is **silently
unlisted**: the file looks correct and `clarify-queue.mjs list` returns a clean `{"pending": 0}`,
indistinguishable from an empty queue. (That happened on 2026-07-20; the helper now also reports an
`unparsed` array and a stderr warning, but the format is still the thing to get right.) Copy this
shape exactly:

```markdown
### Q-2026-07-20-001

- **Created:** YYYY-MM-DD (reflect, <host> <HHMM>)
- **Source:** project `<dir>`, session `<id>`, ts <epoch_ms>; report
  [[projects/agent-workflow/reports/<name>]]
- **Question:** <one sentence, ends with a question mark>
- **Context:** <what happened, and why the reading is ambiguous — enough that a reader months later
  needs no transcript>
- **Candidates:**
  1. **<short label>.** <what this interpretation claims and where it would route>
  2. **<short label>.** <…>
  3. **<short label>.** <…>
```

Two or three candidates; they must be genuinely distinct readings, not degrees of the same one.
Include "no rule / one-off" whenever it is live — `/clarify` resolutions frequently land there, and
omitting it biases the walk toward filing a rule.
