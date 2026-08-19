#!/usr/bin/env bash
# vault-lease-release.sh — SessionEnd hook: release every repo lease this
# session holds (agent-coordination protocol, ruled 2026-08-18).
#
# The SessionStart claim (vault-lease-claim.sh) and any side leases the agent
# took for cross-repo bursts all sit under one holder id, so the release is
# "everything held by me", not "the cwd repo": a side lease the agent forgot
# to release goes too. An explicit release beats waiting out a 4 h TTL — the
# next session in that repo would otherwise start subordinate to a ghost.
#
# Design: vault projects/vault-storage/design/agent-coordination
# § Session-lifetime claims. Holder-id convention (must match the claim hook
# and vault-lease-gate.sh): <hostname>/<session-prefix>.
#
# FAILS OPEN, silently: SessionEnd stdout is not shown to anyone, and a hook
# here must never hold up shutdown. Missing env/tools, unreachable server, a
# sub-agent run (agent_id present) all exit 0. Never `force` — a lease held
# by anyone else is not ours to drop; the server refuses with not_holder.
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

me="$(hostname -s)/${session_id:0:8}"

resp=$(curl -sf --connect-timeout 1 --max-time 3 \
  -H "Authorization: Bearer $VAULT_API_TOKEN" "$VAULT_API_URL/leases") || exit 0
mine=$(jq -r --arg me "$me" '.items[]? | select(.holder == $me) | .resource' <<<"$resp" 2>/dev/null) || exit 0
[[ -n "$mine" ]] || exit 0

while IFS= read -r resource || [[ -n "$resource" ]]; do
  [[ -n "$resource" ]] || continue
  body=$(jq -cn --arg r "$resource" --arg h "$me" '{resource: $r, holder: $h}') || continue
  curl -s -o /dev/null --connect-timeout 1 --max-time 3 \
    -H "Authorization: Bearer $VAULT_API_TOKEN" -H 'Content-Type: application/json' \
    --data-binary "$body" "$VAULT_API_URL/leases/release" || true
done <<<"$mine"

# Drop the gate's short-TTL cache entries for what we held, so a session
# starting in the next few seconds does not read our stale "held by X".
cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease"
if [[ -d "$cache_dir" ]]; then
  while IFS= read -r resource || [[ -n "$resource" ]]; do
    [[ -n "$resource" ]] || continue
    rm -f "$cache_dir/$(printf '%s' "$resource" | cksum | tr -d ' ')" 2>/dev/null || true
  done <<<"$mine"
fi
exit 0
