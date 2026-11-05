# shellcheck shell=bash
# Sourced by the lease hooks: what a session's own lease claims, and the claim
# tokens this host's sessions hold.
#
# A lease claim answers with a claim_token that renew and release must
# present; the holder name alone settles nothing (vault-storage D67). The
# hooks run as separate processes, so the token lives on disk, one file per
# holder and resource, readable by this user only.

lease_token_dir="${XDG_STATE_HOME:-$HOME/.local/state}/claude-vault-lease/tokens"

# lease_cwd_claim_body <resource> <holder> <token> — the claim that the hooks
# call `cwd`. The server knows numbers alone (vault-storage D606): rank 10 takes
# a side lease, which names no rank, at once, and the takeover time lets another
# session take this one only after an hour unrenewed (D63).
lease_cwd_claim_body() {
  jq -cn --arg r "$1" --arg h "$2" --arg t "$3" \
    '{resource: $r, holder: $h, kind: "agent", rank: 10, takeover_after: 3600}
     + (if $t == "" then {} else {claim_token: $t} end)'
}

lease_token_file() {
  printf '%s/%s/%s' "$lease_token_dir" "${1//\//_}" "$(printf '%s' "$2" | cksum | tr -d ' ')"
}

# lease_token_of <holder> <resource> — the stored token, or nothing.
lease_token_of() {
  local f
  f=$(lease_token_file "$1" "$2")
  [[ -f "$f" ]] && head -n1 "$f" 2>/dev/null
  return 0
}

# lease_token_save <holder> <resource> <token>
lease_token_save() {
  [[ -n "$3" ]] || return 0
  local f
  f=$(lease_token_file "$1" "$2")
  (umask 077 && mkdir -p "$(dirname "$f")" && printf '%s\n' "$3" >"$f") 2>/dev/null
  return 0
}

# lease_token_drop <holder> <resource>
lease_token_drop() {
  local f
  f=$(lease_token_file "$1" "$2")
  rm -f "$f" 2>/dev/null
  rmdir "$(dirname "$f")" 2>/dev/null
  return 0
}
