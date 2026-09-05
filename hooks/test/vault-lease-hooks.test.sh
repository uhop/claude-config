#!/usr/bin/env bash
# Tests for the session-lifetime lease hooks (ruled 2026-08-18):
#   ../vault-lease-claim.sh   (SessionStart)  claim the cwd repo as <host>/<session-prefix>
#   ../vault-lease-release.sh (SessionEnd)    release everything that holder has
#   ../vault-lease-gate.sh    (PreToolUse)    renew on touch / re-claim own repo / block others
#   ../vault-lease-gate.sh --touch (PostToolUse) renew / re-claim the cwd repo on any tool call, never block
#
# Two halves. The OFFLINE half asserts fail-open (exit 0, no stdout) for the
# unknowns every hook must swallow: no vault env, non-repo cwd, sub-agent
# payload. It runs anywhere. The LIVE half needs VAULT_API_URL/TOKEN and a
# reachable server; it round-trips claim → gate-allow → second-session
# 409/subordinate line → gate-block → release against a THROWAWAY git repo
# whose remote is fake (repo:github.com/uhop/zz-lease-hook-test), so no real
# lease is ever touched. Skipped, not failed, when the env is absent.
#
# Exit non-zero on any failure. No framework: the repo has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAIM="$HERE/vault-lease-claim.sh"
RELEASE="$HERE/vault-lease-release.sh"
GATE="$HERE/vault-lease-gate.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }

pass=0 fail=0
ok()   { ((++pass)); }
bad()  { ((++fail)); printf 'FAIL  %s\n' "$1"; }
# run <hook> <payload-json> [env-prefix...]; sets rc, out
run() {
  local hook="$1" payload="$2"; shift 2
  out=$(printf '%s' "$payload" | env "$@" bash "$hook" 2>/dev/null); rc=$?
}
# touch <payload-json> [env-prefix...]; the gate in PostToolUse --touch mode
touch_() {
  local payload="$1"; shift
  out=$(printf '%s' "$payload" | env "$@" bash "$GATE" --touch 2>/dev/null); rc=$?
}
stampfile() { printf '%s/%s.renew' "${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease" "$(printf '%s' "$1" | cksum | tr -d ' ')"; }

# ── OFFLINE: fail-open on every unknown ──────────────────────────────────
run "$CLAIM"   '{"session_id":"deadbeefcafe","cwd":"/"}' VAULT_API_URL= VAULT_API_TOKEN=
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "claim: no env must exit 0 silently (rc=$rc out=$out)"
run "$RELEASE" '{"session_id":"deadbeefcafe","cwd":"/"}' VAULT_API_URL= VAULT_API_TOKEN=
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "release: no env must exit 0 silently"
run "$GATE" '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/x"},"session_id":"deadbeefcafe","cwd":"/tmp"}' VAULT_API_URL= VAULT_API_TOKEN=
[[ $rc -eq 0 ]] && ok || bad "gate: no env must allow"
touch_ '{"session_id":"deadbeefcafe","cwd":"/tmp"}' VAULT_API_URL= VAULT_API_TOKEN=
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "touch: no env must exit 0 silently"
touch_ '{"session_id":"deadbeefcafe","cwd":"/tmp","agent_id":"sub-1"}' VAULT_API_URL=http://127.0.0.1:9 VAULT_API_TOKEN=x
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "touch: sub-agent payload must exit 0 silently"
touch_ '{"session_id":"deadbeefcafe","cwd":"/tmp"}' VAULT_API_URL=http://127.0.0.1:9 VAULT_API_TOKEN=x
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "touch: non-repo cwd must exit 0 silently"

nonrepo=$(mktemp -d)
run "$CLAIM" "$(jq -nc --arg c "$nonrepo" '{session_id:"deadbeefcafe",cwd:$c}')" VAULT_API_URL=http://127.0.0.1:9 VAULT_API_TOKEN=x
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "claim: non-repo cwd must exit 0 silently"
run "$CLAIM" '{"session_id":"deadbeefcafe","cwd":"/","agent_id":"sub-1"}' VAULT_API_URL=http://127.0.0.1:9 VAULT_API_TOKEN=x
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "claim: sub-agent payload must exit 0 silently"
run "$CLAIM" '{"session_id":"deadbeefcafe","cwd":"/"}' VAULT_API_URL=http://127.0.0.1:9 VAULT_API_TOKEN=x
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "claim: unreachable server must exit 0 silently"
rmdir "$nonrepo"

# ── LIVE: round-trip on a throwaway repo with a fake remote ──────────────
if [[ -z "${VAULT_API_URL:-}" || -z "${VAULT_API_TOKEN:-}" ]] ||
   ! curl -sf --connect-timeout 1 --max-time 2 -H "Authorization: Bearer $VAULT_API_TOKEN" \
       "$VAULT_API_URL/leases" >/dev/null 2>&1; then
  echo "live half skipped (no VAULT_API_URL/TOKEN or server unreachable)"
