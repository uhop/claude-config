"""Shared reading of a Bash tool command for the PreToolUse gates.

One parser for two gates (vault-lease-gate.sh, git-commit-gate.sh; D14: a
shape added here is a shape both see). Heredoc bodies are data unless a shell
receives them; segments split on unquoted `;`, `|`, `||`, `&&` and newlines;
tokens come from shlex with the wrapper prefixes skipped (assignments,
`command`, `env`, `timeout`, ...); `git_verb` walks git's global options.
Anything this cannot read, a caller must treat by its own default: the lease
gate fails open, the commit gate keeps its regex verdict.
"""
import re
import shlex

HEREDOC_RE = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
ASSIGN = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*=')
PREFIX = {'command', 'nice', 'time', 'exec', 'sudo', 'doas', 'builtin', 'nohup'}
SUBST_RE = re.compile(r'\$\(([^()]*)\)|`([^`]*)`')
SHELLS = {'bash', 'sh', 'zsh', 'dash', 'ksh', 'eval'}


def strip_heredocs(cmd):
    """(text, bodies): the command without its heredoc bodies, and one
    (line_before_operator, body, quoted_terminator) per heredoc. An
    unquoted terminator means the body still expands `$(...)`."""
    lines, bodies, cur = [], [], []
    term = prefix = None
    quoted = False
    for line in cmd.split('\n'):
        if term is not None:
            if line.strip() == term:
                bodies.append((prefix, '\n'.join(cur), quoted))
                term, cur = None, []
            else:
                cur.append(line)
            continue
        m = HEREDOC_RE.search(line)
        if m:
            term, quoted, prefix = m.group(2), bool(m.group(1)), line[:m.start()]
            lines.append(line[:m.start()] + line[m.end():])
            continue
        lines.append(line)
    if term is not None:
        bodies.append((prefix, '\n'.join(cur), quoted))
    return '\n'.join(lines), bodies


def segments(text):
    """Split on unquoted ; | || && and newlines. `>&`, `&>` belong to redirects."""
    segs, cur, q, i = [], [], None, 0
    while i < len(text):
        c = text[i]
        if q:
            cur.append(c)
            if c == '\\' and q == '"' and i + 1 < len(text):
                cur.append(text[i + 1])
                i += 2
                continue
            if c == q:
                q = None
        elif c in '\'"':
            q = c
            cur.append(c)
        elif c == '\\' and i + 1 < len(text):
            cur.append(c)
            cur.append(text[i + 1])
            i += 2
            continue
        elif c in ';\n':
            segs.append(''.join(cur))
            cur = []
        elif c == '|':
            segs.append(''.join(cur))
            cur = []
            if i + 1 < len(text) and text[i + 1] == '|':
                i += 1
        elif c == '&':
            prev = text[i - 1] if i else ''
            nxt = text[i + 1] if i + 1 < len(text) else ''
            if prev == '>' or nxt == '>':
                cur.append(c)
            else:
                segs.append(''.join(cur))
                cur = []
                if nxt == '&':
                    i += 1
        else:
            cur.append(c)
        i += 1
    segs.append(''.join(cur))
    return segs


def command_tokens(seg):
    """shlex tokens of one segment with the wrapper prefixes skipped; [] when
    empty or unreadable."""
    seg = seg.strip().lstrip('({').rstrip(')}').strip()
    if not seg:
        return []
    try:
        toks = shlex.split(seg)
    except ValueError:
        return []
    while toks and (ASSIGN.match(toks[0]) or toks[0] in PREFIX):
        toks = toks[1:]
    if toks and toks[0] == 'timeout':
        toks = toks[2:]
    if toks and toks[0] == 'env':
        toks = toks[1:]
        while toks and (ASSIGN.match(toks[0]) or toks[0].startswith('-')):
            toks = toks[1:]
    return toks


def git_verb(args):
    """(subcommand, -C value or None) after git's global options."""
    cdir, k = None, 0
    while k < len(args) and args[k].startswith('-'):
        a = args[k]
        if a == '-C' and k + 1 < len(args):
            cdir = args[k + 1]
            k += 2
            continue
        if a.startswith('-C') and len(a) > 2:
            cdir = a[2:]
        elif a == '-c' and k + 1 < len(args):
            k += 2
            continue
        k += 1
    return (args[k] if k < len(args) else '', cdir)


def substitutions(text):
    """The bodies of `$(...)` and backtick substitutions: executed, not data."""
    return [m.group(1) or m.group(2) or '' for m in SUBST_RE.finditer(text)]
