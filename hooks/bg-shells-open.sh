#!/usr/bin/env bash
# bg-shells-open.sh — Stop hook: a background shell the transcript shows
# launched and neither completed nor stopped is named to the agent before
# the turn ends, once per shell, so the all-clear is measured rather than
# remembered (CLAUDE.md § Background shells; reflect 2026-09-22, the third
# time "both registries are empty" was claimed with a shell still live).
#
# Mechanism: `decision: block` with the shells in `reason` sends the agent
# back to deal with them; the re-entry carries `stop_hook_active: true`, on
# which this hook exits 0, so a shell that must keep running (a server, a
# watcher the user asked for) costs exactly one extra turn in its lifetime —
# the id is recorded per session and never raised again. A shell launched in
# the turn now ending costs none and is left unrecorded: the agent has just
# started it, and it is raised at a later Stop if it is still live (claude-config
# D45: 108 of 111 firings were that turn's own shell, and none was forgotten). A
# shell whose id the turn's closing message already names costs none: that
# message is the declaration, so the id is recorded without a block (reflect
# 2026-10-03, 14 firings in a week, every one a gate that had to finish). That message is the
# payload's `last_assistant_message`: the transcript is written asynchronously
# and lags the turn (hooks reference), so its tail is only the fallback for a
# Claude Code before 2.1.47 (reflect 2026-10-04, 5 false blocks after 8548b9b).
# A declared shell still costs one block when no `sleep` timer is live beside it,
# since an idle session says nothing when the run's estimate passes (reflect
# 2026-11-05 P1: four overruns he had to ask about, in three sessions). A background
# agent still running at a Stop with no timer live costs one block too, named by its
# description, since its id is never quoted to him (D87; reflect 2026-11-11, M1).
#
# FAILS OPEN, silently: no jq, no node, no transcript, a sub-agent run
# (agent_id present) all exit 0 with no output. The lister is
# skills/bg-shells/bg-shells.mjs; the record lives under
# ${XDG_CACHE_HOME:-~/.cache}/claude-bg-shells/<session_id>.reported.
#
# Hook contract: stdin JSON {session_id, transcript_path, cwd,
# hook_event_name, stop_hook_active, last_assistant_message?, agent_id?};
# stdout JSON on block.

set -u

payload=$(cat)

command -v jq >/dev/null 2>&1 || exit 0
command -v node >/dev/null 2>&1 || exit 0

agent_id=$(jq -r '.agent_id // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -z "$agent_id" ]] || exit 0

active=$(jq -r '.stop_hook_active // false' <<<"$payload" 2>/dev/null) || exit 0
[[ "$active" != "true" ]] || exit 0

transcript=$(jq -r '.transcript_path // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -n "$transcript" && -f "$transcript" ]] || exit 0

session_id=$(jq -r '.session_id // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -n "$session_id" ]] || exit 0

lister="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../skills/bg-shells/bg-shells.mjs"
[[ -f "$lister" ]] || exit 0

live=$(node "$lister" --json --live --session="$transcript" 2>/dev/null |
  jq -r '.[].shells[] | "\(.shell_id)\t\(.launched_this_turn)\t\(.command | test("^\\s*(command\\s+)?sleep\\s+[0-9]"))\t\(if .description == "" then .command else .description end)\t\(.kind // "shell")"' 2>/dev/null) || exit 0
[[ -n "$live" ]] || exit 0

state_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-bg-shells"
mkdir -p "$state_dir" 2>/dev/null || exit 0
marker="$state_dir/$session_id.reported"
touch "$marker" 2>/dev/null || exit 0

closing=$(jq -r '.last_assistant_message // ""' <<<"$payload" 2>/dev/null) || closing=""
[[ -n "$closing" ]] || closing=$(tail -n 400 "$transcript" | node -e '
let last = "";
for (const line of require("fs").readFileSync(0, "utf8").split("\n")) {
  let r;
  try { r = JSON.parse(line); } catch { continue; }
  if (r.type !== "assistant" || !Array.isArray(r.message?.content)) continue;
  const t = r.message.content.filter(p => p.type === "text").map(p => p.text).join("\n");
  if (t.trim()) last = t;
}
process.stdout.write(last);' 2>/dev/null) || closing=""

timer_live=false
printf '%s\n' "$live" | cut -f3 | command grep -qx true && timer_live=true

new=""
untimed=""
agents=""
while IFS=$'\t' read -r id this_turn timer desc kind || [[ -n "$id" ]]; do
  [[ -n "$id" ]] || continue
  command grep -qxF "$id" "$marker" && continue
  # An agent's id is never quoted to him, so no closing message declares it: one block
  # when no timer is live, in the turn that launched it too (reflect 2026-11-11, M1).
  if [[ "$kind" == "agent" ]]; then
    printf '%s\n' "$id" >>"$marker"
    [[ "$timer_live" == "true" ]] || agents+="${agents:+; }${desc:0:70}"
    continue
  fi
  if [[ -n "$closing" && "$closing" == *"$id"* ]]; then
    printf '%s\n' "$id" >>"$marker"
    [[ "$timer" == "true" || "$timer_live" == "true" ]] || untimed+="${untimed:+, }$id"
    continue
  fi
  [[ "$this_turn" == "true" ]] && continue
  new+="$id"$'\t'"$desc"$'\n'
done <<<"$live"
[[ -n "$new" || -n "$untimed" || -n "$agents" ]] || exit 0

reason=""
if [[ -n "$new" ]]; then
  printf '%s' "$new" | cut -f1 >>"$marker"
  n=$(printf '%s' "$new" | command grep -c .)
  list=$(printf '%s' "$new" | awk -F'\t' '{d = substr($2, 1, 70); gsub(/[[:space:]]+/, " ", d); printf "%s%s (%s)", (NR > 1 ? "; " : ""), $1, d}')
  reason="[bg-shells] $n background shell(s) still live: $list. A live shell is not part of a finished turn: TaskStop each one you no longer need (a watcher dies with its producer), or say in one line which one must keep running and why, then finish."
fi
if [[ -n "$untimed" ]]; then
  reason+="${reason:+ }[bg-shells] $untimed declared as still running, with no timer set. Start a background \`sleep\` that ends at the run's estimate, so an overrun is reported before he has to ask; a server or a watcher with no end needs none (CLAUDE.md § Tools; reflect 2026-11-05, P1)."
fi
if [[ -n "$agents" ]]; then
  reason+="${reason:+ }[bg-shells] Background agent(s) still running, with no timer set: $agents. Start a background \`sleep\` that ends at their estimate, so an overrun is reported before he has to ask (CLAUDE.md § Tools; reflect 2026-11-11, M1)."
fi

jq -n --arg r "$reason" '{decision: "block", reason: $r}'
