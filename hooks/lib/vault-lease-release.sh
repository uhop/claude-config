# shellcheck shell=bash
# Sourced by vault-lease-release.sh (SessionEnd) and vault-lease-claim.sh
# (SessionStart drain): release every lease one holder id holds.
#
# A SessionEnd release that cannot finish (slow or unreachable server, hook
# timeout) leaves a marker naming the holder; the next SessionStart on this
# host releases what that holder still holds (2026-09-19, vault-storage D63).

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
# someone else (409).
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
    body=$(jq -cn --arg r "$resource" --arg h "$holder" '{resource: $r, holder: $h}') || {
      left=1
      continue
    }
    code=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 1 --max-time "$post_t" \
      -H "Authorization: Bearer $VAULT_API_TOKEN" -H 'Content-Type: application/json' \
      --data-binary "$body" "$VAULT_API_URL/leases/release") || code=000
    case "$code" in
      200 | 404 | 409)
        rm -f "$lease_cache_dir/$(printf '%s' "$resource" | cksum | tr -d ' ')" 2>/dev/null
        ;;
      *) left=1 ;;
    esac
  done <<<"$mine"
  return $left
}
