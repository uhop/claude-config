#!/usr/bin/env bash
# Regression tests for ../destructive-op-gate.sh — feeds each case's command
# through the hook as a PreToolUse Bash payload and asserts the verdict from
# its exit code (0 = pass/ALLOW, 2 = block/DENY).
#
# Centerpiece: the glued `-X<METHOD>` bypass (fixed e31217b). gh/pflag accepts
# `-XDELETE` with no separator after the flag, but the method regex demanded
# one (`[[:space:]=]+`); with no `-f` field flag the auto-POST guard missed it
# too, so a state-mutating call slipped the gate. Loosened to `[[:space:]=]*`.
# Full analysis: vault projects/apodict/corpus/2026-08-09-claude-config-gate-hooks.

set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/destructive-op-gate.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }

pass=0 fail=0
check() {
  local want="$1" cmd="$2"
  jq -nc --arg c "$cmd" '{tool_name:"Bash", tool_input:{command:$c}}' | bash "$HOOK" >/dev/null 2>&1
  local rc=$?              # capture before any command (local resets $?)
  local got=ALLOW; [ "$rc" -eq 2 ] && got=DENY
  if [ "$got" = "$want" ]; then
    ((++pass))
  else
    ((++fail)); printf 'FAIL  want=%-5s got=%-5s  %s\n' "$want" "$got" "$cmd"
  fi
}

