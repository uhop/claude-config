# shellcheck shell=bash
# Sourced by vault-lease-release.sh (SessionEnd) and vault-lease-claim.sh
# (SessionStart drain): release every lease one holder id holds.
#
# A SessionEnd release that cannot finish (slow or unreachable server, hook
# timeout) leaves a marker naming the holder; the next SessionStart on this
# host releases what that holder still holds (2026-09-19, vault-storage D63).
# A release presents the claim's token (D67), kept by lib/vault-lease-token.sh.

# shellcheck source=lib/vault-lease-token.sh source-path=SCRIPTDIR
. "$(dirname "${BASH_SOURCE[0]}")/vault-lease-token.sh" || return 1

lease_pending_dir="${XDG_STATE_HOME:-$HOME/.local/state}/claude-vault-lease/pending-release"
lease_cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease"

lease_marker_of() { printf '%s/%s' "$lease_pending_dir" "${1//\//_}"; }

# lease_list <seconds> — GET /leases; fails on any trouble.
lease_list() {
  curl -sf --connect-timeout 1 --max-time "$1" \
    -H "Authorization: Bearer $VAULT_API_TOKEN" "$VAULT_API_URL/leases"
}

# lease_release_held <holder> <leases-json> <post-seconds> <max-posts>
# Sets lease_posts to the release calls made. Returns 0 when nothing the
# holder held is left behind: released, already gone (404), or taken by
# someone else or held under a token this host does not have (409 — a side
# lease claimed through the MCP adapter, which lapses at its TTL).
lease_release_held() {
  local holder=$1 leases=$2 post_t=$3 max=$4 mine resource body code left=0
  lease_posts=0
  mine=$(jq -r --arg h "$holder" '.items[]? | select(.holder == $h) | .resource' \
    <<<"$leases" 2>/dev/null) || return 1
  while IFS= read -r resource || [[ -n "$resource" ]]; do
    [[ -n "$resource" ]] || continue
    if ((lease_posts >= max)); then
      left=1
      continue
    fi
    ((++lease_posts))
    body=$(jq -cn --arg r "$resource" --arg h "$holder" --arg t "$(lease_token_of "$holder" "$resource")" \
      '{resource: $r, holder: $h} + (if $t == "" then {} else {claim_token: $t} end)') || {
      left=1
      continue
    }
    code=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 1 --max-time "$post_t" \
      -H "Authorization: Bearer $VAULT_API_TOKEN" -H 'Content-Type: application/json' \
      --data-binary "$body" "$VAULT_API_URL/leases/release") || code=000
    case "$code" in
      200 | 404 | 409)
        rm -f "$lease_cache_dir/$(printf '%s' "$resource" | cksum | tr -d ' ')" 2>/dev/null
        lease_token_drop "$holder" "$resource"
        ;;
      *) left=1 ;;
    esac
  done <<<"$mine"
  return $left
}
