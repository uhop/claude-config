#!/usr/bin/env bash
# vault-lease-gate.sh — PreToolUse for Bash: block a write-shaped command into a checkout whose
# lease another holder has, and point at the worktree and the handoff instead.
#
# The Program Clerk plugin owns the leases since vault-storage 7as-4a (D761): it claims the
# session's checkout at start, renews it after each tool call, releases it at the end, and gates
# the edit tools. This hook is the fleet's one addition, kept until the question of gating shell
# writes at all is settled (vault-storage D759): it reads the lease and never claims, renews, or
# releases one, so the plugin's claim tokens stay the only ones. It keys a lease by the remote
# alone, the repository mode, which is the setting of Eugene's account (D760); an account in
# checkout mode would need the checkout's key here.
#
# FAILS OPEN, always: no settings, no curl or jq or python3, an unreachable or refusing server, a
# path outside a checkout, or an unheld lease allows the command. A block is always a real,
# current, someone else's lease.
#
# The extractor (`write_targets` in hooks/lib/shell_segments.py) strips heredoc bodies, splits the
# command on unquoted `;`, `|`, `&&`, `||` and newlines, tracks `cd`, follows a variable the command
# assigns, and collects the write targets it understands: redirections, `sed -i`, `tee`, the
# destinations of `cp`/`mv`/`rsync`/`ln`, `rm`, `mkdir`, `touch`, `chmod`, `truncate`,
# `prettier --write`, `npm install`, git's verbs that change the working tree, the writes inside a
# substitution or a shell's string, and a path-like value of `--store`, `--out`, `--output`, or
# `-o`. What it does not understand is allowed, so the gate narrows the gap and does not close it.
# A cheap pre-filter skips the extractor for a command with no write indicator.
#
# A linked worktree is never blocked: the protocol sends a non-holder to a worktree of the leased
# repository, which shares its key. A submodule is its own repository with its own remote.
#
# Hook contract: stdin JSON {tool_name, tool_input: {command}, session_id, cwd}; exit 0 allows,
# exit 2 blocks with stderr shown to the agent.

set -u

payload=$(cat)

command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0
[[ -x /usr/bin/python3 ]] || exit 0
# shellcheck source=lib/vault-retry.sh source-path=SCRIPTDIR
. "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib/vault-retry.sh" || exit 0
[[ -n ${PROGRAM_CLERK_URL:-} && -n ${PROGRAM_CLERK_KEY:-} ]] || exit 0

[[ $(jq -r '.tool_name // ""' <<<"$payload" 2>/dev/null) == Bash ]] || exit 0
# Before anything else runs: a command with no write indicator costs one jq and exits. It reads
# the text without quotes and backslashes, and a `$'...'` string always passes, so `c''p` and
# `$'\x63p'` are read (8n).
cmd=$(jq -r '.tool_input.command // ""' <<<"$payload" 2>/dev/null)
[[ -n "$cmd" ]] || exit 0
[[ "$cmd" == *"\$'"* || "${cmd//[\'\"\\]/}" =~ (sed[[:space:]]+-|>|tee|cp[[:space:]]|mv[[:space:]]|rm[[:space:]]|rmdir|mkdir|touch|chmod|chown|truncate|ln[[:space:]]|rsync|install|prettier|npm[[:space:]]|pnpm[[:space:]]|yarn[[:space:]]|git[[:space:]]|--store|--out|[[:space:]]-o[[:space:]=]) ]] || exit 0

session_id=$(jq -r '.session_id // ""' <<<"$payload" 2>/dev/null)
# The plugin's holder id: <short host>/<session prefix>.
me="$(hostname -s)/${session_id:0:8}"
cwd=$(jq -r '.cwd // ""' <<<"$payload" 2>/dev/null)
[[ -n "$cwd" && -d "$cwd" ]] || cwd=$PWD

TTL=10
cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease"
now=$(date +%s)

# The same rewrite as the plugin's normalizeRemote, so both compute one key for one repository.
resource_of() {
  local remote normalized
  remote=$(git -C "$1" remote get-url origin 2>/dev/null || true)
  if [[ -n "$remote" ]]; then
    normalized=$(sed -e 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##' -e 's#^[^/@]*@##' -e 's#:#/#' \
      -e 's#\.git$##' -e 's#/$##' <<<"$remote")
  else
    normalized="$(hostname -s):$1"
  fi
  printf 'repo:%s' "$normalized"
}

