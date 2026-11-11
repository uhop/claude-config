#!/usr/bin/env bash
# Tests for ../handed-command-check.sh (Stop, claude-config D46): each case is a closing message; the
# verdict is whether the hook sends the agent back.
#
# Exit non-zero on any failure. No framework: the repo has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$HERE/handed-command-check.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

F='```'
run() { out=$(jq -nc --arg m "$1" '{last_assistant_message: $m, stop_hook_active: false}' | bash "$HOOK" 2>/dev/null); rc=$?; }
blocks() { run "$2"; [[ $rc -eq 0 && "$out" == *'"block"'* && "$out" == *"${3:-handed-command}"* ]] && ok || bad "$1 must block (rc=$rc out=$out)"; }
passes() { run "$2"; [[ $rc -eq 0 && -z "$out" ]] && ok || bad "$1 must pass (rc=$rc out=$out)"; }
block() { printf '%s\n%s\n%s\n' "$F$1" "$2" "$F"; }

# ── placeholders, in the measured forms ──
blocks 'a quoted assignment' "Run this:

$(block bash "ACCOUNT='<account>'
echo \"\$ACCOUNT\"")" '<account>'
blocks 'an unlabeled block' "Run:

$(block '' "ssh pc \"tenant-state canary <account> on\"")" '<account>'
blocks 'an sh block' "$(block sh 'deploy <host>')" '<host>'
blocks 'a console block' "$(block console 'deploy <host>')" '<host>'
blocks 'a shell block' "$(block shell 'deploy <host>')" '<host>'
blocks 'an upper-case word' "$(block bash 'deploy <ACCOUNT_ID>')" '<ACCOUNT_ID>'
blocks 'a word with spaces' "$(block bash 'deploy <your account>')" '<your account>'
blocks 'a placeholder at the start of a line' "$(block bash '<command> --flag')" '<command>'
blocks 'a tilde fence' "~~~bash
deploy <host>
~~~" '<host>'
blocks 'a --flag value on a labeled block' "$(block bash '  --account <id>')" '<id>'
run "$(block bash 'deploy <a> <b> <a>')"
[[ "$out" == *'holds <a>, <b>:'* ]] && ok || bad "each word is named once (out=$out)"

