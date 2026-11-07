#!/usr/bin/env bash
# Tests for ../code-rules-gate.sh (PreToolUse, claude-config 9f): each case is an Edit or a Write; the
# verdict is whether the gate refuses it, and for which rule.
#
# Exit non-zero on any failure. No framework: the repo has none.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$HERE/code-rules-gate.sh"
command -v jq >/dev/null || { echo "jq required" >&2; exit 2; }

W=$(mktemp -d)
trap 'command rm -rf "${W:?}"' EXIT

pass=0 fail=0
ok()  { ((++pass)); }
bad() { ((++fail)); printf 'FAIL  %s\n' "$1"; }

run_json() { err=$(printf '%s' "$1" | bash "$HOOK" 2>&1 >/dev/null); rc=$?; }
write() { run_json "$(jq -nc --arg p "$1" --arg c "$2" '{tool_name: "Write", tool_input: {file_path: $p, content: $c}}')"; }
edit()  { run_json "$(jq -nc --arg p "$1" --arg o "$2" --arg n "$3" '{tool_name: "Edit", tool_input: {file_path: $p, old_string: $o, new_string: $n}}')"; }
refused() { [[ $rc -eq 2 && "$err" == *"- $2:"* && "$err" == *'Why:'* ]] && ok || bad "$1 must be refused for $2 (rc=$rc err=$err)"; }
allowed() { [[ $rc -eq 0 && -z "$err" ]] && ok || bad "$1 must pass (rc=$rc err=$err)"; }

# ── split-lf ──
write "$W/a.mjs" "const lines = text.split('\n');";           refused 'a JS split on a quoted LF' split-lf
write "$W/a.mjs" 'const lines = text.split("\n");';           refused 'a double-quoted LF' split-lf
write "$W/a.mjs" 'const lines = text.split(/\n/);';           refused 'a regex LF' split-lf
write "$W/a.mjs" 'const lines = text.split(`\n`);';           refused 'a template LF' split-lf
write "$W/a.ts"  "const lines = text.split( '\n' );";         refused 'a TS split with spaces' split-lf
write "$W/a.py"  "lines = text.split('\n')";                  refused 'a Python split' split-lf
write "$W/a.mjs" 'const lines = text.split(/\r?\n/);';        allowed 'a split on CRLF or LF'
write "$W/a.py"  'lines = text.splitlines()';                 allowed "Python's splitlines"
write "$W/a.sh"  'jq -Rsc '"'"'split("\n")'"'";                allowed 'a shell script'
write "$W/a.md"  "Never \`text.split('\n')\`.";               allowed 'a Markdown file'
write "$W/a.mjs" "text.split('\n'); // code-rules: allow split-lf"; allowed 'a line with the allow comment'
write "$W/a.mjs" "text.split('\n'); // code-rules: allow lookbehind"; refused 'an allow comment for another rule' split-lf

# ── only what the edit adds ──
edit "$W/b.mjs" 'const a = 1;' "const lines = text.split('\n');";             refused 'an Edit that adds a split' split-lf
edit "$W/b.mjs" "lines = text.split('\n'); a = 1;" "lines = text.split('\n'); a = 2;"; allowed 'an Edit whose old text holds the same split'
edit "$W/b.mjs" "lines = text.split('\n');" "lines = text.split(/\r?\n/);";   allowed 'an Edit that fixes a split'
printf "const a = text.split('\\\\n');\n" > "$W/c.mjs"
printf "const a = text.split('\\\\n');\n" | grep -q "split('\\\\n')" && ok || bad 'the fixture holds a split'
write "$W/c.mjs" "const a = text.split('\n');
const b = 2;";                                                               allowed 'a Write that keeps the file'"'"'s one split'
write "$W/c.mjs" "const a = text.split('\n');
const b = text.split('\n');";                                                refused 'a Write that adds a second split' split-lf

# ── lookbehind ──
write "$W/d.js" 'const re = /(?<=a)b/;';                       refused 'a positive lookbehind' lookbehind
write "$W/d.js" 'const re = /(?<!a)b/u;';                      refused 'a negative lookbehind' lookbehind
write "$W/d.py" "re.compile(r'(?<=a)b')";                      refused 'a Python lookbehind' lookbehind
write "$W/d.js" 'const re = /(?<name>a)b/;';                   allowed 'a named group'
write "$W/d.js" 'const re = /(?=a)b(?!c)/;';                   allowed 'a lookahead'

# ── bare-symbol ──
write "$W/e.mjs" "const k = Symbol('x');";                     refused 'a bare Symbol()' bare-symbol
write "$W/e.mjs" "export const k = Symbol();";                 refused 'an empty Symbol()' bare-symbol
write "$W/e.mjs" "const k = Symbol.for('pkg.x');";             allowed 'Symbol.for'
write "$W/e.mjs" 'for (const x of o[Symbol.iterator]()) {}';   allowed 'a well-known symbol'
write "$W/e.mjs" "const k = obj.Symbol('x');";                 allowed 'a method named Symbol'
write "$W/e.py"  "k = Symbol('x')";                            allowed 'Symbol in Python'

# ── raw-nul ──
run_json '{"tool_name":"Write","tool_input":{"file_path":"/nowhere/f.md","content":"a\u0000b"}}'
refused 'a raw NUL in Markdown' raw-nul
write "$W/f.mjs" "const SEP = '\\\\0';";                       allowed 'the escape written as text'

# ── the message ──
write "$W/g.mjs" "const k = Symbol('x'); const l = s.split('\n');"
[[ "$err" == *'- split-lf:'* && "$err" == *'- bare-symbol:'* && "$err" == *"$W/g.mjs"* ]] && ok || bad "both rules and the path are named (err=$err)"

# ── fails open ──
run_json 'not json';                                                          allowed 'unreadable input'
run_json '{"tool_name":"Bash","tool_input":{"command":"x.split(\"\\n\")"}}'; allowed 'another tool'
run_json '{"tool_name":"Write"}';                                             allowed 'a Write with no input'

echo "code-rules-gate: $pass passed, $fail failed"
((fail == 0))
