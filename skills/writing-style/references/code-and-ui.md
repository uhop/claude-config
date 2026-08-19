# Google style digest — code in text, samples, commands, UI, and names

Source: https://developers.google.com/style (fetched 2026-08-19; every page below was fetched with WebFetch and then re-read in full from `curl -sL` HTML because WebFetch summaries dropped detail). Quoted text is verbatim from the guide. Supplementary pages consulted only where an assigned page delegates to them: word-list entries (click, tap, select, enter, type, choose, press, directory/folder, drop-down, pop-up, filename), `possessives` § Code items and § Product, feature, and company names, and `pluralization` § Plural product and feature names.

Markdown note: the guide's own markup is HTML-first (`<code>`, `<var>`, `<b>`, `<kbd>`, `<pre>`). Where it gives a Markdown equivalent, it is stated below; where it does not, the HTML is named.

---

## Code in text — https://developers.google.com/style/code-in-text

Purpose of code font: it "Signals to your reader that the text is meant to be entered verbatim", "Shows where the boundaries of the text to enter are", and "Clearly separates the entity from surrounding text."

- Mark code with the `code` element in HTML, backticks in Markdown.
- "In ordinary text sentences (as opposed to, say, code samples), use code font to mark up most things that have anything to do with code."
- "Generally, don't put quotation marks around code unless the quotation marks are part of the code."
- Put in code font (guide's table, "not an exhaustive list"):
  - attribute names and values (`imageURL`, `e2-highcpu-16`, `us-central1-a`)
  - class names (`SnapshotDiskOperator`)
  - command output (in a block)
  - command-line utility names (`gcloud`, `gsutil`, `kubectl`, `bq`)
  - data types (`STRUCT`)
  - database elements — row and column names (`month`, `datetime`)
  - defined (constant) values for an element or attribute (`city` has the value `"San Francisco"`)
  - DNS record types (`AAAA`)
  - element names, HTML and XML (`script`, `body`, `ClinicalDocument`) — "don't put angle brackets (`<>`) around the element name"
  - enum names (`BOOL = 1;`)
  - environment variable names (`CHROME_REMOTE_DESKTOP_DEFAULT_DESKTOP_SIZES`)
  - filenames, filename extensions (if used), and paths (`pg_hba.conf`, `/etc/postgresql/13/main`)
  - folders and directories (`deployments` folder)
  - HTTP content-type values (`Content-Type`, `application/fhir+json`)
  - HTTP status codes (`500 Internal Server Error`)
  - HTTP verbs (`POST`)
  - IAM role names (`roles/cloudfunctions.invoker`)
  - IP addresses (`10.10.10.10`)
  - language keywords (`FROM`)
  - method and function names (`ST_GEOPOINT`, `get_job_status`)
  - namespace aliases (`default`)
  - placeholder variables (`<var>SUBNETWORK_NAME</var>`)
  - package names (`beautifulsoup4`)
  - port numbers (`50000`)
  - query parameter names and values (`recursive=true`)
  - strings such as URLs or domain names that are used in commands and code (`https://hr.example.com`, `corpaudits.example.com`)
  - text input ("In the **Key name** field, enter `config-management`.")
  - UI elements rendered from previously entered text, e.g. a server or instance name — code font **and** bold ("From the **Server name** list, select **`my-sql-cluster1`**.")
- Do NOT put in code font (unless you're referring to the item as computer input/output or as a code entity):
  - domain names ("standard application offerings from example.com")
  - names of products, services, and organizations ("Google Docs and Google Sheets")
  - URLs the reader is supposed to follow in a browser ("You can find support at https://support.example.com." — and prefer a descriptive link over exposing the URL)
- Code in UI elements: "If a UI element meets the requirements for code font, then use both code font and bold for that element." — "In the **Network** list, select **`my-net-2`**."
- Sometimes code font:
  - Boolean values: code font when referring to the data-type value (`true`, `false`, `1`, `0`: "If the update succeeds, returns `true`."); ordinary font when referring to the evaluation of a condition ("If true, validates the SSL certificate…").
  - Command-line utility names vs. product/project names: code for the command, ordinary for the product — "Invoke the GCC 8.3 compiler using `gcc` for C programs or `g++` for C++ programs."; "The options for the `curl` command are explained on the curl project website."
  - Email addresses: code font when computer input/output ("enter `alex`, not `alex@example.com`"); ordinary font + hyperlink when a way to contact someone ("For help, contact support@example.com.").
- Method names: "When you refer to a method name in text, omit the class name except where including it would prevent ambiguity."
- HTTP status codes: "an HTTP `400 Bad Request` status code" — "call it a status code instead of a response code or error code, and put the number and the name in code font. If the HTTP is implicit from context, you can leave it out." Ranges: "an HTTP `2xx` or `400` status code" (use <var>N</var>xx for N00–N99; number in code font even without the name), or "an HTTP status code in the `200`-`299` range".
- Grammatical treatment: "don't use code elements such as keywords and filenames as if they were English verbs or nouns. Don't inflect the name of a code element, such as to make it plural or possessive. Instead, include a noun after the name of the code element, and inflect that noun."
- Linking API terms (Android-specific, but the principle): in generated reference docs, link the first instance of each API element in code font; later uses code font without link; a term used as a concept (activity, service, view, intent) is lowercase, not code font; an actual instance uses the formal class name (`Activity`).

Recommended / Not recommended:

- Recommended: "To retrieve the zebra's metadata, call its `get` method." / Not recommended: "To retrieve the zebra's metadata, call its `animal.get` method."
- Recommended: "The `ADDRESS` constant's value is defined in the `settings.h` file." / Not recommended: "`ADDRESS`'s value is defined in `settings.h`."
- Recommended: "To add the data, send a `POST` request." / Not recommended: "`POST` the data."
- Recommended: "You can't call the `close` method for a file before you call `open`." / Not recommended: "`Close`ing the file requires you to have `open`ed it first."
- Recommended: "Takes an array of extended ASCII code points (an array of `INT64` values) and returns `BYTES` values." / Not recommended: "Takes an array of extended ASCII code points (ARRAY of INT64) and returns BYTES."

Supplement — possessives § Code items (https://developers.google.com/style/possessives#code-items): "Don't form the possessive of a code item. Instead, form the possessive from the noun that follows the code item or rewrite to avoid the possessive form." Recommended: "Compare the number to the `wordCount` method's return value." / "Compare the number to the value returned by the `wordCount` method." Not recommended: "Compare the number to `wordCount`'s return value."

Supplement — pluralization § Plural product and feature names (https://developers.google.com/style/pluralization#plural-product-and-feature-names): "use singular class names. Don't manually make a singular class name plural… Instead, add a plural noun after the class name." Recommended: "`Intent` objects and `Activity` instances" / Not recommended: "`Intent`s and `Activity`s", "`Intents` and `Activities`". Also: "Don't put optional plurals in parentheses" — "API key", not "API key(s)"; use "one or more" if both must be indicated.

---

## Code samples — https://developers.google.com/style/code-samples

- "Follow the indentation guidelines in the relevant code style guide" — for most languages "using spaces instead of tabs and using two spaces for each indentation level" (some contexts four spaces or tabs). "This guidance applies to formatting code samples, not to formatting commands."
- "Wrap lines at 80 characters." Consider fewer if readers have a narrow window or print.
- "Mark code blocks as preformatted text. In HTML, use a `pre` element; in Markdown, indent every line of the code block by four spaces." (The command-line page says a Markdown code fence; see below.)
- "Indicate omitted code by using a comment in the syntax of the language of your code sample. Don't use three dots or the ellipsis character (`…`). If a code block contains an omission, don't format the block as click-to-copy." Example: `# Several lines of code are omitted here.` inside YAML.
- Introductory statements: "In most cases, precede a code sample with an introductory sentence or paragraph. The introduction can end with a colon or a period; usually a colon if it immediately precedes the sample, usually a period if there's more material (such as a note paragraph) between the introduction and the sample, or if the introduction paragraph ends in a sentence that isn't directly related to the sample."
- Code itself follows the language's style guide (Google's C++/HTML-CSS/Java/JavaScript/Python guides are listed; "Some open source projects have their own overriding style guides").

Recommended / Not recommended:

- Recommended (ending with a period): "The following code sample shows how to use the `get` method. For information about other methods, see [link]. [sample]"
- Also recommended: "The following code sample shows how to use the `get` method: [sample] For information about other methods, see [link]."
- Not recommended (ending with a colon): "The following code sample shows how to use the `get` method. For information about other methods, see [link]: [sample]"
- Recommended wrapped sample:
  ```
  function helloWorld() {
    alert('Hello, world! This sentence is so long that it wraps onto a second
      line.');
  }
  ```

---

## Document command-line syntax — https://developers.google.com/style/code-syntax

Best practices:

- "Provide an inline link to the command reference" in the text that introduces the command ("To connect to the instance, use the `gcloud compute ssh` command:").
- "Determine which arguments are needed to complete each task in the recommended way" — "use as few optional arguments as possible. Rely on the command reference for the complete list."
- "Provide a click-to-copy command example that the reader doesn't need to edit after they copy it. If possible, include only runnable code and placeholder variables in the click-to-copy example." Square brackets, pipes, braces, and ellipses "can break commands if they're not first removed" — keep them out of click-to-copy examples.

Format a command:

- Block: `pre` in HTML; "In Markdown, use a code fence (```)."
- "When a line exceeds 80 characters, you can safely add a line break before some characters, such as a single hyphen, double hyphen, underscore, or quotation marks. After the first line, indent each line by four spaces to vertically align each line that follows a line break."
- "each line except the last line must end with the command-continuation character" — Linux/Cloud Shell: backslash preceded by a space (` \`); Windows: caret preceded by a space (` ^`).
- Format placeholder text with placeholders; "Follow the command line with a descriptive list of the placeholders used in the command line."
- Documenting an option/argument: "use end punctuation for complete sentences. Don't use end punctuation for single words or noun phrases, unless there is a mix of sentences and noun phrases."
- For `bash`/`sh`, follow the quotation-mark style in Google's shell style guide.

Command prompt:

- "If your command-line instructions show multiple lines of input in one block, then start each line of input with the prompt symbol." (Optionally make the symbol unselectable via CSS.)
- "Don't show the current directory path before the prompt, even if part of the instruction includes changing directories." If the context changes (local → remote), add a prompt indicator for the new context (`shell@ $`).
- "When you're showing a one-line command, the command prompt (the `$` symbol) is optional. However, if your document includes both multi-line and one-line commands, then we recommend using the command prompt for all of the commands in the document for consistency."
- "If your command-line instructions include a combination of input and output lines, we recommend using separate code blocks for input and output."

Argument notation:

- Optional: "Use square brackets around an argument to indicate that it's optional. If there's more than one optional argument, enclose each item in its own set of square brackets." — `gcloud dns GROUP [GLOBAL_FLAG] [FILENAME]`
- Mutually exclusive: "Use curly braces to indicate that the reader must choose one—and only one—of the items inside the braces… To separate each choice, use a pipe (`|`)." — `{FILE_1|FILE_2}`; can nest optional inside: `{--source=CLOUD_SOURCE --source-url=SOURCE_URL | --bucket=BUCKET [--source=LOCAL_SOURCE]}`
- Repeatable: "Use three dots and no spaces (`...`) to indicate that the reader can specify multiple values for the argument." — `gcloud dns GROUP [GLOBAL_FLAG ...]`
- Do not put brackets/braces/ellipses inside the `var` element (from the placeholders page).

Optional arguments in click-to-copy commands — pick one:

- "Remove the optional arguments" (show the common case; link to the reference; mention the flag in prose: "If you want to narrow the list of VMs to a specific zone, use the previous command with the `--zones` flag.").
- "Use separate code blocks for each option."
- "Document optional arguments in separate tasks" (separate sections).
- "Let the reader know that the command contains optional arguments" when you must include the special characters.

Output from commands:

- "You don't have to show output for every command. Add output only if it adds value—for example, if the reader needs to copy a value from the output or if they need to verify a value in the output."
- Introductory phrases: "The output is similar to the following:" / "The output is the following:" (customizable: "The output is similar to the following, in which the `IP` column shows…").
- Omitted output lines: "use three dots and no spaces (`...`) on a separate line. Do not use the ellipsis character (`…`)."

Terminology:

- gcloud: command groups vs commands, but in docs "command-line contents are generally referred to as commands"; flag = "any element other than the command or group name itself"; "option is often used as a catchall term when you don't want to mire the reader in specialized nomenclature."
- Linux: "describe what the entire command does rather than what its individual elements are called"; elements are command name, argument, option (`-follow`; the hyphen is part of the option), option with a value (`-type f`), metacharacters/globbing, pipe, redirection symbols.
- Linux signals (`SIGKILL`, `SIGTERM`, `SIGINT`, …): use the signal's own verb (kill, terminate, interrupt) only in process-control context; "Do not substitute cancel, end, exit, quit, stop, or terminate" for `SIGKILL`, etc.

Recommended:

- ```
  $ adb shell
  shell@ $ screencap /sdcard/screen.png
  shell@ $ exit
  $ adb pull /sdcard/screen.png
  ```
- ```
  $ cat ~/.ssh/my-ssh-key.pub
  ```
  "The output is similar to the following:"
  ```
  ssh-rsa KEY_VALUE USERNAME
  ```
- ```
  gcloud compute images import IMAGE_NAME \
      --source-file=SOURCE_FILE \
      --byol
  ```

---

## Format placeholders — https://developers.google.com/style/placeholders

- "Placeholders in sample code and commands represent values that the reader must replace when they use the sample input. Placeholders in example output can also represent other values that vary." A placeholder "has a descriptive name as a default value" (`PROJECT_ID`, `HTTP_RESPONSE_CODE`).
- "don't use a single x or a series of x's as placeholders; use a more informative placeholder" (exception: where x's are standard, e.g. HTTP status `xx`).
- Inline, code placeholder: HTML `<code><var>PLACEHOLDER_NAME</var></code>`; "In Markdown, wrap inline placeholders in backticks (`), and use an asterisk (*) before the first backtick and after the second one" — i.e. *`PLACEHOLDER_NAME`* (italic code).
- Inline, non-code placeholder: HTML `<var>PLACEHOLDER_NAME</var>`.
- Code blocks: HTML `pre` + `var` elements; "In Markdown, wrap the code block in a code fence (```). Inside a code fence, you can't apply formatting like bold or italic." — so the bare `PLACEHOLDER_NAME` stands on its own.
- "**Use uppercase characters with underscore delimiters.**" — "If the context in which your placeholders appear makes using uppercase characters with underscore delimiters a bad idea, use something else that makes sense to you, but be internally consistent."
- "**Don't include possessive adjectives in placeholders.**" — no `MY_API_NAME`, `YOUR_API_NAME`.
- "You can mark up command-line syntax with brackets, braces, and ellipses. Don't put the brackets, braces, or ellipses in the `var` element."
- Explain every placeholder "the first time you use it"; repeat only when the doc is lengthy, many placeholders were introduced, or the doc isn't read linearly.
- Single placeholder: "Replace PLACEHOLDER with a description of what the placeholder represents." — "Replace `BUILD_ID` with the ID of the `WORKING` build that you copied in the preceding step."
- Two or more placeholders: follow the command with a list; "Introduce this list with Replace the following:"; "List the placeholders in the order in which they appear in the command line"; each item is the placeholder in code+var "followed by a colon and a description that starts with a lowercase letter"; "Explain what each placeholder represents even if the placeholder value is intuitive to you"; examples inside a description introduced "with an em dash or such as" (`ZONE`: a Google Cloud zone that's close to your location—for example, `us-east1`).
- Placeholders in output: mark with `var`; follow the output with a list introduced by "This output includes the following values:", in order of appearance, same `PLACEHOLDER`: lowercase-description format.

Recommended / Not recommended:

- Recommended: `.../API_NAME`, `.../METHOD_NAME` / Not recommended: `.../API-name`, `.../API_name`, `.../API name`, `.../api_name`, `.../api-name`, `.../apiName`
- Not recommended: `.../MY_API_NAME`, `.../YOUR_API_NAME`
- Recommended:
  ```
  bq mk \
      --project_id=ADMIN_PROJECT_ID \
      --location=LOCATION \
      --target_job_concurrency=CONCURRENCY \
      --reservation \
      RESERVATION_NAME
  ```
  "Replace the following:"
  - `ADMIN_PROJECT_ID`: the project that owns the reservation
  - `LOCATION`: the location of the reservation
  - `CONCURRENCY`: the maximum concurrency target
  - `RESERVATION_NAME`: the name of the reservation

(Not stated on this page but implied by its formats: the guide never uses `<angle brackets>` or `$VAR`/`${VAR}` as placeholder syntax — `${JOB_NAME}` appears on the command-line page only as a literal reference to "an environment variable called `JOB_NAME` that was set earlier", not as a placeholder.)

---

## UI elements and interaction — https://developers.google.com/style/ui-elements

- "When practical, state instructions in terms of what the reader should accomplish, rather than focusing on the widgets and gestures." ("Refresh the page." / "Expand the **Advanced options** section.") Use UI detail when the audience needs it ("Click **Refresh**.").
- "When referring to any UI element by name, put its name in bold, using the `b` element in HTML or `**` in Markdown. This includes names for buttons, menus, dialogs, windows, list items, or any other feature on the page that has a visible name. Don't use code font for UI elements, unless it's an element that meets the requirements for code font. In that case, use both code font and bold." (`b` not `strong`: `b` "connotes text to which you want to draw visual attention".)
- "Don't make an official feature name or product name bold, except when it directly refers to an element on the page that uses the name."
- Outside a procedure, give the element context ("in the **Current jobs** section of the service console").
- Capitalization: "follow the capitalization as it appears on the page. However, if labels are inconsistent or they're all uppercase, use sentence case." — Click **Refresh**, not **REFRESH**.
- "Don't use UI elements as if they were English verbs or nouns." — "In the **Name** field, enter an account name." not "**Name** the account."; "To save the settings, click **Save**." not "**Save** the settings."
- Menus: "To refer to an item in a menu, use the term command, not choice, menu item, or option." Use "the **LABEL_NAME** menu". "In the **File** menu, select **Open**." "Don't use drop-down as a synonym for menu."
- Angle-bracket notation: "Put a nonbreaking space (`&nbsp;`) before each angle bracket."; "Don't bold each menu name separately; instead, enclose the entire sequence in a single bold tag"; wrap `>` in `<span aria-label="and then">></span>` so screen readers don't say "greater than". Renders "Select **View > Tools > Developer Tools**." "this notation applies only to menu items. Don't use it to describe a combination of different UI elements."
- Terminology: window (whole app window or openable/closable tool windows); page ("preferred term when referring to a web page in general and to a subpage of a console"); dialog ("a smaller window … detached from the main application window" — not "pop-up window"); pane/panel ("Do not use terms such as window, section, area, or column to refer to a pane or panel"); section ("a labeled grouping of options and controls"); navigation menu (not navigation bar/pane/panel/window); toolbar, menu button; "Don't use slang terms for UI elements—for example, hamburger icon or zippy."
- Buttons: "To refer to a button, use the button's label." — "Click **OK**." not "Click the "OK" button." Icon buttons: write the tooltip name and put the icon before it ("Click more_vert **Settings and utilities**."). If a UI label ends with an ellipsis, drop it ("Click **Browse**.").
- "Don't use directional language to orient the reader, such as above, below, or right-hand side." Use the icon+name, add context ("On the Cloud Run toolbar, click refresh **Refresh**."), or a screenshot.
- Tab: "the **LABEL_NAME** tab". Text box: "the **LABEL_NAME** box" — "In Google Cloud, use field instead of box." Typed text in code font ("In the **Name** box, enter `wsfc-1`."). List box: "the **LABEL_NAME** list"; combo box: verbs type / select / enter; spin box: enter. Checkbox: "the **LABEL_NAME** checkbox"; "Be wary of using the verbs check and uncheck… use select and clear instead"; state = selected / not selected. Radio button: "Select **Do not remember passwords**." / "For **Startup mode**, select an option." Expander arrow / expandable section (not expando/zippy). Toggle: "Don't use the word toggle as a verb" — "click the **Wi-Fi** toggle", "click the **Magic mode** toggle to the on position".
- Keyboard: `kbd` element (monospace in non-HTML); letter keys uppercase ("Control+S", not "Control+s"); "Spell out the names of modifier keys such as Command, Control, Option, and Shift. Don't use symbols"; form MODIFIER+KEY_NAME; macOS shortcut in parentheses after Windows/Linux ("press Control+C (or Command+C on macOS)", not "Ctrl+C (⌘+C)"); "Press Esc." / "Press the Esc key."; spell out comma, hyphen, period, plus; "keyboard shortcut" or "key combination"; "To refer to pressing a key or combination to cause an action to occur, use the verb press. To refer to typing a key or combination as part of text, use the verbs enter or type." A key typed as text input gets `code`, not `kbd`.
- Prepositions: **in** — dialogs, fields, lists, menus, panes, windows ("In the **Alert** dialog, click **OK**."); **on** — pages, tabs, toolbars ("On the **Edit** tab, click **Save**.").
- Verbs in procedures: "Click, Choose, Drag, Enable, Enter, type, Go to, Hold the pointer over, Press, Select, Tap, Turn on, turn off" — each defined on the word list.

Supplement — word list entries (https://developers.google.com/style/word-list):

- click: "When the environment is a desktop with a mouse, use click for most targets, such as buttons, links, list items, and radio buttons. Don't use click on." Recommended: "Click **OK**." / Not recommended: "Click on **OK**." "Hyphenate right-click, left-click, and double-click." "click in the window" is OK for a region needing focus. "For Android apps, don't use click. Instead, use tap."
- tap: "Use instead of click when the environment is definitely a touch device." "For mechanical buttons, use press." "touch & hold (not touch and hold) is OK".
- press: "pressing a key or a key combination to cause an action to occur. Also use for mechanical buttons." "For on-screen and soft (capacitive) buttons, use tap."
- select: "Use to describe choosing an item from among multiple options, selecting text, or marking a checkbox." Recommended: "Select **Automatically check for updates**." / Not recommended: "Check **Automatically check for updates**."
- choose: "Choose is fine to use for generic contexts. For UI elements, use select."
- enter: "Use enter to refer to the user entering text. If it's important to not press Enter, explicitly say so." type: "In general, use enter instead of type because there is typically more than one way to enter text than typing (such as pasting text or speaking)."
- enable / turn on: "use enable or turn on consistently" throughout a document; "For making it feasible to do something, use lets you."
- drop-down: "you can omit drop-down from phrases like drop-down list or drop-down menu, and just use list or menu… Don't use drop-down as a standalone noun."
- pop-up, popup: "Don't use." Use dialog (a window) or menu (a context menu).
- directory, folder: "use directory in a command-line context, and folder in a GUI context. When in doubt, default to directory."

Recommended / Not recommended:

- Recommended: "In the **New project** window, select the **New activity** checkbox, and then click **Next**." / Not recommended: "In the New Project window, select "New Activity", and then click the "Next" button."
- Recommended: "Select **MyApp > Preferences**, and then select the **Languages** preference pane." / Not recommended: "Select **MyApp** > **Preferences** > **Languages** > **+** > **CSS**."
- Recommended: "Click menu **Menu**." / Not recommended: "In the left-side panel, click the button with three lines."
- Recommended: "To copy, press Control+C (or Command+C on macOS)." / Not recommended: "To copy, press Ctrl+C (⌘+C)."

---

## API reference code comments — https://developers.google.com/style/api-reference-comments

- "provide a complete API reference, typically generated from source code using document comments that describe all public classes, methods, constants, and other members." The page "doesn't specify how to mark up document comments".
- Must describe: every class/interface/struct (and similar); every constant, field, enum, typedef; every method "with a description for each parameter, the return value, and any exceptions thrown."
- "Extremely strong suggestions": a ~5–20 line code sample at the top of each class page; "Put all API names, classes, methods, constants, and parameters in code font, and link each name to the corresponding reference page"; "Put string literals in code font, and enclose them in double quotation marks" (`"wrap_content"`, `"true"`); class-name spelling matches code exactly (`ActionBar`); "Don't make class names plural (`Intents`, `Activities`); instead, add a plural noun (`Intent` objects, `Activity` instances)"; a class whose name is a common term may be referred to by the English word, lowercase, not code font (activities, action bar).
- Classes: first sentence "briefly state the intended purpose or function of the class or interface with information that can't be deduced from the class name and signature"; make it "unique and descriptive, yet short" (tools extract it); "Don't repeat the class name in the first sentence."; "Don't say "this class will/does ...""; "Don't use a period before the actual end of the sentence… some generators terminate the sentence if they see e.g., so use for example instead." Example: "A primary toolbar within the activity that may display the activity title, application-level navigation affordances, and other interactive items."
- Members (constants, fields): "as brief as possible"; link to the methods that use them.
- Methods: first sentence states "what action the method performs"; then why/how, prerequisites, exceptions, related APIs, dependencies (e.g. permissions) and behavior if missing. "Use present tense for all descriptions" — "Adds a new bird to the ornithology list." "Returns a bird." Third-person-singular verb fragments (no subject), not "This method adds…".
- Method first-sentence openers: operation + returns data → verb ("Adds a new bird … and returns the ID of the new entry."); boolean getter → "Checks whether …"; non-boolean getter → "Gets the …"; no return value → "Sets the …" / "Updates the …" / "Deletes the …" / "Registers …"; callback → "Called by …" (later: "Subclasses implement this method to …"); convenience constructor → "Creates a …".
- Parameters: "Capitalize the first word, and end the sentence or phrase with a period."; non-boolean begins "The" or "A" ("The ID of the bird you want to get."); boolean that directs behavior: "`enableCertificateValidation`: If true, validates the SSL certificate before proceeding. If false, trusts the certificate without validating it."; boolean that declares state: "True if the zoom is set; false otherwise."; "In this context, don't put the words "true" and "false" in code font or quotation marks."; defaults: explain each value/range then "Use the format Default: to explain the default value."
- Return values: brief; non-boolean "The …" ("The bird specified by the given ID."); boolean "True if …; false otherwise."
- Exceptions: if the generator inserts "Throws", begin "If …" ("If no key is assigned."); otherwise "Thrown when …".
- Deprecations: "tell the user what to use as a replacement" (and the version first deprecated in, if versioned); most important info in the first sentence; "If a method is deprecated, tell the reader what to do to make their code work." Examples: "Deprecated. Use #CameraPose instead." / "Deprecated. Access this field using the `getField` method."

---

## Example domains and names — https://developers.google.com/style/examples

- "Don't use real domain names, email addresses, or people's names in your examples. Don't reveal personally identifiable information (PII)… You can provide imaginary (fictitious) examples or use placeholders, like `USER_ID` or `EMAIL_ADDRESS`."
- Domains: "use example.com, example.org, or example.net" (IANA-reserved); Google-owned alternates: altostrat.com, examplepetstore.com, example-pet-store.com, myownpersonaldomain.com, my-own-personal-domain.com, cymbalgroup.com. IDN: use an IDN Test TLD.
- Email: example domain + example person name — "dana@example.com"; "It's OK to use generic addresses like support@example.net. Don't use person names, product names, or made-up names in email addresses."
- Person given names (list): Alex, Amal, Ariel, Bola, Charlie, Cruz, Dana, Dani, Hao, Ira, Izumi, Jie, Kai, Kalani, Kim, Kiran, Lee, Lucian, Luka, Mahan, Noam, Nur, Quinn, Raha, Rosario, Sasha, Tal, Taylor, Tristan, Yuri. Surnames: "use an initial after the given first name—for example, Quinn N. or Dana A."
- People: "Use the gender-neutral singular pronouns they, their, and theirs whenever possible"; vary the people; avoid role stereotypes; "Don't use the Alice and Bob characters unless you're writing documentation that refers to a technical specification that uses those characters."
- Company: "Example Organization" (differentiate as "Enterprise Example Organization" / "Startup Example Organization").
- Phone: "a US number in the range 800‑555‑0100 through 800‑555‑0199"; "Never use a real phone number in examples."
- IPv4 (RFC 5737): `192.0.2.0`–`192.0.2.255`, `198.51.100.0`–`198.51.100.255`, `203.0.113.0`–`203.0.113.255`; ranges `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`. IPv6 (RFC 3849): `2001:db8::`, `2001:db8:1:1:1:1:1:1`, …; range `2001:db8::/32`.
- Street addresses: "1800 Amphibious Blvd. Mountain View, CA 94045"; "Avenida da Pastelaria, 1903 Lisbon, 1229-076"; "8 Rue du Nom Fictif 341 Paris".
- Project names: "create a name that's meaningful or descriptive… Don't use unclear components like `foo`, `bar`, and `baz` in names." Numbered scheme if needed: `staging`, `frontend-development`, `production-1`, `production-2`.
- Service account ID example: `123456789012345678901`.

Recommended:

- "Hostnames that include non-ASCII characters are encoded using Punycode. For example, `http://مثال.إختبار` is encoded as `xn--kgbechtv`."

---

## Filenames and file types — https://developers.google.com/style/filenames

- "Make file and directory names lowercase, with the occasional exception for consistency" (case-sensitive file systems treat `Impersonate-Service-Accounts.html` and `impersonate-service-accounts.html` as distinct).
- "Use hyphens, not underscores, to separate words—for example, `query-data.html`. Search engines interpret hyphens in file and directory names as spaces between words. Underscores are generally not recognized."
- "Use only standard ASCII alphanumeric characters in file and directory names."
- "Don't use generic page names such as `document1.html`."
- Exception for consistency: in a directory that already uses underscores (`lesson_1.jd`…), "it's okay to add your new file as `lesson_4.jd`… However, in all other situations, use hyphens." Also OK: tool-generated reference filenames that follow the product/API's own conventions.
- Refer to filenames: "Use code font."; "Include the word file after the filename."; "Use the exact spelling of the filename even if it doesn't follow naming guidelines."; if the file's contents are shown, "precede a code sample with an introductory sentence or paragraph that includes the filename." — "In the following `build.sh` file, modify the default values for all parameters:"
- File interactions: "don't use the file types as a verb." — "Extract a zip file." not "Unzip a zip file."
- File types: "use the formal name of the type, not the filename extension… Do not use the filename extension to refer generically to the file type." Table: `.json` → JSON file, `.md` → Markdown file, `.sh` → Bash file, `.py` → Python file, `.yaml` → YAML file, `.zip` → zip file, `.tar` → tar file, `.txt` → text file, `.exe` → executable file, `.jar` → JAR file, `.wasm` → Wasm file, `.csv` → CSV file, `.png` → PNG file, `.jpg`/`.jpeg` → JPEG file, `.svg` → SVG file, `.pdf` → PDF file, `.tf` → Terraform file, `.ps` → PowerShell file, `.ipynb` → IPYNB file, `.adoc` → AsciiDoc file.
- Word list: "filename" — "Not file name".

Recommended / Not recommended:

- Recommended: `avoiding-cliches.jd` / Sometimes OK: `avoiding_cliches.jd` / Not recommended: `avoidingcliches.jd`, `avoidingCliches.jd`, `avoiding-clichés.jd`
- Recommended: "a PNG file" / Not recommended: "a `.png` file"
- Recommended: "a Bash file" / Not recommended: "an `.sh` file"
- Recommended: "Extract a zip file." / Not recommended: "Unzip a zip file."

---

## Product names — https://developers.google.com/style/product-names

- "Google product names are in title case… use title case except when you're matching a UI label."
- "When you write about any product, follow the official capitalization for the names of brands, companies, software, products, services, features, and terms defined by companies and open source communities." (Kubernetes context: "A Job creates one or more Pods.")
- "If an official name begins with a lowercase letter, then put it in lowercase even at the start of a sentence. But it's better to revise the sentence to avoid putting a lowercase word at the start, if possible." — "You can use macOS to run the app." not "macOS can run the app."
- Feature names: "In general, feature names are lowercase, although there are exceptions… don't capitalize it unless the name is officially capitalized. If you're unsure, follow the precedent that's set by other documents."
- "Use the full trademarked product name. Don't abbreviate product names, except in cases where you're matching a UI label." Consider a general term once established ("frame your discussion around the concept of a service mesh").
- Possessives: delegated to possessives § Product, feature, and company names — "don't form a possessive from a feature name, product name, or trademark… use the name as a modifier or rewrite to use a word like of" ("monitor Google Search performance" / "the performance of Google Search", not "Google Search's performance"). Company names take 's ("Google's new office") but not when used as a trademark.
- Articles: "Don't use the before a product name unless you're using the name to modify something else. Do use the before tool and API names." — "The Transcoder API", "The `gcloud` CLI", "The Google Cloud console", "The Cloud Datastore options page". With a/an, match the article to the product name ("An Anthos Service Mesh environment" / "A Service Mesh environment").
- "It's OK to refer to Google products as services, such as the Google Kubernetes Engine service… However, if the term services leads to ambiguity, use the product names."
- "Don't use product names or feature names as verbs."

Recommended / Not recommended:

- Recommended: "Using Cloud Datastore with Cloud Dataproc" / Not recommended: "Using the Cloud Datastore with Cloud Dataproc"
- Recommended: "You can use macOS to run the app." / Not recommended: "macOS can run the app."
- Recommended: "The Transcoder API", "The `gcloud` CLI"

---

## Trademarks — https://developers.google.com/style/trademarks

- "Follow any usage guidelines that trademark owners provide." (Google marks: "About our trademarks and how to use them" / "Rules for proper usage".)
- "When you use a trademarked term, always use it to modify a noun, not as a noun by itself. Don't use a trademark as a verb."
- "Never form a possessive or a plural from a trademark or change it in any way."

Recommended / Not recommended:

- Recommended: "Another option is to use a Chromebook notebook computer." / Not recommended: "Another option is to use a Chromebook."
- Not recommended: "Chromebook's features rely on an internet connection."
- Not recommended: "For information about Chromebook computers, google "notebook computers""

---

## Top 15 rules from this slice

Ranked for an engineer writing README / wiki / dev-docs prose about a JavaScript/Node.js library.

1. **Code font for anything the reader types or the code contains; ordinary font for names of things.** Code font: filenames and paths, package names, commands and CLI tools (`npm`, `node`), flags, environment variables, method/function/class names, keywords, data types, HTTP verbs and status codes, query parameters, ports, Boolean/constant values, placeholders, command output. Ordinary font: product/project/organization names, domain names, and URLs the reader follows in a browser. Backticks in Markdown; no quotation marks around code "unless the quotation marks are part of the code."
2. **Never inflect a code item — put a noun after it and inflect the noun.** "The `ADDRESS` constant's value", "`Intent` objects", "call the `close` method"; never "`ADDRESS`'s", "`Intents`", "`POST` the data", "`open`ed". Same for filenames: "the `build.sh` file".
3. **Refer to a file as "the `name.ext` file", in code font, spelled exactly; name file _types_ by their formal name, not the extension** ("a JSON file", "a Markdown file", "a Bash file", not "a `.json` file"); don't verb a file type ("Extract a zip file", not "Unzip"). It is "filename", not "file name".
4. **Name files and directories lowercase, ASCII, hyphen-separated** (`query-data.html`); underscores only to match an existing directory; no generic names like `document1.html`.
5. **Placeholders are `UPPERCASE_WITH_UNDERSCORES`**, in code font (Markdown inline: _`PLACEHOLDER_NAME`_; bare inside a fence), descriptive (no `x`/`foo`), no possessives (`MY_`/`YOUR_`), no brackets/braces/ellipses inside the placeholder. (The guide's placeholder formats never use `<angle brackets>` or `$VAR`; `${JOB_NAME}` appears only as a literal reference to a previously set environment variable.)
6. **Explain every placeholder the first time.** One: "Replace `BUILD_ID` with …". Several: "Replace the following:" + a list in order of appearance, each "`PLACEHOLDER`: lowercase description—for example, …". Output placeholders: "This output includes the following values:".
7. **Introduce every code sample with a sentence**; end with a colon if the sample follows immediately, a period if something intervenes or the sentence isn't about the sample. Name the file in the intro when the sample is a file's contents.
8. **Code samples: 2-space indentation (follow the language style guide), wrap at 80 characters, fenced/preformatted, omissions marked by a comment in the sample's language** (`// Several lines of code are omitted here.`) — "Don't use three dots or the ellipsis character", and don't make a block with an omission click-to-copy.
9. **Commands: copy-pasteable.** Only runnable text plus placeholders in a copyable block; no `[ ]`, `{ | }`, `...` in it — show the common case and mention extra flags in prose, use separate blocks per option, or say explicitly that the block contains optional syntax. Reference syntax notation (non-copyable): `[OPTIONAL]`, `{A|B}` for exactly-one, `ARG...` for repeatable.
10. **Shell blocks: `$` prompt on every input line when a block has multiple input lines; optional for a one-liner but be consistent across the doc; never show the cwd before the prompt; put output in a separate block** introduced by "The output is similar to the following:" / "The output is the following:"; omitted output lines are a lone `...`; show output only when it adds value. Break long commands before a hyphen/underscore/quote, end each continued line with ` \`, indent continuation lines four spaces.
11. **HTTP: "an HTTP `400 Bad Request` status code"** — "status code", not "response code"/"error code"; number + name in code font; ranges as `2xx` or "in the `200`-`299` range"; "send a `POST` request", not "`POST` the data".
12. **API/JSDoc descriptions: present-tense verb fragments, first sentence carries the load.** Methods start with "Adds…/Returns…/Gets the…/Checks whether…/Sets the…/Creates a…/Called by…"; don't repeat the class name, don't write "this class/method does…", avoid "e.g." (use "for example") because generators cut at the first period. Params: "The …"/"A …", capitalized, ending in a period; booleans "If true, …. If false, …." or "True if …; false otherwise." (true/false in plain font here); "Default: …". Returns: "The …" / "True if …; false otherwise." Exceptions: "If …" or "Thrown when …". Deprecations: "Deprecated. Use X instead." String literals in code font with double quotes.
13. **UI references: bold the label, verb by target.** "Click **OK**" (desktop), "tap" (touch), "press" (keys / mechanical buttons: "Press Control+C (or Command+C on macOS)"), "select" (an item from options, a checkbox; "choose" only in generic prose), "enter" (text; "type" only when typing specifically matters), "select/clear" a checkbox (not check/uncheck), "turn on/enable" consistently. "Don't use click on." Menus: "In the **File** menu, select **Open**" or "Select **View > Tools > Developer Tools**" (single bold span, `&nbsp;` before each `>`; menus only). No quotation marks around labels, no "the "OK" button", no directional language ("left-side panel"), no "pop-up", "drop-down" (say dialog / menu / list), no "zippy"/"hamburger". Prepositions: _in_ a dialog/field/list/menu/pane/window, _on_ a page/tab/toolbar.
14. **Examples use reserved fixtures only:** example.com / example.org / example.net; dana@example.com; names from the list (Alex, Dana, Kai, Quinn, Taylor, …) with initial surnames ("Quinn N."); "Example Organization"; IPv4 `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`; IPv6 `2001:db8::/32`; phones 800‑555‑0100–0199; meaningful project names, never `foo`/`bar`/`baz`; no real PII.
15. **Product and project names: official capitalization, full name, no abbreviation, no article, no possessive, no plural, never a verb.** "Use Node.js", "the `npm` CLI" (tools and APIs take "the"; products don't: "Using Cloud Datastore", not "Using the Cloud Datastore"); a lowercase official name stays lowercase even sentence-initially (better: rewrite — "You can use macOS…"); trademarks only as modifiers ("a Chromebook notebook computer"); code font for the command (`node`, `git`, `curl`), ordinary font for the product (Node.js, Git, the curl project); features lowercase unless officially capitalized.
