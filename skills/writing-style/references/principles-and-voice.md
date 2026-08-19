# Google style digest — principles, voice, and language

Source: https://developers.google.com/style (pages fetched 2026-08-19; each page reports "Last updated 2024-10-15 UTC"). Content below is condensed from the pages themselves; quoted fragments are verbatim.

---

## Highlights — https://developers.google.com/style/highlights

Overview page; each bullet links to a fuller page.

Tone and content

- Be conversational and friendly without being frivolous.
- Don't pre-announce anything in documentation.
- Use descriptive link text.
- Write accessibly.
- Write for a global audience.

Language and grammar

- Use second person: "you" rather than "we."
- Use active voice: make clear who's performing the action.
- Use standard American spelling and punctuation.
- Put conditions before instructions, not after.
- For usage and spelling of specific words, see the word list.

Formatting, punctuation, and organization

- Use sentence case for document titles and section headings.
- Use numbered lists for sequences.
- Use bulleted lists for most other lists.
- Use description lists for pairs of related pieces of data.
- Use serial commas.
- Put code-related text in code font.
- Put UI elements in bold.
- Use unambiguous date formatting.

Images

- Provide alt text.
- Provide high-resolution or vector images when practical.

---

## Philosophy of this style guide — https://developers.google.com/style/philosophy

- The guide "codifies and records our style decisions and describes our house style"; it "doesn't claim to be objectively correct."
- It is _not_ intended to: provide an industry documentation standard; compete with other well-known style guides; replace a style guide you already follow; provide a complete set of basic writing guidelines; provide legal advice.
- Reasons are generally not given for guidelines, because: many decisions are "driven by accessibility, localization, globalization, and ease of understanding" (repeating that everywhere would be repetitive); often "a given guideline is one good option among several" chosen for consistency; "Too much explanation can clutter up a page. Readers most often want a brief answer to a specific question."
- Occasional explanations appear on the "What's new" page.

(Implication for a skill: when in doubt between two defensible options, pick one and be consistent — consistency is the stated rationale for many rules.)

---

## Voice and tone — https://developers.google.com/style/tone

- Aim for a voice that is "conversational, friendly, and respectful without using slang or being overly colloquial or frivolous"; "casual, natural, and approachable, not pedantic or pushy."
- "Try to sound like a knowledgeable friend who understands what the developer wants to do."
- Don't write exactly the way you speak (speech is more colloquial and verbose), but aim for conversational rather than formal.
- Don't try to be super-entertaining; don't aim for super-dry. "Be human, let your personality show, and be memorable" — but the primary purpose is information for someone who may be in a hurry.
- Readers come from many cultures with varying English ability: avoid culturally specific references; simple, consistent writing eases translation.

Avoid where possible

- Buzzwords or technical jargon.
- Being too cutesy; wackiness, zaniness, goofiness.
- Figurative language, including metaphors and ableist language.
- Placeholder phrases like _please note_ and _at this time_.
- Choppy or long-winded sentences.
- Starting all sentences with the same phrase (such as _You can_ or _To do_).
- Current pop-culture references.
- Exclamation marks ("In general, avoid exclamation points").
- Phrasing that denigrates or insults any group of people.
- Phrasing in terms of _let's_ do something.
- "Using phrases like _simply_, _It's that simple_, _It's easy_, or _quickly_ in a procedure."
- Internet slang or abbreviations such as _tl;dr_ or _ymmv_.

Techniques to consider

- If stuck, ask "What am I trying to say?" — the answer is usually what to write.
- Ask a colleague to review tone if uncertain.
- Read parts aloud; if a sentence is awkward or confusing when spoken, make it more conversational.
- Use transitions between sentences (_Though_, _This way_) to reduce stiltedness; note _However_ / _Nonetheless_ can make paragraphs _more_ stilted.
- Above all, communicate useful information clearly and directly; "that's the most important part."

Politeness and _please_

- Don't use _please_ in instructions — "using _please_ in a set of instructions is overdoing the politeness."

| Recommended                                         | Not recommended                                            |
| --------------------------------------------------- | ---------------------------------------------------------- |
| To view the document, click **View**.               | To view the document, please click **View**.               |
| For more information, see [link to other document]. | For more information, please see [link to other document]. |

Tone calibration examples (too informal / just about right / too formal)

