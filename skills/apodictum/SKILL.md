---
name: apodictum
description: >-
  Drive the apodictum deterministic reasoning oracle from any project on the
  fleet: abstract boolean-context code and statement structure into oracle
  queries (MCP tools where registered, the JSON CLI otherwise), interpret
  verdicts into advisory proposals, failing tests, or targeted questions.
  Use when checking a refactor of
  conditions or control flow, simplifying a gnarly condition, auditing guards
  and exits, proposing a loop invariant, or analyzing a codebase's conditions
  — and to file the corpus note every real-code run owes back to the vault.
---

# apodictum — fleet front end

The oracle lives in the private checkout `~/Open/apodict` (repo
`uhop/apodict`). If the checkout is missing on this machine, report it and
stop — Eugene distributes clones; `gh repo clone uhop/apodict ~/Open/apodict`
is the fix he can run or approve.

Everything the oracle answers is advisory: the final gate for effectful code
is the target project's test suite plus human review. Never auto-apply a
proposal; never present an unchecked claim as checked.

## 1. Load the judgment layer first

Read `~/Open/apodict/skills/front-end/SKILL.md` **before the first query of a
session** — it is the normative discipline: establishing boolean context (the
§2 discriminator), carving atoms, occurrence-consistency, `depends`/`assume`/
`declare`, the query cookbook, the verdict-interpretation decision table,
witness re-concretization, presentation rules, and when to decline. This
skill adds only the fleet mechanics: how to reach the oracle on this machine,
and the corpus protocol. A wrong abstraction invalidates the conclusion, not
the oracle — the discipline is not optional, and no transport changes that.

For anything wider than a single fragment — a file cleanup, an audit of
someone else's code, a scheduled sweep — also read
`~/Open/apodict/skills/analysis/SKILL.md`: density triage, batched queries,
the five-kind output taxonomy (proposal / finding / question / certification
/ decline), the noise discipline, and the report format.

## 2. Query — MCP tools if present, the CLI otherwise

**Check your own tool list first.** If `apodictum_query` and `apodictum_ops` are
there, the MCP server is registered on this machine — prefer them: no shell,
no temp files, no permission prompt per call. If they are absent, shell out to
`bin/query.js`. Both are the same dispatcher over the same ops, so the request
shape below is identical either way; only the envelope around it differs.

**One exception, and it lands on exactly this project's normal workflow.** The
client launches `bin/mcp.js` at session start, so the process pins whatever
`~/Open/apodict/src/` looked like *then*: a session that edits the oracle keeps
querying the old engine — no error, no warning, a plausible answer of the right
shape. Measured 2026-08-04, minutes after a lower-bound fix landed, the same
`simplify` returned `bound: 6, stopped: 'budget'` over MCP and `bound: 7,
optimal: 'bound'` over the CLI. `/mcp` reconnect restarts a stdio server
(verified the same day), so the remedy is one slash command — but nothing
prompts you to reach for it. Treat MCP as stale after any `src/` change, and
re-probe a query whose answer you already know before trusting the next
verdict. Fixing the oracle and then analysing code with it is the ordinary
shape of an apodictum session, not an edge case.

**An MCP server death is never cross-session interference.** `bin/mcp.js` is
a stdio server holding no port, no socket, no lockfile, and no filesystem
write — concurrent sessions each launch their own process and share nothing,
so "another session's apodictum killed mine" is structurally impossible. When
the server dies mid-call, check the query first — size (an over-bound
enumeration), a runaway `simplify` budget — not the neighbours. The
2026-08-08 run lost a round-trip to exactly that wrong hypothesis.

```bash
# MCP absent — the CLI path
node ~/Open/apodict/bin/query.js --help          # ops + request shape
echo '{"op": "equivalent", "a": ["and", "p", "q"], "b": ["and", "q", "p"]}' |
  node ~/Open/apodict/bin/query.js
```

Via MCP the same query is `apodictum_query` with
`{"request": {"op": "equivalent", "a": …, "b": …}}`, and `apodictum_ops` lists
every op with its parameters. Registering the server (once per machine, if it
is missing) is Eugene's call:
`claude mcp add --scope user apodictum -- node ~/Open/apodict/bin/mcp.js`.

