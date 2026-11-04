#!/usr/bin/env bash
# SessionStart, async (vault-storage 12d): collects GitHub for a later /vault resume, so that resume
# has nothing slow left to do. Reads GitHub and writes only under ~/.cache/vault-resume. Fail-open.

set -u
payload=$(cat)
[[ -z $(jq -r '.agent_id // ""' <<<"$payload" 2>/dev/null) ]] || exit 0
session=$(jq -r '.session_id // empty' <<<"$payload" 2>/dev/null) || exit 0
[[ -n $session ]] || exit 0
"$HOME/.claude/skills/vault/resume.mjs" --prepare --session "$session" >/dev/null 2>&1
exit 0
