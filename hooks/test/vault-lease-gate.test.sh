#!/usr/bin/env bash
# Tests for ../vault-lease-gate.sh (PreToolUse, Bash): it reads a repository's lease and blocks a
# write-shaped command into a checkout another holder leases; it never claims, renews, or releases,
# since the Program Clerk plugin owns those (vault-storage D761). A local server stands in for the
# API, answering every lease lookup with the holder the case names; nothing here reaches a vault.
#
# Exit non-zero on any failure. No framework: the repo has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$HERE/vault-lease-gate.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }
command -v node >/dev/null || { echo "node required" >&2; exit 2; }

pass=0 fail=0
ok()   { ((++pass)); }
bad()  { ((++fail)); printf 'FAIL  %s\n' "$1"; }

work=$(mktemp -d)
export XDG_CACHE_HOME="$work/cache" PROGRAM_CLERK_KEY=pck VAULT_RETRY_DELAYS='0.05 0.05'
# run <payload-json> [env...]; sets rc, out (stdout), err (stderr)
run() {
  local payload="$1"; shift
  out=$(printf '%s' "$payload" | env "$@" bash "$GATE" 2>"$work/err"); rc=$?
  err=$(<"$work/err")
}
bash_payload() { jq -nc --arg cmd "$1" --arg c "$2" --arg s "$3" '{tool_name:"Bash",tool_input:{command:$cmd},session_id:$s,cwd:$c}'; }

W="$work/held"
git init -q "$W" && git -C "$W" remote add origin git@github.com:uhop/zz-lease-hook-test.git
git -C "$W" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
RES="repo:github.com/uhop/zz-lease-hook-test"
S1=aaaa1111beef; S2=bbbb2222beef
ME1="$(hostname -s)/${S1:0:8}"

# The server: every lookup of $RES answers the holder in $work/holder ("<holder>\t<kind>"), other
# resources nothing; a status in $work/status, when present, answers every request instead.
cat >"$work/server.mjs" <<'JS'
import http from 'node:http';
import {existsSync, readFileSync, appendFileSync} from 'node:fs';
const [dir, res] = process.argv.slice(2);
const server = http.createServer((req, out) => {
  req.resume();
  req.on('end', () => {
    appendFileSync(`${dir}/requests`, `${req.method} ${req.url}\n`);
    const status = existsSync(`${dir}/status`) ? Number(readFileSync(`${dir}/status`, 'utf8')) : 200;
    if (status !== 200) {
      out.writeHead(status, {'content-type': 'application/json'});
      return out.end('{"code":"too_many_requests"}');
    }
    const url = new URL(req.url, 'http://x');
    const [holder, kind] = readFileSync(`${dir}/holder`, 'utf8').replace(/\r?\n$/, '').split('\t');
    const items = url.pathname === '/leases' && url.searchParams.get('resource') === res && holder
      ? [{resource: res, holder, holder_kind: kind}] : [];
    out.writeHead(200, {'content-type': 'application/json'});
    out.end(JSON.stringify({count: items.length, items}));
  });
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`${server.address().port}\n`));
JS
printf '%s\tagent\n' "$ME1" >"$work/holder"
node "$work/server.mjs" "$work" "$RES" >"$work/port" 2>/dev/null &
server=$!
for _ in $(seq 50); do [[ -s $work/port ]] && break; sleep 0.1; done
export PROGRAM_CLERK_URL="http://127.0.0.1:$(cat "$work/port")"
fresh() { rm -rf "$XDG_CACHE_HOME"; }

# ── fail-open ────────────────────────────────────────────────────────────
run "$(bash_payload "command sed -i 's/a/b/' $W/a.txt" /tmp "$S2")" PROGRAM_CLERK_URL= PROGRAM_CLERK_KEY=
[[ $rc -eq 0 ]] && ok || bad "no settings must allow (rc=$rc)"
run "$(jq -nc --arg f "$W/a.txt" '{tool_name:"Edit",tool_input:{file_path:$f},session_id:"bbbb2222beef",cwd:"/tmp"}')"
[[ $rc -eq 0 ]] && ok || bad "an edit tool is the plugin's, never this hook's (rc=$rc)"
: >"$work/requests"
run "$(bash_payload "ls -la $W" /tmp "$S2")"
[[ $rc -eq 0 && ! -s "$work/requests" ]] && ok || bad "a command with no write indicator must pass without a lookup (rc=$rc)"
fresh
run "$(bash_payload "command sed -i 's/a/b/' $W/a.txt" /tmp "$S2")" PROGRAM_CLERK_URL=http://127.0.0.1:1
[[ $rc -eq 0 ]] && ok || bad "an unreachable server must allow (rc=$rc)"
fresh
printf '429' >"$work/status"
run "$(bash_payload "command sed -i 's/a/b/' $W/a.txt" /tmp "$S2")"
[[ $rc -eq 0 && -z "$out$err" ]] && ok || bad "a refused lookup must allow silently (rc=$rc out=$out err=$err)"
rm -f "$work/status"

