#!/usr/bin/env bash
# Tests for ../vault-session-record.sh (SessionEnd): the session's `end` line
# from a synthetic transcript, appended to the project's month file, and
# fail-open on every missing precondition. Nothing here reaches a vault: a
# local server records each request it answers. No framework: the repo has
# none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$HERE/vault-session-record.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }
command -v node >/dev/null || { echo "node required" >&2; exit 2; }

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

refused=(env PROGRAM_CLERK_URL=http://127.0.0.1:9 PROGRAM_CLERK_KEY=x)

# ── fail-open ────────────────────────────────────────────────────────────
out=$(printf '{"session_id":"abc","cwd":"/"}' | env PROGRAM_CLERK_URL= PROGRAM_CLERK_KEY= VAULT_API_URL= VAULT_API_TOKEN= bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "no env must exit 0 silently (rc=$rc out=$out)"
out=$(printf '{"session_id":"abc","cwd":"/tmp"}' | "${refused[@]}" bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "a non-repo cwd must exit 0 silently (rc=$rc out=$out)"
out=$(printf '{"session_id":"abc","cwd":"%s","agent_id":"sub"}' "$HERE" | "${refused[@]}" bash "$HOOK" 2>/dev/null); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok || bad "a sub-agent must exit 0 silently (rc=$rc out=$out)"

# ── the end line, from a synthetic transcript in a scratch repository ──────
work=$(mktemp -d)
repo="$work/vs-demo"
mkdir -p "$repo" && git -C "$repo" init -q && git -C "$repo" commit -q --allow-empty -m first
transcript="$work/session.jsonl"
{
  printf '{"type":"summary","sessionId":"deadbeef"}\n'
  printf '{"timestamp":"2026-09-30T01:00:00.000Z","message":{"role":"user","content":"hi"}}\n'
  printf '{"timestamp":"2026-09-30T01:05:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"mcp__vault__vault_append","input":{"path":"projects/vs-demo/queue.md","text":"x"}}]}}\n'
  printf '{"timestamp":"2026-09-30T01:06:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"mcp__vault__vault_replace","input":{"path":"logs/2026-09-16-old.md","from":"a","to":"b"}}]}}\n'
  printf '{"timestamp":"2026-09-30T01:07:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","input":{"command":"node ~/.claude/skills/vault/vault-put.mjs topics/x.md --fm fm.json --body body.md"}}]}}\n'
  printf '{"timestamp":"2026-09-30T01:08:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"mcp__vault__vault_move_item","input":{"from_path":"projects/vs-demo/queue.md","to_path":"projects/vs-demo/queue-archive.md","title":"t"}}]}}\n'
  printf '{"timestamp":"2026-09-30T01:09:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","input":{"command":"vault-curl /data/projects/vs-demo/data/sessions/logs/2026-09-30-deadbeef-arc.markdown -X PUT --data-binary @body.md"}}]}}\n'
} >"$transcript"
git -C "$repo" commit -q --allow-empty -m "during the session"

cat >"$work/server.mjs" <<'EOF'
import http from 'node:http';
import {appendFileSync} from 'node:fs';
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    appendFileSync(process.argv[2], `${JSON.stringify({method: req.method, url: req.url, body})}\n`);
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end('{}');
  });
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`${server.address().port}\n`));
EOF
node "$work/server.mjs" "$work/requests.jsonl" >"$work/port" 2>/dev/null &
server=$!
for _ in {1..50}; do [[ -s $work/port ]] && break; sleep 0.1; done
url="http://127.0.0.1:$(<"$work/port")"

printf '{"session_id":"deadbeef-0000","cwd":"%s","transcript_path":"%s","reason":"prompt_input_exit"}' "$repo" "$transcript" |
  env PROGRAM_CLERK_URL="$url" PROGRAM_CLERK_KEY=x bash "$HOOK" >/dev/null 2>&1
month=$(date -u +%Y-%m)
requests=$(grep -c '' "$work/requests.jsonl" 2>/dev/null || echo 0)
[[ $requests -eq 1 ]] && ok || bad "one request, the append (got $requests)"
request=$(head -1 "$work/requests.jsonl" 2>/dev/null)
[[ $(jq -r '.method' <<<"$request") == POST ]] && ok || bad "an append is a POST: $request"
[[ $(jq -r '.url' <<<"$request") == "/data/projects/vs-demo/data/sessions/$month.jsonl" ]] && ok || bad "into the month file: $request"
body=$(jq -r '.body' <<<"$request")
[[ $(jq -j '.body' <<<"$request" | tail -c 1 | od -An -c | tr -d ' ') == '\n' ]] && ok || bad "the line ends with its newline: $request"
[[ $(grep -c '' <<<"$body") -eq 1 ]] && ok || bad "one line: $body"
me="$(hostname -s)/deadbeef"
expected=$(jq -cn --arg me "$me" '{
  kind: "end", holder: $me, started: "2026-09-30T01:00:00Z", reason: "prompt_input_exit",
  wrote: ["logs/2026-09-16-old.md", "projects/vs-demo/queue-archive.md", "projects/vs-demo/queue.md", "topics/x.md"]
}')
got=$(jq -c '{kind, holder, started, reason, wrote}' <<<"$body")
[[ $got == "$expected" ]] && ok || bad "the end's fields, the data file's write left out: $got"
jq -e '.ended | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")' <<<"$body" >/dev/null && ok || bad "ended: $body"
jq -e '.commits | length == 2 and all(test("^[0-9a-f]+$"))' <<<"$body" >/dev/null && ok || bad "both commits: $body"
jq -e 'has("log") | not' <<<"$body" >/dev/null && ok || bad "no log named, since the wrap's line pairs by holder: $body"

# ── a project named after a repository with dots in its name ──────────────
dotted="$work/uhop.github.com"
mkdir -p "$dotted" && git -C "$dotted" init -q && git -C "$dotted" commit -q --allow-empty -m first
printf '{"session_id":"deadbeef-0001","cwd":"%s","transcript_path":"%s","reason":"exit"}' "$dotted" "$transcript" |
  env PROGRAM_CLERK_URL="$url" PROGRAM_CLERK_KEY=x bash "$HOOK" >/dev/null 2>&1
[[ $(tail -1 "$work/requests.jsonl" | jq -r '.url') == "/data/projects/uhop.github.com/data/sessions/$month.jsonl" ]] && ok ||
  bad "a dotted project name is a project: $(tail -1 "$work/requests.jsonl")"

kill "$server" 2>/dev/null
rm -rf "$work"

printf 'pass=%d fail=%d\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
