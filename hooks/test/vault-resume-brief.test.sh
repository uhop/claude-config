#!/usr/bin/env bash
# Tests for ../vault-resume-brief.sh (SessionStart): the digest lines plus the
# GitHub line read from the stored baseline (projects/<name>/state.md § GitHub,
# 2026-09-05). The OFFLINE half asserts fail-open (no env, unreachable server →
# exit 0, no output). The LIVE half runs the hook from this repository, which
# has a stored GitHub block, and from a throwaway non-repo directory, which must
# get no project line and no GitHub line. Skipped, not failed, without the env.
#
# Exit non-zero on any failure. No framework: the repo has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$HERE/vault-resume-brief.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

# ── OFFLINE: fail-open ───────────────────────────────────────────────────
out=$(cd / && env VAULT_API_URL= VAULT_API_TOKEN= bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "no env must exit 0 silently (rc=$rc out=$out)"
out=$(cd / && env VAULT_API_URL=http://127.0.0.1:9 VAULT_API_TOKEN=x bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "unreachable server must exit 0 silently (rc=$rc out=$out)"

# ── LIVE: this repository has a stored GitHub baseline ───────────────────
if [[ -z "${VAULT_API_URL:-}" || -z "${VAULT_API_TOKEN:-}" ]] ||
   ! curl -sf --connect-timeout 1 --max-time 2 -H "Authorization: Bearer $VAULT_API_TOKEN" \
       "$VAULT_API_URL/system/resume-brief" >/dev/null 2>&1; then
  echo "live half skipped (no VAULT_API_URL/TOKEN or server unreachable)"
else
  out=$(cd "$HERE/.." && bash "$HOOK" 2>/dev/null); rc=$?
  [[ $rc -eq 0 && "$out" == *"[vault] github uhop/claude-config:"* ]] && ok || bad "from this repo: a GitHub line is expected (rc=$rc out=$out)"
  [[ "$out" == *" open ("* && "$out" == *"collected "* && "$out" == *" ago)"* ]] && ok || bad "the GitHub line must carry open items and the collection age (out=$out)"
  [[ "$(tail -n1 <<<"$out")" == "[vault] Digest only"* ]] && ok || bad "the trailer must stay last"
  D=$(mktemp -d)
  out=$(cd "$D" && bash "$HOOK" 2>/dev/null); rc=$?
  [[ $rc -eq 0 && "$out" != *"[vault] github"* && "$out" == *"[vault] Digest only"* ]] && ok || bad "non-repo cwd: no GitHub line, trailer present (rc=$rc out=$out)"
  rmdir "$D"
fi

echo "pass=$pass fail=$fail"
[[ $fail -eq 0 ]]
