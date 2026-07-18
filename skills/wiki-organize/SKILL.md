---
name: wiki-organize
description: Organize a project's GitHub wiki — add a curated _Sidebar.md navigation rail and wiki search (wiki-search index preferred, GitHub's scoped search as fallback). Use when asked to add or clean up wiki navigation, add a sidebar, add wiki search or a search index, declutter the auto "Pages" list, or organize a project wiki. Companion to document-wiki-page (per-page authoring) and wiki-conventions (page naming). Auto-detects OWNER/REPO from package.json + git; never hardcodes uhop.
---

# Organize a project's GitHub wiki (sidebar + search)

Replace GitHub's auto-generated "Pages" rail with a curated `_Sidebar.md`, and surface wiki search — preferably wiki-search (ranked, deep-linked index) with GitHub's scoped search as the fallback line. Either way search is a *link*: no in-page search box is possible (GitHub sanitizes wiki HTML, so Pagefind/Algolia/lunr can't run).

This skill is the **organization** layer. Two sibling skills handle the rest: `wiki-conventions` (page *naming* — filenames the sidebar links to) and `document-wiki-page` (writing one *component page*). **The convention is authoritative in the vault — read `project-wiki-convention` first** (submodule + `Home.md` baseline; two naming tracks — module pages = source path lowercase, prose/concept pages = Title-case with a `Concepts:-` / `Cookbook:-` prefix; Markdown links — never `[[…]]`); the *why/limits* behind every rule below live in `github-wiki-constraints`.

## Detect context first

Gather these from the current working directory before writing:

| Value | How to find it |
| --- | --- |
| `OWNER/REPO` | `jq -r .repository.url package.json` — strip leading `git+` and trailing `.git`; or `git remote get-url origin`. **Never hardcode `uhop/...`.** |
| Wiki folder | Usually `wiki/` (a git submodule); chezmoi dotfiles use `external_wiki/`. List the repo root to confirm. |
| Existing pages | `ls <wiki>/*.md` — these are the link targets. |
| Home grouping | Read `<wiki>/Home.md`'s `# Documentation` section — the sidebar **mirrors** it so nav and landing page never drift. **If Home has no `# Documentation` hub, create it first** (a grouped, *annotated* catalog — each entry says when to read it) per the vault note `wiki-home-and-hub-pages`, then mirror it. |
| Version doc-sets | Any `vN/` subfolder with a separate doc set? Decides one sidebar vs. many (see §1). |

## 1. Build `_Sidebar.md`

Root sidebar template:

```markdown
<!-- markdownlint-disable first-line-heading -->

&#128269; [Search the wiki](Home#search)

### [PROJECT](Home)

- [Getting-started page](Page-Name)
- [Release history](Release-history)

**Group label**

- [Page](Page-Name)
- [Category: page](./Category:-Page-Name)

---

Companion or legacy cross-link
```

Rules (each is a consequence of `github-wiki-constraints`):

- **First line** is `<!-- markdownlint-disable first-line-heading -->` — the sidebar opens with a link/heading, not an H1.
- **Search link at the very top** (§2), routing to `Home#search` — one short link in the narrow rail; the actual search URLs live in Home's `# Search` section.
- **HTML entities in prose**, per the vault note `markdown-html-entities-not-unicode`: `&#128269;` not a literal 🔍, `&mdash;` not a literal em dash; ASCII inside code spans.
- **Title is a Home link**: `### [PROJECT x.x](Home)`. Sub-pages get no automatic Home link, so the sidebar header is the only way back.
- **Colon-free pages: bare names.** `[Pick](Pick)`, not `[Pick](./Pick)` — bare targets resolve globally, so they stay correct when the root sidebar is *inherited* onto subfolder pages.
- **Colon-named pages (`Category:-Name`): never bare.** CommonMark parses `Category:` as a URI scheme and GitHub strips the href — the entry silently renders as plain text (bit list-toolkit 2026-07-18: 22 of 34 sidebar entries unlinked). Write `[page](./Category:-Page)`; the `./` forces relative-path parsing and anchors compose (`./Trees:-SplayTree#anchor`). Exception: in a multi-folder wiki the inherited root sidebar can't use `./` (directory-relative) — encode instead: `[page](Category%3A-Page)`. Detail: `github-wiki-colon-page-links`.
- **Paren-named pages** use the angle-bracket link form: `[emit()](<emit()>)`, `[chain()](<chain()>)`.
- **Group with bold labels** (`**Filters**`, `**Streamers**`) + bullet lists, mirroring `Home.md`'s `# Documentation` grouping.
- **Deprecated surface**: keep the group but mark it — `**JSONL** (deprecated)` — where the pages already carry deprecation banners.
- **Bottom cross-link** after a `---`: the legacy version or a companion project (e.g. `[stream-chain 2.x](V2-@-Home) (legacy)`, or `Built on [stream-chain](…/wiki)`).

### One sidebar or many?

`_Sidebar.md` is **per-directory and inherited**. Create a second `vN/_Sidebar.md` *only* if the wiki keeps a separate version doc set in a subfolder (it overrides the root for those pages). A flat single-version wiki needs **one** `_Sidebar.md`.

## 2. Add search

Two tiers. **Prefer wiki-search** (ranked, deep-linked results; in-place search via a bookmarklet — `uhop/wiki-search`); GitHub's scoped search is the fallback line, and the only tier when a wiki has no index. Surface search in two places: the sidebar link (already in the template, routing to `Home#search`) and Home's `# Search` section, placed right before `# Documentation`.

**a) Build the wiki-search index** (builder ≥ 0.1.3 — older versions don't decode HTML entities and produce junk tokens on entity-converted wikis):

```bash
cd <wiki> && npx wiki-search-index --wiki . --repo OWNER/REPO
```

Pass `--repo` explicitly — submodule origins routinely defeat the builder's inference (SSH remotes without `.git`, `*.wiki.git` suffixes). Commit the resulting `search-index.json` with the wiki. An index does **not** go stale on its own — rebuild it whenever wiki *content* changes (fold into any wiki-editing session). The adopter how-to is the wiki-search wiki's `Add-Search` page (includes optional staleness automation).

**b) `Home.md` `# Search` section**, wiki-search form (the app URL is the one canonical deployment — deliberately fixed, see the wiki-search project's decisions):

```markdown
# Search

&#128269; **[Search this wiki](https://uhop.github.io/wiki-search/app/?wiki=OWNER/REPO)** &mdash; ranked, deep-linked search via [wiki-search](https://github.com/uhop/wiki-search); [install the bookmarklet](https://uhop.github.io/wiki-search/) to search in place. Fallback: [GitHub wiki search](https://github.com/search?q=repo%3AOWNER%2FREPO&type=wikis).
```

**GitHub-search-only form** (no index yet):

```markdown
# Search

&#128269; **[Search the wiki](https://github.com/search?q=repo%3AOWNER%2FREPO&type=wikis)** &mdash; full-text search over every page (titles and body text).

> The link opens GitHub's search with the box already filled in as `repo:OWNER/REPO` and the **Wikis** tab selected. Type your terms _after_ the existing text &mdash; e.g. `repo:OWNER/REPO SomeTerm`. **Keep the `repo:OWNER/REPO` part** &mdash; it scopes the search to this wiki; deleting it searches all of GitHub instead. Search is case-insensitive; wrap multi-word phrases in quotes.
```

In the query string, `%3A` = `:` and `%2F` = `/`. GitHub search indexes page **title + body text**, not uploaded files.

## 3. Validate the link targets

GitHub silently renders broken wiki links as plain text — no linter catches them. After writing, run the bundled validator over the whole wiki (not just the sidebar):

```bash
~/.claude/skills/wiki-organize/validate-wiki-links.mjs <wiki>
```

It resolves every internal target against the wiki's flat page namespace — handling `./` prefixes, `%3A` encoding, the `<...>` paren-page form, reference-style definitions, code-block skipping — and reports `MISSING` targets, `COLON` (bare colon-named destination: scheme-parses, GitHub strips the href — see `github-wiki-colon-page-links`), and `ASSET` (relative image/pdf not on disk). Exit 1 on findings — run it solo or guard with `|| true` in parallel batches. Link-syntax background: `github-wiki-no-wikilinks`.

## 4. Ship it (submodule)

The wiki is a git submodule — commit inside `<wiki>/`, then bump the pointer in the parent repo. **The user reviews and pushes himself** — don't commit/push unless explicitly told.

## Related

- **`wiki-conventions`** — page naming (the filenames this sidebar links to).
- **`document-wiki-page`** — writing one component page; its "update `Home.md`" step is the per-page complement to this skill's "mirror Home's grouping."
- Vault knowledge: `github-wiki-constraints` (why/limits), `github-wiki-colon-page-links` (colon-named targets need `./`), `project-wiki-convention` (submodule + structure), `readme-and-wiki-shields` (the `Home.md` dashboard shields above the `# Search` section), `wiki-home-and-hub-pages` (Home as router; the `# Documentation` hub this skill mirrors — create it when missing), `markdown-html-entities-not-unicode` (entities in prose, ASCII in code), `github-wiki-organization-recipe` (this skill's source recipe).
