# Google style digest — grammar, punctuation, numbers, dates, units

Source: https://developers.google.com/style (22 pages, fetched 2026-08-19 via WebFetch and cross-checked against the raw HTML via curl). Every rule below is taken from the page text; quoted phrases are verbatim. Nothing is from memory.

---

## Abbreviations — https://developers.google.com/style/abbreviations

Definitions: acronym (first letters, pronounced as a word: NATO), initialism (first letters, each pronounced: CIA, FYI), shortened word (part of a word, sometimes with period: Dr., etc., min, CA). "It's fine to use the word _acronym_ to refer to both" acronyms and initialisms.

- Short versions of words (_app_, _demo_, _sync_) are not abbreviations — no period after them. Speaking test: "if you speak the short version as a word … you can usually treat it as a word and not an abbreviation."
- "Use standard acronyms and initialisms that will save the reader time."
- "Spell out abbreviations on first reference." Spell-out form: full term, then the abbreviation "in parentheses immediately following"; afterwards "use the abbreviation by itself."
- "If you use an abbreviation only once, include it only if you think the abbreviation is as commonly used as the spelled-out term. Otherwise, don't include the abbreviation."
- If first mention is in a heading or title, "you can use the abbreviation and then spell out the abbreviation in the first paragraph that follows."
- "Avoid using abbreviations for terms that aren't related to the main topic of the document." Be wary of specialized abbreviations the audience may not know.
- Consider translation: spelling out helps human and machine translation. Don't spell out when it doesn't help (e.g. _portable document format_ for PDF).
- Rarely need spelling out: AI, API, DVD, file formats (PDF, XML), HTML, PC, RAM, REST, units (MB, MiB, GB, GiB), URL, USB.
- Format of the introduction: "Italicize both the spelled-out term and its abbreviation." "Capitalize the spelled-out version of the abbreviation only if the long form is a proper noun or is conventionally capitalized" — "don't capitalize the term only because the abbreviation includes capital letters." "Include the abbreviation in link text."
- "Don't use _i.e._ or _e.g._; instead, use _that is_ or _for example_, respectively."
- "It's okay to use _etc._ in some circumstances, but it's best to use different phrasing in most lists."
- "Don't use internet slang abbreviations such as _tl;dr_, _ymmv_, _RTFM_."
- "Use the most common form of a word" — _approximately_, not _approx._
- "Spell out shortened words or common symbols that are substitutions for words" — _10 times_, not _10x_.
- Periods: "Don't use periods with acronyms or initialisms." "Put a period at the end of a shortened word, except for date and time abbreviations." No period after word-like short forms (_app_, _sync_). "Don't use a period with an abbreviation for the name of a country, US state, or the District of Columbia (DC)."
- "Don't use acronyms, initialisms, or shortened words as verbs."
- a/an: "use _a_ before any consonant sound and _an_ before any vowel sound"; base it on "the pronunciation that's most common for your audience." Word-list preferences: "a SQL", "a FHIR", "an SAP".
- Plurals: see Pluralization page.

Examples:

- Recommended: The internet of things (IoT) service can even be used for connecting to sensors in low Earth orbit. / Not recommended: The IoT (internet of things) service can even be used for connecting to sensors in LEO (low Earth orbit).
- Recommended: Establish _Border Gateway Protocol_ (_BGP_) sessions … / Not recommended: Establish _Border Gateway Protocol_ (BGP) sessions … (BGP not italic)
- Recommended: data manipulation language (DML) / Not recommended: Data Manipulation Language (DML)
- Recommended: Use SSH to log in to your remote shell. / Not recommended: Then ssh into your remote shell.
- Recommended: Updating the software made throughput 10 times faster. / Not recommended: … 10x faster.

---

## Articles (a, an, the) — https://developers.google.com/style/articles

- "For ease of comprehension and translation, include definite and indefinite articles (_a_, _an_, and _the_) in your writing. Don't skip articles for brevity, including in headings and titles."
- Cross-refs: articles before product names (Product names page); a/an before abbreviations by pronunciation (Abbreviations page).

Examples:

- Recommended: Create a VM instance / Not recommended: Create VM instance

---

## Capitalization — https://developers.google.com/style/capitalization

