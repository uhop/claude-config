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

# ── words that never run: a quoted string, a heredoc body, another command's flag (2026-11-02) ──
check ALLOW 'echo "run gh issue create yourself"'
check ALLOW 'git commit -m "see gh api repos/o/r/issues -f title=x"'
check ALLOW 'echo "a && gh issue create --title x"'
check ALLOW 'printf "%s\n" "aws s3 rm s3://b/k"'
check ALLOW '/usr/bin/time -f "gh %es" gh api users/x --silent'
check ALLOW 'time -f x gh api repos/o/r/issues'
check ALLOW $'python3 - <<\'EOF\'\nprint("aws ssm put-parameter --name x")\nEOF'
check ALLOW $'cat > notes.md <<\'EOF\'\ngh issue create --title x\nEOF'
check ALLOW $'cat > notes.md <<EOF\naws s3 rm s3://b/k\nEOF'
# a substitution inside single quotes never runs (8f, 2026-11-05)
check ALLOW "echo 'see \`gh issue create --title x\` later'"
check ALLOW "echo 'run \$(gh issue create --title x) later'"
check ALLOW "sed -i 's/x \`git push\` y/z/' notes.md"
# ── what those exemptions must not open: a command that runs its text, or text that still runs ──
check DENY  "echo \"it's \$(gh issue create --title x)\""
check DENY  "echo 'a' \$(gh issue create --title x) 'b'"
check DENY  $'cat > f <<EOF\n\'$(gh issue create --title x)\'\nEOF'
check DENY  $'cat > f <<EOF\n\'$(git push origin main)\'\nEOF'
check DENY  $'# don\'t retry\ngh issue create --title x'
check DENY  $'# don\'t retry\necho $(gh issue create --title x)'
check ALLOW $'# gh issue create --title x, later\nls'
# a `$'...'` string ends at its unescaped quote, and its word is the one it stands for (8g, 2026-11-05)
check DENY  "echo \$'a\\'b' ; git push origin main"
check DENY  $'echo $\'a\\\'b\'\nnpm publish'
check DENY  $'cat <<EOF\n$(echo $\'\\\')\'; gh issue create -t x)\nEOF'
check DENY  "git push origin \$'ma\\'in'"
check DENY  "git \$'push' origin main"
check DENY  "git \$\"tag\" x"
check ALLOW "echo \$'a\\'b ; git push origin main'"
# a verb split by a quote or an escape is the verb, and gh and aws are read by the words they receive (8k, 2026-11-05)
check DENY  "git pu''sh origin main"
check DENY  'git p\ush origin main'
check DENY  "git \$'\\x70ush' origin main"
check DENY  "g''it push origin main"
check DENY  "np''m publish"
check DENY  "git ta''g v1"
check DENY  "git cl''ean -fd"
check DENY  "g''h issue create --title x"
check DENY  "gh issue cre''ate --title x"
check DENY  "gh issue 'create' --title x"
check DENY  "gh api -X 'POST' repos/o/r/issues"
check DENY  'gh api --method "DELETE" repos/o/r/x'
check DENY  "a''ws s3 rm s3://b/k"
check DENY  "aws s3 'rm' s3://b/k"
check DENY  "aws ec2 'terminate-instances' --instance-ids i-1"
check DENY  "timeout 5 gh issue 'close' 1"
check DENY  "\$'\\x67h' issue create --title x"
check ALLOW "gh issue 'view' 1"
check ALLOW "gh issue list --search 'is:open label:x'"
check ALLOW "gh pr view 1 --json title -q '.title'"
check ALLOW "gh issue create --title '-h' --help"
check DENY  "gh issue create --title \$'\\x2dh'"
check DENY  "gh issue create --title 'a -h'"
check DENY  'gh issue create --title a\ -h'
check ALLOW "echo \$'gh issue create --title x'"
check ALLOW "git log --oneline 'pu''sh'"
# a substitution's body holds its own parentheses and substitutions (8p, 2026-11-05)
check DENY  'r=$(git push origin main 2>&1 | grep -c "(forced update)")'
check DENY  'echo $(gh issue create --title "fix(x)")'
check DENY  'v=$(npm publish --tag "$(date +%s)")'
check DENY  'echo "$(aws s3 rm s3://b/k --exclude "(x)")"'
check ALLOW 'echo $(gh pr view 1 --json title -q ".title | ascii_downcase")'
check ALLOW "echo '\$(git push origin main)'"
check DENY  $'cat > s.sh <<\'EOF\'\necho $(echo $(echo $(echo $(gh issue create --title x))))\nEOF\nbash s.sh'
check DENY  $'cat > s.sh <<\'EOF\'\necho $(echo $(echo $(echo $(git push origin main))))\nEOF\nbash s.sh'
# a segment shlex cannot read is read by its words; an escaped backtick or parenthesis is a character (8i, 2026-11-05)
check DENY  'git push origin "unclosed'
check DENY  'git tag "unclosed'
check DENY  'npm publish "unclosed'
check ALLOW 'git log --grep "unclosed'
check ALLOW 'git status; echo push "unclosed'
check ALLOW 'npm ls; echo publish "unclosed'
check ALLOW "t=\$'git pu\\'\\'sh origin main'"
check ALLOW 'X="git push origin main"'
check ALLOW "echo \"Run \\\`git push\\\` yourself\""
check ALLOW 'echo git push \)'
check DENY  'xargs gh issue create --title x'
check DENY  'find . -name x -exec gh issue close 1 \;'
check DENY  'parallel gh issue close ::: 1 2'
check DENY  'watch gh issue create --title x'
check DENY  'xargs sh -c "cd /tmp && gh issue create --title x"'
check DENY  '/usr/bin/time gh issue create --title x'
check DENY  '/usr/bin/time -f x gh api repos/o/r/issues -f title=y'
check DENY  'env FOO=1 gh issue create --title x'
check DENY  'echo "$(gh issue create --title x)"'
check DENY  'git commit -m "x" && gh pr merge 1'
check DENY  'gh issue create --title "quoted value"'
check DENY  'echo "unbalanced && gh issue create --title x'                 # unreadable: the words stay in view
check DENY  $'cat <<EOF | bash\ngh issue create --title x\nEOF'
check DENY  $'cat <<\'EOF\' | sh\naws s3 rm s3://b/k\nEOF'
check DENY  $'ssh host <<EOF\ngh issue create --title x\nEOF'
check DENY  $'x | bash <<EOF\ngh issue create --title x\nEOF'
check DENY  $'cd /tmp && bash <<EOF\ngh issue create --title x\nEOF'
check DENY  $'cat > f <<EOF\n$(gh issue create --title x)\nEOF'
check DENY  $'cat <<EOF | bash\ngit push\nEOF'
check DENY  $'echo "x <<EOF"\ngh issue create --title x'                   # a quoted marker opens no heredoc
check DENY  $'jq . <<<y\ngh issue create --title x'                         # a here-string opens no heredoc
# ── a file the command writes and names again may run: what it wrote is code ──
check DENY  $'cat > s.sh <<\'EOF\'\ngh issue create --title x\nEOF\nbash s.sh'
check DENY  $'cat > "$W/s.sh" <<EOF\naws s3 rm s3://b/k\nEOF\nchmod +x "$W/s.sh" && "$W/s.sh"'
check DENY  $'tee s.sh <<EOF\ngh pr merge 1\nEOF\n. s.sh'
check DENY  'echo "x; gh issue create --title y" > s.sh; bash s.sh'
check DENY  $'cat > s.sh <<EOF\ngit push\nEOF\nsh s.sh'
check ALLOW $'cat > notes.md <<EOF\ngh issue create --title x\nEOF\nwc -l other.md'
check ALLOW 'echo "run gh issue create now" > /dev/null; echo done > /dev/null'
# ── aws: what sends nothing to AWS, read from awscli's generatecliskeleton.py (2026-11-02) ──
check ALLOW 'aws cognito-idp create-user-pool help'
check ALLOW 'aws ec2 terminate-instances help'
check ALLOW 'aws s3 rm help'
check ALLOW 'aws cognito-idp update-user-pool --generate-cli-skeleton'
check ALLOW 'aws cognito-idp update-user-pool --generate-cli-skeleton input'
check ALLOW 'aws cognito-idp update-user-pool --generate-cli-skeleton=output'
check ALLOW 'aws --region us-east-1 dynamodb put-item --generate-cli-skeleton yaml-input'
check DENY  'aws s3 rm s3://b/k --profile help'                             # a value, not the help page
check DENY  'aws ec2 terminate-instances --instance-ids help'
check DENY  'aws ec2 terminate-instances --instance-ids i-1 help'
check DENY  'aws ec2 terminate-instances help --instance-ids i-1'
check DENY  'aws ec2 terminate-instances --instance-ids i-1 --description "--generate-cli-skeleton"'
check DENY  'aws s3 cp f s3://b/k'

