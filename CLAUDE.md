# Cross-project rules

## Git / npm gates

Where these rules came from: [[projects/agent-workflow/claude-md-origins/git-npm-gates]].

`git commit`, `git push`, `git tag`, `npm publish` — only on the **literal verb** in the current
turn. Reject synonyms (`land`, `ship`, `go`, `proceed`). Stop at staged diff and wait. Full:
[[topics/agent-stops-at-staged-diff]].

No verb in the turn → act silently; never _offer_ to commit/push/tag/publish or ask permission to do
them — absence of the word is the answer, not an invitation. The user commits and pushes himself,
after his own review.

**Releasing is an explicit ask, one layer above the verbs.** Deciding to release — and any release
_prep_: version bump, release-notes entries, `/release-prep` — happens only when the user explicitly
asks for a release. **A question about readiness is not that ask**: "are we ready to publish?" is
answered by the read-only `/release-check`, which reports a verdict and writes nothing. Answering a
question by changing state is the failure the check/prep split exists to prevent (2026-08-18). Never
infer the decision from an unreleased changeset on `main`, from a docket/task list (even one the
agent wrote), or from a generic "deal with it"; surface "main has unreleased work" as information,
not as a task. He decides _when_ — he may deliberately batch more items before cutting a version.

Asking is also useless because of the gate itself: `hooks/git-commit-gate.sh` blocks `git commit`,
and every other verb that makes a commit (`am`, `merge`, `cherry-pick`, `revert`, `rebase`, a `pull`
that may merge; since 2026-11-05), unless `.claude/git-commit-allowed` exists at or above the
directory the commit runs in — the cwd after any `cd` in the command, or git's `-C` (since
2026-09-06; before that the session cwd alone decided, which denied a
`cd <marked repo> && git commit` from an unmarked cwd) — (a per-project opt-in marker, which only he
writes (the gate refuses an agent's write) — only a couple of repos carry it;
`find ~/Open -path '*/.claude/git-commit-allowed'` answers _which_, don't hardcode the list; a
scratch repository under the temp or cache directory and a linked worktree need none, and a site the
gate cannot read is denied). `push` / `tag` / `publish` are in `settings.json`'s absolute
`permissions.deny` — a hook can't reopen a deny — and since that deny matches a literal prefix,
`hooks/destructive-op-gate.sh` denies the spellings it misses (git's and npm's global options before
the verb: `git -C <dir> tag` ran on 2026-09-29), so a typed one is refused **everywhere, on every
repo, always**, and the dotfiles' global `pre-push` hook stops an agent session's push to a network
remote however it starts. Neither is a sandbox. `npm publish` also needs interactive 2FA the agent
doesn't have. So: on the verb, in a marked repo, just commit; otherwise the action can't happen —
don't narrate the gate, don't ask.

**"Published" is a fact, and the registry lags it.** A successful `npm publish` now ends with _"npm
notice Your package is being processed and may take a few minutes to become available"_, so
`npm view`, `--prefer-online`, and a direct registry read all show the previous version for minutes
afterwards, and `check-drift.sh`'s "tag X: no matching npm publish" says the same. When he says a
version is published, record it as published and do the bookkeeping; a registry that disagrees is
the processing window, never a reason to ask whether the publish failed.

Read-only / local-only `git` / `gh` / `aws` run freely; outward-facing or irrecoverable ops are the
user's (his legal responsibility, not a fleeting agent's). `hooks/destructive-op-gate.sh` enforces
it: blocks `gh` GitHub-state mutations (issue/pr/release create·edit·merge·comment·delete, `gh api`
non-GET), destructive `aws` (create/put/delete/…, `s3 rm` + uploads), and `git clean -f` (untracked
files have no reflog) — while allowing reads, `gh` clone/checkout/download, `s3` downloads, and
git-recoverable ops (`reset --hard`, `git rm`, `branch -D`). The hook is the source of truth for
exact coverage — don't reproduce the verb list here. Driver: an agent once filed a public
`gh issue create` for an internal vault queue item.

**The gate covers the verbs, not the bookkeeping.** Vault writes — queue → archive after a ship,
`state.md`, logs, decision notes — are never gated by it; move a shipped item when it ships. And a
deferral stated once is a _claim about current state_, not a standing position: re-check it before
restating it. "I held off because you hadn't pushed yet" is inertia once the push has happened, and
it reads as deference.

Git is the system of record — don't keep a prose ledger of it. Run `git status` / `git log` the
moment a decision needs the state, use the answer, discard it; never carry "N ahead/behind, commit X
landed" across turns or re-confirm what git already tracks. A `/vault wrap`-style session log
written once from `git log` is fine; a running tally babysat mid-session is not.

