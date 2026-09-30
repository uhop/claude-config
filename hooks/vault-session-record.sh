#!/usr/bin/env bash
# vault-session-record.sh — SessionEnd hook: append one bullet about this
# session to the project's `projects/<name>/sessions.md`, so a session that
# ends without a wrap leaves what it did where the next resume finds it
# (vault-storage D105, 2026-09-29). The bullet's shape is the server's
# contract (vault-storage `src/server/sessions.ts`): change both or neither.
#
# What goes in: when the session ended and why, the holder id, when it
# started (the transcript's first timestamp), the commits that landed in the
# checkout meanwhile (`git log --since`, whoever made them), the vault notes
# the session touched (the vault MCP write tools and `vault-put`/`vault-curl`
# writes in its transcript), and the log it created, or `none`.
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
[[ -n "${VAULT_API_URL:-}" && -n "${VAULT_API_TOKEN:-}" ]] || exit 0

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
[[ $project =~ ^[a-z0-9][a-z0-9-]*$ ]] || exit 0

me="$(hostname -s)/${session_id:0:8}"
ended=$(date -u +%Y-%m-%dT%H:%M:%SZ)

transcript=$(jq -r '.transcript_path // ""' <<<"$payload" 2>/dev/null)
[[ -f "$transcript" ]] || transcript="$HOME/.claude/projects/${cwd//\//-}/$session_id.jsonl"

tab=$(printf '\t')
started=""
wrote=""
log=none
if [[ -f "$transcript" ]]; then
  started=$(jq -r 'select(.timestamp) | .timestamp' "$transcript" 2>/dev/null | head -1 | cut -c1-19)
  [[ -n "$started" ]] && started="${started}Z"
  # The vault notes the session touched: the MCP write tools' path arguments,
  # and the paths of vault-put and vault-curl writes in Bash calls. A line
  # starts with C when the call creates or replaces a whole note, W otherwise;
  # the session's own log is the first logs/ path among the C lines.
  touched=$(
    jq -r '
      (.message.content // [])[]? | select(.type == "tool_use") |
      if .name == "mcp__vault__vault_write_file" then "C\t" + .input.path
      elif .name == "mcp__vault__vault_supersede" then ("W\t" + .input.old_path), ("C\t" + (.input.new_path // .input.old_path))
      elif (.name | test("^mcp__vault__vault_(append|replace|replace_section|insert_item|remove_item|update_piece|delete_file)$")) then "W\t" + .input.path
      elif .name == "mcp__vault__vault_move_item" then ("W\t" + .input.from_path), ("W\t" + .input.to_path)
      elif .name == "mcp__vault__vault_move" then ("W\t" + .input.from), ("W\t" + .input.to)
      elif .name == "Bash" then
        (.input.command // "" |
          ([scan("vault-put\\.mjs +([^ ]+\\.md) +--fm")[0]?, scan("vault-curl +/vault/([^ ?]+\\.md) +-X +PUT")[0]?] | .[] | "C\t" + .),
          ([scan("vault-put\\.mjs +([^ ]+\\.md) +--(?:append|replace)")[0]?, scan("vault-curl +/vault/([^ ?]+\\.md) +-X +DELETE")[0]?] | .[] | "W\t" + .))
      else empty end // empty' "$transcript" 2>/dev/null |
      grep -E "^[CW]${tab}[a-z0-9][A-Za-z0-9._/-]*\.md$"
  )
  wrote=$(cut -f2 <<<"$touched" | grep . | sort -u | head -20 | paste -sd ',' - | sed 's/,/, /g')
  first_log=$(grep "^C${tab}" <<<"$touched" | cut -f2 | grep -m1 -E '^logs/')
  [[ -n "$first_log" ]] && log="$first_log"
fi
[[ -n "$started" ]] || started="$ended"

commits=$(git -C "$root" log --since="$started" --format=%h 2>/dev/null | head -20 | paste -sd ',' - | sed 's/,/, /g')

count() { [[ -z "$1" ]] && echo 0 || tr ',' '\n' <<<"$1" | wc -l | tr -d ' '; }
line="- **$ended** $me: started $started, ended by $reason, commits: $(count "$commits")"
[[ -n "$commits" ]] && line="$line ($commits)"
line="$line, wrote: $(count "$wrote")"
[[ -n "$wrote" ]] && line="$line ($wrote)"
line="$line, log: $log."

path="projects/$project/sessions.md"
edit=$(jq -cn --arg path "$path" --arg text "$line" '{path: $path, op: "append", text: $text}')
status=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 1 --max-time 2 \
  -X POST "$VAULT_API_URL/vault/edit" \
  -H "Authorization: Bearer $VAULT_API_TOKEN" -H 'Content-Type: application/json' \
  --data-binary "$edit" 2>/dev/null) || exit 0
if [[ $status == 404 ]]; then
  body="Sessions of $project, one bullet each, appended at each session's end by the SessionEnd hook (vault-storage D105). A bullet whose log is \`none\` is a session that ended without a wrap; the next resume writes that log and names it here.

$line
"
  create=$(jq -cn --arg title "$project — Sessions" --arg body "$body" \
    '{frontmatter: {title: $title, type: "state", status: "active"}, body: $body}')
  curl -s -o /dev/null --connect-timeout 1 --max-time 2 \
    -X PUT "$VAULT_API_URL/vault/$path" \
    -H "Authorization: Bearer $VAULT_API_TOKEN" -H 'Content-Type: application/json' \
    --data-binary "$create" >/dev/null 2>&1
fi
exit 0
