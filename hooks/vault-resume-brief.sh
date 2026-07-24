#!/usr/bin/env bash
# SessionStart hook — inject a brief vault status digest (GET /system/resume-brief).
# The push half of the /vault resume pair (the bd prime pattern): a few lines
# answering "should this session run a full /vault resume?" — never a
# substitute for it. Silent no-op on ANY failure: a session-start hook must
# never block or delay startup, so missing env, missing jq/curl, unreachable
# or pre-brief server (404), and non-repo cwd all exit 0 immediately.

set -u
[[ -n "${VAULT_API_URL:-}" && -n "${VAULT_API_TOKEN:-}" ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0

# Project derivation — mirrors vault-check-drift: nearest git repo root,
# `.claude/vault-project` override, else the root's basename. Non-repo cwd →
# fleet-level digest (no project block).
project=""
if root=$(git rev-parse --show-toplevel 2>/dev/null); then
  if [[ -f "$root/.claude/vault-project" ]]; then
    project=$(tr -d '[:space:]' <"$root/.claude/vault-project")
  else
    project=$(basename "$root")
  fi
fi

url="$VAULT_API_URL/system/resume-brief"
[[ $project =~ ^[a-z0-9][a-z0-9-]*$ ]] && url="$url?project=$project"

resp=$(curl -sf --connect-timeout 1 --max-time 2 \
  -H "Authorization: Bearer $VAULT_API_TOKEN" "$url") || exit 0

jq -r '
  def join_present: [.[] | select(. != null)] | join("; ");
  "[vault] " + ([
      (if .lint.ok then "lint ok" else "lint: \(.lint.total_issues) issues" end),
      (if .suggestions_pending > 0 then "\(.suggestions_pending) pending suggestions" else null end),
      (if .workflow.active then "agent-workflow Active non-empty" else null end),
      (if (.workflow.clarify_pending // 0) > 0 then "\(.workflow.clarify_pending) to /clarify" else null end)
    ] | join_present),
  (.project | if . == null then empty else
    "[vault] \(.name): " + ([
        (if (.queue.active | length) > 0 then "ACTIVE: \(.queue.active | join(" | "))" else null end),
        "\(.queue.ready)/\(.queue.backlog) backlog ready",
        (if .queue.blocked > 0 then "\(.queue.blocked) blocked" else null end),
        (if .feedback then "feedback.md updated \(.feedback.updated)" else null end)
      ] | join_present)
  end),
  (.latest_log | if . == null then empty
    else "[vault] last log \(.updated): \(.title // .file_path)" end),
  "[vault] Digest only — /vault resume for full context (drift check, feedback body, logs)."
' <<<"$resp" 2>/dev/null || exit 0
exit 0
