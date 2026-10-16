#!/usr/bin/env bash
# vault-notices.sh — the hosted vault's notices (vault-storage 7q-4, D145): what still interrupts
# the service, from GET /system/notices, which the front answers.
#
#   vault-notices.sh --session-start   SessionStart: every listed notice, as brief lines
#   vault-notices.sh                   PostToolUse: at most once a minute, each notice this session
#                                      has not seen yet, once, into the agent's context
#
# A notice is printed once a session: the ids seen go in a cache file per session. Sub-agents are
# skipped, as the lease gate skips them. FAILS OPEN, always: no env, no curl or jq, an unreachable
# server, or one without the route (404) is silence, and the exit is 0.

set -u
PROGRAM_CLERK_URL=${PROGRAM_CLERK_URL:-${VAULT_API_URL:-}}
PROGRAM_CLERK_KEY=${PROGRAM_CLERK_KEY:-${VAULT_API_TOKEN:-}}
[[ -n $PROGRAM_CLERK_URL && -n $PROGRAM_CLERK_KEY ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0

mode=tool
[[ ${1:-} == --session-start ]] && mode=start
payload=$(cat 2>/dev/null) || payload=''
[[ -z $(jq -r '.agent_id // ""' <<<"$payload" 2>/dev/null) ]] || exit 0
session=$(jq -r '.session_id // ""' <<<"$payload" 2>/dev/null)
[[ $session =~ ^[A-Za-z0-9_-]+$ ]] || exit 0

CHECK_EVERY=60
dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-notices"
mkdir -p "$dir" 2>/dev/null || exit 0
seen_file="$dir/$session"
stamp="$dir/$session.checked"
now=$(date +%s)

if [[ $mode == tool ]]; then
  last=0
  [[ -f $stamp ]] && read -r last <"$stamp" 2>/dev/null
  [[ ${last:-0} =~ ^[0-9]+$ ]] || last=0
  ((now - last < CHECK_EVERY)) && exit 0
fi
printf '%s\n' "$now" >"$stamp" 2>/dev/null || true
# A week of sessions is plenty to remember.
find "$dir" -type f -mtime +7 -delete 2>/dev/null || true

resp=$(curl -sf --connect-timeout 1 --max-time 2 \
  -H "Authorization: Bearer $PROGRAM_CLERK_KEY" "$PROGRAM_CLERK_URL/system/notices") || exit 0
seen=$(jq -Rsc 'split("\n") | map(select(length > 0))' "$seen_file" 2>/dev/null) || seen='[]'
[[ -n $seen ]] || seen='[]'

# id <TAB> line, for each notice not seen yet; times in UTC, as every vault line gives them.
lines=$(jq -r --argjson seen "$seen" '
  .notices[]? | select(.id as $id | $seen | index($id) | not) |
  (.starts_at | sub("\\.[0-9]+"; "") | fromdateiso8601) as $starts |
  "\(.id)\t[vault] notice: \(.text)" + (
    if .minutes == null then ""
    else " (\(if $starts > now then "starts" else "started" end) \(.starts_at[0:16] | sub("T"; " "))Z, for about \(.minutes) minute\(if .minutes == 1 then "" else "s" end))"
    end)
' <<<"$resp" 2>/dev/null) || exit 0
[[ -n $lines ]] || exit 0

cut -f1 <<<"$lines" >>"$seen_file" 2>/dev/null || true
text=$(cut -f2- <<<"$lines")
advice="[vault] tell the user, and start no sweep or long batch inside a notice's window."
if [[ $mode == start ]]; then
  printf '%s\n%s\n' "$text" "$advice"
else
  jq -cn --arg m "$text"$'\n'"$advice" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
fi
exit 0
