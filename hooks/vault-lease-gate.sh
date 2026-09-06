#!/usr/bin/env bash
# vault-lease-gate.sh — the repo-lease gate: PreToolUse for Edit / Write /
# NotebookEdit and for Bash; PostToolUse (`--touch`) for every tool.
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
# Liveness rides here too (2026-08-18): when the lease is ours, an edit
# renews it (throttled to once per RENEW_EVERY seconds), and when the edited
# repo is the session's own cwd repo and nobody holds it — the TTL lapsed, or
# the server restarted — the edit re-claims it (`priority: cwd`). Both are
# best-effort and never block; they exist so `renewed_at` means "still
# active" and a lapsed own-repo lease heals on the next touch instead of
# leaving the next session unable to tell a live neighbour from a ghost.
#
# `--touch` (2026-09-05): the same liveness half, keyed to the session's cwd
# repo instead of an edited file, run from PostToolUse on every tool. A
# session that edits through Bash, or works through MCP tools alone, never
# trips the Edit/Write matcher, so its lease used to expire mid-session and
# the next agent read a live neighbour as a ghost (found 2026-08-20). Touch
# mode never blocks and never prints: a fresh renew stamp costs a stat, a
# stale one costs one lookup per RENEW_EVERY. Sub-agent payloads (agent_id)
# exit at once — sub-agents never claim, and a re-claim under a different
# session prefix would lock the parent out of its own repo.
#
# Bash (2026-09-06, option 1 of the three put to the operator): a write-shaped
# Bash command is gated on the repositories its targets name. The extractor
# (Python, below, through the shared hooks/lib/shell_segments.py) strips heredoc bodies, splits the command on unquoted `;`,
# `|`, `&&`, `||` and newlines, tokenizes each segment with shlex, tracks `cd`
# for the effective directory, and collects the write targets it understands:
# redirections, `sed -i`, `tee`, `cp`/`mv`/`rsync`/`ln` destinations, `rm`,
# `mkdir`, `touch`, `chmod`, `truncate`, `prettier --write`, `npm install`,
# and the working-tree-mutating `git` verbs (never `worktree`, never
# `apply --check`). Each target resolves to the main checkout that contains
# it; a checkout whose lease someone else holds blocks the call. Measured
# 2026-09-05: 80 such commands in 21 sessions over 30 days, claude-config the
# top target. Whatever the extractor does not understand is allowed — a write
# inside `python - <<EOF`, a path held in a variable, a relative path after a
# `cd` it could not parse — so the gate narrows the gap; it does not close it.
# A cheap pre-filter skips the extractor for commands with no write indicator.
#
# Linked worktrees are never blocked (2026-09-06): the protocol sends a
# non-holder to a disposable worktree of the held repo, whose remote — and so
# whose lease key — is the main checkout's. A root whose `.git` is a file
# pointing under `worktrees/` is allowed in every mode; the lease protects
# the main working tree. Before this the Edit gate blocked the very path it
# prescribed. A submodule's `.git` file points under `modules/` and is its own
# repo with its own remote, so it is checked as its own resource.
#
# Hook contract:
#   - stdin: JSON {tool_name, tool_input: {file_path|notebook_path|command}, session_id, cwd}
#     (--touch: {session_id, cwd, agent_id?}; the tool fields are ignored)
#   - exit 0: allow. exit 2: block, stderr shown to the agent (never in --touch).

set -u

payload=$(cat)
mode=edit
[[ "${1:-}" == "--touch" ]] && mode=touch

command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0
[[ -n "${VAULT_API_URL:-}" && -n "${VAULT_API_TOKEN:-}" ]] || exit 0

