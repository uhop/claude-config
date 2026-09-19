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
# A marker naming the holder is written before any network call and removed
# only once nothing is left: a timeout or an unreachable server leaves it for
# the next SessionStart to drain (lib/vault-lease-release.sh; 2026-09-19).
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

# shellcheck source=lib/vault-lease-release.sh source-path=SCRIPTDIR
. "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib/vault-lease-release.sh" || exit 0

marker=$(lease_marker_of "$me")
mkdir -p "$lease_pending_dir" 2>/dev/null && printf '%s\n' "$me" >"$marker" 2>/dev/null

leases=$(lease_list 2) || exit 0
lease_release_held "$me" "$leases" 1 100 && rm -f "$marker"
exit 0
