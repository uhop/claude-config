---
name: wiki-index
description: Rebuild a GitHub wiki's `search-index.json` (the wiki-search index) with the latest `wiki-search-index` builder. Use when the user invokes /wiki-index, asks to regenerate or refresh the wiki index, or after editing wiki pages by hand. Finds the wiki (the current wiki clone, or the repository's `wiki/` submodule), infers OWNER/REPO from its origin, works offline from npm's cached builder, and never commits. Backed by `wiki-index.sh`.
user_invocable: true
---

# /wiki-index — rebuild the wiki search index

`search-index.json` is a build output of the wiki pages, so it goes stale on every page edit. This skill rebuilds it whenever the wiki changes. The standing rule that an agent rebuilds it after its own wiki edits is in `CLAUDE.md` § Tools; this skill is the same step as a command.

## Run

```bash
~/.claude/skills/wiki-index/wiki-index.sh            # the wiki of the current repository
~/.claude/skills/wiki-index/wiki-index.sh <wiki-dir> # a specific wiki clone
```

The script:

1. Finds the wiki: the given directory, else the current repository when its origin ends in `.wiki.git`, else that repository's `wiki/` submodule.
2. Stops when the wiki has no `search-index.json`. A wiki without one hasn't adopted wiki search; that is `/wiki-organize`'s job, not a rebuild.
3. Infers `OWNER/REPO` from the wiki's origin and passes it as `--repo`, since the builder's own inference misses some submodule origins.
4. Runs `npx -y wiki-search-index@latest` with retries off. Offline, npm serves the builder it cached last (measured 2026-09-25 with no network); with nothing cached, the run fails in under a second instead of retrying for about 70 seconds. Always `@latest`: a bare `npx wiki-search-index` runs whatever version npm cached, which on nuke was 0.1.1, with different heading output from the 0.2.0 indexes in the fleet.
5. Reports whether the index changed.

## After it runs

- Run it after any formatter pass over the wiki pages (`prettier --write`), never before; a formatter run after the rebuild leaves the index stale again.
- Leave the rebuilt index uncommitted, next to the pages it describes; the user commits the wiki. Report the wiki's repository by name, since a wiki is a separate repository from its project.
- When the host was offline, say so: the index was built with whatever builder version this host last downloaded.

Related: `/wiki-organize` (adds wiki search and the first index), `/document-wiki-page` (per-page authoring).
