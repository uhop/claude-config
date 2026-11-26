#!/usr/bin/env bash
# SessionStart: the brief's lines that only this fleet needs, which the Program Clerk plugin's brief
# leaves out (vault-storage D761): agent-workflow's Active items, the findings waiting for /clarify,
# and the cwd project's queue items whose titles say their work is finished
# (lib/queue-lint.mjs). One `[pc] fleet:` line when one of them has something to say.
# Fails open, silently: no settings, no curl or jq, an unreachable server, or an answer it cannot
# read prints nothing.

set -u
[[ -n ${PROGRAM_CLERK_URL:-} && -n ${PROGRAM_CLERK_KEY:-} ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0
here="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
# shellcheck source=lib/vault-retry.sh source-path=SCRIPTDIR
. "$here/lib/vault-retry.sh" || exit 0
# shellcheck source=lib/vault-project.sh source-path=SCRIPTDIR
. "$here/lib/vault-project.sh" || exit 0

project=""
if root=$(git rev-parse --show-toplevel 2>/dev/null); then
  project=$(vault_project_of "$root")
  [[ $project =~ ^[a-z0-9][a-z0-9.-]*$ ]] || project=""
fi

ask() {
  vault_retry -sf --connect-timeout 1 --max-time 2 -H "Authorization: Bearer $PROGRAM_CLERK_KEY" "$@"
}
query() {
  ask -X POST -H 'Content-Type: application/json' -d "$1" "$PROGRAM_CLERK_URL/notes/query"
}

parts=()
brief=$(ask "$PROGRAM_CLERK_URL/system/resume-brief${project:+?project=$project}") || brief='{}'
active=$(jq -r '.workflow.active // false' <<<"$brief" 2>/dev/null)
if [[ $active != true ]]; then
  total=$(query '{"folder":"projects/agent-workflow/queue","match":{"section":"active"},"limit":1}' |
    jq -r '.total // 0' 2>/dev/null)
  [[ ${total:-0} =~ ^[0-9]+$ ]] && ((total > 0)) && active=true
fi
[[ $active == true ]] && parts+=("agent-workflow Active non-empty")
clarify=$(jq -r '.workflow.clarify_pending // 0' <<<"$brief" 2>/dev/null)
[[ ${clarify:-0} =~ ^[0-9]+$ ]] && ((clarify > 0)) && parts+=("$clarify to /clarify")

lint="$here/lib/queue-lint.mjs"
if [[ -n $project && -f $lint ]] && command -v node >/dev/null 2>&1; then
  findings=$(query "{\"folder\":\"projects/$project/queue\",\"sort\":\"sequence_key\",\"limit\":500}" |
    jq -c '[.items // [] | .[].frontmatter | select(.section != null) | .title]' 2>/dev/null |
    node "$lint" 2>/dev/null)
  count=$(jq -r 'length' <<<"${findings:-[]}" 2>/dev/null)
  if [[ ${count:-0} =~ ^[0-9]+$ ]] && ((count > 0)); then
    parts+=("queue hygiene $count: $(jq -r '.[0]' <<<"$findings")")
  fi
fi

((${#parts[@]} > 0)) || exit 0
line="[pc] fleet: ${parts[0]}"
for part in "${parts[@]:1}"; do line+="; $part"; done
printf '%s\n' "$line"
exit 0