# ── what is not a placeholder ──
passes 'a redirection' "$(block bash 'sort < input.txt > output.txt')"
passes 'a tight redirection pair with a space' "$(block bash 'sort <input.txt >output.txt')"
passes 'a heredoc marker' "$(block bash "cat <<EOF
hello
EOF")"
passes 'HTML in a heredoc body' "$(block bash "cat > page.html <<'EOF'
<html><title>Page</title></html>
EOF")"
passes 'a here-string' "$(block bash 'grep x <<<"$v"')"
passes 'process substitution' "$(block bash 'diff <(sort a) <(sort b)')"
passes 'a type argument' "$(block bash 'echo Array<string>')"
passes 'a comparison' "$(block bash '[ 1 -lt 2 ] && echo "a < b > c"')"
passes "a tool's --help in an unlabeled block" "$(block '' '  --flags, -f <flags>  Set reporter flags')"
passes 'a text block' "$(block text 'deploy <host>')"
passes 'an HTML block' "$(block html '<title>Page</title>')"
passes 'a JSON block' "$(block json '{"a": "<b>"}')"
passes 'a markdown block' "$(block markdown 'see <host>')"
passes 'a block inside a longer fence' "\`\`\`\`markdown
$(block bash 'deploy <host>')
\`\`\`\`"
passes 'inline code' 'Run \`deploy <host>\` when ready.'
passes 'prose' 'The <host> is yours to choose.'
passes 'a block with neither' "$(block bash 'git -C ~/Open/x status')"
passes 'an unterminated fence' "$F
deploy <host>"

# ── scratch paths ──
blocks 'a scratchpad patch' "$(block '' 'git apply --cached /tmp/claude-1000/-home-x/abc/scratchpad/a.patch')" 'scratchpad/a.patch'
blocks 'a mktemp directory' "$(block bash 'node /tmp/tmp.yEX7YTqbOn/t.mjs')" '/tmp/tmp.yEX7YTqbOn/t.mjs'
blocks 'a macOS temp directory' "$(block bash 'node /var/folders/ab/T/tmp.yEX7YTqbOn/t.mjs')" 'tmp.yEX7YTqbOn/t.mjs'
blocks 'a quoted scratch path' "$(block bash 'cat "/tmp/tmp.abc123/x"')" '/tmp/tmp.abc123/x'
run "$(block bash 'S=/tmp/tmp.abc123/x; node /tmp/tmp.abc123/y; cat /tmp/tmp.abc123/z)')"
[[ "$out" == *'path, /tmp/tmp.abc123/x, /tmp/tmp.abc123/y, /tmp/tmp.abc123/z: copy'* ]] && ok || bad "a path is named without the shell around it (out=$out)"
passes 'a scratch path on a `!` line' "$(block '' '! node /tmp/tmp.abc123/x')"
passes 'and in a variable on one' "$(block bash '!S=/tmp/claude-1000/-home-x/abc/scratchpad/y; cat "$S"')"
passes 'and on a later line of a `!` block' "$(block bash '! W=/tmp/tmp.abc123
ls /tmp/tmp.abc123/x')"
passes 'and on a `!` line after another' "$(block '' 'git status
! node /tmp/tmp.abc123/x')"
blocks 'a scratch path on a plain line after a `!` line' "$(block '' 'git status
! echo run
git apply /tmp/tmp.abc123/x.patch')" 'x.patch'
blocks 'a placeholder on a `!` line still counts' "$(block '' '! deploy <host>')" '<host>'
passes 'a cache path' "$(block bash 'git apply ~/.cache/claude-config/a.patch')"
passes 'a mktemp the block makes' "$(block bash 'W=$(mktemp -d) && echo "$W"')"
passes 'a plain /tmp path' "$(block bash 'ls /tmp/fixture')"
passes 'a scratch path in a heredoc body' "$(block bash "cat > note <<'EOF'
/tmp/tmp.abc123/x
EOF")"
passes 'a scratch path in prose' 'I kept /tmp/tmp.abc123/x for now.'
run "$(block bash 'deploy <host> /tmp/tmp.abc123/x')"
[[ "$out" == *'<host>'* && "$out" == *'It also names a scratch path'* ]] && ok || bad "both are named (out=$out)"

# ── an instruction where a value goes, and a push behind `!` (the 2026-11-11 reflect report, P3) ──
blocks 'an instruction in a quoted value' "$(block bash "PULL_URL='paste the Address row from the export page here'
git ls-remote \"\$PULL_URL\"")" 'paste the Address row'
blocks 'a fill-in in double quotes' "$(block bash 'deploy --account "fill in your account"')" 'fill in your account'
blocks 'an ellipsis in a quoted value' "$(block bash "KEY='pcg_…'")" "'pcg_…'"
blocks 'a push behind !' "$(block '' '! git -C ~/Open/vault-storage push')" 'runs a push behind'
blocks 'a push behind ! with an env word' "$(block bash '! GIT_TRACE=1 git push origin main')" 'runs a push behind'
passes 'a push for his terminal' "$(block bash 'git -C ~/Open/vault-storage push')"
passes 'a pull behind !' "$(block bash '! git -C ~/Open/vault-storage pull')"
passes 'a grep for paste outside quotes' "$(block bash 'grep -n paste notes.md')"
passes 'a paste in a heredoc body' "$(block bash "cat > a.md <<'EOF'
'paste here'
EOF")"

# ── a re-entry, a sub-agent, and no message all pass ──
M="$(block bash 'deploy <host>')"
out=$(jq -nc --arg m "$M" '{last_assistant_message: $m, stop_hook_active: true}' | bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "a re-entry passes (out=$out)"
out=$(jq -nc --arg m "$M" '{last_assistant_message: $m, agent_id: "sub-1"}' | bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "a sub-agent passes (out=$out)"
out=$(jq -nc '{stop_hook_active: false}' | bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "no message passes (out=$out)"
out=$(printf 'not json' | bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "unreadable input passes (out=$out)"

# ── the parser missing: fails open ──
MISSING=$(mktemp -d); cp "$HOOK" "$MISSING/handed-command-check.sh"
out=$(jq -nc --arg m "$M" '{last_assistant_message: $m}' | bash "$MISSING/handed-command-check.sh" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "no parser passes (out=$out)"
rm -rf "$MISSING"

echo "pass=$pass fail=$fail"
[[ $fail -eq 0 ]]
