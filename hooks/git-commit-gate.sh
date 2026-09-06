#!/bin/bash
# git-commit-gate.sh — PreToolUse hook for Bash.
#
# Reinstates the default-deny behavior that used to live in
# settings.json's permissions.deny — but checks a per-project opt-in marker
# first. A `git commit` is allowed only when `.claude/git-commit-allowed`
# exists at or above the tool call's cwd.
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
# Parser unavailable: the pre-2026-09-06 regex decides, gaps and all.
verdict=data
[[ "$cmd" =~ ${word}git[[:space:]]+commit([^a-zA-Z0-9_-]|$) ]] && verdict=verb
if [[ -x /usr/bin/python3 && -f "$lib/shell_segments.py" ]]; then
  verdict=$(CMD="$cmd" PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 - "$lib" <<'PY' 2>/dev/null || echo verb
import os, sys
sys.path.insert(0, sys.argv[1])
from shell_segments import strip_heredocs, segments, command_tokens, git_verb, substitutions, SHELLS

def executes(cmd, depth=0):
    if depth > 3:
        return True
    text, bodies = strip_heredocs(cmd)
    for prefix, body, quoted in bodies:
        toks = command_tokens(prefix)
        if toks and os.path.basename(toks[0]) in SHELLS and executes(body, depth + 1):
            return True
        if not quoted and any(executes(s, depth + 1) for s in substitutions(body)):
            return True
    if any(executes(s, depth + 1) for s in substitutions(text)):
        return True
    for seg in segments(text):
        toks = command_tokens(seg)
        if not toks:
            continue
        name = os.path.basename(toks[0])
        if name == 'git' and git_verb(toks[1:])[0] == 'commit':
            return True
        if name in SHELLS and any(executes(a, depth + 1) for a in toks[1:] if not a.startswith('-')):
            return True
    return False

print('verb' if executes(os.environ.get('CMD', '')) else 'data')
PY
  )
fi
[[ "$verdict" == verb ]] || exit 0

cwd=$(jq -r '.cwd // ""' <<<"$payload")
[[ -z "$cwd" ]] && cwd="$PWD"

dir="$cwd"
while [[ -n "$dir" && "$dir" != "/" ]]; do
  if [[ -f "$dir/.claude/git-commit-allowed" ]]; then
    exit 0
  fi
  dir=$(dirname "$dir")
done

cat >&2 <<EOF
git commit denied by ~/.claude/hooks/git-commit-gate.sh — no opt-in marker found.

To allow commits in this project, create the marker:

  touch "$cwd/.claude/git-commit-allowed"

Then re-run. The marker is intended to be committed alongside the project
so the opt-in travels with the code.
EOF
exit 2
