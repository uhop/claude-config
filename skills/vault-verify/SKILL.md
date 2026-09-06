---
name: vault-verify
description: Check a project's vault notes against its repository — every backticked path, commit, version, and file or line count the notes assert, verified against git and the working tree. check-drift asks whether the repository moved since the baseline; this asks whether the repository supports what the notes say. Report-only. Use when the user says /vault verify or /vault-verify, asks whether the project notes are still true, or before trusting a number a note carries. Backed by `vault-verify.mjs` over vault-storage's `/sections` and the project's git history.
user_invocable: true
---

# /vault verify — the notes against the repository

Reads `projects/<name>/` from the vault and verifies the mechanically
checkable claims against the project's git history and working tree. Run it
from the project directory. **Read-only** — it reports; the note edits are
yours. Backed by `vault-verify.mjs`; the rules are the pure module
`verify-claims.mjs`, pinned by `verify-claims.test.mjs`.

`check-drift` compares the repository against a recorded baseline and
catches "the repository moved since we last looked". It cannot see "a note
says something the repository never supported": a count the artifacts
contradict, a comparison across runs dated before the directory they measure
existed, a path deleted three weeks ago (agent-workflow queue, filed
2026-08-20 from two apodict claims that survived a clean drift check).

## Invocation

```
/vault verify                        current project, running files and design notes
/vault verify <project>              a vault project name other than the directory's
/vault verify --unchecked            also list the enumerated claims nothing can verify
/vault verify --all                  include corpus/, research/, archives, queue-archive.md
/vault verify --files=decisions,learnings   only notes whose path contains one of these
/vault verify --quiet                tab-separated `category<TAB>note:line<TAB>detail`
/vault verify --fenced               read fenced code blocks too (examples, off by default)
/vault verify --siblings=DIR         where to look for another repository's commits (default: the parent directory)
```

Project name resolves as check-drift's does: the argument, else
`.claude/vault-project`, else the repository's directory name. Exit `0`
clean, `1` on findings, `2` on a git or API error. It exits non-zero — run
it solo or guard with `|| true` in a parallel Bash batch.

```bash
~/.claude/skills/vault-verify/vault-verify.mjs
~/.claude/skills/vault-verify/vault-verify.mjs --quiet | grep '^path'
```

## What is a claim, and what answers it

Everything comes from one git run each — `ls-files`, `log --all
--name-status`, the tag list, and every `"version"` the package.json ever
declared — plus the working tree. Fenced code blocks are examples, not
claims, unless `--fenced`.

- **PATH** — a backticked span with a slash (`skills/vault/tag-distance.mjs`,
  `dev-docs/`, `bin/x.js:118`). Bare basenames are not claims: `package.json`
  and `state.md` name a file in some repository, and they were 560 of 622
  path findings on the first run. A path whose first segment was never a
  top-level entry of this repository is another repository's and is skipped.
  Findings: *never existed in this repository*; *gone; last seen <date>*
  (tracked once, absent now and not on disk); a line reference past the
  file's end.
- **COMMIT** — a backticked 7- or 40-hex span. Measured on 291 spans across
  two projects: 7-hex resolve 194 times, 8-hex are session ids and 12-hex
  are fragment ids and resolve never. An unknown commit is looked up in
  every sibling checkout under `--siblings` (lazy fetch disabled, so a
  partial clone never reaches for the network) and demoted to information
  naming the repository when found. Findings: *no such commit*; *dated
  <date>, the note pairs it with <date>* when the two differ by more than a
  day.
- **VERSION** — a semver beside a release verb (`released 1.8.0`, `tagged
  0.4.0 on 2026-09-04`, `version 1.9.0`). Answered by the tags (naked, `v`,
  or `<pkg>-` prefixed) or any package.json version ever committed, so an
  unreleased `0.0.1` a note cites is real here. `npm 10.9.8` and another
  package's `date-fns 4.4.0` carry no verb and are prose. Findings: *never
  a tag nor a package.json version here*; a tag date that disagrees with
  the paired date.
- **DATE** — a path paired with a date must have existed by then (first
  commit ≤ date + 1). This is the arms-before-the-catalogs class from the
  origin; it has fixtures and, so far, no real finding.
- **COUNT** — `N files in \`dir/\``, `\`dir/\` (N files)`, `\`file\` (N
  lines)`, `N lines in \`file\``, against `git ls-files` and the file.
  Every other count (`40 tests`, `26 commits`, a word-number like
  *seventeen*) is unverifiable here and appears only under `--unchecked`.

**A date pairs with a claim only in one-statement shapes** — `` `x`
(2026-09-02) ``, `` `x` (added 2026-09-02) ``, `` `x`, 2026-09-02 ``,
`tagged 1.8.0 on 2026-09-02`, `` 2026-09-02 (`x`) ``. The nearest date
within four characters crossed a sentence boundary on the only finding it
produced, so proximity alone is not a pairing.

## Which notes

By default the project's running files and design notes: everything under
`projects/<name>/` except `state.md`, `queue-archive.md`, `**/archive/**`,
`corpus/**` and `research/**`. Corpus and research notes describe other
codebases by construction — every path in a libunifex sweep is libunifex's —
and archives are history. `--all` reads them anyway.

## Calibration (2026-09-06)

First run, before any of the rules above: 991 findings on apodict's 102
notes, 28 on claude-config's 4. After: 20 and 2, in under a second each.
The apodict residue: 13 paths, two of them files gone since 2026-08-19 and
2026-09-04 and the rest paths of other codebases the running notes analyze
(`src/node_file.cc`, Django's `tests/app/db.py`); 4 commits found in no
local checkout; 2 versions; one directory count of 69 against 160 tracked.
Both claude-config findings are dotfiles commits the sentence names, from a
checkout this host does not have. So the residue is what the filing
predicted: a small checkable subset, every line of which the repository
does refute, and a read of the line decides whether the note or the claim
is wrong. Decision record: `projects/claude-config/decisions` D17.

## Limitations

- **Prose claims are invisible** — the origin's *seventeen fragments* is a
  word-number about artifacts nothing here can count. `--unchecked` lists
  the digit counts the pattern saw and could not verify; the rest is the
  agent's read. A model-driven enumerator would be the expensive tier and
  needs its own verification; not built.
- **A claim about another repository reads as "not in this repository"**
  when the note names that repository in prose. Correct, and noise for a
  reader who knows; the sibling lookup demotes it only when the checkout
  exists under `--siblings`.
- **Untracked files count as present** when they exist on disk, so a
  gitignored artifact a note cites is not a finding; a file that was
  tracked and is now neither tracked nor on disk is *gone*.
- **`queue-archive.md` and `corpus/` are skipped by default** and carry
  stale paths by nature; `--all` reads them when that is the question.
- Operates on **indexed records**; a note not yet imported is not read.

## When to run

At wrap, after a documentation pass, and before quoting a number or a path
from a note that is more than a few weeks old. Pair it with `/vault check`:
one says the repository moved, the other says the notes lag it.
