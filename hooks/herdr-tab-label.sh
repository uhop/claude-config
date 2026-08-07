#!/usr/bin/env bash
# Label the herdr tab at session start, so the tab row says which machine and
# which project while working in Claude Code.
#
# Delegates to the dotfiles script, which is also driven from PROMPT_COMMAND —
# one implementation, so both paths share the same guards: inside herdr only,
# never under tmux, and hand-typed tab labels are never overwritten.
# No dotfiles on this host means no labelling, which is the correct no-op.
#
# Custom hook, deliberately beside herdr's own herdr-agent-state.sh — that file
# is overwritten by herdr integration updates and must not be edited.

[ -x "$HOME/.local/bin/herdr-tab-label" ] || exit 0
"$HOME/.local/bin/herdr-tab-label" || true
exit 0