| Too informal                                       | Just about right                                           | Too formal                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Dude! This API is totally awesome!                 | This API lets you collect data about what your users like. | The API documented by this page may enable the acquisition of information pertaining to user preferences.                       |
| Then—BOOM—just garbage-collect, and you're golden. | To clean up, call the `collectGarbage` method.             | Please note that completion of the task requires the following prerequisite: executing an automated memory management function. |

---

## Active voice — https://developers.google.com/style/voice

- Use active voice (grammatical subject performs the action); "Make clear who's performing the action."
- Passive voice makes it easy to omit who acts, so readers can't tell whether the reader, the computer, the server, an end user, or a site visitor is supposed to do something.
- Passive with _by_ is legal but weaker: "whenever possible, make the doer the subject of the sentence."

| Recommended                                                      | Not recommended                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Send a query to the service. The server sends an acknowledgment. | The service is queried, and an acknowledgment is sent.                      |
| Send a query to the service. The server sends an acknowledgment. | The service is queried by you, and an acknowledgment is sent by the server. |

Exceptions — passive is OK:

- To emphasize an object over an action: "The file is saved."
- To de-emphasize a subject or actor: "Over 50 conflicts were found in the file." (not "You created over 50 conflicts in the file.")
- If readers don't need to know who's responsible: "The database was purged in January."

---

## Second person and first person — https://developers.google.com/style/person

- Address the reader as _you_ / _your_, not _we_ / _our_ / _us_. "Assume that the reader is the person who's doing the tasks or making the decisions."
- Use the word _user_ only for the user of the software your reader is developing.
- When telling the reader to do something, use the imperative (the _you_ is implied): "Click **Submit**."
- Imperative in running text is OK once the addressee is established, but consider whether it needs to be formatted as a procedure.
- Use second person for what the reader does, third person for what the software or an end user does (e.g., in API docs: third person for facts about programming elements, _you_ for what to do with them).
- First-person plural (_we_, _our_, _us_) is OK for the organization authoring the document, if the antecedent is clear: "Example Organization provides A and B, but we don't provide C and D." / "For more information, contact our sales organization."
- Identify who _you_ is (developer? sysadmin?) and be consistent — sometimes with an explicit audience sentence near the beginning.

| Recommended                                                                                                                                     | Not recommended                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The following sections describe how you can create a website.                                                                                   | The following sections describe how we can create a website.                                                                                                                                        |
| Consider adding a description to your table.                                                                                                    | Let's add a description to our table.                                                                                                                                                               |
| This document shows you how to develop an app for your organization.                                                                            | This document shows the user how to develop an app for their organization.                                                                                                                          |
| You can obtain the IP address for the appliance from your network administrator. Store the address in a variable for future use in the runbook. | To hold the backup data, create a storage bucket. In the Google Cloud console, go to the **Buckets** page. Click **Create bucket**. (multi-step imperative in running text — should be a procedure) |

---

## Present tense — https://developers.google.com/style/tense

- "Use present tense for statements that describe general behavior that's not associated with a particular time."
- Future tense (_will_) is fine to distinguish an action that genuinely occurs later (e.g., asynchronous delivery): "Add the filename to the backup list. The file will be archived the next time the backup process runs." / "A message is sent that will notify any Pub/Sub subscribers." (not "…that notifies…" — Pub/Sub is asynchronous).
- "Don't use future tense to describe how a product or feature will work after the next release or update."
- Avoid the hypothetical future _would_.

| Recommended                                                                       | Not recommended                                                                              |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Send a query to the service. The server sends an acknowledgment.                  | Send a query to the service. The server will send an acknowledgment.                         |
| If you send an unsubscribe message, the server removes you from the mailing list. | You can send an unsubscribe message. The server would then remove you from the mailing list. |

---

## Pronouns — https://developers.google.com/style/pronouns

- Ensure every pronoun clearly refers to its antecedent; avoid vague references.
- Follow demonstrative pronouns (_this_, _these_) with a noun: "Set this value to true." not "Set this to true."; "These approaches are your best options." not "These are your best options."
- Gender: don't use _he_/_him_/_his_/_she_/_her_ as gender-neutral pronouns; don't use _he/she_ or _(s)he_. Use singular _they_.
- Use optional pronouns (_that_, _which_) to avoid ambiguity.
- Avoid first-person pronouns (_I_, _we_, _us_, _our_, _ours_) except in: FAQ questions; a document whose author comments in first person; _we_ for your organization after naming it.
- Use _you_ whenever possible.
- Relative pronouns: _that_ introduces a restrictive clause, no comma ("The echidna that has a long snout is furry." — a particular echidna); _which_ introduces a nonrestrictive clause, preceded by a comma ("The echidna, which has a long snout, is furry." — all echidnas). Don't substitute one for the other.
- Use _who_ for people instead of _that_ (if unsure, _that_ is generally OK). _Whose_ works for people, animals, and things: "Examine the variables whose values are set at compile time."

