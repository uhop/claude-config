#!/bin/bash
# git-commit-gate.sh — PreToolUse hook for Bash.
#
# Reinstates the default-deny behavior that used to live in
# settings.json's permissions.deny — but checks a per-project opt-in marker
# first. A `git commit` is allowed only when `.claude/git-commit-allowed`
# exists at or above the directory the commit runs in — the tool call's cwd
# after any `cd`/`pushd` in the command, or git's own `-C` — so a
# `cd <marked repo> && git commit` from an unmarked cwd passes and a
# `cd <unmarked> && git commit` from a marked one does not (2026-09-06; before
# that the cwd alone decided). A site the parser cannot resolve (a `cd "$W"`)
# falls back to the cwd, as the lease gate allows what it cannot parse.
#
# Background: Claude Code's permissions.deny is absolute (a more-local
# allow rule never overrides it), so the old `Bash(git commit:*)` deny
# couldn't be re-opened per-project. Moving the gate into a hook lets us
# express "default deny, opt in per project" — which the docs explicitly
# carve out: a hook can block beyond an allow rule, but it can't bypass a
# deny rule. So the global deny entry for git commit must be removed for
# this hook to take effect; push / tag / publish stay in deny.
#
# Hook contract (per Claude Code docs):
#   - stdin: JSON `{tool_name, tool_input: {command, ...}, cwd, ...}`.
#   - exit 0: pass through to the next stage (permission rules / default mode).
#   - exit 2: block the tool call. stderr is surfaced to the user.

set -e

payload=$(cat)

tool=$(jq -r '.tool_name // ""' <<<"$payload")
[[ "$tool" != "Bash" ]] && exit 0

cmd=$(jq -r '.tool_input.command // ""' <<<"$payload")

# Two stages. The word test is the free pre-filter: no `git` and no `commit`
# both present as words, nothing to decide. What passes it is read as a command by
# the shared parser (hooks/lib/shell_segments.py, the lease gate's): the verb
# counts when it heads a segment — after `cd foo &&`, wrappers, assignments,
# git's own `-C`/`-c` — or sits in an executed context: a `$(...)`, a
# `bash -c` string, a heredoc a shell receives, an unquoted heredoc's
# substitution. A heredoc body `cat` receives, a quoted string, a `git log
# --grep` argument are data and pass (2026-09-06: the substring alone blocked
# two vault writes whose payload mentioned the verb in prose). If the parser
# is missing, the old `git commit`-adjacent regex decides; if it fails on a
# command, that command is treated as the verb — this gate defaults to deny.
word='(^|[^a-zA-Z0-9_-])'
if [[ ! ( "$cmd" =~ ${word}git([^a-zA-Z0-9_-]|$) && "$cmd" =~ ${word}commit([^a-zA-Z0-9_-]|$) ) ]]; then
  exit 0
fi

lib="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib"
cwd=$(jq -r '.cwd // ""' <<<"$payload")
[[ -z "$cwd" ]] && cwd="$PWD"

# The parser prints one line per commit site — the directory the verb runs
# in, `?` when a variable makes it unresolvable — and nothing when the words
# are data. Parser unavailable: the pre-2026-09-06 regex decides, gaps and
# all, at the cwd.
sites=
[[ "$cmd" =~ ${word}git[[:space:]]+commit([^a-zA-Z0-9_-]|$) ]] && sites='?'
if [[ -x /usr/bin/python3 && -f "$lib/shell_segments.py" ]]; then
  sites=$(CMD="$cmd" PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 - "$lib" "$cwd" <<'PY' 2>/dev/null || echo '?'
import os, sys
sys.path.insert(0, sys.argv[1])
from shell_segments import strip_heredocs, segments, command_tokens, git_verb, substitutions, SHELLS

home = os.path.expanduser('~')

def resolve(tok, eff):
    if tok == '~' or tok.startswith('~/'):
        tok = home + tok[1:]
    elif tok.startswith(('$HOME/', '${HOME}/')):
        tok = home + tok[tok.index('/'):]
    elif eff is not None and tok.startswith(('$PWD/', '${PWD}/')):
        tok = eff + tok[tok.index('/'):]
    elif eff is not None and tok in ('$PWD', '.'):
        tok = eff
    if '$' in tok:
        return None
    if not tok.startswith('/'):
        if eff is None:
            return None
        tok = os.path.join(eff, tok)
    return os.path.normpath(tok)

def sites(cmd, eff, depth=0):
    if depth > 3:
        return [None]
    out = []
    text, bodies = strip_heredocs(cmd)
    for prefix, body, quoted in bodies:
        toks = command_tokens(prefix)
        if toks and os.path.basename(toks[0]) in SHELLS:
            out += sites(body, eff, depth + 1)
        if not quoted:
            for s in substitutions(body):
                out += sites(s, eff, depth + 1)
    for s in substitutions(text):
        out += sites(s, eff, depth + 1)
    for seg in segments(text):
        toks = command_tokens(seg)
        if not toks:
            continue
        name, args = os.path.basename(toks[0]), toks[1:]
        nonflag = [a for a in args if not a.startswith('-')]
        if name in ('cd', 'pushd'):
            eff = resolve(nonflag[0], eff) if nonflag else home
        elif name == 'git':
            verb, cdir = git_verb(args)
            if verb == 'commit':
                out.append(resolve(cdir, eff) if cdir else eff)
        elif name in SHELLS:
            for a in nonflag:
                out += sites(a, eff, depth + 1)
    return out

for site in sites(os.environ.get('CMD', ''), sys.argv[2]):
    print(site if site else '?')
PY
  )
fi
[[ -z "$sites" ]] && exit 0

unmarked=
while IFS= read -r site || [[ -n "$site" ]]; do
  [[ -z "$site" || "$site" == '?' ]] && site="$cwd"
  dir="$site"
  found=
  while [[ -n "$dir" && "$dir" != "/" ]]; do
    if [[ -f "$dir/.claude/git-commit-allowed" ]]; then
      found=1
      break
    fi
    dir=$(dirname "$dir")
  done
  if [[ -z "$found" ]]; then
    unmarked="$site"
    break
  fi
done <<<"$sites"
[[ -z "$unmarked" ]] && exit 0

root=$(git -C "$unmarked" rev-parse --show-toplevel 2>/dev/null || echo "$unmarked")
cat >&2 <<EOF
git commit denied by ~/.claude/hooks/git-commit-gate.sh — no opt-in marker at or above $unmarked.

To allow commits in this project, create the marker:

  touch "$root/.claude/git-commit-allowed"

Then re-run. The marker is intended to be committed alongside the project
so the opt-in travels with the code.
EOF
exit 2
