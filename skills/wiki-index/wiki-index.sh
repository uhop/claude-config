#!/usr/bin/env bash
# wiki-index.sh — rebuild a GitHub wiki's search-index.json with the latest builder.
set -u

usage() {
  cat <<'EOF'
Usage: wiki-index.sh [WIKI_DIR]

Rebuilds WIKI_DIR/search-index.json with `npx wiki-search-index@latest`.
Without WIKI_DIR: the current repository when it is a wiki clone, else its wiki/ submodule.
Offline, npm uses its cached builder. Never commits.
EOF
}

dir=
for arg in "$@"; do
  case "$arg" in
    -h | --help) usage; exit 0 ;;
    -*) echo "wiki-index: unknown option: $arg" >&2; usage >&2; exit 2 ;;
    *)
      [ -z "$dir" ] || { echo "wiki-index: expected one directory, got more" >&2; exit 2; }
      dir=$arg
      ;;
  esac
done

origin_of() { git -C "$1" remote get-url origin 2>/dev/null; }
is_wiki() {
  case "$(origin_of "$1")" in
    *.wiki.git | *.wiki) return 0 ;;
  esac
  return 1
}

if [ -z "$dir" ]; then
  top=$(git rev-parse --show-toplevel 2>/dev/null) || top=$PWD
  if is_wiki "$top"; then
    dir=$top
  elif [ -d "$top/wiki" ] && is_wiki "$top/wiki"; then
    dir=$top/wiki
  else
    echo "wiki-index: no wiki found at $top or $top/wiki" >&2
    exit 1
  fi
fi

is_wiki "$dir" || { echo "wiki-index: $dir is not a GitHub wiki clone (origin: $(origin_of "$dir"))" >&2; exit 1; }
[ -f "$dir/search-index.json" ] || {
  echo "wiki-index: $dir has no search-index.json; add wiki search with /wiki-organize first" >&2
  exit 1
}

repo=$(origin_of "$dir" | sed -E 's#\.git$##; s#\.wiki$##; s#.*[/:]([^/]+/[^/]+)$#\1#')
before=$(git -C "$dir" hash-object search-index.json)

# Retries off: offline, npm serves its cached builder, and with nothing cached it fails in under a second, not ~70 s.
npx -y --fetch-retries=0 wiki-search-index@latest --wiki "$dir" --repo "$repo" || {
  echo "wiki-index: the builder did not run (offline with no cached copy?); the index was not rebuilt" >&2
  exit 1
}

after=$(git -C "$dir" hash-object search-index.json)
if [ "$before" = "$after" ]; then
  echo "wiki-index: $dir/search-index.json was already current"
else
  echo "wiki-index: $dir/search-index.json rebuilt (uncommitted)"
fi
