#!/usr/bin/env bash
# Regression tests for ../destructive-op-gate.sh — feeds each case's command
# through the hook as a PreToolUse Bash payload and asserts the verdict from
# its exit code (0 = pass/ALLOW, 2 = block/DENY).
#
# Centerpiece: the glued `-X<METHOD>` bypass (fixed e31217b). gh/pflag accepts
# `-XDELETE` with no separator after the flag, but the method regex demanded
# one (`[[:space:]=]+`); with no `-f` field flag the auto-POST guard missed it
# too, so a state-mutating call slipped the gate. Loosened to `[[:space:]=]*`.
# Full analysis: vault projects/apodict/corpus/2026-08-09-claude-config-gate-hooks.

set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/destructive-op-gate.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }

pass=0 fail=0
check() {
  local want="$1" cmd="$2"
  jq -nc --arg c "$cmd" '{tool_name:"Bash", tool_input:{command:$c}}' | bash "$HOOK" >/dev/null 2>&1
  local rc=$?              # capture before any command (local resets $?)
  local got=ALLOW; [ "$rc" -eq 2 ] && got=DENY
  if [ "$got" = "$want" ]; then
    ((++pass))
  else
    ((++fail)); printf 'FAIL  want=%-5s got=%-5s  %s\n' "$want" "$got" "$cmd"
  fi
}

# ── gh api: the glued-shorthand bypass (the fix under test) ──
check DENY  'gh api -XDELETE repos/o/r/issues/comments/123'
check DENY  'gh api -XPOST repos/o/r/merges'
check DENY  'gh api -XPATCH repos/o/r/x'
check DENY  'gh api -XPUT repos/o/r/x'
# ── gh api: separated forms that were already caught (must stay caught) ──
check DENY  'gh api -X DELETE repos/o/r/x'
check DENY  'gh api --method POST repos/o/r/x -f a=b'
check DENY  'gh api --method=POST repos/o/r/x'
check DENY  'gh api repos/o/r/issues -f title=x'          # auto-POST via body fields
# ── gh api: reads / query-param GETs (must stay allowed) ──
check ALLOW 'gh api repos/o/r/issues'
check ALLOW 'gh api -X GET -f q=1 repos/o/r/x'            # GET with query params, not a write
check ALLOW 'gh api -XGET repos/o/r/x'
# ── gh non-api + other branches: smoke that the fix didn't disturb them ──
check ALLOW 'gh pr checkout 123'
check DENY  'gh issue create --title x'
check DENY  'git clean -fd'
check ALLOW 'git clean -n'
check ALLOW 'git status'

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