if [[ $mode == edit ]]; then
  tool=$(jq -r '.tool_name // ""' <<<"$payload" 2>/dev/null) || exit 0
  case "$tool" in
    Edit | Write | NotebookEdit | MultiEdit) ;;
    Bash)
      mode=bash
      # Cheap pre-filter before anything else runs: a command with no write
      # indicator costs one jq and exits — this path runs on every Bash call.
      cmd=$(jq -r '.tool_input.command // ""' <<<"$payload" 2>/dev/null)
      [[ -n "$cmd" ]] || exit 0
      [[ "$cmd" =~ (sed[[:space:]]+-|>|tee|cp[[:space:]]|mv[[:space:]]|rm[[:space:]]|rmdir|mkdir|touch|chmod|chown|truncate|ln[[:space:]]|rsync|install|prettier|npm[[:space:]]|pnpm[[:space:]]|yarn[[:space:]]|git[[:space:]]) ]] || exit 0
      [[ -x /usr/bin/python3 ]] || exit 0
      ;;
    *) exit 0 ;;
  esac
fi

# The holder id this session would have claimed under (skill convention:
# <hostname>/<session-prefix>). A mismatch reads as "someone else holds it",
# which is why the block message prints both sides — that makes a convention
# slip diagnosable instead of just baffling.
session_id=$(jq -r '.session_id // ""' <<<"$payload" 2>/dev/null)
me="$(hostname -s)/${session_id:0:8}"
cwd=$(jq -r '.cwd // ""' <<<"$payload" 2>/dev/null)
[[ -n "$cwd" && -d "$cwd" ]] || cwd=$PWD
cwd_root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true)

TTL=10
RENEW_EVERY=900
cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-vault-lease"
now=$(date +%s)
auth=(-H "Authorization: Bearer $VAULT_API_TOKEN" -H 'Content-Type: application/json')
holder=""
kind=""

# ── helpers ──────────────────────────────────────────────────────────────

# Repo root containing a path. A Write may be creating a file that does not
# exist yet, so resolve from the deepest existing ancestor.
root_of() {
  local dir=$1
  [[ -d "$dir" ]] || dir=$(dirname "$dir")
  while [[ -n "$dir" && "$dir" != "/" && ! -d "$dir" ]]; do dir=$(dirname "$dir"); done
  git -C "$dir" rev-parse --show-toplevel 2>/dev/null
}

is_linked_worktree() { [[ -f "$1/.git" ]] && grep -q '/worktrees/' "$1/.git" 2>/dev/null; }

# The resource key must match what claimants use: the normalized remote URL,
# so every clone and worktree of a repo is one resource. A repo with no remote
# cannot be shared, so it keys by host:path — the one place host belongs.
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

cache_file_of() { printf '%s/%s' "$cache_dir" "$(printf '%s' "$1" | cksum | tr -d ' ')"; }

# Sets holder/kind for a resource (empty holder = not held). Short-TTL cache
# so an edit burst costs one request, not one per edit — stale by at most TTL
# seconds, which matches the protocol's own model: a holder discovers
# demotion at its next touch, not instantly. Returns 1 on infrastructure
# trouble, and the caller allows.
lookup() {
  local resource=$1 cf stamp=0 resp parsed
  holder=""
  kind=""
  cf=$(cache_file_of "$resource")
  if [[ -f "$cf" ]]; then
    { read -r stamp; read -r holder; read -r kind; } <"$cf" 2>/dev/null || true
    if [[ ${stamp:-0} =~ ^[0-9]+$ ]] && ((now - stamp < TTL)); then return 0; fi
    holder=""
    kind=""
  fi
  resp=$(curl -sf --connect-timeout 1 --max-time 2 -H "Authorization: Bearer $VAULT_API_TOKEN" \
    --get --data-urlencode "resource=$resource" "$VAULT_API_URL/leases") || return 1
  # Empty `items` means "not held" — an answer, not an error.
  parsed=$(jq -r '(.items[0] // {}) | "\(.holder // "")\n\(.holder_kind // "")"' \
    <<<"$resp" 2>/dev/null) || return 1
  holder=$(head -n1 <<<"$parsed")
  kind=$(tail -n1 <<<"$parsed")
  if mkdir -p "$cache_dir" 2>/dev/null; then
    printf '%s\n%s\n%s\n' "$now" "$holder" "$kind" >"$cf" 2>/dev/null || true
  fi
  return 0
}