- "Follow the standard capitalization rules for American English."
- "Don't use unnecessary capitalization; before you capitalize a word, think about why (and whether) it should be capitalized."
- "Don't rely on a difference in capitalization to convey meaning" (Kubernetes _Pod_ vs _pod_ is lost on many readers).
- "Don't use all-uppercase, except … in official names, in abbreviations that are always written in all-caps, or when referring to code that uses all-caps."
- "Don't use camel case, except in official names or when referring to code that uses camel case."
- Product names: capitalize as officially written (see Product names page).
- Titles and headings: "use sentence case. That is, capitalize only the first word in the title, the first word in a subheading after a colon, and any proper nouns or other terms that are always capitalized a certain way." "Don't put a period at the end of a title or heading."
- References to titles/headings of documents following this guide: sentence case "even if the title or heading itself uses title case." For works that don't follow the guide, "retain the original capitalization."
- After a colon: "Use a lowercase letter to begin the first word of the text immediately following a colon, unless the text is" a proper noun (_Open source software: Hadoop_), a heading, a quotation (_Arthurian wit: "Bring me yon sworde"_), or "text that follows a label such as _Caution_ or _Note_."
- Figures: sentence case for captions, labels, callouts, and other text in images and diagrams.
- Glossaries/indexes: lowercase terms unless proper noun; sentence case for definitions.
- Hyphenated word first in a sentence or heading: "capitalize only the first element in the word, unless a subsequent element is a proper noun or proper adjective."
- Lists: "sentence case for items in all types of lists."
- Tables: "sentence case for all the elements in a table: contents, headings, labels, and captions."
- "Don't use a casing style name, such as _camel case_ or _snake case_, to describe a casing style. These names don't localize well and they aren't standardized. Instead, explain what the requirements are and provide an example."

Examples:

- Recommended: Enter the value for the `attribute` field in the format where there are no spaces between words and the first letter of each word is capitalized—for example, `AssertionAccount`.
- Lowercase after colon: _Open source software: Hadoop_ (Hadoop capitalized only because proper noun).

---

## Pluralization — https://developers.google.com/style/pluralization

- "Follow the standard rules for pluralization in US English and use the regular plural form of a word in most cases. Avoid using _'s_ to form a plural."
- Subject–verb agreement with long/complex subjects, and with compound subjects joined by _and_/_or_.
- "Use a plural after _one or more_, not a singular." Reword for clarity if helpful (_If any one test fails, …_).
- "Use a singular after _more than one_, not a plural."
- Abbreviations: "treat acronyms, initialisms, and other abbreviations as regular words when making them plural. Avoid using _'s_." If it ends in _s_, _sh_, _ch_, or _x_, add _es_: _OSes_, _DISHes_, _DCCHes_, _BMXes_.
- Spelled-out term and abbreviation must agree in number: _virtual machines (VMs)_, not _virtual machines (VM)_.
- Spelled-out units with numbers: "use the singular when spelling out the unit if the number is one. Otherwise, use the plural form for all other numbers, including zero, decimal numbers": 0 degrees, 0.5 degrees, 1 degree, 15 degrees.
- "Don't make an abbreviation plural when used as a unit with a number": _64 GB_, not _64 GBs_. Include a (preferably nonbreaking) space between number and abbreviation.
- "Don't form a plural or possessive for the trademark of a product, feature, or company name."
- Class names: "use singular class names. Don't manually make a singular class name plural… add a plural noun after the class name."
- "Don't put optional plurals in parentheses. Instead, use either a plural or singular construction and keep things consistent." If both must be indicated, "use _one or more_."

Examples:

- Recommended: APIs, SKEs, and IDEs / Not recommended: API's, SKE's, and IDE's
- Recommended: `Intent` objects and `Activity` instances / Not recommended: `Intent`s and `Activity`s; `Intents` and `Activities`
- Recommended: To find your API key, visit the Credentials page. / Not recommended: To find your API key(s), visit the Credentials page.
- Recommended: Either the API keys or service account wasn't authenticated. / Not recommended: User authentication and authorization is processed and handled by the security module.

---

## Possessives — https://developers.google.com/style/possessives

- "For singular nouns, including those that end in _s_, add _'s_" (_the storage class's quota_).
- "For plural nouns that end in _s_, add only an apostrophe" (_the models' capabilities_).
- "For plural nouns that don't end in _s_, add _'s_."
- "If a possessive seems awkward, rewrite the sentence to omit the possessive."
- "Avoid using _'s_ to form a plural noun."
- Product/feature/trademark names: "When describing function or performance, don't form a possessive from a feature name, product name, or trademark… use the name as a modifier or rewrite to use a word like _of_."
- Company names: add _'s_ for ordinary possession (_Google's new office_); "Don't form the possessive of a company name when using it as a trademark."
- Code items: "Don't form the possessive of a code item. Instead, form the possessive from the noun that follows the code item or rewrite."

Examples:

- Recommended: Extend the models' capabilities. / Not recommended: Extend the models's capabilities.
- Recommended: The rule that the Federal Trade Commission (FTC) issued. / Not recommended: The Federal Trade Commission's (FTC's) rule.
- Recommended: monitor Google Search performance / the performance of Google Search / Not recommended: monitor Google Search's performance.
- Recommended: Compare the number to the `wordCount` method's return value. / Not recommended: Compare the number to `wordCount`'s return value.

---

## Prepositions — https://developers.google.com/style/prepositions

- "There's no rule against placing a preposition at the end of a sentence. Place the preposition where it makes the most sense and makes the sentence easiest to read."
- "Include prepositions that increase clarity, omit unnecessary prepositions, and don't clutter the sentence with too many prepositions."
- Which preposition for UI elements: see UI elements and interaction page.

Examples:

- Recommended: … the client library documentation for the language you're interacting with. / Not recommended: … for the language with which you're interacting.

---

## Colons — https://developers.google.com/style/colons

