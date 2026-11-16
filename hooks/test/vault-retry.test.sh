#!/usr/bin/env bash
# Tests for ../lib/vault-retry.sh: which answers a hook's call sends again, how often, and the
# remembered outage. A local server answers each path from a script of statuses; nothing here
# reaches a vault. No framework: the repo has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v node >/dev/null || { echo "node required" >&2; exit 2; }

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

work=$(mktemp -d)
export XDG_RUNTIME_DIR=$work VAULT_RETRY_DELAYS='0.05 0.05'
# shellcheck source=../lib/vault-retry.sh
. "$HERE/lib/vault-retry.sh"
marker=$vault_retry_marker

# Each path answers its script in turn, the last answer repeated: "503:tenant_unavailable" is a 503
# whose body names that code, "503" a body with no code, as the balancer's.
cat >"$work/server.mjs" <<'EOF'
import http from 'node:http';
import {appendFileSync} from 'node:fs';
const scripts = JSON.parse(process.argv[3]);
const seen = {};
const server = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const path = new URL(req.url, 'http://x').pathname;
    const script = scripts[path] ?? ['200'];
    const n = (seen[path] = (seen[path] ?? 0) + 1);
    const [status, code] = script[Math.min(n, script.length) - 1].split(':');
    appendFileSync(process.argv[2], `${req.method} ${path}\n`);
    res.writeHead(Number(status), {'Content-Type': code ? 'application/json' : 'text/plain'});
    res.end(code ? JSON.stringify({code}) : status === '200' ? '{"ok":true}' : 'Service Unavailable');
  });
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`${server.address().port}\n`));
EOF
scripts='{
  "/w-unreached": ["503:tenant_unavailable", "200"],
  "/w-maybe": ["503:database_unavailable", "200"],
  "/w-gateway": ["502", "200"],
  "/w-implied": ["502", "200"],
  "/r-maybe": ["503:database_unavailable", "200"],
  "/r-gateway": ["502"],
  "/r-again": ["502", "200"],
  "/w-hidden": ["503:tenant_unavailable", "200"]
}'
node "$work/server.mjs" "$work/requests" "$scripts" >"$work/port" 2>/dev/null &
server=$!
for _ in $(seq 50); do [[ -s $work/port ]] && break; sleep 0.1; done
base="http://127.0.0.1:$(cat "$work/port")"
count() { grep -c " $1\$" "$work/requests" 2>/dev/null || echo 0; }

# ── writes ───────────────────────────────────────────────────────────────
out=$(vault_retry -s -X POST -d '{}' "$base/w-unreached"); rc=$?
[[ $rc -eq 0 && $out == '{"ok":true}' && $(count /w-unreached) -eq 2 ]] && ok ||
  bad "a write refused with a code that applied nothing goes again (rc=$rc out=$out sent=$(count /w-unreached))"
out=$(vault_retry -s -X POST -d '{}' "$base/w-maybe")
[[ $(count /w-maybe) -eq 1 && $out == *database_unavailable* ]] && ok ||
  bad "a write that may have applied is answered at once (sent=$(count /w-maybe))"
vault_retry -s -X POST -d '{}' "$base/w-gateway" >/dev/null
[[ $(count /w-gateway) -eq 1 ]] && ok || bad "a write's 502 is answered at once (sent=$(count /w-gateway))"
vault_retry -s -d '{}' "$base/w-implied" >/dev/null
[[ $(count /w-implied) -eq 1 ]] && ok || bad "a body with no -X is a write too (sent=$(count /w-implied))"
vault_retry -s -o /dev/null -X POST -d '{}' "$base/w-hidden"
[[ $(count /w-hidden) -eq 1 ]] && ok ||
  bad "a write whose body the caller hides is not judged by it, so not sent again (sent=$(count /w-hidden))"

# ── reads ────────────────────────────────────────────────────────────────
out=$(vault_retry -sf "$base/r-maybe"); rc=$?
[[ $rc -eq 0 && $out == '{"ok":true}' && $(count /r-maybe) -eq 2 ]] && ok ||
  bad "a read goes again after any 503, -f and all (rc=$rc sent=$(count /r-maybe))"
[[ ! -e $marker ]] && ok || bad "no outage remembered after an answer"
vault_retry -sf "$base/r-gateway" >/dev/null; rc=$?
[[ $rc -eq 22 && $(count /r-gateway) -eq 3 ]] && ok ||
  bad "a read is tried three times in all, then the hook gets the failure (rc=$rc sent=$(count /r-gateway))"
[[ -e $marker ]] && ok || bad "the outage is remembered once waited out"

# ── the remembered outage ────────────────────────────────────────────────
vault_retry -sf "$base/r-gateway" >/dev/null
[[ $(count /r-gateway) -eq 4 ]] && ok || bad "while remembered, a call tries once (sent=$(count /r-gateway))"
out=$(vault_retry -sf "$base/r-again"); rc=$?
[[ $rc -ne 0 && $(count /r-again) -eq 1 ]] && ok || bad "still once on the next path (sent=$(count /r-again))"
out=$(vault_retry -sf "$base/r-again"); rc=$?
[[ $rc -eq 0 && ! -e $marker ]] && ok || bad "an answer ends the outage (rc=$rc)"

# ── a connection never made ──────────────────────────────────────────────
start=$(date +%s%N)
vault_retry -s --connect-timeout 1 -X POST -d '{}' "http://127.0.0.1:9/x" >/dev/null; rc=$?
took=$((($(date +%s%N) - start) / 1000000))
[[ $rc -eq 7 && -e $marker && $took -ge 100 ]] && ok ||
  bad "a refused write waits both delays, then fails and is remembered (rc=$rc took=${took}ms)"
rm -f -- "$marker"

kill "$server" 2>/dev/null
wait "$server" 2>/dev/null
rm -rf "$work"

printf 'pass=%d fail=%d\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
