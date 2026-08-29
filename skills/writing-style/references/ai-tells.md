# AI tells — the banned families, calibrated

House rule (`SKILL.md` § House decisions): AI-writing tells are banned in every piece of prose the
agent produces — README, wiki, `dev-docs/`, release notes, GitHub issue, PR, and review text,
advisories, vault notes, chat replies, blog posts, and articles. This reference lists the families,
the replacement move for each, the cadence budgets, and what is _not_ a tell.

Provenance: two calibrations of Eugene's blog corpus — 123 pre-LLM posts (2005–2014, 60.8k prose
words) against the 2026 posts and drafts — on 2026-08-14 and 2026-08-29. Every family below scored
zero in the pre-LLM corpus (or one hit in twenty years) and 4–100 instances in 2026 prose. The
external lists that nominated candidates (sloptells.com, Wikipedia's _Signs of AI writing_, Simon
Willison's cliché highlighter, the load-bearing vocabulary of Claude) were filtered by that
measurement, and about a third of what they flag turned out to be ordinary human writing (§ Not
tells). A list nominates; a corpus decides, per word. Tables and per-post inventories: vault
`projects/blog/writing-voice` § AI-tell calibration; the fleet rule: vault
`topics/ai-writing-tells-calibrated`.

## The families

| Family                                    | Shape                                                                                                                                                                                                                                   | Replacement move                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Contrast-correction — **the fingerprint** | "it isn't X; it's Y", "not X. That's Y.", "not X — it's Y", "X is not A; it is B", "not just X, but Y", "Not because X. Because Y."                                                                                                     | State the positive claim directly: "The cost is the restart."                               |
| Stranded auxiliary                        | A clause that lands on a bare auxiliary for the reversal: "The tool died; the data didn't.", "the compounding does."                                                                                                                    | Complete the verb or restructure: "The data outlived the tool."                             |
| Self-clap                                 | "And that matters.", "what (actually) matters is", "that's the whole point / skill / story", "the only X that matters", "worth naming", "exactly the point"                                                                             | Cut it, or state the claim it gestures at.                                                  |
| Warm-up and reveal openers                | "To be clear,", "Here's the thing / catch / kicker / twist", "That said,", "Turns out", "Let's dive in / unpack", "I'll be honest", "The truth is", "There are a few things going on here", "This is where X comes in", "The punchline" | Start one sentence later.                                                                   |
| Staccato fragment pair                    | "Fast. Simple." "No fluff. Just answers."                                                                                                                                                                                               | One sentence with a verb. A single short sentence is fine.                                  |
| Headcount                                 | "most developers", "most people", "everyone knows"                                                                                                                                                                                      | Say who, cite, or drop the count. A claim about what people do is a free shot for a reader. |
| Claude's vocabulary                       | The next section                                                                                                                                                                                                                        | The plain word                                                                              |
| Classic AI vocabulary                     | delve, tapestry, testament, pivotal, meticulous, multifaceted, ever-evolving, landscape, "plays a crucial role", nestled, hidden gem, game-changer                                                                                      | The plain word                                                                              |

## Claude's own vocabulary

These words are the register Claude writes in — the highest-lift words in its pull-request prose —
and they are absent from Eugene's pre-LLM writing. One hit is a nudge; several in a paragraph is
the register.

| Cut or replace                                               | Write instead                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| reach for                                                    | use, pick, turn to                                           |
| genuinely, plainly, honestly, outright, merely, deliberately | Drop the word.                                               |
| quietly, silently                                            | Drop it, or say what happens: "without an error".            |
| seam                                                         | boundary, join                                               |
| the shape of X                                               | The concrete noun: the structure, the layout, the signature. |
| lever                                                        | option, knob, control                                        |
| buys you, pays for itself, earns its keep                    | gets, gives, costs; is worth it; pays off                    |
| the moment X happens                                         | when X happens                                               |
| halves, bites                                                | cuts in half; hurts, shows up                                |
| whoever                                                      | anyone who                                                   |
| load-bearing                                                 | the part everything depends on                               |
| through-line                                                 | thread, theme                                                |
| papers over                                                  | hides                                                        |
| blast radius                                                 | reach, affected area                                         |

## Cadence budgets

Rates, not phrases. Each budget is the 90th percentile per document of Eugene's own pre-LLM prose;
the 2026 drift is what it catches.

| Metric                                     | Pre-LLM            | 2026 drift | Budget                                                                    |
| ------------------------------------------ | ------------------ | ---------- | ------------------------------------------------------------------------- |
| Mean sentence length                       | 13 words           | 18–21      | ≤ 18 words per document (Google's 26-word cap per sentence still applies) |
| Em dashes                                  | 0.75 per 100 words | 2.5        | ≤ 1.3 per 100 words: a comma, parentheses, a colon, or a period instead   |
| Semicolons                                 | 1.3 per 100 words  | 3.1        | ≤ 2.8: split the sentence                                                 |
| Absolutes (never, nothing, nobody, no one) | 0.07 per 100 words | 0.47       | ≤ 0.3: keep a fact or a quotation, cut the framing                        |
| "rather than"                              | 0.02 per 100 words | 0.1        | ≤ 0.1: "instead of", ", not", or rephrase                                 |

Inverse tell, reported but not budgeted: 2026 prose lost its exclamation marks, question marks, and
parentheticals, each halved or worse. Too clean reads as generated too.

## Not tells

Flagged by external lists, present in the pre-LLM corpus, and therefore allowed: the
question–answer pivot ("Why? Because …"), one-word triads ("Simple, elegant, practical."), a single
short sentence, _especially_, _in practice_, _instead of_, _essentially_, _worth noting_, "the real
problem", colon-introduced lists, and short sentences in general. The machine's monotone is
_uniform_ sentence length, not short length: the coefficient of variation did not drift. Don't
"fix" these in anyone's prose.

Also not a tell: a third-party quotation that trips a pattern. Quotations are inviolable (blog
feedback 4.8).

## Mechanical check

`prose-tells` in this skill's directory runs the calibrated checker on any Markdown file. The
canonical tool and its tests live in the `blog-hugo` repository (`tools/prose-tells/index.mjs`),
so the shim needs that checkout at `~/Open/blog-hugo` or `BLOG_HUGO_DIR`:

```bash
~/.claude/skills/writing-style/prose-tells --check README.md dev-docs/*.md
```

It reports each finding with a line number, the em-dash density, and the four cadence numbers
against their budgets; `--check` exits non-zero on any finding or overrun. Findings are judgment
calls: deliberate rhetoric and quotations stay, with a reason. The checker strips front matter,
fenced and inline code, HTML comments, image alt text, and `[ … ]` drafting notes that open a line,
so it runs on a README or a wiki page as it does on a post. Check GitHub comments and chat replies
by reading: the families above are short enough to hold in mind.
