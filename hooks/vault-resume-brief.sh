#!/usr/bin/env bash
# SessionStart hook — inject a brief vault status digest (GET /system/resume-brief).
# The push half of the /vault resume pair (the bd prime pattern): a few lines
# answering "should this session run a full /vault resume?" — never a
# substitute for it. Silent no-op on ANY failure: a session-start hook must
# never block or delay startup, so missing env, missing jq/curl, unreachable
# or pre-brief server (404), and non-repo cwd all exit 0 immediately.

set -u
# The product's names first, the old ones until the switch (vault-storage D141).
PROGRAM_CLERK_URL=${PROGRAM_CLERK_URL:-${VAULT_API_URL:-}}
PROGRAM_CLERK_KEY=${PROGRAM_CLERK_KEY:-${VAULT_API_TOKEN:-}}
[[ -n $PROGRAM_CLERK_URL && -n $PROGRAM_CLERK_KEY ]] || exit 0
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

# Start loading the embedding model now, so the session's first semantic
# search does not wait ~35 s for it (vault-storage D80); answers at once.
curl -sf --connect-timeout 1 --max-time 1 -X POST -o /dev/null \
  -H "Authorization: Bearer $PROGRAM_CLERK_KEY" "$PROGRAM_CLERK_URL/maintenance/warm-embedder" || true

url="$PROGRAM_CLERK_URL/system/resume-brief"
[[ $project =~ ^[a-z0-9][a-z0-9-]*$ ]] && url="$url?project=$project"

resp=$(curl -s --connect-timeout 1 --max-time 2 -w '\n%{http_code}' \
  -H "Authorization: Bearer $PROGRAM_CLERK_KEY" "$url") || exit 0
code=${resp##*$'\n'}
resp=${resp%$'\n'*}
# A refused key is the one failure the session must hear of: the day it expires, the hooks go quiet (D210).
if [[ $code == 401 ]]; then
  echo "[vault] the vault refused PROGRAM_CLERK_KEY (401): expired or recalled; make a new key on /ui/keys.html (a fresh sign-in)"
  exit 0
fi
[[ $code == 200 ]] || exit 0

jq -r '
  def join_present: [.[] | select(. != null)] | join("; ");
  "[vault] " + ([
      (if .lint.ok then "lint ok" else "lint: \(.lint.total_issues) issues" end),
      (if .suggestions_pending > 0 then "\(.suggestions_pending) pending suggestions" else null end),
      (if .workflow.active then "agent-workflow Active non-empty" else null end),
      (if (.workflow.clarify_pending // 0) > 0 then "\(.workflow.clarify_pending) to /clarify" else null end),
      # loop stalls of the past week on the vault server (vault-storage D177); absent before 2026-10-09
      (.stalls | if . then
        "loop stalls this week: \(.count), latest \(.latestMs) ms at \(.latestAt[0:16] | sub("T"; " "))Z, worst \(.worstMs) ms (vault_health)"
      else null end),
      # the vault branch against its remote (vault-storage D193), said only when a person must act
      (.store | if . == null then null
        elif .diverged then "store: \(.remote) has \(.behind) commit(s) the vault lacks, pushing stopped (\(.ahead) waiting)"
        elif .lastError then "store: \(.lastError)"
        else null end)
    ] | join_present),
  # the calling key within seven days of its expiry (vault-storage D210); absent before 2026-10-12
  (.key // null | if . == null then empty else
    ((.expiresAt | sub("\\.[0-9]+"; "") | fromdateiso8601) - now) as $left |
    ($left / 86400 | floor) as $days |
    if $left > 7 * 86400 then empty else
      "[vault] key \(.name) expires \(
        if $left < 86400 then "within a day"
        else "in \($days) day\(if $days == 1 then "" else "s" end)" end
      ) (\(.expiresAt[0:10])); make a new one on /ui/keys.html (a fresh sign-in)"
    end
  end),
  (.project | if . == null then empty else
    "[vault] \(.name): " + ([
        (if (.queue.active | length) > 0 then
          "ACTIVE: " + (
            # in_flight (server ≥ 2026-09-30) names the ticket an Active item mirrors;
            # its upstream (vault-storage D111) marks a ticket the stored baseline shows done
            (.queue.in_flight // (.queue.active | map({title: ., source: null})))
            | map(.title + (if .source then " (\(.source)\(
                if .upstream == "closed" or .upstream == "merged" then ", \(.upstream) upstream" else "" end))"
              else "" end)) | join(" | "))
        else null end),
        (if (.queue.inbox // 0) > 0 then "\(.queue.inbox) in the inbox to triage" else null end),
        "\(.queue.ready)/\(.queue.backlog) backlog ready",
        (if .queue.blocked > 0 then "\(.queue.blocked) blocked" else null end),
        ((.queue.hygiene // []) | if length > 0 then "queue hygiene \(length): \(.[0])" else null end),
        (if .feedback then "feedback.md updated \(.feedback.updated)" else null end),
        (if (.trackers.primary.kind // "vault") != "vault" then "tracked in \(.trackers.line)" else null end),
        (if (.sessions_unlogged // 0) > 0 then "\(.sessions_unlogged) session(s) ended without a log" else null end)
      ] | join_present)
  end),
  (.latest_log | if . == null then empty
    else "[vault] last log \(.updated)\(if .scope == "fleet" then " (fleet)" else "" end): \(.title // .file_path)" end)
' <<<"$resp" 2>/dev/null || exit 0

# GitHub line from the stored baseline, never from GitHub itself (2026-09-05):
# `projects/<name>/state.md` § GitHub holds the last fleet-status snapshot,
# written by the manual daily or by a `/vault resume`. One line — open
# items, published advisories without a CVE, open alerts, the last CI
# conclusion, and how old the collection is — so a stale baseline reads as
# stale rather than as quiet. No block, no line; any failure, no line.
if [[ $project =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  state=$(curl -sf --connect-timeout 1 --max-time 2 \
    -H "Authorization: Bearer $PROGRAM_CLERK_KEY" \
    "$PROGRAM_CLERK_URL/vault/projects/$project/state.md") || state=""
  block=$(awk '/^## GitHub/{f=1} f && /^```json/{g=1; next} g && /^```/{exit} g' <<<"$state")
  if [[ -n "$block" ]]; then
    jq -r '
      def count(f): [f] | length;
      (now - (.collected_at | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601)) as $age |
      ($age / 3600 | floor) as $h |
      (if $h < 48 then "\($h)h ago" else "\($h / 24 | floor)d ago" end) as $when |
      [.items[]? | select(.state == "open")] as $open |
      "[vault] github \(.repo): " + ([
          "\($open | length) open (\(count($open[] | select(.is_pr | not))) issues, \(count($open[] | select(.is_pr))) PRs)",
          (count(.advisories[]? | select(.state == "published" and .cve_id == null)) as $a
            | if $a > 0 then "\($a) advisories without CVE" else null end),
          ([.alerts | to_entries[] | select((.value.open // 0) > 0)
              | "\(.key | sub("_"; " ")) \(.value.open)"]
            | if length > 0 then "alerts " + join(", ") else null end),
          (if .ci then "CI \(.ci.conclusion // .ci.status)" else null end),
          "collected \(.collected_at | sub("T(?<t>[0-9:]{5}).*$"; " \(.t)")) (\($when))"
        ] | map(select(. != null)) | join("; "))
    ' <<<"$block" 2>/dev/null || true
  fi
fi

echo "[vault] Digest only — /vault resume for full context (drift check, feedback body, logs)."
exit 0
