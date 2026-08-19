# Microsoft Writing Style Guide — what it adds to or changes from Google

Fetched 2026-08-19 from learn.microsoft.com (source repo: MicrosoftDocs/microsoft-style-guide-pr, live commit db2315b7). All bullets below are taken from the fetched pages; quotations are verbatim. Nothing is from memory except where explicitly labelled "Google: per memory, verify".

Fetch notes:

- `https://learn.microsoft.com/en-us/style-guide/punctuation/dashes-hyphens/emes` — served the canonical page `https://learn.microsoft.com/en-us/style-guide/punctuation/dashes-hyphens/` ("Em dashes, en dashes, hyphens, and minus signs"); use the canonical URL.
- `https://learn.microsoft.com/en-us/style-guide/a-z-word-list-term-collections/` — **HTTP 404**. There is no index page; the A–Z list exists only as a node in the site navigation (`https://learn.microsoft.com/en-us/style-guide/toc.json`). Organization and entries were taken from that TOC and from the individual entry pages (all 200).
- Followed from the requested pages (not in the original list): `procedures-instructions/describing-interactions-with-ui`, `procedures-instructions/formatting-text-in-instructions`, `scannable-content/headings`, `scannable-content/lists`, `grammar/nouns-pronouns`, `grammar/verbs`, `grammar/person`, `developer-content/code-examples`, `developer-content/reference-documentation`, `developer-content/formatting-developer-text-elements`, and 19 A–Z entries.

---

## 1. Per-page notes

### Welcome

URL: https://learn.microsoft.com/en-us/style-guide/welcome/

- Scope: "your guide to writing style and terminology for all communication—whether an app, a website, or a white paper. If you write about computer technology, this guide is for you."
- Replaces the Microsoft Manual of Style (page description).
- Voice summary: "warm and relaxed, crisp and clear, and ready to lend a hand."
- Entry points listed: Top 10 tips, Bias-free communication, Global communications.

### Top 10 tips for Microsoft style and voice

URL: https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice

