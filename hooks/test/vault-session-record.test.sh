#!/usr/bin/env bash
# Tests for ../vault-session-record.sh (SessionEnd): the session bullet's
# shape from a synthetic transcript, and fail-open on every missing
# precondition. Nothing here reaches a vault: the server address refuses, so
# the bullet is read from the shell trace. No framework: the repo has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$HERE/vault-session-record.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

refused=(env VAULT_API_URL=http://127.0.0.1:9 VAULT_API_TOKEN=x)

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
trace=$(printf '{"session_id":"deadbeef-0000","cwd":"%s","transcript_path":"%s","reason":"prompt_input_exit"}' "$repo" "$transcript" |
  "${refused[@]}" bash -x "$HOOK" 2>&1 | grep -E "^\+ line=.*log:" | tail -1)
line=${trace#+ line=}
line=${line#\'}; line=${line%\'}
me="$(hostname -s)/deadbeef"
shape='^- \*\*[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\*\* '"$me"': started 2026-09-30T01:00:00Z, ended by prompt_input_exit, commits: [0-9]+( \([0-9a-f, ]+\))?, wrote: 4 \(logs/2026-09-16-old\.md, logs/2026-09-30-vs-demo-arc\.md, projects/vs-demo/queue-archive\.md, projects/vs-demo/queue\.md\), log: logs/2026-09-30-vs-demo-arc\.md\.$'
[[ $line =~ $shape ]] && ok || bad "bullet shape: $line"
[[ $line == *"wrote: 4 ("* ]] && ok || bad "wrote count: $line"
rm -rf "$work"

printf 'pass=%d fail=%d\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
