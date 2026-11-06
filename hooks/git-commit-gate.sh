#!/bin/bash
# git-commit-gate.sh — PreToolUse hook for Bash.
#
# Reinstates the default-deny behavior that used to live in
# settings.json's permissions.deny — but checks a per-project opt-in marker
# first. A `git commit`, or another verb that makes a commit (`am`, `merge`,
# `cherry-pick`, `revert`, `rebase`, a `pull` that may merge; 8e, 2026-11-05),
# is allowed only when `.claude/git-commit-allowed`
# exists at or above the directory the commit runs in — the tool call's cwd
# after any `cd`/`pushd` in the command, or git's own `-C` — so a
# `cd <marked repo> && git commit` from an unmarked cwd passes and a
# `cd <unmarked> && git commit` from a marked one does not (2026-09-06; before
# that the cwd alone decided). A variable the command assigns is followed. A
# site that stays unknown is denied, since it could be any repository
# (2026-11-02; before that it fell back to the session's cwd, which let
# `cd <unmarked> && git -C "$WT" commit` land from a marked one). A commit over
# `ssh` is one: no marker on another host can be read from here (D44).
#
# A scratch repository needs no marker: one under the temp or the cache directory
# that this command's `git init` or `git clone` made, or that is on disk, since a
# commit there reaches none of Eugene's repositories. A linked worktree needs
# none either, anywhere and on any branch (2026-11-02, claude-config D43): local
# worktree work is unrestricted, and what stays refused is the push.
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

cmd=$(jq -r '.tool_input.command // ""' <<<"$payload")
edited=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$payload")

lib="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib"
cwd=$(jq -r '.cwd // ""' <<<"$payload")
[[ -z "$cwd" ]] && cwd="$PWD"

# The marker is the person's to write, since it decides where an agent may commit
# (D47). A write to it is refused unless it is a fixture under the temp or the
# cache directory. It fails open with no parser, and it reads what `write_targets`
# reads, so a script, a whole `.claude` copied in, or a heredoc a shell runs passes.
marker_writes() {
  CMD="$cmd" EDITED="$edited" PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 - "$lib" "$cwd" <<'PY' 2>/dev/null
import os, sys
sys.path.insert(0, sys.argv[1])
from shell_segments import write_targets, in_scratch_place

edited = os.environ.get('EDITED')
writes = [(edited, edited)] if edited else write_targets(os.environ.get('CMD', ''), sys.argv[2])
for tok, path in writes:
    if path is None:
        hit = os.path.basename(tok) == 'git-commit-allowed'
    else:
        hit = path.endswith('/.claude/git-commit-allowed')
    if hit and (path is None or not in_scratch_place(path)):
        print(path or tok)
PY
}
if [[ "$cmd$edited" == *git-commit-allowed* && -x /usr/bin/python3 && -f "$lib/shell_segments.py" ]]; then
  written=$(marker_writes) || written=
  if [[ -n "$written" ]]; then
    cat >&2 <<EOF
BLOCKED by ~/.claude/hooks/git-commit-gate.sh: $written is the commit gate's opt-in marker. The person creates or removes it, since it decides where an agent may commit. Leave it, and tell them what you wanted it for. A fixture under the temp or the cache directory passes.
EOF
    exit 2
  fi
fi

# Two stages. The word test is the free pre-filter: no `git` and no `commit`
# both present as words, nothing to decide. What passes it is read as a command by
# the shared parser (hooks/lib/shell_segments.py, the lease gate's): the verb
# counts when it heads a segment — after `cd foo &&`, wrappers, assignments,
# shell keywords, `xargs`, `parallel`, `watch`, `find -exec`, git's own `-C`/`-c`
# — or sits in an executed context: a `$(...)`, a `bash -c` string, a heredoc a
# shell receives, an unquoted heredoc's substitution. A heredoc body `cat` receives, a quoted string, a `git log
# --grep` argument, a substitution inside single quotes, and a `#` comment are data
# and pass (8f, 2026-11-05; 2026-09-06: the substring alone blocked
# two vault writes whose payload mentioned the verb in prose). If the parser
# is missing, the old `git commit`-adjacent regex decides; if it fails on a
# command, that command is treated as the verb — this gate defaults to deny.
word='(^|[^a-zA-Z0-9_-])'
# A verb that makes a commit is one, a pull only when it may merge (8e).
verbs='commit|am|merge|cherry-pick|revert|rebase|pull'
if [[ ! ( "$cmd" =~ ${word}git([^a-zA-Z0-9_-]|$) && "$cmd" =~ ${word}($verbs)([^a-zA-Z0-9_-]|$) ) ]]; then
  exit 0
fi

# The parser prints one line per commit site that needs the marker — the verb, a
# tab, and the directory it runs in, `?` when a variable leaves it unknown — and
# nothing when the words are data or the site is a scratch repository or a linked
# worktree. Parser unavailable
# or failing: the pre-2026-09-06 regex decides, gaps and all, at the cwd.
sites=
[[ "$cmd" =~ ${word}git[[:space:]]+(commit|am|merge|cherry-pick|revert|rebase)([^a-zA-Z0-9_-]|$) ]] &&
  sites="${BASH_REMATCH[2]}"$'\t'"$cwd"
