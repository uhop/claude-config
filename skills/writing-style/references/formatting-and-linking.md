# Google style digest — formatting, organization, and linking

Source: https://developers.google.com/style (14 pages, fetched 2026-08-19 as raw HTML via `curl -sL`; page "Last updated" stamps noted per section). Everything below is condensed from the page bodies; quoted text is verbatim. Rules are imperative; "Recommended / Not recommended" pairs are the guide's own examples.

---

## Headings and titles — https://developers.google.com/style/headings (updated 2026-06-08)

- Use **sentence case** for all headings and titles.
- Make headings and titles descriptive and unique — "It's easier to jump between pages and sections of a page if the headings and titles are unique."
- Write document titles from the document's primary purpose; write section headings from the type of content in the section. Task-based and conceptual headings may coexist in one document; phrase each per its own type.
- **Task-based heading**: start with a bare infinitive (base-form verb; looks like the imperative). Used in quickstarts, how-tos, tutorials.
- **Conceptual / non-task heading**: use a noun phrase that does not start with an _-ing_ verb.
- **Avoid _-ing_ verb forms as the first word** of any heading or title (present participles / gerunds "are inconsistently translated … and they increase character count in limited spaces"). Exception: gerunds with no better alternative (Billing, Pricing). An _-ing_ form later in a heading is fine (_Introduction to BigQuery monitoring_).
- Optional section: prefix the heading with `Optional:` — not a trailing "(optional)".
- One unique level-1 heading (`h1`) per page; use a level-1 heading only once on a page. Don't repeat the exact page title in a heading on the page (title _Create and start VM instances_ → sections _Create a VM_, _Start a VM_).
- **Keep punctuation simple.** "Punctuation can be a sign that your heading is too complicated. Consider rewriting."
- **Limit abbreviations**: use one in a title/heading only if it's the more commonly known version; define it in the first instance in a paragraph. For SEO, use the more prominent version of a term in headings.
- **Don't use numbers in headings** to indicate a sequence of sections — rely on hierarchy and order.
- **Avoid code items in headings**; if unavoidable, add a descriptive noun to the code-font item.
- **Don't put links in headings** — "A link can easily be confused as a style applied to the heading."
- **Don't use heading tags to change visual formatting**; use CSS. Don't invent heading formatting.
- **Apply proper heading tags** hierarchically (`<h1>/<h2>/<h3>` or `#/##/###`).
- **Don't skip levels** — put an `<h3>` only under an `<h2>`.
- **Don't use empty headings** — every heading must be followed by content (a heading directly followed by a subheading is "not recommended").
- When introducing a group of H3-or-lower sections under an H2, say **"the following sections"** — not "this section" / "these sections" (ambiguous).
- General text guidance (contractions, articles) applies to headings too.

| Recommended                                                                       | Not recommended                                                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Create an instance                                                                | Creating an instance                                                                                  |
| Migration to Google Cloud                                                         | Migrating to Google Cloud                                                                             |
| Optional: Customize your alias                                                    | Customize your alias (optional)                                                                       |
| `# Transfer data sets` … `## Estimate costs`                                      | `# Transfer data sets` … `### Estimate costs` (skipped level)                                         |
| `## Migrate VMs to Compute Engine` / intro paragraph / `### Design the migration` | `## Migrate VMs to Compute Engine` immediately followed by `### Design the migration` (empty heading) |

---

## Lists — https://developers.google.com/style/lists (updated 2025-05-16)