1. "Use bigger ideas, fewer words" — "Shorter is always better."
2. "Write like you speak" — read aloud; avoid jargon; "It should sound like a friendly conversation."
3. "Project friendliness" — use contractions (_it's, you'll, you're, we're, let's_).
4. "Get to the point fast" — lead with the most important thing; "Front-load keywords for scanning."
5. "Be brief" — "Prune every excess word."
6. "When in doubt, don't capitalize" — sentence-style capitalization; "Don't use title-style capitalization (Like This)."
7. "Use end punctuation in the right places" — "Don't use a period or a colon at the end of titles, headings, subheadings, and UI titles."
8. "Remember the last comma" — serial (Oxford) comma in lists of three or more.
9. "Don't be spacey" — "Use only one space after periods, question marks, and colons—and no spaces around dashes."
10. "Revise weak writing" — "Most of the time, start each statement with a verb. Edit out _you can_ when it isn't necessary. Avoid weak phrasing like _there is_, _there are_, and _there were_."

Example pairs (Replace this → With this):

- "If you're ready to purchase Office 365 for your organization, contact your Microsoft account representative." → "Ready to buy? Contact us."
- "Invalid ID" → "You need an ID that looks like this: someone@example.com"
- "Android, iOS and Windows" → "Android, iOS, and Windows"
- "Use pipelines — logical groups of activities — to consolidate…" → "Use pipelines—logical groups of activities—to consolidate…"
- "You can access Office apps across your devices, and you get online file storage and sharing." → "Store files online, access them from all your devices, and share them with coworkers."
- "Find a Microsoft Partner / Office 365 Customer / Limited-Time Offer / Join Us Online" → "Find a Microsoft partner / Office 365 customer / Limited-time offer / Join us online"

### Microsoft's brand voice: above all, simple and human

URL: https://learn.microsoft.com/en-us/style-guide/brand-voice-above-all-simple-human

- Voice is constant; tone adapts "from serious to empathetic to lighthearted."
- "Our voice hinges on crisp simplicity. Bigger ideas and fewer words. Less head, more heart."
- Three principles: "Warm and relaxed", "Crisp and clear" ("We write for scanning first, reading second."), "Ready to lend a hand".
- Style tips: "Get to the point fast" / "Talk like a person" ("Use short everyday words, contractions, and sentence-style capitalization. Shun jargon and acronyms.") / "Simpler is better" ("Break it up. Step it out. Layer. Short sentences and fragments are easier to scan and read.").

### Bias-free communication

URL: https://learn.microsoft.com/en-us/style-guide/bias-free-communication

- Gender-neutral terms: chair/moderator (not chairman); humanity/people/humankind (not man/mankind); operates/staffs (not mans); sales representative (not salesman); synthetic/manufactured (not manmade); workforce/staff/personnel (not manpower).
- "Don't use _he, him, his, she, her,_ or _hers_ in generic references." Rewrite: second person; plural noun + pronoun; _the_/_a_ instead of a pronoun; the person's role; _person_/_individual_. "If you can't write around the problem, it's OK to use a plural pronoun (_they, their,_ or _them_) in generic references to a single person. Don't use constructions like _he/she_ and _s/he_."
- Real people: use the pronouns they prefer; gendered pronouns OK in quotations, titles of works, and when gender is relevant.
- Fictitious scenarios: diverse names, no stereotyped job roles; avoid examples reflecting "primarily a Western or affluent lifestyle"; no politically disputed place names; "don't mix countries with states or continents."
- "Don't make generalizations about people, countries, regions, and cultures, not even positive or neutral generalizations."
- No slang that could be cultural appropriation (_spirit animal_); no profane/derogatory terms.
- Terms with racial bias or military/political associations — table: primary/subordinate (not master/slave); perimeter network (not demilitarized zone (DMZ)); stop responding (not hang). See also the Militaristic language page.
- Disability: "Focus on people, not disabilities." No _stricken with_ / _suffering from_; don't mention a disability unless relevant.
- "Use title-style capitalization for Asian, Black and African American, Hispanic and Latinx, Native American, Alaska Native, Native Hawaiian, Pacific Islander, and Indigenous Peoples. Microsoft style is to lowercase multiracial and white."

Example pairs (Use this / Not this):

- "If you have the appropriate rights, you can set other users' passwords." / "If the user has the appropriate rights, he can set other users' passwords."
- "Developers need access to servers in their development environments, but they don't need access to the servers in Azure." / "A developer needs access to servers in his development environment, but he doesn't…"
- "…you can dial their phone number using the dial pad." / "…you can dial his or her phone number using the dial pad."

### Scannable content

URL: https://learn.microsoft.com/en-us/style-guide/scannable-content/

- Subpages: Headings, Lists, Pull quotes, Sidebars, Tables.
- "Put first things first" — above-the-fold content is most read; F-shaped reading; "Put your most important information there" (upper-left).
- "Be brief, be bold, be clear" — "1. Use short, simple words. 2. Get to the point. 3. Then stop."
- Long documents: break into sections; include a linked table of contents; "Add _Back to top_ links at the end of sections."
- "Establish patterns in content" — keywords near the beginning of headings/table entries/paragraphs; consistent text formatting ("using bold in procedures to identify UI labels"); same sentence structures for similar information; parallel structure when comparing things, in headlines, and in bulleted items.
- Paragraphs: "Three to seven lines is about the right length"; single-line paragraphs OK now and then.

#### Followed: Headings

URL: https://learn.microsoft.com/en-us/style-guide/scannable-content/headings

- Headings are an outline; top-level = major subjects; use second-level only when there are ≥2 distinct topics.
- "Avoid having two headings in a row without text in between" — but don't add filler.
- "One heading level is usually plenty for a page or two of content."
- Keep headings short; most important idea first; more specific at lower levels; "don't talk about products, features, or commands in headings."
- "Use parallel sentence structure for all headings at the same level. For example, use noun phrases for first-level headings, verb phrases for second-level headings, and infinitive phrases for headings in instructions."
- "Consider infinitive phrases, such as _To create a heading,_ for headings and titles related to tasks. For headings that aren't related to tasks, use a noun phrase such as _Headings,_ if possible."
- "Don't use ampersands (&) or plus signs (+) in headings unless you're referring to UI that contains them or space is limited." "Avoid hyphens in headings if you can." "Use _vs.,_ not _v._ or _versus,_ in headings."
- Sentence-style capitalization; capitalize first word after a colon. "Don't end headings with a period." Question mark or (rarely) exclamation point OK.
- Run-in headings: bold, repeat _Tip, Note, See also_.

Examples: "Say hello to Surface Pro", "Set up the deployment environment", "Block party: Communities use Minecraft to create public spaces", "Not seeing what you want?"

#### Followed: Lists

URL: https://learn.microsoft.com/en-us/style-guide/scannable-content/lists

- "A list should have at least two items but (if possible) no more than seven items."
- Items consistent in structure (all nouns or all verb phrases).
- Bulleted = unordered; numbered = sequential or prioritized.
- Term lists: bulleted; term in sentence case and bold; "Use a period between the term and the definition. The period is in plain text."; definition starts with a capital and ends with a period. ("The use of bold in term lists is an exception to the general guideline of using italic for emphasis.")
- Introduce a list with a heading, a complete sentence, or a fragment ending with a colon. "If you introduce a list with a heading, don't use explanatory text after the heading. Also, don't use a colon or period after the heading."
- Begin each item with a capital letter unless there's a reason not to (lowercase command).
- "Don't use semicolons, commas, or conjunctions (like _and_ or _or_) at the end of list items." "Don't use a period at the end of list items unless they're complete sentences or they complete the introductory sentence." Exception: "Don't use periods if all items have three or fewer words or if the items are UI labels, headings, subheadings, strings, or similar types of text."
- Global tip: avoid lists whose items complete an introductory fragment (hard to translate).

Example (term list): "**Draft**. You created the document, but you're still working on it."

### Use simple words, concise sentences

URL: https://learn.microsoft.com/en-us/style-guide/word-choice/use-simple-words-concise-sentences

- "Make every word count." "Use your judgment to avoid sounding abrupt or unfriendly."
- Simple verbs, no modifiers; avoid weak verbs _be, have, make, do_.
- One word over two or three.
- Words with one clear meaning.
- Omit unnecessary adverbs: examples "quite very quickly easily effectively".
- "Use one term consistently to represent one concept."
- Careful with noun/verb words (_file, post, mark, screen, record, report_).

Example pairs (Use this / Not this):

- use / utilize, make use of
- remove / extract, take away, eliminate
- tell / inform, let know
- to / in order to, as a means to
- also / in addition
- connect / establish connectivity
- "_Because_ you created the table, you can change it." / "_Since_ you created the table, you can change it."

### Use contractions

URL: https://learn.microsoft.com/en-us/style-guide/word-choice/use-contractions

- "Use common contractions, such as _it's, you're, that's,_ and _don't,_ to create a friendly, informal tone."
- "Don't mix contractions and their spelled-out equivalents in UI text. For example, don't use _can't_ and _cannot_ in the same UI."
- "Never form a contraction from a noun and a verb, such as _Microsoft's developing a lot of new cloud services._"
- "Avoid ambiguous or awkward contractions, such as _there'd, it'll,_ and _they'd._"

### Writing step-by-step instructions

URL: https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions

- Headings for procedures: concise, describe what the instructions help customers do; parallel structure ("Create a profile / Add an account").
- An introductory sentence "shouldn't just repeat what the heading says."
- Multiple steps: numbered list; introductory step telling where to act if confusion is possible; "Use a separate step for each instruction. It's OK to combine short steps that occur in the same place in the UI."; "include actions that complete a procedure, such as selecting an **OK** or **Apply** button."; "Try to fit all the steps on the same screen."
- Single-step procedure: "use a bullet instead of a number."
- Steps: "Use a complete sentence. Capitalize the first word and use a period at the end."; start with an imperative verb unless a brief locating phrase comes first; "Make sure that customers know where the action should take place before you describe the action."
- Abbreviate simple sequences with right angle brackets: "Include a space before and after each bracket, and don't make the brackets bold." Accessibility tip: screen readers might skip the brackets ("**Menu** > **Go To** > **Folders** as _Menu Go To Folders_") — "Check with an accessibility expert before you use this approach."

Examples: "On the ribbon, go to the **Design** tab." / "For **Alignment**, select **Left**." / "Select **Accounts** > **Other accounts** > **Add an account**."

#### Followed: Describing interactions with the UI

URL: https://learn.microsoft.com/en-us/style-guide/procedures-instructions/describing-interactions-with-ui

- "use generic verbs that work with any input method. Don't use input-specific verbs, such as _click_ or _swipe_."
- Verb table: **Open** (apps, panes, File Explorer, files/folders, shortcut menus; websites only to match UI, otherwise _go to_; "Don't use for commands and menus"); **Close** (apps, panes, dialogs, files, notifications, tabs; "Don't confuse with _stop responding_"); **Leave** (websites/webpages); **Go to** (menus, tabs, places in UI, websites; "It's OK to use _On the XXX tab_ if the instruction is brief"); **Select** (buttons, checkboxes, list-box values, links, menu items, gallery items, keys and keyboard shortcuts — "Select **Ctrl+Alt+Delete**."); **Select and hold (or right-click)**; **>** ("only when there's a clear and obvious path through the UI and the selection method is the same for each step"; no bold on the symbol; spaces around it); **Clear** (checkbox); **Choose** ("Choosing an option, based on the customer's preference or desired outcome" and to avoid "Select **Select users**" → "Choose **Select users**"); **Switch, turn on, turn off** (toggles); **Enter** ("Instructing the customer to type or otherwise insert a value, or to type or select a value in a combo box"); **Move, drag**; **Zoom, zoom in, zoom out**.
- Keyboard shortcuts: "Document keyboard shortcuts only if they're the most likely way the customer will accomplish a task or as an alternative input method".

#### Followed: Formatting text in instructions

URL: https://learn.microsoft.com/en-us/style-guide/procedures-instructions/formatting-text-in-instructions

- Recurring convention for buttons/checkboxes/commands/dialogs/menus/palettes/panes/tabs/toggles/windows: "Avoid talking about UI elements. Instead, describe what the customer needs to do." When you must, bold the name; sentence-style capitalization unless matching the UI; drop a trailing colon or ellipsis from the label; "Don't include the type of UI element, such as _button_ or _checkbox,_ unless including it adds needed clarity."
- Example: "Select **Save as** (_not_ Select **Save as…** or Select the **Save as** button)."
- Dialogs: "use _dialog_. Don't use _pop-up window_, _dialog box_, or _dialogue box_."
- Command-line commands and options: code style; options "Capitalize the way the option must be typed."
- Key names: "Capitalize. Use bold formatting for key names and keyboard shortcuts in instructions. Don't put a space around the plus sign (+)" — "Ctrl+Alt+Del", "Select the **F1** key."
- File names (user-defined examples): "Title-style capitalization. It's OK to use internal capital letters"; bold in procedures when the customer interacts with the name; code style in code syntax. Folder names: sentence-style capitalization.
- Device and port names: all uppercase (USB).
- Placeholders: "Italic when the placeholder element is UI text. Use angle brackets for code placeholders when angle brackets aren't part of the language syntax." — "Enter _password_." / "`/v: <version>`"
- Slashes: "include the spelled-out term (_backslash_ or _slash_), followed by the symbol in parentheses."
- Strings: quotation marks, or code style for code strings.
- User input: "Usually lowercase, unless case sensitive. Bold or italic, depending on the element." — "Enter **hello world**".
- Windows: "Don't use _window_ to refer to a specific dialog box, pane, or similar UI element."
- In UI and general content (blogs, marketing): "avoid bold and italic formatting"; choose one approach consistently: describe the action without the label / wording that sets off the name / quotation marks (sparingly) / bold.

### Formatting common text elements

URL: https://learn.microsoft.com/en-us/style-guide/text-formatting/formatting-common-text-elements

Table (Element — Convention — Example):

- Database names — Bold — **Contoso** database
- Emphasis — "It's OK to use italic formatting sparingly for emphasis."
- Error messages — Sentence-style capitalization; quotation marks when referenced in text — "If you see the error message, "Check scanner status and try again," use Windows Update…"
- File attributes — all lowercase (hidden, system, read-only)
- File name extensions — all lowercase (.mdb, .doc)
- File names — "Title-style capitalization. It's OK to use internal caps in file names for readability." — My Taxes for 2016 / MyTaxesFor2016
- Folder and directory names — Sentence-style capitalization; internal caps OK — Vacation and sick pay / MyFiles\Accounting\Payroll\VacPay
- Mathematical constants and variables — Italic
- New terms — "Italicize the first mention of a new term if you're going to define it immediately in text."
- Ports — All uppercase (LPT1)
- Products, services, apps, trademarks — usually title-style capitalization; check the Microsoft trademark list
- UI text or strings — Sentence-style capitalization ("Find on page", "Read aloud")
- URLs — "All lowercase for complete URLs. If necessary, line-break long URLs before a slash. Don't hyphenate."

### Formatting titles

URL: https://learn.microsoft.com/en-us/style-guide/text-formatting/formatting-titles

- "In general, use sentence-style casing … as this makes content more readable and ensures better localizability."
- "Use bold font instead of italics for titles to enhance readability and accessibility."
- Exceptions to sentence case: titles of books (incl. e-books), white papers, and reports; games; events and webinars.

Examples: "**Unraveling HTML5, CSS3, and JavaScript**"; "**Sea of Thieves 2023 Edition**"; "The **Microsoft Envision AI Tour** is for decision-makers and developers…"

### Em dashes, en dashes, hyphens, and minus signs

URL: https://learn.microsoft.com/en-us/style-guide/punctuation/dashes-hyphens/ (requested `/emes` URL resolves here)

- Em dash: break in thought, clarification, parenthetical; "can be an effective alternative to colons, semicolons, and parentheses, but don't overuse them." "Don't use spaces around em dashes."
- En dash: ranges of numbers and dates; can replace a hyphen in some compound words (see Hyphens); not a minus sign; no spaces. Exception: "Use spaces around an en dash when it's used in a time stamp appearing in UI, or in a date range that includes two times and two dates."
- Hyphens: join words, connect prefixes; "Don't use multiple hyphens in place of an em dash."
- Minus sign (−): subtraction and negative numbers; "For accessibility reasons, don't substitute an en dash for the minus sign."

Examples: "The information in your worksheet—numbers, formulas, and text—is stored in cells." / "2015–2017" / "Azure-supported features" / "AI Builder–supported features" (en dash with an open compound) / "2:15 PM – 4:45 PM" / "The temperature was −12°F."

### Commas

URL: https://learn.microsoft.com/en-us/style-guide/punctuation/commas

Use a comma:

- before the conjunction in a list of three or more (serial comma); tip: more than three or long items → bulleted list.
- after an introductory phrase ("With the Skype app, you can call any phone.").
- to join independent clauses with a conjunction ("Select **Options**, and then select **Enable fast saves**."); tip: if long, rewrite as two sentences.
- between coordinate adjectives (reversible or joinable with _and_); tip: rewrite for a friendlier tone ("Build mixed-reality apps that support collaboration across platforms," not "Build collaborative, cross-platform mixed-reality apps.").
- around the year in a full date inside a sentence ("February 4, 2015, issue").

Don't use a comma:

- to join independent clauses without a conjunction (semicolon instead: "Select **Options**; then select **Enable fast saves.**").
- between verbs in a compound predicate ("The program evaluates your computer system and then copies the essential files…"); tip: split into two sentences or add a subject.
- between month and year when no day is given.

### Capitalization

URL: https://learn.microsoft.com/en-us/style-guide/capitalization

- "Microsoft style uses sentence-style capitalization." Capitalize first word of a sentence, heading, title, UI label, or standalone phrase; proper nouns; lowercase everything else. "reserve capitalization for product and service names."
- "Rewrite sentences that start with a word that's always lowercase."
- "Don't use all uppercase for emphasis. (It's OK to use italic sparingly for emphasis.)" "Don't use all lowercase as a design choice."
- "Don't use internal capitalization (such as _AutoScale_ or _e-Book_) unless it's part of a brand name."
- "Don't capitalize the spelled-out form of an acronym unless it's a proper noun."
- Slash: "capitalize the word after the slash if the word before the slash is capitalized." — Country/Region; "Turn on the On/Off toggle."
- Titles and headings: sentence-style; capitalize first word after a colon; "Titles of blog posts, documentation articles, and press releases use sentence-style capitalization."
- Title-style (rare: product/service names, blog names, book/song titles, article titles in citations, white paper titles, titles of people): capitalize first and last words; lowercase _a, an, the_; lowercase prepositions of four or fewer letters; lowercase _and, but, or, nor, yet, so_; capitalize everything else "including nouns, verbs (including _is_ and other forms of _be_), adverbs (including _very_ and _too_), adjectives, and pronouns (including _this, that,_ and _its_)"; hyphenated: capitalize the word after the hyphen if it would be capitalized standalone or is the last word.
- "Capitalize the first word of labels and terms that appear in UI and APIs unless they're always lowercase (for example, _fdisk_)." "In programming languages, follow the traditional capitalization of keywords and other special terms."
- Reference: Chicago Manual of Style; Merriam-Webster; the A–Z word list.

Examples: "Choose the Office version that's right for you"; "Block party: Communities use Minecraft to create public spaces"; title-style: "Enterprise Agility Is Not an Oxymoron"; "Self-Paced Training for Microsoft Visual Studio".

### Numbers

URL: https://learn.microsoft.com/en-us/style-guide/numbers

- "When you write about numbers used in examples or UI, duplicate them exactly as they appear in the UI."
- Body text: spell out zero through nine, numerals for 10 or greater (numerals OK for 0–9 in tables/UI). Same for units of time ("seven years", "28 days").
- "If one item requires a numeral, use numerals for all the other items of that type."
- Two adjacent numbers for different things: numeral + spelled-out ("fifteen 20-page articles").
- "Don't start a sentence with a numeral." (OK in list items.)
- Always numerals for: measurements (even <10: "3 feet, 5 inches", "0.75 grams"); a number the customer enters ("Enter **5**."); round numbers ≥1 million ("7 million"); dimensions (spell out _by_, except tile sizes/screen resolutions/paper sizes which use × with spaces: "1280 × 1024"); time of day with _AM_/_PM_ (not for 12:00 — "Use _noon_ or _midnight_"; include time zone for events); percentages ("Use a numeral plus _percent_ to specify a percentage. Use _percentage_ when you don't specify a quantity." — "At least 50 percent of your system resources"); coordinates and numbered sections ("row 3, column 4", "Chapter 10", "step 1").
- Commas in numbers with four or more digits ("$1,024"); exception — years, pixels, baud use commas only at five or more digits ("1920 × 1080 pixels", "9600 baud", "14,400 baud"); no commas in page numbers, addresses, or after the decimal point.
- Dates: no ordinals; "always spell out the name of the month" (global tip).
- Phone numbers: hyphens only ("612-555-0175").
- Negative numbers: minus sign, not en dash ("−79").
- Spelled-out compound numbers are hyphenated ("twenty-five fonts").
- Fractions/decimals: leading zero for decimals <1 unless the customer enters the value ("0.5 cm"; "enter **.75"**"); no slash fractions except in equations; hyphenate spelled-out fractions ("one-third"); plural unit for decimal fractions ("0.5 inches", "1 inch").
- "Always spell out ordinal numbers." No ordinals for dates; "Don't add -_ly_ to an ordinal number, as in _firstly_ or _secondly_."
- Ranges: "use _from_ and _through_" ("from 9 through 17"); en dash for page ranges or where space is tight ("pages 112–120"); "Use _to_ in a range of times" ("10:00 AM to 2:00 PM"); "Don't use _from_ before a range indicated by an en dash."
- Abbreviations: "don't abbreviate _thousand, million,_ and _billion_ as _K, M,_ and _B_" (spell out or write the whole number); if forced (UI space): capitalize, no space, avoid decimals ("_8.21K_ has the same number of characters as _8,210_").

### Developer content (index)

URL: https://learn.microsoft.com/en-us/style-guide/developer-content/

- Brand voice still applies to developer/IT-pro content ("Be warm and relaxed, crisp and clear, and ready to lend a hand as appropriate for the context").
- "it's OK to assume IT pros and developers bring a fundamental understanding of programming concepts. So skip the basic knowledge and focus on technology-specific or product-specific information".
- Two foundations: reference documentation and code examples; plus formatting developer text elements.

#### Code examples

URL: https://learn.microsoft.com/en-us/style-guide/developer-content/code-examples

- Types: one-liners in text; short self-contained examples; long samples.
- "Many developers copy example code from documentation into their own code" — design for that.
- Planning: concise, key tasks; "Start with simple examples and build up complexity"; prioritize frequently used and tricky elements; "Don't use code examples to illustrate obvious points or contrived scenarios"; reserve complicated examples for tutorials/walkthroughs; add an introduction (scenario, what isn't clear from code, requirements and dependencies); "Provide an easy way for developers to copy and run the code"; SEO (keywords, links).
- Writing: "Design code for reuse. Help developers determine what to modify. Add comments to explain details, but don't overdo it. Don't state the obvious."; "Show expected output, either in a separate section after the code example or by using code comments within the code example."; accessibility for UI-creating code (alt text); "Write secure code. For example, always validate user input, never hard-code passwords in code, and use code-analysis tools"; "Show exception handling only when it's intrinsic to the example. Don't catch exceptions thrown when invalid arguments are passed to parameters."; "Always compile and test your code."

#### Formatting developer text elements

URL: https://learn.microsoft.com/en-us/style-guide/developer-content/formatting-developer-text-elements

- "In general, use code style for programmatic or code-related elements." "When you're documenting code, capitalization should follow what the code uses."
- Code style: attributes, classes, code samples/keywords/variables in text, command-line commands, command-line options ("Capitalize the way the option must be typed"), constants, control classes (uppercase), data formats (uppercase), data structures and members, data types ("Capitalization follows the API"), directives, environment variables, event names, fields, functions, handles (uppercase), keywords, logical operators (`AND`, `XOR`), macros, markup tags, members, methods (`OpenForm()`), parameters, properties, registers, registry settings (subtrees uppercase with underscores), statements, structures, switches (usually lowercase), values (uppercase), variables, XML schema elements (angle brackets).
- Not code style: **AI prompts** — quotation marks in text ("List all of my subscriptions."); **Database names** — bold (code style inside code syntax); **Error messages** — sentence-style capitalization, quotation marks in text; **File attributes/extensions** — lowercase plain; **File/folder names (user-defined)** — code style in code, bold or plain when referencing UI; **Mathematical constants and variables** — italic; **New terms** — italic on first mention; **Operators** — "Bold. Use code style for code-related operators." (**+, -** / `sizeof`); **Placeholders** — italic when UI text, angle brackets in code when brackets aren't language syntax; **Ports** — uppercase plain; **Products/services/apps** — title-style caps; **UI text** — sentence-style; **URLs** — lowercase plain, code style in code; **User input** — "Usually lowercase, unless case sensitive. Bold. Use italic only for placeholders." ("Enter **hello world**").

#### Reference documentation

URL: https://learn.microsoft.com/en-us/style-guide/developer-content/reference-documentation

- "Consistency is essential"; standard article design, predictable headings, consistent wording; links to related articles.
- Article titles: "Use the name of a programming element (such as Clear), followed by an element type (such as Class, Method, Property, or Event)"; add a differentiator when names collide — "Clear method", "Device.Clear method", "Clear method (ADO)".
- Sections: Title and description ("explain what the element does or represents without repeating the element name"); Declaration/syntax (per language if multi-language); Parameters (description + data type; required/optional; input/output; "Don't just repeat the words in the parameter name or the data type"); Return value (for a Boolean, describe the condition); Remarks (non-obvious details, comparisons, potential issues); Example; Requirements or Applies to; See also. Also Property value (incl. default and type), Exceptions/error codes (list + conditions), Permissions.
- Auto-generated docs: "review the quality and appropriateness of the comments… Remove any implementation or internal details that aren't suitable for documentation."

### A–Z word list and term collections

URL (requested, 404): https://learn.microsoft.com/en-us/style-guide/a-z-word-list-term-collections/ — no index page exists.
Organization (from https://learn.microsoft.com/en-us/style-guide/toc.json):

- Nav node "A–Z word list and term collections" with: "Term collections" (12 themed pages: Accessibility terms, AI and bot terms, Bit and byte terms, Cloud-computing terms, Computer and device terms, Date and time terms, Keys and keyboard shortcuts, Mouse and mouse interaction terms, Security terms, Special characters, Touch and pen interaction terms, Units of measure terms), "Numbers and symbols" (5 entries, e.g. "24/7", "8.5" × 11" paper"), then letters A–Z, each a flat list of entries (871 entry pages total). Entry URLs: `a-z-word-list-term-collections/<letter>/<slug>`, e.g. `.../s/sign-in-sign-out`. Entries are short: guidance, optional **Examples**, **See also**.
- Not present as standalone entries: _since_, _because_, _utilize_, _might_, _wish_, _they_, _gender-neutral pronouns_, _towards_, _allowlist_, _denylist_, _safelist_ (covered inside other pages, noted below).

Entries fetched:

- **sign in, sign out** (`/s/sign-in-sign-out`): "Use _sign in_ to describe starting a session on a computer, a device, a network, an app, or anywhere a username and password are required. Use _sign out_ to refer to ending a session. Don't use _log in, login, log into, log on, logon, log onto, log off, log out, logout, sign into, signin, signoff, sign off,_ or _sign on_ unless these terms appear in the UI (and you're writing instructions). The verb form is two words… Avoid using as a noun or adjective (_sign-in, sign-out_)." Ex: "Enter your password to sign in." / "…sign in to Power BI service on the web and how to sign out of it."
- **log on, log off** (`/l/log-on-log-off`): "Don't use _log in, login, log into, log on, logon, log onto, log off, log out, logout,_ or a similar term unless it appears in the UI… Use _sign in_ or _sign out_ instead."
- **set up, setup, Setup** (`/s/set-up-setup`): "Two words as a verb, one word as an adjective and a noun. Don't hyphenate. Capitalize _Setup_ when it refers to the Setup program." Ex: "Unpack everything before you set up your computer." / "The setup time is about 15 minutes." / "Run Setup before you open other apps."
- **email** (`/e/email`): noun for the program, messages collectively, or one message (use _email message_/_message_ to disambiguate); "It's OK to use _email_ as a verb."; "Use _Email_ at the beginning of a sentence or heading. Never hyphenate _email_ or capitalize the _m_." Ex: "You have two new emails." / "Email us your comments."
- **click** (`/c/click`): "Avoid this verb, which is specific to using a mouse. Instead, use verbs that work with multiple devices, such as _select_. It's OK to use _click_ when you need to describe mouse actions specifically."
- **select** (`/s/select`): marking text/objects/cells for action; "Don't use _highlight_ or _pick_ as a synonym for _select_." (Verb usage → Describing interactions with UI.)
- **enter**, **type** (`/e/enter`, `/t/type`): both just "See Describing interactions with UI" (which prescribes **Enter** for typing or otherwise inserting a value; _type_ is not in the verb table).
- **allow list** (`/a/allow-list`): "Two words. Lowercase. Don't use as a verb, such as _allow-list the address_. Use phrasing like _add to an allow list_ or _use an allow list_. Don't use one word (_allowlist_)." Opposite of _block list_.
- **block list** (`/b/block-list`): same rules; "Don't use one word (_blocklist_)."
- **blacklist** (`/b/blacklist`): "Never use _blacklist_. Use _block list_ instead. For more specific usage, _blocked senders list_ can be used."
- **whitelist** (`/w/whitelist`): "Never use _whitelist_. Use _allow list_ instead. For more specific usage, _safe senders list_ can be used."
- **master/slave, master/subordinate** (`/m/master-slave`): "Don't use _master/slave_. Use _primary/replica_ or alternatives such as _primary/secondary_, _principal/agent_, _controller/worker_, or other appropriate terms depending on the context. Use _primary/subordinate_ as an adjective… Don't use _primary/subordinate_ as a synonym for _parent/child_." Ex: "Each subordinate device has a unique 7-bit or 10-bit address."
- **he/she** (`/h/he-she`): "Don't use." → Bias-free communication. (Singular _they_: Bias-free page — "it's OK to use a plural pronoun (_they, their,_ or _them_) in generic references to a single person" when you can't write around it; Nouns and pronouns page — "_They_ can be used as a non-binary pronoun for a singular person instead of a binary pronoun (_she_ or _he_)." and "Collective nouns like _company_ take a singular pronoun. Don't use a plural pronoun (like _they_) for a collective noun.")
- **can, may** (`/c/can-may`): "When you see _can_ in your writing, consider deleting it. _Can_ implies ability but not action. Rewrite to describe the action if possible." Ex: "Use the **/b** option to force a black-and-white screen." "When ability is what you need to express, it's OK to use _can_… Use _might_ to express possibility. Don't use _may,_ which might be interpreted as providing permission. Don't substitute _could_ for _can_ unless you're referring to the past."
- **once** (`/o/once`): "Don't use as a synonym for _after_." Ex: "After you save the document, you can close the app."
- **toward** (`/t/toward`): "Use instead of _towards_."
- **want** (`/w/want`): "Use instead of _wish_ or _desire_ when the customer has a choice of actions. Don't use when you mean _need,_ which indicates a requirement or obligation." Ex: "Select **PC info** if you want to find out what version of Windows you're running."
- **please** (`/p/please`): "Avoid _please_ except in situations where the customer is asked to do something inconvenient or the application or site is to blame for the situation." Ex: "The network connection was lost. Please reenter your password."
- _since_ vs _because_: covered on Use simple words ("_Because_ you created the table…" not "_Since_…"). _utilize_: same page ("use" not "utilize, make use of").

### Followed: Grammar — Verbs, Person, Nouns and pronouns

URLs: https://learn.microsoft.com/en-us/style-guide/grammar/verbs ; https://learn.microsoft.com/en-us/style-guide/grammar/person ; https://learn.microsoft.com/en-us/style-guide/grammar/nouns-pronouns

- Verbs: present tense "is the best choice for most content"; indicative mood for most content, imperative for "Instructions, procedures, direct commands, requests, and headings for columns that list customer actions", subjunctive — avoid ("We recommend that you be careful…"); "Don't switch moods within a sentence."
- Voice: active "whenever you can"; passive OK for "Avoiding condescending text or blaming the customer, especially in errors, warnings, or notifications", awkward constructions, emphasizing the receiver — "That site can't be found." / "When the user clicks **OK**, the transaction is committed. (in content for developers)".
- Verb agreement: "A variety of games is available"; _or_ with singular subjects → singular; mixed → match closest subject.
- Person: second person by default; "Omit _you can_ whenever the sentence works without it."; in product UI avoid _you/your_ that sounds like commanding; AI-generated content: past tense + "for you" or words conveying uncertainty ("Suggested for you"). First-person singular "sparingly" — never in marketing/support docs, OK in UI labels ("Remember my password", "I agree to the terms of service"). "Avoid plural first person (we, us)" — "can feel like a daunting corporate presence"; "It's OK to use phrasing like _we recommend_ if it helps you avoid awkward phrasing like _it's recommended,_ but write around it if you can."; OK in privacy/security settings ("We protect your privacy at every step."). Ex: "Change your password (Instead of _We recommend that you change your password._)"; "That didn't work. Try again. (Instead of _We weren't able to run the Solution Checker…_)".
- Nouns: default to lowercase for technology terms ("cloud computing, smartphone, e-commerce, open source"); capitalize only to distinguish a product (SQL Server vs. an SQL database server) or when the industry capitalizes; plurals of abbreviations add _s_ ("ISVs", "DBMSs"), no _(s)_ — "Wait for _x_ minutes."

---

## 2. Where Microsoft differs from or extends Google

Microsoft side: verified from the fetched pages above. Google side: from memory unless marked otherwise — another agent is verifying Google; treat every "Google:" clause as "per memory, verify".

**Reconciliation against the verified Google digests** (the sibling `references/*.md` files, fetched the same day). The skill follows Google on every conflict; Microsoft's form is recorded for when Google is silent.

| Topic                                 | Google (verified)                                                             | Microsoft                                                 | Skill follows                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| allowlist / blocklist                 | one word (`allowlist`, `denylist`, `blocklist`), nouns only                   | two words, never a verb                                   | Google                                                                                                      |
| Task headings                         | bare infinitive ("Create an instance"); no leading _-ing_                     | infinitive phrase ("To create a heading")                 | Google                                                                                                      |
| Placeholders                          | `UPPERCASE_WITH_UNDERSCORES` in code font, explained after the sample         | italic for UI text; `<angle brackets>` in code            | Google                                                                                                      |
| Filenames in prose                    | code font, exact spelling ("the `config.json` file")                          | plain text (title-style caps), code font only in code     | Google                                                                                                      |
| Titles of works                       | italic (unless in a link); shorter works in quotes                            | bold                                                      | Google                                                                                                      |
| _versus_                              | spell out; don't use _vs._                                                    | _vs._ in headings                                         | Google                                                                                                      |
| Percent                               | numeral + `%`, no space (`40%`)                                               | numeral + _percent_                                       | Google                                                                                                      |
| Ordinals                              | spell out all ordinals (_forty-third_)                                        | spell out all ordinals                                    | Same (item 8 below is not a conflict)                                                                       |
| Ranges                                | hyphen, no spaces (`2012-2016`); _to_ with units; **no en dash**              | _from … through_; en dash for page ranges; _to_ for times | Google                                                                                                      |
| _may_ / _might_ / _can_               | _may_ = permission/policy, _might_ = possibility, _can_ = ability or optional | avoid _may_; delete _can_ where possible                  | Google, plus Microsoft's "delete _can_ / _you can_ when the sentence works without it" as a tightening move |
| Single-step procedure                 | one bulleted sentence                                                         | one bulleted sentence                                     | Same                                                                                                        |
| _since_ → _because_, _once_ → _after_ | yes                                                                           | yes                                                       | Same                                                                                                        |

Largely aligned (no appendix item needed beyond a pointer):

- Sentence-style capitalization for headings/titles/UI; serial comma; contractions encouraged (and the same two caveats: no noun+verb contractions, avoid _there'd/it'll/they'd_); second person; present tense; active voice; no spaces around em dashes; spell out zero–nine, numerals 10+; bold for UI element names; code font for code elements; _email_ one word; _set up_ (verb) / _setup_ (noun/adjective); don't use _master/slave_, _whitelist_, _blacklist_; singular _they_ acceptable; _select_ as the device-neutral verb; ">" with spaces and unbolded for menu sequences; _dialog_ not _dialog box_; avoid _please_ in ordinary instructions; _since_ → _because_ for causation; _utilize_ → _use_. (Google: per memory, verify, for each.)

Differences / extensions Microsoft supports explicitly:

1. **Allow list / block list are two words, lowercase, never a verb** ("Don't use one word (_allowlist_)"). Google: per memory, verify — Google's word list spells _allowlist_, _blocklist_, _denylist_ as single words. Direct conflict; a Google-first skill should keep Google's one-word form and note Microsoft's.
2. **Task headings as infinitive phrases** ("Consider infinitive phrases, such as _To create a heading,_ for headings and titles related to tasks"; first-level noun phrases, second-level verb phrases, instruction headings infinitive). Google: per memory, verify — Google prefers bare-infinitive/imperative task headings ("Create an instance"). Direct conflict in form; both agree on parallelism and sentence case.
3. **Placeholders**: italic when the placeholder is UI text ("Enter _password_."), angle brackets for code placeholders when brackets aren't language syntax (`/v: <version>`). Google: per memory, verify — Google uses uppercase-with-underscores placeholders in code font (`PROJECT_ID`) and explains them. Conflict.
4. **File names and folder names in prose are not code font by default**: file names title-style caps ("My Taxes for 2016"/"MyTaxesFor2016"), folder names sentence case, code style only "if used in code", bold when the customer interacts with the name in a procedure; extensions lowercase plain (".mdb"). Google: per memory, verify — Google puts filenames, paths, and extensions in code font. Conflict.
5. **Titles in bold, not italic** ("Use bold font instead of italics for titles to enhance readability and accessibility"); sentence case except books/white papers/reports/games/events. Google: per memory (low confidence), verify — Google italicizes titles of published works. Probable conflict.
6. **"vs." in headings**: "Use _vs.,_ not _v._ or _versus,_ in headings." Google: per memory (medium), verify — Google's word list says spell out _versus_. Probable conflict.
7. **Percent as a word**: "Use a numeral plus _percent_" ("50 percent"); _percentage_ when no quantity. Google: per memory (medium), verify — Google uses the % symbol with numerals. Probable conflict.
8. **Ordinals always spelled out** ("the twenty-first anniversary"; no _firstly/secondly_). Google: per memory (low), verify — Google spells out only low ordinals. Possible conflict.
9. **Ranges**: "use _from_ and _through_" in text; en dash only for page ranges/tight space; _to_ for time ranges; never _from_ + en dash. Google: per memory, verify — similar (en dash in tables, _to_/_through_ in text); Microsoft is more prescriptive about _from…through_ and the _to_-for-times rule.
10. **Time**: "10:45 AM", "_noon_/_midnight_" instead of 12:00, include time zone for events. Google: per memory (low), verify — similar AM/PM; the noon/midnight rule is a Microsoft extension.
11. **Commas in numbers**: four or more digits, but years/pixels/baud only at five or more ("1920 × 1080 pixels", "9600 baud"); no commas in page numbers/addresses. Google: per memory (low), verify — Google has no pixel/baud carve-out. Extension.
12. **Can/may/might**: "When you see _can_ in your writing, consider deleting it"; "Use _might_ to express possibility. Don't use _may_"; _could_ only for the past. Google: per memory, verify — Google keeps _may_ for permission, _might_ for possibility, _can_ for ability. Microsoft goes further: drop _can_ where possible and avoid _may_ altogether.
13. **"Edit out _you can_"** and "Avoid weak phrasing like _there is_, _there are_, and _there were_" (Top 10; Person page: "Omit _you can_ whenever the sentence works without it"). Google: per memory, verify — Google has no equivalent blanket rule. Extension.
14. **Contraction consistency in UI**: "Don't mix contractions and their spelled-out equivalents in UI text." Google: per memory, verify — not stated. Extension.
15. **First person**: singular _I/my/me_ allowed in product UI labels ("Remember my password"), never in marketing/support docs; _we_ discouraged ("daunting corporate presence") except privacy/security settings and to avoid "it's recommended". Google: per memory, verify — Google discourages _we_ generally; the UI-label carve-out for _I/my_ is a Microsoft extension.
16. **Passive voice explicitly sanctioned** for error messages "to avoid condescending text or blaming the customer" ("That site can't be found."). Google: per memory, verify — Google allows passive when the actor is unknown/irrelevant; the blame-avoidance rationale is Microsoft's framing.
17. **Procedure mechanics**: single-step procedures use a bullet, not a number; every step is "a complete sentence" with capital and period; "include actions that complete a procedure, such as selecting an **OK** or **Apply** button"; "Try to fit all the steps on the same screen"; short steps in the same UI location may be combined; introductory sentence must not repeat the heading; screen-reader caveat for ">" sequences. Google: per memory, verify — Google shares location-before-action and one-action-per-step; the bullet-for-single-step, complete-sentence, completing-action, and accessibility-tip rules are Microsoft extensions.
18. **UI-element naming**: "Avoid talking about UI elements. Instead, describe what the customer needs to do"; don't add the element type (_button_, _checkbox_, _menu_, _tab_, _pane_) unless needed for clarity; drop trailing colon/ellipsis from labels ("Select **Save as** (_not_ Select **Save as…**)"); in UI/marketing/blog content avoid bold/italic and pick one of four set-off approaches consistently. Google: per memory, verify — Google bolds UI names and (per memory) often includes the element type. Extension/possible conflict on element type.
19. **Verb table for UI interactions** with _Choose_ for preference-based options and to avoid "Select **Select users**", _Clear_ for checkboxes, _Go to_ for menus/tabs/webpages, _Open_ never for commands and menus, _Leave_ for webpages, _Select_ even for keys ("Select **Ctrl+Alt+Delete**"). Google: per memory, verify — Google's list is shorter; _Choose_-to-avoid-repetition and _Select_ for keyboard shortcuts are Microsoft-specific.
20. **Lists**: 2–7 items; no period when every item has three or fewer words or items are UI labels/strings; term-list format (bold term, plain period, capitalized definition); no colon or period after a heading that introduces a list; no conjunctions at item ends. Google: per memory, verify — Google's list punctuation rule is "period if complete sentence"; the ≤3-words exception and the term-list format are Microsoft extensions.
21. **Paragraph and layout guidance**: 3–7 lines per paragraph; F-pattern; "Back to top" links; TOC in long docs; one heading level usually enough per page or two; no ampersands, plus signs, or hyphens in headings. Google: per memory, verify — not covered at this granularity. Extension.
22. **Bias-free specifics**: title-case for ethnic/racial groups but lowercase _white_ and _multiracial_; _perimeter network_ not _DMZ_; _stop responding_ not _hang_; no generalizations about countries "not even positive"; don't mix countries with states/continents in examples; no _spirit animal_; diversity of names in fictitious scenarios. Google: per memory, verify — Google covers inclusive language and _primary/replica_, but not the capitalization rule or the DMZ/hang items. Extension.
23. **Developer formatting exceptions to code font**: AI prompts in quotation marks; operators in bold; user input in bold; error messages in quotation marks with sentence case; database names bold; ports/handles/values uppercase; "capitalization should follow what the code uses". Google: per memory, verify — Google puts user input and error strings in code font. Conflict on user input/error messages; the AI-prompt rule is a Microsoft addition.
24. **Reference-article template**: title = element name + type ("Clear method (ADO)"); fixed section list; parameter descriptions must not repeat the name/type; Boolean returns describe the condition; review auto-generated comments and strip internal details. Google: per memory, verify — Google's API reference guidance is less prescriptive about title form. Extension.
25. **Code-example rules**: show expected output; exception handling only when intrinsic; never catch invalid-argument exceptions; "Always compile and test"; write secure code (validate input, no hard-coded passwords). Google: per memory, verify — Google shares "compile/test" and comments guidance; the exception-handling and expected-output rules are Microsoft additions.
26. **Minus sign (U+2212) vs en dash** for negative numbers and subtraction "for accessibility reasons"; en dash instead of hyphen when a compound modifier contains an open compound ("AI Builder–supported features"); en dash spaced only in UI time stamps. Google: per memory, verify — not covered. Extension.
27. **Number abbreviations**: don't abbreviate thousand/million/billion as K/M/B (spell out; UI only if space forces it, capitalized, no space, no decimals). Google: per memory, verify — not covered. Extension.
28. **Dimensions**: spell out _by_ except tile sizes/screen resolutions/paper sizes, which use "×" with spaces ("1280 × 1024"). Google: per memory, verify — not covered. Extension.
29. **Slash capitalization** ("Country/Region", "On/Off") and "Don't capitalize the spelled-out form of an acronym unless it's a proper noun". Google: per memory, verify — Google states the acronym rule similarly; the slash rule is an extension.
30. **Sign in / sign out** — every _log in/login/log on/log off/log out/sign on/sign into_ variant is banned unless in the UI; avoid noun/adjective _sign-in_. Google: per memory (low), verify — Google's word list also prefers _sign in_ but allows _sign-in_ as noun/adjective. Possible difference on the noun form.
31. **want / wish / toward / once / please** micro-rules: _want_ not _wish/desire_, not for _need_; _toward_ not _towards_; _once_ not a synonym for _after_; _please_ only when the customer is inconvenienced or the app is to blame. Google: per memory, verify — Google has *once*→*after* and the _please_ rule (stricter: don't use); _toward_ and _want/wish_ are Microsoft entries.

---

## 3. Top 10 Microsoft additions worth keeping in a skill that otherwise follows Google

1. **Drop _can_ and _you can_; kill _there is/are_**: "When you see _can_ in your writing, consider deleting it… Rewrite to describe the action"; "Edit out _you can_ when it isn't necessary. Avoid weak phrasing like _there is_, _there are_, and _there were_." Plus "Use _might_ to express possibility. Don't use _may_."
2. **Avoid naming UI elements at all; when you must, bold the label, keep sentence case, drop the trailing colon/ellipsis, and omit the element type** ("Select **Save as** (_not_ Select **Save as…** or Select the **Save as** button)").
3. **Device-neutral verb table**: _select_ (incl. keys), _clear_ (checkboxes), _go to_ (menus/tabs/pages), _open_ (apps/files, never menus/commands), _enter_ (type or insert a value), _choose_ (preference-based, and to avoid "Select **Select users**"), _turn on/off_ (toggles); ">" unbolded with spaces only for a uniform selection path, with the screen-reader caveat.
4. **Procedure mechanics**: each step a complete sentence with a period; location before action; bullet (not number) for a single-step procedure; include the completing action (**OK**/**Apply**); keep all steps on one screen; intro sentence must not repeat the heading.
5. **Lists**: 2–7 items; parallel structure; no period when all items are ≤3 words or UI labels; no conjunctions/semicolons at item ends; heading-introduced lists take no colon or period after the heading; term lists = **bold term**. Capitalized definition with period.
6. **Numbers package**: numeral + _percent_; always numerals for measurements and values the user enters; _noon_/_midnight_ not 12:00; _from X through Y_ (never _from_ + en dash), _to_ for time ranges; commas at 4+ digits except years/pixels/baud (5+); spell out ordinals; don't abbreviate K/M/B; "fifteen 20-page articles" for adjacent numbers; don't start a sentence with a numeral.
7. **Dash and minus discipline**: em dash unspaced; en dash for ranges and for a compound modifier containing an open compound ("AI Builder–supported"); spaced en dash only in UI time stamps; real minus sign (−) for negatives/subtraction "for accessibility reasons".
8. **Headings**: sentence case, no end punctuation (question mark OK), no stacked headings, one level usually enough per page or two, no ampersands/plus signs/hyphens, "_vs._" not _versus_, parallel structure per level (noun phrases at level 1, verb phrases at level 2, infinitive "To …" for task headings — note this conflicts with Google's imperative task headings; keep Google's form but Microsoft's other rules).
9. **Voice/person carve-outs**: passive voice is fine in errors/warnings to avoid blaming the customer ("That site can't be found."); _we recommend_ beats _it's recommended_ but write around both; first-person singular only in UI labels ("Remember my password"); contractions never mixed with their spelled-out forms in the same UI.
10. **Terminology micro-rules not in (or stricter than) Google**: _sign in/sign out_ only (no _log in/login/log on/log off/sign on/sign into_); _set up_ (verb) / _setup_ (noun, adjective) / _Setup_ (program); _email_ never hyphenated, OK as a verb; _allow list_ / _block list_ (Microsoft two words — Google one word; record the conflict); _primary/replica_, _primary/secondary_, _principal/agent_, _controller/worker_ for _master/slave_ and _primary/subordinate_ only as an adjective (not a _parent/child_ synonym); _perimeter network_ not _DMZ_; _stop responding_ not _hang_; _want_ not _wish/desire_; _toward_ not _towards_; _once_ ≠ _after_; _please_ only when the customer is inconvenienced or the app is at fault; _because_ not _since_; title-case ethnic/racial groups but lowercase _white_ and _multiracial_.
