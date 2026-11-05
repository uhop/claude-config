# When to run `/reflect`, and what it cannot see

Why the cadence is what it is, and the scanner's known limits. Step numbers are `SKILL.md`'s.

## Cadence — when to run

`/reflect` is a **cross-session, per-machine** sweep, not a per-session step — it looks _back_ over
recent **closed** sessions for patterns in how the collaboration went. That is a different axis from
`/vault wrap` (which closes _one_ session's content) and unrelated to `/vault sweep` (vault
hygiene). Two properties fix the timing:

- **It needs accumulation.** A signal reaches **high** confidence only on recurrence — ≥ 2 sessions
  or a cross-machine match (step 4). Per-session it mostly sees single instances; it is built to
  sweep a window, not a session.
- **It reads only completed transcripts.** The live session's tail isn't on disk yet — `reflect.mjs`
  flags it, skips it, and warns (`SKILL.md` § When NOT to run).

**Best practice:** run it at the **start** of a fresh session — recent sessions are then closed and
on disk — then `/clarify` to drain what it filed. The default `--since=last-run` auto-scopes the
window to everything since your last reflect on this box. Rhythm ≈ weekly, or after a cluster of
substantive sessions — enough closed sessions that patterns emerge.

**Not** chained after `/vault wrap`: wrap runs _inside_ the session it closes, so that session is
still live and reflect would skip the very work you just wrapped. **Not** after `/vault sweep`:
orthogonal — reflect's drain path is `projects/agent-workflow/queue.md` + `/clarify`, not the vault
maintenance queues. And **per-machine** — transcripts are local-only (§ Limitations), so run it on
each box you work on; a box that never reflects contributes no cross-machine evidence.

## Limitations (first iteration)

- **Regex-based classification.** False positives are normal — the agent's dedupe + judgment step in
  the procedure is what makes the output useful. A candidate that looks like a correction may turn
  out to be benign in context.
- **No cross-machine transcript _merging_.** Each host still scans only its own transcripts.
  Cross-machine _recurrence_ is recovered indirectly: step 3 reads other hosts' recent reports and
  step 4 counts a match there as a second occurrence, so a once-per-machine signal can still reach
  high confidence. The catch: this only works if the other host has actually run `/reflect` and
  committed its report — an un-run host contributes no evidence — and the match is semantic, not
  exact.
- **Tool-input fingerprint is JSON-serialize-and-truncate.** Catches identical retries, misses
  semantically-equivalent ones with different whitespace / arg order.

These are deliberate first-cut tradeoffs; revisit once `/reflect` has produced enough output to know
which are worth refining.
