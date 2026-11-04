# shellcheck shell=bash
# Sourced by the hooks that name a vault project.

# The project of the checkout at $1: `.claude/vault-project`, else its main checkout's folder, since a
# linked worktree's folder says nothing of its project. `skills/vault/resume.mjs` reads it the same way.
vault_project_of() {
  local common
  if [[ -f "$1/.claude/vault-project" ]]; then
    tr -d '[:space:]' <"$1/.claude/vault-project"
    return
  fi
  common=$(git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  if [[ $common == */.git ]]; then
    common=${common%/.git}
    printf '%s\n' "${common##*/}"
  else
    printf '%s\n' "${1##*/}"
  fi
}
