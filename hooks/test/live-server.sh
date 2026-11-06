# Sourced by the hook suites with a live half; needs the suite's `bad`. `live_server <path>` sets
# live_url and live_key from the vault settings and answers whether their server serves <path>. With
# no settings the live half is skipped and says so. With settings, a server that stays silent through
# three tries fails the suite, so a live half skipped under load never reads as a pass (8o).
live_server() {
  live_url=${PROGRAM_CLERK_URL:-${VAULT_API_URL:-}} live_key=${PROGRAM_CLERK_KEY:-${VAULT_API_TOKEN:-}}
  if [[ -z $live_url || -z $live_key ]]; then
    echo "live half skipped (no vault settings)"
    return 1
  fi
  local try
  for try in 1 2 3; do
    # Each try outlasts the server's worst recorded event-loop stall, 2,021 ms (2026-11-06).
    curl -sf --connect-timeout 2 --max-time 5 -H "Authorization: Bearer $live_key" "$live_url$1" >/dev/null 2>&1 && return 0
    ((try < 3)) && sleep "$try"
  done
  bad "live half: $live_url$1 did not answer in three tries; unset the vault settings to run the offline half alone"
  return 1
}