- "A colon indicates that closely-related information follows."
- "When a colon introduces a list, the text that precedes the colon must be able to stand alone as a complete sentence."
- "In general, the first word in the text that follows a colon should be in lowercase." Exceptions: see Capitalization and colons (proper noun, heading, quotation, after a label like Note/Caution).
- Run-in headings in description lists use colons (see Lists page); when colons beat dashes, see Dashes.

Examples:

- Recommended: The fields are defined as follows: / Not recommended: The fields are:
- Recommended: Tone: concise, conversational, friendly, respectful
- Recommended: … remember to take these steps: review the style guide, use checklists, …

---

## Commas — https://developers.google.com/style/commas

- Serial comma: "In a series of three or more items, use a comma before the final _and_ or _or_."
- "In general, place a comma after an introductory word or phrase."
- Two independent clauses joined by a coordinating conjunction (_and, but, or, nor, for, so, yet_): "insert a comma after the first clause (before the conjunction) unless both clauses are very short."
- Independent + dependent clause joined by a conjunction: "insert a comma _only if_ the sentence could be misunderstood without one."
- "Put a comma before the word _which_ at the start of a nonrestrictive clause."
- "Put a semicolon or a period or a dash before a conjunctive adverb, such as _otherwise_, _however_, or _therefore_, and put a comma after the conjunctive adverb."
- "Don't use a comma before the causal conjunction _because_ unless it starts a nonrestrictive clause."
- Numbers: see Commas and decimal points in numbers (Numbers page).

Examples:

- Recommended: Locations are divided into zones, regions, and multi-regions. / Not recommended: … zones, regions and multi-regions.
- Recommended: The libraries make feed creation easier, and they ensure that only valid feeds are produced. / Not recommended: (no comma). But: Recommended: Type your ID and click **OK**. / Not recommended: Type your ID, and click **OK**.
- Recommended: Direct-access flags are plain variables and can be read directly. / Not recommended: Direct-access flags are plain variables, and can be read directly.
- Recommended: The variable must have a value; otherwise, the server returns an error. / Not recommended: The variable must have a value otherwise the server returns an error.

---

## Dashes — https://developers.google.com/style/dashes

- Em dash: "To indicate a break in the flow of a sentence—or an interruption—use an em dash… Don't put a space before or after it."
- Typing: HTML `&mdash;`; macOS Option+Shift+hyphen; Linux Compose + `---` or Ctrl+Shift+U 2014; Windows Alt+0151.
- "Don't use an en dash (the shorter dash) or a hyphen in place of an em dash." (Spaced en dash as em-dash substitute: "For now, only use the em dash.")
- En dash: "Don't use. Instead, use a hyphen or the word _to_." (ranges → Numbers / Units pages)
- Don't use "an em dash, an en dash, or a hyphen surrounded by spaces to separate an item and its description. Instead, use a colon or a period. For a series of items, use an HTML description list (`<dl>`)."
- (From Hyphens page note: "Don't use a hyphen (-) or a double hyphen (--) in place of a dash (—).")

Examples:

- Recommended: Example: This is an example. / Not recommended: Example - This is an example.
- Recommended: Appendix A: My first appendix / Not recommended: Appendix A—My first appendix

---

## Ellipses — https://developers.google.com/style/ellipses

- "In general, don't use ellipses." They indicate omission of non-pertinent text.
- Suspension points (hesitation): "Don't use ellipses this way."
- UI: "When ellipses appear in a user interface, exclude them from the documentation… unless their omission could cause confusion" (**Save ...** → _click **Save**_).
- Text: "Don't use ellipses in your written documentation." Acceptable "in quoted text (to replace a portion of the quoted text) except when they appear at the beginning or end of the text." When the omission contains a sentence boundary, "use four dots instead of three" (the fourth is a period).
- Form: "use three periods in a row" (not the ellipsis character); "Insert one space before and after the ellipsis unless a punctuation mark immediately follows the ellipsis; in this case, don't insert a space after."

Examples:

- Not recommended: The answer is ... wait for it ... that you shouldn't do this.
- Recommended: … Python code in there ... we'll explain it all in class. / Also recommended: … in there ...; we'll explain … / Not recommended: … in there...we'll explain …
- Recommended (mid-quote, sentence boundary): "All the world's a stage, .... And one man in his time plays many parts."

---

## Hyphens — https://developers.google.com/style/hyphens

