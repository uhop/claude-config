#!/usr/bin/env bash
# unchecked-claim-check.sh — Stop hook: a closing message that calls a fact unchecked ("I haven't
# checked", "from memory", "as I recall") sends the agent back once, since a check that runs in
# minutes is a step not taken (CLAUDE.md § Deliberate omissions are disclosures). The 2026-11-11
# reflect report, P1: 51 of 1,128 closing messages matched, about 45 of them real misses.
#
# Code, quoted lines, and quoted words are left out (hooks/lib/unchecked_claims.py): they hold
# other people's words. The re-entry carries `stop_hook_active: true`, on which this hook exits 0,
# so a claim the agent keeps, with its reason, costs one turn.
#
# FAILS OPEN, silently: no jq, no python, no matcher, no closing message, or a sub-agent run all
# exit 0.
#
# Hook contract: stdin JSON {stop_hook_active, last_assistant_message?, agent_id?}; stdout JSON on
# block.

set -u

payload=$(cat)

command -v jq >/dev/null 2>&1 || exit 0
[[ -x /usr/bin/python3 ]] || exit 0

agent_id=$(jq -r '.agent_id // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -z "$agent_id" ]] || exit 0

active=$(jq -r '.stop_hook_active // false' <<<"$payload" 2>/dev/null) || exit 0
[[ "$active" != "true" ]] || exit 0

message=$(jq -r '.last_assistant_message // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -n "$message" ]] || exit 0

lib="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib"
[[ -f "$lib/unchecked_claims.py" ]] || exit 0

# In a function, since Bash 3.2 can fail to parse a heredoc inside `$( … )` (hook-syntax.test.mjs).
findings() {
  MESSAGE="$message" PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 - "$lib" <<'PY' 2>/dev/null
import os, sys
sys.path.insert(0, sys.argv[1])
from unchecked_claims import claims

for phrase, context in claims(os.environ.get('MESSAGE', ''))[:4]:
    print(f'"{phrase}" ("{context}")')
PY
}

found=$(findings) || exit 0
[[ -n "$found" ]] || exit 0

said=$(paste -sd ';' <<<"$found" | sed 's/;/; /g')
reason="[unchecked] This reply says $said. If a lookup, a test, or a measurement settles it here in minutes, run it and report the result; if it needs a step outside reach (his browser, a host, a deploy), say which in one clause. Then stop again."

jq -n --arg r "$reason" '{decision: "block", reason: $r}'
