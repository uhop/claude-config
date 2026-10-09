#!/usr/bin/env bash
# Tests for ../vault-session-record.sh (SessionEnd): the session bullet's
# shape from a synthetic transcript, and fail-open on every missing
# precondition. Nothing here reaches a vault: the server address refuses, so
# the bullet is read from the shell trace. No framework: the repo has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$HERE/vault-session-record.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }
command -v node >/dev/null || { echo "node required" >&2; exit 2; }

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

refused=(env VAULT_API_URL=http://127.0.0.1:9 VAULT_API_TOKEN=x)

bullet() { # <server url> <cwd> <transcript> <session id>
  local trace
  trace=$(printf '{"session_id":"%s","cwd":"%s","transcript_path":"%s","reason":"prompt_input_exit"}' "$4" "$2" "$3" |
    env VAULT_API_URL="$1" VAULT_API_TOKEN=x bash -x "$HOOK" 2>&1 | grep -E "^\+ line=.*log:" | tail -1)
  trace=${trace#+ line=}
  trace=${trace#\'}
  printf '%s' "${trace%\'}"
}

# ── fail-open ────────────────────────────────────────────────────────────
out=$(printf '{"session_id":"abc","cwd":"/"}' | env VAULT_API_URL= VAULT_API_TOKEN= bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "no env must exit 0 silently (rc=$rc out=$out)"
out=$(printf '{"session_id":"abc","cwd":"/tmp"}' | "${refused[@]}" bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "a non-repo cwd must exit 0 silently (rc=$rc out=$out)"
out=$(printf '{"session_id":"abc","cwd":"%s","agent_id":"sub"}' "$HERE" | "${refused[@]}" bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "a sub-agent must exit 0 silently (rc=$rc out=$out)"

# ── the bullet, from a synthetic transcript in a scratch repository ───────
work=$(mktemp -d)
repo="$work/vs-demo"
mkdir -p "$repo" && git -C "$repo" init -q && git -C "$repo" commit -q --allow-empty -m first
transcript="$work/session.jsonl"
{
  printf '{"type":"summary","sessionId":"deadbeef"}\n'
  printf '{"timestamp":"2026-09-30T01:00:00.000Z","message":{"role":"user","content":"hi"}}\n'
  printf '{"timestamp":"2026-09-30T01:05:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"mcp__vault__vault_append","input":{"path":"projects/vs-demo/queue.md","text":"x"}}]}}\n'
  printf '{"timestamp":"2026-09-30T01:06:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"mcp__vault__vault_replace","input":{"path":"logs/2026-09-16-old.md","from":"a","to":"b"}}]}}\n'
  printf '{"timestamp":"2026-09-30T01:07:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","input":{"command":"node ~/.claude/skills/vault/vault-put.mjs logs/2026-09-30-vs-demo-arc.md --fm fm.json --body body.md"}}]}}\n'
  printf '{"timestamp":"2026-09-30T01:08:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"mcp__vault__vault_move_item","input":{"from_path":"projects/vs-demo/queue.md","to_path":"projects/vs-demo/queue-archive.md","title":"t"}}]}}\n'
} >"$transcript"
git -C "$repo" commit -q --allow-empty -m "during the session"
line=$(bullet http://127.0.0.1:9 "$repo" "$transcript" deadbeef-0000)
me="$(hostname -s)/deadbeef"
shape='^- \*\*[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\*\* '"$me"': started 2026-09-30T01:00:00Z, ended by prompt_input_exit, commits: [0-9]+( \([0-9a-f, ]+\))?, wrote: 4 \(logs/2026-09-16-old\.md, logs/2026-09-30-vs-demo-arc\.md, projects/vs-demo/queue-archive\.md, projects/vs-demo/queue\.md\), log: logs/2026-09-30-vs-demo-arc\.md\.$'
[[ $line =~ $shape ]] && ok || bad "bullet shape: $line"
[[ $line == *"wrote: 4 ("* ]] && ok || bad "wrote count: $line"

# ── a log another bullet already names is a backfill, never this session's ──
sessions="$work/sessions.md"
printf -- '- **2026-09-30T00:30:00Z** host/0ld5e551: started 2026-09-30T00:00:00Z, ended by other, commits: 0, wrote: 0, log: logs/2026-09-29-vs-demo-backfill.md.\n' >"$sessions"
cat >"$work/server.mjs" <<'EOF'
import http from 'node:http';
import {readFileSync} from 'node:fs';
const body = readFileSync(process.argv[2], 'utf8');
const server = http.createServer((req, res) => {
  const found = req.method === 'GET' && req.url === '/vault/projects/vs-demo/sessions.md';
  res.writeHead(found ? 200 : 404);
  res.end(found ? body : '');
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`${server.address().port}\n`));
EOF
node "$work/server.mjs" "$sessions" >"$work/port" 2>/dev/null &
server=$!
for _ in {1..50}; do [[ -s $work/port ]] && break; sleep 0.1; done
url="http://127.0.0.1:$(<"$work/port")"
opening='{"timestamp":"2026-09-30T02:00:00.000Z","message":{"role":"user","content":"hi"}}'
backfill='{"timestamp":"2026-09-30T02:01:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"mcp__vault__vault_write_file","input":{"path":"logs/2026-09-29-vs-demo-backfill.md"}}]}}'
own='{"timestamp":"2026-09-30T02:30:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"mcp__vault__vault_write_file","input":{"path":"logs/2026-09-30-vs-demo-own.md"}}]}}'
printf '%s\n' "$opening" "$backfill" "$own" >"$work/both.jsonl"
printf '%s\n' "$opening" "$backfill" >"$work/backfill-only.jsonl"
line=$(bullet "$url" "$repo" "$work/both.jsonl" deadbeef-0001)
[[ $line == *", log: logs/2026-09-30-vs-demo-own.md." ]] && ok || bad "a backfilled log must not be named as this session's: $line"
line=$(bullet "$url" "$repo" "$work/backfill-only.jsonl" deadbeef-0002)
[[ $line == *", log: none." ]] && ok || bad "a session that only backfilled ended without a log: $line"
kill "$server" 2>/dev/null
rm -rf "$work"

printf 'pass=%d fail=%d\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