- **Don't use a list for one item** — "a single item isn't really a list"; set it off some other way.
- List vs table: see Tables § List or table? (single-unit items → list; pairs → description list; 3+ pieces per item → table).
- **List types**: numbered (`ol`) for significant sequence (steps, phases, priorities); bulleted (`ul`) for non-sequential items — "Make sure it's clear whether or not every item is required"; description list (`dl/dt/dd`) for terms with descriptions (glossary); description list with bulleted run-in headings (`ul/li` + bold term) to highlight/explain several concepts or save space.
- Nested sequential lists are labeled with lowercase letters, then lowercase Roman numerals.
- A list item may hold multiple paragraphs — use `p`, not `br`.
- **Introductory sentence**: "In most cases, precede a list with an introductory sentence." It ends with a **colon if it immediately precedes the list**, a **period if material (e.g. a note) intervenes**. May be omitted when the heading right above supplies all the context.
- **Introduce with a complete sentence, not a partial one completed by the items.** "the following" may be used as a noun phrase.
- Unusual numbering: `reversed` attribute for reverse order; `value` attribute to set a number manually — but manual numbering is usually a bad idea (breaks when items change).
- **Parallel syntax**: same syntax/structure for all items in a list.
- **Capitalization / end punctuation (numbered, lettered, bulleted)**: start each item with a capital letter (unless case is information, e.g. glossary terms). End each item with a period or other sentence-ending punctuation **except**: single-word items; items with no verb; items entirely in code font; items entirely link text or a document title. If punctuation ends up inconsistent, rewrite for parallel construction or punctuate every item.
- **Description lists**: don't add an explanatory phrase to only one item — use a description list and explain all. Capitalize each term (`dt`); no period after the term; generally a period at the end of each `dd`.
- **Run-in headings** (bold lead-in): capitalize; end with a period **or** a colon, consistently within the list; bolding the terminal punctuation is a consistency call. Text after a period → capital first letter and ends with a period. Text after a colon → lowercase first letter; no period if it's a list of items/short phrases without verbs, period if it has a verb or is a standalone thought. **Never a dash** to set off the description.
- The list-punctuation rules differ from Material Design's — for **UI text**, follow Material Design.
- **Comma-separated (in-sentence) lists**: use serial commas. **Avoid ending with _etc._ or _and so on_** — introduce the list so it's clearly non-exhaustive ("data like …").

| Recommended                                                                                                             | Not recommended                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Use the Submit button for any of the following purposes: • To submit the form. • To indicate that you're done. • …      | Use the Submit button to: • Submit the form. • Indicate that you're done. • …                                    |
| If you need to add an instance manually, do the following: 1. Click **Create instance**. 2. For **Name**, enter a name. | If you need to add an instance manually: 1. Click **Create instance**. …                                         |
| `#### Objectives` followed directly by the bulleted list                                                                | `#### Objectives` + "In the following tutorial, you will complete the following tasks:" + list (redundant intro) |
| The following words are adjectives: • **Big**: a short word • **Relevant**: a fancy word                                | The following words are adjectives: • Big • Relevant • Gratuitous • Purple—this is a color.                      |
| The service processes data like event logs, clickstream data, social network interactions, and e-commerce transactions. | The service processes event logs, clickstream data, social network interactions, e-commerce transactions, etc.   |

---

## Procedures — https://developers.google.com/style/procedures (updated 2026-06-08)