# ── reads only: the hook never writes a lease ────────────────────────────
fresh
: >"$work/requests"
run "$(bash_payload "command sed -i 's/a/b/' $W/a.txt" /tmp "$S2")"
[[ $rc -eq 2 && "$err" == *"held by $ME1"* && "$err" == *"to: \"$RES\""* ]] && ok ||
  bad "a write into a held checkout must block, naming the holder and the handoff address (rc=$rc err=$err)"
[[ -z "$(grep -v '^GET ' "$work/requests")" ]] && ok || bad "the hook sends lookups only: $(cat "$work/requests")"
printf '\tagent\n' >"$work/holder"
fresh
run "$(bash_payload "command sed -i 's/a/b/' $W/a.txt" "$W" "$S1")"
[[ $rc -eq 0 ]] && ok || bad "an unheld checkout must allow, and is not claimed (rc=$rc)"
[[ -z "$(grep -v '^GET ' "$work/requests")" ]] && ok || bad "still lookups only: $(cat "$work/requests")"
printf 'eugene\thuman\n' >"$work/holder"
fresh
run "$(bash_payload "command sed -i 's/a/b/' $W/a.txt" /tmp "$S1")"
[[ $rc -eq 2 && "$err" == *"(a person)"* ]] && ok || bad "a person's lease must block with its own message (rc=$rc err=$err)"
printf '%s\tagent\n' "$ME1" >"$work/holder"
fresh