# Nobody holds our own repo — the SessionStart claim lapsed (TTL, server
# restart) or never ran. Re-claim; a 409 means someone took it in the gap,
# which is exactly the case the block path is for. Sets holder/kind.
claim_cwd() {
  local resource=$1 cf body raw code resp parsed
  cf=$(cache_file_of "$resource")
  body=$(jq -cn --arg r "$resource" --arg h "$me" \
    '{resource: $r, holder: $h, kind: "agent", priority: "cwd"}') || return 1
  raw=$(curl -s --connect-timeout 1 --max-time 2 "${auth[@]}" --data-binary "$body" \
    -w $'\n%{http_code}' "$VAULT_API_URL/leases/claim") || return 1
  code=${raw##*$'\n'}
  resp=${raw%$'\n'*}
  case "$code" in
    200)
      holder=$me
      kind=agent
      printf '%s\n%s\n%s\n' "$now" "$me" "agent" >"$cf" 2>/dev/null || true
      printf '%s\n' "$now" >"$cf.renew" 2>/dev/null || true
      ;;
    409)
      parsed=$(jq -r '(.details.current // {}) | "\(.holder // "")\n\(.holder_kind // "")"' \
        <<<"$resp" 2>/dev/null) || return 1
      holder=$(head -n1 <<<"$parsed")
      kind=$(tail -n1 <<<"$parsed")
      [[ -n "$holder" ]] && printf '%s\n%s\n%s\n' "$now" "$holder" "$kind" >"$cf" 2>/dev/null
      ;;
    *) return 1 ;;
  esac
  return 0
}

# Renew our own lease, throttled to once per RENEW_EVERY.
renew_if_due() {
  local resource=$1 stamp last=0 body
  stamp="$(cache_file_of "$resource").renew"
  [[ -f "$stamp" ]] && read -r last <"$stamp" 2>/dev/null
  [[ ${last:-0} =~ ^[0-9]+$ ]] || last=0
  ((now - last >= RENEW_EVERY)) || return 0
  body=$(jq -cn --arg r "$resource" --arg h "$me" '{resource: $r, holder: $h}') || return 0
  curl -s -o /dev/null --connect-timeout 1 --max-time 2 "${auth[@]}" --data-binary "$body" \
    "$VAULT_API_URL/leases/renew" || true
  printf '%s\n' "$now" >"$stamp" 2>/dev/null || true
}

# The block messages. `what` names the call: "Edit", or "Bash write (`…`)".
block() {
  local what=$1 resource=$2 root=$3
  if [[ "$kind" == "human" ]]; then
    cat >&2 <<EOF
$what blocked: $resource is held by $holder (human).

The operator holds this repo. A human lease is never preempted and never
expires — taking work from it is ask-first, by design.

Ask before touching this working tree. If you have work for it, put it in a
disposable worktree and file a handoff addressed to the role:

  vault_handoff_create({idempotency_key, project, to: "$resource", kind, ref, from, body})
EOF
    exit 2
  fi
  cat >&2 <<EOF
$what blocked: $resource is held by $holder.

This session is $me, so that lease is not yours — editing the working tree
directly would mix your changes into whatever that agent has in flight.

Do this instead:
  1. git -C "$root" worktree add <scratch> -b <topic>
  2. work there, and run that repo's gates there
  3. git format-patch --base=\$(git merge-base main HEAD) main..HEAD --stdout
  4. vault_handoff_create({... to: "$resource" ...}), then vault_handoff_put_artifact

If this repo IS your session's working directory: a cwd claim preempts an
agent-held SIDE lease, so try

  vault_lease_claim({resource: "$resource", holder: "$me", priority: "cwd"})

— but if that returns 409, the holder is another cwd session and you are
SUBORDINATE (ruled 2026-08-18): read freely, route edits through the worktree
+ handoff above, SendMessage the holder if ListAgents shows it. Taking the
lease is the operator's call — only on an explicit "take the lease".
EOF
  exit 2
}