- A procedure = a sequence of numbered steps for accomplishing a task.
- **Introductory sentence**: usually yes; it must add context beyond the heading — "Don't simply repeat the heading". Colon if it immediately precedes the steps, period if material intervenes. An imperative statement is fine. **Never a partial sentence completed by the steps.**
- **Single-step procedure**: one sentence, formatted as a **bulleted** list item — not a numbered "1." and not "follow this step:" + bullet.
- **Sub-steps**: lowercase letters, then lowercase Roman numerals; a step that has sub-steps is treated as an introductory sentence (colon or period at its end).
- **Order of components in a complex step**: (1) the action; (2) the command, if any; (3) explain placeholders; (4) explain the command further if needed; (5) the command's output, if needed; (6) in a separate paragraph, the result of the action / output explanation.
- **One action per step.** Small sequential menu selections may be combined with angle brackets: `Click **File > New > Document**`. "Don't make the steps too long" — split.
- **Multiple ways to do a task**: document one procedure that is accessible to all readers; if all are accessible, pick the shortest/simplest. If you must document several, separate them into pages, headings, or tabs. Prefer keyboard-only-doable, shortest, most-familiar-language.
- **Repetitive procedures**: don't repeat — reference and link ("Create a user as you did in the previous step.").
- **Optional step**: begin with `Optional:` — not `(Optional)`.
- **Location before action**: "In Google Docs, click **File > New > Document**." If procedures span multiple headings, restate the location at the start of each.
- **Goal before action**: "To start a new document, click **File > New > Document**." If the "To …" form could read as optional, use the colon form: "Start a new document: click **File > New > Document**." (e.g. "Sort the data by date:" instead of "To sort the data by date, …").
- **Results**: action first, result second, **same paragraph**: "Click **Run**. The query results appear after the query runs." Avoid repetitive over-bolding — prefer "1. Click **Enter**. 2. In the **New file** dialog that appears, click **Next**." over stating "The **New file** dialog appears." and then re-naming it.
- **Justifications**: action first, justification second: "Store the private key in a secure location. You need it later."
- **Summary-table rules**: first sentence of a step contains an **imperative verb**; use complete sentences; parallel structure and consistent verb form; set the context (tool/environment) in which the reader works, restating it per heading; no directional language (_above_, _below_, _right-hand side_) — use "preceding"/"following", provide a screenshot if a UI element is hard to find; **don't use _please_**; **avoid "run the following command"** — say what the command does ("In Cloud Shell, deploy the load generator:"); if the reader must press Enter, put it in the same step ("…type custom function, and then press Enter."); **don't include keyboard shortcuts** ("Copy the command, and then paste it" not "Press Ctrl+C…"); give only the best way when there are several; state prerequisites/required hardware and software up front; as few steps as possible; one reader decision per step — each instruction its own list item.

| Recommended                                                                                                          | Not recommended                                                               |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| To customize the buttons, follow these steps: / Customize the buttons: / To customize the buttons, do the following: | To customize the buttons:                                                     |
| • To clear (flush) the entire log, click **Clear logcat**.                                                           | To clear (flush) the entire log, follow this step: 1. Click **Clear logcat**. |
| 1. In Google Docs, click **File > New > Document**.                                                                  | 1. Click **File > New > Document** in Google Docs.                            |
| Clone the repository that contains the sample data.                                                                  | You need the project ID later in this document. Retrieve the project ID.      |

---

## Tables — https://developers.google.com/style/tables (updated 2025-03-21)

- **List or table?** Single-unit items → numbered/lettered/bulleted list. Pairs (term/definition) → description list (or sometimes a table). **Three or more related pieces per item** (e.g. parameter name, type, description) → table.
- **Don't use tables** for page layout; for one row of material (usually); for one column (make it a list); to lay out code snippets; to split a long one-dimensional list into columns — "Use tables only to present two-dimensional data"; **avoid tables in the middle of a numbered procedure**.
- Cells may contain multiple paragraphs — `p`, not `br`.
- **Introduce with a complete sentence** describing the table's purpose "because not all screen readers preannounce tables"; colon if immediately before, period if material intervenes. Recommended: "Change the environment variables to values for your deployment, as listed in the following table:"
- Refer to position with _the following table_ / _the preceding table_. **Don't put a table in the middle of a sentence.** Footnotes, if unavoidable, go immediately after the table.
- **Captions**: one table on the page → no caption needed, but keep it adjacent to the referring text. Multiple tables near each other → `<caption>` as first child of `<table>`, in the form "**Table _NUMBER_.** _DESCRIPTION_", sentence case, **no terminal period**. Refer to it as "… as shown in table 2" — lowercase _table_ unless sentence-initial. Where possible avoid linking to tables; refer by number.
- **Formatting**: no styling on the table element; don't convey headers by visual style alone — use `th`; **don't merge cells** (`colspan`/`rowspan`); sort rows logically, else alphabetically; split long/complicated tables; any image/symbol in a table needs descriptive `alt`.
- **Column heads**: sentence case; concise; **no end punctuation** (no period, ellipsis, or colon); header cells for first row and first column only, with `th` and `scope`.
- Use responsive table CSS where possible.

