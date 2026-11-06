#!/usr/bin/env bash
# Regression tests for ../git-commit-gate.sh — each case is a PreToolUse Bash
# payload; the verdict is the exit code (0 = ALLOW, 2 = DENY). A cwd without
# the opt-in marker is the default; MARKED points at one that carries it.
#
# Centerpiece (2026-09-06): the verb inside a heredoc body or a quoted string
# is data. The substring test alone blocked two vault writes whose payload
# mentioned the verb in prose; the gate now reads the command with the shared
# parser (../lib/shell_segments.py) and keeps the substring verdict only when
# the parser is unavailable.

set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/git-commit-gate.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }

PLAIN=$(mktemp -d); MARKED=$(mktemp -d); mkdir -p "$MARKED/.claude"; : > "$MARKED/.claude/git-commit-allowed"
trap 'rm -rf "$PLAIN" "$MARKED"' EXIT

pass=0 fail=0
check() {
  local want="$1" cmd="$2" cwd="${3:-$PLAIN}"
  jq -nc --arg c "$cmd" --arg d "$cwd" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$d}' | bash "$HOOK" >/dev/null 2>&1
  local rc=$?
  local got=ALLOW; [ "$rc" -eq 2 ] && got=DENY
  if [ "$got" = "$want" ]; then
    ((++pass))
  else
    ((++fail)); printf 'FAIL  want=%-5s got=%-5s  %s\n' "$want" "$got" "${cmd//$'\n'/⏎}"
  fi
}
V='git commit'

