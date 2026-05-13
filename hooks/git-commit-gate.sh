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

# Match `git commit` as a verb — boundary-anchored so we don't fire on
# `echo "git commit"` or `git-committer-name` style lookalikes. Permissive
# on placement so chains like `cd foo && git commit -m ...` still gate.
if [[ ! "$cmd" =~ (^|[^a-zA-Z0-9_-])git[[:space:]]+commit([^a-zA-Z0-9_-]|$) ]]; then
  exit 0
fi

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
