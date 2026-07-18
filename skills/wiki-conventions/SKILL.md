---
name: wiki-conventions
description: Apply wiki page naming/link conventions when creating, renaming, or reviewing wiki pages. Two tracks — programmatic module names vs Title-case prose. Defers to the vault as source of truth.
---

# Wiki page conventions

> **The authoritative convention lives in the vault — read it first.** This skill summarizes; the vault
> is the source of truth:
>
> - `topics/project-wiki-convention` — folder/layout, filenames (both tracks below), the `wiki/` submodule.
> - `github-wiki-no-wikilinks` — Markdown links + colon (`%3A`) encoding.
> - `github-wiki-colon-page-links` — bare colon-named destinations parse as URI schemes; the `./`-prefix fix.
> - `github-wiki-constraints` — the why/limits.

## Two naming tracks

**1. Module / component pages — the source path, verbatim, so a programmer finds it by the name they
import.** Lowercase. `/` and the dropped `.js` become spaces, i.e. an **ASCII dash** `-`
(`utils/math/add.js` → `utils-math-add.md` = "utils math add"). A **literal dash** in a name becomes a
**Unicode hyphen U+2010** (`‐`) so GitHub renders a real dash (`code-forward.js` → `code‐forward.md`).
The path prefix clusters modules alphabetically. **Never poeticize a module page** — "Date utilities"
is unfindable; a programmer searches "date". The **main imported module** (`index.js` / `main.js`,
which users never name — they just `import x from 'pkg'`) is the exception: give it an anonymous,
descriptive Title-case name such as `Core-API.md`.

**2. Prose / concept pages (not tied to a module) — Title-case, poetic OK.** First word capitalized,
not All-Words-Capitalized. Cluster with a category prefix + colon: `Concepts:-code-forward.md`
("Concepts: code forward"), `Cookbook:-caching.md`. **Every markdown link to a colon-named page
carries a `./` prefix**: `[…](./Concepts:-code-forward)`. A bare `Concepts:-…` destination parses as
a URI scheme (CommonMark) and GitHub strips the href — the link silently renders as plain text (bit
list-toolkit 2026-07-18: 22/34 sidebar entries unlinked; see `github-wiki-colon-page-links`). `%3A`
encoding (`[…](Concepts%3A-code-forward)`) also works and is the required form for links inherited
across folders — a root `_Sidebar.md` in a multi-folder wiki, where `./` resolves directory-relative.

## Always

- **Links are Markdown `[display](Page-Name)` — NEVER `[[…]]`** (GitHub renders wikilinks as plain
  text); colon-named targets take the `./` prefix (above) — bare ones break just as silently.
- The wiki is a **`wiki/` git submodule** (chezmoi: `external_wiki/`); edit there, the user pushes.
  **Never create or adopt a sibling `<repo>.wiki` clone** — surface a stray one, don't use it.
- Pages are top-level `.md`; `Home.md` is the landing; `_Sidebar.md` / `_Footer.md` are chrome.
- Each page: at least one import + usage example. Brevity, clarity.

## Companion skills

`document-wiki-page` (author one page) · `wiki-organize` (sidebar + search).
