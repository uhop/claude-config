#!/usr/bin/env bash
# vault-session-record.sh — SessionEnd hook: append one JSON line about this
# session's end to the project's month file
# `projects/<name>/data/sessions/<YYYY-MM>.jsonl`, so a session that ends
# without a wrap leaves what it did where the next resume finds it
# (vault-storage D105, 10e-2). The line's fields are the server's contract
# (vault-storage `src/server/sessions.ts`): change both or neither.
#
# What goes in: {"kind": "end", ended, holder, started, reason, commits,
# wrote}: when the session ended and why, the holder id (as the lease hooks
# build it), when it started (the transcript's first timestamp), the commits
# that landed in the checkout meanwhile (`git log --since`, whoever made
# them), and the vault notes the session touched (the vault MCP write tools
# and `vault-put`/`vault-curl` writes in its transcript). Its log is not named
# here: a wrap, or a later resume, appends a `log` line with the same holder,
# and the server pairs the two.
#
# FAILS OPEN, silently, inside the hook's timeout: SessionEnd stdout is shown
# to no one, and nothing here may hold up shutdown. Missing env or tools, a
# non-repo cwd, a sub-agent run (agent_id present), an unreachable server all
# exit 0. Project name as vault-resume-brief.sh derives it: `.claude/vault-project`
# in the repository root, else the root's basename.
#
# Hook contract: stdin JSON {session_id, cwd, transcript_path?, reason?, agent_id?}.

set -u

payload=$(cat)

command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0
command -v git >/dev/null 2>&1 || exit 0
# The product's names first, the old ones until the switch (vault-storage D141).
PROGRAM_CLERK_URL=${PROGRAM_CLERK_URL:-${VAULT_API_URL:-}}
PROGRAM_CLERK_KEY=${PROGRAM_CLERK_KEY:-${VAULT_API_TOKEN:-}}
[[ -n $PROGRAM_CLERK_URL && -n $PROGRAM_CLERK_KEY ]] || exit 0

agent_id=$(jq -r '.agent_id // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -z "$agent_id" ]] || exit 0
session_id=$(jq -r '.session_id // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -n "$session_id" ]] || exit 0
cwd=$(jq -r '.cwd // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -d "$cwd" ]] || exit 0
reason=$(jq -r '.reason // "other"' <<<"$payload" 2>/dev/null) || reason=other
[[ $reason =~ ^[a-z_-]+$ ]] || reason=other

root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
if [[ -f "$root/.claude/vault-project" ]]; then
  project=$(tr -d '[:space:]' <"$root/.claude/vault-project")
else
  project=$(basename "$root")
fi
[[ $project =~ ^[a-z0-9][a-z0-9.-]*$ ]] || exit 0

me="$(hostname -s)/${session_id:0:8}"
ended=$(date -u +%Y-%m-%dT%H:%M:%SZ)

transcript=$(jq -r '.transcript_path // ""' <<<"$payload" 2>/dev/null)
[[ -f "$transcript" ]] || transcript="$HOME/.claude/projects/${cwd//\//-}/$session_id.jsonl"

started=""
wrote=""
if [[ -f "$transcript" ]]; then
  started=$(jq -r 'select(.timestamp) | .timestamp' "$transcript" 2>/dev/null | head -1 | cut -c1-19)
  [[ -n "$started" ]] && started="${started}Z"
  # The vault notes the session touched: the MCP write tools' path arguments,
  # and the paths of vault-put and vault-curl writes in Bash calls.
  wrote=$(
    jq -r '
      (.message.content // [])[]? | select(.type == "tool_use") |
      if (.name | test("^mcp__vault__vault_(write_file|append|replace|replace_section|insert_item|remove_item|update_piece|delete_file)$")) then .input.path
      elif .name == "mcp__vault__vault_supersede" then .input.old_path, (.input.new_path // .input.old_path)
      elif .name == "mcp__vault__vault_move_item" then .input.from_path, .input.to_path
      elif .name == "mcp__vault__vault_move" then .input.from, .input.to
      elif .name == "Bash" then
        (.input.command // "" |
          scan("vault-put\\.mjs +([^ ]+\\.md) +--(?:fm|append|replace)")[0]?,
          scan("vault-curl +/vault/([^ ?]+\\.md) +-X +(?:PUT|DELETE)")[0]?)
      else empty end // empty' "$transcript" 2>/dev/null |
      grep -E '^[a-z0-9][A-Za-z0-9._/-]*\.md$' | sort -u | head -20
  )
fi
[[ -n "$started" ]] || started="$ended"

commits=$(git -C "$root" log --since="$started" --format=%h 2>/dev/null | head -20)

line=$(jq -cn --arg ended "$ended" --arg holder "$me" --arg started "$started" \
  --arg reason "$reason" --arg commits "$commits" --arg wrote "$wrote" '
  def list: split("\n") | map(select(length > 0));
  {kind: "end", ended: $ended, holder: $holder, started: $started, reason: $reason,
   commits: ($commits | list), wrote: ($wrote | list)}' 2>/dev/null) || exit 0

# POST appends, creating the month's file on its first line (vault-storage 10a).
path="projects/$project/data/sessions/${ended:0:7}.jsonl"
curl -s -o /dev/null --connect-timeout 1 --max-time 2 \
  -X POST "$PROGRAM_CLERK_URL/data/$path" \
  -H "Authorization: Bearer $PROGRAM_CLERK_KEY" -H 'Content-Type: text/plain; charset=utf-8' \
  --data-binary "$line"$'\n' >/dev/null 2>&1
exit 0
