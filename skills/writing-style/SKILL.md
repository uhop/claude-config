---
name: writing-style
description: House prose style for everything the agent writes: README, wiki, dev-docs, AGENTS.md and llms.txt, release notes, GitHub issue and PR text, vault notes, and chat replies. Based on the Google developer documentation style guide (developers.google.com/style), with the Microsoft Writing Style Guide as the fallback reference. Read before writing or editing any prose; use when asked to review, edit, or polish writing, or when the user mentions Google style, Microsoft style, tech-writing style, or "the style guide".
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

- Short sentences: aim under 26 words. One idea per paragraph; more than five or six sentences is a
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

### Headings

- Sentence case, no end punctuation, no links, no code items if avoidable (add a noun if not).
- Task headings start with a bare infinitive ("Create an instance"); concept headings are noun
  phrases ("Migration to X"). **No leading _-ing_ form** ("Creating…"). Optional sections start
  with `Optional:`.
- One `#` per page; never skip a level; never leave a heading empty (text before the next
  subheading); introduce grouped subsections with "the following sections". Descriptive and
  unique; no numbers to signal sequence.

### Lists, procedures, tables, notices

- Introduce every list, table, code block, and image with a complete sentence: colon if it
  immediately follows, period if something intervenes. Never a fragment the items complete
  ("To get the driver, follow these steps:", not "To get the driver:"). Don't restate the heading.
- Numbered lists for sequence, bullets otherwise, description lists (bold run-in term) for
  term-description pairs. Run-in terms end with a colon, a period, or the house spaced em dash
  (`**term** — description`), consistently within one list. Parallel structure; capitalize each
  item; end with a period unless the item is a single word, has no verb, is entirely code, or is
  entirely a link. No one-item lists. No _etc._ or _and so on_: introduce the list as
  non-exhaustive instead ("data like …").
- Procedures: one action per step, imperative verb in the first sentence, location or goal before
  the action, result in the same paragraph after the action. A single-step procedure is one
  bulleted sentence. Optional steps start with `Optional:`. Instead of "run the following
  command", say what it does ("Deploy the load generator:"). No _please_, no keyboard shortcuts,
  only the best way.
- Tables only for three or more data points per item; header row in sentence case, no end
  punctuation; no merged cells; no table for layout, a single column, or code.
- Notices sparingly: write it inline first. **Note** = useful but not required; **Caution** =
  proceed carefully; **Warning** = don't, or irreversible. Never a note for a prerequisite, a
  required step, a result, or a cross-reference. In GitHub-rendered Markdown, the alert syntax
  `> [!NOTE]` / `> [!CAUTION]` / `> [!WARNING]` carries the same semantics; use `[!TIP]` as a
  note-grade aside and avoid `[!IMPORTANT]`, because required information belongs in the flow. Never two
  notices in a row.

### Links

- Link text is the target's title or a short descriptive phrase that reads on its own; never
  _here_, _click here_, _this document_, _this post_, or a bare URL. Important words first; the
  same text never points at two targets.
- Cross-reference formula: "For more information, see [X]." / "For more information about Y, see
  [X]." Use _see_, and _about_ rather than _on_. Punctuation outside the link; no quotes around linked
  titles. Include the abbreviation inside the link ("[Google Kubernetes Engine (GKE)]") and the
  noun with a code item ("the [`--hostname` flag]").
- Fewer, sharper links: each one is a decision for the reader. Give short context inline instead
  when a sentence suffices; link once per page to a destination. Say when a link downloads a file
  or leaves the site. Wiki links follow the `wiki-conventions` skill (Markdown links, never
  `[[…]]`).

### Code in text, samples, commands

- Code font (backticks) for anything typed or in code: filenames and paths, package and command
  names, flags, environment variables, method / class / function names, keywords, types, HTTP
  verbs and status codes, ports, query parameters, literal values, placeholders, command output.
  Ordinary font for product, project, and organization names, domain names, and URLs the reader
  follows. No quotation marks around code.