# One root, one verdict: allow (linked worktree, unheld, ours and renewed, our
# own repo re-claimed, infrastructure trouble) or block.
check_root() {
  local root=$1 what=$2 resource
  is_linked_worktree "$root" && return 0
  resource=$(resource_of "$root")
  lookup "$resource" || return 0
  if [[ -z "$holder" ]]; then
    [[ "$root" == "$cwd_root" ]] || return 0
    claim_cwd "$resource" || return 0
  fi
  if [[ "$holder" == "$me" ]]; then
    renew_if_due "$resource"
    return 0
  fi
  [[ -n "$holder" ]] || return 0
  block "$what" "$resource" "$root"
}

# ── --touch: liveness for the session's own repo, from every tool call ───

if [[ $mode == touch ]]; then
  agent_id=$(jq -r '.agent_id // ""' <<<"$payload" 2>/dev/null) || exit 0
  [[ -z "$agent_id" ]] || exit 0
  [[ -n "$cwd_root" ]] || exit 0
  resource=$(resource_of "$cwd_root")
  stamp="$(cache_file_of "$resource").renew"
  last=0
  [[ -f "$stamp" ]] && read -r last <"$stamp" 2>/dev/null
  [[ ${last:-0} =~ ^[0-9]+$ ]] || last=0
  ((now - last < RENEW_EVERY)) && exit 0
  lookup "$resource" || exit 0
  if [[ -z "$holder" ]]; then claim_cwd "$resource" || exit 0; fi
  if [[ "$holder" == "$me" ]]; then
    renew_if_due "$resource"
  else
    # Not ours: nothing to renew and nothing to say — stamp the check so a
    # subordinate session asks once per RENEW_EVERY, not once per cache expiry.
    printf '%s\n' "$now" >"$stamp" 2>/dev/null || true
  fi
  exit 0
fi

# ── Edit / Write / NotebookEdit: one target, one root ────────────────────

if [[ $mode == edit ]]; then
  target=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$payload" 2>/dev/null)
  [[ -n "$target" ]] || exit 0
  root=$(root_of "$target") || exit 0
  [[ -n "$root" ]] || exit 0
  check_root "$root" "Edit"
  exit 0
fi

# ── Bash: the write targets the command names, each to its main checkout ──