# ── a parser that dies has read nothing: the raw split still decides, and errs toward denying ──
broken=$(mktemp -d)
mkdir "$broken/lib"
cp "$HOOK" "$broken/destructive-op-gate.sh"
printf 'this is not python\n' > "$broken/lib/shell_segments.py"
real_hook=$HOOK
HOOK="$broken/destructive-op-gate.sh"
check DENY  'gh issue create --title x'
check DENY  'aws s3 rm s3://b/k'
check DENY  'git clean -fd'
check DENY  'echo "run gh issue create yourself"'
check ALLOW 'gh pr view 1'
check ALLOW 'ls -l'
check DENY  "gh issue 'create' --title x"
check DENY  "a''ws s3 rm s3://b/k"
check DENY  "git cl''ean -fd"
check ALLOW "printf \$'a\\tb\\n'"
check DENY  'aws s3 cp ./x s3://b/k 2>/dev/null'
check DENY  'aws s3 sync ./d s3://b/d 2>&1'
check DENY  'gh 2>/dev/null issue create -t x'
check ALLOW 'aws cloudfront create-cache-policy help 2>/dev/null'
check ALLOW 'aws s3 cp s3://b/k ./x 2>&1'
check DENY  'aws s3 cp ./x s3://b/k > $(mktemp -d)/a'
check DENY  'aws &>/dev/null s3 rm s3://b/k'
check DENY  'aws >| out s3 rm s3://b/k'
check DENY  'aws 2> out s3 rm s3://b/k'
check DENY  'aws s3 cp ./x s3://b/k >> out'
check DENY  'aws s3 cp ./x s3://b/k <<< x'
HOOK=$real_hook
rm -rf "$broken"