- "Use a hyphen (-) when needed for clarity" — to avoid misreading or to combine terms read as a unit. Hyphenation depends on location (before a noun vs after a verb), readability, and convention. Check, in order: the doc set's convention, the word list, Merriam-Webster.
- Prefixes: "In general, don't use a hyphen between a prefix and the main noun" (_infrastructure, megabyte, metadata, preprocessing, pseudocode, semiconductor_). Hyphenate when: the prefix is _self_ or _cross_ (_self-managing, cross-region_); the noun is capitalized or a number (_non-Google, post-2000_); to avoid confusion (_de-energize, intra-index, re-mark, re-sign_); the base term already has hyphens or spaces (_un-Google-like, non-twentieth-century_); for consistency within a document (_pre-processing, post-processing_).
- _non_: same rules but "often hyphenated" because it forms hard-to-parse words; both _noncurrent, nonempty, noninteractive, nonpublic_ and _non-existence, non-integer, non-key, non-managed, non-negative_ are recommended; "add a hyphen before hyphenated compound words" (_non-KSA-based_).
- Compound nouns: "write compound nouns in their closed (one-word, unhyphenated) form" (_webpage, hostname, tradeoff, workaround_); word list exceptions such as _multi-region_, _style sheet_.
- Multiplied units: hyphenate (_5 vCPU-hours, 40 person-hours_).
- Compound modifiers before a noun: "If needed for clarity, hyphenate… it's almost never wrong to hyphenate a compound before a noun to ensure clarity" (_a well-designed app, Android-specific techniques_). Hyphen after _more_/_most_ if needed (_more-reliable internet links_). "Avoid writing compound modifiers that have more than two words. Instead, move some words after the noun."
- Number + spelled-out unit modifying a noun: hyphenate (_a 64-bit system, 100,000-byte files, a five-minute wait_). Abbreviated unit: "Don't hyphenate… Instead, use a nonbreaking space" (_200 GB disk, 50 Mbps connection_).
- "Don't hyphenate adverbs that end in _-ly_ except when needed for clarity" (_publicly available implementations_).
- Don't hyphenate conventionally unhyphenated compounds (_a managed instance group, a machine learning model_).
- After a verb: "In general, you don't need to add a hyphen to a compound that follows a verb" (_The app is well designed. The logs are written in real time. … as is._). Exceptions always hyphenated: _on-premises, add-on, cloud-based, customer-facing, user-friendly, game-like_.
- Ranges: "Use a hyphen, not an en dash (`&ndash;`), to indicate a range of numbers." If ambiguous use _from/to/through_; "Don't mix hyphens with words."
- Spacing: "Never place a space on either side of a hyphen except when using a suspended hyphen, in which case you can leave a space after (but not before) the hyphen."
- Suspended hyphens: _one- or two-hour intervals_; _one-, two-, or three-hour intervals_.

Examples:

- Recommended: Publicly available implementations / Not recommended: Publicly-available implementations
- Recommended: test cases that are specific to the 2023 edition; cross-data-center replication / Not recommended: edition-2023-specific test cases
- Recommended: 8-20 files; from 8 to 20 files / Not recommended: from 8-20 files
- Recommended: `200&nbsp;GB disk` (not hyphenated) vs a 64-bit system (hyphenated, spelled-out unit)

---

## Parentheses — https://developers.google.com/style/parentheses

- "Some readers ignore anything that appears in parentheses, so don't put important information in parentheses if you can help it."
- Consider whether they're necessary; often commas, dashes, semicolons, or periods work as well.
- "If you need to include parentheses in the middle of a sentence, keep the parenthetical thought short. Otherwise, consider using two sentences."
- "If a full standalone sentence appears inside parentheses, the period also goes inside the parentheses, not outside."
- "Don't use parentheses to indicate optional plurals."

Examples:

- Recommended: Enter a name for the instance—for example, `my-instance-99`. / Not recommended: Enter a name for the instance (for example, `my-instance-99`).
- Recommended: Enter a six-digit hex number (for example, `228B22`), and then click **OK**. / Not recommended: Enter a six-digit hex number (for example, if you want the color forest green, enter `228B22`), and then click **OK**.

---

## Periods and other end punctuation — https://developers.google.com/style/periods

- "End a complete sentence with a period, unless it's a question. There are exceptions for working in lists."
- Lists: whether items end with a period depends on list type — see Lists page.
- URLs: avoid a period right after a URL/file path: avoid URLs in text; rewrite so the URL isn't terminal; or put the URL on its own line with no final period. "When you do put a period after a URL, don't leave any space between the last character of the URL and the period."
- Quotation marks: "place the period inside the quotation marks even if the period isn't part of the material" — exception for keywords/literal strings in quotes. If the quoted material ends in ? or !, don't add a period.
- Parentheses: "If the last part of a sentence is contained inside parentheses, put the period after the closing parenthesis. If the parentheses contain a complete sentence, put the period inside."
- "Don't end headings with periods."
- "Use a period to represent a decimal point."
- "Put a period after a shortened word. Don't put periods after the letters of an acronym or initialism."
- "Leave only one space between sentences."
- Exclamation points: "In general, avoid exclamation points." Concept/reference docs: never. Procedural: avoid ("The VM is created."). Blog posts: acceptable, sparingly. OK in code (`!=`), system literals, and sparingly in tutorials for milestones. Translation note: can read as shouting in Japanese/Korean.

Examples:

- Recommended: … Privacy Policy: (URL on its own line, no period) / Not recommended: … Privacy Policy at http://www.examplepetstore.com/privacy/.
- Recommended: … you might say "Fixed typo." ; Children always ask "Why?"
- Recommended: … has changed (even if that change occurs while your application isn't running). ; … easy to scale. (With App Engine, there are no servers for you to maintain.)

---

## Quotation marks — https://developers.google.com/style/quotation-marks

- "Use straight double quotation marks and apostrophes." Never curly: code requires straight marks, auto-conversion and humans make mistakes, and straight marks are easier to proofread.
- "In technical writing, we don't use quotation marks much, aside from instances of code." Use them for titles of shorter works (articles, web-series episodes) unless linked; full-length works get italics. Table of other uses: a section of a larger document you can't link to; the title of a parent document when already linking to a section; directly citing a person / slogan / motto; a term used metaphorically "only if it's not an established usage in the domain."
- "Commas and periods go inside quotation marks."
- Exception: "When you put a keyword or other literal string in quotation marks, put any other punctuation outside the quotation marks." But "in general, don't put quotation marks around an item that's in code font, unless the quotation marks are part of the item."
- Single quotation marks only: in code examples (languages that use them) and for a quotation nested inside a quotation (outer double, inner single).

Examples:

- Recommended: See the section titled "Care and feeding of the emu." / Not recommended: See the section titled "Care and feeding of the emu".
- Recommended: If you enter `escape`, the program crashes. / Acceptable: If you enter "escape", the program crashes. / Not recommended: If you enter "escape," the program crashes.
- Recommended: The section's title is "Care and feeding of the emu." / Not recommended: The section’s title is “Care and feeding of the emu.” (curly)
- Recommended: She said, "I heard him shout 'Help,' and saw him floundering in the water." / Not recommended: She said, 'I heard him shout "Help", and saw him floundering in the water'.

---

## Semicolons — https://developers.google.com/style/semicolons

- "If possible, avoid using semicolons." Preferred in a few cases:
  - "joining two closely related independent clauses where a period or a comma is not as effective."
  - "preceding a conjunctive adverb (like _therefore_) or a phrase (like _that is_) that joins two independent clauses."
  - "separating a series of long or complex items that contain their own punctuation."

Examples:

- Recommended: You can easily test compatibility by computing the centroid; if it is on the opposite side of the planet, reverse the order of your vertices.
- Recommended: This setup places the head-tracked node below the Main Camera; therefore, only the stereo cameras are affected by the user's head motion.
- Recommended: Review your document one more time, checking for the following: present tense and active voice; typos, punctuation, and grammar; and whether you can shorten anything.

---

## Slashes — https://developers.google.com/style/slashes

- "Avoid using slashes, except in code."
- Dates: "Don't use date formats that rely on slashes."
- Alternatives: "Don't use slashes to separate alternatives" — use _or_/_and_.
- _and/or_: "Often, _and_ implies _or_, so you don't need to write both words… avoid writing _and/or_ except when space is limited, such as in tables." Alternative phrasing: "raw events, processed events, or both."
- File paths and URLs: "Use forward slashes, as appropriate"; Windows paths use backslashes. Long URLs: "add a line break immediately after a slash. Don't ever insert an extraneous hyphen into a URL to break it."
- Fractions: "Don't use slashes with fractions because they can be ambiguous" (3/4 = three-quarters or "4 is an alternative to 3") — use ¾, 0.75, or 75%.
- Abbreviations: "Don't use abbreviations that rely on slashes" — _care of_, _with_, not _c/o_, _w/_.

Examples:

- Recommended: … developed and is hosted by … / Not recommended: … developed/hosted by …
- Recommended: Call this method five or six times. / Not recommended: Call this method 5/6 times.
- Recommended: You can view and edit your own data. / Not recommended: You can view and/or edit your own data.
- Recommended: ¾, 0.75, 75% / Not recommended: 3/4

---

## Numbers — https://developers.google.com/style/numbers

- Ordinals: "Spell out all ordinal numbers in text" (_first, fifth, twelfth, forty-third_; not _1st, 5th, 12th, 43rd_).
- Spell out: "Numbers from zero through nine, except as noted in Numbers as numerals" (_two-day total, four options, five minutes, nine developers_); "A number that starts a sentence" (_Fifteen directories are created._ — better to rearrange; "It's okay, but non-optimal, to begin a sentence with a four-digit year"); "A number that is followed by a numeral" (_fifteen 100,000-byte files_ but _15 of the 100,000-byte files_); "Indefinite and casual numbers" (_thousands of combinations_, _a million songs_).
- Numerals: "Numbers 10 and greater" (_24 hours, 18 years old, 18,000,000 users_). "Always use numerals for the following items, even if they're less than 10": version numbers (_version 3_); technical quantities — memory, disk, queries, usage limits (_6 queries per second, 50 Mbps, 128 bits_); page/chapter/section numbers; step numbers (avoid referring to them); prices; numbers without units (math expressions); "Numbers less than 10 when they appear in the same sentence with numbers greater than 9" (_15 options but 6 of them are deselected_); negative numbers; most fractions; percentages; dimensions; numbers with decimal points ("Treat decimal numbers as plural even when less than or equal to 1.0" — _1.0 inches_; "place a zero in front of the decimal point" — _0.3 inches_); measurements (_8 pixels_); numbers in a range.
- Nonbreaking space between number and noun if they must stay on one line.
- Roman numerals: avoid; OK for sub-steps in numbered procedures.
- Fractions: "Express fractions as decimal numbers, when possible." As words: hyphenate numerator–denominator unless one is already hyphenated (_one and one-half, two-fifths, five sixty-fourths_).
- Percentages: "use numerals and the percent sign (%), without a space between them" (_40%_). Sentence start: "spell out both the number and the word _percent_" (_Forty percent of the files_).
- Ranges: "Use a hyphen with no space on either side of it. Do not use an en dash" (_2012-2016_).
- Suspended hyphens: _one-, two-, or three-hour intervals_.
- Currency (US dollars): comma for thousands, period for decimal, "$" at the beginning, "Do not use any punctuation or spaces to the right of the decimal" (_$0.006653 per vCPU hour_, _$10,000_; not _$0.006,653_, _$10 000_).
- Commas/decimal points: "standard American number-formatting" — "in numbers four or more digits long, use commas to set off groups of three digits, counting leftward from the decimal point"; "our style is to use a comma for a four-digit number"; no digit-group separators right of the decimal point; period for decimal point. (SI thin space not used.)
- Dimensions: "Use a lowercase _x_ between the numerals in the dimensions, with no space" (_192x192_, not _192 x 192_).
- Exponents: "Don't put a space between the base and the exponent" (2³ via `<sup>`).
- "Accompany numerical concepts with real-world practical implications" (e.g. link to pricing calculator).

Examples:

- Recommended: In general, avoid sending files larger than 164 MB as attachments. / Not recommended: 164 MB is generally considered too large a file to send as an attachment.
- Recommended: The limit is 1,532,784 bytes per day. ; The API supports up to 2,000 vertices. / Not recommended: 1532784 bytes ; 2000 vertices
- Recommended: $0.031611/vCPU hour / Not recommended: $0.031 611/vCPU hour
- Recommended: 192x192 / Not recommended: 192 x 192

---

## Dates and times — https://developers.google.com/style/dates-times

Times:

- "Use the 12-hour clock, except if required to use a 24-hour time, such as when documenting features that use 24-hour time. If the UI, a command, or a code sample uses the 24-hour format, use that format throughout the page."
- "Use exact times when possible, but _noon_ and _midnight_ are OK."
- "Use hyphens in time ranges. Don't add spaces before or after the hyphens" (_5-10 minutes ago_).
- "Capitalize AM and PM, and leave one space between it and the time" (_3:45 PM_).
- "Remove the minutes from round hours" (_3 PM_).
  Time zones:
- "Avoid using time zones unless absolutely necessary."
- Say when a time is local: _10 AM your local time_. Use the UI's timestamp format if available.
- "If using a specific time zone, spell out the region and include the UTC or GMT label as a parenthetical": _US and Canadian Pacific Standard Time (UTC-8)_; _US and Canadian Pacific Daylight Time (UTC-7)_. "Don't abbreviate the name of the time zone."
- If an event time doesn't shift for DST, "use the specific time zone, without reference to UTC."
  Dates:
- "Spell out the names of months and days of the week in full. Give the full four-digit year" (_January 19, 2017_).
- Day of week first: `DAY_OF_WEEK`, `MONTH` `DAY`, `YEAR` (_Tuesday, April 27, 2021_).
- Month + year only: "don't use a comma" (_January 2017_).
- Abbreviation only when conserving space (heading, table): three-letter month and weekday, "Capitalize the first letter and do not add a period"; abbreviate the whole date, not a mix (_Mon, Sep 3, 2018_, not _Mon, September 3, 2018_); be consistent across the doc.
- Mid-sentence `MONTH DAY, YEAR` date: "add a comma after the year" (_The January 19, 2017, release of …_); month-year only: no comma (_The January 2017 release of …_).
- "Don't express months as numbers unless you don't have the option" — 04/05/09 means different dates in UK/US/elsewhere. "Expressing dates in numbers only (using slashes, periods, or hyphens as separators) can be confusing."
- Numeric-only: "use the format `YYYY-MM-DD`, and separate the elements by using hyphens. This conforms to ISO 8601." In fictional examples "choose a calendar day greater than 12."
- Date + time: "mention the date first and then the time" (_2017-04-15 at 3 PM_; _May 4, 2009, at 6 PM_).
- Seasons: "Avoid referring to seasons… use the month, quarter, or temperature."

Examples:

- Recommended: February 12, 2017 ; Sunday, February 12, 2017 / Not recommended: 02.12.2017 ; 12/02/2017
- Recommended: 2017-04-15 / Not recommended: 04/06/2017
- Recommended: Mon, Sep 3, 2018 / Not recommended: Mon, September 3, 2018
- Recommended: Changes are released in October of each year. / Not recommended: Changes are released in the Fall of each year.

---

## Units of measurement — https://developers.google.com/style/units-of-measure

- "Put a nonbreaking space (`&nbsp;`) between the number and the unit" — "in both HTML and Markdown" (`64&nbsp;GB`, `25&nbsp;mm`; not `64 GB` with a breaking space, not _64GB_).
- No space for money, percent, degrees of angle: _$10_, _£25_, _65%_, _180°_.
- Temperature: nonbreaking space before the degree symbol, none between symbol and scale: `50&nbsp;&deg;C` (50 °C). Kelvin: no degree symbol, nonbreaking space before K: `300&nbsp;K`.
- Number + unit modifying a noun: "don't hyphenate unless the hyphen is needed for clarity" (`200&nbsp;GB disk`); but spelled-out: _a 128-bit system_.
- Ranges with units: "repeat the unit for each number" (symbols and abbreviations, not nouns like _file_); "Use the word _to_ between the numbers, rather than a hyphen. A hyphen can be misinterpreted as a subtraction sign" (_-40 °C to 85 °C_, not _-40-85 °C_).
- Multiplied units: hyphenate (_5 vCPU-hours_, _40 person-hours_).
- _k_ for thousands: no space between number and _k_; add a noun so it isn't read as kilobytes (_55k download operations_).
- Currency: make the currency unambiguous; use an indicator if needed (_US$10_).
- Rates: "Use _per_ instead of the division slash (/) when space permits" (_requests per day_, not _requests/day_). Shorten _per_ to _p_ only in established rate abbreviations (_Gbps_, _MBps_; not _Gb/s_).
- Bytes: "Use the same system to measure bytes as the technology that you're documenting. Don't use _MB_ if you mean _MiB_." Decimal: kB (1000), MB (1000²), GB (1000³); binary: KiB (1024), MiB (1024²), GiB (1024³).

Examples:

- Recommended: `64&nbsp;GB` / Not recommended: `64 GB`, 64GB
- Recommended: -40 °C to 85 °C / Not recommended: -40-85 °C
- Recommended: requests per day ; Gbps / Not recommended: requests/day ; Gb/s

---

## Mathematical notation — https://developers.google.com/style/mathematical-notation

- "Use HTML entities for mathematical symbols instead of keyboard symbols" — except `+`, `=`, `/` (keyboard is fine). Entities: `&minus;` (−, not a hyphen), `&times;` (×; dot `&#8729;` or asterisk `&#42;` allowed to match UI, but "Don't use an asterisk (*) to indicate multiplication in text"; juxtaposition _ab_ is OK if unambiguous), `&ne;`, `&plusmn;`, `&mnplus;`, `&lt;`, `&gt;`, `&asymp;`, `&nap;`, `&cong;`, `&le;`, `&ge;`, `&equiv;`, `&nequiv;`, `&radic;`, `&sum;`.
- Operators: "Include a non-breaking space (`&nbsp;`) on both sides of operators"; "Don't italicize operators."
- "Italicize variables" (_x_ ≠ _y_).
- "Include short expressions and equations inline"; nonbreaking spaces between components; move to its own line if the break is awkward.
- Fractions: decimals when possible; as words, hyphenate unless one part already hyphenated (_three-sevenths_, _three seventy-fourths_).
- Exponents/subscripts: "Don't put a space between the base and the exponent"; use `<sup>`/`<sub>`; "Don't use the keyboard caret symbol (`^`)" (2<sup>3</sup>, not 2^3).
- Notation vs words: notation is fine in running text unless it is ambiguous, ungrammatical, or hard to read.
- Complex/multiline equations: consider diagrams, images, or a dedicated math rendering tool.

Examples:

- Recommended: _a_ − _b_ (`<i>a</i>&nbsp;&minus;&nbsp;<i>b</i>`)
- Recommended: 2<sup>3</sup> / Not recommended: 2^3
- Recommended: Check whether _a_ > _b_. / Not recommended: Check whether _a_ is greater than _b_.
- Recommended: The area is calculated by multiplying the length by the width. / Not recommended: … by multiplying _l_ × _w_.

---

## Format phone numbers in text — https://developers.google.com/style/phone-numbers

- Examples: "use a US number in the range 800‑555‑0100 through 800‑555‑0199" (reserved for examples/fiction). "Never use a real phone number in examples."
- Keep on one line: "use a nonbreaking hyphen (`&#8209;`)" in HTML or Markdown (`415&#8209;555&#8209;0132`).
- NANP numbers: "use a nonbreaking hyphen to separate the area code, three-digit exchange code, and four-digit number" (_415‑555‑0132_).
- International: "include the country and area codes. Insert a plus sign immediately before the country code (no space)" (_+1‑415‑555‑0132_).
- Extensions: "follow the phone number with the word _extension_, and then specify the extension number" (_415‑555‑0132, extension 987_).

---

## Use italics to discuss terms — https://developers.google.com/style/italics-terms

- New terms: "When you introduce a new term that you're defining immediately, use italics on the first mention of the term. Don't use bold or quotation marks."
- Words as words: "When you refer to a word, phrase, or letter in reference to the word, phrase, or letter itself … use italics. Don't use bold or quotation marks."

Examples:

- Recommended: A _Clos network_ is a kind of multistage circuit switching network.
- Recommended: Don't use _&_ (ampersand) as a conjunction. Use the word _and_ instead.
- Recommended: To form a possessive of a singular noun, add _'s_ to the end of the word.

---

## Top 15 rules from this slice

Ranked by how often they bite an engineer writing README / wiki / dev-docs prose.

1. **Serial comma, always.** "In a series of three or more items, use a comma before the final _and_ or _or_." (_zones, regions, and multi-regions_)
2. **Sentence case everywhere — headings, titles, table headers, list items, captions — and no period at the end of a heading.** Capitalize only the first word, the first word after a colon in a heading, and proper nouns.
3. **Spell out zero through nine; numerals for 10 and up** — but always numerals for version numbers, technical quantities (memory, disk, QPS, limits), prices, percentages, dimensions, decimals, negatives, ranges, and any number <10 sharing a sentence with a number >9. Spell out a number that starts a sentence (or rewrite). Spell out ordinals (_first_, not _1st_).
4. **Em dash with no spaces on either side; never use an en dash at all** ("Don't use. Instead, use a hyphen or the word _to_"), and never a hyphen or `--` in place of an em dash. Don't use a spaced dash to separate an item from its description — use a colon.
5. **Numeric dates are `YYYY-MM-DD` (ISO 8601); prose dates are _January 19, 2017_** (full month name, four-digit year; comma after the year mid-sentence; no comma for _January 2017_). Never slashes or `MM/DD/YY`. In examples pick a day > 12.
6. **Nonbreaking space between a number and its unit (`64&nbsp;GB`, `50 °C`, `300 K`) — no space before `%`, `°` (angle), or after `$`.** Don't pluralize unit abbreviations (_64 GB_, not _64 GBs_); don't hyphenate number + abbreviated unit (_200 GB disk_), do hyphenate number + spelled-out unit (_64-bit system_, _five-minute wait_).
7. **Ranges: hyphen with no spaces for bare numbers (_2012-2016_, _5-10 minutes_); the word _to_ with the unit repeated when units are involved (_-40 °C to 85 °C_); never _from 8-20_ (don't mix hyphens with words).** A hyphen can be misread as minus.
8. **Spell out an abbreviation on first use — _Border Gateway Protocol (BGP)_, both italic — then use the abbreviation alone; don't capitalize the long form just because the acronym is capitalized (_data manipulation language (DML)_).** Don't bother for AI, API, HTML, PDF, URL, REST, RAM, MB/GiB, etc. Don't use abbreviations as verbs (_use SSH_, not _ssh into_). _a_/_an_ by pronunciation (_a SQL_, _an SAP_).
9. **No _e.g._ / _i.e._ — write _for example_ / _that is_.** Avoid _etc._ in most lists; no _10x_ (write _10 times_), no _approx._, no internet slang (_tl;dr_, _RTFM_).
10. **Hyphenate compound modifiers before a noun (_well-designed app_, _Android-specific_), not after a verb (_the app is well designed_); never hyphenate _-ly_ adverbs (_publicly available_); prefixes close up (_metadata_, _preprocessing_) except _self-_, _cross-_, before capitals/numbers (_non-Google_, _post-2000_), or to avoid misreading (_re-sign_).** Compound nouns closed: _webpage_, _hostname_, _tradeoff_, _workaround_. Keep modifiers to two words.
11. **Straight quotation marks only; commas and periods go inside the closing quote — except around a literal string/keyword, where punctuation goes outside (_If you enter "escape", …_) — and prefer code font over quotes for literals.** Use quotes for titles of short works and direct quotes; italics for new terms and words-as-words ("Use the word _and_ instead"), not bold or quotes.
12. **Commas: after introductory phrases; before a coordinating conjunction joining two independent clauses (unless both are very short); before nonrestrictive _which_; semicolon/period/dash before and comma after a conjunctive adverb (_; otherwise, …_); no comma before _because_ unless the clause is nonrestrictive.**
13. **Avoid slashes outside code and paths: no _and/or_, no _developed/hosted_, no _c/o_, no _3/4_ (use 0.75 or 75%), no slash dates; _requests per day_ not _requests/day_ (except established _Gbps_, _MBps_).**
14. **Keep articles (_a_, _an_, _the_) even in headings (_Create a VM instance_); no plurals in parentheses (_key(s)_ → pick one, or _one or more_); plural abbreviations without apostrophes (_APIs_, _OSes_); possessives — _class's_, _models'_, but never of a product name or a code item (_the `wordCount` method's return value_, not _`wordCount`'s_); class names stay singular (_`Intent` objects_).**
15. **Numbers formatting: commas in four-digit-and-up numbers (_2,000_, _1,532,784_), period for decimals, leading zero (_0.3_), no separators right of the decimal; _40%_ with no space; _192x192_ dimensions with lowercase x and no spaces; times on the 12-hour clock with capital AM/PM and a space (_3 PM_, _3:45 PM_), minutes dropped on round hours; time zones spelled out with a UTC offset (_Pacific Standard Time (UTC-8)_) and avoided when possible; one space between sentences; avoid exclamation points, ellipses, parentheses for important information, and semicolons except to join closely related clauses or punctuate complex list items.**