**A work stop re-names the unit, so he never scrolls back to find out what he is reviewing.** The
report that ends a long stretch — scripts, diffs, more scripts, 20 to 60 minutes, with his own work
interleaved — has to stand on its own. The message that opened the arc is far up the scroll by then,
and a list of what changed in which files does not replace it: the file list and the arc's name sit
at different levels of abstraction. So the report **opens with the unit's name**, the same one it
was announced under, and one sentence of what it does; the per-file detail follows. **An opaque
label is not a name** — "Arc 8b", "cluster 4", "D193" carry nothing on their own, so the sentence is
what does the work and is never dropped as redundant. The report **ends with a pasteable git
subject** in its own fenced block, one per repository when the stop spans several, each labeled with
its repository: past-tense verb first, sentence case, a closing period, **50 characters or fewer and
never past 72** (git's subject convention), and **no body** — _"I usually use just a title. For the
rest --- read the diff."_ The name serves the review, the subject serves the commit, and the review
is why the rule exists. Naming the unit is not offering to commit; the verb gate above is untouched.
(Shape: [[topics/commit-message-cliff-notes]]; boundary: [[topics/agent-stops-at-staged-diff]].)

Pushed history is immutable: no `--amend`, `rebase`, force-push, or moving published tags. Fix
forward with a new commit.

**A push is not a closure; only he ends a discussion.** A commit, a push, or a landed doc marks work
shipped and says nothing about the conversation around it. Wraps and logs record open threads as
open, and a wrap he asks for runs even when "nothing is left" ([[projects/agent-workflow/feedback]]
§ A push is not a closure; only the user ends a discussion).

**A wrap ends the session.** After `/vault wrap`, a reply is a few lines: anything that arrives
afterward is filed to the project's queue and said in one line, no new work starts, and no reply
ends with a question; a question still open goes into the log for the next session
([[projects/agent-workflow/feedback]] § A wrap ends the session).

## Shell

Where these rules came from: [[projects/agent-workflow/claude-md-origins/shell]].

Many basics (`cp`, `mv`, `rm`, `ls`, `cat`, `grep`, `du`, `mkdir`, `cd`) are aliased on this machine
— bypass with `command cmd`. Full table: skill `shell-env`.

**PyYAML is installed** — on the **system** python (`/usr/bin/python3`, Debian dist-packages), not
on brew's `python3` that shadows it on `$PATH`. A brew-python
`ModuleNotFoundError: No module named 'yaml'` does NOT mean PyYAML is missing; use
`/usr/bin/python3` for `import yaml` work.

**`while IFS= read -r` silently drops a file's last line when the file has no trailing newline** —
and a generated worklist usually has none, because `"\n".join(...)` / `printf '%s'` / `echo -n` all
end on content. The loop then processes N−1 of N items and exits 0, so nothing anywhere says a line
was skipped; the shortfall is exactly one per file, which is small enough to read as success. Three
ways out, in order of preference: **iterate in whatever language built the list** (if python wrote
it, let python loop over it — no format contract between the two halves); terminate the file
(`print(…, end="\n")`, `printf '%s\n'`); or `while IFS= read -r l || [[ -n $l ]]`. **Regardless of
which, count what you did against what you planned** — a per-item success line and a total is what
turns a silent shortfall into an obvious one, and it is the only check that catches the whole family
(a mid-list `continue`, a failed op swallowed by a pipe, an unmatched assert) rather than this one
instance.

**Show the lines after a match with `grep -n -A N 'pattern' file`, never with
`sed -n "$(grep -n … | cut -d: -f1),+Np"`.** The substitution is empty whenever the inner grep
misses — a regex that differs from the one that matched a moment earlier, a `head -1` where
`tail -1` was meant — and sed then reads `,+Np`, exits 1 with `unknown command: ','`, and takes the
batch's other output with it; measured at 21 sessions in five projects between 2026-08-28 and
2026-09-20, every one re-issued by hand. When a range genuinely needs sed, capture and test first:
`L=$(grep -n … | cut -d: -f1); [ -n "$L" ] && sed -n "${L},$((L+N))p" file`.

**`set -e` is not a gate in the Bash tool; a step whose failure must stop the next one is chained
with `&&` or `|| exit 1`.** Measured 2026-09-22: a script opened with `set -eu`, its python heredoc
raised on an assertion, and the shell went on to the following commands, one of which made the
outward call the failed step was meant to gate. The same shape as § Scratch files' `&&` rule for
cleanup, with the stakes inverted: there a bare `rm` deletes staged inputs, here a bare send
publishes them. Before any outward-facing step, gate on the previous step explicitly and print the
count the step will act on next to the count planned. Aliases compound it: `cd X || exit 1` never
fails on this machine because `cd` is aliased, so use `command cd` or absolute paths, and
`command ls` where `-t` matters.

**A command handed to him runs in the aliased shell.** The `!` prefix runs in the same shell as the
agent's own Bash, where a piped `ls` prints nothing: build file lists with globs or `command ls`,
dry-run the handed command verbatim, and state the expected count beside it
([[projects/agent-workflow/feedback]] § A command handed to the user runs in his aliased interactive
shell).

**`$!` after a backgrounded shell function is a subshell's PID, and `env`, `grep`, `find`, and `du`
are functions here.** `kill $!` then leaves the real process running, so start a process you will
signal with `command env … &`, and read `/proc/$P/cmdline` before signaling it (vault-storage D475).

## Scratch files

Where these rules came from: [[projects/agent-workflow/claude-md-origins/scratch-files]].

Don't hardcode `/tmp/<name>` for scratch — collides with stale files from prior/parallel sessions
(`Write` refuses a stale same-name file: "File has not been read yet"; `Read` hits another session's
leftover). `WORK=$(mktemp -d)` once, use `$WORK/<name>`. Shell state doesn't persist between Bash
calls — capture the printed dir and reuse its **literal** path across calls, don't re-`mktemp` (or
keep the whole read-modify-write in one Bash call). **Never `cd` into `$WORK`** — the trailing
`rm -rf "$WORK"` then deletes the shell's own cwd: the command exits 1 with `getcwd` noise despite
full success, and the dead cwd poisons the _next_ Bash call too. Absolute paths only; if something
must run inside, subshell it: `(cd "$WORK" && …)`. Best-effort `rm -rf "$WORK"` when done
(uniqueness prevents collisions; cleanup is hygiene, not correctness — don't fail the task on it) —
but **chain it with `&&`** (or guard it) so a failed step doesn't delete the staged inputs a retry
needs: a trailing bare `rm -rf "$WORK"` runs even when the step above just failed. Spell a removal
under it `"${WORK:?}"/name`: the harness refuses `$WORK/name` and `"$WORK"/name`, since an empty
variable would make the target `/name`, and lets `"$WORK"` and the `:?` form through (measured
2026-10-22; reflect 2026-10-22 P7). Reference impl: `skills/vault-check-drift/check-drift.sh`. Full:
[[topics/scratch-file-mktemp-not-hardcoded-tmp]].

**Every agent gets its own temp path — sub-agents included.** The rule above is about
_cross-session_ collisions; this one is _within_ a session, and it bites harder because the harness
pushes the other way: the system prompt tells every agent to use the session scratchpad "for ALL
temporary file needs", and **all concurrent siblings inherit the same scratchpad path**. Any fixed
filename under it therefore collides by construction — the more agents a stage fans out, the
likelier the clobber. Two acceptable forms: a fresh `WORK=$(mktemp -d)`, or **the inherited
scratchpad path plus a unique subfolder** (`$SCRATCH/<agent-or-holder-id>/`) when the scratchpad is
wanted for discoverability. Never a bare filename in the shared root. When dispatching parallel
sub-agents, say so in the prompt and give each a distinct namespace — any per-agent identifier the
dispatch already generates (a claim holder, a shard index) is a free unique name.

**The scratchpad is a workspace, never a delivery location.** Before reporting an artifact as staged
/ written / delivered / ready, confirm it at the path the _user_ will look at — not the one you
wrote to. A patch he applies and work parked for a later session are deliverables too: put them
where the next reader finds them (a vault note, a branch, `~/.cache/<project>/`) and name that place
where the work is parked (reflect 2026-10-27). One `test -f` / `ls` costs nothing; narrating a
delivery that never happened costs a round-trip and makes every later status claim suspect. The trap
is structural rather than careless: the same harness push noted above makes scratchpad-by-default
_right_ for working files and _wrong_ for deliverables, and nothing marks the boundary — so the copy
is the step that gets skipped, and the narration reads identical either way. Consumer-side sibling:
[[topics/empirical-on-disk-vs-reported-count-validation]] verifies a _tool's_ reported counts; this
one verifies your own narration.

## Code

Where these rules came from: [[projects/agent-workflow/claude-md-origins/code]].

- **The coding-tactics blog series is house style.** `~/Open/blog-hugo/content/blog/` 2026 series —
  code-linearization, code-is-cheap, logical-optimizations, cheating-as-a-programming-discipline,
  boolean-algebra, loop-and-if-invariants, break-continue-goto, back-of-the-envelope-estimates,
  premature-optimization — is the authority for simplification calls: collapse `else` when the `if`
  body ends in `return`/`break`/`continue`, guard clauses over nesting, booleans are booleans, etc.
  When a simplification matches a tactic, double-check it (tests/probes), then apply — don't just
  note it.
- Prefer prefix `++i` / `--i` when the result is unused.
- **Never `var`; a genuinely global binding goes on `globalThis` explicitly** (`window` in
  browser-only code), everything else is `const`/`let`. Eugene, 2026-09-19: _"in my code I avoid
  `var` completely and for truly global variables I use `globalThis` explicitly. Or `window` on
  browsers."_ The one place `var` still gets reached for is an inline classic `<script>`, where
  every block shares one global scope and a second top-level `const x` is a parse-time
  `SyntaxError: Identifier 'x' has already been declared` that kills the whole block before a line
  runs — `var` dodges it only by putting the name on `window`. Two better answers: wrap the block in
  `{ … }`, which scopes `const`/`let` and leaves `window` clean (a `var` inside a block still leaks,
  so the brace helps only the lexical forms), or declare nothing at all —
  `((window.__ns ||= {}).queue ||= []).push(…)` binds no name and is safe pasted any number of
  times. Measured trade-off table: [[topics/render-data-before-first-paint]] § Scoping a pasted head
  script.
- Prefer `catch {` over `catch (e)` when the error binding is unused (optional catch binding,
  ES2019). Not a mechanical sweep — read each site, leave any binding that's rethrown / logged /
  inspected. Full: [[topics/no-mechanical-modernization]].
- **Standard errors first.** Throw the standard class that fits (`TypeError` for a programmer error,
  `RangeError` for a value out of its domain, `SyntaxError` for malformed input, the platform's own
  `DOMException` names where one exists); mint a class only when a caller has to distinguish the
  failure, and then keep the underlying error on `cause` and combine several on `AggregateError`. A
  class for every failure is a `heya-io`-era habit from when the standard set was thin. Audit on
  touch: in a file you edit that throws, enumerate its throw sites and keep only the classes a
  caller distinguishes (double-meh 2026-09-20: eight `TypeError` sites already standard, `FailedIO`
  kept with the platform error on `cause`, `CacheFull` reworked the same day).
- **A program reports every missing required setting, together.** Check all mandatory settings at
  start and name each missing one in a single error, never only the first.
- **The docs are the spec; a test that contradicts them is the bug.** When a change turns a test
  red, read what the documentation, the library's stated contract, and the language spec promise:
  fix a test that contradicts them, and never bend the code or keep a wrong test for compatibility.
  (Full: [[topics/ai-written-tests-can-encode-bugs]].)
- **A timeout caps a runaway; a state machine drives the logic.** Sequence work by the events it
  waits for. A timeout stops a process that never reaches its next event, is anchored at an event (a
  run's start, a cleanup's start), and never stands in for one. A step that reaches the network or
  another process expects stalls: cap it at a silence since its last progress, restart it a bounded
  number of times with growing waits between attempts, each restart shown safe to repeat, and never
  pick a duration alone, since an unmeasured "N minutes" is a question for him (tape-six 2026-10-22;
  reflect 2026-10-22 M2; the stall clause: [[projects/vault-storage/feedback]] § A stall is a
  regular occurrence, reflect 2026-10-27).
- **Compound string keys join with `'\t'`** — the house impossible-id separator
  (`kind + '\t' + parts.join('\t')`), spelled as the two-character escape in source. Never
  NUL-as-separator, and **never a raw control byte in a text file** — one raw NUL makes git classify
  the file binary (`Binary files differ`, unreviewable diff; the Read tool renders it invisibly, so
  only `file -b` / `git diff --numstat` catch it). Told twice by 2026-08-01 (apodict
  `src/blocks.js`); recorded here because it wasn't findable in the vault when checked.
- **A code rule a program can check is enforced, not written here.** `hooks/code-rules-gate.sh`
  refuses an `Edit` or `Write` that adds one and shows the rule with its reason;
  `hooks/lib/code_rules.py` holds them with Eugene's words: no split on `'\n'` (split on `/\r?\n/`),
  no regex lookbehind, no bare `Symbol()`, no raw NUL. A write through Bash is not read, so follow
  them there too. A new checkable rule joins that registry, never this file (claude-config 9f,
  2026-11-06).
- **Every symbol is `Symbol.for()`, never `Symbol()`, internal ones included**, keyed under the
  project's own prefix (`object-stream.` across the stream-* family). A well-known name is a
  protocol without a dependency: another library can produce or recognize the package's markers by
  defining the same symbol and following the package's rules, with no formal dependency just to
  import a symbol. A `Symbol()` marker can only be imported. Check the project's `AGENTS.md` for its
  prefix before minting a key.
- **No defensive code for unsupported setups.** A library does not slow or complicate a supported
  path to guard against misuse it does not support: mixed versions of itself in one project, files
  removed from the package, functions called against their docs. Keep the cheap check (an
  `instanceof`, a direct property read) and let the unsupported case fail, even when the failure is
  hard to trace.
- **Build the basics first; never invent work the goal does not need.** Before adding a field, a
  check, a parse, an option, or a dependency, name the reader or writer that needs it today; with
  none, cut it. Data the system does not need to understand is an opaque text snippet: define
  nothing about it. Function before polish. Ask "whether" before "which", and put each question in
  the picture of the goal, since a chain of small rulings can commit the work to what he never chose
  ([[projects/agent-workflow/feedback]] § Build the basics first; vault-storage 2026-10-30: _"do not
  try to invent work for you … Let's do the basics and work on possible embelishments later"_ and
  _"With small questions I am losing the big picture."_)
- **Repeated code is not automatically duplication — repetition is sometimes deliberate inlining for
  speed.** Before proposing to collapse repeated blocks into a helper (or flagging them in a
  review), decide which it is: an unrolled hot path, a per-branch copy that avoids a call, a
  documented inlining technique — or genuine copy-paste. Two copies are genuine duplicates when they
  encode the same piece of knowledge: a change to one has to reach the other (DRY as Hunt and Thomas
  defined it, one authoritative representation of each piece of knowledge). Copies that look alike
  and change for different reasons are coincidental, and folding them couples code that changes
  apart. A genuine duplicate is fixed by moving every copy to one home, since a new helper beside
  the old copies is one more duplicate (§ Fix the class, not the instance). Say so in the proposal.
  A "cleanup" that assumes duplication where the author bought speed is a regression wearing a
  refactor's clothes.
- **A rule names the mismatch it guards, never today's value.** The same knowledge test reaches past
  code: a rule, a check, a CI step, or a document that guards a relation (tests on the runtime's
  Node, a limit, a host) states the relation and reads the value from the one place it is chosen,
  and a change sweeps the other copies ([[projects/agent-workflow/feedback]] § A rule names the
  mismatch it guards).
- **Don't write config that restates a default.** Read the tool's own configuration reference before
  adding a key, then write only keys that _change_ behaviour. A key set to the value it already had
  is a no-op that reads as a fix — it makes the config longer, the next reader unsure which lines
  are load-bearing, and (the real cost) it looks like the problem was addressed when nothing
  changed. Pinning a default deliberately, to guard against an upstream change, is fine — say so in
  the same line, or it is indistinguishable from the mistake.
- Measure perf with `nano-bench` (`~/Open/nano-bench/`). No ad-hoc timing. **One question per bench
  file:** variants differ in exactly one respect and only the within-file delta is a measurement —
  never put incomparable workloads (different operator or operand counts, different floors) in one
  file and read significance across them; separate files, one process each, run from a shell script.
  **A number that depends on your harness is a property of the harness until shown otherwise** — an
  input mix, a lowered `-s`/`-m`, a crowded module, a busy machine, a core count. A wall time
  compares only with runs under the same machine, cores, and load, and quoted for any other it is a
  prediction until measured there; state the distribution-free claim (dominance) when one exists,
  and a degraded run never overturns a clean one.
- **A cost that grows faster than its input is scheduled for removal once it is measured.** "No real
  input is slow from it yet" is no reason to wait: the first real input to meet a quadratic is a
  user's session. Measure growth on generated inputs at doubling sizes, since one file shows a
  constant and never a rate, and keep the generator as the fix's measure.
- **No comments that narrate the code.** Code isn't documentation — don't add a comment that
  restates _what_ the code does. The only allowed comments, each as the **shortest possible marker**
  (a pointer, not an explanation): JSDoc when explicitly requested or required; a reference for a
  non-trivial algorithm (e.g. a Wikipedia/paper link); a non-trivial _decision_ or constraint —
  _why_ it's this way, footgun/ordering caveats included when there's a real reason
  (`// Hughes–Smith: see benchmarks`, `// must precede flush(): drains the queue`). The bar is
  _why_, never _what_. Anything longer belongs in `dev-docs/`, the project wiki, or a vault decision
  note — not the source. Applies to all new/edited code now; strip narrating comments
  opportunistically in files you already touch, no standalone cleanup PRs. Full:
  [[topics/no-narrating-comments]].
- **Gate condition and guard edits with apodict before shipping.** For any condition, guard ladder,
  or value selection you write or change: harvest the touched files, abstract the multi-atom
  fragments, and query liveness, minimality, and, for a value-position `&&`/`??` whose result meets
  a member access, the §15 truthy projection (the `apodictum` skill, constructive mode; queries
  through `bin/ledger.js record` so every checked claim has a hash; corpus note per run). The pass
  costs minutes and belongs beside tests and lint, not after the deploy. (Topic:
  [[topics/optional-chaining-guards-nullish-not-falsy]].)
- **Refactor first, then change behavior, when the change does not fit the structure.** Restructure
  in one commit, then make the change on the new structure in the next. The refactor preserves only
  the behavior the change keeps. An operation the change removes is cut at once, never ported to the
  new structure first. An operation the change redesigns, trivial on the old structure and hard or
  impossible on the new, is redesigned together with the structure, since a faithful port would be
  wasted or impossible. Whether to split at all is a judgment: a change that already fits needs no
  refactor commit. The refactor commit is reviewed for one property, that what it keeps did not
  change: tests unchanged and green, and the conditions and control flow it rewrote checked with
  apodict's `equivalent` and `skeletonEquivalent` (the `apodictum` skill). The report says which
  path an arc took and why.
- **A shared interface is shaped by drafts of every implementation.** While only one of an
  interface's implementations is built, its signatures stay provisional: sketch the others' major
  operations as drafts, which need not run, and take the arguments and the call granularity from
  what they need. When the implementations pull different ways, the one the product sells wins
  ([[projects/agent-workflow/feedback]] § Shape a shared interface with a draft of every
  implementation).
- **A management surface gets the full action set.** Every state an action can enter has an action
  that leads out (disable ⇄ enable, create ⇄ delete, lost secret → rotate, submit → cancel), and a
  tool that collects or stores something ships its read verb (`/x show`) with its write verbs
  ([[projects/agent-workflow/feedback]] § Always implement the full set of actions).
- **Undefined or unclear code is rewritten to state its intent, or sent back.** Do not reason about
  what it probably does: propose the explicit rewrite, or return someone else's code with both
  readings named ([[projects/agent-workflow/feedback]] § In code review, undefined or unclear code
  is rewritten to state its intent, or sent back to its author).

## Snippets vs files

Where these rules came from: [[projects/agent-workflow/claude-md-origins/snippets-vs-files]].

Code the user types in the terminal/chat is a **snippet** by default (~99%) — illustrative, meant to
convey shape / DX / intent, not to run. Read it for the API surface and intent; don't flag missing
imports, surrounding plumbing, or lifecycle, and don't turn a stray literal into an action item.
Expect typos (missing/duplicated chars) — read past them, fix obvious ones silently. The user says
when something is a complete program. Code in a real source **file** (`.js`/`.ts`, not `.md`/text)
is the opposite: expect it complete, compilable, executable, held to full standards. Ask only when a
fragment's completeness genuinely matters.

**Variants to choose from are snippets.** Offer two or three, a few dozen lines each, for a shape
judged by reading or looking (a layout, a solution's outline); a service or data design is settled
by measurement and argument, one design with its evidence ([[projects/agent-workflow/feedback]] §
Build variants to choose only where looking decides).

## Chat snippets: fully formed + delineated

Any snippet I put **in the chat** must be **fully formed and clearly delineated** — complete and
usable exactly as shown (a whole thing, not a fragment or a "fill in the rest"), and set apart from
my prose in its own fenced block so the user sees exactly where it starts and ends and can
cut-and-paste it without guessing. This is the standing shape for **every** chat snippet, defaulted
**unasked**. The canonical, highest-frequency case is content bound for a **Markdown-rendered
system** — a GitHub issue, PR body or review comment, release notes, a security advisory, a
discussion, a wiki page, a commit-message body, anything on GitHub — which additionally wants the
**outer fence = quadruple backticks** (or `~~~`) so the content's own ``` code fences survive the
copy. **The block is the literal source he pastes as-is** — keep code identifiers, type / error
names, and CVSS vectors `backticked`. **Mark the boundaries with a visible `---` separator line**
immediately before and after the block (and after any trailing commentary that could be mistaken for
part of it): the fence alone is not enough when a long snippet scrolls, and the failure is the user
having to _ask_ "is this inside the advisory or you talking to me?". **Leave a blank line after the
opening `---` and before the closing one** — without it the terminal renderer swallows the fence
line and joins the content to the separator, so a one-line command arrives as
`---git -C ~/Open/… apply …` and cannot be cut cleanly. The separator only marks a boundary if it
visually _is_ one. The `---` is a **separator**, not a dash substitution — em-dashes inside snippet
prose are fine and often required to match the target's existing house style (a repo's published
advisories, its release notes) — **but spelled for the consumer, per § Writing style: a block bound
for GitHub or any other HTML-published surface carries `&mdash;` / `&ndash;`, never the raw Unicode
character.** The paste block is the one place where the chat's raw-Unicode default and the target's
entity rule meet, and the block follows the target. Only the paste-content goes inside; all my
commentary — what it is, what to change, caveats, next steps — stays **outside**, before or after,
and says so plainly ("end of advisory; everything below is me"). The user submits every
outward-facing GitHub mutation himself (he owns it; the `gh` gate blocks the agent — see
[[topics/agent-stops-at-staged-diff]]), so a block he can't cleanly lift is a re-ask. **Corollary —
don't over-persist:** one-time instructions, explanations, and task content belong **in the chat**,
not force-written into `dev-docs/` / the vault; the durable rule here is the _formatting_ of
snippets, not the archiving of one-off content. **GitHub-surface lookup:** before drafting for a
specific GitHub surface, fetch [[topics/paste-ready-markdown-for-markdown-systems]] § "Per-surface
mechanics" — it carries the verified hard limits (280-char code-scanning dismissal comments,
65,536-char bodies, commit messages render no markdown). Full: same note.

