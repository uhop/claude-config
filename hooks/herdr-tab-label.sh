#!/usr/bin/env bash
# Label the herdr tab "host:owner/repo", or "host:~/path" outside a repo root,
# so the top bar always says which machine and which project. Kitty's tab title
# shows only the running command, so herdr's label is the sole place the repo fits.
#
# Custom hook, deliberately beside herdr's own herdr-agent-state.sh — that file
# is overwritten by herdr integration updates and must not be edited.

[ -n "${HERDR_ENV:-}" ] || exit 0
command -v herdr >/dev/null 2>&1 || exit 0
command -v jq    >/dev/null 2>&1 || exit 0

tab=$(herdr pane current 2>/dev/null | jq -r '.result.pane.tab_id // empty')
[ -n "$tab" ] || exit 0

url=
[ -f .git/config ] &&
  url=$(awk '/^\[remote "origin"\]/{f=1;next} /^\[/{f=0} f && $1=="url"{print $3; exit}' .git/config)

if [ -n "$url" ]; then
  slug=${url%.git}
  slug=${slug##*:}
  slug=$(printf '%s\n' "$slug" | awk -F/ '{if (NF>=2) print $(NF-1)"/"$NF; else print $NF}')
else
  slug=${PWD/#$HOME/\~}
fi

herdr tab rename "$tab" "$(hostname -s):${slug}" >/dev/null 2>&1 || true
exit 0
