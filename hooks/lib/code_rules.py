"""The code rules a program can check (claude-config 9f): `code-rules-gate.sh` refuses an Edit or a
Write that introduces one, with the rule and its reason. A new checkable rule joins RULES, never
the global CLAUDE.md, so a session pays for its wording only when it breaks it."""

import json
import os
import re
import sys

JS = {'.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx'}
PY = {'.py'}

RULES = [
    {
        'id': 'split-lf',
        'applies': lambda ext: ext in JS | PY,
        'pattern': re.compile(r"""\.split\(\s*(?:'\\n'|"\\n"|`\\n`|/\\n/)\s*\)"""),
        'rule': "split text into lines on /\\r?\\n/, or with a utility that reads both endings "
                "(Python's str.splitlines(), Node's readline)",
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


def count(rule, text):
    marker = f"code-rules: allow {rule['id']}"
    return sum(
        len(rule['pattern'].findall(line))
        for line in text.splitlines()
        if marker not in line
    )


def introduced(path, old, new):
    ext = os.path.splitext(path)[1].lower()
    rules = [r for r in RULES if r['applies'](ext)]
    return [r for r in rules if count(r, new) > count(r, old)]


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
    found = introduced(path, *pair)
    if not found:
        return 0
    lines = [f'code-rules: this edit to {path} adds what a house rule forbids:']
    lines += [f"- {r['id']}: {r['rule']}. Why: {r['why']}." for r in found]
    lines.append('Rewrite it. A line that must keep it carries the comment '
                 '`code-rules: allow <id>`, which the gate skips.')
    print('\n'.join(lines), file=sys.stderr)
    return 2


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)
