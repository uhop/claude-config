---
name: writing-style
description: "House prose style for everything the agent writes: README, wiki, dev-docs, AGENTS.md and llms.txt, release notes, GitHub issue and PR text, vault notes, and chat replies. Based on the Google developer documentation style guide (developers.google.com/style), with the Microsoft Writing Style Guide as the fallback reference. Read before writing or editing any prose; use when asked to review, edit, or polish writing, or when the user mentions Google style, Microsoft style, tech-writing style, or \"the style guide\"."
---

# Writing style

The [Google developer documentation style guide](https://developers.google.com/style) is the
house standard for prose (adopted 2026-08-19). This skill condenses it into the rules that do most
of the work, records where house conventions override it, and points at fuller digests in
`references/`. Google's own framing applies: these are guidelines, not rules: depart when doing so
improves the text, and stay consistent within a document.

## Precedence

When two sources disagree, the earlier one wins:

1. **Project conventions:** `AGENTS.md`, `dev-docs/`, the project's existing docs, and the fleet
   structural conventions (vault `topics/fleet-conventions-bundle`: README order, two-tier release
   notes, wiki page naming, commit-message cliff-notes). They decide _what goes where_; this skill
   decides _how the sentences read_.
2. **Voice models for non-documentation writing.** Blog posts follow the vault
   `projects/blog/writing-voice` note and articles follow `projects/articles/feedback`. Those are
   opinion pieces in Eugene's voice (first-person plural, rhetorical questions, humor), which the
   Google tone rules deliberately exclude. For those, use this skill only for the mechanics the
   voice model is silent on (hyphenation, numbers, abbreviations, link text, code font).
3. **This skill:** the Google guide.
4. **Fallbacks, in the order Google names them:** the
   [Microsoft Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/) for
   technical style (check that a rule isn't Microsoft-product-specific), _The Chicago Manual of
   Style_ for general style, Merriam-Webster for spelling.

## Scope

Applies to every piece of prose you produce or edit: README, wiki pages, `dev-docs/`, `AGENTS.md`,
`ARCHITECTURE.md`, `llms.txt` / `llms-full.txt`, `.d.ts` JSDoc, release notes, CHANGELOG entries,
GitHub issue, PR, and review text, vault notes (body prose; structure per the `vault` skill), handoff
messages, and chat replies. In chat, the voice and mechanics apply in full; the document
scaffolding (introductory sentences before every list, figure captions) applies only where it
helps a reader.

Out of scope: the code itself (language style guides + the repo's prettier config), code comments
(vault `topics/no-narrating-comments`: comments are short _why_ markers, and when one exists its
words still follow this skill), and commit subjects (the repo's existing form; fleet slice 10
cliff-notes).

## Core rules

### Voice and tone

- **Second person.** Address the reader as _you_; use the imperative for instructions ("Run the
  tests"). Don't write _the user_ for the reader, or _we_ / _let's_ for reader actions.
  _We_ is acceptable only for the authoring organization after naming it ("Example Org provides
  A, but we don't provide B").
- **Active voice, present tense.** "The server sends an acknowledgment", not "is sent" / "will
  send". _Will_ only for something that genuinely happens later (asynchronous delivery). No
  hypothetical _would_. Passive is fine to de-emphasize the actor ("The file is saved").
- **Condition, goal, or location before the instruction.** "To delete the document, click
  **Delete**." "In the **File** menu, select **Open**." "For more information, see X." Never
  the instruction first with the condition trailing.
- **Prescriptive.** Recommend one path. Pick the modal that matches the meaning: _must_ (or a bare
  imperative) = required; _can_ = optional; _might_ / _can_ = possible outcome; "We recommend…" =
  recommended. Avoid _should_, which blurs required and optional. Never "the value should be true"
  for an actual state; say who sets it.
- **Conversational, not cute, not formal.** Use common contractions, especially negative ones
  (_don't_, _isn't_: harder to misread than _not_). Drop _please_, _please note_, _at this time_,
  _simply_, _just_, _easy_, _quickly_, _obviously_, _of course_, exclamation marks, humor, idioms,
  metaphors, pop-culture references, internet slang (_tl;dr_). Don't anthropomorphize ("the PC
  detects a device", not "sees").
- **Timeless.** Don't write _currently_, _now_, _new_, _latest_, _soon_, _existing_, _in the
  future_, _does not yet_ when describing capabilities, because docs are assumed current. Anchor an
  unavoidable _new_ to a version or date. Don't pre-announce features. (Release notes and
  announcements are the exception: _new_ is fine there.)
- **No excessive claims.** No _best_, _fastest_, _simplest_, _never_, _always_; _ensure_ /
  _guarantee_ only when literally true; cite or measure any performance number (house: measure with `nano-bench`,
  never adjectives, per _quantify or cut_ in the blog voice note); "helps with security" or "is
  designed for security", never "is secure"; no disparaging comparisons.
- **Inclusive and accessible.** Singular _they_; no _he/she_. No ableist or violent figures:
  _sanity check_ → _check for completeness_; _dummy_ → _placeholder_; _hangs_ → _stops
  responding_; _crazy_, _cripple_, _blind to_ → a precise word. _allowlist_ / _denylist_,
  _primary_ / _replica_ (or _main_ / _worker_), not _whitelist_ / _blacklist_, _master_ / _slave_;
  a non-inclusive name baked into code appears once, in code font, in parentheses, then the
  preferred term. No _above_ / _below_ for orientation; use _preceding_, _following_, _earlier_, or
  _later_. Refer to UI by its label, not its shape or position.

### Sentences and paragraphs

- Short sentences: aim under 26 words, and a document mean of 18 or fewer (the house cadence
  budget; `references/ai-tells.md`). One idea per paragraph; more than five or six sentences is a
  smell. Key point first; readers don't read every word.
- Subject early, subject-verb-object; keep helper words conversational English drops (_that_,
  _then_, _of_); don't omit the relative pronoun ("the rules that you defined"). Put _only_ right
  before what it modifies. No more than two nouns modifying another noun.
- Pronouns need unambiguous antecedents; follow _this_ / _these_ with a noun ("this value").
  _That_ = restrictive, no comma; _which_ = nonrestrictive, comma.
- Plain words: _use_ not _utilize_ / _leverage_; _start_ not _commence_; _so_ not _consequently_;
  _some_ / _many_ not _a number of_. Write around jargon, or define it in parentheses or with a
  link on first use. One term per concept, same spelling and capitalization throughout.
- Don't say what the reader can't do when you can say what they can ("You can continue without a
  path", not "A missing path won't prevent you from continuing").

### Punctuation and mechanics

- **Serial comma, always.** Comma after an introductory phrase; before a coordinating conjunction
  joining two independent clauses; before nonrestrictive _which_; none before _because_ unless the
  clause is nonrestrictive.
- **Three dashes, three jobs** (house rule, ruled 2026-08-19; it overrides Google here). A
  **hyphen** joins a constructed word or a compound modifier, no spaces (_close-knit_,
  _well-designed app_). An **en dash** marks a range, no spaces (_1–4 items_, _2012–2016_,
  _§8.2–8.3_); spaces around it only when the second endpoint starts with a minus sign
  (_-10 – -4_); with units, repeat the unit (_-40 °C – -10 °C_) or write _to_. An **em dash with
  a space on each side** separates a phrase or sub-phrase (_No tip — it is already included_),
  and it is the dash to ration: it marks a break in flow, not a connector, so a comma,
  parentheses, a colon, or a sentence split usually reads better (the blog calibration budgets
  about 1.3 per 100 words). Google closes the em dash and bans the en dash; the house rule wins.
- **Dash encoding follows the consumer** (Eugene, 2026-08-19; the TeX convention for ASCII).
  Three classes, decided by who reads the bytes, not by where a file could render:
  - **Humans through a browser** — HTML, and Markdown that is read rendered: README, wiki,
    `dev-docs/`, release notes, GitHub issue and PR bodies, the blog. Write `-`, `&ndash;`,
    `&mdash;` — entities, not raw Unicode (`word &mdash; word` keeps the spaces). The blog
    additionally prefers Goldmark's `--` / `---` shortcuts, per the blog voice note; GitHub does
    not convert those, so there the entity is the only form.
  - **Compilers, terminals, and logs** — code and comments, `.d.ts` JSDoc, commit messages, CLI
    output, GitHub issue titles, anything inside a code span or block. Write `-`, `--`, `---`.
  - **Models and internal notes (agent-read files)** — `AGENTS.md`, `ARCHITECTURE.md`,
    `CLAUDE.md`, any `SKILL.md`, `llms.txt` / `llms-full.txt`, vault notes, chat replies. Write
    raw Unicode `–` / `—`: the model reads source bytes, so an entity is seven characters of
    noise for one, and the TeX forms collide with what these files are full of (`--summary` is
    a flag; `---` at a line start is a rule or a frontmatter fence). That a GitHub page also
    renders the file is incidental — raw Unicode renders fine; the entity form exists for typing
    ergonomics and the blog's HTML pipeline. (Ruled 2026-08-19 after an `AGENTS.md` /
    `ARCHITECTURE.md` sweep to entities was reverted: the first draft of this rule classified
    by render surface and got both wrong.)
  Forward-looking: don't sweep an existing document's dashes to another encoding; match the
  document you are editing, and raise a sweep as its own question.
- Colon: lowercase after it unless a proper noun, heading, quotation, or a notice label follows.
  One space between sentences. Avoid semicolons (join closely related clauses or punctuate complex
  list items only), exclamation marks, ellipses in prose, parentheses for important information,
  `&` for _and_ outside UI names, and ad-hoc slashes in running prose (no _and/or_; _free and paid_,
  not _free/paid_; _cost versus selectivity_, not _cost/selectivity_ — the slash leaves _and_,
  _or_, and _per_ undecided). Two house carve-outs (ruled 2026-08-19): an established pair-name
  that reads as one token stays (_JS/TS_, _sat/unsat_, _yes/no_, _true/false_, _LHS/RHS_,
  _UI/UX_, _I/O_), and a rate unit keeps its slash where it is unit notation (_req/s_, _items/s_,
  _$15/user/month_ in a table or measurement prose); _requests per day_ in ordinary sentences.
- Keep articles, including in headings ("Create a VM instance"). No parenthetical plurals
  (_key(s)_): pick one or write _one or more_. A possessive of a code item is rewritten around
  ("the return value of the `wordCount` method", never `` `wordCount`'s ``); a possessive of a
  company or product name is allowed in human-read prose ("Django's ticket", "Anthropic's
  pricing") — house carve-out, ruled 2026-08-19, where Google rewrites around it.
- The rest of the mechanics are in `references/mechanics.md`: headings, lists, procedures, tables,
  notices, links, code font and samples, numbers, dates, units, hyphens, quotation marks, and
  abbreviations. Read it before writing or editing a document. A chat reply needs it only for a
  question it answers.

## House decisions

Where Google is silent or house practice differs; each is a decision, not an oversight.

- **Slashes, "repo", product possessives.** Ruled by Eugene 2026-08-19, closing the three
  conventions the apodict docs pass had left at the documents' own form. **Slashes:** Google's
  ban holds for ad-hoc _X/Y_ alternatives in running prose, with two carve-outs — established
  pair-names that read as one token (_JS/TS_, _sat/unsat_, _yes/no_) and rate units where the
  slash is unit notation (_req/s_, _$15/user/month_ in tables and measurement prose).
  **"repo":** _repository_ in running prose, Google's line; `repo` survives in code spans,
  identifiers, and width-constrained table cells. **Possessives:** a company or product name
  may take _'s_ in human-read prose ("Django's ticket") — Google's rewrite-around is mostly its
  own trademark hygiene; the code-item half stays strict (never `` `foo`'s ``), because that is an
  inflected code item. All three govern human-read prose; agent-read files and chat were already
  looser.
- **AI tells are banned in all prose** — every surface in § Scope, blog and articles included
  (Eugene, 2026-08-29: _"make sure that updated language rules are used in general for all
  external texts in all projects"_). Calibrated against the blog's pre-LLM corpus, never a generic
  list (vault `projects/blog/writing-voice` § AI-tell calibration; fleet rule
  `topics/ai-writing-tells-calibrated`). The families, replacements, and budgets are in
  `references/ai-tells.md`, and the checklist below names them. Mechanical check for any Markdown
  file: `prose-tells --check <file>` in this skill's directory (a shim over
  `blog-hugo/tools/prose-tells`).
- **Audience calibration.** Public libraries: a capable developer who hasn't read the source. Fleet or
  personal tooling: the programmer-operator: document the _why_ and the gotchas, skip
  onboarding scaffolding (vault `topics/personal-tools-not-public-doc-defaults`). Either way, name
  the audience near the top when it isn't obvious.
- **Chat replies.** Same voice and mechanics; structure per the global `CLAUDE.md` rules (lead
  with what happened, chat snippets fully formed and delineated). Terminal rendering means: plain
  spaces between number and unit, Markdown tables only when they fit.
- **Markdown mechanics** follow prettier where it has an opinion (`_italic_`, `**bold**`, list
  markers, table alignment, per the fleet `.prettierrc`) and Google otherwise: `**` not `__`, `_` not
  `*`, `#` hierarchy without skipped levels, fenced code with a language hint, no hard line breaks
  inside sentences beyond what the formatter wraps.
- **Typography in the blog** (HTML entities or Goldmark shortcuts, never raw Unicode punctuation
  in prose, and never retro-converting a published post) is the blog voice note's rule; the
  dash-encoding bullet in § Punctuation and mechanics is its fleet-wide generalization (entities
  for human-read HTML and Markdown, TeX `--` / `---` for code and logs, raw Unicode for
  agent-read files, vault notes, and chat).

## Word list

Grep `references/word-list.md` before guessing a term. Its high-frequency entries, and this skill's
list of fillers, modals, and compounds, are in `references/mechanics.md`; Claude's register words
and Orwell's false limbs are in `references/ai-tells.md`.

## Drafting discipline

Orwell's method, from _Politics and the English Language_ (adopted 2026-09-07): get the meaning
clear before the words, then choose the phrases instead of accepting the ones that arrive, then
read the sentence as the reader will. A ready-made phrase saves the writer the trouble of thinking
and hides the meaning from the writer too, which is why the tell families read as they do. Ask of
every sentence:

1. What am I trying to say?
2. What words express it?
3. What image or idiom makes it clearer?
4. Is the image fresh enough to have an effect?
5. Could I put it more shortly?
6. Have I said anything avoidably ugly?

Three tests settle the common cases. A metaphor you are used to seeing in print is dying: cut it,
or use one you can see; a mixed metaphor proves you saw none. A praise word whose opposite would
read as an opinion (_intuitive_, _robust_) points at no fact: state the measurable claim or cut it.
A sentence that goes abstract where a fact belongs ("certain edge cases may exhibit degraded
behavior") is avoiding the fact: write it ("it crashes when X"). Break any of these sooner than
write something barbarous; the rules serve the meaning.

## Review procedure

When asked to review, edit, or polish prose (the `docs-review` skill delegates here), read
`references/mechanics.md` § Review procedure and follow it.

## Checklist before handing over prose

- [ ] _You_ / imperative; active; present; condition before instruction; one recommended path.
- [ ] No _please_, _simply_, _just_, _easy_, _should_ (for requirements), _currently_ / _new_ /
      _soon_, _e.g._ / _i.e._ / _etc._, _click on_, _above_ / _below_, superlatives, exclamation
      marks, AI tells (`references/ai-tells.md`: contrast-correction, stranded auxiliary,
      self-clap, warm-up, staccato pair, headcount, Claude's register words, Orwell's false limbs,
      litotes, dying metaphors, meaningless praise, Latin tags).
- [ ] Cadence within budget: mean sentence ≤ 18 words, em dashes ≤ 1.3 per 100 words, semicolons
      ≤ 2.8, _never_ / _nothing_ / _nobody_ ≤ 0.3, _rather than_ ≤ 0.1, negators ≤ 2.2, "X, not
      Y" closers ≤ 0.05 (`prose-tells --check`).
- [ ] A block bound for GitHub or another published surface is checked before it goes in the chat:
      write it to `$WORK/<name>.md` and run `prose-tells --check` on it. The budgets are densities
      per 100 words, so a short block can exit 1 on one word: act on the lines it names.
- [ ] Headings sentence case, no _-ing_ opener, no skipped levels; lists introduced, parallel,
      punctuated consistently; procedures one action per step.
- [ ] Link text descriptive; "For more information, see …"; punctuation outside links.
- [ ] Code font for code things, none for product names; code items not inflected; placeholders
      `LIKE_THIS` and explained; commands copy-pasteable; samples introduced.
- [ ] Serial comma; house dashes (hyphen compound, en-dash range, spaced and rationed em dash);
      hyphenated compound modifiers; no ad-hoc _X/Y_ in prose (pair-names and rate units
      excepted); _repository_ in prose; straight quotes; sentence-case table headers.
- [ ] Zero through nine spelled out, numerals from 10 (technical quantities always numerals); commas
      from 1,000; `YYYY-MM-DD`; space before units, none before `%`.
- [ ] Consistent terminology; abbreviations spelled out on first use; singular _they_; inclusive
      terms.

## References

Per-section digests of the guide, each condensed from the fetched pages with the source URL and
"Recommended / Not recommended" pairs. Open the one that matches the question:

- `references/principles-and-voice.md`: tone, voice, person, tense, pronouns, contractions,
  sentence and paragraph structure, jargon, claims, timeless docs, global audience, accessibility,
  inclusive language, third-party content, reference-verb form.
- `references/grammar-and-punctuation.md`: abbreviations, articles, capitalization, plurals,
  possessives, prepositions, every punctuation mark, numbers, dates and times, units, math
  notation, phone numbers, italics for terms.
- `references/formatting-and-linking.md`: headings, lists, procedures, tables, notices, images,
  footnotes, example formatting, cross-references, heading anchors, text-formatting table,
  Markdown versus HTML.
- `references/code-and-ui.md`: code in text, code samples, command-line syntax, placeholders, UI
  elements, API reference comments, example domains and names, filenames, product names,
  trademarks.
- `references/mechanics.md`: this skill's rules for headings, lists, tables, notices, links, code
  font and samples, numbers, dates, units, hyphens, quotation marks, and abbreviations, and its
  high-frequency word list. Read it before writing or editing a document.
- `references/word-list.md`: the guide's A–Z word list in full, plus the high-frequency subset.
- `references/ai-tells.md`: the banned AI-tell families with replacement moves, Claude's register
  words, the cadence budgets, what is not a tell, and the `prose-tells` check (house, calibrated
  on the blog corpus 2026-08-14 and 2026-08-29).
- `references/microsoft-delta.md`: what the Microsoft Writing Style Guide adds or changes, for
  questions Google doesn't answer.

Digests were taken 2026-08-19; the guide changes (pages carry a "Last updated" stamp), so when a rule
matters and the digest looks dated, fetch the page.
