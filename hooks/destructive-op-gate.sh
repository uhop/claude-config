#!/bin/bash
# destructive-op-gate.sh — PreToolUse hook for Bash.
#
# Reserves OUTWARD-FACING / IRRECOVERABLE operations for the user; lets all
# reads and local-only writes through. Policy: ~/.claude/CLAUDE.md "Git /
# npm gates". This hook enforces what prefix-deny rules can't express
# (deny is blunt — can't tell `gh api` GET from POST, `git clean -n` from
# `-fd`, or an S3 download from an upload).
#
# Scope (user's chosen policy — "outward/destructive only"):
#   gh   — DENY operations that mutate GitHub-side state (issue/pr/release/
#          gist/repo create·edit·merge·close·comment·delete·…, `gh api`
#          with a non-GET method or body fields). ALLOW reads AND
#          local-only writes (clone, pr checkout, run/release download).
#          Driver: an agent once filed a public `gh issue create` when
#          asked for an internal vault queue item. Internal plans don't go
#          to public queues.
#   aws  — DENY destructive ops (create/put/update/delete/modify/terminate/
#          run/… , s3 rm/mv/rb/mb, s3 cp/sync that UPLOAD to s3). ALLOW
#          reads (describe/list/get/scan/query, s3 ls, sts
#          get-caller-identity) and s3 downloads.
#   git  — DENY only the one op git itself can't undo: `git clean -f`
#          (untracked files have no reflog). reset --hard, checkout/restore,
#          git rm, stash drop, branch -D stay free (git-recoverable).
#
# Compound commands (`a && gh issue create`, `x | aws s3 rm …`, `;`-chains,
# newlines) are split into segments and each segment is analyzed — a
# mutating verb anywhere in the chain is caught, not just the leading one.
#
# push / tag / npm publish live in settings.json's absolute deny; `git
# commit` in git-commit-gate.sh. Default-ALLOW: anything not matched here
# passes.
#
# Contract (Claude Code docs): stdin JSON {tool_name, tool_input:{command}};
# exit 0 = pass to next stage, exit 2 = block (stderr shown to user).
# Fail-open on malformed/empty payload or missing jq.

payload=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

tool=$(jq -r '.tool_name // ""' <<<"$payload" 2>/dev/null)
[[ "$tool" != "Bash" ]] && exit 0

cmd=$(jq -r '.tool_input.command // ""' <<<"$payload" 2>/dev/null)
[[ -z "$cmd" ]] && exit 0

deny() {
  cat >&2 <<EOF
BLOCKED: $1 — reserved for the user by ~/.claude/hooks/destructive-op-gate.sh.

$2

Run it yourself if intended. If this is a read-only / local-only command I
should be free to run (a false positive), refine the hook's match.
EOF
  exit 2
}