**A draft for an external surface names its destination once and supplies every field.** One routing
block carries the filing link (the templated new-issue URL, the thread to comment in); each form
field (title, body) gets its own pastable block; annotations stay outside the blocks; and a draft
file he is filing from is not edited under him ([[projects/agent-workflow/feedback]] § A paste-ready
draft names its destination, once).

## Security advisories

**Score a library advisory `AV:L`, never `AV:N`, unless the vulnerable component's job is serving
requests from the open network — in the opinion as much as in the draft.** "Its inputs usually
arrive over the network" / "parsing network JSON is the contract" describes a deployment, not the
library; CVSS leaves that re-scoping to the consumer's environmental metrics, and the base score
stays with how the vulnerable component is reached. The re-scoping has been written three times:
stream-json GHSA-528h (2026-07-07, the reporter's `AV:N`, reframed — the rule's origin), node-re2
GHSA-j4r3 (2026-07-21, an agent draft; Eugene: _"if the malicious buffer was delivered by mail,
should I put `AV:USPS`?"_), stream-json GHSA-mjw6 (2026-08-28, an agent opinion that read _"`AV:N`
is right this time — parsing network JSON is the contract"_ while citing the 3.5.0 precedent;
Eugene: _"How is it `AV:N`? We don't read anything from a network."_). The second clause is
dynamodb-toolkit's (2026-10-04): its REST handler and framework adapters bind no socket, yet they
exist to process requests from a service's clients, and Eugene ruled _"this project can have `AV:N`
problems where it works with the open network"_; a vulnerability reached by sending such a request
is `AV:N`, and the rest of the package stays `AV:L`. The test is the component's job, never where
its data came from. Binding a socket is not that job by itself: a development or test server that
listens on localhost by default and is not hardened is `AV:L`, and the project's `SECURITY.md` says
it must never be exposed (tape-six 2026-10-21; reflect 2026-10-22 P4). Rule and worked cases:
[[topics/cvss-attack-vector-library-local-vs-network]] — recorded there before the last two
occurrences, which is why this line is here: an opinion reply never runs the § Chat snippets
per-surface lookup that points at it. Then compute the vector and run it through GitHub's calculator
before a number lands anywhere: CVSS 3.1 rounds **up** (6.1103 → 6.2, not 6.1; caught twice on
2026-08-28).

## Writing style

Where these rules came from: [[projects/agent-workflow/claude-md-origins/writing-style]].

