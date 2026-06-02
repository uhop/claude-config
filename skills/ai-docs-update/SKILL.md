---
name: ai-docs-update
description: Update AI-facing docs (llms.txt, llms-full.txt, ARCHITECTURE.md, AGENTS.md) after API or structural changes, then sync the rules files. Use when the user invokes /ai-docs-update, changes the public API / module layout / exports, or asks to refresh the machine-readable docs. Companion to /sync-ai-rules and /release-check.
---

# AI Documentation Update

Refresh all AI-facing files after changes to the public API, modules, or
project structure. Works on any project following the AGENTS.md / llms.txt
convention.

## Steps

1. Read the entry-point source files (e.g. `src/index.js` and key modules) to
   identify the current public API.
2. Read `AGENTS.md` and `ARCHITECTURE.md` for current state.
3. Identify what changed (new modules, options, renamed exports, new
   utilities, removed features, etc.).
4. Update `llms.txt`:
   - Ensure the API section matches the current source.
   - Update common patterns if new features were added.
   - Keep it concise — this is for quick LLM consumption.
5. Update `llms-full.txt`:
   - Full API reference with all components, options, and examples.
   - Include any new exports, filters, streamers, or utilities.
6. Update `ARCHITECTURE.md` if project structure or module dependencies changed.
7. Update `AGENTS.md` if critical rules, commands, or the architecture quick
   reference changed.
8. If `AGENTS.md` changed, run `/sync-ai-rules` to propagate the condensed
   rules to `.windsurfrules` / `.cursorrules` / `.clinerules` — these three
   must stay byte-identical to the rules block in `AGENTS.md`.
9. Update `wiki/Home.md` if the overview or structure changed (only if a wiki
   exists).
10. Show the shortest correct import forms in any examples you touch — default
    import for a single default-bearing symbol, all-named when pulling several
    from one module, never mixed `import X, {Y}` (see
    [[topics/esm-default-export-with-named-mirror]]).
11. Provide a summary of what was updated.