# ── a redirection is no word of the command, wherever it sits (2026-11-03) ──
for r in '2>/dev/null' '2>&1' '>out' '> out' '>> "a b.txt"' '&>/dev/null' '&>>log' '>&2' '</dev/null' '< in' '<&3' '<> f' '<<< x' '>| out'; do
  check DENY  "aws s3 cp ./x s3://b/k $r"
  check DENY  "aws s3 sync ./d s3://b/d $r"
  check DENY  "aws $r s3 rm s3://b/k"
  check DENY  "aws $r ec2 terminate-instances --instance-ids i-1"
  check DENY  "$r aws ec2 terminate-instances --instance-ids i-1"
  check DENY  "gh $r issue create -t x"
  check DENY  "gh issue $r create -t x"
  check DENY  "$r gh issue create -t x"
  check DENY  "git $r tag v1"
  check DENY  "git $r push origin main"
  check DENY  "git $r clean -f"
  check DENY  "$r git push origin main"
  check DENY  "npm $r publish"
  check DENY  "$r npm publish"
  check DENY  "$r bash -c \"gh issue create -t x\""
  check DENY  "(git tag v1) $r"
  check DENY  "(git push) $r"
  check DENY  "(npm publish) $r"
  check ALLOW "aws cloudfront create-cache-policy help $r"
  check ALLOW "(aws cloudfront create-cache-policy help) $r"
  check ALLOW "aws s3 cp s3://b/k ./x $r"
  check ALLOW "aws s3 sync s3://b/d ./d $r"
  check ALLOW "aws $r s3 ls s3://b"
  check ALLOW "gh pr view 5 $r"
  check ALLOW "gh $r issue list"
  check ALLOW "git $r status"
  check ALLOW "npm $r view x"
done
check DENY  'aws s3 cp ./x s3://b/k>out'
check DENY  'aws s3 cp ./x s3://b/k > $(mktemp -d)/a'
check DENY  'aws > $(mktemp -d)/a s3 rm s3://b/k'
check ALLOW 'aws s3 ls s3://b >| out | head -5'
check DENY  'aws s3 cp ./x s3://b/k > a\ b'
check DENY  "aws s3 cp ./x s3://b/k > 'a b'"
check DENY  'aws s3 cp ./x s3://b/k > "a\" b"'
check DENY  'aws s3 cp ./x s3://b/k > `mktemp -d`/a'
check DENY  'aws s3 cp ./x s3://b/k > `printf a b`/c'
check DENY  'aws s3 cp ./x s3://b/k > $(echo $(mktemp -d))/a'
check DENY  'aws s3 cp ./x s3://b/k > $(printf "%s" "a b")/c'
check DENY  'aws s3 cp ./x s3://b/k >out</dev/null'
check DENY  'aws s3 cp ./x s3://b/k >a&>b'
check DENY  'aws s3 cp ./x s3://b/k > $( (mktemp -d) )/a'
check DENY  '(2>&1 git tag v1)'
check DENY  'aws ec2 terminate-instances help2>x'
check DENY  'aws ec2 terminate-instances 2 >x help'
check DENY  "env aws s3 cp 'a > b' s3://b/k"
check DENY  'env aws s3 cp `a > b` s3://b/k'
check DENY  'env aws s3 cp "a\" > b" s3://b/k'
check DENY  'env aws s3 cp a\> s3://b/k'
check ALLOW 'aws cloudfront create-cache-policy help 12>x'
check ALLOW "env aws s3 cp s3://b/k 'a > b'"
check ALLOW 'env aws s3 cp s3://b/k `a > b`'
check ALLOW 'env aws s3 cp s3://b/k a\>'

