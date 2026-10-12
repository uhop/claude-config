#!/usr/bin/env bash
# Tests for ../vault-resume-brief.sh (SessionStart): the digest lines plus the
# GitHub line read from the stored baseline (projects/<name>/state.md § GitHub,
# 2026-09-05). The OFFLINE half asserts fail-open (no env, unreachable server →
# exit 0, no output). The LIVE half runs the hook from this repository, which
# has a stored GitHub block, and from a throwaway non-repo directory, which must
# get no project line and no GitHub line. Skipped, not failed, without the env.
#
# Exit non-zero on any failure. No framework: the repo has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$HERE/vault-resume-brief.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

# ── OFFLINE: fail-open ───────────────────────────────────────────────────
out=$(cd / && env PROGRAM_CLERK_URL= PROGRAM_CLERK_KEY= VAULT_API_URL= VAULT_API_TOKEN= bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "no env must exit 0 silently (rc=$rc out=$out)"
refused=(PROGRAM_CLERK_URL=http://127.0.0.1:9 PROGRAM_CLERK_KEY=pck VAULT_API_URL=http://127.0.0.1:9 VAULT_API_TOKEN=pck)
out=$(cd / && env "${refused[@]}" bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "unreachable server must exit 0 silently (rc=$rc out=$out)"

# Until the adapter release after 0.16.0 its MCP tools read only the old names, so a pair
# that differs is named at session start, its values never (vault-storage D208).
out=$(cd / && env "${refused[@]}" VAULT_API_URL=http://127.0.0.1:8 bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && "$out" == "[vault] settings: VAULT_API_URL does not match PROGRAM_CLERK_URL; "* && "$out" != *127.0.0.1* ]] && ok ||
  bad "a differing URL must be named, never its value (rc=$rc out=$out)"
out=$(cd / && env "${refused[@]}" VAULT_API_TOKEN=tok-zz2 bash "$HOOK" 2>/dev/null)
[[ "$out" == "[vault] settings: VAULT_API_TOKEN does not match PROGRAM_CLERK_KEY; "* && "$out" != *pck* && "$out" != *tok-zz2* ]] && ok ||
  bad "a differing key must be named, never its value (out=$out)"
out=$(cd / && env -u VAULT_API_URL -u VAULT_API_TOKEN PROGRAM_CLERK_URL=http://127.0.0.1:9 PROGRAM_CLERK_KEY=pck bash "$HOOK" 2>/dev/null)
[[ "$out" == "[vault] settings: VAULT_API_URL and VAULT_API_TOKEN do not match PROGRAM_CLERK_URL and PROGRAM_CLERK_KEY; "* && $(wc -l <<<"$out") -eq 1 ]] && ok ||
  bad "an unset old pair beside a new one must be named in one line (out=$out)"
out=$(cd / && env PROGRAM_CLERK_URL= PROGRAM_CLERK_KEY= VAULT_API_URL=http://127.0.0.1:9 VAULT_API_TOKEN=old bash "$HOOK" 2>/dev/null)
[[ -z "$out" ]] && ok || bad "the old pair alone must stay silent (out=$out)"

# The product's names win over the old ones, which still work alone (vault-storage D141).
trace=$(cd / && env PROGRAM_CLERK_URL=http://127.0.0.1:59999 PROGRAM_CLERK_KEY=new VAULT_API_URL=http://127.0.0.1:59998 VAULT_API_TOKEN=old bash -x "$HOOK" 2>&1 >/dev/null)
[[ "$trace" == *"Bearer new"*"http://127.0.0.1:59999/system/resume-brief"* && "$trace" != *"59998/"* ]] && ok || bad "the new names must win (trace=$trace)"
trace=$(cd / && env PROGRAM_CLERK_URL= PROGRAM_CLERK_KEY= VAULT_API_URL=http://127.0.0.1:59998 VAULT_API_TOKEN=old bash -x "$HOOK" 2>&1 >/dev/null)
[[ "$trace" == *"Bearer old"*"http://127.0.0.1:59998/system/resume-brief"* ]] && ok || bad "the old names must work alone (trace=$trace)"

# ── OFFLINE: the ACTIVE line, from the hook's own jq program ─────────────
# The program is read out of the hook so the test pins what runs. A brief from
# a server ≥ 2026-09-30 carries queue.in_flight with each Active item's
# source (vault-storage D108); an older one carries the titles only.
prog=$(sed -n '/^jq -r/,/^'"'"' <<<"\$resp"/p' "$HOOK" | sed '1s/^jq -r .//; $d')
brief='{"lint":{"ok":true,"total_issues":0},"suggestions_pending":0,"workflow":{"active":false,"clarify_pending":0},"latest_log":null,"project":{"name":"p","queue":{"active":["A.","B."],"in_flight":[{"title":"A.","source":null},{"title":"B.","source":"github uhop/p#15"}],"inbox":2,"backlog":0,"ready":0,"blocked":0,"hygiene":[]},"feedback":null,"trackers":{"primary":{"kind":"github"},"line":"github uhop/p"},"sessions_unlogged":0}}'
out=$(jq -r "$prog" <<<"$brief" 2>&1)
[[ "$out" == *"ACTIVE: A. | B. (github uhop/p#15);"* ]] && ok || bad "in_flight: the source follows the title (out=$out)"
[[ "$out" == *"; 2 in the inbox to triage; "* ]] && ok || bad "inbox: the count prints when non-zero (out=$out)"
# Each in-flight ticket's stored state rides as upstream (vault-storage D111):
# only a closed or merged one is marked.
done='{"lint":{"ok":true,"total_issues":0},"suggestions_pending":0,"workflow":{"active":false,"clarify_pending":0},"latest_log":null,"project":{"name":"p","queue":{"active":["A.","B.","C."],"in_flight":[{"title":"A.","source":"github uhop/p#1","upstream":"merged"},{"title":"B.","source":"github uhop/p#2","upstream":"open"},{"title":"C.","source":"github uhop/p#3","upstream":null}],"backlog":0,"ready":0,"blocked":0,"hygiene":[]},"feedback":null,"trackers":{"primary":{"kind":"vault"}},"sessions_unlogged":0}}'
out=$(jq -r "$prog" <<<"$done" 2>&1)
[[ "$out" == *"ACTIVE: A. (github uhop/p#1, merged upstream) | B. (github uhop/p#2) | C. (github uhop/p#3);"* ]] && ok || bad "upstream: only a closed or merged ticket is marked (out=$out)"
old='{"lint":{"ok":true,"total_issues":0},"suggestions_pending":0,"workflow":{"active":false,"clarify_pending":0},"latest_log":null,"project":{"name":"p","queue":{"active":["A."],"backlog":0,"ready":0,"blocked":0,"hygiene":[]},"feedback":null,"trackers":{"primary":{"kind":"vault"}},"sessions_unlogged":0}}'
out=$(jq -r "$prog" <<<"$old" 2>&1)
[[ "$out" == *"ACTIVE: A.;"* ]] && ok || bad "titles only on an older server (out=$out)"
[[ "$out" != *"inbox"* ]] && ok || bad "no inbox line without the count (out=$out)"
[[ "$out" != *"loop stall"* ]] && ok || bad "no stall clause from a server without the field (out=$out)"

# The vault server's loop stalls of the past week (vault-storage D177) ride on the
# first line; null when none.
stalls='{"lint":{"ok":true,"total_issues":0},"suggestions_pending":0,"workflow":{"active":false,"clarify_pending":0},"stalls":{"count":2,"latestAt":"2026-10-09T02:25:41.431Z","latestMs":659,"worstAt":"2026-10-08T13:43:55.870Z","worstMs":11353},"latest_log":null,"project":null}'
out=$(jq -r "$prog" <<<"$stalls" 2>&1)
[[ "$(head -n1 <<<"$out")" == "[vault] lint ok; loop stalls this week: 2, latest 659 ms at 2026-10-09 02:25Z, worst 11353 ms (vault_health)" ]] && ok || bad "stalls: the count, the latest, and the worst on the first line (out=$out)"
none='{"lint":{"ok":true,"total_issues":0},"suggestions_pending":0,"workflow":{"active":false,"clarify_pending":0},"stalls":null,"latest_log":null,"project":null}'
out=$(jq -r "$prog" <<<"$none" 2>&1)
[[ "$out" == "[vault] lint ok" ]] && ok || bad "stalls null: nothing added (out=$out)"

# The caller's own key when it expires (vault-storage D210): named within seven
# days, on its own line after the first; the server's ISO time has milliseconds.
keyed() { printf '{"lint":{"ok":true,"total_issues":0},"suggestions_pending":0,"workflow":{"active":false,"clarify_pending":0},"key":%s,"latest_log":null,"project":null}' "$1"; }
key_line() { printf '[vault] key laptop expires %s (%s); make a new one on /ui/keys.html (a fresh sign-in)' "$1" "$2"; }
at=$(date -u -d '+3 days +1 hour' +%FT%T.123Z)
out=$(jq -r "$prog" <<<"$(keyed "{\"name\":\"laptop\",\"expiresAt\":\"$at\"}")" 2>&1)
[[ "$out" == "[vault] lint ok"$'\n'"$(key_line 'in 3 days' "${at:0:10}")" ]] && ok || bad "a key three days out is named (out=$out)"
at=$(date -u -d '+1 day +1 hour' +%FT%T.000Z)
out=$(jq -r "$prog" <<<"$(keyed "{\"name\":\"laptop\",\"expiresAt\":\"$at\"}")" 2>&1)
[[ "$(tail -n1 <<<"$out")" == "$(key_line 'in 1 day' "${at:0:10}")" ]] && ok || bad "one day, singular (out=$out)"
at=$(date -u -d '+2 hours' +%FT%T.000Z)
out=$(jq -r "$prog" <<<"$(keyed "{\"name\":\"laptop\",\"expiresAt\":\"$at\"}")" 2>&1)
[[ "$(tail -n1 <<<"$out")" == "$(key_line 'within a day' "${at:0:10}")" ]] && ok || bad "under a day (out=$out)"
at=$(date -u -d '+10 days' +%FT%T.000Z)
out=$(jq -r "$prog" <<<"$(keyed "{\"name\":\"laptop\",\"expiresAt\":\"$at\"}")" 2>&1)
[[ "$out" == "[vault] lint ok" ]] && ok || bad "ten days out: nothing yet (out=$out)"
out=$(jq -r "$prog" <<<"$(keyed null)" 2>&1)
[[ "$out" == "[vault] lint ok" ]] && ok || bad "a key that never expires: nothing (out=$out)"

# A key the server refuses (401) is said, never silent: the day it expires, or a recall (D210).
port_file=$(mktemp)
node -e 'const s=require("http").createServer((q,r)=>{r.writeHead(401,{"content-type":"application/json"});r.end("{}")}).listen(0,"127.0.0.1",()=>require("fs").writeFileSync(process.argv[1],String(s.address().port)))' "$port_file" &
srv=$!
for _ in $(seq 50); do [[ -s $port_file ]] && break; sleep 0.1; done
refusing="http://127.0.0.1:$(cat "$port_file")"
out=$(cd / && env PROGRAM_CLERK_URL="$refusing" PROGRAM_CLERK_KEY=pck VAULT_API_URL="$refusing" VAULT_API_TOKEN=pck bash "$HOOK" 2>/dev/null); rc=$?
kill "$srv" 2>/dev/null; rm -f "$port_file"
[[ $rc -eq 0 && "$out" == "[vault] the vault refused PROGRAM_CLERK_KEY (401): expired or recalled; make a new key on /ui/keys.html (a fresh sign-in)" ]] && ok ||
  bad "a refused key is said in one line (rc=$rc out=$out)"

# The vault's branch against its remote (vault-storage D193): said only when it needs a person.
store() { printf '{"lint":{"ok":true,"total_issues":0},"suggestions_pending":0,"workflow":{"active":false,"clarify_pending":0},"stalls":null,"store":%s,"latest_log":null,"project":null}' "$1"; }
out=$(jq -r "$prog" <<<"$(store '{"remote":"origin/main","ahead":2,"behind":1,"diverged":true,"lastError":null}')" 2>&1)
[[ "$out" == "[vault] lint ok; store: origin/main has 1 commit(s) the vault lacks, pushing stopped (2 waiting)" ]] && ok || bad "store: a divergence on the first line (out=$out)"
out=$(jq -r "$prog" <<<"$(store '{"remote":"origin/main","ahead":1,"behind":0,"diverged":false,"lastError":"git fetch failed: no route"}')" 2>&1)
[[ "$out" == "[vault] lint ok; store: git fetch failed: no route" ]] && ok || bad "store: a failure on the first line (out=$out)"
out=$(jq -r "$prog" <<<"$(store '{"remote":"origin/main","ahead":0,"behind":0,"diverged":false,"lastError":null}')" 2>&1)
[[ "$out" == "[vault] lint ok" ]] && ok || bad "store: a clean branch adds nothing (out=$out)"

# ── LIVE: this repository has a stored GitHub baseline ───────────────────
live_url=${PROGRAM_CLERK_URL:-${VAULT_API_URL:-}} live_key=${PROGRAM_CLERK_KEY:-${VAULT_API_TOKEN:-}}
if [[ -z $live_url || -z $live_key ]] ||
   ! curl -sf --connect-timeout 1 --max-time 2 -H "Authorization: Bearer $live_key" \
       "$live_url/system/resume-brief" >/dev/null 2>&1; then
  echo "live half skipped (no vault settings or server unreachable)"
else
  out=$(cd "$HERE/.." && bash "$HOOK" 2>/dev/null); rc=$?
  [[ $rc -eq 0 && "$out" == *"[vault] github uhop/claude-config:"* ]] && ok || bad "from this repo: a GitHub line is expected (rc=$rc out=$out)"
  [[ "$out" == *" open ("* && "$out" == *"collected "* && "$out" == *" ago)"* ]] && ok || bad "the GitHub line must carry open items and the collection age (out=$out)"
  [[ "$(tail -n1 <<<"$out")" == "[vault] Digest only"* ]] && ok || bad "the trailer must stay last"
  D=$(mktemp -d)
  out=$(cd "$D" && bash "$HOOK" 2>/dev/null); rc=$?
  [[ $rc -eq 0 && "$out" != *"[vault] github"* && "$out" == *"[vault] Digest only"* ]] && ok || bad "non-repo cwd: no GitHub line, trailer present (rc=$rc out=$out)"
  rmdir "$D"
fi

echo "pass=$pass fail=$fail"
[[ $fail -eq 0 ]]
