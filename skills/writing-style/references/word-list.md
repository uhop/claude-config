# Google style digest — word list

Source: <https://developers.google.com/style/word-list>, fetched 2026-08-19 with `curl -sL` (raw HTML, ~330 KB, not JS-rendered) and parsed with `/usr/bin/python3` `html.parser` over the `<dt>`/`<dd>` pairs inside `<section id="word-list">`.

Entry count: **598** (`<dt>` tags in the section: 598 — exact match). `<dd>` tags in the section: 1043 = 1037 non-empty guidance paragraphs parsed + 6 empty/malformed `<dd>` (unclosed tags in the source HTML, handled by implicit close). Spot checks against the raw HTML: A = 54 entries (`a and an` … `-aware`), M = 36 (`male adapter` … `must`), Z = 1 (`zippy`); there is no X section on the page.

Flag legend (the page's own icons, rendered here as prefixes in the term column): `[avoid]` = "Use with caution" (avoid when possible; OK if needed, define it); `[don't use]` = "Don't use" in all cases (ambiguous or non-inclusive); `[Android]` / `[Cloud]` / `[Workspace]` = applies only to that documentation set.

Eight entries are headword-only on the page (no guidance paragraph; the headword itself states the rule, e.g. `setup (noun or adjective), set up (verb)`); they are marked `(headword is the rule)`.

Formatting: `_italic_` = the page's italics (usually the term under discussion); `**Recommended**` / `**Not recommended**` = the page's example labels; an entry's guidance paragraphs are joined on one line. Cross-reference links were flattened to their text ("see X").

## 1. All entries (one line per entry; grep the bold headword)

### Numbers and Symbols

- **+**: OK to use _+_ with numbers in text, such as _customer records with 300+ demographic attributes_, except in formal contexts.
- **& (ampersand)** [avoid]: Don't use _&_ instead of _and_ in headings, text, navigation, or tables of contents. It's OK to use _&_ when referencing UI elements that use _&_, or in table headings and diagram labels where space constraints require abbreviation. It's OK to use `&` for technical purposes in code.
- **2-Step Verification**: When referring to Google's 2-Step Verification, use initial caps. When referring to generic 2-step verification, use lowercase.

### A

- **a and an**: Use _a_ when the next word starts with a consonant _sound_, regardless of what letter it starts with. For more information, see Articles (a, an, the).
- **A/B testing**: Capitalize and use slash notation for _A/B_.
- **abnormal** [avoid]: Don't use to refer to a person. OK to use to refer to a condition of a computer system.
- **abort** [avoid]: Avoid in general usage. Instead, use words like _stop_, _exit_, _cancel_, or _end_. In Linux, _abort_ refers to a type of signal that terminates an abnormal process.
- **about versus on**: When a cross-reference includes information that describes what the cross-reference links to, use _about_ instead of _on_. **Recommended**: For more information about indexes, see Managing indexes. **Not recommended**: For more information on indexes, see Managing indexes.
- **above** [avoid]: Don't use for a range of version numbers. Instead, use _later_. Don't use to refer to a position in a document. Instead, use _earlier_ or _preceding_. Don't use to refer to a position in the UI. Instead, write instructions that avoid directional language. For more information, see Writing accessible documentation. It's OK to use _above_ in a non-directional way, such as when describing a hierarchy.
- **access (verb)** [avoid]: Avoid when you can. Instead, use friendlier words like _see_, _edit_, _find_, _use_, or _view_.
- **access token**: Lowercase except at the beginning of a sentence, heading, or list item.
- **account name** [don't use]: Don't use. Instead, use _username_.
- **actionable** [avoid]: Avoid unless it's the clearest and simplest phrasing for your audience. Instead, leave it out or replace it with a phrase like _that you can act on_ or _useful_. Don't use _actionable_ in the legal sense without consulting a lawyer.
- **action bar** [don't use] [Android]: In Android documentation, don't use. Instead, use _app bar_.
- **ad tech**: Write out on first mention: _advertising technology (ad tech)_. Don't use _adtech_ or _ad-tech_.
- **address bar**: Use to refer to the URL bar or the combined URL bar and search box in a browser. Don't use _omnibox_.
- **ad hoc**: OK to use in database and analytics contexts to mean "free-form" or "user-written" (for example, _ad hoc queries_ or _an ad hoc chart_). For other contexts, try to find a more specific English equivalent. Don't hyphenate or italicize the term.
- **admin** [don't use]: Write out _administrator_ unless it's the name of a UI label or other element. It's OK to use _admin_ in Android documentation.
- **administrator** [don't use] [Android]: In Android documentation, don't use. Instead, use _admin_.
- **advertised route priority**: OK to also use _base advertised route priority_ when discussing region-to-region costs. Don't shorten or use variations of these terms.
- **agnostic** [don't use]: Don't use. Instead, use a more precise term like _platform-independent_.
- **AI**: In general, you can use _AI_ without spelling out _artificial intelligence_. Most readers are familiar with the abbreviation _AI_. If you think your audience isn't familiar with the term, spell it out on first use.
- **aka** [don't use]: Don't use. Instead, write out _also known as_, or present an alternative term using parentheses or the word _or_. You can also write out a definition. **Recommended**: Geographic data, also known as geospatial data, is ... **Recommended**: Geographic data (geospatial data) is ... **Recommended**: Geographic data, or geospatial data, is ...
- **all apps screen** [Android]: In Android documentation: Lowercase except at the beginning of a sentence, heading, or list item.
- **allowlist (verb), allowlisted, allowlisting** [don't use]: Don't use as a verb. Instead, rewrite to improve clarity. OK to use _allowlist_ as a noun. For more information, see blacklist.
- **allows you to** [don't use]: Don't use. Instead, use _lets you_. For more information, see enable.
- **alpha**: Lowercase except when part of a product name. **Recommended**: PRODUCT_NAME Alpha **Recommended**: PRODUCT_NAME is in alpha.
- **America, American** [avoid]: Use only to refer to the _Americas_ or the _American continent_. Don't use to refer to the United States. Instead, use a more precise term like _the US_ or _the United States_, and _people in the US_. For more information, see US.
- **among**: See between versus among.
- **AM, PM**: To be consistent with Material Design, use all caps, no periods, and a space before. **Recommended**: 9:00 AM **Recommended**: 10:30 PM
- **and/or** [avoid]: Don't use unless space is limited, such as in a table. For more information, see Slashes.
- **Android** [Android]: When referring to the operating system, capitalize _Android_.
- **Android-powered device** [Android]: Not _Android device_.
- **and so on** [avoid]: Avoid using _and so on_ whenever possible. For more information, see etc.
- **anti***: See guidance about hyphens with prefixes.
- **anti-pattern** [avoid]: Avoid using _anti-pattern_, particularly as a standalone heading. Instead, consider using a more specific and broadly understood term. **Recommended**: Avoid these five SQL errors. **Recommended**: Avoid these five programming practices that make SQL queries inefficient. **Not recommended**: Avoid these five SQL anti-patterns.
- **API**: Use _API_ to refer to either a web API or a language-specific API. Don't use _API_ when referring to a method or a class. For example, don't write _This resource has one API_ to mean "This resource has one method."
- **API Console, APIs console, developer console, dev console, or Google API Console** [don't use]: Don't use. Instead, refer to the _Google APIs Explorer_ or to the _Google Cloud console_. For more information, see console.
- **API Console key**: In most contexts, use _API key_ instead of _API Console key_. In Apps admin APIs, it's OK to use _API Console key_ to distinguish from other API keys.
- **API key**: Not _developer key_ or _dev key_.
- **APIs Explorer**: Not _API explorer_ or other variants.
- **app**: In general, use _app_ instead of _application_ when referring to programs for end users, especially in the context of mobile or web software. In some contexts, such as enterprise software, it's OK to use _application_ to convey a sense of greater complexity. Use _application_ in standard phrases such as _application programming interface_.
- **app bar** [Android]: In Android contexts, formerly _action bar_.
- **appendix**: Use the plural _appendixes_, not _appendices_.
- **application**: See app.
- **as**: If you mean _because_, then use _because_ instead of _as_. _As_ is ambiguous; it can refer to the passage of time. _Because_ refers to causation or the reason for something.
- **as of this writing** [avoid]: Avoid because this phrase is implied. The phrase can also prematurely disclose product or feature strategy or inappropriately imply that a product or feature might change. See also currently and presently. **Recommended**: BigQuery doesn't support that function. **Not recommended**: As of this writing, BigQuery doesn't support that function. For more information, see Timeless documentation.
- **authentication and authorization**: In general, use the word _authenticated_ only to refer to users, and use _authorized_ only to refer to requests that are sent by a client app on behalf of an authenticated user. A user _authenticates_ their identity by entering their password (or giving some other proof of identity). The _authenticated user_ then _authorizes_ the client app to send an _authorized request_ to the server on the user's behalf. When you want to use a preposition with _authenticate_, use _against_.
- **authN, authZ** [don't use]: Don't use. Instead, use _authentication_ or _authorization_.
- **auto***: See guidance about hyphens with prefixes.
- **autohealing**: Not _auto-healing_.
- **auto mode VPC network**: Not _auto mode network_.
- **autopopulate**: Not _auto populate_ or _auto-populate_.
- **autoscaling**: Not _auto-scaling_.
- **autotagging**: Not _auto-tagging_.
- **autoupdate** [don't use]: Don't use. Instead, use _automatically update_.
- **-aware** [avoid]: Avoid using as a compound modifier, as in _healthcare-aware_. OK to use when it's part of a product name, such as _Identity-Aware Proxy_.

### B

- **backend**: Not _back-end_ or _back end_.
- **bar** [avoid]: Avoid when possible. For more information, see foo.
- **bare metal**: Lowercase except at the beginning of a sentence, heading, or list item. Hyphenate when used as a compound modifier, such as _bare-metal server_.
- **base64**: Lowercase except at the beginning of a sentence, heading, or list item. Otherwise, capitalize _Base64_ only if it's part of a formal name. Write _base64_ in code font _only_ if it's a string literal or otherwise quoted from code.
- **baz** [avoid]: Avoid when possible. For more information, see foo.
- **below** [avoid]: Don't use for a range of version numbers. Instead, use _earlier_. Don't use to refer to a position in a document. Instead, use _later_ or _following_. Don't use to refer to a position in the UI. Instead, write instructions that avoid directional language. For more information, see Writing accessible documentation. It's OK to use _below_ in set phrases such as _below (the) average_, _below the mean_, _below zero_. It's OK to use _below_ in a non-directional way, such as when describing a hierarchy.
- **best effort** [avoid]: Avoid where possible. Instead, use more specific wording. After providing a description, you can add a phrase like "sometimes referred to as _best effort_."
- **beta**: Lowercase except when part of a product name. **Recommended**: PRODUCT_NAME Beta **Recommended**: PRODUCT_NAME is currently in beta.
- **between versus among**: It's fine to use _between_ when talking about more than two things; however, _between_ isn't interchangeable with _among_. Use _between_ when you're talking about two or more distinct things: **Recommended**: JavaScript introduces dependencies between the DOM, the CSSOM, and JavaScript execution. Use _among_ when you're talking about things that are part of a group or things that aren't distinct: **Recommended**: ... a conventional SQL database that can be shared among multiple apps. More examples: **Recommended**: Because screen dimensions vary widely among devices (for example, between phones and tablets, and even among different phones), you should configure the viewport so that your pages render correctly on many different devices. **Not recommended**: Because screen dimensions vary widely between devices (for example, between phones and tablets, and even between different phones), you should configure the viewport so that your pages render correctly on many different devices. **Recommended**: You can share services among multiple clients. **Not recommended**: You can share services between multiple clients. See also Grammar Girl's discussion of _between_ and _among_.
- **big-endian**: Hyphenate. Lowercase except at the beginning of a sentence, heading, or list item. **Recommended**: The codebase assumes big-endian byte ordering. **Not recommended**: The codebase assumes Big Endian byte ordering. **Not recommended**: The codebase assumes Big-endian byte ordering. **Not recommended**: The codebase assumes big endian byte ordering.
- **billing charges** [avoid]: Don't use _billing charges_ to mean charges that appear on a bill. Instead, use _billed charges_. Use _billing charges_ to describe the cost of creating the bill.
- **black-box** [avoid]: Avoid using _black-box_, _blackbox_, or _black box_ to describe monitoring and testing. Consider using a more precise term for clarity. • For monitoring, use _synthetic monitoring_. • For testing, use _opaque-box testing_.
- **Black Friday** [avoid]: Avoid unless explicitly referring to an event in the US. Instead use _peak scale event_.
- **blackhat, black hat, black-hat** [don't use]: Don't use. Instead, use precise terms for the kind of violation or practice, such as _illegal_, _unethical_, or _in violation of rules_.
- **blackhole (verb), blackholed (adjective)** [don't use]: Don't use. Instead, use a more descriptive term or phrase, such as _dropped without notification_.
- **blacklist, black list, black-list** [don't use]: Don't use _blacklist_, _whitelist_, and _graylist_. Instead, use more precise terms that are appropriate for your domain. • For the noun _blacklist_, consider using a replacement such as _denylist_, _excludelist_, or _blocklist_. • For the noun _whitelist_, consider using a replacement such as _allowlist_, _trustlist_, or _safelist_. • For the noun _graylist_ (_greylist_), consider using a replacement such as _provisional list_. In all of these cases, consider that there might not actually be a list involved. When replacing problematic terms, be sure to be technically accurate for the specific context. For the verb forms of these words, a simple word-for-word replacement typically isn't the best solution. Instead, replace verbs such as _blacklisted_ with phrases that accurately convey the relevant action. For example: **Recommended**: To deny requests from an IP address, add it to the `dos.yaml` file. **Not recommended**: To denylist an IP address, add it to the `dos.yaml` file. **Don't use**: To blacklist an IP address, add it to the `dos.yaml` file. If the command or code that you're documenting uses one of these words, then use the words only in direct reference to the code items (formatted as code), and make it clear what you're referring to. **Recommended**: Add a user to the allowlist (`whitelist`) by entering the following: `whitelist adduser EMAIL_ADDRESS`. **Not recommended**: Add a user to the whitelist by entering the following: `whitelist adduser EMAIL_ADDRESS`. For more information, see the inclusive documentation page.
- **blacklisted, black listed, black-listed** [don't use]: Don't use. See blacklist.
- **blacklisting, black listing, black-listing** [don't use]: Don't use. See blacklist.
- **blast radius** [don't use]: Don't use. Instead, use a more precise term like _affected area_ or _spatial impact_.
- **blind** [avoid]: Avoid using _blind to_ or _blind eye to_. Instead, use more precise terms like _ignore_, _unaware of_, _disregard_, _avoid_, or _reject_. Avoid using _blind writes_. Instead, use a more precise phrase, such as _a write operation without a read operation_. Avoid using _blind change_ or _change blindly_. Instead, use a more precise phrase such as _change without first confirming the value_. When referring to people, use terms like _person who is blind_, _screen reader user_ (if applicable), _person who is visually impaired_, _person who is low-vision_, _magnification user_ (if applicable).
- **blue-green**: Not _blue/green_ or _blue green_.
- **boolean**: In most contexts, _boolean_ refers to a specific data type in a specific programming language. In such cases, use code font and the exact spelling and capitalization of the programming keyword. When referring to the abstract data type, use lowercase. If you refer to _Boolean mathematics_ or _Boolean logic_, use uppercase.
- **branding information**: In the Google Cloud console, the phrase _branding information_ refers to the information that Google shows to users when the client asks them to authorize access: specifically, the project's name and logo, and the developer's Google Account. This information is set in the **Consent screen** page.
- **break-glass** [don't use]: Don't use. Instead, use a more precise term depending on context: • To describe a general emergency or procedure that grants emergency access, use _emergency access_. • To describe a fallback procedure, use _manual fallback_ or _preplanned procedure_.
- **brown bag, brown-bag** [don't use]: Don't use. Instead, use a more precise term like _learning session_, _lunch and learn_, _lunchtime learning session_, _casual training_, or _informal training_.
- **build cop, build sheriff** [don't use]: Don't use. Instead, use a more precise term like _build monitor_.
- **button**: In a UI, a link isn't the same as a button; don't use the term _button_ to refer to a link. Use _button_ to refer to mechanical buttons (like the volume control buttons on the side of a phone) and capacitive touch buttons on a phone (like the Home button). You _press_ mechanical buttons, and _tap_ capacitive and on-screen buttons.

### C

- **can**: Use _can_ in the following ways: • To convey permission or ability (for example, "You can access the server"). • To refer to an optional action (for example, "You can also view logs with the Log Viewer"). • To describe a possible outcome (for example, "The process can take 30 minutes"). See also could, may, might, must, should, and would. For information about clarifying who's performing an action, see Active voice.
- **canary** [avoid]: Don't use _canary_ as a verb, and don't use _canarying_. When possible, avoid jargon like _canary_ and _canary testing_. If you use one of these phrases, define it on first use or provide a link to the definition, and use it consistently throughout the document.
- **cell phone, cellphone** [don't use]: Don't use. Instead, use _mobile phone_, or if you're talking about more than phones, then use _mobile device_. It's OK to use _phone_ (without _mobile_) when the context is clear.
- **cellular data** [don't use]: Don't use. Instead, use _mobile data_.
- **cellular network** [don't use]: Don't use. Instead, use _mobile network_.
- **chapter**: When referring to documentation that isn't in the form of a book, don't use the term _chapter_. Instead, refer to documents, pages, or sections.
- **check** [avoid]: Don't use to refer to marking a checkbox. Instead, use _select_. **Recommended**: Select **Automatically check for updates**. **Not recommended**: Check **Automatically check for updates**.
- **checkbox**: Not _check box_.
- **choose**: _Choose_ is fine to use for generic contexts. For UI elements, use select.
- **chubby** [don't use]: Don't use. Instead, use a word that clearly explains what you mean, such as _unused_ or _overextended_.
- **clear**: Use (as a verb) to refer to clearing a check mark from a checkbox. **Recommended**: Clear **Automatically check for updates**. **Not recommended**: Uncheck **Automatically check for updates**. **Not recommended**: Deselect **Automatically check for updates**.
- **CLI** [avoid]: Don't use _CLI_ generically to refer to a command-line interface. Instead, refer to the specific command-line interface, such as the Google Cloud CLI.
- **click**: When the environment is a desktop with a mouse, use _click_ for most targets, such as buttons, links, list items, and radio buttons. Don't use _click on_. **Recommended**: Click **OK**. **Not recommended**: Click on **OK**. Hyphenate _right-click_, _left-click_, and _double-click_. When a click or tap action reveals a collapsed list, you can write _click to expand_ or simply _expand_. It's OK to write _click in_ when referring to a region that needs focus (for example: _click in the window_), but not when referring to a control or a link. For Android apps, don't use _click_. Instead, use tap.
- **click here** [don't use]: Don't use. For information and alternatives, see Avoid vague link text.
- **clickthrough (noun), click through (verb)**: (headword is the rule)
- **client**: In REST and RPC API documentation, _client_ is short for _client app_—that is, the app that the developer is writing. Don't use _client_ as an abbreviation for _client library_; instead, use _library_.
- **client ID**: Lowercase except at the beginning of a sentence, heading, or list item.
- **client secret**: Lowercase except at the beginning of a sentence, heading, or list item.
- **Cloud** [avoid] [Cloud]: Don't use as short for _Google Cloud_. For generic references such as _the cloud_ or _hybrid cloud_, use lowercase.
- **Cloud console** [don't use] [Cloud]: Don't use. Instead, refer to the full name _Google Cloud console_. If you aren't discussing any other console (such as the Google Admin console), you can abbreviate to _the console_ after first mention. Use _the_ before the tool name. For more information, see console.
- **Cloud SDK**: Not _Google Cloud SDK_.
- **co***: See guidance about hyphens with prefixes.
- **codebase**: Not _code base_.
- **codelab**: Not _code lab_ or _code-lab_. For more information, see documentation.
- **cold**: When possible, avoid jargon like _cold failover_, _cold standby_, and _cold spare_. If you use one of these phrases, define it on first use and use it consistently throughout the document.
- **colocate**: Not _co-locate_ or _colo_.
- **compliant, compliance** [avoid]: Use with caution. A claim that a product or its output is _compliant_ with a standard is a strong statement.
- **comprise** [don't use]: Don't use. Instead, use _consist of_, _contain_, or _include_.
- **config** [avoid]: Avoid when possible. Instead, spell out the full word when it's used in a non-code sense: _configuration_ or _configuring_. Use the verbatim code item name when referring to, for example, a data structure or a file with that name.
- **confidential**: _Confidential_ data is data that is protected to prevent unauthorized access. See sensitive.
- **cons** [don't use]: Don't use. Instead, use a more precise term, such as _disadvantages_.
- **console** [avoid]: Don't use in isolation. Instead, use the name of the specific console, such as the Google Cloud console or the Google Admin console. Use _the_ before the name of a console. After giving the full name of a console, you can use a shortened version of the name, such as the _Admin console_. If you're only discussing the Google Cloud console, after giving the full name you can refer to _the console_. To refer to a sub-page of a console, use the term _page_. If a specific term for a browser-based interface is unavailable, use _web interface_.
- **content type** [avoid]: Be as specific as possible when writing about a content type, and use the term only when applicable. For example, you can use this term if you're referring to the value of the `Content-Type` HTTP header. Also see media type.
- **Control+S, Command+S, and other keyboard commands**: To refer to a Control character, use Control+CHARACTER. Don't use _Ctl-S_, _Cmd-S_, or _Cloverleaf-S_. In most cases, use an uppercase letter for CHARACTER. In macOS, many keyboard commands use the Command key instead of the Control key, and there's an Option key instead of an Alt key. If your audience includes macOS users and Windows or Linux users, then mention both keyboard commands. **Recommended**: Control+S (Command+S on macOS)
- **Copy and paste** [avoid]: Avoid using. Instead, explain what to enter into a field and not how. **Recommended**: In the **Query** field, enter the output from the previous step. **Not recommended**: Copy the output from the previous step and paste into the **Query** field.
- **could** [avoid]: Avoid using. Instead, use _can_ where possible. See also can, may, might, must, should and would. For information about clarifying who's performing an action, see Active voice. For information about tenses, see Present tense.
- **CPU**: All caps. No need to expand the abbreviation on first mention.
- **crazy, bonkers, mad, lunatic, insane, loony** [don't use]: Don't use. Instead, use _complicated_, _complex_, _baffling_, _strange_, or _unexpected_, and only for inanimate objects.
- **Create a new ...** [avoid]: Avoid using unless you need to distinguish the item from another recently created item. Instead, use _Create a ..._ **Recommended**: Create a project. **Not recommended**: Create a new project.
- **cripple** [don't use]: Don't use. Instead, use more precise language. For example, instead of _it crippled the server_, write _it slowed the server down_. When referring to people, use terms that specifically describe a physical impairment, such as _person with a motor disability_; _person with a mobility impairment_ (refers to walking or moving about); _person with dexterity impairment_ (refers to using a standard mouse or keyboard); _person who uses a wheelchair, walker, or cane_; _wheelchair user_; _person with restricted or limited mobility_.
- **cross-site request forgery**: Lowercase except at the beginning of a sentence, heading, or list item.
- **curated roles** [don't use]: Don't use. Instead, use _predefined roles_.
- **currently** [avoid]: Avoid because this word is implied. The word can also prematurely disclose product or feature strategy or inappropriately imply that a product or feature might change. See also as of this writing and presently. **Recommended**: Windows isn't supported. **Not recommended**: Windows isn't currently supported. For more information, see Timeless documentation.
- **custom mode VPC network**: Not _custom mode network_.
- **curl**: Not _cURL_. For information about when to use code format, see Items that are sometimes in code font.
- **Cyber Monday**: Avoid unless explicitly referring to an event in the US. Instead use _peak scale event_.

### D

- **dash**: A dash (`—`) isn't the same character as a hyphen (`-`). The characters are used for different purposes. Therefore, don't use the word _dash_ to refer to a hyphen.
- **dashboard** [avoid]: Don't use to refer to the Google Cloud console. For more information, see console. Use _dashboard_ not _Dashboard_ unless it's officially part of a product name.
- **data**: Use _data_ as singular, not plural; _the data is_, not _the data are_. Use data as a mass noun, not a count noun; _less data_, not _fewer data_.
- **data center**: Not _datacenter_.
- **data center campus**: Use when referring to an entire physical location, which can encompass one or more data centers.
- **data cleaning**: Not _data cleansing_.
- **data flow (noun); dataflow (noun)**: If it's possible to replace with the phrase _flow of data_, then use two words: _data flow_. If that replacement doesn't work, such as when referring to something like stream processing or reactive programming, then use one word: _dataflow_.
- **data source**: Not _datasource_.
- **datastore**: Not _data store_.
- **data type**: Not _datatype_.
- **dead-letter queue, dead letter**: Define on first use, for example _dead-letter queue (unprocessed messages queue)_.
- **deep linking**: Not _deep-linking_. However, if you can replace with _linking_, then do so.
- **deficient** [avoid]: Don't use to refer to a person. OK to use to refer to a condition of a computer system.
- **deformed** [avoid]: Don't use to refer to a person. OK to use to refer to a condition of a computer system or inanimate object.
- **demilitarized zone (DMZ)** [don't use]: Don't use. Instead, use a more precise term like _perimeter network_.
- **denigrate** [don't use]: Don't use. Instead, use _disparage_.
- **denylist (verb), denylisted, denylisting** [don't use]: Don't use as a verb. Instead, rewrite to improve clarity. OK to use _denylist_ as a noun. For more information, see blacklist.
- **deprecate**: To _deprecate_ an item is to recommend against the item's use, typically as a warning that the item will soon be unavailable or unsupported. Don't use _deprecated_ to mean _removed_, _deleted_, _shut down_, or _turned down_.
- **deselect** [don't use]: Don't use to refer to clearing a check mark from a checkbox. Instead, use _clear_. **Recommended**: Clear **Automatically check for updates**. **Not recommended**: Deselect **Automatically check for updates**. **Not recommended**: Uncheck **Automatically check for updates**.
- **desire, desired** [don't use]: Don't use. Instead, use a word like _want_ or _need_. **Recommended**: Set the value to the size that you want. **Not recommended**: Set the value to the size that you desire. **Not recommended**: Set the value to the desired size.
- **Developers Console** [don't use]: Don't use. For more information, see console.
- **DevOps**: Short for _development operations_. No need to spell out on first mention unless the audience requires it. For more information, see DevOps.
- **dialog**: Use _dialog_ for the UI element sometimes called a dialog box. Use _dialogue_ only for verbal interaction between people.
- **directory, folder**: If the context that you're documenting (such as an IDE's GUI) uses one term or the other, use that term. If not, then use _directory_ in a command-line context, and _folder_ in a GUI context. When in doubt, default to _directory_.
- **disable** [avoid]: Don't use _disable_ or _disabled_ to describe something that's broken. When describing a user action or the state of a UI element, use a more precise term where possible. You can use _inactive_, _unavailable_, _deactivate_, _turn off_, or _deselect_, depending on the context. Use the same term consistently throughout your document. See also enable.
- **disclosure triangle, disclosure widget** [don't use]: Don't use. Instead, use _expander arrow_.
- **display (verb)**: Don't use as an intransitive verb. _Display_ is a transitive verb; therefore, it requires an object. It is often misused in technical documentation, as demonstrated by the following example: **Recommended**: The Output Directories area appears. **Recommended**: The Output Directories area is displayed. **Not recommended**: The Output Directories area displays. The following example demonstrates correct usage of the verb _display_ but means something quite different from the preceding examples. **Recommended**: The Output Directories area displays the vector image.
- **distributed denial-of-service (DDoS)**: Hyphenate as shown. On subsequent mention, use _DDoS_.
- **DNS server policy**: Lowercase _server policy_.
- **DNSKEY**: One word, all capital letters.
- **documentation or document or documents**: To refer specifically to the text on a page that explains a product, feature, or service, use _this document_, and not _this article_, _this topic_, _this doc_, or _this page_. It's OK to use _this tutorial_, _this quickstart_, or _this codelab_ for those specific documentation types. Always spell out _documentation_ except in cases where space is limited, such as in tabs and URLs. See also page. **Recommended**: You can find many examples in this document. **Not recommended**: You can find many examples in this article. **Recommended**: This document provides guidance about creating tables. **Not recommended**: This page provides guidance about creating tables.
- **documentation set**: Not _doc set_ or _docset_.
- **does not yet** [avoid]: Avoid in timeless documentation because this phrase can become outdated. The phrase can also prematurely disclose product or feature strategy or inappropriately imply that a product or feature might change. **Recommended**: The Google Cloud console doesn't support this IAM role. **Not recommended**: The Google Cloud console does not yet support this IAM role. For more information, see Timeless documentation.
- **dojo** [don't use]: Don't use. Instead, use a precise term that is accurate for the context, such as _training_ or _workshop_.
- **domain name registrar**: Lowercase except at the beginning of a sentence, heading, or list item.
- **Domain Name System Security Extensions (DNSSEC)**: Write out and capitalize each word on first use. OK to abbreviate as _DNSSEC_ after first use.
- **double-tap** [Android]: Hyphenate. Lowercase except at the beginning of a sentence, heading, or list item.
- **downscope** [avoid]: Consider using a more descriptive term like _constrain scope_ or _reduce scope_. Because _downscope_ might not be broadly understood, if you use the term, make sure to define it on first use. Don't use _down scope_ or _down-scope_ **Recommended**: Reducing the scope of a token helps you follow the principle of least privilege. **Recommended (first use)**: The IAM recommender helps you _downscope_ (reduce) the permissions that are available to your users.
- **drag**: Use _drag_, not _click and drag_ and not _drag and drop_. OK to use _drag-and-drop_ as an adjective. **Recommended**: Drag the USER to the **Authorized** box.
- **drop-down** [avoid]: In most cases, you can omit _drop-down_ from phrases like _drop-down list_ or _drop-down menu_, and just use _list_ or _menu_. Include _drop-down_ as a modifier only if the omission would cause ambiguity. Don't use _drop-down_ as a standalone noun.
- **dumb down** [don't use]: Don't use. Instead, use a word or phrase what's happening, such as _simplify_ or _remove technical jargon_.
- **dummy variable** [don't use]: Don't use to refer to placeholders. Instead, use _placeholder_. Also don't use if referring to the concept in statistics known as a dummy variable. Instead, use alternate terms such as _indicator variable_, _design variable_, _one-hot encoding_, _Boolean indicator_, _binary variable_, or _qualitative variable_.

### E

- **each**: _Each_ refers to every individual item taken individually, not to a group of items taken collectively. In other words, _each_ isn't a synonym for _all_. For example, _a list of each item_ is ambiguous; _a list of all the items_ or _a list of the items_ is generally clearer.
- **earlier**: Use for a range of version numbers, not _lower_. **Recommended**: Use version 2.2 or earlier. **Not recommended**: Use version 2.2 or lower. In Android documentation, don't use _earlier_ for a range of version numbers. Instead, use _lower_. When referring to a position in a document, use _earlier_ or _preceding_, not _higher_.
- **easy, easily** [avoid]: What might be easy for you might not be easy for others. Try eliminating this word from the sentence because usually the same meaning can be conveyed without it.
- **ecommerce**: Not _e-commerce_.
- **edge availability domain**: Don't use _edge availability zone_, _metro availability domain_, or _metro availability zone_. Don't shorten to _EAD_.
- **e.g.** [don't use]: Don't use. Instead, use phrases like _for example_ or _such as_. Many people confuse _e.g._ and _i.e._
- **egress**: When referring to the networking term, use lowercase.
- **either**: When using _either_, use parallel syntax. **Recommended**: Do either option 1 or option 2. **Recommended**: Either do option 1 or do option 2. **Not recommended**: Either do option 1 or option 2. In general, use _either_ only for a choice between two things, not for a choice among multiple things. Writing _either A or B or C_ will distract some readers, but if it's the best phrasing for your situation, then use it.
- **element**: In HTML and XML, a tag is a component of an element that indicates the start or end of the element. (For example, the `<i>` start tag indicates the beginning of the `<i>example</i>` element.) In general, don't use the term _tag_ to refer to an entire element.
- **email**: Not _e-mail_, _Email_, or _E-mail_. Don't use as a verb. Use a specific verb in front of the word. For example, _send email_. This construction is better for translation and a global audience.
- **emoji**: Use _emoji_ for both singular and plural forms. See Don't know the difference between emoji and emoticons? Let me explain and What's the Plural of Emoji?
- **enable**: In procedures, use the appropriate label and action for the UI element that the user interacts with. When describing a user action or the state of a UI element, use a more precise term where possible. It's OK to use _enable_ when not referring to a person. For turning on or activating an option or feature, use _enable_ or _turn on_ consistently: • Use the same term in introductory text as described in the procedure. • Use the same term throughout the document unless there's a difference in the UI elements for different procedures. **Recommended**: To enable the API, click the toggle. **Recommended**: Enable the API for your project. For making it feasible to do something, use _lets you_. **Recommended**: The API lets you detect features in images. **Not recommended**: The API enables you to detect features in images. **Not recommended**: The API allows you to detect features in images. In Google Workspace documentation, if possible, use _turn on_ or _on_ instead. If referring to the state of a UI element, use _available_.
- **endpoint**: Not _end point_.
- **enter**: Use _enter_ to refer to the user entering text. If it's important to not press Enter, explicitly say so. See also _type_. **Recommended**: In the **Owner** box, enter your name. **Recommended**: In the **Size** box, type a font size.
- **ephemeral external IP address**: Don't use _ephemeral IP address_ or _external IP address_ to refer to ephemeral external IP addresses.
- **error-prone (adjective)**: Hyphenate. Lowercase except at the beginning of a sentence, heading, or list item.
- **etc.** [avoid]: Avoid using _etc._, _and so forth_, and _and so on_ wherever possible. If you really need to use one, use _etc._ Always include the period, even if a comma follows immediately after. **Recommended**: Your app might experience problems such as instability or high latency. **Recommended**: Your app might experience problems, including instability or high latency. **Not recommended**: Your app might experience instability, high latency, and so on. **Not recommended**: Your app might experience instability, high latency, etc. **Not recommended**: If your app experiences instability, high latency, etc., follow these steps:
- **eventually** [avoid]: Avoid in timeless documentation because this word can become outdated. The word can also prematurely disclose product or feature strategy or inappropriately imply that a product or feature might change. See also future and soon. **Recommended**: This version of the SDK is deprecated. **Not recommended**: This version of the SDK is deprecated and eventually will be no longer supported. For more information, see Timeless documentation.
- **execute**: Verb commonly used to refer to function calls, SQL queries, and other processes. When the meaning is the same, use the simpler word _run_ instead. If you need to use a more precise term for your context, use that term.
- **expander arrow**: The UI element used to expand or collapse a section of navigation or content. If you describe this element, use the terms _expander arrow_ and _expandable section_ Don't use terms like _expando_ or _zippy_.
- **exploit**: Don't use _exploit_ to mean "use." Only use _exploit_ in the negative sense, such as to describe _exploiting a security vulnerability_.
- **external VPN gateway**: Write _external_ and _gateway_ all lowercase except at the beginning of a sentence, heading or list item.
- **extract**: Use instead of _unarchive_, _uncompress_, _untar_, or _unzip_.

### F

- **fail over (verb), failover (noun, adjective)**: (headword is the rule)
- **fat** [don't use]: Don't use. Instead, use a precise modifier that conveys the appropriate meaning. For example, use _high-capacity network connection_ instead of _fat connection_ or _full-featured client_ instead of _fat client_. Instead of using fat in a negative sense, such as _trim the fat_, refer in a more concrete manner to the _removal of unused items_. OK to use as an acronym when referring to file allocation table (FAT).
- **female adapter** [don't use]: Don't use. Instead, use a genderless word like _socket_.
- **Fast Healthcare Interoperability Resources (FHIR)**: Refer to _a FHIR_ (pronounced "a fire," as in "a FHIR store"), not _an FHIR_. For more information, see Indefinite articles before abbreviations.
- **filename**: Not _file name_
- **file system**: Not _filesystem_.
- **fill in; fill out**: Use _fill in_ when referring to entering information in individual fields. Use _fill out_ when referring to completing an entire form. **Recommended**: Fill out the questionnaire. Be sure to fill in the required fields.
- **final solution** [don't use]: Don't use. Instead, use _solution_ as a standalone term or, depending on the context, _definitive_, _optimal_, _best_, or _last solution_.
- **fintech**: Write out on first mention: _financial technology (fintech)_. Don't use _FinTech_ or _fin-tech_.
- **firewalls**: Don't use in Compute Engine or networking documentation. Instead, use _firewall rules_. Exception: If you're explaining how firewall rules work, you can explain that every network has an implied virtual distributed firewall. Outside of Compute Engine or networking documentation, the term _firewalls_ is acceptable.
- **first class, first-class, first-class citizen** [don't use]: Don't use _first class_ or _first-class citizen_. Instead, use another term that's appropriate for the context, such as _higher-order_, _anonymous_, or _nested_, or loosely describe the specific characteristics or features of the entity, resource, language, or framework. **Recommended**: These widgets have full access to the event system and lifecycle hooks. **Not recommended**: The widgets are first-class components in the UI framework. **Recommended**: Virtual machines are higher-order resources that can participate in resource groups and are integrated in a variety of identity, networking, and storage services. **Not recommended**: Virtual machines are treated as first-class resources across the identity, networking, and storage services. For more information, see Write inclusive documentation.
- **following**: It's not necessary to use a noun after _following_ unless it helps provide clarity and enables accessibility. See Tables. **Recommended**: ... in the following code sample ... **Recommended**: ... in the following table ... **Recommended**: ... do the following: ...
- **foo** [avoid]: Avoid when possible even though it's a common term in the developer community. Instead, use a clearer and more meaningful placeholder name.
- **for example**: When you introduce an example using the phrase _for example_, follow the phrase by a comma. For clarity, when introducing an example, separate the example using dashes, commas, or parentheses from the rest of the sentence as appropriate, or introduce the example in a separate sentence. **Recommended**: Enter a name for the instance—for example, `my-instance-99`. **Recommended**: Enter a six-digit hex number (for example, `228B22`), and then click **OK**. **Recommended**: Enter a six-digit hex number, and then click **OK**. For example, if you want the color forest green, enter `228B22`. For more information, see Format examples.
- **for instance** [avoid]: Don't use the phrase _for instance_ to introduce examples to avoid confusion with the noun _instance_. Instead, use _for example_, _like_, or _such as_. For more information, see for example.
- **frontend**: Not _front-end_ or _front end_.
- **functionality** [avoid]: Use with caution. With respect to hardware or software, _functionality_ refers to a set of associated functions or capabilities and how they work. However, the word is sometimes overused, especially when the intended meaning is _capabilities_ or _features_.
- **future, in the future** [avoid]: Avoid in timeless documentation because this word or phrase can become outdated. See also eventually and soon. For more information, see Timeless documentation.

### G

- **GBps**: Short for _gigabytes per second_. By convention, we don't use _GB/s_. For more information, see Units of measurement.
- **Gbps**: Short for _gigabits per second_. By convention, we don't use _Gb/s_. For more information, see Units of measurement.
- **`gcloud` CLI** [Cloud]: Use the full name _Google Cloud CLI_ the first time that you mention the product on a page.
- **gender-neutral he, him, or his (or she or her)** [don't use]: Don't use. Instead, use the singular _they_ (see Jane Austen and other famous authors violate what everyone learned in their English class). Don't use _he/she_ or _(s)he_ or other such punctuational approaches. For more information, see Pronouns.
- **generative AI**: Spell out _generative_. Use sentence case. Don't use _gen AI_ or _Gen AI_. Don't hyphenate _generative AI_ as an adjective unless you must do so for clarity. See also AI.
- **ghetto** [don't use]: Don't use. Instead use more precise terms like _clumsy_, _workaround_, or _inelegant_ to refer to code that isn't in a production-ready state.
- **gimp, gimpy** [don't use]: Don't use. Instead, use precise, non-figurative language to refer to a deficiency in a component. OK to use in reference to companies, tools, software packages, and other entities that use the term in their names.
- **GKE node**: Use when first introducing GKE nodes on a given page. For subsequent mentions, you can use _node_. A GKE node is a worker machine that runs containerized applications and other workloads. The machine is a Compute Engine VM that GKE creates during cluster creation. See also virtual machine (VM) instance.
- **Google, Googling** [avoid]: Don't use as a verb or gerund. Instead, use _search with Google_.
- **Google Account, Google Accounts**: Capitalize _Account_.
- **Google API Client Library for LANGUAGE (Java, .NET, etc.)**: On second and subsequent use, you can abbreviate to _LANGUAGE client library_.
- **Google API Console, Google APIs Console** [don't use]: Don't use. For more information, see console.
- **Google Cloud**: Not _GCP_, _Cloud Platform_, or _Cloud_.
- **Google Cloud console**: If you're only discussing the Google Cloud console, it's OK to shorten to _the console_ after first use on a given page. Use _the_ before the console name. For more information, see console.
- **Google Cloud project ID**: Not _Cloud project ID_ or _GCP project ID_. You can also shorten to _project ID_, but be aware that that term is ambiguous in some contexts.
- **Google Developers Console** [don't use]: Don't use. For more information, see console.
- **Google I/O**: Not _I-O_ or _IO_.
- **Google Play services**: Write _services_ in lowercase.
- **Google Play services SDK**: Write _services_ in lowercase.
- **grandfather clause, grand-father clause, grand father clause** [don't use]: Don't use. See grandfathered.
- **grandfathered** [don't use]: Don't use to refer to something that is allowed to violate a rule because it predates the rule. Instead, use an adjective like _legacy_ or _exempt_ or a verb like _made an exception_. **Recommended**: The app is exempt because it was released before the new requirements were announced. **Not recommended**: The app is grandfathered in because it was released before the new requirements were announced.
- **gray-box, grey-box** [avoid]: Avoid using _gray-box_, _graybox_, or _gray box_ to describe testing. To refer to testing that's a combination of clear and opaque testing methods, describe exactly what it's doing. If you need to refer to this type of testing after you describe it, consider using a more precise term for clarity, such as _translucent-box testing_.
- **grayed-out, greyed-out, gray out, grey out** [don't use]: Don't use. Instead, use _unavailable_.
- **grayhat, greyhat, gray hat, grey hat** [don't use]: Don't use. Follow the guidance for black hat when referring to someone violating rules or laws.
- **graylist, greylist, gray list, grey list, gray-list, grey-list** [don't use]: Don't use. See blacklist.
- **graylisted, greylisted, gray listed, grey listed, gray-listed, grey-listed** [don't use]: Don't use. See blacklist.
- **graylisting, greylisting, gray listing, grey listing, gray-listing, grey-listing** [don't use]: Don't use. See blacklist.
- **`gsutil`** [Cloud]: In the Google Cloud context, use code font for both the name of the command-line utility and the command.
- **guru** [don't use]: If possible, use a more precise term. For example, if you mean _expert_ or _teacher_, use those terms.
- **guys, you guys** [don't use]: When referring to a group of people use non-gendered language, such as _everyone_ or _folks_.
- **gypsy** [don't use]: Don't use. To refer to the people, use _Romani_, _Roma_, or _Traveller_, as appropriate for the specific group you're referring to. In place of metaphorical uses of the term, use more precise phrases.

### H

- **hamburger, hamburger menu** [don't use]: Don't use. Instead use the `aria-label` for that particular icon. For example, **Menu**. For more information, see Buttons and icons.
- **hands off, hands-off** [don't use]: Use a less figurative phrase, such as _automated_. If you're referring to a group that doesn't do anything during a process, write a description.
- **hands on, hands-on** [don't use]: Use a less figurative phrase, such as _customizable_, or write a description of the activity.
- **hang, hung** [don't use]: Don't use to refer to a computer or system that is not responding. Instead, use _stop responding_ or _not responding_. For more information, see Avoid figurative language.
- **happiness and satisfaction**: Use _happiness_ when referring to a customer's perception of a site's reliability. Use _satisfaction_ when referring to whether the site meets the customer's needs. Site reliability engineering (SRE) content generally refers to measuring _customer happiness_ instead of _customer satisfaction_. The two phrases are not equivalent. The distinction the SRE documentation makes is between satisfying a need (a dispassionate act) and establishing an emotional response (creating happiness). Although it is difficult to measure happiness precisely, SRE uses service level indicators (SLIs) to quantify user perception. For example, a customer might feel a "need" to watch a show on TV. If the show is available, the customer's need is satisfied. But if playback is slow or choppy, the customer might not be happy. For more information about SRE and measuring reliability, see The Happiness Test.
- **hardcode (verb), hardcoded (adjective)**: Don't hyphenate.
- **he, him, his** [avoid]: Don't use a gendered pronoun except for a specific individual of known gender. Use _they_ and _their_ for the general singular pronoun.
- **healthcare**: Not _health care_ or _health-care_.
- **health check** [avoid]: Use with caution. When describing an action taken for a computer system, only use the term _health check_ if this is the term that appears in the interface. Be certain to remove any ambiguity regarding whether the term refers to health in the medical sense. Use detailed, non-figurative language as much as possible, such as referring to a node _being responsive_ instead of referring to a node being healthy.
- **healthy** [avoid]: Don't use. See health check.
- **high availability (noun), high-availability (adjective)**: Spell as _high availability_ when used as a noun and as _high-availability_ when used as an adjective. See also load balancing (noun), load-balancing (adjective). Lowercase except when part of a product name, but OK to abbreviate as _HA_ after first use.
- **higher**: Don't use for a range of version numbers. Instead, use _later_. Don't use to refer to a position in a document. Use _earlier_ or _preceding_. Don't use to refer to a position in the UI. Instead, write instructions that avoid directional language. For more information, see Writing accessible documentation. In Android documentation, use _higher_ for a range of version numbers, not _later_. A release with the highest version number might not be the latest version. For example, if version 2.0 of an operating system receives a bug-fix update after version 3.0 has been released, then version 2.0.1 might be the latest version, even though its version number is lower than 3.0.
- **high performance computing (HPC)**: Don't hyphenate. Lowercase except at the beginning of a sentence, heading, or list item.
- **hit** [don't use]: Don't use as a synonym for _click_, _press_, or _type_.
- **hold the pointer over**: Only use this verb phrase in the following cases: • When the user needs to hold their mouse over a UI element, but not click the UI element. This action involves waiting for the UI to react—for example, waiting for a tooltip to open or waiting for a submenu to open. • When the duration of time is important. The phrase _point to_ is more common. See also point to. **Recommended**: In the **Admin** menu, hold the pointer over **File**, and then click **New**. **Not recommended**: In the **Admin** menu, hover over **File**, and then click **New**.
- **holiday, the holidays** [avoid]: Don't use to refer to the end of the year. Instead, refer to specific quarters or months.
- **home screen** [Android]: Two words in Android contexts; not _homescreen_ or _home-screen_.
- **hostname**: Not _host name_.
- **hot**: When possible, avoid jargon like _hot failover_, _hot standby_, and _hot spare_. If you use one of these phrases, define it on first use and use it consistently throughout the document. However, see hotspot.
- **hotspot**: In databases, _hotspots_ occur when a small number of nearby rows are accessed frequently in a short period of time, causing CPU spikes and affecting performance. Use _hotspot_ and _hotspots_ as nouns. Don't use verb and gerund forms such as _hotspotting_, because they translate less consistently. When you use _hotspot_, define it the first time that you use it on a page as you normally do with jargon. **Recommended**: Hotspots in one table can affect the performance of other tables. **Not recommended**: Hotspotting in one table can affect the performance of other tables.
- **housekeeping, house keeping, house-keeping** [don't use]: Don't use. Instead, use less figurative and more precise terms, such as _maintenance_ and _cleanup_.
- **hover** [don't use]: Don't use. Instead use _hold the pointer over_.
- **HTTPS**: Not _HTTPs_.

### I

- **IaaS**: Write out on first mention: _infrastructure as a service (IaaS)_.
- **IAM**: When referring to the Google Cloud product, spell it out on first use: _Identity and Access Management (IAM)_. When referring to UI text, write this term the way it's written in the UI. When referring to the general practice of identity and access management, spell it out in lowercase on first use and include a parenthetical comment: **Recommended**: Identity and access management (generally referred to as _IAM_) is the practice of granting the right individuals access to the right resources for the right reasons.
- **ID**: Not _Id_ or _id,_ except in string literals or enums. In some contexts, it's best to spell out as _identifier_ or _identification_.
- **i.e.** [don't use]: Don't use. Instead, use phrases like _that is_. Many people confuse _e.g._ and _i.e._
- **if**: Wondering whether to use _if_ or _whether_? See whether. Although it is common in casual usage to omit the word _then_ in _if...then_ statements, you should include helper words like _then_ in technical documentation. For more information, see Use clear, precise, and unambiguous language.
- **image**: _Image_ by itself doesn't localize well because of its many meanings. Consider adding context—for example, _disk image_ or _container image_.
- **impact** [avoid]: Use only as a noun. Instead of writing that something _has an impact_, use the word _affect_. **Recommended**: This issue affects user experience. **Acceptable**: This issue has an impact on user experience. **Not recommended**: This issue impacts user experience.
- **index**: Use the plural _indexes_ unless there is a domain-specific reason (for example, a mathematical or financial context) to use _indices_.
- **ingest**: Use _import_, _load_, or _copy_ when referring to simple movement of data. Use _ingest_ only when referring to such operations that also involve significant processing of the data.
- **ingress**: When referring to the networking term, use lowercase. When referring to the GKE term or API, capitalize _Ingress_.
- **in order to** [avoid]: Avoid _in order to_; instead, use _to_. Use _in order to_ when needed to clarify meaning or to make something easier to read. **Recommended**: You can use monitoring to help identify issues. **Not recommended**: You can use monitoring in order to help identify issues. **Recommended**: The infrastructure is required in order to support search. **Not recommended**: The infrastructure is required to support search.
- **inline**: One word as an adjective, _inline_, not _in line_ or _in-line_.
- **instance group**: Don't abbreviate to _IG_. See also managed instance group.
- **intercluster**: Use unhyphenated _intercluster_, not _inter-cluster_.
- **interconnectAttachment**: Use when referring to the API. Otherwise, use _VLAN attachment_.
- **Interconnect connection**: Only use _Interconnect connection_ relative to a product as follows: • CDN Interconnect connection • Cloud Interconnect connection • Dedicated Interconnect connection • Partner Interconnect connection OK to use _connection_ on subsequent mentions. When you're referring to a Google Cloud product, always specify the product name. Don't use _Interconnect_ or _interconnect_ as standalone terms, and don't use generic terms like _cloud interconnect connection_ or _cross-connect_.
- **Interconnect connection location**: Only refer to an _Interconnect connection location_ in context of a specific product, for example _CDN Interconnect_. OK to also use _colocation facility_.
- **interconnect type** [don't use]: Don't use. Instead, use _connection type_. Examples of connection types are a _dedicated connection_ or a _connection provided by a service provider_.
- **interface**: OK to use as a noun. Don't use as a verb. Instead, use _interact_, _talk_, _speak_, _communicate_, or other similar terms.
- **internal DNS**: Write _internal_ all lowercase except at the beginning of a sentence, heading, or list item.
- **Internationalized Domain Name (IDN)**: Write out and capitalize each word on first use. OK to abbreviate as _IDN_ after first use.
- **internet**: Lowercase except at the beginning of a sentence, heading, or list item.
- **Internet Key Exchange (IKE)**: Write out and capitalize each word on first use. OK to abbreviate _IKE_ after first use.
- **I/O (see also Google I/O)**: Not _I-O_ or _IO_.
- **IoT**: OK to use as an abbreviation for _Internet of Things_. Note the lowercase _o_.
- **IPsec**: Not _IPSec_ or _IPSECShort_. Short for _Internet Protocol Security_. No need to spell out on first mention.

### J

- **jank, janky** [avoid]: Use only to refer to a glitch or problem with graphics that is caused by a loss of data or inadequate refresh rate. Don't use otherwise. Use a less figurative term to refer to something of poor or unreliable quality.
- **just** [avoid]: Avoid. Usually, _just_ is a filler word that you can delete without affecting your meaning. **Recommended**: BigQuery skips the row. **Not recommended**: BigQuery just skips the row. If your meaning is unclear without _just_, then use a more specific term such as _only_, _instead_, or _previously_, or revise your language to be more specific. (Even if one of these replacement terms fits, you often don't need it.) **Recommended**: You can run DML statements in the same way that you'd run a `SELECT` statement. **Not recommended**: You can run DML statements just as you'd run a `SELECT` statement. **Recommended**: Let a user query only the table without full dataset access. **Recommended**: Let a user query the table without full dataset access. **Not recommended**: Let a user query just the table without full dataset access. Sometimes, _just_ is useful for conveying that one approach is simpler than another. In those cases, use _just_ instead of _simply_. **Recommended**: Use the namespace ID `namespace:example-kind` or just `example-kind`.

### K

- **k8s** [don't use]: Don't use. Instead, use _Kubernetes_.
- **KBps**: Short for _kilobytes per second_. By convention, we don't use _KB/s_. For more information, see Units of measurement.
- **Kbps**: Short for _kilobits per second_. By convention, we don't use _Kb/s_. For more information, see Units of measurement.
- **kebab, kabob, kebab menu, kabob menu** [don't use]: Don't use. Instead use the `aria-label` for that particular icon. For example, **More**. For more information, see Buttons and icons.
- **kebab case, kabob case, kebab-case, kabob-case** [don't use]: Don't use. Instead, use _dash-case_.
- **key**: Don't use as an adjective in the sense of _crucial_ or _important_. If you use _key_ as a noun, specify which kind of key you're referring to on first mention, because there are many kinds of keys in technical contexts.
- **key pair**: A pair of keys, such as a public key and a private key. Contrast with _key-value pair_, which refers to a pairing that specifies a value for a variable (as in configuration files).
- **key ring**: Use instead of _keyring_ (without the space) when referring to a grouping of Cloud KMS keys.
- **key-value pair**: Use instead of _key/value pair_ or _key value pair_.
- **kill** [avoid]: Avoid when possible. Instead, use words like _stop_, _exit_, _cancel_, or _end_. For exceptions to this rule, see Documenting command-line syntax.

### L

- **lame** [don't use]: Don't use. Instead, use precise, non-figurative language to refer to a deficiency in a component.
- **later**: Use for a range of version numbers, not _higher_. **Recommended**: Use version 2.2 or later. **Not recommended**: Use version 2.2 or higher. **Not recommended**: Use version 2.2+. A release with the highest version number might not be the latest version. For example, if version 2.0 of an operating system receives a bug-fix update after version 3.0 has been released, then version 2.0.1 might be the latest version, even though its version number is lower than 3.0. In Android documentation, don't use _later_ for a range of version numbers. Instead, use _higher_. When referring to a position in a document, use _later_ or _following_, not _below_.
- **latest** [avoid]: Avoid in timeless documentation because this word can become outdated. If you must use _latest_, give the reader a reference point—for example, a version number or release date. **Recommended**: To help keep your system secure, install the latest version of the tools. **Recommended**: The June 2021 release includes the latest tools that help secure your system. **Not recommended**: The product includes the latest tools that help secure your system. For more information, see Timeless documentation.
- **learnings** [don't use]: Don't use. Instead, refer to _knowledge_ or _things that you learned_.
- **left-nav, right-nav** [don't use]: Don't use directional language. For more information, see Writing accessible documentation. If referring to applications, use _navigation menu_. If referring to navigational elements for documentation, use _content navigation menu_.
- **legacy**: If possible, use a more precise term. If you do use _legacy_, include or point to a definition to clarify what you mean in the current context. Don't use _legacy_ with any sort of pejorative connotation.
- **let's (as a contraction of _let us_)** [don't use]: Don't use if at all possible. **Not recommended**: Let's click the **OK** button now.
- **Letter of Authorization and Connecting Facility Assignment (LOA-CFA)**: Write out and capitalize each word on first use. OK to abbreviate as _LOA-CFA_ after first use.
- **leverage** [avoid]: Avoid using if you mean _use_. If possible, use a more precise term. For example, _use_, _build on_, or _take advantage of_.
- **lifecycle**: Not _life cycle_ or _life-cycle_.
- **lift and shift**: See rehost.
- **like**: It's OK to use _like_ for either drawing comparisons (in the sense of _similar to_) or introducing examples (in the sense of _such as_). **Recommended**: Common I/O operations, like reading files or making network requests, can be asynchronous. **Recommended**: The new compression algorithm works like a dictionary encoder, replacing repeated strings with shorter codes. See also such as. For more information, see Format examples.
- **limits**: In an API context, _limit_ often refers to usage limits (number of queries allowed per second or per day). Where possible, specify the kind of limit that you mean, such as _usage limit_ or _service limit_; the word _limit_ can refer to many different kinds of limits, including rules about acceptable use. See also quota.
- **lint**: Write both command-line tool name and command in lowercase. Use code font except where inappropriate.
- **little-endian**: Hyphenate. Lowercase except at the beginning of a sentence, heading, or list item. **Recommended**: The codebase assumes little-endian byte ordering. **Not recommended**: The codebase assumes Little Endian byte ordering. **Not recommended**: The codebase assumes Little-endian byte ordering. **Not recommended**: The codebase assumes little endian byte ordering.
- **livestream**: Not _live stream_.
- **load balancing (noun), load-balancing (adjective)**: Spell as _load balancing_ when used as a noun and as _load-balancing_ when used as an adjective. See also high availability (noun), high-availability (adjective).
- **lock screen** [Android]: Two words in Android contexts; not _lockscreen_ or _lock-screen_.
- **login (noun or adjective), log in (verb)**: For the verb form, _sign in_ is generally better. If you're documenting a tool that uses the term _log in_, then use that term.
- **long press** [don't use] [Android]: In Android documentation, don't use. Instead, use _touch & hold_. (Not _touch and hold_.)
- **long-running operation**: Not _long running operation_. OK to abbreviate as _LRO_ after the first use.
- **lower**: Don't use for a range of version numbers. Instead, use _earlier_. Don't use to refer to a position in a document. Instead, use _later_ or _following_. Don't use to refer to a position in the UI. Instead, write instructions that avoid directional language. For more information, see Writing accessible documentation. In Android documentation, use _lower_ for a range of version numbers, not _earlier_.

### M

- **male adapter** [don't use]: Don't use. Instead, use a genderless word like _plug_.
- **man hours, manhours, man-hours** [don't use]: Avoid using gendered terms. Instead use terms like _person hours_.
- **man-in-the-middle (MITM)** [don't use]: Avoid using gendered terms. Instead use terms like _on-path attacker_ or _person-in-the-middle (PITM)_.
- **managed instance group (MIG)**: OK to abbreviate to _MIG_ on subsequent mention. See also instance group.
- **manmade, man made** [don't use]: Avoid using gendered terms. Instead use a word like _artificial_, _manufactured_, or _synthetic_.
- **manned** [don't use]: Avoid using gendered terms. Instead use terms like _staffed_ or _crewed_.
- **manpower, man power, man-power** [don't use]: Avoid using gendered terms. Instead use terms like _staff_ or _workforce_.
- **Markdown**: Always capitalized, even when you're referring to a nonstandard version.
- **master** [don't use]: Use with caution. Never use in conjunction with _slave_. Where possible, replace _master_ with a specific term that is accurate for the context, such as _primary_, _main_, _original_, _parent_, _initiator_, _driver_, _controller_, _manager_, _mixer_, _aggregator_, _publisher_, _leader_, or _active_. Guidance ; **Recommended** ; **Not recommended** ; [row: Don't use _master_ in conjunction with _slave_ in any context. ; Cloud SQL primary/replica ; Cloud SQL master/slave ; ] [row: Avoid using _master_ where possible. ; • GKE control plane • Jenkins controller • root key (in security) • primary key (in databases) ; • GKE master plane • Jenkins master • master key (in security) • master key (in databases) ; ] If the command or code that you're documenting uses the literal word _master_, then use this word only in direct reference to the code item (formatted as code), make it clear what you're referring to, and use the new term thereafter. See also _slave_.
- **Material Design**: Capitalize each word in _Material Design_.
- **matrix**: Use the plural _matrixes_ unless there is a domain-specific reason (for example, a mathematical context) to use _matrices_.
- **may**: In general, reserve for official policy or legal considerations. To convey _possibility_, use _can_ or _might_ instead. To convey _permission_, use _can_ instead. See also can, could, might, must, should, and would. For information about clarifying who's performing an action, see Active voice.
- **MBps**: Short for _megabytes per second_. By convention, we don't use _MB/s_. For more information, see Units of measurement.
- **Mbps**: Short for _megabits per second_. By convention, we don't use _Mb/s_. For more information, see Units of measurement.
- **media type**: In general, use the term _media type_. In contexts where you need to refer to a _content type_—For example, if you mention the `Content-Type` HTTP header—it's okay to use _content type_ instead, to avoid confusion. Don't use _MIME type_.
- **meta***: See guidance about hyphens with prefixes.
- **metafeed**: Not _meta-feed_.
- **metageneration**: Not _meta-generation_.
- **method**: In programming contexts where _method_ refers to a member of a class (as in Java), avoid also using the word generically to mean "approach" or "manner."
- **metropolitan area (metro)**: In networking, a _metro_ is a city where a colocation facility is located.
- **microservices**: Not _Microservices_ or _micro-services_.
- **might**: Use to convey possibility or an uncertain outcome (for example, "You might be prompted to enter your credentials"). See also can, could, may, must, should, and would. For information about clarifying who's performing an action, see Active voice.
- **MIME type** [avoid]: _MIME_ stands for "Multipurpose Internet Mail Extensions," and was originally used to refer to email standards. Don't use _MIME_ when you mean _media type_. If you feel that might be ambiguous to an audience familiar with the term _MIME_, then you can write _media (MIME) type_ for clarity.
- **mobile** [don't use]: Don't use _mobile_ as a standalone noun. Instead, specify _mobile phone_, or if you're talking about more than phones, then use _mobile device_.
- **mobile data**: Use instead of _cellular data_.
- **mobile device**: Use _mobile device_ when you're referring to more than phones (for example, tablets and phones). It's OK to use _phone_ (without _mobile_) when the context is clear.
- **mobile network**: Use instead of _cellular network_.
- **mobile phone**: If you're talking about more than phones, then use _mobile device_. It's OK to use _phone_ (without _mobile_) when the context is clear.
- **mom test** [don't use]: Don't use _mom test_, _grandmother test_, _grandma test_, or _girlfriend test_. Instead, use terms like _beginner user test_ or _novice user test_.
- **monkey, monkey test** [don't use]: Don't use _monkey_ to refer to people. When referring to tests, refer to the specific function. For example: _automated, random tests_.
- **multi***: See guidance about hyphens with prefixes.
- **multi-cluster**: Hyphenate. We generally prefer to close prefixed words, but this is an exception because it's an established term.
- **multi-region, multi-regional**: Hyphenate when referring to a Google Cloud location that consists of more than one region. You can use _multi-regional_ as an adjective in the context of multi-regions, but consider _multi-region_ as an attributive noun instead, such as in "The dataset is in the EU multi-region location." Use _multiregional_ in other contexts.
- **multi-service**: Hyphenate. We generally prefer to close prefixed words, but this is an exception because it's an established term.
- **multi-tenancy**: Hyphenate. We generally prefer to close prefixed words, but this is an exception because it's an established term.
- **must**: Use to describe a required action or state (for example, "You must have the Editor role"). You can also write _you need_ in order to convey a requirement. See also can, could, may, might, should, and would. For information about clarifying who's performing an action, see Active voice.

### N

- **N/A**: Not _NA_. Spell out as _not available_ or _not applicable_ on first reference.
- **name server**: Not _nameserver_.
- **namespace**: Not _name space_.
- **native** [avoid]: Avoid using _native_ to refer to people. When referring to software products, try to use a more precise term—for example, use _built-in_ to describe a feature that's part of a product. The term _native_ isn't necessarily clear—for example, _cloud-native_ could mean that something was written for the cloud, or that it's built in to a cloud platform, or that it currently exists in a cloud platform. Alternatives to a term like _cloud-native_ could include: _modern cloud_, _born in the cloud_, _cloud first_, and _cloud-born_.
- **navigation bar**: Don't use to refer to a _navigation menu_. For more information, see Navigation menu.
- **neither**: Write _neither A nor B_, not _neither A or B_.
- **network IP address** [don't use]: Don't use. Instead, use _internal IP address_.
- **new, newer** [avoid]: Avoid in timeless documentation because this word can become outdated. _New_ also implies that the reader knows the older product and that labeling something as _new_ is therefore meaningful. If you must use _new_, give the reader a reference point—for example, a version number or release date. Don't use _newer_ to refer to a specific version of a product. Instead, use _later_. Make sure that you provide a version number or release date by which to understand _later_. In Android documentation, use _higher_ instead of _later_. **Recommended**: The service's network analysis feature reports on network health. **Not recommended**: Network analysis, a new feature in the service, reports on network health. For more information, see Timeless documentation.
- **ninja** [don't use]: Don't use to refer to a person. Instead, use a term such as _expert_. OK to use in reference to companies, tools, software packages, and other entities that use the term in their names.
- **non***: See guidance about hyphens with prefixes.
- **nonce** [avoid]: Use with caution: this term has a secondary slang meaning that can cause confusion for global readers. Always define the term on first use, and only use it in specific technical contexts such as authentication and blockchain. In end-user documentation and other contexts, use a more descriptive phrase, such as _a number that will be used only once_.
- **non-key**: An exception to our usual preference for closed forms.
- **NoOps** [don't use]: Don't use. Instead, use _fully managed_. If you must include the term, define it at first use with language such as _fully managed_ or _no operations_, but not _non-operational_. Don't use _noops_. For an instruction that does nothing, use _no-op_ or the specific instruction name for your context.
- **NoSQL**: Not _No-SQL_ or _No SQL_.
- **notification drawer** [Android]: In Android contexts, don't hyphenate. Lowercase except at the beginning of a sentence, heading, or list item.
- **now** [avoid]: Avoid when describing features of products or services because this word is implied. If the intent of the text is a comparison between past and present, you can use _now_—for example, "In versions of the tool earlier than 1.10, you could use only the default value, but now you can assign a custom value." **Recommended**: This feature lets you use combinations of user properties. **Not recommended**: This feature now lets you use combinations of user properties. For more information, see Timeless documentation.
- **nuke** [don't use]: Don't use. Instead use _remove_ or _attack_. For example, a _denial-of-service attack_.

### O

- **OAuth 2.0**: Not _OAuth 2_, _OAuth2_, or _Oauth_.
- **off-the-shelf, commercial off-the-shelf (COTS)** [don't use]: Use more widely understood terms like _ready-made_, _prebuilt_, _standard_, or _default_.
- **old, older** [avoid]: Don't use to refer to a previous version of a product. Instead, use _earlier_. Make sure that you provide a version number by which to understand _earlier_. In Android documentation, use _lower_ instead of _earlier_. **Recommended**: This functionality doesn't work in versions earlier than 1.17.0. **Not recommended**: This functionality doesn't work in older versions. For more information, see Timeless documentation.
- **omnibox** [don't use]: Don't use. Instead, use _address bar_.
- **once**: If you mean _after_, then use _after_ instead of _once_.
- **on-premises**: Not _on prem_, _on premise_, or _on-premise_. Hyphenate when used as any part of speech. Use to refer to a customer's resources that they manage in their own facilities. Don't use _peer_. It can be acceptable to use _on-premises_ as a noun when it would be awkward to repeatedly write out a full phrase like _an on-premises environment_. However, it's preferable to use the more complete phrase whenever possible. **Recommended**: An on-premises database. **Recommended**: The database runs on-premises. **OK**: Moving data from on-premises to Google Cloud.
- **OS**: OK to use as a shortening of "operating system."
- **outpost** [don't use]: Don't use. Instead, use _channel_. **Recommended**: social media channels
- **outside the box, out of the box, out-of-the-box** [avoid]: Avoid using in a figurative way. OK to use literally.
- **overview screen** [don't use] [Android]: In Android documentation, don't use. Instead, use _recents screen_.

### P

- **PaaS**: Write out on first mention: _platform as a service (PaaS)_.
- **page**: Use _page_ to refer to the following: • A whole web page, which can include text, images, links, banners, navigational panes, and other features. • A sub-page of a console in particular. See also documentation or document or documents. **Recommended**: To refresh the page, press F5.
- **parameter**: In our API documentation, _parameter_ is usually short for _query parameter_; it's a `NAME=VALUE` pair that's appended to a URL in an HTTP `GET` request. In some contexts, however, the term can have other meanings.
- **parent-child or parent/child**: Not _parent – child_ or _parent—child_.
- **path**: Avoid using _filepath_, _file path_, _pathname_, or _path name_ if possible.
- **peer gateway**: Don't use _on-premises gateway_ when you mean a _peer gateway_. A peer gateway can be an on-premises device or service or another cloud gateway.
- **peer network**: Don't use _on-premises network_ when you mean a _peer network_. A peer network can be an on-premises network or another cloud network.
- **peering zone**: Not _peer zone_.
- **per**: To express a rate, use _per_ instead of the division slash (/), unless space constraints require the use of the slash. For more information, see Units of measurement. Avoid _per_ in contexts other than rate units. **Recommended**: requests per day **Recommended**: create a policy for each Pod **Recommended**: according to the style guide **Recommended**: in response to your request **Not recommended**: requests/day **Not recommended**: create a policy per Pod **Not recommended**: per the style guide **Not recommended**: as per your request
- **performant** [avoid]: Avoid where possible. Instead, use a more precise term. **Recommended**: an accurate machine learning model **Not recommended**: a performant machine learning model
- **persist**: Don't use as a transitive verb. It's best to avoid using as a verb at all, especially in passive voice. **Recommended**: To make the token persistent ... **OK**: To make the token persist ... **Not recommended**: The token is persisted ... **Not recommended**: To persist the token ...
- **persistent disk**: Not _PD_. Lowercase except at the start of a sentence.
- **personally identifiable information (PII)**: Some government agencies use the less common term _personally identifying information_; use this alternate term only in contexts where you're referring to a document that uses this term.
- **pets versus cattle, pets vs. cattle, pets v. cattle** [don't use]: Don't use. Instead, use more precise terms like _persistent versus dynamic_ or _manually configured versus automated_. For more information, see Avoid figurative language.
- **plain text**: In most contexts, use _plain text_, but use _plaintext_ in a cryptography context.
- **please** [avoid]: Don't use _please_ in the normal course of explaining how to use a product, even if you're explaining a difficult task. Don't use the phrase _please note_. Use _please_ only when you're asking for permission or forgiveness—for example, when what you're asking for benefits you, inconveniences a reader, or suggests a potential issue with a product. **Recommended**: If the issue persists, please contact your account representative. For more information, see voice and tone.
- **plugin (noun), plug-in (adjective), plug in (verb)**: Use the noun form _plugin_ when referring to the software component. Use the adjective form _plug-in_ when referring to the action of installing a software component. Use the verb form _plug in_ when you're describing the process of installing a software component.
- **PM**: See AM, PM.
- **point to**: Use to refer to the action of pointing the mouse pointer (focus). This action doesn't imply a length of time waiting for the UI to react to user action. This is similar to the action hold the pointer over (hover). In most cases, it's better to use the verb phrase _hold the pointer over_ if you want the user to wait for the UI to react.
- **POJO**: If you're not actually writing about a Plain Old Java Object for a Java audience, use _simple object_. You can write _a simple object, similar to a POJO in Java_ if that helps your audience.
- **PoP**: Acronym for _point of presence_. **Recommended**: point of presence (PoP) **Not recommended**: point of presence (POP)
- **pop-up, popup**: Don't use. To describe a window that appears and asks for, or presents, additional information, use _dialog_. To describe a menu that rises from an interface (such as a right-click context menu), use _menu_.
- **populate**: OK to use if you're writing about a process populating a table or other entity. If you're writing about a person, use _fill in_. **Recommended**: The SQL command populates the table with sample data. **Recommended**: When you have finished filling in the form ... **Not recommended**: When you have finished populating the form ...
- **port**: Use _listen on_ (not _to_).
- **portal** [avoid]: Don't use to refer to the Google Cloud console. For more information, see console.
- **possible** [don't use]: Don't use _possible_ or _impossible_ to mean _you can_ or _you can't_.
- **PostgreSQL**: If the UI uses the name _Postgres_, it's OK to match the UI. Don't use _PostgreSQL_.
- **postmortem** [avoid]: Avoid in general usage. Instead, use _retrospective_. In disaster recovery (DR) and DevOps contexts, use _blameless postmortem_.
- **practitioner**: Avoid using without any supporting information to define the roles that you're referring to. **Recommended**: The framework describes best practices for architects, developers, administrators, and other cloud practitioners. **Not recommended**: The framework describes best practices for cloud practitioners.
- **pre***: See guidance about hyphens with prefixes.
- **prebuilt**: Not _pre-built_.
- **precapture**: Not _pre-capture_.
- **preemptible**: Not _pre-emptible_ or _pre-emptive_.
- **pre-existing**: Not _preexisting_.
- **preferred pronouns** [don't use]: Don't use. Instead, use _pronouns_.
- **prerecorded**: Not _pre-recorded_.
- **pre-shared key**: Not _preshared key_.
- **presently, at present** [avoid]: Avoid because this word or phrase is implied. The word or phrase can also prematurely disclose product or feature strategy or inappropriately imply that a product or feature might change. See also as of this writing and currently. **Recommended**: This setting is required. **Not recommended**: At present, this setting is required. For more information, see Timeless documentation.
- **press**: Use when referring to pressing a key or a key combination to cause an action to occur. Also use for mechanical buttons. For on-screen and soft (capacitive) buttons, use _tap_. **Recommended**: Press Control+C (or Command+C on macOS).
- **presubmit**: Not _pre-submit_.
- **primitive** [avoid]: Use with caution. Don't use _primitive_ in a disparaging sense.
- **project** [Cloud]: In Google Cloud documentation, use _Google Cloud project_ on first mention and in any context in which there might be ambiguity about what kind of project you're referring to.
- **pros** [don't use]: Don't use. Instead, use a more precise term, such as _advantages_.

### Q

- **quick, quickly** [avoid]: What might be quick for you might not be quick for others. Try eliminating this word from the sentence because usually the same meaning can be conveyed without it.
- **quota**: In API contexts, often refers to API usage limits. Where possible, it's best to use a more specific term, such as _usage limit_; the word _quota_ means many different things to many different people. In some contexts, such as Google Cloud documentation, the standard term is _quota_, so use that term.

### R

- **RDP**: Don't use as a verb. Instead, use _connect using RDP_. If it's clear from context that they're using RDP, it's OK to use _connect_.
- **re***: See guidance about hyphens with prefixes.
- **read-only**: Not _read only_. Always hyphenate _read-only_.
- **recents screen** [Android]: In Android contexts, use instead of _overview screen_.
- **redline** [don't use]: Don't use as a verb. Instead, use precise terms appropriate to the context. In the context of editing or providing a review, refer to those actions or to _tracking changes_. In the context of setting priorities and planning work, refer to those actions or to _priority lining_.
- **regex** [don't use]: Don't use. Instead, use _regular expression_.
- **rehost**: Use to describe the migration of an app or workload with no changes or minimal changes to that app or workload. Also known as _lift and shift_. For more information, see Rehost: lift and shift in the Cloud Architecture Center. On first mention, associate rehost with lift and shift. Okay to use _rehosting_ as needed after first mention. **Recommended**: You can use this reference architecture to efficiently rehost (lift and shift) on-premises applications to the cloud. **Recommended**: The first step to modernization is to rehost your application in the cloud (also known as lift and shift). Don't use _the forklift approach_.
- **repo** [don't use]: Don't use. Instead, use _repository_.
- **Representational State Transfer** [don't use]: Don't use. To people unfamiliar with REST, this acronym expansion is meaningless; it's better to refer to it as REST and not explain what it stands for.
- **reservation, off the** [don't use]: Don't use.
- **resource record set**: Not _resource recordset_.
- **retarded** [don't use]: Don't use. If you are referring to a system or component being slowed, use the word _slowed_.
- **retriable, triable** [don't use]: Don't use _retriable_ or _triable_, unless a code item uses that spelling. Outside of code font, write around the term.
- **retryable, tryable** [avoid]: Where possible, write around _retryable_ and _tryable_. For example, write out _you can try it again_ or _can be tried again_.
- **review**: If you mean "read, potentially for the first time," then use _read_ instead of _review_. If you mean "read critically, commenting on problems" (as in _code review_), then _review_ is fine. Avoid using phrasing like "If you've never heard of OAuth, then review the OAuth documentation."
- **RFC**: When referencing an RFC specification, use a space between _RFC_ and the number (for example, _RFC 2318_).
- **roll out** [avoid]: Don't use to mean a sudden or instantaneous launch. If you use _roll out_, define what you mean. When possible, use a more precise, non-figurative term like _gradual_, _in stages_, _phases_, or _progressive_.
- **RTFM** [don't use]: Don't use. Instead, use a more precise phrase like "For more information, see ...."
- **runbook**: Not _run book_.
- **runtime, run time**: Use the noun _runtime_ when referring to the environment in which software runs, such as a Ruby or Java runtime. Use the noun phrase _run time_ when referring to the time during program execution when something occurs, as contrasted with _compile time_, for example. **Recommended**: The profiler collects data at run time, and the scheduler uses this data at compile time to improve performance for subsequent runs. **Recommended**: The App Engine standard environment has two generations of runtime environments. The second-generation runtimes significantly improve the capabilities of App Engine.

### S

- **SaaS**: Write out on first mention: _software as a service (SaaS)_.
- **sane** [don't use]: Don't use. Instead use a word like _valid_ or _sensible_.
- **sanity check** [don't use]: Don't use. Instead, use a term like _quick check_, _confidence check_, _preliminary check_ or _coherence check_.
- **SAP**: Pronounced as the individual letters _S_, _A_, _P_, so write _an SAP system_, not _a SAP system_. For more information, see Indefinite articles before abbreviations.
- **scale**: Don't use _scale_ alone to say that something is large or increasing. Include supporting words to indicate magnitude or direction of change in magnitude, whether scaling up or down, such as when you change a machine type to add or remove CPUs or RAM, or scaling out or in, such as adding or removing instances from a group. **Recommended**: The system performs better at a larger scale. **Not recommended**: The system performs better at scale. **Recommended**: The system scales up quickly, but it scales down more slowly. **Not recommended**: The system scales quickly.
- **screenshot (noun)**: Not _screen shot_ or _screensnap_. Don't use as a verb; instead, use _take a screenshot_.
- **scroll**: OK to use _scroll_ as a verb, but if possible, instead use a term that isn't specific to implementation. For example, write _go to the section_, instead of _scroll to the section_. If you use _scroll_, don't use directional language like _scroll up_. For more information, see Accessibility.
- **Search (as part of product name)**: Capitalize _Search_ when referring to a product like Google Search.
- **Search Console**: Capitalize each word in _Search Console_.
- **see**: OK as a general term and when referring to links and cross-references. Our research indicates that language relating to sight is OK for a wide range of readers. For more information, see Cross-references and linking.
- **select**: Use to describe choosing an item from among multiple options, selecting text, or marking a checkbox. **Recommended**: Select **Automatically check for updates**. **Not recommended**: Check **Automatically check for updates**.
- **sensitive**: _Sensitive_ data is data for which the release might be harmful. See confidential.
- **service**: It's OK to refer to Google products, such as Google Kubernetes Engine or Compute Engine, as _services_. However, if the term _services_ leads to ambiguity, then use the product names.
- **service level agreement**: Lowercase when referring to service level agreements in general. It's OK to use title case (_Service Level Agreement_) when referring to a specific document. OK to abbreviate as _SLA_ after first use.
- **service level indicator**: Lowercase except at the beginning of a sentence, heading, or list item. OK to abbreviate as _SLI_ after first use.
- **service level objective**: Lowercase except at the beginning of a sentence, heading, or list item. OK to abbreviate as _SLO_ after first use.
- **setup (noun or adjective), set up (verb)**: (headword is the rule)
- **sexy** [don't use]: Don't use. Instead, use precise, positive words, such as _fast_, _powerful_, or _elegant_.
- **SHA-1**: Not _SHA1_, except in string literals/enums and in hyphenated phrases such as _HSA-SHA1_.
- **shall** [avoid]: Avoid _shall_ except under advice from a lawyer. For more information, see should.
- **she, her, hers** [avoid]: Don't use a gendered pronoun except for a specific individual of known gender. Use _they_ and _their_ for the general singular pronoun.
- **sherpa** [don't use]: If possible, use a more precise term. For example, if you mean _guide_, use that term.
- **shift left** [avoid]: In general, avoid using this term to mean moving something earlier in time. Instead, use a less figurative phrase, such as _shift earlier_ or _move to an earlier phase_. This figurative term relies on the non-universal assumption that the natural flow is from left to right. It's OK to use _shift left_ and _shift right_ in the context of binary multiplication and division.
- **should, should be** [avoid]: Generally avoid. Because _should_ is ambiguous by definition, it can be problematic. For more information and alternatives, see Word choice for recommendations and requirements. See also can, could, may, might, must, and would.
- **sign-in (noun or adjective), sign in (verb)**: Not _log in_ or _signin_.
- **sign into** [don't use]: Don't use. Instead, use _sign in to_.
- **sign-on, sign on** [don't use]: Don't use either form on its own. Use the hyphenated version as part of _single sign-on_.
- **sign-out (noun or adjective), sign out (verb)**: Not _log out_ or _signout_.
- **simple, simply** [avoid]: What might be simple for you might not be simple for others. Try eliminating this word from the sentence because usually the same meaning can be conveyed without it.
- **since**: If you mean _because_, then use _because_ instead of _since_. _Since_ is ambiguous; it can refer to the passage of time. _Because_ refers to causation or the reason for something.
- **single most**: Not _singlemost_.
- **single pane of glass**: Avoid. This term is used to favorably compare a centralized control and monitoring interface against the alternative of several disparate interfaces. It can almost always be replaced by _single interface_ or _unified interface_.
- **single sign-on (noun or adjective)**: (headword is the rule)
- **slave** [don't use]: Don't use. Instead, use alternative terms appropriate to your domain, such as _worker_ or _replica_. If you're replacing the terms _master_ and _slave_ together, then consider such combinations as _primary_/_secondary_, _primary_/_replica_, _original_/_replica_, _controller_/_worker_, _initiator_/_responder_, _mixer_/_leaf_, _aggregator_/_collector_, _publisher_/_subscriber_, _leader_/_follower_, and _active_/_standby_. If the command or code that you're documenting uses the literal word _slave_, then use this word only in direct reference to the code item (formatted as code), make it clear what you're referring to, and use the new term thereafter. For example, "Invoke the secondary (`slave`) process directly when debugging issues between the primary and secondary processes." See also master.
- **slice and dice** [don't use]: Don't use the phrase _slice and dice_. Instead, use specific terms appropriate to the task that you're describing. Some possible options include: _segment data for analysis_ or _break information into smaller parts_.
- **smartphone, smart phone** [don't use]: Don't use. Instead, use _mobile phone_ or _phone_. If you're talking about more than phones, then use _mobile device_. It's OK to use _phone_ (without _mobile_) when the context is clear.
- **soon** [avoid]: Avoid in timeless documentation because this word can become outdated. The word can also prematurely disclose product or feature strategy or inappropriately imply that a product or feature might change. See also eventually and future. **Recommended**: This setting is optional. **Not recommended**: This setting is optional for existing applications but will soon be required for all applications. For more information, see Timeless documentation.
- **spin up** [avoid]: As in _spin up an instance_. Avoid using _spin up_ unless you're referring to a hard disk; instead, use a less colloquial term like _create_ or _start_.
- **SQL**: Refer to _a SQL_ (pronounced "a sequel"), not _an SQL_. For more information, see Indefinite articles before abbreviations.
- **ssh and SSH**: Don't use `ssh` or SSH as a verb. SSH is a secure communications protocol; `ssh` is a utility. **Recommended**: To establish an SSH connection, use the `ssh` command. **Recommended**: Connect to the instance by using SSH. **Not recommended**: `ssh` into your remote shell.
- **ssh'ing** [don't use]: Don't use. See also ssh and SSH. **Recommended**: When you use `ssh` to log in ...
- **startup (noun or adjective), start up (verb)**: (headword is the rule)
- **static external IP address**: Don't use _static IP address_ or _external IP address_ to refer to static external IP addresses.
- **status bar**: Not _statusbar_ or _status-bar_. Lowercase except at the beginning of a sentence, heading, or list item.
- **STONITH, STOMITH** [avoid]: Avoid using graphic or metaphorical language. Instead, explain the relevant feature, such as _fence failed nodes_.
- **style sheet**: _Style sheet_ and _stylesheet_ are both acceptable spellings. However, be consistent with your choice throughout a given document.
- **sub-command**: Not _subcommand_.
- **subnet**: OK to use as a shortening of _subnetwork_. Use the same term consistently throughout your document. For more information, see Subnets vs. subnetworks.
- **subtree**: Not _sub-tree_.
- **subzone**: Not _sub-zone_ or _sub zone_.
- **such as**: Use _such as_ to introduce examples or draw comparisons. Note that _such as_, _like_, and _include_ introduce non-exhaustive lists, so it's redundant to combine them with _etc._, _so forth_, or _and more_. See also etc., like. For more information, see Format examples.
- **surface**: Avoid as a transitive verb; instead, use a more specific term, such as _make people aware of_ or _expose_. **Recommended**: To make the audit logs available, you must configure the monitoring system. **Not recommended**: To surface audit logs, you must configure the monitoring system.

### T

- **tab**: When referring to the sub-pages of a console, use _page_ instead of _tab_.
- **table name**: Two words. Set specific table names in code font.
- **tablet**: _Tablet_ is OK. If you don't know whether it's a tablet or a phone, use _device_.
- **tag**: See element.
- **tap** [Android]: In Android documentation, use for on-screen and soft (capacitive) buttons. Use instead of _click_ when the environment is definitely a touch device. Use instead of _touch_. However, _touch & hold_ (not _touch and hold_) is OK to use. For mechanical buttons, use _press_.
- **tap & hold, tap and hold** [don't use] [Android]: In Android documentation, don't use. Instead, use _touch & hold_. (Not _touch and hold_.)
- **tarball** [don't use]: Don't use. Instead, use _tar file_.
- **target**: Avoid using as a verb when possible, especially in reference to people. For some readers, _target_ has aggressive connotations. Instead of "targeting" audiences, we try to attract them or appeal to them or make their lives easier. It's OK to use _target_ as an adjective, as in _target audience_, but consider rephrasing for clarity. Alternatives include phrases such as _intended for_, _looking for_, _focused on_, and _interacting with_.
- **terminate** [avoid]: Avoid using as a synonym for _stop_. Instead, use words like _stop_, _exit_, _cancel_, or _end_. For a specific context where you can use _terminate_ as a synonym for _stop_, see Documenting command-line syntax. In some contexts, such as telephony and networking, _terminate_ has specific technical meanings that aren't synonyms for _stop_; in those contexts, you can use _terminate_.
- **text box, textbox** [don't use]: Don't use. Instead, use _box_. For more information, see Text box. In Google Cloud documentation, use _field_ instead of _box_. For example, "In the **Instance** field, specify a value less than 64 characters long." In Google Workspace documentation, use _field_ instead of _box_. For example, "In the **Instance** field, specify a value less than 64 characters long."
- **their (singular)**: See _they_.
- **then**: Although it is common in casual usage to omit the word _then_ in _if...then_ statements, you should include helper words like _then_ in technical documentation. For more information, see Use clear, precise, and unambiguous language.
- **they (singular)**: This is our preferred gender-neutral pronoun. Whether used as singular or plural, it always takes the plural verb. **Recommended**: A user enters their password, and then they insert their security key. See also gender-neutral he.
- **third party (noun), third-party (adjective)**: Spell as _third party_ when used as a noun and as _third-party_ when used as an adjective. Avoid abbreviating to _3rd party_ or _3rd-party_. For more information, see Ordinal numbers.
- **this, that**: Where possible, put a noun after _this_ or _that_ for clarity. If doing so results in clunky prose, then don't do it; but even then, try thinking about what the noun would be. If you aren't sure what noun _this_ or _that_ refers to, then consider rephrasing—otherwise, your reader probably won't know what noun you're referring to, either.
- **timeframe**: Not _time frame_. Avoid where possible, or use an alternative such as _period_, _schedule_, _deadline_, or _when_. But if you do use it, then write it as one word.
- **timeout (noun), time out (verb)**: (headword is the rule)
- **timestamp**: Not _time stamp_.
- **time to live**: Not _time-to-live_. Abbreviate as _TTL_ after first use.
- **time zone (noun), time-zone (adjective)**: Spell as _time zone_ when used as a noun and as _time-zone_ when used as an adjective. See also wake lock (noun), wake-lock (adjective).
- **tl;dr** [don't use]: Don't use. Instead, use something like _To summarize_, or revise the sentence.
- **toolkit**: Not _tool-kit_ or _tool kit_.
- **touch** [don't use] [Android]: In Android documentation, don't use. Instead, use _tap_. However, _touch & hold_ is OK to use.
- **"touch & hold"** [Android]: Not _touch and hold_.
- **touchscreen**: Not _touch screen_
- **traditional** [avoid]: If possible, use a more precise term. **Recommended**: Conventionally, Python function names are lowercase, with words separated by underscores. **Not recommended**: Traditionally, Python function names are lowercase, with words separated by underscores. **Recommended**: This tutorial explains how to migrate from an on-premises data warehouse to BigQuery. **Not recommended**: This tutorial explains how to migrate from a traditional data warehouse to BigQuery.
- **transpile**: Not _transcompile_.
- **tribal knowledge, tribal wisdom** [don't use]: Don't use. Instead, use a less figurative term to indicate knowledge held by a group of people.
- **trojan**: Lowercase when referring to malware.
- **turn on** [avoid]: In procedures, use the appropriate label and action for the UI element that the user interacts with. For turning on or activating an option or feature, use _turn on_ or enable consistently. Use the same term consistently throughout your document. **Recommended**: To turn on Magic Mode, follow these steps. **Recommended**: In **Settings**, click the **Magic mode** toggle to the on position.
- **tutorial**: OK to use. See documentation.
- **type** [avoid]: In general, use enter instead of _type_ because there is typically more than one way to enter text than typing (such as pasting text or speaking).
- **typically**: Use to describe what is usual or expected under normal circumstances. Don't use as the first word in a sentence, as doing so can leave the meaning open to misinterpretation.

### U

- **UI**: Don't use generically to refer to a page or dashboard. Use a more specific term like _page_ or _console_. If a specific term is unavailable, use _web interface_. **Recommended**: In the Google Cloud console **Recommended**: On the **Cloud Tasks** page **Recommended**: In the Secure Source Manager web interface **Not recommended**: In the **Cloud Tasks** UI
- **unarchive** [don't use]: Don't use. Instead, use _extract_.
- **uncheck** [don't use]: Don't use to refer to clearing a check mark from a checkbox. Instead, use _clear_. **Recommended**: Clear **Automatically check for updates**. **Not recommended**: Uncheck **Automatically check for updates**. **Not recommended**: Deselect **Automatically check for updates**.
- **uncompress** [don't use]: Don't use. Instead, use _extract_.
- **under** [don't use]: Don't use for a range of version numbers. Instead, use _earlier_. Don't use to refer to a position in the UI. **Recommended**: In the **Service account ID** field, enter a name. **Recommended**: For **Service account ID**, enter a name. **Not recommended**: Under **Service account ID**, enter a name.
- **Unicode**: Not _UNICODE_.
- **Unix-like**: Not _Unixlike_ or _Unix like_.
- **Unix epoch time**: Use instead of _Unix time_ or _epoch time_ to refer to a point in time represented as a number of seconds since the Unix epoch (00:00:00 UTC on January 1, 1970), ignoring leap seconds.
- **unselect** [don't use]: Don't use. Instead, use _clear_ for checkboxes, and _deselect_ for other UI elements.
- **unsighted** [don't use]: Don't use. See blind.
- **untar** [don't use]: Don't use. Instead, use _extract_.
- **unzip** [don't use]: Don't use. Instead, use _extract_.
- **US**: OK to use as an abbreviation for _United States_. Don't use _U.S._ or _U.S.A._ For more information, see Periods with abbreviations.
- **user**: Use the word _user_ only to refer to the user of the software that your reader is developing. Otherwise, address the reader as _you_ and assume that they will complete the tasks that you're documenting. For more information, see Second person and first person.
- **user base**: Not _userbase_.
- **using**: Where _using_ might have more than one interpretation, use _by using_ to help clarify the logic of the sentence. **Recommended**: You can filter for data with specific attributes by using custom filters. **Not recommended**: You can filter for data with specific attributes using custom filters.
- **UTF**: Include the hyphen in the names of Unicode encodings, such as _UTF-8_, _UTF-16_, and _UTF-32_.
- **utilize, utilization** [avoid]: Use with caution. Don't use _utilize_ when you mean _use_. It's OK to use _utilize_ or _utilization_ when referring to the quantity of a resource being used. **Recommended**: When CPU utilization exceeds 75%, the autoscaler adds more CPU resources. **Recommended**: To distribute network traffic, use a load balancer. **Not recommended**: To distribute network traffic, utilize a load balancer.

### V

- **v (abbreviating _version_)**: Use lowercase.
- **via** [don't use]: Don't use.
- **vice versa** [don't use]: Don't use. Write out the relationship explicitly. To emphasize the reciprocal or contrasting relationship, you can use a more precise term like _conversely_. **Not recommended**: You can copy local files to the cloud and vice versa. **Recommended**: You can upload local files to the cloud or download cloud files to your local environment. **Recommended**: You can upload local files to the cloud. Conversely, you can download cloud files to your local environment.
- **virtual machine (VM) instance**: Use when first introducing virtual machines on a given page. For subsequent mentions, you can use _VM instance_ or _VM_. For Google Cloud: on first mention of a Compute Engine VM, use _Compute Engine instance_ and then use _compute instance_ throughout the rest of the document. If you need to indicate other types of VMs, use _VM_, _VM instance_, or _bare metal instance_. See also GKE node.
- **visually challenged** [don't use]: See blind.
- **VLAN attachment**: Don't use the following: _interconnect attachment (VLAN)_, _Interconnect attachment_, _Cloud Interconnect attachment_, or any variation thereof. See also interconnectAttachment.
- **voila** [don't use]: Don't use.
- **voodoo** [don't use]: Don't use. Instead, use a term like _mysterious_, _complicated_, or _nondeterministic_.
- **vs.** [don't use]: Don't use _vs._ as an abbreviation for _versus_; instead, use the unabbreviated _versus_.

### W

- **wake lock (noun), wake-lock (adjective)**: Spell as _wake lock_ when used as a noun and as _wake-lock_ when used as an adjective. See also time zone (noun), time-zone (adjective).
- **walkthrough**: Not _walk-through_.
- **war room, warroom, war-room** [don't use]: Don't use. Instead, use a more precise term to describe the activity or team. Depending on context, possible alternatives include _rapid response team_, _situation response team_, _situation room_, _incident-management team_, or _media monitoring room_.
- **warm**: When possible, avoid jargon like _warm failover_, _warm standby_, and _warm spare_. If you use one of these phrases, define it on first use and use it consistently throughout the document.
- **we**: Don't use _we_ (or other first-person plural pronouns such as _our_ or _us_) to address the reader who is performing the tasks that you're documenting. Instead, use _you_. It's OK to use _we_ to refer to the organization that's represented as the author of the document as long as the antecedent is clear. For more information, see Second person and first person.
- **web (lowercase)**: (headword is the rule)
- **WebAssembly, Wasm**: Use the capitalization established in the WebAssembly specification.
- **web application firewall (lowercase)**: (headword is the rule)
- **webmaster, web master** [don't use]: Don't use. Instead, use a more precise term to describe the specific role, such as _website owner_, _website administrator_, _web content manager_, _owner of a site_.
- **web server**: Not _webserver_.
- **whether**: • To decide whether it's more appropriate to use _if_ or _whether_, see Grammar Girl's discussion of _if_ and _whether_. • To decide whether you need to add _or not_ when using _whether_, see the New York Times's blog post about whether (or not).
- **while**: Don't use to indicate a contrast. Instead, use a more precise term, such as _although_. OK to use to refer to a period of time.
- **white-box** [avoid]: Avoid using _white-box_, _whitebox_, or _white box_ to describe monitoring and testing. Consider using a more precise term for clarity. • For monitoring, use _introspective monitoring_. • For testing, use _clear-box testing_.
- **white glove, white-glove, whiteglove** [avoid]: Avoid using. Instead use terms like _high-touch_, _premium_, or _platinum-level_.
- **whitehat, white hat, white-hat** [don't use]: Don't use. Instead, use precise terms for the kind of compliance, such as _legal_, _ethical_, or _following the rules_.
- **white label, whitelabel, white-label** [avoid]: Don't use. Instead, use a more precise term for your context, such as _unbranded_, _unlabeled_, or _blank label_.
- **whitelist, white list, white-list** [don't use]: Don't use. See blacklist.
- **whitelisted, white listed, white-listed** [don't use]: Don't use. See blacklist.
- **whitelisting, white listing, white-listing** [don't use]: Don't use. See blacklist.
- **whitepaper**: Not _white paper_. When possible, use a more precise term. The term _whitepaper_ has a variety of meanings in various contexts. If you must use the term _whitepaper_, also use descriptive terms to provide context.
- **whitespace**: Not _white space_.
- **wildcard**: Not _wild card_.
- **will**: Avoid. Applies equally to its past tense, _would_. See also Present tense and Documenting future features.
- **wish** [don't use]: Don't use. Instead, use a word like _want_ or _need_.
- **with**: Don't use _with_ when expressing ownership: **Recommended**: A handset that has 2 GB of RAM. **Not recommended**: A handset with 2 GB of RAM. Don't use _with_ when expressing use: **Recommended**: Use the debugging tool to debug. **Not recommended**: Debug this tool with the debugging tool.
- **workload**: The term _workload_ might refer to software, like an app or a service; to app resources, like data and infrastructure; or to physical components that work together. Where possible, use a more precise term to describe what you mean. If you use the term _workload_, define your meaning on first use as you normally would with jargon and other ambiguous terms.
- **World Wide Web** [don't use]: Don't use. Instead, use _web_.
- **would** [avoid]: Avoid using. Instead, use _can_ where possible. See also can, could, may, might, must, and should. For information about clarifying who's performing an action, see Active voice. For information about tenses, see Present tense.

### Y

- **ymmv** [don't use]: Don't use. Instead, use something like _Your results might vary_.
- **you**: Use _you_ instead of _user_ to address the reader of your document. For more information, see Second person and first person.

### Z

- **zippy** [avoid]: Don't use to refer to expander arrows, unless you're specifically referring to the Zippy widget in Closure.

## 2. High-frequency entries for developer prose

Curated from the 598 entries above: the ones most likely to matter when writing READMEs, wikis, dev-docs, and release notes for a JavaScript/Node.js library or CLI. Each line is `term — guidance`, preferred form first; the page's flag is in brackets. All of these exist on the page (headword in bold is the page's headword, sometimes shortened).

### UI actions and instructions

- **click** — Use _click_ for mouse targets (buttons, links, list items). Don't use _click on_ ("Click **OK**", not "Click on **OK**"). Hyphenate _right-click_, _left-click_, _double-click_. _click in_ is OK for a region needing focus, not for a control. Android: use _tap_.
- **click here** [don't use] — Don't use; write descriptive link text (see "Avoid vague link text").
- **tap** [Android] — Use instead of _click_ when the environment is definitely a touch device; for mechanical buttons use _press_.
- **press** — Use for pressing a key or key combination, and for mechanical buttons ("Press Control+C (or Command+C on macOS)"). On-screen/capacitive buttons: _tap_.
- **hit** [don't use] — Don't use as a synonym for _click_, _press_, or _type_.
- **enter** — Use _enter_ for the user entering text ("In the **Owner** box, enter your name"). If it matters that the user not press Enter, say so.
- **type** [avoid] — In general use _enter_ instead of _type_ (text can be pasted or spoken, not only typed).
- **select** — Use for choosing an item among options, selecting text, or marking a checkbox ("Select **Automatically check for updates**").
- **choose** — Fine in generic contexts; for UI elements use _select_.
- **check** [avoid] — Don't use for marking a checkbox; use _select_.
- **checkbox** — Not _check box_.
- **uncheck** [don't use] — Don't use; use _clear_ ("Clear **Automatically check for updates**").
- **clear** — The verb for removing a check mark from a checkbox.
- **deselect** [don't use] — Don't use for checkboxes; use _clear_. (**unselect** [don't use] — Don't use; _clear_ for checkboxes, _deselect_ for other UI elements.)
- **drag** — Use _drag_, not _click and drag_ and not _drag and drop_; _drag-and-drop_ is OK as an adjective.
- **hover** [don't use] — Don't use; use _hold the pointer over_ (when the user must wait for the UI to react) or _point to_ (no wait implied).
- **turn on** [avoid] / **enable** / **disable** [avoid] — In procedures, use the label and action of the actual UI element. For activating a feature, use _turn on_ or _enable_ consistently throughout a document. Don't use _disable_/_disabled_ for something broken; prefer _inactive_, _unavailable_, _deactivate_, _turn off_, or _deselect_ by context. For "make it feasible to do X" use _lets you_, not _enables you to_ / _allows you to_. Workspace docs: prefer _turn on_ / _on_.
- **drop-down** [avoid] — Usually omit: write _list_ or _menu_; include _drop-down_ only when needed to disambiguate; never as a standalone noun.
- **dialog** — Use _dialog_ for the UI element (not _dialog box_); _dialogue_ only for conversation between people.
- **pop-up, popup** — Don't use. Use _dialog_ for a window that asks for or presents information; _menu_ for a menu that rises from the interface (for example, a right-click context menu).
- **button** — A link isn't a button; don't call a link a _button_. You _press_ mechanical buttons and _tap_ on-screen/capacitive ones.
- **display (verb)** — Transitive only: "The area is displayed" or "The area appears", not "The area displays". (OK: "The area displays the image.")
- **scroll** — OK as a verb, but prefer implementation-neutral wording ("go to the section"); no directional language like _scroll up_.
- **fill in; fill out** — _fill in_ individual fields; _fill out_ a whole form.
- **Copy and paste** [avoid] — Say what to enter, not how ("In the **Query** field, enter the output from the previous step").
- **Create a new …** [avoid] — Use "Create a project", not "Create a new project", unless distinguishing from another recently created item.
- **Control+S, Command+S, and other keyboard commands** — Write Control+CHARACTER (uppercase letter); not _Ctl-S_, _Cmd-S_. Mention both when the audience spans macOS and Windows/Linux: "Control+S (Command+S on macOS)".
- **under** [don't use] — Not for version ranges (use _earlier_) and not for UI position ("In the **Service account ID** field, enter a name", not "Under **Service account ID**, enter a name").

### Sign-in, accounts, people

- **sign-in (noun or adjective), sign in (verb)** — Not _log in_ or _signin_. **sign-out / sign out** — not _log out_ or _signout_.
- **sign into** [don't use] — Use _sign in to_.
- **sign-on, sign on** [don't use] — Not on their own; hyphenated only inside _single sign-on_. **single sign-on (noun or adjective)** (headword is the rule).
- **login (noun or adjective), log in (verb)** — For the verb, _sign in_ is generally better; if the tool you document says _log in_, use that.
- **account name** [don't use] — Use _username_.
- **email** — Not _e-mail_, _Email_, or _E-mail_. Don't use as a verb; put a verb in front: _send email_.
- **user** / **you** / **we** — Address the reader as _you_; reserve _user_ for the user of the software your reader is developing. Don't use _we_/_our_/_us_ to address the reader performing tasks; _we_ is OK for the authoring organization when the antecedent is clear.
- **he, him, his** [avoid] / **she, her, hers** [avoid] / **gender-neutral he, him, or his** [don't use] / **they (singular)** / **their (singular)** — No gendered pronoun except for a specific individual of known gender. Use singular _they_/_their_ (always takes the plural verb). Don't use _he/she_ or _(s)he_.
- **guys, you guys** [don't use] — Use _everyone_ or _folks_.
- **let's (as a contraction of _let us_)** [don't use] — Don't use if at all possible ("Let's click the **OK** button now" is Not recommended).

### Modal verbs and requirements

- **can** — Permission/ability ("You can access the server"), optional action, or possible outcome ("The process can take 30 minutes").
- **may** — Reserve for official policy or legal considerations. For possibility use _can_ or _might_; for permission use _can_.
- **might** — Possibility or uncertain outcome ("You might be prompted to enter your credentials").
- **must** — A required action or state ("You must have the Editor role"); _you need_ also works.
- **should, should be** [avoid] — Generally avoid; ambiguous by definition (see "Word choice for recommendations and requirements").
- **could** [avoid] / **would** [avoid] — Avoid; use _can_ where possible.
- **will** — Avoid (present tense; applies to _would_ too).
- **shall** [avoid] — Only under advice from a lawyer.

### Filler, hedges, and tone

- **please** [avoid] — Don't use in the normal course of explaining how to use a product; don't write _please note_. Only when asking permission or forgiveness ("If the issue persists, please contact your account representative").
- **simple, simply** [avoid] / **easy, easily** [avoid] / **quick, quickly** [avoid] — What is simple/easy/quick for you might not be for others; delete the word.
- **just** [avoid] — Usually filler; delete ("BigQuery skips the row", not "BigQuery just skips the row"). If needed, use _only_, _instead_, _previously_. When conveying that one approach is simpler, use _just_ rather than _simply_.
- **utilize, utilization** [avoid] — Don't use _utilize_ when you mean _use_. OK for the quantity of a resource being used ("CPU utilization exceeds 75%").
- **leverage** [avoid] — Avoid when you mean _use_; use _use_, _build on_, or _take advantage of_.
- **in order to** [avoid] — Use _to_ ("use monitoring to help identify issues"); keep _in order to_ only when needed for clarity.
- **allows you to** [don't use] — Use _lets you_ ("The API lets you detect features", not "enables/allows you to").
- **desire, desired** [don't use] / **wish** [don't use] — Use _want_ or _need_ ("Set the value to the size that you want", not "the desired size").
- **possible** [don't use] — Don't use _possible_/_impossible_ to mean _you can_/_you can't_.
- **functionality** [avoid] — Overused; usually _capabilities_ or _features_ is meant.
- **performant** [avoid] — Use a more precise term ("an accurate model", not "a performant model").
- **impact** [avoid] — Noun only; as a verb use _affect_ ("This issue affects user experience").
- **actionable** [avoid] — Leave it out or use _that you can act on_ / _useful_.
- **access (verb)** [avoid] — Use friendlier _see_, _edit_, _find_, _use_, or _view_.
- **comprise** [don't use] — Use _consist of_, _contain_, or _include_.
- **exploit** — Never to mean "use"; only in the negative sense (_exploiting a security vulnerability_).
- **target** — Avoid as a verb, especially about people; _target audience_ as an adjective is OK (alternatives: _intended for_, _focused on_).
- **interface** — OK as a noun; don't use as a verb (use _interact_, _communicate_).
- **key** — Don't use as an adjective meaning _crucial_; as a noun, say which kind of key on first mention.
- **execute** — When the meaning is the same, use the simpler _run_.
- **review** — If you mean "read", use _read_; _review_ is fine for "read critically" (_code review_).
- **foo** [avoid] / **bar** [avoid] / **baz** [avoid] — Use clearer, meaningful placeholder names.
- **aka** [don't use] — Write _also known as_, or use parentheses or _or_ ("Geographic data (geospatial data) is …").
- **vice versa** [don't use] — Write the relationship out; _conversely_ for emphasis.
- **ymmv** [don't use] — Use "Your results might vary". **tl;dr** [don't use] — "To summarize". **RTFM** [don't use] — "For more information, see …".
- **learnings** [don't use] — _knowledge_ or _things that you learned_. **pros** / **cons** [don't use] — _advantages_ / _disadvantages_.
- **voila** [don't use] — Don't use.
- **Google, Googling** [avoid] — Not as a verb; _search with Google_.

### Abbreviations, connectives, and position words

- **e.g.** [don't use] — Use _for example_ or _such as_. **i.e.** [don't use] — Use _that is_. (People confuse the two.)
- **etc.** [avoid] / **and so on** [avoid] — Avoid _etc._, _and so forth_, _and so on_; prefer "problems such as instability or high latency" / "problems, including …". If you must, use _etc._ with its period.
- **vs.** [don't use] — Use the unabbreviated _versus_.
- **via** [don't use] — Don't use.
- **and/or** [avoid] — Don't use unless space is limited (tables).
- **for example** — Follow with a comma; set the example off with dashes, commas, or parentheses, or give it its own sentence ("Enter a name for the instance—for example, `my-instance-99`").
- **for instance** [avoid] — Don't use (confusion with the noun _instance_); use _for example_, _like_, or _such as_.
- **such as** / **like** — Both introduce examples; _such as_, _like_, _include_ introduce non-exhaustive lists, so don't add _etc._ or _and more_. _like_ is also fine for comparisons.
- **above** [avoid] / **below** [avoid] — Not for version ranges (use _later_ / _earlier_), not for document position (use _earlier_/_preceding_ / _later_/_following_), not for UI position (write non-directional instructions). OK non-directionally (hierarchy; set phrases like _below zero_).
- **earlier** / **later** — Use for version ranges: "version 2.2 or later", not "2.2 or higher" or "2.2+"; "2.2 or earlier", not "or lower". Android docs invert this: _higher_/_lower_. Also for document position (_earlier_/_preceding_, _later_/_following_).
- **higher** / **lower** — Don't use for version ranges (except Android) or document/UI position.
- **following** — No noun needed after it unless it helps clarity/accessibility ("in the following code sample", "do the following:").
- **new, newer** [avoid] / **old, older** [avoid] / **latest** [avoid] — Timeless docs: avoid _new_; don't use _newer_/_older_ for versions — use _later_/_earlier_ with a version number; if you must say _latest_, anchor it to a version number or date.
- **currently** [avoid] / **now** [avoid] / **presently, at present** [avoid] / **as of this writing** [avoid] / **does not yet** [avoid] / **soon** [avoid] / **eventually** [avoid] / **future, in the future** [avoid] — Timeless documentation: these are implied, go stale, or leak roadmap ("Windows isn't supported", not "isn't currently supported"). _now_ is OK for an explicit past-vs-present comparison.
- **once** — If you mean _after_, write _after_. **since** / **as** — If you mean _because_, write _because_ (both are ambiguous with time). **while** — Not for contrast (use _although_); OK for a period of time.
- **if** / **then** / **whether** — In technical docs include _then_ in _if…then_ statements; for _if_ vs _whether_ see the page's links.
- **per** — For rates use _per_ not a slash ("requests per day", not "requests/day"); avoid _per_ otherwise ("for each Pod", "according to the style guide", not "per Pod", "per the style guide", "as per").
- **using** — Where _using_ is ambiguous, write _by using_ ("filter … by using custom filters").
- **with** — Not for ownership ("A handset that has 2 GB of RAM") or for use ("Use the debugging tool to debug").
- **each** — Not a synonym for _all_ ("a list of all the items", not "a list of each item").
- **either** / **neither** — Parallel syntax with _either_ ("Do either option 1 or option 2"); _neither A nor B_, not _neither A or B_.
- **this, that** — Put a noun after _this_/_that_ where possible.
- **typically** — Usual/expected behavior; don't start a sentence with it.
- **N/A** — Not _NA_; spell out _not available_ / _not applicable_ on first reference.
- **US** — OK for United States; not _U.S._ or _U.S.A._
- **AM, PM** — All caps, no periods, space before: _9:00 AM_.

### Spelling and compounds (one word / two words / hyphen)

- **setup (noun or adjective), set up (verb)** (headword is the rule). Likewise **startup / start up**, **timeout / time out**, **failover (noun, adjective) / fail over (verb)**, **clickthrough (noun) / click through (verb)**.
- **filename** — Not _file name_. **file system** — Not _filesystem_. **hostname** — Not _host name_. **path** — Avoid _filepath_, _file path_, _pathname_, _path name_.
- **directory, folder** — Match the context's term; otherwise _directory_ in command-line contexts, _folder_ in GUI contexts; default _directory_.
- **runtime, run time** — _runtime_ (noun) = the environment software runs in (a Node.js/Java runtime); _run time_ = the time during execution, as opposed to _compile time_.
- **plugin (noun), plug-in (adjective), plug in (verb)** — _plugin_ for the software component; _plug-in_ adjective; _plug in_ verb.
- **backend** — Not _back-end_ or _back end_. **frontend** — Not _front-end_ or _front end_.
- **codebase** — Not _code base_. **hardcode (verb), hardcoded (adjective)** — Don't hyphenate. **lifecycle** — Not _life cycle_/_life-cycle_. **namespace** — Not _name space_. **whitespace** — Not _white space_. **wildcard** — Not _wild card_. **endpoint** — Not _end point_. **toolkit** — Not _tool-kit_/_tool kit_. **walkthrough** — Not _walk-through_. **runbook** — Not _run book_. **codelab** — Not _code lab_. **whitepaper** — Not _white paper_ (but prefer a more precise term). **web server** — Not _webserver_. **microservices** — Not _Microservices_/_micro-services_. **transpile** — Not _transcompile_. **prebuilt** — Not _pre-built_. **pre-existing** — Not _preexisting_. **presubmit** — Not _pre-submit_. **sub-command** — Not _subcommand_. **inline** — One word as adjective. **ecommerce** — Not _e-commerce_. **Unix-like** — Not _Unixlike_/_Unix like_.
- **read-only** — Always hyphenate. **error-prone (adjective)** — Hyphenate, lowercase. **third party (noun), third-party (adjective)** — Don't abbreviate to _3rd party_. **time zone (noun), time-zone (adjective)**. **high availability (noun), high-availability (adjective)**. **load balancing (noun), load-balancing (adjective)**.
- **timestamp** — Not _time stamp_. **timeframe** — Not _time frame_; avoid where possible (_period_, _schedule_, _deadline_, _when_).
- **key-value pair** — Not _key/value pair_ or _key value pair_. **data type** — Not _datatype_. **blue-green** — Not _blue/green_. **parent-child or parent/child** — Not with a dash. **dash** — A dash (`—`) is not a hyphen (`-`); don't call a hyphen a dash.
- **kebab case, kebab-case** [don't use] — Use _dash-case_.
- **plain text** — _plain text_ in most contexts; _plaintext_ in cryptography. **style sheet** — _style sheet_ and _stylesheet_ both OK; be consistent.
- **data** — Singular mass noun: _the data is_, _less data_ (not _the data are_, _fewer data_).
- **index** — Plural _indexes_ unless domain-specific (_indices_ in math/finance). **appendix** — Plural _appendixes_. **emoji** — Same for singular and plural.
- **boolean** — Code font + exact keyword spelling for a language's type; lowercase _boolean_ for the abstract type; uppercase _Boolean_ for Boolean logic/mathematics.
- **base64** — Lowercase (except sentence start or formal name); code font only when a string literal/quoted from code.
- **internet** — Lowercase. **web (lowercase)** (headword is the rule). **World Wide Web** [don't use] — Use _web_. **webmaster, web master** [don't use] — Use a precise role: _website owner_, _website administrator_, _web content manager_.
- **ID** — Not _Id_ or _id_ except in string literals or enums; sometimes spell out _identifier_.
- **v (abbreviating _version_)** — Lowercase.
- **API** — Web API or language-specific API; don't use _API_ to mean a method or class. **API key** — Not _developer key_/_dev key_.
- **CLI** [avoid] — Don't use generically for "a command-line interface"; name the specific CLI.
- **config** [avoid] — Spell out _configuration_/_configuring_ in a non-code sense; verbatim code name for a file or data structure named `config`.
- **repo** [don't use] — Use _repository_. **regex** [don't use] — Use _regular expression_. **k8s** [don't use] — Use _Kubernetes_.
- **tarball** [don't use] — Use _tar file_. **untar** / **unzip** / **uncompress** / **unarchive** [don't use] — Use _extract_. (**extract** — the verb to use instead of all of them.)
- **ssh and SSH** — Not a verb: "Connect to the instance by using SSH", "use the `ssh` command"; never "`ssh` into". **ssh'ing** [don't use].
- **curl** — Not _cURL_. **lint** — Tool name and command lowercase, code font. **Markdown** — Always capitalized. **PostgreSQL** — OK to write _Postgres_ if the UI does. **SQL** — _a SQL_ ("a sequel"), not _an SQL_. **NoSQL** — Not _No-SQL_. **OS** — OK for "operating system". **CPU** — All caps, no expansion. **HTTPS** — Not _HTTPs_. **I/O** — Not _I-O_ or _IO_. **Unicode** — Not _UNICODE_. **UTF** — Keep the hyphen: _UTF-8_. **WebAssembly, Wasm** — Use the spec's capitalization. **RFC** — Space before the number: _RFC 2318_. **DevOps** — No need to spell out.
- **UI** — Don't use generically for a page or console; use _page_, _console_, or _web interface_. **tab** — For sub-pages of a console use _page_. **dashboard** [avoid] / **console** [avoid] / **portal** [avoid] — Name the specific console; _the_ before a console name; _web interface_ if nothing specific.
- **app** / **application** — Prefer _app_ for end-user programs (mobile/web); _application_ is OK for enterprise complexity and in set phrases (_application programming interface_). **mobile** [don't use] — Not a standalone noun: _mobile phone_ / _mobile device_.
- **media type** / **MIME type** [avoid] / **content type** [avoid] — Use _media type_; _content type_ only for e.g. the `Content-Type` header; don't use _MIME type_ (or write _media (MIME) type_ once).
- **screenshot (noun)** — Not _screen shot_; not a verb (_take a screenshot_).
- **documentation or document or documents** — _this document_, not _this article_/_topic_/_doc_/_page_; _this tutorial_/_quickstart_/_codelab_ OK for those types; spell out _documentation_. **chapter** — Not for non-book docs; use documents, pages, sections. **page** — A whole web page or a console sub-page.
- **element** / **tag** — In HTML/XML a _tag_ marks the start/end of an _element_; don't call a whole element a tag.
- **port** — _listen on_ a port, not _to_.
- **persist** — Don't use as a transitive verb; "To make the token persistent", not "The token is persisted" / "To persist the token".
- **populate** — OK for a process populating a table; for a person use _fill in_.
- **ingest** — Only when significant processing is involved; otherwise _import_, _load_, _copy_.
- **scale** — Not alone to mean "large"; say _scales up/down_ or _out/in_ ("performs better at a larger scale", not "at scale").
- **deprecate** — Recommend against use, usually warning of future removal; don't use _deprecated_ to mean _removed_, _deleted_, _shut down_.
- **legacy** — Prefer a precise term; define it if used; no pejorative connotation.
- **method** — Where _method_ means a class member, don't also use it to mean "approach".
- **parameter** — In API docs usually a query parameter (`NAME=VALUE` in a URL); can mean other things elsewhere.
- **see** — OK for links and cross-references ("For more information, see …").
- **spin up** [avoid] — Use _create_ or _start_ (unless a hard disk). **roll out** [avoid] — Define it or use _gradual_, _in stages_, _phases_.
- **canary** [avoid] — Not a verb, no _canarying_; define jargon on first use. **best effort** [avoid] — Use more specific wording. **health check** [avoid] — Only if it's the UI term; prefer non-figurative language (_responsive_). **hot** / **cold** / **warm** — Avoid _hot standby_-style jargon or define it on first use.
- **retryable** [avoid] — Write around it (_can be tried again_). **retriable** [don't use] — Unless a code item spells it so.
- **nonce** [avoid] — Define on first use; only in specific technical contexts (authentication, blockchain).
- **postmortem** [avoid] — Use _retrospective_; _blameless postmortem_ in DR/DevOps contexts.
- **shift left** [avoid] — Use _shift earlier_ / _move to an earlier phase_ (OK for binary shifts).
- **auto\*, co\*, meta\*, multi\*, non\*, pre\*, re\*** — See the hyphens-with-prefixes guidance (the guide generally closes prefixed words; exceptions with their own entries: **multi-cluster** — hyphenate (established term); **multi-region** — hyphenate for a Cloud location, _multiregional_ elsewhere; **pre-existing** — not _preexisting_; **autoupdate** [don't use] — use _automatically update_).

### Inclusive and non-figurative language

- **blacklist, black list, black-list** [don't use] / **whitelist** [don't use] / **graylist** [don't use] — Use precise domain terms: noun _blacklist_ → _denylist_, _excludelist_, _blocklist_; _whitelist_ → _allowlist_, _trustlist_, _safelist_; _graylist_ → _provisional list_. For verbs, rewrite as the action ("To deny requests from an IP address, add it to the `dos.yaml` file", not "To denylist an IP address…"). If code uses the word, use it only in direct reference to the code item in code font: "Add a user to the allowlist (`whitelist`) by entering …".
- **allowlist (verb), allowlisted, allowlisting** [don't use] / **denylist (verb), denylisted, denylisting** [don't use] — Don't use as verbs; rewrite. OK as nouns.
- **master** [don't use] — Never with _slave_; replace with a specific term: _primary_, _main_, _original_, _parent_, _initiator_, _driver_, _controller_, _manager_, _mixer_, _aggregator_, _publisher_, _leader_, or _active_ (Cloud SQL primary/replica; GKE control plane; Jenkins controller; root key; primary key). If code uses the literal _master_, use it only in direct reference to the code item in code font, then the new term thereafter.
- **slave** [don't use] — Use _worker_ or _replica_; pairs: _primary/secondary_, _primary/replica_, _original/replica_, _controller/worker_, _initiator/responder_, _leader/follower_, _active/standby_, _publisher/subscriber_, _mixer/leaf_, _aggregator/collector_.
- **grandfathered** [don't use] / **grandfather clause** [don't use] — Use _legacy_ or _exempt_, or _made an exception_ ("The app is exempt because it was released before the new requirements were announced").
- **sanity check** [don't use] — Use _quick check_, _confidence check_, _preliminary check_, or _coherence check_. **sane** [don't use] — _valid_ or _sensible_.
- **dummy variable** [don't use] — Use _placeholder_ (statistics: _indicator variable_, _one-hot encoding_, _binary variable_, …).
- **native** [avoid] — Not for people; for software prefer _built-in_; _cloud-native_ is unclear (alternatives: _modern cloud_, _cloud first_).
- **first class, first-class, first-class citizen** [don't use] — Use _higher-order_, _anonymous_, _nested_, or describe the actual capability ("These widgets have full access to the event system and lifecycle hooks").
- **hang, hung** [don't use] — Use _stop responding_ / _not responding_.
- **kill** [avoid] / **abort** [avoid] / **terminate** [avoid] — Use _stop_, _exit_, _cancel_, or _end_ (exceptions: documenting command-line syntax; _abort_ as a Linux signal; _terminate_ in telephony/networking).
- **nuke** [don't use] — _remove_ or _attack_.
- **crazy, bonkers, mad, lunatic, insane, loony** [don't use] — _complicated_, _complex_, _baffling_, _strange_, _unexpected_ (inanimate objects only). **dumb down** [don't use] — _simplify_, _remove technical jargon_.
- **man hours, man-hours** [don't use] — _person hours_. **manned** [don't use] — _staffed_ or _crewed_. **manpower** [don't use] — _staff_ or _workforce_.
- **housekeeping** [don't use] — _maintenance_, _cleanup_. **blast radius** [don't use] — _affected area_. **tribal knowledge** [don't use] — a less figurative term. **war room** [don't use] — _rapid response team_, _incident-management team_, _situation room_. **slice and dice** [don't use] — _segment data for analysis_. **outside the box / out of the box** [avoid] — Only literally. **ninja** [don't use] — _expert_ (OK in product/company names). **guru** [don't use] — _expert_ or _teacher_. **sherpa** [don't use] — _guide_.
- **black-box** / **white-box** / **gray-box** [avoid] — Monitoring: _synthetic_ / _introspective_; testing: _opaque-box_ / _clear-box_ / _translucent-box testing_. **blackhat** / **whitehat** / **grayhat** [don't use].
- **agnostic** [don't use] — _platform-independent_. **-aware** [avoid] — Not as a compound modifier (OK in product names).
- **primitive** [avoid] — Not in a disparaging sense. **compliant, compliance** [avoid] — Strong claim; use with caution.

### Not on the list

The following terms named in the brief are **not headwords on the page** (no entry exists; they may be covered by other style-guide pages such as Hyphens, Capitalization, or Numbers): _command line_ / _command-line_ (only **CLI** exists), _Wi-Fi_, _online_, _open source_, _URL_, _OK_ / _okay_, _percent_, _toggle_ (appears only inside the **turn on**/**enable** examples: "click the **Magic mode** toggle to the on position"), _obviously_, _primary_ / _replica_ as standalone entries (they appear only as replacements inside **master** and **slave**), _lets_ (only **let's** the contraction and **allows you to** → "use _lets you_"), _log in_ as its own entry (covered inside **login (noun or adjective), log in (verb)** and **sign-in**), _file name_ (covered as **filename**), _website_ / _web site_, _dropdown_ (covered as **drop-down**), _check box_ (covered as **checkbox**).
