# shellcheck shell=bash
# Sourced by the hooks that name a vault project.

# The project of the checkout at $1: `.claude/pc-project` (the plugin's name), else the older
# `.claude/vault-project` until every checkout is renamed, else its main checkout's folder, since a
# linked worktree's folder says nothing of its project. `skills/vault/vault-project.mjs` reads it the same way.
vault_project_of() {
  local common marker
  for marker in "$1/.claude/pc-project" "$1/.claude/vault-project"; do
    if [[ -f "$marker" ]]; then
      tr -d '[:space:]' <"$marker"
      return
    fi
  done
  common=$(git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  if [[ $common == */.git ]]; then
    common=${common%/.git}
    printf '%s\n' "${common##*/}"
  else
    printf '%s\n' "${1##*/}"
  fi
}