# ── gh api: the glued-shorthand bypass (the fix under test) ──
check DENY  'gh api -XDELETE repos/o/r/issues/comments/123'
check DENY  'gh api -XPOST repos/o/r/merges'
check DENY  'gh api -XPATCH repos/o/r/x'
check DENY  'gh api -XPUT repos/o/r/x'
# ── gh api: separated forms that were already caught (must stay caught) ──
check DENY  'gh api -X DELETE repos/o/r/x'
check DENY  'gh api --method POST repos/o/r/x -f a=b'
check DENY  'gh api --method=POST repos/o/r/x'
check DENY  'gh api repos/o/r/issues -f title=x'          # auto-POST via body fields
# ── gh api: reads / query-param GETs (must stay allowed) ──
check ALLOW 'gh api repos/o/r/issues'
check ALLOW 'gh api -X GET -f q=1 repos/o/r/x'            # GET with query params, not a write
check ALLOW 'gh api -XGET repos/o/r/x'
# ── gh api graphql: an inline query is a read; a mutation, or text the hook cannot read, is not (2026-10-30) ──
check ALLOW "gh api graphql -f query='query { viewer { login } }'"
check ALLOW "gh api graphql -f query='{ viewer { login } }'"                  # anonymous query
check ALLOW "gh api graphql -F owner=uhop -f query='query(\$owner: String!) { user(login: \$owner) { name } }'"
check ALLOW "gh api graphql --raw-field 'query=query { viewer { login } }'"
check ALLOW "gh api graphql -f query='{ viewer { clientMutationId } }'"     # a word containing it is not the keyword
check ALLOW "gh api graphql -f query='query { repository(owner:\"uhop\", name:\"stream-chain\") { discussions(first: 5) { totalCount } } }' > /tmp/out.json"
check DENY  "gh api graphql -f query='mutation { addStar(input: {starrableId: \"x\"}) { clientMutationId } }'"
gqlfile=$(mktemp)
trap 'rm -f "$gqlfile"' EXIT
printf 'query { viewer { login } }\n' > "$gqlfile"                          # a read, as the hook would find it
check DENY  "gh api graphql -F query=@$gqlfile"                             # a file can change before the call reads it
check DENY  "printf 'mutation { b }' > $gqlfile && gh api graphql -F query=@$gqlfile"   # even by the same command
check DENY  "gh api graphql --field query=@$gqlfile"
check DENY  'gh api graphql -F query=@read.graphql'
check DENY  'gh api graphql -F query=@-'                                     # stdin
check DENY  'gh api graphql --input body.json'
check DENY  'gh api graphql -f query="$Q"'                                   # expansion can change the text
check DENY  'gh api graphql -f query="$(cat q.graphql)"'
check DENY  "gh api graphql -f query='{ a }' -f query='mutation { b }'"
check DENY  'gh api graphql -f foo=bar'                                      # no query to read
check DENY  'gh api graphql'
check DENY  "gh api graphql -X GET -f query='mutation { b }'"               # GET does not exempt a mutation
check DENY  "gh api graphql -X POST -f query='{ a }'"                       # an explicit write method stays denied
check DENY  "gh api graphql -f query='{ a }' && gh api repos/o/r/issues -f title=x"
check ALLOW 'git commit -m "Allowed read-only gh api graphql queries."'     # words in a message, not a gh call (broke in ca3f3a5)
# ── gh and aws nested in another command: the whitespace tokens never saw them (2026-10-30) ──
check DENY  '(gh issue create --title x)'
check DENY  'cd /tmp && (gh pr merge 1)'
check DENY  'bash -c "gh issue create --title x"'
check DENY  "bash -c 'gh api repos/o/r/issues -f title=x'"
check DENY  'echo $(gh issue create --title x)'
check DENY  'echo `gh issue create --title x`'
check DENY  "eval 'gh release create 1.0.0'"
check DENY  "sh -c 'cd /tmp && gh pr merge 1'"
check DENY  "bash -c \"sh -c 'gh issue close 1'\""                          # two shells deep
check DENY  $'bash <<EOF\ngh issue create --title x\nEOF'
check DENY  "sh -c 'aws s3 rm s3://b/k'"
check DENY  '(aws ec2 terminate-instances --instance-ids i-1)'
check DENY  "bash -c \"gh api graphql -f query='{ viewer { login } }'\""    # nested: its shell may expand the text first
check DENY  "bash -c 'gh api graphql -f query=\"\$Q\"'"
check ALLOW '(gh issue list)'
check ALLOW 'bash -c "gh pr view 1"'
check ALLOW 'echo $(gh api repos/o/r/issues)'
check ALLOW "sh -c 'aws s3 ls s3://b'"
check ALLOW "(gh api graphql -f query='{ viewer { login } }')"              # a top-level subshell is no nesting
check ALLOW 'echo "gh issue create"'                                        # a string, not a command
check ALLOW 'grep -rn "gh pr merge" .'
# ── gh non-api + other branches: smoke that the fix didn't disturb them ──
check ALLOW 'gh pr checkout 123'
check DENY  'gh issue create --title x'
check DENY  'git clean -fd'
check ALLOW 'git clean -n'
check ALLOW 'git status'
# ── gh help flags never mutate (blocked 2026-09-13; exempted 2026-09-15) ──
check ALLOW 'gh gist edit --help'
check ALLOW 'gh gist edit -h'
check ALLOW 'gh issue create --help'
check ALLOW 'gh api --help'
check ALLOW 'gh api -X POST --help'
check ALLOW 'cd ~/x && gh release create --help'
check DENY  'gh gist edit e6ead70c README.md'                # the real edit stays blocked
check DENY  'gh gist edit e6ead70c -f README.md README.md'
check DENY  'gh issue create --title "-h"'                   # a quoted value is not the flag
# ── git and npm global options before the verb: a prefix deny misses them (2026-09-30) ──
check DENY  'git -C /tmp/x tag mcp-0.11.0 3e457da'          # the spelling that ran
check DENY  'git -C /tmp/x push origin main'
check DENY  'git -c core.x=y push'
check DENY  'git --git-dir /tmp/x/.git push'
check DENY  'git --git-dir=/tmp/x/.git --work-tree /tmp/x push'
check DENY  'git --no-pager tag -l'
check DENY  'git push'
check DENY  'git tag v1'
check DENY  'git -C /tmp/x clean -fd'
check DENY  'git -c core.x=y clean -fd'
check DENY  'git --no-pager clean -fd'
check DENY  'git -C /tmp/x clean --force'
check DENY  'cd /tmp/x && git -C . push'
check DENY  'bash -c "git -C /tmp/x push"'
check DENY  'echo $(git -C /tmp/x push)'
check DENY  'npm publish'
check DENY  'npm --prefix /tmp/x publish'
check DENY  'npm -w pkg publish --access public'
check DENY  'npm -C /tmp/x publish'
check DENY  'npm --tag next publish'
check DENY  'npm --registry https://r.example publish'
check DENY  'npm -g --dry-run publish'
check ALLOW 'git -C /tmp/x clean -n'
check ALLOW 'git -C /tmp/x clean -fn'
check ALLOW 'git -C /tmp/x log --grep push'
check ALLOW 'git -C /tmp/x status'
check ALLOW 'git commit -m "push the tag later"'
check ALLOW 'git for-each-ref refs/tags'
check ALLOW 'git log --tags'
check ALLOW "git log --grep 'git push'"
check ALLOW 'echo git push'
check ALLOW 'npm run build'
check ALLOW 'npm --prefix /tmp/x test'
check ALLOW 'npm view pkg publish'
check ALLOW 'npm --silent view pkg publish'

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
