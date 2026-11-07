"""The code rules a program can check (claude-config 9f): `code-rules-gate.sh` refuses an Edit or a
Write that introduces one, with the rule and its reason. A new checkable rule joins RULES, never
the global CLAUDE.md, so a session pays for its wording only when it breaks it.

An allow comment is an exception Eugene approves: one the edit adds makes the gate answer `ask`,
which Claude Code turns into his permission prompt (in auto mode too, and a refusal under
`claude -p`), and one already in the file stays approved (question 10, his apodict ruling's shape)."""

import json
import os
import re
import sys
from collections import Counter

JS = {'.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx'}
PY = {'.py'}

RULES = [
    {
        'id': 'split-lf',
        'applies': lambda ext: ext in JS | PY,
        'pattern': re.compile(r"""\.split\(\s*(?:'\\n'|"\\n"|`\\n`|/\\n/)\s*\)"""),
        'rule': "split text into lines on /\\r?\\n/, or with a utility that reads both endings "
                "(Python's re.split(r'\\r?\\n', text) or str.splitlines(), Node's readline). "
                "str.splitlines() also splits at a lone \\r, a form feed, and U+2028 and U+2029, "
                "so it cuts a JSONL record whose string holds one",
        'why': "a file written or checked out on Windows ends its lines in CRLF, and a split on "
               "'\\n' leaves a \\r on each line, so a test such as line === '---' fails. Eugene, "
               "2026-11-06: \"Always split on /\\r?\\n/ or use system utilities that do that.\" "
               "A lone \\r was classic Mac OS's separator and is no longer written. Text that is a "
               "bash command or a bash script's output may keep '\\n', since bash runs on "
               "Unix-like systems only",
    },
    {
        'id': 'lookbehind',
        'applies': lambda ext: ext in JS | PY,
        'pattern': re.compile(r'\(\?<[=!]'),
        'rule': 'no regex lookbehind, (?<= or (?<!: state the condition another way, with the u '
                'flag (a surrogate pair is one code point there), a consuming match the '
                'replacement puts back, or a check in code',
        'why': 'Eugene, 2026-10-28: "Personally I don\'t like lookbehinds. They may make the regex '
               'slower and frequently suseptible to ReDoS attacks. Yes, users should control their '
               'data, but it can happen accidentally in a good input and I prefer not to open a '
               'door for any exploits if I can help it without major sacrifices." A lookbehind '
               'also fails older engines: Safari before 16.4 cannot parse one, so the whole module '
               'fails to load',
    },
    {
        'id': 'bare-symbol',
        'applies': lambda ext: ext in JS,
        'pattern': re.compile(r'(?:^|[^.\w$])Symbol\('),
        'rule': "every symbol is Symbol.for(), never Symbol(), internal ones included, keyed under "
                "the project's own prefix (its AGENTS.md names it)",
        'why': "a well-known name is a protocol without a dependency: another library can produce "
               "or recognize the package's markers by defining the same symbol, where a Symbol() "
               "marker can only be imported",
    },
    {
        'id': 'raw-nul',
        'applies': lambda ext: True,
        'pattern': re.compile('\x00'),
        'rule': "no raw NUL byte in a text file: write the two-character escape ('\\0' or '\\t' "
                "for a compound key's separator) in source",
        'why': 'one raw NUL makes git classify the file binary, so its diff becomes unreviewable '
               '("Binary files differ")',
    },
]


EOL = re.compile(r'\r?\n')


def tally(rule, text):
    marker = f"code-rules: allow {rule['id']}"
    plain, allowed = 0, []
    for line in EOL.split(text):
        n = len(rule['pattern'].findall(line))
        if not n:
            continue
        if marker in line:
            allowed.append(line.strip())
        else:
            plain += n
    return plain, allowed


def verdicts(path, old, new):
    ext = os.path.splitext(path)[1].lower()
    refused, asked = [], []
    for rule in (r for r in RULES if r['applies'](ext)):
        old_plain, old_allowed = tally(rule, old)
        new_plain, new_allowed = tally(rule, new)
        if new_plain > old_plain:
            refused.append(rule)
        added = list((Counter(new_allowed) - Counter(old_allowed)).elements())
        if added:
            asked.append((rule, added))
    return refused, asked


def texts(tool, ti):
    if tool == 'Edit':
        return ti.get('old_string') or '', ti.get('new_string') or ''
    if tool != 'Write':
        return None
    try:
        with open(ti.get('file_path') or '', encoding='utf-8', errors='replace') as f:
            old = f.read()
    except OSError:
        old = ''
    return old, ti.get('content') or ''


def main():
    payload = json.load(sys.stdin)
    ti = payload.get('tool_input') or {}
    pair = texts(payload.get('tool_name'), ti)
    if pair is None:
        return 0
    path = ti.get('file_path') or ''
    refused, asked = verdicts(path, *pair)
    if refused:
        lines = [f'code-rules: this edit to {path} adds what a house rule forbids:']
        lines += [f"- {r['id']}: {r['rule']}. Why: {r['why']}." for r in refused]
        lines.append('Rewrite it. A line that is a real exception takes the comment '
                     '`code-rules: allow <id>`, and the gate then asks Eugene to approve the edit.')
        print('\n'.join(lines), file=sys.stderr)
        return 2
    if asked:
        lines = [f'code-rules: this edit to {path} adds an exception to a house rule:']
        lines += [f"- {r['id']} ({r['rule']}): {line}" for r, added in asked for line in added]
        reason = '\n'.join(lines + ['Approve to keep it; deny to have it rewritten.'])
        print(json.dumps({'hookSpecificOutput': {
            'hookEventName': 'PreToolUse',
            'permissionDecision': 'ask',
            'permissionDecisionReason': reason,
        }}))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)
