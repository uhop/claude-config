#!/usr/bin/env bash
# handed-command-check.sh — Stop hook: a command block in the turn's closing message that holds a
# `<word>` placeholder or a scratch path sends the agent back once, since a command he runs carries
# no placeholder the session can fill (CLAUDE.md § Tools) and the scratchpad is no delivery location
# (§ Scratch files). claude-config D46.
#
# It reads shell-labeled fences and unlabeled ones, where handed commands also land, and leaves
# heredoc bodies alone. A quoted `<word>` counts, since `ACCOUNT='<account>'` is the measured form,
# so a block that greps for `'<title>'` costs one extra turn: the re-entry carries
# `stop_hook_active: true`, on which this hook exits 0.
#
# FAILS OPEN, silently: no jq, no python, no closing message, or a sub-agent run all exit 0.
#
# Hook contract: stdin JSON {stop_hook_active, last_assistant_message?, agent_id?}; stdout JSON on
# block.

set -u

payload=$(cat)

command -v jq >/dev/null 2>&1 || exit 0
[[ -x /usr/bin/python3 ]] || exit 0

agent_id=$(jq -r '.agent_id // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ -z "$agent_id" ]] || exit 0

active=$(jq -r '.stop_hook_active // false' <<<"$payload" 2>/dev/null) || exit 0
[[ "$active" != "true" ]] || exit 0

message=$(jq -r '.last_assistant_message // ""' <<<"$payload" 2>/dev/null) || exit 0
[[ "$message" == *'```'* || "$message" == *'~~~'* ]] || exit 0

lib="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib"

# In a function, since Bash 3.2 can fail to parse a heredoc inside `$( … )` (hook-syntax.test.mjs).
findings() {
  MESSAGE="$message" PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 - "$lib" <<'PY' 2>/dev/null
import os, re, sys
sys.path.insert(0, sys.argv[1])
from shell_segments import strip_heredocs

LANGS = {'bash', 'sh', 'shell', 'zsh', 'console', ''}
FENCE = re.compile(r'^(?P<ind> {0,3})(?P<f>`{3,}|~{3,})(?P<lang>[^\n`]*)\n(?P<body>.*?)^(?P=ind)(?P=f)[ \t]*$', re.M | re.S)
PLACEHOLDER = re.compile(r'(?:^|[^<\w])(<[A-Za-z][A-Za-z0-9_.-]*(?: [A-Za-z0-9_.-]+)*>)')
SCRATCH = re.compile(r'''[^\s'"=;&|()]*/claude-[^/\s]+/[^\s'"=;&|()]*/scratchpad[^\s'"=;&|()]*|[^\s'"=;&|()]*/(?:tmp|T)/tmp\.[A-Za-z0-9]+[^\s'"=;&|()]*''')

seen = []
def note(kind, what):
    if (kind, what) not in seen:
        seen.append((kind, what))

for m in FENCE.finditer(os.environ.get('MESSAGE', '')):
    lang = m.group('lang').strip().split(' ')[0].lower()
    if lang not in LANGS:
        continue
    text, _ = strip_heredocs(m.group('body'))
    for line in text.split('\n'):
        # An unlabeled block can be a tool's --help, whose lines start at an option.
        if not lang and line.lstrip().startswith('-'):
            continue
        for p in PLACEHOLDER.finditer(line):
            note('placeholder', p.group(1))
        for s in SCRATCH.findall(line):
            note('scratch', s)

for kind, what in seen:
    print(f'{kind}\t{what}')
PY
}

found=$(findings) || exit 0
[[ -n "$found" ]] || exit 0

places=$(awk -F'\t' '$1 == "placeholder" {printf "%s%s", (n++ ? ", " : ""), $2}' <<<"$found")
paths=$(awk -F'\t' '$1 == "scratch" {printf "%s%s", (n++ ? ", " : ""), $2}' <<<"$found")

reason="[handed-command] A command block in your closing message"
if [[ -n "$places" ]]; then
  reason+=" holds $places: look the value up and put it in the block; when only he can know it, have the block read it or its first line say where it comes from."
fi
if [[ -n "$paths" ]]; then
  reason+=" ${places:+It also }names a scratch path, $paths: copy what he needs to where he will look (~/.cache/<project>/, a vault note), or say in one line why the scratch path is right here."
fi
reason+=" Then finish."

jq -n --arg r "$reason" '{decision: "block", reason: $r}'