# Sets holder and kind; an empty holder is "not held". A short-lived cache makes a burst of
# commands cost one request. Returns 1 on any trouble, and the caller allows.
lookup() {
  local resource=$1 cf stamp=0 raw code resp parsed
  holder=""
  kind=""
  cf="$cache_dir/$(printf '%s' "$resource" | cksum | tr -d ' ')"
  if [[ -f "$cf" ]]; then
    { read -r stamp; read -r holder; read -r kind; } <"$cf" 2>/dev/null || true
    if [[ ${stamp:-0} =~ ^[0-9]+$ ]] && ((now - stamp < TTL)); then return 0; fi
    holder=""
    kind=""
  fi
  raw=$(vault_retry -s --connect-timeout 1 --max-time 2 -H "Authorization: Bearer $PROGRAM_CLERK_KEY" \
    --get --data-urlencode "resource=$resource" -w $'\n%{http_code}' "$PROGRAM_CLERK_URL/leases") ||
    return 1
  code=${raw##*$'\n'}
  resp=${raw%$'\n'*}
  [[ $code == 200 ]] || return 1
  parsed=$(jq -r '(.items[0] // {}) | "\(.holder // "")\n\(.holder_kind // "")"' \
    <<<"$resp" 2>/dev/null) || return 1
  holder=$(head -n1 <<<"$parsed")
  kind=$(tail -n1 <<<"$parsed")
  if mkdir -p "$cache_dir" 2>/dev/null; then
    printf '%s\n%s\n%s\n' "$now" "$holder" "$kind" >"$cf" 2>/dev/null || true
  fi
  return 0
}

block() {
  local what=$1 resource=$2 root=$3
  if [[ "$kind" == "human" ]]; then
    cat >&2 <<EOF
$what blocked: $resource is held by $holder (a person).

A person's lease is never preempted and never expires, so taking work from it is ask-first.

Ask before touching this working tree. If you have work for it, put it in a disposable worktree
and file a handoff addressed to the repository:

  handoff_create({idempotency_key, project, to: "$resource", kind, ref, from, body})
EOF
    exit 2
  fi
  cat >&2 <<EOF
$what blocked: $resource is held by $holder.

This session is $me, so that lease is not yours: writing into the working tree directly would mix
your changes into whatever that agent has in flight.

Do this instead:
  1. git -C "$root" worktree add <scratch> -b <topic>
  2. work there, and run the repository's checks there
  3. git format-patch --base=\$(git merge-base main HEAD) main..HEAD --stdout
  4. handoff_create({... to: "$resource" ...}), then handoff_put_artifact

If that agent is another session working here, you are subordinate: read freely, send edits
through the worktree and handoff above, and SendMessage the holder if ListAgents shows it. Taking
the lease is a person's act, on the account's Agents page.
EOF
  exit 2
}

lib="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib"

# A function, since Bash 3.2 can fail to parse a heredoc inside `$( … )` (hook-syntax.test.mjs).
write_roots() {
  CMD="$cmd" PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 - "$cwd" "$lib" <<'PY' 2>/dev/null
import os, sys
sys.path.insert(0, sys.argv[2])
from shell_segments import write_targets, checkout_of

base = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
targets = [path for _, path in write_targets(os.environ.get('CMD', ''), base)]

# Targets to main checkouts: a linked worktree is allowed by protocol, a submodule is its own root.
seen = []
for t in targets:
    if not t:
        continue
    r, linked = checkout_of(t)
    if r and not linked and r not in seen:
        seen.append(r)
print('\n'.join(seen))
PY
}
roots=$(write_roots) || exit 0
[[ -n "$roots" ]] || exit 0

excerpt=$(head -c 80 <<<"${cmd//$'\n'/ }")
while IFS= read -r root || [[ -n "$root" ]]; do
  [[ -n "$root" ]] || continue
  resource=$(resource_of "$root")
  lookup "$resource" || continue
  [[ -n "$holder" && "$holder" != "$me" ]] || continue
  block "Bash write (\`$excerpt\`)" "$resource" "$root"
done <<<"$roots"
exit 0