| Recommended                                                                                                   | Not recommended                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| If you type text in the field, the text doesn't change.                                                       | If you type text in the field, it doesn't change.                                                       |
| The name of the function to execute in the given script. The name does not include parentheses or parameters. | The name of the function to execute in the given script. It does not include parentheses or parameters. |
| Right-click the link that you want to open.                                                                   | Right-click the link you want to open.                                                                  |
| You can use other option parameters, which are described in the following section.                            | You can use other option parameters, described in the following section.                                |

---

## Contractions — https://developers.google.com/style/contractions

- Use common two-word contractions (_you're_, _don't_, _there's_) — the docs have an informal tone.
- Prefer negation contractions (_isn't_, _don't_, _can't_): "It's easy for a reader to miss the word _not_ when they're scanning, whereas it's harder to misread _don't_ as _do_."
- To emphasize a negative, formatting like `is <em>not</em>` is allowed, "But in most cases, you don't need emphasis."
- Don't invent nonstandard contractions (_guides're_, _browser's_ where _'s_ means _is_).
- Don't use three-word contractions (_mightn't've_).

---

## Anthropomorphism — https://developers.google.com/style/anthropomorphism

- "Don't attribute human qualities to software or hardware."
- Anthropomorphism is figurative language: "less precise and is often harder to understand and translate than direct language."

| Recommended                                           | Not recommended                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| A Delimiter object specifies where to split a string. | A Delimiter object tells the splitter where a string should be broken. |
| The PC detects a new device.                          | The PC sees a new device.                                              |

---

## Sentence structure — https://developers.google.com/style/sentence-structure

- When telling the reader to do something, "mention the circumstance, conditions, or goal before you provide the instruction" — so readers can skip instructions that don't apply.
- (Procedural application: see the Procedures page.)

| Recommended                                                                                                             | Not recommended                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| For more information, see [link to other document].                                                                     | See [link to other document] for more information.                                                                     |
| To delete the entire document, click **Delete**.                                                                        | Click **Delete** if you want to delete the entire document.                                                            |
| If your app is located in one of the following regions, using custom domains might add noticeable latency to responses: | Using custom domains might add noticeable latency to responses if your app is located in one of the following regions: |

---

## Paragraph structure — https://developers.google.com/style/paragraph-structure

- Break up paragraphs for scannability; avoid walls of text. "Each paragraph should address a single idea in the fewest words and in the fewest sentences possible."
- "Don't make sentences longer in order to limit the number of sentences in a paragraph. Use shorter sentences and paragraphs."
- "A paragraph longer than 5 or 6 sentences is often an indication that the paragraph is trying to convey too much information" — split it or cut content. But don't split a paragraph that is a single idea; a one-sentence paragraph is OK; >6 sentences can be OK if still one idea.
- Put critical information first in the paragraph; "Don't hide the key point of a paragraph at the end of the paragraph. Readers don't read every word."
- Left-align text; don't center, full-justify, or right-align.
- Don't force line breaks (hard returns) within sentences and paragraphs — they break in resized windows, other devices, enlarged text.

---

## Jargon — https://developers.google.com/style/jargon

- Jargon = "the specialized and often figurative terminology of a specific group to represent a larger concept" (_camel case_, _swim lane_, _break-glass procedure_, _out-of-the-box_); also "vaguely defined or overloaded terms like _solution_, _support_, or _workload_."
- Jargon hampers content that is clear, reaches a global audience, serves readers at various knowledge levels, and is inclusive.
- Jargon can be worth keeping when readers search for it (SEO). Before using it, ask:
  - **Can you write around the term?** E.g. instead of _Hold a post-mortem_ → _When the project is finished, review what processes worked or didn't work_; instead of _Create a back-of-the-envelope design_ → _Use an informal design process_.
  - **Can you replace it with a more specific term?** _affected area_ / _spatial impact_ (for _blast radius_), _import_ / _load_ (for _ingest_), _ready-made_ / _pre-built_ (for _off-the-shelf_). Terms the word list marks "Don't use" (offensive, violent, not inclusive) must be replaced or written around.
  - **Used only once?** Describe in plain language and put the term in parentheses, or link to a trusted definition: "You then move the task to an earlier part of the process (also known as _shifting left_)." / "A [split-brain] situation can develop."
  - **Used throughout?** Briefly describe in parentheses on first reference, or link: "The application is in the same state as a _cold standby_ (a backup or redundant system that's identical to a primary system)." / "A better approach is to use a pattern called a [_dead letter queue_]."
  - **Used in a command or code sample?** Use the word only in direct reference to the code item, formatted as code, and make clear what it refers to.

| Recommended                                                                                             | Not recommended                                                                           |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Add a user to the allowlist (`whitelist`) by entering the following: `whitelist adduser EMAIL_ADDRESS`. | Add a user to the whitelist by entering the following: `whitelist adduser EMAIL_ADDRESS`. |

---

## Avoid excessive claims — https://developers.google.com/style/excessive-claims

- An _excessive claim_: a statement about performance or cost "that isn't easily verifiable with data that's available to the reader"; a statement about security "that would be invalidated by a security incident"; or a statement "that might be interpreted as subjective or even disparaging, especially about third-party products."
- Judge against what might be true in the future, not just today.
- Avoid superlatives: _best_, _simplest_, _fastest_, _never_, _always_. Be careful with _ensure_ and _guarantee_ — "use them only when something can truly be ensured or guaranteed."
- For specific performance claims (speed, storage, …), reference the source.
- Don't claim a product "is secure"; say it "helps with security" or "is designed for security" — true even after an incident.
- Statements about competitors may be wrong now (misinterpretation) or later (new release).
- "The safest approach is always to write factually and objectively, limiting what you say to verifiable information that will be true over the lifespan of your documentation."

| Recommended                                                                                                                                                                                                        | Not recommended                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Our product distributes datasets and computation in memory across a cluster, and therefore it can be faster for this scenario than ExampleCorporation's product. For more information, see Performance comparison. | Our product is faster than ExampleCorp's product.                      |
| Using our security product is part of an overall strategy that helps prevent account takeovers from phishing attacks.                                                                                              | Our security product prevents account takeovers from phishing attacks. |

---

## Future features — https://developers.google.com/style/future

- "Avoid documenting future features or products, even in innocuous ways. Don't pre-announce anything in documentation unless it has been approved by your legal counsel."
- See also Present tense and Timeless documentation.

---

## Timeless documentation — https://developers.google.com/style/timeless-documentation

- "Timeless documentation is documentation that avoids words and phrases that anchor the documentation to a point in time or assume knowledge of prior or future products and features. In general, document the current version of a product or feature."
- Focus on how the product works right now — "not on how it has changed from previous versions, and not how it might change in the future."
- Time-based words are OK in press releases, blog posts, release notes (_new_ in an announcement), and in procedural content to mark a state change (_The VM goes offline soon after you send the shutdown command_) — but not when describing product capabilities in product/reference docs.
- Value: less maintenance; doesn't assume the reader knows earlier versions.
- Four classes of offenders: words that make promises or project plans (_at present_, _as of this writing_, _eventually_ — can prematurely disclose plans or imply change); words that are implied (docs are assumed current unless a version is specified, so _currently_ / _as of this writing_ add nothing); words that go stale soon after publication (_soon_, _latest_); words that assume prior knowledge (_new_ — if you must, give a reference point: "The January 14, 2021 release of BigQuery includes a new resource panel.").
- Avoid when describing capabilities: _as of this writing_, _currently_, _does not yet_, _eventually_, _existing_, _future_ / _in the future_, _latest_, _new_ / _newer_, _now_, _old_ / _older_, _presently_ / _at present_, _soon_.

| Recommended                                                  | Not recommended                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| These subcommands let you interact with HTTP load balancing. | These new subcommands let you interact with HTTP load balancing. |
| The following command-line options aren't supported:         | The following command-line options aren't currently supported:   |
| The emulator supports the following filters:                 | The emulator now supports the following filters:                 |

---

## Prescriptive documentation — https://developers.google.com/style/prescriptive-documentation

- "Write prescriptive documentation." Prescriptive (opinionated) docs recommend a way to achieve a task — "It tells the reader what to do instead of giving them a list of options to choose from." For complex, multi-approach goals, recommend a path.
- Affects: the document's purpose and structure (state a clear, specific purpose; headings and content serve it); example scenarios and procedures (the use cases most likely relevant to readers); sample commands (the commands and arguments for the most common use case).
- Word choice: pick the auxiliary verb that matches the meaning — _must_, _can_, _might_. "Generally avoid the word _should_" — it "implies that the action is recommended but optional, which can leave the reader unsure about what to do."
- Decide: action required vs optional; outcome expected vs possible; state actual vs recommended.
  - Required action → _must_, or a clear imperative ("Do the following before you continue.").
  - Recommended action → _We recommend …_ / _Google recommends …_. _Should_ is acceptable only if the recommendation is generally recognized ("You should use a strong password …", "You should follow the principle of least privilege …").
  - Optional action → _can_ ("You can also use approach B to solve the same problem.").
  - Expected outcome → state it ("The process returns 10 items.").
  - Possible outcome → _might_ or _can_ ("The process can take about 30 minutes.").
  - Actual state → don't write "The value should be true."; say which you mean: "You must set the value to true." / "The server sets the value to true." / "If the value is false, follow these steps to change it to true."

| Recommended                                                                                                        | Not recommended                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Ensure that the Classroom Share Button conforms to our min-max size guidelines and related color/button templates. | The Classroom Share Button should conform to our min-max size guidelines and related color and button templates. |
| The column of the data table that the filter operates on.                                                          | The column of the data table that the filter should operate on.                                                  |
| Whether it's a brand new project or an existing one, perform the following steps.                                  | Whether it's a brand new project or an existing one, here's what you should do.                                  |

---

## Write for a global audience — https://developers.google.com/style/translation

- Write in US English, with localization, translation, and internationalization in mind. (Localization = adapting product + docs for a country, beyond translation — currencies, units. Translation = one language to another. Internationalization = designing to minimize localization effort.)

Use clear, concise, unambiguous language

- Use simple words: _start_/_begin_ not _commence_; _so_ not _consequently_; _use_ not _utilize_/_leverage_ (unless conveying a special sense, e.g. "Cloud Spanner utilizes up to 100% of the available CPU resources").
- Use a single word for a phrase: _some_/_many_ not _a number of_.
- Write shorter sentences: "The shorter the sentence, the easier it is to translate."
- Avoid phrasal verbs when possible; substitute a simpler verb. Exceptions: _set up_, _log in_, _sign in_.
- Don't use more than two nouns as modifiers of another noun.
- Don't misplace modifiers — put _only_ immediately before the word it relates to.
- Use present tense and active voice; avoid complex or uncommon verb forms.
- Use words in their primary sense; don't use the same word as noun and verb nearby (see word list: _once_, _while_, _as_, _since_).
- Avoid directional language (_above_, _below_) in procedural documentation.
- Use qualifying nouns for technical keywords: "the `example.yaml` file", not bare "`example.yaml`".
- Repeat a word if redundancy improves comprehension ("If the VM has started and if you're able to connect…").
- Use helper words (_then_, _that_, _of_) that conversational English drops: "If the attribute key is not found, then the default value is returned."; "assumes that you have"; "Identify all of the datasets."; "Start the profiler, and then run the app."
- Don't omit relative pronouns (_that_, _which_).
- Define abbreviations — spell out at least on first use.
- Clarify antecedents: replace an ambiguous pronoun with the noun.
- Apostrophes: don't form plurals with _'s_; don't pluralize or possessivize trademarks; don't use uncommon contractions.

Address users directly

- Use _you_, not _the user_ or _they_ (unless referring to the reader's software's user).
- Provide context; don't assume the reader knows what you're talking about.
- Avoid negative constructions when possible — tell the reader what they can do rather than what they can't.

Be consistent

- "If you use a particular term for a concept in one place, then use that exact same term elsewhere, including the same capitalization." Different names → translators assume different concepts.
- Use standardized phrases for common sentences (introducing links, output, code samples).
- Standard word order: subject + verb + object; keep the main subject and verb near the start.
- Conditional clause first.
- List items parallel in structure, with consistent capitalization and punctuation.
- Consistent typographic formats (bold/italics; don't switch italics-for-emphasis to underlining); consistent capitalization.

Be inclusive

- Unambiguous dates and times.
- No holidays, cultural practices, or sports unless known worldwide.
- Diverse example names.
- No colloquialisms, idioms, slang (_ballpark figure_, _back burner_, _hang in there_).
- "Avoid humor. Most humor is difficult to translate, and much humor is culturally specific."
- No geographically specific references like seasons ("August isn't summer in the southern hemisphere").

Images

- Use screenshots and text in figures sparingly. "Images don't get translated. Any new information should be conveyed through text."

| Recommended                                                            | Not recommended                                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| This document uses the following terms:                                | This document makes use of the following terms:                   |
| A cloud-native DevSecOps pipeline in a hybrid environment              | A hybrid cloud-native DevSecOps pipeline                          |
| Request only one token. / Request no more than one token.              | Only request one token.                                           |
| You can programmatically update the rules that you previously defined. | You can programmatically update the rules you previously defined. |

---

## Write accessible documentation — https://developers.google.com/style/accessibility

- Not exhaustive; "When documentation is written with accessibility in mind, it improves the overall experience for all readers." (WHO: ~15% of people have an accessibility need.)

General

- Don't use ableist language.
- Ensure everything (tabs, buttons, interactive elements) is reachable by keyboard only.
- Test with a screen reader.
- Use semantic HTML (`em` only for emphasis, not italics); prefer native elements over custom styles.
- Avoid unnecessary font formatting (screen readers announce it).
- Document a product's specialized accessibility features explicitly.
- Don't force line breaks within sentences/paragraphs.
- Avoid camel case and all caps when possible (some screen readers spell capitals; some languages are unicase).
- Not all punctuation is read: avoid exclamation marks, question marks, and semicolons when possible; meaning must survive without punctuation.
- Don't use _&_ for _and_ in headings, text, navigation, TOCs (OK when a UI element uses it, in space-constrained table headings/diagram labels, and in code).

Ease of reading

- Break up walls of text: paragraphs, headings, lists.
- "Use shorter sentences. Try to use fewer than 26 words per sentence."
- Define acronyms and abbreviations on first use and if used infrequently.
- Use parallel structure for similar things (e.g. start each list the same way).
- Put the distinguishing / important information of a paragraph in its first sentence.
- Clear, direct language; no double negatives or "exceptions for exceptions."
- Left-align; don't center or full-justify.

Headings and titles

- Descriptive, unique headings; keep a hierarchy; don't skip levels (`h3` only after `h2`); use CSS, not a wrong level, to restyle; no empty headings; tag with real heading elements (`#`, `##` in Markdown); one level-1 heading for the page title.

Links

- Meaningful link text that "should make sense when read out of context."
- "Don't use _click here_ or _read this document_."
- "Use _see_ to refer to links and cross-references."
- Explain unexpected link behavior (download, new tab, same-page jump).
- Avoid adjacent links; separate with a character.

Lists

- In a procedure, make each instruction a list item.

Images

- Every image gets an `alt` attribute summarizing its intent; empty alt for decorative images.
- Don't present new information only in images; always provide equivalent text.
- Don't repeat images unless necessary.
- "Don't use images of text, code samples, or terminal output. Use actual text."
- Prefer SVG over PNG.

Videos / GIFs: captions, transcripts, or descriptions; translatable captions; no flickering or flashing.

Tables

- Introduce a table in the preceding text.
- Headings only in first row/column (`th`); `scope` when both; `headers` + unique IDs for multiple heading rows.
- Avoid tables mid-procedure; don't merge cells (`colspan`/`rowspan`); use tables only when they are the best way to present the information.

Interactive elements / forms / custom CSS-JS

- Introduce interactive elements in the preceding text ("To see a list of requirements, expand the **Requirements** section.").
- Label every input with `label`, outside the field; error messages state what went wrong and how to fix it.
- Contrast ratio 4.5:1 for text; avoid `visibility:hidden` / `display:none`; avoid mouseover-only events (add focus/blur); style order must match DOM/reading order.

Document rendering

- The document must convey its information: without sound; with only sound; without images/animation; without color; keyboard only; with magnification; without punctuation.
- Don't use color, size, location, or other visual cues as the primary channel; add a secondary cue (text label change).
- Refer to buttons and elements by their label; for unlabeled visual elements use `aria-label`, don't describe the shape.
- "Don't use directional language to orient the reader, such as _above_, _below_, or _right-hand side_." Use _earlier_, _preceding_, _following_. (RTL languages flip sides; a screen reader has no "below".)
- If a UI element is hard to find, provide a screenshot.

| Recommended                                                                       | Not recommended                                                               |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| You can continue without a path.                                                  | A missing path won't prevent you from continuing.                             |
| Click **Save**. / Click **Notifications**.                                        | Click the bell icon.                                                          |
| In the preceding diagram, clients run jobs on multi-team or single-team clusters. | In the diagram above, clients run jobs on multi-team or single-team clusters. |
| Click menu **Menu**.                                                              | In the left-side panel, click the button with three lines.                    |

---

## Write inclusive documentation — https://developers.google.com/style/inclusive-documentation

- Inclusive writing makes content "more precise and clear for all readers." Avoid idiomatic or figurative language that can be misinterpreted or distracting.
- Avoid unnecessarily gendered language (pronouns in narrative examples; _man-hours_, _mankind_).
- Avoid figurative language: no idioms, no jargon; use established, widely understood terms. "Don't use metaphors, and don't use a term in a metaphorical sense (use words in their primary sense)" — e.g. avoid _pets versus cattle_.
- Avoid ableist language: _crazy_, _insane_, _blind to_ / _blind eye to_, _cripple_, _dumb_, _sanity-check_, _dummy_ — choose a more accurate word.
- Avoid graphic or metaphorical language when a more precise term exists (e.g. don't use _STONITH_ as the term; say "fence failed nodes", at most "(sometimes referred to as _STONITH_)" once). But use the most precise, well-understood term for the context — some industry terms have no accurate synonym (word list: _terminate_, _execute_).
- Diverse and inclusive examples: gender-neutral pronouns; not US-centric (holidays, cultural practices, sports, figures of speech); diverse example names; for older people use _older adults_ / _aging population_, not _the elderly_, _seniors_, _80 years young_.
- Don't divide people (_native speakers_ / _non-native speakers_) — discuss the feature in terms relevant to anyone.
- Avoid socially charged technical terms: _blacklist_, _native_ feature, _first-class citizen_.
- Replace established non-inclusive terms: if replacement could confuse, name the old term once in parentheses, then use the inclusive term throughout: "add them to an allowlist (sometimes called a _whitelist_)"; "a Jenkins controller (master)". Often better to rewrite the sentence than swap the word.
- Non-inclusive terms embedded in code or keywords: minimize use; "Don't use a non-inclusive name or keyword unless it's in code font." First mention in code font, parenthesized if possible ("a parent node (which is named `master` in the file)"; "Start the replica by using the `START SLAVE` statement."), then the preferred term (_parent node_, _replica_) afterwards; the raw keyword only ever in code font.
- Disability and accessibility: don't call people without disabilities _normal_ or _healthy_ (use _nondisabled person_, _sighted person_, _hearing person_, _neurotypical person_); research community preference — default to person-first (_people with disabilities_, _a quadriplegic person_) but respect identity-first where preferred (autistic, blind, Deaf communities); "Use _see_ to refer to links and cross-references"; avoid judgment terms (_victim of_, _suffering from_, _wheelchair-bound_ → _experiencing_, _living with_, _uses a wheelchair_); avoid euphemisms (_physically challenged_, _special_, _differently abled_, _handi-capable_).

| Recommended                                                                                                            | Not recommended                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Before launch, give everything a final check for completeness and clarity.                                             | Before launch, give everything a final sanity-check.                                                         |
| Replace the placeholder in this example with the appropriate value.                                                    | Replace the dummy variable in this example with the appropriate value.                                       |
| If the connection doesn't respond, check for errors.                                                                   | If the connection hangs, check for errors.                                                                   |
| You can allow requests from a range of IP addresses by entering a CIDR block instead of a single address in the field. | You can allowlist a range of IP addresses by entering a CIDR block instead of a single address in the field. |

---

## Third-party content — https://developers.google.com/style/other-sources

- "Don't copy content from another source because it might violate copyright. Instead, paraphrase and link to their content." Content = text, images, code, logos, speech.
- Unless you're sure your company owns the assets, don't copy from: third-party sources (docs, websites, books, blogs, videos, images, podcasts); reference sources (dictionaries, encyclopedias, Wikipedia); open source product documentation (licenses vary — "When in doubt, don't use their content"); GitHub content (same).

| Recommended                                                                                                                                               | Not recommended                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A [recovery point objective (RPO)], which is the maximum acceptable length of time during which data might be lost from your app due to a major incident. | Recovery Point Objective (RPO): "RPO is the maximum targeted period in which data (transactions) might be lost from an IT service due to a major incident" (https://en.wikipedia.org/wiki/Disaster_recovery#Recovery_Point_Objective). |

---

## Verb forms in reference documentation — https://developers.google.com/style/reference-verbs

- In reference docs for a method, "phrase the main method description in terms of what the method does (_gets_, _lists_, _creates_, _searches_), rather than what the developer would use it to do (_get_, _list_, _create_, _search_)." I.e., third-person singular _-s_ verb, not imperative.
- See the Google Cloud API design guide for more.

| Recommended                                                  | Not recommended                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| tasks.insert: Creates a new task on the specified task list. | tasks.insert: Create a new task on the specified task list. |

---

## Top 15 rules from this slice

Ranked for an engineer writing README / wiki / dev-docs prose (most leverage first).

1. **Second person, imperative for instructions.** Address the reader as _you_; tell them what to do with a bare imperative ("Click **Submit**", "Run the tests"). Don't write _we_ / _let's_ / _the user_ for the reader; _we_ is only the authoring organization, after naming it. (person, pronouns)
2. **Active voice; name the actor.** "Send a query to the service. The server sends an acknowledgment." — not "The service is queried, and an acknowledgment is sent." Passive is OK only to emphasize the object, de-emphasize the actor, or when the actor doesn't matter. (voice)
3. **Present tense for general behavior.** "The server sends", not "will send". _Will_ only for something that genuinely happens later (async). No hypothetical _would_. (tense)
4. **Condition before instruction.** "To delete the document, click **Delete**." / "For more information, see X." — not "Click **Delete** if you want…" / "See X for more information." Lets the reader skip what doesn't apply. (sentence-structure)
5. **Be prescriptive; pick the right modal.** Recommend one path. _must_ = required (or a plain imperative); _can_ = optional; _might_/_can_ = possible outcome; "We recommend …" = recommended. "Generally avoid the word _should_" — it blurs required vs optional; never "The value should be true" for an actual state. (prescriptive-documentation)
6. **Timeless wording.** Don't write _currently_, _now_, _new_, _latest_, _soon_, _existing_, _as of this writing_, _in the future_, _does not yet_ when describing capabilities; docs are assumed current. If _new_ is unavoidable, anchor it to a version or date. Don't pre-announce features. (timeless-documentation, future)
7. **No excessive claims.** No _best_, _fastest_, _simplest_, _never_, _always_; _ensure_ / _guarantee_ only when literally true; cite the source for performance numbers; "helps with security" / "designed for security", never "is secure"; no disparaging comparisons. (excessive-claims)
8. **Short sentences, short single-idea paragraphs, key point first.** Under ~26 words per sentence; a paragraph over 5–6 sentences is a smell; "Don't hide the key point of a paragraph at the end." (paragraph-structure, accessibility)
9. **Conversational but not cute; no "please", no "simply/easy", no exclamation marks.** Sound like "a knowledgeable friend"; drop _please note_, _at this time_, _let's_, _simply_, _It's easy_, _quickly_ (in a procedure), pop-culture references, _tl;dr_-style slang. (tone)
10. **Use contractions, especially negative ones.** _don't_, _isn't_, _can't_ — "it's harder to misread _don't_ as _do_." No invented or three-word contractions. (contractions)
11. **Pronouns must have clear antecedents; use singular _they_.** Replace an ambiguous _it_ with the noun; follow _this_/_these_ with a noun ("this value"); keep optional _that_ / _which_; _that_ restrictive (no comma), _which_ nonrestrictive (comma). (pronouns, translation)
12. **Plain words over jargon, idiom, metaphor, anthropomorphism.** _use_ not _utilize_/_leverage_, _start_ not _commence_; write around or define jargon on first use (parenthetical or link); no idioms, humor, or seasons/holidays; "The PC detects a new device", not "sees". (jargon, translation, anthropomorphism, inclusive)
13. **Consistent terminology and structure.** One term per concept, same capitalization everywhere; standardized phrases for recurring sentences; parallel list items; subject–verb–object with the subject early. (translation)
14. **Inclusive and non-ableist wording.** No _sanity check_, _dummy_, _crazy_, _cripple_, _hangs_, _man-hours_, _whitelist_/_blacklist_, _master/slave_, _first-class citizen_, _native_ feature. When a non-inclusive name is baked into code, use it only in code font, once, then the preferred term. (inclusive-documentation)
15. **Accessible links and orientation.** Link text must make sense out of context (no _click here_); introduce links with _see_; no directional language (_above_/_below_ → _preceding_/_following_); alt text for every image; never images of text/code/terminal output; describe elements by their label, not their appearance. (accessibility)
