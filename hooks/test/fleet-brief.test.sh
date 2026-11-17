#!/usr/bin/env bash
# Tests for ../fleet-brief.sh (SessionStart): the brief's fleet-only line, from a local server that
# answers the brief and the two queue queries; nothing here reaches a vault. No framework: the repo
# has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$HERE/fleet-brief.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }
command -v node >/dev/null || { echo "node required" >&2; exit 2; }

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

work=$(mktemp -d)
mkdir "$work/p" && git -C "$work/p" init -q
export VAULT_RETRY_DELAYS='0.05 0.05' XDG_RUNTIME_DIR="$work"

# ── fail-open ────────────────────────────────────────────────────────────
out=$(cd "$work/p" && env PROGRAM_CLERK_URL= PROGRAM_CLERK_KEY= bash "$HOOK" 2>&1); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "no settings must exit 0 silently (rc=$rc out=$out)"
out=$(cd "$work/p" && env PROGRAM_CLERK_URL=http://127.0.0.1:1 PROGRAM_CLERK_KEY=pck bash "$HOOK" 2>&1); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "an unreachable server must exit 0 silently (rc=$rc out=$out)"

# The server answers from $work/answers.json: {brief, workflowTotal, items}.
cat >"$work/server.mjs" <<'JS'
import http from 'node:http';
import {readFileSync, appendFileSync} from 'node:fs';
const dir = process.argv[2];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    appendFileSync(`${dir}/requests`, `${req.method} ${req.url} ${body}\n`);
    const a = JSON.parse(readFileSync(`${dir}/answers.json`, 'utf8'));
    const url = new URL(req.url, 'http://x');
    let out = {};
    if (url.pathname === '/system/resume-brief') out = a.brief;
    else if (url.pathname === '/notes/query') {
      const q = JSON.parse(body);
      out = q.folder === 'projects/agent-workflow/queue'
        ? {items: [], total: a.workflowTotal}
        : {items: a.items.map(title => ({frontmatter: {title, section: 'backlog'}})), total: a.items.length};
    }
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(JSON.stringify(out));
  });
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`${server.address().port}\n`));
JS
answer() { printf '%s' "$1" >"$work/answers.json"; }
answer '{"brief":{"workflow":{"active":false,"clarify_pending":0}},"workflowTotal":0,"items":["A."]}'
node "$work/server.mjs" "$work" >"$work/port" 2>/dev/null &
server=$!
for _ in $(seq 50); do [[ -s $work/port ]] && break; sleep 0.1; done
url="http://127.0.0.1:$(cat "$work/port")"
runit() { out=$(cd "$work/p" && env PROGRAM_CLERK_URL="$url" PROGRAM_CLERK_KEY=pck bash "$HOOK" 2>&1); rc=$?; }

runit
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "nothing to say prints nothing (rc=$rc out=$out)"
grep -q 'GET /system/resume-brief?project=p ' "$work/requests" && ok || bad "asks the brief for the cwd project: $(cat "$work/requests")"

answer '{"brief":{"workflow":{"active":false,"clarify_pending":3}},"workflowTotal":1,"items":["A.","F SHIPPED 2026-07-29."]}'
runit
[[ $rc -eq 0 && "$out" == "[pc] fleet: agent-workflow Active non-empty; 3 to /clarify; queue hygiene 1: \"F SHIPPED 2026-07-29.\": completion marker 'SHIPPED' on an open item; archive it" ]] && ok ||
  bad "all three on one line (rc=$rc out=$out)"

answer '{"brief":{"workflow":{"active":true,"clarify_pending":0}},"workflowTotal":0,"items":[]}'
: >"$work/requests"
runit
[[ "$out" == "[pc] fleet: agent-workflow Active non-empty" ]] && ok || bad "the server's own Active flag (out=$out)"
! grep -q 'agent-workflow' "$work/requests" && ok || bad "and no query of agent-workflow when the brief says so"

kill "$server" 2>/dev/null
wait "$server" 2>/dev/null
rm -rf "$work"
printf 'pass=%d fail=%d\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