# ── what counts as a write into the held checkout ────────────────────────
bashrun() { run "$(bash_payload "$1" "$2" "$3")"; }
bashrun "cd $W && command sed -i 's/a/b/' a.txt" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: cd into held && sed -i must block (rc=$rc)"
bashrun $'cat >> '"$W"$'/a.txt <<\'EOF\'\nx\nEOF' /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: >> into held must block (rc=$rc)"
bashrun "command cp /tmp/nothing $W/y.txt" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: cp into held must block (rc=$rc)"
bashrun "sed -i 's/a/b/' a.txt" "$W" "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a relative sed -i with cwd inside held must block (rc=$rc)"
bashrun "git -C $W am /tmp/p.patch" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: git am into held must block (rc=$rc)"
bashrun "command sed -i \"s|a|b|\" $W/a.txt 2>/dev/null" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a pipe character inside quotes must not split the command (rc=$rc)"
bashrun "grep -rn foo $W" /tmp "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: a read of held must pass (rc=$rc)"
bashrun "cat $W/a.txt > /tmp/out.txt 2>/dev/null" /tmp "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: a redirect to scratch must pass (rc=$rc)"
bashrun $'cat > /tmp/f.sh <<\'EOF\'\necho hi > '"$W"$'/z.txt\nEOF' /tmp "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: a heredoc body naming held is data and must pass (rc=$rc)"
bashrun "git -C $W worktree add /tmp/xyz-wt -b topic" /tmp "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: worktree add on held is the sanctioned path and must pass (rc=$rc)"
bashrun "git -C $W apply --check /tmp/p.patch" /tmp "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: apply --check is a read and must pass (rc=$rc)"
bashrun "node /tmp/ledger.js record --store $W/records/x.json /tmp/batch.json" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: --store into held must block (rc=$rc)"
bashrun "node /tmp/tool.js --out=$W/out.json" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: --out= into held must block (rc=$rc)"
bashrun "sort -o $W/sorted.txt /tmp/in.txt" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: -o into held must block (rc=$rc)"
bashrun "node /tmp/ledger.js record --store /tmp/scratch.json /tmp/batch.json" /tmp "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: --store into scratch must pass (rc=$rc)"
bashrun "grep -o foo.bar $W/a.txt" /tmp "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: grep -o takes no value and must pass (rc=$rc)"
bashrun "ps -o pid,args" "$W" "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: a non-path -o value must pass (rc=$rc)"
bashrun "command sed -i 's/a/b/' $W/a.txt" /tmp "$S1"
[[ $rc -eq 0 ]] && ok || bad "bash: the holder's own write must pass (rc=$rc)"
# 13b. a variable the command assigns is followed; a directory that stays unknown is allowed (2026-11-02)
bashrun "WT=/tmp/xyz-wt && cd \"\$WT\" && prettier --write a.txt" "$W" "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: cd into an assigned scratch path must not read as the cwd (rc=$rc)"
bashrun "D=\$(mktemp -d) && cd \"\$D\" && prettier --write a.txt" "$W" "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: cd into a fresh mktemp must not read as the cwd (rc=$rc)"
bashrun "cd \"\$UNSET\" && prettier --write a.txt" "$W" "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: a write after an unknown cd must pass (rc=$rc)"
bashrun "cd \"\$UNSET\" && command sed -i 's/a/b/' a.txt" "$W" "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: sed -i after an unknown cd must pass (rc=$rc)"
bashrun "git -C \"\$UNSET\" add a.txt" "$W" "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: git -C at an unknown directory must pass (rc=$rc)"
bashrun "R=$W; cd \"\$R\" && command sed -i 's/a/b/' a.txt" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: cd into held through a variable must block (rc=$rc)"
bashrun "R=$W; command sed -i 's/a/b/' \"\$R/a.txt\"" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a write into held through a variable must block (rc=$rc)"
# 13c. a write behind shell syntax or `xargs` is a write; a subshell's cd ends with it (2026-11-02)
bashrun "for f in a; do command sed -i 's/a/b/' a.txt; done" "$W" "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: sed -i in a loop must block (rc=$rc)"
bashrun "if true; then command sed -i 's/a/b/' a.txt; fi" "$W" "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: sed -i behind then must block (rc=$rc)"
bashrun "xargs command rm $W/a.txt" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: rm behind xargs must block (rc=$rc)"
bashrun "(cd /tmp && true); command sed -i 's/a/b/' a.txt" "$W" "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a subshell's cd must not move the write out of held (rc=$rc)"
bashrun "(cd $W && true); command sed -i 's/a/b/' a.txt" /tmp "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: a subshell's cd must not move the write into held (rc=$rc)"
bashrun "find . -name x -exec rm {} \\;" "$W" "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: find's placeholder names no path (rc=$rc)"
bashrun "echo \$'a\\'b' ; command sed -i 's/a/b/' a.txt" "$W" "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a write after a \$'...' string with an escaped quote must block, 8g (rc=$rc)"
bashrun "x=\$(command sed -i 's/a/b/' $W/a.txt)" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a write inside a substitution must block, 8q (rc=$rc)"
bashrun "bash -c 'command cp /tmp/nothing $W/y.txt'" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a write inside bash -c must block, 8q (rc=$rc)"
bashrun "cd $W && x=\$(command sed -i 's/a/b/' a.txt)" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a substitution's write after a cd into held must block, 8q (rc=$rc)"
bashrun $'bash <<\'EOF\'\ncommand sed -i s/a/b/ '"$W"$'/a.txt\nEOF' /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a write in a heredoc a shell runs must block, 8t (rc=$rc)"
bashrun $'cat > /tmp/s.sh <<\'EOF\'\ncommand sed -i s/a/b/ a.txt\nEOF\ncd '"$W"$'; bash /tmp/s.sh' /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a script's write after a cd into held must block where it runs, 8s (rc=$rc)"
bashrun $'cat > /tmp/s.sh <<\'EOF\'\ncommand sed -i s/a/b/ a.txt\nEOF\ncd /tmp; bash /tmp/s.sh' "$W" "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: a script run after a cd out of held must pass, 8s (rc=$rc)"
bashrun "x=\"\$(echo \$'\\')'; command sed -i 's/a/b/' $W/a.txt)\"" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a substitution's write past a \$'...' string with an escaped quote must block, 8x (rc=$rc)"
bashrun "x=\`echo \\\`command sed -i 's/a/b/' $W/a.txt\\\`\`" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a write in a nested backtick must block, 8y (rc=$rc)"
bashrun "X=\$(echo hi) command sed -i 's/a/b/' a.txt" "$W" "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a write behind an assignment prefix holding a spaced substitution must block, 8z (rc=$rc)"
bashrun "S=\$(git -C $W stash create) && git -C $W stash list && git -C $W stash show" /tmp "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: git stash create, list, and show read the tree and must pass, 8q (rc=$rc)"
bashrun "git -C $W stash" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: git stash writes the tree and must block (rc=$rc)"
bashrun "command c''p /tmp/nothing $W/y.txt" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a write verb split by quotes must block, 8n (rc=$rc)"
bashrun "command \$'\\x63p' /tmp/nothing $W/y.txt" /tmp "$S2"
[[ $rc -eq 2 ]] && ok || bad "bash: a write verb spelled with a \$'...' escape must block, 8n (rc=$rc)"
# Linked worktrees of a held repository are never blocked: the sanctioned path.
WT="$work/wt"
git -C "$W" worktree add -q "$WT" -b wt-test 2>/dev/null
bashrun "command sed -i 's/a/b/' $WT/a.txt" /tmp "$S2"
[[ $rc -eq 0 ]] && ok || bad "bash: a write inside a linked worktree must pass (rc=$rc)"

kill "$server" 2>/dev/null
wait "$server" 2>/dev/null
rm -rf "$work"
echo "pass=$pass fail=$fail"
[[ $fail -eq 0 ]]