else
  W=$(mktemp -d)
  git -C "$W" init -q && git -C "$W" remote add origin git@github.com:uhop/zz-lease-hook-test.git
  git -C "$W" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
  RES="repo:github.com/uhop/zz-lease-hook-test"
  S1=aaaa1111beef; S2=bbbb2222beef
  ME1="$(hostname -s)/${S1:0:8}"; ME2="$(hostname -s)/${S2:0:8}"
  hdr=(-H "Authorization: Bearer $VAULT_API_TOKEN")
  # make sure no leftover from an aborted run
  curl -s -o /dev/null "${hdr[@]}" -H 'Content-Type: application/json' \
    --data-binary "$(jq -nc --arg r "$RES" '{resource:$r,holder:"test-cleanup",force:true}')" \
    "$VAULT_API_URL/leases/release" || true
  rm -f "${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease/$(printf '%s' "$RES" | cksum | tr -d ' ')"*

  # 1. session 1 claims its cwd repo
  run "$CLAIM" "$(jq -nc --arg c "$W" --arg s "$S1" '{session_id:$s,cwd:$c}')"
  [[ $rc -eq 0 && "$out" == *"claimed (cwd) as $ME1"* ]] && ok || bad "claim: session 1 must claim (out=$out)"
  holder=$(curl -sf "${hdr[@]}" --get --data-urlencode "resource=$RES" "$VAULT_API_URL/leases" | jq -r '.items[0].holder // ""')
  [[ "$holder" == "$ME1" ]] && ok || bad "server must show $ME1 as holder (got '$holder')"

  # 2. re-claim is a renew
  run "$CLAIM" "$(jq -nc --arg c "$W" --arg s "$S1" '{session_id:$s,cwd:$c}')"
  [[ $rc -eq 0 && "$out" == *"renewed (cwd) as $ME1"* ]] && ok || bad "claim: idempotent re-claim must say renewed (out=$out)"

  # 3. gate allows the holder, and renews (stamp file appears)
  run "$GATE" "$(jq -nc --arg f "$W/a.txt" --arg s "$S1" --arg c "$W" '{tool_name:"Edit",tool_input:{file_path:$f},session_id:$s,cwd:$c}')"
  [[ $rc -eq 0 ]] && ok || bad "gate: holder's own edit must be allowed (rc=$rc)"
  [[ -f "${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease/$(printf '%s' "$RES" | cksum | tr -d ' ').renew" ]] && ok || bad "gate: renew stamp must be written for the holder"

  # 4. session 2 in the same repo: 409 → subordinate line, and its edits are blocked
  run "$CLAIM" "$(jq -nc --arg c "$W" --arg s "$S2" '{session_id:$s,cwd:$c}')"
  [[ $rc -eq 0 && "$out" == *"held by $ME1"* && "$out" == *SUBORDINATE* ]] && ok || bad "claim: second cwd session must be told it is subordinate (out=$out)"
  rm -f "${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease/$(printf '%s' "$RES" | cksum | tr -d ' ')"
  run "$GATE" "$(jq -nc --arg f "$W/a.txt" --arg s "$S2" --arg c "$W" '{tool_name:"Edit",tool_input:{file_path:$f},session_id:$s,cwd:$c}')"
  [[ $rc -eq 2 ]] && ok || bad "gate: second session's edit must be blocked (rc=$rc)"

  # 5. release by session 2 must NOT drop session 1's lease; release by session 1 must
  run "$RELEASE" "$(jq -nc --arg c "$W" --arg s "$S2" '{session_id:$s,cwd:$c}')"
  holder=$(curl -sf "${hdr[@]}" --get --data-urlencode "resource=$RES" "$VAULT_API_URL/leases" | jq -r '.items[0].holder // ""')
  [[ "$holder" == "$ME1" ]] && ok || bad "release: non-holder must not release (holder now '$holder')"
  run "$RELEASE" "$(jq -nc --arg c "$W" --arg s "$S1" '{session_id:$s,cwd:$c}')"
  holder=$(curl -sf "${hdr[@]}" --get --data-urlencode "resource=$RES" "$VAULT_API_URL/leases" | jq -r '.items[0].holder // ""')
  [[ -z "$holder" ]] && ok || bad "release: holder's release must clear the lease (holder still '$holder')"

  # 6. gate re-claims an unheld OWN repo on touch (the TTL-lapse healing path)
  rm -f "${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease/$(printf '%s' "$RES" | cksum | tr -d ' ')"*
  run "$GATE" "$(jq -nc --arg f "$W/a.txt" --arg s "$S1" --arg c "$W" '{tool_name:"Edit",tool_input:{file_path:$f},session_id:$s,cwd:$c}')"
  holder=$(curl -sf "${hdr[@]}" --get --data-urlencode "resource=$RES" "$VAULT_API_URL/leases" | jq -r '.items[0].holder // ""')
  [[ $rc -eq 0 && "$holder" == "$ME1" ]] && ok || bad "gate: touching an unheld own repo must re-claim it (rc=$rc holder='$holder')"
  # 7. …but NOT a foreign unheld repo: cwd elsewhere → allow without claiming
  run "$RELEASE" "$(jq -nc --arg c "$W" --arg s "$S1" '{session_id:$s,cwd:$c}')"
  rm -f "${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease/$(printf '%s' "$RES" | cksum | tr -d ' ')"*
  run "$GATE" "$(jq -nc --arg f "$W/a.txt" --arg s "$S1" '{tool_name:"Edit",tool_input:{file_path:$f},session_id:$s,cwd:"/tmp"}')"
  holder=$(curl -sf "${hdr[@]}" --get --data-urlencode "resource=$RES" "$VAULT_API_URL/leases" | jq -r '.items[0].holder // ""')
  [[ $rc -eq 0 && -z "$holder" ]] && ok || bad "gate: an unheld foreign repo is allowed but never claimed (rc=$rc holder='$holder')"

  # 8. --touch re-claims an unheld own repo (the Bash-only session's healing path), silently
  rm -f "${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease/$(printf '%s' "$RES" | cksum | tr -d ' ')"*
  touch_ "$(jq -nc --arg s "$S1" --arg c "$W" '{session_id:$s,cwd:$c,tool_name:"Bash"}')"
  holder=$(curl -sf "${hdr[@]}" --get --data-urlencode "resource=$RES" "$VAULT_API_URL/leases" | jq -r '.items[0].holder // ""')
  [[ $rc -eq 0 && -z "$out" && "$holder" == "$ME1" ]] && ok || bad "touch: unheld own repo must be re-claimed silently (rc=$rc out='$out' holder='$holder')"
  [[ -f "$(stampfile "$RES")" ]] && ok || bad "touch: re-claim must write the renew stamp"
  # 9. a fresh stamp is the fast path: no network, no change (server unreachable must still pass)
  touch_ "$(jq -nc --arg s "$S1" --arg c "$W" '{session_id:$s,cwd:$c}')" VAULT_API_URL=http://127.0.0.1:9 VAULT_API_TOKEN=x
  [[ $rc -eq 0 && -z "$out" ]] && ok || bad "touch: fresh stamp must short-circuit before the network (rc=$rc)"
  # 10. a stale stamp renews: stamp advances, holder unchanged
  printf '0\n' >"$(stampfile "$RES")"
  rm -f "${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease/$(printf '%s' "$RES" | cksum | tr -d ' ')"
  touch_ "$(jq -nc --arg s "$S1" --arg c "$W" '{session_id:$s,cwd:$c}')"
  last=$(cat "$(stampfile "$RES")" 2>/dev/null || echo 0)
  holder=$(curl -sf "${hdr[@]}" --get --data-urlencode "resource=$RES" "$VAULT_API_URL/leases" | jq -r '.items[0].holder // ""')
  [[ $rc -eq 0 && "$last" -gt 0 && "$holder" == "$ME1" ]] && ok || bad "touch: stale stamp must renew and advance the stamp (rc=$rc last=$last holder='$holder')"
  # 11. a second session's touch never claims, never blocks, never prints — and stamps its check
  rm -f "$(stampfile "$RES")" "${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease/$(printf '%s' "$RES" | cksum | tr -d ' ')"
  touch_ "$(jq -nc --arg s "$S2" --arg c "$W" '{session_id:$s,cwd:$c}')"
  holder=$(curl -sf "${hdr[@]}" --get --data-urlencode "resource=$RES" "$VAULT_API_URL/leases" | jq -r '.items[0].holder // ""')
  [[ $rc -eq 0 && -z "$out" && "$holder" == "$ME1" && -f "$(stampfile "$RES")" ]] && ok || bad "touch: a non-holder must be a silent no-op that stamps its check (rc=$rc holder='$holder')"
  # 12. a sub-agent's touch never re-claims a lapsed lease under its own prefix
  run "$RELEASE" "$(jq -nc --arg c "$W" --arg s "$S1" '{session_id:$s,cwd:$c}')"
  rm -f "${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease/$(printf '%s' "$RES" | cksum | tr -d ' ')"*
  touch_ "$(jq -nc --arg s "$S2" --arg c "$W" '{session_id:$s,cwd:$c,agent_id:"sub-1"}')"
  holder=$(curl -sf "${hdr[@]}" --get --data-urlencode "resource=$RES" "$VAULT_API_URL/leases" | jq -r '.items[0].holder // ""')
  [[ $rc -eq 0 && -z "$holder" ]] && ok || bad "touch: a sub-agent payload must never claim (rc=$rc holder='$holder')"

  rm -f "${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease/$(printf '%s' "$RES" | cksum | tr -d ' ')"*
  rm -rf "$W"
fi

echo "pass=$pass fail=$fail"
[[ $fail -eq 0 ]]
