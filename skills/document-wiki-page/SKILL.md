---
name: document-wiki-page
description: Generate or update a wiki page for a project component (function, class, module, CLI utility). Use when asked to document a component for the project wiki, write a wiki page, or refresh wiki documentation after API changes. Auto-detects project name, repo URL, and default branch from package.json + git.
---

# Document a wiki page

Generate a comprehensive documentation page for the specified component, formatted for the project's GitHub wiki. Target developers who will use the component. Be concise and do not include unnecessary details.

This skill replaces the per-project `prompts/doc.md` files that historically lived in Eugene's repos (deprecated 2026-05-05). Project-specific conventions are detected at invocation time rather than hardcoded.

## Detect project context first

Before writing, gather these values from the current working directory:

| Value | How to find it |
| --- | --- |
| Project name | `jq -r .name package.json` |
| Repo URL (https form) | `jq -r .repository.url package.json` — strip leading `git+` and trailing `.git` to get the GitHub URL |
| Default branch | `git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null \| sed 's@^origin/@@'` — fall back to reading `git branch -r` or assuming `main` |
| Public import style | Read `README.md` and `AGENTS.md` for canonical `import` statements; mirror exactly |
| Wiki naming | Apply `wiki-conventions` skill when picking the new page's filename |

These four values drive every link in the output. Don't assume `main` — `tape-six` and `tape-six-proc` use `master`.

## Before generating documentation

1. Read `README.md` for the project overview and the canonical import style.
2. Read `AGENTS.md` (if present) for project conventions.
3. Read the public-API entry points — typically `src/index.js` + `src/index.d.ts`, or `index.js` + `index.d.ts` at the root, or `bin/<tool>.js` for CLI utilities. Match what the project actually ships.
4. Read the actual source file (`.js`) and TypeScript declarations (`.d.ts`) for the component being documented — the source is the truth.
5. Browse existing wiki pages for style and cross-reference conventions; mirror them.

## Page structure

### Function documentation

Include in the "Technical specifications" section:

- Signature (all overloads if applicable).
- Full description of every parameter.
- Return value.
- Additional related exports and their descriptions.

### Class / interface / object documentation

Include in the "Technical specifications" section:

- Constructor parameters (for classes).
- Properties with types and descriptions.
- Methods with full description of parameters and return value.
- Aliases and their canonical counterparts.

### Usage instructions

- Import statement matching the project's canonical form (read `README.md` first — don't guess).
- A simple but representative use case.
- Show relevant methods and options in context.

### Cross-runtime notes (when applicable)

If the project supports more than one runtime (Node, Bun, Deno, browser), call out any behaviour that differs between them. Cite the project's own cross-runtime page if it has one (e.g., `wiki/Cross-runtime-notes.md` in `dollar-shell`). Use Web-standard types (`Uint8Array`, `ReadableStream`) in interface descriptions; runtime-specific types (`Buffer`) only when the API genuinely returns them.

### Troubleshooting

Common issues and their solutions. Pull from real GitHub issues, project `learnings.md`, and recurring questions if you see a pattern.

### Cross-references and "See Also"

End with a "See Also" section listing:

- Related API documentation links (sibling components in the same module).
- Related utility documentation links (helpers commonly used together).
- Links to related wiki pages (e.g., `Cross-runtime-notes`, `Release-notes`, `Configuration`, etc. — whatever the project has).

## Link style

Two contexts, different forms.

### Inside the wiki directory (writing `wiki/<page>.md`)

- **To another wiki page**: relative path, no extension — `[spawn](spawn)` or `[Cross-runtime notes](Cross-runtime-notes)`.
- **To a file in the main repo**: full GitHub blob URL — `https://github.com/<org>/<repo>/blob/<default-branch>/README.md`.

### Inside the main repository (writing `README.md`, `AGENTS.md`, etc.)

- **To another file in the same repo**: relative path — `[AGENTS.md](./AGENTS.md)` or `[the source](./src/index.js)`.
- **To a wiki page**: full GitHub wiki URL — `https://github.com/<org>/<repo>/wiki/<page>`.

Substitute `<org>/<repo>` and `<default-branch>` with the values detected above. Never hardcode `uhop/...` or `main` — read them from the project context.

### URL-encoding for special filenames

GitHub wiki filenames can contain colons (`:`), Unicode hyphens (`U+2010`), and other special characters. When linking to such a page, URL-encode the colon as `%3A`. Unicode hyphens render fine in URLs without encoding. Examples:

- `Adapter:-CRUD-methods.md` → `https://github.com/<org>/<repo>/wiki/Adapter%3A-CRUD-methods`.
- `Utility-‐-tape6‐proc.md` (U+2010 hyphens) → `https://github.com/uhop/tape-six-proc/wiki/Utility-‐-tape6‐proc`.

## `wiki/Home.md`

If the new page deserves a landing-page mention, update `wiki/Home.md` with a link to it under the appropriate section. Don't overlink — `Home.md` is an index, not a sitemap.