- **Never inflect a code item.** Put a noun after it and inflect the noun: "the `close` method",
  "`Intent` objects", "the `ADDRESS` constant's value", "send a `POST` request". Refer to files as
  "the `config.json` file"; name file _types_ by their formal name ("a JSON file", not "a `.json`
  file"). It is _filename_, not _file name_.
- Placeholders are `UPPERCASE_WITH_UNDERSCORES` in code font, descriptive, no `foo` / `x`, no
  brackets or `$` inside. Explain every placeholder the first time: "Replace `BUILD_ID` with …",
  or "Replace the following:" + a list in order of appearance.
- Samples: introduce with a sentence; fenced with a language hint; 2-space indentation unless the
  language's guide says otherwise; wrap at 80 characters; mark omissions with a comment in the
  sample's language, never `...`.
- Commands: copy-pasteable, so only runnable text plus placeholders in the block; no `[ ]`, `{ | }`,
  `...` in a block the reader copies (reference syntax uses them: `[OPTIONAL]`, `{A|B}`, `ARG...`).
  Show the common case and mention extra flags in prose. `$` prompt on every input line when a
  block has several; optional for a one-liner but consistent across the document; never the cwd
  before the prompt. Output in a separate block, introduced by "The output is similar to the
  following:". Continue long lines with ` \` and a four-space indent.
- HTTP: "an HTTP `400 Bad Request` status code" (not response / error code); ranges as `2xx`.
- Reference descriptions (JSDoc, API docs): third-person present-tense fragments: "Returns the
  …", "Creates a …", "Called by …"; parameters "The …" / "A …" with a period; booleans "True if …;
  false otherwise." Don't repeat the class name; no _e.g._ (doc generators cut at the first
  period).
- UI: bold the label; _click_ (desktop), _tap_ (touch), _press_ (keys), _select_ (an item, a
  checkbox), _clear_ (a checkbox), _enter_ (text). Never _click on_. Menus: "Select **View >
  Tools > Developer Tools**". No _pop-up_, _drop-down_; say dialog, menu, list.
- Examples use reserved fixtures: `example.com` / `.org` / `.net`, `dana@example.com`, names from
  Google's list (Alex, Dana, Kai, Quinn, Taylor…), `192.0.2.0/24`, `2001:db8::/32`; meaningful
  names, never `foo` / `bar` / `baz`.
- Product names: official capitalization, full name, no article before a product ("Use Node.js";
  but "the `npm` CLI", because tools and APIs take _the_), no plural, never a verb; a possessive is
  fine in human-read prose (house carve-out, § Punctuation and mechanics). Code font for the
  command (`node`, `git`, `curl`), ordinary font for the product (Node.js, Git).

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
- Hyphenate compound modifiers before a noun (_well-designed app_, _Android-specific_), not after
  a verb; never after _-ly_ adverbs; prefixes close up (_metadata_, _preprocessing_) except
  _self-_, _cross-_, before capitals or numbers (_non-Google_, _post-2000_), or to avoid misreading.
  Closed compounds: _webpage_, _hostname_, _filename_, _tradeoff_, _workaround_, _runtime_ (noun).
- Straight quotation marks; commas and periods inside the closing quote, except around a literal
  string, where they go outside (and prefer code font to quotes for literals). Italics for a new
  term and for words-as-words ("the word _and_"), not bold or quotes.
- Colon: lowercase after it unless a proper noun, heading, quotation, or a notice label follows.
  One space between sentences. Avoid semicolons (join closely related clauses or punctuate complex
  list items only), exclamation marks, ellipses in prose, parentheses for important information,
  `&` for _and_ outside UI names, and ad-hoc slashes in running prose (no _and/or_; _free and paid_,
  not _free/paid_; _cost versus selectivity_, not _cost/selectivity_ — the slash leaves _and_,
  _or_, and _per_ undecided). Two house carve-outs (ruled 2026-08-19): an established pair-name
  that reads as one token stays (_JS/TS_, _sat/unsat_, _yes/no_, _true/false_, _LHS/RHS_,
  _UI/UX_, _I/O_), and a rate unit keeps its slash where it is unit notation (_req/s_, _items/s_,
  _$15/user/month_ in a table or measurement prose); _requests per day_ in ordinary sentences.