# ── the verb, in every placement that executes it ──
check DENY  "$V -m x"
check DENY  "cd /tmp/foo && $V -am x"
check DENY  "git add . ; $V -m x"
check DENY  "git -C /tmp/foo commit -m x"
check DENY  "git -c user.name=x commit -m x"
check DENY  "command $V -m x"
check DENY  "GIT_AUTHOR_DATE=2026-01-01 $V -m x"
check DENY  "/usr/bin/$V -m x"
check DENY  "echo \$($V -m x)"
check DENY  "bash -c '$V -m x'"
check DENY  "eval \"$V -m x\""
check DENY  $'bash <<\'EOF\'\n'"$V"$' -m x\nEOF'
check DENY  $'cat <<EOF\n$('"$V"$' -m x)\nEOF'
# ── the words as data ──
check ALLOW $'cat > f <<\'EOF\'\nprose about '"$V"$' here\nEOF'
check ALLOW $'cat <<\'EOF\'\n$('"$V"$')\nEOF'
check ALLOW "jq --arg s \"run $V later\" '{s:\$s}'"
check ALLOW "echo \"$V\""
check ALLOW "git log --grep '$V'"
check ALLOW "git-committer-name foo"
check ALLOW "git commit-tree HEAD^{tree} -m x"
check ALLOW "printf '%s\\n' '$V'"
check ALLOW "git status && git log -1"
check ALLOW "vault-put x --append f"
# a substitution inside single quotes never runs; in double quotes or a heredoc it does (8f, 2026-11-05)
check ALLOW "echo 'a \`$V -m x\` b'"
check ALLOW "echo '\$($V -m x)'"
check ALLOW "sed -i 's/x \`git pull\` y/z/' README.md"
check DENY  "echo \"it's \$($V -m x)\""
check DENY  "echo 'a' \$($V -m x) 'b'"
check DENY  "echo \\' \$($V -m x) \\'"
check DENY  "echo \$'a\\'b' \$($V -m x)"
check ALLOW "echo \$'see \$($V -m x) later'"
# an apostrophe in a comment is a character, not a quote (a side note on 8f)
check DENY  $'# don\'t retry\n'"$V"$' -m x'
check DENY  $'# don\'t retry\necho $('"$V"$' -m x)'
check DENY  $'ls # don\'t retry\necho $('"$V"$' -m x) # it\'s fine'
check ALLOW $'# run $('"$V"$' -m x) later\nls'
check DENY  $'ls # see <<EOF\n'"$V"$' -m x\nEOF'
check DENY  "echo a#b && $V -m x"
check DENY  "echo \${#x} && $V -m x"
check DENY  "echo \"a \$($V -m 'x') b\""
check DENY  $'cat <<EOF\n\'$('"$V"$' -m x)\'\nEOF'
# ── the opt-in marker ──
check ALLOW "$V -m x" "$MARKED"
check ALLOW "cd sub && $V -m x" "$MARKED"
# ── the marker belongs to the repo the commit runs in, not the session cwd (2026-09-06) ──
check ALLOW "cd $MARKED && $V -m x"
check ALLOW "git -C $MARKED commit -m x"
check ALLOW "(cd $MARKED && git add -A && $V -q -F msg)"
check ALLOW "cd $MARKED && git add . ; $V -m x"
check DENY  "cd $PLAIN && $V -m x" "$MARKED"
check DENY  "git -C $PLAIN commit -m x" "$MARKED"
check DENY  "cd $MARKED && $V -m x && cd $PLAIN && $V -m y"
# ── a variable the command assigns is followed (2026-11-02) ──
check ALLOW "R=$MARKED; cd \"\$R\" && $V -m x"
check ALLOW "R=$MARKED && git -C \"\$R\" commit -m x"
check ALLOW "export R=$MARKED; git -C \"\$R\" commit -m x"
check ALLOW "W=$MARKED; R=\"\$W/sub\"; git -C \"\${R}\" commit -m x"
check ALLOW "cd \"\$PWD/sub\" && $V -m x" "$MARKED"
check DENY  "R=$PLAIN; cd \"\$R\" && $V -m x" "$MARKED"
check DENY  "R=$PLAIN; git -C \"\$R\" commit -m x" "$MARKED"
# a value it cannot read forgets the name; a prefix assignment is not in force for its own command's words
check DENY  "R=$MARKED; R=\$(other); git -C \"\$R\" commit -m x"
check DENY  "R=$MARKED git -C \"\$R\" commit -m x"
# ── a site that stays unknown is denied, wherever the session started (2026-11-02) ──
check DENY  "cd \"\$W\" && $V -m x" "$MARKED"
check DENY  "cd \"\$W\" && $V -m x"
check DENY  "cd \"\$W\" && cd sub && $V -m x" "$MARKED"
check DENY  "git -C \"\$WT\" commit -m x" "$MARKED"
check DENY  "cd $PLAIN && git -C \"\$WT\" commit -m x" "$MARKED"
check DENY  "cd $MARKED && git -C \"\$WT\" commit -m x"
# ── a scratch repository needs no marker: `git init` in this command, under the temp directory (2026-11-02) ──
check ALLOW "W=\$(mktemp -d) && R=\"\$W/repo\" && git -C \"\$R\" init -q && git -C \"\$R\" commit -qm one"
check ALLOW "D=\$(mktemp -d); cd \"\$D\" && git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -q -m one"
check ALLOW "WORK=\$(mktemp -d); ( command cd \"\$WORK\" && git init -q && git -c user.name=t commit -q --allow-empty -m zero )"
check ALLOW "W=\"\$(mktemp -d)\"; git init -q \"\$W/r\" && git -C \"\$W/r\" commit -qm one"
check ALLOW "W=\$(mktemp -d)/r; git init -q -b main \"\$W\" && cd \"\$W\" && $V -m one"
check ALLOW "S=\$(mktemp -d); W=\$(mktemp -d -p \"\$S\"); cd \"\$W\" && git init -q && $V -m one"
check ALLOW "W=\$(mktemp -d -t gate.XXXXXX); cd \"\$W\" && git init -q && $V -m one"
check ALLOW "W=\$(mktemp -d); git init -q \"\$W\"; cd \"\$W/sub\" && $V -m one"
check ALLOW "cd /tmp/gate-test-absent && git init -q && $V -m one"
check ALLOW "W=\$(mktemp -d) && git clone -q --no-hardlinks /src/base \"\$W/clone\" && git -C \"\$W/clone\" commit -qam x"
check ALLOW "W=\$(mktemp -d) && git clone -q --depth 1 -b main \"\$W/src.git\" \"\$W/dev\" && cd \"\$W/dev\" && $V -m x"
# ...or on disk
SCRATCH=$(mktemp -d); git -C "$SCRATCH" init -q
check ALLOW "git -C $SCRATCH commit -m x"
check ALLOW "cd $SCRATCH/sub && $V -m x"
check ALLOW "W=$SCRATCH; cd \"\$W\" && $V -m x"
# ...and nothing else under the temp directory, and nothing outside it
OUTSIDE=$(mktemp -d /var/tmp/gate-test.XXXXXX); git -C "$OUTSIDE" init -q
git -C "$OUTSIDE" -c user.name=t -c user.email=t@t commit -q --allow-empty -m zero
LINKED=$(mktemp -d); rmdir "$LINKED"; git -C "$OUTSIDE" worktree add -q "$LINKED" -b gate-test 2>/dev/null
FAR=$(mktemp -d /var/tmp/gate-wt.XXXXXX); rmdir "$FAR"; git -C "$OUTSIDE" worktree add -q "$FAR" -b gate-far 2>/dev/null
SUB=$(mktemp -d /var/tmp/gate-sub.XXXXXX); echo 'gitdir: ../.git/modules/x' > "$SUB/.git"
CACHE=$(mktemp -d /var/tmp/gate-cache.XXXXXX); git -C "$CACHE" init -q
trap 'rm -rf "$PLAIN" "$MARKED" "$SCRATCH" "$OUTSIDE" "$LINKED" "$FAR" "$SUB" "$CACHE"' EXIT
XDG_CACHE_HOME="$CACHE" check ALLOW "git -C $CACHE commit -m x"
XDG_CACHE_HOME="$CACHE" check ALLOW "git -C $CACHE/r init -q && git -C $CACHE/r commit -m x"
XDG_CACHE_HOME="$CACHE" check ALLOW "W=\$(mktemp -d -p $CACHE); cd \"\$W\" && git init -q && $V -m one"
TMPDIR="$CACHE" check ALLOW "git -C $CACHE commit -m x"
check ALLOW "cd $OUTSIDE && W=\$(mktemp -d -t gate.XXXXXX); cd \"\$W\" && git init -q && $V -m one"
check DENY  "git init -q /tmpx/r && git -C /tmpx/r commit -m x"
check DENY  "git -C $CACHE commit -m x"
check DENY  "git init -q /tmp/gate-x && git -C /tmp/gate-xy commit -m x"
check DENY  "W=\$(mktemp -d -p $OUTSIDE); cd \"\$W\" && git init -q && $V -m one"
check DENY  "W=\$(mktemp -d $OUTSIDE/x.XXXXXX); cd \"\$W\" && git init -q && $V -m one"
check DENY  "cd $OUTSIDE && W=\$(mktemp -d x.XXXXXX); cd \"\$W\" && git init -q && $V -m one"
check DENY  "git -C $OUTSIDE init -q && git -C $OUTSIDE commit -m x"
check DENY  "W=$OUTSIDE; git init \"\$W\" && git -C \"\$W\" commit -m x"
check DENY  "git clone -q /src/base $OUTSIDE/clone && git -C $OUTSIDE/clone commit -m x"
check DENY  "W=\$(mktemp -d); git clone -q /src/base && git -C \"\$W\" commit -m x"
check DENY  "W=\$(mktemp -d); git -C \"\$W\" commit -m x"
check DENY  "W=\$(mktemp -d); git -C \"\$W\" commit -m x; git -C \"\$W\" init -q"
check DENY  "W=\$(mktemp -d); git init -q \"\$W\"; $V -m x"
check DENY  "git -C $SUB commit -m x"
check DENY  "git -C $OUTSIDE worktree list && git -C $OUTSIDE commit -m x"
check DENY  "git -C $OUTSIDE worktree remove /var/tmp/gate-absent && git -C /var/tmp/gate-absent commit -m x"
# ── a linked worktree needs no marker, anywhere, and its main checkout still does (2026-11-02) ──
check ALLOW "git -C $LINKED commit -m x"
check ALLOW "git -C $FAR commit -m x"
check ALLOW "cd $FAR/sub && $V -m x"
check ALLOW "W=$LINKED; cd \"\$W\" && $V -m x"
check ALLOW "W=\$(mktemp -d)/wt; git -C $OUTSIDE worktree add \"\$W\" -b t && git -C \"\$W\" commit -m x"
check ALLOW "git -C $OUTSIDE worktree add -q -b t /var/tmp/gate-absent HEAD && git -C /var/tmp/gate-absent commit -m x"
check DENY  "git -C $OUTSIDE commit -m x"
check DENY  "git -C $OUTSIDE worktree add -b t /var/tmp/gate-absent && git -C /var/tmp/gate-absent-2 commit -m x"
TMPDIR="$OUTSIDE/tmp" check DENY "git -C $OUTSIDE/tmp/fixture commit -m x"
# ── the other verbs that make a commit are commits (8e, 2026-11-05) ──
for v in am merge cherry-pick revert rebase pull; do
  check DENY  "git $v x"
  check DENY  "git -C $OUTSIDE $v x"
  check DENY  "cd $OUTSIDE && git $v x"
  check ALLOW "git -C $LINKED $v x"
  check ALLOW "git $v x" "$MARKED"
