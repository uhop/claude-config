# Document mechanics

The rules a document needs and a chat reply seldom does, condensed from the Google guide. The
digests in this folder hold the fuller forms. `SKILL.md` keeps the voice, the house dash rule, and
the checklist.

## Core rules

### Headings

- Sentence case, no end punctuation, no links, no code items if avoidable (add a noun if not).
- Task headings start with a bare infinitive ("Create an instance"); concept headings are noun
  phrases ("Migration to X"). **No leading _-ing_ form** ("Creating…"). Optional sections start with
  `Optional:`.
- One `#` per page; never skip a level; never leave a heading empty (text before the next
  subheading); introduce grouped subsections with "the following sections". Descriptive and unique;
  no numbers to signal sequence.

### Lists, procedures, tables, notices

- Introduce every list, table, code block, and image with a complete sentence: colon if it
  immediately follows, period if something intervenes. Never a fragment the items complete ("To get
  the driver, follow these steps:", not "To get the driver:"). Don't restate the heading.
- Numbered lists for sequence, bullets otherwise, description lists (bold run-in term) for
  term-description pairs. Run-in terms end with a colon, a period, or the house spaced em dash
  (`**term** — description`), consistently within one list. Parallel structure; capitalize each
  item; end with a period unless the item is a single word, has no verb, is entirely code, or is
  entirely a link. No one-item lists. No _etc._ or _and so on_: introduce the list as non-exhaustive
  instead ("data like …").
- Procedures: one action per step, imperative verb in the first sentence, location or goal before
  the action, result in the same paragraph after the action. A single-step procedure is one bulleted
  sentence. Optional steps start with `Optional:`. Instead of "run the following command", say what
  it does ("Deploy the load generator:"). No _please_, no keyboard shortcuts, only the best way.
- Tables only for three or more data points per item; header row in sentence case, no end
  punctuation; no merged cells; no table for layout, a single column, or code.
- Notices sparingly: write it inline first. **Note** = useful but not required; **Caution** =
  proceed carefully; **Warning** = don't, or irreversible. Never a note for a prerequisite, a
  required step, a result, or a cross-reference. In GitHub-rendered Markdown, the alert syntax
  `> [!NOTE]` / `> [!CAUTION]` / `> [!WARNING]` carries the same semantics; use `[!TIP]` as a
  note-grade aside and avoid `[!IMPORTANT]`, because required information belongs in the flow. Never
  two notices in a row.

### Links

- Link text is the target's title or a short descriptive phrase that reads on its own; never _here_,
  _click here_, _this document_, _this post_, or a bare URL. Important words first; the same text
  never points at two targets.
- Cross-reference formula: "For more information, see [X]." / "For more information about Y, see
  [X]." Use _see_, and _about_ rather than _on_. Punctuation outside the link; no quotes around
  linked titles. Include the abbreviation inside the link ("[Google Kubernetes Engine (GKE)]") and
  the noun with a code item ("the [`--hostname` flag]").
- Fewer, sharper links: each one is a decision for the reader. Give short context inline instead
  when a sentence suffices; link once per page to a destination. Say when a link downloads a file or
  leaves the site. Wiki links follow the `wiki-conventions` skill (Markdown links, never `[[…]]`).

### Code in text, samples, commands

- Code font (backticks) for anything typed or in code: filenames and paths, package and command
  names, flags, environment variables, method / class / function names, keywords, types, HTTP verbs
  and status codes, ports, query parameters, literal values, placeholders, command output. Ordinary
  font for product, project, and organization names, domain names, and URLs the reader follows. No
  quotation marks around code.
- **Never inflect a code item.** Put a noun after it and inflect the noun: "the `close` method",
  "`Intent` objects", "the `ADDRESS` constant's value", "send a `POST` request". Refer to files as
  "the `config.json` file"; name file _types_ by their formal name ("a JSON file", not "a `.json`
  file"). It is _filename_, not _file name_.
- Placeholders are `UPPERCASE_WITH_UNDERSCORES` in code font, descriptive, no `foo` / `x`, no
  brackets or `$` inside. Explain every placeholder the first time: "Replace `BUILD_ID` with …", or
  "Replace the following:" + a list in order of appearance.
- Samples: introduce with a sentence; fenced with a language hint; 2-space indentation unless the
  language's guide says otherwise; wrap at 80 characters; mark omissions with a comment in the
  sample's language, never `...`.
- Commands: copy-pasteable, so only runnable text plus placeholders in the block; no `[ ]`, `{ | }`,
  `...` in a block the reader copies (reference syntax uses them: `[OPTIONAL]`, `{A|B}`, `ARG...`).
  Show the common case and mention extra flags in prose. `$` prompt on every input line when a block
  has several; optional for a one-liner but consistent across the document; never the cwd before the
  prompt. Output in a separate block, introduced by "The output is similar to the following:".
  Continue long lines with ` \` and a four-space indent.
- HTTP: "an HTTP `400 Bad Request` status code" (not response / error code); ranges as `2xx`.
- Reference descriptions (JSDoc, API docs): third-person present-tense fragments: "Returns the …",
  "Creates a …", "Called by …"; parameters "The …" / "A …" with a period; booleans "True if …; false
  otherwise." Don't repeat the class name; no _e.g._ (doc generators cut at the first period).
- UI: bold the label; _click_ (desktop), _tap_ (touch), _press_ (keys), _select_ (an item, a
  checkbox), _clear_ (a checkbox), _enter_ (text). Never _click on_. Menus: "Select **View > Tools >
  Developer Tools**". No _pop-up_, _drop-down_; say dialog, menu, list.
- Examples use reserved fixtures: `example.com` / `.org` / `.net`, `dana@example.com`, names from
  Google's list (Alex, Dana, Kai, Quinn, Taylor…), `192.0.2.0/24`, `2001:db8::/32`; meaningful
  names, never `foo` / `bar` / `baz`.
- Product names: official capitalization, full name, no article before a product ("Use Node.js"; but
  "the `npm` CLI", because tools and APIs take _the_), no plural, never a verb; a possessive is fine
  in human-read prose (house carve-out, § Punctuation and mechanics). Code font for the command
  (`node`, `git`, `curl`), ordinary font for the product (Node.js, Git).

### Numbers, dates, units

- **Spell out zero through nine; numerals for 10 and up**, but always numerals for versions,
  technical quantities (memory, disk, limits, QPS), prices, percentages, dimensions, decimals,
  negatives, ranges, measurements, and any number under 10 in a sentence with a number over 9. Spell
  out a number that starts a sentence (or rewrite) and all ordinals (_first_, not _1st_).
- Commas in numbers of four or more digits (_2,000_); period as decimal point; leading zero (_0.3_);
  `40%` with no space; `192x192` with a lowercase _x_ and no spaces.
- Dates in prose: _January 19, 2017_ (comma after the year mid-sentence; _January 2017_ without).
  Numeric dates: `YYYY-MM-DD` (ISO 8601), never slashes. Date before time ("2017-04-15 at 3 PM").
  Times: 12-hour clock unless the UI uses 24-hour, capital AM or PM with a space, minutes dropped on
  round hours; avoid time zones, and spell them out with a UTC offset when unavoidable. No seasons:
  name the month or quarter.
- A space between number and unit (_64 GB_, _50 °C_), with `&nbsp;` in rendered HTML or Markdown
  where a line break would split them; no space before `%` or `°` (angle) or after `$`. Unit
  abbreviations don't pluralize (_64 GB_) and don't hyphenate (_200 GB disk_); spelled-out units do
  (_64-bit system_). Use the unit system of the thing documented: _MiB_ when you mean 1024². _per_
  instead of a slash in a sentence (_requests per day_; _Gbps_ is fine); the slash stays where the
  rate is unit notation — table cells, measurement prose (_req/s_, _items/s_).

### Punctuation and mechanics

- Hyphenate compound modifiers before a noun (_well-designed app_, _Android-specific_), not after a
  verb; never after _-ly_ adverbs; prefixes close up (_metadata_, _preprocessing_) except _self-_,
  _cross-_, before capitals or numbers (_non-Google_, _post-2000_), or to avoid misreading. Closed
  compounds: _webpage_, _hostname_, _filename_, _tradeoff_, _workaround_, _runtime_ (noun).
- Straight quotation marks; commas and periods inside the closing quote, except around a literal
  string, where they go outside (and prefer code font to quotes for literals). Italics for a new
  term and for words-as-words ("the word _and_"), not bold or quotes.
- Abbreviations: spell out on first use, "_Border Gateway Protocol_ (_BGP_)", then the abbreviation
  alone; don't capitalize the long form only because the acronym is capitalized; skip the spell-out
  for AI, API, HTML, PDF, URL, REST, RAM, MB. **No _e.g._ or _i.e._:** write _for example_ or _that
  is_. _10 times_, not _10x_; _approximately_, not _approx._; _a_ / _an_ by pronunciation (_a SQL_,
  _an SAP_); never an abbreviation as a verb ("use SSH", not "ssh into"). No periods in acronyms;
  plurals without apostrophes (_APIs_, _OSes_).

## House decision history

- **Dashes.** Ruled by Eugene 2026-08-19: the three-dash rule in § Punctuation and mechanics is the
  house standard on every surface — new documents included — and it replaces the skill's first-day
  default of closing the em dash in new documents. Existing prose already follows it, so there is
  nothing to sweep; the docs pass's en-dash-to-hyphen range conversions in apodict were reverted the
  same day. What still needs judgment is density, not spacing.

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
  _e.g._ → _for example_, _i.e._ → _that is_, _etc._ → rephrase as non-exhaustive (_such as_), _for
  instance_ → _for example_, _learnings_ → _knowledge_, _pros_ / _cons_ → _advantages_ /
  _disadvantages_.
- **Register words to cut (Claude's own vocabulary, measured 2026-08-29; full table in
  `references/ai-tells.md`):** _reach for_ → _use_ / _pick_; _genuinely_, _plainly_, _honestly_,
  _outright_, _merely_, _deliberately_ → drop; _quietly_ / _silently_ → drop or say what happens;
  _seam_ → _boundary_; _the shape of X_ → the concrete noun; _lever_ → _option_; _buys you_ / _pays
  for itself_ / _earns its keep_ → _gets_ / _is worth it_; _the moment X_ → _when X_; _halves_ →
  _cuts in half_; _whoever_ → _anyone who_; _load-bearing_ → _the part everything depends on_;
  _through-line_ → _thread_; _papers over_ → _hides_.
- **Orwell's operators and tags (measured 2026-09-07; full table in `references/ai-tells.md`):**
  _give rise to_ → _cause_; _have the effect of_ → the verb itself; _make use of_ → _use_; _reach a
  conclusion_ → _conclude_; _perform a check_ → _check_; _prior to_ → _before_; _subsequent to_ →
  _after_; _with respect to_ → _about_; _in the event of_ → _if_; _going forward_ / _where
  appropriate_ / _at this point in time_ → drop; _not un-X_ → _X_; _ad hoc_ → _one-off_ /
  _improvised_; _a priori_ → _in advance_; _de facto_ → _in practice_; _status quo_ → _the current
  state_; _vis-à-vis_ → _compared with_; _whilst_ / _amongst_ → _while_ / _among_; _commence_ →
  _start_; _aforementioned_ → _the earlier_ or the noun. In the blog voice _in order to_, _the fact
  that_, _in terms of_, _leverage_, and _paradigm_ are Eugene's own words and carry no tell;
  documentation still takes the short form.
- **Modals:** _can_ = ability or optional; _might_ = possibility; _must_ = required; _may_ only for
  permission in a policy or legal sense; avoid _should_, _could_, _would_, _will_.
- **Time and position words:** _after_ not _once_; _because_ not _since_ / _as_; _although_ not
  _while_ for contrast; _earlier_ / _later_ for versions ("2.2 or later", never "2.2+" or "higher");
  _preceding_ / _following_ for position; _if … then_ with the _then_; _per_ only for rates
  (_requests per day_), otherwise _for each_ / _according to_.
- **Accounts:** _sign in_ (verb) / _sign-in_ (noun, adjective), _sign in to_ not _sign into_; _log
  in_ / _login_ only when the tool says so; _username_ not _account name_; _email_ is a noun (_send
  email_).
- **Spelling and compounds:** _filename_, _hostname_, _file system_, _codebase_, _backend_ /
  _frontend_, _endpoint_, _namespace_, _whitespace_, _wildcard_, _lifecycle_, _timestamp_,
  _toolkit_, _walkthrough_, _hardcoded_, _prebuilt_ but _pre-existing_, _sub-command_; _runtime_
  (noun: the environment) versus _run time_ (when it runs); _setup_ (noun) / _set up_ (verb),
  _login_ / _log in_, _timeout_ / _time out_, _failover_ / _fail over_, _plugin_ (noun) / _plug-in_
  (adjective) / _plug in_ (verb); _read-only_, _third-party_ (adjective) / _third party_ (noun),
  _key-value pair_, _data type_, _checkbox_, _dialog_ (not _dialog box_ or _pop-up_), _drop-down_
  only to disambiguate (say _list_ / _menu_), _ID_, _internet_, _web_, _Markdown_, _curl_ (not
  _cURL_), _a SQL_, _I/O_, _UTF-8_, _RFC 2318_, _US_; _repository_ not _repo_ in running prose
  (`repo` stays inside code spans and identifiers — `repo:github.com/…`, `gh repo` — and in table
  cells where width matters; ruled 2026-08-19), _regular expression_ not _regex_, _configuration_
  not _config_ (except the code name), _extract_ not _untar_ / _unzip_, _tar file_ not _tarball_,
  _Kubernetes_ not _k8s_, "use SSH" / "the `ssh` command" never "ssh into".
- **Grammar notes:** _data is_ (mass noun); _indexes_ (plural, except math), _appendixes_; _listen
  on_ a port; _directory_ in command-line contexts, _folder_ in GUIs; _app_ for end-user programs;
  _media type_ not _MIME type_; _status code_ not _error code_; _this document_ not _this article_;
  _deprecated_ ≠ _removed_; _element_ versus _tag_ (a tag marks an element); a link is not a
  _button_; "the area appears" not "the area displays"; no _Create a new …_ (_Create a …_ alone).
- **Inclusive replacements:** _allowlist_ / _denylist_ (nouns; rewrite verbs as the action);
  _primary_ / _replica_, _controller_ / _worker_, _leader_ / _follower_ for _master_ / _slave_;
  _exempt_ / _legacy_ for _grandfathered_; _placeholder_ for _dummy_; _quick check_ / _preliminary
  check_ for _sanity check_; _built-in_ for _native_; _stop responding_ for _hang_; _stop_ / _exit_
  / _cancel_ for _kill_ / _abort_ / _terminate_; _person-hours_; _maintenance_ / _cleanup_ for
  _housekeeping_; _affected area_ for _blast radius_; _expert_ for _ninja_ / _guru_;
  _platform-independent_ for _agnostic_; _dash-case_ for _kebab-case_; describe the capability
  instead of _first-class_; _everyone_ for _guys_.

## Review procedure

When asked to review, edit, or polish prose (the `docs-review` skill delegates here):

1. Read the whole document first; note its audience, its dominant conventions (dash density, heading
   style, import form), and the project's `AGENTS.md` / `dev-docs/` rules.
2. Structure: headings (case, form, levels), list and table introductions, procedure shape, notices,
   link text.
3. Sentences: person, voice, tense, condition-first, modals, sentence length, paragraph focus,
   pronoun antecedents, AI tells and cadence (`references/ai-tells.md`; on a Markdown file, run
   `prose-tells --check` from this skill's directory and treat each finding as a judgment call).
4. Words and mechanics: word list, abbreviations, numbers, dates, units, punctuation, code font,
   placeholders, inflected code items.
5. Don't touch code blocks, signatures, identifiers, tables' data, or links' targets; keep every
   technical claim as stated (or flag it, and never silently "correct" a fact).
6. Run the project's `lint` (prettier formats Markdown) and report the classes of change made, with
   one example each, rather than a line-by-line log.
