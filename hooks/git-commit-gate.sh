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
# that the cwd alone decided). A variable the command assigns is followed. A
# site that stays unknown is denied, since it could be any repository
# (2026-11-02; before that it fell back to the session's cwd, which let
# `cd <unmarked> && git -C "$WT" commit` land from a marked one).
#
# A scratch repository needs no marker: one under the temp or the cache directory
# that this command's `git init` or `git clone` made, or that is on disk, since a
# commit there reaches none of Eugene's repositories. A linked worktree there is
# not one: its commit lands on a real repository's branch.
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

# The parser prints one line per commit site that needs the marker — the
# directory the verb runs in, `?` when a variable leaves it unknown — and nothing
# when the words are data or the site is a scratch repository. Parser unavailable
# or failing: the pre-2026-09-06 regex decides, gaps and all, at the cwd.
sites=
[[ "$cmd" =~ ${word}git[[:space:]]+commit([^a-zA-Z0-9_-]|$) ]] && sites="$cwd"
# In a function, since Bash 3.2 can fail to parse a heredoc inside `$( … )`
# (hook-syntax.test.mjs).
commit_sites() {
  CMD="$cmd" PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 - "$lib" "$cwd" <<'PY' 2>/dev/null
import os, sys
sys.path.insert(0, sys.argv[1])
from shell_segments import (strip_heredocs, segments, command_tokens, git_split, substitutions, SHELLS,
                            HOME, read_assignment, resolve_path, checkout_of)

PLACES = {os.path.realpath(p) for p in (os.environ.get('TMPDIR'), '/tmp',
                                        os.environ.get('XDG_CACHE_HOME') or os.path.join(HOME, '.cache')) if p}
VALUE_OPTS = {'-b', '--branch', '--initial-branch', '-o', '--origin', '-c', '--config', '--depth', '-j', '--jobs',
              '-u', '--upload-pack', '--reference', '--template', '--separate-git-dir', '--object-format',
              '--ref-format', '--shallow-since', '--shallow-exclude', '--server-option', '--bundle-uri'}
env, made = {}, []

def in_place(path):
    real = os.path.realpath(path)
    return any(real == p or real.startswith(p + '/') for p in PLACES)

def covers(root, path):
    return path == root or path.startswith(root + '/')

def made_repo(verb, args, site):
    rest, k = [], 0
    while k < len(args):
        if args[k] in VALUE_OPTS:
            k += 2
            continue
        if not args[k].startswith('-'):
            rest.append(args[k])
        k += 1
    if verb == 'init':
        return resolve_path(rest[0], site, env) if rest else site
    return resolve_path(rest[1], site, env) if len(rest) > 1 else None

def scratch(site):
    root, linked = checkout_of(site)
    if linked or not in_place(site):
        return False
    return any(covers(m, site) for m in made) or (root is not None and in_place(root))

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
        if read_assignment(seg, eff, env):
            continue
        toks = command_tokens(seg)
        if not toks:
            continue
        name, args = os.path.basename(toks[0]), toks[1:]
        nonflag = [a for a in args if not a.startswith('-')]
        if name in ('cd', 'pushd'):
            eff = resolve_path(nonflag[0], eff, env) if nonflag else HOME
        elif name == 'git':
            verb, cdir, k = git_split(args)
            site = resolve_path(cdir, eff, env) if cdir else eff
            if verb in ('init', 'clone') and site is not None:
                d = made_repo(verb, args[k + 1:], site)
                if d:
                    made.append(d)
            elif verb == 'commit' and (site is None or not scratch(site)):
                out.append(site)
        elif name in SHELLS:
            for a in nonflag:
                out += sites(a, eff, depth + 1)
    return out

for site in sites(os.environ.get('CMD', ''), sys.argv[2]):
    print(site if site else '?')
PY
}
if [[ -x /usr/bin/python3 && -f "$lib/shell_segments.py" ]]; then
  sites=$(commit_sites || printf '%s\n' "$cwd")
fi
[[ -z "$sites" ]] && exit 0

unmarked=
while IFS= read -r site || [[ -n "$site" ]]; do
  [[ -z "$site" ]] && continue
  if [[ "$site" == '?' ]]; then
    cat >&2 <<EOF
git commit denied by ~/.claude/hooks/git-commit-gate.sh — a variable this command does not assign names the directory the commit runs in, so it could be any repository.

Spell the path, or assign the variable in the same command.
EOF
    exit 2
  fi
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

A scratch repository needs no marker: one under the temp or the cache directory,
made with \`git init\` or \`git clone\` earlier in this command, or already on disk.
EOF
exit 2