roots=$(CMD="$cmd" PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 - "$cwd" "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib" <<'PY' 2>/dev/null
import os, re, sys
sys.path.insert(0, sys.argv[2])
from shell_segments import strip_heredocs, segments, command_tokens, git_verb

cmd = os.environ.get('CMD', '')
base = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
home = os.path.expanduser('~')

# 1-2. Heredoc bodies are data; segments split on unquoted separators — the
#      shared parser (hooks/lib/shell_segments.py, D14, also the commit gate's).
text, _ = strip_heredocs(cmd)
segs = segments(text)

MUTATING_GIT = {'add', 'am', 'apply', 'checkout', 'cherry-pick', 'clean', 'commit', 'merge', 'mv',
                'pull', 'rebase', 'reset', 'restore', 'revert', 'rm', 'stash', 'switch'}
ALL_ARGS = {'rm', 'rmdir', 'mkdir', 'touch', 'unlink', 'tee'}
SKIP_ONE = {'chmod', 'chown', 'truncate'}
DEST_LAST = {'cp', 'mv', 'rsync', 'ln', 'install'}
NPM_WRITES = {'install', 'i', 'ci', 'update', 'uninstall', 'link', 'rebuild', 'add', 'remove', 'dedupe'}

def resolve(tok, eff):
    if not tok or tok in ('-', '/dev/null') or tok.startswith(('&', '<')):
        return None
    if tok == '~' or tok.startswith('~/'):
        tok = home + tok[1:]
    elif tok.startswith(('$HOME/', '${HOME}/')):
        tok = home + tok[tok.index('/'):]
    elif tok.startswith(('$PWD/', '${PWD}/')):
        tok = eff + tok[tok.index('/'):]
    elif tok in ('$PWD', '.'):
        tok = eff
    if '$' in tok:
        return None
    for ch in '*?[':
        if ch in tok:
            tok = tok[:tok.index(ch)]
    if not tok.startswith('/'):
        tok = os.path.join(eff, tok)
    return os.path.normpath(tok)

targets, eff = [], base
for seg in segs:
    toks = command_tokens(seg)
    if not toks:
        continue
    rest, j = [], 0
    while j < len(toks):
        t = toks[j]
        m = re.match(r'^(\d*|&)(>>?)(.*)$', t)
        if m:
            tgt = m.group(3)
            if not tgt and j + 1 < len(toks):
                tgt = toks[j + 1]; j += 1
            if tgt and not tgt.startswith('&'):
                targets.append(resolve(tgt, eff))
            j += 1
            continue
        rest.append(t); j += 1
    toks = rest
    if not toks:
        continue
    name, args = os.path.basename(toks[0]), toks[1:]
    nonflag = [a for a in args if not a.startswith('-')]
    if name in ('cd', 'pushd'):
        d = resolve(nonflag[0], eff) if nonflag else home
        if d:
            eff = d
    elif name == 'sed':
        if not any(a == '-i' or a.startswith('-i') or a.startswith('--in-place') for a in args):
            continue
        files, saw_script, k = [], False, 0
        while k < len(args):
            a = args[k]
            if a in ('-e', '-f', '--expression', '--file'):
                saw_script = True; k += 2; continue
            if a.startswith(('--expression=', '--file=')):
                saw_script = True; k += 1; continue
            if a.startswith('-'):
                k += 1; continue
            files.append(a); k += 1
        if not saw_script:
            files = files[1:]
        targets += [resolve(f, eff) for f in files]
    elif name in ALL_ARGS:
        targets += [resolve(a, eff) for a in nonflag]
    elif name in SKIP_ONE:
        targets += [resolve(a, eff) for a in nonflag[1:]]
    elif name in DEST_LAST:
        if '-t' in args and args.index('-t') + 1 < len(args):
            targets.append(resolve(args[args.index('-t') + 1], eff))
        elif len(nonflag) >= 2:
            targets.append(resolve(nonflag[-1], eff))
    elif name == 'git':
        verb, cdir = git_verb(args)
        d = (resolve(cdir, eff) or eff) if cdir else eff
        if verb in MUTATING_GIT and not (verb == 'apply' and '--check' in args):
            targets.append(d)
    elif name in ('npx', 'prettier'):
        if 'prettier' in toks[:2] and ('--write' in args or '-w' in args):
            targets += [resolve(a, eff) for a in nonflag if a != 'prettier']
    elif name in ('npm', 'pnpm', 'yarn'):
        if nonflag and nonflag[0] in NPM_WRITES:
            targets.append(eff)

# 3. Targets → main checkouts. A `.git` file under worktrees/ is a linked
#    worktree (allowed by protocol); under modules/ it is a submodule, its own
#    repo with its own remote, checked as its own root.
def root_of(p):
    d = p
    while d and d != '/':
        if os.path.isdir(d):
            g = os.path.join(d, '.git')
            if os.path.isdir(g):
                return d
            if os.path.isfile(g):
                try:
                    return None if '/worktrees/' in open(g).read() else d
                except OSError:
                    return None
        d = os.path.dirname(d)
    return None

seen = []
for t in targets:
    if not t:
        continue
    r = root_of(t)
    if r and r not in seen:
        seen.append(r)
print('\n'.join(seen))
PY
) || exit 0
[[ -n "$roots" ]] || exit 0

excerpt=$(head -c 80 <<<"${cmd//$'\n'/ }")
while IFS= read -r root; do
  [[ -n "$root" ]] || continue
  check_root "$root" "Bash write (\`$excerpt\`)"
done <<<"$roots"
exit 0
