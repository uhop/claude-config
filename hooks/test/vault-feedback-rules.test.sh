#!/usr/bin/env bash
# Tests for ../vault-feedback-rules.sh (SessionStart, vault-storage D380). The OFFLINE half asserts
# fail-open (no env, an unreachable server, a non-repo cwd → exit 0, no output) and that the hook
# asks for the cwd project's rules. The LIVE half runs it from vault-storage's checkout, whose
# project has a feedback note, and checks the text it prints fits a hook's 10,000 characters.
# Skipped, not failed, without the env or the checkout.
#
# Exit non-zero on any failure. No framework: the repo has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$HERE/vault-feedback-rules.sh"

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

# ── OFFLINE: fail-open ───────────────────────────────────────────────────
repo=$(cd "$HERE/.." && pwd)
out=$(cd "$repo" && env PROGRAM_CLERK_URL= PROGRAM_CLERK_KEY= VAULT_API_URL= VAULT_API_TOKEN= bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "no env must exit 0 silently (rc=$rc out=$out)"
refused=(PROGRAM_CLERK_URL=http://127.0.0.1:9 PROGRAM_CLERK_KEY=pck)
out=$(cd "$repo" && env "${refused[@]}" bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "unreachable server must exit 0 silently (rc=$rc out=$out)"
out=$(cd / && env "${refused[@]}" bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "a non-repo cwd must exit 0 silently (rc=$rc out=$out)"
trace=$(cd "$repo" && env PROGRAM_CLERK_URL=http://127.0.0.1:59999 PROGRAM_CLERK_KEY=new bash -x "$HOOK" 2>&1 >/dev/null)
[[ "$trace" == *"Bearer new"*"http://127.0.0.1:59999/projects/claude-config/rules"* ]] && ok || bad "asks for the cwd project's rules (trace=$trace)"

# ── LIVE: vault-storage's rules ──────────────────────────────────────────
url=${PROGRAM_CLERK_URL:-${VAULT_API_URL:-}}
target="$HOME/Open/vault-storage"
if [[ -n $url && -d $target/.git ]]; then
  out=$(cd "$target" && bash "$HOOK" 2>/dev/null); rc=$?
  [[ $rc -eq 0 ]] && ok || bad "live run must exit 0 (rc=$rc)"
  [[ "$(head -n1 <<<"$out")" == "[vault] vault-storage's feedback rules, "* ]] && ok || bad "the header names the project (out=$(head -n1 <<<"$out"))"
  [[ "$out" == *$'\n- Commit policy: autonomous, no destructive ops'* ]] && ok || bad "a rule per line (out=${out:0:300})"
  (( ${#out} <= 10000 )) && ok || bad "within a hook's 10,000 characters (${#out})"
else
  echo "SKIP  live: no PROGRAM_CLERK_URL or no vault-storage checkout"
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
(( fail == 0 ))
