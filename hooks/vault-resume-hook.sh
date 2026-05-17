#!/usr/bin/env bash
# SessionStart hook: warm up vault context for the first turn.
#
# Stdout is injected as additionalContext for the agent. Stderr stays
# on the terminal. Always exits 0 — never poisons startup, even if
# vault-storage is down or dependencies are missing.
#
# Wire-up: settings.json SessionStart entry with matcher "startup|resume"
# (excludes compact|clear so it doesn't re-fire mid-session).

set -uo pipefail

[ -f "$HOME/.env" ] && set -a && . "$HOME/.env" && set +a

# Hard dependencies; degrade silently if missing.
command -v vault-curl >/dev/null || exit 0
command -v jq         >/dev/null || exit 0

# --- Tier 0: project-agnostic server bits — surface only when interesting ---

reindex=$(vault-curl /maintenance/incremental-reindex -X POST -s 2>/dev/null || echo '{}')
changed=$(echo "$reindex" | jq -r '.changedFiles // 0')
if [ "$changed" != "0" ]; then
  imp=$(echo "$reindex" | jq -r '.imported // 0')
  del=$(echo "$reindex" | jq -r '.deleted // 0')
  ren=$(echo "$reindex" | jq -r '.renamed // 0')
  echo "vault: reindexed $imp imported, $del deleted, $ren renamed"
fi

lint=$(vault-curl /system/lint -s 2>/dev/null || echo '{"ok":true}')
if [ "$(echo "$lint" | jq -r '.ok // true')" != "true" ]; then
  echo "vault: lint findings —"
  echo "$lint" | jq -r '.checks | to_entries[] | select(.value.count > 0) | "  \(.key): \(.value.count) (first: \(.value.samples[0] // "n/a"))"'
fi

suggs=$(vault-curl /suggestions/summary -s 2>/dev/null || echo '{"total":0}')
total=$(echo "$suggs" | jq -r '.total // 0')
if [ "$total" != "0" ]; then
  by_kind=$(echo "$suggs" | jq -r '.by_kind | to_entries | map("\(.value) \(.key)") | join(", ")')
  echo "vault: pending suggestions — $by_kind (total $total)"
fi

# --- Tier 1: project-specific bits — only inside a Claude-configured git project ---

git_root=$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null) || true
if [ -z "$git_root" ] || [ "$git_root" = "$HOME" ]; then exit 0; fi
if [ ! -f "$git_root/CLAUDE.md" ] && [ ! -d "$git_root/.claude" ]; then exit 0; fi

project=$(basename "$git_root")
echo ""
echo "=== project: $project ==="

if [ -x "$HOME/.claude/skills/vault-check-drift/check-drift.sh" ]; then
  "$HOME/.claude/skills/vault-check-drift/check-drift.sh" 2>&1 | head -20
fi

logs=$(vault-curl /vault/logs/ -s 2>/dev/null || echo '{}')
recent=$(echo "$logs" | jq -r '.files[]?' 2>/dev/null \
  | grep -Ev '^(archive|sync|_summary|_about)' \
  | sort -r | head -5)
if [ -n "$recent" ]; then
  echo ""
  echo "recent logs (run /vault resume for full synthesis):"
  echo "$recent" | sed 's/^/  /'
fi

exit 0