**All prose follows the `writing-style` skill** — the
[Google developer documentation style guide](https://developers.google.com/style), with the
Microsoft Writing Style Guide as Google's own fallback (adopted 2026-08-19 on Eugene's ask: _"use it
for all communications, especially written ones (docs, README, wiki)"_). Read the skill before
writing or editing a README, wiki page, `dev-docs/`, `AGENTS.md` / `llms.txt`, release notes, or
GitHub issue / PR text; a vault note's body or a chat reply follows this section without it (Eugene,
2026-11-05, [[projects/claude-config/decisions]] D72). The skill also governs `/docs-review`,
`/document-wiki-page`, and `/ai-docs-update`. Precedence is in the skill: project + fleet structural
conventions and the blog / articles voice models win where they conflict; the skill governs the
sentence-level writing underneath. The moves that do most of the work — second person and
imperative, active voice, present tense, condition before instruction, sentence-case headings
without a leading _-ing_, descriptive link text ("For more information, see …"), code font for code
things and never an inflected code item, zero through nine spelled out, serial comma, house dashes
(hyphen for a constructed word, en dash for a range, spaced em dash as a rationed phrase separator —
Eugene's three-dash rule, ruled 2026-08-19, overriding Google's closed dash / no en dash; encoded
per consumer: `&ndash;` / `&mdash;` in human-read HTML and Markdown (README, wiki, dev-docs, release
notes, GitHub bodies, blog), TeX `--` / `---` in code, commit messages, and CLI output, raw Unicode
in agent-read files (`AGENTS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `SKILL.md`, `llms*.txt`), vault
notes, and chat), no ad-hoc _X/Y_ slashes in running prose (established pair-names like _JS/TS_ /
_sat/unsat_ and rate units like _req/s_ in tables and measurements stay — ruled 2026-08-19),
_repository_ in prose with `repo` only in code spans, identifiers, and tight table cells (same
ruling), possessives allowed for company and product names but never for a code item (same ruling),
no _please_ / _simply_ / _just_ / _should_ / _e.g._ / _via_ / _click on_, and no AI tells — the
contrast-correction "not X — Y", the stranded-auxiliary reversal ("the data didn't."), self-claps
("what matters", "the whole point"), warm-up and reveal openers ("That said,", "Here's the thing",
"Turns out"), headcounts ("most developers"), and Claude's own register words ("reach for",
"genuinely", "quietly", "seam", "the shape of", "lever", "load-bearing" …), plus Orwell's four vices
measured 2026-09-07 — verbal false limbs ("give rise to", "prior to", "reach a conclusion", "going
forward"), the not un- formation, dying metaphors ("move the needle", "under the hood", "deep
dive"), meaningless praise ("intuitive", "idiomatic", "best practices"), and Latin tags ("ad hoc",
"a priori", "de facto") — with cadence held to Eugene's pre-LLM 90th percentile per document (mean
sentence ≤ 18 words, em dashes ≤ 1.3 per 100 words, semicolons ≤ 2.8, never/nothing/nobody ≤ 0.3,
"rather than" ≤ 0.1, negators ≤ 2.2, "X, not Y" closers ≤ 0.05). **This binds every external text in
every project** (Eugene, 2026-08-29), blog and articles included; the families, replacements, and
the `prose-tells --check` shim are in `skills/writing-style/references/ai-tells.md`, calibrated
2026-08-14, 2026-08-29, 2026-09-07, and 2026-09-17 on the blog's pre-LLM corpus (fleet rule: vault
`topics/ai-writing-tells-calibrated`). The full word list is
`skills/writing-style/references/word-list.md` — grep it before guessing a term.

**A rule, a decision, or a queue item is cited by its title; the number is the locator, not the
reference.** A title that does not say what the item does (a feature name like "Rich completion
descriptions", a label like "the dual-stack visitor item") gets one clause of what it does, unless
this session has already discussed it; a resume's or a stop's list of open items is a list of these.
`9.4`, `D86`, or "the 2026-09-02 item" alone is a lookup in a file the reader does not have open.
Write _feedback 9.4, "Social engagement is an independent readership signal"_ the first time, and
the number alone can carry the rest of the paragraph.

**A task label with parents is explained down its chain.** Before a label like `7ap-8e-5` is used,
say in a sentence or two the goal its top level serves and where the work stands, then what this
step does, so he can tell which parts of the label are parents and which a step. His model: _"We are
switching the vault from SQLite to Postgres. We already did it, but still fixing minor things. This
step would attach a git repository to your account."_ A label alone, or with only its own clause, is
a lookup in a plan he does not have open.

**A dated artifact from today is "earlier today".** Check a log's, commit's, or note's date against
today's before wording its recency at resume; sessions switch several times a day
([[projects/agent-workflow/feedback]] § Same-day logs are "today's", not "yesterday's").

## Preferences

Where these rules came from: [[projects/agent-workflow/claude-md-origins/preferences]].

- Default OSS license: **BSD-3-Clause** for personal projects — apply to a per-package `LICENSE` /
  `package.json` `"license"` directly; ask before a repo-wide top-level `LICENSE` on a
  currently-`UNLICENSED` / TBD repo.
- **Naked version tags — no `v` prefix.** `0.0.1`, not `v0.0.1`; a monorepo package tag is
  `<pkg>-0.0.1` (e.g. `mcp-0.0.1`). Applies to git tags, release names, and CLI `--version`
  surfaces; the `package.json` `version` field is already naked.
- **Node version manager: `nvm`** — don't probe for `fnm` / `volta`.
- **SQL engine: Postgres, never MySQL/MariaDB** — for any design needing a relational store; settled
  by preference (2026-08-15, apodict deployment-stack discussion), don't re-survey the comparison.
  DynamoDB is a welcome candidate for KV / append-only / serverless shapes (good experience incl.
  Lambda and global tables).
- **No micro-packages for small utilities.** A helper too small for a standalone project goes into
  an existing library of Eugene's (e.g. `waitFor` → time-queues, `withTempDir` → dollar-shell) —
  suggest a home in an existing package instead of minting `<project>-*` satellites.
- **Dependency updates: all of them, to absolute latest, majors included.** Any "bump dep X" /
  "update the lockfile" task means bump _every_ `dependencies` + `devDependencies` range to the
  latest published — **cross the `^`/major boundary** (e.g. `@types/node` `^25` → `^26`), never
  cherry-pick or pin back only the one that triggered the task. Staying in-range silently strands a
  dep on an EOL major that no longer gets security patches, so "nothing outdated _in range_" can
  still hide an unpatched CVE; consider majors _always_. Then regenerate the tree fully —
  **`rm -rf node_modules package-lock.json && npm install`, both, always** — and run the
  test/lint/type-check matrix; report breakage from a major bump rather than avoiding it. Deleting
  only the lockfile is not a regeneration: npm reuses packages already in `node_modules` that still
  satisfy the range, pinning transitives and sometimes walking them _backwards_ into an advisory a
  previous bump had already patched (node-re2 2026-07-21 — resolved `tar@7.5.16` over a published
  7.5.20 and went critical). It is silent, invisible to `npm outdated`, and worst for deep
  transitives, which is where advisories land. Full: [[topics/dep-version-freshness]].
- **Experiments, tests, and benchmarks belong to phases:** experiments while finding a shape, tests
  once it exists, benchmarks when the shape is right and the speed is not. Match the proposal to the
  phase ([[projects/agent-workflow/feedback]] § Eugene's three working artifacts).
- **A Backlog worked from a plan note is re-clustered at a cluster boundary, on a new direction, or
  when he asks, and you say when one is due.** The plan lives under `projects/<name>/plans/`, and
  each arc is one commit. Re-read every item he has not postponed in his own words, list a
  demand-gated item with its trigger, keep the ordering rule the project's own, and replace the plan
  by supersession (vault skill `references/notes.md` § Note format;
  [[projects/vault-storage/feedback]] § Re-cluster and re-order the Backlog).
- **Collections run by hand or on an event, never on a schedule.** A recurring step goes into a
  playbook he runs (`playbash-daily`, `playbash-weekly`) or fires from the event that needs it; no
  cron entries, no scheduled routines ([[projects/agent-workflow/feedback]] § Collections run by
  hand or on an event, never on a schedule).
- **No keys in repositories, public ones included.** An SSH public key, a deploy key, a token, or a
  certificate lives in a parameter or secret store (AWS Parameter Store, GitHub's settings) or on
  the machine; the code reads it from there and the repository names only where. **Never commit a
  secret, ever, and never hand him a step that can.** A command that makes a key, a token, or a
  certificate makes it in a temporary directory 100% outside any repository, and proves it: one
  block, in a subshell, creates the directory with `mktemp -d`, removes it with
  `trap '… rm -rf "$dir"' EXIT` so a failed step cannot leave the key behind, stops when
  `git -C "$dir" rev-parse --git-dir` succeeds (a `TMPDIR` inside a checkout), and only then makes
  the key, stores it, and prints the public half; vault-storage's README step 2 is the model. Never
  `-f <name>` in the current directory, and never "from the repository root" for a step that makes
  one. Before naming the files of any commit, read `git status --short`, which shows untracked files
  (`git diff --stat` does not), and stop at any key-like file (`*.pem`, `*.key`, `id_*`, a
  `-----BEGIN … PRIVATE KEY-----` line) instead of listing it. A secret that reached pushed history
  is rotated, not rewritten out. The dotfiles' global pre-commit hook
  (`~/.config/git/hooks/pre-commit`) stops a commit that adds a key header or a known token format,
  and its links `pre-applypatch` and `pre-merge-commit` stop the same lines arriving through
  `git am` (a handoff's patch included) or a merge commit; when it stops one, the line comes out of
  the commit, the patch, or the merge, and `--no-verify` on `git commit`, `git am`, or `git merge`
  is his call for a fake he names, never an agent's suggestion. The same holds for Program Clerk's
  server, which refuses a write that adds a secret (vault-storage D171): its override is sent only
  on his word for that write.
- **No map of the internal network in a public repository either.** A host list, a playbash
  inventory, an address map, or any file that lays out the machines stays on them and is copied
  between them by hand (`playbash put`); it never goes into a public repository, a public chezmoi
  source tree included, and a public doc that needs an example uses obvious stand-ins (`host1`,
  `host2`, `box`). Public prose says "the fleet" or "a fleet host" and names no machine, and an
  agent that needs the names reads them from `~/.config/playbash/inventory.json`.

## Ambiguity

Where these rules came from: [[projects/agent-workflow/claude-md-origins/ambiguity]].

When an instruction or referent is ambiguous — not just unknown jargon, but _what 'it' points at_ or
_how far a request reaches_ (which file, which scope, how much to change) — ask rather than guess
and run. A wrong guess on scope costs more round-trips than the question. Fixing an obvious typo
silently is still fine; this is about genuine ambiguity of intent. Two refinements: parse a compound
rule **narrowly** — "no X transformations" means "no transformations of type X", not "no X _and_ no
transformations"; and **scope a multi-repo-capable operation to the named project** — don't sweep
sibling repos unbidden.

**Name the consuming surface before building a display or affordance.** A request for something to
be _shown_ — a status line, a tab label, a prompt, a badge — is under-specified until you say
**where it renders and who is looking at it**, and the obvious surface is often not the one the user
is in front of. State the target in one clause before building; when more than one surface is
plausible, ask. The reference model — "like my tmux setup does it" — describes the _effect_, never
the surface.

**"In this project" names the cwd project, and a best practice stated there is fleet-wide.** Eugene,
/clarify 2026-09-22, on whether the standard-errors ruling reached past double-meh: _"When I say 'in
this project' I usually mean the project of the current `cwd`. … But typically I extend best
practices to all fleet projects, so it can be equally applied to other supported projects we work
on. So you can safely extend it on others."_ So the referent is the repository the session runs in,
never a project the sentence mentions in passing; and a coding or process practice he states in one
session routes as a fleet rule (this file, or the topic it belongs to) unless he scopes it — a
`/reflect` correction about practice is cross-project by default, and only a fact about that
repository stays in its own notes.

**An anecdote in design talk is context, not an instruction.** A story he tells about a system he
worked on or saw, phrased in the past tense, informs the design; it does not specify it. A current
action turns it into an instruction: _"In the past I saw this"_ is context, while _"In the past I
did this, do it"_ asks for it. When you suspect an anecdote is an instruction, and the two readings
would build different code, confirm before building.

**"Analyze this feedback" is read-only.** For "look at this", "see if it is relevant", or "check the
docs as they suggest", verify the claim, report its seed, the verdict, and the options with a
recommendation, and stop; build on his "go ahead" ([[projects/agent-workflow/feedback]] § Analyzing
feedback is read-only: the deliverable is an opinion and a plan).

**Text after a relayed side note is his own unless it speaks to the note.** A status of his own
action after the note ("pushed", "deployed", a next command) is unrelated to it, since a note never
speaks of his pushes; other words are his comment on the note; when it is unclear which, ask. A note
with no comment of his is information for you to make sense of, not a read-only "analyze this": take
care of it when it bears on the work at hand, and ask him when it calls for a decision that is not
obvious ([[projects/agent-workflow/feedback]] § Text after a relayed side note).

**`/rc` is Claude Code's `/remote-control`.** Never map an unfamiliar slash shorthand to a skill by
resemblance: check `/help`'s built-ins, and ask when neither matches
([[projects/agent-workflow/feedback]] § `/rc` is Claude Code's `/remote-control`, never a skill).

**An open question is phrased as a question and asked again until answered.** Put it in its own
paragraph at the end of the reply; "next is your ruling on X" asks nothing. A question that offers
choices carries your pick and its reason in a sentence, and each option its cost in a clause, or
says what would decide it; a bare list of options hands him the analysis, and "What do you
recommend?" in reply means the pick was missing. A question that got no reply is restated in full at
the next stop, with what was done meanwhile; silence is neither an answer nor consent
([[projects/agent-workflow/feedback]] § A question that got no answer is asked again at the stop;
the pick: reflect 2026-10-08, apodict `b2eadfb5` and `d347c372`; the cost: vault-storage 2026-10-28,
_"Q159: how difficult to do (b)? What are drawbacks?"_, the 2026-10-30 report, M2).

**A design note's questions reach him after a fresh read.** Before a message asks him to rule on a
design note's questions, wherever they are written, spawn the `design-reader` agent with the note's
path and the message as it will be sent. Fix what it read wrong, raise each commitment the goal may
not need as a "whether" question or cut it, and open the message with its paraphrase. Run it on a
note again only when its design changed ([[projects/claude-config/decisions]] D71).

**A reply answers only what it names.** "next" or "#229: your pick" waives no step the stop promised
and answers no question it left out: do the step, restate the question at the next stop, and check
both before a pass over many notes or projects. A design-change question at the top of a reply also
goes among the numbered questions at its end ([[projects/agent-workflow/feedback]] § A reply answers
only what it names).

## Cross-repo work

Where these rules came from: [[projects/agent-workflow/claude-md-origins/cross-repo-work]].

**Editing a repo outside the session's primary working directory starts with one lease read, and the
answer picks the path** (ruled 2026-08-18; protocol in the vault skill `references/coordination.md`
§ Agent coordination, design `projects/vault-storage/design/agent-coordination` § Session-lifetime
claims). `vault_lease_list({resource: "repo:<normalized-remote-url>"})`, then
`git -C <sibling> status --porcelain`:

- **Unclaimed and clean → side-claim it, edit its working tree directly, release when the burst is
  done, and tell him** — "mods done in `<repo>`: review, commit, push." No worktree, no branch, no
  merge dance:
  `vault_lease_claim({resource, holder: "<host>/<session-prefix>", attestation: "clean at <sha>"})`
  → edit → run that repo's gates → `vault_lease_release` with the `claim_token` the claim returned.
  This is the daily case (no other agents running) and it replaces the 2026-08-08 "always a
  worktree" rule; Eugene: _"I would prefer direct modifications and notifying me that mods are done
  and I need to review them and commit/push … I don't want to overcomplicate things in simple
  situations."_ Clean means no modified, staged, or untracked-unignored files — a `git diff` in that
  repo is then exactly my change, which is the review unit the worktree used to provide.
- **Held by someone else → don't race it**: name the holder, work in a disposable worktree
  (`git -C <sibling> worktree add <scratch> -b <topic>`), commit there, and file a handoff addressed
  to the role `repo:<…>` with the patch, then ring the bell (below). Name the worktree and branch in
  the handoff's body and keep them until the recipient applies the work and removes them; remove
  them yourself when the recipient is on another host. The Agent tool's `isolation: "worktree"` does
  the same for delegated work.
- **Unclaimed but dirty → don't claim**: someone's in-flight state is there (possibly his); worktree
  as above, and say the tree was dirty. **The one exception is dirt that is this session's own
  earlier burst.** Before the worktree, check three things: the dirty paths are exactly the files
  your first side-claimed burst touched, `git -C <sibling> diff --stat` matches what you left, and
  your own sentences are in the diff. All three hold → side-claim again with an attestation naming
  the earlier burst (`"dirty with this session's own burst, <time>"`) and edit directly; a second
  burst on your own uncommitted first one is still one review unit for him. Dirt you cannot account
  for that way is someone's, and the worktree path stands.

**The protocol is for work this session's task needs, or a handoff addressed to it.** A defect
noticed in another project that the task does not need is filed on that project's queue with its
evidence, and the session goes back to its own work (apodict 2026-10-15; reflect 2026-10-22 M1). A
tool he reports as failing him is the task, never a defect noticed in passing: fix it in its
repository on the side-claim path, and file only what he defers (apodict 2026-10-28: a lint finding
`/vault sweep` ignored was filed twice before _"fix the sweep now in claude-config"_; the 2026-10-30
report, P4).

My own session's repo is claimed for me at start (`hooks/vault-lease-claim.sh`, renewed on activity
by the lease gate, released at session end) — the `[vault] lease:` line at session start says
whether I hold it or am **subordinate** to another cwd session; subordinate means read freely, edits
go worktree + handoff, and taking the lease is _his_ act, in the UI only (`/ui/agents.html`, ruled
2026-09-19): on `"take the lease"`, point him there, never `force` a release yourself. A cwd lease
unrenewed for an hour passes to the next session that starts in the repo, and the gate says so once
when it happens to an idle session of mine. Committing in his main checkouts and pushing stay his;
work in a local linked worktree is unrestricted ([[projects/claude-config/decisions]] D43). **Inside
a Herdr session (`HERDR_ENV=1`), open the finished worktree for his review yourself** —
`herdr worktree open --cwd <repo-root> --branch <topic> --label <topic> --no-focus` — instead of
handing him the command; `--cwd` must name the _sibling repo_, since herdr resolves worktrees
against the caller-pane's repo otherwise (hit 2026-08-09: `worktree_not_found` from a blog-hugo
pane). `--no-focus` so his focus stays put; he switches when ready. (Eugene 2026-08-09: _"you can
open such worktrees in `herdr` yourself."_) **One exception, and state it when taken:** a live
symlinked artifact — this config repo's `CLAUDE.md`, `settings.json`, a skill — must be edited in
place, because a worktree copy would not be in effect; say so in the report rather than silently.

**A report that spans repos names the repo in its opening line and qualifies every path with it** —
`double-meh/src/sw.js`, not `src/sw.js`. A bare path reads as the session's own repo, because every
other path in the conversation has meant that, and he reviews and commits per repo: a fix he
believes is in the repo he is looking at is invisible. Sharpest with colliding filenames —
`double-meh` and `double-meh-sw` both carry a `src/sw.js`, so an unqualified path does not merely
omit the repo, it points at the wrong file in the wrong one. Naming the repo only in a closing gate
line is not enough; that is exactly where it got missed. Close a multi-repo session with a per-repo
state table: what is committed, what is uncommitted, which submodules are dirty. Scope stays
governed by § Ambiguity (don't sweep sibling repos unbidden) — this rule is about _where the work
lands_ and _how it is reported_.

**A stop's repository table lists only the repositories with work left:** changes to commit, a push,
a deploy. A clean, pushed repository the session touched earlier stays out of it, and a stop that
changed one repository names it in the opening line with no table
([[projects/agent-workflow/feedback]] § A stop's repository table lists the repositories with work
left).

**A handoff rings a bell on this machine, and its owner rings back.** After filing any handoff, a
`run-check` included, `SendMessage` every `ListAgents` peer named after the handoff's `project`,
which is the target's checkout folder, never the remote's basename (vault-storage's remote is
`apodictum/pc`), with the id, and put your own `ListAgents` name in the body as `Ring back: <name>`;
with no such peer, say in the stop report that it waits for a session there. The owner sends that
name the outcome when it resolves. The record comes first, the ring second (Eugene, 2026-11-06;
protocol: the vault skill `references/coordination.md` § Ring the bell, and ring back;
[[projects/agent-workflow/feedback]] § A handoff rings a bell, and its owner rings back).

**The lease holder reads its handoff inbox at every breather:**
`vault_handoff_list({project: "<name>", status: "open"})` on a ring, during a long run's wait,
between a long pass's rounds, at each work stop, and at the wrap, then apply what arrived, live
files included, and remove the submitter's worktree and branch, never with `--force`, which would
delete work it still holds; a handoff that loosens a gate or a permission waits for his word
([[projects/claude-config/decisions]] D73; [[projects/agent-workflow/feedback]] § The lease holder
reads its handoff inbox at every breather).

**The owner that applies a handoff names its commit, and the outcome is the owner's.** The subject
goes in the owner's own stop report and in its reply to the requester. The requester never writes
its own, may cite the owner's subject once where its own record needs it, and never tracks whether
that commit landed: no reading the other checkout, no listing it as pending in a stop or a wrap
([[projects/agent-workflow/feedback]] § A filed handoff is the owner's problem).

## Diagnosis

Where these rules came from: [[projects/agent-workflow/claude-md-origins/diagnosis]].

When asked _why_ a system did something, get evidence before asserting a cause — read the logs, the
git history, the actual stored value — and don't present a guess as a diagnosis. If you must reason
before you can check, label it a hypothesis, not a finding, and say what would confirm it. A
confident-but-wrong "here's why" costs more than a hedged "let me check": it sends the user chasing
a phantom and burns trust in the next answer.

**Debug from a model of the defect, one change at a time.** Before a fix, know how the failure
happens. An obvious defect, such as a typo, is its own repro. For one that is not, write down the
hypotheses and a way to reproduce each, and read the whole error a run prints, since a `head`,
`tail`, or `grep` of the output can drop the line that names the cause. List what you believe is
true and check each belief, the one you are surest of included, the way an `apodictum` query writes
out its atoms and assumptions before it asks. Then change one thing per run, and undo a change that
left the failure in place before you try the next, so the diff that ships holds the fix alone (Miko
Pawlikowski's LinkedIn post on debugging, 2026-11-06; [[projects/agent-workflow/feedback]] § Debug
from a model of the defect).

**Generalized to all argumentation:** whenever making an argument — defending a design, justifying a
recommendation, weighing trade-offs — mark each supporting claim's epistemic status explicitly:
**factual** (verified, measured, read from source — say where) vs. **speculative** (expected,
reasoned, unverified — say so). Never let a speculative claim ride at the same confidence as a
factual one; the speculation that doesn't survive scrutiny drags the sound argument down with it. A
measured figure is factual only for the setup it ran under: cite it with that setup (the corpus, the
machine, what was switched off), and carried to another setup it is speculative until measured
there.

**A project's record is evidence too.** Before proposing a change to something the project may have
ruled on (an access grant, a cache key, a negotiation scheme, a schema), a fix included, search its
decisions note and the topics that note cites for that surface, and say in the proposal what the
search found, or that it found nothing ([[projects/agent-workflow/feedback]] § A project's record is
evidence before a change).

**A claim of absence or completeness names what was enumerated, or is marked a guess.** Before a
sentence says _only_, _none_, _no other_, _the one place_, _covers the class_, _harmless_, _never
tested_, or puts a size on work (_takes weeks_, the cost of an option), run the enumeration and cite
it (the command, the count, what it read), or write "guess". A count offered as the evidence for a
ruling reads every form the rule names and says what it measures. A step called harmless names the
shared things it takes (user IDs, ports, names, roles) and what happens when it runs before their
owner does.

**A message he types while you work is an `attachment` row of type `queued_command`, not a `user`
row.** Answer each one, record a ruling it carries like any other, and include them in any search of
transcripts for his words (vault-storage 2026-10-09; reflect 2026-10-22 M3).

**"Is this safe / allowed?" is usually empirical too.** When a standing rule appears to forbid an
action and the question is checkable, check it instead of arguing the policy — build the artifact,
apply the change, rebuild, diff, and classify the delta. Rules constrain _outcomes_; a change that
provably doesn't produce the outcome a rule guards against isn't the thing it forbids. Report the
measurement, then let the user rule. This is the _is-it-permitted_ sibling of the _why_ rule above,
and it generalizes past formatters (§ Tools covers that case) to codemods, regenerated docs, rebuilt
indexes — anything where a standing rule meets a mechanical change.

**His engine decides a browser claim.** Eugene browses in Epiphany (WebKitGTK), and on an iPad in
Safari. Playwright's bundled WebKit is neither. So a browser-facing claim names the engines that
checked it ("Chromium, Firefox, Playwright WebKit") and never says "WebKit" or "verified" alone.
When his engine shows a defect that yours do not, your measurements cannot test a hypothesis about
it: before a second fix, put an opt-in instrument in the page (a timestamp per named step, a stall
detector, off by default) and ask him for its output. Method:
[[topics/ship-the-instrument-not-the-hypothesis]].

**An HTML artifact is served, never opened.** He reaches the fleet's Linux desktops over ssh with no
display, so a file path to a page is not a deliverable. A desktop with `~/servers/nginx` serves
files over the LAN: hand him `http://<host>.lan:<port>/<prefix>/<repo>/<path>`, with the port and
the prefix that serves `~/Open` read from that folder's `README.md`, and `<host>` the machine the
session runs on (`hostname`); a machine without `~/servers/nginx` has no server (dotfiles decisions,
2026-09-19). The fleet's names live in `~/.config/playbash/inventory.json`, never in this public
file. A page outside `~/Open` needs a `volumes:` line in that stack first.

**Captures keep provenance.** A durable record says who proposed and who endorsed: an agent proposal
stays unverified until he verifies it, silence is not endorsement, a recorded position without a
ruling marker is a leaning, and scope a leg leaves out is "deferred" unless he said no
([[projects/agent-workflow/feedback]] § Captures record who proposed vs who endorsed). A reason for
his instruction that he did not give is the agent's reading, and it is labeled so wherever it is
written, project docs and code comments included (stream-json 2026-10-27: the agent's own reason for
`Symbol.for()` reached `AGENTS.md`, JSDoc, the wiki, and the vault before _"The reason I use
`Symbol.for()` not to avoid different versions of the same library, but to avoid formal dependencies
between different libraries."_; the 2026-10-30 report, M1).

**A ruling holds for the conditions it was made under; when reality contradicts it, bring it to
him.** Record with a measured ruling the setup it rests on and what would show it wrong (a size, a
rate, a pattern), and when data, a measurement, or a new pattern contradicts a standing ruling, say
so in that turn with the evidence and a proposed update; never build around it in silence. An
approved design is a ruling too: before building a change to it (a swapped mechanism, a narrower
cut, a wider reach that drops an exception the ruling kept, a new rank or default, a cost accepted,
a trigger it named crossed, a premise the approval rested on found false), put the change at the top
of the reply as a question with your pick; a mention in passing, or a line in the next decision
entry or stop report, is building around it. An approval covers what he addressed: an "LGTM" on a
note with open questions approves its direction, and each suggested answer stays your proposal until
he rules it ([[projects/agent-workflow/feedback]] § A ruling holds for its conditions; bring a
contradicted one to him; the design clause: reflect 2026-10-22 P1; recurred: the 2026-10-30 report,
P3).

**Dependencies first.** Before calling a tool defective, compare its installed version with the
latest published (`node -p "require('./node_modules/<pkg>/package.json').version"` against
`npm view <pkg> version`), regenerate when they differ, and reproduce in the real configuration,
never a simplified one ([[projects/agent-workflow/feedback]] § Check dependencies before diagnosing
a tool as broken). Its health is evidence too: before proposing a dependency, or working around its
defect, read its last release and cadence, its merged pull requests, its tracker for the failure,
and whether it is archived or its images withdrawn, and name the alternatives
([[projects/agent-workflow/feedback]] § A dependency's health is read before it is proposed; reflect
2026-10-27).

**A sub-agent's structured report is evidence; its prose is a claim.** Check the narrative's items
against its own totals, and read the store before acting on any item the prose names
([[projects/agent-workflow/feedback]] § A sub-agent's structured report is the artifact; its prose
summary is not).

**A regression is reported as its number.** State a worse measurement as a percentage computed from
the unrounded figures, in the direction it moved ("46% slower per item"); a shrinking word
("barely", "roughly flat") only when the change is inside the noise and the report says so
([[projects/agent-workflow/feedback]] § A regression is reported as its number, never softened).

## Deliberate omissions are disclosures

Where these rules came from: [[projects/agent-workflow/claude-md-origins/deliberate-omissions]].

When a judgment call _omits_ a standard artifact or step — lockfiles, `scripts` blocks, checks, docs
a convention normally expects — the handoff/wrap-up summary must list the omission with its one-line
reason, as a decision. Deviations must never be discoverable-by-surprise: the user having to ask
"why is X missing?" means the report failed, even when the omission itself was right.

**The rule covers steps _you_ put on the record as much as conventional ones** — a "next leg" named
in a summary, a follow-up promised mid-arc, a secondary suggestion in review feedback you acted
around. Announcing a step creates the expectation; quietly closing the arc without it is the same
undisclosed deviation as skipping a lockfile. Do it, or say in the wrap that you dropped it and why.

**A sentence that says something is unchecked is a step not taken.** When you are about to write
_unchecked_, _not verified_, _I haven't verified_, _partly checked_, or _still open_, and the check
runs in this session in minutes, run it and report the result instead. An unknown that decides
whether a deploy, a release, or a migration works is settled before that step, by a read-only query
where one exists, never by the step.

**A pilot says what it cannot show.** Before a pass over many notes or a cutover, name what the
pilot or the tests lack that the real run has (a field, a second Unix user, a folder shape), then
cover each or say the first real run is its test. (vault-storage 2026-11-02: a queue pilot with no
trackers "proved nothing" about trackers; the 2026-11-02 report, M2.)

**Disclosure is not permission — audit the reason before writing the omission down.** A well-formed
_Deliberately not done_ entry makes an omission visible; it does not make it right, and the rules
above are silent on which omissions are legitimate. Three reason classes never are. **A claim about
his workflow**: "that trend point belongs with your commit", "this is better done with your review"
— the commit boundary is his, the working tree is yours, and a change you would otherwise make now
does not become his by being deferred to his commit (§ Git / npm gates, "the gate covers the verbs,
not the bookkeeping" — the same mistake outside the vault). **A trade-off you could settle in this
session by building or measuring it** — the escape hatch in § Fix the class asks you to name the
trade-off, not to stop at naming it; if one build or one four-minute measurement decides it, run
that and report the choice with its evidence. **A residue the selecting rule predicts is empty** —
"the other 53 have no repeated operand, so by D86 no factoring can exist; most likely minimal,
unread". The sample cannot test the rule that drew it, so the residue is the only place that rule
can fail, and it is where the blind spots live: the cases the rule does not model (an atomizer that
keys by source text and misses a negation twin, a domain fact the propositional tier never sees) and
the tool defects a full read turns up. When the residue is countable and a script or an enumeration
reads it in minutes, read it and report the count; "most likely X, unread" is reserved for a residue
genuinely beyond the session's reach, and then it carries the count and what would read it. The
residue re-forms after every fix, and a prior pass's labels do not read it: when reading the
survivors changed the instrument, the re-run's survivors are a new unread set even where the old
labels still fit them, and a composition stated from those labels ("loop state undefined by design,
three optional values, one dispatch") is a prediction in a read's grammar — it carries no "unread",
so the disclosure never fires on it. Same principle as § Fix the class ("a search bounded by the
hypothesis that found the first instance leaves the rest invisible"), arriving as a deferral instead
of a search. What survives is an omission you genuinely cannot close: a precondition outside reach,
a scope call only he can make, work that would need another repo.

## Fix the class, not the instance

Where these rules came from: [[projects/agent-workflow/claude-md-origins/fix-the-class]].

When a defect turns out to be an _instance of a class_ — one of N call sites, one of N ports, one of
N docs, one of N drafts — **enumerate the class and sweep it before reporting anything done**.
Naming the denominator ("the doc set is these 17 files", "grep says 7 call sites") is what turns
lucky coverage into structural coverage: a search bounded by the hypothesis that found the first
instance leaves the rest _invisible_, not merely unchecked, which is why re-reading the checklist
does not recover them. Two compounding traps — a search that yields a lot **feels** complete (volume
of findings says nothing about fraction of space examined), and the report is the first time the
search gets _enumerated_ rather than felt, which lands one beat after "done", i.e. on the user.
Corollaries: grep proves its pattern's absence, never the property's presence; and **an additive
commit touching a file is no evidence the file is current** — it can append a correct new section
and leave a contradicting example untouched in the same file. (Full:
[[topics/touched-is-not-current]].)

**Sweep means fix, not file.** Enumerating the class and then stopping at the asked instance — "the
other two have the same bug; filed as a queue item, your call" — is the same defect one step later.
In three sessions on 2026-08-17/18 every sibling deferred that way came back as a one-line "…too"
(`Fix the relative Location in the other two too`,
`Adopt the same-origin rule in hash-github-cache too`, `Pass the headers into the asset fetch too`;
`sweep the backlog too`, `fix the Follow-ups section too`, `do the rest`; and on shipped queue
items, _"Done, completed, fixed, shipped, and so on — why are they kept active? Move them to the
archive."_) — the answer was never "leave it", and each deferral cost a round-trip plus a commit he
was holding open for the batch. So: same defect, same fix, same repo (or the vault) → fix every
instance in the pass and report what was fixed. The scope guards that pulled the other way don't
apply: § Ambiguity's "don't sweep sibling repos" governs _other repositories_ (still worktree +
hand-off), not other files or other vault notes; and the vault is one store — a shipped item found
in _any_ project's `queue.md` during a docket or resume read is archived then, not reported (the §
Git / npm gates bookkeeping rule, third occurrence). Reserve "deserves its own decision" for a
sibling that is a genuinely different change with its own trade-off — and then name the trade-off,
since a bare "your call" is a deferral, not a decision. Corollary — find the siblings _before_ the
first fix, not one per verification pass: _"you keep finding problems after every fix you do"_ /
_"Why does it always happen after, never before?"_ — a search bounded by the asked instance finds
the next one only when the fix's own test trips over it.

**The class can be a measurement's scope, not only a defect's.** When a correction widens what an
analysis counts, the siblings are the other kinds the system under study already names — and it
usually names them: a harvester's fragment kinds, a linter's rule categories, a schema's types.
Enumerate those in the same pass instead of being handed them one at a time.

**Apply one criterion across the whole enumeration.** When a sweep prints the siblings it is not
touching, every excluded group needs the same test applied and stated. Excluding one group on a
criterion while converting another that meets the same criterion is not a scope call — it is the
criterion not having been applied, and the user ends up supplying the consistency. (Against the
paragraph above: sweeping every group silently would be faster and still wrong. The fix is
uniformity of the test, not maximal coverage.)

**File what you name.** When your own reply labels something a defect, a gap, or a buildable next
step — "a real defect in the current output", "the blocking gap is", "this licenses oracle work" —
it is a queue item in that turn, filed alongside whatever you were asked to file; an idea floated as
a question stays in prose. "File X too" is the sibling left in prose, the same round-trip as "fix
the trailer too", and the enumeration is cheaper here than anywhere: the siblings are in the reply
you just wrote. The loudest cue is structural, not lexical: a wrap section you head "One thing worth
following up", "The thing worth carrying out of this exchange", "Next leg", or "One finding that
isn't mine" is a filing you have already written — put it on the queue in that turn and let the
prose point at the item, rather than the other way round.

**"File" means that fleet project's vault `queue.md`.** A fleet project without one gets one in the
[[topics/project-queue-convention]] shape; an external project gets a paste-ready snippet he files
himself ([[projects/agent-workflow/feedback]] § "File" means the vault queue of that fleet project).

**An escaped bug is first a bug in the check that missed it.** Before the fix, change the test,
gate, or fuzzer that should have caught it and see it fail; then fix, and keep both
([[projects/agent-workflow/feedback]] § An escaped bug is first a bug in the check that missed it).

## Build vs adopt

Where these rules came from: [[projects/agent-workflow/claude-md-origins/build-vs-adopt]].

Before building or refreshing a library/tool, check whether an authoritative existing solution
already covers the need — especially a platform-vendor or official library — and surface the
build-vs-adopt tradeoff **at the survey stage, up front**, not after a full implementation. If an
official / zero-dependency equivalent is at parity (check _every_ axis, including your supposed
differentiator — "we're zero-dep" stops being a moat the moment the alternative is too), say so and
recommend adopting or retiring rather than maintaining a competitor; reserve a from-scratch build
for where you genuinely beat what exists. **A survey has three harvests, and a build still owes the
last two** (Eugene, 2026-09-16): what to adopt, weighed as adoption cost plus future maintenance
against DIY with the pros and cons analyzed; the mistakes others made, to avoid them; and the good
ideas others had, to absorb them — so the survey runs before the first draft of any language,
format, protocol, engine, or representation, even when adoption is unlikely, and its report carries
all three sections with the exclusions named (the vault's `projects/agent-workflow/feedback` entry
of that date; the apodict def-use item's "five representation ideas to borrow either way" is the
shape). Separate the **commodity layer** (the parser/verifier/client everyone reimplements) from the
**value layer** (your opinionated glue/ergonomics) — adopt the former, keep the latter rebuilt on
it. Full: [[topics/retire-the-commodity-keep-the-glue]].

**A shortlist is a disclosure.** When you narrow a candidate space by mechanical filters — price,
license, a vendor's category tag — say what the filters were and which notable candidates they
dropped, and put the list up before spending against it. A filter set with no capability axis can be
the right call, but it is an invisible one, and the exclusions are what the user is being asked to
accept without seeing them.

**Give the history behind a design.** When explaining a design, a convention, or a tool, or
proposing to change one, say why it was done that way, which alternatives were rejected and why, and
whether those reasons still hold; mark each historical claim checked or recalled
([[projects/agent-workflow/feedback]] § Give the history behind a design).

## Tools

Where these rules came from: [[projects/agent-workflow/claude-md-origins/tools]].

- **Re-Read after mutating Bash.** Any Bash that may rewrite a file (`prettier --write`,
  `npm run lint:fix`, a formatting/codemod script, a pre-commit hook — and your own `cat >>`/heredoc
  appends) invalidates the harness's file-tracking. Read the file again before the next `Edit` on
  it. Otherwise `Edit` 400s with "File has been modified since read" and the retry hits the same
  error.
- **Lint after _any_ file edit, not just source.** Prettier (and its equivalents) formats Markdown,
  JSON, and YAML too, so `dev-docs/*.md`, README, config, and fixtures are all lintable — "lint" is
  not a source-file concern. Run the project's `lint` before the point where the user might take the
  commit: he commits and pushes after his own review, so the window between the edit and his commit
  is the only place this can be caught. Shipping a violation into a pushed commit costs him a
  follow-up "style fixes" commit for nothing. When drift does turn up, check whether it is yours
  before claiming it — `git show <base>:<file> | npx prettier --check -` on the pre-edit version
  separates your damage from pre-existing. **Corpus-wide pre-existing drift is a finding, not a
  blocker.** When lint fails on files you didn't touch and the failure is systemic rather than
  yours, don't convert it into a _policy_ objection — whether applying the formatter is safe is an
  **empirical** question about the rendered artifact. Measure it: build the rendered output, apply
  the formatter, rebuild, byte-diff, and classify the delta into inert (whitespace the renderer
  collapses) and substantive. Then report the finding with that evidence. Refusing on principle when
  a four-minute experiment settles it costs a round-trip and can hide a real bug. Diff the
  _rendered_ output, never the source — a large source diff can be entirely inert while a small one
  rewrites every code sample; hash extracted `<pre>` blocks separately, since a
  whitespace-insensitive diff hides code rewriting and whitespace inside `<pre>` is significant.
  Method + the code-fence hazard (a formatter reformats the examples _inside_ your prose, and no
  setting reproduces hand-authored pedagogy): [[topics/prettier-rewrites-fenced-code-examples]].
- **A wiki page edit rebuilds the wiki's search index, like a code edit runs the tests.** When a
  wiki carries `search-index.json`, it is a build output of the pages: after the last page edit of a
  burst, and after any formatter has run over the pages, run
  `npx -y wiki-search-index@latest --wiki . --repo OWNER/REPO` from the wiki directory and leave the
  rebuilt index beside the pages for his commit. This applies to every wiki edit, not only the ones
  made through `/document-wiki-page`, `/wiki-organize`, or `/release-prep`. Always `@latest`: a bare
  `npx wiki-search-index` runs whatever version npm cached, and on one fleet host that was 0.1.1,
  whose headings differ from the 0.2.0 output the committed indexes carry.
- **Read-the-tool before Edit.** `Edit`/`Write` require the file to have been Read _by the Read
  tool_ this conversation — viewing it via Bash (`grep`/`sed`/`head`/`cat`) does not register it,
  and the Edit 400s with "File has not been read yet". When inspection was Bash-based and an Edit is
  coming, Read the file (a narrow range suffices) before editing.
- **Don't speculatively `Read` paths.** Before `Read`, if the path was inferred from a listing or
  another output, confirm the path actually appears in that output. `Read` is cheap but failed reads
  inflate context and signal sloppy exploration. Use `Bash test -f`, `Glob`, or the original
  listing's exact strings rather than guessing variants.
- **Never import or execute a file you have not read.** `import()` / `require()` / sourcing /
  running a script is **execution, not inspection** — a module body runs top-level code the moment
  it loads, and plenty of CLIs are flat scripts with no `main()` at all, so loading one performs its
  whole job. Read the file first (the imports and the first ~20 lines are usually enough to see
  whether it is flat or guarded). To check a script merely _parses_, use `node --check` — that is
  the actual "does it load" tool and it executes nothing. Same for `bash -n`,
  `python -m py_compile`. If something must be executed to be assessed, neutralize the blast radius
  first: unset the credentials it needs (`env -u PROGRAM_CLERK_URL -u VAULT_API_URL …`), run it in a
  scratch dir, or pass `--help`/`--dry-run`. **A probe flag neutralizes only if the tool implements
  it** — for a CLI you have not read, `--help`/`--version` is still a run, and a parser that ignores
  unknown flags performs the default action, which for a builder means writing into the cwd. Combine
  the probe with the scratch dir, or read the arg parser first.
- **Trust the foreground result; don't chase display lag.** A foreground `Bash` result is
  authoritative even when it renders late or looks empty — the value is already captured. Don't
  re-run it as a background task, don't spawn noop "flush"/"nudge" commands to force a redraw, and
  don't `Read` a background task's `tasks/<id>.output` before its `<task-notification>` arrives (the
  file doesn't exist yet — the `Read` errors). Each adds cancelled-sibling and failed-`Read` noise
  without recovering anything. Reserve `run_in_background: true` for genuinely long work (servers,
  watchers, multi-minute builds), not perceived lag.
- **A fallible parallel Bash sibling cancels the batch.** When you fire multiple Bash calls in one
  message, one that exits non-zero _or_ is permission-denied cancels all in-flight siblings
  (`Cancelled: parallel tool call … errored`). Don't co-batch a command that legitimately returns
  non-zero or trips a permission gate — drift checks (`check-drift.sh` exits 1 on drift), `git tag`
  / `git describe` (non-zero when absent; often gated), or `$(…)`-substitution / compound snippets —
  with other independent calls. Run such a command in its own invocation, or guard the pipe with
  `|| true`. Generalizes the "check-drift is a canceller" rule in the vault skill
  `references/shell.md` from vault commands to git + shell. **Bare `git tag` is denied even as a
  read** — the `permissions.deny` pattern matches the verb, not the intent, so the listing form
  trips it too; list tags with
  `git for-each-ref refs/tags --format='%(refname:short) %(creatordate:short)'` (also the
  release-notes date source).
- **Kill hung verifications; don't wait them out.** A check running ~10× past its known duration
  (the previous green run) is hung, not slow — tests don't run for minutes. Stop it, inspect (ports,
  processes, partial output), and re-run the failing piece in isolation; the hang itself is a
  finding worth filing.
- **A check's result is its exit status, read after the last edit.** Before a stop report, rerun
  every check the project names (tests, lint, type checks) after the final edit, and read each one's
  exit status (`npm run js-check; echo "exit=$?"`). Report "all gates 0" when they all are, with a
  table only for the checks that are not. Never read a check through a `grep` or a `tail` of its
  output: a colored or reworded diagnostic defeats the pattern, and a failing tree reads clean. The
  same run comes before any git work, staging included: Eugene, 2026-11-02, _"I do it as a matter of
  policy: stuff works, I run all tests to confirm that, including linting, then start working with
  git."_ CI only confirms other environments, and a failure there is reproduced and fixed locally
  before the commit that CI then confirms ([[topics/ci-scope-convention]]).
- **State the cost of a long run before starting it.** When a run will take more than a few minutes
  (a simulation, a census, a benchmark sweep), give its estimated wall time in the message that
  starts it, and make it write a progress line as it goes. A Stop-hook reply about a run still going
  says how far along it is and how long is left, not only that it must keep running. A turn that
  ends waiting on a run also starts a background `sleep` that ends at the estimate; when it fires
  with the run still going, say how far along it is and how long is left, or stop the run if what is
  left is not needed, and stop the timer when the run reports first (the 2026-11-05 report, P1). An
  investigation he waits on counts as a long run: every few minutes, say what you have ruled out and
  what you read next (reflect 2026-10-22 M4).
- **Classifier outage ≠ command failure.** A tool call failing with "_\<model\> is temporarily
  unavailable, so auto mode cannot determine the safety of …_" means the safety classifier is down,
  not that the command is wrong — re-firing the same call in a tight loop burns turns without
  progress. After ~2 spaced retries: switch to work that doesn't need the classifier (reads,
  searches, analysis), batch the blocked mutations, tell the user, and come back after a pause or a
  model switch.
- **A denied action the task still needs goes to him as an ask: the reasons and a command to run.**
  When a permission gate or the auto-mode classifier refuses a step and the work cannot finish
  without it, finish everything that does not depend on it, then make the ask the message: what was
  refused, why the task needs it, what stays undone until it runs, and the exact command in its own
  fenced block, `!`-prefixed so its output lands in the session. The ask is never one item inside a
  status report, and a report that says "prepared" while a needed step is open reads as finished
  work. Name the checks that wait on the step, and run them the moment it has run. Never retry a
  variant of the denied command to get around the refusal.
- **A step only he can take arrives complete: the system, where in it, and the exact action or
  value.** A console step names the product and its URL, or the menu path from a named start page; a
  command comes in its own fenced block; a sign-in names the identity when more than one is in play;
  a value to send back says which field shows it. Restate the step in full each time you ask for it,
  never "the request I gave you earlier": that message is far up his scroll, the same reason a work
  stop re-names its unit. Look up what you do not know (an admin console's URL, a menu path) before
  handing the step over. A command he runs carries no placeholder the session can fill
  (`hooks/handed-command-check.sh` sends back a `<word>` or a scratch path in a command block): look
  the value up first (an account id, a key's name, a path). When only he can know it, the block
  reads it itself or its first line says where it comes from; `ACCOUNT='<account>'` handed to him is
  a lookup the agent skipped.
- **A command that must wait for something says so before the command.** When a handed command works
  only after another step has run (a pull, a deploy, a daily update), lead with that order in one
  direct sentence naming what must run and on which machines, and hand the command once, where it
  can run; a snippet repeated with its condition left in the surrounding prose reads as "run this
  now" ([[projects/agent-workflow/feedback]] § A command that must wait for something says so before
  the command).
- **TaskCreate ≠ Agent; fix validation errors, don't re-fire.** TaskCreate/TaskUpdate manage the
  session task list (`subject` + `description`); delegating work to a subagent is the Agent tool
  (`prompt`, `subagent_type`). On an `InputValidationError`, the message names the exact parameter
  problem — correct the call shape (or ToolSearch the schema for a deferred tool) instead of
  re-firing the same arguments.
- **Inspect a JSON response's shape before filtering it.** `jq` returns empty rather than erroring
  on a missing path, so a wrong filter and a genuinely empty result are indistinguishable in the
  output — an assumed shape that returns nothing reads exactly like a defect in the system being
  inspected. Before drawing any conclusion from an empty/zero `jq` result, dump `keys` (or
  `.[0] | keys`) and confirm the shape; **mandatory before asserting a defect in someone else's
  system.** Same family as § Diagnosis (evidence before cause) and the pagination rule in the vault
  skill `references/shell.md` (read the envelope, don't assume it). This rule is the _consumer_ half
  of a general failure class — a well-formed empty result masking a query the system never
  understood; the _producer_ half (reject unknown parameters, report unparsed input, echo the
  effective query) applies wherever you own the read surface. Full:
  [[topics/silent-empty-result-ambiguity]]. **Same for `grep`/search used as a coverage proof.** A
  pattern that matches nothing proves that _the pattern_ is absent, never that the property you care
  about holds. Before writing "no other file does X", check that the pattern actually tests X —
  searching for a stale _claim_ does not find a stale _prescription_. Either name the pattern in the
  claim ("nothing still says `No MCP tool exists`") or widen it until it tests the property.
- **A `WebFetch` 403 is the fetcher being blocked, not the source being unavailable.** Some
  documentation sites (cppreference among them) reject the fetcher's user agent and serve fine to a
  browser. Before writing "X returned 403, so the verification came from Y instead", retry once with
  `curl -sSL -A '<a current browser UA>'`; if that fails too, say the source was **not read** rather
  than presenting the substitute as equivalent.
- **Kill background work the moment its decision lands.** Background research exists to inform a
  pending decision; once the user rules, the marginal value of the in-flight run is whatever it adds
  _after_ the fact — usually nothing. Stop it rather than letting it finish "since it's already
  running": that is sunk cost, not a reason. Two specifics: evidence with a shelf life (prices,
  benchmarks, version-dependent facts) is better re-gathered at the moment of need than filed stale
  against a hypothetical future use; and a finished run still has to be read, summarized, and given
  a home, so it keeps costing after the compute stops. Say plainly that the work is abandoned, not
  paused.
- **A dependency's shipped skill governs its artifact.** Before writing a bench, test, or config a
  dependency ships a skill for (`.claude/skills/`, the package's `skills/`), invoke that skill; one
  found afterward audits the hand-written artifact ([[projects/agent-workflow/feedback]] § Consult
  dependency-shipped agent skills before authoring artifacts they govern).
- **Authoring a skill reads `openai/skills` first.** Its `skills/.system/skill-creator/SKILL.md` and
  Anthropic's skill authoring best practices give the same normative rules (Eugene, 2026-11-05: _"it
  has a bunch of normative information we should use when authoring skills"_); claude-config's
  `AGENTS.md` names the bounds its tests hold.
- **An `LSP` answer can be stale about a file the session has not opened.** On Linux, after a pull,
  a rebase, or generated code, run an `LSP` call on that file before believing a surprising type
  error; a `Read` does not refresh it ([[projects/claude-config/decisions]] D41).

## Fleet standards

For "fleet standards" (or any synonym), read [[topics/fleet-conventions-bundle]] first — sisters may
themselves be behind; don't infer from them.

Fire this **proactively, not only on the phrase.** Before proposing or making an edit to a file a
fleet convention governs — `.prettierrc`, `.editorconfig`, `package.json` scripts/devDeps, workflow
`permissions:`, `AGENTS.md` — read the governing note first. The file may already have drifted, and
an edit layered on drift entrenches it; worse, the drift is sometimes a _cause_ of the problem being
fixed.

## Background shells

Where these rules came from: [[projects/agent-workflow/claude-md-origins/background-shells]].

The Claude Code status line's "N shells" counts `Bash(run_in_background: true)` processes the
harness registered this session. Use `BashOutput(shell_id)` to peek, `KillShell(shell_id)` to
terminate. Shell IDs (e.g. `bash_1`) are in the original Bash result — scan prior tool calls;
**never run `ps`**. Skill: `/bg-shells` enumerates them.

**Background _agents_ are a separate registry from background shells — and killing one does not kill
its children.** `Agent(run_in_background: true)` spawns tasks that `/bg-shells` and the "N shells"
counter never show, and a sub-agent may fan out into sub-agents of its own. `TaskStop` on a parent
reports `killed` and fires a clean completion notification while the grandchildren keep running and
burning tokens, so the report reads finished while work continues. **`TaskList` is not the check** —
it lists the session to-do list (`subject`/`status`/`owner`), so it returns "No tasks found" whether
or not agents are running; an all-clear from it is meaningless. The reliable enumerator is
`TaskStop` with the id `x` (that exact id: `/reflect` suppresses this spelling as a probe instead of
scoring it as a stuck loop, 2026-09-15): the error names every live agent
(`No task found with ID: x. Running background agents: <id> (<label>), …`). Kill each id it names,
then re-probe until the list is gone. `ListAgents` is the readable view — sub-agents with a
`running` / `completed` status and no error line — but its `completed` can hide an agent whose
background shell child is still live (measured 2026-08-29: `completed` at 18 s while the probe
listed the agent running, and it notified again at 97 s), so the probe's error line stays the
authority and the all-clear. Don't diagnose by watching `tasks/*.output` file sizes either — the
`b*` files there are the sinks for your own foreground `Bash` calls, so a growing one is usually
your own probe observing itself.

**A fan-out is not done until both registries are empty — probe before "Done", not when asked.** A
sub-agent that has delivered and been merged can still be live: on 2026-08-26 one of ten analysts
sat in the running-agents registry ~40 minutes after its notification, with its shell showing as "1
shell", under a wrap-up that said "Done. Everything verified". The enumerators above ran only after
Eugene pointed at the status line — _"I still see '1 shell' and one background worker."_ — the
origin's words, a month later. So they are part of the done-check, not the cleanup: after any
fan-out, before any summary that says done, run the `TaskStop` nonsense-id probe and `/bg-shells`,
stop what they name, re-probe until both are empty, and say so in the summary. A delivered result is
evidence about the work, not about the process that produced it.

**A watcher dies with its producer, and the all-clear is measured, not remembered.** A shell that
polls another shell's output file (`until grep -q … "$O"; do sleep 5; done`) has no exit once that
producer is killed: the marker it waits for never lands, and it spins until the session ends. Kill
both, and prefer the `Monitor` tool to a hand-rolled polling shell, since the harness tracks and
reaps it. Since 2026-09-22 `hooks/bg-shells-open.sh` (Stop) names any shell the transcript shows
launched and neither completed nor stopped, once per shell, and the lister marks a shell `done` from
its completion notification; a `[bg-shells] N background shell(s) still live` block is that
measurement, and the answer is a `TaskStop` per id or one line saying which must keep running. The
hook stays quiet in the turn that launched a shell and raises it at a later Stop while it is live
([[projects/claude-config/decisions]] D45). A shell that must keep running past its own turn is
named by its id in that turn's closing message, with why; the hook reads that as the declaration and
does not block for it (reflect 2026-10-03: 14 firings in a week, every one a gate that had to
finish), unless no `sleep` timer is live beside it, which costs one block (§ Tools, the long-run
rule; reflect 2026-11-05, P1).

**Herdr panes are a third registry, and this is the one he watches.** Background shells and
background agents live in a status line; a pane sits in his window. A pane you split is yours to
close when its work ends, before the summary that says done — and an idle pane you already own is
the one to reuse, not to split a fresh one beside. **Read the pane's tail before you close it:** a
`Monitor` counting output files never sees a stack trace scroll past, so anything that went wrong in
there becomes his read instead of yours. Enumerate with
`herdr pane list --workspace "$HERDR_WORKSPACE_ID"`; panes you did not create stay untouched, and
split with `--cwd "$PWD"` — a pane opened elsewhere renames the tab, and closing it does not restore
the label (`skills/herdr/SKILL.md`).

## REST API probes

Probing or sniffing an HTTP API uses safe verbs only — `GET`, `HEAD`, `OPTIONS`. Mutating verbs
(`PUT`, `POST`, `DELETE`, `PATCH`) may have side effects even on paths that don't exist
(auto-create, idempotent overwrite, audit-log entries). For existence checks: prefer `OPTIONS` or
`GET`. For shape discovery: `OPTIONS`.

## Config repo

Where these rules came from: [[projects/agent-workflow/claude-md-origins/config-repo]].

This file + `~/.claude/{settings.json,commands,skills,hooks}` are symlinks from
`~/Open/claude-config/` (repo `uhop/claude-config`) — edits via either path land in the repo. Shell
edits, that is — the harness's Edit/Write tools **refuse symlinked paths** ("Refusing to write
through symlink"). For tool edits address the real file under `~/Open/claude-config/...` directly
(`readlink -f` when unsure); treat `~/.claude/...` as read-only aliases. New artifacts go there —
and **run `node install.mjs --apply` in the same session that adds one**. `settings.json` is itself
a symlink, so a reference to a new hook/skill goes live the moment it is committed while the file it
names stays unlinked: every session on the authoring host then fails at that reference until someone
runs the installer. Fleet propagation (below) already does the `--apply`, so this only covers the
authoring host — exactly the one that breaks first. Per-host overrides:
`~/.claude/settings.local.json`. Fleet propagation: `claude-config-update` (in
`playbash-{daily,weekly,clean}`).
