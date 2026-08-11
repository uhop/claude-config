#!/usr/bin/env bash
# vault-lease-gate.sh — PreToolUse hook for Edit / Write / NotebookEdit.
#
# Leg 4 of the agent-coordination protocol: makes the repo lease enforced
# rather than advisory. Blocks a direct working-tree edit when *another*
# holder owns that repo's lease, and points at the sanctioned path instead
# (disposable worktree + a handoff addressed to the repo's role).
#
# Design: vault projects/vault-storage/design/agent-coordination § Enforcement.
# Protocol + holder-id convention: ~/.claude/skills/vault/SKILL.md
# § Agent coordination.
#
# FAILS OPEN, always. Every unknown is an allow: no vault env, no curl/jq,
# unreachable or slow server, non-repo path, unclaimed repo. The worktree
# discipline was already collision-safe before this hook existed, so the
# check may only *redirect* work, never deny it on infrastructure trouble.
# A blocked edit is therefore always a real, current, someone-else lease.
#
# Hook contract:
#   - stdin: JSON {tool_name, tool_input: {file_path|notebook_path}, session_id}
#   - exit 0: allow. exit 2: block, stderr shown to the agent.

set -u

payload=$(cat)

command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0
[[ -n "${VAULT_API_URL:-}" && -n "${VAULT_API_TOKEN:-}" ]] || exit 0

tool=$(jq -r '.tool_name // ""' <<<"$payload" 2>/dev/null) || exit 0
case "$tool" in
  Edit | Write | NotebookEdit | MultiEdit) ;;
  *) exit 0 ;;
esac

target=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$payload" 2>/dev/null)
[[ -n "$target" ]] || exit 0

# A Write may be creating a file that does not exist yet, so resolve the repo
# from the deepest existing ancestor rather than from the target itself.
dir=$(dirname "$target")
while [[ -n "$dir" && "$dir" != "/" && ! -d "$dir" ]]; do dir=$(dirname "$dir"); done
root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || exit 0
[[ -n "$root" ]] || exit 0

# The resource key must match what claimants use: the normalized remote URL,
# so every clone and worktree of a repo is one resource. A repo with no remote
# cannot be shared, so it keys by host:path — the one place host belongs.
remote=$(git -C "$root" remote get-url origin 2>/dev/null || true)
if [[ -n "$remote" ]]; then
  normalized=$(sed -e 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##' -e 's#^[^/@]*@##' -e 's#:#/#' \
    -e 's#\.git$##' -e 's#/$##' <<<"$remote")
else
  normalized="$(hostname -s):$root"
fi
resource="repo:$normalized"

# The holder id this session would have claimed under (skill convention:
# <hostname>/<session-prefix>). A mismatch reads as "someone else holds it",
# which is why the block message prints both sides — that makes a convention
# slip diagnosable instead of just baffling.
session_id=$(jq -r '.session_id // ""' <<<"$payload" 2>/dev/null)
me="$(hostname -s)/${session_id:0:8}"

# Short-TTL cache so an edit burst costs one request, not one per edit. Stale
# by at most TTL seconds, which matches the protocol's own model: a holder
# discovers demotion at its next touch, not instantly.
TTL=10
cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease"
cache_file="$cache_dir/$(printf '%s' "$resource" | cksum | tr -d ' ')"
now=$(date +%s)

stamp=0
holder=""
kind=""
fresh=0
if [[ -f "$cache_file" ]]; then
  { read -r stamp; read -r holder; read -r kind; } <"$cache_file" 2>/dev/null || true
  if [[ ${stamp:-0} =~ ^[0-9]+$ ]] && ((now - stamp < TTL)); then fresh=1; fi
fi

if ((fresh == 0)); then
  resp=$(curl -sf --connect-timeout 1 --max-time 2 \
    -H "Authorization: Bearer $VAULT_API_TOKEN" \
    --get --data-urlencode "resource=$resource" \
    "$VAULT_API_URL/leases") || exit 0
  # Empty `items` means "not held" — an answer, not an error.
  parsed=$(jq -r '(.items[0] // {}) | "\(.holder // "")\n\(.holder_kind // "")"' \
    <<<"$resp" 2>/dev/null) || exit 0
  holder=$(head -n1 <<<"$parsed")
  kind=$(tail -n1 <<<"$parsed")
  if mkdir -p "$cache_dir" 2>/dev/null; then
    printf '%s\n%s\n%s\n' "$now" "$holder" "$kind" >"$cache_file" 2>/dev/null || true
  fi
fi

[[ -n "$holder" ]] || exit 0
[[ "$holder" == "$me" ]] && exit 0

if [[ "$kind" == "human" ]]; then
  cat >&2 <<EOF
Edit blocked: $resource is held by $holder (human).

The operator holds this repo. A human lease is never preempted and never
expires — taking work from it is ask-first, by design.

Ask before touching this working tree. If you have work for it, put it in a
disposable worktree and file a handoff addressed to the role:

  vault_handoff_create({idempotency_key, project, to: "$resource", kind, ref, from, body})
EOF
  exit 2
fi

cat >&2 <<EOF
Edit blocked: $resource is held by $holder.

This session is $me, so that lease is not yours — editing the working tree
directly would mix your changes into whatever that agent has in flight.

Do this instead:
  1. git -C "$root" worktree add <scratch> -b <topic>
  2. work there, and run that repo's gates there
  3. git format-patch --base=\$(git merge-base main HEAD) main..HEAD --stdout
  4. vault_handoff_create({... to: "$resource" ...}), then vault_handoff_put_artifact

If this repo IS your session's working directory, the holder is a side agent
and you may take it back — a cwd claim preempts an agent-held side lease:

  vault_lease_claim({resource: "$resource", holder: "$me", priority: "cwd"})
EOF
exit 2
