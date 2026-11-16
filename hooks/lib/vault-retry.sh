# shellcheck shell=bash
# A hook's call to the vault, waited out briefly while the server is between answers (vault-storage
# 7as-2, D751): a connection never made, or a 503 whose body names a code that applied nothing, is
# sent again whatever the method; a read also after a 502, a 503, a 504, a timeout, or a dropped
# connection. Twice at most, after 1 s and 2 s, then the hook goes on as it did before. Once a hook
# has waited that out, later calls try once until one gets another answer, so an outage does not
# slow every tool call.
#
# Usage: vault_retry <curl arguments...>   prints the last try's output and returns curl's status.

vault_retry_marker=${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/claude-vault-outage-$UID
vault_retry_delays=${VAULT_RETRY_DELAYS:-1 2}

vault_retry() {
  local is_read=1 prev='' arg
  for arg in "$@"; do
    case $arg in
      -d | --data | --data-* | -F | --form | -T | --upload-file) is_read=0 ;;
    esac
    if [[ ($prev == -X || $prev == --request) && ! $arg =~ ^(GET|HEAD)$ ]]; then is_read=0; fi
    prev=$arg
  done
  local head out
  head=$(mktemp) && out=$(mktemp) || {
    curl "$@"
    return
  }
  local delays code status repeat
  read -ra delays <<<"$vault_retry_delays"
  delays+=('')
  local delay
  for delay in "${delays[@]}"; do
    : >|"$head"
    curl -D "$head" "$@" >|"$out"
    code=$?
    status=$(awk '/^HTTP\//{s=$2} END{print s}' "$head")
    repeat=0
    if [[ $code == 7 ]]; then
      repeat=1
    elif [[ $status == 503 ]] &&
      grep -Eq '"code" *: *"(tenant_unavailable|verification_unavailable|writes_paused)"' "$out"; then
      repeat=1
    elif ((is_read)) && [[ $code =~ ^(28|52|56)$ || $status =~ ^50[234]$ ]]; then
      repeat=1
    fi
    if ((!repeat)); then
      [[ -z $status ]] || rm -f -- "$vault_retry_marker"
      break
    fi
    if [[ -z $delay ]]; then
      : >|"$vault_retry_marker"
      break
    fi
    [[ ! -e $vault_retry_marker ]] || break
    sleep "$delay"
  done
  cat -- "$out"
  rm -f -- "$head" "$out"
  return "$code"
}
