#!/usr/bin/env bash
# code-rules-gate.sh — PreToolUse (Edit|Write): refuses an edit that introduces a code rule a program
# can check, with the rule and its reason (claude-config 9f). The rules live in lib/code_rules.py,
# never in the global CLAUDE.md, so a session reads one only when it breaks it.
#
# Only what the edit adds counts: an Edit's new text against its old text, a Write against the file
# on disk, so a file's older breaks never block an edit. A line holding `code-rules: allow <id>` is
# skipped for that rule. A write through Bash is not read.
#
# FAILS OPEN, silently: no python, unreadable input, or another tool exits 0.
#
# Hook contract: stdin JSON {tool_name, tool_input}; exit 2 blocks, stderr goes to the agent.

set -u

[[ -x /usr/bin/python3 ]] || exit 0
lib="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib"
PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 "$lib/code_rules.py"
