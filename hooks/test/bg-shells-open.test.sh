#!/usr/bin/env bash
# Tests for ../bg-shells-open.sh (Stop) and the lister under it, on transcripts built here: a shell
# is quiet in the turn that launched it, raised once at a later Stop while it is live, and left
# alone when the closing message names it, or when it ended or was stopped.
#
# Exit non-zero on any failure. No framework: the repo has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$HERE/bg-shells-open.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }
command -v node >/dev/null || { echo "node required" >&2; exit 2; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
export XDG_CACHE_HOME="$WORK/cache"

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

n=0
fresh() { ((++n)); T="$WORK/t$n.jsonl"; S="session-$n"; : >"$T"; }

user() { jq -nc --arg t "$1" '{type: "user", message: {role: "user", content: $t}}' >>"$T"; }
meta() { jq -nc --arg t "$1" '{type: "user", isMeta: true, message: {role: "user", content: $t}}' >>"$T"; }
say() { jq -nc --arg t "$1" '{type: "assistant", message: {role: "assistant", content: [{type: "text", text: $t}]}}' >>"$T"; }
queued() { jq -nc --arg t "$1" '{type: "attachment", attachment: {type: "queued_command", prompt: $t}}' >>"$T"; }

# launch <id> [description]: the tool_use and its modern result.
launch() {
  jq -nc --arg u "use-$1" --arg d "${2:-Run the long job}" \
    '{type: "assistant", message: {role: "assistant", content: [{type: "tool_use", id: $u, name: "Bash", input: {command: "sleep 100", description: $d}}]}}' >>"$T"
  jq -nc --arg u "use-$1" --arg i "$1" \
    '{type: "user", toolUseResult: {backgroundTaskId: $i}, message: {role: "user", content: [{type: "tool_result", tool_use_id: $u, content: "started"}]}}' >>"$T"
}

# A foreground call between rows, so a tool result is in the turn.
tool() {
  jq -nc '{type: "assistant", message: {role: "assistant", content: [{type: "tool_use", id: "fg", name: "Read", input: {}}]}}' >>"$T"
  jq -nc '{type: "user", toolUseResult: {}, message: {role: "user", content: [{type: "tool_result", tool_use_id: "fg", content: "ok"}]}}' >>"$T"
}

stopped() {
  jq -nc --arg i "$1" '{type: "assistant", message: {role: "assistant", content: [{type: "tool_use", id: "k", name: "TaskStop", input: {task_id: $i}}]}}' >>"$T"
}

notify() {
  jq -nc --arg i "$1" --arg s "<task-notification><task-id>$1</task-id><status>completed</status><summary>done (exit code 0)</summary></task-notification>" \
    '{type: "user", message: {role: "user", content: $s}}' >>"$T"
}

# stop [closing]: the hook's stdout at a Stop; rc in $rc.
stop() {
  out=$(jq -nc --arg t "$T" --arg s "$S" --arg c "${1-}" \
    '{session_id: $s, transcript_path: $t, stop_hook_active: false} + (if $c == "" then {} else {last_assistant_message: $c} end)' |
    bash "$HOOK" 2>/dev/null)
  rc=$?
}

quiet() { [[ $rc -eq 0 && -z "$out" ]] && ok || bad "$1 (rc=$rc out=$out)"; }
raised() { [[ $rc -eq 0 && "$out" == *'"decision"'*'"block"'* && "$out" == *"$2"* ]] && ok || bad "$1 (rc=$rc out=$out)"; }

# ── a shell is quiet in the turn that launched it ──
fresh; user 'go'; launch bshell01; say 'Waiting.'
stop 'Waiting on the census.'; quiet 'quiet in the turn that launched it'
fresh; user 'go'; launch bshell01; tool; tool; say 'Still at it.'
stop 'Still at it.'; quiet 'tool results stay in the turn'
fresh; user 'go'; launch bshell01; queued 'a message typed meanwhile'; say 'Noted.'
stop 'Noted.'; quiet 'a message typed during the turn stays in the turn'
fresh; user 'go'; launch bshell01; meta 'a system reminder'; say 'Noted.'
stop 'Noted.'; quiet 'a meta row stays in the turn'
fresh; user 'go'; launch bshell01; user 'Stop hook feedback: something else'; say 'Noted.'
stop 'Noted.'; quiet "another hook's feedback stays in the turn"

# ── raised at a later Stop while it is live, once ──
fresh; user 'go'; launch bshell02 'Run the census over the targets'; say 'Started.'
stop 'Started.'; quiet 'the first turn is quiet'
user 'and another thing'; say 'Done with that.'
stop 'Done with that.'; raised 'raised at the next Stop' bshell02
[[ "$out" == *'Run the census'* ]] && ok || bad "the block names its description (out=$out)"
user 'more'; say 'Done again.'
stop 'Done again.'; quiet 'raised once per shell'

fresh; user 'go'; launch bshell03; launch bshell04; say 'Started.'
stop 'Started.'; quiet 'two shells, first turn'
user 'next'; say 'Later.'
stop 'Later.'; raised 'two shells raised together' bshell03
[[ "$out" == *bshell04* && "$out" == *'2 background shell(s)'* ]] && ok || bad "both are in the block (out=$out)"

fresh; user 'go'; launch bshell05; say 'Started.'
stop 'Started.'; quiet 'first turn, for the wake-up case'
notify other-shell; say 'The other one ended.'
stop 'The other one ended.'; raised "another shell's notification starts a new turn" bshell05

# Launched in an earlier turn, with another launched in this one: only the older is raised.
fresh; user 'go'; launch bshell06; say 'Started.'
stop 'Started.'; quiet 'first turn, for the mixed case'
user 'next'; launch bshell07; say 'Both now.'
stop 'Both now.'; raised 'the older one is raised' bshell06
[[ "$out" != *bshell07* ]] && ok || bad "the one launched this turn stays out (out=$out)"
user 'next again'; say 'Later.'
stop 'Later.'; raised 'and the younger at its own later Stop' bshell07

# ── the closing message names it ──
fresh; user 'go'; launch bshell08; say 'Started.'
stop 'Started.'; quiet 'first turn, for the naming case'
user 'next'; say 'bshell08 must keep running.'
stop 'bshell08 must keep running.'; quiet 'named in a later turn: no block'
user 'more'; say 'Fine.'
stop 'Fine.'; quiet 'and it stays declared'

fresh; user 'go'; launch bshell09; say 'bshell09 keeps running.'
stop 'bshell09 keeps running.'; quiet 'named in its own turn: no block'
user 'next'; say 'Later.'
stop 'Later.'; quiet 'and it stays declared after that'

# With no last_assistant_message, the transcript's last text is the closing message.
fresh; user 'go'; launch bshell10; say 'Started.'
stop ''; quiet 'first turn, for the fallback case'
user 'next'; say 'bshell10 must keep running.'
stop ''; quiet 'the transcript names it when the payload has no closing message'

# ── it ended, or was stopped ──
fresh; user 'go'; launch bshell11; say 'Started.'
stop 'Started.'; quiet 'first turn, for the ended case'
notify bshell11; say 'It finished.'
stop 'It finished.'; quiet 'a completed shell is not raised'
fresh; user 'go'; launch bshell12; say 'Started.'
stop 'Started.'; quiet 'first turn, for the stopped case'
user 'next'; stopped bshell12; say 'Stopped it.'
stop 'Stopped it.'; quiet 'a stopped shell is not raised'

# ── no shells, a re-entry, a sub-agent, and a missing transcript all pass ──
fresh; user 'go'; say 'Nothing started.'
stop 'Nothing started.'; quiet 'no shells'
fresh; user 'go'; launch bshell13; say 'Started.'; user 'next'; say 'Later.'
out=$(jq -nc --arg t "$T" --arg s "$S" '{session_id: $s, transcript_path: $t, stop_hook_active: true}' | bash "$HOOK" 2>/dev/null); rc=$?
quiet 'stop_hook_active exits quietly'
out=$(jq -nc --arg t "$T" --arg s "$S" '{session_id: $s, transcript_path: $t, agent_id: "sub-1"}' | bash "$HOOK" 2>/dev/null); rc=$?
quiet 'a sub-agent exits quietly'
out=$(jq -nc --arg s "$S" '{session_id: $s, transcript_path: "/nonexistent/x.jsonl"}' | bash "$HOOK" 2>/dev/null); rc=$?
quiet 'a missing transcript exits quietly'

echo "pass=$pass fail=$fail"
[[ $fail -eq 0 ]]