| Recommended                                               | Not recommended                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `<caption><b>Table 1.</b> Prehistoric birds</caption>`    | (caption ending with a period; or a caption when there is only one table) |
| Each item is three or more pieces of related data → table | Long list of function names split into a two-column table to save space   |

---

## Notes, cautions, warnings, and other notices — https://developers.google.com/style/notices (updated 2025-09-08)

- A notice offsets important/useful information that isn't part of the text flow — but readers skip out-of-focus elements; "If you're not sure whether something should be a notice, write it first in regular text and then decide if a notice is needed."
- **Don't use too many notices** — they lose distinctiveness; especially avoid two or more in a row or nested; reorganize instead.
- **Types** (the page lists exactly these four):
  - **Note** — "An ordinary aside or tip. Provides information that is useful but not critical to the reader."
  - **Caution** — "Tells the reader to proceed carefully." (e.g. "We don't recommend using a broad `0.0.0.0/0` range…")
  - **Warning** — "Stronger than a _caution_ notice; it means 'Don't do this' or that this step might be irreversible, such as leading to permanent data loss" — money, work, or security at stake.
  - **Success** — a successful action / error-free status; **only in interactive or dynamic content**, never in static pages.
  - (No separate "Tip" or "Key Point" type on the current page — tips fall under Note.)
- **Use a Note only when all are true**: information is _relevant_ but not _necessary_ (reader still succeeds without it); interrupting here isn't an obstacle (not an alternative path); it's not in flow (not a continuation, result, or pointer to more info).
- **Don't use a Note** for cross-references; for prerequisites or earlier steps (those precede the step); as a full procedural step; for information necessary to succeed; for in-flow information such as expected results.
- HTML form when the site has none: `<aside class="note"><b>Note:</b> All VPC networks include firewall rules.</aside>` — bold label + colon, then sentence.

Examples: "**Note:** All VPC networks include firewall rules." / "**Caution:** We don't recommend using a subnet that's part of a dynamic route." / "**Warning:** Do not manually edit or delete generated table entries."

---

## Diagrams, figures, and other images — https://developers.google.com/style/images (updated 2025-05-16)

- Use images only when they explain something hard to express in words; be discreet with screenshots — capture only UIs important to the discussion.
- **Don't use images of text, code samples, or terminal output** — use actual text.
- Diagrams: SVG if possible, else PNG; no transparent background. Animations: not GIF — use MP4 or similar. Consistent OS/look for screenshots; **crop to the relevant information**; **no PII** (cover with a 100%-opaque solid overlay, never blur/mosaic; flatten layered exports); no image maps (list text references after the image instead); descriptive filenames.
- **Introduce most images with a complete sentence** (colon if immediately before, period if material intervenes). Screenshots that immediately follow procedural text describing the UI need no introduction.
- **Alt text**: required on every `img` (empty `alt=""` for decorative images or images that only restate surrounding text — e.g. a UI screenshot showing how to fill fields, UI icons, decoration); omitting `alt` makes screen readers read the filename. Rule: replacing every image with its alt text should not change the page's meaning. Don't write "Image of"/"Photo of"; include punctuation; consistent alt for repeated images; avoid all-caps; introduce diagrams in text, not in alt; captions don't replace alt; full sentence or noun phrase; **≤155 characters**, with a fuller description in the text if needed; consider context, not just content. Recommended: `alt="Architecture of an app that's built with Apps Script."`
- **Figure captions**: optional; `figcaption` must be inside `figure` with the `img`. Numbered form "**Figure _NUMBER_.** _DESCRIPTION_."; complete sentences recommended; **always end punctuation**; refer by number ("… as shown in figure 1", lowercase _figure_ mid-sentence); **no spatial references** ("the image above"); if no numbers, show the figure again; don't embed the caption in a referencing sentence.
- **Figure descriptions**: text conveying the same information as the figure; use when the caption doesn't convey the complete information; punctuate. "Any new information should be conveyed through text and not introduced in a figure or image."
- **Text in figures**: avoid; if unavoidable, keep brief, sentence case, no new abbreviations, full trademarked names, no embedded captions/descriptions, numbered callouts only.
- High-res: `srcset` with `1x`/`2x`, `src` pointing at the 1x image, `width` set, height omitted, 2x exactly double, never upscale.
- Layout: don't position images manually; full-width is fine; don't exceed the column width; **don't center**; **don't put `img` inside `p`**; don't link to a figure from the same page unless very long.