done
check DENY  "git merge --no-ff topic"
check DENY  "git merge --continue"
check DENY  "git rebase --continue"
check DENY  "git cherry-pick --continue"
check DENY  "git am --continue"
check DENY  "git pull --rebase"
check ALLOW "git merge --ff-only origin/main"
check ALLOW "git pull --ff-only"
check ALLOW "git -C $OUTSIDE pull --ff-only origin main"
check ALLOW "git merge --squash topic"
check ALLOW "git merge --no-commit topic"
check ALLOW "git merge --abort"
check ALLOW "git rebase --abort"
check ALLOW "git rebase --quit"
check ALLOW "git cherry-pick -n abc"
check ALLOW "git cherry-pick --abort"
check ALLOW "git revert --no-commit abc"
check ALLOW "git am --abort"
check ALLOW "git merge-base HEAD main"
check ALLOW "git merge-base --is-ancestor HEAD main"
check ALLOW "git log --grep 'git rebase x'"
check ALLOW "echo 'git merge x' > notes"
out=$(jq -nc --arg c "git -C $OUTSIDE rebase main" '{tool_name:"Bash", tool_input:{command:$c}, cwd:"/"}' | bash "$HOOK" 2>&1 >/dev/null)
[[ "$out" == "git rebase denied"* ]] && ((++pass)) || { ((++fail)); echo "FAIL  the denial must name the verb: $out"; }
# ── a verb behind shell syntax, `xargs`, or `find -exec` is a verb (2026-11-02) ──
check DENY  "for d in a b; do $V -m x; done"
check DENY  "if true; then $V -m x; fi"
check DENY  "if true; then :; else $V -m x; fi"
check DENY  "if a; then b; elif $V -m x; then c; fi"
check DENY  "if $V -m x; then b; fi"
check DENY  "while true; do git -C /tmp/foo commit -m x; break; done"
check DENY  "until $V -m x; do sleep 1; done"
check DENY  "! $V -m x"
check DENY  "if ! $V -m x; then b; fi"
check DENY  "then { $V -m x; }"
check DENY  "for d in a; do command $V -m x; done"
check DENY  "for d in a; do FOO=1 $V -m x; done"
check DENY  "f() { $V -m x; }; f"
check DENY  "f () { $V -m x; }; f"
check DENY  "function f { $V -m x; }; f"
check DENY  "case x in x) $V -m x;; esac"
check DENY  "case x in a) b;; c|d) $V -m x;; esac"
check DENY  "xargs $V -m x"
check DENY  "xargs -n 1 -I {} git -C {} commit -m x"
check DENY  "parallel $V -m x ::: a"
check DENY  "watch -n 5 $V -m x"
check DENY  "xargs command $V -m x"
check DENY  "xargs env A=1 $V -m x"
check DENY  "find . -exec sudo $V -m x \\;"
check DENY  "find . -exec $V -m x \\;"
check DENY  "find . -name a -execdir $V -m x +"
check ALLOW "for d in a; do $V -m x; done" "$MARKED"
check ALLOW "for d in a; do git log -1; done"
check ALLOW "if git status; then echo commit; fi"
check ALLOW "if true; then echo \"$V\"; fi"
check ALLOW "echo do $V"
check ALLOW "xargs echo $V"
check ALLOW "xargs grep -l '$V'"
check ALLOW "find . -name git -exec echo commit \\;"
check ALLOW "find . -name '$V'"
# a commit over ssh: no marker on another host can be read from here (D44)
check DENY  "ssh host $V -m x"
check DENY  "ssh host $V -m x" "$MARKED"
check DENY  "ssh host 'cd /tmp/x && $V -m x'"
check DENY  "ssh -i k -p 22 host git -C $MARKED commit -m x"
check ALLOW "ssh host git log -1"
check ALLOW "ssh host 'echo $V'"
check ALLOW "ssh -o BatchMode=yes host"
# a value set behind a keyword, a loop variable, and `read` may be in force: unknown
check DENY  "R=$MARKED; if a; then R=$PLAIN; fi; git -C \"\$R\" commit -m x"
check DENY  "R=$MARKED; for R in $PLAIN; do :; done; git -C \"\$R\" commit -m x"
check DENY  "R=$MARKED; read R; git -C \"\$R\" commit -m x"
check DENY  "R=$MARKED; unset R; git -C \"\$R\" commit -m x"
check DENY  "for d in a b; do git -C \"\$d\" commit -m x; done" "$MARKED"
# ── a subshell's cd ends with it (2026-11-02) ──
check DENY  "(cd $MARKED && true); $V -m x"
check ALLOW "(cd $PLAIN && true); $V -m x" "$MARKED"
check ALLOW "cd $MARKED && (cd $PLAIN && true) && $V -m x"
check DENY  "cd $MARKED && (cd $PLAIN && $V -m x)"
check ALLOW "(cd $MARKED && (cd $PLAIN && true); $V -m x)"
check ALLOW "R=\$(cd $PLAIN && pwd); $V -m x" "$MARKED"
check ALLOW "echo '('; cd $MARKED; echo ')'; $V -m x"
check ALLOW "echo \\(; cd $MARKED; echo \\); $V -m x"
# ── a heredoc a shell receives, wherever the shell sits (2026-11-02) ──
check DENY  $'true && bash <<\'EOF\'\n'"$V"$' -m x\nEOF'
check DENY  $'cat <<\'EOF\' | bash\n'"$V"$' -m x\nEOF'
check DENY  $'cat > s.sh <<\'EOF\'\n'"$V"$' -m x\nEOF\nbash s.sh'
# ── the marker is the person's to write (D47): what stays open first ──
M='.claude/git-commit-allowed'
check ALLOW "find ~/Open -maxdepth 3 -path '*/$M'" "$OUTSIDE"
check ALLOW "test -f $M && echo marked" "$OUTSIDE"
check ALLOW "command ls $M" "$OUTSIDE"
check ALLOW "cat $M" "$OUTSIDE"
check ALLOW "git log -1 -- $M" "$OUTSIDE"
check ALLOW "git grep -n 'git-commit-allowed'" "$OUTSIDE"
check ALLOW "echo 'touch $M'" "$OUTSIDE"
check ALLOW $'cat > note.md <<\'EOF\'\ntouch '"$M"$'\nEOF' "$OUTSIDE"
check ALLOW "D=\$(mktemp -d); mkdir -p \"\$D/.claude\"; : > \"\$D/$M\"" "$OUTSIDE"
check ALLOW "touch /tmp/gate-fixture/$M" "$OUTSIDE"
check ALLOW "touch $PLAIN/$M" "$OUTSIDE"
check ALLOW "touch $M" "$PLAIN"
XDG_CACHE_HOME="$CACHE" check ALLOW "touch $CACHE/$M" "$OUTSIDE"
check ALLOW "touch .claude/other-file" "$OUTSIDE"
check ALLOW "touch not.claude/git-commit-allowed" "$OUTSIDE"
# ...and what is refused
check DENY  "touch $M" "$OUTSIDE"
check DENY  ": > $M" "$OUTSIDE"
check DENY  "echo x > $M" "$OUTSIDE"
check DENY  "echo x >> $OUTSIDE/$M"
check DENY  "echo x >| $OUTSIDE/$M"
check DENY  "echo x >|$M" "$OUTSIDE"
check DENY  "printf x | tee $M" "$OUTSIDE"
check DENY  "cp /tmp/a $M" "$OUTSIDE"
check DENY  "mv /tmp/a $M" "$OUTSIDE"
check DENY  "ln -s /tmp/a $M" "$OUTSIDE"
check DENY  "rm $M" "$OUTSIDE"
check DENY  "sed -i s/a/b/ $M" "$OUTSIDE"
check DENY  "cd .claude && touch git-commit-allowed" "$OUTSIDE"
check DENY  "A=$OUTSIDE/$M; touch \"\$A\""
check DENY  "touch \"\$D/$M\"" "$OUTSIDE"
check DENY  "touch \"\$D/git-commit-allowed\"" "$OUTSIDE"
check DENY  "cd \"\$D\" && touch git-commit-allowed" "$OUTSIDE"
check DENY  "for d in a; do touch $M; done" "$OUTSIDE"
check DENY  "if true; then touch $M; fi" "$OUTSIDE"
check DENY  "xargs touch $M" "$OUTSIDE"
check DENY  "(cd $OUTSIDE && touch $M)"
check DENY  "touch $OUTSIDE/$M" "$MARKED"
check DENY  "touch $M; git status" "$OUTSIDE"
# the file tools
edit_check() {
  local want="$1" tool="$2" path="$3"
  jq -nc --arg t "$tool" --arg p "$path" --arg d "$OUTSIDE" '{tool_name:$t, tool_input:{file_path:$p}, cwd:$d}' | bash "$HOOK" >/dev/null 2>&1
  local rc=$? got=ALLOW
  [ "$rc" -eq 2 ] && got=DENY
  if [ "$got" = "$want" ]; then ((++pass)); else ((++fail)); printf 'FAIL  want=%-5s got=%-5s  %s %s\n' "$want" "$got" "$tool" "$path"; fi
}
edit_check DENY  Write "$OUTSIDE/$M"
edit_check DENY  Edit "$OUTSIDE/$M"
edit_check ALLOW Write "$PLAIN/$M"
edit_check ALLOW Write "$OUTSIDE/.claude/settings.json"
edit_check ALLOW Edit "$OUTSIDE/git-commit-allowed.md"
edit_check ALLOW Read "$PLAIN/a"
jq -nc --arg p "$OUTSIDE/$M" --arg d "$OUTSIDE" '{tool_name:"NotebookEdit", tool_input:{notebook_path:$p}, cwd:$d}' | bash "$HOOK" >/dev/null 2>&1
[ $? -eq 2 ] && ((++pass)) || { ((++fail)); echo "FAIL  NotebookEdit on the marker must be refused"; }
# the refusal says whose it is; the commit denial no longer offers the marker
out=$(jq -nc --arg c "touch $M" --arg d "$OUTSIDE" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$d}' | bash "$HOOK" 2>&1 >/dev/null)
[[ "$out" == *"person creates or removes it"* ]] && ((++pass)) || { ((++fail)); echo "FAIL  the refusal must name who writes the marker: $out"; }
out=$(jq -nc --arg c "$V -m x" --arg d "$OUTSIDE" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$d}' | bash "$HOOK" 2>&1 >/dev/null)
[[ "$out" == *"person's to create"* && "$out" != *"touch "* ]] && ((++pass)) || { ((++fail)); echo "FAIL  the commit denial must not hand over the marker: $out"; }
# ── parser absent: the substring verdict stands, at the cwd ──
MISSING=$(mktemp -d); cp "$HOOK" "$MISSING/git-commit-gate.sh"
jq -nc --arg c "echo \"$V\"" --arg d "$PLAIN" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$d}' | bash "$MISSING/git-commit-gate.sh" >/dev/null 2>&1
[ $? -eq 2 ] && ((++pass)) || { ((++fail)); echo "FAIL  no lib: quoted words must fall back to DENY"; }
jq -nc --arg c "$V -m x" --arg d "$MARKED" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$d}' | bash "$MISSING/git-commit-gate.sh" >/dev/null 2>&1
[ $? -eq 0 ] && ((++pass)) || { ((++fail)); echo "FAIL  no lib: a marked cwd must still pass"; }
jq -nc --arg c "git rebase main" --arg d "$PLAIN" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$d}' | bash "$MISSING/git-commit-gate.sh" >/dev/null 2>&1
[ $? -eq 2 ] && ((++pass)) || { ((++fail)); echo "FAIL  no lib: another verb that makes a commit must deny"; }
# ── parser failing: the same, at the cwd ──
mkdir -p "$MISSING/lib"; echo 'raise ValueError' > "$MISSING/lib/shell_segments.py"
jq -nc --arg c "$V -m x" --arg d "$MARKED" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$d}' | bash "$MISSING/git-commit-gate.sh" >/dev/null 2>&1
[ $? -eq 0 ] && ((++pass)) || { ((++fail)); echo "FAIL  broken lib: a marked cwd must still pass"; }
jq -nc --arg c "$V -m x" --arg d "$PLAIN" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$d}' | bash "$MISSING/git-commit-gate.sh" >/dev/null 2>&1
[ $? -eq 2 ] && ((++pass)) || { ((++fail)); echo "FAIL  broken lib: an unmarked cwd must deny"; }
rm -rf "$MISSING"