# Analyze ONE shell segment (no &&/||/;/| inside). Calls deny() (which
# exits 2) on a reserved op; returns normally otherwise.
analyze_segment() {
  local seg="$1"

  # ── git clean (only git op git can't undo) ──
  if [[ "$seg" =~ (^|[^[:alnum:]_./-])git[[:space:]]+clean([[:space:]]|$) ]]; then
    local force=0 dry=0
    [[ "$seg" =~ (^|[[:space:]])--force([[:space:]]|=|$) ]] && force=1
    [[ "$seg" =~ (^|[[:space:]])-[a-zA-Z]*f[a-zA-Z]* ]] && force=1
    [[ "$seg" =~ (^|[[:space:]])--dry-run([[:space:]]|$) ]] && dry=1
    [[ "$seg" =~ (^|[[:space:]])-[a-zA-Z]*n[a-zA-Z]* ]] && dry=1
    if [[ $force -eq 1 && $dry -eq 0 ]]; then
      deny "git clean force-delete of untracked files" \
           "Untracked files are not in git — no reflog, no history, no recovery."
    fi
  fi

  # ── gh: deny outward GitHub-state mutations ──
  if [[ "$seg" =~ (^|[^[:alnum:]_./-])gh[[:space:]] ]]; then
    local -a _t; read -ra _t <<<"$seg"
    local i=0 n=${#_t[@]} ghcmd="" ghsub=""
    while (( i < n )) && [[ "${_t[i]}" != "gh" ]]; do ((i++)); done
    ((i++))
    while (( i < n )); do
      local t="${_t[i]}"; ((i++))
      [[ "$t" == -* ]] && continue
      if [[ -z "$ghcmd" ]]; then ghcmd="$t"; else ghsub="$t"; break; fi
    done

    if [[ "$ghcmd" == "api" ]]; then
      local is_get=0
      [[ "$seg" =~ (-X|--method)[[:space:]=]+(GET|get) ]] && is_get=1
      if [[ "$seg" =~ (-X|--method)[[:space:]=]+(POST|PUT|PATCH|DELETE|post|put|patch|delete) ]]; then
        deny "gh api write (non-GET method)" "Mutating the GitHub API is reserved."
      fi
      if [[ $is_get -eq 0 && "$seg" =~ (^|[[:space:]])(-f|-F|--field|--raw-field|--input)([[:space:]]|=) ]]; then
        deny "gh api write (body fields imply POST)" "gh api auto-POSTs when fields are present — reserved."
      fi
    else
      # Mutating subcommands. clone/checkout/download/view/list/status/diff/
      # checks/browse/search are deliberately absent (read or local-only).
      local mut='^(create|edit|merge|close|reopen|delete|comment|review|ready|lock|unlock|pin|unpin|transfer|rename|archive|unarchive|fork|sync|set|add|remove|rm|enable|disable|cancel|rerun|run|develop|promote|publish|unpublish|approve|revoke|rotate)$'
      if [[ "$ghsub" =~ $mut ]]; then
        deny "gh write (mutates GitHub state): $ghcmd $ghsub" \
             "Creating/editing issues, PRs, releases, comments, etc. is reserved — internal plans don't go to public queues."
      fi
    fi
  fi

  # ── aws: deny destructive ops + s3 uploads ──
  if [[ "$seg" =~ (^|[^[:alnum:]_./-])aws[[:space:]] ]]; then
    local -a _a; read -ra _a <<<"$seg"
    local i=0 n=${#_a[@]} svc="" op=""
    while (( i < n )) && [[ "${_a[i]}" != "aws" ]]; do ((i++)); done
    ((i++))
    local gval=" --region --profile --output --endpoint-url --query --page-size --max-items --starting-token --ca-bundle --cli-read-timeout --cli-connect-timeout --cli-binary-format --color "
    while (( i < n )); do
      local t="${_a[i]}"
      if [[ "$t" == --*=* ]]; then ((i++)); continue; fi
      if [[ "$t" == -* ]]; then
        if [[ "$gval" == *" $t "* ]]; then ((i+=2)); else ((i++)); fi
        continue
      fi
      if [[ -z "$svc" ]]; then svc="$t"; ((i++)); continue; fi
      op="$t"; break
    done

    if [[ "$svc" == "s3" ]]; then
      case "$op" in
        rm|mv|rb|mb|website)
          deny "aws s3 $op (destructive)" "Removing/moving/creating S3 buckets or objects is reserved." ;;
        cp|sync)
          # dst = last positional after the op; upload iff it is an s3:// URI.
          local dst="" j tk
          for ((j=i+1; j<n; j++)); do
            tk="${_a[j]}"
            [[ "$tk" == -* ]] && continue
            dst="$tk"
          done
          if [[ "$dst" == s3://* ]]; then
            deny "aws s3 $op upload to S3" "Writing to S3 is reserved; downloads (s3:// → local) are allowed."
          fi
          ;;
        *) : ;;  # ls, presign, … → allow
      esac
    elif [[ "$op" =~ ^(create|delete|put|update|modify|terminate|run|start|stop|reboot|attach|detach|associate|disassociate|authorize|revoke|enable|disable|register|deregister|add|remove|set|reset|restore|copy|cancel|abort|purge|tag|untag|import|publish|send|invoke|execute|deploy|destroy|rotate|replace|promote|apply|change|move|write|batch-write|transact-write)(-|$) ]]; then
      deny "aws write/destructive: $svc $op" "Creating/modifying/deleting AWS resources is reserved."
    fi
  fi
}

# Split into segments on shell operators (&& || ; | & and newlines) and
# analyze each. Pipe/&& boundaries become spaces' worth of separators; we
# replace operator runs with newlines, then iterate lines.
seglist=$(printf '%s' "$cmd" | sed -E 's/\|\||&&|;|\||&/\n/g')
while IFS= read -r seg; do
  [[ -z "${seg// /}" ]] && continue
  analyze_segment "$seg"
done <<< "$seglist"

exit 0
