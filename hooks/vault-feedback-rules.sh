#!/usr/bin/env bash
# SessionStart hook — inject the project's feedback rules (GET /projects/<name>/rules,
# vault-storage D380): each rule of projects/<name>/feedback.md as its heading and first paragraph,
# so every session starts with them, a resumed or compacted one included, without /vault resume.
# A hook of its own, since Claude Code caps each hook's output at 10,000 characters and the server
# builds the digest under that. Silent no-op on ANY failure, as the brief hook is: missing env,
# missing jq or curl, an unreachable server, a project with no feedback note, or a non-repo cwd.

set -u
PROGRAM_CLERK_URL=${PROGRAM_CLERK_URL:-${VAULT_API_URL:-}}
PROGRAM_CLERK_KEY=${PROGRAM_CLERK_KEY:-${VAULT_API_TOKEN:-}}
[[ -n $PROGRAM_CLERK_URL && -n $PROGRAM_CLERK_KEY ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0

# The project as the brief hook and vault-check-drift derive it.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
if [[ -f "$root/.claude/vault-project" ]]; then
  project=$(tr -d '[:space:]' <"$root/.claude/vault-project")
else
  project=$(basename "$root")
fi
[[ $project =~ ^[a-z0-9][a-z0-9-]*$ ]] || exit 0

resp=$(curl -sf --connect-timeout 1 --max-time 2 \
  -H "Authorization: Bearer $PROGRAM_CLERK_KEY" \
  "$PROGRAM_CLERK_URL/projects/$project/rules") || exit 0
jq -r '.text // empty' <<<"$resp" 2>/dev/null || true
exit 0