# ── a redirection is no word of the command, wherever it sits (2026-11-03) ──
for r in '2>/dev/null' '2>&1' '>/dev/null' '> out' '&>/dev/null' '</dev/null'; do
  check DENY  "git $r commit -m x"
  check DENY  "$r git commit -m x"
  check DENY  "$V -m x $r"
  check DENY  "($V -m x) $r"
  check DENY  "git -C /tmp/foo $r commit -m x"
  check ALLOW "git $r commit -m x" "$MARKED"
  check ALLOW "$r git commit -m x" "$MARKED"
done
check DENY  'bash <<< "git commit -m x"'
check DENY  'bash <<<"git commit -m x"'
check DENY  "sh <<<'git commit -m x'"
check DENY  "xargs sh -c '{}' <<< \"git commit -m x\""
check DENY  'ssh host <<< "git commit -m x"'
check ALLOW 'bash <<< "git commit -m x"' "$MARKED"
check ALLOW 'cat <<< "git commit -m x"'
check ALLOW 'git <<< commit'
check ALLOW 'bash -c "echo hi" > "git commit -m x"'
check ALLOW 'git log > commit'
check DENY  $'cat > s.sh <<\'EOF\'\ngit commit -m x\nEOF\nbash s.sh'
check DENY  $'cat > s.sh <<\'EOF\'\ngit commit -m x\nEOF\ncat s.sh | bash'
check ALLOW $'cat > x.md <<\'EOF\'\nThe spelling `git commit -m x` is refused.\nEOF\nq --body-file x.md'
check ALLOW $'cat > x.md <<\'EOF\'\ngit commit -m x\nEOF\nwc -l x.md'
check ALLOW 'git status 2> commit'

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
