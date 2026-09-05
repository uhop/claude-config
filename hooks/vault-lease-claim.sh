#!/usr/bin/env bash
# vault-lease-claim.sh — SessionStart hook: claim the cwd repo's lease for
# the life of this session (agent-coordination protocol, ruled 2026-08-18).
#
# Before this hook, cwd claims were opt-in skill prose and nobody made them,
# so an empty registry could not distinguish "nobody is there" from "nobody
# claimed" — a side agent found no holder, attested a clean tree, and edited
# a repo whose live session had never announced itself. The claim now happens
# where every session already starts. Renewal rides the lease gate — on every
# edit (PreToolUse) and on every tool call (PostToolUse `--touch`, 2026-09-05,
# so a Bash- or MCP-only session stays live); release rides the SessionEnd
# hook; TTL covers a crash.
#
# Design: vault projects/vault-storage/design/agent-coordination
# § Session-lifetime claims. Holder-id convention (must match
# vault-lease-gate.sh): <hostname>/<session-prefix>.
#
# FAILS OPEN, always: a session-start hook must never block or delay startup.
# Missing env, missing jq/curl, non-repo cwd, unreachable server, a sub-agent
# run (payload carries agent_id — the parent owns the repo) all exit 0 with no
# output. Plain-text stdout is injected into the agent's context, so the one
# line printed on success or 409 is the agent's only knowledge of its standing.
#
# Hook contract: stdin JSON {session_id, cwd, hook_event_name, agent_id?}.

set -u

payload=$(cat)

command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0
[[ -n "${VAULT_API_URL:-}" && -n "${VAULT_API_TOKEN:-}" ]] || exit 0

agent_id=$(jq -r '.agent_id // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -z "$agent_id" ]] || exit 0

session_id=$(jq -r '.session_id // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -n "$session_id" ]] || exit 0

cwd=$(jq -r '.cwd // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -n "$cwd" && -d "$cwd" ]] || cwd=$PWD

root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
[[ -n "$root" ]] || exit 0

# Same normalization as vault-lease-gate.sh — the key must be identical on
# both sides or the gate reads our own lease as someone else's.
remote=$(git -C "$root" remote get-url origin 2>/dev/null || true)
if [[ -n "$remote" ]]; then
  normalized=$(sed -e 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##' -e 's#^[^/@]*@##' -e 's#:#/#' \
    -e 's#\.git$##' -e 's#/$##' <<<"$remote")
else
  normalized="$(hostname -s):$root"
fi
resource="repo:$normalized"
me="$(hostname -s)/${session_id:0:8}"

body=$(jq -cn --arg r "$resource" --arg h "$me" \
  '{resource: $r, holder: $h, kind: "agent", priority: "cwd"}') || exit 0

# -w appends the status on its own line so a 409 body is still readable
# (curl -f would discard it, and the 409 body is the whole point).
raw=$(curl -s --connect-timeout 1 --max-time 3 \
  -H "Authorization: Bearer $VAULT_API_TOKEN" -H 'Content-Type: application/json' \
  --data-binary "$body" -w $'\n%{http_code}' "$VAULT_API_URL/leases/claim") || exit 0
code=${raw##*$'\n'}
resp=${raw%$'\n'*}

case "$code" in
  200)
    jq -r --arg r "$resource" --arg me "$me" '
      def ttl: ((.lease.expires_at // "" | if . == "" then null else
        ((. | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) - now) / 3600 | floor end) // null);
      def hours: (ttl | if . == null then "" else " (TTL \(.)h)" end);
      if .status == "preempted" then
        "[vault] lease: \($r) — claimed (cwd) as \($me)\(hours), preempting a side holder — it learns " +
        "at its next edit. Renews on activity; released at session end."
      elif .status == "renewed" then
        "[vault] lease: \($r) — renewed (cwd) as \($me)\(hours). Yours; renews on activity; released at session end."
      else
        "[vault] lease: \($r) — claimed (cwd) as \($me)\(hours). Yours; renews on activity; released at session end."
      end' <<<"$resp" 2>/dev/null || exit 0
    ;;
  409)
    jq -r --arg r "$resource" --arg me "$me" '
      .details.current // {} |
      if (.holder // "") == "" then empty
      elif .holder_kind == "human" then
        "[vault] lease: \($r) is held by \(.holder) (human, operator-held). Ask before editing this " +
        "working tree; work goes in a worktree + a handoff to \"\($r)\"."
      else
        "[vault] lease: \($r) is held by \(.holder) (\(.priority // "agent"), since \(.claimed_at // "?"), " +
        "renewed \(.renewed_at // "?")) — you are SUBORDINATE as \($me): read freely; every edit goes " +
        "worktree + handoff to \"\($r)\" (SendMessage the holder if ListAgents shows it). Taking the " +
        "lease is the operator'"'"'s call — only on an explicit \"take the lease\"."
      end' <<<"$resp" 2>/dev/null || exit 0
    ;;
esac
exit 0
