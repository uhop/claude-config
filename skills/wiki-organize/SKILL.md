---
name: wiki-organize
description: Organize a project's GitHub wiki — add a curated _Sidebar.md navigation rail and GitHub's scoped wiki search. Use when asked to add or clean up wiki navigation, add a sidebar, add wiki search, declutter the auto "Pages" list, or organize a project wiki. Companion to document-wiki-page (per-page authoring) and wiki-conventions (page naming). Auto-detects OWNER/REPO from package.json + git; never hardcodes uhop.
---

# Organize a project's GitHub wiki (sidebar + scoped search)

Replace GitHub's auto-generated "Pages" rail with a curated `_Sidebar.md`, and add GitHub's scoped wiki search as a link (no in-page search box is possible — GitHub sanitizes wiki HTML, so Pagefind/Algolia/lunr can't run).

This skill is the **organization** layer. Two sibling skills handle the rest: `wiki-conventions` (page *naming* — filenames the sidebar links to) and `document-wiki-page` (writing one *component page*). The *why/limits* behind every rule below live in the vault note `github-wiki-constraints`; the structural baseline (submodule, Home.md) is `project-wiki-convention`.

## Detect context first

Gather these from the current working directory before writing:

| Value | How to find it |
| --- | --- |
| `OWNER/REPO` | `jq -r .repository.url package.json` — strip leading `git+` and trailing `.git`; or `git remote get-url origin`. **Never hardcode `uhop/...`.** |
| Wiki folder | Usually `wiki/` (a git submodule); chezmoi dotfiles use `external_wiki/`. List the repo root to confirm. |
| Existing pages | `ls <wiki>/*.md` — these are the link targets. |
| Home grouping | Read `<wiki>/Home.md`'s `# Documentation` section — the sidebar **mirrors** it so nav and landing page never drift. |
| Version doc-sets | Any `vN/` subfolder with a separate doc set? Decides one sidebar vs. many (see §1). |

## 1. Build `_Sidebar.md`

Root sidebar template:

```markdown
<!-- markdownlint-disable first-line-heading -->

🔍 [Search the wiki](https://github.com/search?q=repo%3AOWNER%2FREPO&type=wikis)

### [PROJECT](Home)

- [Getting-started page](Page-Name)
- [Release history](Release-history)

**Group label**

- [Page](Page-Name)

---

Companion or legacy cross-link
```

Rules (each is a consequence of `github-wiki-constraints`):

- **First line** is `<!-- markdownlint-disable first-line-heading -->` — the sidebar opens with a link/heading, not an H1.
- **Search link at the very top** (§2).
- **Title is a Home link**: `### [PROJECT x.x](Home)`. Sub-pages get no automatic Home link, so the sidebar header is the only way back.
- **Bare page names, never `./Page`.** The root sidebar is *inherited* onto subfolder pages, where `./` resolves wrong. `[Pick](Pick)`, not `[Pick](./Pick)`.
- **Paren-named pages** use the angle-bracket link form: `[emit()](<emit()>)`, `[chain()](<chain()>)`.
- **Group with bold labels** (`**Filters**`, `**Streamers**`) + bullet lists, mirroring `Home.md`'s `# Documentation` grouping.
- **Deprecated surface**: keep the group but mark it — `**JSONL** (deprecated)` — where the pages already carry deprecation banners.
- **Bottom cross-link** after a `---`: the legacy version or a companion project (e.g. `[stream-chain 2.x](V2-@-Home) (legacy)`, or `Built on [stream-chain](…/wiki)`).

### One sidebar or many?

`_Sidebar.md` is **per-directory and inherited**. Create a second `vN/_Sidebar.md` *only* if the wiki keeps a separate version doc set in a subfolder (it overrides the root for those pages). A flat single-version wiki needs **one** `_Sidebar.md`.

## 2. Add scoped search

The only native search is GitHub global search scoped to the repo's wikis. Surface it in two places.

**a) Sidebar link** — top of `_Sidebar.md` (already in the template).

**b) `Home.md` `# Search` section** — place it right before `# Documentation`:

```markdown
# Search

🔍 **[Search the wiki](https://github.com/search?q=repo%3AOWNER%2FREPO&type=wikis)** &mdash; full-text search over every page (titles and body text).

> The link opens GitHub's search with the box already filled in as `repo:OWNER/REPO` and the **Wikis** tab selected. Type your terms _after_ the existing text — e.g. `repo:OWNER/REPO SomeTerm`. **Keep the `repo:OWNER/REPO` part** — it scopes the search to this wiki; deleting it searches all of GitHub instead. Search is case-insensitive; wrap multi-word phrases in quotes.
```

In the query string, `%3A` = `:` and `%2F` = `/`. Search indexes page **title + body text**, not uploaded files.

## 3. Validate the link targets

GitHub silently renders broken wiki links as plain text — no linter catches them. After writing, confirm every bare target resolves to an existing `<Page-Name>.md`:

```bash
grep -oE '\]\(<?[^)]+>?\)' <wiki>/_Sidebar.md | sed -E 's/^\]\(<?//; s/>?\)$//' | \
  while read -r t; do case "$t" in http*) ;; *) [ -f "<wiki>/${t}.md" ] || echo "MISSING: $t"; esac; done
```

A naive `[^)]+` extractor trips on paren-named pages (`emit()`) — check those by hand. See `github-wiki-no-wikilinks` for link-syntax rules and `%3A` colon-encoding.

## 4. Ship it (submodule)

The wiki is a git submodule — commit inside `<wiki>/`, then bump the pointer in the parent repo. **The user reviews and pushes himself** — don't commit/push unless explicitly told.

## Related

- **`wiki-conventions`** — page naming (the filenames this sidebar links to).
- **`document-wiki-page`** — writing one component page; its "update `Home.md`" step is the per-page complement to this skill's "mirror Home's grouping."
- Vault knowledge: `github-wiki-constraints` (why/limits), `project-wiki-convention` (submodule + structure), `readme-and-wiki-shields` (the `Home.md` dashboard shields above the `# Search` section), `github-wiki-organization-recipe` (this skill's source recipe).