| Recommended                                                                                          | Not recommended                                           |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Figure 1.** Application capabilities are separated into bounded contexts that migrate to services. | Bounded contexts                                          |
| `alt="A card message."`                                                                              | `alt="Image of a card message"` (phrases like _Image of_) |

---

## Footnotes — https://developers.google.com/style/footnotes (updated 2025-04-02)

- **Avoid footnotes** — "they aren't accessible and can present challenges for localization efforts."
- Instead: add a cross-reference; use a note; put it in a parenthetical.
- If a footnote is the only way: superscript number (`<sup>1</sup>`) in the text, footnote at the bottom of the page.

---

## Format examples — https://developers.google.com/style/format-examples (updated 2025-12-02)

- Introduce examples with _such as_, _for example_, or _like_.
- **Short-to-medium example at sentence end**: set off with a comma, parentheses, or an em dash; **not a semicolon**.
- **Short example mid-sentence**: keep it short; set off with dashes, commas, or parentheses.
- **Longer example**: make it a separate sentence using _For example,_ as an adverb.

| Recommended                                                                                                                                                                                                                                                     | Not recommended                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Choose a strong encryption algorithm, such as AES-256. / You can monitor various metrics for your managed database instances—for example, CPU utilization, storage capacity, and active connections. / The API supports common image formats like PNG and JPEG. | Enter a name for the instance, for example, `my-instance-99`. / Specify the region for deployment; for example, `us-central1`. / Enter a name for the instance (for example, `my-instance-99`). |
| Enter a six-digit hex number (for example, `228B22`), and then click **OK**.                                                                                                                                                                                    | Enter a six-digit hex number (for example, if you want the color forest green, enter `228B22`), and then click **OK**.                                                                          |
| You can assign tags to your virtual machine instances to categorize them. For example, you could tag instances by environment with `env:prod` or `env:dev`.                                                                                                     | —                                                                                                                                                                                               |

---

## Cross-references and linking — https://developers.google.com/style/cross-references (updated 2025-11-07)