# ── a shell runs its here-string; any other command only reads it (2026-11-03) ──
for v in 'git tag v1' 'git push origin main' 'npm publish' 'git clean -f' 'gh issue create -t x' 'aws s3 rm s3://b/k'; do
  check DENY  "bash <<< \"$v\""
  check DENY  "bash <<<\"$v\""
  check DENY  "sh <<<'$v'"
  check DENY  "bash -s <<< \"$v\""
  check DENY  "command bash <<< \"$v\""
  check DENY  "env FOO=1 bash <<< \"$v\""
  check DENY  "bash 2>&1 <<< \"$v\""
  check DENY  "(bash <<< \"$v\") 2>&1"
  check ALLOW "cat <<< \"$v\""
  check ALLOW "grep x <<< \"$v\""
done
check DENY  "xargs sh -c '{}' <<< \"git tag v1\""
check DENY  'ssh host <<< "git tag v1"'
check ALLOW 'xargs echo <<< "git tag v1"'
check ALLOW 'bash -c "echo hi" > "git tag v1"'
check ALLOW 'bash <<< "echo hi" > "gh issue create -t x"'
check ALLOW 'git <<< tag'
check ALLOW 'git status <<< "tag v1"'
check ALLOW 'npm <<< publish'
check ALLOW 'bash <<< "echo hi"'
check ALLOW 'bash <<< "git status"'

# ── a flag's value is no argument of the command (2026-11-03) ──
for f in '--acl private' '--profile p' '--region=r' "--exclude '*.tmp'" '--storage-class STANDARD_IA' '--recursive --acl private' '--quiet' '--newflag v'; do
  check DENY  "aws s3 cp ./x s3://b/k $f"
  check DENY  "aws s3 cp $f ./x s3://b/k"
  check DENY  "aws s3 cp ./x $f s3://b/k"
  check DENY  "aws s3 sync ./d s3://b/d $f"
  check DENY  "aws s3 sync $f ./d s3://b/d"
  check DENY  "aws s3 cp s3://a/k s3://b/k $f"
  check DENY  "aws s3 cp s3://a/k $f s3://b/k"
  check ALLOW "aws s3 cp s3://b/k ./x $f"
  check ALLOW "aws s3 cp $f s3://b/k ./x"
  check ALLOW "aws s3 cp s3://b/k $f ./x"
  check ALLOW "aws s3 sync s3://b/d ./d $f"
  check ALLOW "aws s3 sync $f s3://b/d ./d"
done
# awscli's own list: customizations/s3/subcommands.py, s3/syncstrategy/, data/cli.json
for b in --dryrun --follow-symlinks --force --force-glacier-transfer --human-readable --ignore-glacier-warnings --no-follow-symlinks --no-guess-mime-type --no-overwrite --no-progress --only-show-errors --progress-multiline --quiet --recursive --summarize --validate-same-s3-paths --delete --exact-timestamps --size-only --debug --cli-auto-prompt --no-cli-auto-prompt --no-cli-pager --no-paginate --no-sign-request --no-verify-ssl; do
  check DENY  "aws s3 cp $b ./x s3://b/k"
  check ALLOW "aws s3 cp $b s3://b/k ./x"
