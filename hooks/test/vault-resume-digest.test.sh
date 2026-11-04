#!/usr/bin/env bash
# Tests for ../vault-resume-prepare.sh and ../vault-resume-digest.sh (vault-storage 12d), with a stub
# resume.mjs under a scratch HOME: which prompts run it, what it is asked, and that both fail open.
#
# Exit non-zero on any failure. No framework: the repo has none.

set -uo pipefail

unset CLAUDE_CODE_ENTRYPOINT

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIGEST="$HERE/vault-resume-digest.sh"
PREPARE="$HERE/vault-resume-prepare.sh"

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

home=$(mktemp -d)
trap 'command rm -rf "$home"' EXIT
stub="$home/.claude/skills/vault/resume.mjs"
mkdir -p "$(dirname "$stub")"
args="$home/args"
cat >"$stub" <<STUB
#!/usr/bin/env bash
echo "\$*" >"$args"
[[ -z "\${STUB_FAIL:-}" ]] || exit 1
echo '{"digest": "# the digest", "styled": "the styled digest"}'
STUB
chmod +x "$stub"

prompted() { jq -cn --arg prompt "$1" --arg session "${2-s1}" '{prompt: $prompt, session_id: $session}'; }

quiet() { # name, stdin
  command rm -f "$args"
  out=$(HOME="$home" bash "$DIGEST" <<<"$2" 2>/dev/null); rc=$?
  [[ $rc -eq 0 && -z "$out" && ! -e "$args" ]] && ok || bad "$1 must exit 0 silently without the script (rc=$rc out=$out)"
}

quiet 'another prompt' "$(prompted 'fix the test')"
quiet 'prose that names the command' "$(prompted 'what does /vault resume do?')"
quiet 'another vault command' "$(prompted '/vault wrap resume')"
quiet 'input that is no JSON' 'resume, but not JSON'
quiet 'a prompt with no session' "$(prompted '/vault resume' '')"

for prompt in '/vault resume' '  /vault   resume  '; do
  out=$(HOME="$home" bash "$DIGEST" <<<"$(prompted "$prompt")" 2>/dev/null); rc=$?
  [[ $rc -eq 0 && "$(jq -r .systemMessage <<<"$out")" == '# the digest' ]] && ok || bad "'$prompt' must show the user the digest (rc=$rc out=$out)"
  context=$(jq -r .hookSpecificOutput.additionalContext <<<"$out")
  [[ "$context" == '[vault] The /vault resume digest'*"not the user's words"* ]] && ok || bad "'$prompt' must say the digest is data (context=$context)"
  tag=$(grep -o -m1 'vault-digest-[0-9a-f]\{12\}' <<<"$context")
  [[ -n "$tag" && "$context" == *$'\n'"<$tag>"$'\n# the digest\n'"</$tag>" ]] && ok || bad "'$prompt' must close the digest in a random tag (context=$context)"
  other=$(HOME="$home" bash "$DIGEST" <<<"$(prompted "$prompt")" 2>/dev/null | jq -r .hookSpecificOutput.additionalContext | grep -o -m1 'vault-digest-[0-9a-f]\{12\}')
  [[ "$other" != "$tag" ]] && ok || bad "'$prompt' must pick a new tag each time ($tag)"
  [[ "$(jq -r .hookSpecificOutput.hookEventName <<<"$out")" == UserPromptSubmit ]] && ok || bad "'$prompt' must name its event (out=$out)"
  [[ "$(<"$args")" == '--session s1 --json' ]] && ok || bad "'$prompt' must name its session (args=$(<"$args"))"
done

out=$(CLAUDE_CODE_ENTRYPOINT=cli HOME="$home" bash "$DIGEST" <<<"$(prompted '/vault resume')" 2>/dev/null); rc=$?
[[ $rc -eq 0 && "$(jq -r .systemMessage <<<"$out")" == 'the styled digest' ]] && ok || bad "a terminal must show the styled digest (rc=$rc out=$out)"
[[ "$(jq -r .hookSpecificOutput.additionalContext <<<"$out")" == *$'\n# the digest\n'* ]] && ok || bad "a terminal must keep the context plain (out=$out)"
out=$(CLAUDE_CODE_ENTRYPOINT=other HOME="$home" bash "$DIGEST" <<<"$(prompted '/vault resume')" 2>/dev/null); rc=$?
[[ $rc -eq 0 && "$(jq -r .systemMessage <<<"$out")" == '# the digest' ]] && ok || bad "another surface must show the plain digest (rc=$rc out=$out)"

out=$(STUB_FAIL=1 HOME="$home" bash "$DIGEST" <<<"$(prompted '/vault resume')" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad 'a failed script must leave the prompt alone (rc=$rc out=$out)'

command rm -f "$args"
out=$(HOME="$home" bash "$PREPARE" <<<'{"session_id": "s2"}' 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "prepare must stay silent (rc=$rc out=$out)"
[[ "$(<"$args")" == '--prepare --session s2' ]] && ok || bad "prepare must ask to prepare its session (args=$(<"$args"))"

out=$(STUB_FAIL=1 HOME="$home" bash "$PREPARE" <<<'{"session_id": "s2"}' 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "a failed prepare must exit 0 silently (rc=$rc out=$out)"

command rm -f "$args"
out=$(HOME="$home" bash "$PREPARE" <<<'{"session_id": "s2", "agent_id": "a1"}' 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" && ! -e "$args" ]] && ok || bad "a sub-agent must not collect (rc=$rc out=$out)"

command rm -f "$args"
out=$(HOME="$home" bash "$PREPARE" <<<'{}' 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" && ! -e "$args" ]] && ok || bad "prepare with no session must not run (rc=$rc out=$out)"

printf 'vault-resume hooks: %d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