- Cross-references link to **nonessential** information that adds understanding; they "can easily become disruptive."
- **Choose links selectively** — "Each link creates a decision for the reader, adding cognitive load" and a chance to leave the page. Prefer **context on the page** (define a term, briefly explain a concept, give a couple of steps) over linking; link to third-party docs rather than re-documenting their standards, but give a few sentences of basics when that suffices.
- **Avoid duplicate links** to the same destination on one page; link once where most useful. OK to repeat when linking to a specific section, when the page is very long, or when there are multiple entry points (procedure + troubleshooting sections).
- Link to the **most relevant page and heading**; don't give multiple links doing the same job.
- **Link text: short, unique, descriptive phrases** that make sense out of context (screen-reader users jump link to link). Two options: (a) **the exact page title or heading** — "For more information, see [Load balancing and scaling]."; (b) **a descriptive phrase** capitalized as part of the sentence — important words first; same link text never points to different targets in one document; keep it short (no sentence-length link text).
- **Never vague link text**: not _this document_, _this article_, _click here_, _this blog post_.
- **Don't use a URL as link text** (exception: some legal documents).
- Abbreviation in parentheses → include both long form and abbreviation inside the link: [Google Kubernetes Engine (GKE)], not [Google Kubernetes Engine] (GKE).
- Code element in a link → include its descriptive noun in the link text unless awkward/redundant: "the [`--hostname` flag]" not "the [`--hostname`] flag"; but "[`GET`], [`HEAD`], and [`OPTIONS`] methods" not "[`GET` method], [`HEAD` method]…".
- **Link introductions**: a dedicated cross-reference sentence uses **"For more information, see …"** or **"For more information about …, see …"**. Use **_about_, not _on_**. Use **_see_** for links and cross-references. Add the "about…" clause when the purpose isn't clear from link text/context.
- **Clarify the purpose**: surrounding context or link text must say why the reader is being sent there; be specific, don't repeat the link text. ("For more information about authentication and authorization, see [Using OAuth 2.0 to access Google APIs].")
- **Explain unexpected behavior**: links that download a file or open email say so and name the file type ("[download the security features PDF]"; "[send email to Technical Support]"). **Same-page section links**: use a standard phrase — "see the [Write descriptive link text] section of this document." **Section on another page**: same format as a regular cross-reference; if the target section title duplicates a title on the source page, add context ("see [Install libraries] in "Building new audiences based on existing customer lifetime value."").
- **Open links in the current tab** — "Let the reader decide." If a new tab is truly needed, say so in the link text: "[Accessible content (opens in a new tab)]".
- **No external-link icons**; if leaving the domain matters, say it in text ("Sometimes OK: … see the Wikipedia page about [OS-level virtualization].").
- **Punctuation outside the link**: "see [Test your code]." not "see [Test your code.]".
- **No quotation marks around linked cross-references**: "see [Meet Android Studio]." not "see ["Meet Android Studio"]." Unlinked references: quotation marks for a section / short work ("see "Describing system versions" in the following section"); italics for a full-length work (_The Chicago Manual of Style_).
- Don't put external links in the doc-set navigation/TOC; if you must, make it clear the reader leaves the set.
- Sitewide link CSS: contrasting color, **underline links and nothing else**, visited links change color (color-blind-friendly).