done
check DENY  'aws s3 cp ./x --newbool s3://b/k'
check DENY  'aws s3 cp - s3://b/k'
check DENY  'aws s3 cp - --acl private s3://b/k'
check DENY  'env aws s3 cp ./x s3://b/k --exclude "a b"'
check DENY  'aws s3 cp ./x s3://b/k 2>/dev/null --acl private'
check ALLOW 'aws s3 cp s3://b/k -'
check ALLOW 'aws s3 cp s3://b/k - --profile p'
check ALLOW 'env aws s3 cp s3://b/k ./x --exclude "a b"'
check ALLOW 'aws s3 cp help'
for v in 'issue -R o/r create -t x' 'issue --repo o/r create -t x' 'issue --repo=o/r create -t x' 'pr -R o/r merge 5' 'pr --repo o/r close 5' 'release -R o/r delete v1' 'run -R o/r cancel 1' 'workflow -R o/r disable x' 'label -R o/r create x' 'secret -R o/r set x' 'variable -R o/r delete x' 'cache -R o/r delete 1' 'discussion -R o/r create'; do
  check DENY  "gh $v"
done
check ALLOW 'gh issue -R o/r list'
check ALLOW 'gh pr --repo o/r view 5'
check ALLOW 'gh issue -R create list'
check ALLOW 'gh run -R o/r view 1'
check ALLOW 'gh issue -R o/r create --help'
check ALLOW 'gh pr list -R delete'
check DENY  'aws --cli-error-format json s3 rm s3://b/k'
check DENY  'aws --cli-error-format json ec2 terminate-instances --instance-ids i-1'
check ALLOW 'aws --cli-error-format json s3 ls'
check ALLOW 'aws --cli-error-format json ec2 describe-instances'

# ── a written file is code when the command runs it, and data when it only reads it (2026-11-03) ──
for v in 'git tag v1' 'git push origin main' 'npm publish' 'gh issue create -t x' 'aws s3 rm s3://b/k'; do
  body=$'cat > s.sh <<\'EOF\'\n'"$v"$'\nEOF\n'
  for run in 'bash s.sh' 'sh s.sh' 'bash -x s.sh' 'source s.sh' '. ./s.sh' 'chmod +x s.sh; ./s.sh' 's.sh' 'bash < s.sh' 'cat s.sh | bash' 'sudo bash s.sh' 'timeout 5 bash s.sh' 'xargs bash s.sh' 'bash -c "bash s.sh"' 'ssh host < s.sh' 'cd /tmp; bash /tmp/s.sh' \
             "ssh host 'sudo bash' < s.sh" "ssh host 'cd repo && bash' < s.sh" "ssh host 'sudo -u root bash' < s.sh" \
             'ssh host bash -s < s.sh' "ssh host 'env X=1 bash' < s.sh"; do
    check DENY  "$body$run"
  done
  # an interpreter or a syntax check reads a file without running it as shell (8t, 2026-11-05)
  for read in "ssh host 'node -' < s.sh" 'bash -n s.sh' "ssh host 'python3 -' < s.sh"; do
    check ALLOW "$body$read"
  done
  note=$'cat > x.md <<\'EOF\'\nThe spelling `'"$v"$'` is refused.\nEOF\n'
  for read in 'q file p --body-file x.md' 'wc -l x.md' 'grep -c y x.md' 'jq . x.md' 'npx prettier --check x.md' 'rm x.md' 'cat x.md' 'cat x.md | grep y' 'vault-curl /x --data-binary @x.md' 'node x.md' 'python3 x.md'; do
    check ALLOW "$note$read"
  done
  check DENY  $'W=/tmp/w; cat > "$W/s.sh" <<\'EOF\'\n'"$v"$'\nEOF\nbash "$W/s.sh"'
  check ALLOW $'W=/tmp/w; cat > "$W/x.md" <<\'EOF\'\nThe spelling `'"$v"$'` is refused.\nEOF\nq --body-file "$W/x.md"'
