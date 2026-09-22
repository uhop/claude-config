#!/usr/bin/env bash
# bg-shells-open.sh — Stop hook: a background shell the transcript shows
# launched and neither completed nor stopped is named to the agent before
# the turn ends, once per shell, so the all-clear is measured rather than
# remembered (CLAUDE.md § Background shells; reflect 2026-09-22, the third
# time "both registries are empty" was claimed with a shell still live).
#
# Mechanism: `decision: block` with the shells in `reason` sends the agent
# back to deal with them; the re-entry carries `stop_hook_active: true`, on
# which this hook exits 0, so a shell that must keep running (a server, a
# watcher the user asked for) costs exactly one extra turn in its lifetime —
# the id is recorded per session and never raised again.
#
# FAILS OPEN, silently: no jq, no node, no transcript, a sub-agent run
# (agent_id present) all exit 0 with no output. The lister is
# skills/bg-shells/bg-shells.mjs; the record lives under
# ${XDG_CACHE_HOME:-~/.cache}/claude-bg-shells/<session_id>.reported.
#
# Hook contract: stdin JSON {session_id, transcript_path, cwd,
# hook_event_name, stop_hook_active, agent_id?}; stdout JSON on block.

set -u

payload=$(cat)

command -v jq >/dev/null 2>&1 || exit 0
command -v node >/dev/null 2>&1 || exit 0

agent_id=$(jq -r '.agent_id // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -z "$agent_id" ]] || exit 0

active=$(jq -r '.stop_hook_active // false' <<<"$payload" 2>/dev/null) || exit 0
[[ "$active" != "true" ]] || exit 0

transcript=$(jq -r '.transcript_path // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -n "$transcript" && -f "$transcript" ]] || exit 0

session_id=$(jq -r '.session_id // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -n "$session_id" ]] || exit 0

lister="$HOME/.claude/skills/bg-shells/bg-shells.mjs"
[[ -f "$lister" ]] || exit 0

live=$(node "$lister" --json --live --session="$transcript" 2>/dev/null |
  jq -r '.[].shells[] | "\(.shell_id)\t\(if .description == "" then .command else .description end)"' 2>/dev/null) || exit 0
[[ -n "$live" ]] || exit 0

state_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-bg-shells"
mkdir -p "$state_dir" 2>/dev/null || exit 0
marker="$state_dir/$session_id.reported"
touch "$marker" 2>/dev/null || exit 0

new=""
while IFS=$'\t' read -r id desc || [[ -n "$id" ]]; do
  [[ -n "$id" ]] || continue
  command grep -qxF "$id" "$marker" && continue
  new+="$id"$'\t'"$desc"$'\n'
done <<<"$live"
[[ -n "$new" ]] || exit 0

printf '%s' "$new" | cut -f1 >>"$marker"

n=$(printf '%s' "$new" | command grep -c .)
list=$(printf '%s' "$new" | awk -F'\t' '{d = substr($2, 1, 70); gsub(/[[:space:]]+/, " ", d); printf "%s%s (%s)", (NR > 1 ? "; " : ""), $1, d}')

jq -n --arg r "[bg-shells] $n background shell(s) still live: $list. A live shell is not part of a finished turn: TaskStop each one you no longer need (a watcher dies with its producer), or say in one line which one must keep running and why, then finish." \
  '{decision: "block", reason: $r}'