| Recommended                                                                                          | Not recommended                                                             |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| You can use Cloud Scheduler and Cloud Functions to manage [task scheduling on Compute Engine].       | See [this blog post].                                                       |
| For more information, see [Make headings into link targets].                                         | Want more? [Click here!] / For more information, see [this document].       |
| For more information about protocols, see [HTTP/1.1 RFC].                                            | See the HTTP/1.1 RFC at [http://www.w3.org/Protocols/rfc2616/rfc2616.html]. |
| For more information about task scheduling, see [Reliable task scheduling on Google Compute Engine]. | For more information on indexes, see [Manage indexes].                      |

---

## Make headings into link targets — https://developers.google.com/style/headings-targets (updated 2026-05-06)

- Add a **custom anchor** (`id`) to a heading when: you want one shorter than the auto-generated anchor; the content is frequently linked (custom anchor survives heading-text changes); or you're revising a heading whose auto-anchor would change and break links.
- **Anchor text: lowercase letters, hyphens between words**; descriptive but concise (`introduction-to-everything`, `conserve-habitat`).
- HTML: `<section id="…">` wrapping the heading (recommended), or `<h2><a name="…">…</a></h2>`, or `<a name="…"></a>` before the heading; `<h2 id="…">` is "Acceptable".
- Markdown (kramdown-style attribute): `## Help conserve habitat for pollinators {: #help-conserve-habitat-for-pollinators }` (recommended); shorter `{: #conserve-habitat }` also recommended; `{: id='conserve-habitat' }` / `{: id="conserve-habitat" }` acceptable.
- **Revising a heading**: keep the old ID as the custom anchor so inbound links keep working (`## Introduction to everything {: #introduction-to-some-things }`). Don't change an existing custom anchor unless it contains a term you must remove; if you do change it, update all links that use the old anchor (old anchors still reach the page, not the section).

---

## Text-formatting summary — https://developers.google.com/style/text-formatting (updated 2026-01-20)

| Element                  | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bold**                 | `<b>` / `**` **only for UI elements and run-in headings**, including the label at the start of a notice. Use `**`, not `__`, in Markdown (hard to distinguish).                                                                                                                                                                                                                                                                                                                                                 |
| **Italic**               | Use sparingly. For introducing/discussing terms and words-as-words (`<i>` / `_`). For emphasis use italics, "not bold or underline" — but usually the words can carry it; semantic emphasis is `em` in HTML, `_` in Markdown (no semantic tagging in Markdown). Prefer `_` over `*` so italics are distinguishable from bold in source. Italicize titles of books/movies/web series/full-length works **unless in a link**; mathematical variables (_x_ + _y_ = 3, not operators); version variables (1.4._x_). |
| **Underline**            | Reserved for link text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Code font**            | `<code>` / backticks for code in text, inline code, and user input; `<pre>` / fenced block for code samples. Code font for filenames, class names, method names, HTTP status codes, console output, placeholders. Don't override/modify font styles inline.                                                                                                                                                                                                                                                     |
| **Capitalization**       | American English; **sentence case in all headings, titles, and navigation**; **all-caps for placeholders**.                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Quotation marks**      | American English punctuation of quotations; titles of shorter works (articles, episodes) in quotation marks **unless in a link**.                                                                                                                                                                                                                                                                                                                                                                               |
| **Font type/size/color** | Don't override global styles; use semantic HTML/Markdown (`<code>`, backticks), not manual monospace.                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Other**                | **No ampersand as _and_** (including headings/navigation) — exception: a UI element or menu name that uses `&`. **Quotation marks and end punctuation go outside link text.**                                                                                                                                                                                                                                                                                                                                   |

---

## Markdown versus HTML — https://developers.google.com/style/markdown (updated 2024-10-15)

- Use either; parts of the guide assume HTML — element-specific advice "might be irrelevant" in Markdown.
- Markdown is easier to write and read in source; HTML is more expressive (semantic tagging) and can do things Markdown can't — e.g. switch to the HTML `code` element for special characters such as nonbreaking spaces.
- Choice is personal preference, but **follow whatever your team or document template already uses**.
- (Markdown-specific conventions scattered across the other pages: `**` for bold, `_` for italics; `#`/`##`/`###` hierarchy, no skipped levels; `{: #anchor }` custom anchors; `![alt](src)` + bold "**Figure 1.**" caption line; spaces not tabs, two-space indent, no trailing spaces "except as needed for Markdown"; 80-char lines.)

---

## HTML formatting — https://developers.google.com/style/html-formatting (updated 2024-10-15)

- Follow Google's HTML/CSS Style Guide, **except don't leave out optional elements**.
- Applies to other doc sources (YAML, Markdown) too: **no tabs — spaces only** ("some Markdown features expect spaces"); **indent two spaces** per level; **all-lowercase** elements and attributes; **no trailing spaces** (except as Markdown needs).
- **Break lines at 80 characters**, except: `meta` element lines must be single-line; a URL can't be broken — put a long URL on its own line with its `href` attribute.
- Break code in `<pre>` at 80 characters — but match an older file's existing consistent line length when making small changes; **never change the meaning of the code** when breaking lines (ask someone who knows the language); some long lines are unavoidable.

---

## HTML and semantic tagging — https://developers.google.com/style/semantic-tagging (updated 2024-10-15)

- **Use HTML elements for their designed purpose** — e.g. `cite` for the title of a standalone work (book, movie); see MDN "Semantics in HTML".
- When no semantic element fits, use CSS or the few presentational elements.
- Don't use elements with other semantics to get a visual result: **no frames/tables for layout** (CSS); **headings only for hierarchical headings**, never for visual styling; **`em` = emphasis, not italics** — use `i` for non-emphasis italics; **`strong` = strong importance, not bold** — use `b` for non-important bold; **`br` only for line breaks that are part of the content** (poems, addresses) — use `p` + CSS for spacing.

---

## Top 15 rules from this slice

Ranked by how much they matter for an engineer writing README / wiki / dev-docs prose.

1. **Sentence case for every heading and title**; task headings start with a bare infinitive (`Create an instance`), concept headings are noun phrases (`Migration to Google Cloud`); no leading _-ing_ form (`Creating…`), no trailing punctuation, no numbers-as-sequence, no code items or links in headings.
2. **One `#` per page, never skip heading levels, never leave a heading empty** — every heading is followed by content before the next subheading; introduce grouped subsections with "the following sections".
3. **Descriptive link text** — the exact page/heading title or a short descriptive phrase that stands alone; **never** "here", "click here", "this document", "this blog post", or a bare URL as link text; important words first; the same link text never points at two targets.
4. **Cross-reference formula**: "For more information, see [X]." / "For more information about Y, see [X]." — _see_ for links, _about_ not _on_; punctuation and quotation marks go **outside** the link; no quotes around linked titles; same-page links say "the [X] section of this document".
5. **Introduce every list, procedure, table, and image with a complete sentence** — colon if it immediately precedes, period if something (e.g. a note) intervenes; never a fragment completed by the items ("To get the USB driver:" → "To get the USB driver, follow these steps:"); don't restate the heading.
6. **Procedure steps**: numbered, one action per step, **imperative verb** in the first sentence, **location before action** ("In Google Docs, click **File > New > Document**"), **goal before action** ("To start a new document, click …"), result or justification after the action in the same paragraph; sub-steps as letters then Roman numerals.
7. **Bold only UI elements and run-in headings** (and notice labels); italics sparingly (terms, words-as-words, emphasis — never bold/underline for emphasis); underline only links; code font for filenames, class/method names, status codes, console output, placeholders (placeholders in ALL_CAPS). In Markdown use `**bold**` and `_italic_`, not `__`/`*`.
8. **List item punctuation**: capitalize each item; end with a period unless the item is a single word, has no verb, is entirely code, or is entirely a link/title — and be consistent (rewrite for parallelism or punctuate all); parallel structure across items; don't use a list for a single item; serial commas in-sentence; never end with "etc." / "and so on".
9. **Run-in (bold lead-in) lists**: term capitalized, ends in a colon or period (consistent per list); after a colon → lowercase, no period for verbless phrases; after a period → capital + period; **never a dash** as the separator; give every item a description or none.
10. **Single-step procedure = one bulleted sentence** ("• To clear the log, click **Clear logcat**."), not "1." and not "follow this step:"; optional steps and sections start with `Optional:` not `(optional)`.
11. **Tables only for ≥3 related data points per item**, two-dimensional data; header row with sentence-case, unpunctuated heads; no merged cells; no layout/code/column-split tables; no table inside a sentence or mid-procedure; caption "**Table N.** Description" (no period) only when there are several tables, referred to as "table 2".
12. **Notices sparingly** — write it inline first; Note = useful-not-necessary aside, Caution = proceed carefully, Warning = don't / irreversible / loss; never stack notices; never use a Note for a cross-reference, prerequisite, required step, expected result, or anything needed to succeed.
13. **No directional or "please" language in steps** — "preceding"/"following" not "above"/"below"; no "please"; no keyboard shortcuts; avoid "run the following command" — say what the command does; include "press Enter" in the same step; give only the best way.
14. **Images**: only when words fall short; never screenshots of text/code/terminal output; every image has `alt` (≤155 chars, sentence or noun phrase, no "Image of", `alt=""` if decorative); captions "**Figure N.** Sentence." with end punctuation; refer by number, not "the image above"; crop, no PII, SVG/PNG not GIF.
15. **Links: fewer and sharper** — each link is cognitive load; give short context inline instead of linking when a sentence or two suffices; no duplicate links on a page; open in the current tab (say "(opens in a new tab)" if you must); name file type for downloads; include the abbreviation inside the link "[Google Kubernetes Engine (GKE)]"; avoid footnotes entirely (use a cross-reference, note, or parenthetical).