done
check DENY  'echo "x gh issue create -t y" > s.sh; bash s.sh'
check ALLOW 'echo "x gh issue create -t y" > x.md; q --body-file x.md'
check ALLOW $'cat > x.md <<\'EOF\'\ngit tag v1\nEOF\nbash other.sh'
# a written name is matched whole, and an empty one matches nothing (8h, 2026-11-05)
check ALLOW $'cat > a <<\'EOF\'\ngit tag v1\nEOF\nbash x.sh'
check ALLOW $'cat > s <<\'EOF\'\ngit tag v1\nEOF\nbash s.sh'
check ALLOW $'cat > sh <<\'EOF\'\ngit tag v1\nEOF\nbash x.sh'
check ALLOW $'cat > out/ <<\'EOF\'\ngit tag v1\nEOF\nbash "x.sh"'
check ALLOW $'cat > /tmp/w/build <<\'EOF\'\ngit tag v1\nEOF\nbash ./build/run.sh'
check DENY  $'cat > s.sh <<\'EOF\'\ngit tag v1\nEOF\neval "$(cat s.sh)"'
check DENY  $'cat > s.sh <<\'EOF\'\ngit tag v1\nEOF\nbash <s.sh'
check DENY  $'cat > s.sh <<\'EOF\'\ngit tag v1\nEOF\nbash "./s.sh"'
check ALLOW $'cat > /dev/null <<\'EOF\'\ngit tag v1\nEOF\nbash other.sh 2>/dev/null'
check ALLOW $'cat > s.sh <<\'EOF\'\ngit tag v1\nEOF\ncat s.sh | grep y; echo z | bash'
check DENY  $'cat > /tmp/w/s.sh <<\'EOF\'\ngit tag v1\nEOF\ncd /tmp/w; bash s.sh'
check DENY  $'cat > /tmp/w/s.sh <<\'EOF\'\ngit tag v1\nEOF\ncd /tmp/w; ./s.sh'
check DENY  $'cat > "s.sh" <<\'EOF\'\ngit tag v1\nEOF\nbash s.sh'
check DENY  $'tee s.sh <<\'EOF\'\ngit tag v1\nEOF\n. s.sh'
check DENY  'env aws s3 cp "a > b" s3://b/k'
check DENY  'aws ec2 terminate-instances help 2>&1 --instance-ids i-1'
check ALLOW 'aws cloudfront create-cache-policy help>out'
check ALLOW 'aws cloudfront create-cache-policy help 2>&1 | head -50'
check ALLOW 'env aws s3 cp s3://b/k "a > b"'
check ALLOW 'git log > tag'
check ALLOW 'git status 2> push'
check ALLOW 'npm view x > publish'
check ALLOW 'echo "aws s3 rm s3://b/k" > note.txt'

# ── a reserved verb behind shell syntax, `xargs`, or `find -exec` (2026-11-02, D43) ──
for verb in 'git push origin main' 'git -C /tmp/x push' 'git tag v1' 'git -C /tmp/x tag v1' 'npm publish' 'npm --prefix /tmp/x publish' 'git clean -fd'; do
  check DENY "for d in a; do $verb; done"
  check DENY "if true; then $verb; fi"
  check DENY "if true; then :; else $verb; fi"
  check DENY "while true; do $verb; break; done"
  check DENY "! $verb"
  check DENY "f() { $verb; }; f"
  check DENY "case x in x) $verb;; esac"
  check DENY "xargs $verb"
  check DENY "find . -exec $verb \\;"
done
check DENY  'parallel git push ::: a'
check DENY  'parallel -j 4 git -C /tmp/x push ::: a'
check DENY  'watch git push'
check DENY  'watch -n 5 git -C /tmp/x push'
check DENY  'watch -d git push'
check DENY  'ssh host git push'
check DENY  "ssh host 'git push'"
check DENY  'ssh host "cd /tmp/x && git push"'
check DENY  'ssh -i k -p 22 host git -C /tmp/x push'
check DENY  'ssh host npm publish'
check ALLOW 'ssh host git log -1'
check ALLOW "ssh host 'git -C /tmp/x status && git log --grep push'"
check ALLOW 'ssh -o BatchMode=yes host'
check ALLOW 'ssh git push'
check ALLOW 'watch git status'
check ALLOW 'parallel echo git push ::: a'
check DENY  'xargs sudo git push'
check DENY  'xargs -n 1 env A=1 git -C /tmp/x push'
check DENY  'find . -exec nice git push \\;'
check ALLOW 'for d in a; do git log -1; done'
check ALLOW 'if git status; then echo push; fi'
check ALLOW 'if true; then echo "git push"; fi'
check ALLOW 'echo do git push'
check ALLOW 'xargs echo git push'
check ALLOW "xargs grep -l 'git push'"
check ALLOW 'find . -name git -exec echo push \\;'
check ALLOW "find . -name 'git push'"
# ── the push refusal names the local equivalent (2026-11-02, D43) ──
jq -nc --arg c 'git -C /tmp/x push /tmp/y main' '{tool_name:"Bash", tool_input:{command:$c}}' | bash "$HOOK" 2>&1 >/dev/null | grep -q 'fetch <src> <ref>:<ref>'
[ "${PIPESTATUS[2]}" -eq 0 ] && ((++pass)) || { ((++fail)); echo "FAIL  the push refusal must name the fetch"; }

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
