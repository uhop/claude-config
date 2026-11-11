#!/usr/bin/env bash
# Tests for ../unchecked-claim-check.sh (Stop): each case is a closing message; the verdict is
# whether the hook sends the agent back. The blocking cases are sentences from the 2026-11-11
# reflect report's P1 evidence.
#
# Exit non-zero on any failure. No framework: the repo has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$HERE/unchecked-claim-check.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }
[[ -f "$HOOK" ]] || { echo "FAIL  $HOOK is missing"; exit 1; }

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

F='```'
run() { out=$(jq -nc --arg m "$1" '{last_assistant_message: $m, stop_hook_active: false}' | bash "$HOOK" 2>/dev/null); rc=$?; }
blocks() { run "$2"; [[ $rc -eq 0 && "$out" == *'"block"'* && "$out" == *"${3:-unchecked}"* ]] && ok || bad "$1 must block (rc=$rc out=$out)"; }
passes() { run "$2"; [[ $rc -eq 0 && -z "$out" ]] && ok || bad "$1 must pass (rc=$rc out=$out)"; }

# ── the measured forms ──
blocks 'from memory, not checked' '- Logs shipped to CloudWatch by Docker'"'"'s log driver (from memory, not checked).' 'from memory'
blocks 'I did not recheck' "Anthropic's Connectors Directory: the survey says it requires annotations. I did not recheck that." 'I did not recheck'
blocks "I didn't check" "**Trigger I didn't check:** 8l, 8m, and 8u." "I didn't check"
blocks "I haven't checked, curly" 'The source may count differently; I haven’t checked.' 'I haven’t checked'
blocks "I haven't measured" 'That build shares its 2 GB with the embedder. I haven'"'"'t measured that build'"'"'s memory.' "I haven't measured"
blocks "I haven't tested" "Cognito's documentation only implies that, and I haven't tested it." "I haven't tested"
blocks "I didn't look it up" "about \$0.40 a month; that price is from memory, I didn't look it up today" 'from memory'
blocks 'as I recall' "That's my estimate from AWS prices as I recall them." 'as I recall'
blocks "I'm recalling" "This is relevance feedback, which I'm recalling from memory." "I'm recalling"
blocks 'my recollection' 'The transient part is my recollection, not something I checked.' 'my recollection'
blocks 'not yet checked' 'A short answer, not yet checked against GitHub'"'"'s docs:' 'not yet checked'
run "From memory, not checked this session: Jest fails. I haven't verified Vitest."
[[ "$out" == *'From memory'* && "$out" == *"I haven't verified"* ]] && ok || bad "each phrase is named (out=$out)"

# ── what is not the agent's claim ──
passes 'his words in italics' 'You said _"I haven'"'"'t checked the logs"_, so I read them: 3 lines.'
passes 'a quoted title' 'I moved it out of the "Not verified" line.'
passes 'curly quotes' 'The note says “from memory” about a price.'
passes 'a blockquote' "> I haven't checked it.

Read and fixed."
passes 'inline code' 'The flag is `--from-memory`, and `not checked` is its label.'
passes 'a fenced block' "Run:

$F
echo \"I haven't checked\"
$F"
passes 'no longer from memory' 'Rotation is confirmed off, from the docs, no longer from memory.'
passes 'a plain report' 'All gates are 0. I checked the three callers, and each passes.'

# ── a re-entry, a sub-agent, and no message all pass ──
M="I haven't checked it."
out=$(jq -nc --arg m "$M" '{last_assistant_message: $m, stop_hook_active: true}' | bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "a re-entry passes (out=$out)"
out=$(jq -nc --arg m "$M" '{last_assistant_message: $m, agent_id: "sub-1"}' | bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "a sub-agent passes (out=$out)"
out=$(jq -nc '{stop_hook_active: false}' | bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "no message passes (out=$out)"
out=$(printf 'not json' | bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "unreadable input passes (out=$out)"

# ── the matcher missing: fails open ──
MISSING=$(mktemp -d); cp "$HOOK" "$MISSING/unchecked-claim-check.sh"
out=$(jq -nc --arg m "$M" '{last_assistant_message: $m}' | bash "$MISSING/unchecked-claim-check.sh" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "no matcher passes (out=$out)"
rm -rf "$MISSING"

echo "pass=$pass fail=$fail"
[[ $fail -eq 0 ]]