- Abbreviations: spell out on first use, "_Border Gateway Protocol_ (_BGP_)", then the abbreviation
  alone; don't capitalize the long form only because the acronym is capitalized; skip the spell-out
  for AI, API, HTML, PDF, URL, REST, RAM, MB. **No _e.g._ or _i.e._:** write _for example_ or _that is_.
  _10 times_, not _10x_; _approximately_, not _approx._; _a_ / _an_ by pronunciation (_a SQL_,
  _an SAP_); never an abbreviation as a verb ("use SSH", not "ssh into"). No periods in acronyms;
  plurals without apostrophes (_APIs_, _OSes_).
- Keep articles, including in headings ("Create a VM instance"). No parenthetical plurals
  (_key(s)_): pick one or write _one or more_. A possessive of a code item is rewritten around
  ("the return value of the `wordCount` method", never `` `wordCount`'s ``); a possessive of a
  company or product name is allowed in human-read prose ("Django's ticket", "Anthropic's
  pricing") — house carve-out, ruled 2026-08-19, where Google rewrites around it.

### Numbers, dates, units

- **Spell out zero through nine; numerals for 10 and up**, but always numerals for versions,
  technical quantities (memory, disk, limits, QPS), prices, percentages, dimensions, decimals,
  negatives, ranges, measurements, and any number under 10 in a sentence with a number over 9.
  Spell out a number that starts a sentence (or rewrite) and all ordinals (_first_, not _1st_).
- Commas in numbers of four or more digits (_2,000_); period as decimal point; leading zero
  (_0.3_); `40%` with no space; `192x192` with a lowercase _x_ and no spaces.
- Dates in prose: _January 19, 2017_ (comma after the year mid-sentence; _January 2017_ without).
  Numeric dates: `YYYY-MM-DD` (ISO 8601), never slashes. Date before time ("2017-04-15 at 3 PM").
  Times: 12-hour clock unless the UI uses 24-hour, capital AM or PM with a space, minutes dropped on
  round hours; avoid time zones, and spell them out with a UTC offset when unavoidable. No seasons:
  name the month or quarter.
- A space between number and unit (_64 GB_, _50 °C_), with `&nbsp;` in rendered HTML or Markdown where
  a line break would split them; no space before `%` or `°` (angle) or after `$`. Unit
  abbreviations don't pluralize (_64 GB_) and don't hyphenate (_200 GB disk_); spelled-out units
  do (_64-bit system_). Use the unit system of the thing documented: _MiB_ when you mean 1024².
  _per_ instead of a slash in a sentence (_requests per day_; _Gbps_ is fine); the slash stays
  where the rate is unit notation — table cells, measurement prose (_req/s_, _items/s_).

## House decisions

Where Google is silent or house practice differs; each is a decision, not an oversight.

- **Dashes.** Ruled by Eugene 2026-08-19: the three-dash rule in § Punctuation and mechanics is
  the house standard on every surface — new documents included — and it replaces the skill's
  first-day default of closing the em dash in new documents. Existing prose already follows it,
  so there is nothing to sweep; the docs pass's en-dash-to-hyphen range conversions in apodict
  were reverted the same day. What still needs judgment is density, not spacing.
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
- **AI tells are banned in all prose** (from the blog calibration, vault
  `projects/blog/writing-voice` § AI-tell calibration): the contrast-correction move ("it isn't
  X; it's Y", "not X — Y", "X is not A; it is B"; state the positive claim directly), warm-up
  openers ("To be clear,", "Here's the thing"), staccato fragment pairs ("Fast. Simple."),
  self-clap closers ("And that matters."), "less a hammer, more a scalpel" comparatives, and
  em-dash pileups. Google doesn't name them; its "key point first, plain statement" rule produces
  the same text.
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

## High-frequency word list

The full list is `references/word-list.md` (grep it before guessing). Entries that come up most in
developer prose, preferred form first:

- **Actions:** _click_ (never _click on_; _tap_ on touch devices, _press_ a key or mechanical
  button, never _hit_); _select_ an item or a checkbox and _clear_ a checkbox (not _check_ /
  _uncheck_ / _deselect_); _enter_ text (not _type_); _drag_ (not _drag and drop_); _hold the
  pointer over_ (not _hover_); _turn on_ / _turn off_ or _enable_ / _disable_, one pair per
  document, and _disabled_ never means "broken" (_unavailable_).
- **Fillers to delete or replace:** _please_, _simply_, _just_, _easy_ / _easily_, _quick_ /
  _quickly_, _in order to_ → _to_, _utilize_ / _leverage_ → _use_, _allows you to_ / _enables you
  to_ → _lets you_, _desired_ → _that you want_, _functionality_ → _features_, _performant_ → a
  precise term, _impact_ (verb) → _affect_, _comprise_ → _consist of_, _execute_ → _run_ when the
  meaning is the same, _via_ → _by using_ / _through_, _vs._ → _versus_, _aka_ → _also known as_,
  _e.g._ → _for example_, _i.e._ → _that is_, _etc._ → rephrase as non-exhaustive (_such as_),
  _for instance_ → _for example_, _learnings_ → _knowledge_, _pros_ / _cons_ → _advantages_ /
  _disadvantages_.
- **Modals:** _can_ = ability or optional; _might_ = possibility; _must_ = required; _may_ only for
  permission in a policy or legal sense; avoid _should_, _could_, _would_, _will_.
- **Time and position words:** _after_ not _once_; _because_ not _since_ / _as_; _although_ not
  _while_ for contrast; _earlier_ / _later_ for versions ("2.2 or later", never "2.2+" or
  "higher"); _preceding_ / _following_ for position; _if … then_ with the _then_; _per_ only for
  rates (_requests per day_), otherwise _for each_ / _according to_.
- **Accounts:** _sign in_ (verb) / _sign-in_ (noun, adjective), _sign in to_ not _sign into_; _log
  in_ / _login_ only when the tool says so; _username_ not _account name_; _email_ is a noun
  (_send email_).
- **Spelling and compounds:** _filename_, _hostname_, _file system_, _codebase_, _backend_ /
  _frontend_, _endpoint_, _namespace_, _whitespace_, _wildcard_, _lifecycle_, _timestamp_,
  _toolkit_, _walkthrough_, _hardcoded_, _prebuilt_ but _pre-existing_, _sub-command_; _runtime_
  (noun: the environment) versus _run time_ (when it runs); _setup_ (noun) / _set up_ (verb), _login_
  / _log in_, _timeout_ / _time out_, _failover_ / _fail over_, _plugin_ (noun) / _plug-in_
  (adjective) / _plug in_ (verb); _read-only_, _third-party_ (adjective) / _third party_ (noun),
  _key-value pair_, _data type_, _checkbox_, _dialog_ (not _dialog box_ or _pop-up_), _drop-down_
  only to disambiguate (say _list_ / _menu_), _ID_, _internet_, _web_, _Markdown_, _curl_ (not
  _cURL_), _a SQL_, _I/O_, _UTF-8_, _RFC 2318_, _US_; _repository_ not _repo_ in running prose
  (`repo` stays inside code spans and identifiers — `repo:github.com/…`, `gh repo` — and in
  table cells where width matters; ruled 2026-08-19), _regular
  expression_ not _regex_, _configuration_ not _config_ (except the code name), _extract_ not
  _untar_ / _unzip_, _tar file_ not _tarball_, _Kubernetes_ not _k8s_, "use SSH" / "the `ssh`
  command" never "ssh into".
- **Grammar notes:** _data is_ (mass noun); _indexes_ (plural, except math), _appendixes_; _listen
  on_ a port; _directory_ in command-line contexts, _folder_ in GUIs; _app_ for end-user programs;
  _media type_ not _MIME type_; _status code_ not _error code_; _this document_ not _this article_;
  _deprecated_ ≠ _removed_; _element_ versus _tag_ (a tag marks an element); a link is not a _button_;
  "the area appears" not "the area displays"; no _Create a new …_ (_Create a …_ alone).
- **Inclusive replacements:** _allowlist_ / _denylist_ (nouns; rewrite verbs as the action);
  _primary_ / _replica_, _controller_ / _worker_, _leader_ / _follower_ for _master_ / _slave_;
  _exempt_ / _legacy_ for _grandfathered_; _placeholder_ for _dummy_; _quick check_ /
  _preliminary check_ for _sanity check_; _built-in_ for _native_; _stop responding_ for _hang_;
  _stop_ / _exit_ / _cancel_ for _kill_ / _abort_ / _terminate_; _person-hours_; _maintenance_ /
  _cleanup_ for _housekeeping_; _affected area_ for _blast radius_; _expert_ for _ninja_ / _guru_;
  _platform-independent_ for _agnostic_; _dash-case_ for _kebab-case_; describe the capability
  instead of _first-class_; _everyone_ for _guys_.

## Review procedure

When asked to review, edit, or polish prose (the `docs-review` skill delegates here):

1. Read the whole document first; note its audience, its dominant conventions (dash density, heading
   style, import form), and the project's `AGENTS.md` / `dev-docs/` rules.
2. Structure: headings (case, form, levels), list and table introductions, procedure shape,
   notices, link text.
3. Sentences: person, voice, tense, condition-first, modals, sentence length, paragraph
   focus, pronoun antecedents, AI tells.
4. Words and mechanics: word list, abbreviations, numbers, dates, units, punctuation, code
   font, placeholders, inflected code items.
5. Don't touch code blocks, signatures, identifiers, tables' data, or links' targets; keep every
   technical claim as stated (or flag it, and never silently "correct" a fact).
6. Run the project's `lint` (prettier formats Markdown) and report the classes of change made,
   with one example each, rather than a line-by-line log.

## Checklist before handing over prose

- [ ] _You_ / imperative; active; present; condition before instruction; one recommended path.
- [ ] No _please_, _simply_, _just_, _easy_, _should_ (for requirements), _currently_ / _new_ /
      _soon_, _e.g._ / _i.e._ / _etc._, _click on_, _above_ / _below_, superlatives, exclamation
      marks, AI tells.
- [ ] Headings sentence case, no _-ing_ opener, no skipped levels; lists introduced, parallel,
      punctuated consistently; procedures one action per step.
- [ ] Link text descriptive; "For more information, see …"; punctuation outside links.
- [ ] Code font for code things, none for product names; code items not inflected; placeholders
      `LIKE_THIS` and explained; commands copy-pasteable; samples introduced.
- [ ] Serial comma; house dashes (hyphen compound, en-dash range, spaced and rationed em dash);
      hyphenated compound modifiers; no ad-hoc _X/Y_ in prose (pair-names and rate units
      excepted); _repository_ in prose; straight quotes; sentence-case table headers.
- [ ] Zero through nine spelled out, numerals from 10 (technical quantities always numerals); `YYYY-MM-DD`;
      space before units, none before `%`.
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
- `references/word-list.md`: the guide's A–Z word list in full, plus the high-frequency subset.
- `references/microsoft-delta.md`: what the Microsoft Writing Style Guide adds or changes, for
  questions Google doesn't answer.

Digests were taken 2026-08-19; the guide changes (pages carry a "Last updated" stamp), so when a rule
matters and the digest looks dated, fetch the page.