# In a function, since Bash 3.2 can fail to parse a heredoc inside `$( … )`
# (hook-syntax.test.mjs).
commit_sites() {
  CMD="$cmd" PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 - "$lib" "$cwd" <<'PY' 2>/dev/null
import os, sys
sys.path.insert(0, sys.argv[1])
from shell_segments import (parse_heredocs, heredoc_runs, segments, run_tokens, ssh_command, git_split, substitutions,
                            SHELLS, HOME, read_assignment, resolve_path, checkout_of, Subshells, in_scratch_place)

VALUE_OPTS = {'-b', '-B', '--reason', '--branch', '--initial-branch', '-o', '--origin', '-c', '--config', '--depth', '-j', '--jobs',
              '-u', '--upload-pack', '--reference', '--template', '--separate-git-dir', '--object-format',
              '--ref-format', '--shallow-since', '--shallow-exclude', '--server-option', '--bundle-uri'}
env, made, added = {}, [], []

# Every verb that makes a commit is one (8e, 2026-11-05); these forms of them make none.
COMMIT_VERBS = {'commit', 'am', 'merge', 'cherry-pick', 'revert', 'rebase', 'pull'}
NO_COMMIT = {'--abort', '--quit', '--show-current-patch', '--edit-todo'}
NO_COMMIT_BY_VERB = {'merge': {'--ff-only', '--squash', '--no-commit'}, 'pull': {'--ff-only'},
                     'cherry-pick': {'-n', '--no-commit'}, 'revert': {'-n', '--no-commit'}}

def makes_commit(verb, args):
    if verb not in COMMIT_VERBS:
        return False
    flags = set(args)
    return verb == 'commit' or not (flags & (NO_COMMIT | NO_COMMIT_BY_VERB.get(verb, set())))

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
    if verb == 'worktree' and rest[:1] != ['add']:
        return None
    return resolve_path(rest[1], site, env) if len(rest) > 1 else None

def needs_no_marker(site):
    root, linked = checkout_of(site)
    if linked or any(covers(a, site) for a in added):
        return True
    if not in_scratch_place(site):
        return False
    return any(covers(m, site) for m in made) or (root is not None and in_scratch_place(root))

def sites(cmd, eff, depth=0):
    if depth > 3:
        return [('commit', None)]
    out = []
    text, bodies = parse_heredocs(cmd)
    for prefix, body, quoted, rest in bodies:
        if heredoc_runs(prefix, rest, text):
            out += sites(body, eff, depth + 1)
        if not quoted:
            for s in substitutions(body, quotes=False):
                out += sites(s, eff, depth + 1)
    for s in substitutions(text):
        out += sites(s, eff, depth + 1)
    scope = Subshells()
    for seg in segments(text):
        eff = scope.enter(seg, eff)
        if read_assignment(seg, eff, env):
            continue
        toks = run_tokens(seg)
        if not toks:
            continue
        name, args = os.path.basename(toks[0]), toks[1:]
        nonflag = [a for a in args if not a.startswith('-')]
        if name in ('cd', 'pushd'):
            eff = resolve_path(nonflag[0], eff, env) if nonflag else HOME
        elif name == 'git':
            verb, cdir, k = git_split(args)
            site = resolve_path(cdir, eff, env) if cdir else eff
            if verb in ('init', 'clone', 'worktree') and site is not None:
                d = made_repo(verb, args[k + 1:], site)
                if d:
                    (added if verb == 'worktree' else made).append(d)
            elif makes_commit(verb, args[k + 1:]) and (site is None or not needs_no_marker(site)):
                out.append((verb, site))
        elif name in SHELLS:
            for a in nonflag:
                out += sites(a, eff, depth + 1)
        elif name == 'ssh':
            out += [(verb, None) for verb, _ in sites(ssh_command(args), None, depth + 1)]
    return out

for verb, site in sites(os.environ.get('CMD', ''), sys.argv[2]):
    print(f'{verb}\t{site or "?"}')
PY
}
if [[ -x /usr/bin/python3 && -f "$lib/shell_segments.py" ]]; then
  sites=$(commit_sites || printf '%s\t%s\n' "${sites%%$'\t'*}" "$cwd")
  [[ "$sites" == $'\t'* ]] && sites="commit$sites"
fi
[[ -z "$sites" ]] && exit 0

unmarked=
verb=commit
while IFS=$'\t' read -r verb site || [[ -n "$site" ]]; do
  [[ -z "$site" ]] && continue
  if [[ "$site" == '?' ]]; then
    cat >&2 <<EOF
git $verb denied by ~/.claude/hooks/git-commit-gate.sh — it cannot read the directory the commit runs in, so it could be any repository: a variable this command does not assign, or another host over ssh.

Spell the path, or assign the variable in the same command. Commit on another host from a session there.
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

also=
[[ "$verb" != commit ]] &&
  also=$'\n\n'"A git $verb makes a commit, as \`git commit\` does. \`--ff-only\`, \`--squash\`, \`--no-commit\`, and \`--abort\` make none."
cat >&2 <<EOF
git $verb denied by ~/.claude/hooks/git-commit-gate.sh — no opt-in marker at or above $unmarked.$also

The marker is the person's to create, so leave this commit to them.

A scratch repository needs no marker: one under the temp or the cache directory,
made with \`git init\` or \`git clone\` earlier in this command, or already on disk.
Neither does a linked worktree.
EOF
exit 2
