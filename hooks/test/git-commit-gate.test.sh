#!/usr/bin/env bash
# Regression tests for ../git-commit-gate.sh — each case is a PreToolUse Bash
# payload; the verdict is the exit code (0 = ALLOW, 2 = DENY). A cwd without
# the opt-in marker is the default; MARKED points at one that carries it.
#
# Centerpiece (2026-09-06): the verb inside a heredoc body or a quoted string
# is data. The substring test alone blocked two vault writes whose payload
# mentioned the verb in prose; the gate now reads the command with the shared
# parser (../lib/shell_segments.py) and keeps the substring verdict only when
# the parser is unavailable.

set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/git-commit-gate.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }

PLAIN=$(mktemp -d); MARKED=$(mktemp -d); mkdir -p "$MARKED/.claude"; : > "$MARKED/.claude/git-commit-allowed"
trap 'rm -rf "$PLAIN" "$MARKED"' EXIT

pass=0 fail=0
check() {
  local want="$1" cmd="$2" cwd="${3:-$PLAIN}"
  jq -nc --arg c "$cmd" --arg d "$cwd" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$d}' | bash "$HOOK" >/dev/null 2>&1
  local rc=$?
  local got=ALLOW; [ "$rc" -eq 2 ] && got=DENY
  if [ "$got" = "$want" ]; then
    ((++pass))
  else
    ((++fail)); printf 'FAIL  want=%-5s got=%-5s  %s\n' "$want" "$got" "${cmd//$'\n'/⏎}"
  fi
}
V='git commit'

# ── the verb, in every placement that executes it ──
check DENY  "$V -m x"
check DENY  "cd /tmp/foo && $V -am x"
check DENY  "git add . ; $V -m x"
check DENY  "git -C /tmp/foo commit -m x"
check DENY  "git -c user.name=x commit -m x"
check DENY  "command $V -m x"
check DENY  "GIT_AUTHOR_DATE=2026-01-01 $V -m x"
check DENY  "/usr/bin/$V -m x"
check DENY  "echo \$($V -m x)"
check DENY  "bash -c '$V -m x'"
check DENY  "eval \"$V -m x\""
check DENY  $'bash <<\'EOF\'\n'"$V"$' -m x\nEOF'
check DENY  $'cat <<EOF\n$('"$V"$' -m x)\nEOF'
# ── the words as data ──
check ALLOW $'cat > f <<\'EOF\'\nprose about '"$V"$' here\nEOF'
check ALLOW $'cat <<\'EOF\'\n$('"$V"$')\nEOF'
check ALLOW "jq --arg s \"run $V later\" '{s:\$s}'"
check ALLOW "echo \"$V\""
check ALLOW "git log --grep '$V'"
check ALLOW "git-committer-name foo"
check ALLOW "git commit-tree HEAD^{tree} -m x"
check ALLOW "printf '%s\\n' '$V'"
check ALLOW "git status && git log -1"
check ALLOW "vault-put x --append f"
# ── the opt-in marker ──
check ALLOW "$V -m x" "$MARKED"
check ALLOW "cd sub && $V -m x" "$MARKED"
# ── parser absent: the substring verdict stands ──
MISSING=$(mktemp -d); cp "$HOOK" "$MISSING/git-commit-gate.sh"
jq -nc --arg c "echo \"$V\"" --arg d "$PLAIN" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$d}' | bash "$MISSING/git-commit-gate.sh" >/dev/null 2>&1
[ $? -eq 2 ] && ((++pass)) || { ((++fail)); echo "FAIL  no lib: quoted words must fall back to DENY"; }
rm -rf "$MISSING"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