- A request is `{"op": "<name>", ...parameters}`; op names mirror the library
  exports (`equivalent`, `implies`, `tautology`, `counterexample`,
  `obligations`, `guardStatus`, `exhaustive`, `simplify`, `simplifySkeleton`,
  `licenseDelta`, `skeletonEquivalent`, `suggestAliases`, `inductive`, …).
  Formulas are contract §3 trees; `parseFormula` / `parseStatements` convert
  the infix and statement notations.
- An **array** of requests returns an array of `{ok, result}` /
  `{ok, error}` envelopes — batch a whole analysis into one call. Over MCP
  pass the array as `request`; over the CLI it is one process, many queries
  (exit codes: 0 all answered, 1 some request errored, 2 input unreadable),
  and request files go under a `mktemp -d` dir, not a bare `/tmp` name.
- `simplify` resolves the `house-tactics` bank and `simplifySkeleton`
  `base-statements` by default; `"bank"` overrides, `null` runs bank-free.
  Per-query `options.fitness` (e.g. per-symbol `atoms` weights) merges over
  the bank's.
- Unknown ops and unknown/missing parameters are rejected with the accepted
  list — a well-formed empty-looking answer never masks a typo'd query.

## 3. File the corpus note — every real-code run

Runs on real code are the measurement apodictum cannot get any other way; the
observations feed the improvement queue. **File one vault note per analyzed
unit** (a file, or one coherent multi-file run) at
`projects/apodict/corpus/YYYY-MM-DD-<project>-<slug>.md` — internal use, no
privacy filter: include real code fragments verbatim. File on *every*
outcome: a shipped proposal, an already-minimal certification, a decline, a
wrong-feeling recommendation — negative and neutral results are corpus data
too.

Write via the vault JSON path (`~/.claude/skills/vault/vault-put.mjs`, see
the vault skill), enriched at capture (`agent:` block,
`derived_from_hash: "auto"`). Frontmatter: `type: research`,
`tags: [apodict, corpus]`, `status: active`,
`related: ["[[projects/apodict/queue]]"]`. Body sections:

1. **Summary** — 1–2 sentences: what was analyzed, what came of it.
2. **Source** — repo, `file:line`, commit, language; the fragment(s)
   verbatim.
3. **Provenance** — `node ~/Open/apodict/bin/query.js --version` plus
   `git -C ~/Open/apodict rev-parse --short HEAD`, and the bank(s) used;
   verdicts change only with code or oracle/bank versions, so this makes the
   note replayable.
4. **Queries** — the request JSON verbatim (it *is* the abstraction:
   formulas, atom table, `assume`/`depends`/`declare` in one artifact) and
   the verdict essentials per query (verdict, witness, `optimal`,
   `conditional_on`, `demands`, trail when the trail is the point).
5. **Outcome** — proposal / certification / finding / question / decline;
   whether it was applied; the user's reaction if any.
6. **Improvement signal** — the payload; be specific and blame the right
   layer: abstraction-vocabulary gaps (fragments the discipline can't map),
   front-end-skill gaps (rules that misled), bank gaps (missing or misfiring
   rules), engine gaps (unreachable forms, budget/valley stalls), fitness
   misranks (recommendations a human would reject), obligations noise or
   catches, CLI/MCP ergonomics friction. "Everything worked, nothing missing"
   is itself a signal — say it.
7. **Fixture candidates** — conditions worth harvesting into
   `tests/fixtures/real-conditions.json` (the conformance-suite seed), if
   any.

Cheap runs deserve short notes — three sections filled honestly beat seven
padded ones; only Source, Queries, Outcome, and Improvement signal are
mandatory.

## Consumption modes

- **Constructive** — gate your own edit: about to restructure a condition or
  guard chain? Verify the hand pair (`equivalent` + `licenseDelta` — verdict
  first, then license) or let `simplify` propose with a trail.
- **Forensic** — invoked cleanup/audit of a gnarly file: conditions,
  guard liveness (`guardStatus`), cover exhaustiveness, exit
  distinguishability, loop invariants.
- **Analysis** — sweep another project's conditions for findings and
  certifications; this mode exists to grow the corpus as much as to serve
  the target repo. Procedure and report format:
  `~/Open/apodict/skills/analysis/SKILL.md`.
