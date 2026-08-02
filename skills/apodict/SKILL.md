---
name: apodict
description: >-
  Drive the apodict deterministic reasoning oracle from any project on the
  fleet: abstract boolean-context code and statement structure into oracle
  queries via the JSON CLI, interpret verdicts into advisory proposals,
  failing tests, or targeted questions. Use when checking a refactor of
  conditions or control flow, simplifying a gnarly condition, auditing guards
  and exits, proposing a loop invariant, or analyzing a codebase's conditions
  — and to file the corpus note every real-code run owes back to the vault.
---

# apodict — fleet front end

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
skill adds only the fleet mechanics: the CLI and the corpus protocol. A wrong
abstraction invalidates the conclusion, not the oracle — the discipline is
not optional.

## 2. Query through the CLI

```bash
node ~/Open/apodict/bin/query.js --help          # ops + request shape
echo '{"op": "equivalent", "a": ["and", "p", "q"], "b": ["and", "q", "p"]}' |
  node ~/Open/apodict/bin/query.js
```

- A request is `{"op": "<name>", ...parameters}`; op names mirror the library
  exports (`equivalent`, `implies`, `tautology`, `counterexample`,
  `obligations`, `guardStatus`, `exhaustive`, `simplify`, `simplifySkeleton`,
  `licenseDelta`, `skeletonEquivalent`, `inductive`, …). Formulas are
  contract §3 trees; `parseFormula` / `parseStatements` convert the infix and
  statement notations.
- An **array** of requests returns an array of `{ok, result}` /
  `{ok, error}` envelopes — one process, many queries; batch a whole
  analysis. Exit codes: 0 all answered, 1 some request errored, 2 input
  unreadable. Write request files under a `mktemp -d` dir, not bare `/tmp`.
- `simplify` resolves the `house-tactics` bank and `simplifySkeleton`
  `base-statements` by default; `"bank"` overrides, `null` runs bank-free.
  Per-query `options.fitness` (e.g. per-symbol `atoms` weights) merges over
  the bank's.
- Unknown ops and unknown/missing parameters are rejected with the accepted
  list — a well-formed empty-looking answer never masks a typo'd query.

## 3. File the corpus note — every real-code run

Runs on real code are the measurement apodict cannot get any other way; the
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
   catches, CLI/ergonomics friction. "Everything worked, nothing missing" is
   itself a signal — say it.
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
  the target repo.
